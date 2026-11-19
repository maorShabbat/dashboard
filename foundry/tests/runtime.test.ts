import { describe, expect, it } from 'vitest';
import { compileSequence, timelineEvents, type TimelineEvent } from '../src/core/engine';
import { Player } from '../src/core/player';
import { createStarterProject, STARTER_IDS as S } from '../src/core/starter';
import { libraryView } from '../src/core/model/ops';
import { BlobStore, MemoryKV, attachAutosave, loadProject, saveProject } from '../src/core/store/persistence';
import { ProjectStore } from '../src/core/store/history';
import { renameAsset } from '../src/core/model/ops';
import { jsonDiff } from '../src/core/model/diff';
import { sha256Hex } from '../src/core/util/sha256';

function bigWin() {
  const p = createStarterProject();
  return compileSequence(p.sequences[S.sequences.bigWin]!.draft, libraryView(p));
}

function run(player: Player, totalMs: number, step = 40) { for (let t = 0; t < totalMs; t += step) player.advance(step); }

describe('Player (headless): replay, scrubbing, cues and events', () => {
  it('fires every cue and event exactly once, in order, as time passes', () => {
    const seq = bigWin();
    const fired: TimelineEvent[] = [];
    const p = new Player({ sequence: seq, manual: true, viewport: { w: 1280, h: 720 }, onCue: (e) => fired.push(e), onEvent: (e) => fired.push(e) });
    p.play();
    run(p, seq.duration + 200);
    const expected = timelineEvents(seq).filter((e) => e.kind !== 'label');
    expect(fired.map((e) => `${e.kind}:${e.name}@${Math.round(e.t)}`)).toEqual(expected.map((e) => `${e.kind}:${e.name}@${Math.round(e.t)}`));
    expect(fired.map((e) => e.t)).toEqual([...fired.map((e) => e.t)].sort((a, b) => a - b));
    expect(p.playing).toBe(false);
    expect(p.time).toBe(seq.duration);
    expect(fired.some((e) => e.name === 'celebration.start')).toBe(true);
    expect(fired.some((e) => e.name === 'celebration.end')).toBe(true);
  });

  it('scrubbing is silent; playing from a scrubbed position fires only what is still ahead; replay starts over', () => {
    const seq = bigWin();
    const fired: string[] = [];
    const p = new Player({ sequence: seq, manual: true, viewport: { w: 1280, h: 720 }, onCue: (e) => fired.push(e.name), onEvent: (e) => fired.push(e.name) });
    p.seek(3000);
    p.seek(1000);
    expect(fired).toEqual([]); // no sounds while dragging the playhead
    p.play();
    run(p, 500);
    expect(fired).not.toContain('celebration.start'); // already behind the playhead
    expect(fired).not.toContain('coin.burst'); // the 350/700 ms coin bursts are behind the 1000 ms playhead
    expect(fired).toEqual(['coin.land']); // the first burst's tail cue (350 + 1100 = 1450 ms) is still ahead
    p.pause();
    fired.length = 0;
    p.replay();
    run(p, 100);
    expect(fired).toContain('celebration.start');
    expect(fired).toContain('shake.impact');
  });

  it('loops with a gap and replays events each iteration; speed scales time', () => {
    const seq = bigWin();
    const starts: number[] = [];
    const p = new Player({ sequence: seq, manual: true, loop: true, loopGap: 300, viewport: { w: 1280, h: 720 }, onEvent: (e) => { if (e.name === 'celebration.start') starts.push(e.t); } });
    p.play();
    run(p, seq.duration * 2 + 1500, 50);
    expect(starts.length).toBeGreaterThanOrEqual(2);
    expect(p.playing).toBe(true);
    p.pause();
    const q = new Player({ sequence: seq, manual: true, speed: 2, viewport: { w: 1280, h: 720 } });
    q.play(); q.advance(500);
    expect(q.time).toBe(500); // advance() takes timeline ms; the animation loop applies speed to wall-clock deltas
  });

  it('hot-swapping the sequence keeps the playhead and clamps to the new length', () => {
    const seq = bigWin();
    const p = new Player({ sequence: seq, manual: true, viewport: { w: 1280, h: 720 } });
    p.seek(4000);
    p.setSequence({ ...seq, duration: 1000 });
    expect(p.time).toBe(1000);
  });
});

describe('persistence', () => {
  it('saves and loads the project through the key/value interface, sanitising on the way in', async () => {
    const kv = new MemoryKV();
    expect(await loadProject(kv)).toBeNull();
    const p = createStarterProject();
    await saveProject(kv, p);
    const back = await loadProject(kv);
    expect(Object.keys(back!.project.themes).sort()).toEqual([S.classic, S.neon].sort());
    expect(back!.project.themes[S.classic]!.approvedVersionId).toBe(p.themes[S.classic]!.approvedVersionId);
    await kv.set('project.json', '{ not json');
    expect(await loadProject(kv)).toBeNull();
    await kv.set('project.json', JSON.stringify({ schema: 99 }));
    expect(await loadProject(kv)).toBeNull(); // a newer schema is refused, never half-loaded
  });

  it('autosave debounces and flushes on dispose', async () => {
    const kv = new MemoryKV();
    const store = new ProjectStore(createStarterProject());
    const states: string[] = [];
    const stop = attachAutosave(store, kv, (s) => states.push(s), 20);
    store.commit('a', (p) => renameAsset(p, 'theme', S.neon, 'One'));
    store.commit('b', (p) => renameAsset(p, 'theme', S.neon, 'Two'));
    await new Promise((r) => setTimeout(r, 80));
    expect(states).toEqual(['saving', 'saved']); // two edits, one write
    expect((await loadProject(kv))!.project.themes[S.neon]!.name).toBe('Two');
    store.commit('c', (p) => renameAsset(p, 'theme', S.neon, 'Three'));
    await stop();
    expect((await loadProject(kv))!.project.themes[S.neon]!.name).toBe('Three');
  });

  it('stores binary blobs by content hash and de-duplicates them', async () => {
    const kv = new MemoryKV();
    const blobs = new BlobStore(kv);
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const h = await blobs.put(bytes);
    expect(h).toBe(sha256Hex(bytes));
    expect(await blobs.put(new Uint8Array([1, 2, 3, 4]))).toBe(h);
    expect((await kv.keys('blob:')).length).toBe(1);
    const fresh = new BlobStore(kv); // new session: reads from storage
    expect(Array.from((await fresh.get(h))!)).toEqual([1, 2, 3, 4]);
    expect(await fresh.get('0'.repeat(64))).toBeUndefined();
  });
});

describe('diff', () => {
  it('reports leaf changes and matches arrays by id', () => {
    const d = jsonDiff(
      { tokens: { a: 1, b: 2 }, tracks: [{ id: 't1', clips: [{ id: 'c1', start: 0 }] }] },
      { tokens: { a: 1, b: 3, c: 4 }, tracks: [{ id: 't1', clips: [{ id: 'c1', start: 50 }, { id: 'c2', start: 9 }] }] },
    );
    const by = Object.fromEntries(d.map((x) => [x.path, [x.before, x.after]]));
    expect(by['tokens.b']).toEqual([2, 3]);
    expect(by['tokens.c']).toEqual([undefined, 4]);
    expect(by['tracks[t1].clips[c1].start']).toEqual([0, 50]);
    expect(by['tracks[t1].clips[c2]']![0]).toBeUndefined();
    expect(d.some((x) => x.path === 'tokens.a')).toBe(false);
  });
});
