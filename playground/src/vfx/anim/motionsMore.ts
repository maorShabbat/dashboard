/**
 * More motions: the second half of the registry. Same rules as motions.ts: a motion is a pure function of progress `u` to a
 * Contribution (entrance/exit: identity at the resting end; emphasis: identity at both ends; idle: periodic).
 */
import type { MotionDef, MotionCtx, Contribution } from './motions';
import { enm } from '../../core/params';
import type { Params } from '../model/scene';
import { bell, clamp01, easeInBack, easeInCubic, easeInQuad, easeOutBack, easeOutBounce, easeOutCubic, easeOutElastic, easeOutExpo, hash, lerp, smooth } from './easing';

export interface MotionHelpers {
  C(p?: Partial<Contribution>): Contribution;
  p(c: MotionCtx, key: string, fallback: number): number;
  TAU: number;
  distP(def: number): MotionDef['params'][number];
  turnsP(def: number): MotionDef['params'][number];
  sizeP(key: string, label: string, def: number, max?: number): MotionDef['params'][number];
  ampP(def: number, max?: number): MotionDef['params'][number];
}

export function moreMotions(h: MotionHelpers): MotionDef[] {
  const { C, p, TAU, distP, turnsP, sizeP, ampP } = h;
  const out: MotionDef[] = [];
  const ent = (m: Omit<MotionDef, 'slots' | 'defaults'> & { duration: number; unit?: MotionDef['defaults']['unit']; stagger?: number; order?: MotionDef['defaults']['order']; defs?: Params }) =>
    out.push({ ...m, slots: ['entrance'], defaults: { duration: m.duration, unit: m.unit, stagger: m.stagger, order: m.order, params: m.defs } });
  const idl = (m: Omit<MotionDef, 'slots' | 'defaults'> & { duration: number; unit?: MotionDef['defaults']['unit']; stagger?: number; defs?: Params }) =>
    out.push({ ...m, slots: ['idle'], defaults: { duration: m.duration, unit: m.unit, stagger: m.stagger, params: m.defs } });
  const emp = (m: Omit<MotionDef, 'slots' | 'defaults'> & { duration: number; unit?: MotionDef['defaults']['unit']; stagger?: number; defs?: Params }) =>
    out.push({ ...m, slots: ['emphasis'], defaults: { duration: m.duration, unit: m.unit, stagger: m.stagger, params: m.defs } });
  const ext = (m: Omit<MotionDef, 'slots' | 'defaults'> & { duration: number; unit?: MotionDef['defaults']['unit']; stagger?: number; order?: MotionDef['defaults']['order']; defs?: Params }) =>
    out.push({ ...m, slots: ['exit'], defaults: { duration: m.duration, unit: m.unit, stagger: m.stagger, order: m.order, params: m.defs } });

  // -------------------------------------------------------------------------------------------------------------------
  // ENTRANCES
  ent({
    id: 'domino-in', name: 'Domino', description: 'Letters tip over into place one after another, like dominoes.', duration: 0.55, unit: 'char', stagger: 0.07, defs: {}, params: [],
    eval(u, c) {
      const e = easeOutBounce(clamp01(u * 1.02)), k = 1 - e;
      return C({ rot: -k * 1.45 * c.amount, dx: -k * 0.45 * c.amount, dy: k * 0.18, alpha: clamp01(u * 9), bright: 1 - 0.35 * k });
    },
  });
  ent({
    id: 'swoop-in', name: 'Swoop', description: 'Each letter swoops up from below along a curve and lands with a little hop.', duration: 0.75, unit: 'char', stagger: 0.05, defs: { distance: 2.2 }, params: [distP(2.2)],
    eval(u, c) {
      const e = easeOutCubic(u), d = p(c, 'distance', 2.2) * c.amount, k = 1 - e;
      const hop = u > 0.8 ? Math.sin(((u - 0.8) / 0.2) * Math.PI) * 0.08 : 0;
      return C({ dx: -k * d * 0.9, dy: k * k * d * 0.7 - hop, rot: -k * 0.9, sx: lerp(0.6, 1, easeOutBack(u, 1.3)), sy: lerp(0.6, 1, easeOutBack(u, 1.3)), alpha: smooth(0, 0.2, u) });
    },
  });
  ent({
    id: 'cascade-in', name: 'Cascade', description: 'Letters fall in from above with a small tilt, ease down and settle.', duration: 0.7, unit: 'char', stagger: 0.06, defs: { distance: 1.4 }, params: [distP(1.4)],
    eval(u, c) {
      const e = easeOutBack(u, 0.9), k = 1 - e;
      return C({ dy: -k * p(c, 'distance', 1.4) * c.amount, rot: k * (c.rnd(1) - 0.5) * 1.2 * c.amount, alpha: smooth(0, 0.3, u) });
    },
  });
  ent({
    id: 'zoom-letters', name: 'Zoom through', description: 'Each letter rushes in from the viewer, huge and sharp, and locks into place.', duration: 0.5, unit: 'char', stagger: 0.05, defs: { from: 3.4 }, params: [sizeP('from', 'Start scale', 3.4, 10)],
    eval(u, c) { const e = easeOutExpo(u), s = lerp(p(c, 'from', 3.4) * c.amount + (1 - c.amount), 1, e); return C({ sx: s, sy: s, alpha: smooth(0, 0.35, u), bright: 1 + 0.6 * (1 - e) }); },
  });
  ent({
    id: 'card-flip-in', name: 'Card flip', description: 'Letters turn over like playing cards, back first, then face.', duration: 0.6, unit: 'char', stagger: 0.07, defs: {}, params: [],
    eval(u) { const e = easeOutBack(u, 0.9), sx = Math.abs(Math.cos(Math.PI * (1 - e))); return C({ sx: Math.max(0.001, sx), bright: lerp(0.5, 1, smooth(0.4, 1, u)), alpha: clamp01(u * 8) }); },
  });
  ent({
    id: 'whip-in', name: 'Whip', description: 'Slams in from the screen edge at speed, skewed, and snaps straight.', duration: 0.45, defs: { side: 'left' },
    params: [enm('side', 'From', { section: 'Motion', group: 'Motion' }, 'left', [['left', 'Left'], ['right', 'Right']], 'Which edge it comes from.')],
    eval(u, c) {
      const e = easeOutExpo(u), k = 1 - e, side = String(c.params.side ?? 'left') === 'right' ? 1 : -1;
      const over = u > 0.7 ? Math.sin(((u - 0.7) / 0.3) * Math.PI) * 0.03 * side * -1 : 0;
      return C({ dx: side * (c.edge.l + 1) * k + over, skew: side * k * 0.55, sx: 1 + k * 0.4, alpha: clamp01(u * 12), bright: 1 + 0.4 * k });
    },
  });
  ent({
    id: 'blast-in', name: 'Blast in', description: 'Bursts from nothing past full size with a bright flash, then settles.', duration: 0.55, defs: { overshoot: 3 }, params: [sizeP('overshoot', 'Overshoot', 3, 6)],
    eval(u, c) { const s = easeOutBack(u, p(c, 'overshoot', 3) * c.amount); return C({ sx: s, sy: s, alpha: clamp01(u * 10), bright: 1 + 1.6 * (1 - u) ** 3, glow: 1 + 2 * (1 - u) ** 2 }); },
  });
  ent({
    id: 'rubber-drop', name: 'Rubber drop', description: 'Drops stretched, squashes flat on landing and wobbles back to shape.', duration: 0.9, defs: { distance: 2.4 }, params: [distP(2.4)],
    eval(u, c) {
      const fall = clamp01(u / 0.38);
      if (u < 0.38) { const y = 1 - easeInQuad(fall); return C({ dy: -y * p(c, 'distance', 2.4) * c.amount, sy: 1 + 0.35 * fall, sx: 1 - 0.14 * fall, alpha: smooth(0, 0.1, u) }); }
      const r = clamp01((u - 0.38) / 0.62), w = Math.exp(-r * 4.5) * Math.cos(r * 17) * (1 - r);
      return C({ sy: 1 - 0.38 * w * c.amount, sx: 1 + 0.3 * w * c.amount });
    },
  });
  ent({
    id: 'ripple-in', name: 'Ripple in', description: 'Letters rise through a ripple that dies away as they appear.', duration: 0.9, unit: 'char', stagger: 0.05, defs: { amplitude: 0.5 }, params: [ampP(0.5, 2)],
    eval: (u, c) => C({ dy: Math.sin(u * Math.PI * 3.2) * (1 - u) * p(c, 'amplitude', 0.5) * c.amount + (1 - easeOutCubic(u)) * 0.3, alpha: smooth(0, 0.3, u), sx: 1 + 0.08 * Math.sin(u * Math.PI * 3.2) * (1 - u), sy: 1 - 0.08 * Math.sin(u * Math.PI * 3.2) * (1 - u) }),
  });
  ent({
    id: 'tumble-in', name: 'Tumble', description: 'Letters tumble down spinning and land upright.', duration: 0.85, unit: 'char', stagger: 0.05, order: 'random', defs: { turns: 1.5 }, params: [turnsP(1.5)],
    eval(u, c) {
      const e = easeOutBounce(clamp01(u * 1.03)), k = 1 - easeOutCubic(u), dir = c.rnd(2) > 0.5 ? 1 : -1;
      return C({ rot: dir * k * TAU * p(c, 'turns', 1.5) * c.amount, dy: -(1 - e) * 1.8 * c.amount, alpha: clamp01(u * 10), sx: lerp(0.5, 1, easeOutCubic(u)), sy: lerp(0.5, 1, easeOutCubic(u)) });
    },
  });
  ent({
    id: 'unfold-x', name: 'Open sideways', description: 'Letters open from a vertical line to full width, like a curtain parting.', duration: 0.5, unit: 'char', stagger: 0.05, defs: {}, params: [],
    eval: (u) => C({ sx: Math.max(0.001, easeOutBack(u, 1.5)), alpha: clamp01(u * 8) }),
  });
  ent({
    id: 'grow-up', name: 'Grow up', description: 'Letters grow upward from the baseline with a springy overshoot.', duration: 0.6, unit: 'char', stagger: 0.05, defs: {}, params: [],
    eval(u) { const s = Math.max(0.001, easeOutBack(u, 1.8)); return C({ sy: s, sx: lerp(0.8, 1, easeOutCubic(u)), dy: (1 - s) * 0.5, alpha: clamp01(u * 6) }); },
  });
  ent({
    id: 'meteor-in', name: 'Meteor', description: 'Streaks in from the upper corner, hits hard with a flash and squashes.', duration: 0.65, defs: { distance: 3.4 }, params: [distP(3.4)],
    eval(u, c) {
      const f = clamp01(u / 0.55);
      if (u < 0.55) { const e = easeInCubic(f), d = p(c, 'distance', 3.4) * c.amount; return C({ dx: (1 - e) * d, dy: -(1 - e) * d, rot: (1 - e) * 0.5, sx: 1 + 0.3 * (1 - e), alpha: smooth(0, 0.15, u) }); }
      const r = clamp01((u - 0.55) / 0.45), w = Math.exp(-r * 5) * Math.cos(r * 13) * (1 - r);
      return C({ sx: 1 + 0.2 * w, sy: 1 - 0.22 * w, bright: 1 + 0.9 * Math.exp(-r * 8) * (1 - r), glow: 1 + 1.5 * Math.exp(-r * 6) * (1 - r) });
    },
  });
  ent({
    id: 'elastic-letters', name: 'Elastic letters', description: 'Every letter springs up from nothing and wobbles to rest.', duration: 0.9, unit: 'char', stagger: 0.06, defs: {}, params: [],
    eval: (u) => { const s = easeOutElastic(u, 0.42); return C({ sx: s, sy: s, alpha: clamp01(u * 8) }); },
  });
  ent({
    id: 'shake-in', name: 'Shake in', description: 'Appears huge and shaking, then shrinks to size as the shaking dies.', duration: 0.6, defs: { from: 1.9 }, params: [sizeP('from', 'Start scale', 1.9, 6)],
    eval(u, c) {
      const f = Math.floor(u * 22), k = (1 - u) ** 1.5 * c.amount, s = lerp(1, p(c, 'from', 1.9), k);
      return C({ sx: s, sy: s, dx: (hash(f * 7.3) - 0.5) * 0.18 * k, dy: (hash(f * 3.1 + 5) - 0.5) * 0.12 * k, rot: (hash(f * 5.9 + 2) - 0.5) * 0.14 * k, alpha: smooth(0, 0.12, u) });
    },
  });
  ent({
    id: 'float-up', name: 'Float up', description: 'Drifts up softly while fading in. The quiet entrance.', duration: 0.9, defs: { distance: 0.5 }, params: [distP(0.5)],
    eval: (u, c) => C({ dy: (1 - easeOutCubic(u)) * p(c, 'distance', 0.5) * c.amount, alpha: smooth(0, 0.8, u) }),
  });
  ent({
    id: 'hang-in', name: 'Hanging letters', description: 'Letters drop in and swing on their ropes, each in its own rhythm.', duration: 1.1, unit: 'char', stagger: 0.06, defs: { angle: 0.6 }, params: [sizeP('angle', 'Swing', 0.6, 1.5)],
    eval: (u, c) => C({ dy: -(1 - easeOutCubic(u)) * 1.2, rot: p(c, 'angle', 0.6) * c.amount * (1 - u) * Math.cos(u * Math.PI * (3 + c.rnd(1) * 1.5)), alpha: smooth(0, 0.2, u) }),
  });
  ent({
    id: 'italic-slide', name: 'Italic slide', description: 'Slides in leaning hard, then straightens up.', duration: 0.55, defs: { distance: 1.4 }, params: [distP(1.4)],
    eval(u, c) { const e = easeOutCubic(u), k = 1 - e; return C({ dx: -k * p(c, 'distance', 1.4) * c.amount, skew: -k * 0.7 * c.amount, alpha: smooth(0, 0.3, u) }); },
  });
  ent({
    id: 'track-in', name: 'Spread out', description: 'Letters start bunched at the centre and spread apart to their places.', duration: 0.7, unit: 'char', defs: { amount: 0.9 }, params: [sizeP('amount', 'Bunching', 0.9, 1)],
    eval(u, c) { const e = easeOutBack(u, 0.8), k = (1 - e) * p(c, 'amount', 0.9) * c.amount; return C({ dx: -c.rx * k, alpha: smooth(0, 0.3, u) }); },
  });

  // -------------------------------------------------------------------------------------------------------------------
  // IDLES
  idl({
    id: 'jelly-wobble', name: 'Jelly', description: 'Letters wobble like jelly, each a little out of step.', duration: 1.3, unit: 'char', stagger: 0.09, defs: { size: 0.1 }, params: [sizeP('size', 'Wobble', 0.1, 0.5)],
    eval(u, c) { const k = Math.sin((u - c.i * 0.09 / 1.3) * TAU) * p(c, 'size', 0.1) * c.amount; return C({ sx: 1 + k, sy: 1 - k, rot: Math.sin((u - c.i * 0.09 / 1.3) * TAU) * 0.03 * c.amount }); },
  });
  idl({
    id: 'hop-wave', name: 'Hop wave', description: 'A wave of little hops runs along the letters.', duration: 1.6, unit: 'char', stagger: 0.1, defs: { height: 0.2 }, params: [sizeP('height', 'Height', 0.2, 1)],
    eval(u, c) { const t = ((u - c.i * 0.1 / 1.6) % 1 + 1) % 1, up = t < 0.3 ? Math.sin((t / 0.3) * Math.PI) : 0, sq = t > 0.3 && t < 0.45 ? Math.sin(((t - 0.3) / 0.15) * Math.PI) * 0.08 : 0; return C({ dy: -up * p(c, 'height', 0.2) * c.amount, sx: 1 + sq * c.amount, sy: 1 - sq * c.amount }); },
  });
  idl({
    id: 'twinkle', name: 'Twinkle', description: 'Letters catch the light at random, brightening and glowing.', duration: 2, unit: 'char', stagger: 0, defs: {}, params: [],
    eval(u, c) { const ph = c.rnd(3), k = Math.max(0, Math.sin((u + ph) * TAU * (1 + Math.floor(c.rnd(4) * 2)))) ** 8; return C({ bright: 1 + 0.55 * k * c.amount, glow: 1 + 1.4 * k * c.amount, sx: 1 + 0.04 * k * c.amount, sy: 1 + 0.04 * k * c.amount }); },
  });
  idl({
    id: 'neon-buzz', name: 'Neon buzz', description: 'A fast faint buzz in brightness, with the odd dropout.', duration: 0.6, unit: 'char', defs: {}, params: [],
    eval(u, c) { const f = Math.floor(u * 16) + c.i * 13; const dip = hash(f * 1.9) > 0.93 ? 0.45 : 1; return C({ bright: dip * (0.95 + 0.1 * hash(f)), glow: dip * (0.8 + 0.4 * hash(f + 7)), alpha: dip < 1 ? 0.7 : 1 }); },
  });
  idl({
    id: 'drift-apart', name: 'Drift', description: 'Each letter drifts on its own slow path.', duration: 3, unit: 'char', defs: { amplitude: 0.05 }, params: [ampP(0.05, 0.4)],
    eval(u, c) { const a = c.rnd(1) * TAU, b = c.rnd(2) * TAU, A = p(c, 'amplitude', 0.05) * c.amount; return C({ dx: Math.sin(u * TAU + a) * A, dy: Math.cos(u * TAU + b) * A, rot: Math.sin(u * TAU + a) * 0.04 * c.amount }); },
  });
  idl({
    id: 'pendulum', name: 'Pendulum', description: 'Letters swing like hanging tags, each at its own pace.', duration: 2, unit: 'char', defs: { angle: 0.16 }, params: [sizeP('angle', 'Angle', 0.16, 0.8)],
    eval(u, c) { const f = 1 + Math.floor(c.rnd(1) * 2); return C({ rot: Math.sin(u * TAU * f + c.rnd(2) * TAU) * p(c, 'angle', 0.16) * c.amount }); },
  });
  idl({
    id: 'flip-wave', name: 'Flip wave', description: 'A wave of half-turns runs along the letters.', duration: 2.2, unit: 'char', stagger: 0.12, defs: {}, params: [],
    eval(u, c) { const t = ((u - c.i * 0.12 / 2.2) % 1 + 1) % 1, f = t < 0.25 ? Math.abs(Math.cos((t / 0.25) * Math.PI)) : 1; return C({ sx: Math.max(0.001, f), bright: 1 + 0.25 * (1 - Math.abs(f)) * c.amount }); },
  });
  idl({
    id: 'squash-wave', name: 'Squash wave', description: 'Letters squash and stretch in a rolling wave.', duration: 1.2, unit: 'char', stagger: 0.08, defs: { size: 0.14 }, params: [sizeP('size', 'Squash', 0.14, 0.5)],
    eval(u, c) { const k = Math.sin((u - c.i * 0.08 / 1.2) * TAU) * p(c, 'size', 0.14) * c.amount; return C({ sx: 1 - k, sy: 1 + k, dy: -k * 0.25 }); },
  });
  idl({
    id: 'levitate', name: 'Levitate', description: 'Hangs in the air, bobbing and slowly turning toward and away.', duration: 3, defs: { amplitude: 0.07 }, params: [ampP(0.07)],
    eval: (u, c) => C({ dy: Math.sin(u * TAU) * p(c, 'amplitude', 0.07) * c.amount, rot: Math.sin(u * TAU + 2) * 0.035 * c.amount, sx: 1 + Math.sin(u * TAU + 1.3) * 0.02 * c.amount, bright: 1 + 0.06 * Math.sin(u * TAU) * c.amount }),
  });
  idl({
    id: 'shiver', name: 'Shiver', description: 'A cold shiver: quick small shakes with pauses.', duration: 1.4, defs: { amplitude: 0.012 }, params: [ampP(0.012, 0.1)],
    eval(u, c) { const t = u % 1, on = t < 0.35 ? 1 : 0, f = Math.floor(t * 30); return C({ dx: (hash(f * 2.7) - 0.5) * 2 * p(c, 'amplitude', 0.012) * on * c.amount, dy: (hash(f * 4.1 + 3) - 0.5) * p(c, 'amplitude', 0.012) * on * c.amount }); },
  });

  // -------------------------------------------------------------------------------------------------------------------
  // EMPHASIS
  emp({
    id: 'letters-jump', name: 'Letters jump', description: 'Each letter jumps in turn along the line.', duration: 0.5, unit: 'char', stagger: 0.05, defs: { height: 0.4 }, params: [sizeP('height', 'Height', 0.4, 1.5)],
    eval(u, c) { const up = Math.sin(Math.PI * u), sq = u > 0.85 ? Math.sin(((u - 0.85) / 0.15) * Math.PI) * 0.12 : 0; return C({ dy: -up * p(c, 'height', 0.4) * c.amount, sx: 1 + sq, sy: 1 - sq, rot: up * 0.1 * (c.i % 2 ? 1 : -1) * c.amount }); },
  });
  emp({
    id: 'flip-once', name: 'Flip once', description: 'Each letter does one full flip in turn.', duration: 0.6, unit: 'char', stagger: 0.06, defs: {}, params: [],
    eval(u) { const f = Math.abs(Math.cos(u * TAU)); return C({ sx: Math.max(0.001, f), bright: 1 + 0.3 * Math.sin(Math.PI * u) }); },
  });
  emp({
    id: 'zoom-punch', name: 'Zoom punch', description: 'A quick punch toward the viewer.', duration: 0.4, defs: { size: 0.35 }, params: [sizeP('size', 'Punch', 0.35, 1.5)],
    eval(u, c) { const k = u < 0.2 ? easeOutCubic(u / 0.2) : 1 - easeOutCubic((u - 0.2) / 0.8); const s = 1 + k * p(c, 'size', 0.35) * c.amount; return C({ sx: s, sy: s, bright: 1 + 0.5 * bell(u) * c.amount }); },
  });
  emp({
    id: 'glitch-hit', name: 'Glitch hit', description: 'A burst of digital corruption: jumps, tears and flashes.', duration: 0.45, defs: {}, params: [],
    eval(u, c) { const f = Math.floor(u * 12), k = bell(u) * c.amount; return C({ dx: (hash(f * 5.1) - 0.5) * 0.3 * k, dy: (hash(f * 2.9 + 1) - 0.5) * 0.06 * k, sx: 1 + (hash(f * 7.7) - 0.5) * 0.35 * k, skew: (hash(f * 3.7) - 0.5) * 0.5 * k, bright: 1 + 0.8 * hash(f * 9.1) * k, alpha: hash(f * 1.3) > 0.88 ? 0.35 : 1 }); },
  });
  emp({
    id: 'blink-flash', name: 'Blink', description: 'Two quick blinks of light.', duration: 0.5, defs: {}, params: [],
    eval(u, c) { const k = Math.max(bell(u / 0.45), bell((u - 0.5) / 0.5)); return C({ bright: 1 + 1.1 * k * c.amount, glow: 1 + 2.2 * k * c.amount, alpha: 1 - 0.5 * (u > 0.4 && u < 0.52 ? 1 : 0) }); },
  });
  emp({
    id: 'spotlight', name: 'Spotlight', description: 'A bright wave runs along the letters, lifting each as it passes.', duration: 0.45, unit: 'char', stagger: 0.07, defs: {}, params: [],
    eval: (u, c) => C({ bright: 1 + 0.9 * bell(u) * c.amount, glow: 1 + 2 * bell(u) * c.amount, dy: -0.12 * bell(u) * c.amount, sx: 1 + 0.1 * bell(u), sy: 1 + 0.1 * bell(u) }),
  });
  emp({
    id: 'skew-shake', name: 'Skew shake', description: 'Leans left and right with a rubbery shake.', duration: 0.6, defs: { amount: 0.4 }, params: [sizeP('amount', 'Lean', 0.4, 1)],
    eval: (u, c) => C({ skew: Math.sin(u * Math.PI * 6) * (1 - u) ** 1.5 * p(c, 'amount', 0.4) * c.amount, sx: 1 + Math.sin(u * Math.PI * 6) * (1 - u) * 0.04 }),
  });
  emp({
    id: 'swell-wave', name: 'Swell wave', description: 'A swell passes along the letters.', duration: 0.5, unit: 'char', stagger: 0.05, defs: { size: 0.3 }, params: [sizeP('size', 'Swell', 0.3, 1)],
    eval(u, c) { const s = 1 + bell(u) * p(c, 'size', 0.3) * c.amount; return C({ sx: s, sy: s, dy: -0.08 * bell(u) * c.amount }); },
  });

  // -------------------------------------------------------------------------------------------------------------------
  // EXITS
  ext({
    id: 'fall-letters', name: 'Fall away', description: 'Letters drop away with gravity, each spinning a little.', duration: 0.7, unit: 'char', stagger: 0.04, order: 'random', defs: { distance: 3.4 }, params: [distP(3.4)],
    eval(u, c) { const e = easeInQuad(u); return C({ dy: e * p(c, 'distance', 3.4) * c.amount, rot: e * (c.rnd(2) - 0.5) * 3 * c.amount, dx: e * (c.rnd(3) - 0.5) * 0.6, alpha: 1 - smooth(0.55, 1, u) }); },
  });
  ext({
    id: 'rise-fade-letters', name: 'Rise and fade', description: 'Letters lift off and fade one after another.', duration: 0.6, unit: 'char', stagger: 0.05, defs: { distance: 0.9 }, params: [distP(0.9)],
    eval: (u, c) => C({ dy: -easeInCubic(u) * p(c, 'distance', 0.9) * c.amount, alpha: 1 - smooth(0.1, 1, u), sx: 1 + 0.15 * u, sy: 1 + 0.15 * u }),
  });
  ext({
    id: 'zip-out', name: 'Zip', description: 'Collapses sideways to a line and vanishes.', duration: 0.4, defs: {}, params: [],
    eval: (u) => C({ sx: Math.max(0.001, 1 - easeInBack(u, 0.9)), sy: 1 + 0.15 * easeInCubic(u), alpha: 1 - smooth(0.7, 1, u), bright: 1 + 0.6 * easeInCubic(u) }),
  });
  ext({
    id: 'blast-out', name: 'Blast away', description: 'Flares bright, swells and fades out like a flash bulb.', duration: 0.45, defs: { to: 1.9 }, params: [sizeP('to', 'End scale', 1.9, 6)],
    eval(u, c) { const s = lerp(1, p(c, 'to', 1.9) * c.amount + (1 - c.amount), easeInCubic(u)); return C({ sx: s, sy: s, bright: 1 + 2 * bell(Math.min(1, u * 1.3)) * c.amount, glow: 1 + 3 * bell(Math.min(1, u * 1.3)), alpha: 1 - smooth(0.45, 1, u) }); },
  });
  ext({
    id: 'scatter-out', name: 'Scatter', description: 'Letters fly off in every direction, spinning.', duration: 0.65, unit: 'char', stagger: 0.02, order: 'random', defs: { distance: 3 }, params: [distP(3)],
    eval(u, c) { const e = easeInCubic(u), a = c.rnd(1) * TAU, d = (0.5 + c.rnd(2)) * p(c, 'distance', 3) * c.amount; return C({ dx: Math.cos(a) * d * e, dy: Math.sin(a) * d * e, rot: (c.rnd(3) - 0.5) * 5 * e, sx: 1 - 0.6 * e, sy: 1 - 0.6 * e, alpha: 1 - smooth(0.4, 1, u) }); },
  });
  ext({
    id: 'suck-in', name: 'Suck in', description: 'Letters are pulled to the centre as if into a drain, shrinking and spinning.', duration: 0.6, unit: 'char', stagger: 0.02, defs: {}, params: [],
    eval(u, c) { const e = easeInCubic(u); return C({ dx: -c.rx * e, dy: -c.ry * e, rot: e * 3.5 * c.amount, sx: Math.max(0, 1 - e), sy: Math.max(0, 1 - e), alpha: 1 - smooth(0.8, 1, u) }); },
  });
  ext({
    id: 'glitch-out', name: 'Glitch out', description: 'Breaks up like a bad signal and cuts out.', duration: 0.5, defs: {}, params: [],
    eval(u, c) { const f = Math.floor(u * 14), k = u * c.amount; return C({ dx: (hash(f * 4.3) - 0.5) * 0.35 * k, sx: 1 + (hash(f * 6.1) - 0.5) * 0.4 * k, skew: (hash(f * 2.3) - 0.5) * 0.4 * k, alpha: u >= 1 ? 0 : hash(f * 8.7) > u ? 1 : 0, bright: 1 + hash(f * 1.1) * 0.8 * k }); },
  });
  ext({
    id: 'curtain-down', name: 'Close down', description: 'Squeezes flat from the top down, like a blind closing.', duration: 0.45, defs: {}, params: [],
    eval(u) { const s = Math.max(0.001, 1 - easeInCubic(u)); return C({ sy: s, dy: (1 - s) * 0.5, alpha: 1 - smooth(0.85, 1, u) }); },
  });
  ext({
    id: 'flip-out-letters', name: 'Flip away', description: 'Letters turn over like cards and vanish edge-on.', duration: 0.5, unit: 'char', stagger: 0.05, defs: {}, params: [],
    eval(u) { const e = easeInQuad(u), sx = Math.cos(Math.PI * 0.5 * e); return C({ sx: Math.max(0.001, sx), bright: 1 - 0.5 * e, alpha: 1 - smooth(0.9, 1, u) }); },
  });
  ext({
    id: 'swoop-out', name: 'Swoop away', description: 'Letters sweep up and off along a curve.', duration: 0.6, unit: 'char', stagger: 0.04, defs: { distance: 2.4 }, params: [distP(2.4)],
    eval(u, c) { const e = easeInCubic(u), d = p(c, 'distance', 2.4) * c.amount; return C({ dx: e * d, dy: -e * e * d * 0.8, rot: e * 0.8, sx: 1 - 0.3 * e, sy: 1 - 0.3 * e, alpha: 1 - smooth(0.5, 1, u) }); },
  });
  ext({
    id: 'domino-out', name: 'Domino fall', description: 'Letters tip over one after another and drop out of sight.', duration: 0.6, unit: 'char', stagger: 0.06, defs: {}, params: [],
    eval(u, c) { const e = easeInQuad(u); return C({ rot: e * 1.5 * c.amount, dx: e * 0.5, dy: e * e * 1.4, alpha: 1 - smooth(0.6, 1, u) }); },
  });
  ext({
    id: 'float-away', name: 'Float away', description: 'Drifts up softly and fades. The quiet exit.', duration: 0.9, defs: { distance: 0.5 }, params: [distP(0.5)],
    eval: (u, c) => C({ dy: -easeInCubic(u) * p(c, 'distance', 0.5) * c.amount, alpha: 1 - smooth(0.15, 1, u) }),
  });

  void easeOutBack; void bell;
  return out;
}
