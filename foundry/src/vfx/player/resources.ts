/** Shared helpers that turn style and asset data into what the renderer draws: texture references, gradient fills, quad instances. */
import { QUAD_FLOATS, type FillRef, type TexRef } from '../engine/frame';
import { bakeLUT, gradientUniforms, makeGradient, rampHash, type Gradient } from '../style/gradient';
import type { RasterLayer } from '../style/glyphs';
import { getFamily } from '../fonts/catalog';
import type { FontService } from '../fonts/service';

/** A font's name for messages: the real family name, not the id. */
export const fontLabel = (fonts: Pick<FontService, 'customMeta'>, id: string): string => getFamily(id)?.family ?? fonts.customMeta(id)?.family ?? id;

const layerRefs = new WeakMap<RasterLayer, TexRef>();
/** Texture reference for a rasterised layer (uploaded once, by uid). */
export function layerTex(layer: RasterLayer): TexRef {
  let r = layerRefs.get(layer);
  if (!r) {
    r = { uid: layer.uid, version: 0, w: layer.w, h: layer.h, load: () => ({ kind: 'rgba', data: layer.data, w: layer.w, h: layer.h }) };
    layerRefs.set(layer, r);
  }
  return r;
}

const lutRefs = new Map<string, TexRef>();
/** The 256-texel lookup for a gradient's ramp (shared by every gradient with the same stops). */
export function lutTex(g: Gradient): TexRef {
  const key = rampHash(g);
  let r = lutRefs.get(key);
  if (!r) {
    r = { uid: `lut:${key}`, version: 0, w: 256, h: 1, load: () => ({ kind: 'rgba', data: new Uint8Array(bakeLUT(g).buffer), w: 256, h: 1 }) };
    if (lutRefs.size > 400) lutRefs.delete(lutRefs.keys().next().value!);
    lutRefs.set(key, r);
  }
  return r;
}

/** Fill for a batch: the gradient's ramp texture and its uniforms at time `time` for a fill box of the given aspect. */
export function fillFor(g: Gradient, aspect: number, time: number): FillRef {
  const u = gradientUniforms(g, aspect, time);
  return { lut: lutTex(g), g0: u.g0, g1: u.g1, g2: u.g2, g3: u.g3 };
}

const BAND = makeGradient('linear', [[0, '#ffffff', 0], [0.22, '#ffffff', 0.1], [0.5, '#ffffff', 1], [0.78, '#ffffff', 0.1], [1, '#ffffff', 0]]);
/** A soft band that sweeps across a fill box: `centre` is its position in box lengths along the angle (-0.5 .. 0.5 spans the box). */
export function bandFill(colorHex: string, angleDeg: number, width: number, centre: number, aspect: number): FillRef {
  const g = { ...BAND, stops: BAND.stops.map((s) => ({ ...s, color: colorHex })) };
  const w = Math.max(0.02, width);
  const lut = lutTex(g);
  return { lut, g0: [1, (angleDeg * Math.PI) / 180, 0.5, 0.5], g1: [w, 1, 1, 0], g2: [-centre / w, 0, aspect, 0], g3: [0, 0, 0, 0] };
}

export interface QuadArgs {
  px: number; py: number; ox: number; oy: number; hw: number; hh: number;
  rot: number; skew: number; sx: number; sy: number; bright: number; glow: number;
  u0: number; v0: number; u1: number; v1: number;
  g0: number; gv0: number; g1: number; gv1: number;
  r: number; g: number; b: number; a: number;
}
/** Append one quad instance (see ELEM_VS for the layout). */
export function pushQuad(out: number[], q: QuadArgs): void {
  out.push(q.px, q.py, q.ox, q.oy, q.hw, q.hh, q.rot, q.skew, q.sx, q.sy, q.bright, q.glow, q.u0, q.v0, q.u1, q.v1, q.g0, q.gv0, q.g1, q.gv1, q.r, q.g, q.b, q.a);
}
export const QUAD = QUAD_FLOATS;
