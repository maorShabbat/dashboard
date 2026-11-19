import { color, enm, num } from '../../core/params';
import { b, n, s, type ShowEffect } from './effect';
import type { Frame, RGB } from '../engine/frame';
import { clamp, easeOutCubic, h1, hex, lerp, mixRGB, smoothstep } from '../engine/math';

const G = (group: string) => ({ section: 'Effect', group });

/**
 * Secondary particles: a small burst of sparks, embers or dust. Closed-form motion (drag + gravity), seeded, restrained. An independent
 * primitive, and the "secondary particles" that accompany other effects at a low setting.
 */
export const particles: ShowEffect = {
  id: 'particles',
  name: 'Particles',
  tagline: 'A small burst of sparks, embers or dust.',
  category: 'primitive',
  params: [
    num('cx', 'Centre X', G('Position'), 0.5, 0, 1, 0.001, '', 'Horizontal origin as a fraction of the image width (click or drag the preview).'),
    num('cy', 'Centre Y', G('Position'), 0.5, 0, 1, 0.001, '', 'Vertical origin as a fraction of the image height.'),
    enm('kind', 'Kind', G('Look'), 'sparks', [['sparks', 'Sparks'], ['embers', 'Embers'], ['dust', 'Dust']], 'Streaking sparks, soft rising embers, or ragged dust.'),
    num('count', 'Count', G('Burst'), 26, 0, 120, 1, 'count', 'Number of particles.', true),
    num('speed', 'Speed', G('Burst'), 1, 0.2, 3, 0.01, 'x', 'Launch speed.'),
    num('size', 'Size', G('Burst'), 1, 0.3, 3, 0.01, 'x', 'Particle size.'),
    num('gravity', 'Gravity', G('Burst'), 0.6, -0.5, 2, 0.01, 'x', 'Downward pull (negative rises).'),
    num('lifetime', 'Lifetime', G('Timing'), 0.7, 0.2, 2.5, 0.01, 's', 'How long a particle lives.'),
    color('tint', 'Colour', G('Look'), '#ffd27a', 'Particle colour.'),
    { kind: 'boolean', key: 'fromObject', label: 'Match the object', section: 'Effect', group: 'Look', default: false, description: 'Take the colour from the object being fragmented, lightened.' },
  ],
  duration: (p) => n(p, 'lifetime') + 0.14,
  impactAt: () => 0.02,
  cues: (p) => (n(p, 'count') > 0 ? [{ t: 0.02, kind: 'shatter', gain: 0.18 + Math.min(0.4, n(p, 'count') / 120), dur: 0.35, pitch: 1.5, seed: 9 }] : []),
  companion: { subtle: { count: 12, speed: 0.85, size: 0.8, lifetime: 0.55, gravity: 0.6, fromObject: true }, scale: (p, k) => ({ ...p, count: Math.round(n(p, 'count') * k) }) },
  build(f: Frame, t: number, p, ctx) {
    const D = n(p, 'lifetime') + 0.14;
    if (t < 0 || t >= D) return;
    const cx = n(p, 'cx') * ctx.aspect, cy = n(p, 'cy');
    const N = Math.round(n(p, 'count')), speed = n(p, 'speed'), size = n(p, 'size'), grav = n(p, 'gravity'), life0 = n(p, 'lifetime');
    const kind = s(p, 'kind');
    let col: RGB = hex(s(p, 'tint'));
    if (b(p, 'fromObject') && ctx.object) col = mixRGB(ctx.object.color, [1, 1, 1], 0.45);
    for (let i = 0; i < N; i++) {
      const t0 = h1(i * 7 + 1) * 0.1;
      const tl = t - t0;
      const life = life0 * lerp(0.6, 1, h1(i * 7 + 2));
      if (tl <= 0 || tl >= life) continue;
      const a = h1(i * 7 + 3) * Math.PI * 2;
      const fade = 1 - smoothstep(life * 0.4, life, tl);
      if (kind === 'sparks') {
        const v0 = 0.7 * speed * lerp(0.5, 1.6, h1(i * 7 + 4) ** 0.8), kd = 3.2, g = 0.9 * grav;
        const trav = (1 - Math.exp(-kd * tl)) / kd;
        const x = cx + Math.cos(a) * v0 * trav, y = cy + Math.sin(a) * v0 * trav + 0.5 * g * tl * tl;
        const vx = Math.cos(a) * v0 * Math.exp(-kd * tl), vy = Math.sin(a) * v0 * Math.exp(-kd * tl) + g * tl;
        const dir = Math.atan2(vy, vx), len = clamp(Math.hypot(vx, vy) * 0.05, 0.01, 0.1) * size;
        f.additive.push({ x: x - Math.cos(dir) * len * 0.88, y: y - Math.sin(dir) * len * 0.88, hw: len, hh: lerp(0.0035, 0.007, h1(i * 7 + 5)) * size, rot: dir, type: 4, color: col, intensity: 1.1 * fade, e1: 1.3 });
      } else if (kind === 'embers') {
        const v0 = 0.3 * speed * lerp(0.3, 1.2, h1(i * 7 + 4)), trav = (1 - Math.exp(-2.2 * tl)) / 2.2;
        const x = cx + Math.cos(a) * v0 * trav + Math.sin(tl * 5 + i) * 0.005 * size, y = cy + Math.sin(a) * v0 * trav - 0.05 * tl * (1 + h1(i * 7 + 6)) * Math.max(0.2, 1 - grav * 0.5);
        const r = lerp(0.005, 0.011, h1(i * 7 + 5)) * size;
        f.additive.push({ x, y, hw: r * 2.4, hh: r * 2.4, rot: 0, type: 0, color: col, intensity: 0.9 * fade * (0.7 + 0.3 * Math.sin(tl * 29 + i * 3)), e1: 2.5 });
      } else {
        const v0 = 0.3 * speed * lerp(0.4, 1.1, h1(i * 7 + 4)), trav = (1 - Math.exp(-3 * tl)) / 3;
        const x = cx + Math.cos(a) * v0 * trav * 2, y = cy + Math.sin(a) * v0 * trav * 2 + 0.04 * grav * tl * tl;
        const rad = lerp(0.012, 0.03, h1(i * 7 + 5)) * size * (0.5 + 0.9 * easeOutCubic(tl / life));
        f.alphaSprites.push({ x, y, hw: rad, hh: rad, rot: 0, type: 5, color: mixRGB(col, [0.5, 0.45, 0.4], 0.5), intensity: 0.45 * fade, e2: i });
      }
    }
  },
};
