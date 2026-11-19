/**
 * Pure operations on a Project. Every function returns a new Project (structural sharing), which makes undo/redo a matter
 * of keeping previous states. Themes, presets and sequences are all `LibraryAsset`s with the same lifecycle:
 * create · duplicate · rename · describe · favourite · edit draft · save version · approve · restore.
 */
import { SCHEMA_VERSION } from '../version';
import type { LibraryView } from '../engine';
import { deepClone, stableStringify } from '../util/json';
import { newId, nowIso } from '../util/ids';
import { sha256Hex } from '../util/sha256';
import { emptyThemeContent } from './defaults';
import type {
  AssetKind, LibraryAsset, MediaItem, PresetAsset, PresetContent, Project, SequenceAsset, SequenceContent, ThemeAsset, ThemeContent, ThemeSnapshot, UserFont, VersionRecord,
} from './types';

export const COLLECTION = { theme: 'themes', preset: 'presets', sequence: 'sequences' } as const;
type AnyAsset = LibraryAsset<unknown>;

export function emptyProject(name = 'BANGERS Project'): Project {
  return { schema: SCHEMA_VERSION, name, themes: {}, presets: {}, sequences: {}, media: {}, fonts: {} };
}

export const contentHash = (c: unknown): string => sha256Hex(stableStringify(c));

function coll(p: Project, kind: AssetKind): Record<string, AnyAsset> { return p[COLLECTION[kind]] as unknown as Record<string, AnyAsset>; }
function withColl(p: Project, kind: AssetKind, next: Record<string, AnyAsset>): Project { return { ...p, [COLLECTION[kind]]: next } as Project; }

export function getAsset<T = unknown>(p: Project, kind: AssetKind, id: string): LibraryAsset<T> | undefined { return coll(p, kind)[id] as LibraryAsset<T> | undefined; }
export function mustAsset<T = unknown>(p: Project, kind: AssetKind, id: string): LibraryAsset<T> {
  const a = getAsset<T>(p, kind, id);
  if (!a) throw new Error(`${kind} "${id}" not found`);
  return a;
}

function mapAsset(p: Project, kind: AssetKind, id: string, fn: (a: AnyAsset) => AnyAsset): Project {
  const c = coll(p, kind);
  const a = c[id];
  if (!a) throw new Error(`${kind} "${id}" not found`);
  const n = fn(a);
  return n === a ? p : withColl(p, kind, { ...c, [id]: n });
}

export function createAsset<T>(p: Project, kind: AssetKind, name: string, content: T, extra: Partial<Pick<AnyAsset, 'description' | 'tags' | 'derivedFrom'>> & { id?: string } = {}): { project: Project; id: string } {
  const id = extra.id ?? newId(kind === 'theme' ? 'theme' : kind === 'preset' ? 'preset' : 'seq');
  const now = nowIso();
  const asset: LibraryAsset<T> = {
    id, kind, name: name.trim() || 'Untitled', description: extra.description ?? '', tags: extra.tags ?? [], favourite: false, createdAt: now, updatedAt: now,
    draft: content, versions: [], approvedVersionId: null, ...(extra.derivedFrom ? { derivedFrom: extra.derivedFrom } : {}),
  };
  return { project: withColl(p, kind, { ...coll(p, kind), [id]: asset as AnyAsset }), id };
}

export function createTheme(p: Project, name: string, content: ThemeContent = emptyThemeContent()) { return createAsset(p, 'theme', name, content); }

export function updateDraft<T>(p: Project, kind: AssetKind, id: string, fn: (d: T) => T): Project {
  return mapAsset(p, kind, id, (a) => {
    const d = fn(a.draft as T);
    return d === a.draft ? a : { ...a, draft: d, updatedAt: nowIso() };
  });
}

export const renameAsset = (p: Project, kind: AssetKind, id: string, name: string) =>
  mapAsset(p, kind, id, (a) => (name.trim() && name.trim() !== a.name ? { ...a, name: name.trim().slice(0, 120), updatedAt: nowIso() } : a));
export const describeAsset = (p: Project, kind: AssetKind, id: string, description: string) =>
  mapAsset(p, kind, id, (a) => (description === a.description ? a : { ...a, description: description.slice(0, 4000), updatedAt: nowIso() }));
export const setAssetTags = (p: Project, kind: AssetKind, id: string, tags: string[]) =>
  mapAsset(p, kind, id, (a) => ({ ...a, tags: [...new Set(tags.map((t) => t.trim()).filter(Boolean))].slice(0, 24) }));
export const toggleFavourite = (p: Project, kind: AssetKind, id: string) => mapAsset(p, kind, id, (a) => ({ ...a, favourite: !a.favourite }));

function uniqueName(existing: string[], base: string): string {
  if (!existing.includes(base)) return base;
  let i = 2;
  while (existing.includes(`${base} ${i}`)) i++;
  return `${base} ${i}`;
}

export function duplicateAsset(p: Project, kind: AssetKind, id: string): { project: Project; id: string } {
  const src = mustAsset(p, kind, id);
  const names = Object.values(coll(p, kind)).map((a) => a.name);
  const base = src.name.replace(/ \(copy( \d+)?\)$/, '');
  return createAsset(p, kind, uniqueName(names, `${base} (copy)`), deepClone(src.draft), { description: src.description, tags: [...src.tags], derivedFrom: { id: src.id, name: src.name } });
}

/** Duplicate a theme and (optionally) the presets and sequences that belong to it, re-linking them to the copy. */
export function duplicateTheme(p: Project, id: string, withDependents = true): { project: Project; id: string; copied: { presets: number; sequences: number } } {
  let { project, id: newThemeId } = duplicateAsset(p, 'theme', id);
  const presetMap = new Map<string, string>();
  let presets = 0, sequences = 0;
  if (withDependents) {
    for (const pr of Object.values(p.presets)) {
      if (pr.draft.themeId !== id) continue;
      const r = createAsset<PresetContent>(project, 'preset', pr.name, { ...deepClone(pr.draft), themeId: newThemeId }, { description: pr.description, tags: [...pr.tags], derivedFrom: { id: pr.id, name: pr.name } });
      project = r.project; presetMap.set(pr.id, r.id); presets++;
    }
    for (const sq of Object.values(p.sequences)) {
      if (sq.draft.themeId !== id) continue;
      const content = deepClone(sq.draft);
      content.themeId = newThemeId;
      for (const t of content.tracks) for (const c of t.clips) if (c.presetId && presetMap.has(c.presetId)) c.presetId = presetMap.get(c.presetId)!;
      const r = createAsset<SequenceContent>(project, 'sequence', sq.name, content, { description: sq.description, tags: [...sq.tags], derivedFrom: { id: sq.id, name: sq.name } });
      project = r.project; sequences++;
    }
  }
  return { project, id: newThemeId, copied: { presets, sequences } };
}

export function snapshotOfTheme(p: Project, themeId: string, source: 'draft' | 'approved' | { versionId: string } = 'draft'): ThemeSnapshot {
  const theme = mustAsset<ThemeContent>(p, 'theme', themeId);
  let content = theme.draft;
  let fromVersion: ThemeSnapshot['fromVersion'] = null;
  const ver = source === 'draft' ? undefined : theme.versions.find((v) => v.id === (source === 'approved' ? theme.approvedVersionId : source.versionId));
  if (ver) { content = ver.content; fromVersion = { id: ver.id, number: ver.number }; }
  return { content: deepClone(content), fromThemeId: theme.id, fromThemeName: theme.name, fromVersion, takenAt: nowIso() };
}

/** Delete an asset. Linked presets of a deleted theme are converted to independent snapshots so nothing breaks. */
export function deleteAsset(p: Project, kind: AssetKind, id: string): { project: Project; detachedPresets: string[] } {
  const detached: string[] = [];
  let project = p;
  if (kind === 'theme') {
    const snap = snapshotOfTheme(p, id, 'draft');
    for (const pr of Object.values(p.presets)) {
      if (pr.draft.themeId === id && pr.draft.link === 'linked') {
        project = updateDraft<PresetContent>(project, 'preset', pr.id, (d) => ({ ...d, link: 'snapshot', snapshot: snap }));
        detached.push(pr.id);
      }
    }
  }
  const { [id]: _removed, ...rest } = coll(project, kind);
  void _removed;
  return { project: withColl(project, kind, rest), detachedPresets: detached };
}

// ---------------------------------------------------------------------------------------------------------------------
// Versions & approvals

export function latestVersion<T>(a: LibraryAsset<T>): VersionRecord<T> | undefined { return a.versions[a.versions.length - 1]; }
export function isDirty(a: LibraryAsset<unknown>): boolean {
  const last = latestVersion(a);
  return !last || last.hash !== contentHash(a.draft);
}
export function approvedVersion<T>(a: LibraryAsset<T>): VersionRecord<T> | undefined { return a.versions.find((v) => v.id === a.approvedVersionId); }

export function saveVersion(p: Project, kind: AssetKind, id: string, o: { label?: string; note?: string } = {}): { project: Project; versionId: string | null } {
  const a = mustAsset(p, kind, id);
  const hash = contentHash(a.draft);
  if (latestVersion(a)?.hash === hash) return { project: p, versionId: null };
  const number = (latestVersion(a)?.number ?? 0) + 1;
  const rec: VersionRecord<unknown> = {
    id: newId('ver'), number, label: (o.label ?? '').trim() || `v${number}`, note: (o.note ?? '').slice(0, 1000), createdAt: nowIso(), hash,
    content: deepClone(a.draft), approval: { status: 'none' },
  };
  return { project: mapAsset(p, kind, id, (x) => ({ ...x, versions: [...x.versions, rec], updatedAt: nowIso() })), versionId: rec.id };
}

export function approveVersion(p: Project, kind: AssetKind, id: string, versionId: string, o: { by?: string; note?: string } = {}): Project {
  return mapAsset(p, kind, id, (a) => {
    if (!a.versions.some((v) => v.id === versionId)) throw new Error('Version not found');
    return {
      ...a, approvedVersionId: versionId, updatedAt: nowIso(),
      versions: a.versions.map((v) => (v.id === versionId ? { ...v, approval: { status: 'approved' as const, at: nowIso(), ...(o.by ? { by: o.by } : {}), ...(o.note ? { note: o.note } : {}) } } : v)),
    };
  });
}

export function revokeApproval(p: Project, kind: AssetKind, id: string, versionId: string, note = ''): Project {
  return mapAsset(p, kind, id, (a) => ({
    ...a, approvedVersionId: a.approvedVersionId === versionId ? null : a.approvedVersionId, updatedAt: nowIso(),
    versions: a.versions.map((v) => (v.id === versionId ? { ...v, approval: { status: 'revoked' as const, at: nowIso(), ...(note ? { note } : {}) } } : v)),
  }));
}

export function restoreVersion(p: Project, kind: AssetKind, id: string, versionId: string): Project {
  return mapAsset(p, kind, id, (a) => {
    const v = a.versions.find((x) => x.id === versionId);
    if (!v) throw new Error('Version not found');
    return { ...a, draft: deepClone(v.content), updatedAt: nowIso() };
  });
}

export function deleteVersion(p: Project, kind: AssetKind, id: string, versionId: string): Project {
  return mapAsset(p, kind, id, (a) => {
    if (a.approvedVersionId === versionId) throw new Error('The approved version cannot be deleted; revoke approval first');
    return { ...a, versions: a.versions.filter((v) => v.id !== versionId) };
  });
}

export type ContentSource = 'draft' | 'approved';

export function contentFor<T>(a: LibraryAsset<T>, source: ContentSource): { content: T; version: VersionRecord<T> | null; approved: boolean } {
  if (source === 'approved') {
    const v = approvedVersion(a);
    if (v) return { content: v.content, version: v, approved: true };
  }
  return { content: a.draft, version: null, approved: false };
}

/** Engine view of the library. "approved" falls back to the draft for assets that have no approved version. */
export function libraryView(p: Project, source: ContentSource = 'draft'): LibraryView {
  return {
    theme: (id) => { const a = p.themes[id]; return a ? contentFor(a, source).content : undefined; },
    preset: (id) => { const a = p.presets[id]; return a ? contentFor(a, source).content : undefined; },
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Presets: link / snapshot

export function createPreset(p: Project, o: { name: string; effectType: string; themeId: string | null; overrides?: PresetContent['overrides'] }): { project: Project; id: string } {
  return createAsset<PresetContent>(p, 'preset', o.name, { effectType: o.effectType, themeId: o.themeId, link: 'linked', snapshot: null, overrides: o.overrides ?? { params: {} } });
}

/** Freeze the theme's current (or approved) content into the preset: it no longer follows later theme edits. */
export function detachPresetToSnapshot(p: Project, presetId: string, source: 'draft' | 'approved' | { versionId: string } = 'draft'): Project {
  const pr = mustAsset<PresetContent>(p, 'preset', presetId);
  const themeId = pr.draft.snapshot?.fromThemeId ?? pr.draft.themeId;
  if (!themeId || !p.themes[themeId]) throw new Error('Theme not found; cannot take a snapshot');
  const snap = snapshotOfTheme(p, themeId, source);
  return updateDraft<PresetContent>(p, 'preset', presetId, (d) => ({ ...d, themeId, link: 'snapshot', snapshot: snap }));
}

export function relinkPreset(p: Project, presetId: string, themeId?: string): Project {
  const pr = mustAsset<PresetContent>(p, 'preset', presetId);
  const target = themeId ?? pr.draft.themeId ?? pr.draft.snapshot?.fromThemeId ?? null;
  if (!target || !p.themes[target]) throw new Error('Theme not found; cannot relink');
  return updateDraft<PresetContent>(p, 'preset', presetId, (d) => ({ ...d, themeId: target, link: 'linked', snapshot: null }));
}

// ---------------------------------------------------------------------------------------------------------------------
// Media & fonts

export function addMedia(p: Project, item: MediaItem): Project { return { ...p, media: { ...p.media, [item.id]: item } }; }
export function updateMedia(p: Project, id: string, patch: Partial<Pick<MediaItem, 'name' | 'license'>>): Project {
  const m = p.media[id];
  return m ? { ...p, media: { ...p.media, [id]: { ...m, ...patch } } } : p;
}
export function removeMedia(p: Project, id: string): Project {
  const { [id]: _r, ...rest } = p.media;
  void _r;
  return { ...p, media: rest };
}
export function addUserFont(p: Project, f: UserFont): Project { return { ...p, fonts: { ...p.fonts, [f.id]: f } }; }
export function removeUserFont(p: Project, id: string): Project {
  const { [id]: _r, ...rest } = p.fonts;
  void _r;
  return { ...p, fonts: rest };
}

export type { ThemeAsset, PresetAsset, SequenceAsset };
