/**
 * Animated frames: chasing marquee bulbs, a neon tube that hums or fails, a shimmer that sweeps across, glints that race round the border
 * and a colour-cycling border. They are drawn round the box of whatever they are aimed at (a reel board, a plate, a symbol, a word).
 * Like the ambient loops they repeat seamlessly: everything is a function of t / loop with whole numbers of laps.
 */
import { color, enm, num } from '../../core/params';
import type { Frame, RGB } from '../engine/frame';
import { clamp, h1, hex, mixRGB, smoothstep } from '../engine/math';
import { n, s, type EffectCtx, type PValues, type ShowEffect } from './effect';

const G = (group: string) => ({ section: 'Effect', group });
const TAU = Math.PI * 2;
const fract = (x: number): number => x - Math.floor(x);
const Q = (ctx: EffectCtx, v: number): number => Math.max(1, Math.round(v * Math.max(0.3, ctx.quality ?? 1)));
const ints = (v: number): number => Math.max(1, Math.round(v));

const where = () => [
  num('cx', 'Centre X', G('Position'), 0.5, 0, 1, 0.001, '', 'Centre of the frame, as a fraction of the stage width (set for you when the effect is aimed at something).'),
  num('cy', 'Centre Y', G('Position'), 0.5, 0, 1, 0.001, '', 'Centre of the frame, as a fraction of the stage height.'),
  num('width', 'Frame width', G('Position'), 1.3, 0.2, 2, 0.01, '', 'Width when nothing is chosen, in stage heights.'),
  num('height', 'Frame height', G('Position'), 0.75, 0.1, 1.2, 0.005, '', 'Height when nothing is chosen.'),
];
function loopParams(o: { loop?: number; laps?: number; inset?: number; tint: string; tint2: string; strength?: number }) {
  return [
    ...where(),
    num('loop', 'Loop length', G('Timing'), o.loop ?? 6, 1, 30, 0.5, 's', 'After this long the frame is exactly where it started, so it can repeat with no seam.'),
    num('laps', 'Laps per loop', G('Timing'), o.laps ?? 2, 1, 12, 1, 'count', 'How many times the light goes round (whole numbers keep the loop seamless).', true),
    num('inset', 'Distance from the edge', G('Look'), o.inset ?? 0.014, -0.15, 0.25, 0.001, '', 'How far outside the edge it sits (negative = inside).'),
    color('tint', 'Colour', G('Look'), o.tint, 'The main colour.'),
    color('tint2', 'Second colour', G('Look'), o.tint2, 'The colour of the unlit bulbs, or the second colour.'),
    num('strength', 'Brightness', G('Look'), o.strength ?? 1, 0.2, 2.5, 0.01, 'x', 'How bright it is.'),
    num('fade', 'Fade in and out', G('Timing'), 0, 0, 2, 0.01, 's', 'Leave at 0 for a seamless loop; raise it to fade the frame in and out for a one-off.'),
  ];
}

interface Box { x0: number; y0: number; x1: number; y1: number; w: number; h: number }
/** The box the frame goes round: the board, the element the effect is aimed at, or the Frame size and Centre settings. */
function boxOf(p: PValues, ctx: EffectCtx): Box {
  const b = ctx.board?.box ?? ctx.silhouette?.box;
  if (b) return { ...b, w: b.x1 - b.x0, h: b.y1 - b.y0 };
  const cx = n(p, 'cx') * ctx.aspect, cy = n(p, 'cy'), w = n(p, 'width'), h = n(p, 'height');
  return { x0: cx - w / 2, x1: cx + w / 2, y0: cy - h / 2, y1: cy + h / 2, w, h };
}
/** A point on the box's outline, u ∈ [0, 1) round it from the top-left corner, clockwise, with the inset applied outwards. */
function onEdge(b: Box, u: number, inset: number): { x: number; y: number; tx: number; ty: number } {
  const w = b.w + inset * 2, h = b.h + inset * 2, x0 = b.x0 - inset, y0 = b.y0 - inset, per = 2 * (w + h), d = fract(u) * per;
  if (d < w) return { x: x0 + d, y: y0, tx: 1, ty: 0 };
  if (d < w + h) return { x: x0 + w, y: y0 + (d - w), tx: 0, ty: 1 };
  if (d < 2 * w + h) return { x: x0 + w - (d - w - h), y: y0 + h, tx: -1, ty: 0 };
  return { x: x0, y: y0 + h - (d - 2 * w - h), tx: 0, ty: -1 };
}
const perimeter = (b: Box, inset: number): number => 2 * (b.w + b.h + inset * 4);
const bulb = (f: Frame, x: number, y: number, r: number, col: RGB, k: number): void => {
  if (k <= 0.01) return;
  f.additive.push({ x, y, hw: r * 2.6, hh: r * 2.6, rot: 0, type: 0, color: col, intensity: 1.15 * k, e1: 2.2 });
  f.additive.push({ x, y, hw: r * 0.9, hh: r * 0.9, rot: 0, type: 0, color: mixRGB(col, [1, 1, 1], 0.6), intensity: 1.4 * k, e1: 2.6 });
};
const glint = (f: Frame, x: number, y: number, r: number, col: RGB, k: number): void => {
  if (k <= 0.01) return;
  f.additive.push({ x, y, hw: r, hh: r, rot: 0.2, type: 2, color: mixRGB(col, [1, 1, 1], 0.5), intensity: 1.2 * k });
};
const hsv = (h: number, sat = 0.85, v = 1): RGB => {
  const k = (m: number) => (m + h * 6) % 6, f = (m: number) => v - v * sat * Math.max(0, Math.min(k(m), 4 - k(m), 1));
  return [f(5), f(3), f(1)];
};
const envelope = (t: number, D: number, fade: number): number => (fade > 0 ? smoothstep(0, fade, t) * (1 - smoothstep(D - fade, D, t)) : 1);

const shared: Pick<ShowEffect, 'duration' | 'impactAt' | 'category' | 'cues'> = { duration: (p) => n(p, 'loop'), impactAt: () => 0, category: 'candidate', cues: () => [] };
const run = (fx: (f: Frame, u: number, p: PValues, ctx: EffectCtx, b: Box, k: number) => void): ShowEffect['build'] => (f, t, p, ctx) => {
  const D = n(p, 'loop');
  if (t < 0 || t >= D) return;
  const k = envelope(t, D, n(p, 'fade')) * n(p, 'strength');
  if (k <= 0.001) return;
  fx(f, t / D, p, ctx, boxOf(p, ctx), k);
};

// ---------------------------------------------------------------------------------------------------------------------
// Chasing marquee lights

export const frameChase: ShowEffect = {
  ...shared, id: 'frame.chase', name: 'Chasing lights', tagline: 'A row of marquee bulbs round the frame: a lit group runs round, the bulbs alternate, a wave rolls along, they twinkle, or they fill up one by one.',
  params: [...loopParams({ tint: '#ffd24a', tint2: '#7a3a10', laps: 2 }),
    enm('mode', 'How they light', G('Look'), 'run', [['run', 'A group of lights runs round'], ['alternate', 'Every other bulb blinks'], ['wave', 'A wave rolls along'], ['twinkle', 'Random twinkle'], ['fill', 'They fill up one by one']], 'The pattern of the lights.'),
    num('spacing', 'Space between bulbs', G('Look'), 0.05, 0.02, 0.15, 0.001, '', 'Distance between bulbs.'), num('bulb', 'Bulb size', G('Look'), 0.011, 0.004, 0.03, 0.0005, '', 'Radius of a bulb.'),
    num('lit', 'Lit part (run)', G('Look'), 0.3, 0.05, 0.9, 0.01, '', 'How much of the loop of lights is lit at once in the running pattern.')],
  build: run((f, u, p, ctx, b, k) => {
    const inset = n(p, 'inset'), per = perimeter(b, inset), N = Math.max(8, Math.round(Q(ctx, per / n(p, 'spacing')) / 2) * 2), laps = ints(n(p, 'laps')), mode = s(p, 'mode'), lit = n(p, 'lit');
    const c1 = hex(s(p, 'tint')), c2 = hex(s(p, 'tint2')), r = n(p, 'bulb');
    for (let i = 0; i < N; i++) {
      const q = onEdge(b, i / N, inset), pos = i / N;
      let on = 0;
      if (mode === 'run') { const d = fract(pos - u * laps); on = d < lit ? (1 - d / lit) ** 1.4 : 0; }
      else if (mode === 'alternate') on = (0.5 + 0.5 * Math.cos(TAU * (u * laps + (i % 2) * 0.5))) ** 1.5;
      else if (mode === 'wave') on = (0.5 + 0.5 * Math.sin(TAU * (pos * 4 - u * laps))) ** 2;
      else if (mode === 'twinkle') on = Math.max(0, Math.sin(TAU * ((1 + Math.floor(h1(i * 3.1) * 3)) * laps * u + h1(i * 7.7)))) ** 3;
      else on = pos < fract(u * laps) ? 1 : 0;
      bulb(f, q.x, q.y, r, mixRGB(c2, c1, 0.25 + 0.75 * on), (0.28 + 0.9 * on) * k);
    }
  }),
};

// ---------------------------------------------------------------------------------------------------------------------
// Neon tube

export const frameNeon: ShowEffect = {
  ...shared, id: 'frame.neon', name: 'Neon tube', tagline: 'A glowing neon tube round the frame: steady with a faint hum, buzzing, breathing, or a tired sign that flickers and drops out in places.',
  params: [...loopParams({ tint: '#3affea', tint2: '#ff3ad0', laps: 1, strength: 1, inset: 0.012 }),
    enm('mode', 'How it behaves', G('Look'), 'buzz', [['steady', 'Steady'], ['buzz', 'A faint buzz'], ['breathing', 'Slow breathing'], ['failing', 'A failing sign'], ['two', 'Two colours chasing']], 'How the tube lights.'),
    num('thick', 'Tube thickness', G('Look'), 0.011, 0.004, 0.03, 0.0005, '', 'Radius of the tube.')],
  build: run((f, u, p, ctx, b, k) => {
    const mode = s(p, 'mode'), inset = n(p, 'inset'), th = n(p, 'thick'), c1 = hex(s(p, 'tint')), c2 = hex(s(p, 'tint2')), SEG = 12, laps = ints(n(p, 'laps'));
    const hum = 0.92 + 0.08 * Math.sin(TAU * 29 * u);
    for (let sg = 0; sg < SEG; sg++) {
      const u0 = sg / SEG, u1 = (sg + 1) / SEG, a = onEdge(b, u0 + 1e-4, inset), e = onEdge(b, u1 - 1e-4, inset);
      let level = 1, col = c1;
      if (mode === 'buzz') level = 0.85 + 0.15 * Math.sin(TAU * 41 * u + sg) * (h1(Math.floor(u * 36) + sg * 3) > 0.15 ? 1 : 0.3);
      else if (mode === 'breathing') level = 0.55 + 0.45 * (0.5 + 0.5 * Math.sin(TAU * laps * u));
      else if (mode === 'failing') { const step = Math.floor(u * 28), dead = h1(sg * 13 + step * 3.7) < 0.22, flick = h1(sg * 5 + Math.floor(u * 140)) > 0.5; level = dead ? (flick ? 0.35 : 0.04) : 1; }
      else if (mode === 'two') { const d = fract(u0 - u * laps); col = d < 0.5 ? c1 : c2; level = 0.7 + 0.3 * Math.sin(TAU * (u * laps - u0)); }
      level *= hum;
      // a segment that turns a corner is drawn as two straight halves so the tube follows the frame's outline
      const corner = Math.abs(a.tx - e.tx) + Math.abs(a.ty - e.ty) > 0;
      const pieces = corner ? [[a, onEdge(b, (u0 + u1) / 2, inset)], [onEdge(b, (u0 + u1) / 2, inset), e]] as const : [[a, e]] as const;
      for (const [p0, p1] of pieces) {
        const hz = Math.abs(p1.x - p0.x) >= Math.abs(p1.y - p0.y), l2 = Math.max(Math.abs(p1.x - p0.x), Math.abs(p1.y - p0.y)) / 2 + th * 0.6;
        const cx = (p0.x + p1.x) / 2, cy = (p0.y + p1.y) / 2, rr = hz ? 0 : Math.PI / 2;
        f.additive.push({ x: cx, y: cy, hw: l2, hh: th * 4.2, rot: rr, type: 0, color: col, intensity: 0.85 * level * k, e1: 0.9 });
        f.additive.push({ x: cx, y: cy, hw: l2, hh: th, rot: rr, type: 0, color: mixRGB(col, [1, 1, 1], 0.55), intensity: 2.1 * level * k, e1: 1.6 });
      }
    }
  }),
};

// ---------------------------------------------------------------------------------------------------------------------
// Shimmer sweep

export const frameShimmer: ShowEffect = {
  ...shared, id: 'frame.shimmer', name: 'Shimmer sweep', tagline: 'A band of light sweeps diagonally across the frame, flaring at the edges where it passes.',
  params: [...loopParams({ tint: '#fff2c0', tint2: '#ffffff', laps: 1, inset: 0, loop: 4 }),
    num('angle', 'Angle', G('Look'), 25, -80, 80, 1, 'deg', 'How the band leans.'), num('band', 'Band width', G('Look'), 0.1, 0.02, 0.4, 0.005, '', 'Width of the band.'),
    num('pause', 'Pause between sweeps', G('Timing'), 0.3, 0, 0.8, 0.01, '', 'The part of each lap with no band on screen.')],
  build: run((f, u, p, ctx, b, k) => {
    const laps = ints(n(p, 'laps')), pr = fract(u * laps), pause = n(p, 'pause'), a = (n(p, 'angle') * Math.PI) / 180, bw = n(p, 'band'), c1 = hex(s(p, 'tint')), c2 = hex(s(p, 'tint2')), ins = n(p, 'inset');
    const sweep = pr < 1 - pause ? pr / (1 - pause) : -1;
    if (sweep < 0) return;
    const ax = Math.cos(a), ay = Math.sin(a), dx = -ay, dy = ax;           // across the band, and along it
    const cs = [[b.x0, b.y0], [b.x1, b.y0], [b.x0, b.y1], [b.x1, b.y1]].map(([x, y]) => x! * ax + y! * ay), lo = Math.min(...cs) - bw, hi = Math.max(...cs) + bw;
    const c = lo + (hi - lo) * sweep, fadeEnds = Math.sin(Math.PI * clamp(sweep));
    const R = Math.hypot(b.w, b.h) / 2, mx = (b.x0 + b.x1) / 2, my = (b.y0 + b.y1) / 2, base = c - (mx * ax + my * ay), step = bw * 0.7, N = Math.ceil((R * 2) / step);
    for (let i = 0; i <= N; i++) {
      const tt = -R + (i / N) * R * 2, x = mx + ax * base + dx * tt, y = my + ay * base + dy * tt;
      if (x < b.x0 - ins || x > b.x1 + ins || y < b.y0 - ins || y > b.y1 + ins) continue;
      f.additive.push({ x, y, hw: bw * 0.5, hh: step * 0.8, rot: a, type: 0, color: c1, intensity: 0.55 * fadeEnds * k, e1: 1.1 });
    }
    // flares where the band crosses the edges of the frame
    for (const edge of [b.y0 - ins, b.y1 + ins]) {
      if (Math.abs(dy) < 1e-3) continue;
      const tt = (edge - (my + ay * base)) / dy, x = mx + ax * base + dx * tt;
      if (x >= b.x0 - ins && x <= b.x1 + ins) glint(f, x, edge, 0.06 * (0.6 + 0.4 * fadeEnds), c2, fadeEnds * k);
    }
    for (const edge of [b.x0 - ins, b.x1 + ins]) {
      if (Math.abs(dx) < 1e-3) continue;
      const tt = (edge - (mx + ax * base)) / dx, y = my + ay * base + dy * tt;
      if (y >= b.y0 - ins && y <= b.y1 + ins) glint(f, edge, y, 0.05 * (0.6 + 0.4 * fadeEnds), c2, fadeEnds * k);
    }
  }),
};

// ---------------------------------------------------------------------------------------------------------------------
// Glints racing round the border

export const frameSparkle: ShowEffect = {
  ...shared, id: 'frame.sparkle', name: 'Racing glints', tagline: 'Bright glints race round the border leaving a short glittering trail, at different speeds.',
  params: [...loopParams({ tint: '#ffe08a', tint2: '#ffffff', laps: 2, inset: 0.004, loop: 5 }), num('count', 'Glints', G('Look'), 5, 1, 16, 1, 'count', 'How many glints run round.', true), num('size', 'Size', G('Look'), 1, 0.4, 3, 0.01, 'x', 'How big the glints are.')],
  build: run((f, u, p, ctx, b, k) => {
    const N = Q(ctx, Math.round(n(p, 'count'))), laps = ints(n(p, 'laps')), inset = n(p, 'inset'), c1 = hex(s(p, 'tint')), c2 = hex(s(p, 'tint2')), sz = n(p, 'size');
    for (let i = 0; i < N; i++) {
      const lap = laps * (1 + (i % 2)), head = fract(i / N + u * lap), tw = 0.75 + 0.25 * Math.sin(TAU * (3 + (i % 3)) * u + i);
      for (let j = 0; j < 7; j++) {
        const tail = j * 0.006 * (1 / (b.w + b.h)) * 2, q = onEdge(b, head - tail, inset), fadeJ = (1 - j / 7) ** 1.6;
        if (j === 0) { glint(f, q.x, q.y, 0.075 * sz * tw, c2, k); bulb(f, q.x, q.y, 0.009 * sz, c1, 1.0 * k); }
        else bulb(f, q.x, q.y, 0.006 * sz * (1 - j / 9), c1, 0.7 * fadeJ * k);
      }
    }
  }),
};

// ---------------------------------------------------------------------------------------------------------------------
// Colour-cycling border

export const frameRainbow: ShowEffect = {
  ...shared, id: 'frame.rainbow', name: 'Colour-cycling border', tagline: 'A border of bulbs whose colours flow round the frame in a spectrum, the way gaming lights do.',
  params: [...loopParams({ tint: '#ffffff', tint2: '#000000', laps: 1, loop: 6, inset: 0.012 }), num('spacing', 'Space between bulbs', G('Look'), 0.035, 0.015, 0.12, 0.001, '', 'Distance between bulbs.'), num('bulb', 'Bulb size', G('Look'), 0.009, 0.004, 0.03, 0.0005, '', 'Radius of a bulb.'), num('bands', 'Colour bands', G('Look'), 1, 1, 4, 1, 'count', 'How many times the spectrum repeats round the frame.', true)],
  build: run((f, u, p, ctx, b, k) => {
    const inset = n(p, 'inset'), per = perimeter(b, inset), N = Math.max(8, Q(ctx, Math.round(per / n(p, 'spacing')))), laps = ints(n(p, 'laps')), bands = ints(n(p, 'bands')), r = n(p, 'bulb');
    for (let i = 0; i < N; i++) { const q = onEdge(b, i / N, inset); bulb(f, q.x, q.y, r, hsv(fract((i / N) * bands - u * laps)), k); }
  }),
};

export const FRAME_FX: ShowEffect[] = [frameChase, frameNeon, frameShimmer, frameSparkle, frameRainbow];
