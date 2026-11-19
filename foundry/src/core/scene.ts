/** Base scene drawing: backdrop, board plate, cells and procedural symbols, all driven by tokens. */
import type { BoardLayout, Scene } from './board';
import { SYMBOL_KINDS } from './board';
import { darken, lighten, withAlpha } from './util/color';
import { type CellMod, type DrawOp, type Shadow, starPoints } from './ops';
import type { TokenValues } from './tokens';
import type { AssetIndex } from './effects/types';

const SYMBOL_ROLES = ['color.primary', 'color.secondary', 'color.accent', 'color.success', 'color.info', 'color.danger', 'color.win', 'color.text'] as const;
const SYMBOL_SHAPES = ['circle', 'diamond', 'star', 'hex', 'triangle', 'square', 'ring', 'pill'] as const;

export function backdropOps(t: TokenValues, L: BoardLayout, assets: AssetIndex): DrawOp[] {
  const ops: DrawOp[] = [{
    op: 'rect', layer: 'backdrop', cx: L.vw / 2, cy: L.vh / 2, w: L.vw, h: L.vh,
    fill: { g: 'radial', stops: [[0, t['color.backgroundAlt'] as string], [1, t['color.background'] as string]] },
  }];
  const img = t['asset.backdrop'] as string;
  if (img && assets.has(img)) ops.push({ op: 'image', layer: 'backdrop', asset: img, cx: L.vw / 2, cy: L.vh / 2, w: L.vw, h: L.vh });
  return ops;
}

export function boardOps(t: TokenValues, L: BoardLayout, scene: Scene): DrawOp[] {
  const ops: DrawOp[] = [];
  const b = L.board;
  const shadow: Shadow | undefined = (t['depth.shadowOpacity'] as number) > 0
    ? { color: withAlpha(t['depth.shadowColor'] as string, (t['depth.shadowOpacity'] as number) / 100), blur: L.px(t['depth.shadowBlur'] as number), dx: L.px(t['depth.shadowOffsetX'] as number), dy: L.px(t['depth.shadowOffsetY'] as number) }
    : undefined;
  ops.push({
    op: 'rect', layer: 'board', cx: b.cx, cy: b.cy, w: b.w, h: b.h, r: L.px(t['surface.cornerRadius'] as number),
    fill: { g: 'linear', angle: t['surface.gradientAngle'] as number, stops: [[0, t['surface.fill'] as string], [1, t['surface.fillAlt'] as string]] },
    stroke: t['board.frameColor'] as string, lw: Math.max(0, L.framePx), alpha: (t['surface.opacity'] as number) / 100,
    ...(shadow ? { shadow } : {}),
    ...(t['surface.texture'] !== 'none' && (t['surface.textureOpacity'] as number) > 0
      ? { texture: { kind: t['surface.texture'] as 'halftone' | 'stripes' | 'grid', color: t['color.text'] as string, alpha: (t['surface.textureOpacity'] as number) / 100, size: Math.max(3, L.px(t['surface.textureScale'] as number)) } }
      : {}),
  });
  const radius = L.px(t['board.cellRadius'] as number);
  for (let col = 0; col < scene.cols; col++) {
    for (let row = 0; row < scene.rows; row++) {
      const r = L.cellRect(col, row);
      ops.push({ op: 'rect', layer: 'board', cx: r.cx, cy: r.cy, w: r.w, h: r.h, r: radius, fill: t['board.cellFill'] as string, alpha: (t['board.cellFillOpacity'] as number) / 100 });
    }
  }
  return ops;
}

const IDENTITY: CellMod = { col: 0, row: 0, dx: 0, dy: 0, scale: 1, alpha: 1, rot: 0, glow: 0, variant: 0 };

export function mergeCellMods(mods: CellMod[]): Map<string, CellMod> {
  const m = new Map<string, CellMod>();
  for (const x of mods) {
    const k = `${x.col},${x.row}`;
    const cur = m.get(k);
    if (!cur) { m.set(k, { ...x }); continue; }
    cur.dx += x.dx; cur.dy += x.dy; cur.scale *= x.scale; cur.alpha *= x.alpha; cur.rot += x.rot; cur.glow = Math.max(cur.glow, x.glow); cur.variant = Math.max(cur.variant, x.variant);
  }
  return m;
}

export function symbolOps(t: TokenValues, L: BoardLayout, scene: Scene, mods: Map<string, CellMod>): DrawOp[] {
  const ops: DrawOp[] = [];
  const outline = t['outline.color'] as string;
  const lw = Math.max(1, L.px(t['outline.width'] as number) * 0.6);
  for (let col = 0; col < scene.cols; col++) {
    for (let row = 0; row < scene.rows; row++) {
      const m = mods.get(`${col},${row}`) ?? IDENTITY;
      if (m.alpha <= 0.002 || m.scale <= 0.002) continue;
      const r = L.cellRect(col, row);
      const kind = (scene.symbols[col]![row]! + m.variant * 3) % SYMBOL_KINDS;
      const base = t[SYMBOL_ROLES[kind]!] as string;
      const size = L.cell * 0.62 * m.scale;
      const cx = r.cx + m.dx, cy = r.cy + m.dy;
      const fill = { g: 'radial' as const, stops: [[0, lighten(base, 0.45)], [1, darken(base, 0.12)]] as [number, string][] };
      const common = { layer: 'symbols' as const, alpha: m.alpha, ...(m.glow > 0.02 ? { shadow: { color: withAlpha(t['outline.glowColor'] as string, Math.min(1, m.glow * 0.9)), blur: L.px(t['outline.glowBlur'] as number) * m.glow, dx: 0, dy: 0 } } : {}) };
      switch (SYMBOL_SHAPES[kind]) {
        case 'circle': ops.push({ ...common, op: 'ellipse', cx, cy, rx: size / 2, ry: size / 2, rot: m.rot, fill, stroke: outline, lw }); break;
        case 'ring': ops.push({ ...common, op: 'ellipse', cx, cy, rx: size / 2.2, ry: size / 2.2, rot: m.rot, stroke: base, lw: Math.max(lw * 2, size * 0.16) }); break;
        case 'square': ops.push({ ...common, op: 'rect', cx, cy, w: size * 0.9, h: size * 0.9, r: size * 0.2, rot: m.rot, fill, stroke: outline, lw }); break;
        case 'pill': ops.push({ ...common, op: 'rect', cx, cy, w: size * 1.05, h: size * 0.6, r: size * 0.3, rot: m.rot, fill, stroke: outline, lw }); break;
        case 'star': ops.push({ ...common, op: 'poly', pts: starPoints(cx, cy, size / 2, size / 4.4, 5, m.rot), closed: true, fill, stroke: outline, lw, join: 'round' }); break;
        case 'diamond': ops.push({ ...common, op: 'poly', pts: diamond(cx, cy, size / 2, m.rot), closed: true, fill, stroke: outline, lw, join: 'round' }); break;
        case 'hex': ops.push({ ...common, op: 'poly', pts: ngon(cx, cy, size / 2, 6, m.rot), closed: true, fill, stroke: outline, lw, join: 'round' }); break;
        case 'triangle': ops.push({ ...common, op: 'poly', pts: ngon(cx, cy + size * 0.05, size / 1.8, 3, m.rot), closed: true, fill, stroke: outline, lw, join: 'round' }); break;
      }
    }
  }
  return ops;
}

function ngon(cx: number, cy: number, r: number, n: number, rotDeg: number): number[] {
  const pts: number[] = [];
  const rot = (rotDeg * Math.PI) / 180 - Math.PI / 2;
  for (let i = 0; i < n; i++) { const a = rot + (i * 2 * Math.PI) / n; pts.push(cx + Math.cos(a) * r, cy + Math.sin(a) * r); }
  return pts;
}
function diamond(cx: number, cy: number, r: number, rotDeg: number): number[] {
  const rad = (rotDeg * Math.PI) / 180;
  const pts = [0, -r * 1.05, r * 0.78, 0, 0, r * 1.05, -r * 0.78, 0];
  const out: number[] = [];
  for (let i = 0; i < pts.length; i += 2) {
    const x = pts[i]!, y = pts[i + 1]!;
    out.push(cx + x * Math.cos(rad) - y * Math.sin(rad), cy + x * Math.sin(rad) + y * Math.cos(rad));
  }
  return out;
}
