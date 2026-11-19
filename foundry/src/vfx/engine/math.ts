import { parseColor } from '../../core/util/color';
import type { RGB } from './frame';

export const clamp = (v: number, lo = 0, hi = 1) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const unlerp = (a: number, b: number, v: number) => (b === a ? 0 : clamp((v - a) / (b - a)));
export const smoothstep = (a: number, b: number, v: number) => { const t = unlerp(a, b, v); return t * t * (3 - 2 * t); };
export const smootherstep = (a: number, b: number, v: number) => { const t = unlerp(a, b, v); return t * t * t * (t * (t * 6 - 15) + 10); };
export const easeOutCubic = (t: number) => 1 - (1 - clamp(t)) ** 3;
export const easeOutQuart = (t: number) => 1 - (1 - clamp(t)) ** 4;
export const easeOutExpo = (t: number) => (t >= 1 ? 1 : 1 - 2 ** (-10 * clamp(t)));
export const easeInCubic = (t: number) => clamp(t) ** 3;
export const easeInQuad = (t: number) => clamp(t) ** 2;
export const easeInOutCubic = (t: number) => { t = clamp(t); return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2; };
export const easeOutBack = (t: number, s = 1.70158) => { t = clamp(t) - 1; return 1 + (s + 1) * t * t * t + s * t * t; };
/** Tent-shaped pulse: 0 → 1 at `peak` → 0, with smooth shoulders. */
export const pulse = (t: number, rise: number, fall: number) => (t < rise ? easeOutCubic(t / rise) : 1 - smoothstep(rise, rise + fall, t));

export function hex(c: string): RGB {
  const p = parseColor(c);
  return [p.r / 255, p.g / 255, p.b / 255];
}
export const mixRGB = (a: RGB, b: RGB, t: number): RGB => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
export const scaleRGB = (a: RGB, k: number): RGB => [a[0] * k, a[1] * k, a[2] * k];

/** Cheap deterministic value hash in [0,1) for per-item randomness that must not depend on call order. */
export function h1(n: number): number {
  let x = Math.imul(n | 0, 0x9e3779b1) ^ 0x85ebca6b;
  x = Math.imul(x ^ (x >>> 15), 0x2c1b3c6d);
  x = Math.imul(x ^ (x >>> 12), 0x297a2d39);
  x ^= x >>> 15;
  return (x >>> 0) / 4294967296;
}
