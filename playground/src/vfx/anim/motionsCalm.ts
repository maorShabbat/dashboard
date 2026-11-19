/**
 * Calm motions for messages and titles: the quiet end of the registry. Nothing overshoots wildly, spins or shakes; everything is small
 * distances, soft fades and slow light, so a title or a message reads as expensive rather than loud. Same rules as motions.ts.
 */
import type { MotionDef, MotionCtx, Contribution } from './motions';
import { enm } from '../../core/params';
import type { Params } from '../model/scene';
import { bell, clamp01, easeInCubic, easeInOutCubic, easeOutBack, easeOutCubic, easeOutQuart, lerp, smooth } from './easing';
import type { MotionHelpers } from './motionsMore';

export function calmMotions(h: MotionHelpers): MotionDef[] {
  const { C, p, TAU, distP, sizeP } = h;
  const out: MotionDef[] = [];
  type Def = Omit<MotionDef, 'slots' | 'defaults'> & { duration: number; unit?: MotionDef['defaults']['unit']; stagger?: number; defs?: Params };
  const slot = (s: MotionDef['slots'][number]) => (m: Def): void => { out.push({ ...m, slots: [s], defaults: { duration: m.duration, unit: m.unit, stagger: m.stagger, params: m.defs } }); };
  const ent = slot('entrance'), ext = slot('exit'), emp = slot('emphasis'), idl = slot('idle');
  const G = (group: string) => ({ section: 'Motion', group });
  const dirOf = (c: MotionCtx): [number, number] => { const d = String(c.params.from ?? 'below'); return d === 'above' ? [0, -1] : d === 'left' ? [-1, 0] : d === 'right' ? [1, 0] : [0, 1]; };
  const fromP = enm('from', 'Comes from', G('Motion'), 'below', [['below', 'Below'], ['above', 'Above'], ['left', 'The left'], ['right', 'The right']], 'Which side it drifts in from.');

  // ENTRANCES -------------------------------------------------------------------------------------------------------------
  ent({
    id: 'drift-fade', name: 'Drift and fade', description: 'Drifts a short way into place while fading in, as if settling on a shelf.', duration: 0.8, defs: { distance: 0.3, from: 'below' }, params: [distP(0.3), fromP],
    eval(u, c) { const e = easeOutQuart(u), [vx, vy] = dirOf(c), d = p(c, 'distance', 0.3) * c.amount; return C({ dx: vx * d * (1 - e), dy: vy * d * (1 - e), alpha: smooth(0, 0.7, u) }); },
  });
  ent({
    id: 'tracking-in', name: 'Tracking in', description: 'The letters start spread wide apart and draw together into the word while fading in.', duration: 1.0, unit: 'char', stagger: 0, defs: { spread: 0.55 }, params: [sizeP('spread', 'Spread', 0.55, 2)],
    eval(u, c) { const e = easeOutQuart(u); return C({ dx: c.rx * p(c, 'spread', 0.55) * c.amount * (1 - e), alpha: smooth(0, 0.6, u) }); },
  });
  ent({
    id: 'soft-scale', name: 'Soft scale', description: 'Grows from just under full size while fading in: the quietest way to arrive.', duration: 0.7, defs: { from: 0.9 }, params: [sizeP('from', 'Start scale', 0.9, 1)],
    eval(u, c) { const s = lerp(p(c, 'from', 0.9) * c.amount + (1 - c.amount), 1, easeOutCubic(u)); return C({ sx: s, sy: s, alpha: smooth(0, 0.65, u) }); },
  });
  ent({
    id: 'focus-in', name: 'Focus in', description: 'Starts a little large and bright, as if coming into focus, and settles to size.', duration: 0.9, defs: { from: 1.12 }, params: [sizeP('from', 'Start scale', 1.12, 3)],
    eval(u, c) { const e = easeOutQuart(u), s = lerp(p(c, 'from', 1.12) * c.amount + (1 - c.amount), 1, e); return C({ sx: s, sy: s, alpha: smooth(0, 0.45, u), bright: lerp(1.6, 1, easeOutCubic(u)) }); },
  });
  ent({
    id: 'letter-reveal', name: 'Letter reveal', description: 'Letters fade in one after another along the line, each rising a hair, like a soft wipe.', duration: 0.5, unit: 'char', stagger: 0.04, defs: {}, params: [],
    eval(u) { const e = easeOutCubic(u); return C({ dy: (1 - e) * 0.09, alpha: smooth(0, 0.7, u) }); },
  });
  ent({
    id: 'settle-drop', name: 'Settle', description: 'Drops a short way and settles with one small, soft overshoot.', duration: 0.75, defs: { distance: 0.28 }, params: [distP(0.28)],
    eval(u, c) { const e = easeOutBack(u, 1.1), d = p(c, 'distance', 0.28) * c.amount; return C({ dy: -d * (1 - e), alpha: smooth(0, 0.5, u) }); },
  });
  ent({
    id: 'alternate-slide', name: 'Alternate slide', description: 'Lines (or words) slip in from the left and right in turn while fading in.', duration: 0.8, unit: 'line', stagger: 0.18, defs: { distance: 0.9 }, params: [distP(0.9)],
    eval(u, c) { const e = easeOutQuart(u), side = c.i % 2 ? 1 : -1; return C({ dx: side * p(c, 'distance', 0.9) * c.amount * (1 - e), alpha: smooth(0, 0.6, u) }); },
  });
  ent({
    id: 'light-up', name: 'Light up', description: 'Fades in from dark while its glow swells and then eases back, like a lamp being turned up.', duration: 1.0, defs: {}, params: [],
    eval(u) { const e = easeInOutCubic(u); return C({ alpha: smooth(0, 0.8, u), bright: lerp(0.5, 1, e), glow: 1 + 1.8 * bell(clamp01(u * 1.25)) }); },
  });
  ent({
    id: 'unfold-down', name: 'Unfold down', description: 'Opens downward from a line, the way a blind is let down, while fading in.', duration: 0.75, defs: {}, params: [],
    eval(u) { const e = easeOutCubic(u); return C({ sy: lerp(0.2, 1, e), dy: (1 - e) * -0.1, alpha: smooth(0, 0.4, u) }); },
  });

  // EXITS -----------------------------------------------------------------------------------------------------------------
  ext({
    id: 'drift-fade-out', name: 'Drift and fade out', description: 'Floats a short way up while fading away.', duration: 0.6, defs: { distance: 0.25, from: 'above' }, params: [distP(0.25), fromP],
    eval(u, c) { const e = easeInCubic(u), [vx, vy] = dirOf(c), d = p(c, 'distance', 0.25) * c.amount; return C({ dx: -vx * d * e, dy: -vy * d * e, alpha: 1 - smooth(0.1, 1, u) }); },
  });
  ext({
    id: 'tracking-out', name: 'Tracking out', description: 'The letters spread wide apart while fading away.', duration: 0.8, unit: 'char', stagger: 0, defs: { spread: 0.45 }, params: [sizeP('spread', 'Spread', 0.45, 2)],
    eval(u, c) { const e = easeInCubic(u); return C({ dx: c.rx * p(c, 'spread', 0.45) * c.amount * e, alpha: 1 - smooth(0.15, 1, u) }); },
  });
  ext({
    id: 'soft-scale-out', name: 'Soft scale out', description: 'Eases down a touch in size while fading away.', duration: 0.5, defs: { to: 0.93 }, params: [sizeP('to', 'End scale', 0.93, 1)],
    eval(u, c) { const s = lerp(1, p(c, 'to', 0.93), easeInCubic(u)); return C({ sx: s, sy: s, alpha: 1 - smooth(0, 1, u) }); },
  });
  ext({
    id: 'sink-fade', name: 'Sink and fade', description: 'Sinks a short way while fading away.', duration: 0.6, defs: { distance: 0.25 }, params: [distP(0.25)],
    eval(u, c) { const e = easeInCubic(u); return C({ dy: e * p(c, 'distance', 0.25) * c.amount, alpha: 1 - smooth(0.1, 1, u) }); },
  });
  ext({
    id: 'letter-fade-out', name: 'Letter fade out', description: 'Letters fade out one after another along the line.', duration: 0.45, unit: 'char', stagger: 0.035, defs: {}, params: [],
    eval(u) { return C({ dy: easeInCubic(u) * -0.06, alpha: 1 - smooth(0, 0.8, u) }); },
  });

  // EMPHASIS --------------------------------------------------------------------------------------------------------------
  emp({
    id: 'nudge', name: 'Nudge', description: 'A small swell and return: a gentle beat of attention.', duration: 0.6, defs: { size: 0.05 }, params: [sizeP('size', 'Swell', 0.05, 0.5)],
    eval(u, c) { const s = 1 + bell(u) * p(c, 'size', 0.05) * c.amount; return C({ sx: s, sy: s, bright: 1 + 0.12 * bell(u) }); },
  });
  emp({
    id: 'glint-pass', name: 'Glow pass', description: 'The light rises and falls once along the line, left to right, letter by letter.', duration: 0.5, unit: 'char', stagger: 0.04, defs: {}, params: [],
    eval(u) { return C({ bright: 1 + 0.45 * bell(u), glow: 1 + 1.4 * bell(u) }); },
  });
  emp({
    id: 'settle-bob', name: 'Settle bob', description: 'Dips a hair and comes back: the title acknowledging something.', duration: 0.6, defs: { distance: 0.06 }, params: [distP(0.06)],
    eval(u, c) { return C({ dy: Math.sin(u * Math.PI) * p(c, 'distance', 0.06) * c.amount, sx: 1 + 0.015 * bell(u), sy: 1 - 0.02 * bell(u) }); },
  });

  // IDLE ------------------------------------------------------------------------------------------------------------------
  idl({
    id: 'slow-glow', name: 'Slow glow', description: 'The glow and brightness rise and fall very slowly; nothing moves.', duration: 4, defs: { amount: 0.18 }, params: [sizeP('amount', 'Depth', 0.18, 1)],
    eval(u, c) { const k = Math.sin(u * TAU) * 0.5 + 0.5, a = p(c, 'amount', 0.18) * c.amount; return C({ bright: 1 + a * 0.5 * k, glow: 1 + a * 3 * k }); },
  });
  idl({
    id: 'drift', name: 'Drift', description: 'A barely-there drift, up and down and a little sideways, like something floating in still air.', duration: 5, defs: { size: 0.025 }, params: [sizeP('size', 'Reach', 0.025, 0.3)],
    eval(u, c) { const s = p(c, 'size', 0.025) * c.amount; return C({ dy: Math.sin(u * TAU) * s, dx: Math.sin(u * TAU * 2 + 1) * s * 0.4 }); },
  });
  return out;
}
