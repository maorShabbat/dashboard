/**
 * Display list. Effects never touch a canvas: they append primitives here. A Frame is therefore plain JSON that can be
 * painted (Canvas2D), hashed (replay verification) or inspected (tests), identically in the editor, the exported runtime
 * and Node.
 */
import type { LayerId } from './tokens';

export type Paint =
  | string
  | { g: 'linear'; angle: number; stops: [number, string][] }
  | { g: 'radial'; stops: [number, string][] };

export interface Shadow { color: string; blur: number; dx: number; dy: number }
export interface ClipRect { cx: number; cy: number; w: number; h: number; r: number }
export interface Texture { kind: 'halftone' | 'stripes' | 'grid'; color: string; alpha: number; size: number }

interface OpBase {
  layer: LayerId;
  alpha?: number;
  blend?: string;
  clip?: ClipRect;
  shadow?: Shadow;
}

export interface RectOp extends OpBase { op: 'rect'; cx: number; cy: number; w: number; h: number; r?: number; rot?: number; fill?: Paint; stroke?: Paint; lw?: number; dash?: number[]; texture?: Texture }
export interface EllipseOp extends OpBase { op: 'ellipse'; cx: number; cy: number; rx: number; ry: number; rot?: number; fill?: Paint; stroke?: Paint; lw?: number }
export interface PolyOp extends OpBase { op: 'poly'; pts: number[]; closed?: boolean; fill?: Paint; stroke?: Paint; lw?: number; join?: 'round' | 'miter' | 'bevel'; cap?: 'round' | 'butt' | 'square'; dash?: number[] }
export interface TextOp extends OpBase {
  op: 'text'; text: string; x: number; y: number; font: { id: string; weight: number }; size: number; align?: 'left' | 'center' | 'right';
  fill?: Paint; stroke?: Paint; lw?: number; ls?: number; rot?: number; scale?: number; dx?: number; dy?: number; maxWidth?: number;
}
export interface ImageOp extends OpBase { op: 'image'; asset: string; cx: number; cy: number; w: number; h: number; rot?: number }
export type DrawOp = RectOp | EllipseOp | PolyOp | TextOp | ImageOp;

/** Per-cell symbol modifiers produced by effects (pop, drop, pulse). Summed/overridden when symbols are drawn. */
export interface CellMod { col: number; row: number; dx: number; dy: number; scale: number; alpha: number; rot: number; glow: number; variant: number }
export interface CameraMod { dx: number; dy: number; rot: number; zoom: number }

export class Out {
  ops: DrawOp[] = [];
  cells: CellMod[] = [];
  camera: CameraMod[] = [];
  push(op: DrawOp): void { this.ops.push(op); }
}

export const TAU = Math.PI * 2;

export function starPoints(cx: number, cy: number, outer: number, inner: number, n: number, rotDeg: number): number[] {
  const pts: number[] = [];
  const rot = (rotDeg * Math.PI) / 180 - Math.PI / 2;
  for (let i = 0; i < n * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = rot + (i * Math.PI) / n;
    pts.push(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  }
  return pts;
}
