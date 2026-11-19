/** Shared by the effects that dress or light the board: its geometry (or a stand-in), points on its outline, and small helpers. */
import type { Frame, RGB } from '../engine/frame';
import { clamp } from '../engine/math';
import type { BoardInfo, EffectCtx } from './effect';

export const fract = (x: number): number => x - Math.floor(x);
export const bell = (u: number): number => Math.sin(Math.PI * clamp(u));

/** The board's geometry, or a stand-in in the middle of the stage when the effect is not aimed at a board. */
export function board(ctx: EffectCtx): BoardInfo {
  if (ctx.board) return ctx.board;
  const cx = ctx.aspect / 2, cy = 0.5, W = 1.3, H = 0.75, cell = 0.23, pitch = 0.25;
  return { cols: 5, rows: 3, cell, pitch, cx, cy, box: { x0: cx - W / 2, y0: cy - H / 2, x1: cx + W / 2, y1: cy + H / 2 }, cellCenter: (r, c) => ({ x: cx - 2 * pitch + c * pitch, y: cy - pitch + r * pitch }), events: [], roles: [], end: 0, style: 'classic', pattern: '' };
}

/** A point on the board's outline, `u` ∈ [0, 1) round it, with its outward normal. */
export function perim(b: BoardInfo, u: number, inset = 0): { x: number; y: number; nx: number; ny: number } {
  const { x0, y0, x1, y1 } = b.box, w = x1 - x0 - inset * 2, h = y1 - y0 - inset * 2, per = 2 * (w + h), d = fract(u) * per;
  if (d < w) return { x: x0 + inset + d, y: y0 + inset, nx: 0, ny: -1 };
  if (d < w + h) return { x: x1 - inset, y: y0 + inset + (d - w), nx: 1, ny: 0 };
  if (d < 2 * w + h) return { x: x1 - inset - (d - w - h), y: y1 - inset, nx: 0, ny: 1 };
  return { x: x0 + inset, y: y1 - inset - (d - 2 * w - h), nx: -1, ny: 0 };
}
export const perimLength = (b: BoardInfo, inset = 0): number => 2 * (b.box.x1 - b.box.x0 + b.box.y1 - b.box.y0 - 4 * inset);

export const bulb = (f: Frame, x: number, y: number, r: number, col: RGB, k: number): void => {
  if (k <= 0.01) return;
  f.additive.push({ x, y, hw: r * 2.4, hh: r * 2.4, rot: 0, type: 0, color: col, intensity: 1.2 * k, e1: 2.2 });
};

/** A count scaled by the quality tier (never below 1). */
export const L = (ctx: EffectCtx, v: number): number => Math.max(1, Math.round(v * Math.max(0.3, ctx.quality ?? 1)));

/** A colour from a hue in turns (0 = red), full saturation, adjustable lightness toward white. */
export const hue = (h: number, whiten = 0): RGB => {
  const k = (m: number): number => (m + fract(h) * 6) % 6, v = (m: number): number => 1 - Math.max(0, Math.min(k(m), 4 - k(m), 1));
  return [v(5) + (1 - v(5)) * whiten, v(3) + (1 - v(3)) * whiten, v(1) + (1 - v(1)) * whiten];
};
