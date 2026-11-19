/** Pure sequence edit operations. The timeline UI calls these; tests exercise the arithmetic directly. */
import { newId } from '../util/ids';
import { newClip, newMarker, newTrack } from './defaults';
import type { Clip, SeqMarker, SequenceContent, Track } from './types';

const MAX_T = 600000;
const clampT = (t: number) => Math.min(MAX_T, Math.max(0, Math.round(t)));

export function mapClips(s: SequenceContent, fn: (c: Clip, t: Track) => Clip): SequenceContent {
  let changed = false;
  const tracks = s.tracks.map((t) => {
    const clips = t.clips.map((c) => { const n = fn(c, t); if (n !== c) changed = true; return n; });
    return clips.some((c, i) => c !== t.clips[i]) ? { ...t, clips } : t;
  });
  return changed ? { ...s, tracks } : s;
}

export function findClip(s: SequenceContent, id: string): { clip: Clip; track: Track; index: number } | undefined {
  for (const [index, track] of s.tracks.entries()) { const clip = track.clips.find((c) => c.id === id); if (clip) return { clip, track, index }; }
  return undefined;
}

export function addClip(s: SequenceContent, o: { effectType: string; presetId?: string | null; start: number; trackId?: string; name?: string }): { content: SequenceContent; clipId: string } {
  const clip = newClip(o.effectType, clampT(o.start), o.presetId ?? null, o.name ?? '');
  const target = s.tracks.find((t) => t.id === o.trackId && !t.locked) ?? s.tracks.find((t) => !t.locked) ?? s.tracks[0];
  if (!target) { const t = newTrack('Track 1'); t.clips.push(clip); return { content: { ...s, tracks: [t] }, clipId: clip.id }; }
  return { content: { ...s, tracks: s.tracks.map((t) => (t === target ? { ...t, clips: [...t.clips, clip] } : t)) }, clipId: clip.id };
}

export function updateClip(s: SequenceContent, id: string, fn: (c: Clip) => Clip): SequenceContent {
  return mapClips(s, (c) => (c.id === id ? fn(c) : c));
}

/** Move a clip in time and optionally to another (unlocked) track. */
export function moveClip(s: SequenceContent, id: string, start: number, trackId?: string): SequenceContent {
  const f = findClip(s, id);
  if (!f) return s;
  const t = clampT(start);
  const dest = trackId && trackId !== f.track.id ? s.tracks.find((x) => x.id === trackId && !x.locked) : undefined;
  if (!dest) return f.clip.start === t ? s : updateClip(s, id, (c) => ({ ...c, start: t }));
  const moved = { ...f.clip, start: t };
  return { ...s, tracks: s.tracks.map((x) => (x.id === f.track.id ? { ...x, clips: x.clips.filter((c) => c.id !== id) } : x.id === dest.id ? { ...x, clips: [...x.clips, moved] } : x)) };
}

export function deleteClips(s: SequenceContent, ids: string[]): SequenceContent {
  if (!ids.length) return s;
  const set = new Set(ids);
  return { ...s, tracks: s.tracks.map((t) => (t.locked ? t : { ...t, clips: t.clips.filter((c) => !set.has(c.id)) })) };
}

export function duplicateClips(s: SequenceContent, ids: string[], offsetMs: number): { content: SequenceContent; ids: string[] } {
  const created: string[] = [];
  const tracks = s.tracks.map((t) => {
    const copies = t.clips.filter((c) => ids.includes(c.id)).map((c) => {
      const n: Clip = { ...c, id: newId('clip'), name: c.name, start: clampT(c.start + offsetMs), overrides: JSON.parse(JSON.stringify(c.overrides)), repeat: { ...c.repeat } };
      created.push(n.id);
      return n;
    });
    return copies.length && !t.locked ? { ...t, clips: [...t.clips, ...copies] } : t;
  });
  return { content: { ...s, tracks }, ids: created };
}

/** Selected clips ordered by start, then by track order, then by position in track. */
export function orderedSelection(s: SequenceContent, ids: string[]): Clip[] {
  const out: { c: Clip; ti: number; ci: number }[] = [];
  s.tracks.forEach((t, ti) => t.clips.forEach((c, ci) => { if (ids.includes(c.id)) out.push({ c, ti, ci }); }));
  return out.sort((a, b) => a.c.start - b.c.start || a.ti - b.ti || a.ci - b.ci).map((x) => x.c);
}

/** Stagger: first clip stays, each next one starts `step` ms after the previous start. */
export function staggerClips(s: SequenceContent, ids: string[], step: number): SequenceContent {
  const sel = orderedSelection(s, ids);
  if (sel.length < 2) return s;
  const base = sel[0]!.start;
  const starts = new Map(sel.map((c, i) => [c.id, clampT(base + i * step)]));
  return mapClips(s, (c) => (starts.has(c.id) && starts.get(c.id) !== c.start ? { ...c, start: starts.get(c.id)! } : c));
}

/**
 * Chain with overlap: each clip starts when the previous one is (100 − overlap)% through its duration.
 * overlap = 0 → back to back, 50 → half overlapping, 100 → simultaneous, negative → a gap.
 * `durations` maps clip id → effective duration in ms (from the compiled sequence).
 */
export function chainWithOverlap(s: SequenceContent, ids: string[], overlapPct: number, durations: ReadonlyMap<string, number>): SequenceContent {
  const sel = orderedSelection(s, ids);
  if (sel.length < 2) return s;
  const k = 1 - Math.min(100, Math.max(-100, overlapPct)) / 100;
  const starts = new Map<string, number>();
  let prevStart = sel[0]!.start;
  starts.set(sel[0]!.id, prevStart);
  for (let i = 1; i < sel.length; i++) {
    const prev = sel[i - 1]!;
    const d = durations.get(prev.id) ?? 1000;
    prevStart = clampT(prevStart + d * k);
    starts.set(sel[i]!.id, prevStart);
  }
  return mapClips(s, (c) => (starts.has(c.id) && starts.get(c.id) !== c.start ? { ...c, start: starts.get(c.id)! } : c));
}

export function nudgeClips(s: SequenceContent, ids: string[], dt: number): SequenceContent {
  return mapClips(s, (c) => (ids.includes(c.id) ? { ...c, start: clampT(c.start + dt) } : c));
}

// tracks -----------------------------------------------------------------------------------------------------------
export function addTrack(s: SequenceContent): { content: SequenceContent; trackId: string } {
  const t = newTrack(`Track ${s.tracks.length + 1}`);
  return { content: { ...s, tracks: [...s.tracks, t] }, trackId: t.id };
}
export function updateTrack(s: SequenceContent, id: string, patch: Partial<Pick<Track, 'name' | 'muted' | 'solo' | 'locked'>>): SequenceContent {
  return { ...s, tracks: s.tracks.map((t) => (t.id === id ? { ...t, ...patch } : t)) };
}
export function removeTrack(s: SequenceContent, id: string): SequenceContent {
  if (s.tracks.length <= 1) return s;
  return { ...s, tracks: s.tracks.filter((t) => t.id !== id) };
}

// markers ----------------------------------------------------------------------------------------------------------
export function addMarker(s: SequenceContent, kind: SeqMarker['kind'], t: number, name: string): { content: SequenceContent; markerId: string } {
  const m = newMarker(kind, clampT(t), name);
  return { content: { ...s, markers: [...s.markers, m] }, markerId: m.id };
}
export function updateMarker(s: SequenceContent, id: string, patch: Partial<Omit<SeqMarker, 'id'>>): SequenceContent {
  return { ...s, markers: s.markers.map((m) => (m.id === id ? { ...m, ...patch, ...(patch.t !== undefined ? { t: clampT(patch.t) } : {}) } : m)) };
}
export function deleteMarker(s: SequenceContent, id: string): SequenceContent { return { ...s, markers: s.markers.filter((m) => m.id !== id) }; }

/** Snap a time to the grid and to nearby anchors (clip edges, markers, playhead), measured in ms. */
export function snapTime(t: number, o: { grid: number; anchors: number[]; magnet: number }): number {
  let best = Math.round(t / o.grid) * o.grid;
  let bestD = o.magnet;
  for (const a of o.anchors) { const d = Math.abs(a - t); if (d < bestD) { best = a; bestD = d; } }
  return Math.max(0, Math.round(best));
}
