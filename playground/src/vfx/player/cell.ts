/**
 * A symbol "cell": a frame (tile, bezel, card) and the symbol sitting in it, composed into one picture at their resting pose so a
 * destruction effect can take the whole tile apart, burn it, freeze it or blow it up, not just the icon.
 */
import type { ImageElement } from '../model/scene';
import { ImageRuntime, type Env } from './elements';

export interface Rect { cx: number; cy: number; w: number; h: number }

/** Where an image element sits at rest, in scene units (x scaled by the aspect). */
export function restRect(rt: ImageRuntime, aspect: number): Rect {
  const { w, h } = rt.size(), es = rt.el.scale;
  return { cx: rt.el.x * aspect, cy: rt.el.y, w: w * es, h: h * es };
}

export function unionRect(a: Rect, b: Rect): Rect {
  const x0 = Math.min(a.cx - a.w / 2, b.cx - b.w / 2), x1 = Math.max(a.cx + a.w / 2, b.cx + b.w / 2);
  const y0 = Math.min(a.cy - a.h / 2, b.cy - b.h / 2), y1 = Math.max(a.cy + a.h / 2, b.cy + b.h / 2);
  return { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, w: x1 - x0, h: y1 - y0 };
}

/** Identity of a composition: the same assets at the same geometry give the same picture. */
export function cellKey(frame: ImageRuntime, icon: ImageRuntime, aspect: number, pxPerUnit: number): string {
  const r = (v: number) => Math.round(v * 1000) / 1000;
  const rs = (x: Rect) => `${r(x.cx)},${r(x.cy)},${r(x.w)},${r(x.h)}`;
  return `cell:${frame.el.asset}|${icon.el.asset}|${rs(restRect(frame, aspect))}|${rs(restRect(icon, aspect))}|${frame.el.opacity},${icon.el.opacity}|${Math.round(pxPerUnit / 40)}`;
}

function canvasOf(w: number, h: number): HTMLCanvasElement | OffscreenCanvas {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas'); c.width = w; c.height = h; return c;
}
async function toBlob(c: HTMLCanvasElement | OffscreenCanvas): Promise<Blob> {
  if ('convertToBlob' in c) return c.convertToBlob({ type: 'image/png' });
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('PNG encoding failed'))), 'image/png'));
}

/**
 * Compose the frame (behind) and the symbol (in front) and return an image runtime that stands for the whole cell. The picture is
 * registered with the image library under a content key, so the same cell is only drawn once.
 */
export async function composeCell(env: Env, frame: ImageRuntime, icon: ImageRuntime, id: string): Promise<ImageRuntime> {
  const aspect = env.aspect, rf = restRect(frame, aspect), ri = restRect(icon, aspect), u = unionRect(rf, ri);
  const key = cellKey(frame, icon, aspect, env.pxPerUnit);
  const longest = Math.max(u.w, u.h), px = Math.max(160, Math.min(1024, Math.round(longest * env.pxPerUnit * 1.5))), k = px / longest;
  const W = Math.max(2, Math.round(u.w * k)), H = Math.max(2, Math.round(u.h * k));
  if (!env.images.has(key)) {
    const c = canvasOf(W, H);
    const g = c.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
    for (const [rt, r] of [[frame, rf], [icon, ri]] as const) {
      g.globalAlpha = rt.el.opacity;
      g.drawImage(rt.img.frame(0), (r.cx - r.w / 2 - (u.cx - u.w / 2)) * k, (r.cy - r.h / 2 - (u.cy - u.h / 2)) * k, r.w * k, r.h * k);
    }
    await env.images.transient(key, await toBlob(c), 'cell.png');
  }
  const el: ImageElement = {
    ...icon.el, id, name: 'Tile', asset: key, x: u.cx / aspect, y: u.cy, size: longest, width: undefined, height: undefined, scale: 1, rotation: 0, opacity: 1,
    start: 0, end: undefined, motion: {}, shine: undefined, outline: null, look: 'original', gradient: null, playback: 'loop',
  };
  delete el.width; delete el.height; delete el.end;
  const rt = new ImageRuntime(el);
  await rt.prepare(env);
  return rt;
}
