/**
 * Symbol transformation and expansion: one symbol turns into another, upgrades, stretches across a reel or the whole screen, or
 * multiplies. These effects draw both symbols themselves. The first symbol disappears from the effect's start; the second is hidden
 * for the length of the effect and is simply there afterwards, so a scene ends on the new symbol.
 */
import { color, num } from '../../core/params';
import type { Frame, RGB } from '../engine/frame';
import { ICON_FX } from '../engine/frame';
import { clamp, easeInCubic, easeInOutCubic, easeOutBack, easeOutCubic, easeOutQuart, h1, hex, lerp, mixRGB, smoothstep } from '../engine/math';
import type { ObjectInfo } from '../engine/object';
import { n, s, type EffectCtx, type ShowEffect } from './effect';
import { drawIcon, iconDims } from './helpers';

const G = (group: string) => ({ section: 'Effect', group });
const base = () => [
  num('cx', 'Symbol X', G('Symbol'), 0.5, 0, 1, 0.001, '', 'Horizontal centre of the symbol, as a fraction of the stage width.'),
  num('cy', 'Symbol Y', G('Symbol'), 0.55, 0, 1, 0.001, '', 'Vertical centre of the symbol, as a fraction of the stage height.'),
  num('size', 'Symbol size', G('Symbol'), 0.3, 0.05, 0.9, 0.005, '', 'Length of the symbol\'s longest side, in stage heights.'),
];
const dur = (def: number, min = 0.4, max = 4) => num('duration', 'Duration', G('Timing'), def, min, max, 0.01, 's', 'Total length.');
const accent = (def: string) => color('accent', 'Accent colour', G('Look'), def, 'Colour of the glow, flashes and sparks.');

interface Pl { a: ObjectInfo; b: ObjectInfo | null; Cx: number; Cy: number; size: number; W: number; H: number; col: RGB }
function place(p: Record<string, number | string | boolean>, ctx: EffectCtx): Pl | null {
  const a = ctx.object;
  if (!a) return null;
  const size = n(p, 'size'), { w, h } = iconDims(a, size);
  return { a, b: ctx.object2 ?? null, Cx: n(p, 'cx') * ctx.aspect, Cy: n(p, 'cy'), size, W: w, H: h, col: mixRGB(hex(s(p, 'accent')), a.color, 0.2) };
}
const flashAt = (f: Frame, x: number, y: number, r: number, col: RGB, k: number) => {
  if (k <= 0.01) return;
  f.additive.push({ x, y, hw: r, hh: r, rot: 0, type: 3, color: col, intensity: 1.5 * k });
  f.additive.push({ x, y, hw: r * 2.2, hh: r * 2.2, rot: 0.3, type: 2, color: col, intensity: 0.8 * k });
};
const ringAt = (f: Frame, x: number, y: number, r: number, col: RGB, k: number, thick = 0.1) => { if (k > 0.01) f.additive.push({ x, y, hw: r, hh: r, rot: 0, type: 1, color: col, intensity: k, e1: thick }); };
const bellK = (u: number) => Math.sin(Math.PI * clamp(u));

export const morph: ShowEffect = {
  id: 'xform.morph', name: 'Morph', tagline: 'The first symbol dissolves in a burst of light while the second forms in its place.', category: 'candidate', usesObject: true, usesObject2: true, takesOver: true,
  params: [...base(), accent('#ffe27a'), dur(1.2)],
  duration: (p) => n(p, 'duration'), impactAt: (p) => n(p, 'duration') * 0.48,
  cues: (p) => [{ t: 0, kind: 'sweep', gain: 0.35, dur: n(p, 'duration') * 0.5 }, { t: n(p, 'duration') * 0.48, kind: 'zap', gain: 0.5, pitch: 1.3, dur: 0.4 }],
  build(f, t, p, ctx) {
    const o = place(p, ctx);
    const D = n(p, 'duration');
    if (!o || t < 0 || t >= D) return;
    const u = t / D, mid = 0.48;
    drawIcon(f, o.a, { cx: o.Cx, cy: o.Cy, size: o.size, bright: 1 + 0.5 * bellK(u / mid), alpha: 1 - smoothstep(mid - 0.08, mid + 0.04, u), fx: { mode: ICON_FX.dissolve, progress: smoothstep(0.2, mid + 0.02, u), seed: 5.3, p: 0.4, color: o.col } });
    if (o.b) {
      const land = smoothstep(mid - 0.04, mid + 0.34, u), pop = 1 + 0.14 * Math.exp(-(u - mid) * 9) * (u > mid ? 1 : 0);
      drawIcon(f, o.b, { cx: o.Cx, cy: o.Cy, size: o.size, sx: pop, sy: pop, bright: 1 + 0.6 * (1 - land), alpha: smoothstep(mid - 0.06, mid + 0.02, u), fx: { mode: ICON_FX.dissolve, progress: 1 - land, seed: 8.1, p: -0.4, color: o.col } });
    }
    const k = Math.exp(-Math.abs(u - mid) * 14);
    flashAt(f, o.Cx, o.Cy, o.size * 0.5, o.col, k);
    ringAt(f, o.Cx, o.Cy, o.size * (0.4 + 1.5 * clamp((u - mid + 0.05) / 0.5)), o.col, u > mid - 0.05 ? 1.1 * (1 - smoothstep(mid - 0.05, mid + 0.45, u)) : 0, 0.09);
  },
};

export const flip: ShowEffect = {
  id: 'xform.flip', name: 'Card flip', tagline: 'The symbol turns over like a card and shows the new one on its back.', category: 'candidate', usesObject: true, usesObject2: true, takesOver: true,
  params: [...base(), accent('#ffd86b'), dur(0.9)],
  duration: (p) => n(p, 'duration'), impactAt: (p) => n(p, 'duration') * 0.5,
  cues: (p) => [{ t: 0, kind: 'whoosh', gain: 0.4, dur: n(p, 'duration') * 0.8 }, { t: n(p, 'duration') * 0.5, kind: 'tick', gain: 0.5 }],
  build(f, t, p, ctx) {
    const o = place(p, ctx);
    const D = n(p, 'duration');
    if (!o || t < 0 || t >= D) return;
    const u = t / D, e = easeInOutCubic(u), ang = e * Math.PI, cs = Math.cos(ang), lift = Math.sin(Math.PI * e);
    const sc = 1 + 0.18 * lift, shade = 0.55 + 0.45 * Math.abs(cs), icon = cs >= 0 ? o.a : o.b ?? o.a;
    drawIcon(f, icon, { cx: o.Cx, cy: o.Cy - 0.02 * lift, size: o.size, sx: Math.max(0.02, Math.abs(cs)) * sc, sy: sc, bright: shade + 0.5 * Math.exp(-Math.abs(e - 0.5) * 18), skew: -0.12 * Math.sin(ang) * (cs >= 0 ? 1 : -1) });
    flashAt(f, o.Cx, o.Cy, o.size * 0.35, o.col, Math.exp(-Math.abs(e - 0.5) * 16) * 0.8);
    f.additive.push({ x: o.Cx, y: o.Cy, hw: o.size * 0.02 + o.size * 0.5 * (1 - Math.abs(cs)) * 0.1, hh: o.size * 0.6 * sc, rot: 0, type: 2, color: o.col, intensity: 0.9 * Math.exp(-Math.abs(e - 0.5) * 12) });
  },
};

export const upgrade: ShowEffect = {
  id: 'xform.upgrade', name: 'Upgrade', tagline: 'The symbol rises in a glow, light rays burst out, and a bigger, brighter symbol takes its place.', category: 'candidate', usesObject: true, usesObject2: true, takesOver: true,
  params: [...base(), num('grow', 'New symbol scale', G('Look'), 1.18, 1, 1.8, 0.01, 'x', 'How much bigger the new symbol lands before settling.'), accent('#ffd24a'), dur(1.5)],
  duration: (p) => n(p, 'duration'), impactAt: (p) => n(p, 'duration') * 0.45,
  cues: (p) => [{ t: 0, kind: 'sweep', gain: 0.5, dur: n(p, 'duration') * 0.45, pitch: 1.2 }, { t: n(p, 'duration') * 0.45, kind: 'thump', gain: 0.7 }, { t: n(p, 'duration') * 0.45, kind: 'zap', gain: 0.4, pitch: 1.6 }],
  build(f, t, p, ctx) {
    const o = place(p, ctx);
    const D = n(p, 'duration');
    if (!o || t < 0 || t >= D) return;
    const u = t / D, mid = 0.45;
    if (u < mid) {
      const k = u / mid;
      drawIcon(f, o.a, { cx: o.Cx, cy: o.Cy - 0.05 * easeInOutCubic(k), size: o.size, sx: 1 + 0.12 * k, sy: 1 + 0.12 * k, bright: 1 + 1.1 * k * k, alpha: 1 - 0.2 * k });
      f.additive.push({ x: o.Cx, y: o.Cy, hw: o.size * (0.5 + 0.5 * k), hh: o.size * (0.5 + 0.5 * k), rot: 0, type: 0, color: o.col, intensity: 1.0 * k, e1: 1.2 });
    } else if (o.b) {
      const k = (u - mid) / (1 - mid), ov = lerp(n(p, 'grow'), 1, easeOutBack(Math.min(1, k * 1.15), 1.3) > 1 ? 1 : easeOutCubic(k));
      const sc = 1 + (n(p, 'grow') - 1) * Math.exp(-k * 5) + 0.05 * Math.sin(k * 14) * Math.exp(-k * 4);
      drawIcon(f, o.b, { cx: o.Cx, cy: o.Cy, size: o.size, sx: sc, sy: sc, bright: 1 + 1.2 * Math.exp(-k * 7), alpha: smoothstep(0, 0.05, k) });
      void ov;
    }
    const k2 = Math.exp(-Math.abs(u - mid) * 11);
    flashAt(f, o.Cx, o.Cy, o.size * 0.6, o.col, k2);
    if (u > mid - 0.02) {
      const k = (u - mid) / (1 - mid);
      ringAt(f, o.Cx, o.Cy, o.size * (0.5 + 2.2 * easeOutQuart(k)), o.col, 1.3 * (1 - smoothstep(0, 0.7, k)), 0.08);
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * 6.283 + 0.2, len = o.size * (1.8 + 0.8 * (i % 2)) * easeOutQuart(k), fade = (1 - smoothstep(0.1, 0.8, k));
        f.additive.push({ x: o.Cx + Math.cos(a) * len * 0.5, y: o.Cy + Math.sin(a) * len * 0.5, hw: len * 0.5, hh: 0.03 * (i % 2 ? 0.6 : 1), rot: a, type: 6, color: o.col, intensity: 0.95 * fade, e1: 1 });
      }
    }
  },
};

export const swap: ShowEffect = {
  id: 'xform.swap', name: 'Quick swap', tagline: 'A fast, clean cross-swap with a small squeeze and a spark: for rapid symbol changes.', category: 'candidate', usesObject: true, usesObject2: true, takesOver: true,
  params: [...base(), accent('#bfe6ff'), dur(0.5, 0.25, 2)],
  duration: (p) => n(p, 'duration'), impactAt: (p) => n(p, 'duration') * 0.5,
  cues: (p) => [{ t: n(p, 'duration') * 0.45, kind: 'tick', gain: 0.55 }],
  build(f, t, p, ctx) {
    const o = place(p, ctx);
    const D = n(p, 'duration');
    if (!o || t < 0 || t >= D) return;
    const u = t / D, sq = 1 - 0.28 * bellK(u);
    if (u < 0.5) drawIcon(f, o.a, { cx: o.Cx, cy: o.Cy, size: o.size, sx: sq, sy: 1 + 0.12 * bellK(u), alpha: 1 - smoothstep(0.25, 0.5, u), bright: 1 + 0.4 * u });
    if (o.b && u >= 0.4) drawIcon(f, o.b, { cx: o.Cx, cy: o.Cy, size: o.size, sx: sq, sy: 1 + 0.12 * bellK(u), alpha: smoothstep(0.4, 0.62, u), bright: 1 + 0.5 * (1 - smoothstep(0.5, 1, u)) });
    flashAt(f, o.Cx, o.Cy, o.size * 0.3, o.col, Math.exp(-Math.abs(u - 0.5) * 15) * 0.9);
  },
};

function expand(id: string, name: string, tagline: string, horizontal: boolean): ShowEffect {
  return {
    id, name, tagline, category: 'candidate', usesObject: true, takesOver: true, restores: true,
    params: [
      ...base(),
      num('coverage', 'Reach', G('Look'), horizontal ? 1 : 1, 0.3, 1.4, 0.01, '', `How far it stretches, as a fraction of the stage ${horizontal ? 'width' : 'height'}.`),
      num('hold', 'Hold', G('Timing'), 0.7, 0, 3, 0.01, 's', 'How long it stays stretched.'),
      accent('#ffd24a'), dur(2.0, 0.8, 6),
    ],
    duration: (p) => n(p, 'duration'), impactAt: (p) => 0.28 * n(p, 'duration'),
    cues: (p) => [{ t: 0, kind: 'sweep', gain: 0.4, dur: 0.35 }, { t: 0.2 * n(p, 'duration'), kind: 'whoosh', gain: 0.55, dur: 0.5 }, { t: 0.32 * n(p, 'duration'), kind: 'thump', gain: 0.6 }],
    build(f, t, p, ctx) {
      const o = place(p, ctx);
      const D = n(p, 'duration');
      if (!o || t < 0 || t >= D) return;
      const hold = n(p, 'hold'), grow = Math.max(0.3, (D - hold) * 0.34), shrink = Math.max(0.3, D - hold - grow - 0.2);
      const charge = Math.min(0.28, D * 0.14);
      let e: number;
      if (t < charge) e = 0; else if (t < charge + grow) e = easeOutBack((t - charge) / grow, 1.1); else if (t < charge + grow + hold) e = 1; else e = 1 - easeInCubic((t - charge - grow - hold) / shrink);
      e = Math.max(0, e);
      const full = horizontal ? n(p, 'coverage') * ctx.aspect : n(p, 'coverage');
      const extent = lerp(horizontal ? o.W : o.H, Math.max(horizontal ? o.W : o.H, full), Math.min(1.08, e));
      const fade = 1;
      const charging = t < charge ? t / charge : 0;
      const bright = 1 + 0.45 * charging + 0.25 * bellK(Math.min(1, e));
      const shake = charging * 0.004 * Math.sin(t * 90);
      const capFrac = 0.34;
      if (horizontal) {
        const capW = o.W * capFrac, midW = Math.max(0.0001, extent - 2 * capW), x0 = o.Cx - extent / 2;
        drawIcon(f, o.a, { cx: o.Cx + shake, cy: o.Cy, size: o.size, uv: [0, 0, capFrac, 1], w: capW, h: o.H, ox: x0 + capW / 2 - o.Cx, bright, alpha: fade });
        drawIcon(f, o.a, { cx: o.Cx + shake, cy: o.Cy, size: o.size, uv: [capFrac, 0, 1 - capFrac, 1], w: midW, h: o.H, ox: 0, bright, alpha: fade });
        drawIcon(f, o.a, { cx: o.Cx + shake, cy: o.Cy, size: o.size, uv: [1 - capFrac, 0, 1, 1], w: capW, h: o.H, ox: x0 + extent - capW / 2 - o.Cx, bright, alpha: fade });
        const ex = Math.max(0, extent - o.W);
        if (ex > 0.01) {
          f.additive.push({ x: o.Cx, y: o.Cy, hw: extent * 0.55, hh: o.H * 0.5, rot: 0, type: 0, color: o.col, intensity: 0.5 * fade * Math.min(1, e), e1: 2 });
          f.additive.push({ x: o.Cx, y: o.Cy, hw: extent * 0.5, hh: o.H * 0.045, rot: 0, type: 2, color: o.col, intensity: 0.7 * fade * Math.min(1, e) });
        }
        if (t >= charge && t < charge + grow) for (const sd of [-1, 1]) flashAt(f, o.Cx + sd * extent / 2, o.Cy, o.H * 0.28, o.col, 0.9 * (1 - (t - charge) / grow));
      } else {
        const capH = o.H * capFrac, midH = Math.max(0.0001, extent - 2 * capH), y0 = o.Cy - extent / 2;
        drawIcon(f, o.a, { cx: o.Cx, cy: o.Cy + shake, size: o.size, uv: [0, 0, 1, capFrac], w: o.W, h: capH, oy: y0 + capH / 2 - o.Cy, bright, alpha: fade });
        drawIcon(f, o.a, { cx: o.Cx, cy: o.Cy + shake, size: o.size, uv: [0, capFrac, 1, 1 - capFrac], w: o.W, h: midH, oy: 0, bright, alpha: fade });
        drawIcon(f, o.a, { cx: o.Cx, cy: o.Cy + shake, size: o.size, uv: [0, 1 - capFrac, 1, 1], w: o.W, h: capH, oy: y0 + extent - capH / 2 - o.Cy, bright, alpha: fade });
        if (extent - o.H > 0.01) {
          f.additive.push({ x: o.Cx, y: o.Cy, hw: o.W * 0.6, hh: extent * 0.55, rot: 0, type: 0, color: o.col, intensity: 0.5 * fade * Math.min(1, e), e1: 2 });
          f.additive.push({ x: o.Cx, y: o.Cy, hw: o.W * 0.045, hh: extent * 0.5, rot: 0, type: 2, color: o.col, intensity: 0.7 * fade * Math.min(1, e) });
        }
        if (t >= charge && t < charge + grow) for (const sd of [-1, 1]) flashAt(f, o.Cx, o.Cy + sd * extent / 2, o.W * 0.28, o.col, 0.9 * (1 - (t - charge) / grow));
      }
      if (t < charge) f.additive.push({ x: o.Cx, y: o.Cy, hw: o.size * 0.6 * charging, hh: o.size * 0.6 * charging, rot: 0, type: 0, color: o.col, intensity: 0.9 * charging, e1: 1.2 });
    },
  };
}
export const expandH = expand('xform.expand-h', 'Expand across', 'The symbol charges, then stretches sideways across the whole reel row, holds, and releases.', true);
export const expandV = expand('xform.expand-v', 'Expand down the reel', 'The symbol charges, then stretches up and down the reel, holds, and releases.', false);

export const fill: ShowEffect = {
  id: 'xform.fill', name: 'Fill the screen', tagline: 'The symbol swells until it fills the whole screen in a flash.', category: 'candidate', usesObject: true, takesOver: true,
  params: [...base(), num('scale', 'Final scale', G('Look'), 5, 2, 12, 0.1, 'x', 'How many times its size it grows.'), accent('#fff0b0'), dur(1.2, 0.5, 4)],
  duration: (p) => n(p, 'duration'), impactAt: (p) => n(p, 'duration') * 0.5,
  cues: (p) => [{ t: 0, kind: 'sweep', gain: 0.5, dur: n(p, 'duration') * 0.6 }, { t: n(p, 'duration') * 0.55, kind: 'thump', gain: 0.8 }],
  build(f, t, p, ctx) {
    const o = place(p, ctx);
    const D = n(p, 'duration');
    if (!o || t < 0 || t >= D) return;
    const u = t / D, e = easeInCubic(u), sc = 1 + (n(p, 'scale') - 1) * e;
    drawIcon(f, o.a, { cx: lerp(o.Cx, ctx.aspect / 2, e), cy: lerp(o.Cy, 0.5, e), size: o.size, sx: sc, sy: sc, bright: 1 + 0.7 * u, alpha: 1 - smoothstep(0.55, 0.95, u) });
    f.additive.push({ x: o.Cx, y: o.Cy, hw: o.size * (0.5 + 3 * u), hh: o.size * (0.5 + 3 * u), rot: 0, type: 0, color: o.col, intensity: 1.2 * u, e1: 1 });
    f.exposure *= 1 + 0.6 * smoothstep(0.55, 0.8, u) * (1 - smoothstep(0.8, 1, u));
  },
};

export const multiply: ShowEffect = {
  id: 'xform.multiply', name: 'Multiply', tagline: 'The symbol pulses and copies burst outward, then fade, leaving the original.', category: 'candidate', usesObject: true, takesOver: false,
  params: [...base(), num('copies', 'Copies', G('Look'), 6, 2, 16, 1, 'count', 'Number of copies.', true), num('reach', 'Reach', G('Look'), 0.4, 0.1, 1, 0.01, '', 'How far the copies travel, in stage heights.'), accent('#ffe27a'), dur(1.3)],
  duration: (p) => n(p, 'duration'), impactAt: () => 0.15,
  cues: () => [{ t: 0.1, kind: 'zap', gain: 0.5, pitch: 1.4, dur: 0.4 }, { t: 0.15, kind: 'whoosh', gain: 0.4, dur: 0.5 }],
  build(f, t, p, ctx) {
    const o = place(p, ctx);
    const D = n(p, 'duration');
    if (!o || t < 0 || t >= D) return;
    const N = Math.round(n(p, 'copies')), u = t / D;
    f.additive.push({ x: o.Cx, y: o.Cy, hw: o.size * 0.6, hh: o.size * 0.6, rot: 0, type: 0, color: o.col, intensity: 0.9 * Math.exp(-Math.abs(t - 0.15) * 9), e1: 1.2 });
    for (let i = 0; i < N; i++) {
      const st = 0.12 + h1(i * 5 + 1) * 0.12, tl = t - st, life = D - st;
      if (tl <= 0) continue;
      const k = tl / life, a = (i / N) * 6.283 - Math.PI / 2 + (h1(i * 5 + 2) - 0.5) * 0.25, r = n(p, 'reach') * easeOutQuart(Math.min(1, k * 1.2)) * (0.8 + 0.3 * h1(i * 5 + 3));
      const sc = lerp(0.5, 0.85, h1(i * 5 + 4)) * (1 - 0.3 * k);
      drawIcon(f, o.a, { cx: o.Cx + Math.cos(a) * r, cy: o.Cy + Math.sin(a) * r * 0.9, size: o.size, sx: sc, sy: sc, rot: (h1(i * 5 + 5) - 0.5) * 0.9 * k, alpha: 1 - smoothstep(0.45, 1, k), bright: 1.2 - 0.3 * k });
      f.additive.push({ x: o.Cx + Math.cos(a) * r, y: o.Cy + Math.sin(a) * r * 0.9, hw: o.size * 0.45 * sc, hh: o.size * 0.45 * sc, rot: 0, type: 0, color: o.col, intensity: 0.5 * (1 - k) });
    }
    flashAt(f, o.Cx, o.Cy, o.size * 0.4, o.col, Math.exp(-Math.abs(u * D - 0.15) * 14));
  },
};

export const XFORMS: ShowEffect[] = [morph, flip, upgrade, swap, expandH, expandV, fill, multiply];
void mixRGB;
