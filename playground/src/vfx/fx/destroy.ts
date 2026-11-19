/**
 * Icon destruction effects: ways for a symbol to leave the board. Each one takes over the icon it works on (the icon's own draw is
 * hidden from the effect's start), draws the icon itself while it breaks, and is empty at its last frame: nothing ever comes back.
 */
import { color, enm, num } from '../../core/params';
import type { Frame, RGB } from '../engine/frame';
import { ICON_FX } from '../engine/frame';
import { clamp, easeInCubic, easeInOutCubic, easeInQuad, easeOutBack, easeOutCubic, easeOutQuart, h1, hex, lerp, mixRGB, smoothstep } from '../engine/math';
import type { ObjectInfo } from '../engine/object';
import { n, s, type EffectCtx, type ShowEffect } from './effect';
import { getFracture, GROW } from './fragment';
import { drawIcon, iconDims } from './helpers';

const G = (group: string) => ({ section: 'Effect', group });
const base = () => [
  num('cx', 'Icon X', G('Icon'), 0.5, 0, 1, 0.001, '', 'Horizontal centre of the icon, as a fraction of the stage width.'),
  num('cy', 'Icon Y', G('Icon'), 0.55, 0, 1, 0.001, '', 'Vertical centre of the icon, as a fraction of the stage height.'),
  num('size', 'Icon size', G('Icon'), 0.3, 0.05, 0.9, 0.005, '', 'Length of the icon\'s longest side, in stage heights.'),
];
const dur = (def: number, min = 0.3, max = 3) => num('duration', 'Duration', G('Timing'), def, min, max, 0.01, 's', 'Total length, from the first moment until nothing is left.');
const accentP = () => color('accent', 'Accent colour', G('Look'), '#ffb347', 'Colour of the glow, sparks and edges.');

interface Placed { obj: ObjectInfo; Cx: number; Cy: number; size: number; W: number; H: number }
function place(p: Record<string, number | string | boolean>, ctx: EffectCtx): Placed | null {
  const obj = ctx.object;
  if (!obj) return null;
  const size = n(p, 'size'), { w, h } = iconDims(obj, size);
  return { obj, Cx: n(p, 'cx') * ctx.aspect, Cy: n(p, 'cy'), size, W: w, H: h };
}
const tintOf = (p: Record<string, number | string | boolean>, obj: ObjectInfo): RGB => mixRGB(hex(s(p, 'accent')), obj.color, 0.25);

/** Embers: small drifting lights flung from points of the icon. */
function embers(f: Frame, a: Placed, t: number, t0: number, life: number, count: number, col: RGB, spread: number, up: number, seed: number): void {
  for (let i = 0; i < count; i++) {
    const st = t0 + h1(seed + i * 5) * life * 0.7, tl = t - st, lf = life * lerp(0.5, 1, h1(seed + i * 5 + 1));
    if (tl <= 0 || tl >= lf) continue;
    const u = tl / lf;
    const px = a.Cx + (h1(seed + i * 5 + 2) - 0.5) * a.W * 0.9, py = a.Cy + (h1(seed + i * 5 + 3) - 0.5) * a.H * 0.9;
    const x = px + (h1(seed + i * 5 + 4) - 0.5) * spread * easeOutCubic(u) + Math.sin(tl * 6 + i) * 0.006;
    const y = py - up * easeOutCubic(u) * (0.5 + h1(seed + i * 7));
    const r = lerp(0.005, 0.011, h1(seed + i * 11)) * (1 - 0.5 * u);
    f.additive.push({ x, y, hw: r * 2.6, hh: r * 2.6, rot: 0, type: 0, color: col, intensity: 1.1 * (1 - smoothstep(0.35, 1, u)) * (0.75 + 0.25 * Math.sin(tl * 31 + i * 3)), e1: 2.2 });
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Shader-driven: the icon's own pixels dissolve, burn, drift away, pixelate, melt or are sliced.

interface ShaderDestroy { id: string; name: string; tagline: string; mode: number; dur: number; ease: (u: number) => number; extra?: (f: Frame, a: Placed, t: number, p: Record<string, number | string | boolean>, u: number, col: RGB) => void; accent: string; params?: ReturnType<typeof num>[]; sliceAngle?: boolean }

function shaderDestroy(d: ShaderDestroy): ShowEffect {
  return {
    id: d.id, name: d.name, tagline: d.tagline, category: 'candidate', usesObject: true, takesOver: true,
    params: [...base(), ...(d.params ?? []), accentP(), dur(d.dur)].map((x) => (x.key === 'accent' ? { ...x, default: d.accent } : x)) as ShowEffect['params'],
    duration: (p) => n(p, 'duration'),
    impactAt: () => 0.05,
    cues: (p) => [{ t: 0.02, kind: d.mode === ICON_FX.slice ? 'crack' : 'shatter', gain: 0.45, dur: Math.min(0.5, n(p, 'duration') * 0.6), pitch: d.mode === ICON_FX.melt ? 0.7 : 1.1 }],
    build(f: Frame, t, p, ctx) {
      const a = place(p, ctx);
      const D = n(p, 'duration');
      if (!a || t < 0 || t >= D) return;
      const u = clamp(t / D);
      const col = tintOf(p, a.obj);
      const slice = d.mode === ICON_FX.slice;
      drawIcon(f, a.obj, {
        cx: a.Cx, cy: a.Cy, size: a.size, w: slice ? a.W * 1.8 : undefined, h: slice ? a.H * 1.8 : undefined, uv: slice ? [-0.4, -0.4, 1.4, 1.4] : undefined,
        bright: 1 + 0.3 * Math.sin(Math.PI * Math.min(1, u * 1.6)),
        fx: { mode: d.mode, progress: d.ease(u), seed: 3.7, p: slice ? n(p, 'angle') * Math.PI / 180 : d.mode === ICON_FX.dissolve ? n(p, 'sweep') : 0, color: col },
      });
      d.extra?.(f, a, t, p, u, col);
    },
  };
}

export const dissolve = shaderDestroy({
  id: 'destroy.dissolve', name: 'Dissolve', tagline: 'The icon eats itself away through noise, with a glowing edge.', mode: ICON_FX.dissolve, dur: 1.1, accent: '#ffb347',
  ease: (u) => easeInOutCubic(u),
  params: [num('sweep', 'Sweep', G('Look'), 0.6, -2, 2, 0.01, '', 'Bias the dissolve to start at the top (positive) or the bottom (negative).')],
  extra: (f, a, t, p, u, col) => embers(f, a, t, 0.1, 0.8, 14, col, 0.12, 0.12, 21),
});

export const burn = shaderDestroy({
  id: 'destroy.burn', name: 'Burn away', tagline: 'A flame front climbs the icon, leaving char that crumbles to embers.', mode: ICON_FX.burn, dur: 1.4, accent: '#ff7a1a',
  ease: (u) => easeInOutCubic(u * 0.96),
  extra: (f, a, t, p, u, col) => { embers(f, a, t, 0.1, 1.1, 26, col, 0.1, 0.22, 47); if (u > 0.05 && u < 0.85) f.additive.push({ x: a.Cx, y: a.Cy + a.H * (0.5 - u), hw: a.W * 0.6, hh: a.H * 0.18, rot: 0, type: 0, color: col, intensity: 0.5, e1: 1.5 }); },
});

export const dust = shaderDestroy({
  id: 'destroy.dust', name: 'Turn to dust', tagline: 'The icon crumbles into fine dust that drifts away on the wind.', mode: ICON_FX.dust, dur: 1.5, accent: '#d9c9a8',
  ease: (u) => u * 0.9 + 0.1 * easeOutCubic(u),
  extra: (f, a, t, p, u, col) => {
    for (let i = 0; i < 26; i++) {
      const st = 0.05 + h1(i * 3 + 90) * 0.9, tl = t - st;
      if (tl <= 0 || tl > 0.9) continue;
      const k = tl / 0.9, x = a.Cx + (h1(i * 3 + 91) - 0.5) * a.W * 0.9 + k * (0.25 + 0.2 * h1(i + 5)), y = a.Cy + (h1(i * 3 + 92) - 0.5) * a.H * 0.9 - k * 0.12 + 0.08 * k * k;
      const r = lerp(0.012, 0.028, h1(i * 3 + 93)) * (0.6 + k);
      f.alphaSprites.push({ x, y, hw: r, hh: r, rot: 0, type: 5, color: mixRGB(col, [0.8, 0.75, 0.65], 0.6), intensity: 0.5 * (1 - k) ** 1.3, e2: i });
    }
  },
});

export const slice = shaderDestroy({
  id: 'destroy.slice', name: 'Slice', tagline: 'A clean cut: a bright slash, then the halves slide apart and vanish.', mode: ICON_FX.slice, dur: 0.85, accent: '#bfe6ff',
  ease: (u) => smoothstep(0.12, 0.95, u) * 0.95 + 0.0001,
  params: [num('angle', 'Cut angle', G('Look'), -35, -90, 90, 1, 'deg', 'Angle of the cut.')],
  extra: (f, a, t, p, u, col) => {
    const ang = (n(p, 'angle') * Math.PI) / 180;
    const slash = u < 0.14 ? easeOutQuart(u / 0.14) : 1 - smoothstep(0.14, 0.45, u);
    if (slash > 0.01) f.additive.push({ x: a.Cx, y: a.Cy, hw: a.size * 0.95 * (0.3 + 0.7 * slash), hh: a.size * 0.012, rot: ang, type: 2, color: col, intensity: 1.6 * slash });
  },
});

export const pixelateOut = shaderDestroy({
  id: 'destroy.pixelate', name: 'Pixelate away', tagline: 'The icon breaks into coarse blocks that drop out one by one.', mode: ICON_FX.pixelate, dur: 1, accent: '#7cf0ff',
  ease: (u) => easeInOutCubic(u),
});

export const melt = shaderDestroy({
  id: 'destroy.melt', name: 'Melt', tagline: 'The icon sags and runs downward until it is gone.', mode: ICON_FX.melt, dur: 1.3, accent: '#ff9d5c',
  ease: (u) => easeInQuad(u) * 0.4 + 0.6 * easeInOutCubic(u),
});

// ---------------------------------------------------------------------------------------------------------------------
// Geometric: the icon breaks into pieces cut from its own pixels.

export const shatter: ShowEffect = {
  id: 'destroy.shatter', name: 'Shatter', tagline: 'A sharp crack, then large angular pieces fall away spinning, like glass.', category: 'candidate', usesObject: true, takesOver: true,
  params: [
    ...base(),
    num('pieces', 'Pieces', G('Pieces'), 18, 6, 50, 1, 'count', 'Number of shards.', true),
    num('spread', 'Burst', G('Pieces'), 0.3, 0.05, 1, 0.01, '', 'How hard the pieces are thrown outward.'),
    num('gravity', 'Gravity', G('Pieces'), 1.3, 0, 3, 0.01, 'x', 'How fast the pieces fall.'),
    num('spin', 'Spin', G('Pieces'), 1.2, 0, 3, 0.01, 'x', 'Tumbling of the pieces.'),
    accentP(), dur(1.05),
  ].map((x) => (x.key === 'accent' ? { ...x, default: '#cfeaff' } : x)) as ShowEffect['params'],
  duration: (p) => n(p, 'duration'),
  impactAt: () => 0.07,
  cues: () => [{ t: 0.05, kind: 'crack', gain: 0.6 }, { t: 0.07, kind: 'shatter', gain: 0.9, dur: 0.6 }],
  build(f: Frame, t, p, ctx) {
    const a = place(p, ctx);
    const D = n(p, 'duration');
    if (!a || t < 0 || t >= D) return;
    const { obj, Cx, Cy, W, H } = a;
    f.shardTex = obj.tex ?? null;
    const col = tintOf(p, obj);
    const T0 = 0.07;
    if (t < T0) { drawIcon(f, obj, { cx: Cx, cy: Cy, size: a.size, bright: 1 + 0.5 * (t / T0) }); return; }
    const { fr, stats, impact } = getFracture(obj, W, H, Math.round(n(p, 'pieces')));
    const sec = t - T0, Tw = D - T0;
    const spread = n(p, 'spread'), grav = n(p, 'gravity'), spin = n(p, 'spin');
    f.boltGlow = col;
    fr.shards.forEach((g, i) => {
      const st = stats[i]!;
      if (st.mass <= 0) return;
      const hh = (k: number) => h1(i * 17 + k);
      const dx = st.pivot.x - impact.x, dy = st.pivot.y - impact.y, d0 = Math.hypot(dx, dy) || 1e-3;
      const sn = sec / (Tw * lerp(0.75, 1, hh(1)));
      if (sn >= 1) return;
      const alpha = 1 - smoothstep(0.55, 1, sn);
      const v = spread * lerp(1, 0.4, st.sizeN) * (0.6 + 0.8 * hh(2));
      const burst = (1 - Math.exp(-sec * 5)) / 5;
      const ox = (dx / d0) * v * burst * 2.2, oy = (dy / d0) * v * burst * 2.2 - 0.12 * v * burst + 0.5 * grav * sec * sec * (0.7 + 0.5 * hh(3));
      const theta = (hh(4) - 0.5) * 2 * 6 * spin * sec, flip = hh(5) < 0.5 ? Math.max(0.15, Math.abs(Math.cos(hh(6) * 8 * sec * spin))) : 1;
      const shade = lerp(1.25, 0.6, smoothstep(0, 0.9, sn));
      const cs = Math.cos(theta), sn2 = Math.sin(theta);
      const Pw = { x: Cx + st.pivot.x, y: Cy + st.pivot.y };
      const place2 = (lx: number, ly: number): [number, number] => {
        const rx = (lx - st.pivot.x) * flip, ry = ly - st.pivot.y;
        return [Pw.x + ox + cs * rx - sn2 * ry, Pw.y + oy + sn2 * rx + cs * ry];
      };
      const c2 = place2(g.c.x, g.c.y), uv = (lx: number, ly: number): [number, number] => [lx / W + 0.5, ly / H + 0.5], cuv = uv(g.c.x, g.c.y);
      const np = g.poly.length;
      const grown = g.poly.map((q) => { const vx = q.x - g.c.x, vy = q.y - g.c.y, l = Math.hypot(vx, vy) || 1; return { x: q.x + (vx / l) * GROW, y: q.y + (vy / l) * GROW }; });
      const glint = Math.min(1, 0.9 * Math.exp(-sec * 7) + (flip < 0.4 ? 0.6 : 0));
      for (let k = 0; k < np; k++) {
        const A = grown[k]!, B = grown[(k + 1) % np]!, a2 = place2(A.x, A.y), b2 = place2(B.x, B.y), ua = uv(A.x, A.y), ub = uv(B.x, B.y);
        f.shards.push(c2[0], c2[1], cuv[0], cuv[1], 1, shade, glint, alpha, a2[0], a2[1], ua[0], ua[1], 0, shade, glint, alpha, b2[0], b2[1], ub[0], ub[1], 0, shade, glint, alpha);
      }
    });
    const fl = Math.exp(-sec * 14);
    if (fl > 0.02) {
      f.additive.push({ x: Cx + impact.x, y: Cy + impact.y, hw: a.size * 0.35, hh: a.size * 0.35, rot: 0, type: 3, color: col, intensity: 1.2 * fl });
      f.additive.push({ x: Cx + impact.x, y: Cy + impact.y, hw: a.size * 0.9, hh: a.size * 0.9, rot: 0.2, type: 2, color: col, intensity: 0.8 * fl });
    }
  },
};

export const explode: ShowEffect = {
  id: 'destroy.explode', name: 'Explode', tagline: 'The icon swells and whitens, then bursts into many fast fragments with a flash and a ring.', category: 'candidate', usesObject: true, takesOver: true,
  params: [
    ...base(),
    num('pieces', 'Pieces', G('Pieces'), 56, 16, 100, 1, 'count', 'Number of fragments.', true),
    num('spread', 'Force', G('Pieces'), 0.85, 0.2, 2, 0.01, '', 'How far the fastest fragments fly, in stage heights.'),
    num('gravity', 'Gravity', G('Pieces'), 0.3, 0, 2, 0.01, 'x', 'Downward pull.'),
    num('buildup', 'Swell', G('Timing'), 0.16, 0.05, 0.5, 0.005, 's', 'Time the icon swells before it bursts.'),
    accentP(), dur(1.1),
  ].map((x) => (x.key === 'accent' ? { ...x, default: '#ffb15c' } : x)) as ShowEffect['params'],
  duration: (p) => n(p, 'duration'),
  impactAt: (p) => n(p, 'buildup'),
  cues: (p) => [{ t: 0, kind: 'sweep', gain: 0.3, dur: n(p, 'buildup'), pitch: 1.6 }, { t: n(p, 'buildup'), kind: 'thump', gain: 0.95 }, { t: n(p, 'buildup'), kind: 'shatter', gain: 0.8, dur: 0.6 }],
  build(f: Frame, t, p, ctx) {
    const a = place(p, ctx);
    const D = n(p, 'duration');
    if (!a || t < 0 || t >= D) return;
    const { obj, Cx, Cy, W, H } = a;
    f.shardTex = obj.tex ?? null;
    const col = tintOf(p, obj), tb = n(p, 'buildup');
    f.boltGlow = col;
    if (t < tb) {
      const u = t / tb;
      const sw = 1 + 0.2 * easeInQuad(u) + Math.sin(u * 40) * 0.01 * u;
      drawIcon(f, obj, { cx: Cx, cy: Cy, size: a.size, sx: sw, sy: sw, bright: 1 + 1.2 * easeInQuad(u) });
      f.additive.push({ x: Cx, y: Cy, hw: a.size * 0.7 * u, hh: a.size * 0.7 * u, rot: 0, type: 0, color: col, intensity: 0.7 * u, e1: 1.5 });
      return;
    }
    const { fr, stats, impact } = getFracture(obj, W, H, Math.round(n(p, 'pieces')));
    const sec = t - tb, Tw = D - tb, spread = n(p, 'spread'), grav = n(p, 'gravity');
    fr.shards.forEach((g, i) => {
      const st = stats[i]!;
      if (st.mass <= 0) return;
      const hh = (k: number) => h1(i * 29 + k);
      const dx = st.pivot.x - impact.x, dy = st.pivot.y - impact.y, d0 = Math.hypot(dx, dy);
      const ang = (d0 > 1e-3 ? Math.atan2(dy, dx) : hh(1) * 6.283) + (hh(2) - 0.5) * 0.9;
      const sn = sec / (Tw * lerp(0.7, 1, hh(3)));
      if (sn >= 1) return;
      const alpha = (1 - smoothstep(0.35, 1, sn)) ** 1.1;
      const v = spread * lerp(1.1, 0.5, st.sizeN) * (0.6 + 0.8 * hh(4));
      const travel = (1 - Math.exp(-sec * 4.5)) / 4.5;
      const ox = Math.cos(ang) * v * travel, oy = Math.sin(ang) * v * travel + 0.5 * grav * sec * sec;
      const theta = (hh(5) - 0.5) * 16 * sec, cs = Math.cos(theta), sn2 = Math.sin(theta);
      const shade = lerp(1.6, 0.5, smoothstep(0, 0.7, sn));
      const Pw = { x: Cx + st.pivot.x, y: Cy + st.pivot.y };
      const place2 = (lx: number, ly: number): [number, number] => { const rx = lx - st.pivot.x, ry = ly - st.pivot.y; return [Pw.x + ox + cs * rx - sn2 * ry, Pw.y + oy + sn2 * rx + cs * ry]; };
      const c2 = place2(g.c.x, g.c.y), uv = (lx: number, ly: number): [number, number] => [lx / W + 0.5, ly / H + 0.5], cuv = uv(g.c.x, g.c.y);
      const np = g.poly.length;
      const grown = g.poly.map((q) => { const vx = q.x - g.c.x, vy = q.y - g.c.y, l = Math.hypot(vx, vy) || 1; return { x: q.x + (vx / l) * GROW, y: q.y + (vy / l) * GROW }; });
      const glint = 0.8 * Math.exp(-sec * 6);
      for (let k = 0; k < np; k++) {
        const A = grown[k]!, B = grown[(k + 1) % np]!, a2 = place2(A.x, A.y), b2 = place2(B.x, B.y), ua = uv(A.x, A.y), ub = uv(B.x, B.y);
        f.shards.push(c2[0], c2[1], cuv[0], cuv[1], 1, shade, glint, alpha, a2[0], a2[1], ua[0], ua[1], 0, shade, glint, alpha, b2[0], b2[1], ub[0], ub[1], 0, shade, glint, alpha);
      }
      if (sn < 0.5 && st.sizeN < 0.7 && alpha > 0.3) {
        const dir = Math.atan2(Math.sin(ang) * v * Math.exp(-sec * 4.5) + grav * sec, Math.cos(ang) * v * Math.exp(-sec * 4.5)), len = clamp(v * 0.09, 0.02, 0.1);
        f.additive.push({ x: Pw.x + ox - Math.cos(dir) * len * 0.88, y: Pw.y + oy - Math.sin(dir) * len * 0.88, hw: len, hh: 0.004, rot: dir, type: 4, color: col, intensity: 0.7 * alpha, e1: 1.5 });
      }
    });
    const fl = Math.exp(-sec * 11);
    f.additive.push({ x: Cx, y: Cy, hw: a.size * (0.5 + 0.9 * easeOutQuart(sec / 0.3)), hh: a.size * (0.5 + 0.9 * easeOutQuart(sec / 0.3)), rot: 0, type: 3, color: col, intensity: 1.6 * fl });
    const ring = a.size * (0.4 + 2.4 * easeOutQuart(sec / 0.55));
    f.additive.push({ x: Cx, y: Cy, hw: ring, hh: ring, rot: 0, type: 1, color: col, intensity: 1.1 * (1 - smoothstep(0, 0.55, sec)), e1: 0.1 });
    embers(f, a, t, tb, 0.9, 22, col, 0.35, 0.18, 77);
    f.exposure *= 1 + 0.05 * fl;
  },
};

export const pop: ShowEffect = {
  id: 'destroy.pop', name: 'Pop', tagline: 'The icon inflates like a bubble, wobbles, and pops into a ring and droplets.', category: 'candidate', usesObject: true, takesOver: true,
  params: [
    ...base(),
    num('buildup', 'Inflate', G('Timing'), 0.32, 0.1, 0.9, 0.005, 's', 'Time the icon takes to inflate.'),
    num('drops', 'Droplets', G('Look'), 14, 0, 40, 1, 'count', 'Droplets thrown by the pop.', true),
    accentP(), dur(0.85),
  ].map((x) => (x.key === 'accent' ? { ...x, default: '#9ff0ff' } : x)) as ShowEffect['params'],
  duration: (p) => n(p, 'duration'),
  impactAt: (p) => n(p, 'buildup'),
  cues: (p) => [{ t: 0, kind: 'sweep', gain: 0.25, dur: n(p, 'buildup'), pitch: 1.4 }, { t: n(p, 'buildup'), kind: 'tick', gain: 0.8, pitch: 0.7 }, { t: n(p, 'buildup'), kind: 'shatter', gain: 0.4, dur: 0.3, pitch: 1.8 }],
  build(f: Frame, t, p, ctx) {
    const a = place(p, ctx);
    const D = n(p, 'duration');
    if (!a || t < 0 || t >= D) return;
    const tb = n(p, 'buildup'), col = tintOf(p, a.obj);
    if (t < tb) {
      const u = t / tb, grow = 1 + 0.38 * easeInOutCubic(u), wob = Math.sin(u * 22) * 0.035 * u;
      drawIcon(f, a.obj, { cx: a.Cx, cy: a.Cy, size: a.size, sx: grow * (1 + wob), sy: grow * (1 - wob), bright: 1 + 0.35 * u, alpha: 1 - 0.1 * u });
      f.additive.push({ x: a.Cx, y: a.Cy, hw: a.size * 0.75 * grow, hh: a.size * 0.75 * grow, rot: 0, type: 1, color: col, intensity: 0.5 * u, e1: 0.18 });
      return;
    }
    const sec = t - tb, Tw = D - tb;
    const r = a.size * (0.55 + 1.1 * easeOutQuart(sec / 0.4));
    f.additive.push({ x: a.Cx, y: a.Cy, hw: r, hh: r, rot: 0, type: 1, color: col, intensity: 1.5 * (1 - smoothstep(0, 0.45, sec)), e1: 0.09 });
    f.additive.push({ x: a.Cx, y: a.Cy, hw: a.size * 0.8, hh: a.size * 0.8, rot: 0, type: 3, color: col, intensity: 1.2 * Math.exp(-sec * 14) });
    const N = Math.round(n(p, 'drops'));
    for (let i = 0; i < N; i++) {
      const ang = (i / N) * 6.283 + h1(i * 3) * 0.5, v = a.size * lerp(0.8, 1.8, h1(i * 3 + 1)), tt = sec / Tw;
      if (tt >= 1) break;
      const trav = (1 - Math.exp(-sec * 5)) / 5;
      const x = a.Cx + Math.cos(ang) * v * trav * 2.4, y = a.Cy + Math.sin(ang) * v * trav * 2.4 + 0.4 * sec * sec;
      const dr = lerp(0.01, 0.022, h1(i * 3 + 2)) * (1 - 0.6 * tt);
      f.additive.push({ x, y, hw: dr, hh: dr, rot: 0, type: 3, color: col, intensity: 1.0 * (1 - smoothstep(0.3, 1, tt)) });
    }
  },
};

export const implode: ShowEffect = {
  id: 'destroy.implode', name: 'Implode', tagline: 'The icon spirals into a point, then releases a bright burst.', category: 'candidate', usesObject: true, takesOver: true,
  params: [...base(), num('turns', 'Spin', G('Look'), 1.2, 0, 4, 0.05, '', 'Turns while it collapses.'), accentP(), dur(0.95)].map((x) => (x.key === 'accent' ? { ...x, default: '#b79bff' } : x)) as ShowEffect['params'],
  duration: (p) => n(p, 'duration'),
  impactAt: (p) => n(p, 'duration') * 0.58,
  cues: (p) => [{ t: 0, kind: 'sweep', gain: 0.5, dur: n(p, 'duration') * 0.55, pitch: 0.7 }, { t: n(p, 'duration') * 0.58, kind: 'thump', gain: 0.8 }],
  build(f: Frame, t, p, ctx) {
    const a = place(p, ctx);
    const D = n(p, 'duration');
    if (!a || t < 0 || t >= D) return;
    const col = tintOf(p, a.obj), Tc = D * 0.58;
    if (t < Tc) {
      const u = t / Tc, e = easeInCubic(u), sc = Math.max(0.001, 1 - e);
      drawIcon(f, a.obj, { cx: a.Cx, cy: a.Cy, size: a.size, sx: sc, sy: sc, rot: n(p, 'turns') * 6.283 * e * e, bright: 1 + 0.8 * u, alpha: 1 - 0.3 * smoothstep(0.7, 1, u) });
      f.vortices.push({ cx: a.Cx, cy: a.Cy, radius: a.size * 1.7, pull: 0.9 * Math.sin(Math.PI * u) ** 0.8, twist: 3 * Math.sin(Math.PI * u), glow: 0.5, absorb: 0.25, color: col });
      f.additive.push({ x: a.Cx, y: a.Cy, hw: a.size * 0.5 * (0.3 + u), hh: a.size * 0.5 * (0.3 + u), rot: 0, type: 0, color: col, intensity: 0.9 * u, e1: 1.2 });
      return;
    }
    const sec = t - Tc, Tw = D - Tc;
    const r = a.size * (0.3 + 1.6 * easeOutQuart(sec / (Tw * 0.8)));
    f.additive.push({ x: a.Cx, y: a.Cy, hw: r, hh: r, rot: 0, type: 1, color: col, intensity: 1.3 * (1 - smoothstep(0, Tw * 0.85, sec)), e1: 0.1 });
    f.additive.push({ x: a.Cx, y: a.Cy, hw: a.size * 0.6, hh: a.size * 0.6, rot: 0, type: 3, color: col, intensity: 1.6 * Math.exp(-sec * 12) });
    f.additive.push({ x: a.Cx, y: a.Cy, hw: a.size * 1.4, hh: a.size * 1.4, rot: 0.4, type: 2, color: col, intensity: 0.9 * Math.exp(-sec * 9) });
  },
};

export const spinAway: ShowEffect = {
  id: 'destroy.spin', name: 'Spin away', tagline: 'The icon spins up, shrinks and whirls out of sight with a glowing trail.', category: 'candidate', usesObject: true, takesOver: true,
  params: [...base(), num('turns', 'Turns', G('Look'), 2.5, 0.5, 6, 0.05, '', 'Full turns before it is gone.'), accentP(), dur(0.8)].map((x) => (x.key === 'accent' ? { ...x, default: '#ffe27a' } : x)) as ShowEffect['params'],
  duration: (p) => n(p, 'duration'),
  impactAt: () => 0,
  cues: (p) => [{ t: 0, kind: 'whoosh', gain: 0.5, dur: n(p, 'duration') }],
  build(f: Frame, t, p, ctx) {
    const a = place(p, ctx);
    const D = n(p, 'duration');
    if (!a || t < 0 || t >= D) return;
    const u = t / D, col = tintOf(p, a.obj);
    const e = easeInCubic(u), sc = u < 0.18 ? 1 + 0.15 * (u / 0.18) : Math.max(0.001, lerp(1.15, 0, easeInCubic((u - 0.18) / 0.82)));
    const rot = n(p, 'turns') * 6.283 * e;
    for (let k = 4; k >= 1; k--) {
      const ue = Math.max(0, e - k * 0.035);
      drawIcon(f, a.obj, { cx: a.Cx, cy: a.Cy - 0.05 * ue, size: a.size, sx: Math.max(0.001, sc * (1 - k * 0.06)), sy: Math.max(0.001, sc * (1 - k * 0.06)), rot: n(p, 'turns') * 6.283 * ue, alpha: 0.16 * (1 - u), bright: 1.4, tint: col });
    }
    drawIcon(f, a.obj, { cx: a.Cx, cy: a.Cy - 0.05 * e, size: a.size, sx: sc, sy: sc, rot, alpha: 1 - smoothstep(0.75, 1, u), bright: 1 + 0.4 * Math.sin(Math.PI * u) });
    f.additive.push({ x: a.Cx, y: a.Cy - 0.05 * e, hw: a.size * 0.6 * sc, hh: a.size * 0.6 * sc, rot: 0, type: 0, color: col, intensity: 0.7 * Math.sin(Math.PI * u), e1: 1.5 });
  },
};

export const DESTROYERS: ShowEffect[] = [shatter, explode, pop, dissolve, burn, dust, slice, pixelateOut, melt, implode, spinAway];
void enm; void easeOutBack;
