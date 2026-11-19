/**
 * The scene model: what a preset IS. A scene is a list of elements (text, counters, icons, shapes) with their layered motion, plus
 * effect layers (impacts, distortions, icon destruction). It is plain JSON, identical for the playground, saved presets, exported
 * bundles and the runtime player. Nothing about how it looks or moves lives anywhere else.
 */
import { DEFAULT_FONT, type FontSpec } from '../fonts/catalog';
import { cloneGradient, type Gradient } from '../style/gradient';
import { cloneStyle, defaultStyle, type ShapeStyle, type TextStyle } from '../style/textStyle';

export const SCENE_SCHEMA = 'bangers.vfx-scene/1';

export type PValue = number | string | boolean;
export type Params = Record<string, PValue>;

// ---------------------------------------------------------------------------------------------------------------------
// Motion: four layers per element (entrance, idle, emphasis, exit) that stack as separate transform / style containers.

export type MotionSlot = 'entrance' | 'idle' | 'emphasis' | 'exit';
export type MotionUnit = 'block' | 'line' | 'word' | 'char';
export type StaggerOrder = 'forward' | 'reverse' | 'center' | 'edges' | 'random';

export interface MotionSpec {
  /** Id in the motion registry. */
  id: string;
  /** Seconds after the element appears. (Idle: when the loop begins.) */
  start: number;
  /** Seconds one unit takes (idle: one cycle). */
  duration: number;
  unit: MotionUnit;
  /** Seconds between consecutive units. */
  stagger: number;
  order: StaggerOrder;
  /** Strength multiplier: 1 = the animation as designed. */
  amount: number;
  /** Animation-specific settings (see the registry). */
  params: Params;
  /** Idle: number of cycles (0 = until the element goes). */
  repeat?: number;
}

export interface Motion {
  entrance?: MotionSpec;
  idle?: MotionSpec;
  emphasis?: MotionSpec[];
  exit?: MotionSpec;
}

export interface ShineSpec {
  enabled: boolean;
  color: string;
  /** Degrees, 0 = sweeps left → right. */
  angle: number;
  /** Width of the band as a fraction of the element (0.05 – 1). */
  width: number;
  intensity: number;
  /** Seconds after the element appears. */
  start: number;
  /** Seconds one sweep takes. */
  duration: number;
  /** Extra sweeps (0 = once). */
  repeat: number;
  /** Seconds between sweeps. */
  interval: number;
  /** Also feeds the bloom so the band glows. */
  bloom: boolean;
}

export interface ElementBase {
  id: string;
  name: string;
  /** Centre of the element, as fractions of the stage (0..1 of width, 0..1 of height). */
  x: number; y: number;
  scale: number;
  /** Degrees. */
  rotation: number;
  opacity: number;
  /** Scene seconds at which the element appears. */
  start: number;
  /** Scene seconds at which it is removed (undefined = stays to the end). */
  end?: number;
  motion: Motion;
  shine?: ShineSpec;
  hidden?: boolean;
}

export type TextRole = 'title' | 'subtitle' | 'amount' | 'multiplier' | 'body' | 'label';

export interface TextElement extends ElementBase {
  kind: 'text';
  text: string;
  /** Font size as a fraction of the stage height. */
  size: number;
  /** Wrap width as a fraction of the stage width (0 = only at line breaks). */
  maxWidth: number;
  style: TextStyle;
  role: TextRole;
}

export type DigitRoll = 'none' | 'roll' | 'pop' | 'flip' | 'slot';
export interface CounterElement extends ElementBase {
  kind: 'counter';
  from: number;
  to: number;
  decimals: number;
  prefix: string;
  suffix: string;
  /** Thousands separator ('' for none). */
  group: string;
  decimalMark: string;
  /** Seconds after the element appears at which counting begins, and how long it takes. */
  countStart: number;
  countDuration: number;
  ease: 'linear' | 'easeOut' | 'easeInOut' | 'easeIn' | 'burst';
  roll: DigitRoll;
  /** Each digit pops/bounces when it changes. */
  tickPop: number;
  /** Final pulse when the target is reached. */
  landPulse: number;
  size: number;
  style: TextStyle;
}

export type ImageLook = 'original' | 'gradient' | 'tint';
export interface ImageElement extends ElementBase {
  kind: 'image';
  /** Asset id: `builtin:<name>` for the bundled icons, otherwise an uploaded PNG / WebM in the project. */
  asset: string;
  /** Length of the longest side, as a fraction of the stage height. */
  size: number;
  look: ImageLook;
  /** Used by 'gradient' (replaces the colours) and 'tint' (multiplies them). */
  gradient: Gradient | null;
  /** Outline / glow / shadow / bevel drawn around the image's silhouette (static images only). */
  outline: ShapeStyle | null;
  /** Role label for the UI: an icon, or a message background. */
  role: 'icon' | 'background';
  /** Video (WebM) playback: loop, or play once and hold the last frame. */
  playback: 'loop' | 'once';
  /** Stretch to a width × height (fractions of the stage height) instead of keeping the aspect: for message backgrounds. */
  width?: number;
  height?: number;
}

export type ShapeId = 'plate' | 'banner' | 'ribbon' | 'burst' | 'badge' | 'neon-box' | 'scroll' | 'circle' | 'diamond' | 'bar' | 'shield' | 'slab' | 'pennant';
export interface ShapeElement extends ElementBase {
  kind: 'shape';
  shape: ShapeId;
  /** Size as fractions of the stage height. */
  width: number;
  height: number;
  style: ShapeStyle;
  /** Corner radius / tooth count / notch depth etc., see shapes.ts. */
  params: Params;
}

export type SymbolRole = 'normal' | 'wild' | 'scatter' | 'bonus';
/**
 * A picture, usually a transparent WebM, that plays while a wild expands over its reel, instead of the wild's still picture being
 * stretched. It starts when the expansion starts and, when it ends, its last frame stays over the reel.
 */
export interface ExpandAnimation {
  /** Asset id: `builtin:<name>` or an uploaded transparent WebM (a still picture works too). */
  asset: string;
  /** `grow`: it grows with the wild, from one cell to the whole reel, while it plays. `fill`: it covers the whole reel from its first frame (a picture made for the full reel). */
  fit: 'grow' | 'fill';
  /** `natural`: it plays at its own speed. `fit`: it is played faster or slower so that it lasts exactly as long as the expansion ("Expansion time"). */
  play: 'natural' | 'fit';
}

export interface BoardSymbol {
  /** Asset id: `builtin:<name>` or an uploaded PNG / WebM. */
  asset: string;
  name: string;
  role: SymbolRole;
  /** What plays while this symbol (a wild) expands over its reel. */
  expand?: ExpandAnimation;
}

/**
 * A reel board: a grid of symbols that spins, stops, bounces, wins and tumbles, all as a pure function of time. `params` are the board's
 * behaviour (spin style, timings, pattern), see model/board.ts.
 */
export interface BoardElement extends ElementBase {
  kind: 'board';
  cols: number;
  rows: number;
  /** Symbol cell size as a fraction of the stage height, and the gap between cells as a fraction of the cell. */
  cell: number;
  gap: number;
  symbols: BoardSymbol[];
  /** Asset drawn behind every cell (a tile), and one behind the whole board (a panel). */
  frame: string | null;
  panel: string | null;
  params: Params;
}

export type SceneElement = TextElement | CounterElement | ImageElement | ShapeElement | BoardElement;

// ---------------------------------------------------------------------------------------------------------------------

export interface FxLayer {
  id: string;
  /** Id in the effect registry (e.g. 'shockwave', 'destroy.shatter', 'distort.ripple'). */
  effect: string;
  /** Scene seconds at which the effect begins. */
  start: number;
  enabled: boolean;
  /** Element the effect works on (an icon to destroy, a symbol to transform); anchors the effect there. */
  target?: string;
  /** The symbol a transformation turns the target into. */
  target2?: string;
  /** An image element (a symbol frame / tile) that goes with the target: the player composes both into one picture and the effect destroys the whole tile. */
  frame?: string;
  /** Strength multiplier for companions (see fx registry). */
  amount: number;
  params: Params;
  /** Optional colour ramp: the effect's colours are replaced by the ramp's colour at their brightness (a gradient map). */
  ramp?: Gradient | null;
}

export interface AssetRef {
  id: string;
  kind: 'png' | 'webm' | 'image' | 'audio';
  name: string;
  bytes: number;
  sha256: string;
  /** Media type of the stored file. */
  type: string;
}

export interface SoundSpec {
  enabled: boolean; volume: number;
  /** Keep the generated effect sounds when your own sounds are attached (default true). */
  builtin?: boolean;
}

/**
 * A sound file of your own played at a cue point: a moment the scene itself defines (an effect starting or landing its impact, a reel
 * stopping, a win, the text slamming in). `cue` is a key from `cuePoints()` (fx/cues.ts); `offset` moves the sound earlier or later.
 */
export interface SoundAttach {
  id: string;
  name: string;
  /** Asset id of the audio file (listed in `scene.assets` with kind 'audio'). */
  asset: string;
  cue: string;
  offset: number;
  gain: number;
}

export interface Scene {
  schema: typeof SCENE_SCHEMA;
  /** Stage width / height. */
  aspect: number;
  seed: number;
  elements: SceneElement[];
  fx: FxLayer[];
  /** Seconds to keep playing after the last motion has finished. */
  hold: number;
  /** Sound files of your own, each played at a cue point of the scene. */
  sounds?: SoundAttach[];
  /** Fixed length in seconds (undefined = computed from the content). */
  duration?: number;
  /** The scene is a seamless loop (an ambient background): players restart it at once, with no rest on the last frame. */
  seamless?: boolean;
  assets: AssetRef[];
  sound: SoundSpec;
  /** Stand-in pictures behind the effect (never part of an export): the screen shown first, and for transitions the screen they lead to. */
  screens?: { from?: string; to?: string };
}

// ---------------------------------------------------------------------------------------------------------------------
// Builders

let idCounter = 0;
export const newId = (prefix: string): string => `${prefix}${Date.now().toString(36)}${(idCounter++).toString(36)}`;

export function defaultMotion(): Motion { return {}; }

export function motionSpec(id: string, over: Partial<MotionSpec> = {}): MotionSpec {
  return { id, start: 0, duration: 0.6, unit: 'block', stagger: 0, order: 'forward', amount: 1, params: {}, ...over };
}

export function defaultShine(): ShineSpec {
  return { enabled: false, color: '#ffffff', angle: 20, width: 0.22, intensity: 0.85, start: 0.5, duration: 0.9, repeat: 0, interval: 1.2, bloom: true };
}

const baseOf = (id: string, name: string, over: Partial<ElementBase> = {}): ElementBase => ({
  id, name, x: 0.5, y: 0.5, scale: 1, rotation: 0, opacity: 1, start: 0, motion: {}, ...over,
});

export function textElement(text: string, over: Partial<TextElement> = {}): TextElement {
  return { ...baseOf(over.id ?? newId('t'), over.name ?? 'Text'), kind: 'text', text, size: 0.16, maxWidth: 0, style: defaultStyle(), role: 'title', ...over };
}

export function counterElement(over: Partial<CounterElement> = {}): CounterElement {
  return {
    ...baseOf(over.id ?? newId('c'), over.name ?? 'Counter'), kind: 'counter', from: 0, to: 12500, decimals: 0, prefix: '', suffix: '', group: ',', decimalMark: '.',
    countStart: 0.3, countDuration: 1.6, ease: 'easeOut', roll: 'none', tickPop: 0, landPulse: 0.12, size: 0.16, style: defaultStyle(), ...over,
  };
}

export function imageElement(asset: string, over: Partial<ImageElement> = {}): ImageElement {
  return { ...baseOf(over.id ?? newId('i'), over.name ?? 'Icon'), kind: 'image', asset, size: 0.3, look: 'original', gradient: null, outline: null, role: 'icon', playback: 'loop', ...over };
}

const DEFAULT_SYMBOLS: [string, SymbolRole][] = [['cherry', 'normal'], ['bell', 'normal'], ['clover', 'normal'], ['heart', 'normal'], ['horseshoe', 'normal'], ['seven', 'normal'], ['crown', 'wild'], ['gem', 'scatter'], ['coin', 'bonus']];
export const defaultBoardSymbols = (): BoardSymbol[] => DEFAULT_SYMBOLS.map(([n, role]) => ({ asset: `builtin:${n}`, name: n, role }));

export function boardElement(over: Partial<BoardElement> = {}): BoardElement {
  return {
    ...baseOf(over.id ?? newId('b'), over.name ?? 'Reels'), kind: 'board', cols: 5, rows: 3, cell: 0.2, gap: 0.08, frame: null, panel: null, params: {},
    symbols: DEFAULT_SYMBOLS.map(([n, role]) => ({ asset: `builtin:${n}`, name: n, role })), ...over,
  };
}

export function shapeElement(shape: ShapeId, over: Partial<ShapeElement> = {}): ShapeElement {
  const st = defaultStyle();
  const style: ShapeStyle = { face: st.face, outlines: st.outlines, bevel: st.bevel, innerHighlight: st.innerHighlight, extrusion: st.extrusion, shadow: st.shadow, glow: st.glow };
  return { ...baseOf(over.id ?? newId('s'), over.name ?? 'Shape'), kind: 'shape', shape, width: 0.9, height: 0.34, style, params: {}, ...over };
}

export function fxLayer(effect: string, over: Partial<FxLayer> = {}): FxLayer {
  return { id: over.id ?? newId('fx'), effect, start: 0, enabled: true, amount: 1, params: {}, ...over };
}

export function emptyScene(over: Partial<Scene> = {}): Scene {
  return { schema: SCENE_SCHEMA, aspect: 16 / 9, seed: 7, elements: [], fx: [], hold: 0.8, assets: [], sound: { enabled: false, volume: 0.8 }, ...over };
}

// ---------------------------------------------------------------------------------------------------------------------

export const cloneScene = (s: Scene): Scene => JSON.parse(JSON.stringify(s)) as Scene;

export function cloneElement<T extends SceneElement>(e: T): T {
  const c = JSON.parse(JSON.stringify(e)) as T;
  return c;
}

/** The element a style belongs to, whatever its kind (shapes and images carry a ShapeStyle). */
export const elementStyle = (e: SceneElement): TextStyle | ShapeStyle | null => (e.kind === 'text' || e.kind === 'counter' ? e.style : e.kind === 'shape' ? e.style : e.kind === 'image' ? e.outline : null);

/** Every picture an element draws: an icon's own, or the symbols, tile and panel of a board. */
export function elementAssets(e: SceneElement): string[] {
  if (e.kind === 'image') return [e.asset];
  if (e.kind === 'board') return [...e.symbols.flatMap((x) => (x.expand ? [x.asset, x.expand.asset] : [x.asset])), ...(e.frame ? [e.frame] : []), ...(e.panel ? [e.panel] : [])];
  return [];
}
/** Every picture the scene draws (built-ins included), once each. */
export const sceneAllAssets = (scene: Scene): string[] => [...new Set([...scene.elements.flatMap(elementAssets), ...(scene.sounds ?? []).map((x) => x.asset)])];

export const soundAttach = (over: Partial<SoundAttach> & Pick<SoundAttach, 'asset' | 'cue'>): SoundAttach => ({ id: newId('s'), name: 'Sound', offset: 0, gain: 1, ...over });

/** Every font the scene uses (loading, the licence manifest, Copy for AI). */
export function sceneFonts(scene: Scene): FontSpec[] {
  const seen = new Map<string, FontSpec>();
  for (const e of scene.elements) {
    if (e.kind !== 'text' && e.kind !== 'counter') continue;
    const f = e.style.font;
    seen.set(`${f.id}|${f.weight}|${f.style}`, { ...f });
  }
  return [...seen.values()];
}

/** Ids of the uploaded assets the scene refers to (built-in icons excluded). */
export function sceneAssetIds(scene: Scene): string[] {
  return sceneAllAssets(scene).filter((a) => !a.startsWith('builtin:'));
}

export const isBuiltinAsset = (id: string): boolean => id.startsWith('builtin:');

export { cloneGradient, cloneStyle, DEFAULT_FONT };
