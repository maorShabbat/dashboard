import { QUAD_FLOATS, type DrawBatch, type Frame, type RGB } from '../engine/frame';
import type { ObjectInfo } from '../engine/object';

export const STAGE_ASPECT = 16 / 9;

/** Width and height (scene units) of an icon whose longest side is `size`. */
export function iconDims(obj: { aspect: number }, size: number): { w: number; h: number } {
  return obj.aspect >= 1 ? { w: size, h: size / obj.aspect } : { w: size * obj.aspect, h: size };
}

export interface IconDraw {
  cx: number; cy: number;
  /** Longest side in scene units. */
  size: number;
  rot?: number; sx?: number; sy?: number; skew?: number;
  alpha?: number; bright?: number; tint?: RGB;
  /** Sub-rectangle of the sprite (for stretched caps and slices). */
  uv?: [number, number, number, number];
  /** Quad extent override (scene units), when drawing a part of the sprite. */
  w?: number; h?: number;
  /** Offset of the quad centre from (cx, cy). */
  ox?: number; oy?: number;
  fx?: DrawBatch['fx'];
  emit?: 0 | 1 | 2;
  emitGain?: number;
}

function iconInstance(obj: ObjectInfo, d: IconDraw): number[] {
  const dims = iconDims(obj, d.size);
  const hw = (d.w ?? dims.w) / 2, hh = (d.h ?? dims.h) / 2;
  const uv = d.uv ?? [0, 0, 1, 1];
  const t = d.tint ?? [1, 1, 1];
  const inst = [d.cx, d.cy, d.ox ?? 0, d.oy ?? 0, hw, hh, d.rot ?? 0, d.skew ?? 0, d.sx ?? 1, d.sy ?? 1, d.bright ?? 1, 1, uv[0], uv[1], uv[2], uv[3], 0, 0, 1, 1, t[0], t[1], t[2], d.alpha ?? 1];
  if (inst.length !== QUAD_FLOATS) throw new Error('icon instance size');
  return inst;
}

/** Draw an icon (the object sprite) into the content layer. */
export function drawIcon(f: Frame, obj: ObjectInfo, d: IconDraw): void {
  if (!obj.tex) return;
  f.draws.push({ tex: obj.tex, fill: null, fillMode: 0, premultiplied: true, instances: iconInstance(obj, d), emit: d.emit ?? 0, emitGain: d.emitGain, fx: d.fx });
}

/** Many copies of one sprite in a single draw (particles made from a picture). They share one `fx` and `emit`. */
export function drawIcons(f: Frame, obj: ObjectInfo, list: IconDraw[], o: { emit?: 0 | 1 | 2; emitGain?: number; fx?: DrawBatch['fx'] } = {}): void {
  if (!obj.tex || !list.length) return;
  const inst: number[] = [];
  for (const d of list) inst.push(...iconInstance(obj, d));
  f.draws.push({ tex: obj.tex, fill: null, fillMode: 0, premultiplied: true, instances: inst, emit: o.emit ?? 0, emitGain: o.emitGain, fx: o.fx });
}

/** Seeded random for effects: stable across calls. */
export function rnd(seed: number, i: number, k = 0): number {
  let x = Math.imul((seed * 7919 + i * 104729 + k * 1299709) | 0, 0x9e3779b1) ^ 0x85ebca6b;
  x = Math.imul(x ^ (x >>> 15), 0x2c1b3c6d); x = Math.imul(x ^ (x >>> 12), 0x297a2d39); x ^= x >>> 15;
  return (x >>> 0) / 4294967296;
}

/** Flat polygons for the polys layer (x, y, r, g, b, a per vertex). */
export function quadPoly(out: number[], x: number, y: number, hw: number, hh: number, rot: number, col: RGB, a: number): void {
  const c = Math.cos(rot), sn = Math.sin(rot);
  const p = (lx: number, ly: number): [number, number] => [x + c * lx - sn * ly, y + sn * lx + c * ly];
  const A = p(-hw, -hh), B = p(hw, -hh), C = p(hw, hh), D = p(-hw, hh);
  for (const v of [A, B, C, A, C, D]) out.push(v[0], v[1], col[0], col[1], col[2], a);
}
export function ellipsePoly(out: number[], x: number, y: number, rx: number, ry: number, rot: number, col: RGB, a: number, segs = 14): void {
  const c = Math.cos(rot), sn = Math.sin(rot);
  for (let i = 0; i < segs; i++) {
    const a0 = (i / segs) * Math.PI * 2, a1 = ((i + 1) / segs) * Math.PI * 2;
    const p = (an: number): [number, number] => { const lx = Math.cos(an) * rx, ly = Math.sin(an) * ry; return [x + c * lx - sn * ly, y + sn * lx + c * ly]; };
    const P0 = p(a0), P1 = p(a1);
    out.push(x, y, col[0], col[1], col[2], a, P0[0], P0[1], col[0], col[1], col[2], a, P1[0], P1[1], col[0], col[1], col[2], a);
  }
}

export function triPoly(out: number[], a: [number, number], b: [number, number], c: [number, number], col: RGB, al: number, colB?: RGB, colC?: RGB): void {
  const cb = colB ?? col, cc = colC ?? col;
  out.push(a[0], a[1], col[0], col[1], col[2], al, b[0], b[1], cb[0], cb[1], cb[2], al, c[0], c[1], cc[0], cc[1], cc[2], al);
}
