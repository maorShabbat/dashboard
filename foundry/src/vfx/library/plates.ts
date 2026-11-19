/** Win messages on plates modelled on the reference screenshots: a crimson crest, a steel shield, a violet plate and a striped slab. */
import type { Preset } from '../model/preset';
import { defaultShine, type SceneElement } from '../model/scene';
import type { Gradient } from '../style/gradient';
import { cloneStyle, type ShapeStyle } from '../style/textStyle';
import { C, F, S, T, counterIn, makeGradient, mo, motion, plate, preset, scene, shine, solid, textIn, ts } from './kit';

const CAT = 'messages' as const, GROUP = 'Plates like the references', OUT = 4.9;
const exit = (id = 'zoom-out'): ReturnType<typeof mo.in> => mo.in(id, { start: OUT, duration: 0.45 });
void defaultShine;

/** A shape style from an arbitrary face, a list of rings (outermost last) and a lit bevel. */
export function look(face: Gradient, rings: [number, string][], o: { bevel?: boolean; glow?: string; depth?: number; slab?: string; shadow?: boolean } = {}): ShapeStyle {
  const st = cloneStyle(ts('gold-chunky'));
  const s: ShapeStyle = {
    face, outlines: rings.map(([width, color], i) => ({ id: `o${i + 1}`, enabled: true, width, fill: solid(color), join: 'round' as const })),
    bevel: { enabled: o.bevel !== false, size: 0.08, depth: 0.7, angle: -65, light: '#ffffff', shade: rings[rings.length - 1]![1] },
    innerHighlight: { enabled: true, color: '#ffffff', alpha: 0.28, size: 0.05, angle: -90 },
    extrusion: { enabled: !!o.slab, depth: o.depth ?? 0.06, angle: 90, fill: solid(o.slab ?? '#000000'), shade: 0.4 },
    shadow: o.shadow === false ? { ...st.shadow, enabled: false } : { enabled: true, color: '#000000', alpha: 0.55, blur: 0.08, dx: 0, dy: 0.08 },
    glow: o.glow ? { enabled: true, fill: solid(o.glow), radius: 0.1, strength: 0.5, bloom: false } : { ...st.glow, enabled: false },
  };
  return s;
}
export const vert = (stops: [number, string][], extra: Parameters<typeof makeGradient>[2] = {}): Gradient => makeGradient('linear', stops, { angle: 90, ...extra });
const motionIn = (entrance: string, o: { start?: number; duration?: number } = {}) => motion({ entrance: mo.in(entrance, { duration: 0.6, ...o }), idle: mo.in('breathe', { start: 1.1, duration: 3 }), exit: exit() });

/** Title text on a plate with the usual slam-in and a travelling shine. */
const title = (id: string, text: string, style: string, size: number, y: number, entrance = 'zoom-in', tweak?: (s: ReturnType<typeof ts>) => void) =>
  T(id, text, { y, size, style: ts(style, tweak), motion: motion({ entrance: mo.in(entrance, { start: 0.25, duration: 0.55 }), exit: exit() }), shine: shine({ start: 1.2, duration: 0.9, repeat: 2, interval: 1.2, width: 0.2, intensity: 0.7 }) });
const amount = (to: number, style: string, y: number, size: number, o: { prefix?: string; decimals?: number } = {}) =>
  C('amount', { y, size, from: 0, to, decimals: o.decimals ?? 2, prefix: o.prefix ?? '', style: ts(style), roll: 'roll', countStart: 0.9, countDuration: 2.4, landPulse: 0.1, motion: motion({ entrance: mo.in('fade-in', { start: 0.8, duration: 0.4 }), exit: exit() }) });

export function plates(): Preset[] {
  const out: Preset[] = [];

  // ---- MAX WIN: crimson hanging banners either side of ornate gold lettering ----------------------------------------------
  const crest = (slug: string, name: string, desc: string, banner: ShapeStyle, gem: ShapeStyle, rod: ShapeStyle, titleStyle: string, digitStyle: string, ray: string, spark: string) => {
    const els: SceneElement[] = [
      S('bl', 'pennant', banner, { name: 'Banner left', x: 0.5 - 0.37, y: 0.43, width: 0.15, height: 0.56, params: { point: 0.9, sag: 0.05 }, motion: motion({ entrance: mo.in('slide-down', { start: 0.1, duration: 0.7 }), idle: mo.in('sway', { start: 1.2 }), exit: exit() }) }),
      S('br', 'pennant', banner, { name: 'Banner right', x: 0.5 + 0.37, y: 0.43, width: 0.15, height: 0.56, params: { point: 0.9, sag: 0.05 }, motion: motion({ entrance: mo.in('slide-down', { start: 0.2, duration: 0.7 }), idle: mo.in('sway', { start: 1.4 }), exit: exit() }) }),
      S('rl', 'bar', rod, { name: 'Rod left', x: 0.5 - 0.37, y: 0.43 - 0.28, width: 0.19, height: 0.026, motion: motionIn('fade-in', { start: 0.1, duration: 0.4 }) }),
      S('rr', 'bar', rod, { name: 'Rod right', x: 0.5 + 0.37, y: 0.43 - 0.28, width: 0.19, height: 0.026, motion: motionIn('fade-in', { start: 0.2, duration: 0.4 }) }),
      S('el', 'diamond', rod, { name: 'Emblem left', x: 0.5 - 0.37, y: 0.4, width: 0.055, height: 0.09, motion: motionIn('fade-in', { start: 0.5, duration: 0.5 }) }),
      S('er', 'diamond', rod, { name: 'Emblem right', x: 0.5 + 0.37, y: 0.4, width: 0.055, height: 0.09, motion: motionIn('fade-in', { start: 0.6, duration: 0.5 }) }),
      S('gem', 'diamond', gem, { name: 'Jewel', y: 0.26, width: 0.05, height: 0.075, motion: motionIn('pop', { start: 0.5 }) }),
      title('title', 'MAX WIN', titleStyle, 0.158, 0.43, 'zoom-in'),
      amount(66666, digitStyle, 0.62, 0.105),
    ];
    const fx = [F('rays', 'light.rays', 0.1, { duration: OUT + 0.2, tint: ray, length: 1.3, intensity: 0.55 }), F('flash', 'flash', 0.3, { cy: 0.43, size: 0.16 }), F('spark', 'light.sparkle', 1.2, { cy: 0.45, width: 1.1, height: 0.4, duration: 3, tint: spark, count: 26 })];
    return preset(CAT, slug, name, desc, scene(els, fx), { tags: ['message', 'celebration', 'reference', 'crest'], inputs: [textIn('title', 'Title'), counterIn('amount', 'Amount')], group: GROUP });
  };
  const goldRod = look(vert([[0, '#fff0b0'], [0.5, '#e8a830'], [1, '#8a5210']]), [[0.04, '#4a2206']], { slab: '#2a1204', depth: 0.03 });
  const steelRod = look(vert([[0, '#ffffff'], [0.5, '#a9b8ca'], [1, '#56667c']]), [[0.04, '#1a2434']], { slab: '#0a1018', depth: 0.03 });
  const crimsonBanner = look(vert([[0, '#b01a30'], [0.55, '#6a0818'], [1, '#2c0309']]), [[0.03, '#ffd070'], [0.05, '#150204']], { slab: '#14010a', depth: 0.035 });
  const ruby = look(vert([[0, '#ffb0b0'], [0.4, '#e01a34'], [1, '#6a0010']]), [[0.02, '#fff0c0'], [0.045, '#3a0010']], { glow: '#ff2a3a' });
  out.push(crest('max-win-crimson', 'Max win, crimson crest', 'Two crimson banners hang either side of ornate gold “MAX WIN” lettering with a ruby jewel, red light and an amount in gold figures counting up underneath.', crimsonBanner, ruby, goldRod, 'ornate-gold', 'ornate-digits', '#ff3a2a', '#ffc080'));
  const steelBanner = look(vert([[0, '#8a9cb4'], [0.55, '#46566c'], [1, '#1c2634']]), [[0.03, '#e8f0fa'], [0.05, '#060b14']], { slab: '#050a12', depth: 0.035 });
  const sapphire = look(vert([[0, '#c4e6ff'], [0.4, '#2a7cff'], [1, '#0a2a8a']]), [[0.02, '#f0f8ff'], [0.045, '#04184a']], { glow: '#3a8aff' });
  out.push(crest('max-win-platinum', 'Max win, platinum crest', 'The same crest in cold platinum with sapphire light.', steelBanner, sapphire, steelRod, 'ornate-silver', 'carved-silver', '#7ac0ff', '#d8ecff'));
  const emeraldBanner = look(vert([[0, '#14884a'], [0.55, '#0a5028'], [1, '#03240f']]), [[0.03, '#f4d06a'], [0.05, '#020e06']], { slab: '#020e06', depth: 0.035 });
  const emerald = look(vert([[0, '#d8ffd0'], [0.4, '#26c860'], [1, '#0a5a28']]), [[0.02, '#fff0c0'], [0.045, '#04301a']], { glow: '#3aff7a' });
  out.push(crest('max-win-emerald', 'Max win, emerald crest', 'The same crest in emerald and gold.', emeraldBanner, emerald, goldRod, 'ornate-emerald', 'carved-jade', '#5aff8a', '#d8ffd0'));

  // ---- BIG WIN: a steel shield with the word stacked in two lines and the amount underneath --------------------------------
  const shield = (slug: string, name: string, desc: string, edge: string, _glow: string, titleStyle: string, digitStyle: string, ray: string) => {
    const steel = look(makeGradient('reflected', [[0, '#ffffff'], [0.3, '#cfdae8'], [0.62, '#6f819b'], [1, '#2e3d52']], { angle: 90 }), [[0.025, edge], [0.05, '#05090f']], { slab: '#05090f', depth: 0.03 });
    const inner = look(vert([[0, '#1c2a3e'], [1, '#050a14']]), [[0.02, '#aebed4'], [0.03, '#02050a']], { bevel: false, shadow: false });
    const els: SceneElement[] = [
      S('shield', 'shield', steel, { name: 'Shield', y: 0.46, width: 0.6, height: 0.72, params: { fin: 0.11, notch: 0.07, taper: 0.55 }, motion: motionIn('elastic', { duration: 0.85 }) }),
      S('inner', 'shield', inner, { name: 'Shield inner', y: 0.475, width: 0.47, height: 0.585, params: { fin: 0.1, notch: 0.06, taper: 0.55 }, motion: motionIn('elastic', { duration: 0.85, start: 0.05 }) }),
      title('title', 'BIG\nWIN', titleStyle, 0.17, 0.465, 'zoom-in', (s) => { s.lineSpacing = 0.82; }),
      amount(1514160.2, digitStyle, 0.925, 0.075),
    ];
    const fx = [F('rays', 'light.rays', 0.1, { duration: OUT + 0.2, tint: ray, length: 1.2, intensity: 0.3 }), F('flash', 'flash', 0.25, { cy: 0.46, size: 0.18 }), F('shock', 'shockwave', 0.25, { cy: 0.46, strength: 0.35, distortion: 0.5, radius: 0.7, duration: 1 }), F('spark', 'light.sparkle', 1.2, { cy: 0.46, width: 0.6, height: 0.6, duration: 3, tint: '#d8ecff', count: 20 })];
    return preset(CAT, slug, name, desc, scene(els, fx), { tags: ['message', 'celebration', 'reference', 'shield'], inputs: [textIn('title', 'Title'), counterIn('amount', 'Amount')], group: GROUP });
  };
  out.push(shield('big-win-shield', 'Big win, steel shield', 'A steel shield with a dark face snaps in, the words BIG WIN stacked in white steel across it, a cold shock ring and the amount counting up underneath.', '#9aaec6', '#7aa8ff', 'steel-badge', 'carved-silver', '#8ab8ff'));
  out.push(shield('big-win-shield-red', 'Big win, red steel shield', 'The same shield with a red edge and warm light.', '#e8606e', '#ff4a5a', 'steel-badge-red', 'carved-gold', '#ff6a5a'));
  out.push(shield('big-win-shield-gold', 'Big win, gold steel shield', 'The same shield with a gold edge.', '#e8b64a', '#ffc84a', 'steel-badge-gold', 'carved-gold', '#ffd870'));

  // ---- MEGA WIN: a deep violet plate with pink metal lettering ------------------------------------------------------------
  const violet = (slug: string, name: string, desc: string, face: [string, string, string], line: string, titleStyle: string, ray: string, spark: string) => {
    const pl = look(vert([[0, face[0]], [0.5, face[1]], [1, face[2]]]), [[0.022, line], [0.04, '#0e0422']], { slab: '#0a0218', depth: 0.04 });
    const els: SceneElement[] = [
      S('plate', 'plate', pl, { name: 'Message background', y: 0.5, width: 0.98, height: 0.3, params: { radius: 0.32 }, motion: motionIn('pop', { duration: 0.7 }) }),
      title('title', 'MEGA WIN', titleStyle, 0.17, 0.5, 'zoom-in'),
    ];
    const fx = [F('rays', 'light.rays', 0.1, { duration: OUT + 0.2, tint: ray, length: 1.1, intensity: 0.45 }), F('flash', 'flash', 0.25, { cy: 0.5, size: 0.14 }), F('spark', 'light.sparkle', 1.1, { cy: 0.5, width: 0.95, height: 0.28, duration: 3, tint: spark, count: 22 }), F('confetti', 'celebrate.confetti', 0.4, { cy: 0.45, count: 70 })];
    return preset(CAT, slug, name, desc, scene(els, fx), { tags: ['message', 'celebration', 'reference', 'plate'], inputs: [textIn('title', 'Title')], group: GROUP });
  };
  out.push(violet('mega-win-violet', 'Mega win, violet plate', 'A deep violet plate with a glossy lilac edge pops in and “MEGA WIN” in pink metal lands on it with sparkles and confetti.', ['#7a2ad0', '#3a1280', '#1a0646'], '#e6b4ff', 'violet-metal', '#d070ff', '#ffd6f6'));
  out.push(violet('mega-win-ice', 'Mega win, ice plate', 'The same plate in deep blue with ice-metal lettering.', ['#2a6ad8', '#123a8a', '#061a4a'], '#b4e8ff', 'cyan-metal', '#5ac8ff', '#e0f6ff'));
  out.push(violet('mega-win-sun', 'Mega win, sun plate', 'The same plate in deep amber with sun-metal lettering.', ['#c8581a', '#7a2a0a', '#3a1204'], '#ffe8a0', 'gold-metal', '#ffb02a', '#fff0c0'));

  // ---- NICE WIN: a dark striped slab with heavy white slanted capitals ----------------------------------------------------
  const slab = (slug: string, name: string, desc: string, dark: string, mid: string, line: string, titleStyle: string, spark: string) => {
    const stripes = makeGradient('linear', [[0, dark], [0.5, dark], [0.5, mid], [1, mid]], { angle: 58, repeat: 14 });
    const sl = look(stripes, [[0.016, line], [0.045, '#000000']], { bevel: false, slab: '#000000', depth: 0.05 });
    const els: SceneElement[] = [
      S('slab', 'slab', sl, { name: 'Message background', y: 0.5, width: 0.92, height: 0.27, params: { chamfer: 0.2, slant: 0.2 }, motion: motion({ entrance: mo.in('slide-right', { duration: 0.5 }), idle: mo.in('breathe', { start: 1, duration: 3 }), exit: exit() }) }),
      title('title', 'NICE WIN', titleStyle, 0.2, 0.5, 'zoom-in'),
    ];
    const fx = [F('flash', 'flash', 0.2, { cy: 0.5, size: 0.12 }), F('spark', 'light.sparkle', 0.9, { cy: 0.5, width: 0.9, height: 0.25, duration: 2.6, tint: spark, count: 14 })];
    return preset(CAT, slug, name, desc, scene(els, fx), { tags: ['message', 'celebration', 'reference', 'slab'], inputs: [textIn('title', 'Title')], group: GROUP });
  };
  out.push(slab('nice-win-slab', 'Nice win, green slab', 'A dark green striped slab slides in and heavy slanted white capitals hit it, a quick flash and a few glints: the quiet tier of a win ladder.', '#0b3a1c', '#16602e', '#8ae8a0', 'slab-white', '#d8ffe0'));
  out.push(slab('nice-win-slab-blue', 'Nice win, blue slab', 'The same slab in navy stripes with ice-blue lettering.', '#0a2448', '#133e7a', '#8ac8ff', 'slab-cyan', '#e0f4ff'));
  out.push(slab('nice-win-slab-gold', 'Nice win, amber slab', 'The same slab in dark amber stripes with yellow lettering.', '#3a1c04', '#6a3408', '#ffd070', 'slab-yellow', '#fff0c0'));
  return out;
}
void plate;
