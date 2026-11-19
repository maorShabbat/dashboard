import { enm, num } from '../../core/params';
import { makeRng } from '../../core/util/prng';
import { n, s, type ShowEffect } from './effect';
import type { Frame, RGB } from '../engine/frame';
import { jag, ribbon, type Pt } from '../engine/lightning';
import { clamp, easeInQuad, easeOutCubic, h1, lerp, mixRGB, smoothstep } from '../engine/math';
import { maskAt, type ObjectInfo } from '../engine/object';
import { fracture, type Fracture, type P2 } from '../engine/voronoi';

const G = (group: string) => ({ section: 'Effect', group });
const ACCENTS: Record<string, RGB> = { gold: [1, 0.78, 0.3], cyan: [0.35, 0.9, 1], magenta: [1, 0.4, 0.85], white: [1, 1, 1] };
const SEED = 4242;
/** Fragments are drawn this much (scene units ≈ 1 px) larger than their cell so neighbours overlap and the intact object shows no seams. */
export const GROW = 0.0011;

export interface Stat { mass: number; pivot: P2; sizeN: number }
export interface Cached { fr: Fracture; stats: Stat[]; impact: P2; core: P2; runs: { pts: Pt[]; d: number }[] }
const cache = new Map<string, Cached>();

/** The object's real silhouette decides everything: where the fracture sites go, what the pivots are, where cracks may glow. */
export function getFracture(obj: ObjectInfo, W: number, H: number, count: number): Cached {
  const key = `${obj.id}|${W.toFixed(3)}|${H.toFixed(3)}|${count}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const alpha = (x: number, y: number) => maskAt(obj, x / W + 0.5, y / H + 0.5);
  // alpha-weighted centre of mass = the impact point
  let sx = 0, sy = 0, sm = 0;
  for (let y = 0; y < obj.mh; y++) for (let x = 0; x < obj.mw; x++) {
    const a = obj.mask[y * obj.mw + x]! / 255;
    if (a < 0.02) continue;
    sx += ((x + 0.5) / obj.mw - 0.5) * W * a; sy += ((y + 0.5) / obj.mh - 0.5) * H * a; sm += a;
  }
  const impact: P2 = sm > 0 ? { x: sx / sm, y: sy / sm } : { x: 0, y: 0 };
  let fr = fracture(W, H, count, SEED, impact, (x, y) => alpha(x, y) > 0.5);
  if (fr.shards.length < Math.max(6, count / 3)) fr = fracture(W, H, count, SEED, impact, (x, y) => alpha(x, y) > 0.1);
  // assign every opaque mask cell to the shard polygon containing it: mass (visible pixels) and alpha-weighted pivot per shard
  const inside = (poly: P2[], x: number, y: number) => {
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i]!, b = poly[(i + 1) % poly.length]!;
      if ((b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x) < -1e-9) return false;
    }
    return true;
  };
  const acc = fr.shards.map(() => ({ mass: 0, x: 0, y: 0 }));
  for (let y = 0; y < obj.mh; y++) for (let x = 0; x < obj.mw; x++) {
    const a = obj.mask[y * obj.mw + x]! / 255;
    if (a <= 0) continue;
    const lx = ((x + 0.5) / obj.mw - 0.5) * W, ly = ((y + 0.5) / obj.mh - 0.5) * H;
    for (let i = 0; i < fr.shards.length; i++) {
      if (inside(fr.shards[i]!.poly, lx, ly)) { const q = acc[i]!; q.mass += a; q.x += lx * a; q.y += ly * a; break; }
    }
  }
  const maxMass = Math.max(1e-6, ...acc.map((q) => q.mass));
  const stats: Stat[] = acc.map((q, i) => ({ mass: q.mass, pivot: q.mass > 0 ? { x: q.x / q.mass, y: q.y / q.mass } : fr.shards[i]!.c, sizeN: Math.sqrt(q.mass / maxMass) }));
  // a point of the object near its centre of mass that is actually opaque (for the inner glow)
  let core: P2 = impact, best = Infinity;
  for (let y = 0; y < obj.mh; y++) for (let x = 0; x < obj.mw; x++) {
    if (obj.mask[y * obj.mw + x]! < 200) continue;
    const lx = ((x + 0.5) / obj.mw - 0.5) * W, ly = ((y + 0.5) / obj.mh - 0.5) * H, d = Math.hypot(lx - impact.x, ly - impact.y);
    if (d < best) { best = d; core = { x: lx, y: ly }; }
  }
  // cracks: the shared cell edges, jagged, and cut down to the parts that lie inside the silhouette
  const runs: Cached['runs'] = [];
  fr.cracks.forEach((c, i) => {
    const len = Math.hypot(c.b.x - c.a.x, c.b.y - c.a.y);
    const pts = jag(makeRng(SEED + i * 17), c.a, c.b, len * 0.07, 2);
    let cur: Pt[] = [];
    for (let k = 0; k < pts.length - 1; k++) {
      const a = pts[k]!, b = pts[k + 1]!, steps = Math.max(2, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 0.008));
      for (let j = 0; j <= steps; j++) {
        const q = { x: lerp(a.x, b.x, j / steps), y: lerp(a.y, b.y, j / steps) };
        if (alpha(q.x, q.y) > 0.4) cur.push(q); else { if (cur.length > 1) runs.push({ pts: cur, d: 0 }); cur = []; }
      }
    }
    if (cur.length > 1) runs.push({ pts: cur, d: 0 });
  });
  for (const r of runs) {
    const m = r.pts[Math.floor(r.pts.length / 2)]!;
    r.d = Math.hypot(m.x - impact.x, m.y - impact.y) / fr.reach;
  }
  const out = { fr, stats, impact, core, runs };
  if (cache.size > 12) cache.delete(cache.keys().next().value!);
  cache.set(key, out);
  return out;
}

/** The icon placed on the picture, as a plain textured quad (the intact object). */
function pushQuad(f: Frame, cx: number, cy: number, W: number, H: number, ox: number, oy: number, scale: number, shade: number, alpha: number): void {
  const x0 = cx + ox - (W / 2) * scale, x1 = cx + ox + (W / 2) * scale, y0 = cy + oy - (H / 2) * scale, y1 = cy + oy + (H / 2) * scale;
  const v = (x: number, y: number, u: number, w: number) => [x, y, u, w, 1, shade, 0, alpha];
  f.shards.push(...v(x0, y0, 0, 0), ...v(x1, y0, 1, 0), ...v(x0, y1, 0, 1), ...v(x1, y0, 1, 0), ...v(x1, y1, 1, 1), ...v(x0, y1, 0, 1));
}

/**
 * Fragmentation of an object (a transparent icon): one way, and it never reconstructs.
 * A very short internal crack and light build-up, then the object breaks into fragments cut from its own pixels (radial Voronoi inside
 * its real silhouette: small pieces at the impact point, large ones at the rim). The fragments accelerate outward with varied spin and
 * flip, lose brightness and opacity as they travel, a few small ones linger briefly, and everything is gone. Nothing outside the object's
 * silhouette is ever drawn: there is no source rectangle, no crop box, no backdrop and no shadow.
 */
export const fragment: ShowEffect = {
  id: 'fragment',
  name: 'Fragmentation',
  tagline: 'An object cracks, shatters from its own pixels, flies apart and is gone. One way; it never reconstructs.',
  category: 'candidate',
  usesObject: true,
  takesOver: true,
  params: [
    num('cx', 'Object X', G('Object'), 0.5, 0, 1, 0.001, '', 'Horizontal centre of the object as a fraction of the image width (click or drag the preview).'),
    num('cy', 'Object Y', G('Object'), 0.58, 0, 1, 0.001, '', 'Vertical centre of the object as a fraction of the image height.'),
    enm('icon', 'Icon', G('Object'), 'gem', [['gem', 'Gem'], ['horseshoe', 'Horseshoe'], ['star', 'Star'], ['seven', 'Lucky seven'], ['custom', 'My own icon…']], 'The transparent icon that breaks. Use "My own icon…" to load a PNG or WebP with transparency.'),
    num('size', 'Size', G('Object'), 0.3, 0.08, 0.8, 0.005, '', 'Length of the icon\'s longest side in image heights.'),
    num('fragments', 'Fragments', G('Fragments'), 34, 8, 90, 1, 'count', 'Number of pieces (irregular: small at the impact point, large at the rim).', true),
    num('spread', 'Spread', G('Fragments'), 0.5, 0.15, 1.3, 0.01, '', 'How far the fastest pieces travel, in image heights.'),
    num('rotation', 'Rotation', G('Fragments'), 1, 0, 2.5, 0.01, 'x', 'Amount of spin and flip.'),
    num('gravity', 'Gravity', G('Fragments'), 0.12, 0, 1.5, 0.01, 'x', 'Downward pull while they fly.'),
    num('lingerers', 'Small remnants', G('Fragments'), 0.12, 0, 0.35, 0.01, '', 'Share of the smallest pieces that drift on briefly before fading.'),
    num('trails', 'Trails', G('Fragments'), 0.3, 0, 1, 0.01, 'x', 'Faint motion streaks behind the fastest pieces.'),
    num('buildup', 'Crack build-up', G('Timing'), 0.12, 0.04, 0.3, 0.005, 's', 'The very short internal crack and light build-up before the break.'),
    num('duration', 'Duration', G('Timing'), 0.82, 0.55, 1.4, 0.01, 's', 'Total length, from the first crack until the last fragment has gone.'),
    enm('accent', 'Accent colour', G('Look'), 'object', [['object', 'From the icon'], ['gold', 'Gold'], ['cyan', 'Cyan'], ['magenta', 'Magenta'], ['white', 'White']], 'Colour of the cracks\' light and the glints on fragment edges.'),
  ],
  duration: (p) => n(p, 'duration'),
  impactAt: (p) => n(p, 'buildup'),
  cues: (p) => [
    { t: 0, kind: 'crack', gain: 0.45, dur: n(p, 'buildup') },
    { t: n(p, 'buildup'), kind: 'shatter', gain: 0.9, dur: 0.5 },
    { t: n(p, 'buildup'), kind: 'thump', gain: 0.5, pitch: 1.25 },
  ],
  build(f: Frame, t: number, p, ctx) {
    const obj = ctx.object;
    const D = n(p, 'duration');
    if (!obj || t >= D - 1e-9) return;                          // gone: the object is not coming back
    f.shardTex = obj.tex ?? null;
    const tb = Math.min(n(p, 'buildup'), D * 0.4);
    const size = n(p, 'size');
    const W = obj.aspect >= 1 ? size : size * obj.aspect, H = obj.aspect >= 1 ? size / obj.aspect : size;
    const Cx = n(p, 'cx') * ctx.aspect, Cy = n(p, 'cy');
    const accentKey = s(p, 'accent');
    const accent: RGB = accentKey === 'object' ? mixRGB(obj.color, [1, 1, 1], 0.55) : (ACCENTS[accentKey] ?? ACCENTS.gold!);
    f.boltCore = [1, 1, 1]; f.boltGlow = accent;
    const count = Math.round(n(p, 'fragments'));
    const { fr, stats, impact, core, runs } = getFracture(obj, W, H, count);

    // ---- before the break: the intact object, cracking from inside ----------------------------------------------------
    if (t < tb) {
      const u = clamp(t / tb);
      const shade = 1 + 0.28 * easeInQuad(u);
      const amp = 0.0013 * u * u;
      pushQuad(f, Cx, Cy, W, H, Math.sin(t * 131) * amp, Math.cos(t * 113) * amp, 1 + 0.018 * u, shade, 1);
      if (u > 0) {
        const reach = easeOutCubic(clamp(u * 1.15));
        for (const r of runs) {
          const reveal = clamp((reach - r.d) / 0.22);
          if (reveal < 0.01) continue;
          ribbon(f.bolts, r.pts.map((q) => ({ x: Cx + q.x, y: Cy + q.y })), 0.0011, 0.85 * reveal * (0.35 + 0.65 * u), false);
        }
        const g = 0.04 + 0.05 * u;
        f.additive.push({ x: Cx + core.x, y: Cy + core.y, hw: g, hh: g, rot: 0, type: 0, color: accent, intensity: 0.7 * u ** 1.5, e1: 2 });
      }
      if (ctx.debug) f.meta = { phase: 'build', fragments: [] };
      return;
    }

    // ---- the break: fragments cut from the object's own pixels fly outward, fade and vanish -----------------------------------
    const sec = t - tb, Tw = D - tb;
    const spread = n(p, 'spread'), rot = n(p, 'rotation'), grav = n(p, 'gravity'), trails = n(p, 'trails');
    const nLing = Math.round(n(p, 'lingerers') * stats.length);
    const smallest = new Set(stats.map((st, i) => ({ i, m: st.mass })).filter((e) => e.m > 0).sort((a, b) => a.m - b.m).slice(0, nLing).map((e) => e.i));
    const meta: { i: number; dist: number; alpha: number; shade: number }[] = [];
    fr.shards.forEach((g, i) => {
      const st = stats[i]!;
      if (st.mass <= 0) return;
      const ling = smallest.has(i);
      const hh = (k: number) => h1(i * 13 + k);
      const dx = st.pivot.x - impact.x, dy = st.pivot.y - impact.y, d0 = Math.hypot(dx, dy);
      let ang = d0 > 1e-4 ? Math.atan2(dy, dx) : hh(1) * Math.PI * 2;
      ang += (hh(2) - 0.5) * 0.7;
      const distN = clamp(d0 / fr.reach);
      const L = spread * lerp(1.0, 0.5, distN) * (0.75 + 0.5 * hh(3)) * lerp(1.2, 0.8, st.sizeN) * (ling ? 0.38 : 1);
      const T = ling ? Tw : Tw * lerp(0.7, 0.95, hh(4));
      const sn = sec / T;
      if (sn >= 1) return;
      const fadeStart = ling ? 0.55 : lerp(0.25, 0.45, hh(5));
      const alpha = (1 - smoothstep(fadeStart, 1, sn)) ** 1.15;
      if (alpha <= 0.002) return;
      const prog = ling ? 0.5 * sn + 0.5 * sn * sn : 0.38 * sn + 0.62 * sn ** 1.9;           // leaves at once, then keeps accelerating outward
      const ox = Math.cos(ang) * L * prog, oy = Math.sin(ang) * L * prog + 0.5 * grav * 1.2 * sec * sec;
      const omega = (hh(6) - 0.5) * 2 * 9 * rot;
      const theta = omega * sec * (0.6 + 0.8 * sn);
      const flips = hh(7) < 0.4;
      const phi = flips ? (hh(8) * 6 + 3) * rot * sec : 0;
      const sxf = Math.max(0.16, Math.abs(Math.cos(phi)));
      const scale = 1 - 0.25 * smoothstep(0.5, 1, sn);
      const shade = lerp(1.28, 0.55, smoothstep(0, 0.95, sn)) * (Math.cos(phi) < 0 ? 0.8 : 1);
      const glint = Math.min(1, 0.9 * Math.exp(-sec * 9) * (hh(9) > 0.35 ? 1 : 0.3) + (flips && sxf < 0.3 ? 0.5 : 0));
      const cs = Math.cos(theta), sn2 = Math.sin(theta);
      const Pw = { x: Cx + st.pivot.x, y: Cy + st.pivot.y };
      const place = (lx: number, ly: number): [number, number] => {
        const rx = (Cx + lx - Pw.x) * sxf * scale, ry = (Cy + ly - Pw.y) * scale;
        return [Pw.x + ox + cs * rx - sn2 * ry, Pw.y + oy + sn2 * rx + cs * ry];
      };
      const np = g.poly.length;
      const grown = g.poly.map((q) => {
        const vx = q.x - g.c.x, vy = q.y - g.c.y, l = Math.hypot(vx, vy) || 1;
        return { x: q.x + (vx / l) * GROW, y: q.y + (vy / l) * GROW };
      });
      const c2 = place(g.c.x, g.c.y);
      const uv = (lx: number, ly: number): [number, number] => [lx / W + 0.5, ly / H + 0.5];
      const cuv = uv(g.c.x, g.c.y);
      for (let k = 0; k < np; k++) {
        const a = grown[k]!, b = grown[(k + 1) % np]!;
        const a2 = place(a.x, a.y), b2 = place(b.x, b.y), ua = uv(a.x, a.y), ub = uv(b.x, b.y);
        f.shards.push(
          c2[0], c2[1], cuv[0], cuv[1], 1, shade, glint, alpha,
          a2[0], a2[1], ua[0], ua[1], 0, shade, glint, alpha,
          b2[0], b2[1], ub[0], ub[1], 0, shade, glint, alpha,
        );
      }
      // a faint streak behind the fastest pieces
      if (trails > 0 && !ling && st.sizeN < 0.9 && sn > 0.02 && alpha > 0.25) {
        const prev = 0.2 * (sn - 0.03) + 0.8 * Math.max(0, sn - 0.03) ** 2.1;
        const sp = Math.hypot((prog - prev) * L, 0) / 0.03 / T;
        if (sp > 0.5) {
          const len = clamp(sp * 0.05, 0.015, 0.12), dir = Math.atan2(Math.sin(ang), Math.cos(ang));
          f.additive.push({ x: Pw.x + ox - Math.cos(dir) * len * 0.88, y: Pw.y + oy - Math.sin(dir) * len * 0.88, hw: len, hh: 0.0028 + 0.003 * st.sizeN, rot: dir, type: 4, color: accent, intensity: 0.5 * trails * alpha * clamp(sp / 2), e1: 1.6 });
        }
      }
      if (ctx.debug) meta.push({ i, dist: Math.hypot(ox, oy), alpha, shade });
    });
    // a last wisp of the inner light as the object lets go
    const lg = 1 - smoothstep(0, 0.14, sec);
    if (lg > 0.01) f.additive.push({ x: Cx + core.x, y: Cy + core.y, hw: 0.07, hh: 0.07, rot: 0, type: 0, color: accent, intensity: 0.55 * lg, e1: 2 });
    if (ctx.debug) f.meta = { phase: 'break', fragments: meta };
  },
};
