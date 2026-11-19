/**
 * Validation of untrusted content (imports, restored backups). Everything is re-checked against the parameter
 * definitions: unknown keys are dropped, out-of-range numbers are clamped, bad references are discarded.
 * The result is always safe to feed into the engine; problems are reported as warnings.
 */
import { MAX_BOARD, clampSceneSpec, defaultSceneSpec } from '../board';
import { CUE_IDS, type CueMarker } from '../cues';
import { EFFECTS } from '../effects/registry';
import { type ParamDef, type Value, canRef, coerce, isRef } from '../params';
import { TOKEN_BY_KEY } from '../tokens';
import { isPlainObject } from '../util/json';
import { emptyArtDirection } from './defaults';
import type { ArtDirection, Clip, OverrideSet, PresetContent, SceneSpec, SeqMarker, SequenceContent, ThemeContent, ThemeSnapshot, Track } from './types';

export interface Sanitized<T> { value: T; warnings: string[] }

const LIMITS = { tracks: 24, clipsPerTrack: 200, markers: 400, cues: 64, mood: 12, text: 4000, id: 80, name: 120 };

export function str(v: unknown, max: number, fallback = ''): string {
  return typeof v === 'string' ? v.slice(0, max) : fallback;
}
export function num(v: unknown, lo: number, hi: number, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback;
}
function id(v: unknown, fallback: string): string {
  return typeof v === 'string' && /^[\w.:-]{1,80}$/.test(v) ? v : fallback;
}

function sanitizeValue(def: ParamDef, raw: unknown, where: string, warnings: string[]): Value | undefined {
  if (isRef(raw)) {
    const target = TOKEN_BY_KEY.get(raw.$ref);
    if (!target || !canRef(def, target)) { warnings.push(`${where}: invalid token reference "${String(raw.$ref)}" dropped`); return undefined; }
    return { $ref: raw.$ref };
  }
  const c = coerce(def, raw, def.default as never);
  if (c.invalid) { warnings.push(`${where}: invalid value dropped`); return undefined; }
  if (c.clamped) warnings.push(`${where}: clamped to ${String(c.value)}`);
  return c.value;
}

function sanitizeParams(raw: unknown, defs: readonly ParamDef[] | ReadonlyMap<string, ParamDef>, where: string, warnings: string[]): Record<string, Value> {
  const out: Record<string, Value> = {};
  if (!isPlainObject(raw)) return out;
  const lookup = (k: string) => (defs instanceof Map ? defs.get(k) : (defs as readonly ParamDef[]).find((d) => d.key === k));
  for (const [k, v] of Object.entries(raw)) {
    const def = lookup(k);
    if (!def) { warnings.push(`${where}.${k}: unknown parameter dropped`); continue; }
    const sv = sanitizeValue(def, v, `${where}.${k}`, warnings);
    if (sv !== undefined) out[k] = sv;
  }
  return out;
}

export function sanitizeCues(raw: unknown, where: string, warnings: string[]): CueMarker[] | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (!Array.isArray(raw)) { warnings.push(`${where}: cues must be a list`); return undefined; }
  const out: CueMarker[] = [];
  const seen = new Set<string>();
  for (const [i, c] of raw.slice(0, LIMITS.cues).entries()) {
    if (!isPlainObject(c)) continue;
    const cue = str(c.cue, 64);
    if (!cue) continue;
    if (!CUE_IDS.includes(cue)) warnings.push(`${where}[${i}]: cue "${cue}" is not in the catalogue (kept; host must supply it)`);
    let mid = id(c.id, `cue-${i}`);
    while (seen.has(mid)) mid += '_';
    seen.add(mid);
    out.push({ id: mid, at: num(c.at, 0, 60000, 0), cue, gain: num(c.gain, -40, 12, 0) });
  }
  return out;
}

export function sanitizeOverrideSet(raw: unknown, defs: readonly ParamDef[] | ReadonlyMap<string, ParamDef>, where: string, warnings: string[]): OverrideSet {
  const r = isPlainObject(raw) ? raw : {};
  const cues = sanitizeCues(r.cues, `${where}.cues`, warnings);
  return { params: sanitizeParams(r.params, defs, `${where}.params`, warnings), ...(cues ? { cues } : {}) };
}

export function sanitizeArtDirection(raw: unknown): ArtDirection {
  const r = isPlainObject(raw) ? raw : {};
  const base = emptyArtDirection();
  return {
    summary: str(r.summary, LIMITS.text, base.summary), references: str(r.references, LIMITS.text), dos: str(r.dos, LIMITS.text), donts: str(r.donts, LIMITS.text),
    mood: Array.isArray(r.mood) ? r.mood.filter((m): m is string => typeof m === 'string').map((m) => m.slice(0, 40)).slice(0, LIMITS.mood) : [],
  };
}

export function sanitizeTheme(raw: unknown): Sanitized<ThemeContent> {
  const warnings: string[] = [];
  const r = isPlainObject(raw) ? raw : {};
  const tokens = sanitizeParams(r.tokens, TOKEN_BY_KEY, 'tokens', warnings);
  const effectDefaults: Record<string, OverrideSet> = {};
  if (isPlainObject(r.effectDefaults)) {
    for (const [type, set] of Object.entries(r.effectDefaults)) {
      const def = EFFECTS[type];
      if (!def) { warnings.push(`effectDefaults.${type}: unknown effect dropped`); continue; }
      effectDefaults[type] = sanitizeOverrideSet(set, def.params, `effectDefaults.${type}`, warnings);
    }
  }
  return { value: { tokens, effectDefaults, artDirection: sanitizeArtDirection(r.artDirection), game: str(r.game, LIMITS.name) }, warnings };
}

export function sanitizeSnapshot(raw: unknown, warnings: string[]): ThemeSnapshot | null {
  if (!isPlainObject(raw)) return null;
  const t = sanitizeTheme(raw.content);
  warnings.push(...t.warnings.map((w) => `snapshot.${w}`));
  const v = isPlainObject(raw.fromVersion) && typeof raw.fromVersion.id === 'string'
    ? { id: str(raw.fromVersion.id, LIMITS.id), number: num(raw.fromVersion.number, 0, 1e6, 0) } : null;
  return { content: t.value, fromThemeId: str(raw.fromThemeId, LIMITS.id), fromThemeName: str(raw.fromThemeName, LIMITS.name), fromVersion: v, takenAt: str(raw.takenAt, 40) };
}

export function sanitizePreset(raw: unknown): Sanitized<PresetContent> | null {
  const warnings: string[] = [];
  if (!isPlainObject(raw)) return null;
  const type = str(raw.effectType, 64);
  const def = EFFECTS[type];
  if (!def) return null;
  const snapshot = raw.link === 'snapshot' ? sanitizeSnapshot(raw.snapshot, warnings) : null;
  const link: PresetContent['link'] = snapshot ? 'snapshot' : 'linked';
  if (raw.link === 'snapshot' && !snapshot) warnings.push('preset: snapshot missing, treated as linked');
  return {
    value: {
      effectType: type, themeId: typeof raw.themeId === 'string' ? str(raw.themeId, LIMITS.id) : null, link, snapshot,
      overrides: sanitizeOverrideSet(raw.overrides, def.params, 'overrides', warnings),
    },
    warnings,
  };
}

export function sanitizeScene(raw: unknown): SceneSpec {
  const d = defaultSceneSpec();
  const r = isPlainObject(raw) ? raw : {};
  return clampSceneSpec({
    cols: num(r.cols, 1, MAX_BOARD, d.cols), rows: num(r.rows, 1, MAX_BOARD, d.rows), pattern: (r.pattern as SceneSpec['pattern']) ?? d.pattern,
    seed: num(r.seed, 0, 99999, d.seed), winAmount: num(r.winAmount, 0, 1e9, d.winAmount), bet: num(r.bet, 0, 1e6, d.bet), multiplier: num(r.multiplier, 1, 1000, d.multiplier),
  });
}

function sanitizeClip(raw: unknown, where: string, warnings: string[], usedIds: Set<string>): Clip | null {
  if (!isPlainObject(raw)) return null;
  const type = str(raw.effectType, 64);
  const def = EFFECTS[type];
  if (!def) { warnings.push(`${where}: unknown effect "${type}" dropped`); return null; }
  let cid = id(raw.id, `clip_${usedIds.size}`);
  while (usedIds.has(cid)) cid += '_';
  usedIds.add(cid);
  const rep = isPlainObject(raw.repeat) ? raw.repeat : {};
  const order = ['forward', 'reverse', 'center', 'random'].includes(rep.order as string) ? (rep.order as Clip['repeat']['order']) : 'forward';
  return {
    id: cid, name: str(raw.name, LIMITS.name), presetId: typeof raw.presetId === 'string' ? str(raw.presetId, LIMITS.id) : null, effectType: type,
    start: num(raw.start, 0, 600000, 0), overrides: sanitizeOverrideSet(raw.overrides, def.params, `${where}.overrides`, warnings),
    repeat: { count: Math.round(num(rep.count, 1, 32, 1)), step: num(rep.step, 0, 5000, 80), order }, muted: raw.muted === true,
  };
}

export function sanitizeSequence(raw: unknown): Sanitized<SequenceContent> | null {
  if (!isPlainObject(raw)) return null;
  const warnings: string[] = [];
  const used = new Set<string>();
  const tracks: Track[] = [];
  const rawTracks = Array.isArray(raw.tracks) ? raw.tracks.slice(0, LIMITS.tracks) : [];
  const trackIds = new Set<string>();
  rawTracks.forEach((t, ti) => {
    if (!isPlainObject(t)) return;
    let tid = id(t.id, `trk_${ti}`);
    while (trackIds.has(tid)) tid += '_';
    trackIds.add(tid);
    const clips = (Array.isArray(t.clips) ? t.clips.slice(0, LIMITS.clipsPerTrack) : []).map((c, ci) => sanitizeClip(c, `tracks[${ti}].clips[${ci}]`, warnings, used)).filter((c): c is Clip => !!c);
    tracks.push({ id: tid, name: str(t.name, LIMITS.name, `Track ${ti + 1}`), muted: t.muted === true, solo: t.solo === true, locked: t.locked === true, clips });
  });
  if (!tracks.length) tracks.push({ id: 'trk_0', name: 'Track 1', muted: false, solo: false, locked: false, clips: [] });
  const markers: SeqMarker[] = [];
  const mIds = new Set<string>();
  (Array.isArray(raw.markers) ? raw.markers.slice(0, LIMITS.markers) : []).forEach((m, mi) => {
    if (!isPlainObject(m)) return;
    const kind = (['cue', 'event', 'label'] as const).find((k) => k === m.kind);
    if (!kind) return;
    let mid = id(m.id, `mk_${mi}`);
    while (mIds.has(mid)) mid += '_';
    mIds.add(mid);
    markers.push({ id: mid, t: num(m.t, 0, 600000, 0), kind, name: str(m.name, 80), gain: num(m.gain, -40, 12, 0) });
  });
  const fixed = typeof raw.fixedDuration === 'number' && Number.isFinite(raw.fixedDuration) ? num(raw.fixedDuration, 100, 600000, 100) : null;
  return { value: { themeId: typeof raw.themeId === 'string' ? str(raw.themeId, LIMITS.id) : null, scene: sanitizeScene(raw.scene), tracks, markers, fixedDuration: fixed }, warnings };
}
