/**
 * The feature-trigger cinematic: letterbox bars slide in, the picture pushes in, and at the moment of impact there is a flash, a burst of
 * rays, rings and a punch of zoom; then the bars slide away and the picture settles back. The text slam is the text element's own
 * entrance, timed to the impact (`impactAt`), so the two line up when the effect is layered on a message.
 */
import { color, enm, num } from '../../core/params';
import { clamp, easeInCubic, easeOutCubic, hex, mixRGB, smoothstep } from '../engine/math';
import { n, s, type ShowEffect } from './effect';
import { quadPoly } from './helpers';

const G = (group: string) => ({ section: 'Effect', group });
const TAU = Math.PI * 2;

export const cinemaTrigger: ShowEffect = {
  id: 'cinema.trigger', name: 'Feature trigger', category: 'candidate',
  tagline: 'Letterbox bars close in, the picture pushes toward the middle, and on the beat there is a flash, rays, rings and a punch of zoom before everything settles.',
  params: [
    num('duration', 'Length', G('Timing'), 3.6, 1.5, 10, 0.01, 's', 'Total length, bars in to bars out.'),
    num('impact', 'Moment of impact', G('Timing'), 0.95, 0.3, 4, 0.01, 's', 'When the flash and punch land: put the title text slam on this beat.'),
    num('bars', 'Letterbox bars', G('Look'), 0.12, 0, 0.3, 0.005, '', 'How much of the screen height each bar covers.'),
    num('zoom', 'Push-in', G('Look'), 0.12, 0, 0.5, 0.005, '', 'How far the picture slowly pushes in while the bars are on.'),
    num('punch', 'Punch', G('Look'), 0.06, 0, 0.3, 0.005, '', 'An extra jolt of zoom on the beat that fades away.'),
    num('flash', 'Flash', G('Look'), 1, 0, 2, 0.01, 'x', 'How bright the flash on the beat is.'),
    num('rays', 'Rays', G('Look'), 1, 0, 2, 0.01, 'x', 'How strong the burst of rays on the beat is.'),
    num('rings', 'Rings', G('Look'), 2, 0, 5, 1, 'count', 'Rings of light that expand from the middle on the beat.', true),
    num('shake', 'Shake', G('Look'), 0.006, 0, 0.03, 0.0005, '', 'Camera shake on the beat.'),
    color('tint', 'Light colour', G('Look'), '#ffd24a', 'Colour of the flash, rays and rings.'),
    color('edge', 'Bar edge colour', G('Look'), '#ffd24a', 'The thin line along the inner edge of each bar.'),
    num('cy', 'Centre of the burst (height)', G('Position'), 0.5, 0, 1, 0.001, '', 'Where the burst comes from, as a fraction of the stage height.'),
    enm('bars_in', 'Bars arrive', G('Look'), 'slide', [['slide', 'Slide in from the edges'], ['snap', 'Snap shut on the beat']], 'How the bars arrive.'),
  ],
  duration: (p) => n(p, 'duration'),
  impactAt: (p) => n(p, 'impact'),
  cues: (p) => [{ t: 0, kind: 'whoosh', gain: 0.5, dur: 0.6, pitch: 0.8 }, { t: n(p, 'impact') - 0.02, kind: 'thump', gain: 1, dur: 0.5, pitch: 0.8 }, { t: n(p, 'impact'), kind: 'rumble', gain: 0.5, dur: 1.2 }, { t: n(p, 'impact'), kind: 'sweep', gain: 0.4, dur: 1.0, pitch: 2.2 }],
  build(f, t, p, ctx) {
    const D = n(p, 'duration'), I = n(p, 'impact');
    if (t < 0 || t >= D) return;
    const A = ctx.aspect, tint = hex(s(p, 'tint')), edge = hex(s(p, 'edge')), cy = n(p, 'cy'), after = t - I;
    // bars: in over the first 0.4 s (or on the beat), out over the last 0.45 s
    const snap = s(p, 'bars_in') === 'snap';
    const barIn = snap ? easeOutCubic(clamp((t - (I - 0.25)) / 0.25)) : easeOutCubic(clamp(t / 0.4)), barOut = 1 - easeInCubic(clamp((t - (D - 0.45)) / 0.45));
    const bar = n(p, 'bars') * barIn * barOut;
    // the picture pushes in, punches on the beat and settles back
    const push = n(p, 'zoom') * smoothstep(0, I + 0.3, t) * (1 - smoothstep(D - 0.7, D, t));
    const punch = after >= 0 ? n(p, 'punch') * Math.exp(-after * 7) * Math.cos(after * 14) : 0;
    const z = 1 + push + punch;
    f.camera.zoom *= z;
    if (after >= 0 && after < 0.6) { const k = Math.exp(-after * 9); f.camera.dx += Math.sin(after * 70) * n(p, 'shake') * k; f.camera.dy += Math.cos(after * 83) * n(p, 'shake') * 0.7 * k; }
    // bars are drawn in scene space, so move them to where the zoom will put them on screen
    if (bar > 0.0005) {
      const topY = 0.5 + (bar - 0.5) / z, botY = 0.5 + (1 - bar - 0.5) / z, wide = (A + 4) / 2;
      quadPoly(f.polys, A / 2, (topY - 3) / 2, wide, (topY + 3) / 2, 0, [0, 0, 0], 1);
      quadPoly(f.polys, A / 2, (botY + 4) / 2, wide, (4 - botY) / 2, 0, [0, 0, 0], 1);
      for (const y of [topY, botY]) f.additive.push({ x: A / 2, y, hw: A * 0.55, hh: 0.0035 / z, rot: 0, type: 0, color: edge, intensity: 1.1 * barIn * barOut, e1: 1.4 });
    }
    // the beat: flash, a burst of rays, rings
    if (after >= 0) {
      const cx = A / 2, flash = n(p, 'flash'), rays = n(p, 'rays');
      if (flash > 0) {
        f.additive.push({ x: cx, y: cy, hw: A * 0.9, hh: 0.9, rot: 0, type: 0, color: mixRGB(tint, [1, 1, 1], 0.7), intensity: 1.5 * flash * Math.exp(-after * 6.5), e1: 0.7 });
        f.additive.push({ x: cx, y: cy, hw: 0.45, hh: 0.45, rot: 0, type: 3, color: [1, 1, 1], intensity: 1.6 * flash * Math.exp(-after * 9) });
      }
      if (rays > 0 && after < 1.4) {
        const fade = Math.exp(-after * 2.8) * (1 - smoothstep(1.0, 1.4, after));
        for (let i = 0; i < 16; i++) { const a = (i / 16) * TAU + after * 0.25 + (i % 2) * 0.08, len = (0.6 + 0.55 * easeOutCubic(clamp(after / 0.5))) * (i % 2 ? 0.7 : 1); f.additive.push({ x: cx + Math.cos(a) * len * 0.5, y: cy + Math.sin(a) * len * 0.5, hw: len * 0.5, hh: 0.03 * (i % 2 ? 0.6 : 1), rot: a, type: 6, color: tint, intensity: 0.95 * rays * fade, e1: 1 }); }
      }
      for (let r = 0; r < Math.round(n(p, 'rings')); r++) {
        const u = (after - r * 0.12) / 0.9;
        if (u <= 0 || u >= 1) continue;
        const rad = 0.08 + 0.95 * easeOutCubic(u);
        f.additive.push({ x: cx, y: cy, hw: rad * (A > 1 ? 1 : A), hh: rad, rot: 0, type: 1, color: tint, intensity: 1.1 * (1 - u) ** 1.4, e1: 0.05 });
      }
    }
  },
};

export const CINEMA_FX: ShowEffect[] = [cinemaTrigger];
