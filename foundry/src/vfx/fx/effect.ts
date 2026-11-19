import type { ParamDef } from '../../core/params';
import type { Frame, RGB } from '../engine/frame';
import type { ObjectInfo } from '../engine/object';
import type { SoundCue } from '../engine/audio';
import type { BoardEvent, ReelPlan } from '../model/board';
import type { SymbolRole } from '../model/scene';

export type PValues = Record<string, number | string | boolean>;

/** How an effect moves and colours the board itself (a shake, a frost, a flicker), combined over every effect aimed at the board. */
/** How one symbol on a reel board is moved, scaled and coloured by an effect (offsets are in cells; scale 1, bright 1, alpha 1 leave it as it is). */
export interface CellMod { dx?: number; dy?: number; scale?: number; sx?: number; sy?: number; rot?: number; bright?: number; alpha?: number; tint?: [number, number, number] }
/** What an effect says about each cell of a board at this moment: null leaves a cell alone. */
export type CellModFn = (row: number, col: number) => CellMod | null;
export interface BoardMod { dx: number; dy: number; rot: number; scale: number; bright: number; tint: [number, number, number]; rattle: number; wobble: number }
export const noBoardMod = (): BoardMod => ({ dx: 0, dy: 0, rot: 0, scale: 1, bright: 1, tint: [1, 1, 1], rattle: 0, wobble: 0 });
export function addBoardMod(a: BoardMod, b: Partial<BoardMod>): void {
  a.dx += b.dx ?? 0; a.dy += b.dy ?? 0; a.rot += b.rot ?? 0; a.scale *= b.scale ?? 1; a.bright *= b.bright ?? 1; a.rattle += b.rattle ?? 0; a.wobble += b.wobble ?? 0;
  if (b.tint) { a.tint[0] *= b.tint[0]; a.tint[1] *= b.tint[1]; a.tint[2] *= b.tint[2]; }
}

/** A reel board as effect layers see it: geometry in scene units and every event (stops, landings, wins, pops …) in scene seconds. */
export interface BoardInfo {
  cols: number; rows: number;
  /** Cell size and the distance between cell centres. */
  cell: number; pitch: number;
  cx: number; cy: number;
  box: { x0: number; y0: number; x1: number; y1: number };
  cellCenter(row: number, col: number): { x: number; y: number };
  events: BoardEvent[];
  /** The role of the symbol that lands in each cell. */
  roles: SymbolRole[][];
  /** How each reel turns (see ReelPlan), in scene seconds: with `reelScroll` an effect can know how fast a reel is moving at any moment. */
  reels?: ReelPlan[];
  end: number;
  style: string;
  pattern: string;
}

export interface EffectCtx {
  /** Image aspect (width / height); scene space is x ∈ [0, aspect], y ∈ [0, 1]. */
  aspect: number;
  /** Pixels per scene unit of the current view (for sizing hairlines); informational. */
  pxPerUnit: number;
  /** The transparent object sprite currently loaded (what the fragmentation breaks), if any. */
  object: ObjectInfo | null;
  /** Tests ask effects to publish diagnostics in Frame.meta. */
  debug?: boolean;
  /** A second image: the symbol an effect turns the first into. */
  object2?: ObjectInfo | null;
  /** Points on the silhouette of the element the effect works on (sparkles, glints). Scene units. */
  silhouette?: Silhouette | null;
  /** Seed from the scene, so every effect is reproducible. */
  seed?: number;
  /** Scene seconds at which this effect layer starts (board events are in scene seconds). */
  start?: number;
  /** The board this effect is aimed at (see `usesBoard`), with its geometry and event times. */
  board?: BoardInfo | null;
  /** Quality tier as a multiplier of how much an effect draws: 1 = full, below 1 = fewer particles (set by the player's quality setting). */
  quality?: number;
}

/** Where an element actually has pixels: for placing sparkles on letters and icons rather than on empty space. */
export interface Silhouette {
  /** Bounding box in scene units. */
  box: { x0: number; y0: number; x1: number; y1: number };
  /** A point on the silhouette for random numbers a, b in [0, 1). */
  sample(a: number, b: number): { x: number; y: number };
  /** The upper contour of the letters, left to right (first line only): where flames and glows should be rooted. `th` is how thick the letter is below that point. Scene units. */
  top?(): { x: number; y: number; th: number }[];
  /** How far the element is turned, in radians (clockwise). */
  rotation?: number;
}

/** How an effect is classified in the playground. Only `approved` effects may be treated as final. */
export type Category = 'approved' | 'candidate' | 'primitive' | 'experimental' | 'archived';

export interface ShowEffect {
  id: string;
  name: string;
  tagline: string;
  category: Category;
  /** Optional footnote shown under the controls. */
  note?: string;
  /** Parameters shown as controls. `cx` / `cy` (0..1 of the image) are also set by clicking / dragging the preview. */
  params: ParamDef[];
  /** Total length in seconds for the given parameters (the frame is empty at and after this time). */
  duration(p: PValues): number;
  /** Seconds after the effect starts at which its main impact lands; companions are aligned to it. Default 0. */
  impactAt?(p: PValues): number;
  /** Fill `f` with everything visible at time `t` (seconds). Pure: same (t, p) → same frame. */
  build(f: Frame, t: number, p: PValues, ctx: EffectCtx): void;
  /** The sounds this effect makes, as cues relative to its own start. */
  cues?(p: PValues): SoundCue[];
  /** When used as a companion: the reduced settings it starts from, and how the single "amount" slider scales it. */
  companion?: { subtle: PValues; scale?(p: PValues, k: number): PValues };
  /** Needs the object sprite (fragmentation). */
  usesObject?: boolean;
  /** The effect draws the target element itself from its start (icon destruction): the element's own draw is hidden from then on. Defaults to usesObject. */
  takesOver?: boolean;
  /** The effect turns the first icon into a second one (a second image is chosen in the editor). */
  usesObject2?: boolean;
  /** The effect hands the target back at its end (an expansion that releases): the element is hidden only while the effect plays. */
  restores?: boolean;
  /** For effects aimed at a reel board: how the board itself moves and is coloured at local time t (a shake, a frost). Evaluated before the board is drawn. */
  boardMod?(t: number, p: PValues, ctx: EffectCtx): Partial<BoardMod> | null;
  /** For effects aimed at a reel board that animate individual symbols (a wild pulsing, a row vanishing): a function from a cell to how it is moved. Evaluated before the board is drawn. */
  cellMod?(t: number, p: PValues, ctx: EffectCtx): CellModFn | null;
  /** The effect works on a reel board (aim it at one): it reads the board's geometry and events. */
  usesBoard?: boolean;
  /** A screen transition: it needs a second screen (the one it leads to) behind the first. */
  transition?: boolean;
  /** The effect's last frame stays on screen after its end (a transition leaves the new screen up). */
  holdsEnd?: boolean;
}

export function defaultsOf(e: ShowEffect): PValues {
  const out: PValues = {};
  for (const d of e.params) out[d.key] = d.default as number | string | boolean;
  return out;
}

/** Effects that read `ctx.quality` themselves; every other effect has its piece counts thinned by `thinParams`. */
export const selfScaling = (e: ShowEffect): boolean => /^(emit|ambient|frame|board|spin|symbol|lane|cascade)\./.test(e.id);
const THINNABLE = new Set(['count', 'flames', 'debris', 'embers', 'puffs', 'flakes', 'drops', 'bubbles', 'tongues', 'icicles', 'sparks', 'shards', 'pieces', 'fragments']);
/**
 * The effect's settings at a quality tier below full: the numbers of particles, flames, shards and the like are cut by the tier's share
 * (never below the setting's own minimum or 1), and nothing about the look or timing changes. Shard counts are cut more gently.
 */
export function thinParams(e: ShowEffect, p: PValues, quality: number): PValues {
  if (quality >= 0.999 || selfScaling(e)) return p;
  let out: PValues | null = null;
  for (const d of e.params) {
    if (d.kind !== 'number' || !THINNABLE.has(d.key)) continue;
    const v = Number(p[d.key] ?? d.default);
    if (!Number.isFinite(v)) continue;
    const f = d.key === 'shards' || d.key === 'pieces' || d.key === 'fragments' ? Math.sqrt(quality) : quality;
    const nv = Math.max(d.min, 1, Math.round(v * f));
    if (nv < v) (out ??= { ...p })[d.key] = nv;
  }
  return out ?? p;
}

export const n = (p: PValues, k: string): number => {
  const v = p[k];
  return typeof v === 'number' ? v : Number(v);
};
export const s = (p: PValues, k: string): string => String(p[k]);
export const b = (p: PValues, k: string): boolean => p[k] === true || p[k] === 'true';
export type { RGB };
