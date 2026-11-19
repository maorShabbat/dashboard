import { color, num } from '../../core/params';
import { n, s, type ShowEffect } from './effect';
import type { Frame } from '../engine/frame';
import { easeOutCubic, easeOutQuart, hex, smoothstep } from '../engine/math';

const G = (group: string) => ({ section: 'Effect', group });

/** A short, compact flash: hot core, a glint and a faint exposure punch. Independent primitive; also the small centre flash that accompanies other effects. */
export const flash: ShowEffect = {
  id: 'flash',
  name: 'Flash',
  tagline: 'A short, compact impact flash.',
  category: 'primitive',
  params: [
    num('cx', 'Centre X', G('Position'), 0.5, 0, 1, 0.001, '', 'Horizontal position as a fraction of the image width (click or drag the preview).'),
    num('cy', 'Centre Y', G('Position'), 0.5, 0, 1, 0.001, '', 'Vertical position as a fraction of the image height.'),
    num('size', 'Size', G('Look'), 0.12, 0.03, 0.4, 0.005, '', 'Radius of the hot core in image heights.'),
    num('intensity', 'Intensity', G('Look'), 1, 0, 2, 0.01, 'x', 'Brightness of the core and glint.'),
    num('punch', 'Exposure punch', G('Look'), 0.03, 0, 0.12, 0.002, '', 'How much the whole picture brightens for an instant.'),
    num('duration', 'Duration', G('Timing'), 0.26, 0.1, 1, 0.01, 's', 'Total length.'),
    color('tint', 'Colour', G('Look'), '#fff1cf', 'Colour of the flash.'),
  ],
  duration: (p) => n(p, 'duration'),
  impactAt: () => 0.02,
  cues: () => [{ t: 0.01, kind: 'tick', gain: 0.5 }],
  companion: { subtle: { size: 0.08, intensity: 0.85, punch: 0.015, duration: 0.2 }, scale: (p, k) => ({ ...p, intensity: n(p, 'intensity') * k, punch: n(p, 'punch') * k }) },
  build(f: Frame, t: number, p, ctx) {
    const D = n(p, 'duration');
    if (t < 0 || t >= D) return;
    const cx = n(p, 'cx') * ctx.aspect, cy = n(p, 'cy'), size = n(p, 'size'), I = n(p, 'intensity');
    const tint = hex(s(p, 'tint'));
    const on = smoothstep(0, 0.012, t) * (1 - smoothstep(D * 0.12, D * 0.9, t));
    if (on <= 0.0005) return;
    const r = size * (0.55 + 0.45 * easeOutCubic(t / (D * 0.7)));
    f.additive.push({ x: cx, y: cy, hw: r, hh: r, rot: 0, type: 3, color: tint, intensity: 1.3 * I * on });
    const g = size * (2.0 + 1.6 * easeOutQuart(t / (D * 0.7)));
    f.additive.push({ x: cx, y: cy, hw: g, hh: g * 0.8, rot: 0.5, type: 2, color: tint, intensity: 0.6 * I * on });
    f.exposure *= 1 + n(p, 'punch') * I * smoothstep(0, 0.012, t) * Math.exp(-t * 18);
  },
};
