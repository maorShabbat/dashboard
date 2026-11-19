import type { Preset } from '../model/preset';
import { gradientPreset, makeGradient } from '../style/gradient';
import { F, I, T, imageIn, mo, motion, preset, scene, shine, textIn, ts } from './kit';

const CAT = 'shine' as const;
const L = 4.2;
const title = (o: Parameters<typeof T>[2] = {}) => T('title', 'SHINE', { size: 0.22, style: ts('gold-chunky'), motion: motion({ entrance: mo.in('pop', { duration: 0.5 }), exit: mo.in('fade-out', { start: L - 0.4 }) }), ...o });

export function shinePresets(): Preset[] {
  const txt = [textIn('title', 'Text')];
  return [
    preset(CAT, 'sweep-text', 'Light sweep (text)', 'A soft band of light sweeps across the letters, twice, with a glow that feeds the bloom.',
      scene([title({ shine: shine({ start: 0.7, duration: 0.9, repeat: 2, interval: 0.7, width: 0.22, intensity: 0.95 }) })], [], { duration: L }), { tags: ['shine', 'sweep'], inputs: txt }),
    preset(CAT, 'sweep-icon', 'Light sweep (symbol)', 'The same sweep over a symbol, following its real silhouette.',
      scene([I('sym', 'builtin:crown', { size: 0.34, y: 0.5, motion: motion({ entrance: mo.in('pop', { duration: 0.5 }), exit: mo.in('fade-out', { start: L - 0.4 }) }), shine: shine({ start: 0.7, duration: 0.8, repeat: 2, interval: 0.8, width: 0.3, angle: 25 }) })], [], { duration: L }), { tags: ['shine', 'sweep', 'symbol'], inputs: [imageIn('sym', 'Symbol')] }),
    preset(CAT, 'sparkle-text', 'Sparkles (text)', 'Four-point glints twinkle on the letters themselves, never on empty space.',
      scene([title()], [F('spark', 'light.sparkle', 0.6, { count: 26, duration: 3, life: 0.6, size: 0.06 }, { target: 'title' })], { duration: L }), { tags: ['shine', 'sparkle'], inputs: txt }),
    preset(CAT, 'sparkle-icon', 'Sparkles (symbol)', 'Glints twinkle across a symbol\'s own pixels.',
      scene([I('sym', 'builtin:gem', { size: 0.34, y: 0.5, motion: motion({ entrance: mo.in('pop', { duration: 0.5 }), exit: mo.in('fade-out', { start: L - 0.4 }) }) })], [F('spark', 'light.sparkle', 0.6, { count: 16, duration: 3, size: 0.07, tint: '#e8fbff' }, { target: 'sym' })], { duration: L }), { tags: ['shine', 'sparkle', 'symbol'], inputs: [imageIn('sym', 'Symbol')] }),
    preset(CAT, 'glow-pulse', 'Glow pulse', 'The halo behind the letters swells and fades, with rings sent outward.',
      scene([title({ style: ts('neon-sign'), motion: motion({ entrance: mo.in('fade-in', { duration: 0.5 }), emphasis: [mo.in('glow-pulse', { start: 0.8, duration: 1 }), mo.in('glow-pulse', { start: 2.2, duration: 1 })], exit: mo.in('fade-out', { start: L - 0.4 }) }) })],
        [F('halo', 'light.halo', 0.3, { cy: 0.5, size: 0.5, duration: 3.6, pulses: 3, tint: '#ff7ad9' })], { duration: L }), { tags: ['shine', 'glow'], inputs: txt }),
    preset(CAT, 'light-rays', 'Light rays', 'Beams fan out and slowly turn behind the words.',
      scene([title()], [F('rays', 'light.rays', 0.1, { duration: 4, count: 18, tint: '#ffe08a' })], { duration: L }), { tags: ['shine', 'rays'], inputs: txt }),
    preset(CAT, 'lens-flare', 'Lens flare', 'A bright flare with a ring and a long streak crosses the title.',
      scene([title({ style: ts('chrome-impact') })], [F('flare', 'light.flare', 0.8, { cx: 0.5, cy: 0.5, size: 0.3, duration: 1.4 }), F('flare2', 'light.flare', 2.3, { cx: 0.62, cy: 0.5, size: 0.2, duration: 1.1, tint: '#cfeaff' })], { duration: L }), { tags: ['shine', 'flare'], inputs: txt }),
    preset(CAT, 'foil-sheen', 'Holographic foil', 'An animated rainbow foil runs through the face while a moving light band glints across it.',
      scene([title({ style: ts('rainbow-pop', (s) => { s.face = { ...gradientPreset('rainbow'), repeat: 1.6, reflect: true, anim: { enabled: true, speed: 0.4, direction: 'forward', loop: 'loop' } }; }), shine: shine({ start: 0.8, duration: 1.1, repeat: 2, interval: 0.6, width: 0.3, intensity: 0.7 }) })], [], { duration: L }), { tags: ['shine', 'gradient'], inputs: txt }),
    preset(CAT, 'twinkle-field', 'Twinkling stars', 'A field of small stars fades up and down around the words.',
      scene([title({ style: ts('ice-crystal') })], [F('stars', 'light.twinkle', 0.1, { duration: 4, count: 60 })], { duration: L }), { tags: ['shine', 'stars'], inputs: txt }),
    preset(CAT, 'rim-light', 'Rim light', 'A bright highlight travels around the outline of the letters as an animated conic gradient.',
      scene([title({ style: ts('clean-white', (s) => {
        s.outlines = [{ id: 'o1', enabled: true, width: 0.05, fill: { ...makeGradient('conic', [[0, '#ffffff'], [0.1, '#38e8ff'], [0.3, '#2a4fb0'], [0.7, '#2a4fb0'], [0.9, '#ff2bd6'], [1, '#ffffff']], { anim: { enabled: true, speed: 0.5, direction: 'forward', loop: 'loop' } }) }, join: 'round' }];
        s.face = makeGradient('solid', [[0, '#16275a']]);
        s.glow = { enabled: true, fill: makeGradient('conic', [[0, '#ffffff'], [0.15, '#38e8ff'], [0.35, '#000000', 0], [0.8, '#000000', 0], [0.9, '#ff2bd6'], [1, '#ffffff']], { anim: { enabled: true, speed: 0.5, direction: 'forward', loop: 'loop' } }), radius: 0.2, strength: 1, bloom: true };
      }) })], [], { duration: L }), { tags: ['shine', 'gradient', 'outline'], inputs: txt }),
  ];
}
