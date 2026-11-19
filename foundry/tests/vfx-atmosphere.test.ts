import { describe, expect, it } from 'vitest';
import { defaultsOf, type BoardInfo, type EffectCtx } from '../src/vfx/fx/effect';
import { EFFECTS, effectById } from '../src/vfx/fx';
import { emptyFrame, QUAD_FLOATS, type DrawBatch, type Frame } from '../src/vfx/engine/frame';
import { boardElement } from '../src/vfx/model/scene';
import { planBoard } from '../src/vfx/model/board';
import { boardInfo } from '../src/vfx/model/boardinfo';
import { builtinPresets } from '../src/vfx/library';
import { validatePreset } from '../src/vfx/model/validate';
import { copyForAi } from '../src/vfx/model/copyForAi';

const board = boardElement({ id: 'board', params: { spin: 'rest' } });
const info: BoardInfo = boardInfo(board, planBoard(board), 16 / 9);
const ctx = (o: Partial<EffectCtx> = {}): EffectCtx => ({ aspect: 16 / 9, pxPerUnit: 500, object: null, board: null, start: 0, ...o } as EffectCtx);
const build = (id: string, t: number, over: Record<string, number | string | boolean> = {}, c: EffectCtx = ctx(), pre?: (f: Frame) => void): Frame => {
  const e = effectById(id)!, f = emptyFrame();
  pre?.(f);
  e.build(f, t, { ...defaultsOf(e), ...over }, c);
  return f;
};
/** Every number the frame is made of; an angle is compared as a point on the circle, so a whole turn is the same angle. */
const flat = (f: Frame): number[] => [
  ...f.draws.flatMap((d) => { const o: number[] = []; for (let i = 0; i < d.instances.length; i += QUAD_FLOATS) { const q = d.instances.slice(i, i + QUAD_FLOATS); o.push(...q.slice(0, 6), Math.sin(q[6]!), Math.cos(q[6]!), ...q.slice(7)); } return o; }),
  ...f.additive.flatMap((a) => [a.x, a.y, a.hw, a.hh, Math.sin(a.rot), Math.cos(a.rot), a.intensity, ...a.color]), ...f.polys];
const near = (a: number[], b: number[], tol = 1e-3): boolean => a.length === b.length && a.every((v, i) => Math.abs(v - b[i]!) <= tol);
const instances = (f: Frame): number => f.draws.reduce((s, d) => s + d.instances.length / QUAD_FLOATS, 0);
const AMBIENT = EFFECTS.filter((e) => e.id.startsWith('ambient.'));
const FRAMES = EFFECTS.filter((e) => e.id.startsWith('frame.'));

describe('ambient loops', () => {
  it('there are six, each a loop of a length you can set', () => {
    expect(AMBIENT.map((e) => e.id).sort()).toEqual(['ambient.bokeh', 'ambient.embers', 'ambient.fireflies', 'ambient.rays', 'ambient.snow', 'ambient.stars']);
    for (const e of AMBIENT) { expect(e.params.some((p) => p.key === 'loop')).toBe(true); expect(e.duration({ ...defaultsOf(e), loop: 5 })).toBe(5); }
  });

  it('the last frame of the loop is the frame before the first, for every speed', () => {
    for (const e of AMBIENT) for (const speed of [1, 2, 3]) for (const loop of [4, 8]) {
      const a = build(e.id, 0, { loop, speed }), b = build(e.id, loop - 1e-7, { loop, speed });
      expect(instances(a), `${e.id} draws something`).toBeGreaterThan(0);
      expect(near(flat(a), flat(b)), `${e.id} speed ${speed} loop ${loop} is seamless`).toBe(true);
    }
  });

  it('moves between the two ends, and is empty after the loop', () => {
    for (const e of AMBIENT) {
      const a = flat(build(e.id, 0)), mid = flat(build(e.id, 3.3));
      expect(near(a, mid, 1e-4), `${e.id} moves`).toBe(false);
      expect(flat(build(e.id, 8.0001)).length, `${e.id} ends`).toBe(0);
      for (const v of mid) expect(Number.isFinite(v), e.id).toBe(true);
    }
  });

  it('draws behind what is already there, in front of it, or both', () => {
    const dummy: DrawBatch = { tex: { uid: '$dummy', version: 0, w: 1, h: 1, load: () => ({ kind: 'rgba', data: new Uint8Array(4), w: 1, h: 1 }) }, fill: null, fillMode: 0, premultiplied: false, instances: new Array(QUAD_FLOATS).fill(0), emit: 0 };
    const where = (layer: string) => { const f = build('ambient.bokeh', 2, { layer }, ctx(), (fr) => fr.draws.push(dummy)); const i = f.draws.indexOf(dummy); return { before: i, after: f.draws.length - 1 - i }; };
    expect(where('behind')).toMatchObject({ after: 0 });
    expect(where('behind').before).toBeGreaterThan(0);
    expect(where('front').before).toBe(0);
    expect(where('front').after).toBeGreaterThan(0);
    const both = where('both');
    expect(both.before).toBeGreaterThan(0); expect(both.after).toBeGreaterThan(0);
  });

  it('a lower quality draws fewer pieces, never none', () => {
    for (const e of AMBIENT) { const full = instances(build(e.id, 2, {}, ctx({ quality: 1 }))), low = instances(build(e.id, 2, {}, ctx({ quality: 0.35 }))); expect(low, e.id).toBeGreaterThan(0); expect(low, e.id).toBeLessThan(full); }
  });

  it('the colour settings reach the pieces', () => {
    const tintOf = (f: Frame) => f.draws[0]!.instances.slice(20, 23);
    const a = tintOf(build('ambient.snow', 2, { tint: '#ff0000', tint2: '#ff0000' })), b = tintOf(build('ambient.snow', 2, { tint: '#0000ff', tint2: '#0000ff' }));
    expect(a[0]).toBeGreaterThan(0.9); expect(a[2]).toBeLessThan(0.1); expect(b[2]).toBeGreaterThan(0.9);
  });

  it('shooting stars cross the sky only at their own moment of the loop', () => {
    const seen = (t: number) => build('ambient.stars', t, { shooting: 3, count: 4, loop: 10 }).draws.flatMap((d) => d.instances.length / QUAD_FLOATS).reduce((a, b) => a + b, 0);
    let max = 0, min = Infinity; for (let t = 0; t < 10; t += 0.05) { const c = seen(t); max = Math.max(max, c); min = Math.min(min, c); }
    expect(max).toBeGreaterThan(min);
  });
});

describe('animated frames', () => {
  it('there are five, and they loop like the ambient ones', () => {
    expect(FRAMES.map((e) => e.id).sort()).toEqual(['frame.chase', 'frame.neon', 'frame.rainbow', 'frame.shimmer', 'frame.sparkle']);
    for (const e of FRAMES) for (const laps of [1, 2, 3]) {
      const c = ctx({ board: info });
      // the neon's failing and buzzing modes flicker in steps: a step change is a jump by design, so check the continuous ones
      const over = { loop: 6, laps, mode: e.id === 'frame.neon' ? 'steady' : e.id === 'frame.chase' ? 'run' : 'x' };
      const a = build(e.id, 0.0, over, c), b = build(e.id, 6 - 1e-7, over, c);
      // the shimmer rests between sweeps, so it is empty at both ends; it must still draw something during a sweep
      expect(build(e.id, 1.2, over, c).additive.length, e.id).toBeGreaterThan(0);
      expect(near(flat(a), flat(b)), `${e.id} laps ${laps}`).toBe(true);
    }
  });

  it('go round the box of whatever they are aimed at, and not somewhere else', () => {
    for (const e of FRAMES) {
      const c = ctx({ board: info }), f = build(e.id, 2.2, {}, c), { x0, y0, x1, y1 } = info.box, m = 0.25;
      expect(f.additive.length, e.id).toBeGreaterThan(0);
      for (const a of f.additive) { expect(a.x, e.id).toBeGreaterThan(x0 - m); expect(a.x).toBeLessThan(x1 + m); expect(a.y).toBeGreaterThan(y0 - m); expect(a.y).toBeLessThan(y1 + m); }
    }
    const el = ctx({ silhouette: { box: { x0: 0.2, y0: 0.2, x1: 0.8, y1: 0.5 }, sample: () => ({ x: 0, y: 0 }) } });
    for (const a of build('frame.chase', 1, {}, el).additive) { expect(a.x).toBeGreaterThan(0.1); expect(a.x).toBeLessThan(0.9); expect(a.y).toBeGreaterThan(0.1); expect(a.y).toBeLessThan(0.6); }
  });

  it('fade makes a one-off: nothing at the start and end, full in the middle', () => {
    for (const e of FRAMES) {
      const c = ctx({ board: info });
      expect(build(e.id, 0, { fade: 0.5, loop: 6 }, c).additive.length, `${e.id} start`).toBe(0);
      expect(build(e.id, 2, { fade: 0.5, loop: 6 }, c).additive.length, `${e.id} middle`).toBeGreaterThan(0);
      expect(build(e.id, 6.01, { loop: 6 }, c).additive.length, `${e.id} after`).toBe(0);
    }
  });

  it('chasing lights: the run mode lights some bulbs more than others, the alternate mode swaps them', () => {
    const c = ctx({ board: info }), sum = (f: Frame) => f.additive.filter((a) => a.type === 0 && a.e1 === 2.2).map((a) => a.intensity);
    const run = sum(build('frame.chase', 0.5, { mode: 'run' }, c));
    expect(Math.max(...run)).toBeGreaterThan(Math.min(...run) * 1.5);
    const a = sum(build('frame.chase', 0, { mode: 'alternate', laps: 1 }, c)), b = sum(build('frame.chase', 3, { mode: 'alternate', laps: 1 }, c));
    expect(a[0]! > a[1]!).not.toBe(b[0]! > b[1]!);
  });

  it('works with no target at all, from its own position and size settings', () => {
    for (const e of FRAMES) expect(() => build(e.id, 1, {}, ctx()), e.id).not.toThrow();
  });
});

describe('the feature-trigger cinematic', () => {
  const cin = (t: number, over: Record<string, number | string | boolean> = {}) => build('cinema.trigger', t, over);
  it('starts from an untouched picture, pushes in and punches on the beat, and settles back', () => {
    const e = effectById('cinema.trigger')!, D = Number(defaultsOf(e).duration), I = e.impactAt!({ ...defaultsOf(e) });
    expect(cin(0).camera.zoom).toBeCloseTo(1, 2);
    const mid = cin(I - 0.1).camera.zoom, hit = cin(I + 0.02).camera.zoom, held = cin(D * 0.6).camera.zoom, end = cin(D - 0.02).camera.zoom;
    expect(mid).toBeGreaterThan(1.02); expect(hit).toBeGreaterThan(mid); expect(held).toBeGreaterThan(1.02); expect(end).toBeLessThan(held);
    expect(cin(D + 0.01).polys.length + cin(D + 0.01).additive.length).toBe(0);
    expect(I).toBeGreaterThan(0.3);
  });
  it('the bars end up where they should on the screen even with the picture zoomed', () => {
    const f = cin(1.6, { bars: 0.2 }), z = f.camera.zoom;
    const ys: number[] = []; for (let i = 1; i < f.polys.length; i += 6) ys.push(f.polys[i]!);
    // the top bar's lowest point and the bottom bar's highest point, as the camera will show them
    const top = Math.max(...ys.filter((y) => y < 0.5)), bottom = Math.min(...ys.filter((y) => y > 0.5));
    expect(0.5 + (top - 0.5) * z).toBeCloseTo(0.2, 3);
    expect(0.5 + (bottom - 0.5) * z).toBeCloseTo(0.8, 3);
  });
  it('flash, rays and rings appear on the beat and not before it', () => {
    const e = effectById('cinema.trigger')!, I = e.impactAt!({ ...defaultsOf(e) });
    const rays = (f: Frame) => f.additive.filter((a) => a.type === 6).length, rings = (f: Frame) => f.additive.filter((a) => a.type === 1).length;
    expect(rays(cin(I - 0.2))).toBe(0); expect(rings(cin(I - 0.2))).toBe(0);
    expect(rays(cin(I + 0.2))).toBe(16); expect(rings(cin(I + 0.3))).toBeGreaterThan(0);
    expect(rays(cin(I + 0.2, { rays: 0 }))).toBe(0);
    expect(cin(I + 0.01, { flash: 0 }).additive.some((a) => a.type === 3)).toBe(false);
  });
  it('everything it draws is a finite number', () => {
    for (let t = 0; t < 3.8; t += 0.1) { const f = cin(t); for (const v of [...flat(f), f.camera.zoom, f.camera.dx, f.camera.dy]) expect(Number.isFinite(v)).toBe(true); }
  });
});

describe('a board at rest', () => {
  it('has no spin, no events and no result, whatever the pattern says', () => {
    const p = planBoard(boardElement({ params: { spin: 'rest', pattern: 'scatter-trigger' } }));
    expect(p.events).toEqual([]);
    expect(p.win).toBeNull();
    expect(p.stopEnd).toBeLessThan(0);
    expect(p.end).toBeLessThan(1);
    expect(p.layout.length).toBe(3);
  });
});

describe('atmosphere presets', () => {
  const ambient = builtinPresets().filter((p) => p.group === 'Ambient loops behind the reels');
  const frames = builtinPresets().filter((p) => p.group === 'Animated frames');
  const triggers = builtinPresets().filter((p) => p.group === 'Feature triggers');
  it('there are ambient loops, animated frames and feature triggers, in the groups the person looks for', () => {
    expect(ambient.length).toBeGreaterThanOrEqual(14); expect(frames.length).toBeGreaterThanOrEqual(14); expect(triggers.length).toBeGreaterThanOrEqual(7);
    expect(new Set(ambient.map((p) => p.category))).toEqual(new Set(['shine']));
    expect(new Set(triggers.map((p) => p.category))).toEqual(new Set(['messages']));
  });
  it('loops are seamless scenes exactly one loop long; triggers are not', () => {
    for (const p of [...ambient, ...frames]) {
      expect(p.scene.seamless, p.id).toBe(true);
      const fx = p.scene.fx[0]!, e = effectById(fx.effect)!;
      expect(p.scene.duration, p.id).toBeCloseTo(e.duration({ ...defaultsOf(e), ...fx.params }), 6);
      expect(p.scene.hold, p.id).toBe(0);
    }
    for (const p of triggers) expect(p.scene.seamless, p.id).toBeFalsy();
  });
  it('are valid, and every effect aimed at something is aimed at an element that exists', () => {
    for (const p of [...ambient, ...frames, ...triggers]) {
      const r = validatePreset(JSON.parse(JSON.stringify(p)));
      expect(r.errors, p.id).toEqual([]);
      const ids = new Set(p.scene.elements.map((e) => e.id));
      for (const l of p.scene.fx) { expect(effectById(l.effect), `${p.id} ${l.effect}`).toBeTruthy(); if (l.target) expect(ids.has(l.target), `${p.id} target`).toBe(true); }
    }
  });
  it('the feature-trigger text slams on the beat the cinematic sets', () => {
    for (const p of triggers.filter((x) => x.inputs.some((i) => i.element === 'title'))) {
      const fx = p.scene.fx.find((l) => l.effect === 'cinema.trigger')!, e = effectById('cinema.trigger')!, impact = e.impactAt!({ ...defaultsOf(e), ...fx.params });
      const title = p.scene.elements.find((x) => x.id === 'title')!;
      const slam = title.motion.entrance!;
      expect(slam.id).toBe('slam');
      expect(Math.abs(slam.start + title.start - impact), p.id).toBeLessThan(0.2);
    }
  });
  it('the seamless flag survives validation and shows up in Copy for AI; a wrong value is dropped with a warning', () => {
    const p = ambient[0]!;
    expect(validatePreset(JSON.parse(JSON.stringify(p))).preset?.scene.seamless).toBe(true);
    const bad = JSON.parse(JSON.stringify(p)); bad.scene.seamless = 'yes';
    const r = validatePreset(bad);
    expect(r.ok).toBe(true); expect(r.warnings.some((w) => w.includes('seamless'))).toBe(true); expect(r.preset?.scene.seamless).toBeUndefined();
    expect(copyForAi(p)).toContain('Seamless loop');
    expect(copyForAi(triggers[0]!)).not.toContain('Seamless loop');
  });
});
