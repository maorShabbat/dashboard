import type { Preset } from '../model/preset';
import { F, I, imageIn, mo, motion, preset, scene } from './kit';
import { reelFeatures, reelSpins } from './reels';
import { spinEffects } from './spinfx';
import { symbolAnimations } from './symbolanim';
import { laneEffects } from './lanefx';
import { expandingWilds } from './expandwild';
import { cascades } from './cascades';

const CAT = 'symbol-transformation' as const;
const START = 0.9;

function xform(slug: string, name: string, description: string, effect: string, a: string, b: string | null, params: Record<string, number | string | boolean> = {}, extra: ReturnType<typeof F>[] = [], hold = 0.9): Preset {
  const els = [I('a', a, { name: 'Symbol', size: 0.28, y: 0.55, motion: motion({ entrance: mo.in('pop', { duration: 0.5 }), idle: mo.in('float', { start: 0.55 }) }) })];
  if (b) els.push(I('b', b, { name: 'Becomes', size: 0.28, y: 0.55, motion: {} }));
  const fx = [F('xform', effect, START, params, { target: 'a', ...(b ? { target2: 'b' } : {}) }), ...extra];
  return preset(CAT, slug, name, description, scene(els, fx, { hold }), { tags: ['symbol', 'transform'], group: 'Symbol transformations', inputs: [imageIn('a', 'Symbol'), ...(b ? [imageIn('b', 'Becomes (PNG or WebM)')] : [])] });
}

export function transformation(): Preset[] {
  return [
    xform('morph', 'Morph', 'The first symbol dissolves in a burst of light while the second forms in its place.', 'xform.morph', 'builtin:gem', 'builtin:seven'),
    xform('flip', 'Card flip', 'The symbol turns over like a card and shows the new one on its back.', 'xform.flip', 'builtin:horseshoe', 'builtin:star'),
    xform('upgrade', 'Upgrade', 'The symbol rises in a glow, rays burst out, and a bigger, brighter symbol takes its place.', 'xform.upgrade', 'builtin:cherry', 'builtin:crown', {}, [F('spark', 'light.sparkle', START + 1.0, { cy: 0.55, count: 14, duration: 1.2 })], 1.3),
    xform('swap', 'Quick swap', 'A fast, clean swap with a small squeeze and a spark: for rapid symbol changes.', 'xform.swap', 'builtin:bell', 'builtin:clover'),
    xform('expand-across', 'Expand across the row', 'The symbol charges, then stretches sideways across the whole reel row, holds, and releases.', 'xform.expand-h', 'builtin:seven', null, {}, [F('shake', 'shake', START + 0.7, { amplitude: 0.006, duration: 0.3 })], 0.3),
    xform('expand-down', 'Expand down the reel', 'The symbol charges, then stretches up and down the reel, holds, and releases.', 'xform.expand-v', 'builtin:star', null, { coverage: 1 }, [F('shake', 'shake', START + 0.7, { amplitude: 0.006, duration: 0.3 })], 0.3),
    xform('fill-screen', 'Fill the screen', 'The symbol swells until it fills the whole screen in a flash.', 'xform.fill', 'builtin:gem', null, {}, [], 0.2),
    xform('multiply', 'Multiply', 'The symbol pulses and copies burst outward, then fade, leaving the original.', 'xform.multiply', 'builtin:coin', null, {}, [], 0.8),
    ...reelSpins(),
    ...spinEffects(),
    ...symbolAnimations(),
    ...laneEffects(),
    ...expandingWilds(),
    ...cascades(),
    ...reelFeatures().filter((x) => x.category === 'symbol-transformation'),
  ];
}
