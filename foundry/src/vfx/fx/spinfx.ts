/**
 * Effects for the moment the reels spin: speed streaks, light trails behind the symbols, sparks, fire, electricity, plasma, smoke,
 * glitter, digital rain, frost, wind, comets, rainbow trails, bubbles, neon rails and a rumbling board. They follow how fast each
 * reel is *really* turning (from the board's plan): nothing shows on a reel that is at rest, the effect builds as the reel speeds up,
 * thins as it brakes and is gone when it stops. They are aimed at a board, like the other board effects.
 */
import { makeRng } from '../../core/util/prng';
import { color, enm, num } from '../../core/params';
import { FIRE_PALETTES, type Frame, type RGB } from '../engine/frame';
import { jag, ribbon } from '../engine/lightning';
import { clamp, h1, hex, mixRGB, smoothstep } from '../engine/math';
import { reelScroll } from '../model/board';
import { n, s, type BoardInfo, type EffectCtx, type PValues, type ShowEffect } from './effect';
import { flame, setVolPalette, smokePuff } from './volume';
import { triPoly } from './helpers';

const G = (group: string) => ({ section: 'Effect', group });
const TAU = Math.PI * 2;
const fract = (x: number): number => x - Math.floor(x);
const L = (ctx: EffectCtx, v: number): number => Math.max(1, Math.round(v * Math.max(0.3, ctx.quality ?? 1)));

/** The board's geometry, or a stand-in in the middle of the stage when the effect is not aimed at a board (its reels then spin 0.2 s to 1.2 s + 0.3 s per reel). */
function board(ctx: EffectCtx): BoardInfo {
  if (ctx.board) return ctx.board;
  const cx = ctx.aspect / 2, cy = 0.5, W = 1.3, H = 0.75, cell = 0.23, pitch = 0.25;
  return { cols: 5, rows: 3, cell, pitch, cx, cy, box: { x0: cx - W / 2, y0: cy - H / 2, x1: cx + W / 2, y1: cy + H / 2 }, cellCenter: (r, c) => ({ x: cx - 2 * pitch + c * pitch, y: cy - pitch + r * pitch }), events: [], roles: [], end: 0, style: 'classic', pattern: '' };
}

/** One spinning reel at one moment. */
interface R {
  c: number; x: number; top: number; bot: number; H: number; pitch: number; cell: number; rows: number;
  /** 0 at rest, 1 at full speed (a little more while it is thrown). */
  speed: number;
  /** Scroll position in cells: symbols move down the screen as it grows. */
  scroll: number;
}
function eachReel(b: BoardInfo, T: number, fn: (r: R) => void): void {
  const H = b.box.y1 - b.box.y0;
  for (let c = 0; c < b.cols; c++) {
    const rp = b.reels?.[c];
    let speed: number, scroll: number;
    if (rp && (rp.style === 'classic' || rp.style === 'drum' || rp.style === 'turbo')) {
      scroll = reelScroll(rp, T);
      speed = Math.max(0, (reelScroll(rp, T + 0.012) - reelScroll(rp, T - 0.012)) / 0.024 / Math.max(1, rp.v));
    } else {
      const start = rp ? rp.start : 0.2, stop = rp ? rp.stop : 1.2 + c * 0.3, u = clamp((T - start) / Math.max(0.3, stop - start));
      speed = Math.sin(Math.PI * u) ** 0.7; scroll = u * 6;       // a reel that does not scroll (drop-in, pop-in): a swell over the time it takes
    }
    if (speed < 0.02) continue;
    fn({ c, x: b.cellCenter(0, c).x, top: b.box.y0, bot: b.box.y1, H, pitch: b.pitch, cell: b.cell, rows: b.rows, speed: Math.min(1.2, speed), scroll });
  }
}
/** y of the centre of symbol slot k (k = 0 … rows + 1) on a reel that is scrolled to r.scroll. */
const slotY = (r: R, k: number): number => r.top + (k - 1 + fract(r.scroll)) * r.pitch + r.cell / 2;
/** Whether a symbol at y is still on the board (trails and flames of symbols that have left it are not drawn). */
const onBoard = (r: R, y: number): boolean => y > r.top - r.cell * 0.1 && y < r.bot + r.cell * 0.1;
const hhOf = (seed: number) => (a: number, k: number): number => h1(seed * 977 + a * 131 + k * 17);

const tintP = (def: string, def2: string) => [color('tint', 'Colour', G('Look'), def, 'The main colour.'), color('tint2', 'Second colour', G('Look'), def2, 'A second colour.')];
const strengthP = (def = 1) => num('strength', 'Strength', G('Look'), def, 0.2, 2.5, 0.01, 'x', 'How strong it is.');
const durP = () => num('duration', 'Length', G('Timing'), 6, 1, 30, 0.01, 's', 'How long the effect is on (it only draws while a reel is turning).');
const seedP = () => num('seed', 'Variation', G('Look'), 3, 1, 99, 1, '', 'Pick a different arrangement.', true);
const ENV = (t: number, D: number): number => smoothstep(0, 0.05, t) * (1 - smoothstep(D - 0.3, D, t));
const baseFx: Pick<ShowEffect, 'category' | 'usesBoard' | 'duration' | 'impactAt'> = { category: 'candidate', usesBoard: true, duration: (p) => n(p, 'duration'), impactAt: () => 0 };

type Build = (f: Frame, T: number, t: number, p: PValues, ctx: EffectCtx, b: BoardInfo, k: number) => void;
function make(def: Omit<ShowEffect, 'build' | 'category' | 'usesBoard' | 'duration' | 'impactAt'>, build: Build): ShowEffect {
  return { ...baseFx, ...def, build(f, t, p, ctx) { const D = n(p, 'duration'); if (t < 0 || t >= D) return; build(f, t + (ctx.start ?? 0), t, p, ctx, board(ctx), ENV(t, D) * n(p, 'strength')); } };
}

// ---------------------------------------------------------------------------------------------------------------------

export const spinStreaks = make({
  id: 'spin.streaks', name: 'Speed streaks', tagline: 'Thin streaks of light race down every turning reel; the faster it spins, the longer they get.',
  params: [...tintP('#bfe8ff', '#ffffff'), num('count', 'Streaks per reel', G('Look'), 9, 2, 30, 1, 'count', 'How many streaks race down each reel.', true), strengthP(), seedP(), durP()],
  cues: () => [{ t: 0.2, kind: 'whoosh', gain: 0.4, dur: 1.8, pitch: 1.4 }],
}, (f, T, _t, p, ctx, b, k) => {
  const c1 = hex(s(p, 'tint')), c2 = hex(s(p, 'tint2')), h = hhOf(n(p, 'seed'));
  eachReel(b, T, (r) => {
    for (let i = 0, N = L(ctx, n(p, 'count')); i < N; i++) {
      const x = r.x + (h(r.c, i * 7 + 1) - 0.5) * r.cell * 0.95, head = r.top + fract(r.scroll * 0.28 + h(r.c, i * 7 + 2)) * r.H, len = Math.min(r.pitch * (0.3 + 1.1 * r.speed) * (0.6 + 0.8 * h(r.c, i * 7 + 3)), (head - r.top) / 1.9 + 0.004);
      f.additive.push({ x, y: head - len * 0.88, hw: len, hh: 0.0032 + 0.003 * h(r.c, i * 7 + 4), rot: Math.PI / 2, type: 4, color: mixRGB(c1, c2, h(r.c, i * 7 + 5)), intensity: (0.8 + 0.8 * h(r.c, i * 7 + 6)) * Math.min(1, r.speed) * k, e1: 1.5 });
    }
    f.additive.push({ x: r.x, y: (r.top + r.bot) / 2, hw: r.cell * 0.55, hh: r.H * 0.5, rot: 0, type: 0, color: c1, intensity: 0.12 * r.speed * k, e1: 0.8 });
  });
});

export const spinTrail = make({
  id: 'spin.trail', name: 'Light trails', tagline: 'Every symbol drags a glowing comet tail behind it as it falls down the reel.',
  params: [...tintP('#ffd24a', '#ff5a1a'), num('length', 'Tail length', G('Look'), 1, 0.3, 2.5, 0.01, 'x', 'How long the tails are.'), strengthP(), seedP(), durP()],
  cues: () => [{ t: 0.2, kind: 'sweep', gain: 0.3, dur: 1.5, pitch: 1.5 }],
}, (f, T, _t, p, _ctx, b, k) => {
  const c1 = hex(s(p, 'tint')), c2 = hex(s(p, 'tint2')), len0 = n(p, 'length');
  eachReel(b, T, (r) => {
    for (let kk = 0; kk <= r.rows + 1; kk++) {
      const y = slotY(r, kk), tail = Math.min(r.pitch * (0.3 + 1.5 * r.speed) * len0, Math.max(0, y - r.top + r.cell * 0.2));
      if (tail < 0.01 || !onBoard(r, y)) continue;
      const a = Math.min(1, r.speed) * k;
      f.additive.push({ x: r.x, y: y - r.cell * 0.2 - tail / 2, hw: r.cell * 0.34, hh: tail / 2, rot: 0, type: 0, color: c2, intensity: 0.42 * a, e1: 1 });                      // the soft body of the tail
      f.additive.push({ x: r.x, y: y - r.cell * 0.2 - tail * 0.44, hw: tail * 0.56, hh: 0.011, rot: Math.PI / 2, type: 4, color: c1, intensity: 1.1 * a, e1: 1.2 });          // a hot core
      f.additive.push({ x: r.x, y, hw: r.cell * 0.3, hh: r.cell * 0.3, rot: 0, type: 0, color: c1, intensity: 0.28 * a, e1: 1.3 });
    }
  });
});

export const spinSparks = make({
  id: 'spin.sparks', name: 'Sparks', tagline: 'Sparks fly off the edges of the turning reels and fall in arcs, more of them the faster the reel goes.',
  params: [...tintP('#ffb43a', '#fff0b0'), num('count', 'Sparks per reel', G('Look'), 60, 6, 160, 1, 'count', 'How many sparks fly from each reel.', true), num('gravity', 'Fall', G('Look'), 1, 0, 3, 0.01, 'x', 'How fast the sparks fall.'), strengthP(), seedP(), durP()],
  cues: () => [{ t: 0.2, kind: 'zap', gain: 0.35, dur: 1.8, pitch: 2 }],
}, (f, T, _t, p, ctx, b, k) => {
  const c1 = hex(s(p, 'tint')), c2 = hex(s(p, 'tint2')), h = hhOf(n(p, 'seed')), g = 0.9 * n(p, 'gravity');
  eachReel(b, T, (r) => {
    for (let i = 0, N = L(ctx, n(p, 'count')); i < N; i++) {
      if (h(r.c, i * 9 + 1) > Math.min(1, r.speed)) continue;
      const age = fract(T * (1.1 + 0.5 * h(r.c, i * 9 + 2)) + h(r.c, i * 9 + 3)), side = h(r.c, i * 9 + 4) < 0.5 ? -1 : 1;
      const x0 = r.x + side * r.cell * 0.5, y0 = r.top + h(r.c, i * 9 + 5) * r.H, vx = side * (0.14 + 0.34 * h(r.c, i * 9 + 6)), vy = -0.12 - 0.34 * h(r.c, i * 9 + 7);
      const px = x0 + vx * age, py = y0 + vy * age + 0.5 * g * age * age, ang = Math.atan2(vy + g * age, vx), len = 0.024 + 0.05 * h(r.c, i * 9 + 8), fade = (1 - age) ** 1.2;
      f.additive.push({ x: px - Math.cos(ang) * len * 0.88, y: py - Math.sin(ang) * len * 0.88, hw: len, hh: 0.0038, rot: ang, type: 4, color: mixRGB(c1, c2, h(r.c, i * 9 + 9)), intensity: 2.1 * fade * k, e1: 1.5 });
      f.additive.push({ x: px, y: py, hw: 0.012, hh: 0.012, rot: 0, type: 0, color: c2, intensity: 1.6 * fade * k, e1: 2.2 });
    }
  });
});

export const spinFire = make({
  id: 'spin.fire', name: 'Fire', tagline: 'Every symbol streaks down the reel trailing a tongue of real flame; the faster the reel, the longer the fire.',
  params: [enm('fire', 'Fire colour', G('Look'), 'fire', [['fire', 'Orange fire'], ['blue', 'Blue flame'], ['green', 'Green fire'], ['violet', 'Violet fire'], ['white', 'White-hot']], 'The colour of the flames.'), num('size', 'Flame size', G('Look'), 1, 0.4, 2, 0.01, 'x', 'How big the flames are.'), strengthP(), seedP(), durP()],
  cues: () => [{ t: 0.2, kind: 'whoosh', gain: 0.5, dur: 1.8, pitch: 0.7 }, { t: 0.3, kind: 'rumble', gain: 0.35, dur: 1.6 }],
}, (f, T, _t, p, ctx, b, k) => {
  const pal = FIRE_PALETTES[s(p, 'fire')] ?? FIRE_PALETTES.fire!, glow = mixRGB(pal[1]!, pal[2]!, 0.5), size = n(p, 'size');
  setVolPalette(f, s(p, 'fire'), 'black');
  eachReel(b, T, (r) => {
    for (let kk = 0; kk <= r.rows + 1; kk++) {
      const y = slotY(r, kk), a = Math.min(1, r.speed) * Math.min(1, k), top = Math.max(0, y - r.top);
      if (top < r.cell * 0.4 || !onBoard(r, y)) continue;
      const h = Math.min(r.pitch * (0.5 + 1.0 * r.speed) * size, top + r.cell * 0.2);
      flame(f, { x: r.x, y: y + r.cell * 0.05, w: r.cell * 0.62 * size, h, age: 0.04, seed: n(p, 'seed') + r.c * 7 + kk * 3.1, t: T + r.c * 0.37, heat: 1, alpha: 0.78 * a, soft: true });
      f.additive.push({ x: r.x, y, hw: r.cell * 0.5, hh: r.cell * 0.5, rot: 0, type: 0, color: glow, intensity: 0.34 * a, e1: 1.2 });
    }
  });
});

export const spinEnergy = make({
  id: 'spin.energy', name: 'Energy', tagline: 'Electricity crackles down every turning reel and leaps between them.',
  params: [...tintP('#7fd8ff', '#c8a0ff'), num('arcs', 'Arcs per reel', G('Look'), 2, 1, 5, 1, 'count', 'Arcs alive on each reel at once.', true), num('between', 'Leaps between reels', G('Look'), 1, 0, 2, 0.01, 'x', 'How often electricity jumps from one reel to the next.'), strengthP(), seedP(), durP()],
  cues: () => [{ t: 0.2, kind: 'zap', gain: 0.5, dur: 1.9, pitch: 1.4 }],
}, (f, T, _t, p, ctx, b, k) => {
  const glow = hex(s(p, 'tint')), c2 = hex(s(p, 'tint2')), step = Math.floor(T * 22), rng = makeRng(step * 977 + n(p, 'seed') * 31), arcs = L(ctx, n(p, 'arcs'));
  f.boltCore = [1, 1, 1]; f.boltGlow = glow;
  eachReel(b, T, (r) => {
    const a = Math.min(1, r.speed) * Math.min(1, k);
    f.additive.push({ x: r.x, y: (r.top + r.bot) / 2, hw: r.cell * 0.6, hh: r.H * 0.5, rot: 0, type: 0, color: glow, intensity: (0.14 + 0.1 * h1(step * 5 + r.c)) * a, e1: 0.8 });
    for (let i = 0; i < arcs; i++) {
      if (rng.next() < 0.15) continue;
      const A = { x: r.x + (rng.next() - 0.5) * r.cell * 0.7, y: r.top - 0.01 }, B = { x: r.x + (rng.next() - 0.5) * r.cell * 0.7, y: r.bot + 0.01 };
      ribbon(f.bolts, jag(rng, A, B, r.H * 0.05, 5), 0.0034 * Math.min(1.4, k), (i === 0 ? 1 : 0.65) * a, true);
    }
    if (r.c < b.cols - 1 && rng.next() < 0.35 * n(p, 'between')) {
      const y = r.top + rng.next() * r.H, A = { x: r.x + r.cell * 0.5, y }, B = { x: r.x + b.pitch - r.cell * 0.5, y: y + (rng.next() - 0.5) * 0.08 };
      ribbon(f.bolts, jag(rng, A, B, 0.025, 4), 0.003 * Math.min(1.4, k), 0.9 * a, true);
      f.additive.push({ x: A.x, y: A.y, hw: 0.03, hh: 0.03, rot: 0, type: 3, color: c2, intensity: 0.8 * a });
      f.additive.push({ x: B.x, y: B.y, hw: 0.03, hh: 0.03, rot: 0, type: 3, color: c2, intensity: 0.8 * a });
    }
  });
});

export const spinPlasma = make({
  id: 'spin.plasma', name: 'Plasma', tagline: 'Two strands of coloured plasma twist down each reel round bright orbs that ride with the symbols, inside a faint pulsing aura.',
  params: [...tintP('#8a5aff', '#ff4ad8'), strengthP(), seedP(), durP()],
  cues: () => [{ t: 0.2, kind: 'sweep', gain: 0.35, dur: 1.8, pitch: 1.1 }],
}, (f, T, _t, p, ctx, b, k) => {
  const c1 = hex(s(p, 'tint')), c2 = hex(s(p, 'tint2')), seed = n(p, 'seed'), N = L(ctx, 46);
  eachReel(b, T, (r) => {
    const a = Math.min(1, r.speed) * k, pulse = 0.8 + 0.2 * Math.sin(T * 9 + r.c * 1.7), mid = (r.top + r.bot) / 2;
    f.additive.push({ x: r.x, y: mid, hw: r.cell * 0.6, hh: r.H * 0.52, rot: 0, type: 0, color: mixRGB(c1, c2, 0.5 + 0.5 * Math.sin(T * 2 + r.c)), intensity: 0.1 * a * pulse, e1: 0.9 });
    for (let st = 0; st < 2; st++) {                                            // two strands twisting round the reel's axis, drifting down with the symbols
      const col = st ? c2 : c1;
      for (let j = 0; j < N; j++) {
        const u = j / (N - 1), y = r.top + u * r.H, ph = u * 13 - r.scroll * 1.1 - T * 1.8 + st * Math.PI + r.c, depth = 0.5 + 0.5 * Math.cos(ph), edge = Math.sin(Math.PI * u) ** 0.5;
        f.additive.push({ x: r.x + Math.sin(ph) * r.cell * 0.36, y, hw: 0.019, hh: 0.019, rot: 0, type: 0, color: col, intensity: (0.28 + 0.5 * depth) * a * edge, e1: 2.2 });
        if (j % 4 === 0) f.additive.push({ x: r.x + Math.sin(ph) * r.cell * 0.36, y, hw: 0.006, hh: 0.006, rot: 0, type: 0, color: [1, 1, 1], intensity: 0.8 * depth * a * edge, e1: 2.6 });
      }
    }
    for (let i = 0; i < 3; i++) {                                                 // orbs of plasma riding down with the symbols
      const y = r.top + fract(r.scroll * 0.34 + i / 3 + h1(seed + r.c * 7)) * r.H, x = r.x + Math.sin(T * (2 + i * 0.6) + i * 2 + r.c) * r.cell * 0.2, col = mixRGB(c1, c2, 0.5 + 0.5 * Math.sin(T * 3 + i + r.c));
      f.additive.push({ x, y, hw: r.cell * 0.22, hh: r.cell * 0.22 + r.pitch * 0.18 * r.speed, rot: 0, type: 3, color: col, intensity: 0.85 * a * Math.sin(Math.PI * clamp((y - r.top) / r.H)) });
    }
  });
});

export const spinSmoke = make({
  id: 'spin.smoke', name: 'Smoke trail', tagline: 'Soft smoke streams off the symbols as the reel turns and drifts behind it.',
  params: [enm('smoke', 'Smoke', G('Look'), 'grey', [['grey', 'Grey'], ['black', 'Black soot'], ['white', 'White steam'], ['toxic', 'Toxic green'], ['ice', 'Cold mist'], ['purple', 'Magic purple'], ['sand', 'Dust']], 'The colour of the smoke.'), strengthP(), seedP(), durP()],
  cues: () => [{ t: 0.2, kind: 'whoosh', gain: 0.3, dur: 1.8, pitch: 0.6 }],
}, (f, T, _t, p, _ctx, b, k) => {
  setVolPalette(f, 'fire', s(p, 'smoke'));
  eachReel(b, T, (r) => {
    for (let kk = 0; kk <= r.rows + 1; kk++) {
      const y = slotY(r, kk), a = Math.min(1, r.speed) * Math.min(1, k);
      if (y - r.top < r.cell * 0.4 || !onBoard(r, y)) continue;
      for (let j = 0; j < 2; j++) {
        const hh = h1(n(p, 'seed') * 71 + r.c * 13 + kk * 5 + j), ph = fract(T * 0.9 + hh), yy = y - r.cell * 0.2 - ph * r.pitch * (0.7 + r.speed);
        if (yy < r.top - r.cell * 0.2) continue;
        smokePuff(f, { x: r.x + (hh - 0.5) * r.cell * 0.4 + Math.sin(T * 2 + hh * 9) * r.cell * 0.08, y: yy, size: r.cell * (0.45 + 0.4 * ph), age: ph, seed: hh * 9, t: T * 0.6 + hh * 3, alpha: 0.42 * a * Math.sin(Math.PI * Math.min(1, ph * 1.1)), heat: 0, light: [0.3, -0.9], soft: 0.45 });
      }
    }
  });
});

export const spinGlitter = make({
  id: 'spin.glitter', name: 'Glitter', tagline: 'Gold dust and twinkling glints pour down the turning reels.',
  params: [...tintP('#ffe08a', '#ffffff'), num('count', 'Specks per reel', G('Look'), 26, 4, 90, 1, 'count', 'How many specks fall on each reel.', true), strengthP(), seedP(), durP()],
  cues: () => [{ t: 0.2, kind: 'tick', gain: 0.25, dur: 1.5, pitch: 2.4 }],
}, (f, T, _t, p, ctx, b, k) => {
  const c1 = hex(s(p, 'tint')), c2 = hex(s(p, 'tint2')), h = hhOf(n(p, 'seed'));
  eachReel(b, T, (r) => {
    for (let i = 0, N = L(ctx, n(p, 'count')); i < N; i++) {
      const x = r.x + (h(r.c, i * 6 + 1) - 0.5) * r.cell * 1.05, y = r.top + fract(r.scroll * (0.18 + 0.12 * h(r.c, i * 6 + 2)) + h(r.c, i * 6 + 3)) * r.H;
      const tw = Math.max(0, Math.sin(T * (7 + 6 * h(r.c, i * 6 + 4)) + i * 2.3)) ** 2, a = Math.min(1, r.speed) * k;
      if (h(r.c, i * 6 + 5) < 0.45) f.additive.push({ x, y, hw: 0.04 * (0.6 + tw), hh: 0.04 * (0.6 + tw), rot: 0.2, type: 2, color: mixRGB(c1, c2, 0.5), intensity: 1.5 * tw * a });
      else f.additive.push({ x, y, hw: 0.01, hh: 0.01, rot: 0, type: 0, color: c1, intensity: 1.7 * (0.4 + 0.6 * tw) * a, e1: 2.2 });
    }
  });
});

export const spinDigital = make({
  id: 'spin.digital', name: 'Digital rain', tagline: 'Streams of glowing data fall down each reel, a bright head and a fading tail of dashes.',
  params: [...tintP('#4aff9a', '#d8ffe8'), num('streams', 'Streams per reel', G('Look'), 4, 1, 10, 1, 'count', 'How many streams fall on each reel.', true), strengthP(), seedP(), durP()],
  cues: () => [{ t: 0.2, kind: 'tick', gain: 0.3, dur: 1.6, pitch: 1.8 }],
}, (f, T, _t, p, ctx, b, k) => {
  const c1 = hex(s(p, 'tint')), c2 = hex(s(p, 'tint2')), h = hhOf(n(p, 'seed'));
  eachReel(b, T, (r) => {
    for (let i = 0, N = L(ctx, n(p, 'streams')); i < N; i++) {
      const x = r.x + ((i + 0.5) / N - 0.5) * r.cell * 0.95, head = r.top + fract(r.scroll * (0.22 + 0.12 * h(r.c, i * 3 + 1)) + h(r.c, i * 3 + 2)) * r.H, gap = r.pitch * 0.16, a = Math.min(1, r.speed) * k;
      for (let j = 0; j < 9; j++) {
        const y = head - j * gap;
        if (y < r.top) break;
        const flick = h1(Math.floor(T * 14) * 13 + j * 7 + i + r.c * 3) > 0.25 ? 1 : 0.35;
        f.additive.push({ x, y, hw: 0.0075, hh: 0.017 + 0.006 * h(r.c, i * 3 + j), rot: 0, type: 0, color: j === 0 ? c2 : c1, intensity: (j === 0 ? 2.2 : 1.35 * (1 - j / 9)) * flick * a, e1: 1.6 });
      }
    }
  });
});

export const spinFrost = make({
  id: 'spin.frost', name: 'Frost', tagline: 'Ice shards and snow crystals stream down the reels in a cold mist, with glints.',
  params: [...tintP('#bfe6ff', '#ffffff'), num('count', 'Shards per reel', G('Look'), 10, 2, 40, 1, 'count', 'How many ice shards stream down each reel.', true), strengthP(), seedP(), durP()],
  cues: () => [{ t: 0.2, kind: 'sweep', gain: 0.3, dur: 1.7, pitch: 2.4 }],
}, (f, T, _t, p, ctx, b, k) => {
  const c1 = hex(s(p, 'tint')), c2 = hex(s(p, 'tint2')), h = hhOf(n(p, 'seed'));
  setVolPalette(f, 'fire', 'ice');
  eachReel(b, T, (r) => {
    const a = Math.min(1, r.speed) * Math.min(1, k);
    for (let i = 0, N = L(ctx, n(p, 'count')); i < N; i++) {
      const x = r.x + (h(r.c, i * 8 + 1) - 0.5) * r.cell * 1.0, y = r.top + fract(r.scroll * (0.2 + 0.1 * h(r.c, i * 8 + 2)) + h(r.c, i * 8 + 3)) * r.H;
      const sz = 0.011 + 0.016 * h(r.c, i * 8 + 4), rot = h(r.c, i * 8 + 5) * TAU + T * 3 * (h(r.c, i * 8 + 6) - 0.5);
      const P = (lx: number, ly: number): [number, number] => [x + (Math.cos(rot) * lx - Math.sin(rot) * ly) * sz, y + (Math.sin(rot) * lx + Math.cos(rot) * ly) * sz];
      triPoly(f.polys, P(0, -1.5), P(0.7, 0.2), P(-0.2, 0.2), [0.62, 0.86, 1], 0.9 * a, [0.95, 0.99, 1], [0.95, 0.99, 1]);
      triPoly(f.polys, P(0, 1.1), P(0.7, 0.2), P(-0.2, 0.2), [0.2, 0.5, 0.9], 0.9 * a, [0.5, 0.8, 1], [0.5, 0.8, 1]);
      if (h(r.c, i * 8 + 7) < 0.5) f.additive.push({ x, y, hw: sz * 2.2, hh: sz * 2.2, rot: 0.2, type: 2, color: mixRGB(c1, c2, 0.5), intensity: 0.8 * a * (0.5 + 0.5 * Math.sin(T * 12 + i)) });
    }
    f.additive.push({ x: r.x, y: (r.top + r.bot) / 2, hw: r.cell * 0.55, hh: r.H * 0.5, rot: 0, type: 0, color: c1, intensity: 0.1 * a, e1: 0.8 });
    for (let i = 0; i < 2; i++) {
      const hh = h1(n(p, 'seed') * 53 + r.c * 11 + i), ph = fract(T * 0.7 + hh), y = r.top + ph * r.H;
      smokePuff(f, { x: r.x + (hh - 0.5) * r.cell * 0.5, y, size: r.cell * 0.7, age: ph, seed: hh * 9, t: T * 0.5, alpha: 0.3 * a * Math.sin(Math.PI * ph), heat: 0, light: [0.3, -0.9], soft: 0.8 });
    }
  });
});

export const spinWind = make({
  id: 'spin.wind', name: 'Air rush', tagline: 'Soft white currents of air whip down the turning reels in long swaying lines.',
  params: [...tintP('#e6f3ff', '#ffffff'), num('count', 'Currents per reel', G('Look'), 5, 1, 16, 1, 'count', 'How many currents rush down each reel.', true), strengthP(), seedP(), durP()],
  cues: () => [{ t: 0.2, kind: 'whoosh', gain: 0.45, dur: 1.8, pitch: 1.1 }],
}, (f, T, _t, p, ctx, b, k) => {
  const c1 = hex(s(p, 'tint')), h = hhOf(n(p, 'seed'));
  f.boltCore = c1; f.boltGlow = mixRGB(c1, hex(s(p, 'tint2')), 0.5);
  eachReel(b, T, (r) => {
    for (let i = 0, N = L(ctx, n(p, 'count')); i < N; i++) {
      const x0 = r.x + (h(r.c, i * 5 + 1) - 0.5) * r.cell * 0.9, head = r.top + fract(r.scroll * (0.25 + 0.1 * h(r.c, i * 5 + 2)) + h(r.c, i * 5 + 3)) * r.H, len = r.pitch * (0.9 + 2.2 * r.speed) * (0.7 + 0.6 * h(r.c, i * 5 + 4)), sway = r.cell * 0.12 * (0.5 + h(r.c, i * 5 + 5));
      const pts = [];
      for (let j = 0; j <= 7; j++) { const u = j / 7, y = head - u * len; if (y < r.top) break; pts.push({ x: x0 + Math.sin(u * 4 + T * 3 + i) * sway * (0.3 + u), y }); }
      if (pts.length >= 2) ribbon(f.bolts, pts, 0.0016, 0.5 * Math.min(1, r.speed) * Math.min(1.4, k), true);
    }
  });
});

export const spinComets = make({
  id: 'spin.comets', name: 'Comets', tagline: 'Bright orbs with long tails shoot down the reels, shedding sparkles.',
  params: [...tintP('#7fd8ff', '#ffffff'), num('perReel', 'Comets per reel', G('Look'), 2, 1, 5, 1, 'count', 'How many comets travel down each reel.', true), strengthP(), seedP(), durP()],
  cues: () => [{ t: 0.2, kind: 'sweep', gain: 0.35, dur: 1.8, pitch: 1.9 }],
}, (f, T, _t, p, _ctx, b, k) => {
  const c1 = hex(s(p, 'tint')), c2 = hex(s(p, 'tint2')), h = hhOf(n(p, 'seed'));
  eachReel(b, T, (r) => {
    for (let i = 0, N = Math.round(n(p, 'perReel')); i < N; i++) {
      const ph = fract(r.scroll * 0.19 + i / N + h(r.c, i + 1)), y = r.top + ph * r.H, x = r.x + Math.sin(ph * 9 + i + r.c) * r.cell * 0.2, a = Math.min(1, r.speed) * k, tail = Math.min(r.pitch * (0.8 + 2.2 * r.speed), y - r.top);
      if (tail < 0.01) continue;
      f.additive.push({ x, y: y - tail * 0.5, hw: tail * 0.5, hh: 0.012, rot: Math.PI / 2, type: 4, color: c1, intensity: 1.2 * a, e1: 1.2 });
      f.additive.push({ x, y: y - tail * 0.3, hw: r.cell * 0.14, hh: tail * 0.35, rot: 0, type: 0, color: c1, intensity: 0.4 * a, e1: 1 });
      f.additive.push({ x, y, hw: r.cell * 0.2, hh: r.cell * 0.2, rot: 0, type: 3, color: c2, intensity: 1.2 * a });
      for (let j = 0; j < 4; j++) { const hh = h1(i * 31 + j + r.c * 7 + Math.floor(T * 9)), yy = y - tail * hh * 0.9; f.additive.push({ x: x + (hh - 0.5) * r.cell * 0.4, y: yy, hw: 0.007, hh: 0.007, rot: 0, type: 0, color: c2, intensity: 0.9 * a * (1 - hh), e1: 2.2 }); }
    }
  });
});

export const spinRainbow = make({
  id: 'spin.rainbow', name: 'Rainbow trail', tagline: 'Every symbol leaves a ribbon of colours behind it, the spectrum slowly turning.',
  params: [num('bands', 'Colour bands', G('Look'), 5, 2, 8, 1, 'count', 'How many coloured lines the ribbon has.', true), num('length', 'Tail length', G('Look'), 1, 0.3, 2.5, 0.01, 'x', 'How long the ribbons are.'), strengthP(), seedP(), durP()],
  cues: () => [{ t: 0.2, kind: 'sweep', gain: 0.3, dur: 1.7, pitch: 2 }],
}, (f, T, _t, p, _ctx, b, k) => {
  const bands = Math.round(n(p, 'bands')), len0 = n(p, 'length');
  const hsv = (hue: number): RGB => { const kk = (m: number) => (m + hue * 6) % 6, v = (m: number) => 1 - 0.85 * Math.max(0, Math.min(kk(m), 4 - kk(m), 1)); return [v(5), v(3), v(1)]; };
  eachReel(b, T, (r) => {
    for (let kk = 0; kk <= r.rows + 1; kk++) {
      const y = slotY(r, kk), tail = Math.min(r.pitch * (0.4 + 1.6 * r.speed) * len0, Math.max(0, y - r.top + r.cell * 0.2)), a = Math.min(1, r.speed) * k;
      if (tail < 0.01 || !onBoard(r, y)) continue;
      for (let j = 0; j < bands; j++) {
        const off = ((j + 0.5) / bands - 0.5) * r.cell * 0.7;
        f.additive.push({ x: r.x + off, y: y - r.cell * 0.2 - tail * 0.46, hw: tail * 0.54, hh: r.cell * 0.7 / bands * 0.55, rot: Math.PI / 2, type: 4, color: hsv(fract(j / bands + T * 0.25 + r.c * 0.07)), intensity: 1.0 * a, e1: 1.2 });
      }
    }
  });
});

export const spinBubbles = make({
  id: 'spin.bubbles', name: 'Bubbles', tagline: 'Bubbles stream up the reels against the way they turn, catching the light.',
  params: [...tintP('#a8e6ff', '#ffffff'), num('count', 'Bubbles per reel', G('Look'), 12, 2, 40, 1, 'count', 'How many bubbles rise on each reel.', true), strengthP(), seedP(), durP()],
  cues: () => [{ t: 0.2, kind: 'tick', gain: 0.3, dur: 1.6, pitch: 1.2 }],
}, (f, T, _t, p, ctx, b, k) => {
  const c1 = hex(s(p, 'tint')), c2 = hex(s(p, 'tint2')), h = hhOf(n(p, 'seed'));
  eachReel(b, T, (r) => {
    for (let i = 0, N = L(ctx, n(p, 'count')); i < N; i++) {
      const ph = fract(-r.scroll * (0.12 + 0.08 * h(r.c, i * 5 + 1)) + h(r.c, i * 5 + 2)), y = r.bot - ph * r.H, x = r.x + (h(r.c, i * 5 + 3) - 0.5) * r.cell * 0.9 + Math.sin(T * 3 + i) * r.cell * 0.05, rad = (0.008 + 0.018 * h(r.c, i * 5 + 4)) * (0.6 + 0.4 * ph), a = Math.min(1, r.speed) * k * Math.sin(Math.PI * Math.min(1, ph * 1.05));
      f.additive.push({ x, y, hw: rad * 2, hh: rad * 2, rot: 0, type: 1, color: c1, intensity: 0.9 * a, e1: 0.12 });
      f.additive.push({ x: x - rad * 0.4, y: y - rad * 0.4, hw: rad * 0.45, hh: rad * 0.45, rot: 0, type: 0, color: c2, intensity: 1.0 * a, e1: 2 });
    }
  });
});

export const spinRails = make({
  id: 'spin.rails', name: 'Neon rails', tagline: 'Glowing rails run down both sides of every turning reel with bright pulses chasing along them.',
  params: [...tintP('#38e8ff', '#ff3ad0'), strengthP(), seedP(), durP()],
  cues: () => [{ t: 0.2, kind: 'sweep', gain: 0.3, dur: 1.7, pitch: 1.6 }],
}, (f, T, _t, p, _ctx, b, k) => {
  const c1 = hex(s(p, 'tint')), c2 = hex(s(p, 'tint2'));
  eachReel(b, T, (r) => {
    const a = Math.min(1, r.speed) * k;
    for (const side of [-1, 1]) {
      const x = r.x + side * r.cell * 0.52, col = side < 0 ? c1 : c2;
      f.additive.push({ x, y: (r.top + r.bot) / 2, hw: 0.012, hh: r.H * 0.5, rot: 0, type: 0, color: col, intensity: 0.9 * a, e1: 1.6 });
      f.additive.push({ x, y: (r.top + r.bot) / 2, hw: 0.04, hh: r.H * 0.5, rot: 0, type: 0, color: col, intensity: 0.28 * a, e1: 0.9 });
      for (let i = 0; i < 3; i++) {
        const y = r.top + fract(r.scroll * 0.3 * (side < 0 ? 1 : -1) + i / 3) * r.H;
        f.additive.push({ x, y, hw: 0.02, hh: 0.05 + 0.05 * r.speed, rot: 0, type: 0, color: mixRGB(col, [1, 1, 1], 0.6), intensity: 1.3 * a, e1: 1.4 });
      }
    }
  });
});

export const spinRumble: ShowEffect = {
  ...baseFx, id: 'spin.rumble', name: 'Rumble', tagline: 'The whole board vibrates while the reels spin, harder as they speed up, and settles with a thump when the last one stops.',
  params: [strengthP(), num('dust', 'Shaken dust', G('Look'), 1, 0, 2, 0.01, 'x', 'Specks of dust shaken off the board.'), seedP(), durP()],
  cues: () => [{ t: 0.2, kind: 'rumble', gain: 0.5, dur: 2.4 }],
  boardMod(t, p, ctx) {
    const D = n(p, 'duration'), b = board(ctx), T = t + (ctx.start ?? 0);
    let sum = 0; eachReel(b, T, (r) => { sum += Math.min(1, r.speed); });
    const avg = sum / b.cols, env = ENV(t, D) * n(p, 'strength');
    return { dx: Math.sin(T * 83) * 0.0024 * avg * env, dy: Math.cos(T * 71) * 0.0018 * avg * env, rattle: 0.25 * avg * env, bright: 1 + 0.05 * avg * env };
  },
  build(f, t, p, ctx) {
    const D = n(p, 'duration');
    if (t < 0 || t >= D) return;
    const b = board(ctx), T = t + (ctx.start ?? 0), k = ENV(t, D) * n(p, 'strength');
    let sum = 0; eachReel(b, T, (r) => { sum += Math.min(1, r.speed); });
    const avg = sum / b.cols;
    if (avg < 0.02) return;
    for (let i = 0, N = L(ctx, 22 * n(p, 'dust')); i < N; i++) {
      const hh = (kk: number) => h1(n(p, 'seed') * 61 + i * 11 + kk), ph = fract(T * (0.5 + 0.5 * hh(1)) + hh(2));
      f.additive.push({ x: b.box.x0 + hh(3) * (b.box.x1 - b.box.x0), y: b.box.y1 - 0.02 + ph * 0.2, hw: 0.006, hh: 0.006, rot: 0, type: 0, color: [0.9, 0.85, 0.75], intensity: 0.7 * avg * k * (1 - ph) * hh(4), e1: 2 });
    }
  },
};

export const SPIN_FX: ShowEffect[] = [spinStreaks, spinTrail, spinSparks, spinFire, spinEnergy, spinPlasma, spinSmoke, spinGlitter, spinDigital, spinFrost, spinWind, spinComets, spinRainbow, spinBubbles, spinRails, spinRumble];
