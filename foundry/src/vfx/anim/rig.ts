/**
 * The motion rig: evaluates an element's four motion layers (entrance, idle, emphasis, exit) for every glyph (or the whole element)
 * and composes them with the element's own transform into one placement per glyph. Each layer works on its own unit (block / line /
 * word / character) around that unit's own pivot, so a per-letter entrance and a whole-block idle sway coexist.
 */
import type { Motion, MotionSlot, MotionSpec, MotionUnit, StaggerOrder } from '../model/scene';
import { clamp01, hash, smooth } from './easing';
import { IDENTITY, MOTION_BY_ID, type Contribution, type MotionCtx, type MotionDef } from './motions';

/** One drawable piece (a glyph, or the whole element). Positions are scene units relative to the element's centre. */
export interface RigGlyph { cx: number; cy: number; line: number; word: number }

export interface GlyphState {
  /** World position (scene units) the glyph's pivot ends up at. */
  px: number; py: number;
  rot: number; sx: number; sy: number; skew: number;
  alpha: number; bright: number; glow: number;
}

interface SlotRig {
  spec: MotionSpec;
  def: MotionDef;
  slot: MotionSlot;
  /** Unit index of each glyph, unit count, unit pivots and stagger ranks. */
  unitOf: number[];
  count: number;
  pivots: { x: number; y: number }[];
  rank: number[];
}

export function rankUnits(order: StaggerOrder, n: number, seed: number): number[] {
  const idx = Array.from({ length: n }, (_, i) => i);
  switch (order) {
    case 'reverse': return idx.map((i) => n - 1 - i);
    case 'center': {
      const mid = (n - 1) / 2;
      const sorted = [...idx].sort((a, b) => Math.abs(a - mid) - Math.abs(b - mid) || a - b);
      const r = new Array<number>(n); sorted.forEach((u, k) => { r[u] = k; }); return r;
    }
    case 'edges': {
      const mid = (n - 1) / 2;
      const sorted = [...idx].sort((a, b) => Math.abs(b - mid) - Math.abs(a - mid) || a - b);
      const r = new Array<number>(n); sorted.forEach((u, k) => { r[u] = k; }); return r;
    }
    case 'random': {
      const sorted = [...idx].sort((a, b) => hash(seed * 31 + a) - hash(seed * 31 + b));
      const r = new Array<number>(n); sorted.forEach((u, k) => { r[u] = k; }); return r;
    }
    default: return idx;
  }
}

function unitAssignment(glyphs: RigGlyph[], unit: MotionUnit): { unitOf: number[]; count: number } {
  if (unit === 'block' || glyphs.length <= 1) return { unitOf: glyphs.map(() => 0), count: 1 };
  if (unit === 'char') return { unitOf: glyphs.map((_, i) => i), count: glyphs.length };
  const key = (g: RigGlyph) => (unit === 'line' ? g.line : g.word);
  const keys = [...new Set(glyphs.map(key))].sort((a, b) => a - b);
  const pos = new Map(keys.map((k, i) => [k, i]));
  return { unitOf: glyphs.map((g) => pos.get(key(g))!), count: keys.length };
}

const SLOT_ORDER: MotionSlot[] = ['entrance', 'idle', 'emphasis', 'exit'];

export interface RigOptions {
  motion: Motion;
  glyphs: RigGlyph[];
  /** Scene units in one em of this element (its size). */
  ref: number;
  seed: number;
  aspect: number;
  /** Element placement: centre in scene units, scale, rotation (rad). */
  ex: number; ey: number; es: number; er: number;
  /** Element opacity. */
  opacity: number;
}

export class MotionRig {
  private slots: SlotRig[] = [];
  private lastEnd = 0;
  constructor(private o: RigOptions) {
    const specs: [MotionSlot, MotionSpec | undefined][] = [
      ['entrance', o.motion.entrance], ['idle', o.motion.idle], ['emphasis', undefined], ['exit', o.motion.exit],
    ];
    const list: { slot: MotionSlot; spec: MotionSpec }[] = [];
    for (const [slot, spec] of specs) if (spec) list.push({ slot, spec });
    for (const e of o.motion.emphasis ?? []) list.push({ slot: 'emphasis', spec: e });
    list.sort((a, b) => SLOT_ORDER.indexOf(a.slot) - SLOT_ORDER.indexOf(b.slot));
    for (const { slot, spec } of list) {
      const def = MOTION_BY_ID.get(spec.id);
      if (!def) continue;
      const { unitOf, count } = unitAssignment(o.glyphs, spec.unit);
      const sums = Array.from({ length: count }, () => ({ x: 0, y: 0, n: 0 }));
      o.glyphs.forEach((g, i) => { const s = sums[unitOf[i]!]!; s.x += g.cx; s.y += g.cy; s.n++; });
      const pivots = sums.map((s) => ({ x: s.n ? s.x / s.n : 0, y: s.n ? s.y / s.n : 0 }));
      this.slots.push({ spec, def, slot, unitOf, count, pivots, rank: rankUnits(spec.order, count, o.seed) });
      const lastRank = Math.max(0, count - 1);
      const end = spec.start + (spec.stagger || 0) * lastRank + spec.duration;
      if (slot !== 'idle') this.lastEnd = Math.max(this.lastEnd, end);
    }
  }

  /** Seconds after the element appears at which its last entrance / emphasis / exit has finished. */
  get motionEnd(): number { return this.lastEnd; }
  /** Seconds at which the exit (if any) has finished. */
  exitEnd(): number {
    let e = 0;
    for (const s of this.slots) if (s.slot === 'exit') e = Math.max(e, s.spec.start + s.spec.stagger * Math.max(0, s.count - 1) + s.spec.duration);
    return e;
  }

  private contribution(s: SlotRig, t: number, gi: number): Contribution | null {
    const ui = s.unitOf[gi]!;
    const tt = t - s.spec.start - s.rank[ui]! * s.spec.stagger;
    const o = this.o;
    const g = o.glyphs[gi]!;
    const pv = s.pivots[ui]!;
    const X = o.ex + pv.x, Y = o.ey + pv.y;
    const ctx: MotionCtx = {
      i: ui, n: s.count, rx: pv.x / o.ref, ry: pv.y / o.ref,
      edge: { l: X / o.ref, r: (o.aspect - X) / o.ref, t: Y / o.ref, b: (1 - Y) / o.ref },
      amount: s.spec.amount, params: s.spec.params,
      rnd: (k = 0) => hash(o.seed * 1009 + ui * 131 + k * 977 + (g.line + 1) * 7),
    };
    void g;
    if (s.slot === 'idle') {
      if (tt < 0) return null;
      const cycles = tt / Math.max(0.05, s.spec.duration);
      if (s.spec.repeat && cycles > s.spec.repeat) return null;
      const c = clampC(s.def.eval(cycles, ctx));
      const ramp = smooth(0, 0.35, tt);
      return ramp >= 1 ? c : blend(c, ramp);
    }
    const u = clamp01(tt / Math.max(0.01, s.spec.duration));
    return clampC(s.def.eval(u, ctx));
  }

  /** Placement and style multipliers of glyph `gi` at element time `t` (seconds since the element appeared). */
  state(t: number, gi: number): GlyphState {
    const o = this.o;
    const g = o.glyphs[gi]!;
    let l11 = 1, l12 = 0, l21 = 0, l22 = 1;
    let px = g.cx, py = g.cy;
    let alpha = 1, bright = 1, glow = 1;
    for (const s of this.slots) {
      const c = this.contribution(s, t, gi);
      if (!c) continue;
      const pv = s.pivots[s.unitOf[gi]!]!;
      // M = R · [[sx, sx·k], [0, sy]]
      const cs = Math.cos(c.rot), sn = Math.sin(c.rot);
      const m11 = cs * c.sx, m12 = cs * c.sx * c.skew - sn * c.sy, m21 = sn * c.sx, m22 = sn * c.sx * c.skew + cs * c.sy;
      const dx = px - pv.x, dy = py - pv.y;
      px = pv.x + m11 * dx + m12 * dy + c.dx * o.ref;
      py = pv.y + m21 * dx + m22 * dy + c.dy * o.ref;
      const n11 = m11 * l11 + m12 * l21, n12 = m11 * l12 + m12 * l22, n21 = m21 * l11 + m22 * l21, n22 = m21 * l12 + m22 * l22;
      l11 = n11; l12 = n12; l21 = n21; l22 = n22;
      alpha *= c.alpha; bright *= c.bright; glow *= c.glow;
    }
    // element transform: scale, rotate, place
    const ce = Math.cos(o.er) * o.es, se = Math.sin(o.er) * o.es;
    const wx = o.ex + ce * px - se * py, wy = o.ey + se * px + ce * py;
    const e11 = ce * l11 - se * l21, e12 = ce * l12 - se * l22, e21 = se * l11 + ce * l21, e22 = se * l12 + ce * l22;
    // decompose L = R(θ) · [[sx, sx·k], [0, sy]]
    const sx = Math.hypot(e11, e21) || 1e-4;
    const rot = Math.atan2(e21, e11);
    const cr = Math.cos(rot), sr = Math.sin(rot);
    const u12 = cr * e12 + sr * e22, u22 = -sr * e12 + cr * e22;
    return { px: wx, py: wy, rot, sx, sy: Math.max(1e-4, u22), skew: u12 / sx, alpha: clamp01(alpha) * o.opacity, bright, glow };
  }
}

const clampC = (c: Contribution): Contribution => { if (c.sx < 0) c.sx = 0; if (c.sy < 0) c.sy = 0; return c; };

function blend(c: Contribution, k: number): Contribution {
  const m = (a: number, b: number) => a + (b - a) * k;
  return {
    dx: c.dx * k, dy: c.dy * k, sx: m(1, c.sx), sy: m(1, c.sy), rot: c.rot * k, skew: c.skew * k,
    alpha: m(1, c.alpha), bright: m(1, c.bright), glow: m(1, c.glow),
  };
}

export { IDENTITY };
