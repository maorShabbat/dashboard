/**
 * Transitions between screens: moments where the picture changes from one screen (the one behind) to another. Fire burns through the
 * first screen, smoke and ink cover it, ice freezes and shatters it, glass breaks, lasers scan or cut it, and so on. Every one is
 * a pure function of time: the player asks for the frame at t, the renderer mixes the two screens per pixel and draws the particles,
 * flames and pieces on top. After the change the new screen stays up (`holdsEnd`).
 */
import { makeRng } from '../../core/util/prng';
import { color, enm, num } from '../../core/params';
import { DISTORT, FIRE_PALETTES, SCREEN_A, TR, type Frame, type RGB, type Transition } from '../engine/frame';
import { discharge, ribbon, slice } from '../engine/lightning';
import { clamp, easeInQuad, easeOutCubic, easeOutQuart, h1, hex, lerp, mixRGB, smoothstep } from '../engine/math';
import { n, s, type PValues, type ShowEffect } from './effect';
import { drawPieces, linePieces, segment, voronoiPieces, type Piece, type Pt } from './pieces';
import { fireball, flame, setVolPalette, smokePuff } from './volume';
import { triPoly } from './helpers';

const G = (group: string) => ({ section: 'Effect', group });
const durP = (def: number, min = 0.4, max = 5) => num('duration', 'Transition length', G('Timing'), def, min, max, 0.01, 's', 'How long the change from one screen to the other takes.');
const holdP = () => num('hold', 'Keep the new screen', G('Timing'), 0.7, 0, 4, 0.01, 's', 'How long the new screen stays up after the change, so the preview shows where it ends up.');
const seedP = (def = 3) => num('seed', 'Variation', G('Look'), def, 1, 99, 1, '', 'Pick a different arrangement of the effect.', true);
const strengthP = (def = 1) => num('strength', 'Strength', G('Look'), def, 0.3, 2, 0.01, 'x', 'How big and bright the flames, light and debris are.');
const dirP = (def: string) => enm('dir', 'Direction', G('Look'), def, [['up', 'Upward'], ['down', 'Downward'], ['right', 'To the right'], ['left', 'To the left']], 'Which way the change travels across the screen.');
const centreP = (x = 0.5, y = 0.5) => [
  num('cx', 'Centre X', G('Position'), x, 0, 1, 0.001, '', 'Where the change starts, as a fraction of the screen width.'),
  num('cy', 'Centre Y', G('Position'), y, 0, 1, 0.001, '', 'Where the change starts, as a fraction of the screen height.'),
];
const fireP = (def = 'fire') => enm('fire', 'Fire colour', G('Look'), def, [['fire', 'Orange fire'], ['blue', 'Blue flame'], ['green', 'Green fire'], ['violet', 'Violet fire'], ['white', 'White-hot']], 'The colour of the flames.');
const smokeToneP = (def = 'grey') => enm('smoke', 'Smoke', G('Look'), def, [['grey', 'Grey'], ['black', 'Black soot'], ['white', 'White steam'], ['toxic', 'Toxic green'], ['ice', 'Cold mist'], ['purple', 'Magic purple'], ['sand', 'Dust']], 'The colour of the smoke.');

const DIRS: Record<string, [number, number]> = { up: [0, -1], down: [0, 1], right: [1, 0], left: [-1, 0] };
const dirOf = (p: PValues): [number, number] => DIRS[s(p, 'dir')] ?? DIRS.up!;

const total = (p: PValues) => n(p, 'duration') + n(p, 'hold');

function setTr(f: Frame, kind: number, progress: number, o: Partial<Transition> = {}): void {
  f.transition = { kind, progress, seed: 0, mode: 0, p: [0, 0, 0, 0], d: [1, 0, 0, 0], q: [4, 8, 0, 0], c1: [1, 1, 1], c2: [1, 1, 1], ...o };
}

/** The same hash the shader uses (hash21), so effects can place light exactly where the shader draws its edge. */
const fract = (x: number) => x - Math.floor(x);
function hash21(x: number, y: number): number {
  let a = fract(x * 0.1031), b = fract(y * 0.1031), c = fract(x * 0.1031);
  const d = a * (b + 33.33) + b * (c + 33.33) + c * (a + 33.33);
  a += d; b += d; c += d;
  return fract((a + b) * c);
}

const firePal = (p: PValues) => FIRE_PALETTES[s(p, 'fire')] ?? FIRE_PALETTES.fire!;
const edgeColors = (p: PValues, gain = 1): [RGB, RGB] => { const pal = firePal(p), hot = mixRGB(pal[2]!, pal[3]!, 0.35); return [[pal[1]![0] * 1.5 * gain, pal[1]![1] * 1.5 * gain, pal[1]![2] * 1.5 * gain], [hot[0] * 1.6 * gain, hot[1] * 1.6 * gain, hot[2] * 1.6 * gain]]; };

// ---------------------------------------------------------------------------------------------------------------------
// The geometry of a front (the line where one screen turns into the other), the same maths as the shader's.

interface Front { aspect: number; dir: [number, number]; ext: number; extPerp: number; pad: number; radial: boolean; cx: number; cy: number; R: number }
function front(aspect: number, dir: [number, number], pad: number, radial = false, cx = 0.5, cy = 0.5): Front {
  const l = Math.hypot(dir[0], dir[1]) || 1, d: [number, number] = [dir[0] / l, dir[1] / l];
  const C = { x: cx * aspect, y: cy };
  const R = Math.max(Math.hypot(C.x, C.y), Math.hypot(aspect - C.x, C.y), Math.hypot(C.x, 1 - C.y), Math.hypot(aspect - C.x, 1 - C.y));
  return { aspect, dir: d, ext: Math.abs(d[0]) * aspect + Math.abs(d[1]), extPerp: Math.abs(d[1]) * aspect + Math.abs(d[0]), pad, radial, cx: C.x, cy: C.y, R };
}
const frontT = (g: Front, u: number): number => lerp(-g.pad, 1 + g.pad, u);
/** A point on the front at progress u: `w` ∈ [0, 1] along it (or the angle fraction, for a radial front), `jit` pushes it ahead (+) or behind (-) in field units. */
function frontPoint(g: Front, u: number, w: number, jit = 0): Pt {
  const t = frontT(g, u) + jit;
  if (g.radial) { const a = w * Math.PI * 2; return { x: g.cx + Math.cos(a) * t * g.R, y: g.cy + Math.sin(a) * t * g.R }; }
  const px = -g.dir[1], py = g.dir[0];
  return { x: g.aspect / 2 + g.dir[0] * (t - 0.5) * g.ext + px * (w - 0.5) * g.extPerp, y: 0.5 + g.dir[1] * (t - 0.5) * g.ext + py * (w - 0.5) * g.extPerp };
}
/** Direction the front is heading (flames lean into the screen that is still to burn). */
const heading = (g: Front, w: number): [number, number] => {
  if (g.radial) { const a = w * Math.PI * 2; return [Math.cos(a), Math.sin(a)]; }
  const x = g.dir[0] * 0.35, y = g.dir[1] * 0.35 - 1, l = Math.hypot(x, y);      // flames rise, leaning into the way the fire is travelling
  return [x / l, y / l];
};
const tilt = (d: [number, number]): number => Math.atan2(d[0], -d[1]);

/** The shader's value noise and fbm, ported so effects can stand exactly on the line the shader burns, freezes or tears. */
function vnoiseJS(x: number, y: number): number {
  const ix = Math.floor(x), iy = Math.floor(y);
  let fx = x - ix, fy = y - iy; fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
  return lerp(lerp(hash21(ix, iy), hash21(ix + 1, iy), fx), lerp(hash21(ix, iy + 1), hash21(ix + 1, iy + 1), fx), fy);
}
function fbmJS(x: number, y: number): number {
  let amp = 0.5, sum = 0;
  for (let i = 0; i < 4; i++) { sum += amp * vnoiseJS(x, y); const nx = x * 2.03 + 17.1, ny = y * 2.03 + 9.2; x = nx; y = ny; amp *= 0.5; }
  return sum;
}
/** The point on the burning edge at progress u, `w` along it (or the angle fraction for a radial front), exactly where the FRONT shader puts it. */
function burnLine(g: Front, u: number, w: number, o: { nAmt: number; ns: number; seed: number }): Pt {
  const t = frontT(g, u);
  let s = t;
  let P = frontPoint(g, 0, w);
  for (let i = 0; i < 7; i++) {
    const pos = (v: number): Pt => frontPoint(g, (v + g.pad) / (1 + 2 * g.pad), w);
    P = pos(s);
    const base = fbmJS(P.x * o.ns + o.seed, P.y * o.ns + o.seed), fray = fbmJS(P.x * o.ns * 3.3 + o.seed * 1.9, P.y * o.ns * 3.3 + u * 2);
    s = t - ((base - 0.5) * o.nAmt + (fray - 0.5) * o.nAmt * 0.16);
  }
  return frontPoint(g, (s + g.pad) / (1 + 2 * g.pad), w);
}

// ---------------------------------------------------------------------------------------------------------------------
// Fire

function burnLike(f: Frame, t: number, p: PValues, o: { aspect: number; D: number; flames: number; flameW: number; flameH: number; edgeW: number; charW: number; nAmt: number; heat: number; radial?: boolean; fireballs?: number; glow: number }): void {
  const u = clamp(t / o.D), dir = dirOf(p), k = n(p, 'strength'), seed = n(p, 'seed');
  const cx = p.cx !== undefined ? n(p, 'cx') : 0.5, cy = p.cy !== undefined ? n(p, 'cy') : 0.5;
  const pad = o.nAmt * 0.5 + o.edgeW * 2.5 + o.charW + 0.03;
  const g = front(o.aspect, dir, pad, o.radial, cx, cy), [c1, c2] = edgeColors(p);
  setVolPalette(f, s(p, 'fire'), s(p, 'smoke'));
  setTr(f, TR.front, u, { seed, mode: o.radial ? 1 : 0, p: [o.edgeW, o.charW, o.nAmt, o.heat], d: [dir[0], dir[1], g.cx, g.cy], q: [3.5, 14, 0, 0], c1, c2 });
  const live = smoothstep(0, 0.05, u) * (1 - smoothstep(0.94, 1, u));
  if (live <= 0) return;
  const pal = firePal(p), col = mixRGB(pal[1]!, pal[2]!, 0.5), nz = { nAmt: o.nAmt, ns: 3.5, seed };
  const flameRank = (count: number, w0: number, h0: number, salt: number, lean: number): void => {
    for (let i = 0; i < count; i++) {
      const hh = (kk: number) => h1(seed * 97 + salt * 31 + i * 13 + kk);
      const w = (i + hh(1)) / count, ahead = (hh(2) - 0.25) * 0.07, head = heading(g, w), line = burnLine(g, u, w, nz), base = { x: line.x + head[0] * ahead, y: line.y + head[1] * ahead }, tl = t + hh(3) * 5;
      const ph = 0.5 + 0.5 * Math.sin(tl * (5 + 4 * hh(4)) + i * 1.7), burst = 0.75 + 0.25 * Math.sin(tl * 2.3 + hh(8) * 6);
      const len = h0 * k * lerp(0.55, 1.25, hh(5)) * (0.7 + 0.3 * ph) * burst * live;
      flame(f, { x: base.x, y: base.y, w: w0 * k * lerp(0.8, 1.3, hh(6)), h: len, age: 0.04 + 0.22 * hh(7), seed: seed + salt + i * 3.7, t: tl, heat: 1, alpha: 1, rot: tilt(head) + Math.sin(tl * 2.6 + i) * lean, soft: true });
    }
  };
  flameRank(o.flames, o.flameW * 1.25, o.flameH, 0, 0.14);                           // tall tongues
  flameRank(Math.round(o.flames * 1.7), o.flameW * 0.9, o.flameH * 0.55, 7, 0.2);      // a lower, busier row
  flameRank(Math.round(o.flames * 2.6), o.flameW * 0.6, o.flameH * 0.28, 13, 0.3);     // and a fringe of small flickers that hides the join with the edge
  for (let i = 0; i < (o.fireballs ?? 0); i++) {
    const hh = (kk: number) => h1(seed * 53 + i * 19 + kk);
    const w = (i + 0.5 + (hh(1) - 0.5) * 0.6) / (o.fireballs ?? 1), base = frontPoint(g, u, w, (hh(2) - 0.3) * o.nAmt), tl = t + hh(3) * 4, pulse = 0.85 + 0.15 * Math.sin(tl * 7 + i * 2);
    fireball(f, { x: base.x, y: base.y, size: 0.09 * k * lerp(0.8, 1.3, hh(4)) * pulse * live, age: 0.12 + 0.2 * hh(5), seed: seed + i * 5.3, t: tl, heat: 1, alpha: 0.95 });
  }
  const glowN = Math.round(o.flames / 2) + 2;
  for (let i = 0; i < glowN; i++) {
    const w = (i + 0.5) / glowN, b = frontPoint(g, u, w), r = (g.radial ? 0.2 : (g.extPerp / glowN) * 0.9) * o.glow;
    f.additive.push({ x: b.x, y: b.y, hw: r, hh: r, rot: 0, type: 0, color: col, intensity: 0.3 * live * k, e1: 1.2 });
  }
  // sparks: streaks that stretch along their flight, and a few round embers
  const M = 56;
  for (let i = 0; i < M; i++) {
    const hh = (kk: number) => h1(seed * 31 + i * 7 + kk), speed = 0.55 + 0.6 * hh(1), ph = fract(t * speed + hh(2)), w = hh(3), head = heading(g, w), b = burnLine(g, u, w, nz);
    const at = (q: number): Pt => { const rise = q * 0.55 * k * (0.6 + hh(9)), wob = Math.sin(q * 7 + i) * 0.02 * q; return { x: b.x + head[0] * rise - head[1] * wob + (hh(10) - 0.5) * 0.12 * q, y: b.y + head[1] * rise + head[0] * wob }; };
    const P0 = at(ph), P1 = at(ph + 0.02), ang = Math.atan2(P1.y - P0.y, P1.x - P0.x), fade = (1 - ph) ** 1.4 * live * (0.55 + 0.45 * Math.sin(t * 22 + i * 3)), c = mixRGB(col, [1, 0.92, 0.65], hh(6) * 0.6);
    if (hh(5) > 0.35) f.additive.push({ x: P0.x - Math.cos(ang) * 0.02, y: P0.y - Math.sin(ang) * 0.02, hw: lerp(0.02, 0.05, hh(7)), hh: 0.0028, rot: ang, type: 4, color: c, intensity: 1.6 * fade, e1: 1.5 });
    else f.additive.push({ x: P0.x, y: P0.y, hw: 0.011, hh: 0.011, rot: 0, type: 0, color: c, intensity: 1.4 * fade, e1: 2.2 });
  }
  // flakes of ash that drift up out of the char
  for (let i = 0; i < 14; i++) {
    const hh = (kk: number) => h1(seed * 77 + i * 11 + kk), ph = fract(t * 0.3 + hh(1)), w = hh(2), head = heading(g, w), b = burnLine(g, u, w, nz);
    const rise = (0.05 + 0.5 * ph) * k, ax = b.x + head[0] * rise + Math.sin(ph * 6 + i) * 0.03, ay = b.y + head[1] * rise;
    f.alphaSprites.push({ x: ax, y: ay, hw: 0.006 + 0.008 * hh(4), hh: 0.003 + 0.004 * hh(4), rot: ph * 6 + i, type: 5, color: [0.06, 0.05, 0.05], intensity: 0.8 * (1 - ph) * live });
  }
  for (let i = 0; i < 9; i++) {
    const hh = (kk: number) => h1(seed * 71 + i * 11 + kk), ph = fract(t * 0.42 + hh(1)), w = hh(2), head = heading(g, w), b = frontPoint(g, u, w, (hh(3) - 0.5) * o.nAmt);
    const sz = 0.11 * k * (0.5 + 0.9 * ph);
    smokePuff(f, { x: b.x + head[0] * (0.06 + 0.4 * ph) - head[1] * Math.sin(ph * 4 + i) * 0.03, y: b.y + head[1] * (0.06 + 0.4 * ph) + head[0] * Math.sin(ph * 4 + i) * 0.03, size: sz, age: ph, seed: seed + i * 2.9, t: ph * 2.4, alpha: 0.55 * live * Math.sin(Math.PI * Math.min(1, ph * 1.15)), heat: 0.5 * (1 - ph), light: [0.3, -0.9], soft: 0.5 });
  }
}


const cueFire = (p: PValues) => [{ t: 0, kind: 'whoosh' as const, gain: 0.7, dur: n(p, 'duration'), pitch: 0.6 }, { t: 0.1, kind: 'rumble' as const, gain: 0.6, dur: n(p, 'duration') * 0.9 }];

export const burn: ShowEffect = {
  id: 'transition.burn', name: 'Burn through', tagline: 'The first screen catches fire and burns away like paper, flames licking along the edge, until the next screen is all that is left.', category: 'candidate', transition: true, holdsEnd: true,
  params: [dirP('up'), fireP(), smokeToneP('black'), strengthP(), num('flames', 'Flames', G('Look'), 22, 4, 40, 1, 'count', 'Flame tongues along the burning edge.', true), seedP(), durP(1.9), holdP()],
  duration: total, impactAt: () => 0.2, cues: cueFire,
  build(f, t, p, ctx) { if (t < 0) return; burnLike(f, t, p, { aspect: ctx.aspect, D: n(p, 'duration'), flames: Math.round(n(p, 'flames')), flameW: 0.2, flameH: 0.36, edgeW: 0.028, charW: 0.09, nAmt: 0.38, heat: 0.012, glow: 1 }); },
};

export const fireWall: ShowEffect = {
  id: 'transition.fire-wall', name: 'Wall of fire', tagline: 'A towering wall of flame and rolling fireballs sweeps across the screen, and the next screen is standing behind it.', category: 'candidate', transition: true, holdsEnd: true,
  params: [dirP('right'), fireP(), smokeToneP('black'), strengthP(), num('flames', 'Flames', G('Look'), 24, 6, 40, 1, 'count', 'Flame tongues in the wall.', true), seedP(), durP(1.7), holdP()],
  duration: total, impactAt: () => 0.2, cues: (p) => [...cueFire(p), { t: 0.15, kind: 'thump' as const, gain: 0.5 }],
  build(f, t, p, ctx) {
    if (t < 0) return;
    burnLike(f, t, p, { aspect: ctx.aspect, D: n(p, 'duration'), flames: Math.round(n(p, 'flames')), flameW: 0.24, flameH: 0.5, edgeW: 0.06, charW: 0.02, nAmt: 0.22, heat: 0.03, fireballs: 6, glow: 1.4 });
    f.exposure *= 1 + 0.06 * Math.sin(Math.PI * clamp(t / n(p, 'duration')));
  },
};

export const burnHole: ShowEffect = {
  id: 'transition.burn-hole', name: 'Burn a hole', tagline: 'A hole burns open in the first screen and grows outward in a ring of flame, showing the next screen through it.', category: 'candidate', transition: true, holdsEnd: true,
  params: [...centreP(), fireP(), smokeToneP('black'), strengthP(), num('flames', 'Flames', G('Look'), 34, 8, 56, 1, 'count', 'Flame tongues around the ring.', true), seedP(), durP(1.9), holdP()],
  duration: total, impactAt: () => 0.1, cues: cueFire,
  build(f, t, p, ctx) { if (t < 0) return; burnLike(f, t, p, { aspect: ctx.aspect, D: n(p, 'duration'), flames: Math.round(n(p, 'flames')), flameW: 0.19, flameH: 0.3, edgeW: 0.03, charW: 0.08, nAmt: 0.34, heat: 0.012, radial: true, glow: 0.8 }); },
};

// ---------------------------------------------------------------------------------------------------------------------
// Smoke and ink

export const smoke: ShowEffect = {
  id: 'transition.smoke', name: 'Smoke cover', tagline: 'Billowing smoke rolls over the screen until nothing shows, and when it clears the next screen is there.', category: 'candidate', transition: true, holdsEnd: true,
  params: [dirP('up'), smokeToneP('grey'), strengthP(), num('puffs', 'Smoke density', G('Look'), 1, 0.5, 1.6, 0.05, 'x', 'How many clouds roll over the screen.'), seedP(), durP(2.4), holdP()],
  duration: total, impactAt: (p) => n(p, 'duration') * 0.5,
  cues: (p) => [{ t: 0, kind: 'whoosh', gain: 0.6, dur: n(p, 'duration') * 0.5, pitch: 0.7 }, { t: n(p, 'duration') * 0.5, kind: 'whoosh', gain: 0.4, dur: n(p, 'duration') * 0.45, pitch: 0.6 }],
  build(f, t, p, ctx) {
    if (t < 0) return;
    const D = n(p, 'duration'), u = clamp(t / D), seed = n(p, 'seed'), dir = dirOf(p), k = n(p, 'strength'), a = ctx.aspect;
    setVolPalette(f, 'fire', s(p, 'smoke'));
    const pal = setPalette(s(p, 'smoke'));
    setTr(f, TR.cover, u, { seed, mode: 0, p: [0.28, 0.55, 1.0, 0.5], d: [dir[0], dir[1], a / 2, 0.5], q: [3, 8, 0, 0], c1: pal.shadow, c2: pal.lit });
    const g = front(a, dir, 0), cols = Math.max(3, Math.round(6 * n(p, 'puffs'))), rows = Math.max(3, Math.round(4 * n(p, 'puffs')));
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const hh = (kk: number) => h1(seed * 37 + r * 101 + c * 13 + kk);
      const x = ((c + 0.5 + (hh(1) - 0.5) * 0.7) / cols) * a, y = (r + 0.5 + (hh(2) - 0.5) * 0.7) / rows;
      const fp = clamp((x - a / 2) * g.dir[0] / g.ext + (y - 0.5) * g.dir[1] / g.ext + 0.5);
      const birth = 0.03 + 0.38 * fp + hh(3) * 0.05, clear = 0.54 + 0.3 * fp + hh(4) * 0.05;
      const alpha = smoothstep(birth, birth + 0.16, u) * (1 - smoothstep(clear, clear + 0.2, u));
      if (alpha <= 0.01) continue;
      const tl = Math.max(0, (u - birth) * D), grow = 0.55 + 0.45 * easeOutCubic((u - birth) / 0.3), size = 0.4 * k * lerp(0.85, 1.3, hh(5)) * grow;
      smokePuff(f, { x: x + Math.sin(tl * 0.8 + c) * 0.02, y: y - 0.06 * u * (1 + hh(6)), size, age: clamp((u - clear) / 0.3) * 0.7, seed: seed + r * 7.1 + c * 2.3, t: tl, alpha: 0.95 * alpha, heat: 0, light: [0.35, -0.85], soft: 0.35 });
    }
  },
};

function setPalette(tone: string): { shadow: RGB; lit: RGB } {
  const T: Record<string, { shadow: RGB; lit: RGB }> = {
    grey: { shadow: [0.09, 0.09, 0.11], lit: [0.55, 0.55, 0.6] }, black: { shadow: [0.02, 0.02, 0.03], lit: [0.2, 0.19, 0.2] }, white: { shadow: [0.5, 0.53, 0.62], lit: [0.95, 0.96, 1] },
    toxic: { shadow: [0.04, 0.18, 0.06], lit: [0.45, 0.85, 0.35] }, ice: { shadow: [0.28, 0.42, 0.6], lit: [0.88, 0.96, 1] }, purple: { shadow: [0.12, 0.05, 0.25], lit: [0.62, 0.42, 0.9] }, sand: { shadow: [0.22, 0.16, 0.09], lit: [0.8, 0.7, 0.5] },
  };
  return T[tone] ?? T.grey!;
}

export const ink: ShowEffect = {
  id: 'transition.ink', name: 'Ink bleed', tagline: 'Ink blooms from a point and floods the screen; it drains away to leave the next screen.', category: 'candidate', transition: true, holdsEnd: true,
  params: [...centreP(), color('tint', 'Ink', G('Look'), '#0a0a14', 'Colour of the ink.'), seedP(), durP(1.6), holdP()],
  duration: total, impactAt: (p) => n(p, 'duration') * 0.5,
  cues: (p) => [{ t: 0, kind: 'whoosh', gain: 0.4, dur: n(p, 'duration') * 0.5, pitch: 0.5 }, { t: n(p, 'duration') * 0.5, kind: 'whoosh', gain: 0.3, dur: n(p, 'duration') * 0.4, pitch: 0.4 }],
  build(f, t, p, ctx) {
    if (t < 0) return;
    const u = clamp(t / n(p, 'duration')), ink = hex(s(p, 'tint'));
    setTr(f, TR.cover, u, { seed: n(p, 'seed'), mode: 1, p: [0.05, 0.65, 1.0, 0.5], d: [1, 0, n(p, 'cx') * ctx.aspect, n(p, 'cy')], q: [2.6, 8, 0, 0], c1: ink, c2: mixRGB(ink, [1, 1, 1], 0.1) });
  },
};

// ---------------------------------------------------------------------------------------------------------------------
// Ice and glass

function mist(f: Frame, tone: string, a: number, seed: number, t: number, u0: number, u1: number, count: number, alpha: number, at: (i: number) => Pt): void {
  setVolPalette(f, 'fire', tone);
  for (let i = 0; i < count; i++) {
    const hh = (kk: number) => h1(seed * 17 + i * 5 + kk), born = lerp(u0, u1, hh(1)), age = clamp((t - born) / 1.6);
    if (t < born || age >= 1) continue;
    const o = at(i);
    smokePuff(f, { x: o.x + (hh(2) - 0.5) * 0.1 * age, y: o.y - 0.12 * easeOutCubic(age), size: lerp(0.1, 0.18, hh(3)) * (0.5 + age), age, seed: seed + i * 1.7, t: t - born, alpha: alpha * smoothstep(0, 0.12, age) * (1 - smoothstep(0.55, 1, age)), heat: 0, light: [0.3, -0.9], soft: 0.7 });
  }
  void a;
}

/**
 * Cracks spreading from the hit: the edges of the pieces, jagged, growing from the end nearer the hit, thick and bright near it and
 * hairline at the tips, with a darker body so they read as depth in the glass and a white core. A few thick cracks radiate from the hit.
 */
function cracks(f: Frame, pieces: Piece[], c: Pt, reach: number, alpha: number, width: number, maxR: number, tone: { dark: RGB; mid: RGB; core: RGB } = { dark: [0.04, 0.07, 0.12], mid: [0.6, 0.8, 1], core: [0.96, 0.99, 1] }): void {
  const seen = new Set<string>();
  const stroke = (p0: Pt, p1: Pt, w: number, k: number): void => {
    segment(f.polys, p0, p1, w * 3.6, tone.dark, 0.3 * k);
    segment(f.polys, p0, p1, w * 1.9, tone.mid, 0.45 * k);
    segment(f.polys, p0, p1, w, tone.core, 0.96 * k);
  };
  for (const pc of pieces) {
    const m = pc.poly.length;
    for (let i = 0; i < m; i++) {
      const a = pc.poly[i]!, b = pc.poly[(i + 1) % m]!, mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, key = `${Math.round(mx * 2000)},${Math.round(my * 2000)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const da = Math.hypot(a.x - c.x, a.y - c.y), db = Math.hypot(b.x - c.x, b.y - c.y), near = da <= db ? a : b, far = da <= db ? b : a, dn = Math.min(da, db);
      const L = Math.hypot(far.x - near.x, far.y - near.y), grow = clamp((reach - dn) / Math.max(L, 0.03));
      if (grow <= 0 || L < 1e-4) continue;
      const nx = -(far.y - near.y) / L, ny = (far.x - near.x) / L, hsh = Math.round(mx * 3000) * 7 + Math.round(my * 3000);
      const near01 = 1 - clamp(dn / (maxR * 0.55)), wk = width * (1 + 2.4 * near01 * near01) * (0.75 + 0.5 * h1(hsh)), N = 4;
      let prev: Pt = near;
      for (let k = 1; k <= N; k++) {
        const t = (k / N) * grow, jig = k < N || grow < 1 ? (h1(hsh * 13 + k) - 0.5) * L * 0.2 : 0;
        const q: Pt = { x: near.x + (far.x - near.x) * t + nx * jig, y: near.y + (far.y - near.y) * t + ny * jig };
        stroke(prev, q, wk * (1 - 0.45 * (k / N)), alpha * (1 - 0.35 * smoothstep(reach - 0.25, reach, dn)));
        prev = q;
      }
    }
  }
  // the impact: thick cracks star out from the hit
  const rng = makeRng(77);
  const reachStar = Math.min(reach, 0.32);
  for (let i = 0; i < 9; i++) {
    const ang = (i / 9) * Math.PI * 2 + (rng.next() - 0.5) * 0.5, len = reachStar * (0.45 + 0.55 * rng.next());
    let prev: Pt = c;
    for (let k = 1; k <= 4; k++) {
      const q: Pt = { x: c.x + Math.cos(ang + (rng.next() - 0.5) * 0.28) * len * (k / 4), y: c.y + Math.sin(ang + (rng.next() - 0.5) * 0.28) * len * (k / 4) };
      stroke(prev, q, width * 3.4 * (1 - 0.6 * (k / 4)), alpha);
      prev = q;
    }
  }
}

/** One faceted ice crystal (an icicle or a spike) standing on (x, y), pointing along `ang`: a light face, a dark face, a ridge and a bright edge. */
function crystal(f: Frame, x: number, y: number, ang: number, len: number, wid: number, alpha: number): void {
  if (len <= 0.002) return;
  const dx = Math.cos(ang), dy = Math.sin(ang), px = -dy, py = dx;
  const L: [number, number] = [x + px * wid, y + py * wid], R: [number, number] = [x - px * wid, y - py * wid], tip: [number, number] = [x + dx * len, y + dy * len];
  const mid: [number, number] = [x + dx * len * 0.45 + px * wid * 0.12, y + dy * len * 0.45 + py * wid * 0.12], base: [number, number] = [x, y];
  triPoly(f.polys, L, tip, mid, [0.62, 0.86, 1], 0.9 * alpha, [0.95, 0.99, 1], [0.95, 0.99, 1]);       // lit face
  triPoly(f.polys, R, tip, mid, [0.16, 0.42, 0.8], 0.9 * alpha, [0.45, 0.75, 1], [0.95, 0.99, 1]);       // shaded face
  triPoly(f.polys, L, R, mid, [0.45, 0.75, 1], 0.78 * alpha, [0.3, 0.6, 0.95], [0.3, 0.6, 0.95]);         // the base, seen through the ice
  const P = (v: [number, number]): Pt => ({ x: v[0], y: v[1] });
  segment(f.polys, P(base), P(tip), wid * 0.18, [0.92, 0.98, 1], 0.55 * alpha);                            // the ridge
  segment(f.polys, P(L), P(tip), 0.0016, [1, 1, 1], 0.9 * alpha);                                          // the lit edge
  segment(f.polys, P(R), P(tip), 0.0016, [0.06, 0.2, 0.45], 0.5 * alpha);
  f.additive.push({ x: x + dx * len * 0.3, y: y + dy * len * 0.3, hw: wid * 3, hh: wid * 3, rot: 0, type: 0, color: [0.55, 0.85, 1], intensity: 0.25 * alpha, e1: 1.4 });
}

/** A frost fern: a stem that grows inward from (o) with side branches, and smaller branches on those. `grow` ∈ [0, 1]. */
function fern(f: Frame, o: Pt, dir: number, len: number, grow: number, seed: number, w: number, alpha: number, depth = 2): void {
  if (grow <= 0.001) return;
  const steps = depth === 2 ? 6 : depth === 1 ? 4 : 3;
  let p = o, ang = dir;
  for (let st = 0; st < steps; st++) {
    const prog = clamp(grow * steps - st);
    if (prog <= 0) break;
    const sl = (len / steps) * prog;
    ang += (h1(seed * 11 + st * 7 + depth) - 0.5) * 0.28;
    const q: Pt = { x: p.x + Math.cos(ang) * sl, y: p.y + Math.sin(ang) * sl };
    segment(f.polys, p, q, w * 3.2, [0.35, 0.6, 0.9], 0.16 * alpha);
    segment(f.polys, p, q, w, [0.93, 0.98, 1], 0.9 * alpha * (1 - 0.35 * (st / steps)));
    if (depth > 0 && st >= 1 && st < steps - 1 && prog >= 1 && (depth === 2 || st === 1)) {
      for (const side of [-1, 1]) fern(f, q, ang + side * (0.95 + 0.25 * h1(seed * 5 + st * 3 + side)), len * (0.42 - 0.05 * st / steps), clamp(grow * 1.15 - st / steps * 0.5), seed * 3 + st * 17 + side, w * 0.8, alpha, depth - 1);
    }
    p = q;
  }
}

const fallMotion = (pieces: Piece[], v: number, from: Pt, gravity: number, spread: number, spin: number, variety = false): ((p: Piece) => { dx: number; dy: number; rot: number; scale: number; alpha: number; shade: number; glint: number } | null) => {
  const maxD = pieces.reduce((m, q) => Math.max(m, Math.hypot(q.c.x - from.x, q.c.y - from.y)), 1e-3);
  return (pc) => {
    const h = h1(pc.id * 3.7 + 1), h2 = h1(pc.id * 5.1 + 2), d = Math.hypot(pc.c.x - from.x, pc.c.y - from.y) / maxD, delay = 0.3 * d + 0.05 * h;
    const tau = clamp((v - delay) / (1 - 0.35));
    const dirx = (pc.c.x - from.x) / (Math.hypot(pc.c.x - from.x, pc.c.y - from.y) || 1);
    return { dx: dirx * spread * tau * (0.5 + h) + (h2 - 0.5) * 0.2 * tau, dy: gravity * easeInQuad(tau) * (0.8 + 0.6 * h) - 0.05 * Math.sin(Math.PI * Math.min(1, tau * 2)) * (0.5 + h2), rot: (h2 - 0.5) * spin * tau, scale: 1 - 0.1 * tau, alpha: 1 - smoothstep(0.55, 1, tau), shade: (variety ? 0.86 + 0.28 * h : 1) * (1 - 0.25 * tau), glint: (variety ? 0.35 + 0.65 * h2 : 0.7) * (1 - tau) };
  };
};

export const iceFreeze: ShowEffect = {
  id: 'transition.ice', name: 'Freeze and shatter', tagline: 'Frost creeps in from the edges and ice spikes grow over the first screen; a crack, and it shatters into glittering ice to show the next one.', category: 'candidate', transition: true, holdsEnd: true,
  params: [...centreP(), strengthP(), num('shards', 'Ice pieces', G('Look'), 60, 24, 120, 1, 'count', 'Pieces the ice breaks into.', true), seedP(), durP(2.6), holdP()],
  duration: total, impactAt: (p) => n(p, 'duration') * 0.5,
  cues: (p) => { const D = n(p, 'duration'); return [{ t: 0, kind: 'sweep', gain: 0.3, dur: D * 0.45, pitch: 2.4 }, { t: D * 0.42, kind: 'crack', gain: 0.6, dur: 0.2, pitch: 1.6 }, { t: D * 0.5, kind: 'shatter', gain: 1, dur: 1, pitch: 2.4 }, { t: D * 0.5, kind: 'thump', gain: 0.5, pitch: 1.2 }]; },
  build(f, t, p, ctx) {
    if (t < 0) return;
    const D = n(p, 'duration'), u = clamp(t / D), seed = n(p, 'seed'), k = n(p, 'strength'), a = ctx.aspect, c: Pt = { x: n(p, 'cx') * a, y: n(p, 'cy') }, icy: RGB = [0.6, 0.85, 1];
    const pieces = voronoiPieces(a, Math.round(n(p, 'shards')), seed, c, 1.5);
    const maxR = Math.hypot(Math.max(c.x, a - c.x), Math.max(c.y, 1 - c.y));
    if (u < 0.5) {
      setTr(f, TR.frost, clamp(u / 0.44), { seed, p: [0.14, 0.7, 12, 0.9], q: [4, 8, 0, 0], c1: icy });
      const grow = clamp(u / 0.46);
      // frost ferns creeping in from the screen edge, and faceted crystals hanging from the top and standing on the bottom
      const NF = 18, perim = 2 * (a + 1);
      for (let i = 0; i < NF; i++) {
        const hh = (kk: number) => h1(seed * 41 + i * 7 + kk), d = ((i + hh(1)) / NF) * perim;
        let ox: number, oy: number, ang: number;
        if (d < a) { ox = d; oy = 0; ang = Math.PI / 2; } else if (d < a + 1) { ox = a; oy = d - a; ang = Math.PI; } else if (d < 2 * a + 1) { ox = 2 * a + 1 - d; oy = 1; ang = -Math.PI / 2; } else { ox = 0; oy = perim - d; ang = 0; }
        fern(f, { x: ox, y: oy }, ang + (hh(2) - 0.5) * 0.5, lerp(0.16, 0.34, hh(3)) * k, easeOutCubic(clamp((grow - hh(4) * 0.4) / 0.6)), seed + i * 13, 0.0022, 1);
      }
      for (let i = 0; i < 22; i++) {
        const hh = (kk: number) => h1(seed * 43 + i * 9 + kk), g2 = easeOutCubic(clamp((grow - hh(2) * 0.5) / 0.5)), top = i < 14, x = ((i < 14 ? i : i - 14) + 0.15 + 0.7 * hh(1)) / (top ? 14 : 8) * a;
        if (top) crystal(f, x, 0, Math.PI / 2 + (hh(5) - 0.5) * 0.3, lerp(0.07, 0.2, hh(3)) * g2 * k, lerp(0.012, 0.024, hh(4)), 1);
        else crystal(f, x, 1, -Math.PI / 2 + (hh(5) - 0.5) * 0.4, lerp(0.05, 0.13, hh(3)) * g2 * k, lerp(0.01, 0.018, hh(4)), 1);
      }
      for (let i = 0; i < 6; i++) { const o = { x: h1(seed + i * 3) * a, y: h1(seed + i * 3 + 1) }, ph = fract(t * 1.6 + h1(i + 9)); f.additive.push({ x: o.x, y: o.y, hw: 0.04 * Math.sin(Math.PI * ph), hh: 0.04 * Math.sin(Math.PI * ph), rot: 0.2, type: 2, color: [0.85, 0.95, 1], intensity: 0.8 * u * 2 }); }
      mist(f, 'ice', a, seed, t, 0.03, 0.45, 8, 0.45 * clamp(u * 2), (i) => ({ x: h1(seed + i * 9) < 0.5 ? h1(seed + i * 7) * a : (h1(seed + i * 7) < 0.5 ? 0.02 : a - 0.02), y: 0.55 + 0.45 * h1(seed + i * 11) }));
      const crack = clamp((u - 0.38) / 0.12);
      if (crack > 0) cracks(f, pieces, c, easeOutCubic(crack) * maxR * 1.05, 1, 0.0016, maxR);
    } else {
      const v = clamp((u - 0.5) / 0.5), ts = t - D * 0.5;
      setTr(f, TR.cut, 1, { p: [0, 0.001, 0, 0.1], c1: icy });
      drawPieces(f, SCREEN_A, pieces, a, fallMotion(pieces, v, c, 1.7 * k, 0.35, 3.2, true), { tint: [0.55, 0.82, 1.15, 0.55], accent: [0.8, 0.95, 1], glass: 0.7 });
      f.additive.push({ x: c.x, y: c.y, hw: 0.5 * k, hh: 0.5 * k, rot: 0, type: 3, color: [0.8, 0.95, 1], intensity: 1.4 * Math.exp(-ts * 9) });
      f.additive.push({ x: c.x, y: c.y, hw: maxR * (0.15 + 1.1 * easeOutQuart(ts / 0.5)), hh: maxR * (0.15 + 1.1 * easeOutQuart(ts / 0.5)), rot: 0, type: 1, color: icy, intensity: 0.9 * (1 - smoothstep(0, 0.5, ts)), e1: 0.07 });
      for (let i = 0; i < 26; i++) {
        const hh = (kk: number) => h1(seed * 13 + i * 9 + kk), tl = ts - hh(1) * 0.15;
        if (tl <= 0) continue;
        const ang = hh(2) * 6.283, sp = lerp(0.3, 1.1, hh(3)), x = c.x + Math.cos(ang) * sp * easeOutCubic(tl / 0.9) * 1.2, y = c.y + Math.sin(ang) * sp * easeOutCubic(tl / 0.9) * 0.9 + 0.4 * tl * tl;
        f.additive.push({ x, y, hw: 0.022, hh: 0.022, rot: 0.3, type: 2, color: [0.85, 0.95, 1], intensity: 0.9 * (1 - smoothstep(0.3, 1.1, tl)) * (0.6 + 0.4 * Math.sin(tl * 25 + i)) });
      }
      mist(f, 'ice', a, seed + 5, ts, 0, 0.5, 10, 0.55, (i) => ({ x: c.x + (h1(seed + i * 5) - 0.5) * a * 0.8, y: c.y + (h1(seed + i * 5 + 2) - 0.5) * 0.7 }));
      f.camera.dx += Math.sin(ts * 80) * 0.006 * Math.exp(-ts * 8);
    }
  },
};

export const glassBreak: ShowEffect = {
  id: 'transition.glass', name: 'Glass break', tagline: 'Cracks spread from a hit in the first screen, then it falls apart in shards and the next screen is behind it.', category: 'candidate', transition: true, holdsEnd: true,
  params: [...centreP(), strengthP(), num('shards', 'Glass pieces', G('Look'), 70, 24, 140, 1, 'count', 'Pieces the glass breaks into.', true), seedP(), durP(1.9), holdP()],
  duration: total, impactAt: () => 0,
  cues: (p) => { const D = n(p, 'duration'); return [{ t: 0, kind: 'crack', gain: 0.9, dur: 0.25, pitch: 1.5 }, { t: D * 0.24, kind: 'shatter', gain: 1, dur: 1, pitch: 2 }, { t: D * 0.24, kind: 'thump', gain: 0.6 }]; },
  build(f, t, p, ctx) {
    if (t < 0) return;
    const D = n(p, 'duration'), u = clamp(t / D), seed = n(p, 'seed'), k = n(p, 'strength'), a = ctx.aspect, c: Pt = { x: n(p, 'cx') * a, y: n(p, 'cy') }, brk = 0.24;
    const pieces = voronoiPieces(a, Math.round(n(p, 'shards')), seed, c, 1.6), maxR = Math.hypot(Math.max(c.x, a - c.x), Math.max(c.y, 1 - c.y));
    if (u < brk) {
      setTr(f, TR.cut, 0, { p: [0.5, 0.001, 0, 0.1] });
      const grow = easeOutCubic(clamp(u / (brk * 0.9)));
      cracks(f, pieces, c, grow * maxR * 1.05, 1, 0.0016, maxR);
      f.additive.push({ x: c.x, y: c.y, hw: 0.25 * k, hh: 0.25 * k, rot: 0, type: 3, color: [0.85, 0.95, 1], intensity: 1.3 * Math.exp(-t * 14) });
      f.additive.push({ x: c.x, y: c.y, hw: 0.05 + 0.18 * grow, hh: 0.05 + 0.18 * grow, rot: 0.4, type: 2, color: [1, 1, 1], intensity: 0.8 * (1 - grow) });
      f.camera.dx += Math.sin(t * 90) * 0.004 * Math.exp(-t * 10);
    } else {
      const v = clamp((u - brk) / (1 - brk)), ts = t - D * brk;
      setTr(f, TR.cut, 1, { p: [0, 0.001, 0, 0.1] });
      drawPieces(f, SCREEN_A, pieces, a, fallMotion(pieces, v, c, 1.9 * k, 0.3, 3.6, true), { accent: [1, 1, 1], glass: 1 });
      f.additive.push({ x: c.x, y: c.y, hw: 0.3 * k, hh: 0.3 * k, rot: 0, type: 3, color: [0.85, 0.95, 1], intensity: 1.2 * Math.exp(-ts * 10) });
      for (let i = 0; i < 24; i++) {
        const hh = (kk: number) => h1(seed * 19 + i * 9 + kk), tl = ts - hh(1) * 0.2;
        if (tl <= 0) continue;
        const ang = hh(2) * 6.283, sp = lerp(0.2, 1.0, hh(3)), x = c.x + Math.cos(ang) * sp * easeOutCubic(tl / 0.8), y = c.y + Math.sin(ang) * sp * easeOutCubic(tl / 0.8) * 0.8 + 0.5 * tl * tl;
        f.additive.push({ x, y, hw: 0.02, hh: 0.02, rot: 0.3, type: 2, color: [0.9, 0.97, 1], intensity: 0.9 * (1 - smoothstep(0.2, 1, tl)) * (0.6 + 0.4 * Math.sin(tl * 28 + i)) });
      }
      f.camera.dx += Math.sin(ts * 75) * 0.008 * Math.exp(-ts * 8); f.camera.dy += Math.cos(ts * 64) * 0.006 * Math.exp(-ts * 8);
    }
  },
};

// ---------------------------------------------------------------------------------------------------------------------
// Lasers

const LASER: Record<string, RGB> = { cyan: [0.2, 0.9, 1], red: [1, 0.15, 0.2], green: [0.25, 1, 0.35], magenta: [1, 0.2, 0.95], gold: [1, 0.75, 0.2] };
const laserP = () => enm('laser', 'Laser colour', G('Look'), 'cyan', [['cyan', 'Cyan'], ['red', 'Red'], ['green', 'Green'], ['magenta', 'Magenta'], ['gold', 'Gold']], 'The colour of the beams.');

export const laserScan: ShowEffect = {
  id: 'transition.lasers', name: 'Laser scan', tagline: 'Rows of laser beams sweep across the screen, each one leaving the next screen behind it.', category: 'candidate', transition: true, holdsEnd: true,
  params: [laserP(), num('rows', 'Beams', G('Look'), 11, 3, 20, 1, 'count', 'Number of laser rows.', true), strengthP(), seedP(), durP(1.4), holdP()],
  duration: total, impactAt: () => 0.2,
  cues: (p) => [{ t: 0, kind: 'zap', gain: 0.5, dur: n(p, 'duration') * 0.9, pitch: 1.6 }, { t: 0, kind: 'sweep', gain: 0.4, dur: n(p, 'duration'), pitch: 1.2 }],
  build(f, t, p, ctx) {
    if (t < 0) return;
    const D = n(p, 'duration'), u = clamp(t / D), seed = n(p, 'seed'), N = Math.round(n(p, 'rows')), k = n(p, 'strength'), a = ctx.aspect, col = LASER[s(p, 'laser')] ?? LASER.cyan!, stagger = 0.45;
    const L: RGB = [col[0] * 1.8, col[1] * 1.8, col[2] * 1.8];
    setTr(f, TR.bands, u, { seed, p: [N, stagger, 0.02 * k, 0.28], c1: L, c2: [1.8, 1.8, 1.8] });
    for (let row = 0; row < N; row++) {
      const t0 = hash21(row, seed) * stagger, local = clamp((u - t0) / Math.max(1 - stagger, 0.05)), dir = row % 2 === 0 ? 1 : -1;
      let hx = local * (a + 0.12) - 0.06;
      if (dir < 0) hx = a - hx;
      const act = smoothstep(0, 0.03, local) * (1 - smoothstep(0.97, 1, local)), y = (row + 0.5) / N;
      if (act <= 0.01) continue;
      const rowH = 1 / N;
      f.additive.push({ x: hx, y, hw: 0.04 * k, hh: rowH * 0.55, rot: 0, type: 0, color: col, intensity: 1.2 * act, e1: 1.4 });                     // the beam's head, as tall as its row
      f.additive.push({ x: hx, y, hw: 0.11 * k, hh: 0.11 * k, rot: 0.3, type: 2, color: mixRGB(col, [1, 1, 1], 0.6), intensity: 1.1 * act });        // a flare on it
      f.additive.push({ x: hx - dir * 0.2, y, hw: 0.2, hh: 0.0045 * k, rot: dir > 0 ? 0 : Math.PI, type: 4, color: col, intensity: 1.2 * act, e1: 1.5 });
      for (let i = 0; i < 6; i++) {                                                                                                                   // sparks thrown back off the head
        const hh = (kk: number) => h1(row * 17 + i * 5 + kk + seed), ph = fract(t * 2.6 + hh(1)), ang = (dir > 0 ? Math.PI : 0) + (hh(2) - 0.5) * 1.6;
        f.additive.push({ x: hx + Math.cos(ang) * ph * 0.16, y: y + Math.sin(ang) * ph * 0.16 + 0.05 * ph * ph, hw: 0.016, hh: 0.0026, rot: ang, type: 4, color: mixRGB(col, [1, 1, 1], 0.5), intensity: 1.2 * act * (1 - ph), e1: 1.5 });
      }
    }
  },
};

export const laserCut: ShowEffect = {
  id: 'transition.laser-cut', name: 'Laser cut', tagline: 'Laser beams slice the first screen into slabs that slide apart along the glowing cuts, uncovering the next screen.', category: 'candidate', transition: true, holdsEnd: true,
  params: [laserP(), num('cuts', 'Cuts', G('Look'), 3, 1, 6, 1, 'count', 'Number of laser cuts.', true), strengthP(), seedP(), durP(1.7), holdP()],
  duration: total, impactAt: (p) => n(p, 'duration') * 0.3,
  cues: (p) => [{ t: 0, kind: 'zap', gain: 0.7, dur: n(p, 'duration') * 0.3, pitch: 1.8 }, { t: n(p, 'duration') * 0.3, kind: 'crack', gain: 0.7, dur: 0.2, pitch: 1.2 }, { t: n(p, 'duration') * 0.32, kind: 'whoosh', gain: 0.6, dur: 0.7, pitch: 1.4 }],
  build(f, t, p, ctx) {
    if (t < 0) return;
    const D = n(p, 'duration'), u = clamp(t / D), seed = n(p, 'seed'), N = Math.round(n(p, 'cuts')), k = n(p, 'strength'), a = ctx.aspect, col = LASER[s(p, 'laser')] ?? LASER.cyan!, tc = 0.3;
    const cuts = Array.from({ length: N }, (_, i) => { const hh = (kk: number) => h1(seed * 23 + i * 11 + kk); return { x: a * (0.25 + 0.5 * hh(1)), y: 0.25 + 0.5 * hh(2), angle: (hh(3) - 0.5) * 2.4 + (i % 2 ? 1.2 : -0.4) }; });
    const pieces = linePieces(a, cuts);
    f.boltCore = [1, 1, 1]; f.boltGlow = col;
    if (u < tc) {
      setTr(f, TR.cut, 0, { p: [0.5, 0.001, 0, 0.1] });
      const g = easeOutCubic(u / tc);
      cuts.forEach((c, i) => {
        const dx = Math.cos(c.angle), dy = Math.sin(c.angle), L = 2.4, st = clamp((u / tc) * (1 + 0.3 * i) - 0.1 * i), head = easeOutCubic(clamp(st));
        const A: Pt = { x: c.x - dx * L / 2, y: c.y - dy * L / 2 }, Hd: Pt = { x: A.x + dx * L * head, y: A.y + dy * L * head };
        ribbon(f.bolts, [A, Hd], 0.0032 * k, 1.1, false);
        f.additive.push({ x: Hd.x, y: Hd.y, hw: 0.07 * k, hh: 0.07 * k, rot: 0, type: 3, color: col, intensity: 1.6 });
        f.additive.push({ x: Hd.x, y: Hd.y, hw: 0.14 * k, hh: 0.14 * k, rot: 0.3, type: 2, color: [1, 1, 1], intensity: 0.8 });
      });
      void g;
    } else {
      const v = clamp((u - tc) / (1 - tc - 0.1)), ts = t - D * tc;
      setTr(f, TR.cut, 1, { p: [0, 0.001, 0, 0.1] });
      drawPieces(f, SCREEN_A, pieces, a, (pc) => {
        const dx = pc.c.x - a / 2, dy = pc.c.y - 0.5, l = Math.hypot(dx, dy) || 1, hh = h1(pc.id * 9.1), w = easeInQuad(clamp(v * 1.05 - 0.04 * hh)) * 1.9 + 0.02 * smoothstep(0, 0.1, v);
        return { dx: (dx / l) * w, dy: (dy / l) * w, rot: (hh - 0.5) * 0.5 * easeInQuad(v), scale: 1, alpha: 1, shade: 1 - 0.2 * v, glint: 0.18 };
      }, { grow: 0.002, accent: col });
      cuts.forEach((c) => {
        const dx = Math.cos(c.angle), dy = Math.sin(c.angle), L = 2.4, A: Pt = { x: c.x - dx * L / 2, y: c.y - dy * L / 2 }, B: Pt = { x: c.x + dx * L / 2, y: c.y + dy * L / 2 };
        const fade = 1 - smoothstep(0, 0.42, ts);
        ribbon(f.bolts, [A, B], 0.0042 * k * (0.6 + fade), 1.0 * fade, false);
        for (let i = 0; i < 8; i++) { const ph = fract(i / 8 + ts * 2), q: Pt = { x: A.x + (B.x - A.x) * ph, y: A.y + (B.y - A.y) * ph }; f.additive.push({ x: q.x, y: q.y, hw: 0.03, hh: 0.03, rot: 0, type: 0, color: col, intensity: 0.9 * fade, e1: 1.5 }); }
      });
    }
  },
};

// ---------------------------------------------------------------------------------------------------------------------
// Waves of light and energy

export const shockWipe: ShowEffect = {
  id: 'transition.shock', name: 'Shockwave wipe', tagline: 'A shockwave bursts outward and bends the first screen; behind its front the next screen is already there.', category: 'candidate', transition: true, holdsEnd: true,
  params: [...centreP(), color('tint', 'Wave colour', G('Look'), '#9fdcff', 'Colour of the wave front.'), strengthP(), durP(1.3), holdP()],
  duration: total, impactAt: () => 0.05,
  cues: () => [{ t: 0, kind: 'thump', gain: 1 }, { t: 0.02, kind: 'whoosh', gain: 0.7, dur: 0.9, pitch: 1.2 }],
  build(f, t, p, ctx) {
    if (t < 0) return;
    const D = n(p, 'duration'), u = clamp(t / D), a = ctx.aspect, k = n(p, 'strength'), col = hex(s(p, 'tint')), cx = n(p, 'cx'), cy = n(p, 'cy');
    const g = front(a, [1, 0], 0.1, true, cx, cy), e = easeOutCubic(u) * 0.4 + u * 0.6;
    setTr(f, TR.front, e, { seed: 3, mode: 1, p: [0.03, 0, 0.05, 0], d: [1, 0, g.cx, g.cy], q: [3, 8, 0, 0], c1: [col[0] * 1.8, col[1] * 1.8, col[2] * 1.8], c2: [2, 2, 2] });
    const rf = frontT(g, e) * g.R, live = smoothstep(0, 0.04, u) * (1 - smoothstep(0.92, 1, u));
    f.shocks.push({ cx: g.cx, cy: g.cy, radius: rf, width: 0.12 + 0.1 * u, amp: 0.045 * k * live, pinchR: 0, pinchK: 0, light: 0.35, color: col, split: 0.5, life: live, strainLight: 0.3 });
    f.additive.push({ x: g.cx, y: g.cy, hw: rf, hh: rf, rot: 0, type: 1, color: col, intensity: 0.9 * live, e1: 0.05 });
    f.additive.push({ x: g.cx, y: g.cy, hw: 0.4 * k, hh: 0.4 * k, rot: 0, type: 3, color: [1, 1, 1], intensity: 1.3 * Math.exp(-t * 8) });
    f.camera.dx += Math.sin(t * 80) * 0.007 * k * Math.exp(-t * 7);
  },
};

export const portal: ShowEffect = {
  id: 'transition.portal', name: 'Portal', tagline: 'A glowing portal tears open and swirls wider, pulling the first screen into it and showing the next.', category: 'candidate', transition: true, holdsEnd: true,
  params: [...centreP(), color('tint', 'Portal colour', G('Look'), '#b36bff', 'Colour of the portal rim.'), strengthP(), seedP(), durP(1.6), holdP()],
  duration: total, impactAt: () => 0.1,
  cues: (p) => [{ t: 0, kind: 'sweep', gain: 0.5, dur: 0.6, pitch: 0.9 }, { t: 0.1, kind: 'whoosh', gain: 0.7, dur: n(p, 'duration') * 0.8, pitch: 0.8 }, { t: 0.15, kind: 'zap', gain: 0.3, dur: 0.4 }],
  build(f, t, p, ctx) {
    if (t < 0) return;
    const D = n(p, 'duration'), u = clamp(t / D), a = ctx.aspect, k = n(p, 'strength'), col = hex(s(p, 'tint')), seed = n(p, 'seed');
    const g = front(a, [1, 0], 0.12, true, n(p, 'cx'), n(p, 'cy')), e = easeOutCubic(u) * 0.35 + u * 0.65;
    setTr(f, TR.front, e, { seed, mode: 1, p: [0.04, 0, 0.12, 0], d: [1, 0, g.cx, g.cy], q: [5, 8, 0, 0], c1: [col[0] * 1.8, col[1] * 1.8, col[2] * 1.8], c2: [1.6, 1.6, 1.8] });
    const rf = Math.max(0.01, frontT(g, e) * g.R), live = smoothstep(0, 0.05, u) * (1 - smoothstep(0.9, 1, u));
    f.vortices.push({ cx: g.cx, cy: g.cy, radius: rf * 1.25 + 0.1, pull: 0.35 * live, twist: 1.5 * live * (1 - u * 0.5), glow: 0.5 * live, absorb: 0.2 * live, color: col });
    for (const [r, th, I] of [[1, 0.05, 1], [0.93, 0.12, 0.5]] as const) f.additive.push({ x: g.cx, y: g.cy, hw: rf * r, hh: rf * r, rot: 0, type: 1, color: col, intensity: I * live, e1: th });
    for (let i = 0; i < 26; i++) {
      const hh = (kk: number) => h1(seed * 29 + i * 5 + kk), ang = hh(1) * 6.283 + t * (1.2 + hh(2)) * (i % 2 ? 1 : -1), rr = rf * lerp(0.82, 1.08, hh(3));
      f.additive.push({ x: g.cx + Math.cos(ang) * rr, y: g.cy + Math.sin(ang) * rr, hw: 0.02 * k, hh: 0.02 * k, rot: 0, type: 2, color: mixRGB(col, [1, 1, 1], 0.6), intensity: 0.9 * live * (0.6 + 0.4 * Math.sin(t * 20 + i)) });
    }
  },
};

export const vortexTwist: ShowEffect = {
  id: 'transition.vortex', name: 'Whirlpool', tagline: 'The first screen twists into a whirlpool, flashes at the centre and unwinds into the next screen.', category: 'candidate', transition: true, holdsEnd: true,
  params: [...centreP(), color('tint', 'Glow', G('Look'), '#9fc8ff', 'Colour of the glow at the centre.'), strengthP(), durP(1.6), holdP()],
  duration: total, impactAt: (p) => n(p, 'duration') * 0.5,
  cues: (p) => [{ t: 0, kind: 'sweep', gain: 0.5, dur: n(p, 'duration') * 0.5, pitch: 0.8 }, { t: n(p, 'duration') * 0.5, kind: 'thump', gain: 0.6 }, { t: n(p, 'duration') * 0.5, kind: 'whoosh', gain: 0.6, dur: 0.6, pitch: 1.2 }],
  build(f, t, p, ctx) {
    if (t < 0) return;
    const D = n(p, 'duration'), u = clamp(t / D), a = ctx.aspect, k = n(p, 'strength'), col = hex(s(p, 'tint')), bell = Math.sin(Math.PI * u) ** 1.3, cx = n(p, 'cx') * a, cy = n(p, 'cy');
    setTr(f, TR.cut, u, { p: [0.5, 0.07, 1.6, 0.09], c1: [col[0] * 1.5, col[1] * 1.5, col[2] * 1.5] });
    f.vortices.push({ cx, cy, radius: 0.9 + 0.5 * bell, pull: 1.5 * bell * k, twist: 6.2 * bell * k, glow: 0.8 * bell, absorb: 0.4 * bell, color: col });
    f.additive.push({ x: cx, y: cy, hw: 0.35 * bell, hh: 0.35 * bell, rot: 0, type: 3, color: col, intensity: 1.1 * bell });
  },
};

export const lightningFlash: ShowEffect = {
  id: 'transition.lightning', name: 'Lightning flash', tagline: 'Bolts crack down, the screen whites out in a blinding flash, and the next screen is there as it fades back.', category: 'candidate', transition: true, holdsEnd: true,
  params: [color('tint', 'Bolt colour', G('Look'), '#bfe3ff', 'Colour of the glow around the bolts.'), num('bolts', 'Bolts', G('Look'), 3, 1, 5, 1, 'count', 'Number of bolts before the flash.', true), strengthP(), seedP(5), durP(1.5), holdP()],
  duration: total, impactAt: (p) => n(p, 'duration') * 0.4,
  cues: (p) => { const D = n(p, 'duration'); return [{ t: 0.05, kind: 'zap', gain: 0.8, dur: 0.4 }, { t: D * 0.4, kind: 'crack', gain: 1, dur: 0.3 }, { t: D * 0.4, kind: 'thump', gain: 1 }, { t: D * 0.45, kind: 'rumble', gain: 0.8, dur: 1.2 }]; },
  build(f, t, p, ctx) {
    if (t < 0) return;
    const D = n(p, 'duration'), u = clamp(t / D), a = ctx.aspect, k = n(p, 'strength'), glow = hex(s(p, 'tint')), N = Math.round(n(p, 'bolts')), sw = 0.4;
    setTr(f, TR.cut, u, { p: [sw, 0.015, 3.2 * k, 0.07], c1: [0.85, 0.93, 1] });
    const w = (u - sw) / 0.05;
    f.exposure *= 1 + 1.6 * k * Math.exp(-w * w) + 0.5 * k * smoothstep(sw, sw + 0.02, u) * Math.exp(-(u - sw) * 6);
    f.boltCore = [1, 1, 1]; f.boltGlow = glow;
    const rng = makeRng(n(p, 'seed') * 211 + 5);
    for (let i = 0; i < N; i++) {
      const hit = lerp(0.06, sw, (i + 1) / N), tl = (u - hit + 0.04) * D;
      if (tl < 0 || tl > 0.7) continue;
      const origin = { x: (0.15 + 0.7 * rng.next()) * a, y: -0.04 }, tgt = { x: (0.2 + 0.6 * rng.next()) * a, y: 0.5 + 0.4 * rng.next() };
      const arcs = discharge(rng, origin, Math.atan2(tgt.y - origin.y, tgt.x - origin.x), Math.hypot(tgt.x - origin.x, tgt.y - origin.y), 1);
      const grow = clamp(tl / 0.06), flick = tl < 0.06 ? 1 : (0.5 + 0.5 * Math.sin(tl * 90)) * Math.exp(-(tl - 0.06) * 7) + 0.3 * (h1(Math.floor(tl * 40) + i * 13) > 0.5 ? 1 : 0.3), fade = 1 - smoothstep(0.25, 0.7, tl);
      for (const arc of arcs) {
        const part = slice(arc.pts, 0, arc.level === 0 ? grow : clamp((grow - arc.at) / 0.4));
        if (part.length >= 2) ribbon(f.bolts, part, arc.level === 0 ? 0.0045 : 0.0028, (arc.level === 0 ? 1 : 0.75) * k * flick * fade, true, arc.level === 0);
      }
      if (tl >= 0.06) f.additive.push({ x: tgt.x, y: tgt.y, hw: 0.25 * k, hh: 0.25 * k, rot: 0, type: 3, color: glow, intensity: 1.4 * Math.exp(-(tl - 0.06) * 9) });
    }
    if (u > sw) { const ts = (u - sw) * D; f.camera.dx += Math.sin(ts * 85) * 0.01 * k * Math.exp(-ts * 7); f.camera.dy += Math.cos(ts * 70) * 0.008 * k * Math.exp(-ts * 7); }
    void DISTORT;
  },
};

// ---------------------------------------------------------------------------------------------------------------------
// Graphic changes

export const pixels: ShowEffect = {
  id: 'transition.pixels', name: 'Pixel dissolve', tagline: 'The picture breaks into blocks that flash and switch to the next screen one by one, in random order or in a sweep.', category: 'candidate', transition: true, holdsEnd: true,
  params: [dirP('right'), num('block', 'Block size', G('Look'), 0.06, 0.02, 0.2, 0.001, '', 'Size of a block, as a fraction of the screen height.'), num('sweep', 'Sweep or random', G('Look'), 0.3, 0, 1, 0.01, '', '0 = blocks switch in random order, 1 = in a sweep across the screen.'), color('tint', 'Flash colour', G('Look'), '#7cf0ff', 'Colour of the blocks as they switch.'), seedP(), durP(1.2), holdP()],
  duration: total, impactAt: () => 0.2,
  cues: (p) => [{ t: 0, kind: 'tick', gain: 0.3, pitch: 2.4 }, { t: 0.1, kind: 'sweep', gain: 0.4, dur: n(p, 'duration') * 0.9, pitch: 1.8 }],
  build(f, t, p) {
    if (t < 0) return;
    const u = clamp(t / n(p, 'duration')), dir = dirOf(p), col = hex(s(p, 'tint'));
    setTr(f, TR.pixels, u, { seed: n(p, 'seed'), p: [n(p, 'block'), 0.4, n(p, 'sweep'), 0], d: [dir[0], dir[1], 0, 0], c1: [col[0] * 0.9, col[1] * 0.9, col[2] * 0.9] });
  },
};

export const tileFlip: ShowEffect = {
  id: 'transition.tile-flip', name: 'Tile flip', tagline: 'The screen is a grid of tiles that turn over one after another, each showing the next screen on its back.', category: 'candidate', transition: true, holdsEnd: true,
  params: [dirP('right'), num('tiles', 'Tiles across', G('Look'), 12, 4, 30, 1, 'count', 'Number of tiles across the screen.', true), num('sweep', 'Sweep or random', G('Look'), 0.55, 0, 1, 0.01, '', '0 = tiles turn in random order, 1 = in a sweep across the screen.'), color('tint', 'Edge light', G('Look'), '#9fdcff', 'Colour of the light on a tile\'s edge as it turns.'), seedP(), durP(1.4), holdP()],
  duration: total, impactAt: () => 0.2,
  cues: (p) => [{ t: 0.05, kind: 'tick', gain: 0.35, pitch: 1.4 }, { t: 0.15, kind: 'sweep', gain: 0.3, dur: n(p, 'duration') * 0.8, pitch: 1.4 }],
  build(f, t, p) {
    if (t < 0) return;
    const u = clamp(t / n(p, 'duration')), dir = dirOf(p), col = hex(s(p, 'tint'));
    setTr(f, TR.flip, u, { seed: n(p, 'seed'), p: [n(p, 'tiles'), 2, 0.3, n(p, 'sweep')], d: [dir[0], dir[1], 0, 0], c1: [col[0] * 1.5, col[1] * 1.5, col[2] * 1.5] });
  },
};

export const blinds: ShowEffect = {
  id: 'transition.blinds', name: 'Blinds', tagline: 'The screen is cut into slats that turn like venetian blinds, one after the other, to show the next screen.', category: 'candidate', transition: true, holdsEnd: true,
  params: [enm('axis', 'Slats', G('Look'), 'horizontal', [['horizontal', 'Horizontal'], ['vertical', 'Vertical']], 'Which way the slats run.'), num('slats', 'Slats', G('Look'), 10, 3, 30, 1, 'count', 'Number of slats.', true), num('sweep', 'Sweep or random', G('Look'), 0.85, 0, 1, 0.01, '', '0 = slats turn in random order, 1 = one after another.'), color('tint', 'Edge light', G('Look'), '#ffe6a8', 'Colour of the light on a slat as it turns.'), seedP(), durP(1.2), holdP()],
  duration: total, impactAt: () => 0.2,
  cues: (p) => [{ t: 0.05, kind: 'sweep', gain: 0.35, dur: n(p, 'duration'), pitch: 1.6 }],
  build(f, t, p) {
    if (t < 0) return;
    const u = clamp(t / n(p, 'duration')), col = hex(s(p, 'tint'));
    setTr(f, TR.flip, u, { seed: n(p, 'seed'), p: [n(p, 'slats'), s(p, 'axis') === 'vertical' ? 1 : 0, 0.5, n(p, 'sweep')], d: [1, 0, 0, 0], c1: [col[0] * 1.5, col[1] * 1.5, col[2] * 1.5] });
  },
};

export const glitchCut: ShowEffect = {
  id: 'transition.glitch', name: 'Glitch cut', tagline: 'The picture tears into shifted rows, splits into colours and flickers between the two screens before it settles on the next.', category: 'candidate', transition: true, holdsEnd: true,
  params: [num('rows', 'Rows', G('Look'), 34, 8, 80, 1, 'count', 'Number of rows that tear independently.', true), num('shift', 'Tear', G('Look'), 0.06, 0, 0.2, 0.001, '', 'How far rows slide sideways.'), num('split', 'Colour split', G('Look'), 0.02, 0, 0.08, 0.001, '', 'How far the red and blue images part.'), num('blocks', 'Noise blocks', G('Look'), 0.18, 0, 1, 0.01, '', 'How much of the picture flashes inverted.'), seedP(), durP(0.9), holdP()],
  duration: total, impactAt: (p) => n(p, 'duration') * 0.4,
  cues: (p) => [{ t: 0, kind: 'zap', gain: 0.5, dur: n(p, 'duration'), pitch: 2.4 }, { t: n(p, 'duration') * 0.4, kind: 'crack', gain: 0.4, dur: 0.15, pitch: 2.2 }],
  build(f, t, p) {
    if (t < 0) return;
    const D = n(p, 'duration'), u = clamp(t / D), act = Math.sin(Math.PI * u);
    setTr(f, TR.glitch, u, { seed: n(p, 'seed'), p: [Math.round(n(p, 'rows')), n(p, 'shift'), n(p, 'split'), n(p, 'blocks')], c1: [0.2, 1.2, 1.4], c2: [1.4, 0.2, 1.1] });
    f.camera.dx += (h1(Math.floor(t * 30)) - 0.5) * 0.012 * act; f.camera.dy += (h1(Math.floor(t * 30) + 7) - 0.5) * 0.006 * act;
  },
};

export const zoomThrough: ShowEffect = {
  id: 'transition.zoom', name: 'Zoom through', tagline: 'The camera plunges into the first screen in a rush of motion blur and bursts out into the next.', category: 'candidate', transition: true, holdsEnd: true,
  params: [...centreP(), num('amount', 'Zoom', G('Look'), 3.2, 1, 8, 0.05, 'x', 'How far the camera plunges.'), num('blur', 'Motion blur', G('Look'), 0.35, 0, 1, 0.01, '', 'Length of the streaks.'), durP(1.1), holdP()],
  duration: total, impactAt: (p) => n(p, 'duration') * 0.5,
  cues: (p) => [{ t: 0, kind: 'whoosh', gain: 0.8, dur: n(p, 'duration'), pitch: 1.2 }, { t: n(p, 'duration') * 0.5, kind: 'thump', gain: 0.4 }],
  build(f, t, p, ctx) {
    if (t < 0) return;
    const u = clamp(t / n(p, 'duration'));
    setTr(f, TR.zoom, u, { p: [n(p, 'amount'), n(p, 'blur'), 0.5, 0.14], d: [1, 0, n(p, 'cx') * ctx.aspect, n(p, 'cy')], c1: [1.4, 1.4, 1.6] });
  },
};

/** From the end of the change on, a transition is just the new screen: nothing is left of the flames, pieces and light. */
const holdNewScreen = (e: ShowEffect): ShowEffect => ({
  ...e,
  build(f, t, p, ctx) {
    if (t >= n(p, 'duration')) { setTr(f, TR.cut, 1, { p: [0, 0.001, 0, 0.1] }); return; }
    e.build(f, t, p, ctx);
  },
});

export const TRANSITIONS: ShowEffect[] = [
  burn, fireWall, burnHole, smoke, ink, iceFreeze, glassBreak, laserScan, laserCut, shockWipe, portal, vortexTwist, lightningFlash, pixels, tileFlip, blinds, glitchCut, zoomThrough,
].map(holdNewScreen);
void lerp; void SCREEN_A;
