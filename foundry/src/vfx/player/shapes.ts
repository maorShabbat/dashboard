/**
 * Procedural shapes for message backgrounds, badges and plates, as vector paths. They go through the same style stack as text
 * (gradient face, outlines, bevel, extrusion, shadow, glow), so a frame can be styled exactly like the words on it.
 */
import type { ShapeId } from '../model/scene';
import type { Params } from '../model/scene';

export interface ShapeDef { id: ShapeId; name: string; defaults: { width: number; height: number; params: Params }; description: string }

export const SHAPES: ShapeDef[] = [
  { id: 'plate', name: 'Plate', description: 'A rounded panel.', defaults: { width: 0.9, height: 0.34, params: { radius: 0.2 } } },
  { id: 'banner', name: 'Banner', description: 'A wide banner with gently curved edges.', defaults: { width: 1.1, height: 0.3, params: { curve: 0.12 } } },
  { id: 'ribbon', name: 'Ribbon', description: 'A ribbon with swallow-tail ends.', defaults: { width: 1.15, height: 0.28, params: { notch: 0.16 } } },
  { id: 'burst', name: 'Starburst', description: 'A spiky burst.', defaults: { width: 0.7, height: 0.7, params: { points: 18, inner: 0.78 } } },
  { id: 'badge', name: 'Badge', description: 'A scalloped round badge.', defaults: { width: 0.42, height: 0.42, params: { teeth: 14, depth: 0.07 } } },
  { id: 'neon-box', name: 'Neon frame', description: 'A hollow rounded frame.', defaults: { width: 0.9, height: 0.34, params: { radius: 0.2, thickness: 0.07 } } },
  { id: 'scroll', name: 'Scroll', description: 'Parchment with rolled ends.', defaults: { width: 1, height: 0.34, params: { roll: 0.09 } } },
  { id: 'circle', name: 'Circle', description: 'A disc.', defaults: { width: 0.4, height: 0.4, params: {} } },
  { id: 'diamond', name: 'Diamond', description: 'A rhombus.', defaults: { width: 0.4, height: 0.5, params: {} } },
  { id: 'bar', name: 'Pill', description: 'A pill-shaped bar.', defaults: { width: 0.8, height: 0.14, params: {} } },
  { id: 'shield', name: 'Shield', description: 'A heater shield with raised shoulders and a pointed foot.', defaults: { width: 0.5, height: 0.6, params: { fin: 0.12, notch: 0.07, taper: 0.55 } } },
  { id: 'slab', name: 'Slab', description: 'A plate with two cut corners and an optional slant.', defaults: { width: 0.9, height: 0.26, params: { chamfer: 0.2, slant: 0.18 } } },
  { id: 'pennant', name: 'Pennant', description: 'A hanging banner with a pointed foot.', defaults: { width: 0.16, height: 0.5, params: { point: 0.8, sag: 0.04 } } },
];
export const shapeDef = (id: ShapeId): ShapeDef => SHAPES.find((s) => s.id === id)!;

const num = (p: Params, k: string, d: number): number => (typeof p[k] === 'number' ? (p[k] as number) : d);

function roundRect(path: Path2D, x: number, y: number, w: number, h: number, r: number, reverse = false): void {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  if (!reverse) {
    path.moveTo(x + r, y); path.lineTo(x + w - r, y); path.arcTo(x + w, y, x + w, y + r, r);
    path.lineTo(x + w, y + h - r); path.arcTo(x + w, y + h, x + w - r, y + h, r);
    path.lineTo(x + r, y + h); path.arcTo(x, y + h, x, y + h - r, r);
    path.lineTo(x, y + r); path.arcTo(x, y, x + r, y, r); path.closePath();
  } else {
    path.moveTo(x + r, y); path.arcTo(x, y, x, y + r, r);
    path.lineTo(x, y + h - r); path.arcTo(x, y + h, x + r, y + h, r);
    path.lineTo(x + w - r, y + h); path.arcTo(x + w, y + h, x + w, y + h - r, r);
    path.lineTo(x + w, y + r); path.arcTo(x + w, y, x + w - r, y, r); path.closePath();
  }
}

/** The shape's path inside an x, y, w, h box (pixels). */
export function shapePath(shape: ShapeId, x: number, y: number, w: number, h: number, p: Params): Path2D {
  const path = new Path2D();
  const cx = x + w / 2, cy = y + h / 2;
  switch (shape) {
    case 'plate': roundRect(path, x, y, w, h, num(p, 'radius', 0.2) * h); break;
    case 'bar': roundRect(path, x, y, w, h, h / 2); break;
    case 'circle': path.ellipse(cx, cy, w / 2, h / 2, 0, 0, Math.PI * 2); break;
    case 'diamond': path.moveTo(cx, y); path.lineTo(x + w, cy); path.lineTo(cx, y + h); path.lineTo(x, cy); path.closePath(); break;
    case 'banner': {
      const c = num(p, 'curve', 0.12) * h;
      path.moveTo(x, y + c); path.quadraticCurveTo(cx, y - c, x + w, y + c);
      path.lineTo(x + w, y + h); path.quadraticCurveTo(cx, y + h - 2 * c, x, y + h); path.closePath();
      break;
    }
    case 'ribbon': {
      const n = num(p, 'notch', 0.16) * w;
      path.moveTo(x, y); path.lineTo(x + w, y); path.lineTo(x + w - n, cy); path.lineTo(x + w, y + h); path.lineTo(x, y + h); path.lineTo(x + n, cy); path.closePath();
      break;
    }
    case 'burst': {
      const pts = Math.max(5, Math.round(num(p, 'points', 18))), inner = num(p, 'inner', 0.78);
      for (let i = 0; i < pts * 2; i++) {
        const a = (i / (pts * 2)) * Math.PI * 2 - Math.PI / 2, r = i % 2 === 0 ? 1 : inner;
        const px = cx + Math.cos(a) * (w / 2) * r, py = cy + Math.sin(a) * (h / 2) * r;
        if (i === 0) path.moveTo(px, py); else path.lineTo(px, py);
      }
      path.closePath();
      break;
    }
    case 'badge': {
      const teeth = Math.max(6, Math.round(num(p, 'teeth', 14))), d = num(p, 'depth', 0.07), steps = teeth * 12;
      for (let i = 0; i <= steps; i++) {
        const a = (i / steps) * Math.PI * 2, r = 1 - d * (0.5 - 0.5 * Math.cos(a * teeth));
        const px = cx + Math.cos(a) * (w / 2) * r, py = cy + Math.sin(a) * (h / 2) * r;
        if (i === 0) path.moveTo(px, py); else path.lineTo(px, py);
      }
      path.closePath();
      break;
    }
    case 'neon-box': {
      const r = num(p, 'radius', 0.2) * h, t = num(p, 'thickness', 0.07) * h;
      roundRect(path, x, y, w, h, r);
      roundRect(path, x + t, y + t, w - 2 * t, h - 2 * t, Math.max(0, r - t), true);
      break;
    }
    case 'shield': {
      // shoulders that rise to a point on each side, a shallow dip between them, straight flanks, then a curve to the foot
      const fin = num(p, 'fin', 0.12) * h, notch = num(p, 'notch', 0.07) * h, taper = num(p, 'taper', 0.55);
      path.moveTo(x, y + fin * 1.5); path.lineTo(x + w * 0.1, y); path.quadraticCurveTo(x + w * 0.3, y + notch * 0.2, cx, y + notch);
      path.quadraticCurveTo(x + w * 0.7, y + notch * 0.2, x + w * 0.9, y); path.lineTo(x + w, y + fin * 1.5);
      path.lineTo(x + w, y + h * taper); path.quadraticCurveTo(x + w, y + h * (taper + (1 - taper) * 0.62), cx, y + h);
      path.quadraticCurveTo(x, y + h * (taper + (1 - taper) * 0.62), x, y + h * taper); path.closePath();
      break;
    }
    case 'slab': {
      const c = num(p, 'chamfer', 0.2) * h, sl = num(p, 'slant', 0.18) * h;
      path.moveTo(x + sl + c, y); path.lineTo(x + w, y); path.lineTo(x + w - sl, y + h - c); path.lineTo(x + w - sl - c, y + h); path.lineTo(x, y + h); path.lineTo(x + sl, y + c); path.closePath();
      break;
    }
    case 'pennant': {
      const pt = num(p, 'point', 0.8), sag = num(p, 'sag', 0.04) * w;
      path.moveTo(x, y); path.lineTo(x + w, y); path.lineTo(x + w - sag, y + h * pt * 0.6); path.lineTo(x + w, y + h * pt); path.lineTo(cx, y + h);
      path.lineTo(x, y + h * pt); path.lineTo(x + sag, y + h * pt * 0.6); path.closePath();
      break;
    }
    case 'scroll': {
      const r = num(p, 'roll', 0.09) * w;
      roundRect(path, x + r * 0.7, y + h * 0.06, w - r * 1.4, h * 0.88, h * 0.06);
      path.ellipse(x + r, cy, r, h / 2, 0, 0, Math.PI * 2);
      path.ellipse(x + w - r, cy, r, h / 2, 0, 0, Math.PI * 2);
      break;
    }
  }
  return path;
}
