/**
 * Quality tiers for weak phones. A tier does two things: it scales the drawing buffer (the fill cost of the volumetric fire, smoke and
 * bloom falls with the pixel count) and it thins out particles (effects read `ctx.quality`). `auto` starts from a guess about the
 * device and watches how long frames really take: it steps down quickly when they are slow and steps up only after a long smooth run,
 * and a step up that did not hold keeps the tier down for a while.
 */
export type QualityTier = 'low' | 'medium' | 'high';
export type QualitySetting = QualityTier | 'auto';

export const TIERS: Record<QualityTier, { label: string; /** Share of the particles the effects draw. */ particles: number; /** Share of the screen resolution the picture is drawn at. */ scale: number }> = {
  low: { label: 'Low: for weak phones', particles: 0.35, scale: 0.6 },
  medium: { label: 'Medium', particles: 0.65, scale: 0.8 },
  high: { label: 'High', particles: 1, scale: 1 },
};
export const QUALITY_ORDER: QualityTier[] = ['low', 'medium', 'high'];
export const QUALITY_OPTIONS: { value: QualitySetting; label: string }[] = [
  { value: 'auto', label: 'Automatic: adapts to the device' }, { value: 'high', label: TIERS.high.label }, { value: 'medium', label: TIERS.medium.label }, { value: 'low', label: TIERS.low.label },
];
export const isQualitySetting = (v: unknown): v is QualitySetting => v === 'auto' || v === 'low' || v === 'medium' || v === 'high';

/** Where automatic quality starts: a phone or a machine with few cores begins on medium, anything else on high. */
export function startingTier(env: { cores?: number; touch?: boolean; memory?: number } = {}): QualityTier {
  const nav = typeof navigator !== 'undefined' ? (navigator as Navigator & { deviceMemory?: number }) : undefined;
  const cores = env.cores ?? nav?.hardwareConcurrency ?? 8, memory = env.memory ?? nav?.deviceMemory ?? 8;
  const touch = env.touch ?? (typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches);
  if (cores <= 2 || memory <= 2) return 'low';
  if (touch || cores <= 4 || memory <= 4) return 'medium';
  return 'high';
}

export interface AutoOptions {
  /** A block of frames averaging more than this many ms is too slow (default 26 ms, under 38 fps). */
  slowMs?: number;
  /** A block averaging at most this many ms kept up with a 60 Hz screen (default 18.5 ms). */
  fastMs?: number;
  /** Frames per measured block (default 30). */
  block?: number;
  /** Smooth blocks in a row before stepping up (default 12, about six seconds). */
  upBlocks?: number;
  /** After a step up that did not hold, how long (ms of measured time) steps up are blocked (default 60 s). */
  lockMs?: number;
}

export class AutoQuality {
  tier: QualityTier;
  private o: Required<AutoOptions>;
  private n = 0; private sum = 0; private smooth = 0; private clock = 0;
  private settle = 0;
  private lastUp = -1e9; private lockedUntil = 0;
  /** Number of tier changes so far, for tests. */
  changes = 0;
  constructor(start: QualityTier = 'high', o: AutoOptions = {}) {
    this.tier = start;
    this.o = { slowMs: 26, fastMs: 18.5, block: 30, upBlocks: 12, lockMs: 60000, ...o };
  }

  /** Report how long the last frame took (ms between animation frames). Returns the new tier when it changes. */
  frame(ms: number): QualityTier | null {
    if (!(ms > 0)) return null;
    this.clock += Math.min(ms, 1000);
    if (ms > 250) { this.n = 0; this.sum = 0; return null; }   // the tab was in the background, or the page hiccuped: not a measurement
    if (this.settle > 0) { this.settle--; return null; }        // a few frames after a change are not representative
    this.n++; this.sum += ms;
    if (this.n < this.o.block) return null;
    const avg = this.sum / this.n; this.n = 0; this.sum = 0;
    const i = QUALITY_ORDER.indexOf(this.tier);
    if (avg > this.o.slowMs && i > 0) {
      this.smooth = 0;
      // dropping soon after a step up means the higher tier does not hold on this device
      if (this.clock - this.lastUp < 15000) this.lockedUntil = this.clock + this.o.lockMs;
      return this.set(QUALITY_ORDER[i - 1]!);
    }
    if (avg <= this.o.fastMs && i < QUALITY_ORDER.length - 1) {
      if (++this.smooth >= this.o.upBlocks && this.clock >= this.lockedUntil) { this.smooth = 0; this.lastUp = this.clock; return this.set(QUALITY_ORDER[i + 1]!); }
    } else this.smooth = 0;
    return null;
  }

  private set(t: QualityTier): QualityTier { this.tier = t; this.settle = 8; this.changes++; return t; }
}
