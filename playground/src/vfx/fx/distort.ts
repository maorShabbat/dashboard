/**
 * Screen distortion effects. Each one bends the whole picture (the backdrop AND the text, icons and frames in it) inside the scene
 * shader, so what you see here is what the exported player shows. Every effect fades in and out cleanly and ends at exactly zero.
 */
import { enm, num } from '../../core/params';
import { DISTORT, type Frame } from '../engine/frame';
import { clamp, easeOutCubic, h1, smoothstep } from '../engine/math';
import { n, s, type ShowEffect } from './effect';

const G = (group: string) => ({ section: 'Effect', group });
const posX = () => num('cx', 'Centre X', G('Position'), 0.5, 0, 1, 0.001, '', 'Horizontal centre, as a fraction of the stage width.');
const posY = () => num('cy', 'Centre Y', G('Position'), 0.5, 0, 1, 0.001, '', 'Vertical centre, as a fraction of the stage height.');
const dur = (def: number, min = 0.2, max = 4) => num('duration', 'Duration', G('Timing'), def, min, max, 0.01, 's', 'Total length.');
/** Fade in quickly, hold, fade out: 0 at both ends. */
const env = (t: number, D: number, rise = 0.06, fall = 0.45): number => smoothstep(0, D * rise, t) * (1 - smoothstep(D * (1 - fall), D, t));

export const ripple: ShowEffect = {
  id: 'distort.ripple', name: 'Water ripple', tagline: 'Concentric rings travel outward and bend everything they pass.', category: 'candidate',
  params: [
    posX(), posY(),
    num('amplitude', 'Strength', G('Look'), 0.011, 0, 0.04, 0.0005, '', 'How far the picture is pushed by each ring.'),
    num('wavelength', 'Ring spacing', G('Look'), 0.075, 0.02, 0.3, 0.001, '', 'Distance between rings, in stage heights.'),
    num('speed', 'Speed', G('Timing'), 0.85, 0.2, 3, 0.01, '', 'How fast the rings travel, in stage heights per second.'),
    num('packet', 'Ring train length', G('Look'), 0.3, 0.05, 1.2, 0.01, '', 'How many rings trail behind the front.'),
    num('shine', 'Water shine', G('Look'), 0.5, 0, 2, 0.01, 'x', 'Light and shade riding on the rings.'),
    dur(1.5),
  ],
  duration: (p) => n(p, 'duration'),
  impactAt: () => 0,
  cues: () => [{ t: 0, kind: 'sweep', gain: 0.35, dur: 0.8, pitch: 0.7 }],
  build(f: Frame, t, p, ctx) {
    const D = n(p, 'duration');
    if (t < 0 || t >= D) return;
    const k = n(p, 'amplitude') * env(t, D, 0.04, 0.55);
    f.distort.push({ kind: DISTORT.ripple, a: [k, n(p, 'speed') * t, n(p, 'wavelength')], b: [n(p, 'cx') * ctx.aspect, n(p, 'cy'), n(p, 'packet'), n(p, 'shine')] });
  },
};

export const lens: ShowEffect = {
  id: 'distort.lens', name: 'Lens bulge', tagline: 'A section of the picture swells like a magnifying glass, or pinches inward.', category: 'candidate',
  params: [
    posX(), posY(),
    enm('mode', 'Direction', G('Look'), 'bulge', [['bulge', 'Bulge out'], ['pinch', 'Pinch in']], 'Magnify the area, or squeeze it toward the centre.'),
    num('strength', 'Strength', G('Look'), 0.55, 0, 1.2, 0.01, '', 'How strong the lens is at its peak.'),
    num('radius', 'Size', G('Look'), 0.34, 0.08, 0.9, 0.005, '', 'Radius of the lens, in stage heights.'),
    dur(0.9),
  ],
  duration: (p) => n(p, 'duration'),
  impactAt: (p) => n(p, 'duration') * 0.3,
  cues: () => [{ t: 0.02, kind: 'whoosh', gain: 0.3, dur: 0.5 }],
  build(f: Frame, t, p, ctx) {
    const D = n(p, 'duration');
    if (t < 0 || t >= D) return;
    const u = t / D, pulse = u < 0.3 ? easeOutCubic(u / 0.3) : 1 - smoothstep(0.3, 1, u);
    const k = n(p, 'strength') * pulse * (s(p, 'mode') === 'pinch' ? -1 : 1);
    f.distort.push({ kind: DISTORT.lens, a: [k, 0, 0], b: [n(p, 'cx') * ctx.aspect, n(p, 'cy'), n(p, 'radius'), 0] });
  },
};

export const heat: ShowEffect = {
  id: 'distort.heat', name: 'Heat haze', tagline: 'The air shimmers: a slow, wobbling shimmer rising through the picture.', category: 'candidate',
  params: [
    num('amplitude', 'Strength', G('Look'), 0.007, 0, 0.03, 0.0005, '', 'How far the shimmer moves things.'),
    num('frequency', 'Fineness', G('Look'), 14, 3, 40, 0.5, '', 'Size of the shimmer: higher is finer.'),
    num('top', 'Band top', G('Position'), 0, 0, 1, 0.01, '', 'Top of the shimmering band, as a fraction of the stage height.'),
    num('bottom', 'Band bottom', G('Position'), 1, 0, 1, 0.01, '', 'Bottom of the band.'),
    dur(2.2, 0.5, 8),
  ],
  duration: (p) => n(p, 'duration'),
  impactAt: () => 0,
  build(f: Frame, t, p) {
    const D = n(p, 'duration');
    if (t < 0 || t >= D) return;
    f.distort.push({ kind: DISTORT.heat, a: [n(p, 'amplitude') * env(t, D, 0.2, 0.3), t, n(p, 'frequency')], b: [0, 0, n(p, 'top'), n(p, 'bottom')] });
  },
};

export const glitch: ShowEffect = {
  id: 'distort.glitch', name: 'Digital glitch', tagline: 'Slices of the picture jump sideways with colour tearing, in short bursts.', category: 'candidate',
  params: [
    num('amplitude', 'Tear distance', G('Look'), 0.06, 0, 0.25, 0.002, '', 'How far slices jump.'),
    num('bands', 'Slices', G('Look'), 26, 6, 80, 1, 'count', 'Number of horizontal slices.', true),
    num('split', 'Colour tearing', G('Look'), 0.005, 0, 0.03, 0.0005, '', 'Red/blue separation on torn slices.'),
    num('density', 'Density', G('Look'), 0.45, 0.1, 0.95, 0.01, '', 'Share of slices that jump in each burst.'),
    num('rate', 'Burst rate', G('Timing'), 14, 4, 40, 1, 'hz', 'How often the pattern changes.'),
    dur(0.7, 0.2, 4),
  ],
  duration: (p) => n(p, 'duration'),
  impactAt: () => 0,
  cues: () => [{ t: 0, kind: 'zap', gain: 0.35, dur: 0.4, pitch: 1.6 }],
  build(f: Frame, t, p) {
    const D = n(p, 'duration');
    if (t < 0 || t >= D) return;
    const step = Math.floor(t * n(p, 'rate'));
    const burst = h1(step * 3 + 5) > 0.22 ? 1 : 0.15;                                  // some frames are calm, some violent
    const e = env(t, D, 0.05, 0.3) * burst;
    f.distort.push({ kind: DISTORT.glitch, a: [n(p, 'amplitude') * e, step + 1, 1 - n(p, 'density')], b: [0, 0, n(p, 'bands'), n(p, 'split') * e] });
  },
};

export const wave: ShowEffect = {
  id: 'distort.wave', name: 'Wobble', tagline: 'The picture sways like jelly or underwater.', category: 'candidate',
  params: [
    num('amplitude', 'Strength', G('Look'), 0.012, 0, 0.05, 0.0005, '', 'How far the picture sways.'),
    num('frequency', 'Waves', G('Look'), 16, 2, 50, 0.5, '', 'How many waves fit across the picture.'),
    num('vertical', 'Vertical sway', G('Look'), 0.5, 0, 1.5, 0.01, 'x', 'Sway up and down as well as sideways.'),
    num('speed', 'Speed', G('Timing'), 7, 1, 25, 0.1, '', 'How fast the waves run.'),
    dur(1.5, 0.3, 6),
  ],
  duration: (p) => n(p, 'duration'),
  impactAt: () => 0,
  build(f: Frame, t, p) {
    const D = n(p, 'duration');
    if (t < 0 || t >= D) return;
    f.distort.push({ kind: DISTORT.wave, a: [n(p, 'amplitude') * env(t, D, 0.12, 0.4), t * n(p, 'speed'), n(p, 'frequency')], b: [0, 0, n(p, 'vertical'), 0] });
  },
};

export const zoomBlur: ShowEffect = {
  id: 'distort.zoom', name: 'Zoom blur', tagline: 'A radial rush toward a point: a speed punch.', category: 'candidate',
  params: [
    posX(), posY(),
    num('strength', 'Strength', G('Look'), 0.14, 0, 0.4, 0.005, '', 'Length of the blur at its peak.'),
    dur(0.5, 0.15, 3),
  ],
  duration: (p) => n(p, 'duration'),
  impactAt: () => 0.05,
  cues: () => [{ t: 0, kind: 'whoosh', gain: 0.4, dur: 0.4, pitch: 1.3 }],
  build(f: Frame, t, p, ctx) {
    const D = n(p, 'duration');
    if (t < 0 || t >= D) return;
    const u = t / D, pulse = u < 0.18 ? easeOutCubic(u / 0.18) : (1 - smoothstep(0.18, 1, u)) ** 1.5;
    f.distort.push({ kind: DISTORT.zoom, a: [n(p, 'strength') * pulse, 0, 0], b: [n(p, 'cx') * ctx.aspect, n(p, 'cy'), 0, 0] });
  },
};

export const chroma: ShowEffect = {
  id: 'distort.chroma', name: 'Colour split', tagline: 'Red and blue slide apart toward the edges, then snap back.', category: 'candidate',
  params: [
    posX(), posY(),
    num('amount', 'Split', G('Look'), 0.028, 0, 0.1, 0.001, '', 'How far the colours separate at the edges.'),
    dur(0.5, 0.15, 3),
  ],
  duration: (p) => n(p, 'duration'),
  impactAt: () => 0.04,
  build(f: Frame, t, p, ctx) {
    const D = n(p, 'duration');
    if (t < 0 || t >= D) return;
    const u = t / D, pulse = u < 0.12 ? easeOutCubic(u / 0.12) : Math.exp(-(u - 0.12) * 4.5) * (1 - smoothstep(0.7, 1, u));
    f.distort.push({ kind: DISTORT.chroma, a: [n(p, 'amount') * pulse, 0, 0], b: [n(p, 'cx') * ctx.aspect, n(p, 'cy'), 0, 0] });
  },
};

export const pixelate: ShowEffect = {
  id: 'distort.pixelate', name: 'Pixelate', tagline: 'The picture breaks into blocks and resolves again.', category: 'candidate',
  params: [
    num('size', 'Largest block', G('Look'), 0.045, 0.01, 0.15, 0.001, '', 'Block size at the peak, in stage heights.'),
    dur(0.8, 0.2, 3),
  ],
  duration: (p) => n(p, 'duration'),
  impactAt: () => 0.3,
  build(f: Frame, t, p) {
    const D = n(p, 'duration');
    if (t < 0 || t >= D) return;
    const u = t / D, pulse = u < 0.35 ? easeOutCubic(u / 0.35) : 1 - smoothstep(0.35, 1, u);
    if (pulse < 0.02) return;
    f.distort.push({ kind: DISTORT.pixelate, a: [1, 0, 0.002 + n(p, 'size') * pulse], b: [0, 0, 0, 0] });
  },
};

export const scanlines: ShowEffect = {
  id: 'distort.scan', name: 'CRT scanlines', tagline: 'Old-monitor scanlines drift down the picture, with a darkened vignette.', category: 'candidate',
  params: [
    num('darkness', 'Line strength', G('Look'), 0.5, 0, 1, 0.01, '', 'How dark the lines are.'),
    num('frequency', 'Line density', G('Look'), 520, 100, 1400, 10, '', 'Lines across the picture height.'),
    num('vignette', 'Vignette', G('Look'), 0.35, 0, 1, 0.01, '', 'Darkening toward the corners.'),
    num('scroll', 'Scroll', G('Timing'), 3, 0, 20, 0.1, '', 'How fast the lines crawl.'),
    dur(1.8, 0.4, 8),
  ],
  duration: (p) => n(p, 'duration'),
  impactAt: () => 0,
  build(f: Frame, t, p) {
    const D = n(p, 'duration');
    if (t < 0 || t >= D) return;
    const e = env(t, D, 0.15, 0.25);
    f.distort.push({ kind: DISTORT.scan, a: [n(p, 'darkness') * e, -t * n(p, 'scroll'), n(p, 'frequency')], b: [0.5 * 16 / 9, 0.5, n(p, 'vignette') * e, 0] });
  },
};

export const shear: ShowEffect = {
  id: 'distort.shear', name: 'Shear hit', tagline: 'The picture slams sideways and wobbles back, like a heavy hit.', category: 'candidate',
  params: [
    num('amount', 'Strength', G('Look'), 0.09, 0, 0.3, 0.002, '', 'How far the top slides against the bottom.'),
    num('frequency', 'Wobble', G('Look'), 13, 3, 30, 0.5, 'hz', 'Oscillations per second.'),
    num('damping', 'Damping', G('Look'), 5, 1, 14, 0.1, '', 'How quickly it settles.'),
    dur(0.7, 0.2, 3),
  ],
  duration: (p) => n(p, 'duration'),
  impactAt: () => 0.02,
  cues: () => [{ t: 0, kind: 'thump', gain: 0.5 }],
  build(f: Frame, t, p, ctx) {
    const D = n(p, 'duration');
    if (t < 0 || t >= D) return;
    const k = n(p, 'amount') * Math.sin(t * n(p, 'frequency') * Math.PI * 2) * Math.exp(-t * n(p, 'damping')) * (1 - smoothstep(D * 0.8, D, t));
    f.distort.push({ kind: DISTORT.shear, a: [k, 0, 0], b: [ctx.aspect * 0.5, 0.5, 0, 0] });
  },
};

export const DISTORTIONS: ShowEffect[] = [ripple, lens, heat, glitch, wave, zoomBlur, chroma, pixelate, scanlines, shear];
void clamp;
