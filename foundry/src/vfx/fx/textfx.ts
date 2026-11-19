/**
 * Effects that live on letters: flames licking off the top of a word, icicles hanging from it, electric arcs crawling over it. They
 * follow the text element they are aimed at (its silhouette and box), and leave the text itself as it is.
 */
import { makeRng } from '../../core/util/prng';
import { color, enm, num } from '../../core/params';
import { DISTORT, FIRE_PALETTES, type Frame, type RGB } from '../engine/frame';
import { discharge, ribbon } from '../engine/lightning';
import { clamp, easeOutCubic, h1, hex, lerp, mixRGB, smoothstep } from '../engine/math';
import { n, s, type EffectCtx, type PValues, type ShowEffect } from './effect';
import { triPoly } from './helpers';
import { flame, setVolPalette, smokePuff } from './volume';

const G = (group: string) => ({ section: 'Effect', group });
const where = () => [
  num('cx', 'Centre X', G('Position'), 0.5, 0, 1, 0.001, '', 'Centre of the word, as a fraction of the stage width (set for you when the effect is aimed at a text).'),
  num('cy', 'Centre Y', G('Position'), 0.5, 0, 1, 0.001, '', 'Centre of the word, as a fraction of the stage height.'),
  num('width', 'Word width', G('Position'), 0.9, 0.1, 1.8, 0.01, '', 'Width of the word when no text is chosen, in stage heights.'),
  num('height', 'Word height', G('Position'), 0.22, 0.04, 0.8, 0.005, '', 'Height of the word when no text is chosen.'),
];
const durP = (def: number) => num('duration', 'Length', G('Timing'), def, 0.8, 12, 0.01, 's', 'How long the effect lasts, fading in and out.');
const strengthP = () => num('strength', 'Strength', G('Look'), 1, 0.3, 2, 0.01, 'x', 'How big and bright it is.');

/** The box of the word being worked on, in scene units. */
function box(p: PValues, ctx: EffectCtx): { x0: number; y0: number; x1: number; y1: number; w: number; h: number } {
  const b = ctx.silhouette?.box;
  if (b) return { ...b, w: b.x1 - b.x0, h: b.y1 - b.y0 };
  const cx = n(p, 'cx') * ctx.aspect, cy = n(p, 'cy'), w = n(p, 'width'), h = n(p, 'height');
  return { x0: cx - w / 2, x1: cx + w / 2, y0: cy - h / 2, y1: cy + h / 2, w, h };
}
const envelope = (t: number, D: number): number => smoothstep(0, 0.3, t) * (1 - smoothstep(D - 0.5, D, t));

/** A smooth value noise in [0, 1], for slow drifts that must not repeat. */
const vnoise = (x: number, seed: number): number => {
  const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f);
  return lerp(h1(i * 17.31 + seed * 3.7), h1((i + 1) * 17.31 + seed * 3.7), u);
};

/** The upper contour of the word as a lookup over x: the y of the nearest letter top and how close a letter is (1 on a letter, fading across gaps). */
function contour(ctx: EffectCtx, b: { x0: number; y0: number; w: number; h: number }): (xf: number) => { y: number; cover: number; th: number } {
  const M = 192, ys = new Array<number>(M).fill(Infinity), ths = new Array<number>(M).fill(0);
  const pts = ctx.silhouette?.top?.();
  if (pts?.length) for (const q of pts) {
    const j = clamp(Math.floor(((q.x - b.x0) / b.w) * M), 0, M - 1);
    if (q.y < ys[j]!) { ys[j] = q.y; ths[j] = q.th; }
  } else ys.fill(b.y0 + b.h * 0.12), ths.fill(b.h * 0.7);
  const ceil = Math.min(...ys.filter((y) => y < Infinity)), cap = Math.max(...ths);
  for (let j = 0; j < M; j++) if (ys[j]! < Infinity) ys[j] = Math.min(ys[j]!, ceil + cap * 0.17);        // the fire in a valley (inside a U) starts near the tops of the letters beside it
  const near = new Array<{ y: number; d: number; th: number }>(M);
  let last = -1;
  for (let j = 0; j < M; j++) { if (ys[j]! < Infinity) last = j; near[j] = last < 0 ? { y: Infinity, d: 1e9, th: 0 } : { y: ys[last]!, d: j - last, th: ths[last]! }; }
  last = -1;
  for (let j = M - 1; j >= 0; j--) { if (ys[j]! < Infinity) last = j; if (last >= 0 && last - j < near[j]!.d) near[j] = { y: ys[last]!, d: last - j, th: ths[last]! }; }
  const gap = Math.max(2, M * (b.h * 0.35 / b.w));
  return (xf) => { const q = near[clamp(Math.floor(xf * M), 0, M - 1)]!; return q.y === Infinity ? { y: b.y0 + b.h * 0.12, cover: 1, th: b.h * 0.7 } : { y: q.y, cover: Math.exp(-1.6 * (q.d / gap) ** 2), th: q.th }; };
}

export const textFire: ShowEffect = {
  id: 'text.fire', name: 'Burning letters', tagline: 'Flames grow out of the top edge of every letter and merge into one turbulent fire, with a hot rim on the letters, dark smoke, streaking embers and a faint heat shimmer.', category: 'candidate',
  params: [...where(), enm('fire', 'Fire colour', G('Look'), 'fire', [['fire', 'Orange fire'], ['blue', 'Blue flame'], ['green', 'Green fire'], ['violet', 'Violet fire'], ['white', 'White-hot']], 'The colour of the flames.'), strengthP(), num('flames', 'Flames', G('Look'), 12, 3, 30, 1, 'count', 'How many large flames burn along the word (smaller ones fill between them).', true), num('smoke', 'Smoke', G('Look'), 1, 0, 1.6, 0.01, 'x', 'How much dark smoke rises above the fire.'), num('embers', 'Embers', G('Look'), 1, 0, 2, 0.01, 'x', 'How many sparks and embers lift off.'), num('haze', 'Heat shimmer', G('Look'), 1, 0, 2, 0.01, 'x', 'How much the air shimmers above the fire.'), num('seed', 'Variation', G('Look'), 4, 1, 99, 1, '', 'Pick a different arrangement.', true), durP(3.2)],
  duration: (p) => n(p, 'duration'),
  impactAt: () => 0.2,
  cues: (p) => [{ t: 0, kind: 'whoosh', gain: 0.5, dur: n(p, 'duration') * 0.8, pitch: 0.7 }, { t: 0.1, kind: 'rumble', gain: 0.35, dur: n(p, 'duration') * 0.7 }],
  build(f, t, p, ctx) {
    const D = n(p, 'duration');
    if (t < 0 || t >= D) return;
    const b = box(p, ctx), k = n(p, 'strength'), N = Math.round(n(p, 'flames')), seed = n(p, 'seed'), live = envelope(t, D), fireId = s(p, 'fire'), pal = FIRE_PALETTES[fireId] ?? FIRE_PALETTES.fire!;
    const Q = ctx.quality ?? 1, wind = 0.1 * Math.sin(t * 0.8 + seed) + 0.06 * Math.sin(t * 2.1 + seed * 2), ignite = smoothstep(0, 0.9, t);          // the fire takes hold over the first moments
    setVolPalette(f, fireId, 'black');
    const hot = mixRGB(pal[2]!, pal[3]!, fireId === 'fire' ? 0.45 : 0.18), warm = mixRGB(pal[1]!, pal[2]!, 0.5), at = ctx.silhouette?.rotation ?? 0;
    const edge = contour(ctx, b);
    const add = (x: number, y: number, hw: number, hh: number, type: number, color: RGB, intensity: number, e1?: number, rot = 0): void => { if (intensity > 0.004) f.additive.push({ x, y, hw, hh, rot, type, color, intensity, e1 }); };
    const flick = (x: number, sp = 1): number => 0.78 + 0.22 * Math.sin(t * 11 * sp + x * 17) * (0.6 + 0.4 * Math.sin(t * 3.1 + x * 5)) + 0.1 * (vnoise(t * 7 * sp + x * 9, seed) - 0.5);
    // light the fire throws: a wide warm glow on the picture, and a hot rim along the top of the letters
    add((b.x0 + b.x1) / 2, b.y0 + b.h * 0.1, b.w * 0.66, b.h * 1.25, 0, warm, 0.2 * live * ignite * k * flick(0.3, 0.5), 1.6);
    add((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, b.w * 0.58, b.h * 0.8, 0, pal[1]!, 0.16 * live * ignite * k, 1.4);
    const rimN = Math.round(N * 3.4);
    for (let i = 0; i < rimN; i++) {
      const xf = (i + 0.5) / rimN, e = edge(xf), x = b.x0 + xf * b.w;
      add(x, e.y + b.h * 0.01, b.w / rimN * 1.5, b.h * 0.17, 0, hot, (fireId === 'fire' ? 0.62 : 0.42) * e.cover * live * ignite * k * flick(x, 1.3), 2.2);
    }
    for (let i = 0; i < 20; i++) {                                                     // the faces of the letters glow unevenly, like heated metal
      const hh = (kk: number) => h1(seed * 19 + i * 7 + kk), pt = ctx.silhouette ? ctx.silhouette.sample(hh(1), hh(2)) : { x: b.x0 + hh(1) * b.w, y: b.y0 + hh(2) * b.h };
      add(pt.x, pt.y, b.h * 0.13, b.h * 0.13, 0, mixRGB(warm, hot, hh(3)), 0.34 * (0.5 + 0.5 * Math.sin(t * (1.6 + 2.4 * hh(4)) + hh(5) * 20)) * live * ignite * k, 2);
    }
    // the fire itself: three ranks of soft flames standing on the contour of the letters, wide enough to merge, plus a few tall licks
    const wBase = clamp((b.w / N) * 1.9, b.h * 0.3, b.h * 1.15), hBase = b.h * 1.28 * k;
    const rank = (count: number, w0: number, h0: number, salt: number, heat: number, alpha: number, lean: number, spreadX = 0.5): void => {
      const C = Math.max(2, Math.round(count));
      for (let i = 0; i < C; i++) {
        const hh = (kk: number) => h1(seed * 71 + salt * 13 + i * 13 + kk), xf = clamp((i + 0.5 + (hh(1) - 0.5) * spreadX * 2) / C), e = edge(xf), tl = t + hh(2) * 7;
        const mass = 0.5 + 0.5 * vnoise(xf * 5.5 + t * 0.7 + salt, seed), ph = 0.62 + 0.38 * Math.sin(tl * (3.4 + 3.2 * hh(3)) + i * 1.9), burst = 0.8 + 0.2 * Math.sin(tl * 1.9 + hh(4) * 6);
        const reach = (0.72 + 0.28 * mass) * (0.55 + 0.45 * e.cover) * (0.72 + 0.28 * ph) * burst * ignite * live;
        flame(f, { x: b.x0 + xf * b.w, y: e.y + b.h * 0.03, w: w0 * (0.8 + 0.4 * hh(5)) * (0.7 + 0.3 * e.cover), h: h0 * (0.7 + 0.5 * hh(6)) * reach, age: 0.03 + 0.2 * hh(7), seed: seed + salt + i * 3.7, t: tl, heat, alpha: alpha * (0.35 + 0.65 * e.cover), rot: at + wind * 0.9 + Math.sin(tl * 2.4 + i * 1.3) * lean * (0.6 + 0.8 * hh(8)), soft: true });
      }
    };
    rank(N * 0.9, wBase * 1.25, hBase, 1, 0.82, 0.78, 0.1, 0.5);
    rank(N * 1.5, wBase * 0.62, hBase * 0.8, 2, 0.95, 0.82, 0.16, 0.5);
    rank(Math.max(3, N * 0.32), wBase * 0.95, hBase * 1.2, 5, 1, 0.85, 0.12, 0.8);       // tongues that shoot up, in and out of sight
    rank(N * 2.2, wBase * 0.4, hBase * 0.46, 3, 1, 0.9, 0.24, 0.45);                    // the fringe of small flickers on the edge
    // smoke: dark plumes that leave the tips of the flames, each a chain of puffs along a swaying path, lit from below by the fire
    const sm = n(p, 'smoke');
    for (let i = 0; i < Math.round(5 * Q); i++) {
      const hh = (kk: number) => h1(seed * 53 + i * 11 + kk), xf = clamp(0.06 + 0.88 * ((i + 0.5 + (hh(2) - 0.5) * 0.7) / Math.max(1, Math.round(5 * Q)))), e = edge(xf), x0 = b.x0 + xf * b.w, sway = 0.7 + 0.6 * hh(3);
      for (let j = 0; j < 5; j++) {
        const ph = (((t * 0.3 + hh(1) - j * 0.075) % 1) + 1) % 1, rise = b.h * (0.7 + 2.1 * ph);
        smokePuff(f, { x: x0 + Math.sin(ph * 5.5 * sway + i * 2) * b.h * 0.3 * ph + (wind + 0.14) * ph * b.h * 1.6, y: e.y - rise, size: b.h * (0.34 + 0.55 * ph), age: ph, seed: seed + i * 2.3 + j * 0.7, t: ph * 2.5 + i + j * 0.4, alpha: 0.5 * sm * live * ignite * Math.sin(Math.PI * Math.min(1, ph * 1.05)) ** 1.3, heat: (fireId === 'fire' ? 0.4 : 0.14) * (1 - ph) ** 2.2, light: [0.1, 0.9], soft: 0.55 });
      }
    }
    // embers and sparks: bright, streaking up on the heat and cooling from white to red
    const em = n(p, 'embers'), grad = (ph: number): RGB => ph < 0.3 ? mixRGB(pal[3]!, pal[2]!, ph / 0.3) : mixRGB(pal[2]!, pal[1]!, Math.min(1, (ph - 0.3) / 0.7));
    for (let i = 0; i < Math.round(46 * em * Q); i++) {
      const hh = (kk: number) => h1(seed * 31 + i * 7 + kk), span = 1.1 + 1.5 * hh(1), ph = (((t + hh(2) * span) / span) % 1 + 1) % 1, e = edge(clamp(hh(3))), x0 = b.x0 + hh(3) * b.w;
      const up = b.h * (0.5 + 2.6 * hh(4)), path = (q: number): { x: number; y: number } => ({ x: x0 + Math.sin(q * 8 + i * 2.3) * b.h * 0.22 * q + (wind + 0.1) * q * b.h * 1.4, y: e.y - up * (1 - (1 - q) ** 1.6) });
      const pt = path(ph), r = lerp(0.0028, 0.0078, hh(5)) * (1 - ph * 0.55) * Math.sqrt(k), pulse = 0.7 + 0.3 * Math.sin(t * 30 + i * 9), life = (1 - ph) ** 1.15 * smoothstep(0, 0.05, ph) * live * ignite;
      add(pt.x, pt.y, r * 2.4, r * 2.4, 0, grad(ph), 2.4 * life * pulse, 2);
      for (let j = 1; j <= 3; j++) { const q = path(Math.max(0, ph - j * 0.025)); add(q.x, q.y, r * 1.6 * (1 - j * 0.22), r * 1.6 * (1 - j * 0.22), 0, grad(Math.max(0, ph - j * 0.025)), 1.1 * life * pulse * (1 - j * 0.3), 2); }
    }
    // a faint shimmer in the air above the fire (it fades out before it reaches the letters)
    const hz = n(p, 'haze');
    if (hz > 0.01) f.distort.push({ kind: DISTORT.heat, a: [0.0042 * hz * live * ignite * Math.min(1.4, k), t, 20], b: [0, 0, b.y0 - b.h * 4.2, b.y0 - 0.2] });
  },
};

export const textIce: ShowEffect = {
  id: 'text.ice', name: 'Frozen letters', tagline: 'Icicles grow and hang from the word, frost glints on the letters and cold mist drifts off them.', category: 'candidate',
  params: [...where(), strengthP(), num('icicles', 'Icicles', G('Look'), 14, 3, 30, 1, 'count', 'Icicles hanging from the word.', true), num('seed', 'Variation', G('Look'), 6, 1, 99, 1, '', 'Pick a different arrangement.', true), durP(3.4)],
  duration: (p) => n(p, 'duration'),
  impactAt: () => 0.3,
  cues: (p) => [{ t: 0, kind: 'sweep', gain: 0.25, dur: 0.8, pitch: 2.4 }, { t: n(p, 'duration') * 0.5, kind: 'tick', gain: 0.2, pitch: 3 }],
  build(f, t, p, ctx) {
    const D = n(p, 'duration');
    if (t < 0 || t >= D) return;
    const b = box(p, ctx), k = n(p, 'strength'), N = Math.round(n(p, 'icicles')), seed = n(p, 'seed'), live = 1 - smoothstep(D - 0.5, D, t), icy: RGB = [0.62, 0.86, 1];
    setVolPalette(f, 'white', 'ice');
    f.additive.push({ x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2, hw: b.w * 0.6, hh: b.h * 0.8, rot: 0, type: 0, color: icy, intensity: 0.22 * live * k, e1: 1.4 });
    for (let i = 0; i < N; i++) {
      const hh = (kk: number) => h1(seed * 41 + i * 7 + kk), x = b.x0 + ((i + 0.5 + (hh(1) - 0.5) * 0.7) / N) * b.w, g = easeOutCubic(clamp((t - 0.15 - hh(2) * 1.0) / 0.9));
      if (g <= 0) continue;
      const len = b.h * lerp(0.28, 0.7, hh(3)) * g * k, wid = Math.max(0.006, b.h * lerp(0.05, 0.1, hh(4))), y0 = b.y1 - b.h * 0.12;
      const tip: [number, number] = [x, y0 + len], l: [number, number] = [x - wid, y0], r: [number, number] = [x + wid, y0], m: [number, number] = [x, y0 + len * 0.45];
      triPoly(f.polys, l, tip, m, [0.55, 0.82, 1], 0.92 * live, [0.9, 0.98, 1], [0.9, 0.98, 1]);
      triPoly(f.polys, r, tip, m, [0.22, 0.5, 0.85], 0.92 * live, [0.55, 0.82, 1], [0.9, 0.98, 1]);
      triPoly(f.polys, l, r, m, [0.55, 0.82, 1], 0.88 * live);
      if (g >= 1) { const ph = ((t * 0.8 + hh(5)) % 1 + 1) % 1; f.additive.push({ x, y: y0 + len * (0.3 + 0.7 * ph), hw: 0.006, hh: 0.006, rot: 0, type: 0, color: icy, intensity: 0.9 * live * (1 - ph) }); }
    }
    for (let i = 0; i < 12; i++) {
      const hh = (kk: number) => h1(seed * 17 + i * 5 + kk), ph = ((t * 1.3 + hh(1)) % 1 + 1) % 1, pt = ctx.silhouette ? ctx.silhouette.sample(hh(2), hh(3)) : { x: b.x0 + hh(2) * b.w, y: b.y0 + hh(3) * b.h };
      f.additive.push({ x: pt.x, y: pt.y, hw: 0.035 * k * Math.sin(Math.PI * ph), hh: 0.035 * k * Math.sin(Math.PI * ph), rot: 0.2, type: 2, color: [0.9, 0.97, 1], intensity: 1.1 * Math.sin(Math.PI * ph) * live });
    }
    for (let i = 0; i < 6; i++) {
      const hh = (kk: number) => h1(seed * 29 + i * 9 + kk), ph = ((t * 0.3 + hh(1)) % 1 + 1) % 1;
      smokePuff(f, { x: b.x0 + hh(2) * b.w, y: b.y1 + b.h * (0.1 + 0.9 * ph), size: b.h * 0.5 * (0.5 + ph), age: ph, seed: seed + i * 1.9, t: ph * 2.5, alpha: 0.4 * live * Math.sin(Math.PI * Math.min(1, ph * 1.1)), heat: 0, light: [0.3, -0.9], soft: 0.75 });
    }
  },
};

export const textElectric: ShowEffect = {
  id: 'text.electric', name: 'Electric letters', tagline: 'Arcs of electricity crawl over the letters and jump between them, flickering, with a crackling glow.', category: 'candidate',
  params: [...where(), color('tint', 'Arc colour', G('Look'), '#8fd8ff', 'Colour of the glow around the arcs.'), strengthP(), num('arcs', 'Arcs', G('Look'), 8, 1, 16, 1, 'count', 'Arcs alive at once.', true), num('seed', 'Variation', G('Look'), 5, 1, 99, 1, '', 'Pick a different arrangement.', true), durP(3)],
  duration: (p) => n(p, 'duration'),
  impactAt: () => 0.1,
  cues: (p) => [{ t: 0, kind: 'zap', gain: 0.5, dur: n(p, 'duration') * 0.8, pitch: 1.6 }],
  build(f, t, p, ctx) {
    const D = n(p, 'duration');
    if (t < 0 || t >= D) return;
    const b = box(p, ctx), k = n(p, 'strength'), N = Math.round(n(p, 'arcs')), live = envelope(t, D), glow = hex(s(p, 'tint')), step = Math.floor(t * 24), seed = n(p, 'seed');
    f.boltCore = [1, 1, 1]; f.boltGlow = glow;
    f.additive.push({ x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2, hw: b.w * 0.6, hh: b.h * 0.9, rot: 0, type: 0, color: glow, intensity: (0.25 + 0.15 * Math.sin(t * 40)) * live * k, e1: 1.2 });
    const rng = makeRng(step * 131 + seed * 17);
    for (let i = 0; i < N; i++) {
      if (rng.next() < 0.18) continue;                              // arcs blink on and off
      const sa = ctx.silhouette ? ctx.silhouette.sample(rng.next(), rng.next()) : { x: b.x0 + rng.next() * b.w, y: b.y0 + rng.next() * b.h };
      const sb = ctx.silhouette ? ctx.silhouette.sample(clamp(rng.next() * 0.7 + (sa.x - b.x0) / b.w - 0.35), rng.next()) : { x: b.x0 + rng.next() * b.w, y: b.y0 + rng.next() * b.h };
      const d = Math.hypot(sb.x - sa.x, sb.y - sa.y);
      if (d < 0.05) continue;
      const arcs = discharge(rng, sa, Math.atan2(sb.y - sa.y, sb.x - sa.x), d, 0.35);
      for (const arc of arcs.slice(0, 3)) ribbon(f.bolts, arc.pts, arc.level === 0 ? 0.0046 * k : 0.003 * k, (arc.level === 0 ? 1.0 : 0.7) * live * (0.7 + 0.3 * rng.next()), true);
      f.additive.push({ x: sa.x, y: sa.y, hw: 0.03 * k, hh: 0.03 * k, rot: 0, type: 3, color: glow, intensity: 0.9 * live });
    }
    if (rng.next() < 0.35) f.exposure *= 1 + 0.05 * live;
  },
};

export const TEXT_FX: ShowEffect[] = [textFire, textIce, textElectric];
