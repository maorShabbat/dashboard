/**
 * Ambient loops that sit behind the reels: embers, snow, fireflies, god rays, bokeh and dust, and a starfield. Every position, size and
 * brightness is a periodic function of t / loop (whole numbers of cycles only), so the last frame of the loop is the frame before the
 * first and the scene can restart with no seam. The pieces are drawn into the content layer: put them behind the text and the reels
 * ("behind"), in front of them, or both (the nearest pieces in front).
 */
import { color, enm, num } from '../../core/params';
import { QUAD_FLOATS, type DrawBatch, type Frame, type RGB, type TexRef } from '../engine/frame';
import { clamp, h1, hex, mixRGB, smoothstep } from '../engine/math';
import { n, s, type EffectCtx, type PValues, type ShowEffect } from './effect';

const G = (group: string) => ({ section: 'Effect', group });
const TAU = Math.PI * 2;
const fract = (x: number): number => x - Math.floor(x);
const Q = (ctx: EffectCtx, v: number): number => Math.max(1, Math.round(v * Math.max(0.3, ctx.quality ?? 1)));

// ---------------------------------------------------------------------------------------------------------------------
// Generated pictures: white shapes with an alpha channel, tinted when drawn

function genTex(uid: string, w: number, h: number, px: (u: number, v: number) => number): TexRef {
  let data: Uint8Array | null = null;
  return {
    uid, version: 0, w, h,
    load: () => {
      if (!data) {
        data = new Uint8Array(w * h * 4);
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
          const o = (y * w + x) * 4;
          data[o] = 255; data[o + 1] = 255; data[o + 2] = 255; data[o + 3] = Math.round(clamp(px((x + 0.5) / w, (y + 0.5) / h)) * 255);
        }
      }
      return { kind: 'rgba' as const, data, w, h, filter: 'linear' as const };
    },
  };
}
const rad = (u: number, v: number): number => Math.hypot(u - 0.5, v - 0.5) * 2;
export const AMBIENT_TEX = {
  dot: genTex('$amb:dot', 64, 64, (u, v) => { const r = rad(u, v); return r >= 1 ? 0 : (1 - r * r) ** 2; }),
  glow: genTex('$amb:glow', 64, 64, (u, v) => { const r = rad(u, v); return r >= 1 ? 0 : Math.max(Math.exp(-r * r * 16), 0.4 * (1 - r) ** 2.4); }),
  bokeh: genTex('$amb:bokeh', 96, 96, (u, v) => { const r = rad(u, v); return r >= 1 ? 0 : Math.max(0.3 * (1 - smoothstep(0.88, 1, r)), 0.95 * Math.exp(-(((r - 0.86) / 0.085) ** 2))); }),
  flake: genTex('$amb:flake', 64, 64, (u, v) => { const r = rad(u, v), th = Math.atan2(v - 0.5, u - 0.5); if (r >= 1) return 0; return Math.max(1 - smoothstep(0, 0.26, r), Math.abs(Math.cos(3 * th)) ** 10 * (1 - r) ** 0.8); }),
  star: genTex('$amb:star', 64, 64, (u, v) => { const x = (u - 0.5) * 2, y = (v - 0.5) * 2; return Math.exp(-(x * x + y * y) * 34) + 0.9 * Math.max(Math.exp(-Math.abs(y) * 30) * (1 - Math.abs(x)) ** 1.6, Math.exp(-Math.abs(x) * 30) * (1 - Math.abs(y)) ** 1.6); }),
  /** A beam: across it a soft bell, along it (v from the source outward) a long fade. */
  ray: genTex('$amb:ray', 32, 256, (u, v) => (1 - Math.abs(u * 2 - 1)) ** 1.7 * (1 - v) ** 1.1 * smoothstep(0, 0.03, v)),
};

/** The 24 floats of one textured quad (see ELEM_VS). */
const quad = (cx: number, cy: number, hw: number, hh: number, rot: number, tint: RGB, alpha: number, bright = 1): number[] =>
  [cx, cy, 0, 0, hw, hh, rot, 0, 1, 1, bright, 1, 0, 0, 1, 1, 0, 0, 1, 1, tint[0], tint[1], tint[2], alpha];

interface Piece { tex: TexRef; x: number; y: number; hw: number; hh: number; rot: number; tint: RGB; a: number; near: number }

/** Put the pieces into the content layer: behind what is drawn already, in front of it, or the nearest ones in front. */
function flush(f: Frame, layer: string, pieces: Piece[]): void {
  const back = new Map<TexRef, number[]>(), front = new Map<TexRef, number[]>();
  for (const p of pieces) {
    if (p.a <= 0.003) continue;
    const toFront = layer === 'front' || (layer === 'both' && p.near > 0.72);
    const m = toFront ? front : back;
    let a = m.get(p.tex); if (!a) { a = []; m.set(p.tex, a); }
    a.push(...quad(p.x, p.y, p.hw, p.hh, p.rot, p.tint, Math.min(1, p.a)));
  }
  const batch = (tex: TexRef, instances: number[], emit: 0 | 1): DrawBatch => ({ tex, fill: null, fillMode: 0, premultiplied: false, instances, emit, emitGain: 0.35 });
  const bs: DrawBatch[] = [...back].filter(([, i]) => i.length >= QUAD_FLOATS).map(([t, i]) => batch(t, i, 0));
  if (bs.length) f.draws.unshift(...bs);
  for (const [t, i] of front) if (i.length >= QUAD_FLOATS) f.draws.push(batch(t, i, 1));
}

// ---------------------------------------------------------------------------------------------------------------------
// Shared settings

const LAYERS: [string, string][] = [['behind', 'Behind the reels and the text'], ['both', 'Behind, with the nearest pieces in front'], ['front', 'In front of everything']];
function common(o: { count: number; tint: string; tint2: string; size?: number; opacity?: number; seed?: number; loop?: number }) {
  return [
    num('loop', 'Loop length', G('Timing'), o.loop ?? 8, 2, 30, 0.5, 's', 'After this long the picture is exactly where it started, so the scene can repeat with no seam.'),
    num('count', 'How many', G('Look'), o.count, 4, 300, 1, 'count', 'Pieces on the screen at once.', true),
    num('size', 'Size', G('Look'), o.size ?? 1, 0.3, 3, 0.01, 'x', 'How big each piece is.'),
    num('speed', 'Speed', G('Look'), 1, 1, 4, 1, 'x', 'How many times faster everything moves (whole numbers keep the loop seamless).', true),
    color('tint', 'Colour', G('Look'), o.tint, 'The main colour.'),
    color('tint2', 'Second colour', G('Look'), o.tint2, 'A second colour that some pieces take.'),
    num('opacity', 'Opacity', G('Look'), o.opacity ?? 1, 0.1, 1.5, 0.01, 'x', 'How visible it is.'),
    enm('layer', 'Drawn', G('Look'), 'behind', LAYERS, 'Whether it sits behind the reels and text, in front of them, or both.'),
    num('seed', 'Variation', G('Look'), o.seed ?? 3, 1, 99, 1, '', 'Pick a different arrangement.', true),
  ];
}
interface Ctx2 { u: number; N: number; seed: number; sp: number; sz: number; op: number; c1: RGB; c2: RGB; A: number }
function base(p: PValues, t: number, ctx: EffectCtx): Ctx2 {
  const D = n(p, 'loop');
  return { u: t / D, N: Q(ctx, n(p, 'count')), seed: n(p, 'seed') * 131, sp: Math.max(1, Math.round(n(p, 'speed'))), sz: n(p, 'size'), op: n(p, 'opacity'), c1: hex(s(p, 'tint')), c2: hex(s(p, 'tint2')), A: ctx.aspect };
}
/** A stable random number for piece i and purpose k (whole-number mixing, so no two pieces share numbers). */
const hh = (seed: number, i: number, k: number): number => h1(seed + i * 977 + k * 61);
const pick = (v: number, lo: number, hi: number): number => lo + Math.floor(v * (hi - lo + 1) * 0.9999);

const base_: Pick<ShowEffect, 'duration' | 'impactAt' | 'category' | 'cues'> = { duration: (p) => n(p, 'loop'), impactAt: () => 0, category: 'candidate', cues: () => [] };

// ---------------------------------------------------------------------------------------------------------------------
// Embers

export const ambientEmbers: ShowEffect = {
  ...base_, id: 'ambient.embers', name: 'Rising embers', tagline: 'Glowing sparks drift up from below and flicker out: a loop for fire, forge and dragon themes.',
  params: [...common({ count: 70, tint: '#ff8a2a', tint2: '#ffd36a', size: 1 }), num('wind', 'Sideways drift', G('Look'), 0.3, -1, 1, 0.01, '', 'How far the sparks drift to the side on the way up.')],
  build(f, t, p, ctx) {
    const D = n(p, 'loop');
    if (t < 0 || t >= D) return;
    const b = base(p, t, ctx), wind = n(p, 'wind'), out: Piece[] = [];
    for (let i = 0; i < b.N; i++) {
      const r = (k: number) => hh(b.seed, i, k), kc = pick(r(1), 1, 3) * b.sp, ph = fract(b.u * kc + r(2)), m = pick(r(5), 1, 3) * b.sp;
      const x = r(3) * b.A + wind * (ph - 0.5) * 0.35 + (0.012 + 0.035 * r(4)) * Math.sin(TAU * (m * b.u + r(6)));
      const y = 1.04 - ph * 1.14, env = smoothstep(0, 0.1, ph) * (1 - smoothstep(0.45, 1, ph)), flick = 0.62 + 0.38 * Math.sin(TAU * (pick(r(7), 3, 9) * b.u + r(8)));
      const sz = (0.007 + 0.016 * r(9)) * b.sz * (1 - 0.35 * ph);
      out.push({ tex: AMBIENT_TEX.glow, x, y, hw: sz * 2.4, hh: sz * 2.4, rot: 0, tint: mixRGB(b.c1, b.c2, r(10)), a: env * flick * b.op, near: r(9) });
    }
    flush(f, s(p, 'layer'), out);
  },
};

// ---------------------------------------------------------------------------------------------------------------------
// Snow

export const ambientSnow: ShowEffect = {
  ...base_, id: 'ambient.snow', name: 'Falling snow', tagline: 'Snowflakes drift down in three depths: small and slow far away, big and fast up close.',
  params: [...common({ count: 110, tint: '#ffffff', tint2: '#bfe0ff', size: 1, seed: 5 }), num('wind', 'Wind', G('Look'), 0.4, -1, 1, 0.01, '', 'How far the flakes are blown sideways as they fall.')],
  build(f, t, p, ctx) {
    const D = n(p, 'loop');
    if (t < 0 || t >= D) return;
    const b = base(p, t, ctx), wind = n(p, 'wind'), out: Piece[] = [];
    for (let i = 0; i < b.N; i++) {
      const r = (k: number) => hh(b.seed, i, k), near = r(8), layer = near > 0.8 ? 2 : near > 0.4 ? 1 : 0;
      const kc = [1, 2, 3][layer]! * b.sp, ph = fract(b.u * kc + r(2)), m = pick(r(5), 1, 3) * b.sp;
      const x = r(3) * (b.A + 0.2) - 0.1 + wind * (ph - 0.5) * 0.4 * (0.5 + layer * 0.3) + (0.01 + 0.03 * r(4)) * Math.sin(TAU * (m * b.u + r(6)));
      const y = -0.05 + ph * 1.1, env = smoothstep(0, 0.05, ph) * (1 - smoothstep(0.93, 1, ph));
      const sz = [0.0048, 0.0095, 0.02][layer]! * (0.7 + 0.6 * r(9)) * b.sz;
      const flake = layer > 0 && r(11) > 0.35;
      out.push({ tex: flake ? AMBIENT_TEX.flake : AMBIENT_TEX.dot, x, y, hw: sz, hh: sz, rot: flake ? TAU * (b.u * pick(r(12), 1, 2) * (r(13) > 0.5 ? 1 : -1) + r(14)) : 0, tint: mixRGB(b.c1, b.c2, r(10) * 0.7), a: (0.55 + 0.22 * layer) * env * b.op, near });
    }
    flush(f, s(p, 'layer'), out);
  },
};

// ---------------------------------------------------------------------------------------------------------------------
// Fireflies

export const ambientFireflies: ShowEffect = {
  ...base_, id: 'ambient.fireflies', name: 'Fireflies', tagline: 'Soft yellow-green lights wander slowly and blink on and off, no two alike.',
  params: common({ count: 26, tint: '#d8ff5a', tint2: '#8affb0', size: 1, seed: 7 }),
  build(f, t, p, ctx) {
    const D = n(p, 'loop');
    if (t < 0 || t >= D) return;
    const b = base(p, t, ctx), out: Piece[] = [];
    for (let i = 0; i < b.N; i++) {
      const r = (k: number) => hh(b.seed, i, k), a1 = pick(r(1), 1, 3) * b.sp, a2 = pick(r(2), 1, 3) * b.sp, a3 = pick(r(3), 1, 3) * b.sp, a4 = pick(r(4), 1, 2) * b.sp;
      const x = r(5) * b.A + 0.08 * Math.sin(TAU * (a1 * b.u + r(6))) + 0.04 * Math.sin(TAU * (a2 * b.u + r(7)));
      const y = 0.25 + 0.7 * r(8) + 0.06 * Math.sin(TAU * (a3 * b.u + r(9))) + 0.03 * Math.sin(TAU * (a4 * b.u + r(10)));
      const e = pick(r(11), 1, 3) * (b.sp > 1 ? 1 : 1), blink = Math.max(0, Math.sin(TAU * (e * b.u + r(12)))) ** 2.5;
      const sz = (0.021 + 0.018 * r(13)) * b.sz, col = mixRGB(b.c1, b.c2, r(14));
      out.push({ tex: AMBIENT_TEX.glow, x, y, hw: sz * 2.2, hh: sz * 2.2, rot: 0, tint: col, a: blink * 0.9 * b.op, near: r(13) });
      out.push({ tex: AMBIENT_TEX.dot, x, y, hw: sz * 0.28, hh: sz * 0.28, rot: 0, tint: mixRGB(col, [1, 1, 1], 0.7), a: blink * b.op, near: r(13) });
    }
    flush(f, s(p, 'layer'), out);
  },
};

// ---------------------------------------------------------------------------------------------------------------------
// God rays

const SOURCES: [string, string][] = [['topleft', 'From the top left'], ['top', 'From above'], ['topright', 'From the top right'], ['left', 'From the left']];
export const ambientRays: ShowEffect = {
  ...base_, id: 'ambient.rays', name: 'God rays', tagline: 'Long soft beams of light fan down from one corner, slowly swaying and breathing, with dust glittering in them.',
  params: [...common({ count: 7, tint: '#ffe9b0', tint2: '#ffffff', size: 1, opacity: 0.8, seed: 4 }), enm('from', 'Light comes from', G('Look'), 'topleft', SOURCES, 'Where the beams start.'), num('spread', 'Fan width', G('Look'), 0.9, 0.2, 2, 0.01, '', 'How wide the beams fan out (in radians).'), num('dust', 'Dust in the beams', G('Look'), 1, 0, 2, 0.01, 'x', 'Glittering specks floating through the light.')],
  build(f, t, p, ctx) {
    const D = n(p, 'loop');
    if (t < 0 || t >= D) return;
    const b = base(p, t, ctx), out: Piece[] = [], from = s(p, 'from'), spread = n(p, 'spread');
    const src = from === 'top' ? { x: b.A * 0.5, y: -0.25, a: Math.PI / 2 } : from === 'topright' ? { x: b.A + 0.15, y: -0.25, a: Math.PI * 0.72 } : from === 'left' ? { x: -0.25, y: 0.3, a: 0.12 } : { x: -0.15, y: -0.25, a: Math.PI * 0.28 };
    const N = Math.max(1, Math.round(n(p, 'count')));
    for (let i = 0; i < N; i++) {
      const r = (k: number) => hh(b.seed, i, k), bandAngle = src.a + (N === 1 ? 0 : (i / (N - 1) - 0.5) * spread) + (r(1) - 0.5) * 0.08;
      const ang = bandAngle + 0.05 * Math.sin(TAU * (pick(r(2), 1, 2) * b.sp * b.u + r(3)));
      const len = 2.1, width = (0.05 + 0.12 * r(4)) * b.sz, breath = 0.55 + 0.45 * Math.sin(TAU * (pick(r(5), 1, 2) * b.sp * b.u + r(6)));
      const dx = Math.cos(ang), dy = Math.sin(ang);
      out.push({ tex: AMBIENT_TEX.ray, x: src.x + dx * len / 2, y: src.y + dy * len / 2, hw: width, hh: len / 2, rot: Math.atan2(-dx, dy), tint: mixRGB(b.c1, b.c2, r(7) * 0.5), a: 0.36 * breath * b.op, near: 0 });
    }
    const dust = Math.round(Q(ctx, 30) * n(p, 'dust'));
    for (let i = 0; i < dust; i++) {
      const r = (k: number) => hh(b.seed + 91, i, k), ph = fract(b.u * pick(r(1), 1, 2) * b.sp + r(2)), along = 0.2 + 0.8 * r(3), ang = src.a + (r(4) - 0.5) * spread;
      const x = src.x + Math.cos(ang) * along * 1.5 + 0.03 * Math.sin(TAU * (b.u * b.sp + r(5))), y = src.y + Math.sin(ang) * along * 1.5 + 0.1 * (ph - 0.5);
      const tw = Math.max(0, Math.sin(TAU * (pick(r(6), 2, 5) * b.u + r(7)))) ** 2, sz = (0.003 + 0.004 * r(8)) * b.sz;
      out.push({ tex: AMBIENT_TEX.dot, x, y, hw: sz, hh: sz, rot: 0, tint: b.c2, a: 0.8 * tw * b.op, near: r(8) });
    }
    flush(f, s(p, 'layer'), out);
  },
};

// ---------------------------------------------------------------------------------------------------------------------
// Bokeh and dust

export const ambientBokeh: ShowEffect = {
  ...base_, id: 'ambient.bokeh', name: 'Bokeh and dust', tagline: 'Big out-of-focus discs of light float and breathe in the background, with fine dust drifting up.',
  params: [...common({ count: 16, tint: '#ffd68a', tint2: '#ff8ac8', size: 1, opacity: 0.7, seed: 6 }), num('dust', 'Fine dust', G('Look'), 1, 0, 2, 0.01, 'x', 'Tiny specks drifting slowly upward.')],
  build(f, t, p, ctx) {
    const D = n(p, 'loop');
    if (t < 0 || t >= D) return;
    const b = base(p, t, ctx), out: Piece[] = [];
    for (let i = 0; i < b.N; i++) {
      const r = (k: number) => hh(b.seed, i, k), m1 = pick(r(1), 1, 2) * b.sp, m2 = pick(r(2), 1, 2) * b.sp;
      const x = r(3) * (b.A + 0.2) - 0.1 + 0.07 * Math.sin(TAU * (m1 * b.u + r(4))), y = r(5) * 1.1 - 0.05 + 0.05 * Math.sin(TAU * (m2 * b.u + r(6)));
      const sz = (0.035 + 0.11 * r(7) ** 1.6) * b.sz, breath = 0.65 + 0.35 * Math.sin(TAU * (pick(r(8), 1, 3) * b.u + r(9)));
      out.push({ tex: AMBIENT_TEX.bokeh, x, y, hw: sz, hh: sz, rot: 0, tint: mixRGB(b.c1, b.c2, r(10)), a: (0.17 + 0.28 * (1 - r(7))) * breath * b.op, near: r(7) });
    }
    const dust = Math.round(Q(ctx, 40) * n(p, 'dust'));
    for (let i = 0; i < dust; i++) {
      const r = (k: number) => hh(b.seed + 77, i, k), ph = fract(b.u * pick(r(1), 1, 2) * b.sp + r(2));
      const x = r(3) * b.A + 0.02 * Math.sin(TAU * (b.u * 2 * b.sp + r(4))), y = 1.02 - ph * 1.08, env = smoothstep(0, 0.12, ph) * (1 - smoothstep(0.7, 1, ph)), sz = (0.002 + 0.004 * r(5)) * b.sz;
      out.push({ tex: AMBIENT_TEX.dot, x, y, hw: sz, hh: sz, rot: 0, tint: mixRGB(b.c1, [1, 1, 1], 0.5), a: 0.7 * env * (0.6 + 0.4 * Math.sin(TAU * (pick(r(6), 2, 5) * b.u + r(7)))) * b.op, near: r(5) });
    }
    flush(f, s(p, 'layer'), out);
  },
};

// ---------------------------------------------------------------------------------------------------------------------
// Starfield

export const ambientStars: ShowEffect = {
  ...base_, id: 'ambient.stars', name: 'Twinkling stars', tagline: 'A field of stars that twinkle at their own pace, with the odd shooting star.',
  params: [...common({ count: 80, tint: '#ffffff', tint2: '#9ad0ff', size: 1, seed: 8 }), num('shooting', 'Shooting stars', G('Look'), 2, 0, 5, 1, 'count', 'Shooting stars per loop.', true)],
  build(f, t, p, ctx) {
    const D = n(p, 'loop');
    if (t < 0 || t >= D) return;
    const b = base(p, t, ctx), out: Piece[] = [];
    for (let i = 0; i < b.N; i++) {
      const r = (k: number) => hh(b.seed, i, k), tw = (0.5 + 0.5 * Math.sin(TAU * (pick(r(1), 1, 4) * b.sp * b.u + r(2)))) ** 2, sz = (0.005 + 0.016 * r(3) ** 2) * b.sz;
      out.push({ tex: AMBIENT_TEX.star, x: r(4) * b.A, y: r(5) * 0.85, hw: sz, hh: sz, rot: 0, tint: mixRGB(b.c1, b.c2, r(6) * 0.8), a: (0.25 + 0.75 * tw) * b.op, near: r(3) });
    }
    for (let k = 0; k < Math.round(n(p, 'shooting')); k++) {
      const r = (q: number) => hh(b.seed + 301, k, q), u0 = (k + 0.15 + 0.7 * r(1)) / Math.max(1, Math.round(n(p, 'shooting'))), life = 0.05, w = (b.u - u0) / life;
      if (w < 0 || w > 1) continue;
      const x0 = b.A * (0.1 + 0.8 * r(2)), y0 = 0.05 + 0.3 * r(3), ang = Math.PI * (0.18 + 0.12 * r(4)), len = 0.35, hx = x0 + Math.cos(ang) * len * w * 3, hy = y0 + Math.sin(ang) * len * w * 3;
      const fade = Math.sin(Math.PI * w);
      out.push({ tex: AMBIENT_TEX.ray, x: hx - Math.cos(ang) * len * 0.5, y: hy - Math.sin(ang) * len * 0.5, hw: 0.004 * b.sz, hh: len * 0.5, rot: Math.atan2(Math.cos(ang), -Math.sin(ang)), tint: b.c1, a: 0.9 * fade * b.op, near: 0 });
      out.push({ tex: AMBIENT_TEX.glow, x: hx, y: hy, hw: 0.018 * b.sz, hh: 0.018 * b.sz, rot: 0, tint: [1, 1, 1], a: fade * b.op, near: 0 });
    }
    flush(f, s(p, 'layer'), out);
  },
};

export const AMBIENT_FX: ShowEffect[] = [ambientEmbers, ambientSnow, ambientFireflies, ambientRays, ambientBokeh, ambientStars];
