import type { CueMarker } from '../cues';
import type { Cell, BoardLayout, Scene } from '../board';
import { Out } from '../ops';
import { type ParamDef, type Scalar, enm, num } from '../params';
import type { Rng } from '../util/prng';
import { EASING_NAMES } from '../util/easing';
import { BLEND_MODES, LAYERS, type LayerId, type TokenValues } from '../tokens';

export type IntensityCategory = 'shake' | 'flash' | 'particles' | 'glow' | 'text' | 'motion';

export interface AssetIndex { has(id: string): boolean; hash(id: string): string | undefined }

export interface EffectContext {
  /** Milliseconds since this instance started (0..duration). */
  t: number;
  /** Effective duration in ms (base × theme duration scale). */
  duration: number;
  /** t / duration, 0..1 */
  p: number;
  params: Record<string, Scalar>;
  tokens: TokenValues;
  /** Easing chosen by the effect's own `easing` param, falling back to the theme's motion personality. */
  ease: (p: number) => number;
  /** master × family × effect intensity (× reduced-motion scale for shake/flash/motion). */
  intensity: number;
  reducedMotion: boolean;
  layout: BoardLayout;
  scene: Scene;
  layer: LayerId;
  /** Independent deterministic random stream for a salt. */
  rng(salt: number): Rng;
  instance: { index: number; count: number };
  out: Out;
  assets: AssetIndex;
}

export interface EffectDef {
  type: string;
  label: string;
  description: string;
  category: IntensityCategory;
  defaultLayer: LayerId | null;
  params: ParamDef[];
  /** Cue markers inherited when no theme/preset/instance replaces them. `at` is in ms from effect start. */
  defaultCues: Pick<CueMarker, 'cue' | 'at'>[];
  evaluate(c: EffectContext): void;
}

export interface CommonOpts {
  duration: number;
  layer?: LayerId | null;
  blend?: string;
  /** Default easing; null removes the parameter for effects that do not use a progress curve. */
  easing?: string | null;
  /** Expose a random seed (only for effects that actually draw random numbers). */
  seed?: boolean;
  maxDuration?: number;
  noOpacity?: boolean;
}

export function commonParams(o: CommonOpts): ParamDef[] {
  const timing = { section: 'effect', group: 'Timing' };
  const out: ParamDef[] = [
    num('duration', 'Duration', timing, o.duration, 100, o.maxDuration ?? 12000, 10, 'ms', 'Base duration before the theme\'s duration scale is applied.', true),
  ];
  if (o.easing !== null) {
    out.push(enm('easing', 'Easing', timing, o.easing ?? 'theme', [['theme', 'Theme (motion.easing)'], ...EASING_NAMES.map((n) => [n, n] as [string, string])], 'Progress curve. "Theme" follows the motion personality.'));
  }
  out.push(num('intensity', 'Intensity', { section: 'effect', group: 'Strength' }, 1, 0, 3, 0.05, 'ratio', 'Effect-level multiplier on top of the theme\'s family intensity.'));
  if (o.seed) out.push(num('seed', 'Random seed', { section: 'effect', group: 'Variation' }, 1, 0, 99999, 1, '', 'Seed for scatter/jitter. Same seed gives an identical result.', true));
  if (!o.noOpacity) out.push(num('opacity', 'Opacity', { section: 'effect', group: 'Compositing' }, 100, 0, 100, 1, '%', 'Overall effect opacity.'));
  if (o.layer) {
    out.push(
      enm('layer', 'Layer', { section: 'effect', group: 'Compositing' }, o.layer, LAYERS.map((l) => [l.id, l.label] as [string, string]), 'Render layer this effect draws into.'),
      enm('blend', 'Blend', { section: 'effect', group: 'Compositing' }, o.blend ?? 'source-over', BLEND_MODES, 'Composite mode for this effect\'s primitives.'),
    );
  }
  return out;
}

export const P = {
  n: (c: EffectContext, k: string): number => c.params[k] as number,
  s: (c: EffectContext, k: string): string => c.params[k] as string,
  b: (c: EffectContext, k: string): boolean => c.params[k] as boolean,
};

export function allCells(scene: Scene): Cell[] {
  const out: Cell[] = [];
  for (let col = 0; col < scene.cols; col++) for (let row = 0; row < scene.rows; row++) out.push({ col, row });
  return out;
}

export function targetCells(c: EffectContext, target: string): Cell[] {
  return target === 'allCells' ? allCells(c.scene) : c.scene.winCells;
}
