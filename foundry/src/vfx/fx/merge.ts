import { emptyFrame, type Frame } from '../engine/frame';

/** Append without spreading: an effect can draw hundreds of thousands of numbers, more than a call can take as arguments. */
const append = (to: number[], from: number[]): void => { for (let i = 0; i < from.length; i++) to.push(from[i]!); };

/** Combine `src` into `dst`: effects layer on top of each other and on the content. */
export function mergeFrame(dst: Frame, src: Frame): void {
  dst.shocks.push(...src.shocks); dst.vortices.push(...src.vortices); dst.additive.push(...src.additive); dst.alphaSprites.push(...src.alphaSprites);
  dst.smoke.push(...src.smoke); dst.vol.push(...src.vol); append(dst.polys, src.polys); append(dst.ribbons, src.ribbons);
  append(dst.underPolys, src.underPolys); dst.draws.push(...src.draws); dst.distort.push(...src.distort);
  if (src.shards.length) dst.shardSets.push({ tex: src.shardTex, verts: [...src.shards] });
  dst.shardSets.push(...src.shardSets);
  dst.exposure *= src.exposure;
  dst.camera = { dx: dst.camera.dx + src.camera.dx, dy: dst.camera.dy + src.camera.dy, rot: dst.camera.rot + src.camera.rot, zoom: 1 + (dst.camera.zoom - 1) + (src.camera.zoom - 1) };
  dst.boltSets.push(...src.boltSets);
  if (src.bolts.length) dst.boltSets.push({ core: src.boltCore, glow: src.boltGlow, verts: [...src.bolts] });
  if (src.shards.length || src.shardSets.length) dst.boltGlow = src.boltGlow;                      // the accent used for glints on object fragments
  if (src.smoke.length) dst.smokePalette = src.smokePalette;
  if (src.vol.length) dst.volPalette = src.volPalette;
  if (src.transition) dst.transition = src.transition;
  if (src.meta) dst.meta = { ...(dst.meta ?? {}), ...src.meta };
}

export { emptyFrame };
