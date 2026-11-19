import type { Preset } from '../model/preset';
import { C, F, S, T, counterIn, makeGradient, mo, motion, plate, preset, scene, shine, textIn, ts } from './kit';
import { look, vert } from './plates';

const CAT = 'multipliers' as const;

export function multipliers(): Preset[] {
  const badge = plate(['#5a3ad8', '#2a1a8a', '#150a52'], '#ffe27a', { glow: '#8a6aff' });
  const dark = plate(['#2a2f6a', '#12163a'], '#7a8cff', { glow: '#6a7cff' });
  const x = (id: string, text: string, o: Parameters<typeof T>[2] = {}) => T(id, text, { role: 'multiplier', name: 'Multiplier', size: 0.3, y: 0.52, style: ts('gold-chunky'), ...o });
  const list: Preset[] = [
    preset(CAT, 'pop-badge', 'Pop badge', 'A scalloped badge pops out with the multiplier, a light sweep and sparkles.',
      scene([S('badge', 'badge', badge, { y: 0.52, width: 0.78, height: 0.78, motion: motion({ entrance: mo.in('pop', { duration: 0.55 }), idle: mo.in('breathe', { start: 0.8 }), exit: mo.in('shrink', { start: 3.4 }) }) }),
        x('mult', 'x5', { size: 0.36, motion: motion({ entrance: mo.in('slam', { start: 0.15 }), exit: mo.in('fade-out', { start: 3.4 }) }), shine: shine({ start: 1, repeat: 1, interval: 1.2 }) })],
      [F('spark', 'light.sparkle', 0.9, { cy: 0.5, width: 0.8, height: 0.7, count: 16, duration: 2.2 }), F('flash', 'flash', 0.15, { cy: 0.5 })]), { tags: ['multiplier', 'badge'], inputs: [textIn('mult', 'Multiplier')] }),
    preset(CAT, 'build-up', 'Build-up', 'The multiplier climbs x1 to x10 in steps, growing brighter and bigger, and detonates in a flare.',
      scene([C('mult', { name: 'Multiplier', prefix: 'x', from: 1, to: 10, size: 0.34, y: 0.52, style: ts('fire-brand'), roll: 'pop', tickPop: 0.3, countStart: 0.4, countDuration: 2.4, ease: 'easeIn', landPulse: 0.3,
        motion: motion({ entrance: mo.in('pop', { duration: 0.4 }), idle: mo.in('tremble', { start: 0.5, duration: 0.3, params: { amplitude: 0.004 } }), emphasis: [mo.in('glow-pulse', { start: 2.8 })], exit: mo.in('zoom-out', { start: 3.9 }) }) })],
      [F('halo', 'light.halo', 0.4, { cy: 0.52, size: 0.5, tint: '#ff8a2a', duration: 3.4 }), F('flare', 'light.flare', 2.8, { cy: 0.52, size: 0.3 }), F('shock', 'shockwave', 2.8, { cy: 0.52, strength: 0.45, distortion: 0.6, radius: 0.8, duration: 0.9 })]), { tags: ['multiplier', 'counter'], inputs: [counterIn('mult', 'Multiplier')] }),
    preset(CAT, 'slam', 'Slam', 'x10 crashes down with a camera punch, a shockwave and a dust ring.',
      scene([x('mult', 'x10', { size: 0.42, style: ts('comic-boom'), motion: motion({ entrance: mo.in('slam', { duration: 0.5 }), emphasis: [mo.in('jelly', { start: 0.9 })], exit: mo.in('fade-out', { start: 3.2 }) }) })],
      [F('slam', 'impact.slam', 0.22, { cy: 0.52 }), F('shock', 'shockwave', 0.24, { cy: 0.52, strength: 0.6, distortion: 0.8, radius: 1, duration: 1.1 })]), { tags: ['multiplier', 'impact'], inputs: [textIn('mult', 'Multiplier')] }),
    preset(CAT, 'orbit-sparks', 'Orbit sparks', 'The multiplier hangs in a pulsing halo while sparkles twinkle on its letters.',
      scene([x('mult', 'x25', { size: 0.34, style: ts('chrome-impact'), motion: motion({ entrance: mo.in('elastic', { duration: 0.8 }), idle: mo.in('hover', { start: 0.9 }), exit: mo.in('shrink', { start: 3.6 }) }) })],
      [F('halo', 'light.halo', 0.2, { cy: 0.52, size: 0.5, duration: 3.6, tint: '#bfe6ff', pulses: 4 }), F('spark', 'light.sparkle', 0.9, { cy: 0.52, count: 24, duration: 2.6, tint: '#e8f4ff' }, { target: 'mult' })]), { tags: ['multiplier', 'sparkle'], inputs: [textIn('mult', 'Multiplier')] }),
    preset(CAT, 'energy-charge', 'Energy charge', 'A plasma discharge crackles behind the number as it charges up and snaps into place.',
      scene([x('mult', 'x50', { size: 0.36, style: ts('alien-plasma'), motion: motion({ entrance: mo.in('zoom-in', { start: 0.9, duration: 0.45 }), idle: mo.in('breathe', { start: 1.5, duration: 1.4 }), exit: mo.in('fade-out', { start: 3.6 }) }) })],
      [F('plasma', 'plasma', 0.1, { cy: 0.52 }), F('flash', 'flash', 0.95, { cy: 0.52, size: 0.2 })]), { tags: ['multiplier', 'plasma'], inputs: [textIn('mult', 'Multiplier')] }),
    preset(CAT, 'ladder', 'Multiplier ladder', 'A row of badges lights up one after another, ending on the biggest.',
      scene(['x2', 'x3', 'x5', 'x10'].map((txt, i) => {
        const big = i === 3;
        return T(`m${i}`, txt, { role: 'multiplier', name: `Step ${i + 1}`, x: 0.24 + i * 0.173, y: 0.52, size: big ? 0.2 : 0.14, style: ts(big ? 'gold-chunky' : 'chrome-impact'),
          motion: motion({ entrance: mo.in('pop', { start: i * 0.35, duration: 0.45 }), emphasis: [mo.in('emph-pulse', { start: 1.8 + i * 0.35, duration: 0.45, params: { size: big ? 0.35 : 0.22 } })], exit: mo.in('fade-out', { start: 4 }) }), shine: big ? shine({ start: 3.4, duration: 0.8 }) : undefined });
      }), [F('halo', 'light.halo', 3.2, { cx: 0.76, cy: 0.52, size: 0.3, duration: 1.4 }), F('flare', 'light.flare', 3.2, { cx: 0.76, cy: 0.52, size: 0.14 })]), { tags: ['multiplier', 'sequence'], inputs: [textIn('m0', 'Step 1'), textIn('m1', 'Step 2'), textIn('m2', 'Step 3'), textIn('m3', 'Step 4')] }),
    preset(CAT, 'fly-in', 'Fly in', 'The multiplier arcs in from the side, lands with a hop and a burst.',
      scene([S('plate', 'circle', dark, { y: 0.52, width: 0.7, height: 0.7, motion: motion({ entrance: mo.in('fade-in', { duration: 0.4 }), exit: mo.in('fade-out', { start: 3.4 }) }) }),
        x('mult', 'x3', { size: 0.34, style: ts('ice-crystal'), motion: motion({ entrance: mo.in('arc-in', { start: 0.4, duration: 0.8, params: { side: 'left', distance: 3.5 } }), emphasis: [mo.in('pop-bounce', { start: 1.25 })], exit: mo.in('fade-out', { start: 3.4 }) }) })],
      [F('flash', 'flash', 1.2, { cy: 0.52, size: 0.18, tint: '#cfeaff' }), F('shock', 'shockwave', 1.2, { cy: 0.52, strength: 0.4, distortion: 0.5, radius: 0.7, duration: 0.8 })]), { tags: ['multiplier', 'fly'], inputs: [textIn('mult', 'Multiplier')] }),
    preset(CAT, 'mega', 'Mega multiplier', 'x100 with light rays, a coin shower and a thundering finish.',
      scene([x('mult', 'x100', { size: 0.4, style: ts('elegant-cabaret'), motion: motion({ entrance: mo.in('slam', { duration: 0.55 }), idle: mo.in('breathe', { start: 0.9 }), exit: mo.in('zoom-out', { start: 3.9 }) }), shine: shine({ start: 1.1, repeat: 1, interval: 1 }) })],
      [F('rays', 'light.rays', 0.1, { duration: 4.2, tint: '#ffd24a' }), F('coins', 'celebrate.coins', 0.4, { origin: 'rain', count: 60 }), F('slam', 'impact.slam', 0.25, { cy: 0.52, strength: 0.8 })]), { tags: ['multiplier', 'celebration'], inputs: [textIn('mult', 'Multiplier')] }),
  ];
  return list;
}

const GM = 'Medallions, jewels and shields', GB = 'Builds and steps';
interface Way { ring: [string, string, string]; edge: string; disc: [string, string]; key: string; text: string; ray: string; spark: string }
const WAYS: Record<string, Way> = {
  gold: { ring: ['#fff0a0', '#e8a21a', '#7a4306'], edge: '#3f1d03', disc: ['#4a2a86', '#1c0b3d'], key: '#ffd24a', text: 'carved-gold', ray: '#ffe08a', spark: '#fff3b0' },
  silver: { ring: ['#ffffff', '#a9b8ca', '#56667c'], edge: '#0a1018', disc: ['#1c2a3e', '#070e1a'], key: '#cfe0f4', text: 'steel-badge', ray: '#a8d0ff', spark: '#e8f4ff' },
  ruby: { ring: ['#ffb0b0', '#e01a34', '#6a0010'], edge: '#2a0006', disc: ['#3a0a14', '#12030a'], key: '#ffd070', text: 'ornate-ruby', ray: '#ff5a5a', spark: '#ffd0d0' },
  emerald: { ring: ['#d8ffd0', '#26c860', '#0a5a28'], edge: '#021a0a', disc: ['#0a3a22', '#031a0e'], key: '#f4d06a', text: 'ornate-emerald', ray: '#5aff8a', spark: '#d8ffd0' },
  sapphire: { ring: ['#c4e6ff', '#2a7cff', '#0a2a8a'], edge: '#020a1e', disc: ['#0a2a5a', '#030f2a'], key: '#f4d06a', text: 'ornate-sapphire', ray: '#5aa8ff', spark: '#d8ecff' },
  violet: { ring: ['#f6c8ff', '#a244f4', '#3a0f8a'], edge: '#0e0422', disc: ['#2a0a5a', '#0e0422'], key: '#e6b4ff', text: 'violet-metal', ray: '#d070ff', spark: '#ffd6f6' },
};
const EXIT = 3.9;
const ex = (id = 'soft-scale-out') => mo.in(id, { start: EXIT, duration: 0.5 });

export function multipliers2(): Preset[] {
  const out: Preset[] = [];
  const mult = (id: string, text: string, style: string, size: number, y: number, o: { entrance?: string; start?: number; tweak?: (s: ReturnType<typeof ts>) => void } = {}) =>
    T(id, text, { role: 'multiplier', name: 'Multiplier', size, y, style: ts(style, o.tweak), motion: motion({ entrance: mo.in(o.entrance ?? 'soft-scale', { start: o.start ?? 0.3, duration: 0.6 }), idle: mo.in('slow-glow', { start: 1.1 }), exit: ex() }), shine: shine({ start: 1.2, duration: 0.9, repeat: 1, interval: 1.2, width: 0.2, intensity: 0.7 }) });
  const common = (ray: string, spark: string, cy = 0.5, w = 0.7) => [F('rays', 'light.rays', 0.1, { duration: EXIT + 0.3, tint: ray, length: 1.1, intensity: 0.35 }), F('flash', 'flash', 0.3, { cy, size: 0.14 }), F('spark', 'light.sparkle', 1.1, { cy, width: w, height: w, duration: 2.6, tint: spark, count: 16 })];
  const add = (slug: string, name: string, desc: string, els: unknown[], fx: ReturnType<typeof F>[], group: string, inputs = [textIn('mult', 'Multiplier')], tags: string[] = []): void => {
    out.push(preset(CAT, slug, name, desc, scene(els as never, fx), { tags: ['multiplier', 'premium', ...tags], inputs, group }));
  };

  // medallions: a scalloped metal ring round a dark disc, the multiplier in the matching lettering
  for (const [key, w, value, label] of [['gold', WAYS.gold!, 'x5', 'gold'], ['silver', WAYS.silver!, 'x10', 'silver'], ['ruby', WAYS.ruby!, 'x25', 'ruby'], ['emerald', WAYS.emerald!, 'x3', 'emerald'], ['sapphire', WAYS.sapphire!, 'x50', 'sapphire'], ['violet', WAYS.violet!, 'x100', 'violet']] as const) {
    const ring = look(vert([[0, w.ring[0]], [0.5, w.ring[1]], [1, w.ring[2]]]), [[0.025, w.edge]], { slab: w.edge, depth: 0.03 });
    const disc = look(vert([[0, w.disc[0]], [1, w.disc[1]]]), [[0.018, w.key], [0.03, w.edge]], { bevel: false, shadow: false });
    add(`medallion-${key}`, `Medallion: ${label}`, `A scalloped ${label} ring pops in round a dark disc and the multiplier settles in its centre with a pass of light.`,
      [S('ring', 'badge', ring, { name: 'Ring', y: 0.5, width: 0.7, height: 0.7, params: { teeth: 16, depth: 0.05 }, motion: motion({ entrance: mo.in('pop', { duration: 0.6 }), idle: mo.in('breathe', { start: 1, duration: 3.2 }), exit: ex() }) }),
        S('disc', 'circle', disc, { name: 'Disc', y: 0.5, width: 0.54, height: 0.54, motion: motion({ entrance: mo.in('pop', { start: 0.08, duration: 0.6 }), exit: ex() }) }),
        mult('mult', value, w.text, value.length > 3 ? 0.21 : 0.29, 0.5)], common(w.ray, w.spark), GM, [textIn('mult', 'Multiplier')], ['medallion']);
  }

  // jewels: a cut stone with a white edge and a metal figure across it
  const jewel = (slug: string, name: string, desc: string, stops: [string, string, string], dark: string, text: string, glow: string, value: string) => {
    const st = look(makeGradient('linear', [[0, stops[0]], [0.4, stops[1]], [0.41, stops[2]], [1, dark]], { angle: 90 }), [[0.02, '#ffffff'], [0.04, dark]], { slab: dark, depth: 0.04 });
    add(slug, name, desc, [S('gem', 'diamond', st, { name: 'Jewel', y: 0.5, width: 0.6, height: 0.78, motion: motion({ entrance: mo.in('pop', { duration: 0.6 }), idle: mo.in('breathe', { start: 1, duration: 3.2 }), exit: ex() }) }), mult('mult', value, text, value.length > 3 ? 0.2 : 0.27, 0.5, { start: 0.35 })], common(glow, '#ffffff', 0.5, 0.6), GM, [textIn('mult', 'Multiplier')], ['jewel']);
  };
  jewel('jewel-ruby', 'Jewel: ruby', 'A ruby cut stone drops in with a flash and the multiplier is set across it in steel lettering.', ['#ffc0c8', '#ff3a52', '#c01430'], '#3a0010', 'steel-badge', '#ff4a5a', 'x10');
  jewel('jewel-sapphire', 'Jewel: sapphire', 'The same stone in sapphire.', ['#d4ecff', '#4a9cff', '#1c5ad8'], '#04184a', 'steel-badge', '#4a9cff', 'x20');
  jewel('jewel-emerald', 'Jewel: emerald', 'The same stone in emerald.', ['#d8ffd8', '#3ad878', '#14a050'], '#04301a', 'steel-badge-gold', '#3aff7a', 'x4');
  jewel('jewel-amethyst', 'Jewel: amethyst', 'The same stone in amethyst with pink-metal lettering.', ['#f6d4ff', '#b45cff', '#7a28d8'], '#240a5a', 'violet-metal', '#d070ff', 'x15');

  // shields: the steel shield of the BIG WIN plate, small, with the multiplier on it
  const shield = (slug: string, name: string, desc: string, edge: string, text: string, ray: string, value: string) => {
    const steel = look(makeGradient('reflected', [[0, '#ffffff'], [0.3, '#cfdae8'], [0.62, '#6f819b'], [1, '#2e3d52']], { angle: 90 }), [[0.025, edge], [0.05, '#05090f']], { slab: '#05090f', depth: 0.03 });
    const inner = look(vert([[0, '#1c2a3e'], [1, '#050a14']]), [[0.02, '#aebed4'], [0.03, '#02050a']], { bevel: false, shadow: false });
    add(slug, name, desc, [S('shield', 'shield', steel, { name: 'Shield', y: 0.5, width: 0.5, height: 0.6, motion: motion({ entrance: mo.in('elastic', { duration: 0.8 }), exit: ex() }) }), S('inner', 'shield', inner, { name: 'Shield inner', y: 0.51, width: 0.39, height: 0.48, motion: motion({ entrance: mo.in('elastic', { start: 0.05, duration: 0.8 }), exit: ex() }) }), mult('mult', value, text, 0.22, 0.49, { start: 0.35 })], common(ray, '#e8f4ff', 0.5, 0.5), GM, [textIn('mult', 'Multiplier')], ['shield']);
  };
  shield('shield-steel', 'Shield: steel', 'A small steel shield snaps in with the multiplier across it.', '#9aaec6', 'steel-badge', '#8ab8ff', 'x10');
  shield('shield-gold', 'Shield: gold edge', 'The same shield with a gold edge.', '#e8b64a', 'steel-badge-gold', '#ffd870', 'x25');

  // slabs: the striped slab, for the small multipliers of a ladder
  const slab = (slug: string, name: string, desc: string, dark: string, mid: string, line: string, text: string, spark: string, value: string) => {
    const sl = look(makeGradient('linear', [[0, dark], [0.5, dark], [0.5, mid], [1, mid]], { angle: 58, repeat: 10 }), [[0.016, line], [0.045, '#000000']], { bevel: false, slab: '#000000', depth: 0.05 });
    add(slug, name, desc, [S('slab', 'slab', sl, { name: 'Plate', y: 0.5, width: 0.62, height: 0.3, params: { chamfer: 0.22, slant: 0.2 }, motion: motion({ entrance: mo.in('slide-right', { duration: 0.45 }), exit: ex() }) }), mult('mult', value, text, 0.25, 0.5, { start: 0.2, entrance: 'drift-fade' })], [F('flash', 'flash', 0.2, { cy: 0.5, size: 0.1 }), F('spark', 'light.sparkle', 0.9, { cy: 0.5, width: 0.62, height: 0.26, duration: 2.2, tint: spark, count: 10 })], GM, [textIn('mult', 'Multiplier')], ['slab']);
  };
  slab('slab-green', 'Slab: green', 'A dark green striped slab slides in with heavy slanted white figures: a quick, plain multiplier.', '#0b3a1c', '#16602e', '#8ae8a0', 'slab-white', '#d8ffe0', 'x2');
  slab('slab-blue', 'Slab: blue', 'The same slab in navy.', '#0a2448', '#133e7a', '#8ac8ff', 'slab-cyan', '#e0f4ff', 'x3');
  slab('slab-amber', 'Slab: amber', 'The same slab in amber.', '#3a1c04', '#6a3408', '#ffd070', 'slab-yellow', '#fff0c0', 'x5');

  // builds ---------------------------------------------------------------------------------------------------------------
  {
    const w = WAYS.gold!;
    const ring = look(vert([[0, w.ring[0]], [0.5, w.ring[1]], [1, w.ring[2]]]), [[0.025, w.edge]], { slab: w.edge, depth: 0.03 });
    const disc = look(vert([[0, w.disc[0]], [1, w.disc[1]]]), [[0.018, w.key], [0.03, w.edge]], { bevel: false, shadow: false });
    add('climb', 'Climb: x2 to x10', 'The multiplier counts up inside a gold medallion, each step ticking and the ring swelling, and settles with a flare.',
      [S('ring', 'badge', ring, { name: 'Ring', y: 0.5, width: 0.7, height: 0.7, params: { teeth: 16, depth: 0.05 }, motion: motion({ entrance: mo.in('pop', { duration: 0.6 }), emphasis: [mo.in('nudge', { start: 1.0, duration: 0.5, params: { size: 0.04 } }), mo.in('nudge', { start: 1.7, duration: 0.5, params: { size: 0.05 } }), mo.in('nudge', { start: 2.4, duration: 0.5, params: { size: 0.07 } })], exit: ex() }) }),
        S('disc', 'circle', disc, { name: 'Disc', y: 0.5, width: 0.54, height: 0.54, motion: motion({ entrance: mo.in('pop', { start: 0.08, duration: 0.6 }), exit: ex() }) }),
        C('mult', { name: 'Multiplier', prefix: 'x', from: 2, to: 10, decimals: 0, size: 0.24, y: 0.5, style: ts('carved-gold'), roll: 'pop', tickPop: 0.08, countStart: 0.8, countDuration: 2.2, ease: 'easeIn', landPulse: 0.14, motion: motion({ entrance: mo.in('fade-in', { start: 0.3, duration: 0.4 }), exit: ex() }) })],
      [F('rays', 'light.rays', 0.1, { duration: EXIT + 0.3, tint: w.ray, length: 1.1, intensity: 0.3 }), F('flare', 'light.flare', 3.0, { cy: 0.5, size: 0.22 }), F('shock', 'shockwave', 3.0, { cy: 0.5, strength: 0.3, distortion: 0.4, radius: 0.6, duration: 0.8 })], GB, [counterIn('mult', 'Multiplier')], ['counter']);
  }
  add('double-up', 'Double up', 'A plain x2 gives way to x4: the first figure softens out, the second lands with a flash and a ring of light.',
    [T('a', 'x2', { role: 'multiplier', name: 'Before', size: 0.3, y: 0.5, style: ts('ornate-silver'), motion: motion({ entrance: mo.in('soft-scale', { duration: 0.6 }), exit: mo.in('soft-scale-out', { start: 1.5, duration: 0.4 }) }) }),
      T('mult', 'x4', { role: 'multiplier', name: 'After', size: 0.36, y: 0.5, style: ts('ornate-gold'), motion: motion({ entrance: mo.in('focus-in', { start: 1.85, duration: 0.8 }), idle: mo.in('slow-glow', { start: 2.8 }), exit: ex() }), shine: shine({ start: 2.8, duration: 0.9, repeat: 1 }) })],
    [F('flash', 'flash', 1.85, { cy: 0.5, size: 0.18 }), F('halo', 'light.halo', 1.85, { cy: 0.5, size: 0.4, duration: 1.8, tint: '#ffd870' }), F('shock', 'shockwave', 1.85, { cy: 0.5, strength: 0.35, distortion: 0.5, radius: 0.7, duration: 0.9 })], GB, [textIn('mult', 'Multiplier after')], ['sequence']);
  add('multiply-the-win', 'Multiply the win', 'An amount sits on screen; x5 slams in above it, a ring of light goes out, and the amount counts up to its multiplied figure.',
    [C('amount', { name: 'Amount', from: 100, to: 500, decimals: 2, size: 0.17, y: 0.64, style: ts('carved-gold'), roll: 'roll', countStart: 1.7, countDuration: 1.1, ease: 'easeOut', landPulse: 0.1, motion: motion({ entrance: mo.in('fade-in', { duration: 0.5 }), exit: ex() }), shine: shine({ start: 3, duration: 0.8, repeat: 1 }) }),
      T('mult', 'x5', { role: 'multiplier', name: 'Multiplier', size: 0.26, y: 0.36, style: ts('ornate-gold'), motion: motion({ entrance: mo.in('zoom-in', { start: 1.0, duration: 0.5 }), idle: mo.in('slow-glow', { start: 1.7 }), exit: ex() }) })],
    [F('slam', 'impact.slam', 1.3, { cy: 0.4, strength: 0.4 }), F('shock', 'shockwave', 1.3, { cy: 0.4, strength: 0.4, distortion: 0.5, radius: 0.7, duration: 0.9 }), F('flare', 'light.flare', 1.7, { cy: 0.64, size: 0.16 }), F('spark', 'light.sparkle', 2.7, { cy: 0.64, width: 0.7, height: 0.14, duration: 1.4, count: 12 })], GB, [counterIn('amount', 'Amount'), textIn('mult', 'Multiplier')], ['amount']);
  {
    const steps: [string, string, number][] = [['x2', 'slab-white', 0.0], ['x3', 'slab-white', 0.0], ['x5', 'slab-yellow', 0.0], ['x10', 'slab-yellow', 0.0]];
    const mk = (i: number, big: boolean) => look(makeGradient('linear', big ? [[0, '#3a1c04'], [0.5, '#3a1c04'], [0.5, '#6a3408'], [1, '#6a3408']] : [[0, '#0b3a1c'], [0.5, '#0b3a1c'], [0.5, '#16602e'], [1, '#16602e']], { angle: 58, repeat: 6 }), [[0.02, big ? '#ffd070' : '#8ae8a0'], [0.05, '#000000']], { bevel: false, slab: '#000000', depth: 0.05, shadow: i >= 0 });
    add('slab-ladder', 'Slab ladder', 'Four slabs in a row, x2, x3, x5, x10, light up one after another, each beat a small swell, the last in amber.',
      steps.flatMap(([txt, style], i) => {
        const big = i === 3, x = 0.2 + i * 0.2, st = mk(i, big);
        return [S(`s${i}`, 'slab', st, { name: `Plate ${i + 1}`, x, y: 0.5, width: 0.3, height: big ? 0.2 : 0.16, params: { chamfer: 0.22, slant: 0.2 }, motion: motion({ entrance: mo.in('drift-fade', { start: i * 0.25, duration: 0.5 }), emphasis: [mo.in('nudge', { start: 1.4 + i * 0.5, duration: 0.5, params: { size: big ? 0.1 : 0.07 } })], exit: ex() }) }),
          T(`m${i}`, txt, { role: 'multiplier', name: `Step ${i + 1}`, x, y: 0.5, size: big ? 0.14 : 0.11, style: ts(style), motion: motion({ entrance: mo.in('drift-fade', { start: i * 0.25 + 0.1, duration: 0.5 }), emphasis: [mo.in('glint-pass', { start: 1.4 + i * 0.5, duration: 0.5, unit: 'char' })], exit: ex() }) })];
      }), [F('flare', 'light.flare', 3.4, { cx: 0.8, cy: 0.5, size: 0.14, tint: '#ffe0a0' })], GB, [textIn('m0', 'Step 1'), textIn('m1', 'Step 2'), textIn('m2', 'Step 3'), textIn('m3', 'Step 4')], ['sequence']);
  }
  add('rise-away', 'Rise away', 'A multiplier pops up where it was earned, drifts upward and fades: the quick in-game confirmation.',
    [T('mult', 'x3', { role: 'multiplier', name: 'Multiplier', size: 0.2, y: 0.55, style: ts('carved-gold'), motion: motion({ entrance: mo.in('pop', { duration: 0.45 }), idle: mo.in('drift', { start: 0.6 }), exit: mo.in('drift-fade-out', { start: 1.6, duration: 0.9, params: { distance: 0.9, from: 'above' } }) }) })],
    [F('flash', 'flash', 0.15, { cy: 0.55, size: 0.1 }), F('spark', 'light.sparkle', 0.4, { cy: 0.55, width: 0.4, height: 0.3, duration: 1.6, count: 10 })], GB, [textIn('mult', 'Multiplier')], ['ingame']);
  return out;
}
