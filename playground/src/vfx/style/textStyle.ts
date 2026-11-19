/**
 * The style stack: everything that decides how a shape (a glyph, a frame, an icon silhouette) LOOKS, completely separate from how
 * it MOVES. Lengths are in em (multiples of the element's font size / reference size) so a style scales with the element.
 *
 * Draw order, back to front: shadow, glow, extrusion, outlines (outermost first), face, inner highlight, bevel light, bevel shade.
 */
import { DEFAULT_FONT, type FontSpec } from '../fonts/catalog';
import { cloneGradient, gradientHash, gradientPreset, makeGradient, solid, type Gradient } from './gradient';

export type JoinStyle = 'round' | 'miter' | 'bevel';
export type TextAlign = 'left' | 'center' | 'right';

export interface OutlineSpec { id: string; enabled: boolean; /** Thickness of this ring, em (added to the rings inside it). */ width: number; fill: Gradient; join: JoinStyle }
export interface BevelSpec { enabled: boolean; /** Edge width, em. */ size: number; /** Strength 0..1. */ depth: number; /** Direction the light comes from, degrees (-90 = above). */ angle: number; light: string; shade: string }
export interface InnerHighlightSpec { enabled: boolean; color: string; alpha: number; /** Rim width, em. */ size: number; angle: number }
export interface ExtrusionSpec { enabled: boolean; /** Depth, em. */ depth: number; /** Direction of the slab, degrees (90 = down). */ angle: number; fill: Gradient; /** 0..1: how much the slab darkens with depth. */ shade: number }
export interface ShadowSpec { enabled: boolean; color: string; alpha: number; blur: number; dx: number; dy: number }
export interface GlowSpec { enabled: boolean; fill: Gradient; /** Reach, em. */ radius: number; /** 0..2: brightness of the halo. */ strength: number; /** Also feeds the bloom pass so the halo really emits light. */ bloom: boolean }

export interface TextStyle {
  font: FontSpec;
  /** em, added after every glyph. */
  letterSpacing: number;
  /** Multiplier of the natural line height. */
  lineSpacing: number;
  align: TextAlign;
  uppercase: boolean;
  face: Gradient;
  outlines: OutlineSpec[];
  bevel: BevelSpec;
  innerHighlight: InnerHighlightSpec;
  extrusion: ExtrusionSpec;
  shadow: ShadowSpec;
  glow: GlowSpec;
}

/** The same stack without the typography, for shapes that are not text (frames, icon silhouettes). */
export type ShapeStyle = Omit<TextStyle, 'font' | 'letterSpacing' | 'lineSpacing' | 'align' | 'uppercase'>;

export const MAX_OUTLINES = 4;

export function defaultStyle(): TextStyle {
  return {
    font: { ...DEFAULT_FONT }, letterSpacing: 0.01, lineSpacing: 1, align: 'center', uppercase: false,
    face: gradientPreset('gold'),
    outlines: [{ id: 'o1', enabled: true, width: 0.07, fill: solid('#4a1d00'), join: 'round' }],
    bevel: { enabled: false, size: 0.05, depth: 0.6, angle: -60, light: '#ffffff', shade: '#3a1a00' },
    innerHighlight: { enabled: false, color: '#ffffff', alpha: 0.6, size: 0.04, angle: -90 },
    extrusion: { enabled: false, depth: 0.08, angle: 90, fill: solid('#6b2f00'), shade: 0.5 },
    shadow: { enabled: true, color: '#000000', alpha: 0.55, blur: 0.06, dx: 0, dy: 0.06 },
    glow: { enabled: false, fill: solid('#ffb400'), radius: 0.18, strength: 1, bloom: true },
  };
}

/** What an image gets when you switch on "outline / glow / shadow": a clean white outline and a soft shadow. */
export function defaultImageOutline(): ShapeStyle {
  const d = defaultStyle();
  return {
    face: solid('#ffffff'), outlines: [{ id: 'o1', enabled: true, width: 0.035, fill: solid('#ffffff'), join: 'round' }],
    bevel: { ...d.bevel, enabled: false }, innerHighlight: { ...d.innerHighlight, enabled: false }, extrusion: { ...d.extrusion, enabled: false },
    shadow: { enabled: true, color: '#000000', alpha: 0.5, blur: 0.04, dx: 0, dy: 0.04 }, glow: { ...d.glow, enabled: false },
  };
}

export function cloneStyle(s: TextStyle): TextStyle {
  return {
    ...s, font: { ...s.font }, face: cloneGradient(s.face),
    outlines: s.outlines.map((o) => ({ ...o, fill: cloneGradient(o.fill) })),
    bevel: { ...s.bevel }, innerHighlight: { ...s.innerHighlight },
    extrusion: { ...s.extrusion, fill: cloneGradient(s.extrusion.fill) }, shadow: { ...s.shadow }, glow: { ...s.glow, fill: cloneGradient(s.glow.fill) },
  };
}

/** Total thickness (em) from the face to the outer edge of the outer-most enabled outline. */
export const outlineReach = (s: ShapeStyle): number => s.outlines.filter((o) => o.enabled).reduce((a, o) => a + Math.max(0, o.width), 0);

/** Padding (em) a raster cell needs around the shape so no effect is clipped. */
export function stylePadding(s: ShapeStyle): number {
  const reach = outlineReach(s);
  const ext = s.extrusion.enabled ? s.extrusion.depth : 0;
  const glow = s.glow.enabled ? s.glow.radius * 1.9 : 0;
  const sh = s.shadow.enabled ? s.shadow.blur * 2.2 + Math.max(Math.abs(s.shadow.dx), Math.abs(s.shadow.dy)) : 0;
  return reach + Math.max(ext, glow, sh) + 0.02;
}

export function styleHash(s: ShapeStyle | TextStyle): string {
  const t = s as TextStyle;
  const parts = [
    'font' in s ? `${t.font.id}/${t.font.weight}/${t.font.style}/${t.letterSpacing}/${t.lineSpacing}/${t.align}/${t.uppercase ? 1 : 0}` : '',
    gradientHash(s.face),
    s.outlines.map((o) => `${o.enabled ? 1 : 0}${o.width}${o.join}${gradientHash(o.fill)}`).join(';'),
    `${s.bevel.enabled ? 1 : 0},${s.bevel.size},${s.bevel.depth},${s.bevel.angle},${s.bevel.light},${s.bevel.shade}`,
    `${s.innerHighlight.enabled ? 1 : 0},${s.innerHighlight.color},${s.innerHighlight.alpha},${s.innerHighlight.size},${s.innerHighlight.angle}`,
    `${s.extrusion.enabled ? 1 : 0},${s.extrusion.depth},${s.extrusion.angle},${s.extrusion.shade},${gradientHash(s.extrusion.fill)}`,
    `${s.shadow.enabled ? 1 : 0},${s.shadow.color},${s.shadow.alpha},${s.shadow.blur},${s.shadow.dx},${s.shadow.dy}`,
    `${s.glow.enabled ? 1 : 0},${gradientHash(s.glow.fill)},${s.glow.radius},${s.glow.strength},${s.glow.bloom ? 1 : 0}`,
  ];
  return parts.join('|');
}

/**
 * Hash of what the RASTER depends on: everything except the gradient fills (those are evaluated on the GPU every frame, so editing a
 * colour, a stop or an animation never re-rasterises). Shapes of the layers (outline widths, bevel, ...) do.
 */
export function rasterHash(s: ShapeStyle | TextStyle): string {
  const t = s as TextStyle;
  return [
    'font' in s ? `${t.font.id}/${t.font.weight}/${t.font.style}/${t.uppercase ? 1 : 0}` : '',
    s.outlines.filter((o) => o.enabled).map((o) => `${o.width}${o.join}`).join(';'),
    s.bevel.enabled ? `b${s.bevel.size},${s.bevel.depth},${s.bevel.angle}` : '',
    s.innerHighlight.enabled ? `i${s.innerHighlight.size},${s.innerHighlight.angle},${s.innerHighlight.alpha}` : '',
    s.extrusion.enabled ? `x${s.extrusion.depth},${s.extrusion.angle},${s.extrusion.shade}` : '',
    s.shadow.enabled ? `s${s.shadow.blur},${s.shadow.dx},${s.shadow.dy}` : '',
    s.glow.enabled ? `g${s.glow.radius},${s.glow.strength}` : '',
  ].join('|');
}

// ---------------------------------------------------------------------------------------------------------------------
// Style presets (Text styling category and the starting points for every text element)

export interface StylePreset { id: string; name: string; style: TextStyle }

const base = (font: FontSpec, over: Partial<TextStyle>): TextStyle => ({ ...defaultStyle(), font, ...over });
const outline = (id: string, width: number, color: string | Gradient, join: JoinStyle = 'round'): OutlineSpec => ({ id, enabled: true, width, fill: typeof color === 'string' ? solid(color) : color, join });
const noShadow = (s: ShadowSpec = defaultStyle().shadow): ShadowSpec => ({ ...s, enabled: false });
const noGlow = (g: GlowSpec = defaultStyle().glow): GlowSpec => ({ ...g, enabled: false });

export function buildStylePresets(): StylePreset[] {
  const d = defaultStyle();
  const list: StylePreset[] = [];
  const add = (id: string, name: string, style: TextStyle) => list.push({ id, name, style });

  add('gold-chunky', 'Gold chunky', base({ id: 'lilita-one', weight: 400, style: 'normal' }, {
    face: gradientPreset('gold'), outlines: [outline('o1', 0.045, '#8a4a00'), outline('o2', 0.06, '#3b1500')],
    bevel: { enabled: true, size: 0.05, depth: 0.7, angle: -60, light: '#fffbe0', shade: '#7a3c00' },
    innerHighlight: { enabled: true, color: '#ffffff', alpha: 0.55, size: 0.035, angle: -90 },
    extrusion: { enabled: true, depth: 0.075, angle: 90, fill: solid('#6b2f00'), shade: 0.55 },
    shadow: { enabled: true, color: '#000000', alpha: 0.5, blur: 0.05, dx: 0, dy: 0.1 },
  }));
  add('chrome-impact', 'Chrome impact', base({ id: 'anton', weight: 400, style: 'normal' }, {
    letterSpacing: 0.045,
    face: gradientPreset('chrome'), outlines: [outline('o1', 0.03, '#0b1626'), outline('o2', 0.035, '#ffffff')],
    bevel: { enabled: true, size: 0.04, depth: 0.5, angle: -70, light: '#ffffff', shade: '#102030' },
    shadow: { enabled: true, color: '#000a1a', alpha: 0.6, blur: 0.05, dx: 0.02, dy: 0.07 },
  }));
  add('neon-sign', 'Neon sign', base({ id: 'audiowide', weight: 400, style: 'normal' }, {
    face: solid('#fff3ff'), outlines: [outline('o1', 0.03, makeGradient('linear', [[0, '#00f0ff'], [1, '#ff2bd6']], { angle: 0 }))],
    glow: { enabled: true, fill: makeGradient('linear', [[0, '#00f0ff'], [1, '#ff2bd6']], { angle: 0, reflect: true, anim: { enabled: true, speed: 0.25, direction: 'forward', loop: 'loop' } }), radius: 0.3, strength: 1.4, bloom: true },
    shadow: noShadow(),
  }));
  add('rainbow-pop', 'Rainbow pop', base({ id: 'titan-one', weight: 400, style: 'normal' }, {
    face: gradientPreset('rainbow'), outlines: [outline('o1', 0.06, '#ffffff'), outline('o2', 0.05, '#2b1a5c')],
    innerHighlight: { enabled: true, color: '#ffffff', alpha: 0.5, size: 0.03, angle: -90 },
    shadow: { enabled: true, color: '#1a0a40', alpha: 0.5, blur: 0.04, dx: 0, dy: 0.08 },
  }));
  add('fire-brand', 'Fire brand', base({ id: 'bowlby-one', weight: 400, style: 'normal' }, {
    face: gradientPreset('fire'), outlines: [outline('o1', 0.04, '#4a0600')],
    glow: { enabled: true, fill: solid('#ff5a00'), radius: 0.28, strength: 1.2, bloom: true },
    innerHighlight: { enabled: true, color: '#fff2b0', alpha: 0.5, size: 0.035, angle: 90 },
    shadow: noShadow(),
  }));
  add('ice-crystal', 'Ice crystal', base({ id: 'chango', weight: 400, style: 'normal' }, {
    face: gradientPreset('ice'), outlines: [outline('o1', 0.04, '#0d3a8a'), outline('o2', 0.03, '#e8fbff')],
    bevel: { enabled: true, size: 0.05, depth: 0.6, angle: -60, light: '#ffffff', shade: '#1f4fb0' },
    glow: { enabled: true, fill: solid('#7fdcff'), radius: 0.22, strength: 0.9, bloom: true },
    shadow: { enabled: true, color: '#06204a', alpha: 0.5, blur: 0.04, dx: 0, dy: 0.06 },
  }));
  add('alien-plasma', 'Alien plasma', base({ id: 'zen-dots', weight: 400, style: 'normal' }, {
    face: gradientPreset('alien'), outlines: [outline('o1', 0.035, '#12002e')],
    glow: { enabled: true, fill: solid('#9dff00'), radius: 0.26, strength: 1.1, bloom: true }, shadow: noShadow(),
  }));
  add('candy-bubble', 'Candy bubble', base({ id: 'modak', weight: 400, style: 'normal' }, {
    face: makeGradient('linear', [[0, '#ffd0ef'], [0.5, '#ff5cb8'], [1, '#d6107f']], { angle: 90 }),
    outlines: [outline('o1', 0.05, '#ffffff'), outline('o2', 0.05, '#a1005c')],
    innerHighlight: { enabled: true, color: '#ffffff', alpha: 0.75, size: 0.05, angle: -90 },
    shadow: { enabled: true, color: '#5a0033', alpha: 0.45, blur: 0.05, dx: 0, dy: 0.08 },
  }));
  add('comic-boom', 'Comic boom', base({ id: 'bangers', weight: 400, style: 'normal' }, {
    face: makeGradient('linear', [[0, '#fff25a'], [1, '#ffb400']], { angle: 90 }),
    outlines: [outline('o1', 0.06, '#000000', 'miter'), outline('o2', 0.05, '#ffffff', 'miter'), outline('o3', 0.045, '#000000', 'miter')],
    extrusion: { enabled: true, depth: 0.06, angle: 45, fill: solid('#d2280a'), shade: 0.2 },
    shadow: noShadow(),
  }));
  add('pixel-arcade', 'Pixel arcade', base({ id: 'press-start-2p', weight: 400, style: 'normal' }, {
    face: makeGradient('linear', [[0, '#ffffff'], [0.5, '#ffe14a'], [0.5, '#ff9a1a'], [1, '#ff4a1a']], { angle: 90 }),
    outlines: [outline('o1', 0.08, '#2a0a5c', 'miter')], extrusion: { enabled: true, depth: 0.1, angle: 45, fill: solid('#14003a'), shade: 0 },
    shadow: noShadow(), letterSpacing: 0.04,
  }));
  add('viking-stone', 'Viking stone', base({ id: 'uncial-antiqua', weight: 400, style: 'normal' }, {
    face: makeGradient('linear', [[0, '#e8e2d2'], [0.5, '#a69f8b'], [1, '#6c675a']], { angle: 90 }),
    outlines: [outline('o1', 0.04, '#2a2620')],
    bevel: { enabled: true, size: 0.06, depth: 0.9, angle: -50, light: '#fffbe8', shade: '#1a1712' },
    shadow: { enabled: true, color: '#000000', alpha: 0.6, blur: 0.04, dx: 0.02, dy: 0.08 },
  }));
  add('horror-blood', 'Horror blood', base({ id: 'creepster', weight: 400, style: 'normal' }, {
    face: makeGradient('linear', [[0, '#ff4a3a'], [0.5, '#b00000'], [1, '#4a0000']], { angle: 90 }),
    outlines: [outline('o1', 0.04, '#0a0000')],
    innerHighlight: { enabled: true, color: '#ff9a8a', alpha: 0.5, size: 0.03, angle: -90 },
    glow: { enabled: true, fill: solid('#ff0000'), radius: 0.2, strength: 0.7, bloom: true },
    shadow: { enabled: true, color: '#000000', alpha: 0.7, blur: 0.05, dx: 0, dy: 0.06 },
  }));
  add('western-wood', 'Western wood', base({ id: 'rye', weight: 400, style: 'normal' }, {
    face: makeGradient('linear', [[0, '#f4d9a0'], [0.5, '#d9a35a'], [1, '#a8672a']], { angle: 90 }),
    outlines: [outline('o1', 0.045, '#3b1d08')], extrusion: { enabled: true, depth: 0.05, angle: 90, fill: solid('#4a2208'), shade: 0.4 },
    shadow: { enabled: true, color: '#000000', alpha: 0.5, blur: 0.04, dx: 0.02, dy: 0.06 },
  }));
  add('elegant-cabaret', 'Elegant cabaret', base({ id: 'abril-fatface', weight: 400, style: 'normal' }, {
    letterSpacing: 0.035,
    face: makeGradient('linear', [[0, '#fff4d0'], [0.45, '#e9c46a'], [1, '#a8741a']], { angle: 90 }),
    outlines: [outline('o1', 0.02, '#2a0f1a')],
    glow: { enabled: true, fill: solid('#ffcf70'), radius: 0.16, strength: 0.7, bloom: true },
    shadow: { enabled: true, color: '#1a0008', alpha: 0.5, blur: 0.05, dx: 0, dy: 0.05 },
  }));
  add('sci-fi-hologram', 'Sci-fi hologram', base({ id: 'orbitron', weight: 700, style: 'normal' }, {
    face: makeGradient('linear', [[0, '#c8fbff'], [0.5, '#46e0ff'], [1, '#0a8cff']], { angle: 90, repeat: 6, anim: { enabled: true, speed: 0.6, direction: 'forward', loop: 'loop' }, reflect: true }),
    outlines: [outline('o1', 0.02, '#00131f')], glow: { enabled: true, fill: solid('#2ad4ff'), radius: 0.2, strength: 1, bloom: true }, shadow: noShadow(),
  }));
  add('clean-white', 'Clean white', base({ id: 'bebas-neue', weight: 400, style: 'normal' }, {
    face: solid('#ffffff'), outlines: [], shadow: { enabled: true, color: '#000000', alpha: 0.55, blur: 0.06, dx: 0, dy: 0.05 }, letterSpacing: 0.03,
  }));

  // ---- looks modelled on slot-game typography ------------------------------------------------------------------------
  const hi = (alpha = 0.6, size = 0.04, color = '#ffffff') => ({ enabled: true, color, alpha, size, angle: -90 });
  const drop = (color = '#000000', alpha = 0.55, dy = 0.08, blur = 0.04): ShadowSpec => ({ enabled: true, color, alpha, blur, dx: 0, dy });

  add('candy-green', 'Candy green', base({ id: 'carter-one', weight: 400, style: 'normal' }, {
    letterSpacing: 0.005,
    face: makeGradient('linear', [[0, '#f6ff86'], [0.3, '#a6f545'], [0.5, '#44dc30'], [0.5, '#26bd2c'], [0.78, '#13a02e'], [1, '#08792a']], { angle: 90, wave: { amount: 0.03, count: 1.4, phase: 0.2, speed: 0 } }),
    outlines: [outline('o1', 0.016, '#0c6a22'), outline('o2', 0.068, '#020c05')],
    bevel: { enabled: true, size: 0.035, depth: 0.55, angle: -60, light: '#f8ffd8', shade: '#0a5a1c' },
    innerHighlight: hi(0.6, 0.05), extrusion: { enabled: true, depth: 0.045, angle: 90, fill: solid('#04230d'), shade: 0.5 },
    glow: { enabled: true, fill: solid('#4dff66'), radius: 0.1, strength: 0.25, bloom: true }, shadow: drop('#000000', 0.6, 0.11, 0.03),
  }));
  add('gold-two-tone', 'Gold two-tone', base({ id: 'lilita-one', weight: 400, style: 'normal' }, {
    letterSpacing: -0.02,
    face: makeGradient('linear', [[0, '#fffbd2'], [0.22, '#ffee66'], [0.5, '#ffd83c'], [0.5, '#ffbe22'], [0.76, '#ffa512'], [1, '#ee8200']], { angle: 90, wave: { amount: 0.04, count: 1.6, phase: 0.1, speed: 0 } }),
    outlines: [outline('o1', 0.022, '#7a3a00'), outline('o2', 0.066, '#1c0d00')],
    innerHighlight: hi(0.35, 0.03), extrusion: { enabled: true, depth: 0.05, angle: 90, fill: solid('#6a3200'), shade: 0.45 },
    shadow: { enabled: true, color: '#000000', alpha: 0.6, blur: 0.03, dx: 0.02, dy: 0.1 },
  }));
  add('title-pink', 'Pink title', base({ id: 'rammetto-one', weight: 400, style: 'normal' }, {
    face: makeGradient('linear', [[0, '#ffc2f8'], [0.45, '#ff48dc'], [1, '#b0139a']], { angle: 90 }),
    outlines: [outline('o1', 0.03, '#ffffff'), outline('o2', 0.05, '#3a0a63')],
    bevel: { enabled: true, size: 0.04, depth: 0.5, angle: -70, light: '#ffffff', shade: '#6a0a6a' },
    innerHighlight: hi(0.55, 0.04), extrusion: { enabled: true, depth: 0.09, angle: 90, fill: makeGradient('linear', [[0, '#7a22b8'], [1, '#2a0a58']], { angle: 90 }), shade: 0.3 },
    shadow: drop('#12002e', 0.5, 0.14, 0.05),
  }));
  add('pixel-glass', 'Pixel glass', base({ id: 'silkscreen', weight: 700, style: 'normal' }, {
    letterSpacing: 0.04,
    face: makeGradient('linear', [[0, '#d4fbff'], [0.48, '#46c0ff'], [0.5, '#1a7ef0'], [1, '#0a3fb0']], { angle: 90 }),
    outlines: [outline('o1', 0.03, '#ffffff', 'miter'), outline('o2', 0.07, '#04204a', 'miter')],
    innerHighlight: hi(0.45, 0.05), extrusion: { enabled: true, depth: 0.08, angle: 90, fill: solid('#021030'), shade: 0.2 },
    glow: { enabled: true, fill: solid('#35b6ff'), radius: 0.15, strength: 0.7, bloom: true }, shadow: noShadow(),
  }));
  const number = (id: string, name: string, c: [string, string, string], dark: string) => add(id, name, base({ id: 'luckiest-guy', weight: 400, style: 'normal' }, {
    letterSpacing: 0.02,
    face: makeGradient('linear', [[0, c[0]], [0.5, c[1]], [1, c[2]]], { angle: 90 }),
    outlines: [outline('o1', 0.02, '#ffffff'), outline('o2', 0.06, dark), outline('o3', 0.03, '#000000')],
    innerHighlight: hi(0.4, 0.04), shadow: drop('#000000', 0.45, 0.06, 0.03),
  }));
  number('number-blue', 'Number blue', ['#a8f2ff', '#2fb2ff', '#1260e0'], '#0a2a6a');
  number('number-lime', 'Number lime', ['#f2ff8a', '#8fe030', '#3a9a14'], '#1a4a08');
  number('number-violet', 'Number violet', ['#f6c8ff', '#b84cff', '#6a1ad0'], '#2d0a6a');
  add('wild-lime-gold', 'Wild lime', base({ id: 'bowlby-one', weight: 400, style: 'normal' }, {
    face: makeGradient('linear', [[0, '#faff70'], [0.5, '#9ee424'], [1, '#2e9a14']], { angle: 90 }),
    outlines: [outline('o1', 0.04, '#5a3410'), outline('o2', 0.04, '#1a0c02')],
    bevel: { enabled: true, size: 0.04, depth: 0.5, angle: -70, light: '#ffffff', shade: '#134a0a' },
    extrusion: { enabled: true, depth: 0.07, angle: 90, fill: solid('#134a0a'), shade: 0.4 }, shadow: drop('#000000', 0.55, 0.12),
  }));
  add('magma', 'Magma', base({ id: 'bowlby-one', weight: 400, style: 'normal' }, {
    face: makeGradient('linear', [[0, '#5a2214'], [0.5, '#2a0e0a'], [1, '#120402']], { angle: 90 }),
    outlines: [{ id: 'o1', enabled: true, width: 0.045, join: 'round', fill: makeGradient('linear', [[0, '#fff3a0'], [0.4, '#ffa21a'], [0.7, '#e8330a'], [1, '#fff3a0']], { angle: 0, repeat: 2, reflect: true, anim: { enabled: true, speed: 0.35, direction: 'forward', loop: 'loop' } }) }, outline('o2', 0.03, '#1a0400')],
    innerHighlight: hi(0.3, 0.03, '#ff8a3a'), glow: { enabled: true, fill: solid('#ff5a14'), radius: 0.28, strength: 1.3, bloom: true }, shadow: noShadow(),
  }));
  add('toxic-slime', 'Toxic slime', base({ id: 'rubik-wet-paint', weight: 400, style: 'normal' }, {
    face: makeGradient('linear', [[0, '#f0ff80'], [0.5, '#8ee01a'], [1, '#3a9a0a']], { angle: 90 }),
    outlines: [outline('o1', 0.04, '#0b3a06')], innerHighlight: hi(0.6, 0.04),
    glow: { enabled: true, fill: solid('#9dff3a'), radius: 0.2, strength: 0.8, bloom: true }, shadow: drop('#021a00', 0.55, 0.08),
  }));
  add('royal-purple', 'Royal purple', base({ id: 'rozha-one', weight: 400, style: 'normal' }, {
    letterSpacing: 0.02,
    face: makeGradient('linear', [[0, '#f6d4ff'], [0.45, '#a244f4'], [1, '#3a0f8a']], { angle: 90 }),
    outlines: [{ id: 'o1', enabled: true, width: 0.035, join: 'round', fill: makeGradient('linear', [[0, '#fff3b0'], [0.5, '#f0b92a'], [1, '#a86a0a']], { angle: 90 }) }, outline('o2', 0.045, '#1a0840')],
    bevel: { enabled: true, size: 0.035, depth: 0.5, angle: -70, light: '#ffffff', shade: '#2a0a6a' }, extrusion: { enabled: true, depth: 0.07, angle: 90, fill: solid('#24065a'), shade: 0.3 },
    innerHighlight: hi(0.45, 0.035), shadow: drop('#0a0020', 0.55, 0.1),
  }));
  add('bronze', 'Bronze', base({ id: 'alfa-slab-one', weight: 400, style: 'normal' }, {
    face: makeGradient('reflected', [[0, '#fff1d0'], [0.2, '#e9a860'], [0.55, '#7a3f14'], [1, '#3a1c08']], { angle: 90 }),
    outlines: [outline('o1', 0.04, '#2a1204'), outline('o2', 0.025, '#e9b070')], bevel: { enabled: true, size: 0.04, depth: 0.7, angle: -70, light: '#fff4dc', shade: '#2a1204' },
    shadow: drop('#000000', 0.6, 0.09),
  }));
  add('steel-blue', 'Steel', base({ id: 'big-shoulders-display', weight: 700, style: 'normal' }, {
    letterSpacing: 0.03,
    face: makeGradient('reflected', [[0, '#ffffff'], [0.25, '#a9bfd2'], [0.55, '#33506b'], [1, '#c4d6e6']], { angle: 90 }),
    outlines: [outline('o1', 0.02, '#ffffff'), outline('o2', 0.04, '#0a1a28')], bevel: { enabled: true, size: 0.04, depth: 0.6, angle: -70, light: '#ffffff', shade: '#0a1a28' },
    shadow: drop('#000a14', 0.6, 0.07),
  }));
  const jewel = (id: string, name: string, c: [string, string, string], dark: string, glow: string) => add(id, name, base({ id: 'bowlby-one', weight: 400, style: 'normal' }, {
    face: makeGradient('linear', [[0, c[0]], [0.38, c[1]], [1, c[2]]], { angle: 90 }),
    outlines: [outline('o1', 0.025, '#ffffff'), outline('o2', 0.05, dark)],
    bevel: { enabled: true, size: 0.05, depth: 0.6, angle: -60, light: '#ffffff', shade: dark }, innerHighlight: hi(0.6, 0.045),
    glow: { enabled: true, fill: solid(glow), radius: 0.2, strength: 0.7, bloom: true }, shadow: drop('#000000', 0.5, 0.09),
  }));
  jewel('ruby', 'Ruby', ['#ffc0cc', '#ff2a4a', '#780016'], '#3a0010', '#ff3a5a');
  jewel('sapphire', 'Sapphire', ['#c4e6ff', '#2a7cff', '#0a2a8a'], '#04184a', '#3a8aff');
  add('sticker-pink', 'Sticker pink', base({ id: 'modak', weight: 400, style: 'normal' }, {
    letterSpacing: 0.02, face: solid('#ffffff'),
    outlines: [outline('o1', 0.05, '#ff4fa8'), outline('o2', 0.045, '#ffffff'), outline('o3', 0.035, '#4a1a6a')],
    shadow: drop('#2a0a3a', 0.45, 0.07),
  }));
  add('sticker-mint', 'Sticker mint', base({ id: 'fredoka', weight: 700, style: 'normal' }, {
    letterSpacing: 0.02, face: makeGradient('linear', [[0, '#e8fff4'], [1, '#8ef0c0']], { angle: 90 }),
    outlines: [outline('o1', 0.045, '#14a878'), outline('o2', 0.05, '#ffffff'), outline('o3', 0.035, '#06402e')],
    shadow: drop('#022018', 0.45, 0.07),
  }));
  add('frost-white', 'Frost white', base({ id: 'dynapuff', weight: 700, style: 'normal' }, {
    face: makeGradient('linear', [[0, '#ffffff'], [1, '#cdeeff']], { angle: 90 }), outlines: [outline('o1', 0.035, '#52bcf4'), outline('o2', 0.03, '#ffffff'), outline('o3', 0.035, '#0a3a6a')],
    innerHighlight: hi(0.7, 0.04, '#ffffff'), glow: { enabled: true, fill: solid('#8fe4ff'), radius: 0.24, strength: 0.9, bloom: true }, shadow: drop('#062040', 0.5, 0.07),
  }));
  add('chocolate', 'Chocolate', base({ id: 'shrikhand', weight: 400, style: 'normal' }, {
    face: makeGradient('linear', [[0, '#c27a46'], [0.5, '#6a3216'], [1, '#2a1006']], { angle: 90 }),
    outlines: [outline('o1', 0.03, '#fbe9d0'), outline('o2', 0.045, '#1a0a04')], innerHighlight: hi(0.5, 0.04, '#ffd9b0'), bevel: { enabled: true, size: 0.04, depth: 0.5, angle: -70, light: '#ffe4c4', shade: '#1a0a04' },
    shadow: drop('#0a0402', 0.55, 0.09),
  }));
  add('retro-sunset', 'Retro sunset', base({ id: 'syncopate', weight: 700, style: 'normal' }, {
    letterSpacing: 0.05,
    face: makeGradient('linear', [[0, '#fff3a0'], [0.33, '#ffb347'], [0.33, '#ff5e8a'], [0.66, '#ff2d95'], [0.66, '#b21fd8'], [1, '#5a1fb0']], { angle: 90 }),
    outlines: [outline('o1', 0.03, '#ffffff'), outline('o2', 0.04, '#2a0a5a')],
    glow: { enabled: true, fill: solid('#ff2d95'), radius: 0.25, strength: 1.2, bloom: true }, shadow: noShadow(),
  }));
  add('glass-aqua', 'Glass aqua', base({ id: 'fredoka', weight: 700, style: 'normal' }, {
    face: makeGradient('linear', [[0, '#ffffff', 0.9], [0.5, '#a8f0ff', 0.6], [1, '#3ac8f0', 0.45]], { angle: 90 }),
    outlines: [outline('o1', 0.025, '#ffffff'), outline('o2', 0.03, '#1a9ac8')], innerHighlight: hi(0.8, 0.05),
    glow: { enabled: true, fill: solid('#5ae0ff'), radius: 0.22, strength: 0.9, bloom: true }, shadow: drop('#022a40', 0.35, 0.06),
  }));
  add('toy-block', 'Toy block', base({ id: 'bowlby-one', weight: 400, style: 'normal' }, {
    face: makeGradient('linear', [[0, '#ff6a5a'], [1, '#d01818']], { angle: 90 }), outlines: [outline('o1', 0.05, '#4a0505')],
    bevel: { enabled: true, size: 0.06, depth: 0.55, angle: -60, light: '#ffd0c8', shade: '#6a0808' }, extrusion: { enabled: true, depth: 0.1, angle: 90, fill: solid('#8a0a0a'), shade: 0.35 },
    innerHighlight: hi(0.45, 0.04), shadow: drop('#000000', 0.5, 0.14),
  }));

  // ---- looks modelled on a second set of slot-game references ---------------------------------------------------------
  // ornate fantasy gold ("MAX WIN" on crimson banners): flared serif capitals, a warm gold with a hard horizon, a heavy bevel, a thin
  // dark outline and a faint red glow
  const ornate = (id: string, name: string, stops: [number, string][], o1: string, o2: string, light: string, shade: string, slab: string, glow: string, font = 'cinzel') => add(id, name, base({ id: font, weight: 700, style: 'normal' }, {
    letterSpacing: 0.035,
    face: makeGradient('linear', stops, { angle: 90 }),
    outlines: [outline('o1', 0.016, o1), outline('o2', 0.05, o2)],
    bevel: { enabled: true, size: 0.032, depth: 0.85, angle: -60, light, shade },
    innerHighlight: hi(0.5, 0.028, '#ffffff'), extrusion: { enabled: true, depth: 0.05, angle: 90, fill: solid(slab), shade: 0.5 },
    glow: { enabled: true, fill: solid(glow), radius: 0.07, strength: 0.16, bloom: true }, shadow: drop('#120000', 0.6, 0.09, 0.04),
  }));
  ornate('ornate-gold', 'Ornate gold', [[0, '#fff8d6'], [0.26, '#f8dc7e'], [0.5, '#e0a634'], [0.51, '#b9741a'], [0.78, '#e6b650'], [1, '#8a5214']], '#7a3a0c', '#1d0707', '#fffbe6', '#5a2406', '#4a1a06', '#ffa030');
  ornate('ornate-silver', 'Ornate platinum', [[0, '#ffffff'], [0.26, '#dfe8f2'], [0.5, '#a9b8ca'], [0.51, '#6f8099'], [0.78, '#c4d2e2'], [1, '#56667c']], '#2e3e56', '#070d18', '#ffffff', '#1f2c40', '#1a2538', '#5ab4ff');
  ornate('ornate-ruby', 'Ornate ruby gold', [[0, '#ffe6c0'], [0.3, '#ff9a8a'], [0.52, '#e0283c'], [0.53, '#b00a24'], [0.8, '#d6203a'], [1, '#6a0416']], '#ffd070', '#1a0204', '#ffe8e0', '#5a0412', '#3a0210', '#ff2a3a');
  ornate('ornate-emerald', 'Ornate emerald', [[0, '#f4ffe0'], [0.3, '#aef4ae'], [0.52, '#3ad878'], [0.53, '#1aa050'], [0.8, '#2cc064'], [1, '#0e7034']], '#f4d06a', '#021a0a', '#eaffd8', '#0a4a22', '#04301a', '#3aff7a');
  ornate('ornate-sapphire', 'Ornate sapphire', [[0, '#e0f0ff'], [0.3, '#8ac4ff'], [0.52, '#2a74f0'], [0.53, '#1a52c4'], [0.8, '#2866e0'], [1, '#0e2e84']], '#f4d06a', '#020a1e', '#e8f4ff', '#0a2468', '#061a4a', '#4a8aff');
  // the same hand for the digits of an amount: lining figures, slightly wider
  add('ornate-digits', 'Ornate digits', base({ id: 'cinzel', weight: 700, style: 'normal' }, {
    letterSpacing: 0.045,
    face: makeGradient('linear', [[0, '#fffbe0'], [0.3, '#ffe488'], [0.52, '#f2b83a'], [0.53, '#d8901c'], [0.8, '#f0c04a'], [1, '#a8661a']], { angle: 90 }),
    outlines: [outline('o1', 0.018, '#8a4a10'), outline('o2', 0.05, '#2a0e04')],
    bevel: { enabled: true, size: 0.03, depth: 0.8, angle: -60, light: '#fffbe8', shade: '#6a3208' },
    innerHighlight: hi(0.5, 0.026), extrusion: { enabled: true, depth: 0.045, angle: 90, fill: solid('#5a2a08'), shade: 0.5 },
    glow: { enabled: true, fill: solid('#ffb030'), radius: 0.07, strength: 0.18, bloom: true }, shadow: drop('#1a0600', 0.55, 0.08, 0.04),
  }));
  // carved, heavy gold digits (an amount sitting on the reels): a deep bevel with the lit edge on top, a dark recess line inside the outline
  const carved = (id: string, name: string, stops: [number, string][], recess: string, edge: string, light: string, shade: string, glow: string) => add(id, name, base({ id: 'passion-one', weight: 700, style: 'normal' }, {
    letterSpacing: 0.02,
    face: makeGradient('linear', stops, { angle: 90 }),
    outlines: [outline('o1', 0.02, recess), outline('o2', 0.012, edge), outline('o3', 0.05, '#120804')],
    bevel: { enabled: true, size: 0.06, depth: 0.95, angle: -55, light, shade },
    innerHighlight: hi(0.4, 0.03, '#fff6c8'), extrusion: { enabled: true, depth: 0.06, angle: 90, fill: solid(recess), shade: 0.55 },
    glow: { enabled: true, fill: solid(glow), radius: 0.06, strength: 0.12, bloom: true }, shadow: drop('#000000', 0.6, 0.1, 0.04),
  }));
  carved('carved-gold', 'Carved gold', [[0, '#fff2a8'], [0.35, '#f6c640'], [0.7, '#d98f14'], [1, '#a65a08']], '#5a2c06', '#f9d870', '#fffce0', '#6a3408', '#ffc030');
  carved('carved-silver', 'Carved silver', [[0, '#ffffff'], [0.35, '#d6e0ec'], [0.7, '#9aaac0'], [1, '#64748c']], '#2a3648', '#e8f0fa', '#ffffff', '#2a3648', '#9ac8ff');
  carved('carved-jade', 'Carved jade', [[0, '#e6ffd8'], [0.35, '#7ae09a'], [0.7, '#24a860'], [1, '#0e6a3a']], '#04301a', '#bff4c8', '#f2ffe8', '#04301a', '#3aff9a');
  // graffiti slime ("W" of a wild): a loose marker hand, lime to teal, a dark green line and a cyan wet glint
  add('slime-graffiti', 'Slime graffiti', base({ id: 'chango', weight: 400, style: 'normal' }, {
    letterSpacing: 0.01,
    face: makeGradient('linear', [[0, '#f4ff9a'], [0.28, '#b4f046'], [0.6, '#5cd02a'], [1, '#2a9a40']], { angle: 80, wave: { amount: 0.04, count: 2.2, phase: 0.3, speed: 0 } }),
    outlines: [outline('o1', 0.02, '#0f5a2a'), outline('o2', 0.06, '#04150a')],
    bevel: { enabled: true, size: 0.04, depth: 0.7, angle: -55, light: '#e8ffd0', shade: '#0a4a1c' }, innerHighlight: hi(0.55, 0.03, '#d8fff0'),
    extrusion: { enabled: true, depth: 0.07, angle: 70, fill: solid('#0a2e1a'), shade: 0.5 },
    glow: { enabled: true, fill: solid('#7aff3a'), radius: 0.08, strength: 0.22, bloom: true }, shadow: drop('#021208', 0.65, 0.1, 0.04),
  }));
  // a steel badge ("BIG WIN" on a shield): near-white metal with a cold reflection, a hard black line and a thin steel keyline
  const steelBadge = (id: string, name: string, stops: [number, string][], keyline: string, dark: string, glow: string) => add(id, name, base({ id: 'oswald', weight: 700, style: 'normal' }, {
    letterSpacing: 0.03,
    face: makeGradient('reflected', stops, { angle: 90 }),
    outlines: [outline('o1', 0.02, keyline, 'miter'), outline('o2', 0.055, dark, 'miter')],
    bevel: { enabled: true, size: 0.032, depth: 0.7, angle: -70, light: '#ffffff', shade: dark }, innerHighlight: hi(0.45, 0.025),
    extrusion: { enabled: true, depth: 0.05, angle: 90, fill: solid(dark), shade: 0.4 },
    glow: { enabled: true, fill: solid(glow), radius: 0.06, strength: 0.14, bloom: true }, shadow: drop('#000000', 0.6, 0.1, 0.04),
  }));
  steelBadge('steel-badge', 'Steel badge', [[0, '#ffffff'], [0.3, '#e4ecf6'], [0.62, '#8ea4bf'], [1, '#d6e2f0']], '#9aaec6', '#07101c', '#7aa8ff');
  steelBadge('steel-badge-red', 'Steel badge, red edge', [[0, '#ffffff'], [0.3, '#f2e8ea'], [0.62, '#b08a92'], [1, '#e8d6da']], '#c85a6a', '#14060a', '#ff4a5a');
  steelBadge('steel-badge-gold', 'Steel badge, gold edge', [[0, '#ffffff'], [0.3, '#eef0f4'], [0.62, '#9aa4b4'], [1, '#e0e6ee']], '#e8b64a', '#120c04', '#ffc84a');
  // pink metal ("MEGA WIN" on a violet plate): a white top, a hot pink body and a lilac line, faceted square-cut letters
  const violetMetal = (id: string, name: string, stops: [number, string][], key: string, dark: string, glow: string) => add(id, name, base({ id: 'tektur', weight: 700, style: 'normal' }, {
    letterSpacing: 0.04,
    face: makeGradient('linear', stops, { angle: 90 }),
    outlines: [outline('o1', 0.016, key, 'miter'), outline('o2', 0.05, dark, 'miter')],
    bevel: { enabled: true, size: 0.034, depth: 0.75, angle: -60, light: '#ffffff', shade: dark }, innerHighlight: hi(0.55, 0.03),
    extrusion: { enabled: true, depth: 0.05, angle: 90, fill: solid(dark), shade: 0.4 },
    glow: { enabled: true, fill: solid(glow), radius: 0.07, strength: 0.2, bloom: true }, shadow: drop('#12002e', 0.55, 0.09, 0.04),
  }));
  violetMetal('violet-metal', 'Pink metal', [[0, '#ffffff'], [0.22, '#ffd6f2'], [0.5, '#ff8ad8'], [0.51, '#d44cb4'], [0.8, '#ff9ee2'], [1, '#a82a92']], '#e6b4ff', '#2a0a5a', '#ff4ad8');
  violetMetal('cyan-metal', 'Ice metal', [[0, '#ffffff'], [0.22, '#d8f6ff'], [0.5, '#7ad8ff'], [0.51, '#3a9ad8'], [0.8, '#8ae0ff'], [1, '#1a62a8']], '#b4e8ff', '#04204a', '#3ac8ff');
  violetMetal('gold-metal', 'Sun metal', [[0, '#ffffff'], [0.22, '#fff0b8'], [0.5, '#ffc83a'], [0.51, '#e0901a'], [0.8, '#ffd24a'], [1, '#a85a0a']], '#fff0b0', '#3a1404', '#ffb42a');
  // white on a dark plate ("NICE WIN"): heavy slanted capitals, a thick hard black line and a black slab in the corner
  const slab = (id: string, name: string, face: [string, string], edge: string, slabColor: string) => add(id, name, base({ id: 'alumni-sans', weight: 700, style: 'italic' }, {
    letterSpacing: 0.03,
    face: makeGradient('linear', [[0, face[0]], [1, face[1]]], { angle: 90 }),
    outlines: [outline('o1', 0.014, edge, 'miter'), outline('o2', 0.06, '#000000', 'miter')],
    innerHighlight: hi(0.35, 0.02), extrusion: { enabled: true, depth: 0.07, angle: 55, fill: solid(slabColor), shade: 0 },
    shadow: drop('#000000', 0.5, 0.06, 0.03),
  }));
  slab('slab-white', 'Slab white', ['#ffffff', '#dfe6e0'], '#ffffff', '#000000');
  slab('slab-yellow', 'Slab yellow', ['#fff6a8', '#ffd22a'], '#fff6a8', '#2a1a00');
  slab('slab-cyan', 'Slab cyan', ['#e8ffff', '#6ad8ff'], '#e8ffff', '#02142a');

  void d; void noGlow;
  return list;
}

export const STYLE_PRESETS: StylePreset[] = buildStylePresets();
export const stylePreset = (id: string): TextStyle => cloneStyle(STYLE_PRESETS.find((p) => p.id === id)!.style);

/** Every font a style uses (for loading and for the licence manifest). */
export const styleFonts = (s: TextStyle): FontSpec[] => [s.font];
