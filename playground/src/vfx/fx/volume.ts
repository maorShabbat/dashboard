/** Builders for volumetric fire and smoke puffs (see VolPuff). All positions in scene units; `t` is seconds since the puff started. */
import { FIRE_PALETTES, SMOKE_TONES, type Frame, type RGB } from '../engine/frame';

export const FIRE_NAMES = Object.keys(FIRE_PALETTES);
export const SMOKE_NAMES = Object.keys(SMOKE_TONES);

/** Colours for this effect's fire and smoke (the last effect to set them wins, like the smoke palette). */
export function setVolPalette(f: Frame, fire: string, smoke: string, warm?: RGB): void {
  const pal = FIRE_PALETTES[fire] ?? FIRE_PALETTES.fire!;
  const tone = SMOKE_TONES[smoke] ?? SMOKE_TONES.grey!;
  f.volPalette = { fire: pal.map((c) => [...c] as RGB) as typeof pal, shadow: [...tone.shadow], lit: [...tone.lit], warm: warm ?? ([pal[1]![0], pal[1]![1] + 0.1, pal[1]![2] + 0.05] as RGB) };
}

export interface SmokeOpts { x: number; y: number; size: number; age: number; seed: number; t: number; alpha?: number; heat?: number; rot?: number; light?: [number, number];
  /** 0 (default) = billowing smoke with hard shaded lumps; 1 = soft wispy steam or mist. */ soft?: number }
export function smokePuff(f: Frame, o: SmokeOpts): void {
  if (o.age >= 1 || o.age < 0 || o.size <= 0) return;
  const L = o.light ?? [0.4, -0.8];
  f.vol.push({ x: o.x, y: o.y, size: o.size, rot: o.rot ?? 0, age: o.age, seed: o.seed, kind: 0, alpha: o.alpha ?? 1, heat: o.heat ?? 0, stretch: 1, lx: L[0], ly: L[1], t: o.t, soft: o.soft ?? 0 });
}

export interface FlameOpts { x: number; y: number; w: number; h: number; age: number; seed: number; t: number; heat?: number; alpha?: number; rot?: number; /** The refined tongue: rooted, translucent at the edges, curling, with wisps at the tip (kind 3). */ soft?: boolean }
/** A flame tongue standing on (x, y): width `w`, height `h`. Rotated flames pivot about their base. */
export function flame(f: Frame, o: FlameOpts): void {
  if (o.age >= 1 || o.age < 0 || o.w <= 0 || o.h <= 0) return;
  const rot = o.rot ?? 0, c = Math.cos(rot), s = Math.sin(rot);
  const cx = o.x + s * (o.h / 2), cy = o.y - c * (o.h / 2);              // centre of the quad, h/2 along the flame's own up
  f.vol.push({ x: cx, y: cy, size: o.w / 2, rot, age: o.age, seed: o.seed, kind: o.soft ? 3 : 1, alpha: o.alpha ?? 1, heat: o.heat ?? 1, stretch: o.h / o.w, lx: 0, ly: -1, t: o.t });
}

export interface FireballOpts { x: number; y: number; size: number; age: number; seed: number; t: number; heat?: number; alpha?: number }
export function fireball(f: Frame, o: FireballOpts): void {
  if (o.age >= 1 || o.age < 0 || o.size <= 0) return;
  f.vol.push({ x: o.x, y: o.y, size: o.size, rot: 0, age: o.age, seed: o.seed, kind: 2, alpha: o.alpha ?? 1, heat: o.heat ?? 1, stretch: 1, lx: 0, ly: -1, t: o.t });
}
