/**
 * Bundle export. Produces a self-describing ZIP: configuration, referenced assets, *permitted* font files, licences,
 * schema/package versions, the runtime, working integration examples, checksums and recorded replay fingerprints.
 */
import { EFFECTS } from '../effects/registry';
import { builtinFont, systemFont, type LicenseInfo } from '../fonts';
import type { PresetContent, Project, SequenceContent, ThemeContent, UserFont } from '../model/types';
import { BUILTIN_LICENSE, BUILTIN_SPRITES, builtinAssetBytes, isBuiltinAsset } from '../model/builtinAssets';
import { contentFor, contentHash, snapshotOfTheme } from '../model/ops';
import { collectPresetRefs, collectSequenceRefs, collectThemeRefs, mergeRefs, newRefs } from '../model/refs';
import { resolveTokens } from '../resolve';
import { compileSequence } from '../engine';
import { slugify, nowIso } from '../util/ids';
import { deepClone } from '../util/json';
import { sha256Hex, utf8 } from '../util/sha256';
import { type ZipEntry, createZip } from '../util/zip';
import { BUNDLE_VERSION, PACKAGE_VERSION, RUNTIME_VERSION, SCHEMA_VERSION } from '../version';
import { themeCss, tokensJson } from './css';
import { computeReplay, libraryViewOf, type MediaIndexEntry } from './replay';
import { DOM_EXAMPLE_HTML, NODE_EXAMPLE, WEB_EXAMPLE_HTML, WEB_EXAMPLE_JS, readme } from './templates';
import { BUNDLE_FORMAT, LIBRARY_PATH, RUNTIME_PATH, type BundleFileEntry, type BundleFont, type BundleLibrary, type BundleLicense, type BundleManifest, type BundleMedia, type BundleOmission } from './types';

export interface ExportOptions {
  themeId: string;
  source: 'approved' | 'draft';
  /** Fail instead of warning when something would be exported unapproved. */
  requireApproved?: boolean;
  /** Defaults to every sequence belonging to the theme. */
  sequenceIds?: string[];
  name?: string;
  includeExamples?: boolean;
}

export interface ExportEnv {
  project: Project;
  /** Bytes of user media/font files by content hash. */
  blob(hash: string): Promise<Uint8Array | undefined> | Uint8Array | undefined;
  /** Files of built-in fonts, relative to assets/fonts (e.g. "bangers/OFL.txt"). */
  builtinFontFile(relPath: string): Promise<Uint8Array | undefined> | Uint8Array | undefined;
  runtimeSource: string;
  runtimeDts: string;
  now?: () => string;
}

export interface ExportResult { bytes: Uint8Array; manifest: BundleManifest; entries: ZipEntry[]; warnings: string[] }

export class ExportError extends Error {}

const MIME_EXT: Record<string, string> = {
  'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif', 'image/svg+xml': 'svg',
  'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/ogg': 'ogg', 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/webm': 'webm',
  'font/woff2': 'woff2', 'font/woff': 'woff', 'font/ttf': 'ttf', 'font/otf': 'otf',
};

export function sniffFont(b: Uint8Array): 'woff2' | 'woff' | 'ttf' | 'otf' | null {
  const s = String.fromCharCode(b[0] ?? 0, b[1] ?? 0, b[2] ?? 0, b[3] ?? 0);
  if (s === 'wOF2') return 'woff2';
  if (s === 'wOFF') return 'woff';
  if (s === 'OTTO') return 'otf';
  if (s === '\u0000\u0001\u0000\u0000' || s === 'true') return 'ttf';
  return null;
}

function licenseText(l: LicenseInfo, subject: string): string {
  if (l.text?.trim()) return `${l.text.trim()}\n`;
  return [
    `${l.name}${l.id && l.id !== 'custom' ? ` (${l.id})` : ''}`, '',
    l.holder ? `Rights holder: ${l.holder}` : '', l.attribution ? `Attribution: ${l.attribution}` : '', l.url ? `Licence text: ${l.url}` : '',
    `Applies to: ${subject}`, '', 'The full licence text was not supplied with this file; see the URL above.', '',
  ].filter((x, i, a) => x !== '' || a[i - 1] !== '').join('\n');
}

export async function exportBundle(env: ExportEnv, o: ExportOptions): Promise<ExportResult> {
  const { project } = env;
  const warnings: string[] = [];
  const omitted: BundleOmission[] = [];
  const themeAsset = project.themes[o.themeId];
  if (!themeAsset) throw new ExportError('Theme not found');
  const source = o.source;
  const unapproved: string[] = [];

  const pick = <T,>(a: import('../model/types').LibraryAsset<T>) => {
    const r = contentFor(a, source);
    if (source === 'approved' && !r.approved) unapproved.push(`${a.kind} "${a.name}"`);
    if (source === 'draft' && !r.approved) { /* drafts are never approved by definition */ }
    return r;
  };

  const themePick = pick(themeAsset);
  const themeContent: ThemeContent = deepClone(themePick.content);

  // sequences
  const seqIds = o.sequenceIds ?? Object.values(project.sequences).filter((s) => s.draft.themeId === o.themeId).map((s) => s.id);
  const sequences: BundleLibrary['sequences'] = [];
  const seqManifest: BundleManifest['sequences'] = [];
  const seqPicks = new Map<string, boolean>();
  for (const id of seqIds) {
    const a = project.sequences[id];
    if (!a) throw new ExportError(`Sequence ${id} not found`);
    const pk = pick(a);
    const content: SequenceContent = deepClone(pk.content);
    if (content.themeId !== o.themeId) { warnings.push(`Sequence "${a.name}" belonged to another theme; it was exported against "${themeAsset.name}"`); content.themeId = o.themeId; }
    sequences.push({ id: a.id, name: a.name, description: a.description, content });
    seqPicks.set(a.id, pk.approved);
  }

  // presets: those linked to the theme, plus any a chosen sequence uses
  const wanted = new Set<string>();
  for (const a of Object.values(project.presets)) if (a.draft.themeId === o.themeId) wanted.add(a.id);
  for (const s of sequences) for (const t of s.content.tracks) for (const c of t.clips) if (c.presetId) wanted.add(c.presetId);
  const presets: BundleLibrary['presets'] = [];
  const presetApproved = new Map<string, boolean>();
  for (const id of wanted) {
    const a = project.presets[id];
    if (!a) { warnings.push(`A sequence references preset ${id}, which no longer exists; its clips use theme defaults`); continue; }
    const pk = pick(a);
    const content: PresetContent = deepClone(pk.content);
    if (content.link === 'linked') {
      if (content.themeId !== o.themeId) {
        const other = content.themeId && project.themes[content.themeId] ? content.themeId : null;
        if (other) {
          content.snapshot = snapshotOfTheme(project, other, source);
          content.link = 'snapshot';
          warnings.push(`Preset "${a.name}" is linked to another theme, so it was bundled as an independent snapshot`);
        }
        content.themeId = o.themeId;
      }
    }
    presets.push({ id: a.id, name: a.name, description: a.description, content });
    presetApproved.set(a.id, pk.approved);
  }
  presets.sort((a, b) => a.id.localeCompare(b.id));

  if (unapproved.length) {
    const msg = `Not approved: ${unapproved.join(', ')}`;
    if (o.requireApproved) throw new ExportError(`${msg}. Approve these versions or export from the working draft.`);
    warnings.push(`${msg}; their working drafts were used`);
  }

  // referenced media
  const refs = mergeRefs(newRefs(), collectThemeRefs(themeContent), ...presets.map((p) => collectPresetRefs(p.content)), ...sequences.map((s) => collectSequenceRefs(s.content)));
  const files = new Map<string, { data: Uint8Array; role: string }>();
  const addFile = (path: string, data: Uint8Array, role: string) => { files.set(path, { data, role }); };

  const licenses = new Map<string, { info: LicenseInfo; text: string; appliesTo: string[] }>();
  const useLicense = (l: LicenseInfo, subject: string, textOverride?: string): string => {
    const key = slugify(`${l.id}-${l.holder ?? 'unknown'}`);
    const cur = licenses.get(key);
    if (cur) { cur.appliesTo.push(subject); return key; }
    licenses.set(key, { info: l, text: textOverride ?? licenseText(l, subject), appliesTo: [subject] });
    return key;
  };

  const media: BundleMedia[] = [];
  for (const id of [...refs.assets].sort()) {
    if (isBuiltinAsset(id)) {
      const bytes = builtinAssetBytes(id);
      if (!bytes) { omitted.push({ kind: 'asset', id, name: id, reason: 'unknown built-in asset' }); continue; }
      const path = `assets/${slugify(id)}.svg`;
      addFile(path, bytes, 'asset');
      media.push({ id, kind: 'image', name: BUILTIN_SPRITES[id]!.name, mime: 'image/svg+xml', path, size: bytes.length, sha256: sha256Hex(bytes), license: useLicense(BUILTIN_LICENSE, id) });
      continue;
    }
    const m = project.media[id];
    if (!m || m.kind === 'font') { omitted.push({ kind: 'asset', id, name: m?.name ?? id, reason: 'referenced but missing from the project' }); warnings.push(`Asset ${id} is referenced but missing; effects fall back to procedural visuals`); continue; }
    if (!m.license.redistributable) { omitted.push({ kind: 'asset', id, name: m.name, reason: `licence "${m.license.name}" does not permit redistribution (declare a redistributable licence to include it)` }); continue; }
    const bytes = await env.blob(m.hash);
    if (!bytes || sha256Hex(bytes) !== m.hash) { omitted.push({ kind: 'asset', id, name: m.name, reason: 'file data unavailable or failed its checksum' }); continue; }
    const path = `assets/${slugify(m.name.replace(/\.[^.]+$/, ''))}-${m.hash.slice(0, 8)}.${MIME_EXT[m.mime] ?? 'bin'}`;
    addFile(path, bytes, 'asset');
    media.push({ id, kind: m.kind as 'image' | 'audio', name: m.name, mime: m.mime, path, size: bytes.length, sha256: m.hash, license: useLicense(m.license, m.name) });
  }

  // fonts
  const fonts: BundleFont[] = [];
  for (const id of [...refs.fonts].sort()) {
    const b = builtinFont(id);
    const sys = systemFont(id);
    const user: UserFont | undefined = project.fonts[id];
    if (b) {
      const out: BundleFont = { id, family: b.family, fallback: b.fallback, origin: 'builtin', bundled: false, files: [], license: null };
      if (!b.license.redistributable) { omitted.push({ kind: 'font', id, name: b.label, reason: 'licence does not permit redistribution' }); fonts.push(out); continue; }
      const loaded: { f: typeof b.files[number]; bytes: Uint8Array }[] = [];
      for (const f of b.files) { const bytes = await env.builtinFontFile(f.file); if (bytes) loaded.push({ f, bytes }); }
      if (loaded.length !== b.files.length) { omitted.push({ kind: 'font', id, name: b.label, reason: 'font files are not available in this environment' }); fonts.push(out); continue; }
      const dir = b.files[0]!.file.split('/')[0]!;
      const licText = await env.builtinFontFile(`${dir}/OFL.txt`);
      out.license = useLicense(b.license, `${b.label} font files`, licText ? new TextDecoder().decode(licText) : undefined);
      for (const { f, bytes } of loaded) {
        const path = `fonts/${id}/${f.file.split('/').pop()}`;
        addFile(path, bytes, 'font');
        out.files.push({ path, weight: f.weight, style: f.style, format: f.format, sha256: sha256Hex(bytes), size: bytes.length });
      }
      out.bundled = true;
      fonts.push(out);
    } else if (sys) {
      fonts.push({ id, family: sys.label, fallback: sys.stack, origin: 'system', bundled: false, files: [], license: null });
    } else if (user) {
      const out: BundleFont = { id, family: user.family, fallback: user.fallback, origin: 'user', bundled: false, files: [], license: null };
      if (!user.license.redistributable) {
        omitted.push({ kind: 'font', id, name: user.label, reason: `licence "${user.license.name}" does not permit embedding or redistribution; the host must supply "${user.family}" (fallback: ${user.fallback})` });
        fonts.push(out); continue;
      }
      const loaded: { f: UserFont['files'][number]; bytes: Uint8Array; fmt: string }[] = [];
      let ok = true;
      for (const f of user.files) {
        const m = project.media[f.mediaId];
        const bytes = m ? await env.blob(m.hash) : undefined;
        const fmt = bytes ? sniffFont(bytes) : null;
        if (!m || !bytes || !fmt || sha256Hex(bytes) !== m.hash) { ok = false; break; }
        loaded.push({ f, bytes, fmt });
      }
      if (!ok) { omitted.push({ kind: 'font', id, name: user.label, reason: 'a font file is missing, corrupt, or not a recognised font format' }); fonts.push(out); continue; }
      out.license = useLicense(user.license, `${user.label} font files`);
      for (const { f, bytes, fmt } of loaded) {
        const path = `fonts/${slugify(id)}/${slugify(user.family)}-${f.weight}${f.style === 'italic' ? 'i' : ''}.${fmt}`;
        addFile(path, bytes, 'font');
        out.files.push({ path, weight: f.weight, style: f.style, format: fmt, sha256: sha256Hex(bytes), size: bytes.length });
      }
      out.bundled = true;
      fonts.push(out);
    } else {
      omitted.push({ kind: 'font', id, name: id, reason: 'font id is not known to the project; the fallback stack is used' });
      fonts.push({ id, family: id, fallback: 'system-ui, sans-serif', origin: 'system', bundled: false, files: [], license: null });
    }
  }

  // library (normalised through JSON so replay is computed from exactly what is shipped)
  const library: BundleLibrary = JSON.parse(JSON.stringify({
    schemaVersion: SCHEMA_VERSION,
    theme: { id: themeAsset.id, name: themeAsset.name, description: themeAsset.description, content: themeContent },
    presets, sequences,
  }));
  const mediaIndex: MediaIndexEntry[] = media.map((m) => ({ id: m.id, sha256: m.sha256 }));

  // compile once to catch dangling references and to record durations
  const view = libraryViewOf(library);
  for (const s of library.sequences) {
    const c = compileSequence(s.content, view);
    for (const w of c.warnings) warnings.push(`Sequence "${s.name}": ${w}`);
    for (const clip of c.clips) for (const w of clip.warnings) warnings.push(`Sequence "${s.name}" / ${clip.name || clip.effectType}: ${w}`);
    seqManifest.push({ id: s.id, name: s.name, approved: seqPicks.get(s.id) ?? false, contentHash: contentHash(s.content), duration: Math.round(c.duration) });
  }
  const replay = computeReplay(library, mediaIndex);

  const resolved = resolveTokens(library.theme.content.tokens);
  addFile(LIBRARY_PATH, utf8(JSON.stringify(library, null, 2) + '\n'), 'config');
  addFile('config/tokens.json', utf8(JSON.stringify(tokensJson(resolved), null, 2) + '\n'), 'config');
  addFile('config/theme.css', utf8(themeCss(resolved, fonts)), 'config');
  addFile(RUNTIME_PATH, utf8(env.runtimeSource), 'runtime');
  addFile('runtime/bangers-runtime.d.ts', utf8(env.runtimeDts), 'runtime');

  const bundleName = (o.name ?? `${themeAsset.name} bundle`).slice(0, 120);
  const examples: string[] = [];
  if (o.includeExamples !== false) {
    addFile('examples/web/index.html', utf8(WEB_EXAMPLE_HTML(bundleName)), 'example');
    addFile('examples/web/main.js', utf8(WEB_EXAMPLE_JS), 'example');
    addFile('examples/node/replay.mjs', utf8(NODE_EXAMPLE), 'example');
    addFile('examples/dom-css/index.html', utf8(DOM_EXAMPLE_HTML(bundleName)), 'example');
    examples.push('examples/web/index.html', 'examples/node/replay.mjs', 'examples/dom-css/index.html');
  }

  const licenseList: BundleLicense[] = [];
  for (const [key, l] of [...licenses.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const path = `licenses/${key}.txt`;
    addFile(path, utf8(l.text), 'license');
    licenseList.push({ key, id: l.info.id, name: l.info.name, ...(l.info.holder ? { holder: l.info.holder } : {}), ...(l.info.url ? { url: l.info.url } : {}), ...(l.info.attribution ? { attribution: l.info.attribution } : {}), path, appliesTo: [...new Set(l.appliesTo)], redistributable: l.info.redistributable });
  }
  addFile('LICENSES.md', utf8(licensesMd(licenseList, omitted)), 'license');

  const art = themeContent.artDirection;
  const artText = [art.summary, art.mood.length ? `Mood: ${art.mood.join(', ')}` : '', art.references ? `References: ${art.references}` : '', art.dos ? `Do: ${art.dos}` : '', art.donts ? `Don't: ${art.donts}` : ''].filter(Boolean).join('\n\n');

  const manifest: BundleManifest = {
    format: BUNDLE_FORMAT, bundleVersion: BUNDLE_VERSION, schemaVersion: SCHEMA_VERSION, packageVersion: PACKAGE_VERSION, runtimeVersion: RUNTIME_VERSION,
    createdAt: (env.now ?? nowIso)(), generator: `BANGERS Theme Studio ${PACKAGE_VERSION}`, name: bundleName,
    theme: {
      id: themeAsset.id, name: themeAsset.name, description: themeAsset.description, source, approved: themePick.approved,
      version: themePick.version ? { id: themePick.version.id, number: themePick.version.number, label: themePick.version.label } : null, contentHash: contentHash(themeContent),
    },
    presets: presets.map((p) => ({ id: p.id, name: p.name, effectType: p.content.effectType, link: p.content.link, approved: presetApproved.get(p.id) ?? false, contentHash: contentHash(p.content) })),
    sequences: seqManifest, media, fonts, licenses: licenseList, omitted, warnings, files: [], replay,
    integration: { runtime: RUNTIME_PATH, examples, docs: 'README.md' },
  };
  addFile('README.md', utf8(readme(manifest, artText)), 'docs');

  manifest.files = [...files.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([path, f]): BundleFileEntry => ({ path, size: f.data.length, sha256: sha256Hex(f.data), role: f.role }));
  const manifestBytes = utf8(JSON.stringify(manifest, null, 2) + '\n');
  const checks = [{ path: 'manifest.json', sha: sha256Hex(manifestBytes) }, ...manifest.files.map((f) => ({ path: f.path, sha: f.sha256 }))];
  const checksums = utf8(checks.map((c) => `${c.sha}  ${c.path}`).join('\n') + '\n');

  const entries: ZipEntry[] = [
    { path: 'manifest.json', data: manifestBytes },
    ...manifest.files.map((f) => ({ path: f.path, data: files.get(f.path)!.data })),
    { path: 'checksums.sha256', data: checksums },
  ];
  // sanity: every effect the bundle promises must exist
  for (const e of Object.keys(manifest.replay.effects)) if (!EFFECTS[e]) throw new ExportError(`Unknown effect ${e} in replay record`);
  return { bytes: createZip(entries), manifest, entries, warnings: manifest.warnings };
}

function licensesMd(list: BundleLicense[], omitted: BundleOmission[]): string {
  const lines = ['# Licences', '', 'Everything in `assets/` and `fonts/` is included because its declared licence permits redistribution.', ''];
  if (!list.length) lines.push('_No third-party assets or fonts are included._', '');
  for (const l of list) {
    lines.push(`## ${l.name}${l.id !== 'custom' ? ` (${l.id})` : ''}`, '');
    if (l.holder) lines.push(`- Rights holder: ${l.holder}`);
    if (l.attribution) lines.push(`- Attribution: ${l.attribution}`);
    if (l.url) lines.push(`- URL: ${l.url}`);
    lines.push(`- Text: \`${l.path}\``, `- Applies to: ${l.appliesTo.join(', ')}`, '');
  }
  if (omitted.length) {
    lines.push('## Not included', '', 'These files were **not** bundled; you must supply them yourself or accept the fallback.', '');
    for (const o of omitted) lines.push(`- ${o.kind} **${o.name}** (\`${o.id}\`): ${o.reason}`);
    lines.push('');
  }
  return lines.join('\n');
}
