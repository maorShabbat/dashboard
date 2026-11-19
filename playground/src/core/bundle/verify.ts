/**
 * Bundle verification. Beyond checking the archive and checksums, it *imports* the bundle into a fresh project and
 * *replays* it twice: once through the studio core on the imported data, once through the bundle's own shipped runtime.
 * Both replays must reproduce the fingerprints recorded at export time.
 */
import { EFFECT_TYPES } from '../effects/registry';
import { importBundle, readBundle, BundleError, type BundleContents, type BundleImport } from './import';
import { collectThemeRefs, collectPresetRefs, collectSequenceRefs, mergeRefs, newRefs } from '../model/refs';
import { emptyProject, contentHash } from '../model/ops';
import { sanitizePreset, sanitizeSequence, sanitizeTheme } from '../model/sanitize';
import { looksUnsafeSvg, MEDIA_LIMITS } from '../model/exchange';
import { fromUtf8, sha256Hex } from '../util/sha256';
import { stableStringify } from '../util/json';
import { BUNDLE_VERSION, RUNTIME_VERSION, SCHEMA_VERSION } from '../version';
import { compareReplay, computeReplay, type MediaIndexEntry } from './replay';
import { sniffFont } from './export';
import { RUNTIME_PATH, type BundleLibrary } from './types';

export type CheckStatus = 'pass' | 'warn' | 'fail';
export interface VerifyCheck { id: string; label: string; status: CheckStatus; detail: string; items?: string[] }
export interface VerifyReport { ok: boolean; checks: VerifyCheck[]; contents?: BundleContents; imported?: BundleImport }

/** Anything exposing the runtime's API; the exact module is whatever the bundle shipped. */
export interface RuntimeModule {
  RUNTIME_VERSION: string;
  loadBundle(read: (path: string) => Promise<Uint8Array>): Promise<unknown>;
  verifyReplay(bundle: unknown): { ok: boolean; compared: number; diffs: { scope: string; id: string; detail: string }[] };
}

export interface VerifyOptions {
  /** Turn the bundle's runtime source into a module. Default: a data:/blob: URL dynamic import. */
  runtimeLoader?: (source: string) => Promise<RuntimeModule>;
  skipRuntime?: boolean;
}

export async function defaultRuntimeLoader(source: string): Promise<RuntimeModule> {
  const g = globalThis as { window?: unknown; document?: unknown };
  if (g.window && g.document && typeof URL.createObjectURL === 'function') {
    const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
    try { return (await import(/* @vite-ignore */ url)) as RuntimeModule; } finally { URL.revokeObjectURL(url); }
  }
  const b64 = typeof Buffer !== 'undefined' ? Buffer.from(source, 'utf8').toString('base64') : btoa(unescape(encodeURIComponent(source)));
  return (await import(/* @vite-ignore */ `data:text/javascript;base64,${b64}`)) as RuntimeModule;
}

export function sniffMime(b: Uint8Array): string | null {
  const s = (n: number, len: number) => String.fromCharCode(...b.subarray(n, n + len));
  if (b[0] === 0x89 && s(1, 3) === 'PNG') return 'image/png';
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (s(0, 4) === 'GIF8') return 'image/gif';
  if (s(0, 4) === 'RIFF' && s(8, 4) === 'WEBP') return 'image/webp';
  if (s(0, 4) === 'RIFF' && s(8, 4) === 'WAVE') return 'audio/wav';
  if (s(0, 4) === 'OggS') return 'audio/ogg';
  if (s(0, 3) === 'ID3' || (b[0] === 0xff && ((b[1] ?? 0) & 0xe0) === 0xe0)) return 'audio/mpeg';
  if (s(4, 4) === 'ftyp') return 'audio/mp4';
  if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return 'audio/webm';
  const head = new TextDecoder().decode(b.subarray(0, 512)).trimStart();
  if (head.startsWith('<') && /<svg[\s>]/i.test(new TextDecoder().decode(b.subarray(0, 2048)))) return 'image/svg+xml';
  return null;
}
const MIME_OK: Record<string, string[]> = { 'audio/wav': ['audio/wav', 'audio/x-wav'], 'audio/x-wav': ['audio/wav', 'audio/x-wav'] };

export async function verifyBundle(bytes: Uint8Array, opts: VerifyOptions = {}): Promise<VerifyReport> {
  const checks: VerifyCheck[] = [];
  const add = (id: string, label: string, status: CheckStatus, detail: string, items?: string[]) => { checks.push({ id, label, status, detail, ...(items?.length ? { items: items.slice(0, 40) } : {}) }); };
  const done = (contents?: BundleContents, imported?: BundleImport): VerifyReport => ({ ok: !checks.some((c) => c.status === 'fail'), checks, ...(contents ? { contents } : {}), ...(imported ? { imported } : {}) });

  let contents: BundleContents;
  try {
    contents = await readBundle(bytes);
    add('archive', 'Archive and manifest are readable', 'pass', `${contents.order.length} files, manifest and ${'config/library.json'} parsed`);
  } catch (e) {
    add('archive', 'Archive and manifest are readable', 'fail', e instanceof BundleError ? e.message : String(e));
    return done();
  }
  const { manifest, library, entries } = contents;

  // versions ---------------------------------------------------------------------------------------------------------
  {
    const problems: string[] = [];
    if (!Number.isInteger(manifest.bundleVersion) || manifest.bundleVersion > BUNDLE_VERSION) problems.push(`bundle layout v${manifest.bundleVersion} is newer than supported v${BUNDLE_VERSION}`);
    if (!Number.isInteger(manifest.schemaVersion) || manifest.schemaVersion > SCHEMA_VERSION) problems.push(`data schema v${manifest.schemaVersion} is newer than supported v${SCHEMA_VERSION}`);
    if (typeof manifest.packageVersion !== 'string' || !manifest.packageVersion) problems.push('packageVersion missing');
    if (typeof manifest.runtimeVersion !== 'string' || !manifest.runtimeVersion) problems.push('runtimeVersion missing');
    if (problems.length) add('versions', 'Schema, bundle and package versions are compatible', 'fail', problems.join('; '));
    else if (manifest.runtimeVersion !== RUNTIME_VERSION) add('versions', 'Schema, bundle and package versions are compatible', 'warn', `bundle was recorded with runtime ${manifest.runtimeVersion}; this studio runs ${RUNTIME_VERSION}`);
    else add('versions', 'Schema, bundle and package versions are compatible', 'pass', `bundle v${manifest.bundleVersion} · schema v${manifest.schemaVersion} · package ${manifest.packageVersion} · runtime ${manifest.runtimeVersion}`);
    if (problems.some((p) => /newer/.test(p))) return done(contents);
  }

  // files & checksums ------------------------------------------------------------------------------------------------
  {
    const bad: string[] = [];
    for (const f of manifest.files) {
      const d = entries.get(f.path);
      if (!d) bad.push(`${f.path}: missing`);
      else if (d.length !== f.size) bad.push(`${f.path}: size ${d.length} ≠ ${f.size}`);
      else if (sha256Hex(d) !== f.sha256) bad.push(`${f.path}: checksum mismatch`);
    }
    const listed = new Set(manifest.files.map((f) => f.path));
    for (const p of entries.keys()) if (!listed.has(p) && p !== 'manifest.json' && p !== 'checksums.sha256') bad.push(`${p}: present but not listed in the manifest`);
    const sums = entries.get('checksums.sha256');
    if (!sums) bad.push('checksums.sha256: missing');
    else {
      const seen = new Set<string>();
      for (const line of fromUtf8(sums).split('\n').filter(Boolean)) {
        const m = /^([0-9a-f]{64}) {2}(.+)$/.exec(line);
        const d = m ? entries.get(m[2]!) : undefined;
        if (!m || !d || sha256Hex(d) !== m[1]) bad.push(`checksums.sha256: line "${line.slice(0, 80)}" does not match`);
        else seen.add(m[2]!);
      }
      for (const f of [...manifest.files.map((x) => x.path), 'manifest.json']) if (!seen.has(f)) bad.push(`checksums.sha256: does not cover ${f}`);
    }
    add('files', 'Every file matches its recorded SHA-256 and nothing is unlisted', bad.length ? 'fail' : 'pass', bad.length ? `${bad.length} problem(s)` : `${manifest.files.length} files verified`, bad);
  }

  // required structure ------------------------------------------------------------------------------------------------
  {
    const required = ['config/library.json', 'config/tokens.json', 'config/theme.css', RUNTIME_PATH, 'README.md', 'LICENSES.md'];
    const missing = required.filter((p) => !entries.has(p));
    add('structure', 'Required files are present (config, runtime, README, licences)', missing.length ? 'fail' : 'pass', missing.length ? `missing: ${missing.join(', ')}` : 'all present');
  }

  // licences ---------------------------------------------------------------------------------------------------------
  {
    const bad: string[] = [];
    const keys = new Set(manifest.licenses.map((l) => l.key));
    for (const l of manifest.licenses) {
      if (!l.redistributable) bad.push(`licence "${l.name}" is not marked redistributable but its files are bundled`);
      const t = entries.get(l.path);
      if (!t || !t.length) bad.push(`licence text missing: ${l.path}`);
    }
    for (const m of manifest.media) if (!keys.has(m.license)) bad.push(`asset ${m.name} has no licence record`);
    for (const f of manifest.fonts) if (f.bundled && (!f.license || !keys.has(f.license))) bad.push(`font ${f.family} is bundled without a licence record`);
    add('licenses', 'Every bundled asset and font has a redistributable licence on file', bad.length ? 'fail' : 'pass', bad.length ? `${bad.length} problem(s)` : `${manifest.licenses.length} licence(s) cover ${manifest.media.length} asset(s) and ${manifest.fonts.filter((f) => f.bundled).length} font(s)`, bad);
  }

  // fonts ------------------------------------------------------------------------------------------------------------
  {
    const bad: string[] = [];
    for (const f of manifest.fonts) {
      if (!f.bundled && f.files.length) bad.push(`${f.family}: marked not bundled but lists files`);
      for (const file of f.files) {
        const d = entries.get(file.path);
        const fmt = d ? sniffFont(d) : null;
        if (!d) bad.push(`${file.path}: missing`);
        else if (!fmt) bad.push(`${file.path}: not a recognised font file`);
        else if (fmt !== file.format) bad.push(`${file.path}: declared ${file.format} but content is ${fmt}`);
        else if (d.length > MEDIA_LIMITS.font.bytes) bad.push(`${file.path}: larger than the font size limit`);
      }
    }
    const omittedFonts = manifest.omitted.filter((o) => o.kind === 'font');
    add('fonts', 'Only permitted font files are included and they are real fonts', bad.length ? 'fail' : omittedFonts.length ? 'warn' : 'pass',
      bad.length ? `${bad.length} problem(s)` : `${manifest.fonts.filter((f) => f.bundled).length} font(s) bundled${omittedFonts.length ? `; ${omittedFonts.length} omitted (see manifest)` : ''}`,
      bad.length ? bad : omittedFonts.map((o) => `omitted ${o.name}: ${o.reason}`));
  }

  // assets -----------------------------------------------------------------------------------------------------------
  {
    const bad: string[] = [];
    for (const m of manifest.media) {
      const d = entries.get(m.path);
      if (!d) { bad.push(`${m.path}: missing`); continue; }
      const kind = m.kind;
      if (d.length > MEDIA_LIMITS[kind].bytes) bad.push(`${m.path}: exceeds the ${kind} size limit`);
      const sniff = sniffMime(d);
      if (!sniff) bad.push(`${m.path}: content is not a recognised ${kind} file`);
      else if (sniff !== m.mime && !(MIME_OK[m.mime] ?? []).includes(sniff)) bad.push(`${m.path}: declared ${m.mime} but content is ${sniff}`);
      if (m.mime === 'image/svg+xml' && looksUnsafeSvg(d)) bad.push(`${m.path}: SVG contains active content`);
    }
    add('assets', 'Assets are well-formed, within limits and safe', bad.length ? 'fail' : 'pass', bad.length ? `${bad.length} problem(s)` : `${manifest.media.length} asset(s) checked`, bad);
  }

  // config & references ----------------------------------------------------------------------------------------------
  {
    const problems: string[] = [];
    const notes: string[] = [];
    const lib: BundleLibrary = library;
    const th = sanitizeTheme(lib.theme?.content);
    notes.push(...th.warnings.map((w) => `theme: ${w}`));
    if (stableStringify(th.value) !== stableStringify(lib.theme.content)) notes.push('theme content was normalised on read');
    const presetIds = new Set<string>();
    for (const p of lib.presets) {
      presetIds.add(p.id);
      const s = sanitizePreset(p.content);
      if (!s) { problems.push(`preset ${p.name}: unreadable`); continue; }
      notes.push(...s.warnings.map((w) => `preset ${p.name}: ${w}`));
      if (p.content.link === 'linked' && p.content.themeId !== lib.theme.id) problems.push(`preset ${p.name}: linked to a theme that is not in the bundle`);
      if (p.content.link === 'snapshot' && !p.content.snapshot) problems.push(`preset ${p.name}: snapshot missing`);
    }
    for (const s of lib.sequences) {
      const r = sanitizeSequence(s.content);
      if (!r) { problems.push(`sequence ${s.name}: unreadable`); continue; }
      notes.push(...r.warnings.map((w) => `sequence ${s.name}: ${w}`));
      if (s.content.themeId !== lib.theme.id) problems.push(`sequence ${s.name}: belongs to a theme that is not in the bundle`);
      for (const t of s.content.tracks) for (const c of t.clips) if (c.presetId && !presetIds.has(c.presetId)) problems.push(`sequence ${s.name}: clip "${c.name || c.effectType}" uses a preset that is not in the bundle`);
    }
    const refs = mergeRefs(newRefs(), collectThemeRefs(lib.theme.content), ...lib.presets.map((p) => collectPresetRefs(p.content)), ...lib.sequences.map((s) => collectSequenceRefs(s.content)));
    const have = new Set(manifest.media.map((m) => m.id));
    const omittedAssets = new Set(manifest.omitted.filter((o) => o.kind === 'asset').map((o) => o.id));
    for (const a of refs.assets) if (!have.has(a) && !omittedAssets.has(a)) problems.push(`asset "${a}" is referenced but neither bundled nor listed as omitted`);
    const fontIds = new Set(manifest.fonts.map((f) => f.id));
    for (const f of refs.fonts) if (!fontIds.has(f)) problems.push(`font "${f}" is referenced but not described in the manifest`);
    const ids = (arr: { id: string }[]) => arr.map((x) => x.id).sort().join();
    if (ids(manifest.presets) !== ids(lib.presets)) problems.push('manifest preset list does not match config/library.json');
    if (ids(manifest.sequences) !== ids(lib.sequences)) problems.push('manifest sequence list does not match config/library.json');
    const missingEffects = EFFECT_TYPES.filter((e) => !(e in manifest.replay.effects));
    if (missingEffects.length) problems.push(`replay record is missing required effect(s): ${missingEffects.join(', ')}`);
    add('config', 'Configuration validates: bounds, references, assets, fonts and all required effects', problems.length ? 'fail' : notes.length ? 'warn' : 'pass',
      problems.length ? `${problems.length} problem(s)` : notes.length ? `${notes.length} value(s) normalised` : `theme, ${lib.presets.length} preset(s), ${lib.sequences.length} sequence(s) valid; ${EFFECT_TYPES.length} effects recorded`, [...problems, ...notes]);
  }

  // import into a fresh project --------------------------------------------------------------------------------------
  let imported: BundleImport | undefined;
  try {
    imported = await importBundle(emptyProject('verify'), bytes, { preserveIds: true });
    const p = imported.project;
    const mismatches: string[] = [];
    const theme = p.themes[manifest.theme.id];
    if (!theme) mismatches.push('theme missing after import');
    else {
      if (contentHash(theme.draft) !== manifest.theme.contentHash) mismatches.push('theme content changed during import');
      if (!!theme.approvedVersionId !== manifest.theme.approved) mismatches.push('approval state changed during import');
    }
    for (const m of manifest.presets) if (!p.presets[m.id] || contentHash(p.presets[m.id]!.draft) !== m.contentHash) mismatches.push(`preset ${m.name} changed during import`);
    for (const m of manifest.sequences) if (!p.sequences[m.id] || contentHash(p.sequences[m.id]!.draft) !== m.contentHash) mismatches.push(`sequence ${m.name} changed during import`);
    for (const m of manifest.media) if (!m.id.startsWith('builtin:') && !Object.values(p.media).some((x) => x.hash === m.sha256)) mismatches.push(`asset ${m.name} missing after import`);
    for (const f of manifest.fonts) if (f.origin === 'user' && f.bundled && !p.fonts[f.id]) mismatches.push(`font ${f.family} missing after import`);
    add('import', 'Bundle imports into a fresh project without loss', mismatches.length ? 'fail' : 'pass',
      mismatches.length ? `${mismatches.length} problem(s)` : `${Object.keys(p.presets).length} preset(s), ${Object.keys(p.sequences).length} sequence(s), ${Object.keys(p.media).length} asset(s), ${Object.keys(p.fonts).length} font(s) imported`, mismatches);
  } catch (e) {
    add('import', 'Bundle imports into a fresh project without loss', 'fail', (e as Error).message);
  }

  // replay through the studio core, on the *imported* data -----------------------------------------------------------
  if (imported) {
    try {
      const p = imported.project;
      const rebuilt: BundleLibrary = {
        schemaVersion: SCHEMA_VERSION,
        theme: { id: manifest.theme.id, name: p.themes[manifest.theme.id]!.name, description: '', content: p.themes[manifest.theme.id]!.draft },
        presets: manifest.presets.map((m) => ({ id: m.id, name: m.name, description: '', content: p.presets[m.id]!.draft })),
        sequences: manifest.sequences.map((m) => ({ id: m.id, name: m.name, description: '', content: p.sequences[m.id]!.draft })),
      };
      const media: MediaIndexEntry[] = manifest.media.map((m) => ({ id: m.id, sha256: p.media[m.id]?.hash ?? m.sha256 }));
      const cmp = compareReplay(manifest.replay, computeReplay(rebuilt, media));
      add('replay-core', 'Imported project replays identically (studio core)', cmp.ok ? 'pass' : 'fail',
        cmp.ok ? `${cmp.compared} fingerprint sets match: ${Object.keys(manifest.replay.sequences).length} sequence(s), ${Object.keys(manifest.replay.presets).length} preset(s), ${Object.keys(manifest.replay.effects).length} effect(s)` : `${cmp.diffs.length} difference(s)`,
        cmp.diffs.map((d) => `${d.scope} ${d.id}: ${d.detail}`));
    } catch (e) { add('replay-core', 'Imported project replays identically (studio core)', 'fail', (e as Error).message); }
  } else add('replay-core', 'Imported project replays identically (studio core)', 'fail', 'skipped because import failed');

  // replay through the bundle's own runtime --------------------------------------------------------------------------
  if (opts.skipRuntime) add('replay-runtime', "Bundle's own runtime replays identically", 'warn', 'skipped by request');
  else {
    try {
      const src = entries.get(RUNTIME_PATH);
      if (!src) throw new Error('runtime missing');
      const mod = await (opts.runtimeLoader ?? defaultRuntimeLoader)(fromUtf8(src));
      const loaded = await mod.loadBundle(async (path) => { const d = entries.get(path); if (!d) throw new Error(`missing ${path}`); return d; });
      const r = mod.verifyReplay(loaded);
      const versionNote = mod.RUNTIME_VERSION !== manifest.runtimeVersion ? ` (runtime reports ${mod.RUNTIME_VERSION}, manifest says ${manifest.runtimeVersion})` : '';
      add('replay-runtime', "Bundle's own runtime replays identically", r.ok && !versionNote ? 'pass' : r.ok ? 'warn' : 'fail',
        r.ok ? `${r.compared} fingerprint sets match${versionNote}` : `${r.diffs.length} difference(s)`, r.diffs.map((d) => `${d.scope} ${d.id}: ${d.detail}`));
    } catch (e) {
      const msg = (e as Error)?.message ?? String(e);
      // Some hosts (locked-down iframes) forbid loading a module from a blob:/data: URL at all. That is an environment limit, not
      // evidence of tampering, so it is reported as a visible warning; a syntax error or any other failure stays a hard fail.
      const blocked = e instanceof TypeError && /Failed to fetch dynamically imported module|Content Security Policy|violates the following/i.test(msg);
      add('replay-runtime', "Bundle's own runtime replays identically", blocked ? 'warn' : 'fail',
        blocked ? `Not run: this environment does not allow loading the bundle's runtime module (${msg}). The studio-core replay above passed; run \`bangers verify\` or examples/node/replay.mjs to check the shipped runtime too.` : msg);
    }
  }

  // examples ---------------------------------------------------------------------------------------------------------
  {
    const bad: string[] = [];
    for (const p of manifest.integration.examples) if (!entries.has(p)) bad.push(`${p}: missing`);
    const node = entries.get('examples/node/replay.mjs');
    if (manifest.integration.examples.includes('examples/node/replay.mjs') && (!node || !fromUtf8(node).includes('bangers-runtime.js'))) bad.push('node example does not load the bundled runtime');
    const main = entries.get('examples/web/main.js');
    if (manifest.integration.examples.includes('examples/web/index.html')) {
      const html = entries.get('examples/web/index.html');
      if (!html || !fromUtf8(html).includes('./main.js')) bad.push('web example page does not load main.js');
      if (!main || !fromUtf8(main).includes('../../runtime/bangers-runtime.js')) bad.push('web example does not import the bundled runtime');
    }
    add('examples', 'Integration examples are present and wired to the bundled runtime', bad.length ? 'fail' : 'pass', bad.length ? `${bad.length} problem(s)` : `${manifest.integration.examples.length} example(s)`, bad);
  }

  // approval info ----------------------------------------------------------------------------------------------------
  add('approval', 'Theme came from an approved version', manifest.theme.approved ? 'pass' : 'warn', manifest.theme.approved
    ? `approved version ${manifest.theme.version?.label ?? ''}`.trim() : 'exported from a draft or an unapproved version');

  return done(contents, imported);
}
