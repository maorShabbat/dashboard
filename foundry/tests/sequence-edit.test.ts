import { describe, expect, it } from 'vitest';
import { addClip, addMarker, addTrack, chainWithOverlap, deleteClips, duplicateClips, findClip, moveClip, nudgeClips, orderedSelection, removeTrack, snapTime, staggerClips, updateMarker, updateTrack } from '../src/core/model/seqEdit';
import { emptySequenceContent } from '../src/core/model/defaults';
import { compileSequence } from '../src/core/engine';
import { lib } from './helpers';

function build() {
  let s = emptySequenceContent(null);
  const ids: string[] = [];
  for (const [type, start] of [['shockwave', 100], ['flash', 0], ['coinBurst', 500]] as const) {
    const r = addClip(s, { effectType: type, start }); s = r.content; ids.push(r.clipId);
  }
  return { s, ids };
}

describe('sequence editing', () => {
  it('adds clips to the first unlocked track and clamps start', () => {
    let { s } = build();
    const t2 = addTrack(s); s = t2.content;
    s = updateTrack(s, s.tracks[0]!.id, { locked: true });
    const r = addClip(s, { effectType: 'flash', start: -50 });
    expect(findClip(r.content, r.clipId)!.track.id).toBe(t2.trackId);
    expect(findClip(r.content, r.clipId)!.clip.start).toBe(0);
  });
  it('moves in time and between tracks, but never into a locked track', () => {
    let { s, ids } = build();
    const t2 = addTrack(s); s = t2.content;
    s = moveClip(s, ids[0]!, 1234.6, t2.trackId);
    expect(findClip(s, ids[0]!)).toMatchObject({ clip: { start: 1235 }, track: { id: t2.trackId } });
    s = updateTrack(s, t2.trackId, { locked: true });
    const before = s;
    s = moveClip(s, ids[1]!, 50, t2.trackId);
    expect(findClip(s, ids[1]!)!.track.id).toBe(before.tracks[0]!.id);
    expect(findClip(s, ids[1]!)!.clip.start).toBe(50);
    expect(moveClip(s, ids[1]!, 50)).toBe(s);
  });
  it('staggers selected clips in start order', () => {
    const { s, ids } = build();
    const out = staggerClips(s, ids, 150);
    expect(orderedSelection(out, ids).map((c) => c.start)).toEqual([0, 150, 300]);
    expect(findClip(out, ids[1]!)!.clip.start).toBe(0); // earliest keeps its place
    expect(staggerClips(s, [ids[0]!], 150)).toBe(s);
  });
  it('chains with overlap against effective durations', () => {
    const { s, ids } = build();
    const dur = new Map([[ids[0]!, 1000], [ids[1]!, 400], [ids[2]!, 800]]);
    // order by start: flash(0,400) → shockwave(100) → coinBurst(500)
    const back = chainWithOverlap(s, ids, 0, dur);
    expect(orderedSelection(back, ids).map((c) => [c.id, c.start])).toEqual([[ids[1], 0], [ids[0], 400], [ids[2], 1400]]);
    const half = chainWithOverlap(s, ids, 50, dur);
    expect(orderedSelection(half, ids).map((c) => c.start)).toEqual([0, 200, 700]);
    const simult = chainWithOverlap(s, ids, 100, dur);
    expect(orderedSelection(simult, ids).map((c) => c.start)).toEqual([0, 0, 0]);
    const gap = chainWithOverlap(s, ids, -50, dur);
    expect(orderedSelection(gap, ids).map((c) => c.start)).toEqual([0, 600, 2100]);
  });
  it('overlap produces genuinely overlapping time ranges in the compiled sequence', () => {
    const { s, ids } = build();
    const c0 = compileSequence(s, lib());
    const d = new Map(c0.clips.map((c) => [c.clipId, c.duration]));
    const chained = compileSequence(chainWithOverlap(s, ids, 50, d), lib());
    const sorted = [...chained.clips].sort((a, b) => a.start - b.start);
    for (let i = 1; i < sorted.length; i++) expect(sorted[i]!.start).toBeLessThan(sorted[i - 1]!.end);
  });
  it('duplicate, delete (respecting locks) and nudge', () => {
    let { s, ids } = build();
    const dup = duplicateClips(s, [ids[0]!], 250);
    expect(dup.ids.length).toBe(1);
    expect(findClip(dup.content, dup.ids[0]!)!.clip.start).toBe(350);
    expect(dup.ids[0]).not.toBe(ids[0]);
    s = nudgeClips(dup.content, [ids[0]!], -500);
    expect(findClip(s, ids[0]!)!.clip.start).toBe(0);
    s = updateTrack(s, s.tracks[0]!.id, { locked: true });
    expect(deleteClips(s, ids).tracks[0]!.clips.length).toBe(s.tracks[0]!.clips.length); // locked track is untouched
    s = updateTrack(s, s.tracks[0]!.id, { locked: false });
    expect(deleteClips(s, ids).tracks[0]!.clips.length).toBe(1);
  });
  it('keeps at least one track; markers add/update/clamp', () => {
    let { s } = build();
    expect(removeTrack(s, s.tracks[0]!.id)).toBe(s);
    const m = addMarker(s, 'event', 99999999, 'x'); s = m.content;
    expect(s.markers[0]!.t).toBe(600000);
    s = updateMarker(s, m.markerId, { t: -5, name: 'y' });
    expect(s.markers[0]).toMatchObject({ t: 0, name: 'y' });
  });
  it('snaps to grid and magnets', () => {
    expect(snapTime(123, { grid: 10, anchors: [], magnet: 0 })).toBe(120);
    expect(snapTime(123, { grid: 10, anchors: [125], magnet: 8 })).toBe(125);
    expect(snapTime(123, { grid: 10, anchors: [140], magnet: 8 })).toBe(120);
    expect(snapTime(-40, { grid: 10, anchors: [], magnet: 0 })).toBe(0);
  });
});
