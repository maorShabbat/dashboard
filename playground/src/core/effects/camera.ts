import { color, enm, num, ref } from '../params';
import { seg, smoothstep } from '../util/easing';
import { withAlpha } from '../util/color';
import { clamp } from './helpers';
import { type EffectDef, commonParams, P } from './types';

const lk = { section: 'effect', group: 'Look' };
const mo = { section: 'effect', group: 'Motion' };

export const screenShake: EffectDef = {
  type: 'screenShake',
  label: 'Screen shake',
  description: 'Camera shake with decay, optional roll and zoom punch. Moves every layer that follows the camera.',
  category: 'shake',
  defaultLayer: null,
  defaultCues: [{ cue: 'shake.impact', at: 0 }],
  params: [
    ...commonParams({ duration: 600, layer: null, easing: null, seed: true, noOpacity: true }),
    num('amplitude', 'Amplitude', mo, 8, 0, 60, 0.5, 'cell%', 'Peak displacement as a percentage of a cell. Scales with intensity.'),
    num('frequency', 'Frequency', mo, 18, 1, 40, 0.5, 'hz', 'Shake oscillations per second.'),
    num('decay', 'Decay', mo, 1.6, 0.2, 4, 0.05, 'ratio', 'How quickly the shake dies away (higher = faster).'),
    enm('axis', 'Axis', mo, 'both', [['both', 'Both'], ['x', 'Horizontal'], ['y', 'Vertical']], 'Which axes move.'),
    num('rotation', 'Roll', mo, 0.6, 0, 6, 0.1, 'deg', 'Peak camera roll.'),
    num('zoomPunch', 'Zoom punch', mo, 1.5, 0, 10, 0.1, '%', 'Impact zoom that relaxes over the duration.'),
  ],
  evaluate(c) {
    const env = (1 - c.p) ** P.n(c, 'decay');
    const I = c.intensity;
    const A = c.layout.px(P.n(c, 'amplitude')) * I * env;
    const w = (P.n(c, 'frequency') * Math.PI * 2 * c.t) / 1000;
    const r = c.rng(97);
    const p1 = r.next() * 6.28, p2 = r.next() * 6.28, p3 = r.next() * 6.28;
    const axis = P.s(c, 'axis');
    c.out.camera.push({
      dx: axis === 'y' ? 0 : A * (0.7 * Math.sin(w + p1) + 0.3 * Math.sin(w * 2.3 + p2)),
      dy: axis === 'x' ? 0 : A * (0.7 * Math.sin(w * 1.13 + p2) + 0.3 * Math.sin(w * 2.9 + p3)),
      rot: P.n(c, 'rotation') * I * env * Math.sin(w * 0.9 + p3),
      zoom: (P.n(c, 'zoomPunch') / 100) * I * env * env,
    });
  },
};

export const flash: EffectDef = {
  type: 'flash',
  label: 'Screen flash',
  description: 'Full-screen flash with attack/decay. Strobing is capped by the theme\'s photosensitivity limits.',
  category: 'flash',
  defaultLayer: 'overlay',
  defaultCues: [],
  params: [
    ...commonParams({ duration: 500, layer: 'overlay', blend: 'screen', easing: null, noOpacity: true }),
    color('color', 'Colour', lk, ref('color.text'), 'Flash colour.'),
    enm('shape', 'Shape', lk, 'radial', [['full', 'Full screen'], ['radial', 'Radial burst']], 'Even fill or a burst centred on the board.'),
    num('peak', 'Peak opacity', lk, 60, 0, 100, 1, '%', 'Opacity at the brightest point. Clamped by safety.maxFlashAlpha.'),
    num('attack', 'Attack', mo, 10, 0, 90, 1, '%', 'Share of each strobe spent rising.'),
    num('strobes', 'Strobes', mo, 1, 1, 8, 1, 'count', 'Flashes in the duration. Limited by safety.maxFlashHz.', true),
  ],
  evaluate(c) {
    const maxHz = c.tokens['safety.maxFlashHz'] as number;
    const cap = Math.max(1, Math.floor(maxHz * (c.duration / 1000)));
    const strobes = Math.max(1, Math.min(P.n(c, 'strobes'), maxHz <= 0 ? 1 : cap));
    const peak = Math.min(P.n(c, 'peak'), c.tokens['safety.maxFlashAlpha'] as number) / 100;
    const k = Math.min(Math.floor(c.p * strobes), strobes - 1);
    const w = clamp(c.p * strobes - k, 0, 1);
    const atk = Math.max(0.001, P.n(c, 'attack') / 100);
    const env = w < atk ? smoothstep(w / atk) : 1 - smoothstep(seg(w, atk, 1));
    const a = clamp(peak * env * Math.min(c.intensity, 2), 0, c.tokens['safety.maxFlashAlpha'] as number / 100);
    const col = P.s(c, 'color');
    const L = c.layout;
    c.out.push({
      op: 'rect', layer: c.layer, cx: L.vw / 2, cy: L.vh / 2, w: L.vw, h: L.vh, blend: P.s(c, 'blend'), alpha: a,
      fill: P.s(c, 'shape') === 'radial' ? { g: 'radial', stops: [[0, col], [0.55, withAlpha(col, 0.55)], [1, withAlpha(col, 0)]] } : col,
    });
  },
};
