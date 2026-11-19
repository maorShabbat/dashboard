import { color, num } from '../../core/params';
import { n, s, type ShowEffect } from './effect';
import type { Frame } from '../engine/frame';
import { clamp, easeOutCubic, easeOutQuart, h1, hex, lerp, smoothstep } from '../engine/math';

const G = (group: string) => ({ section: 'Effect', group });

/**
 * Effect 1 — full-scene radial shockwave.
 * The image itself is displaced (see SCENE_FS): a brief inward compression at the point of impact, then a travelling crest
 * with a trailing trough and a faint secondary ripple that carries the pixels outward, a refraction-style brightening along
 * the compressed side, restrained chromatic separation, and a thin additive light ring. Displacement is pinned to zero at the
 * image border so no edge is ever exposed, and every term decays to exactly zero so the picture returns clean.
 */
export const shockwave: ShowEffect = {
  id: 'shockwave',
  name: 'Shockwave',
  tagline: 'Real texture displacement radiating from the point of impact.',
  category: 'approved',
  params: [
    num('cx', 'Centre X', G('Impact'), 0.5, 0, 1, 0.001, '', 'Horizontal impact position as a fraction of the image width (click or drag the preview).'),
    num('cy', 'Centre Y', G('Impact'), 0.5, 0, 1, 0.001, '', 'Vertical impact position as a fraction of the image height.'),
    num('strength', 'Strength', G('Wave'), 1, 0, 2.2, 0.01, 'x', 'Peak displacement of the crest and depth of the impact compression.'),
    num('distortion', 'Distortion', G('Wave'), 1, 0, 2.5, 0.01, 'x', 'Scales only how far the picture is displaced (the squeeze and light stay as set); lower it when the wave accompanies another effect.'),
    num('radius', 'Radius', G('Wave'), 1.15, 0.3, 2.4, 0.01, '', 'How far the front travels, in image heights.'),
    num('ringWidth', 'Ring width', G('Wave'), 0.05, 0.012, 0.14, 0.001, '', 'Half-width of the crest in image heights.'),
    num('speed', 'Speed', G('Timing'), 1, 0.4, 2.5, 0.01, 'x', 'How quickly the front travels relative to the duration.'),
    num('duration', 'Duration', G('Timing'), 1.4, 0.6, 4, 0.05, 's', 'Total length including the settle.'),
    num('light', 'Light intensity', G('Look'), 0.85, 0, 2, 0.01, 'x', 'Brightness of the ring light and the impact flash.'),
    num('split', 'RGB separation', G('Look'), 0.12, 0, 0.5, 0.005, '', 'Restrained chromatic split across the crest.'),
    color('tint', 'Light colour', G('Look'), '#ffd7a1', 'Colour of the ring light and flash.'),
  ],
  duration: (p) => n(p, 'duration'),
  impactAt: () => 0.05,
  cues: (p) => [
    { t: 0.03, kind: 'thump', gain: 0.9 },
    { t: 0.07, kind: 'whoosh', gain: 0.32, dur: Math.max(0.4, n(p, 'duration') * 0.6) },
  ],
  companion: {
    subtle: { strength: 0.5, distortion: 0.75, radius: 0.7, ringWidth: 0.04, duration: 0.9, light: 0.3, split: 0.04 },
    scale: (p, k) => ({ ...p, strength: n(p, 'strength') * k, light: n(p, 'light') * k }),
  },
  build(f: Frame, t: number, p, ctx) {
    const D = n(p, 'duration');
    if (t < 0 || t >= D) return;
    const cx = n(p, 'cx') * ctx.aspect, cy = n(p, 'cy');
    const k = n(p, 'strength'), dist = n(p, 'distortion'), R = n(p, 'radius'), W0 = n(p, 'ringWidth'), speed = n(p, 'speed'), light = n(p, 'light');
    const tint = hex(s(p, 'tint'));
    const LAUNCH = 0.07;

    // Impact compression: a quick squeeze that overshoots into a small outward bulge as the wave leaves.
    let pinch = 0;
    if (t < LAUNCH) pinch = 1 - (1 - t / LAUNCH) ** 2;
    else { const u = t - LAUNCH; pinch = Math.exp(-u * 15) * Math.cos(u * 21) * (1 - smoothstep(0.24, 0.34, t)); }
    const pinchK = 0.95 * k * pinch;

    // Front: starts fast and decelerates; the crest widens and the whole wave fades near the end.
    const span = Math.max(0.2, D * 0.8 - LAUNCH);
    const pr = clamp(((t - LAUNCH) * speed) / span);
    const front = t < LAUNCH ? 0 : R * (1 - (1 - pr) ** 1.9);
    const W = W0 * (0.5 + 1.0 * pr);
    const life = 1 - smoothstep(D * 0.52, D * 0.97, t);
    const amp = 0.082 * k * dist * (0.7 + 0.3 * (1 - pr));

    f.shocks.push({
      cx, cy, radius: front, width: W, amp, pinchR: 0.26 + 0.1 * k, pinchK, light: light * 0.9, color: tint, split: n(p, 'split'), life, strainLight: 0.2,
    });
    // A weaker, wider echo trails the main crest — gives the wave body instead of one clean ring.
    if (t > LAUNCH + 0.11) {
      const pr2 = clamp(((t - LAUNCH - 0.11) * speed) / span);
      f.shocks.push({
        cx, cy, radius: R * 0.8 * (1 - (1 - pr2) ** 2.2), width: W0 * (0.9 + 1.6 * pr2), amp: 0.034 * k * dist, pinchR: 0, pinchK: 0, light: 0, color: tint,
        split: n(p, 'split') * 0.5, life: life * 0.9, strainLight: 0.1,
      });
    }

    // Impact flash: hot core + glint, plus thin radial speed lines that shoot out and vanish.
    const flash = smoothstep(0, 0.012, t) * (1 - smoothstep(0.03, 0.17, t));
    if (flash > 0.001 && light > 0) {
      const gr = 0.03 + 0.1 * easeOutCubic(t / 0.17);
      f.additive.push({ x: cx, y: cy, hw: gr, hh: gr, rot: 0, type: 3, color: tint, intensity: 1.25 * flash * light });
      const sr = 0.14 + 0.26 * easeOutQuart(t / 0.17);
      f.additive.push({ x: cx, y: cy, hw: sr, hh: sr * 0.7, rot: 0.55, type: 2, color: tint, intensity: 0.8 * flash * light });
    }
    const spike = smoothstep(0, 0.012, t) * (1 - smoothstep(0.04, 0.26, t));
    if (spike > 0.001) {
      const N = 12;
      for (let i = 0; i < N; i++) {
        const a = (i / N) * Math.PI * 2 + (h1(i + 7) - 0.5) * 0.35;
        const len = lerp(0.12, 0.42, h1(i + 31));
        const head = lerp(0.03, 0.3 + 0.5 * h1(i + 91), easeOutQuart(t / 0.22));
        const hw = Math.min(len / 2, head / 2 + 0.01);
        f.additive.push({
          x: cx + Math.cos(a) * (head - hw), y: cy + Math.sin(a) * (head - hw), hw, hh: 0.006 + 0.007 * h1(i + 5), rot: a, type: 4,
          color: tint, intensity: 1.15 * spike * Math.max(0.35, light), e1: 1.6,
        });
      }
    }
    f.exposure = 1 + 0.06 * Math.exp(-t * 20) * smoothstep(0, 0.012, t) * Math.min(1, light);
  },
};
