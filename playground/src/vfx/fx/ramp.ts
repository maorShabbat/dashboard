/**
 * Colour ramp for an effect layer ("gradient map"): every colour the effect produces is replaced by the ramp's colour at that colour's
 * brightness, so dark parts of the effect take the ramp's start and hot parts its end. Scale, repeat, mirroring, phase and the ramp's
 * animation all apply, so a layer's colours can slide over time. Shared by the playground and the exported player.
 */
import type { Frame, RGB } from '../engine/frame';
import { phaseAt, rampAt, wraps, type Gradient } from '../style/gradient';

const luma = (c: RGB): number => Math.min(1, Math.max(0, 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]));
const tri = (t: number): number => 1 - Math.abs((((t % 2) + 2) % 2) - 1);
const fract = (t: number): number => t - Math.floor(t);

/** The ramp's colour for a source brightness `l` (0..1) at scene-layer time `time`. */
export function rampColor(g: Gradient, l: number, time: number): RGB {
  let u = (l / Math.max(0.01, g.scale)) * g.repeat + phaseAt(g, time);
  u = wraps(g) ? (g.reflect ? tri(u) : fract(u)) : Math.min(1, Math.max(0, u));
  const c = rampAt(g, u);
  return [c[0], c[1], c[2]];
}

/** Recolour everything an effect put into `f` (call on the effect's own frame before merging it). */
export function recolorFrame(f: Frame, g: Gradient, time: number): void {
  const map = (c: RGB): RGB => rampColor(g, luma(c), time);
  const inPlace = (c: RGB): void => { const n = map(c); c[0] = n[0]; c[1] = n[1]; c[2] = n[2]; };
  for (const s of f.shocks) s.color = map(s.color);
  for (const v of f.vortices) v.color = map(v.color);
  for (const s of f.additive) s.color = map(s.color);
  for (const s of f.alphaSprites) s.color = map(s.color);
  f.smokePalette = f.smokePalette.map(map) as Frame['smokePalette'];
  f.boltCore = map(f.boltCore); f.boltGlow = map(f.boltGlow);
  for (const b of f.boltSets) { b.core = map(b.core); b.glow = map(b.glow); }
  f.volPalette = { fire: f.volPalette.fire.map(map) as typeof f.volPalette.fire, shadow: map(f.volPalette.shadow), lit: map(f.volPalette.lit), warm: map(f.volPalette.warm) };
  // polygon lists: x, y, r, g, b, a
  for (const list of [f.polys, f.underPolys]) for (let i = 0; i + 5 < list.length; i += 6) { const n = map([list[i + 2]!, list[i + 3]!, list[i + 4]!]); list[i + 2] = n[0]; list[i + 3] = n[1]; list[i + 4] = n[2]; }
  // ribbon vertices: x, y, side, v, r, g, b, a
  for (let i = 0; i + 7 < f.ribbons.length; i += 8) { const n = map([f.ribbons[i + 4]!, f.ribbons[i + 5]!, f.ribbons[i + 6]!]); f.ribbons[i + 4] = n[0]; f.ribbons[i + 5] = n[1]; f.ribbons[i + 6] = n[2]; }
  for (const d of f.draws) if (d.fx?.color) inPlace(d.fx.color);
}
