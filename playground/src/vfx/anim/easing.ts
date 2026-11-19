export const clamp01 = (t: number): number => (t < 0 ? 0 : t > 1 ? 1 : t);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const smooth = (a: number, b: number, v: number): number => { const t = clamp01((v - a) / (b - a || 1)); return t * t * (3 - 2 * t); };

export const linear = (t: number): number => clamp01(t);
export const easeInQuad = (t: number): number => clamp01(t) ** 2;
export const easeInCubic = (t: number): number => clamp01(t) ** 3;
export const easeInQuart = (t: number): number => clamp01(t) ** 4;
export const easeOutQuad = (t: number): number => 1 - (1 - clamp01(t)) ** 2;
export const easeOutCubic = (t: number): number => 1 - (1 - clamp01(t)) ** 3;
export const easeOutQuart = (t: number): number => 1 - (1 - clamp01(t)) ** 4;
export const easeOutExpo = (t: number): number => (t >= 1 ? 1 : 1 - 2 ** (-10 * clamp01(t)));
export const easeInOutCubic = (t: number): number => { t = clamp01(t); return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2; };
export const easeInOutSine = (t: number): number => -(Math.cos(Math.PI * clamp01(t)) - 1) / 2;
export const easeOutBack = (t: number, s = 1.70158): number => { t = clamp01(t) - 1; return 1 + (s + 1) * t * t * t + s * t * t; };
export const easeInBack = (t: number, s = 1.70158): number => { t = clamp01(t); return (s + 1) * t * t * t - s * t * t; };
export const easeOutElastic = (t: number, period = 0.38): number => {
  t = clamp01(t);
  if (t === 0 || t === 1) return t;
  return 2 ** (-10 * t) * Math.sin(((t - period / 4) * (2 * Math.PI)) / period) + 1;
};
export const easeOutBounce = (t: number): number => {
  t = clamp01(t);
  const n1 = 7.5625, d1 = 2.75;
  if (t < 1 / d1) return n1 * t * t;
  if (t < 2 / d1) { t -= 1.5 / d1; return n1 * t * t + 0.75; }
  if (t < 2.5 / d1) { t -= 2.25 / d1; return n1 * t * t + 0.9375; }
  t -= 2.625 / d1; return n1 * t * t + 0.984375;
};
/** 0 → 1 → 0 bell with soft shoulders. */
export const bell = (t: number): number => Math.sin(Math.PI * clamp01(t)) ** 2;
/** 0 → 1 → 0 triangle-ish, peak at `peak`. */
export const tent = (t: number, peak = 0.5): number => { t = clamp01(t); return t < peak ? easeOutCubic(t / peak) : 1 - easeInOutSine((t - peak) / (1 - peak)); };

/** Deterministic hash → [0, 1). */
export function hash(n: number): number {
  let x = Math.imul(Math.floor(n) | 0, 0x9e3779b1) ^ 0x85ebca6b;
  x = Math.imul(x ^ (x >>> 15), 0x2c1b3c6d);
  x = Math.imul(x ^ (x >>> 12), 0x297a2d39);
  x ^= x >>> 15;
  return (x >>> 0) / 4294967296;
}
