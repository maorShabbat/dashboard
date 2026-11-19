import { describe, expect, it } from 'vitest';
import { MOTIONS, MOTION_BY_ID, IDENTITY, motionsFor, specFor, type MotionCtx } from '../src/vfx/anim/motions';
import { MotionRig, rankUnits, type RigGlyph } from '../src/vfx/anim/rig';
import { motionSpec } from '../src/vfx/model/scene';

const ctx = (over: Partial<MotionCtx> = {}): MotionCtx => ({
  i: 2, n: 5, rx: 0.4, ry: 0.1, edge: { l: 3, r: 4, t: 2, b: 5 }, amount: 1, params: {}, rnd: (k = 0) => ((k * 0.37 + 0.21) % 1), ...over,
});
const same = (a: number, b: number) => Math.abs(a - b) < 1e-6;
const isIdentity = (c: ReturnType<(typeof MOTIONS)[0]['eval']>) => same(c.dx, 0) && same(c.dy, 0) && same(c.sx, 1) && same(c.sy, 1) && same(Math.sin(c.rot), 0) && same(Math.cos(c.rot), 1) && same(c.skew, 0) && same(c.alpha, 1) && same(c.bright, 1) && same(c.glow, 1);

describe('motion registry', () => {
  it('has a full library for every slot', () => {
    expect(motionsFor('entrance').length).toBeGreaterThanOrEqual(18);
    expect(motionsFor('idle').length).toBeGreaterThanOrEqual(12);
    expect(motionsFor('emphasis').length).toBeGreaterThanOrEqual(10);
    expect(motionsFor('exit').length).toBeGreaterThanOrEqual(12);
    expect(new Set(MOTIONS.map((m) => m.id)).size).toBe(MOTIONS.length);
  });

  it('entrances end at rest; exits start at rest; emphasis starts and ends at rest', () => {
    for (const m of MOTIONS) {
      const c = ctx({ params: m.defaults.params ?? {} });
      if (m.slots.includes('entrance')) expect(isIdentity(m.eval(1, c)), `${m.id} should end at rest`).toBe(true);
      if (m.slots.includes('entrance')) { const s = m.eval(0, c); expect(s.alpha === 0 || s.sx === 0 || s.sy < 0.01 || m.id === 'typewriter' || m.id.includes('slide') , `${m.id} should start hidden`).toBe(true); }
      if (m.slots.includes('exit')) { expect(isIdentity(m.eval(0, c)), `${m.id} should start at rest`).toBe(true); }
      if (m.slots.includes('emphasis')) { expect(isIdentity(m.eval(0, c)), `${m.id} starts at rest`).toBe(true); expect(isIdentity(m.eval(1, c)), `${m.id} ends at rest`).toBe(true); }
    }
  });

  it('exits end hidden', () => {
    for (const m of motionsFor('exit')) {
      const c = m.eval(1, ctx({ params: m.defaults.params ?? {} }));
      const hidden = c.alpha < 0.05 || c.sx < 0.05 || c.sy < 0.05 || Math.abs(c.dx) > 2 || Math.abs(c.dy) > 2;
      expect(hidden, `${m.id} ends hidden`).toBe(true);
    }
  });

  it('every motion is finite over its whole range, for any amount', () => {
    for (const m of MOTIONS) for (const amount of [0, 0.5, 1, 3]) for (let k = 0; k <= 40; k++) {
      const c = m.eval(k / 40 * (m.slots.includes('idle') ? 3 : 1), ctx({ amount, params: m.defaults.params ?? {} }));
      for (const [key, v] of Object.entries(c)) expect(Number.isFinite(v), `${m.id}.${key} at ${k}`).toBe(true);
      expect(c.sx).toBeGreaterThanOrEqual(-1e-9); expect(c.sy).toBeGreaterThanOrEqual(-1e-9);
    }
  });

  it('idle loops are periodic', () => {
    for (const m of motionsFor('idle').filter((x) => !['spin', 'flicker', 'jitter', 'tremble'].includes(x.id))) {
      const c = ctx({ params: m.defaults.params ?? {} });
      const a = m.eval(0.3, c), b = m.eval(1.3, c);
      expect(same(a.dy, b.dy) && same(a.rot, b.rot) && same(a.sx, b.sx) && same(a.dx, b.dx), `${m.id} loops`).toBe(true);
    }
  });

  it('amount scales the effect and 0 removes it', () => {
    const pop = MOTION_BY_ID.get('rise-letters')!;
    expect(Math.abs(pop.eval(0.3, ctx({ amount: 2 })).dy)).toBeGreaterThan(Math.abs(pop.eval(0.3, ctx({ amount: 1 })).dy));
    const wob = MOTION_BY_ID.get('wobble')!;
    expect(wob.eval(0.25, ctx({ amount: 0 })).rot).toBe(0);
  });
});

describe('stagger order', () => {
  it('ranks units forward, reverse, from the centre, from the edges and randomly (a permutation)', () => {
    expect(rankUnits('forward', 5, 1)).toEqual([0, 1, 2, 3, 4]);
    expect(rankUnits('reverse', 5, 1)).toEqual([4, 3, 2, 1, 0]);
    expect(rankUnits('center', 5, 1)[2]).toBe(0);
    expect(rankUnits('edges', 5, 1)[2]).toBe(4);
    const r = rankUnits('random', 8, 3);
    expect([...r].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(rankUnits('random', 8, 3)).toEqual(r);
  });
});

const glyphs = (n: number): RigGlyph[] => Array.from({ length: n }, (_, i) => ({ cx: (i - (n - 1) / 2) * 0.1, cy: 0, line: 0, word: 0 }));
const rig = (motion: Parameters<typeof MotionRig.prototype.state> extends never ? never : ConstructorParameters<typeof MotionRig>[0]['motion'], over = {}) =>
  new MotionRig({ motion, glyphs: glyphs(5), ref: 0.2, seed: 5, aspect: 16 / 9, ex: 0.89, ey: 0.5, es: 1, er: 0, opacity: 1, ...over });

describe('motion rig', () => {
  it('without motion, a glyph sits at the element position', () => {
    const r = rig({});
    const s = r.state(1, 2);
    expect(s.px).toBeCloseTo(0.89, 6); expect(s.py).toBeCloseTo(0.5, 6);
    expect(s).toMatchObject({ rot: 0, sx: 1, sy: 1, alpha: 1 });
  });

  it('applies the element transform (scale, rotation, opacity) around the element centre', () => {
    const r = rig({}, { es: 2, er: Math.PI / 2, opacity: 0.5 });
    const first = r.state(0, 0), last = r.state(0, 4);
    // glyphs spread along x by 0.1 each; rotated 90° they spread along y, twice as far
    expect(last.py - first.py).toBeCloseTo(0.4 * 2, 5);
    expect(first.sx).toBeCloseTo(2, 5);
    expect(first.rot).toBeCloseTo(Math.PI / 2, 5);
    expect(first.alpha).toBe(0.5);
  });

  it('an entrance keeps letters hidden until their turn and staggers them', () => {
    const r = rig({ entrance: motionSpec('typewriter', { unit: 'char', stagger: 0.1, duration: 0.1 }) });
    expect(r.state(0.05, 0).alpha).toBe(1);
    expect(r.state(0.05, 3).alpha).toBe(0);
    expect(r.state(0.45, 3).alpha).toBe(1);
    expect(r.state(1, 4).alpha).toBe(1);
  });

  it('entrance, idle, emphasis and exit are independent layers that combine', () => {
    const motion = {
      entrance: specFor('slide-up', { duration: 0.4, params: { distance: 1 } }),
      idle: specFor('float', { start: 0.4 }),
      emphasis: [specFor('emph-pulse', { start: 1, duration: 0.4 })],
      exit: specFor('fade-out', { start: 3, duration: 0.5 }),
    };
    const r = rig(motion);
    expect(r.state(0, 0).alpha).toBe(0);                                  // before the entrance: hidden
    expect(r.state(0.2, 0).py).toBeGreaterThan(0.5);                      // still sliding up from below
    const settled = r.state(0.9, 0);
    expect(settled.alpha).toBe(1);
    expect(r.state(1.2, 0).sx).toBeGreaterThan(1.05);                     // emphasis swell
    expect(r.state(1.2, 0).py).not.toBeCloseTo(settled.py, 4);            // idle float is still running underneath
    expect(r.state(3.25, 0).alpha).toBeLessThan(1);
    expect(r.state(3.6, 0).alpha).toBe(0);
    expect(r.exitEnd()).toBeCloseTo(3.5, 6);
  });

  it('per-letter and whole-block layers use their own pivots', () => {
    const r = rig({ idle: specFor('wobble', { unit: 'block', params: { angle: 0.3 }, duration: 1 }) });
    const a = r.state(0.25 + 0.35, 0), b = r.state(0.25 + 0.35, 4);        // quarter cycle after the ramp-in
    expect(a.rot).toBeCloseTo(b.rot, 6);                                   // the whole block turns as one
    expect(a.py).not.toBeCloseTo(b.py, 4);                                 // so the outer letters swing up and down
  });

  it('is deterministic', () => {
    const m = { entrance: specFor('scatter-in', { unit: 'char', order: 'random' as const }) };
    const a = rig(m), b = rig(m);
    for (let g = 0; g < 5; g++) expect(a.state(0.2, g)).toEqual(b.state(0.2, g));
  });
});

void IDENTITY;
