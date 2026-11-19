import type { EffectDef } from './types';
import { anticipationGlow, shine, symbolHighlight, winLine } from './highlight';
import { coinBurst, shockwave } from './particles';
import { flash, screenShake } from './camera';
import { bigWinBanner, multiplierPop, textCallout } from './text';
import { cascadeDrop } from './cells';

/** Every effect BANGERS requires. Each is fully configurable through theme defaults, presets and instance overrides. */
export const EFFECT_LIST: EffectDef[] = [
  symbolHighlight, winLine, coinBurst, bigWinBanner, screenShake, flash, shockwave, cascadeDrop, multiplierPop, anticipationGlow, shine, textCallout,
];
export const EFFECTS: Record<string, EffectDef> = Object.fromEntries(EFFECT_LIST.map((e) => [e.type, e]));
export const EFFECT_TYPES = EFFECT_LIST.map((e) => e.type);
export function effectDef(type: string): EffectDef | undefined { return EFFECTS[type]; }
export function isEffectType(type: string): boolean { return type in EFFECTS; }
