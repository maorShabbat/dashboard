import { withAlpha } from '../util/color';
import type { Paint, Shadow } from '../ops';
import type { TypeRole } from '../tokens';
import { type EffectContext, P } from './types';

export const clamp = (x: number, lo: number, hi: number) => (x < lo ? lo : x > hi ? hi : x);

export function opacity(c: EffectContext): number { return clamp(P.n(c, 'opacity') / 100, 0, 1); }

export function glowShadow(c: EffectContext, colour: string, strengthPct: number, blurPct: number, k = 1): Shadow | undefined {
  const blur = c.layout.px(blurPct) * k;
  if (blur < 0.5 || strengthPct <= 0) return undefined;
  return { color: withAlpha(colour, clamp(strengthPct / 100, 0, 1)), blur, dx: 0, dy: 0 };
}

export interface PlateOpts { cx: number; cy: number; w: number; h: number; scale?: number; rot?: number; alpha?: number }

/** A themed plate: extrusion + gradient fill + outline (+double) + texture + bevel, all from surface/outline/depth tokens. */
export function pushPlate(c: EffectContext, o: PlateOpts): void {
  const t = c.tokens;
  const px = c.layout.px;
  const sc = o.scale ?? 1;
  const w = o.w * sc, h = o.h * sc;
  if (w < 1 || h < 1) return;
  const rot = o.rot ?? 0;
  const rad = (rot * Math.PI) / 180;
  const r = Math.min(px(t['surface.cornerRadius'] as number) * sc, Math.min(w, h) / 2);
  const extrude = px(t['depth.extrude'] as number) * sc;
  const lw = px(t['outline.width'] as number) * sc;
  const alpha = (o.alpha ?? 1) * ((t['surface.opacity'] as number) / 100);
  const baseAlpha = o.alpha ?? 1;
  const outlineCol = t['outline.color'] as string;
  const layer = c.layer;
  const shadow: Shadow | undefined = (t['depth.shadowOpacity'] as number) > 0
    ? { color: withAlpha(t['depth.shadowColor'] as string, (t['depth.shadowOpacity'] as number) / 100), blur: px(t['depth.shadowBlur'] as number) * sc, dx: px(t['depth.shadowOffsetX'] as number) * sc, dy: px(t['depth.shadowOffsetY'] as number) * sc + extrude }
    : undefined;

  if (extrude > 0.5) {
    c.out.push({ op: 'rect', layer, cx: o.cx - Math.sin(rad) * extrude, cy: o.cy + Math.cos(rad) * extrude, w, h, r, rot, fill: t['depth.extrudeColor'] as string, stroke: outlineCol, lw, alpha: baseAlpha, blend: P.s(c, 'blend') });
  }
  const main: import('../ops').RectOp = {
    op: 'rect', layer, cx: o.cx, cy: o.cy, w, h, r, rot, alpha,
    fill: { g: 'linear', angle: t['surface.gradientAngle'] as number, stops: [[0, t['surface.fill'] as string], [1, t['surface.fillAlt'] as string]] },
    stroke: outlineCol, lw, blend: P.s(c, 'blend'),
  };
  if (t['outline.style'] === 'dashed') main.dash = [Math.max(2, lw * 2.5), Math.max(2, lw * 1.5)];
  if (shadow) main.shadow = shadow;
  if (t['surface.texture'] !== 'none' && (t['surface.textureOpacity'] as number) > 0) {
    main.texture = {
      kind: t['surface.texture'] as 'halftone' | 'stripes' | 'grid', color: t['color.text'] as string,
      alpha: (t['surface.textureOpacity'] as number) / 100, size: Math.max(3, px(t['surface.textureScale'] as number) * sc),
    };
  }
  c.out.push(main);
  if (t['outline.style'] === 'double' && lw > 0.5) {
    c.out.push({ op: 'rect', layer, cx: o.cx, cy: o.cy, w: w - lw * 3.2, h: h - lw * 3.2, r: Math.max(0, r - lw * 1.6), rot, stroke: outlineCol, lw: Math.max(1, lw * 0.45), alpha: baseAlpha, blend: P.s(c, 'blend') });
  }
  const bevel = (t['depth.bevel'] as number) / 100;
  if (bevel > 0) {
    c.out.push({
      op: 'rect', layer, cx: o.cx, cy: o.cy, w, h, r, rot, alpha: baseAlpha,
      fill: { g: 'linear', angle: 180, stops: [[0, `rgba(255,255,255,${(bevel * 0.4).toFixed(3)})`], [0.45, 'rgba(255,255,255,0)'], [1, 'rgba(0,0,0,0)']] }, blend: P.s(c, 'blend'),
    });
  }
}

export interface TextOpts {
  text: string; x: number; y: number; role: TypeRole;
  sizeMul?: number; fill?: Paint; scale?: number; rot?: number; alpha?: number; align?: 'left' | 'center' | 'right';
  maxWidth?: number; extrude?: boolean; outline?: boolean;
}

export function applyTransform(text: string, transform: string): string {
  return transform === 'uppercase' ? text.toUpperCase() : transform === 'lowercase' ? text.toLowerCase() : text;
}

export function textSizePx(c: EffectContext, role: TypeRole, mul = 1): number {
  const t = c.tokens;
  return Math.max(t['type.minSizePx'] as number, c.layout.px(t[`type.${role}.size`] as number) * mul);
}

/** Themed text: drop shadow + stepped extrusion + outline + fill, from typography/outline/depth tokens. */
export function pushText(c: EffectContext, o: TextOpts): void {
  const t = c.tokens;
  const px = c.layout.px;
  const size = textSizePx(c, o.role, o.sizeMul ?? 1);
  const font = { id: t[`type.${o.role}.family`] as string, weight: t[`type.${o.role}.weight`] as number };
  const text = applyTransform(o.text, t[`type.${o.role}.transform`] as string);
  const ls = (t[`type.${o.role}.letterSpacing`] as number) * size;
  const sc = o.scale ?? 1;
  const alpha = o.alpha ?? 1;
  const extrudePx = o.extrude === false ? 0 : px(t['depth.extrude'] as number) * 0.6 * sc;
  const steps = extrudePx > 0.5 ? Math.min(8, Math.ceil(extrudePx / 1.5)) : 0;
  const base = { op: 'text' as const, layer: c.layer, text, x: o.x, y: o.y, font, size, align: o.align ?? 'center', ls, rot: o.rot ?? 0, scale: sc, blend: P.s(c, 'blend'), ...(o.maxWidth ? { maxWidth: o.maxWidth } : {}) };
  for (let i = steps; i >= 1; i--) {
    c.out.push({ ...base, fill: t['depth.extrudeColor'] as string, dy: (extrudePx * i) / steps, alpha });
  }
  const lw = o.outline === false ? 0 : px(t['outline.width'] as number) * 0.9 * sc;
  const shadow: Shadow | undefined = (t['depth.shadowOpacity'] as number) > 0
    ? { color: withAlpha(t['depth.shadowColor'] as string, (t['depth.shadowOpacity'] as number) / 100), blur: px(t['depth.shadowBlur'] as number) * 0.6 * sc, dx: px(t['depth.shadowOffsetX'] as number) * sc, dy: px(t['depth.shadowOffsetY'] as number) * 0.6 * sc + extrudePx }
    : undefined;
  c.out.push({
    ...base, fill: o.fill ?? (t['color.text'] as string), alpha,
    ...(lw > 0.4 ? { stroke: t['outline.color'] as string, lw } : {}),
    ...(shadow ? { shadow } : {}),
  });
}

export function cellClip(c: EffectContext, col: number, row: number) {
  const r = c.layout.cellRect(col, row);
  return { cx: r.cx, cy: r.cy, w: r.w, h: r.h, r: c.layout.px(c.tokens['board.cellRadius'] as number) };
}

/** Per-item delay in ms, honouring the theme's stagger scale. */
export function staggerMs(c: EffectContext, index: number, stepMs: number): number {
  return index * stepMs * (c.tokens['motion.staggerScale'] as number);
}
