import type { Preset } from '../model/preset';
import { STYLE_PRESETS, type TextStyle } from '../style/textStyle';
import { F, T, mo, motion, preset, scene, shine, textIn, ts } from './kit';

const CAT = 'text-styling' as const;

interface Look { word: string; text?: string; desc: string; group: string; size?: number; lines?: number }
const GN = 'Fantasy gold, steel, metal and carved digits', G1 = 'Slot classics', G2 = 'Numbers and labels', G3 = 'Metal and stone', G4 = 'Light and neon', G5 = 'Elements and materials';

const LOOKS: Record<string, Look> = {
  'gold-chunky': { word: 'BIG WIN', group: G1, desc: 'Chunky gold with a bevelled face, double outline, extrusion and a glossy highlight.' },
  'gold-two-tone': { word: 'MAX WIN', group: G1, desc: 'Poster gold with a hard split: pale yellow above, deep orange below, a heavy brown outline and a black drop shadow.' },
  'candy-green': { word: 'BIG WIN', group: G1, desc: 'Glossy candy green: a bright top, a deep base, a white gloss rim, a dark double outline and a green halo.' },
  'title-pink': { word: 'MUSHROOM', group: G1, size: 0.17, desc: 'A fat pink game title: white keyline, purple outer outline and a deep violet extrusion.' },
  'wild-lime-gold': { word: 'WILD', group: G1, desc: 'Lime-to-leaf gradient with a brown and black double outline and a dark green slab: the classic wild label.' },
  'comic-boom': { word: 'BOOM!', group: G1, desc: 'Yellow comic lettering with a triple hard outline and a red extruded edge.' },
  'toy-block': { word: 'BLOCKS', group: G1, desc: 'Moulded red plastic: a shallow bevel, a dark outline and a thick slab beneath.' },
  'ruby': { word: 'RUBY', group: G1, desc: 'A red jewel face with a white keyline, a gloss rim and a red glow.' },
  'sapphire': { word: 'SAPPHIRE', group: G1, size: 0.17, desc: 'The same jewel in deep blue.' },
  'number-blue': { word: '2,450.00', group: G2, desc: 'Win-amount digits in glossy blue with a white keyline and a black double outline.' },
  'number-lime': { word: '8,611.00', group: G2, desc: 'The same digits in lime green.' },
  'number-violet': { word: '600.00', group: G2, desc: 'The same digits in violet.' },
  'clean-white': { word: 'CLEAN', group: G2, desc: 'Plain white condensed capitals with a soft shadow: the quiet option.' },
  'pixel-glass': { word: '2.00 X 16384', group: G2, size: 0.1, desc: 'A glassy blue pixel font with a split face, a white keyline and a dark slab.' },
  'pixel-arcade': { word: 'ARCADE', group: G2, size: 0.14, desc: 'Pixel font, banded sunset face, hard outline and a pixel-offset extrusion.' },
  'chrome-impact': { word: 'CHROME', group: G3, desc: 'Condensed chrome with a mirrored horizon, dark and light outlines and a shallow bevel.' },
  'bronze': { word: 'BRONZE', group: G3, size: 0.18, desc: 'Cast bronze: a mirrored warm-metal horizon, a dark outline and a bright edge.' },
  'steel-blue': { word: 'STEEL', group: G3, desc: 'Cold blued steel with a mirrored horizon and a white keyline.' },
  'viking-stone': { word: 'VALHALLA', group: G3, size: 0.17, desc: 'Carved stone: pale granite face, a deep bevel and a dark outline.' },
  'western-wood': { word: 'WESTERN', group: G3, desc: 'Poster lettering in sun-bleached wood tones with a burnt-edge outline and slab shadow.' },
  'elegant-cabaret': { word: 'Cabaret', group: G3, size: 0.24, desc: 'Fat-face serif in champagne gold with a fine dark outline and a warm glow.' },
  'royal-purple': { word: 'ROYAL', group: G3, desc: 'Violet face with a gold outline, a dark outer ring and a deep slab.' },
  'neon-sign': { word: 'NEON', group: G4, desc: 'A glowing neon tube: white-hot core, animated colour glow that feeds the bloom.' },
  'alien-plasma': { word: 'ALIEN', group: G4, desc: 'An animated plasma gradient in toxic green and violet with a radioactive glow.' },
  'sci-fi-hologram': { word: 'HOLOGRAM', group: G4, size: 0.17, desc: 'Futuristic capitals with a scrolling scan-line gradient and a cyan glow.' },
  'retro-sunset': { word: 'SUNSET', group: G4, size: 0.17, desc: 'Banded retro sunset in pink, magenta and violet with a white keyline and a magenta glow.' },
  'glass-aqua': { word: 'AQUA', group: G4, desc: 'See-through aqua glass: a translucent face, a white rim and a cyan halo.' },
  'rainbow-pop': { word: 'RAINBOW', group: G4, desc: 'A bubbly face with an animated rainbow running through it and a thick double outline.' },
  'fire-brand': { word: 'FIRE', group: G5, desc: 'Fire gradient with a hot inner highlight and an orange glow.' },
  'magma': { word: 'MAGMA', group: G5, desc: 'Dark cooled rock with a white-hot animated outline that glows like lava.' },
  'ice-crystal': { word: 'FROZEN', group: G5, desc: 'Ice gradient with a deep blue edge, light rim and a cold halo.' },
  'frost-white': { word: 'FROST', group: G5, desc: 'Frosted white with a pale blue keyline, a dark navy outline and a cold glow.' },
  'toxic-slime': { word: 'SLIME', group: G5, size: 0.18, desc: 'Dripping green slime with a glossy rim and a radioactive glow.' },
  'horror-blood': { word: 'HORROR', group: G5, desc: 'Dripping blood red with a dark outline and a menacing glow.' },
  'chocolate': { word: 'Choco', group: G5, size: 0.22, desc: 'Glossy dark chocolate with a cream rim and a heavy outline.' },
  'candy-bubble': { word: 'CANDY', group: G5, desc: 'Glossy pink candy with a white rim and a heavy highlight.' },
  'sticker-pink': { word: 'STICKER', group: G5, size: 0.17, desc: 'White letters with a pink, white and plum sticker border: three outlines and a soft shadow.' },
  'sticker-mint': { word: 'FRESH', group: G5, desc: 'A mint sticker: green keyline, white border and a deep green outer line.' },
  'ornate-gold': { word: 'MAX WIN', group: GN, size: 0.17, desc: 'Fantasy capitals in warm gold: a hard horizon, a heavy bevel, a thin dark line and a faint red glow, as on a crimson banner.' },
  'ornate-silver': { word: 'MAX WIN', group: GN, size: 0.17, desc: 'The same hand in cold platinum with a blue glow.' },
  'ornate-ruby': { word: 'MAX WIN', group: GN, size: 0.17, desc: 'The same hand in ruby red with a gold outline.' },
  'ornate-emerald': { word: 'MAX WIN', group: GN, size: 0.17, desc: 'The same hand in emerald with a gold outline.' },
  'ornate-sapphire': { word: 'MAX WIN', group: GN, size: 0.17, desc: 'The same hand in sapphire with a gold outline.' },
  'ornate-digits': { word: '66,666.00', group: GN, size: 0.17, desc: 'Lining figures in the same gold, for an amount under the title.' },
  'carved-gold': { word: '3600.00', group: GN, size: 0.2, desc: 'Heavy carved gold digits: a deep bevel lit from above, a dark recess line inside a thin gold edge.' },
  'carved-silver': { word: '3600.00', group: GN, size: 0.2, desc: 'The same carving in silver.' },
  'carved-jade': { word: '3600.00', group: GN, size: 0.2, desc: 'The same carving in jade.' },
  'slime-graffiti': { word: 'WILD', group: GN, size: 0.22, desc: 'A loose marker hand in slime green and teal with a deep green line, a wet glint and a toxic glow.' },
  'steel-badge': { word: 'BIG WIN', group: GN, size: 0.2, desc: 'Near-white steel with a cold reflection, a hard black line and a steel keyline, made for a dark badge.' },
  'steel-badge-red': { word: 'BIG WIN', group: GN, size: 0.2, desc: 'The steel badge lettering with a red edge.' },
  'steel-badge-gold': { word: 'BIG WIN', group: GN, size: 0.2, desc: 'The steel badge lettering with a gold edge.' },
  'violet-metal': { word: 'MEGA WIN', group: GN, size: 0.17, desc: 'Square-cut capitals in pink metal: white on top, hot pink below, a lilac line and a deep violet edge.' },
  'cyan-metal': { word: 'MEGA WIN', group: GN, size: 0.17, desc: 'The same cut in ice blue.' },
  'gold-metal': { word: 'MEGA WIN', group: GN, size: 0.17, desc: 'The same cut in sun gold.' },
  'slab-white': { word: 'NICE WIN', group: GN, size: 0.22, desc: 'Heavy slanted white capitals with a thick black line and a black slab, for a dark striped plate.' },
  'slab-yellow': { word: 'NICE WIN', group: GN, size: 0.22, desc: 'The same slab letters in yellow.' },
  'slab-cyan': { word: 'NICE WIN', group: GN, size: 0.22, desc: 'The same slab letters in ice blue.' },
};

/** The same looks in other, similar fonts: the closest matches to the reference game typography. */
interface Variant { slug: string; name: string; style: string; font: { id: string; weight: number; style: 'normal' | 'italic' }; word: string; desc: string; size?: number; spacing?: number }
const GR = 'Like the reference screenshots';
const VARIANTS: Variant[] = [
  { slug: 'big-win-carter', name: 'Big win · Carter One', style: 'candy-green', font: { id: 'carter-one', weight: 400, style: 'normal' }, word: 'BIG WIN', size: 0.22, desc: 'Glossy green on a slanted, heavy rounded face: the closest match to the green “BIG WIN” reference.' },
  { slug: 'big-win-sigmar', name: 'Big win · Sigmar One', style: 'candy-green', font: { id: 'sigmar-one', weight: 400, style: 'normal' }, word: 'BIG WIN', size: 0.19, desc: 'The same green look on a wider, upright heavy face.' },
  { slug: 'big-win-luckiest', name: 'Big win · Luckiest Guy', style: 'candy-green', font: { id: 'luckiest-guy', weight: 400, style: 'normal' }, word: 'BIG WIN', size: 0.22, desc: 'The same green look on a bouncy comic face.' },
  { slug: 'max-win-lilita', name: 'Max win · Lilita One', style: 'gold-two-tone', font: { id: 'lilita-one', weight: 400, style: 'normal' }, word: 'MAX WIN', desc: 'Two-tone gold with a wavy split on a tight, heavy rounded face: the closest match to the gold “MAX WIN” reference.' },
  { slug: 'max-win-titan', name: 'Max win · Titan One', style: 'gold-two-tone', font: { id: 'titan-one', weight: 400, style: 'normal' }, word: 'MAX WIN', desc: 'The same gold on a rounder, fatter face.' },
  { slug: 'max-win-bowlby', name: 'Max win · Bowlby One', style: 'gold-two-tone', font: { id: 'bowlby-one', weight: 400, style: 'normal' }, word: 'MAX WIN', size: 0.18, desc: 'The same gold on a blocky, wide face.' },
  { slug: 'max-win-sigmar', name: 'Max win · Sigmar One', style: 'gold-two-tone', font: { id: 'sigmar-one', weight: 400, style: 'normal' }, word: 'MAX WIN', size: 0.17, desc: 'The same gold on a wide, soft-cornered face.' },
  { slug: 'amount-gold-lilita', name: 'Win amount · Lilita One', style: 'gold-two-tone', font: { id: 'lilita-one', weight: 400, style: 'normal' }, word: '8,611.00', size: 0.24, spacing: -0.03, desc: 'Big gold digits in the same two-tone look: the “8,611.00” reference.' },
  { slug: 'amount-gold-titan', name: 'Win amount · Titan One', style: 'gold-two-tone', font: { id: 'titan-one', weight: 400, style: 'normal' }, word: '8,611.00', size: 0.22, spacing: -0.03, desc: 'The same digits on a rounder face.' },
  { slug: 'amount-gold-paytone', name: 'Win amount · Paytone One', style: 'gold-two-tone', font: { id: 'paytone-one', weight: 400, style: 'normal' }, word: '8,611.00', size: 0.23, spacing: -0.02, desc: 'The same digits on a friendly, slightly narrower face.' },
];

/** Looks that add an effect on the letters themselves: flames, icicles, electricity, glitter. */
const GE = 'Effects on the letters';
interface FxLook { slug: string; name: string; style: string; word: string; size?: number; effect: string; params?: Record<string, number | string | boolean>; desc: string; tweak?: (s: TextStyle) => void }
/** The fire styles' own halo is a tight rounded block; with real flames and a hot rim it only needs to be a faint warmth. */
const softGlow = (radius: number, strength: number) => (s: TextStyle): void => { s.glow = { ...s.glow, radius, strength }; };
const FX_LOOKS: FxLook[] = [
  { slug: 'letters-on-fire', name: 'Letters on fire', style: 'fire-brand', word: 'BURN', effect: 'text.fire', tweak: softGlow(0.12, 0.55), desc: 'Fire-gradient letters with real flames licking up off them, embers and smoke.' },
  { slug: 'flaming-gold', name: 'Flaming gold', style: 'gold-two-tone', word: 'MAX WIN', size: 0.19, effect: 'text.fire', params: { flames: 16 }, desc: 'The gold two-tone win label with a wall of flames behind its top edge.' },
  { slug: 'blue-fire-letters', name: 'Blue fire', style: 'sapphire', word: 'COLD FIRE', size: 0.15, effect: 'text.fire', params: { fire: 'blue' }, desc: 'Deep blue jewel letters with cold blue flames.' },
  { slug: 'toxic-fire-letters', name: 'Toxic fire', style: 'candy-green', word: 'TOXIC', effect: 'text.fire', params: { fire: 'green' }, desc: 'Glossy green letters burning with green fire.' },
  { slug: 'violet-fire-letters', name: 'Violet fire', style: 'royal-purple', word: 'MAGIC', effect: 'text.fire', params: { fire: 'violet' }, desc: 'Royal purple letters wreathed in violet flames.' },
  { slug: 'frozen-letters', name: 'Frozen letters', style: 'frost-white', word: 'FROZEN', effect: 'text.ice', desc: 'Frosted letters with icicles growing under them, frost glints and drifting cold mist.' },
  { slug: 'icy-blue-letters', name: 'Icy blue', style: 'ice-crystal', word: 'ICE', effect: 'text.ice', params: { icicles: 10 }, desc: 'Crystal-blue letters hung with icicles.' },
  { slug: 'electric-letters', name: 'Electric letters', style: 'steel-blue', word: 'SHOCK', effect: 'text.electric', desc: 'Blued steel letters with arcs of electricity crawling over them.' },
  { slug: 'violet-voltage', name: 'Violet voltage', style: 'chrome-impact', word: 'VOLT', effect: 'text.electric', params: { tint: '#c8a0ff', arcs: 10 }, desc: 'Chrome letters crackling with violet arcs.' },
  { slug: 'glittering-gold', name: 'Glittering gold', style: 'gold-chunky', word: 'GLITTER', size: 0.19, effect: 'light.sparkle', params: { count: 36, size: 0.06, duration: 3.2 }, desc: 'Chunky gold letters covered in twinkling four-point glints.' },
];

export function textStyling(): Preset[] {
  const fxLooks = FX_LOOKS.map((v): Preset => {
    const title = T('title', v.word, { size: v.size ?? 0.2, style: ts(v.style, v.tweak), motion: motion({ entrance: mo.in('pop', { duration: 0.55 }), idle: mo.in('breathe', { start: 0.8 }) }) });
    return preset(CAT, v.slug, v.name, v.desc, scene([title], [F('fx', v.effect, 0.6, v.params ?? {}, { target: 'title' })], { duration: 4.6 }), { tags: ['text', 'effect', v.effect.split('.')[1]!], inputs: [textIn('title', 'Text')], group: GE });
  });
  const variants = VARIANTS.map((v): Preset => {
    const title = T('title', v.word, {
      size: v.size ?? 0.2, style: ts(v.style, (st) => { st.font = { ...v.font }; if (v.spacing !== undefined) st.letterSpacing = v.spacing; }),
      motion: motion({ entrance: mo.in('pop', { duration: 0.55 }), idle: mo.in('breathe', { start: 0.8 }) }),
      shine: shine({ start: 0.9, duration: 0.9, repeat: 2, interval: 1.0, width: 0.2, intensity: 0.8 }),
    });
    return preset(CAT, v.slug, v.name, v.desc, scene([title], [], { duration: 4.6 }), { tags: ['text', 'style', 'reference', v.font.id], inputs: [textIn('title', 'Text')], group: GR });
  });
  const base = STYLE_PRESETS.map((sp) => {
    const look = LOOKS[sp.id] ?? { word: 'STYLE', group: G1, desc: '' };
    const flick = sp.id === 'neon-sign';
    const title = T('title', look.word, {
      size: look.size ?? 0.2, style: ts(sp.id),
      motion: motion({ entrance: mo.in('pop', { duration: 0.55 }), idle: flick ? mo.in('flicker', { start: 1 }) : mo.in('breathe', { start: 0.8 }) }),
      shine: sp.id === 'clean-white' ? undefined : shine({ start: 0.9, duration: 0.9, repeat: 2, interval: 1.0, width: 0.2, intensity: 0.8 }),
    });
    return preset(CAT, sp.id, sp.name, look.desc, scene([title], [], { duration: 4.6 }), { tags: ['text', 'style', sp.style.font.id], inputs: [textIn('title', 'Text')], group: look.group });
  });
  return [...variants, ...base, ...fxLooks];
}
