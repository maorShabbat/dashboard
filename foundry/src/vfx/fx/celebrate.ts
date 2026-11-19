/** Celebration shapes: confetti and coins, falling or bursting, drawn as flat polygons (so they read cleanly on any backdrop). */
import { color, enm, num } from '../../core/params';
import type { Frame, RGB } from '../engine/frame';
import { clamp, h1, hex, lerp, smoothstep } from '../engine/math';
import { b, n, s, type ShowEffect } from './effect';
import { ellipsePoly as ellipse, quadPoly as quad } from './helpers';

const G = (group: string) => ({ section: 'Effect', group });
const PALETTE: RGB[] = [[1, 0.35, 0.4], [1, 0.82, 0.25], [0.3, 0.8, 1], [0.5, 1, 0.5], [0.82, 0.5, 1], [1, 0.62, 0.2]];

interface Shower { x0: number; y0: number; vx: number; vy: number; delay: number; life: number; spin: number; phase: number; size: number; col: RGB }
function pieces(p: Record<string, number | string | boolean>, aspect: number, N: number, seedBase: number): Shower[] {
  const rain = s(p, 'origin') === 'rain', cx = n(p, 'cx') * aspect, cy = n(p, 'cy'), speed = n(p, 'speed'), life0 = n(p, 'duration') - 0.1;
  const out: Shower[] = [];
  for (let i = 0; i < N; i++) {
    const h = (k: number) => h1(seedBase + i * 11 + k);
    if (rain) out.push({ x0: h(1) * aspect, y0: -0.06 - h(2) * 0.15, vx: (h(3) - 0.5) * 0.15, vy: 0.08 + 0.1 * h(4), delay: h(5) * life0 * 0.55, life: life0 * 0.5 + h(6) * life0 * 0.1, spin: (4 + 8 * h(7)) * (h(8) < 0.5 ? 1 : -1), phase: h(9) * 6.283, size: lerp(0.7, 1.3, h(10)), col: PALETTE[Math.floor(h(11) * PALETTE.length)]! });
    else {
      const a = -Math.PI / 2 + (h(1) - 0.5) * 2.4, v = speed * lerp(0.5, 1.4, h(2) ** 0.7);
      out.push({ x0: cx, y0: cy, vx: Math.cos(a) * v, vy: Math.sin(a) * v, delay: h(3) * 0.08, life: life0 * lerp(0.55, 1, h(4)), spin: (4 + 8 * h(5)) * (h(6) < 0.5 ? 1 : -1), phase: h(7) * 6.283, size: lerp(0.7, 1.3, h(8)), col: PALETTE[Math.floor(h(9) * PALETTE.length)]! });
    }
  }
  return out;
}

function simulate(sh: Shower, t: number, rain: boolean, gravity: number): { x: number; y: number; u: number } | null {
  const tl = t - sh.delay;
  if (tl <= 0 || tl >= sh.life) return null;
  const u = tl / sh.life;
  const drag = rain ? 0.4 : 2.4, trav = (1 - Math.exp(-drag * tl)) / drag;
  const x = sh.x0 + sh.vx * trav + Math.sin(tl * 5 + sh.phase) * 0.02, y = sh.y0 + sh.vy * trav + 0.5 * gravity * 0.9 * tl * tl * (rain ? 0.35 : 1);
  return { x, y, u };
}

const common = (rainDefault: string, count: number, speed: number) => [
  num('cx', 'Burst X', G('Position'), 0.5, 0, 1, 0.001, '', 'Where a burst starts, as a fraction of the stage width.'),
  num('cy', 'Burst Y', G('Position'), 0.62, 0, 1, 0.001, '', 'Where a burst starts, as a fraction of the stage height.'),
  enm('origin', 'Style', G('Look'), rainDefault, [['burst', 'Burst from a point'], ['rain', 'Rain from the top']], 'Burst out of a point, or fall from the top of the screen.'),
  num('count', 'Amount', G('Look'), count, 4, 240, 1, 'count', 'How many pieces.', true),
  num('speed', 'Burst force', G('Look'), speed, 0.2, 2.5, 0.01, '', 'Launch speed of a burst.'),
  num('gravity', 'Gravity', G('Look'), 1, 0.2, 3, 0.01, 'x', 'How fast things fall.'),
  num('size', 'Size', G('Look'), 1, 0.4, 2.5, 0.01, 'x', 'Piece size.'),
  num('seed', 'Variation', G('Look'), 5, 1, 99, 1, '', 'Pick a different arrangement.', true),
  num('duration', 'Duration', G('Timing'), 2.4, 0.8, 8, 0.01, 's', 'Total length.'),
];

export const confetti: ShowEffect = {
  id: 'celebrate.confetti', name: 'Confetti', tagline: 'Colourful paper flutters out of a burst or rains down the screen.', category: 'candidate',
  params: common('burst', 90, 1.1),
  duration: (p) => n(p, 'duration'), impactAt: () => 0.05,
  cues: () => [{ t: 0.02, kind: 'shatter', gain: 0.35, dur: 0.5, pitch: 2, seed: 4 }],
  build(f: Frame, t, p, ctx) {
    const D = n(p, 'duration');
    if (t < 0 || t >= D) return;
    const rain = s(p, 'origin') === 'rain', size = n(p, 'size'), grav = n(p, 'gravity');
    for (const [i, sh] of pieces(p, ctx.aspect, Math.round(n(p, 'count')), n(p, 'seed') * 101).entries()) {
      const st = simulate(sh, t, rain, grav);
      if (!st) continue;
      const tl = t - sh.delay, flip = Math.cos(tl * sh.spin * 1.3 + sh.phase), rot = Math.sin(tl * 3 + sh.phase) * 0.9 + tl * sh.spin * 0.15;
      const hw = 0.0105 * size * sh.size * Math.max(0.12, Math.abs(flip)), hh = 0.0185 * size * sh.size;
      const shade = flip > 0 ? 1 : 0.72, a = 1 - smoothstep(0.78, 1, st.u);
      quad(f.polys, st.x, st.y, hw, hh, rot, [sh.col[0] * shade, sh.col[1] * shade, sh.col[2] * shade], a);
      if (i % 9 === 0 && Math.abs(flip) < 0.18) f.additive.push({ x: st.x, y: st.y, hw: 0.02, hh: 0.02, rot: 0, type: 2, color: [1, 1, 1], intensity: 0.7 * a });
    }
  },
};

export const coins: ShowEffect = {
  id: 'celebrate.coins', name: 'Coin shower', tagline: 'Gold coins spin and tumble out of a burst or pour from the top.', category: 'candidate',
  params: [...common('burst', 46, 1.25), color('tint', 'Gold', G('Look'), '#ffc933', 'Colour of the coins.'), { kind: 'boolean', key: 'glints', label: 'Glints', section: 'Effect', group: 'Look', default: true, description: 'A bright glint as a coin turns face-on.' }],
  duration: (p) => n(p, 'duration'), impactAt: () => 0.05,
  cues: () => [{ t: 0.02, kind: 'shatter', gain: 0.4, dur: 0.6, pitch: 2.6, seed: 9 }, { t: 0.3, kind: 'tick', gain: 0.3, pitch: 2.2 }],
  build(f: Frame, t, p, ctx) {
    const D = n(p, 'duration');
    if (t < 0 || t >= D) return;
    const rain = s(p, 'origin') === 'rain', size = n(p, 'size'), grav = n(p, 'gravity'), gold = hex(s(p, 'tint'));
    const rim: RGB = [gold[0] * 0.62, gold[1] * 0.5, gold[2] * 0.2], face: RGB = [gold[0], gold[1] * 0.92, Math.min(1, gold[2] + 0.1)], shine: RGB = [1, 0.97, 0.78];
    for (const [i, sh] of pieces(p, ctx.aspect, Math.round(n(p, 'count')), n(p, 'seed') * 77).entries()) {
      const st = simulate(sh, t, rain, grav);
      if (!st) continue;
      const tl = t - sh.delay, flip = Math.cos(tl * sh.spin * 0.8 + sh.phase), sq = Math.max(0.1, Math.abs(flip));
      const r = 0.026 * size * sh.size, a = 1 - smoothstep(0.82, 1, st.u), tilt = 0.5 * Math.sin(tl * 2 + sh.phase);
      ellipse(f.polys, st.x, st.y + r * 0.1 * (1 - sq), r * sq, r, tilt, rim, a);
      ellipse(f.polys, st.x, st.y, r * 0.82 * sq, r * 0.82, tilt, flip > 0 ? face : [face[0] * 0.85, face[1] * 0.8, face[2] * 0.7], a);
      if (sq > 0.5) ellipse(f.polys, st.x - r * 0.18 * sq, st.y - r * 0.2, r * 0.3 * sq, r * 0.36, tilt, shine, a * 0.8 * (sq - 0.4));
      if (b(p, 'glints') && sq > 0.93) f.additive.push({ x: st.x - r * 0.2, y: st.y - r * 0.2, hw: r * 1.6, hh: r * 1.6, rot: 0.4, type: 2, color: shine, intensity: 1 * a * (sq - 0.93) / 0.07 });
      void i;
    }
  },
};

export const CELEBRATIONS: ShowEffect[] = [confetti, coins];
void clamp;
