/** Light effects: sparkles on a silhouette, light rays, lens flare, twinkling stars and a pulsing halo. All additive light, feeding the bloom. */
import { color, num } from '../../core/params';
import type { Frame, RGB } from '../engine/frame';
import { clamp, easeOutCubic, easeOutQuart, hex, lerp, smoothstep } from '../engine/math';
import { n, s, type ShowEffect } from './effect';
import { rnd } from './helpers';

const G = (group: string) => ({ section: 'Effect', group });
const cxp = () => num('cx', 'Centre X', G('Position'), 0.5, 0, 1, 0.001, '', 'Horizontal centre, as a fraction of the stage width.');
const cyp = () => num('cy', 'Centre Y', G('Position'), 0.5, 0, 1, 0.001, '', 'Vertical centre, as a fraction of the stage height.');
const dur = (def: number, min = 0.3, max = 8) => num('duration', 'Duration', G('Timing'), def, min, max, 0.01, 's', 'Total length.');
const bell = (u: number) => Math.sin(Math.PI * clamp(u)) ** 1.6;

export const sparkle: ShowEffect = {
  id: 'light.sparkle', name: 'Sparkles', tagline: 'Four-point glints twinkle on the letters or icon they work on.', category: 'candidate',
  params: [
    cxp(), cyp(),
    num('width', 'Area width', G('Position'), 0.6, 0.05, 1.6, 0.01, '', 'Width of the area sparkles appear in when no element is chosen, in stage heights.'),
    num('height', 'Area height', G('Position'), 0.25, 0.05, 1, 0.01, '', 'Height of that area.'),
    num('count', 'Sparkles', G('Look'), 16, 1, 80, 1, 'count', 'How many glints in total.', true),
    num('size', 'Size', G('Look'), 0.05, 0.01, 0.2, 0.001, '', 'Glint size in stage heights.'),
    num('life', 'Twinkle length', G('Timing'), 0.55, 0.15, 2, 0.01, 's', 'How long each glint shines.'),
    num('intensity', 'Brightness', G('Look'), 1.1, 0, 2.5, 0.01, 'x', 'Brightness of each glint.'),
    color('tint', 'Colour', G('Look'), '#fff4c4', 'Colour of the glints.'),
    dur(1.8),
  ],
  duration: (p) => n(p, 'duration') + n(p, 'life'),
  impactAt: () => 0,
  cues: (p) => [{ t: 0.05, kind: 'tick', gain: 0.18, pitch: 2.2 }, { t: n(p, 'duration') * 0.4, kind: 'tick', gain: 0.14, pitch: 2.6 }],
  build(f: Frame, t, p, ctx) {
    const D = n(p, 'duration'), life = n(p, 'life');
    if (t < 0 || t >= D + life) return;
    const N = Math.round(n(p, 'count')), size = n(p, 'size'), I = n(p, 'intensity'), tint = hex(s(p, 'tint'));
    const seed = ctx.seed ?? 3;
    const cx = n(p, 'cx') * ctx.aspect, cy = n(p, 'cy'), w = n(p, 'width'), h = n(p, 'height');
    for (let i = 0; i < N; i++) {
      const st = rnd(seed, i, 1) * D, local = t - st;
      if (local < 0 || local >= life) continue;
      const u = local / life, b = bell(u);
      const pt = ctx.silhouette ? ctx.silhouette.sample(rnd(seed, i, 2), rnd(seed, i, 3)) : { x: cx + (rnd(seed, i, 2) - 0.5) * w, y: cy + (rnd(seed, i, 3) - 0.5) * h };
      const sz = size * (0.55 + 0.9 * rnd(seed, i, 4)) * (0.35 + 0.65 * b);
      f.additive.push({ x: pt.x, y: pt.y, hw: sz, hh: sz, rot: (rnd(seed, i, 5) - 0.5) * 0.7 + u * 0.4, type: 2, color: tint, intensity: I * b });
      f.additive.push({ x: pt.x, y: pt.y, hw: sz * 0.5, hh: sz * 0.5, rot: 0, type: 0, color: tint, intensity: 0.5 * I * b, e1: 3 });
    }
  },
};

export const rays: ShowEffect = {
  id: 'light.rays', name: 'Light rays', tagline: 'Beams of light fan out and slowly turn behind the message.', category: 'candidate',
  params: [
    cxp(), cyp(),
    num('count', 'Rays', G('Look'), 16, 3, 40, 1, 'count', 'Number of beams.', true),
    num('length', 'Length', G('Look'), 1.1, 0.2, 2.5, 0.01, '', 'Length of the beams, in stage heights.'),
    num('width', 'Thickness', G('Look'), 0.6, 0.1, 2, 0.01, 'x', 'Thickness of the beams.'),
    num('spin', 'Turning speed', G('Timing'), 0.22, -2, 2, 0.01, '', 'Radians per second.'),
    num('intensity', 'Brightness', G('Look'), 0.75, 0, 2, 0.01, 'x', 'Brightness of the beams.'),
    color('tint', 'Colour', G('Look'), '#ffe08a', 'Colour of the beams.'),
    dur(3, 0.5, 12),
  ],
  duration: (p) => n(p, 'duration'),
  impactAt: () => 0,
  build(f: Frame, t, p, ctx) {
    const D = n(p, 'duration');
    if (t < 0 || t >= D) return;
    const N = Math.round(n(p, 'count')), L = n(p, 'length'), W = n(p, 'width'), I = n(p, 'intensity'), tint = hex(s(p, 'tint'));
    const cx = n(p, 'cx') * ctx.aspect, cy = n(p, 'cy');
    const fade = smoothstep(0, D * 0.2, t) * (1 - smoothstep(D * 0.78, D, t));
    const grow = easeOutQuart(clamp(t / (D * 0.35)));
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2 + n(p, 'spin') * t + (i % 2) * 0.03;
      const len = L * grow * (i % 2 ? 0.72 : 1) * (0.9 + 0.2 * rnd(ctx.seed ?? 3, i));
      f.additive.push({ x: cx + Math.cos(a) * len * 0.5, y: cy + Math.sin(a) * len * 0.5, hw: len * 0.5, hh: 0.035 * W * (i % 2 ? 0.7 : 1), rot: a, type: 6, color: tint, intensity: I * fade * (i % 2 ? 0.6 : 0.9), e1: 1 });
    }
    f.additive.push({ x: cx, y: cy, hw: 0.25, hh: 0.25, rot: 0, type: 0, color: tint, intensity: 0.45 * I * fade, e1: 2 });
  },
};

export const flare: ShowEffect = {
  id: 'light.flare', name: 'Lens flare', tagline: 'A bright core with a halo ring and a long horizontal streak.', category: 'candidate',
  params: [
    cxp(), cyp(),
    num('size', 'Size', G('Look'), 0.22, 0.05, 0.8, 0.005, '', 'Radius of the core, in stage heights.'),
    num('streak', 'Streak length', G('Look'), 1, 0, 2.5, 0.01, 'x', 'Length of the horizontal streak.'),
    num('intensity', 'Brightness', G('Look'), 1, 0, 2.5, 0.01, 'x', 'Overall brightness.'),
    color('tint', 'Colour', G('Look'), '#fff0c8', 'Colour of the flare.'),
    dur(1, 0.3, 4),
  ],
  duration: (p) => n(p, 'duration'),
  impactAt: () => 0.08,
  cues: () => [{ t: 0.04, kind: 'sweep', gain: 0.25, dur: 0.5, pitch: 1.8 }],
  build(f: Frame, t, p, ctx) {
    const D = n(p, 'duration');
    if (t < 0 || t >= D) return;
    const u = t / D, on = smoothstep(0, 0.1, u) * (1 - smoothstep(0.55, 1, u)), I = n(p, 'intensity') * on, size = n(p, 'size');
    const tint = hex(s(p, 'tint')), cx = n(p, 'cx') * ctx.aspect, cy = n(p, 'cy');
    const r = size * (0.7 + 0.5 * easeOutCubic(u));
    f.additive.push({ x: cx, y: cy, hw: r, hh: r, rot: 0, type: 3, color: tint, intensity: 1.3 * I });
    f.additive.push({ x: cx, y: cy, hw: size * 6 * n(p, 'streak') * (0.4 + 0.6 * easeOutCubic(u)), hh: size * 0.22, rot: 0, type: 2, color: tint, intensity: 0.8 * I });
    f.additive.push({ x: cx, y: cy, hw: size * 3.2, hh: size * 3.2, rot: 0.3, type: 2, color: tint, intensity: 0.45 * I });
    const ring = size * (1.4 + 3.2 * easeOutQuart(u));
    f.additive.push({ x: cx, y: cy, hw: ring, hh: ring, rot: 0, type: 1, color: tint, intensity: 0.7 * I * (1 - smoothstep(0.2, 1, u)), e1: 0.12 });
    for (let k = 1; k <= 3; k++) {                                              // ghosts along the line through the screen centre
      const gx = lerp(cx, ctx.aspect * 0.5, 0.5 + k * 0.55), gy = lerp(cy, 0.5, 0.5 + k * 0.55);
      f.additive.push({ x: gx, y: gy, hw: size * (0.35 + 0.12 * k), hh: size * (0.35 + 0.12 * k), rot: 0, type: 1, color: tint, intensity: 0.22 * I, e1: 0.5 });
    }
  },
};

export const twinkle: ShowEffect = {
  id: 'light.twinkle', name: 'Twinkling stars', tagline: 'A field of small stars that fade up and down, for a magical backdrop.', category: 'candidate',
  params: [
    cxp(), cyp(),
    num('width', 'Area width', G('Position'), 1.7, 0.1, 1.8, 0.01, '', 'Width of the starfield, in stage heights.'),
    num('height', 'Area height', G('Position'), 0.9, 0.1, 1, 0.01, '', 'Height of the starfield.'),
    num('count', 'Stars', G('Look'), 46, 3, 160, 1, 'count', 'How many stars.', true),
    num('size', 'Size', G('Look'), 0.028, 0.008, 0.1, 0.001, '', 'Star size in stage heights.'),
    num('speed', 'Twinkle speed', G('Timing'), 1.2, 0.2, 4, 0.01, 'x', 'How fast the stars pulse.'),
    color('tint', 'Colour', G('Look'), '#e8f0ff', 'Colour of the stars.'),
    dur(4, 1, 20),
  ],
  duration: (p) => n(p, 'duration'),
  impactAt: () => 0,
  build(f: Frame, t, p, ctx) {
    const D = n(p, 'duration');
    if (t < 0 || t >= D) return;
    const N = Math.round(n(p, 'count')), size = n(p, 'size'), tint = hex(s(p, 'tint'));
    const fade = smoothstep(0, D * 0.12, t) * (1 - smoothstep(D * 0.85, D, t));
    const cx = n(p, 'cx') * ctx.aspect, cy = n(p, 'cy'), w = n(p, 'width'), h = n(p, 'height');
    for (let i = 0; i < N; i++) {
      const per = lerp(0.8, 2.2, rnd(3, i, 1)) / n(p, 'speed'), ph = rnd(3, i, 2) * per;
      const u = ((t + ph) % per) / per, b = bell(u);
      if (b < 0.02) continue;
      const x = cx + (rnd(3, i, 3) - 0.5) * w, y = cy + (rnd(3, i, 4) - 0.5) * h;
      const sz = size * (0.5 + rnd(3, i, 5)) * (0.3 + 0.7 * b);
      f.additive.push({ x, y, hw: sz, hh: sz, rot: rnd(3, i, 6) * 0.8, type: 2, color: tint, intensity: 0.95 * b * fade });
    }
  },
};

export const halo: ShowEffect = {
  id: 'light.halo', name: 'Pulsing halo', tagline: 'A soft aura breathes behind the subject and sends out rings.', category: 'candidate',
  params: [
    cxp(), cyp(),
    num('size', 'Size', G('Look'), 0.4, 0.08, 1.2, 0.005, '', 'Radius of the aura, in stage heights.'),
    num('pulses', 'Rings', G('Look'), 3, 0, 8, 1, 'count', 'Rings sent outward.', true),
    num('intensity', 'Brightness', G('Look'), 0.9, 0, 2.5, 0.01, 'x', 'Brightness of the aura.'),
    color('tint', 'Colour', G('Look'), '#ffd34a', 'Colour of the aura.'),
    dur(2.2, 0.5, 10),
  ],
  duration: (p) => n(p, 'duration'),
  impactAt: () => 0,
  build(f: Frame, t, p, ctx) {
    const D = n(p, 'duration');
    if (t < 0 || t >= D) return;
    const fade = smoothstep(0, D * 0.12, t) * (1 - smoothstep(D * 0.75, D, t));
    const size = n(p, 'size'), I = n(p, 'intensity') * fade, tint: RGB = hex(s(p, 'tint'));
    const cx = n(p, 'cx') * ctx.aspect, cy = n(p, 'cy');
    const breath = 1 + 0.08 * Math.sin(t * 5);
    f.additive.push({ x: cx, y: cy, hw: size * breath, hh: size * breath, rot: 0, type: 0, color: tint, intensity: 0.8 * I, e1: 0.5 });
    const N = Math.round(n(p, 'pulses'));
    for (let k = 0; k < N; k++) {
      const per = D / Math.max(1, N), u = ((t - k * per * 0.6) / (per * 1.4));
      if (u < 0 || u > 1) continue;
      const r = size * (0.5 + 1.5 * easeOutCubic(u));
      f.additive.push({ x: cx, y: cy, hw: r, hh: r, rot: 0, type: 1, color: tint, intensity: 0.8 * I * (1 - u) ** 1.4, e1: 0.1 });
    }
  },
};

export const LIGHTS: ShowEffect[] = [sparkle, rays, flare, twinkle, halo];
