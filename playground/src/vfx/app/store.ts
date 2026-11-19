/**
 * App state: which preset is open as an editable working copy, favourites and the presets you saved. Built-in presets are never
 * modified: opening one makes a copy, and saving creates YOUR preset with its own stable id and a version that grows with every save.
 */
import { stableStringify } from '../../core/util/json';
import { builtinPresets } from '../library';
import { PRESET_SCHEMA, presetRef, type CategoryId, type Preset, type PresetInput } from '../model/preset';
import { cloneScene, type Scene } from '../model/scene';

export type Section = { kind: 'category'; id: CategoryId } | { kind: 'favourites' } | { kind: 'mine' } | { kind: 'archived' };

export interface Doc {
  base: Preset;
  scene: Scene;
  name: string;
  description: string;
  category: CategoryId;
  inputs: PresetInput[];
  selected: string | null;
  history: Scene[];
  future: Scene[];
  /** Set once the working copy has been saved as one of your presets. */
  saved: { id: string; version: number } | null;
  /** Bumped on every change, so the preview knows when to reload. */
  rev: number;
  lastLabel: string;
  lastAt: number;
}

export interface UserRecord { id: string; versions: Preset[] }

interface Persisted { favourites: string[]; fontFavourites: string[]; user: UserRecord[]; section?: Section }

const KEY = 'bangers-vfx-playground-v1';
type Listener = () => void;

export interface KV { getItem(k: string): string | null; setItem(k: string, v: string): void }

const slug = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'preset';
const fp = (s: Scene): string => stableStringify(s);
const today = (): string => new Date().toISOString().slice(0, 10);

export class AppStore {
  section: Section = { kind: 'category', id: 'text-animations' };
  search = '';
  doc: Doc | null = null;
  favourites = new Set<string>();
  fontFavourites = new Set<string>();
  user: UserRecord[] = [];
  /** Last message for the status line. */
  notice: { text: string; kind: 'ok' | 'error' | 'info'; at: number } | null = null;
  private listeners = new Set<Listener>();
  private version = 0;

  constructor(private kv: KV | null = null) {
    try {
      const raw = kv?.getItem(KEY);
      if (raw) {
        const p = JSON.parse(raw) as Persisted;
        this.favourites = new Set(p.favourites ?? []); this.fontFavourites = new Set(p.fontFavourites ?? []); this.user = p.user ?? [];
        if (p.section) this.section = p.section;
      }
    } catch { /* unreadable storage: start fresh */ }
  }

  subscribe = (l: Listener): (() => void) => { this.listeners.add(l); return () => { this.listeners.delete(l); }; };
  snapshot = (): number => this.version;
  private emit(persist = true): void {
    this.version++;
    if (persist) {
      try { this.kv?.setItem(KEY, JSON.stringify({ favourites: [...this.favourites], fontFavourites: [...this.fontFavourites], user: this.user, section: this.section } satisfies Persisted)); } catch { /* storage full or blocked: this session still works */ }
    }
    for (const l of [...this.listeners]) l();
  }
  clearNotice(): void { if (this.notice) { this.notice = null; this.emit(false); } }
  say(text: string, kind: 'ok' | 'error' | 'info' = 'info'): void { this.notice = { text, kind, at: Date.now() }; this.emit(false); }

  // ---- library -------------------------------------------------------------------------------------------------------
  setSection(s: Section): void { this.section = s; this.search = ''; this.emit(); }
  setSearch(q: string): void { this.search = q; this.emit(false); }

  userPresets(): Preset[] { return this.user.map((r) => r.versions[r.versions.length - 1]!); }
  findPreset(id: string, version?: number): Preset | undefined {
    const b = builtinPresets().find((p) => p.id === id && (version === undefined || p.version === version));
    if (b) return b;
    const r = this.user.find((u) => u.id === id);
    return r ? (version === undefined ? r.versions[r.versions.length - 1] : r.versions.find((v) => v.version === version)) : undefined;
  }
  versionsOf(id: string): Preset[] { return this.user.find((u) => u.id === id)?.versions ?? []; }

  toggleFavourite(id: string): void { if (this.favourites.has(id)) this.favourites.delete(id); else this.favourites.add(id); this.emit(); }
  toggleFontFavourite(id: string): void { if (this.fontFavourites.has(id)) this.fontFavourites.delete(id); else this.fontFavourites.add(id); this.emit(); }

  // ---- the working copy --------------------------------------------------------------------------------------------------
  open(p: Preset): void {
    const saved = p.kind === 'user' ? { id: p.id, version: p.version } : null;
    this.doc = {
      base: p, scene: cloneScene(p.scene), name: p.name, description: p.description, category: p.category, inputs: p.inputs.map((i) => ({ ...i })),
      selected: p.inputs[0]?.element ?? p.scene.elements[0]?.id ?? null, history: [], future: [], saved, rev: 1, lastLabel: '', lastAt: 0,
    };
    this.emit();
  }
  close(): void { this.doc = null; this.emit(); }

  /** Change the working scene. Edits with the same label within 700 ms (a slider drag) are one undo step. */
  edit(fn: (s: Scene) => void, label = ''): void {
    const d = this.doc;
    if (!d) return;
    const next = cloneScene(d.scene);
    fn(next);
    if (fp(next) === fp(d.scene)) return;
    const now = Date.now();
    if (!(label && label === d.lastLabel && now - d.lastAt < 700)) { d.history.push(d.scene); if (d.history.length > 120) d.history.shift(); }
    d.future = []; d.scene = next; d.rev++; d.lastLabel = label; d.lastAt = now;
    this.emit(false);
  }
  select(id: string | null): void { if (this.doc) { this.doc.selected = id; this.emit(false); } }
  undo(): void { const d = this.doc; if (!d?.history.length) return; d.future.push(d.scene); d.scene = d.history.pop()!; d.rev++; d.lastLabel = ''; this.emit(false); }
  redo(): void { const d = this.doc; if (!d?.future.length) return; d.history.push(d.scene); d.scene = d.future.pop()!; d.rev++; d.lastLabel = ''; this.emit(false); }
  rename(name: string): void { if (this.doc) { this.doc.name = name; this.emit(false); } }
  setDescription(text: string): void { if (this.doc) { this.doc.description = text; this.emit(false); } }
  reset(): void { const d = this.doc; if (!d) return; d.history.push(d.scene); d.scene = cloneScene(d.base.scene); d.rev++; this.emit(false); }

  /** Has the working copy changed since it was opened or last saved? */
  isModified(): boolean {
    const d = this.doc;
    if (!d) return false;
    if (d.saved) { const cur = this.findPreset(d.saved.id, d.saved.version); return !cur || fp(cur.scene) !== fp(d.scene) || cur.name !== d.name; }
    return fp(d.base.scene) !== fp(d.scene) || d.base.name !== d.name;
  }

  /** The working copy as a preset with a stable id and version. Unsaved copies of a built-in carry the built-in's identity only while unchanged. */
  currentPreset(): Preset | null {
    const d = this.doc;
    if (!d) return null;
    const id = d.saved?.id ?? d.base.id, version = d.saved?.version ?? d.base.version;
    return {
      schema: PRESET_SCHEMA, id, version, name: d.name, category: d.category, description: d.description, tags: d.base.tags, kind: d.saved ? 'user' : d.base.kind,
      status: d.saved ? 'draft' : d.base.status, derivedFrom: d.saved ? d.base.derivedFrom : undefined, created: d.base.created, inputs: d.inputs, scene: cloneScene(d.scene),
    };
  }

  /** Can this be exported with a stable id and version right now? Modified copies must be saved first. */
  canExport(): { ok: boolean; why?: string } {
    if (!this.doc) return { ok: false, why: 'Nothing is open.' };
    if (this.isModified()) return { ok: false, why: 'You have unsaved changes. Save them as your preset first, so the export has its own stable id and version.' };
    return { ok: true };
  }

  private uniqueId(name: string): string {
    const base = `user.${slug(name)}`;
    let id = base, i = 2;
    while (this.user.some((u) => u.id === id)) id = `${base}-${i++}`;
    return id;
  }

  /** Save the working copy as a NEW preset of yours (version 1). The original is untouched. */
  saveAsNew(name?: string): Preset | null {
    const d = this.doc;
    if (!d) return null;
    const nm = (name ?? d.name).trim() || 'My preset';
    const id = this.uniqueId(nm);
    const p: Preset = {
      schema: PRESET_SCHEMA, id, version: 1, name: nm, category: d.category, description: d.description, tags: [...d.base.tags], kind: 'user', status: 'draft',
      derivedFrom: d.saved ? presetRef(d.saved) : presetRef(d.base), created: today(), inputs: d.inputs.map((i) => ({ ...i })), scene: cloneScene(d.scene),
    };
    this.user.push({ id, versions: [p] });
    d.saved = { id, version: 1 }; d.name = nm; d.base = p;
    this.emit();
    this.say(`Saved “${nm}” as ${presetRef(p)}.`, 'ok');
    return p;
  }

  /** Save the working copy as the next version of the preset it was saved as (older versions are kept). */
  saveVersion(): Preset | null {
    const d = this.doc;
    if (!d) return null;
    if (!d.saved) return this.saveAsNew();
    const rec = this.user.find((u) => u.id === d.saved!.id);
    if (!rec) return this.saveAsNew();
    const prev = rec.versions[rec.versions.length - 1]!;
    const p: Preset = { ...prev, version: prev.version + 1, name: d.name, description: d.description, scene: cloneScene(d.scene), inputs: d.inputs.map((i) => ({ ...i })), created: today(), derivedFrom: presetRef(prev) };
    rec.versions.push(p);
    d.saved = { id: p.id, version: p.version }; d.base = p;
    this.emit();
    this.say(`Saved ${presetRef(p)}.`, 'ok');
    return p;
  }

  deleteUser(id: string): void {
    this.user = this.user.filter((u) => u.id !== id); this.favourites.delete(id);
    if (this.doc?.saved?.id === id) this.doc.saved = null;
    this.emit();
  }

  /** Add an imported preset to your presets (under a fresh id if it clashes with one you already have). */
  adopt(p: Preset): Preset {
    let id = p.id;
    const clash = this.user.some((u) => u.id === id) || builtinPresets().some((b) => b.id === id);
    const existing = this.user.find((u) => u.id === id);
    if (existing && existing.versions.some((v) => v.version === p.version && fp(v.scene) === fp(p.scene))) return existing.versions.find((v) => v.version === p.version)!;
    if (clash && !existing) id = this.uniqueId(p.name);
    const np: Preset = { ...p, id, kind: 'user', status: 'draft', derivedFrom: p.derivedFrom ?? (id !== p.id ? presetRef(p) : undefined) };
    if (existing) { np.version = existing.versions[existing.versions.length - 1]!.version + 1; existing.versions.push(np); } else this.user.push({ id, versions: [np] });
    this.emit();
    return np;
  }
}
