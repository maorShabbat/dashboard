import type { Preset } from '../model/preset';
import type { ShapeId } from '../model/scene';
import type { ShapeStyle } from '../style/textStyle';
import { fountains } from './fountains';
import { ladders } from './ladders';
import { plates } from './plates';
import { C, F, I, S, T, counterIn, imageIn, mo, motion, plate, preset, scene, shine, textIn, ts } from './kit';

const CAT = 'messages' as const;
const OUT = 4.9;   // seconds when the exit starts

interface Win {
  slug: string; name: string; description: string;
  title: string; titleStyle: string; titleSize?: number;
  sub?: string; amount?: number; prefix?: string;
  shape: ShapeId; plateStyle: ShapeStyle; w: number; h: number;
  back?: { shape: ShapeId; style: ShapeStyle; w: number; h: number; y: number };
  rays?: string; extras?: ReturnType<typeof F>[]; entrance?: string;
}

function win(o: Win): Preset {
  const exit = (id = 'zoom-out', start = OUT) => mo.in(id, { start, duration: 0.45 });
  const els = [];
  if (o.back) els.push(S('back', o.back.shape, o.back.style, { name: 'Ribbon', y: o.back.y, width: o.back.w, height: o.back.h, motion: motion({ entrance: mo.in('unfold', { start: 0.25, duration: 0.5 }), exit: exit() }) }));
  els.push(S('plate', o.shape, o.plateStyle, { name: 'Message background', y: 0.5, width: o.w, height: o.h, motion: motion({ entrance: mo.in(o.entrance ?? 'elastic', { duration: 0.8 }), idle: mo.in('breathe', { start: 1, duration: 3 }), exit: exit() }) }));
  els.push(T('title', o.title, { y: o.amount !== undefined ? 0.44 : 0.5, size: o.titleSize ?? 0.2, style: ts(o.titleStyle), motion: motion({ entrance: mo.in('slam', { start: 0.2 }), exit: exit() }), shine: shine({ start: 1.2, duration: 0.9, repeat: 2, interval: 1.4 }) }));
  if (o.sub) els.push(T('subtitle', o.sub, { role: 'subtitle', name: 'Subtitle', y: 0.3, size: 0.07, style: ts('clean-white'), motion: motion({ entrance: mo.in('slide-down', { start: 0.5, duration: 0.5 }), exit: exit('fade-out') }) }));
  if (o.amount !== undefined) els.push(C('amount', { y: 0.63, size: 0.13, from: 0, to: o.amount, prefix: o.prefix ?? '', style: ts('gold-chunky', (s) => { s.outlines[0]!.fill = ts('gold-chunky').outlines[1]?.fill ?? s.outlines[0]!.fill; }), roll: 'roll', countStart: 0.9, countDuration: 2.2, landPulse: 0.14, motion: motion({ entrance: mo.in('pop', { start: 0.8 }), exit: exit() }) }));
  const fx = [
    ...(o.rays ? [F('rays', 'light.rays', 0.1, { duration: OUT + 0.2, tint: o.rays, length: 1.3, intensity: 0.65 })] : []),
    F('flash', 'flash', 0.2, { cy: 0.5, size: 0.2 }),
    ...(o.extras ?? []),
  ];
  const inputs = [textIn('title', 'Title'), ...(o.sub ? [textIn('subtitle', 'Subtitle')] : []), ...(o.amount !== undefined ? [counterIn('amount', 'Amount')] : [])];
  return preset(CAT, o.slug, o.name, o.description, scene(els, fx), { tags: ['message', 'celebration', 'banner'], inputs, group: 'Banners and plates' });
}

export function messages(): Preset[] {
  const goldRibbon = plate(['#fff0a0', '#ffc933', '#c27a0a'], '#4a1d00', { shadow: false });
  const burgundy = plate(['#8a1736', '#3d0618'], '#ffd24a', { glow: '#ff3a5a' });
  const royal = plate(['#8a3dff', '#3b1296'], '#ffe27a', { glow: '#b36bff', thick: 0.04 });
  const royalBurst = plate(['#8a3dff', '#3b1296'], '#ffe27a', { glow: '#b36bff', thick: 0.022 });
  const neon = plate(['#0a1630'], '#38e8ff', { glow: '#38e8ff', bevel: false });
  const leather = plate(['#7a4a22', '#3f230e'], '#ffd88a');
  const teal = plate(['#13727e', '#06303a'], '#7dfff0', { glow: '#2cffd5' });
  const crimson = plate(['#d6162f', '#6a0014'], '#ffd24a', { glow: '#ff5a3a', thick: 0.022 });

  const list: Preset[] = [
    win({ slug: 'big-win', name: 'Big win', description: 'A gold banner slams in over a red ribbon with light rays, a flash, confetti and a counting amount.', title: 'BIG WIN', titleStyle: 'gold-chunky', sub: 'YOU WON', amount: 12500,
      shape: 'banner', plateStyle: burgundy, w: 1.15, h: 0.34, back: { shape: 'ribbon', style: goldRibbon, w: 1.5, h: 0.22, y: 0.58 }, rays: '#ffe08a',
      extras: [F('confetti', 'celebrate.confetti', 0.35, { cy: 0.45, count: 110 }), F('spark', 'light.sparkle', 1.3, { cy: 0.46, width: 1.1, height: 0.2, duration: 2.5 })] }),
    win({ slug: 'mega-win', name: 'Mega win', description: 'A bigger, more violent version: a starburst plate, hotter colours and a shower of coins.', title: 'MEGA WIN', titleStyle: 'comic-boom', sub: 'AMAZING', amount: 250000, prefix: '$',
      shape: 'burst', plateStyle: royalBurst, w: 1.05, h: 0.95, rays: '#ff9a3a', entrance: 'pop',
      extras: [F('coins', 'celebrate.coins', 0.4, { origin: 'rain', count: 70 }), F('shock', 'shockwave', 0.25, { cy: 0.5, strength: 0.5, distortion: 0.7, radius: 0.9, duration: 1.1 })] }),
    win({ slug: 'super-win', name: 'Super win', description: 'A neon frame with a cold glow and electric rays.', title: 'SUPER WIN', titleStyle: 'neon-sign', sub: 'INCREDIBLE', amount: 1000000,
      shape: 'neon-box', plateStyle: neon, w: 1.2, h: 0.55, rays: '#38e8ff', entrance: 'zoom-in',
      extras: [F('flare', 'light.flare', 0.3, { cy: 0.5, size: 0.28, tint: '#bff6ff' })] }),
    win({ slug: 'free-spins', name: 'Free spins', description: 'A plate pops out with two lines: the award and a big number, with sparkles.', title: 'FREE SPINS', titleStyle: 'candy-bubble', titleSize: 0.14, sub: 'YOU HAVE WON', 
      shape: 'plate', plateStyle: royal, w: 1.0, h: 0.55, rays: '#d9a8ff', entrance: 'pop', extras: [F('spark', 'light.sparkle', 1, { cy: 0.5, width: 1, height: 0.35, count: 20, duration: 2.8, tint: '#f0d8ff' })] }),
    win({ slug: 'bonus-unlocked', name: 'Bonus unlocked', description: 'A parchment scroll unrolls with the line BONUS UNLOCKED and a calm shimmer.', title: 'BONUS UNLOCKED', titleStyle: 'elegant-cabaret', titleSize: 0.1, sub: 'GET READY',
      shape: 'scroll', plateStyle: leather, w: 1.25, h: 0.42, rays: '#ffe6a8', entrance: 'unfold', extras: [F('spark', 'light.sparkle', 1.2, { cy: 0.5, width: 1.1, height: 0.25, duration: 2.5 })] }),
    win({ slug: 'level-up', name: 'Level up', description: 'A scalloped badge spins in with a halo and a rising number.', title: 'LEVEL UP', titleStyle: 'ice-crystal', titleSize: 0.12, amount: 25,
      shape: 'badge', plateStyle: teal, w: 0.95, h: 0.95, rays: '#8affee', entrance: 'spin-in', extras: [F('halo', 'light.halo', 0.3, { cy: 0.5, size: 0.6, duration: 4.4, tint: '#7dfff0' })] }),
    win({ slug: 'jackpot', name: 'Jackpot', description: 'A golden starburst, coins pouring from the top and a huge counting prize.', title: 'JACKPOT', titleStyle: 'elegant-cabaret', titleSize: 0.22, amount: 5000000, prefix: '$',
      shape: 'burst', plateStyle: crimson, w: 1.2, h: 1.1, rays: '#ffd24a', entrance: 'zoom-in',
      extras: [F('coins', 'celebrate.coins', 0.3, { origin: 'rain', count: 90, duration: 3.6 }), F('confetti', 'celebrate.confetti', 0.4, { cy: 0.5, count: 80 })] }),
    win({ slug: 'you-win', name: 'You win', description: 'The plain version: a rounded plate with a title and a subtitle.', title: 'YOU WIN', titleStyle: 'clean-white', titleSize: 0.17, sub: 'WELL PLAYED',
      shape: 'plate', plateStyle: plate(['#4a63d8', '#2b3b9a'], '#cfe0ff', { glow: '#6a86ff' }), w: 1.0, h: 0.42, entrance: 'pop' }),
  ];


  // the two screen-filling wins from the game-footage references: just the lettering, a count-up and light, no plate
  const bare = (slug: string, name: string, description: string, titleText: string, titleStyle: string, amountStyle: string | null, ray: string, size: number, extra: ReturnType<typeof F>[]): Preset => {
    const exit = (id = 'zoom-out') => mo.in(id, { start: OUT, duration: 0.45 });
    const els = [
      T('title', titleText, { y: amountStyle ? 0.36 : 0.5, size, style: ts(titleStyle), motion: motion({ entrance: mo.in('slam', { start: 0.2 }), idle: mo.in('breathe', { start: 1.1 }), exit: exit() }), shine: shine({ start: 1.2, duration: 0.9, repeat: 2, interval: 1.4 }) }),
      ...(amountStyle ? [C('amount', { y: 0.66, size: size * 1.25, from: 0, to: 8611, decimals: 2, style: ts(amountStyle), roll: 'roll', countStart: 0.8, countDuration: 2.4, landPulse: 0.14, motion: motion({ entrance: mo.in('pop', { start: 0.7 }), exit: exit() }) })] : []),
    ];
    const fx = [F('rays', 'light.rays', 0.1, { duration: OUT + 0.2, tint: ray, length: 1.4, intensity: 0.7 }), F('flash', 'flash', 0.2, { cy: 0.5, size: 0.2 }), ...extra];
    return preset(CAT, slug, name, description, scene(els, fx), { tags: ['message', 'celebration', 'reference'], inputs: [textIn('title', 'Title'), ...(amountStyle ? [counterIn('amount', 'Amount')] : [])], group: 'Like the reference screenshots' });
  };
  list.push(
    bare('max-win-amount', 'Max win with amount', 'Two-tone gold “MAX WIN” slams in over yellow light rays, with a big gold amount counting up under it.', 'MAX WIN', 'gold-two-tone', 'gold-two-tone', '#fff06a', 0.2,
      [F('coins', 'celebrate.coins', 0.4, { origin: 'rain', count: 60 }), F('spark', 'light.sparkle', 1.3, { cy: 0.5, width: 1.2, height: 0.5, duration: 2.8 })]),
    bare('big-win-green', 'Big win, green', 'Glossy green “BIG WIN” slams in on a green burst of light with sparkles.', 'BIG WIN', 'candy-green', null, '#8dff6a', 0.24,
      [F('spark', 'light.sparkle', 1.1, { cy: 0.5, width: 1.1, height: 0.3, duration: 2.8, tint: '#d8ffb0' })]),
  );

  // a message on an uploaded background: replace the picture with your own PNG or transparent WebM
  const custom = scene([
    I('bg', 'builtin:plate-gold', { name: 'Message background', role: 'background', size: 1.2, width: 1.5, height: 0.75, y: 0.5, motion: motion({ entrance: mo.in('elastic', { duration: 0.8 }), idle: mo.in('breathe', { start: 1, duration: 3 }), exit: mo.in('zoom-out', { start: 3.9, duration: 0.45 }) }) }),
    T('title', 'CONGRATULATIONS', { y: 0.4, size: 0.085, style: ts('gold-chunky'), motion: motion({ entrance: mo.in('rise-letters', { start: 0.4, unit: 'char', stagger: 0.03 }), exit: mo.in('fade-out', { start: 3.9 }) }), shine: shine({ start: 1.4, duration: 0.8, repeat: 1 }) }),
    T('body', 'You have unlocked\nthe treasure room', { role: 'body', name: 'Message lines', y: 0.57, size: 0.062, style: ts('clean-white'), motion: motion({ entrance: mo.in('slide-up', { start: 0.8, unit: 'line', stagger: 0.2 }), exit: mo.in('fade-out', { start: 3.9 }) }) }),
  ], [F('rays', 'light.rays', 0.1, { duration: 4.2, tint: '#ffe6a0', length: 1.2, intensity: 0.5 }), F('flash', 'flash', 0.25, { cy: 0.5 })]);
  list.push(preset(CAT, 'custom-background', 'Message on your own background', 'Upload your own PNG or transparent WebM as the message background, then type any number of lines on top.', custom, { tags: ['message', 'upload', 'multi-line'], inputs: [imageIn('bg', 'Message background (PNG or WebM)'), textIn('title', 'Title'), textIn('body', 'Lines')], group: 'Banners and plates' }));
  list.push(...ladders(), ...fountains(), ...plates());
  return list;
}
