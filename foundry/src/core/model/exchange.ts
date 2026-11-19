/**
 * Exchange formats. A *theme package* (`.bangers-theme.json`) carries one theme with its version history, its presets and
 * sequences, and the media/fonts they reference (base64) so it can move between projects. Imports never trust the file:
 * everything is re-sanitised against the parameter definitions and ids are remapped so nothing can overwrite by accident.
 */
import type { LicenseInfo } from '../fonts';
import { deepClone, isPlainObject } from '../util/json';
import { newId, nowIso } from '../util/ids';
import { PACKAGE_VERSION, SCHEMA_VERSION } from '../version';
import { sha256Hex } from '../util/sha256';
import { collectPresetRefs, collectSequenceRefs, collectThemeRefs, mergeRefs, newRefs } from './refs';
import { contentHash, emptyProject } from './ops';
import { num, sanitizePreset, sanitizeSequence, sanitizeTheme, str } from './sanitize';

const id = (v: unknown, fallback: string): string => (typeof v === 'string' && /^[\w.:-]{1,80}$/.test(v) ? v : fallback);
import type { AssetKind, LibraryAsset, MediaItem, MediaKind, PresetContent, Project, SequenceContent, ThemeContent, UserFont, VersionRecord } from './types';
import { isBuiltinAsset } from './builtinAssets';

export const MEDIA_LIMITS: Record<MediaKind, { bytes: number; mimes: string[] }> = {
  image: { bytes: 4 * 1024 * 1024, mimes: ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml'] },
  audio: { bytes: 8 * 1024 * 1024, mimes: ['audio/wav', 'audio/x-wav', 'audio/ogg', 'audio/mpeg', 'audio/mp4', 'audio/webm'] },
  font: { bytes: 2 * 1024 * 1024, mimes: ['font/woff2', 'font/woff', 'font/ttf', 'font/otf', 'application/font-woff', 'application/x-font-ttf'] },
};

export function bytesToBase64(b: Uint8Array): string {
  let s = '';
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
}
export function base64ToBytes(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function sanitizeLicense(raw: unknown): LicenseInfo {
  const r = isPlainObject(raw) ? raw : {};
  return {
    id: str(r.id, 40, 'custom') || 'custom', name: str(r.name, 120, 'Unspecified licence') || 'Unspecified licence',
    ...(typeof r.holder === 'string' ? { holder: r.holder.slice(0, 160) } : {}), ...(typeof r.url === 'string' ? { url: r.url.slice(0, 300) } : {}),
    ...(typeof r.text === 'string' ? { text: r.text.slice(0, 40000) } : {}), ...(typeof r.attribution === 'string' ? { attribution: r.attribution.slice(0, 400) } : {}),
    // Unknown licence ⇒ not redistributable. Only an explicit `true` allows a file into a bundle.
    redistributable: r.redistributable === true,
  };
}

export function looksUnsafeSvg(bytes: Uint8Array): boolean {
  const t = new TextDecoder().decode(bytes.subarray(0, Math.min(bytes.length, 400000))).toLowerCase();
  return /<script|javascript:|\son\w+\s*=|<foreignobject|<iframe|<!entity/.test(t);
}

export function sanitizeMediaItem(raw: unknown): MediaItem | null {
  if (!isPlainObject(raw)) return null;
  const kind = (['image', 'audio', 'font'] as const).find((k) => k === raw.kind);
  if (!kind || typeof raw.id !== 'string' || !/^[\w.:-]{1,80}$/.test(raw.id)) return null;
  const mime = str(raw.mime, 80);
  if (!MEDIA_LIMITS[kind].mimes.includes(mime)) return null;
  const hash = str(raw.hash, 64);
  if (!/^[0-9a-f]{64}$/.test(hash)) return null;
  return { id: raw.id, kind, name: str(raw.name, 160, raw.id), mime, size: num(raw.size, 0, MEDIA_LIMITS[kind].bytes, 0), hash, license: sanitizeLicense(raw.license) };
}

function sanitizeUserFont(raw: unknown): UserFont | null {
  if (!isPlainObject(raw) || typeof raw.id !== 'string' || !/^[\w.:-]{1,64}$/.test(raw.id)) return null;
  const files = (Array.isArray(raw.files) ? raw.files : []).slice(0, 12).flatMap((f) =>
    isPlainObject(f) && typeof f.mediaId === 'string' ? [{ weight: Math.round(num(f.weight, 100, 900, 400)), style: (f.style === 'italic' ? 'italic' : 'normal') as 'normal' | 'italic', mediaId: f.mediaId }] : []);
  if (!files.length) return null;
  return { id: raw.id, label: str(raw.label, 80, raw.id), family: str(raw.family, 80, raw.id).replace(/[^\w .+&-]/g, '') || raw.id, fallback: str(raw.fallback, 160, 'system-ui, sans-serif').replace(/[^\w ,"'-]/g, '') || 'sans-serif', files, license: sanitizeLicense(raw.license) };
}

// ---------------------------------------------------------------------------------------------------------------------
// Whole-project validation (storage + backups)

function sanitizeVersion<T>(raw: unknown, clean: (c: unknown) => T | null): VersionRecord<T> | null {
  if (!isPlainObject(raw)) return null;
  const content = clean(raw.content);
  if (content === null) return null;
  const ap = isPlainObject(raw.approval) ? raw.approval : {};
  const status = (['none', 'approved', 'revoked'] as const).find((s) => s === ap.status) ?? 'none';
  return {
    id: typeof raw.id === 'string' && /^[\w.:-]{1,80}$/.test(raw.id) ? raw.id : newId('ver'), number: Math.round(num(raw.number, 1, 1e6, 1)), label: str(raw.label, 80, 'v1'), note: str(raw.note, 1000),
    createdAt: str(raw.createdAt, 40, nowIso()), hash: contentHash(content), content,
    approval: { status, ...(typeof ap.at === 'string' ? { at: ap.at.slice(0, 40) } : {}), ...(typeof ap.by === 'string' ? { by: ap.by.slice(0, 80) } : {}), ...(typeof ap.note === 'string' ? { note: ap.note.slice(0, 500) } : {}) },
  };
}

function sanitizeAsset<T>(raw: unknown, kind: AssetKind, clean: (c: unknown) => T | null, warnings: string[]): LibraryAsset<T> | null {
  if (!isPlainObject(raw) || typeof raw.id !== 'string' || !/^[\w.:-]{1,80}$/.test(raw.id)) return null;
  const draft = clean(raw.draft);
  if (draft === null) { warnings.push(`${kind} ${raw.id}: unreadable, dropped`); return null; }
  const versions = (Array.isArray(raw.versions) ? raw.versions : []).map((v) => sanitizeVersion(v, clean)).filter((v): v is VersionRecord<T> => !!v);
  const approved = typeof raw.approvedVersionId === 'string' && versions.some((v) => v.id === raw.approvedVersionId) ? raw.approvedVersionId : null;
  const now = nowIso();
  return {
    id: raw.id, kind, name: str(raw.name, 120, 'Untitled') || 'Untitled', description: str(raw.description, 4000), tags: (Array.isArray(raw.tags) ? raw.tags : []).filter((t): t is string => typeof t === 'string').slice(0, 24).map((t) => t.slice(0, 40)),
    favourite: raw.favourite === true, createdAt: str(raw.createdAt, 40, now), updatedAt: str(raw.updatedAt, 40, now), draft, versions, approvedVersionId: approved,
    ...(isPlainObject(raw.derivedFrom) && typeof raw.derivedFrom.id === 'string' ? { derivedFrom: { id: str(raw.derivedFrom.id, 80), name: str(raw.derivedFrom.name, 120) } } : {}),
  };
}

const cleanTheme = (warnings: string[]) => (c: unknown): ThemeContent | null => { const r = sanitizeTheme(c); warnings.push(...r.warnings); return r.value; };
const cleanPreset = (warnings: string[]) => (c: unknown): PresetContent | null => { const r = sanitizePreset(c); if (r) warnings.push(...r.warnings); return r?.value ?? null; };
const cleanSeq = (warnings: string[]) => (c: unknown): SequenceContent | null => { const r = sanitizeSequence(c); if (r) warnings.push(...r.warnings); return r?.value ?? null; };

export function sanitizeProject(raw: unknown): { project: Project; warnings: string[] } {
  if (!isPlainObject(raw)) throw new Error('Project file is not an object');
  const schema = typeof raw.schema === 'number' ? raw.schema : 1;
  if (schema > SCHEMA_VERSION) throw new Error(`Project was saved with a newer schema (${schema}); this build understands up to ${SCHEMA_VERSION}`);
  const warnings: string[] = [];
  const p = emptyProject(str(raw.name, 120, 'BANGERS Project'));
  const each = <T>(src: unknown, kind: AssetKind, clean: (c: unknown) => T | null, into: Record<string, LibraryAsset<T>>) => {
    if (!isPlainObject(src)) return;
    for (const v of Object.values(src)) { const a = sanitizeAsset(v, kind, clean, warnings); if (a) into[a.id] = a; }
  };
  each(raw.themes, 'theme', cleanTheme(warnings), p.themes);
  each(raw.presets, 'preset', cleanPreset(warnings), p.presets);
  each(raw.sequences, 'sequence', cleanSeq(warnings), p.sequences);
  if (isPlainObject(raw.media)) for (const v of Object.values(raw.media)) { const m = sanitizeMediaItem(v); if (m) p.media[m.id] = m; }
  if (isPlainObject(raw.fonts)) for (const v of Object.values(raw.fonts)) { const f = sanitizeUserFont(v); if (f) p.fonts[f.id] = f; }
  return { project: p, warnings };
}

// ---------------------------------------------------------------------------------------------------------------------
// Theme packages

export interface ThemePackage {
  format: 'bangers.theme';
  schemaVersion: number;
  packageVersion: string;
  exportedAt: string;
  theme: { id: string; name: string; description: string; tags: string[]; draft: ThemeContent; versions: VersionRecord<ThemeContent>[]; approvedVersionId: string | null };
  presets: { id: string; name: string; description: string; tags: string[]; draft: PresetContent }[];
  sequences: { id: string; name: string; description: string; tags: string[]; draft: SequenceContent }[];
  media: (MediaItem & { data?: string })[];
  fonts: UserFont[];
}

/** Export a theme with its dependents. `getBlob` supplies file bytes for user media (builtin sprites need none). */
export function exportThemePackage(p: Project, themeId: string, getBlob: (hash: string) => Uint8Array | undefined, o: { includeMedia?: boolean } = {}): ThemePackage {
  const theme = p.themes[themeId];
  if (!theme) throw new Error('Theme not found');
  const presets = Object.values(p.presets).filter((x) => x.draft.themeId === themeId);
  const sequences = Object.values(p.sequences).filter((x) => x.draft.themeId === themeId);
  const refs = newRefs();
  const all = [
    collectThemeRefs(theme.draft), ...theme.versions.map((v) => collectThemeRefs(v.content)),
    ...presets.flatMap((x) => [collectPresetRefs(x.draft), ...x.versions.map((v) => collectPresetRefs(v.content))]), ...sequences.map((s) => collectSequenceRefs(s.draft)),
  ];
  const merged = mergeRefs(refs, ...all);
  const mediaIds = new Set<string>();
  for (const id of merged.assets) if (!isBuiltinAsset(id) && p.media[id]) mediaIds.add(id);
  const fonts: UserFont[] = [];
  for (const fid of merged.fonts) {
    const f = p.fonts[fid];
    if (f) { fonts.push(deepClone(f)); f.files.forEach((x) => mediaIds.add(x.mediaId)); }
  }
  const media = [...mediaIds].flatMap((id) => {
    const m = p.media[id];
    if (!m) return [];
    const bytes = o.includeMedia === false ? undefined : getBlob(m.hash);
    return [{ ...deepClone(m), ...(bytes ? { data: bytesToBase64(bytes) } : {}) }];
  });
  const slim = <T,>(a: LibraryAsset<T>) => ({ id: a.id, name: a.name, description: a.description, tags: a.tags, draft: a.draft });
  return {
    format: 'bangers.theme', schemaVersion: SCHEMA_VERSION, packageVersion: PACKAGE_VERSION, exportedAt: nowIso(),
    theme: { ...slim(theme), versions: deepClone(theme.versions), approvedVersionId: theme.approvedVersionId },
    presets: presets.map(slim), sequences: sequences.map(slim), media, fonts,
  };
}

export interface ImportResult { project: Project; themeId: string; warnings: string[]; blobs: Map<string, Uint8Array>; idMap: Map<string, string> }

/** Import a theme package as a *new* theme (fresh ids, "(imported)" suffix on name clashes). */
export function importThemePackage(p: Project, raw: unknown, opts: { preserveIds?: boolean } = {}): ImportResult {
  const keep = opts.preserveIds === true;
  if (!isPlainObject(raw) || raw.format !== 'bangers.theme') throw new Error('Not a BANGERS theme file');
  if (typeof raw.schemaVersion === 'number' && raw.schemaVersion > SCHEMA_VERSION) throw new Error(`Theme file uses a newer schema (${raw.schemaVersion}); this build understands up to ${SCHEMA_VERSION}`);
  const warnings: string[] = [];
  const blobs = new Map<string, Uint8Array>();
  const idMap = new Map<string, string>();
  let project = p;

  // media first
  const mediaIdMap = new Map<string, string>();
  for (const m of Array.isArray(raw.media) ? raw.media : []) {
    const item = sanitizeMediaItem(m);
    if (!item) { warnings.push('A media entry was invalid and skipped'); continue; }
    const data = isPlainObject(m) && typeof m.data === 'string' ? m.data : undefined;
    let bytes: Uint8Array | undefined;
    if (data) {
      try { bytes = base64ToBytes(data); } catch { warnings.push(`Media "${item.name}" has corrupt data`); continue; }
      if (bytes.length > MEDIA_LIMITS[item.kind].bytes) { warnings.push(`Media "${item.name}" is too large, skipped`); continue; }
      if (sha256Hex(bytes) !== item.hash) { warnings.push(`Media "${item.name}" failed its checksum, skipped`); continue; }
      if (item.mime === 'image/svg+xml' && looksUnsafeSvg(bytes)) { warnings.push(`SVG "${item.name}" contains active content, skipped`); continue; }
      blobs.set(item.hash, bytes);
    } else warnings.push(`Media "${item.name}" came without file data`);
    const existing = Object.values(project.media).find((x) => x.hash === item.hash);
    const nid = existing?.id ?? (project.media[item.id] ? newId('m') : item.id);
    mediaIdMap.set(item.id, nid);
    if (!existing) project = { ...project, media: { ...project.media, [nid]: { ...item, id: nid } } };
  }
  const fontIdMap = new Map<string, string>();
  for (const f of Array.isArray(raw.fonts) ? raw.fonts : []) {
    const uf = sanitizeUserFont(f);
    if (!uf) continue;
    const files = uf.files.flatMap((x) => (mediaIdMap.has(x.mediaId) ? [{ ...x, mediaId: mediaIdMap.get(x.mediaId)! }] : []));
    if (!files.length) { warnings.push(`Font "${uf.label}" lost its files and was skipped`); continue; }
    const nid = project.fonts[uf.id] ? newId('font') : uf.id;
    fontIdMap.set(uf.id, nid);
    project = { ...project, fonts: { ...project.fonts, [nid]: { ...uf, id: nid, files } } };
  }
  const remapContent = <T,>(content: T): T => {
    // asset ids inside content (token values) and font ids follow the remapped ids
    const s = JSON.stringify(content);
    let out = s;
    for (const [a, b] of mediaIdMap) if (a !== b) out = out.split(`"${a}"`).join(`"${b}"`);
    for (const [a, b] of fontIdMap) if (a !== b) out = out.split(`"${a}"`).join(`"${b}"`);
    return JSON.parse(out) as T;
  };

  const t = raw.theme;
  if (!isPlainObject(t)) throw new Error('Theme file has no theme');
  const themeName = keep ? str(t.name, 120, 'Imported theme') : uniqueImportName(Object.values(project.themes).map((x) => x.name), str(t.name, 120, 'Imported theme'));
  const newThemeId = keep ? id(t.id, 'theme_imported') : newId('theme');
  idMap.set(str(t.id, 80, 'theme'), newThemeId);
  const now = nowIso();
  const versions = (Array.isArray(t.versions) ? t.versions : []).map((v) => sanitizeVersion(v, cleanTheme(warnings))).filter((v): v is VersionRecord<ThemeContent> => !!v);
  const verIdMap = new Map<string, string>();
  const themeVersions = versions.map((v) => { const nid = keep ? v.id : newId('ver'); verIdMap.set(v.id, nid); return { ...v, id: nid, content: remapContent(v.content) }; });
  const draftT = cleanTheme(warnings)(t.draft);
  if (!draftT) throw new Error('Theme file draft is unreadable');
  const themeAsset: LibraryAsset<ThemeContent> = {
    id: newThemeId, kind: 'theme', name: themeName, description: str(t.description, 4000), tags: [], favourite: false, createdAt: now, updatedAt: now, draft: remapContent(draftT),
    versions: themeVersions, approvedVersionId: typeof t.approvedVersionId === 'string' ? (verIdMap.get(t.approvedVersionId) ?? null) : null,
  };
  project = { ...project, themes: { ...project.themes, [newThemeId]: themeAsset } };

  const presetIds = new Map<string, string>();
  for (const r of Array.isArray(raw.presets) ? raw.presets : []) {
    if (!isPlainObject(r)) continue;
    const c = cleanPreset(warnings)(r.draft);
    if (!c) { warnings.push('A preset was invalid and skipped'); continue; }
    const nid = keep ? id(r.id, newId('preset')) : newId('preset');
    presetIds.set(str(r.id, 80), nid);
    idMap.set(str(r.id, 80), nid);
    const draft: PresetContent = remapContent({ ...c, themeId: newThemeId });
    if (draft.snapshot) draft.snapshot = { ...draft.snapshot, fromThemeId: draft.snapshot.fromThemeId === str(t.id, 80) ? newThemeId : draft.snapshot.fromThemeId };
    project = { ...project, presets: { ...project.presets, [nid]: { id: nid, kind: 'preset', name: str(r.name, 120, 'Preset'), description: str(r.description, 4000), tags: [], favourite: false, createdAt: now, updatedAt: now, draft, versions: [], approvedVersionId: null } } };
  }
  for (const r of Array.isArray(raw.sequences) ? raw.sequences : []) {
    if (!isPlainObject(r)) continue;
    const c = cleanSeq(warnings)(r.draft);
    if (!c) { warnings.push('A sequence was invalid and skipped'); continue; }
    const content: SequenceContent = remapContent({ ...c, themeId: newThemeId });
    for (const tr of content.tracks) for (const cl of tr.clips) if (cl.presetId) cl.presetId = presetIds.get(cl.presetId) ?? null;
    const nid = keep ? id(r.id, newId('seq')) : newId('seq');
    idMap.set(str(r.id, 80), nid);
    project = { ...project, sequences: { ...project.sequences, [nid]: { id: nid, kind: 'sequence', name: str(r.name, 120, 'Sequence'), description: str(r.description, 4000), tags: [], favourite: false, createdAt: now, updatedAt: now, draft: content, versions: [], approvedVersionId: null } } };
  }
  return { project, themeId: newThemeId, warnings, blobs, idMap };
}

function uniqueImportName(existing: string[], base: string): string {
  if (!existing.includes(base)) return base;
  const b = `${base} (imported)`;
  if (!existing.includes(b)) return b;
  let i = 2;
  while (existing.includes(`${b} ${i}`)) i++;
  return `${b} ${i}`;
}
