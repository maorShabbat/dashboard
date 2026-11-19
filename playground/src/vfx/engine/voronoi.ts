import { makeRng } from '../../core/util/prng';

export interface P2 { x: number; y: number }

export interface ShardGeom {
  /** Convex polygon (counter-clockwise), local coordinates relative to the region centre. */
  poly: P2[];
  /** Centroid (local). */
  c: P2;
  area: number;
  /** For each polygon edge i → i+1: true when it lies on the region's outer boundary. */
  border: boolean[];
}

export interface Fracture {
  shards: ShardGeom[];
  /** Interior edges shared by two shards (local), for drawing cracks. */
  cracks: { a: P2; b: P2; mid: P2 }[];
  /** Largest distance from the impact point to any shard centroid. */
  reach: number;
}

/** Clip a convex polygon by the half-plane { p : (p − m)·n ≤ 0 } (Sutherland–Hodgman against one plane). */
function clip(poly: P2[], m: P2, n: P2): P2[] {
  const out: P2[] = [];
  const side = (p: P2) => (p.x - m.x) * n.x + (p.y - m.y) * n.y;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!, b = poly[(i + 1) % poly.length]!;
    const sa = side(a), sb = side(b);
    if (sa <= 0) out.push(a);
    if ((sa < 0 && sb > 0) || (sa > 0 && sb < 0)) {
      const t = sa / (sa - sb);
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
  }
  return out;
}

function areaCentroid(poly: P2[]): { area: number; c: P2 } {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]!, q = poly[(i + 1) % poly.length]!;
    const cr = p.x * q.y - q.x * p.y;
    a += cr; cx += (p.x + q.x) * cr; cy += (p.y + q.y) * cr;
  }
  a /= 2;
  if (Math.abs(a) < 1e-12) return { area: 0, c: poly[0] ?? { x: 0, y: 0 } };
  return { area: Math.abs(a), c: { x: cx / (6 * a), y: cy / (6 * a) } };
}

/**
 * Radial fracture of a w × h region: Voronoi cells of sites that are dense near the impact point and sparse toward the edges
 * (like glass struck at a point), so the shards are small and angular at the centre and large at the rim — never a grid.
 * Deterministic for (w, h, n, seed).
 */
export function fracture(w: number, h: number, n: number, seed: number, impact: P2 = { x: 0, y: 0 }, accept?: (x: number, y: number) => boolean): Fracture {
  const rng = makeRng(seed);
  const hw = w / 2, hh = h / 2;
  const Rmax = Math.hypot(hw + Math.abs(impact.x), hh + Math.abs(impact.y));
  const sites: P2[] = [];
  const base = Math.sqrt((w * h) / n);
  let tries = 0;
  const golden = 2.399963;
  while (sites.length < n && tries < n * 400) {
    tries++;
    const k = sites.length;
    const u = rng.next();
    const r = Rmax * Math.pow(u, 1.55);
    const ang = k * golden + (rng.next() - 0.5) * 1.1;
    const p = { x: impact.x + Math.cos(ang) * r, y: impact.y + Math.sin(ang) * r };
    if (Math.abs(p.x) > hw * 0.985 || Math.abs(p.y) > hh * 0.985) continue;
    if (accept && !accept(p.x, p.y)) continue;           // sites only inside the object's real silhouette
    const rr = Math.hypot(p.x - impact.x, p.y - impact.y) / Rmax;
    const dmin = base * (0.3 + 0.55 * rr) * (tries > n * 200 ? 0.5 : 1);
    if (sites.some((s) => Math.hypot(s.x - p.x, s.y - p.y) < dmin)) continue;
    sites.push(p);
  }
  const rect: P2[] = [{ x: -hw, y: -hh }, { x: hw, y: -hh }, { x: hw, y: hh }, { x: -hw, y: hh }];
  const shards: ShardGeom[] = [];
  for (let i = 0; i < sites.length; i++) {
    let poly = rect;
    const si = sites[i]!;
    for (let j = 0; j < sites.length && poly.length >= 3; j++) {
      if (i === j) continue;
      const sj = sites[j]!;
      poly = clip(poly, { x: (si.x + sj.x) / 2, y: (si.y + sj.y) / 2 }, { x: sj.x - si.x, y: sj.y - si.y });
    }
    if (poly.length < 3) continue;
    const { area, c } = areaCentroid(poly);
    if (area < 1e-6) continue;
    const eps = 1e-6;
    const border = poly.map((p, k) => {
      const q = poly[(k + 1) % poly.length]!;
      return (Math.abs(p.x - hw) < eps && Math.abs(q.x - hw) < eps) || (Math.abs(p.x + hw) < eps && Math.abs(q.x + hw) < eps)
        || (Math.abs(p.y - hh) < eps && Math.abs(q.y - hh) < eps) || (Math.abs(p.y + hh) < eps && Math.abs(q.y + hh) < eps);
    });
    shards.push({ poly, c, area, border });
  }
  // unique interior edges for cracks
  const cracks: Fracture['cracks'] = [];
  const seen = new Set<string>();
  const key = (p: P2, q: P2) => {
    const a = `${Math.round(p.x * 1e4)},${Math.round(p.y * 1e4)}`, b = `${Math.round(q.x * 1e4)},${Math.round(q.y * 1e4)}`;
    return a < b ? `${a}|${b}` : `${b}|${a}`;
  };
  for (const s of shards) {
    s.poly.forEach((p, k) => {
      if (s.border[k]) return;
      const q = s.poly[(k + 1) % s.poly.length]!;
      const kk = key(p, q);
      if (seen.has(kk)) return;
      seen.add(kk);
      if (Math.hypot(p.x - q.x, p.y - q.y) < 1e-4) return;
      cracks.push({ a: p, b: q, mid: { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 } });
    });
  }
  let reach = 0;
  for (const s of shards) reach = Math.max(reach, Math.hypot(s.c.x - impact.x, s.c.y - impact.y));
  return { shards, cracks, reach: reach || 1 };
}
