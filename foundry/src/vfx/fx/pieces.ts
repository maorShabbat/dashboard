/**
 * Pieces of the screen: a picture cut into polygons (Voronoi cells like broken glass, or slabs cut along straight lines) that can be
 * drawn moved, turned and faded while the other screen shows through where they were.
 */
import { SCREEN_A, type Frame, type RGB, type TexRef } from '../engine/frame';
import { h1 } from '../engine/math';

export interface Pt { x: number; y: number }
export interface Piece { poly: Pt[]; c: Pt; area: number; id: number }

/** Keep the part of a convex polygon where dot(p - o, n) >= 0. */
function clip(poly: Pt[], o: Pt, n: Pt): Pt[] {
  const out: Pt[] = [];
  const side = (p: Pt) => (p.x - o.x) * n.x + (p.y - o.y) * n.y;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!, b = poly[(i + 1) % poly.length]!, sa = side(a), sb = side(b);
    if (sa >= 0) out.push(a);
    if ((sa >= 0) !== (sb >= 0)) { const t = sa / (sa - sb); out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }); }
  }
  return out;
}

function make(poly: Pt[], id: number): Piece | null {
  if (poly.length < 3) return null;
  let a = 0, cx = 0, cy = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]!, q = poly[(i + 1) % poly.length]!, k = p.x * q.y - q.x * p.y;
    a += k; cx += (p.x + q.x) * k; cy += (p.y + q.y) * k;
  }
  if (Math.abs(a) < 1e-9) return null;
  a /= 2;
  return { poly, c: { x: cx / (6 * a), y: cy / (6 * a) }, area: Math.abs(a), id };
}

const rect = (aspect: number): Pt[] => [{ x: 0, y: 0 }, { x: aspect, y: 0 }, { x: aspect, y: 1 }, { x: 0, y: 1 }];

const cache = new Map<string, Piece[]>();
const remember = (key: string, build: () => Piece[]): Piece[] => {
  let v = cache.get(key);
  if (!v) { v = build(); cache.set(key, v); if (cache.size > 12) cache.delete(cache.keys().next().value as string); }
  return v;
};

/** Cells like broken glass: small and dense around `centre` (the point of impact), larger toward the edges. */
export function voronoiPieces(aspect: number, count: number, seed: number, centre: Pt, power = 1.5): Piece[] {
  return remember(`v|${aspect.toFixed(3)}|${count}|${seed}|${centre.x.toFixed(3)},${centre.y.toFixed(3)}|${power}`, () => {
    const cols = Math.max(2, Math.round(Math.sqrt(count * aspect))), rows = Math.max(2, Math.round(count / cols));
    const maxR = Math.hypot(Math.max(centre.x, aspect - centre.x), Math.max(centre.y, 1 - centre.y));
    const sites: Pt[] = [];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const x = ((c + 0.12 + 0.76 * h1(seed * 7 + r * 31 + c * 17 + 1)) / cols) * aspect, y = (r + 0.12 + 0.76 * h1(seed * 7 + r * 31 + c * 17 + 2)) / rows;
      const dx = x - centre.x, dy = y - centre.y, len = Math.hypot(dx, dy) || 1e-6, l2 = maxR * (len / maxR) ** power;
      sites.push({ x: Math.min(aspect, Math.max(0, centre.x + (dx / len) * l2)), y: Math.min(1, Math.max(0, centre.y + (dy / len) * l2)) });
    }
    const out: Piece[] = [];
    sites.forEach((si, i) => {
      let poly = rect(aspect);
      for (let j = 0; j < sites.length && poly.length >= 3; j++) {
        if (j === i) continue;
        const sj = sites[j]!;
        poly = clip(poly, { x: (si.x + sj.x) / 2, y: (si.y + sj.y) / 2 }, { x: si.x - sj.x, y: si.y - sj.y });
      }
      const p = make(poly, i);
      if (p) out.push(p);
    });
    return out;
  });
}

export interface Cut { x: number; y: number; angle: number }
/** Slabs: the screen cut along straight lines (each through a point, at an angle). */
export function linePieces(aspect: number, cuts: Cut[]): Piece[] {
  return remember(`l|${aspect.toFixed(3)}|${cuts.map((c) => `${c.x.toFixed(3)},${c.y.toFixed(3)},${c.angle.toFixed(3)}`).join(';')}`, () => {
    let polys: Pt[][] = [rect(aspect)];
    for (const c of cuts) {
      const o = { x: c.x, y: c.y }, n = { x: -Math.sin(c.angle), y: Math.cos(c.angle) };
      const next: Pt[][] = [];
      for (const p of polys) { next.push(clip(p, o, n), clip(p, o, { x: -n.x, y: -n.y })); }
      polys = next.filter((p) => p.length >= 3);
    }
    return polys.map((p, i) => make(p, i)).filter((p): p is Piece => !!p && p.area > 1e-5);
  });
}

export interface PieceXform { dx: number; dy: number; rot: number; scale: number; alpha: number; shade: number; glint: number }

/** Draw pieces of a screen (`tex` is SCREEN_A or SCREEN_B) moved by `xf`; return nothing for a piece that is not shown. */
export function drawPieces(f: Frame, tex: TexRef, pieces: Piece[], aspect: number, xf: (p: Piece) => PieceXform | null, opts: { grow?: number; tint?: [number, number, number, number]; accent?: RGB; glass?: number } = {}): void {
  const grow = opts.grow ?? 0.0025, verts: number[] = [];
  for (const p of pieces) {
    const x = xf(p);
    if (!x || x.alpha <= 0.004) continue;
    const c = Math.cos(x.rot), sn = Math.sin(x.rot);
    const place = (q: Pt): [number, number] => {
      const vx = q.x - p.c.x, vy = q.y - p.c.y, l = Math.hypot(vx, vy) || 1;
      const gx = vx + (vx / l) * grow, gy = vy + (vy / l) * grow;
      return [p.c.x + x.dx + (c * gx - sn * gy) * x.scale, p.c.y + x.dy + (sn * gx + c * gy) * x.scale];
    };
    const C = place(p.c), n = p.poly.length;
    for (let k = 0; k < n; k++) {
      const a = p.poly[k]!, b = p.poly[(k + 1) % n]!, A = place(a), B = place(b);
      verts.push(C[0], C[1], p.c.x / aspect, p.c.y, 1, x.shade, x.glint, x.alpha, A[0], A[1], a.x / aspect, a.y, 0, x.shade, x.glint, x.alpha, B[0], B[1], b.x / aspect, b.y, 0, x.shade, x.glint, x.alpha);
    }
  }
  if (verts.length) f.shardSets.push({ tex, verts, tint: opts.tint, glass: opts.glass });
  if (opts.accent) f.boltGlow = opts.accent;
}

/** A thin quad along a segment (for crack lines). */
export function segment(out: number[], a: Pt, b: Pt, w: number, col: RGB, al: number): void {
  const dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy) || 1, nx = (-dy / l) * w * 0.5, ny = (dx / l) * w * 0.5;
  const v = (x: number, y: number) => out.push(x, y, col[0], col[1], col[2], al);
  v(a.x + nx, a.y + ny); v(a.x - nx, a.y - ny); v(b.x + nx, b.y + ny);
  v(a.x - nx, a.y - ny); v(b.x - nx, b.y - ny); v(b.x + nx, b.y + ny);
}

export { SCREEN_A };
