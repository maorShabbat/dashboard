export type EasingName =
  | 'linear' | 'easeOutQuad' | 'easeInOutCubic' | 'easeOutCubic' | 'easeOutBack' | 'easeOutElastic' | 'easeOutBounce' | 'spring';

export interface EasingConfig {
  easing: EasingName;
  /** Back-ease overshoot constant (c1). 1.70158 is the classic ~10% overshoot. */
  overshoot: number;
  /** Spring oscillations across the whole progress range. */
  springFrequency: number;
  /** Spring damping ratio (1 = critical). */
  springDamping: number;
}

export const EASING_NAMES: EasingName[] = [
  'linear', 'easeOutQuad', 'easeOutCubic', 'easeInOutCubic', 'easeOutBack', 'easeOutElastic', 'easeOutBounce', 'spring',
];

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

export function bounceOut(x: number): number {
  const n1 = 7.5625, d1 = 2.75;
  if (x < 1 / d1) return n1 * x * x;
  if (x < 2 / d1) return n1 * (x -= 1.5 / d1) * x + 0.75;
  if (x < 2.5 / d1) return n1 * (x -= 2.25 / d1) * x + 0.9375;
  return n1 * (x -= 2.625 / d1) * x + 0.984375;
}

/**
 * Normalised damped-spring step response over p in [0,1].
 * `frequency` is the number of damped oscillations across the range, `damping` the damping ratio.
 * A final blend forces the curve to land exactly on 1 at p = 1.
 */
export function springStep(p: number, frequency: number, damping: number): number {
  const x = clamp01(p);
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const z = Math.min(Math.max(damping, 0.01), 0.999);
  const wd = frequency * 2 * Math.PI; // damped angular frequency
  const sigma = (z * wd) / Math.sqrt(1 - z * z); // decay rate
  const y = 1 - Math.exp(-sigma * x) * (Math.cos(wd * x) + (sigma / wd) * Math.sin(wd * x));
  const settle = x ** 8;
  return y + (1 - y) * settle;
}

export function makeEasing(cfg: EasingConfig): (p: number) => number {
  switch (cfg.easing) {
    case 'linear': return clamp01;
    case 'easeOutQuad': return (p) => { const x = clamp01(p); return 1 - (1 - x) * (1 - x); };
    case 'easeOutCubic': return (p) => 1 - (1 - clamp01(p)) ** 3;
    case 'easeInOutCubic': return (p) => { const x = clamp01(p); return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2; };
    case 'easeOutBack': return (p) => { const x = clamp01(p); const c1 = cfg.overshoot, c3 = c1 + 1; return 1 + c3 * (x - 1) ** 3 + c1 * (x - 1) ** 2; };
    case 'easeOutElastic': return (p) => {
      const x = clamp01(p);
      if (x === 0 || x === 1) return x;
      const c4 = (2 * Math.PI) / Math.max(0.5, 3.2 - cfg.overshoot * 0.6);
      return 2 ** (-10 * x) * Math.sin((x * 10 - 0.75) * c4) + 1;
    };
    case 'easeOutBounce': return (p) => bounceOut(clamp01(p));
    case 'spring': return (p) => springStep(p, cfg.springFrequency, cfg.springDamping);
  }
}

/** Standard helper: normalised sub-range of progress. */
export function seg(p: number, from: number, to: number): number {
  if (to <= from) return p >= to ? 1 : 0;
  return clamp01((p - from) / (to - from));
}

export const smoothstep = (x: number) => { const t = clamp01(x); return t * t * (3 - 2 * t); };
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export { clamp01 };
