/**
 * Turns one shape (a glyph, a frame, an icon silhouette) into the layers of its style stack. The output is plain pixel data: white
 * coverage masks (the extrusion also carries a grey depth shade), so the GPU supplies every colour and gradient each frame.
 * Editing colours, stops, animation or opacity therefore never re-rasterises; only shape-changing settings do (see rasterHash).
 *
 * Pure functions on Float32/Uint8 arrays: the only browser-specific part is a MaskSource, which draws the shape.
 */
import { solid, type Gradient } from './gradient';
import { outlineReach, type JoinStyle, type ShapeStyle } from './textStyle';

export type LayerKind = 'shadow' | 'glow' | 'extrusion' | 'outline' | 'face' | 'highlight' | 'bevelLight' | 'bevelShade';

/** Supplies the coverage (0..1, row-major, w × h) of a shape grown outward by `grow` pixels (0 = the shape itself). */
export interface MaskSource { mask(grow: number, join: JoinStyle): Float32Array }

export interface CellLayer {
  kind: LayerKind;
  /** For outlines: index among the ENABLED outlines of the style. */
  ref: number;
  /** Coverage 0..255. Soft layers (shadow, glow) are stored at half resolution: `w` × `h` are then the cell size / 2, rounded up. */
  a: Uint8Array;
  /** Extrusion only: grey depth shade 0..255. */
  gray?: Uint8Array;
  w: number;
  h: number;
  /** 1 = same size as the cell, 0.5 = half. */
  scale: number;
}

// ---------------------------------------------------------------------------------------------------------------------
// Array helpers

/** Gaussian-like blur (three box passes) of a single channel, zero outside. */
export function blur(a: Float32Array, w: number, h: number, sigma: number): Float32Array {
  if (sigma < 0.3) return a.slice();
  const box = Math.max(1, Math.floor(Math.sqrt((12 * sigma * sigma) / 3 + 1)));
  const r = Math.floor(box / 2);
  let src = a.slice();
  let dst = new Float32Array(a.length);
  const inv = 1 / (2 * r + 1);
  for (let pass = 0; pass < 3; pass++) {
    for (let y = 0; y < h; y++) {                                         // horizontal
      let sum = 0; const o = y * w;
      for (let x = -r; x <= r; x++) if (x >= 0 && x < w) sum += src[o + x]!;
      for (let x = 0; x < w; x++) {
        dst[o + x] = sum * inv;
        const add = x + r + 1, rem = x - r;
        if (add < w) sum += src[o + add]!;
        if (rem >= 0) sum -= src[o + rem]!;
      }
    }
    for (let x = 0; x < w; x++) {                                         // vertical
      let sum = 0;
      for (let y = -r; y <= r; y++) if (y >= 0 && y < h) sum += dst[y * w + x]!;
      for (let y = 0; y < h; y++) {
        src[y * w + x] = sum * inv;
        const add = y + r + 1, rem = y - r;
        if (add < h) sum += dst[add * w + x]!;
        if (rem >= 0) sum -= dst[rem * w + x]!;
      }
    }
  }
  void dst; dst = src;
  return dst;
}

/** Content moved by (dx, dy) pixels (bilinear), zero outside. */
export function shift(a: Float32Array, w: number, h: number, dx: number, dy: number): Float32Array {
  const out = new Float32Array(a.length);
  const ix = Math.floor(dx), iy = Math.floor(dy), fx = dx - ix, fy = dy - iy;
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : a[y * w + x]!);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const sx = x - ix, sy = y - iy;
    // out(x, y) = a(x - dx, y - dy)
    out[y * w + x] = at(sx, sy) * (1 - fx) * (1 - fy) + at(sx - 1, sy) * fx * (1 - fy) + at(sx, sy - 1) * (1 - fx) * fy + at(sx - 1, sy - 1) * fx * fy;
  }
  return out;
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

function toLayer(kind: LayerKind, ref: number, alpha: Float32Array, w: number, h: number, rgb?: Float32Array): CellLayer {
  if (isSoftLayer(kind)) {
    const half = downscaleF(alpha, w, h);
    const a = new Uint8Array(half.data.length);
    for (let i = 0; i < a.length; i++) a[i] = Math.round(clamp01(half.data[i]!) * 255);
    return { kind, ref, a, w: half.w, h: half.h, scale: 0.5 };
  }
  const a = new Uint8Array(alpha.length);
  for (let i = 0; i < a.length; i++) a[i] = Math.round(clamp01(alpha[i]!) * 255);
  let gray: Uint8Array | undefined;
  if (rgb) { gray = new Uint8Array(alpha.length); for (let i = 0; i < gray.length; i++) gray[i] = Math.round(clamp01(rgb[i]!) * 255); }
  return { kind, ref, a, gray, w, h, scale: 1 };
}

function downscaleF(a: Float32Array, w: number, h: number): { data: Float32Array; w: number; h: number } {
  const nw = Math.ceil(w / 2), nh = Math.ceil(h / 2);
  const out = new Float32Array(nw * nh);
  for (let y = 0; y < nh; y++) for (let x = 0; x < nw; x++) {
    let sum = 0, n = 0;
    for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
      const sx = x * 2 + dx, sy = y * 2 + dy;
      if (sx < w && sy < h) { sum += a[sy * w + sx]!; n++; }
    }
    out[y * nw + x] = sum / n;
  }
  return { data: out, w: nw, h: nh };
}

/** Coverage (0..1) of a layer at CELL pixel (x, y), whatever the layer's stored resolution. */
export function cellAlpha(l: CellLayer, cellW: number, x: number, y: number): number {
  const sx = Math.floor(x * l.scale), sy = Math.floor(y * l.scale);
  void cellW;
  return l.a[sy * l.w + sx]! / 255;
}

/** Whole-pixel shift (fast path used by the extrusion, which steps one pixel at a time). */
export function shiftRound(a: Float32Array, w: number, h: number, dx: number, dy: number): Float32Array {
  const out = new Float32Array(a.length);
  const ix = Math.round(dx), iy = Math.round(dy);
  for (let y = Math.max(0, iy); y < Math.min(h, h + iy); y++) {
    const sy = y - iy;
    const x0 = Math.max(0, ix), x1 = Math.min(w, w + ix);
    out.set(a.subarray(sy * w + x0 - ix, sy * w + x1 - ix), y * w + x0);
  }
  return out;
}

/** Pixel size of the margin a cell needs on every side. */
export const paddingPx = (style: ShapeStyle, emPx: number, stylePad: (s: ShapeStyle) => number): number => Math.ceil(stylePad(style) * emPx) + 2;

// ---------------------------------------------------------------------------------------------------------------------

/**
 * Rasterise the style stack for one shape into a w × h cell. `emPx` is the pixel size of 1 em (the element's font size or reference size).
 * Layers are returned back to front.
 */
export function rasterizeStack(src: MaskSource, w: number, h: number, style: ShapeStyle, emPx: number): CellLayer[] {
  const out: CellLayer[] = [];
  const face = src.mask(0, 'round');
  const outlines = style.outlines.filter((o) => o.enabled && o.width > 0);
  // outline i covers the shape grown by the thickness of rings 0..i
  let cum = 0;
  const rings = outlines.map((o) => { cum += o.width * emPx; return { o, grow: cum, mask: src.mask(cum, o.join) }; });
  const outer = rings.length ? rings[rings.length - 1]!.mask : face;
  const outerGrow = cum;

  // shadow & glow & extrusion are built from the outer silhouette
  let extAlpha: Float32Array | null = null;
  let extGray: Float32Array | null = null;
  if (style.extrusion.enabled && style.extrusion.depth > 0) {
    const depth = style.extrusion.depth * emPx;
    const a = (style.extrusion.angle * Math.PI) / 180;
    const steps = Math.max(1, Math.min(96, Math.ceil(depth)));
    const acc = new Float32Array(w * h), gray = new Float32Array(w * h), set = new Uint8Array(w * h);
    for (let k = 1; k <= steps; k++) {
      const d = (depth * k) / steps;
      const s = shiftRound(outer, w, h, Math.cos(a) * d, Math.sin(a) * d);
      const g = 1 - style.extrusion.shade * (k / steps);
      for (let i = 0; i < acc.length; i++) {
        const v = s[i]!;
        if (v > 0.02 && !set[i]) { gray[i] = g; set[i] = 1; }
        if (v > acc[i]!) acc[i] = v;
      }
    }
    extAlpha = acc; extGray = gray;
  }

  if (style.shadow.enabled) {
    const union = new Float32Array(w * h);
    for (let i = 0; i < union.length; i++) union[i] = Math.max(outer[i]!, extAlpha ? extAlpha[i]! : 0);
    const sh = shiftRound(union, w, h, style.shadow.dx * emPx, style.shadow.dy * emPx);
    out.push(toLayer('shadow', 0, blur(sh, w, h, Math.max(0, style.shadow.blur * emPx * 0.55)), w, h));
  }
  if (style.glow.enabled) {
    const reach = src.mask(outerGrow + style.glow.radius * emPx * 0.55, 'round');
    const g = blur(reach, w, h, style.glow.radius * emPx * 0.5);
    const k = 0.7 + 0.8 * style.glow.strength;
    // the halo exists only outside the shape: its light must never wash over the letters it surrounds
    for (let i = 0; i < g.length; i++) g[i] = Math.min(1, g[i]! * k) * (1 - outer[i]!);
    out.push(toLayer('glow', 0, g, w, h));
  }
  if (extAlpha && extGray) out.push(toLayer('extrusion', 0, extAlpha, w, h, extGray));
  for (let i = rings.length - 1; i >= 0; i--) out.push(toLayer('outline', i, rings[i]!.mask, w, h));
  out.push(toLayer('face', 0, face, w, h));

  if (style.innerHighlight.enabled && style.innerHighlight.alpha > 0) {
    const s = Math.max(1, style.innerHighlight.size * emPx);
    const a = ((style.innerHighlight.angle + 180) * Math.PI) / 180;
    const moved = shift(face, w, h, Math.cos(a) * s, Math.sin(a) * s);
    const rim = new Float32Array(w * h);
    for (let i = 0; i < rim.length; i++) rim[i] = clamp01(face[i]! - moved[i]!);
    out.push(toLayer('highlight', 0, blur(rim, w, h, Math.max(0.5, s * 0.3)), w, h));
  }

  if (style.bevel.enabled && style.bevel.depth > 0) {
    const r = Math.max(1, style.bevel.size * emPx);
    const height = blur(face, w, h, r * 0.6);
    const elev = Math.PI / 4;
    const la = (style.bevel.angle * Math.PI) / 180;
    const lx = Math.cos(la) * Math.cos(elev), ly = Math.sin(la) * Math.cos(elev), lz = Math.sin(elev);
    const hi = new Float32Array(w * h), lo = new Float32Array(w * h);
    const k = style.bevel.depth * r * 2.4;
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const f = face[i]!;
      if (f <= 0) continue;
      const dx = (height[i + 1]! - height[i - 1]!) * 0.5, dy = (height[i + w]! - height[i - w]!) * 0.5;
      let nx = -dx * k, ny = -dy * k;
      const inv = 1 / Math.sqrt(nx * nx + ny * ny + 1);
      nx *= inv; ny *= inv;
      const nz = inv;
      const lit = nx * lx + ny * ly + nz * lz;
      const delta = (lit - lz) * 2.2;
      if (delta > 0) hi[i] = clamp01(delta) * f; else lo[i] = clamp01(-delta) * f;
    }
    out.push(toLayer('bevelLight', 0, hi, w, h));
    out.push(toLayer('bevelShade', 0, lo, w, h));
  }
  return out;
}

/** The gradient/fill each layer is drawn with, read from the CURRENT style (so colour edits are instant). */
export function layerFill(style: ShapeStyle, kind: LayerKind, ref: number): Gradient {
  switch (kind) {
    case 'face': return style.face;
    case 'outline': return style.outlines.filter((o) => o.enabled && o.width > 0)[ref]!.fill;
    case 'extrusion': return style.extrusion.fill;
    case 'glow': return style.glow.fill;
    case 'shadow': return solid(style.shadow.color, style.shadow.alpha);
    case 'highlight': return solid(style.innerHighlight.color, style.innerHighlight.alpha);
    case 'bevelLight': return solid(style.bevel.light, 1);
    case 'bevelShade': return solid(style.bevel.shade, 1);
  }
}

/** Soft layers are stored at half resolution (they are blurred anyway). */
export const isSoftLayer = (k: LayerKind): boolean => k === 'shadow' || k === 'glow';
export const isEmissiveLayer = (k: LayerKind, style: ShapeStyle): boolean => k === 'glow' && style.glow.bloom;

// ---------------------------------------------------------------------------------------------------------------------
// Atlas packing: many cells, one texture per layer

export interface CellRect { x: number; y: number; w: number; h: number }

/** Shelf-pack cells of the given sizes into rows no wider than maxWidth. */
export function packCells(sizes: { w: number; h: number }[], maxWidth = 2048, gap = 2): { rects: CellRect[]; width: number; height: number } {
  // every size and position stays even, so half-resolution layers line up exactly with the full-resolution ones
  const rects: CellRect[] = [];
  let x = 0, y = 0, rowH = 0, width = 0;
  for (const s of sizes) {
    if (x > 0 && x + s.w > maxWidth) { x = 0; y += rowH + gap; rowH = 0; }
    rects.push({ x, y, w: s.w, h: s.h });
    x += s.w + gap; rowH = Math.max(rowH, s.h); width = Math.max(width, x);
  }
  const even = (v: number) => v + (v % 2);
  return { rects, width: even(Math.max(2, width - gap)), height: even(Math.max(2, y + rowH)) };
}

export { outlineReach };
