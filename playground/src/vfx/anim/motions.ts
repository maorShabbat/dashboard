/**
 * Motion registry: every animation an element can use, grouped by the slot it belongs in. A motion is a pure function of progress to
 * a Contribution (offsets in em, scale, rotation, skew, opacity, brightness, glow). Slots stack by combining their contributions, so
 * an entrance, an idle loop, an emphasis hit and an exit are four independent containers (see compose.ts).
 */
import { enm, num, type ParamDef } from '../../core/params';
import type { MotionSlot, MotionSpec, MotionUnit, Params, StaggerOrder } from '../model/scene';
import { calmMotions } from './motionsCalm';
import { moreMotions } from './motionsMore';
import {
  bell, clamp01, easeInBack, easeInCubic, easeInOutCubic, easeInQuad, easeOutBack, easeOutBounce, easeOutCubic, easeOutElastic, easeOutExpo, easeOutQuart, hash, lerp, smooth, tent,
} from './easing';

export interface Contribution { dx: number; dy: number; sx: number; sy: number; rot: number; skew: number; alpha: number; bright: number; glow: number }
export const IDENTITY: Readonly<Contribution> = { dx: 0, dy: 0, sx: 1, sy: 1, rot: 0, skew: 0, alpha: 1, bright: 1, glow: 1 };
export const C = (p: Partial<Contribution> = {}): Contribution => ({ ...IDENTITY, ...p });

export interface MotionCtx {
  /** Unit index and count. */
  i: number; n: number;
  /** Position of the unit's centre relative to the block's centre, in em. */
  rx: number; ry: number;
  /** Distance in em from the unit's centre to each stage edge. */
  edge: { l: number; r: number; t: number; b: number };
  /** Strength multiplier. */
  amount: number;
  params: Params;
  /** Per-unit random in [0, 1). */
  rnd(k?: number): number;
}

export interface MotionDef {
  id: string;
  name: string;
  slots: MotionSlot[];
  description: string;
  defaults: { duration: number; unit?: MotionUnit; stagger?: number; order?: StaggerOrder; params?: Params };
  params: ParamDef[];
  /** u ∈ [0, 1] for entrance / exit / emphasis (identity at the resting end); cycles for idle. */
  eval(u: number, c: MotionCtx): Contribution;
}

const G = (group: string) => ({ section: 'Motion', group });
const p = (c: MotionCtx, key: string, fallback: number): number => { const v = c.params[key]; return typeof v === 'number' ? v : fallback; };
const TAU = Math.PI * 2;
const dir4 = (d: string) => (d === 'left' ? [-1, 0] : d === 'right' ? [1, 0] : d === 'up' ? [0, -1] : [0, 1]) as [number, number];

const distP = (def: number) => num('distance', 'Distance', G('Motion'), def, 0, 6, 0.05, 'em', 'How far the element travels, in multiples of its size.');
const overshootP = (def: number) => num('overshoot', 'Overshoot', G('Motion'), def, 0, 4, 0.05, '', 'How far it overshoots before settling.');
const turnsP = (def: number) => num('turns', 'Turns', G('Motion'), def, 0, 4, 0.05, '', 'Full rotations.');
const sizeP = (key: string, label: string, def: number, max = 3) => num(key, label, G('Motion'), def, 0, max, 0.01, '', label);

export const MOTIONS: MotionDef[] = [];
const add = (m: MotionDef) => MOTIONS.push(m);

// ---------------------------------------------------------------------------------------------------------------------
// ENTRANCES
const slideIn = (id: string, name: string, dir: string): MotionDef => ({
  id, name, slots: ['entrance'], description: `Slides in from the ${dir === 'up' ? 'bottom' : dir === 'down' ? 'top' : dir}, easing out.`,
  defaults: { duration: 0.55, params: { distance: 0.8, fromEdge: 'false' } },
  params: [distP(0.8), enm('fromEdge', 'From the screen edge', G('Motion'), 'false', [['false', 'Short slide'], ['true', 'From the edge']], 'Start beyond the edge of the stage instead of a short distance away.')],
  eval(u, c) {
    const e = easeOutCubic(u), [vx, vy] = dir4(dir === 'up' ? 'down' : dir === 'down' ? 'up' : dir === 'left' ? 'right' : 'left');
    const edge = String(c.params.fromEdge) === 'true';
    const d = edge ? (vx < 0 ? c.edge.l : vx > 0 ? c.edge.r : vy < 0 ? c.edge.t : c.edge.b) + 0.6 : p(c, 'distance', 0.8) * c.amount;
    return C({ dx: vx * d * (1 - e), dy: vy * d * (1 - e), alpha: edge ? 1 : smooth(0, 0.45, u) });
  },
});
add(slideIn('slide-up', 'Slide up', 'up'));
add(slideIn('slide-down', 'Slide down', 'down'));
add(slideIn('slide-left', 'Slide from left', 'left'));
add(slideIn('slide-right', 'Slide from right', 'right'));

add({
  id: 'arc-in', name: 'Fly in on an arc', slots: ['entrance'], description: 'Sweeps in along a curved path from off to the side and lands with a squash.', defaults: { duration: 0.8, params: { distance: 3.2, side: 'left' } },
  params: [distP(3.2), enm('side', 'From', G('Motion'), 'left', [['left', 'Left'], ['right', 'Right'], ['top', 'Top'], ['bottom', 'Bottom']], 'Which side it flies in from.')],
  eval(u, c) {
    const e = easeOutCubic(u), d = p(c, 'distance', 3.2) * c.amount, side = String(c.params.side ?? 'left');
    const along = (1 - e) * d, bow = Math.sin(Math.PI * (1 - e)) * d * 0.28;
    const [dx, dy] = side === 'left' ? [-along, -bow] : side === 'right' ? [along, -bow] : side === 'top' ? [bow, -along] : [bow, along];
    const land = u > 0.78 ? Math.sin(((u - 0.78) / 0.22) * Math.PI) * 0.1 : 0;
    return C({ dx, dy, rot: (1 - e) * (side === 'right' ? 0.5 : -0.5), sx: 1 + land, sy: 1 - land, alpha: smooth(0, 0.12, u) });
  },
});
add({
  id: 'fade-in', name: 'Fade in', slots: ['entrance'], description: 'A plain fade.', defaults: { duration: 0.5 }, params: [],
  eval: (u) => C({ alpha: easeOutCubic(u) }),
});
add({
  id: 'pop', name: 'Pop', slots: ['entrance'], description: 'Scales up from nothing and overshoots slightly.', defaults: { duration: 0.5, params: { overshoot: 1.9 } }, params: [overshootP(1.9)],
  eval: (u, c) => { const s = easeOutBack(u, p(c, 'overshoot', 1.9) * c.amount); return C({ sx: s, sy: s, alpha: clamp01(u * 7) }); },
});
add({
  id: 'zoom-in', name: 'Zoom in', slots: ['entrance'], description: 'Starts large and settles to size.', defaults: { duration: 0.6, params: { from: 2.4 } }, params: [sizeP('from', 'Start scale', 2.4, 8)],
  eval: (u, c) => { const e = easeOutExpo(u), s = lerp(p(c, 'from', 2.4) * c.amount + (1 - c.amount), 1, e); return C({ sx: s, sy: s, alpha: smooth(0, 0.5, u) }); },
});
add({
  id: 'slam', name: 'Slam', slots: ['entrance'], description: 'Drops in huge, hits hard and squashes on impact.', defaults: { duration: 0.55, params: { from: 2.3 } }, params: [sizeP('from', 'Start scale', 2.3, 8)],
  eval(u, c) {
    const fall = clamp01(u / 0.45), land = clamp01((u - 0.45) / 0.55);
    const s = u < 0.45 ? lerp(p(c, 'from', 2.3) * c.amount + (1 - c.amount), 1, easeInCubic(fall)) : 1;
    const sq = u < 0.45 ? 0 : Math.exp(-land * 5) * Math.cos(land * 14) * (1 - land);
    return C({ sx: s * (1 + 0.22 * sq * c.amount), sy: s * (1 - 0.2 * sq * c.amount), alpha: smooth(0, 0.15, u), bright: u < 0.45 ? 1 : 1 + 0.6 * Math.exp(-land * 9) * (1 - land) });
  },
});
add({
  id: 'bounce-drop', name: 'Bounce drop', slots: ['entrance'], description: 'Falls from above and bounces to rest.', defaults: { duration: 0.9, params: { distance: 2.2 } }, params: [distP(2.2)],
  eval(u, c) {
    const y = 1 - easeOutBounce(u);
    const land = u > 0.36 ? clamp01((u - 0.36) / 0.1) * (1 - clamp01((u - 0.46) / 0.1)) : 0;
    return C({ dy: -y * p(c, 'distance', 2.2) * c.amount, alpha: smooth(0, 0.12, u), sx: 1 + 0.08 * land, sy: 1 - 0.08 * land });
  },
});
add({
  id: 'elastic', name: 'Elastic', slots: ['entrance'], description: 'Springs up from nothing and wobbles to rest.', defaults: { duration: 0.9 }, params: [],
  eval: (u) => { const s = easeOutElastic(u); return C({ sx: s, sy: s, alpha: clamp01(u * 8) }); },
});
add({
  id: 'spin-in', name: 'Spin in', slots: ['entrance'], description: 'Spins and grows into place.', defaults: { duration: 0.75, params: { turns: 1 } }, params: [turnsP(1)],
  eval: (u, c) => { const e = easeOutCubic(u), s = easeOutBack(u, 1.2); return C({ rot: -(1 - e) * TAU * p(c, 'turns', 1) * c.amount, sx: s, sy: s, alpha: clamp01(u * 5) }); },
});
add({
  id: 'flip-in', name: 'Flip in', slots: ['entrance'], description: 'Turns over like a card, face first.', defaults: { duration: 0.6 }, params: [],
  eval(u) { const e = easeOutBack(u, 1.2), a = clamp01(u * 1.2); return C({ sy: Math.max(0.001, Math.sin(Math.PI / 2 * a)) * (e > 1 ? e : 1), bright: lerp(0.55, 1, a), alpha: clamp01(u * 6), skew: (1 - a) * 0.25 }); },
});
add({
  id: 'swing-in', name: 'Swing in', slots: ['entrance'], description: 'Drops in swinging like a sign.', defaults: { duration: 1, params: { angle: 0.7 } }, params: [sizeP('angle', 'Swing angle', 0.7, 2)],
  eval: (u, c) => C({ rot: p(c, 'angle', 0.7) * c.amount * (1 - u) * Math.cos(u * Math.PI * 3.2), dy: -(1 - easeOutCubic(u)) * 0.6, alpha: smooth(0, 0.2, u) }),
});
add({
  id: 'stretch-in', name: 'Stretch in', slots: ['entrance'], description: 'Stretches out sideways like rubber.', defaults: { duration: 0.8 }, params: [],
  eval(u) { const e = easeOutElastic(u, 0.45); return C({ sx: e, sy: lerp(1.25, 1, easeOutCubic(u)), alpha: clamp01(u * 8) }); },
});
add({
  id: 'unfold', name: 'Unfold', slots: ['entrance'], description: 'Opens from a line to full height.', defaults: { duration: 0.55 }, params: [],
  eval: (u) => C({ sy: Math.max(0.001, easeOutBack(u, 1.4)), alpha: clamp01(u * 6) }),
});
add({
  id: 'typewriter', name: 'Typewriter', slots: ['entrance'], description: 'Letters appear one after another with a tiny hit.', defaults: { duration: 0.12, unit: 'char', stagger: 0.045, params: {} }, params: [],
  eval: (u) => C({ alpha: u > 0 ? 1 : 0, sx: 1 + 0.18 * (1 - u), sy: 1 + 0.18 * (1 - u), bright: 1 + 0.7 * (1 - u) }),
});
add({
  id: 'rise-letters', name: 'Rise letters', slots: ['entrance'], description: 'Each letter rises into place with a little overshoot.', defaults: { duration: 0.5, unit: 'char', stagger: 0.04, params: { distance: 0.7 } }, params: [distP(0.7)],
  eval: (u, c) => { const e = easeOutBack(u, 1.6); return C({ dy: (1 - e) * p(c, 'distance', 0.7) * c.amount, alpha: clamp01(u * 5), sx: lerp(0.7, 1, e), sy: lerp(0.7, 1, e) }); },
});
add({
  id: 'drop-letters', name: 'Drop letters', slots: ['entrance'], description: 'Letters fall in one by one and bounce.', defaults: { duration: 0.7, unit: 'char', stagger: 0.05, params: { distance: 1.6 } }, params: [distP(1.6)],
  eval: (u, c) => ({ ...C({ dy: -(1 - easeOutBounce(u)) * p(c, 'distance', 1.6) * c.amount, alpha: clamp01(u * 10) }) }),
});
add({
  id: 'scatter-in', name: 'Scatter in', slots: ['entrance'], description: 'Letters fly in from random places and spin into position.', defaults: { duration: 0.7, unit: 'char', stagger: 0.02, order: 'random', params: { distance: 2.2 } }, params: [distP(2.2)],
  eval(u, c) {
    const e = easeOutCubic(u), a = c.rnd(1) * TAU, d = (0.5 + c.rnd(2)) * p(c, 'distance', 2.2) * c.amount;
    return C({ dx: Math.cos(a) * d * (1 - e), dy: Math.sin(a) * d * (1 - e), rot: (c.rnd(3) - 0.5) * 4 * (1 - e) * c.amount, alpha: clamp01(u * 4), sx: lerp(0.4, 1, e), sy: lerp(0.4, 1, e) });
  },
});
add({
  id: 'wave-in', name: 'Wave in', slots: ['entrance'], description: 'Letters arrive riding a wave.', defaults: { duration: 0.8, unit: 'char', stagger: 0.035, params: { distance: 0.9 } }, params: [distP(0.9)],
  eval: (u, c) => C({ dy: Math.sin(u * Math.PI * 2.5) * (1 - u) * p(c, 'distance', 0.9) * c.amount + (1 - easeOutCubic(u)) * 0.5, alpha: clamp01(u * 6) }),
});
add({
  id: 'glitch-in', name: 'Glitch in', slots: ['entrance'], description: 'Flickers and jitters into view like a bad signal.', defaults: { duration: 0.55, params: {} }, params: [],
  eval(u, c) {
    const f = Math.floor(u * 14), on = hash(f * 7.1 + c.i * 3) > 0.35 + 0.5 * (1 - u) ? 1 : 0;
    const j = (1 - u) * c.amount;
    return C({ alpha: u >= 1 ? 1 : on, dx: (hash(f * 3.3) - 0.5) * 0.25 * j, dy: (hash(f * 5.7 + 1) - 0.5) * 0.05 * j, sx: 1 + (hash(f * 2.1) - 0.5) * 0.3 * j, bright: 1 + 0.8 * j * hash(f * 9.1) });
  },
});
add({
  id: 'blink-in', name: 'Neon blink in', slots: ['entrance'], description: 'Flickers on like a neon sign.', defaults: { duration: 0.8 }, params: [],
  eval(u) { const f = Math.floor(u * 18), on = u > 0.8 ? 1 : hash(f * 13.7) > 0.45 * (1 - u) + (u < 0.15 ? 0.7 : 0) ? 1 : 0; return C({ alpha: on, bright: on ? 1 + 0.5 * (1 - u) : 1 }); },
});

// ---------------------------------------------------------------------------------------------------------------------
// IDLES (u = elapsed cycles)
const idle = (m: Omit<MotionDef, 'slots' | 'defaults'> & { duration: number; unit?: MotionUnit; stagger?: number; defs?: Params }) =>
  add({ ...m, slots: ['idle'], defaults: { duration: m.duration, unit: m.unit, stagger: m.stagger, params: m.defs } });
const ampP = (def: number, max = 1) => num('amplitude', 'Amplitude', G('Motion'), def, 0, max, 0.005, 'em', 'How far it moves, in multiples of its size.');
idle({ id: 'float', name: 'Float', description: 'A slow vertical drift.', duration: 2.4, defs: { amplitude: 0.06 }, params: [ampP(0.06)], eval: (u, c) => C({ dy: Math.sin(u * TAU) * p(c, 'amplitude', 0.06) * c.amount, rot: Math.sin(u * TAU + 1) * 0.012 * c.amount }) });
idle({ id: 'wave', name: 'Wave', description: 'A wave runs along the letters.', duration: 1.4, unit: 'char', stagger: 0.07, defs: { amplitude: 0.1 }, params: [ampP(0.1)], eval: (u, c) => C({ dy: Math.sin((u - c.i * 0.07 / 1.4) * TAU) * p(c, 'amplitude', 0.1) * c.amount }) });
idle({ id: 'wobble', name: 'Wobble', description: 'Rocks gently side to side.', duration: 1.2, defs: { angle: 0.06 }, params: [sizeP('angle', 'Angle', 0.06, 0.5)], eval: (u, c) => C({ rot: Math.sin(u * TAU) * p(c, 'angle', 0.06) * c.amount }) });
idle({ id: 'pulse', name: 'Pulse', description: 'Swells and relaxes.', duration: 1.1, defs: { size: 0.05 }, params: [sizeP('size', 'Swell', 0.05, 0.5)], eval: (u, c) => { const s = 1 + (Math.sin(u * TAU) * 0.5 + 0.5) * p(c, 'size', 0.05) * c.amount; return C({ sx: s, sy: s }); } });
idle({ id: 'breathe', name: 'Breathe', description: 'Slow swell with the light rising and falling.', duration: 2.6, defs: { size: 0.035 }, params: [sizeP('size', 'Swell', 0.035, 0.3)], eval: (u, c) => { const k = Math.sin(u * TAU) * 0.5 + 0.5, s = 1 + k * p(c, 'size', 0.035) * c.amount; return C({ sx: s, sy: s, bright: 1 + 0.12 * k * c.amount, glow: 1 + 0.6 * k * c.amount }); } });
idle({ id: 'jitter', name: 'Jitter', description: 'A nervous shake.', duration: 0.5, defs: { amplitude: 0.012 }, params: [ampP(0.012, 0.2)], eval(u, c) { const f = Math.floor(u * 10) + c.i * 17; return C({ dx: (hash(f) - 0.5) * 2 * p(c, 'amplitude', 0.012) * c.amount, dy: (hash(f + 91) - 0.5) * 2 * p(c, 'amplitude', 0.012) * c.amount, rot: (hash(f + 41) - 0.5) * 0.02 * c.amount }); } });
idle({ id: 'swing', name: 'Swing', description: 'Swings like a hanging sign.', duration: 2, defs: { angle: 0.14 }, params: [sizeP('angle', 'Angle', 0.14, 0.8)], eval: (u, c) => C({ rot: Math.sin(u * TAU) * p(c, 'angle', 0.14) * c.amount, dx: Math.sin(u * TAU) * 0.03 * c.amount }) });
idle({ id: 'shimmer', name: 'Shimmer', description: 'Brightness ripples across the letters.', duration: 1.6, unit: 'char', stagger: 0.08, defs: {}, params: [], eval: (u, c) => { const k = Math.sin((u - c.i * 0.08 / 1.6) * TAU) * 0.5 + 0.5; return C({ bright: 1 + 0.45 * k * k * c.amount, glow: 1 + 0.6 * k * c.amount }); } });
idle({ id: 'sway', name: 'Sway', description: 'A soft horizontal sway.', duration: 2.8, defs: { amplitude: 0.06 }, params: [ampP(0.06)], eval: (u, c) => C({ dx: Math.sin(u * TAU) * p(c, 'amplitude', 0.06) * c.amount, rot: Math.sin(u * TAU) * 0.02 * c.amount }) });
idle({ id: 'heartbeat', name: 'Heartbeat', description: 'Two quick beats, then a rest.', duration: 1.2, defs: { size: 0.1 }, params: [sizeP('size', 'Beat', 0.1, 0.5)], eval(u, c) { const t = u % 1, b = Math.max(bell(t / 0.18), 0.75 * bell((t - 0.22) / 0.2)), s = 1 + b * p(c, 'size', 0.1) * c.amount; return C({ sx: s, sy: s }); } });
idle({ id: 'flicker', name: 'Neon flicker', description: 'A sign that stutters now and then.', duration: 3, defs: {}, params: [], eval(u, c) { const f = Math.floor(u * 24); const dip = hash(f * 3.1) > 0.9 ? 0.25 : hash(f * 1.7) > 0.8 ? 0.7 : 1; return C({ alpha: dip, bright: dip < 1 ? dip : 1 + 0.08 * hash(f), glow: dip }); } });
idle({ id: 'spin', name: 'Spin', description: 'A constant turn.', duration: 4, defs: { turns: 1 }, params: [turnsP(1)], eval: (u, c) => C({ rot: u * TAU * p(c, 'turns', 1) * c.amount }) });
idle({ id: 'hover', name: 'Hover', description: 'Hangs in the air, bobbing and tilting a little.', duration: 2.2, defs: { amplitude: 0.05 }, params: [ampP(0.05)], eval: (u, c) => C({ dy: Math.sin(u * TAU) * p(c, 'amplitude', 0.05) * c.amount, rot: Math.sin(u * TAU + 1) * 0.04 * c.amount, sx: 1 + Math.sin(u * TAU) * 0.012 }) });
idle({ id: 'hop', name: 'Hop', description: 'Hops on the spot.', duration: 1.1, defs: { height: 0.18 }, params: [sizeP('height', 'Height', 0.18, 1)], eval(u, c) { const t = u % 1, up = Math.abs(Math.sin(Math.PI * Math.min(1, t / 0.55))) * (t < 0.55 ? 1 : 0), sq = t > 0.55 ? Math.exp(-(t - 0.55) * 9) * 0.1 : 0; return C({ dy: -up * p(c, 'height', 0.18) * c.amount, sx: 1 + sq * c.amount, sy: 1 - sq * c.amount }); } });
idle({ id: 'tremble', name: 'Tremble', description: 'A fast tight shiver.', duration: 0.2, defs: { amplitude: 0.006 }, params: [ampP(0.006, 0.1)], eval(u, c) { const f = Math.floor(u * 8) + c.i * 7; return C({ dx: (hash(f) - 0.5) * 2 * p(c, 'amplitude', 0.006) * c.amount, dy: (hash(f + 5) - 0.5) * 2 * p(c, 'amplitude', 0.006) * c.amount }); } });

// ---------------------------------------------------------------------------------------------------------------------
// EMPHASIS (u: 0 → 1, identity at both ends)
const emph = (m: Omit<MotionDef, 'slots' | 'defaults'> & { duration: number; unit?: MotionUnit; stagger?: number; defs?: Params }) =>
  add({ ...m, slots: ['emphasis'], defaults: { duration: m.duration, unit: m.unit, stagger: m.stagger, params: m.defs } });
emph({ id: 'emph-pulse', name: 'Pulse', description: 'Swells once and returns.', duration: 0.45, defs: { size: 0.25 }, params: [sizeP('size', 'Swell', 0.25, 1.5)], eval: (u, c) => { const s = 1 + bell(u) * p(c, 'size', 0.25) * c.amount; return C({ sx: s, sy: s, bright: 1 + 0.25 * bell(u) * c.amount }); } });
emph({ id: 'jelly', name: 'Jelly', description: 'Squashes and stretches like jelly.', duration: 0.7, defs: {}, params: [], eval: (u, c) => { const k = Math.sin(u * Math.PI * 4) * (1 - u) ** 1.5 * 0.28 * c.amount; return C({ sx: 1 + k, sy: 1 - k }); } });
emph({ id: 'emph-shake', name: 'Shake', description: 'A hard horizontal shake.', duration: 0.5, defs: { amplitude: 0.08 }, params: [ampP(0.08, 0.5)], eval: (u, c) => C({ dx: Math.sin(u * Math.PI * 12) * (1 - u) ** 2 * p(c, 'amplitude', 0.08) * c.amount, rot: Math.sin(u * Math.PI * 12) * (1 - u) ** 2 * 0.03 * c.amount }) });
emph({ id: 'tada', name: 'Tada', description: 'Grows a little and wiggles with joy.', duration: 0.9, defs: {}, params: [], eval: (u, c) => { const s = 1 + 0.12 * Math.sin(Math.PI * Math.min(1, u * 1.4)) * c.amount; return C({ sx: s, sy: s, rot: Math.sin(u * Math.PI * 7) * (1 - u) ** 1.2 * 0.09 * c.amount }); } });
emph({ id: 'emph-flash', name: 'Flash', description: 'A bright flash.', duration: 0.35, defs: {}, params: [], eval: (u, c) => C({ bright: 1 + 1.4 * bell(u) * c.amount, glow: 1 + 2 * bell(u) * c.amount }) });
emph({ id: 'rubber-band', name: 'Rubber band', description: 'Stretches wide and snaps back.', duration: 0.8, defs: {}, params: [], eval: (u, c) => { const k = Math.sin(u * Math.PI * 3) * (1 - u) ** 1.3 * 0.4 * c.amount; return C({ sx: 1 + k, sy: 1 - k * 0.6 }); } });
emph({ id: 'wiggle', name: 'Wiggle', description: 'Rocks from side to side.', duration: 0.7, defs: { angle: 0.14 }, params: [sizeP('angle', 'Angle', 0.14, 0.6)], eval: (u, c) => C({ rot: Math.sin(u * Math.PI * 5) * (1 - u) * p(c, 'angle', 0.14) * c.amount }) });
emph({ id: 'pop-bounce', name: 'Pop bounce', description: 'Jumps up in size and bounces back to rest.', duration: 0.7, defs: { size: 0.38 }, params: [sizeP('size', 'Size', 0.38, 1.5)], eval: (u, c) => { const s = 1 + p(c, 'size', 0.38) * c.amount * (1 - easeOutElastic(clamp01(u * 1.08), 0.5)) * Math.min(1, u * 14); return C({ sx: s, sy: s }); } });
emph({ id: 'spin-once', name: 'Spin once', description: 'One full turn.', duration: 0.8, defs: { turns: 1 }, params: [turnsP(1)], eval: (u, c) => C({ rot: easeInOutCubic(u) * TAU * p(c, 'turns', 1) * c.amount }) });
emph({ id: 'heartbeat-once', name: 'Heartbeat', description: 'Two quick beats.', duration: 0.6, defs: { size: 0.14 }, params: [sizeP('size', 'Beat', 0.14, 0.6)], eval: (u, c) => { const b = Math.max(bell(u / 0.45), 0.8 * bell((u - 0.4) / 0.6)); const s = 1 + b * p(c, 'size', 0.14) * c.amount; return C({ sx: s, sy: s }); } });
emph({ id: 'glow-pulse', name: 'Glow pulse', description: 'The halo swells and fades.', duration: 0.8, defs: {}, params: [], eval: (u, c) => C({ glow: 1 + 2.4 * bell(u) * c.amount, bright: 1 + 0.2 * bell(u) * c.amount }) });
emph({ id: 'emph-hop', name: 'Hop', description: 'A single bounce.', duration: 0.55, defs: { height: 0.25 }, params: [sizeP('height', 'Height', 0.25, 1.2)], eval: (u, c) => { const up = Math.sin(Math.PI * u) * (1 - 0.0 * u), sq = u > 0.85 ? Math.sin((u - 0.85) / 0.15 * Math.PI) * 0.1 : 0; return C({ dy: -up * p(c, 'height', 0.25) * c.amount, sx: 1 + sq * c.amount, sy: 1 - sq * c.amount }); } });
emph({ id: 'wave-hit', name: 'Wave', description: 'A hit travels along the letters.', duration: 0.5, unit: 'char', stagger: 0.04, defs: { amplitude: 0.35 }, params: [ampP(0.35, 1)], eval: (u, c) => C({ dy: -bell(u) * p(c, 'amplitude', 0.35) * c.amount, sx: 1 + 0.1 * bell(u) * c.amount, sy: 1 + 0.1 * bell(u) * c.amount }) });

// ---------------------------------------------------------------------------------------------------------------------
// EXITS (u: 0 → 1, identity → hidden)
const slideOut = (id: string, name: string, dir: string): MotionDef => ({
  id, name, slots: ['exit'], description: `Slides away ${dir}.`, defaults: { duration: 0.45, params: { distance: 0.8, fromEdge: 'false' } },
  params: [distP(0.8), enm('fromEdge', 'To the screen edge', G('Motion'), 'false', [['false', 'Short slide'], ['true', 'Off the edge']], 'Travel past the edge of the stage.')],
  eval(u, c) {
    const e = easeInCubic(u), [vx, vy] = dir4(dir);
    const edge = String(c.params.fromEdge) === 'true';
    const d = edge ? (vx < 0 ? c.edge.l : vx > 0 ? c.edge.r : vy < 0 ? c.edge.t : c.edge.b) + 0.6 : p(c, 'distance', 0.8) * c.amount;
    return C({ dx: vx * d * e, dy: vy * d * e, alpha: edge ? 1 : 1 - smooth(0.35, 1, u) });
  },
});
add(slideOut('slide-out-up', 'Slide up', 'up'));
add(slideOut('slide-out-down', 'Slide down', 'down'));
add(slideOut('slide-out-left', 'Slide left', 'left'));
add(slideOut('slide-out-right', 'Slide right', 'right'));
add({ id: 'fade-out', name: 'Fade out', slots: ['exit'], description: 'A plain fade.', defaults: { duration: 0.4 }, params: [], eval: (u) => C({ alpha: 1 - easeInQuad(u) }) });
add({ id: 'shrink', name: 'Shrink', slots: ['exit'], description: 'Shrinks away.', defaults: { duration: 0.4 }, params: [], eval: (u) => { const s = Math.max(0, 1 - easeInBack(u, 1.2)); return C({ sx: s, sy: s, alpha: 1 - smooth(0.7, 1, u) }); } });
add({ id: 'pop-out', name: 'Pop out', slots: ['exit'], description: 'Swells, then vanishes.', defaults: { duration: 0.35 }, params: [], eval: (u) => { const s = u < 0.35 ? 1 + 0.2 * easeOutCubic(u / 0.35) : lerp(1.2, 0, easeInCubic((u - 0.35) / 0.65)); return C({ sx: s, sy: s, alpha: 1 - smooth(0.6, 1, u) }); } });
add({ id: 'drop-out', name: 'Drop out', slots: ['exit'], description: 'Falls away with a little spin.', defaults: { duration: 0.6, params: { distance: 3 } }, params: [distP(3)], eval: (u, c) => C({ dy: easeInQuad(u) * p(c, 'distance', 3) * c.amount, rot: easeInQuad(u) * 0.4 * (c.rnd(2) > 0.5 ? 1 : -1) * c.amount, alpha: 1 - smooth(0.5, 1, u) }) });
add({ id: 'spin-out', name: 'Spin out', slots: ['exit'], description: 'Spins away while shrinking.', defaults: { duration: 0.6, params: { turns: 1 } }, params: [turnsP(1)], eval: (u, c) => { const s = Math.max(0, 1 - easeInCubic(u)); return C({ rot: easeInCubic(u) * TAU * p(c, 'turns', 1) * c.amount, sx: s, sy: s, alpha: 1 - smooth(0.7, 1, u) }); } });
add({ id: 'zoom-out', name: 'Zoom away', slots: ['exit'], description: 'Grows toward the viewer and fades.', defaults: { duration: 0.5, params: { to: 2.6 } }, params: [sizeP('to', 'End scale', 2.6, 8)], eval: (u, c) => { const s = lerp(1, p(c, 'to', 2.6) * c.amount + (1 - c.amount), easeInCubic(u)); return C({ sx: s, sy: s, alpha: 1 - smooth(0.2, 1, u) }); } });
add({ id: 'explode-letters', name: 'Explode letters', slots: ['exit'], description: 'Letters burst outward from the middle.', defaults: { duration: 0.7, unit: 'char', params: { distance: 3 } }, params: [distP(3)], eval(u, c) {
  const len = Math.hypot(c.rx, c.ry) || 1, ang = len > 0.01 && (c.rx !== 0 || c.ry !== 0) ? Math.atan2(c.ry, c.rx) : c.rnd(4) * TAU;
  const e = easeOutCubic(u), d = (0.6 + c.rnd(5)) * p(c, 'distance', 3) * c.amount;
  return C({ dx: Math.cos(ang) * d * e, dy: Math.sin(ang) * d * e + 1.2 * u * u, rot: (c.rnd(6) - 0.5) * 6 * e, sx: 1 - 0.5 * e, sy: 1 - 0.5 * e, alpha: 1 - smooth(0.4, 1, u) });
} });
add({ id: 'blink-out', name: 'Neon blink out', slots: ['exit'], description: 'Flickers off like a neon sign.', defaults: { duration: 0.6 }, params: [], eval(u) { const f = Math.floor(u * 16); return C({ alpha: u >= 1 ? 0 : hash(f * 9.3) > u * 0.9 + 0.05 ? 1 : 0.1 }); } });
add({ id: 'squash-out', name: 'Squash', slots: ['exit'], description: 'Squashes flat.', defaults: { duration: 0.4 }, params: [], eval: (u) => C({ sy: Math.max(0.001, 1 - easeInCubic(u)), sx: 1 + 0.25 * easeInCubic(u), alpha: 1 - smooth(0.7, 1, u) }) });
add({ id: 'wave-out', name: 'Wave out', slots: ['exit'], description: 'Letters sink away one after another.', defaults: { duration: 0.5, unit: 'char', stagger: 0.035, params: { distance: 0.8 } }, params: [distP(0.8)], eval: (u, c) => C({ dy: easeInCubic(u) * p(c, 'distance', 0.8) * c.amount, alpha: 1 - smooth(0.2, 1, u), sx: 1 - 0.4 * u, sy: 1 - 0.4 * u }) });

// the second half of the registry
for (const m of moreMotions({ C, p, TAU, distP, turnsP, sizeP, ampP })) add(m);
for (const m of calmMotions({ C, p, TAU, distP, turnsP, sizeP, ampP })) add(m);

export const MOTION_BY_ID: ReadonlyMap<string, MotionDef> = new Map(MOTIONS.map((m) => [m.id, m]));
export const motionsFor = (slot: MotionSlot): MotionDef[] => MOTIONS.filter((m) => m.slots.includes(slot));
export const motionDef = (id: string): MotionDef => { const m = MOTION_BY_ID.get(id); if (!m) throw new Error(`Unknown motion "${id}"`); return m; };

/** A spec for motion `id` with its designed defaults (used by the UI when a motion is picked). */
export function specFor(id: string, over: Partial<MotionSpec> = {}): MotionSpec {
  const d = motionDef(id);
  return { id, start: 0, duration: d.defaults.duration, unit: d.defaults.unit ?? 'block', stagger: d.defaults.stagger ?? 0, order: d.defaults.order ?? 'forward', amount: 1, params: { ...(d.defaults.params ?? {}) }, ...over };
}

void tent; void easeOutQuart;
