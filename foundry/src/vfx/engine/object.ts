import type { RGB, TexRef } from './frame';

/**
 * A transparent object sprite (an icon) as the effects see it: its aspect ratio and a coarse alpha mask. Fragmentation uses the
 * mask to place its fracture inside the object's real silhouette and to keep light effects off the transparent background.
 */
export interface ObjectInfo {
  id: string;
  /** Width / height of the sprite image. */
  aspect: number;
  /** Alpha mask (0..255), row-major, top row first. */
  mask: Uint8Array;
  mw: number;
  mh: number;
  /** Mean colour of the opaque pixels (0..1). */
  color: RGB;
  /** The sprite's texture (set by the scene player for the icon element being destroyed). */
  tex?: TexRef;
}

/** Alpha at sprite coordinates u, v ∈ [0, 1] (bilinear, 0 outside). */
export function maskAt(o: ObjectInfo, u: number, v: number): number {
  if (u < 0 || v < 0 || u > 1 || v > 1) return 0;
  const x = u * o.mw - 0.5, y = v * o.mh - 0.5;
  const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
  const at = (xx: number, yy: number) => (xx < 0 || yy < 0 || xx >= o.mw || yy >= o.mh ? 0 : o.mask[yy * o.mw + xx]! / 255);
  return (at(x0, y0) * (1 - fx) + at(x0 + 1, y0) * fx) * (1 - fy) + (at(x0, y0 + 1) * (1 - fx) + at(x0 + 1, y0 + 1) * fx) * fy;
}

/** Build an ObjectInfo by evaluating alpha(u, v) ∈ [0, 1] on a grid (used by tests and synthetic icons). */
export function objectFromFunction(id: string, aspect: number, alpha: (u: number, v: number) => number, color: RGB = [0.9, 0.8, 0.3], res = 96): ObjectInfo {
  const mw = aspect >= 1 ? res : Math.max(8, Math.round(res * aspect));
  const mh = aspect >= 1 ? Math.max(8, Math.round(res / aspect)) : res;
  const mask = new Uint8Array(mw * mh);
  for (let y = 0; y < mh; y++) for (let x = 0; x < mw; x++) mask[y * mw + x] = Math.round(255 * Math.min(1, Math.max(0, alpha((x + 0.5) / mw, (y + 0.5) / mh))));
  return { id, aspect, mask, mw, mh, color };
}

/** Browser: read a decoded image's alpha into an ObjectInfo. */
export function objectFromImage(id: string, img: { width: number; height: number } & CanvasImageSource, res = 96): ObjectInfo {
  const aspect = img.width / img.height;
  const mw = aspect >= 1 ? res : Math.max(8, Math.round(res * aspect));
  const mh = aspect >= 1 ? Math.max(8, Math.round(res / aspect)) : res;
  const c = document.createElement('canvas');
  c.width = mw; c.height = mh;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.clearRect(0, 0, mw, mh);
  g.drawImage(img, 0, 0, mw, mh);
  const d = g.getImageData(0, 0, mw, mh).data;
  const mask = new Uint8Array(mw * mh);
  let r = 0, gg = 0, b = 0, wsum = 0;
  for (let i = 0; i < mw * mh; i++) {
    const a = d[i * 4 + 3]!;
    mask[i] = a;
    if (a > 8) { const w = a / 255; r += (d[i * 4]! / 255) * w; gg += (d[i * 4 + 1]! / 255) * w; b += (d[i * 4 + 2]! / 255) * w; wsum += w; }
  }
  const color: RGB = wsum > 0 ? [r / wsum, gg / wsum, b / wsum] : [0.9, 0.8, 0.3];
  return { id, aspect, mask, mw, mh, color };
}
