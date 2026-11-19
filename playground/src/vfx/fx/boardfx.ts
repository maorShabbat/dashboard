/**
 * Effects that follow a reel board's events: a symbol landing, the reels building anticipation, the winning line, sticky auras, a wild
 * expanding, light trails collecting into a meter, winners popping. They are aimed at a board element and read its geometry and event
 * times, so they stay in step with whatever spin, pattern and timing the board is set to.
 */
import { color, enm, num } from '../../core/params';
import type { BoardEvent } from '../model/board';
import { FIRE_PALETTES, type Frame, type RGB } from '../engine/frame';
import { ribbon } from '../engine/lightning';
import { clamp, easeInOutCubic, easeOutCubic, easeOutQuart, h1, hex, lerp, mixRGB, smoothstep } from '../engine/math';
import { n, s, type BoardInfo, type EffectCtx, type PValues, type ShowEffect } from './effect';
import { ellipsePoly, quadPoly } from './helpers';
import { flame, setVolPalette } from './volume';

const G = (group: string) => ({ section: 'Effect', group });
const durP = (def = 8) => num('duration', 'Length', G('Timing'), def, 1, 30, 0.01, 's', 'How long the effect runs (it should cover the board\'s whole sequence).');
const strengthP = (def = 1) => num('strength', 'Strength', G('Look'), def, 0.2, 2.5, 0.01, 'x', 'How big and bright it is.');
const ROLE: Record<string, RGB> = { scatter: [1, 0.82, 0.3], wild: [0.4, 1, 0.5], bonus: [0.78, 0.45, 1], normal: [0.9, 0.95, 1] };

export const events = (ctx: EffectCtx, kind: BoardEvent['kind']): BoardEvent[] => (ctx.board?.events ?? []).filter((e) => e.kind === kind);
/** Seconds on this effect's own clock for an event. */
export const at = (ctx: EffectCtx, e: BoardEvent): number => e.t - (ctx.start ?? 0);
const until = (ctx: EffectCtx, e: BoardEvent, fallback: number): number => (e.until !== undefined ? e.until - (ctx.start ?? 0) : fallback);
const stops = (ctx: EffectCtx): number[] => { const out: number[] = []; for (const e of events(ctx, 'reel-stop')) out[e.reel!] = at(ctx, e); return out; };
const bell = (u: number) => Math.sin(Math.PI * clamp(u));

const sparks = (f: Frame, x: number, y: number, u: number, col: RGB, count: number, reach: number, seed: number, intensity = 1): void => {
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + h1(seed + i) * 0.5, d = reach * easeOutCubic(u) * (0.6 + 0.6 * h1(seed + i * 3)), len = reach * 0.35 * (1 - u * 0.6);
    f.additive.push({ x: x + Math.cos(a) * d, y: y + Math.sin(a) * d + 0.05 * u * u, hw: len, hh: 0.004, rot: a, type: 4, color: col, intensity: intensity * (1 - smoothstep(0.3, 1, u)), e1: 1.5 });
  }
};

// ---------------------------------------------------------------------------------------------------------------------

export const landing: ShowEffect = {
  id: 'board.landing', name: 'Landing impacts', tagline: 'A scatter, wild or bonus symbol slams into its cell with a ring, a flash, sparks and a jolt; optionally every reel stop gets a thud of dust.', category: 'candidate', usesBoard: true,
  params: [enm('which', 'Impact on', G('Look'), 'specials', [['specials', 'Scatter, wild and bonus symbols'], ['all', 'Every reel stop too']], 'Which landings get an impact.'), strengthP(), num('shake', 'Screen jolt', G('Look'), 1, 0, 3, 0.01, 'x', 'How hard the picture jolts when a special symbol lands.'), durP(8)],
  duration: (p) => n(p, 'duration'), impactAt: () => 0,
  cues: (p) => [{ t: 1.4, kind: 'thump', gain: 0.8, pitch: 1.2 }, { t: 1.7, kind: 'thump', gain: 0.8, pitch: 1.1 }, { t: 2.0, kind: 'thump', gain: 0.9, pitch: 1 }, ...(s(p, 'which') === 'all' ? [{ t: 1.1, kind: 'tick' as const, gain: 0.4, pitch: 0.9 }] : [])],
  build(f, t, p, ctx) {
    const b = ctx.board, D = n(p, 'duration');
    if (!b || t < 0 || t >= D) return;
    const k = n(p, 'strength'), sh = n(p, 'shake');
    for (const e of events(ctx, 'land')) {
      const u = (t - at(ctx, e)) / 0.9;
      if (u < 0 || u > 1) continue;
      const [r, c] = e.cells![0]!, ctr = b.cellCenter(r, c), col = ROLE[e.role ?? 'normal'] ?? ROLE.normal!, big = e.role === 'scatter' ? 1.3 : 1;
      const R = b.cell * (0.5 + 1.3 * easeOutQuart(u / 0.55)) * k * big;
      f.additive.push({ x: ctr.x, y: ctr.y, hw: R, hh: R, rot: 0, type: 1, color: col, intensity: 1.1 * (1 - smoothstep(0, 0.6, u)), e1: 0.09 });
      f.additive.push({ x: ctr.x, y: ctr.y, hw: b.cell * 0.9 * k, hh: b.cell * 0.9 * k, rot: 0, type: 3, color: col, intensity: 1.4 * Math.exp(-u * 12) });
      if (e.role === 'scatter') f.additive.push({ x: ctr.x, y: ctr.y, hw: b.cell * 1.6, hh: b.cell * 1.6, rot: 0.3, type: 2, color: col, intensity: 1.1 * Math.exp(-u * 7) });
      sparks(f, ctr.x, ctr.y, u, col, 10, b.cell * 1.3 * k, r * 11 + c * 3, 1.1);
      const j = 0.007 * sh * big * Math.exp(-u * 8);
      f.camera.dx += Math.sin(u * 80) * j; f.camera.dy += Math.cos(u * 71) * j;
    }
    if (s(p, 'which') === 'all') {
      for (const e of events(ctx, 'reel-stop')) {
        const u = (t - at(ctx, e)) / 0.6;
        if (u < 0 || u > 1) continue;
        const c = e.reel!, ctr = b.cellCenter(b.rows - 1, c), y = b.box.y1;
        for (let i = 0; i < 6; i++) f.alphaSprites.push({ x: ctr.x + (i - 2.5) * b.cell * 0.2, y: y - 0.01, hw: 0.02 + 0.03 * u, hh: 0.018 + 0.02 * u, rot: 0, type: 5, color: [0.7, 0.66, 0.6], intensity: 0.5 * (1 - u) ** 1.4, e2: i + c * 7 });
        f.camera.dy += Math.sin(u * 60) * 0.0025 * sh * Math.exp(-u * 8);
      }
    }
  },
};

export const anticipation: ShowEffect = {
  id: 'board.anticipation', name: 'Anticipation', tagline: 'When the reels slow down for a possible third scatter, the reel that is still spinning glows and burns with a flame rim, pulsing faster until it stops.', category: 'candidate', usesBoard: true,
  params: [enm('fire', 'Flame colour', G('Look'), 'fire', [['fire', 'Orange fire'], ['blue', 'Blue flame'], ['green', 'Green fire'], ['violet', 'Violet fire'], ['white', 'White-hot']], 'The colour of the flame rim.'), color('tint', 'Glow', G('Look'), '#ffd24a', 'Colour of the glow around the reel.'), strengthP(), num('flames', 'Flame tongues', G('Look'), 4, 0, 10, 1, 'count', 'Flames along each side of the reel.', true), durP(8)],
  duration: (p) => n(p, 'duration'), impactAt: () => 0,
  cues: () => [{ t: 1.5, kind: 'rumble', gain: 0.6, dur: 1.6, pitch: 0.8 }, { t: 1.5, kind: 'sweep', gain: 0.4, dur: 1.8, pitch: 1.6 }],
  build(f, t, p, ctx) {
    const b = ctx.board, D = n(p, 'duration');
    if (!b || t < 0 || t >= D) return;
    const ant = events(ctx, 'anticipation')[0];
    if (!ant) return;
    const st = stops(ctx), glow = hex(s(p, 'tint')), k = n(p, 'strength'), nf = Math.round(n(p, 'flames') * Math.max(0.3, ctx.quality ?? 1));
    setVolPalette(f, s(p, 'fire'), 'black');
    const H = b.box.y1 - b.box.y0;
    for (let c = ant.reel!; c < b.cols; c++) {
      const w0 = c === ant.reel ? at(ctx, ant) : st[c - 1] ?? at(ctx, ant), w1 = st[c] ?? w0 + 1;
      if (t < w0 || t > w1 + 0.4) continue;
      const rise = smoothstep(0, 0.3, t - w0), fade = 1 - smoothstep(0, 0.35, t - w1), kk = rise * fade;
      const prog = clamp((t - w0) / Math.max(0.2, w1 - w0)), pulse = 0.7 + 0.3 * Math.sin(t * (7 + 14 * prog));
      const x = b.cellCenter(0, c).x, cy = (b.box.y0 + b.box.y1) / 2;
      f.additive.push({ x, y: cy, hw: b.cell * 0.8, hh: H * 0.58, rot: 0, type: 0, color: glow, intensity: 0.5 * kk * pulse * k, e1: 1.1 });
      for (const side of [-1, 1]) {
        const ex = x + side * b.cell * 0.52;
        f.additive.push({ x: ex, y: cy, hw: H * 0.5, hh: 0.006 * k, rot: Math.PI / 2, type: 4, color: mixRGB(glow, [1, 1, 1], 0.4), intensity: 0.9 * kk * pulse, e1: 3 });
        for (let i = 0; i < nf; i++) {
          const hh = h1(c * 97 + i * 13 + (side > 0 ? 5 : 0)), tl = t + hh * 7, ph = 0.5 + 0.5 * Math.sin(tl * (6 + 4 * hh));
          flame(f, { x: ex + (hh - 0.5) * 0.02, y: b.box.y1 - (i / Math.max(1, nf)) * H * 0.2, w: b.cell * 0.34, h: H * lerp(0.28, 0.5, hh) * (0.6 + 0.4 * ph) * kk * k, age: 0.1 + 0.25 * hh, seed: c * 7 + i * 3.1 + side, t: tl, heat: 1, alpha: 1, rot: side * 0.1 });
        }
      }
      for (let i = 0; i < 10; i++) {
        const hh = h1(c * 31 + i * 7), ph = (((t * (0.8 + hh) + hh) % 1) + 1) % 1;
        f.additive.push({ x: x + (hh - 0.5) * b.cell * 0.8, y: b.box.y1 - ph * H, hw: 0.012, hh: 0.012, rot: 0, type: 0, color: mixRGB(glow, [1, 1, 1], 0.4), intensity: 1.1 * kk * (1 - ph), e1: 2 });
      }
    }
  },
};

/** The winning cells in the order of the line (by reel, then row). */
const ordered = (cells: [number, number][]): [number, number][] => [...cells].sort((a, c) => a[1] - c[1] || a[0] - c[0]);

export const winLine: ShowEffect = {
  id: 'board.winline', name: 'Win line and spotlight', tagline: 'A glowing line is drawn through the winning symbols, light pools on each of them and a bright head runs along the line.', category: 'candidate', usesBoard: true,
  params: [color('tint', 'Line colour', G('Look'), '#ffe27a', 'Colour of the glow.'), num('width', 'Line width', G('Look'), 1, 0.3, 3, 0.01, 'x', 'Thickness of the line.'), enm('connect', 'Connect', G('Look'), 'line', [['line', 'Draw a line through them'], ['rings', 'Rings only, no line']], 'Whether the winning symbols are joined by a line.'), strengthP(), num('hold', 'Keep for', G('Timing'), 2.4, 0.5, 8, 0.01, 's', 'How long the line stays when nothing ends the win.'), durP(8)],
  duration: (p) => n(p, 'duration'), impactAt: () => 0,
  cues: () => [{ t: 3.2, kind: 'sweep', gain: 0.5, dur: 0.6, pitch: 1.8 }, { t: 3.7, kind: 'thump', gain: 0.5, pitch: 1.4 }],
  build(f, t, p, ctx) {
    const b = ctx.board, D = n(p, 'duration');
    if (!b || t < 0 || t >= D) return;
    const col = hex(s(p, 'tint')), k = n(p, 'strength'), w = n(p, 'width'), pops = events(ctx, 'pop').map((e) => at(ctx, e));
    f.boltCore = [1, 1, 1]; f.boltGlow = col;
    for (const e of events(ctx, 'win')) {
      const t0 = at(ctx, e), nextPop = pops.find((x) => x > t0), end = nextPop !== undefined ? nextPop + 0.1 : t0 + n(p, 'hold');
      if (t < t0 || t > end) continue;
      const u = t - t0, fade = 1 - smoothstep(end - 0.35, end, t), cells = ordered(e.cells as [number, number][]);
      const pts = cells.map(([r, c]) => b.cellCenter(r, c));
      const grow = clamp(u / 0.55), pulse = 0.75 + 0.25 * Math.sin(u * 8);
      if (s(p, 'connect') === 'line' && pts.length >= 2) {
        const total = pts.reduce((a, q, i) => (i ? a + Math.hypot(q.x - pts[i - 1]!.x, q.y - pts[i - 1]!.y) : 0), 0), head = total * easeInOutCubic(grow);
        const path: { x: number; y: number }[] = [pts[0]!]; let acc = 0;
        for (let i = 1; i < pts.length; i++) {
          const a = pts[i - 1]!, q = pts[i]!, seg = Math.hypot(q.x - a.x, q.y - a.y);
          if (acc + seg <= head) { path.push(q); acc += seg; } else { const m = (head - acc) / Math.max(1e-6, seg); path.push({ x: a.x + (q.x - a.x) * m, y: a.y + (q.y - a.y) * m }); break; }
        }
        if (path.length >= 2) ribbon(f.bolts, path, 0.0055 * w, 1.1 * fade * pulse, false);
        const hp = path[path.length - 1]!;
        if (grow < 1) f.additive.push({ x: hp.x, y: hp.y, hw: b.cell * 0.45, hh: b.cell * 0.45, rot: 0, type: 3, color: col, intensity: 1.4 * fade });
        else { const ph = ((u * 0.9) % 1 + 1) % 1, target = total * ph; let a2 = 0; for (let i = 1; i < pts.length; i++) { const a = pts[i - 1]!, q = pts[i]!, seg = Math.hypot(q.x - a.x, q.y - a.y); if (a2 + seg >= target) { const m = (target - a2) / Math.max(1e-6, seg); f.additive.push({ x: a.x + (q.x - a.x) * m, y: a.y + (q.y - a.y) * m, hw: b.cell * 0.32, hh: b.cell * 0.32, rot: 0, type: 3, color: [1, 1, 1], intensity: 1 * fade }); break; } a2 += seg; } }
      }
      cells.forEach(([r, c], i) => {
        const ctr = b.cellCenter(r, c), appear = smoothstep(0, 0.25, u - (i / Math.max(1, cells.length)) * 0.4);
        f.additive.push({ x: ctr.x, y: ctr.y, hw: b.cell * 0.95 * k, hh: b.cell * 0.95 * k, rot: 0, type: 0, color: col, intensity: 0.6 * appear * fade * pulse, e1: 1.2 });
        f.additive.push({ x: ctr.x, y: ctr.y, hw: b.cell * (0.62 + 0.05 * Math.sin(u * 7 + i)), hh: b.cell * (0.62 + 0.05 * Math.sin(u * 7 + i)), rot: 0, type: 1, color: col, intensity: 0.8 * appear * fade, e1: 0.07 });
        if (u > 0.3) f.additive.push({ x: ctr.x - b.cell * 0.2, y: ctr.y - b.cell * 0.25, hw: b.cell * 0.4, hh: b.cell * 0.4, rot: 0.3, type: 2, color: [1, 1, 1], intensity: 0.6 * fade * (0.5 + 0.5 * Math.sin(u * 5 + i * 2)) });
      });
    }
  },
};

export const stickyAura: ShowEffect = {
  id: 'board.sticky', name: 'Sticky aura', tagline: 'Wild or bonus symbols that stay on the board keep a living aura: a breathing halo, a ring and sparks that circle them.', category: 'candidate', usesBoard: true,
  params: [enm('roles', 'On', G('Look'), 'both', [['wild', 'Wild symbols'], ['bonus', 'Bonus symbols'], ['both', 'Wild and bonus']], 'Which kinds of symbol get the aura.'), color('tint', 'Colour', G('Look'), '#7dff8a', 'Colour of the aura (wild; bonus symbols use violet).'), strengthP(), durP(8)],
  duration: (p) => n(p, 'duration'), impactAt: () => 0,
  cues: () => [{ t: 2.2, kind: 'tick', gain: 0.3, pitch: 2.4 }],
  build(f, t, p, ctx) {
    const b = ctx.board, D = n(p, 'duration');
    if (!b || t < 0 || t >= D) return;
    const want = s(p, 'roles'), k = n(p, 'strength'), wildCol = hex(s(p, 'tint'));
    for (const e of events(ctx, 'land')) {
      if (e.role !== 'wild' && e.role !== 'bonus') continue;
      if (want !== 'both' && want !== e.role) continue;
      const t0 = at(ctx, e);
      if (t < t0) continue;
      const u = t - t0, rise = smoothstep(0, 0.4, u), [r, c] = e.cells![0]!, ctr = b.cellCenter(r, c), col = e.role === 'wild' ? wildCol : ROLE.bonus!;
      const breath = 0.75 + 0.25 * Math.sin(u * 4.2 + c);
      f.additive.push({ x: ctr.x, y: ctr.y, hw: b.cell * 0.95 * k, hh: b.cell * 0.95 * k, rot: 0, type: 0, color: col, intensity: 0.7 * rise * breath, e1: 1.2 });
      const rr = b.cell * (0.62 + 0.04 * Math.sin(u * 5));
      f.additive.push({ x: ctr.x, y: ctr.y, hw: rr, hh: rr, rot: 0, type: 1, color: col, intensity: 0.9 * rise, e1: 0.06 });
      for (let i = 0; i < 6; i++) {
        const a = u * (1.4 + 0.2 * (i % 2)) * (i % 2 ? 1 : -1) + (i / 6) * Math.PI * 2, d = b.cell * 0.62;
        f.additive.push({ x: ctr.x + Math.cos(a) * d, y: ctr.y + Math.sin(a) * d, hw: 0.016 * k, hh: 0.016 * k, rot: 0, type: 2, color: mixRGB(col, [1, 1, 1], 0.5), intensity: 0.9 * rise * (0.6 + 0.4 * Math.sin(u * 9 + i)) });
      }
    }
  },
};

export const expandLight: ShowEffect = {
  id: 'board.expand', name: 'Expanding wild light', tagline: 'Light rushes up and down the reel as the wild stretches, then the whole reel holds a glowing aura.', category: 'candidate', usesBoard: true,
  params: [color('tint', 'Colour', G('Look'), '#7dff8a', 'Colour of the light.'), strengthP(), durP(8)],
  duration: (p) => n(p, 'duration'), impactAt: () => 0,
  cues: () => [{ t: 3.2, kind: 'whoosh', gain: 0.7, dur: 0.6, pitch: 1.4 }, { t: 3.6, kind: 'thump', gain: 0.7, pitch: 1.2 }],
  build(f, t, p, ctx) {
    const b = ctx.board, D = n(p, 'duration');
    if (!b || t < 0 || t >= D) return;
    const col = hex(s(p, 'tint')), k = n(p, 'strength');
    for (const e of events(ctx, 'expand')) {
      const t0 = at(ctx, e), t1 = until(ctx, e, t0 + 0.55);
      if (t < t0) continue;
      const c = e.reel!, x = b.cellCenter(0, c).x, cy = (b.box.y0 + b.box.y1) / 2, H = b.box.y1 - b.box.y0, u = clamp((t - t0) / (t1 - t0)), after = Math.max(0, t - t1);
      const mid = b.cellCenter(Math.floor((b.rows - 1) / 2), c).y;
      f.additive.push({ x, y: mid, hw: b.cell * 1.1 * k, hh: b.cell * 1.1 * k, rot: 0, type: 3, color: col, intensity: 1.5 * Math.exp(-(t - t0) * 6) });
      for (const dir of [-1, 1]) f.additive.push({ x, y: mid + dir * H * 0.5 * easeOutCubic(u) * 0.5, hw: b.cell * 0.5, hh: H * 0.25 * easeOutCubic(u) + 0.01, rot: 0, type: 0, color: col, intensity: 0.9 * (1 - 0.5 * u), e1: 1 });
      const hold = 0.55 + 0.25 * Math.sin(after * 4), rise = smoothstep(t1 - 0.1, t1 + 0.3, t);
      f.additive.push({ x, y: cy, hw: b.cell * 0.85, hh: H * 0.56, rot: 0, type: 0, color: col, intensity: hold * rise * k, e1: 1.1 });
      for (let i = 0; i < 12; i++) { const hh = h1(c * 41 + i * 7), ph = (((t * 0.7 + hh) % 1) + 1) % 1; f.additive.push({ x: x + (hh - 0.5) * b.cell, y: b.box.y1 - ph * H, hw: 0.014, hh: 0.014, rot: 0, type: 2, color: mixRGB(col, [1, 1, 1], 0.4), intensity: rise * Math.sin(Math.PI * ph) }); }
    }
  },
};

export const collectStreams: ShowEffect = {
  id: 'board.collect', name: 'Collect streams', tagline: 'Comets of light fly from the bonus tiles (or the winning symbols) along curved paths into a meter, which flares as each one lands.', category: 'candidate', usesBoard: true,
  params: [color('tint', 'Colour', G('Look'), '#ffd24a', 'Colour of the comets.'), num('meterX', 'Meter X', G('Meter'), 0.5, 0, 1, 0.001, '', 'Where the meter is, as a fraction of the stage width.'), num('meterY', 'Meter Y', G('Meter'), 0.1, 0, 1, 0.001, '', 'Where the meter is, as a fraction of the stage height.'), num('flight', 'Flight time', G('Timing'), 0.8, 0.3, 2, 0.01, 's', 'How long a comet takes to reach the meter.'), strengthP(), durP(8)],
  duration: (p) => n(p, 'duration'), impactAt: () => 0,
  cues: () => [{ t: 3.4, kind: 'sweep', gain: 0.3, dur: 0.8, pitch: 2.2 }, { t: 3.9, kind: 'tick', gain: 0.4, pitch: 2.6 }, { t: 4.1, kind: 'tick', gain: 0.4, pitch: 2.8 }, { t: 4.3, kind: 'tick', gain: 0.4, pitch: 3 }],
  build(f, t, p, ctx) {
    const b = ctx.board, D = n(p, 'duration');
    if (!b || t < 0 || t >= D) return;
    const col = hex(s(p, 'tint')), k = n(p, 'strength'), flight = n(p, 'flight'), M = { x: n(p, 'meterX') * ctx.aspect, y: n(p, 'meterY') };
    let pulse = 0;
    for (const e of events(ctx, 'collect')) {
      const t0 = at(ctx, e), u = (t - t0) / flight, [r, c] = e.cells![0]!, A = b.cellCenter(r, c), dir = h1(r * 13 + c * 7) < 0.5 ? -1 : 1;
      const ctrl = { x: (A.x + M.x) / 2 + dir * 0.28, y: Math.min(A.y, M.y) - 0.22 };
      const at_ = (e2: number) => ({ x: (1 - e2) ** 2 * A.x + 2 * (1 - e2) * e2 * ctrl.x + e2 * e2 * M.x, y: (1 - e2) ** 2 * A.y + 2 * (1 - e2) * e2 * ctrl.y + e2 * e2 * M.y });
      if (u >= 1) pulse += Math.exp(-(t - t0 - flight) * 9);
      if (t < t0 || u > 1.02) {
        continue;
      }
      if (u < 0.2) f.additive.push({ x: A.x, y: A.y, hw: b.cell * 0.8, hh: b.cell * 0.8, rot: 0, type: 3, color: col, intensity: 1.2 * (1 - u / 0.2) * k });
      const e1 = easeInOutCubic(clamp(u));
      for (let i = 0; i < 16; i++) {
        const lag = i * 0.018, ee = easeInOutCubic(clamp(u - lag)), q = at_(ee), fadeTrail = (1 - i / 16) ** 1.5;
        f.additive.push({ x: q.x, y: q.y, hw: 0.026 * k * (1 - i / 22), hh: 0.026 * k * (1 - i / 22), rot: 0, type: 0, color: i === 0 ? [1, 1, 1] : col, intensity: (i === 0 ? 1.5 : 0.9) * fadeTrail * (1 - smoothstep(0.92, 1, u)), e1: 2 });
      }
      const hq = at_(e1);
      f.additive.push({ x: hq.x, y: hq.y, hw: 0.05 * k, hh: 0.05 * k, rot: 0.4, type: 2, color: col, intensity: 1.1 * (1 - smoothstep(0.9, 1, u)) });
    }
    if (pulse > 0.02) {
      pulse = Math.min(2.2, pulse);
      f.additive.push({ x: M.x, y: M.y, hw: 0.07 + 0.03 * pulse, hh: 0.07 + 0.03 * pulse, rot: 0, type: 3, color: col, intensity: 0.8 * pulse * k });
      f.additive.push({ x: M.x, y: M.y, hw: 0.14, hh: 0.14, rot: 0, type: 2, color: [1, 1, 1], intensity: 0.5 * Math.min(1, pulse) });
    }
  },
};

export const tumblePops: ShowEffect = {
  id: 'board.tumble', name: 'Winners pop and tumble', tagline: 'When winners pop, each one bursts into light and shards, and a puff of dust marks every symbol that lands in the gaps.', category: 'candidate', usesBoard: true,
  params: [color('tint', 'Burst colour', G('Look'), '#ffe27a', 'Colour of the bursts.'), strengthP(), durP(10)],
  duration: (p) => n(p, 'duration'), impactAt: () => 0,
  cues: () => [{ t: 4.5, kind: 'shatter', gain: 0.6, dur: 0.5, pitch: 2 }, { t: 5.0, kind: 'thump', gain: 0.4, pitch: 1.6 }],
  build(f, t, p, ctx) {
    const b = ctx.board, D = n(p, 'duration');
    if (!b || t < 0 || t >= D) return;
    const col = hex(s(p, 'tint')), k = n(p, 'strength');
    for (const e of events(ctx, 'pop')) {
      const u = (t - at(ctx, e)) / 0.9;
      if (u < 0 || u > 1) continue;
      for (const [r, c] of e.cells!) {
        const ctr = b.cellCenter(r, c);
        f.additive.push({ x: ctr.x, y: ctr.y, hw: b.cell * 0.9 * k, hh: b.cell * 0.9 * k, rot: 0, type: 3, color: col, intensity: 1.4 * Math.exp(-u * 8) });
        f.additive.push({ x: ctr.x, y: ctr.y, hw: b.cell * (0.4 + 1.1 * easeOutQuart(u)), hh: b.cell * (0.4 + 1.1 * easeOutQuart(u)), rot: 0, type: 1, color: col, intensity: 1 * (1 - smoothstep(0, 0.8, u)), e1: 0.08 });
        sparks(f, ctr.x, ctr.y, u, col, 8, b.cell * 1.1 * k, r * 17 + c * 5, 1);
      }
      f.camera.dy += Math.sin(u * 60) * 0.004 * k * Math.exp(-u * 8);
    }
    for (const e of events(ctx, 'drop')) {
      const u = (t - at(ctx, e) - 0.35) / 0.7;
      if (u < 0 || u > 1) continue;
      for (const [r, c] of e.cells!.slice(0, 18)) {
        const ctr = b.cellCenter(r, c);
        f.alphaSprites.push({ x: ctr.x, y: ctr.y + b.cell * 0.4, hw: 0.018 + 0.02 * u, hh: 0.015 + 0.015 * u, rot: 0, type: 5, color: [0.78, 0.72, 0.62], intensity: 0.35 * (1 - u) ** 1.5, e2: r * 5 + c });
      }
    }
  },
};

export const spinStreaks: ShowEffect = {
  id: 'board.streaks', name: 'Spin streaks', tagline: 'Light streaks race down the reels while they spin and fade as each reel stops.', category: 'candidate', usesBoard: true,
  params: [color('tint', 'Colour', G('Look'), '#cfe6ff', 'Colour of the streaks.'), num('density', 'Streaks per reel', G('Look'), 6, 1, 20, 1, 'count', 'How many streaks race down each reel.', true), strengthP(0.8), durP(8)],
  duration: (p) => n(p, 'duration'), impactAt: () => 0,
  cues: () => [{ t: 0.4, kind: 'whoosh', gain: 0.4, dur: 1.4, pitch: 1.4 }],
  build(f, t, p, ctx) {
    const b = ctx.board, D = n(p, 'duration');
    if (!b || t < 0 || t >= D) return;
    const st = stops(ctx), start = events(ctx, 'spin-start')[0], t0 = start ? at(ctx, start) : 0, col = hex(s(p, 'tint')), N = Math.round(n(p, 'density') * Math.max(0.3, ctx.quality ?? 1)), k = n(p, 'strength'), H = b.box.y1 - b.box.y0;
    for (let c = 0; c < b.cols; c++) {
      const stop = st[c] ?? t0 + 1, live = smoothstep(t0, t0 + 0.3, t) * (1 - smoothstep(stop - 0.5, stop, t));
      if (live <= 0.01) continue;
      const x = b.cellCenter(0, c).x;
      for (let i = 0; i < N; i++) {
        const hh = h1(c * 53 + i * 7), ph = (((t * (1.8 + hh) + hh * 3) % 1) + 1) % 1, len = H * lerp(0.12, 0.28, hh);
        f.additive.push({ x: x + (h1(c * 29 + i) - 0.5) * b.cell * 0.8, y: b.box.y0 - len + ph * (H + len * 2), hw: len / 2, hh: 0.0035, rot: Math.PI / 2, type: 4, color: col, intensity: 0.5 * k * live * Math.sin(Math.PI * ph), e1: 2 });
      }
    }
  },
};

export const BOARD_FX: ShowEffect[] = [landing, anticipation, winLine, stickyAura, expandLight, collectStreams, tumblePops, spinStreaks];
void ellipsePoly; void quadPoly; void easeOutQuart;
export type { BoardInfo };
