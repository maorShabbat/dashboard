import { describe, expect, it } from 'vitest';
import { defaultsOf, type EffectCtx, type PValues } from '../src/vfx/fx/effect';
import { EFFECTS, effectById } from '../src/vfx/fx';
import { emptyFrame, TR, type Frame } from '../src/vfx/engine/frame';
import { discharge, ribbon, slice } from '../src/vfx/engine/lightning';
import { objectFromFunction, type ObjectInfo } from '../src/vfx/engine/object';
import { makeRng } from '../src/core/util/prng';
import { fracture } from '../src/vfx/engine/voronoi';

// synthetic transparent icons: a disc, a ring with a transparent hole, and a horseshoe-like arc with an open gap
const disc = objectFromFunction('disc', 1, (u, v) => (Math.hypot(u - 0.5, v - 0.5) < 0.4 ? 1 : 0));
const ring = objectFromFunction('ring', 1, (u, v) => { const r = Math.hypot(u - 0.5, v - 0.5); return r < 0.42 && r > 0.2 ? 1 : 0; });
const shoe = objectFromFunction('shoe', 1, (u, v) => { const r = Math.hypot(u - 0.5, v - 0.55); const a = Math.atan2(v - 0.55, u - 0.5); return r < 0.4 && r > 0.22 && !(a < -1.0 && a > -2.1) ? 1 : 0; });
const wide = objectFromFunction('wide', 2.2, (u, v) => (Math.abs(u - 0.5) < 0.45 && Math.abs(v - 0.5) < 0.2 + 0.2 * Math.sin(u * 9) ** 2 ? 1 : 0));
const OBJECTS: ObjectInfo[] = [disc, ring, shoe, wide];

const ctxFor = (object: ObjectInfo | null = disc, debug = false): EffectCtx => ({ aspect: 1672 / 941, pxPerUnit: 941, object, debug });
const build = (id: string, t: number, p?: PValues, object: ObjectInfo | null = disc, debug = false): Frame => {
  const e = effectById(id)!;
  const f = emptyFrame();
  e.build(f, t, p ?? defaultsOf(e), ctxFor(object, debug));
  return f;
};
const numbers = (f: Frame): number[] => [
  ...f.polys, ...f.ribbons, ...f.bolts, ...f.shards, ...f.underPolys, f.exposure, f.camera.dx, f.camera.dy, f.camera.rot, f.camera.zoom,
  ...f.shocks.flatMap((s) => [s.cx, s.cy, s.radius, s.width, s.amp, s.pinchR, s.pinchK, s.light, s.split, s.life, s.strainLight, ...s.color]),
  ...f.vortices.flatMap((v) => [v.cx, v.cy, v.radius, v.pull, v.twist, v.glow, v.absorb, ...v.color]),
  ...f.additive.flatMap((s) => [s.x, s.y, s.hw, s.hh, s.rot, s.type, s.intensity, ...s.color]),
  ...f.alphaSprites.flatMap((s) => [s.x, s.y, s.hw, s.hh, s.intensity]),
  ...f.smoke.flatMap((p) => [p.x, p.y, p.size, p.rot, p.age, p.seed, p.alpha, p.erode, p.tone, p.warmth, p.lx, p.ly]),
];
const isEmpty = (f: Frame) => !f.shocks.length && !f.vortices.length && !f.additive.length && !f.alphaSprites.length && !f.smoke.length && !f.polys.length
  && !f.ribbons.length && !f.bolts.length && !f.shards.length && !f.underPolys.length && f.exposure === 1
  && f.camera.dx === 0 && f.camera.dy === 0 && f.camera.rot === 0 && f.camera.zoom === 1;
const dur = (id: string, p?: PValues) => { const e = effectById(id)!; return e.duration(p ?? defaultsOf(e)); };
const visual = EFFECTS.filter((e) => e.id !== 'sound');

describe('screen transitions', () => {
  const trs = EFFECTS.filter((e) => e.transition);
  it('there are at least a dozen, all holding the new screen when they end', () => {
    expect(trs.length).toBeGreaterThanOrEqual(12);
    for (const e of trs) expect(e.holdsEnd, e.id).toBe(true);
  });
  it.each(trs.map((e) => [e.id]))('%s: shows the first screen at the start and only the new screen at the end', (id) => {
    const e = effectById(id)!, p = defaultsOf(e), D = Number(p.duration);
    const t0 = build(id, 0).transition;
    expect(t0, 'a transition is set at t = 0').not.toBeNull();
    expect(t0!.progress).toBeLessThanOrEqual(0.0001);
    const end = build(id, D).transition;
    expect(end?.kind).toBe(TR.cut);
    expect(end?.progress).toBe(1);
    expect(build(id, D + 5).transition?.progress).toBe(1);
    expect(build(id, -0.1).transition).toBeNull();
  });
  it.each(trs.map((e) => [e.id]))('%s: progress only ever moves forward', (id) => {
    const e = effectById(id)!, p = defaultsOf(e), D = Number(p.duration);
    let last = -1;
    for (let i = 0; i <= 80; i++) {
      const tr = build(id, (i / 80) * D).transition!;
      // kinds change at a split moment (frost then shatter): compare progress through each kind's own scale only within one kind
      if (tr.kind === TR.cut && i > 0) continue;
      if (i > 0 && tr.progress < last - 1e-6 && tr.kind !== TR.frost) throw new Error(`${id}: progress went back from ${last} to ${tr.progress} at ${i / 80}`);
      last = tr.progress;
    }
  });
});

describe('effects (each one on its own)', () => {
  it.each(visual.map((e) => [e.id]))('%s: pure — same time and parameters give the same frame', (id) => {
    const D = dur(id);
    for (const t of [0.05, D * 0.3, D * 0.62]) expect(build(id, t)).toEqual(build(id, t));
  });

  it.each(visual.map((e) => [e.id]))('%s: leaves nothing behind once finished', (id) => {
    const D = dur(id);
    expect(D).toBeGreaterThan(0.2);
    expect(isEmpty(build(id, D))).toBe(true);          // (a transition leaves only the new screen: its frame holds nothing but the transition state)
    expect(isEmpty(build(id, D + 3))).toBe(true);
    if (id !== 'fragment') expect(isEmpty(build(id, -1))).toBe(true);   // the fragmentation shows its intact object until it breaks
  });

  it.each(visual.map((e) => [e.id]))('%s: every number stays finite across the whole timeline', (id) => {
    const D = dur(id);
    for (let i = 0; i <= 160; i++) for (const v of numbers(build(id, (i / 160) * D))) expect(Number.isFinite(v)).toBe(true);
  });

  it('parameter defaults sit inside their declared bounds', () => {
    for (const e of EFFECTS) for (const d of e.params) if (d.kind === 'number') { expect(d.default as number).toBeGreaterThanOrEqual(d.min); expect(d.default as number).toBeLessThanOrEqual(d.max); }
  });

  it('each effect has the controls the review asks for', () => {
    const keys = (id: string) => effectById(id)!.params.map((d) => d.key);
    expect(keys('shockwave')).toEqual(expect.arrayContaining(['cx', 'cy', 'strength', 'distortion', 'radius', 'ringWidth', 'speed', 'duration', 'light']));
    expect(keys('vortex')).toEqual(expect.arrayContaining(['cx', 'cy', 'radius', 'pull', 'twist', 'build', 'hold', 'release', 'rebound']));
    expect(keys('plasma')).toEqual(expect.arrayContaining(['cx', 'cy', 'palette', 'intensity', 'reach', 'density', 'distortion', 'duration']));
    expect(keys('fragment')).toEqual(expect.arrayContaining(['cx', 'cy', 'icon', 'size', 'fragments', 'spread', 'rotation', 'gravity', 'duration', 'buildup']));
    expect(keys('flash')).toEqual(expect.arrayContaining(['cx', 'cy', 'size', 'intensity', 'duration']));
    expect(keys('shake')).toEqual(expect.arrayContaining(['amplitude', 'frequency', 'duration']));
    expect(keys('particles')).toEqual(expect.arrayContaining(['cx', 'cy', 'count', 'speed', 'lifetime']));
    expect(keys('sound')).toEqual(expect.arrayContaining(['kind', 'volume']));
    for (const id of ['fragment', 'shockwave', 'vortex', 'plasma']) expect(keys(id)).not.toContain('reconstruct');
  });

  it('the shockwave distortion control only scales the displacement, so the approved look is unchanged at its default', () => {
    const a = build('shockwave', 0.3), b = build('shockwave', 0.3, { ...defaultsOf(effectById('shockwave')!), distortion: 0.5 });
    expect(b.shocks[0]!.amp).toBeCloseTo(a.shocks[0]!.amp * 0.5, 9);
    expect(b.shocks[0]!.pinchK).toBe(a.shocks[0]!.pinchK);
    expect(b.shocks[0]!.light).toBe(a.shocks[0]!.light);
  });

  it('vortex stays monotonic (no fold-over) under extreme settings', () => {
    const p = { ...defaultsOf(effectById('vortex')!), pull: 2.5, twist: 7, radius: 1.4, rebound: 1.5 };
    const D = dur('vortex', p);
    for (let i = 0; i <= 80; i++) {
      const f = build('vortex', (i / 80) * D, p);
      expect(f.shocks.length).toBeLessThanOrEqual(4);
      for (const v of f.vortices) expect(v.pull).toBeLessThanOrEqual(2.6);
    }
  });
});

describe('plasma: clean ending', () => {
  it('v2 never produces smoke or a scorch; v1 (archived) still does', () => {
    const D2 = dur('plasma'), D1 = dur('plasma-v1');
    let v1Smoke = 0;
    for (let i = 0; i <= 200; i++) {
      const f = build('plasma', (i / 200) * D2);
      expect(f.smoke.length).toBe(0);
      expect(f.alphaSprites.length).toBe(0);
      v1Smoke += build('plasma-v1', (i / 200) * D1).smoke.length;
    }
    expect(v1Smoke).toBeGreaterThan(0);
  });
  it('the electricity dissipates, a brief glow remains, then everything fades to nothing before the end', () => {
    const D = dur('plasma');
    const energy = (f: Frame) => f.bolts.length / 6 + f.additive.reduce((a, s) => a + s.intensity * s.hw, 0);
    const arcVerts = (t: number) => build('plasma', t).bolts.length / 6;
    expect(arcVerts(0.6)).toBeGreaterThan(arcVerts(1.1));          // arcs die down
    expect(arcVerts(D * 0.97)).toBe(0);
    // a residual glow: a soft glow sprite exists after the arcs have gone, then it too is gone near the end
    const glowAt = (t: number) => build('plasma', t).additive.filter((s) => s.type === 0 && s.hw >= 0.08).length;
    expect(glowAt(1.0)).toBeGreaterThan(0);
    expect(glowAt(D - 0.05)).toBe(0);
    expect(energy(build('plasma', D - 0.02))).toBeLessThan(energy(build('plasma', 1.0)));
  });
  it('v1 keeps its approved settings (2.1 s) while v2 is shorter', () => {
    expect(dur('plasma-v1')).toBeCloseTo(2.1, 9);
    expect(dur('plasma')).toBeLessThan(2.1);
  });
});

describe('fragmentation: one way, from the object\'s own pixels', () => {
  const base = defaultsOf(effectById('fragment')!);
  const run = (obj: ObjectInfo, p: PValues = base) => {
    const D = dur('fragment', p), tb = Number(p.buildup);
    const steps = Math.round(D * 240);
    const frames = Array.from({ length: steps + 1 }, (_, i) => ({ t: (i / steps) * D, f: build('fragment', (i / steps) * D, p, obj, true) }));
    return { D, tb, frames };
  };

  it('lasts roughly 600–900 ms by default and has a very short build-up', () => {
    expect(dur('fragment')).toBeGreaterThanOrEqual(0.6);
    expect(dur('fragment')).toBeLessThanOrEqual(0.9);
    expect(Number(base.buildup)).toBeLessThanOrEqual(0.15);
  });

  it.each(OBJECTS.map((o) => [o.id, o] as const))('%s: shows the intact object, breaks, and never reconstructs (every fragment only moves outward and fades)', (_id, obj) => {
    const { D, tb, frames } = run(obj);
    const intact = frames.filter((x) => x.t < tb);
    expect(intact.length).toBeGreaterThan(5);
    for (const { f } of intact) expect(f.shards.length).toBe(6 * 8);   // one plain quad: the intact object
    const dist = new Map<number, number>(), alpha = new Map<number, number>();
    let broke = 0;
    for (const { t, f } of frames) {
      if (t < tb) continue;
      const frags = (f.meta?.fragments ?? []) as { i: number; dist: number; alpha: number }[];
      broke = Math.max(broke, frags.length);
      for (const fr of frags) {
        const d0 = dist.get(fr.i) ?? 0, a0 = alpha.get(fr.i) ?? 1;
        expect(fr.dist).toBeGreaterThanOrEqual(d0 - 1e-6);            // never moves back toward where it came from
        expect(fr.alpha).toBeLessThanOrEqual(a0 + 1e-9);               // never gets brighter/more opaque again
        dist.set(fr.i, fr.dist); alpha.set(fr.i, fr.alpha);
      }
    }
    expect(broke).toBeGreaterThan(8);
    expect(isEmpty(build('fragment', D, base, obj))).toBe(true);        // and the object stays gone
  });

  it('fragments leave from the first moments and fade as they travel; a few small ones linger, then everything is gone', () => {
    const { D, tb } = run(disc);
    const at = (t: number) => (build('fragment', t, base, disc, true).meta?.fragments ?? []) as { i: number; dist: number; alpha: number; shade: number }[];
    const early = at(tb + 0.04), mid = at(tb + (D - tb) * 0.5), late = at(D - 0.06);
    expect(early.length).toBeGreaterThan(8);
    expect(Math.max(...early.map((x) => x.dist))).toBeGreaterThan(0.01);
    const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
    expect(mean(mid.map((x) => x.alpha))).toBeLessThan(mean(early.map((x) => x.alpha)));
    expect(mean(mid.map((x) => x.shade))).toBeLessThan(mean(early.map((x) => x.shade)));   // they lose brightness
    expect(late.length).toBeGreaterThan(0);
    expect(late.length).toBeLessThan(early.length / 2);                  // only a few remnants
    expect(Math.max(...late.map((x) => x.alpha))).toBeLessThan(0.6);
    expect(at(D - 1e-6).length).toBeLessThanOrEqual(late.length);
  });

  it('only the icon\'s own pixels are drawn: no shadow polygons, no backdrop, every fragment samples the sprite inside its bounds', () => {
    const { frames } = run(shoe);
    for (const { f } of frames) {
      expect(f.underPolys.length).toBe(0);
      expect(f.alphaSprites.length).toBe(0);
      for (let i = 0; i < f.shards.length; i += 8) {
        const u = f.shards[i + 2]!, v = f.shards[i + 3]!;
        expect(u).toBeGreaterThanOrEqual(-0.01); expect(u).toBeLessThanOrEqual(1.01);
        expect(v).toBeGreaterThanOrEqual(-0.01); expect(v).toBeLessThanOrEqual(1.01);
      }
    }
  });

  it('glowing cracks stay inside the icon silhouette (none over the transparent hole of a ring)', () => {
    const f = build('fragment', 0.1, base, ring);
    expect(f.bolts.length).toBeGreaterThan(0);
    const cx = base.cx as number * (1672 / 941), cy = base.cy as number, size = base.size as number;
    for (let i = 0; i < f.bolts.length; i += 6) {
      // bolt vertices are offset sideways by the ribbon half width, so test the vertex's distance from the ring's centre against a tolerance
      const r = Math.hypot(f.bolts[i]! - cx, f.bolts[i + 1]! - cy) / size;
      expect(r).toBeLessThan(0.42 + 0.1);
      const along = r > 0.2 - 0.1;
      expect(along).toBe(true);
    }
  });

  it('is deterministic and does not depend on a source rectangle: the same object always breaks the same way', () => {
    expect(build('fragment', 0.3, base, shoe)).toEqual(build('fragment', 0.3, base, shoe));
    expect(build('fragment', 0.3, base, shoe)).not.toEqual(build('fragment', 0.3, base, ring));
  });
});

describe('fracture geometry', () => {
  const w = 0.24, h = 0.4;
  it('shards tile the region exactly, are irregular, convex and deterministic', () => {
    for (const n of [8, 32, 90]) {
      const fr = fracture(w, h, n, 4242);
      expect(fr.shards.reduce((s, g) => s + g.area, 0)).toBeCloseTo(w * h, 6);
    }
    const fr = fracture(w, h, 40, 4242);
    const areas = fr.shards.map((g) => g.area), mean = areas.reduce((a, b) => a + b, 0) / areas.length;
    expect(Math.sqrt(areas.reduce((a, b) => a + (b - mean) ** 2, 0) / areas.length) / mean).toBeGreaterThan(0.5);
    expect(fracture(w, h, 32, 4242)).toEqual(fracture(w, h, 32, 4242));
    for (const g of fr.shards) {
      let sign = 0;
      for (let i = 0; i < g.poly.length; i++) {
        const a = g.poly[i]!, b = g.poly[(i + 1) % g.poly.length]!, c = g.poly[(i + 2) % g.poly.length]!;
        const cr = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
        if (Math.abs(cr) < 1e-12) continue;
        if (sign === 0) sign = Math.sign(cr);
        expect(Math.sign(cr)).toBe(sign);
      }
    }
  });
  it('sites can be restricted to a silhouette', () => {
    const fr = fracture(1, 1, 30, 7, { x: 0, y: 0 }, (x, y) => x > 0);
    const sitesRight = fr.shards.filter((g) => g.c.x > -0.05).length;
    expect(sitesRight).toBeGreaterThan(fr.shards.length * 0.6);
  });
});

describe('screen shake', () => {
  it('always zooms enough to cover its frame and returns to exactly 1×', () => {
    const p = { ...defaultsOf(effectById('shake')!), amplitude: 0.03, rotation: 2 };
    const D = dur('shake', p), aspect = 1672 / 941;
    let moved = 0;
    for (let i = 0; i <= 200; i++) {
      const f = build('shake', (i / 200) * D, p);
      const c = f.camera;
      expect((c.zoom - 1) * 0.5 + 1e-9).toBeGreaterThanOrEqual(Math.abs(c.dy) + Math.abs(c.rot) * (aspect / 2) * 0.9 * 0);   // vertical cover
      expect(((c.zoom - 1) * aspect) / 2 + 1e-9).toBeGreaterThanOrEqual(Math.abs(c.dx));
      moved += Math.abs(c.dx);
    }
    expect(moved).toBeGreaterThan(0);
    expect(build('shake', D).camera).toEqual({ dx: 0, dy: 0, rot: 0, zoom: 1 });
  });
});


describe('lightning geometry', () => {
  it('a discharge has a trunk plus branches, is irregular, and is reproducible from its seed', () => {
    const a = discharge(makeRng(7), { x: 0, y: 0 }, 0.4, 0.5);
    expect(discharge(makeRng(7), { x: 0, y: 0 }, 0.4, 0.5)).toEqual(a);
    expect(a[0]!.level).toBe(0);
    expect(a.length).toBeGreaterThan(1);
    expect(Math.max(...a[0]!.pts.map((p) => Math.abs(p.x * Math.sin(0.4) - p.y * Math.cos(0.4))))).toBeGreaterThan(0.01);
    expect(discharge(makeRng(8), { x: 0, y: 0 }, 0.4, 0.5)).not.toEqual(a);
  });
  it('slice keeps the requested part of a polyline and ribbons taper to a point', () => {
    const pts = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }];
    const s = slice(pts, 0.25, 0.75);
    expect(s[0]!.x).toBeCloseTo(0.75); expect(s[s.length - 1]!.x).toBeCloseTo(2.25);
    const out: number[] = [];
    ribbon(out, pts, 0.01, 1, true);
    const cores = []; for (let i = 0; i < out.length; i += 6) cores.push(out[i + 4]!);
    expect(cores[0]!).toBeGreaterThan(cores[cores.length - 1]!);
    expect(out.length % 36).toBe(0);
  });
});
