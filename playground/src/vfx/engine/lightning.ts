import type { Rng } from '../../core/util/prng';

export interface Pt { x: number; y: number }

/** Midpoint-displacement polyline from a to b: each level halves the segment and nudges its midpoint sideways. */
export function jag(rng: Rng, a: Pt, b: Pt, disp: number, depth: number, falloff = 0.55): Pt[] {
  let pts: Pt[] = [a, b];
  let d = disp;
  for (let level = 0; level < depth; level++) {
    const next: Pt[] = [pts[0]!];
    for (let i = 0; i < pts.length - 1; i++) {
      const p = pts[i]!, q = pts[i + 1]!;
      const dx = q.x - p.x, dy = q.y - p.y;
      const len = Math.hypot(dx, dy) || 1;
      const off = (rng.next() * 2 - 1) * d * Math.min(1, len / (disp * 2.2) + 0.25);
      next.push({ x: (p.x + q.x) / 2 - (dy / len) * off, y: (p.y + q.y) / 2 + (dx / len) * off }, q);
    }
    pts = next;
    d *= falloff;
  }
  return pts;
}

export interface Arc { pts: Pt[]; /** 0 = trunk, 1 = branch, 2 = twig */ level: number; /** fraction of the parent's length where this arc leaves it */ at: number }

/**
 * A branching discharge: a jagged trunk from `origin` toward angle `angle` (length `reach`), with branches and twigs
 * leaving it at irregular points and sharp angles. Pure function of the rng, so a given seed always draws the same bolt.
 */
export function discharge(rng: Rng, origin: Pt, angle: number, reach: number, branchiness = 1): Arc[] {
  const arcs: Arc[] = [];
  const tip = { x: origin.x + Math.cos(angle) * reach, y: origin.y + Math.sin(angle) * reach };
  const trunk = jag(rng, origin, tip, reach * 0.16, 6);
  arcs.push({ pts: trunk, level: 0, at: 0 });
  const sprout = (parent: Pt[], level: number, lenMul: number, depth: number, chance: number) => {
    for (let i = 3; i < parent.length - 2; i++) {
      if (rng.next() > chance) continue;
      const base = parent[i]!;
      const prev = parent[Math.max(0, i - 2)]!;
      const dir = Math.atan2(base.y - prev.y, base.x - prev.x) + rng.sign() * rng.range(0.35, 0.95);
      const len = reach * lenMul * rng.range(0.45, 1);
      const end = { x: base.x + Math.cos(dir) * len, y: base.y + Math.sin(dir) * len };
      const pts = jag(rng, base, end, len * 0.2, depth);
      arcs.push({ pts, level, at: i / (parent.length - 1) });
      if (level === 1 && branchiness > 0.4) sprout(pts, 2, 0.34, 3, 0.04 * branchiness);
    }
  };
  sprout(trunk, 1, 0.34, 5, 0.035 * branchiness);
  return arcs;
}

/** Cumulative length fractions along a polyline (0..1). */
export function cumulative(pts: Pt[]): number[] {
  const out = [0];
  let acc = 0;
  for (let i = 1; i < pts.length; i++) { acc += Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y); out.push(acc); }
  const total = acc || 1;
  return out.map((v) => v / total);
}

/** The part of a polyline between fractions [from, to] of its length, with interpolated end points. */
export function slice(pts: Pt[], from: number, to: number): Pt[] {
  if (to <= from) return [];
  const cum = cumulative(pts);
  const at = (f: number): Pt => {
    for (let i = 1; i < pts.length; i++) {
      if (cum[i]! >= f) {
        const k = (f - cum[i - 1]!) / Math.max(1e-9, cum[i]! - cum[i - 1]!);
        return { x: pts[i - 1]!.x + (pts[i]!.x - pts[i - 1]!.x) * k, y: pts[i - 1]!.y + (pts[i]!.y - pts[i - 1]!.y) * k };
      }
    }
    return pts[pts.length - 1]!;
  };
  const out: Pt[] = [at(from)];
  for (let i = 0; i < pts.length; i++) if (cum[i]! > from && cum[i]! < to) out.push(pts[i]!);
  out.push(at(to));
  return out;
}

/**
 * Append a lightning ribbon (triangles) for the polyline to `out` as x, y, side, halfW, coreW, intensity per vertex.
 * `core` is the white-hot core's width; the ribbon's half extent is wide enough to hold the glow halo.
 * Width tapers toward the tip so every arc ends in a point.
 */
export function ribbon(out: number[], pts: Pt[], core: number, intensity: number, taperTip = true, rootSoft = false, rootMin = 0.3, rootLen = 0.2, haloMult = 9): void {
  const n = pts.length;
  if (n < 2) return;
  const cum = cumulative(pts);
  const nx: number[] = [], ny: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)]!, b = pts[Math.min(n - 1, i + 1)]!;
    const dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy) || 1;
    nx.push(-dy / l); ny.push(dx / l);
  }
  const w = (i: number) => {
    const u = cum[i]!;
    let k = 1;
    if (taperTip) k *= 0.2 + 0.8 * (1 - u) ** 0.7;
    return core * k;
  };
  const vert = (i: number, side: number) => {
    const cw = w(i), hw = cw * haloMult;
    const u = cum[i]!;
    const rootFade = rootSoft ? rootMin + (1 - rootMin) * Math.min(1, u / rootLen) : 1;   // many arcs share a root: keep their overlap from clipping to white
    out.push(pts[i]!.x + nx[i]! * hw * side, pts[i]!.y + ny[i]! * hw * side, side, hw, cw, intensity * rootFade * (1 - 0.4 * u));
  };
  for (let i = 0; i < n - 1; i++) {
    vert(i, -1); vert(i, 1); vert(i + 1, -1);
    vert(i, 1); vert(i + 1, 1); vert(i + 1, -1);
  }
}
