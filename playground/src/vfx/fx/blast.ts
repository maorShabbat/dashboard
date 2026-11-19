/**
 * Shared kit for the explosion family: where the symbol is (icon only, or the whole square cell with its frame), where things are
 * emitted, and the building blocks every blast uses: a flash, shock rings, spark streaks, rising embers and flying debris.
 */
import type { Frame, RGB } from '../engine/frame';
import { clamp, easeOutCubic, h1, lerp, smoothstep } from '../engine/math';
import type { ObjectInfo } from '../engine/object';
import { n, s, type EffectCtx, type PValues } from './effect';
import { GROW, getFracture } from './fragment';
import { drawIcon, iconDims } from './helpers';

export interface Blast {
  obj: ObjectInfo;
  /** Icon centre and extent, scene units. */
  Cx: number; Cy: number; W: number; H: number; size: number;
  /** 'icon': effects follow the icon's own pixels. 'cell': they fill the square cell around it (frame included). */
  area: 'icon' | 'cell';
  /** Half side of the cell square. */
  half: number;
  ctx: EffectCtx;
}

export function blast(p: PValues, ctx: EffectCtx): Blast | null {
  const obj = ctx.object;
  if (!obj) return null;
  const size = n(p, 'size'), { w, h } = iconDims(obj, size);
  const area = s(p, 'area') === 'cell' ? 'cell' : 'icon';
  const half = (size * (p.cell !== undefined ? n(p, 'cell') : 1.15)) / 2;
  return { obj, Cx: n(p, 'cx') * ctx.aspect, Cy: n(p, 'cy'), W: w, H: h, size, area, half, ctx };
}

/** A point to emit from for random numbers a, b ∈ [0, 1): on the icon's pixels, or anywhere in the cell square. */
export function emitAt(b: Blast, a: number, c: number): { x: number; y: number } {
  if (b.area === 'cell') return { x: b.Cx + (a - 0.5) * 2 * b.half, y: b.Cy + (c - 0.5) * 2 * b.half };
  if (b.ctx.silhouette) return b.ctx.silhouette.sample(a, c);
  return { x: b.Cx + (a - 0.5) * b.W * 0.8, y: b.Cy + (c - 0.5) * b.H * 0.8 };
}
/** Radius that covers the thing being destroyed: the cell, or the icon. */
export const reach = (b: Blast): number => (b.area === 'cell' ? b.half * 1.25 : Math.max(b.W, b.H) * 0.62);

export function flash(f: Frame, x: number, y: number, r: number, col: RGB, k: number): void {
  if (k <= 0.01) return;
  f.additive.push({ x, y, hw: r, hh: r, rot: 0, type: 3, color: col, intensity: 1.6 * k });
  f.additive.push({ x, y, hw: r * 2.1, hh: r * 2.1, rot: 0.3, type: 2, color: col, intensity: 0.9 * k });
}

export function ring(f: Frame, x: number, y: number, r: number, col: RGB, k: number, thick = 0.1): void {
  if (k <= 0.01) return;
  f.additive.push({ x, y, hw: r, hh: r, rot: 0, type: 1, color: col, intensity: 0.75 * k, e1: thick * 2.2 });
}

/** Streaking sparks thrown out of the area, pulled down by gravity, slowed by drag. */
export function sparks(f: Frame, b: Blast, t: number, t0: number, life: number, count: number, col: RGB, speed: number, gravity: number, seed: number): void {
  for (let i = 0; i < count; i++) {
    const st = t0 + h1(seed + i * 7) * 0.12, tl = t - st, lf = life * lerp(0.55, 1, h1(seed + i * 7 + 1));
    if (tl <= 0 || tl >= lf) continue;
    const u = tl / lf;
    const o = emitAt(b, h1(seed + i * 7 + 2), h1(seed + i * 7 + 3));
    const ang = h1(seed + i * 7 + 4) * Math.PI * 2, v = speed * lerp(0.35, 1, h1(seed + i * 7 + 5)), k = 3.2;
    const trav = (1 - Math.exp(-k * tl)) / k;
    const vx = Math.cos(ang) * v, vy = Math.sin(ang) * v;
    const x = o.x + vx * trav, y = o.y + vy * trav + 0.5 * gravity * tl * tl;
    const dx = vx * Math.exp(-k * tl), dy = vy * Math.exp(-k * tl) + gravity * tl, dir = Math.atan2(dy, dx), len = clamp(Math.hypot(dx, dy) * 0.07, 0.012, 0.09);
    f.additive.push({ x: x - Math.cos(dir) * len * 0.88, y: y - Math.sin(dir) * len * 0.88, hw: len, hh: 0.0035, rot: dir, type: 4, color: col, intensity: 1.1 * (1 - smoothstep(0.4, 1, u)), e1: 1.5 });
  }
}

/** Glowing embers that drift up and flicker out. */
export function embers(f: Frame, b: Blast, t: number, t0: number, life: number, count: number, col: RGB, up: number, seed: number): void {
  for (let i = 0; i < count; i++) {
    const st = t0 + h1(seed + i * 5) * life * 0.6, tl = t - st, lf = life * lerp(0.5, 1, h1(seed + i * 5 + 1));
    if (tl <= 0 || tl >= lf) continue;
    const u = tl / lf;
    const o = emitAt(b, h1(seed + i * 5 + 2), h1(seed + i * 5 + 3));
    const x = o.x + (h1(seed + i * 5 + 4) - 0.5) * 0.12 * easeOutCubic(u) + Math.sin(tl * 6 + i) * 0.007;
    const y = o.y - up * easeOutCubic(u) * (0.5 + h1(seed + i * 7));
    const r = lerp(0.005, 0.012, h1(seed + i * 11)) * (1 - 0.5 * u);
    f.additive.push({ x, y, hw: r * 2.6, hh: r * 2.6, rot: 0, type: 0, color: col, intensity: 1.2 * (1 - smoothstep(0.35, 1, u)) * (0.75 + 0.25 * Math.sin(tl * 31 + i * 3)), e1: 2.2 });
  }
}

export interface Debris { pieces: number; force: number; gravity: number; since: number; life: number; shade?: number; glint?: number; spin?: number }
/** The icon's own pixels as fragments flung outward from its centre of mass (uses the same fracture as the Shatter and Explode effects). */
export function debris(f: Frame, b: Blast, d: Debris): void {
  const { obj, Cx, Cy, W, H } = b;
  f.shardTex = obj.tex ?? null;
  const { fr, stats, impact } = getFracture(obj, W, H, d.pieces);
  const sec = d.since;
  fr.shards.forEach((g, i) => {
    const st = stats[i]!;
    if (st.mass <= 0) return;
    const hh = (k: number) => h1(i * 29 + k + 400);
    const dx = st.pivot.x - impact.x, dy = st.pivot.y - impact.y, d0 = Math.hypot(dx, dy);
    const ang = (d0 > 1e-3 ? Math.atan2(dy, dx) : hh(1) * 6.283) + (hh(2) - 0.5) * 0.9;
    const sn = sec / (d.life * lerp(0.7, 1, hh(3)));
    if (sn >= 1) return;
    const alpha = (1 - smoothstep(0.35, 1, sn)) ** 1.1;
    const v = d.force * lerp(1.1, 0.5, st.sizeN) * (0.6 + 0.8 * hh(4));
    const travel = (1 - Math.exp(-sec * 4.5)) / 4.5;
    const ox = Math.cos(ang) * v * travel, oy = Math.sin(ang) * v * travel + 0.5 * d.gravity * sec * sec;
    const theta = (hh(5) - 0.5) * 16 * sec * (d.spin ?? 1), cs = Math.cos(theta), sn2 = Math.sin(theta);
    const shade = lerp(1.6, 0.35, smoothstep(0, 0.6, sn)) * (d.shade ?? 1);
    const Pw = { x: Cx + st.pivot.x, y: Cy + st.pivot.y };
    const place2 = (lx: number, ly: number): [number, number] => { const rx = lx - st.pivot.x, ry = ly - st.pivot.y; return [Pw.x + ox + cs * rx - sn2 * ry, Pw.y + oy + sn2 * rx + cs * ry]; };
    const c2 = place2(g.c.x, g.c.y), uv = (lx: number, ly: number): [number, number] => [lx / W + 0.5, ly / H + 0.5], cuv = uv(g.c.x, g.c.y);
    const np = g.poly.length;
    const grown = g.poly.map((q) => { const vx = q.x - g.c.x, vy = q.y - g.c.y, l = Math.hypot(vx, vy) || 1; return { x: q.x + (vx / l) * GROW, y: q.y + (vy / l) * GROW }; });
    const glint = (d.glint ?? 0.8) * Math.exp(-sec * 6);
    for (let k = 0; k < np; k++) {
      const A = grown[k]!, B = grown[(k + 1) % np]!, a2 = place2(A.x, A.y), b2 = place2(B.x, B.y), ua = uv(A.x, A.y), ub = uv(B.x, B.y);
      f.shards.push(c2[0], c2[1], cuv[0], cuv[1], 1, shade, glint, alpha, a2[0], a2[1], ua[0], ua[1], 0, shade, glint, alpha, b2[0], b2[1], ub[0], ub[1], 0, shade, glint, alpha);
    }
  });
}

/** The icon, swelling and heating up, until `until`. Returns true while it is still drawn. */
export function swell(f: Frame, b: Blast, t: number, until: number, col: RGB, amount = 0.2): boolean {
  if (t >= until) return false;
  const u = clamp(t / until), sw = 1 + amount * u * u + Math.sin(u * 46) * 0.008 * u;
  drawIcon(f, b.obj, { cx: b.Cx, cy: b.Cy, size: b.size, sx: sw, sy: sw, bright: 1 + 1.3 * u * u, tint: [1, 1 - 0.1 * u, 1 - 0.3 * u] });
  f.additive.push({ x: b.Cx, y: b.Cy, hw: b.size * 0.7 * u, hh: b.size * 0.7 * u, rot: 0, type: 0, color: col, intensity: 0.8 * u, e1: 1.5 });
  return true;
}
