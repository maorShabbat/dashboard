import { describe, expect, it } from 'vitest';
import { cuePoints, resolveSounds } from '../src/vfx/fx/cues';
import { builtinById, builtinPresets } from '../src/vfx/library';
import { sceneAllAssets, soundAttach } from '../src/vfx/model/scene';
import { validatePreset } from '../src/vfx/model/validate';
import { copyForAi } from '../src/vfx/model/copyForAi';
import type { Preset as P } from '../src/vfx/model/preset';

const preset = (id: string): P => JSON.parse(JSON.stringify(builtinById(id)!)) as P;

describe('cue points', () => {
  it('a scene always has a start and an end, in time order', () => {
    const p = preset('messages.trigger-bonus'), pts = cuePoints(p.scene, 3.8);
    expect(pts[0]).toMatchObject({ key: 'scene:start', t: 0 });
    expect(pts[pts.length - 1]).toMatchObject({ key: 'scene:end', t: 3.8 });
    for (let i = 1; i < pts.length; i++) expect(pts[i]!.t).toBeGreaterThanOrEqual(pts[i - 1]!.t);
    expect(new Set(pts.map((c) => c.key)).size).toBe(pts.length);
  });

  it('every effect has a start and an end, and the ones with an impact have that too', () => {
    const p = preset('messages.trigger-bonus'), pts = cuePoints(p.scene, 3.8), keys = new Set(pts.map((c) => c.key));
    const cin = p.scene.fx.find((l) => l.effect === 'cinema.trigger')!;
    for (const k of ['start', 'impact', 'end']) expect(keys.has(`fx:${cin.id}:${k}`), k).toBe(true);
    expect(pts.find((c) => c.key === `fx:${cin.id}:impact`)!.t).toBeCloseTo(0.95, 3);
    const title = p.scene.elements.find((e) => e.id === 'title')!;
    expect(pts.find((c) => c.key === 'el:title:in')!.t).toBeCloseTo(title.start + (title.motion.entrance?.start ?? 0), 3);
  });

  it('a reel board offers a cue for every reel stopping, the landing symbols, the win and the tumbles', () => {
    const p = preset('symbol-transformation.cascade-tumble'), pts = cuePoints(p.scene, 12), keys = pts.map((c) => c.key);
    for (let r = 0; r < 5; r++) expect(keys, `reel ${r}`).toContain(`board:board:reel-stop:${r}`);
    expect(keys).toContain('board:board:spin-start');
    expect(keys).toContain('board:board:win:0');
    expect(keys.some((k) => k.startsWith('board:board:pop:'))).toBe(true);
    expect(keys.some((k) => k.startsWith('board:board:drop:'))).toBe(true);
    const stops = [0, 1, 2, 3, 4].map((r) => pts.find((c) => c.key === `board:board:reel-stop:${r}`)!.t);
    for (let i = 1; i < 5; i++) expect(stops[i]).toBeGreaterThan(stops[i - 1]!);
    expect(keys.some((k) => k.includes(':land:'))).toBe(false);
    const sc = cuePoints(preset('symbol-transformation.scatter-trigger').scene, 8).map((c) => c.key);
    expect(sc.some((k) => k.includes(':land:'))).toBe(true);
    expect(sc).toContain('board:board:anticipation');
  });

  it('a board at rest offers only the start, and disabled or hidden things offer nothing', () => {
    const rest = cuePoints(preset('shine.ambient-snow').scene, 8).map((c) => c.key);
    expect(rest.some((k) => k.startsWith('board:board:') && !k.endsWith(':in'))).toBe(false);
    const p = preset('messages.trigger-bonus');
    p.scene.fx[0]!.enabled = false; p.scene.elements.find((e) => e.id === 'title')!.hidden = true;
    const keys = cuePoints(p.scene, 3.8).map((c) => c.key);
    expect(keys.some((k) => k.startsWith(`fx:${p.scene.fx[0]!.id}:`))).toBe(false);
    expect(keys).not.toContain('el:title:in');
  });

  it('two layers of the same effect are told apart in their labels', () => {
    const p = preset('messages.trigger-bonus');
    p.scene.fx.push({ ...p.scene.fx[0]!, id: 'second', start: 2 });
    const labels = cuePoints(p.scene, 3.8).filter((c) => c.key.startsWith('fx:') && c.key.endsWith(':start')).map((c) => c.label);
    expect(new Set(labels).size).toBe(labels.length);
    expect(labels.some((l) => /\(2\)/.test(l))).toBe(true);
  });
});

describe('attached sounds', () => {
  const withSounds = (list: ReturnType<typeof soundAttach>[]): P => { const p = preset('messages.trigger-bonus'); p.scene.sounds = list; p.scene.sound = { enabled: true, volume: 0.5 }; p.scene.assets = [{ id: 'aud1', kind: 'audio', name: 'boom.wav', bytes: 10, sha256: 'x', type: 'audio/wav' }]; return p; };

  it('play at their cue plus their offset, never before 0, with the scene volume applied', () => {
    const p = withSounds([soundAttach({ id: 'a', asset: 'aud1', cue: 'scene:start', offset: -0.4 }), soundAttach({ id: 'b', asset: 'aud1', cue: 'scene:end', offset: -0.5, gain: 1.5 }), soundAttach({ id: 'c', asset: 'aud1', cue: 'el:title:in', offset: 0.25 })]);
    const r = resolveSounds(p.scene, 3.8);
    expect(r.missing).toEqual([]);
    const by = Object.fromEntries(r.sounds.map((s) => [s.id, s]));
    expect(by.a!.t).toBe(0);
    expect(by.b!.t).toBeCloseTo(3.3, 3); expect(by.b!.gain).toBeCloseTo(0.75, 6);
    expect(by.c!.t).toBeGreaterThan(0.5);
    for (let i = 1; i < r.sounds.length; i++) expect(r.sounds[i]!.t).toBeGreaterThanOrEqual(r.sounds[i - 1]!.t);
  });

  it('a cue that no longer exists is reported, not played at some other time', () => {
    const p = withSounds([soundAttach({ id: 'a', asset: 'aud1', cue: 'fx:deleted:impact' }), soundAttach({ id: 'b', asset: 'aud1', cue: 'scene:start' })]);
    const r = resolveSounds(p.scene, 3.8);
    expect(r.missing.map((m) => m.id)).toEqual(['a']);
    expect(r.sounds.map((s) => s.id)).toEqual(['b']);
  });

  it('are counted among the scene assets, so they are kept, exported and checked', () => {
    const p = withSounds([soundAttach({ asset: 'aud1', cue: 'scene:start' })]);
    expect(sceneAllAssets(p.scene)).toContain('aud1');
    p.scene.sounds = [];
    expect(sceneAllAssets(p.scene)).not.toContain('aud1');
  });

  it('are validated: the file must be listed, offsets and volume are kept in range, and there is a limit', () => {
    const ok = validatePreset(withSounds([soundAttach({ asset: 'aud1', cue: 'scene:start' })]));
    expect(ok.errors).toEqual([]);
    const p = withSounds([soundAttach({ asset: 'nope', cue: 'scene:start' })]);
    expect(validatePreset(p).errors.join(' ')).toMatch(/nope.*not listed/);
    const wild = withSounds([soundAttach({ asset: 'aud1', cue: 'scene:start', offset: 999, gain: 99 })]);
    const r = validatePreset(wild);
    expect(r.ok).toBe(true);
    expect(r.preset!.scene.sounds![0]!.offset).toBe(60); expect(r.preset!.scene.sounds![0]!.gain).toBe(4);
    expect(r.warnings.length).toBeGreaterThan(0);
    const many = withSounds(Array.from({ length: 41 }, () => soundAttach({ asset: 'aud1', cue: 'scene:start' })));
    expect(validatePreset(many).errors.join(' ')).toMatch(/more than 40/);
    const q = withSounds([]); (q.scene.sound as unknown as Record<string, unknown>).builtin = 'no';
    expect(validatePreset(q).preset!.scene.sound.builtin).toBeUndefined();
  });

  it('show up in Copy for AI, with the cue and the offset', () => {
    const p = withSounds([soundAttach({ id: 'a', name: 'Boom', asset: 'aud1', cue: 'el:title:in', offset: -0.1, gain: 1.2 })]);
    const text = copyForAi(p);
    expect(text).toContain('Your own sounds');
    expect(text).toContain('el:title:in');
    expect(text).toContain('Boom');
    expect(copyForAi(preset('messages.trigger-bonus'))).not.toContain('Your own sounds');
  });

  it('no built-in preset carries sounds of its own (they would need files)', () => {
    for (const p of builtinPresets()) expect(p.scene.sounds ?? [], p.id).toEqual([]);
  });
});
