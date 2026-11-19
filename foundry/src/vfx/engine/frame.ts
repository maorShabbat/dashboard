/**
 * A Frame is everything the renderer draws for one instant. Effects are pure functions of time that fill a Frame, so
 * scrubbing, replay, slow motion and frame-accurate recording are exact. Coordinates are "scene space": x ∈ [0, aspect],
 * y ∈ [0, 1], y down, 1 unit = the image height. Colours are linear-ish 0..1 RGB triples.
 */
export type RGB = [number, number, number];

export const MAX_SHOCKS = 4;
export const MAX_VORTICES = 3;
export const MAX_DISTORT = 4;

/** Pixels of a texture, either straight RGBA bytes (text/shape layers, gradient ramps) or a browser image (icons, video frames). */
export type TexData =
  | { kind: 'rgba'; data: Uint8Array; w: number; h: number; filter?: 'linear' | 'nearest' }
  | { kind: 'image'; source: TexImageSource & { width: number; height: number }; mip?: boolean };

/** A texture as the renderer sees it: created on first use from `load()` and re-uploaded when `version` changes. */
export interface TexRef { uid: string; version: number; w: number; h: number; load(): TexData }

/** Gradient fill for a batch: the ramp lookup texture and the packed shader uniforms (see style/gradient.ts). */
export interface FillRef { lut: TexRef; g0: [number, number, number, number]; g1: [number, number, number, number]; g2: [number, number, number, number]; g3: [number, number, number, number] }

/** Floats per drawn quad instance; see ELEM_VS for the layout. */
export const QUAD_FLOATS = 24;

/** Icon effect modes of the element shader. */
export const ICON_FX = { none: 0, dissolve: 1, pixelate: 2, slice: 3, melt: 4, burn: 5, dust: 6, ripple: 7, vblur: 8 } as const;

/**
 * One draw of textured quads: glyphs of a style layer, an icon, a frame, a video frame. `fillMode`: 0 = the texture's own colour,
 * 1 = texture × fill (masks and the extrusion's grey), 2 = fill replaces the colour, texture gives the shape.
 * `emit`: 0 = ordinary, 1 = ordinary and also light for the bloom, 2 = light only.
 */
export interface DrawBatch {
  tex: TexRef;
  fill: FillRef | null;
  fillMode: 0 | 1 | 2;
  /** Texture is premultiplied (browser images) rather than straight bytes. */
  premultiplied: boolean;
  instances: number[];
  emit: 0 | 1 | 2;
  /** Light gain when emit > 0. */
  emitGain?: number;
  /** This batch is a glow layer: the per-instance glow multiplier scales it. */
  glowLayer?: boolean;
  /** Icon effect: mode, progress 0..1, seed and a free parameter (+ colour for burn edges). */
  fx?: { mode: number; progress: number; seed: number; p: number; color?: RGB };
}

/** Screen distortion operation (see SCENE_FS): a = strength, phase / time, p0, unused; b = centre x, centre y, p1, p2. */
export interface DistortOp { kind: number; a: [number, number, number, number?]; b: [number, number, number, number] }
export const DISTORT = { ripple: 1, lens: 2, heat: 3, glitch: 4, wave: 5, zoom: 6, chroma: 7, pixelate: 8, scan: 9, shear: 10 } as const;

export interface Shock {
  cx: number; cy: number;
  /** Current front radius; <= 0 disables the travelling wave. */
  radius: number;
  /** Ring half-width in scene units. */
  width: number;
  /** Peak displacement in scene units. */
  amp: number;
  /** Compression ("impact pinch") radius and strength (positive pulls content toward the centre). */
  pinchR: number; pinchK: number;
  /** Additive ring light intensity and colour. */
  light: number; color: RGB;
  /** Chromatic separation (0 = none). */
  split: number;
  /** 0..1 time fade of the whole wave. */
  life: number;
  /** How strongly displacement slope brightens/darkens (refraction look). */
  strainLight: number;
}

export interface Vortex {
  cx: number; cy: number; radius: number;
  /** Pull: content is drawn toward the centre. Kept < 2.7 by the builder so the mapping stays monotonic. Slightly negative = rebound bulge. */
  pull: number;
  /** Twist in radians at the centre. */
  twist: number;
  glow: number; absorb: number; color: RGB;
}

/** Additive/alpha sprites. type: 0 soft glow, 1 ring, 2 glint star, 3 hot core, 4 streak, 5 dust disc (alpha). */
export interface Sprite {
  x: number; y: number; hw: number; hh: number; rot: number; type: number;
  color: RGB; intensity: number; e1?: number; e2?: number;
}

/** A volumetric puff (real fire or smoke drawn with domain-warped noise). kind: 0 smoke, 1 flame tongue (rises, tapers), 2 fireball (hot core, cools to soot). */
export interface VolPuff {
  x: number; y: number;
  /** Half-width in scene units (a flame is `stretch` times as tall as wide). */
  size: number; rot: number;
  /** 0 → 1 over its life: smoke thins out, flames and fireballs cool and die. */
  age: number; seed: number; kind: 0 | 1 | 2 | 3;
  /** Overall opacity / strength. */
  alpha: number;
  /** 0..1 temperature: how hot the fire is, or how much a smoke puff glows from the fire next to it. */
  heat: number;
  stretch: number;
  /** Direction toward the light (world), for smoke shading. */
  lx: number; ly: number;
  /** Seconds since the puff started: the noise scrolls with it. */
  t: number;
  /** Smoke only: 0 = billowing lumps, 1 = soft wispy steam or mist. */
  soft?: number;
}
/** Colours for volumetric puffs: fire ramp (deep, hot, bright, white-hot), smoke shadow and lit side, and the warm light of nearby fire. */
export interface VolPalette { fire: [RGB, RGB, RGB, RGB]; shadow: RGB; lit: RGB; warm: RGB }
export const FIRE_PALETTES: Record<string, [RGB, RGB, RGB, RGB]> = {
  fire: [[0.5, 0.05, 0.0], [1, 0.33, 0.02], [1, 0.75, 0.15], [1, 0.97, 0.78]],
  blue: [[0.04, 0.08, 0.5], [0.12, 0.42, 1], [0.45, 0.8, 1], [0.92, 0.98, 1]],
  green: [[0.02, 0.35, 0.05], [0.2, 0.85, 0.12], [0.7, 1, 0.3], [0.95, 1, 0.85]],
  violet: [[0.3, 0.02, 0.45], [0.7, 0.18, 1], [0.9, 0.55, 1], [1, 0.92, 1]],
  white: [[0.55, 0.45, 0.35], [0.95, 0.8, 0.55], [1, 0.95, 0.8], [1, 1, 1]],
};
export const SMOKE_TONES: Record<string, { shadow: RGB; lit: RGB }> = {
  grey: { shadow: [0.09, 0.09, 0.11], lit: [0.62, 0.62, 0.66] },
  black: { shadow: [0.02, 0.02, 0.03], lit: [0.26, 0.24, 0.26] },
  white: { shadow: [0.55, 0.58, 0.66], lit: [1, 1, 1] },
  toxic: { shadow: [0.04, 0.2, 0.06], lit: [0.55, 0.95, 0.4] },
  ice: { shadow: [0.3, 0.45, 0.65], lit: [0.92, 0.98, 1] },
  purple: { shadow: [0.14, 0.05, 0.28], lit: [0.72, 0.5, 1] },
  sand: { shadow: [0.25, 0.18, 0.1], lit: [0.85, 0.74, 0.55] },
};
export const defaultVolPalette = (): VolPalette => ({ fire: FIRE_PALETTES.fire!.map((c) => [...c] as RGB) as VolPalette['fire'], shadow: [...SMOKE_TONES.grey!.shadow], lit: [...SMOKE_TONES.grey!.lit], warm: [1, 0.55, 0.15] });

export interface SmokePuff {
  x: number; y: number; size: number; rot: number;
  age: number; seed: number; alpha: number; erode: number;
  tone: number; warmth: number; lx: number; ly: number;
}

export interface Shard {
  /** Interleaved fan vertices: x, y, u, v, edge, shade (per vertex). */
  verts: number[];
}

/**
 * Texture references that stand for the two screens of a transition. A shard set whose texture is one of these draws pieces of that
 * screen (a screen that shatters, falls apart or is cut into slabs).
 */
export const SCREEN_A: TexRef = { uid: '$screenA', version: 0, w: 1, h: 1, load: () => { throw new Error('screen texture'); } };
export const SCREEN_B: TexRef = { uid: '$screenB', version: 0, w: 1, h: 1, load: () => { throw new Error('screen texture'); } };

export interface ShardSet {
  tex: TexRef | null; verts: number[];
  /** Colour multiplier and frost amount for pieces of a screen (icy pieces). */
  tint?: [number, number, number, number];
  /** 0..1: draw the pieces as glass (each bends the picture a little differently and catches a sheen). */
  glass?: number;
}

/**
 * A transition from screen A (the picture behind) to screen B, evaluated per pixel in the scene pass. `kind` selects how the two are
 * mixed (see TR); p, d, c1, c2 and mode are that kind's settings (documented where each kind is built, fx/transitions.ts).
 */
export const TR = { none: 0, front: 1, cut: 2, pixels: 3, glitch: 4, cover: 5, zoom: 6, flip: 7, bands: 8, frost: 10 } as const;
export interface Transition {
  kind: number; progress: number; seed: number; mode: number;
  p: [number, number, number, number]; d: [number, number, number, number]; q: [number, number, number, number];
  c1: RGB; c2: RGB;
}

export interface Frame {
  shocks: Shock[];
  /** Everything drawn into the content layer (text, counters, icons, frames), in order. Displaced and shaken with the picture. */
  draws: DrawBatch[];
  /** Screen distortions applied to the whole picture (backdrop and content). */
  distort: DistortOp[];
  /** Extra object triangle sets with their own textures (several icons fragmenting at once). */
  shardSets: ShardSet[];
  /** Texture of `shards` (the icon being fragmented). */
  shardTex: TexRef | null;
  vortices: Vortex[];
  additive: Sprite[];
  alphaSprites: Sprite[];
  smoke: SmokePuff[];
  /** Volumetric fire and smoke (see VolPuff). */
  vol: VolPuff[];
  volPalette: VolPalette;
  /** Screen transition (A to B), if one is playing. */
  transition: Transition | null;
  /** Triangle lists. poly: x,y,r,g,b,a. */
  polys: number[];
  /** Ribbon vertices (alpha blended): x,y,side,v,r,g,b,a. */
  ribbons: number[];
  /** Lightning vertices (additive): x,y,side,halfW,coreW,intensity. */
  bolts: number[];
  /**
   * Object triangles, textured with the transparent object sprite (see Renderer.setObject): x,y,u,v,edge,shade,glint,alpha.
   * u,v address the sprite; `edge` is 0 on a triangle's outer edge and 1 inside (analytic edge antialiasing; use 1 everywhere for a plain quad).
   */
  shards: number[];
  /** Flat triangles drawn beneath the object layer: x,y,r,g,b,a. */
  underPolys: number[];
  /** Camera shake applied to the whole picture and every layer: translation (scene units), rotation (rad) and zoom (>= 1 hides the edges). */
  camera: { dx: number; dy: number; rot: number; zoom: number };
  /** Optional diagnostics for tests; effects fill it only when the context asks (ctx.debug). */
  meta?: Record<string, unknown>;
  exposure: number;
  /** Additional bolt batches with their own colours (compositions mix effects whose arcs differ in colour). */
  boltSets: { core: RGB; glow: RGB; verts: number[] }[];
  /** Colour of the bolt core/glow for this frame. */
  boltCore: RGB; boltGlow: RGB;
  /** Smoke palette: shadow, mid, light, rim. */
  smokePalette: [RGB, RGB, RGB, RGB];
}

export function emptyFrame(): Frame {
  return {
    shocks: [], draws: [], distort: [], shardSets: [], shardTex: null, vortices: [], additive: [], alphaSprites: [], smoke: [], vol: [], volPalette: defaultVolPalette(), transition: null, polys: [], ribbons: [], bolts: [], shards: [], underPolys: [],
    camera: { dx: 0, dy: 0, rot: 0, zoom: 1 }, boltSets: [], exposure: 1, boltCore: [1, 1, 1], boltGlow: [0.3, 0.7, 1],
    smokePalette: [[0.13, 0.12, 0.2], [0.34, 0.3, 0.42], [0.62, 0.58, 0.68], [1.0, 0.62, 0.28]],
  };
}
