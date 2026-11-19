import { CATEGORIES, type CategoryId, type Preset } from '../model/preset';
import { ambients, frames, triggers } from './atmosphere';
import { boardLooks } from './boardlooks';
import { classicCounters, counters } from './counters';
import { destruction } from './destruction';
import { distortion } from './distortion';
import { impacts, impacts2, legacy } from './impacts';
import { messages } from './messages';
import { multipliers, multipliers2 } from './multipliers';
import { reelFeatures } from './reels';
import { shinePresets } from './shine';
import { calmAnimations, textAnimations } from './textAnimations';
import { textStyling } from './textStyling';
import { transformation } from './transformation';
import { transitions } from './transitions';

const deepFreeze = <T>(o: T): T => {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) { Object.freeze(o); for (const v of Object.values(o as Record<string, unknown>)) deepFreeze(v); }
  return o;
};

/** Presets that did not name a group are put under `group`, so a category with several kinds of preset shows headings throughout. */
const grouped = (list: Preset[], group: string): Preset[] => list.map((p) => (p.group ? p : { ...p, group }));
const featured = (cat: Preset['category']) => [...reelFeatures(), ...boardLooks()].filter((p) => p.category === cat);

let cache: Preset[] | null = null;

/** Every built-in preset, frozen: built-ins never change, you copy them to edit. */
export function builtinPresets(): readonly Preset[] {
  if (!cache) {
    cache = [...textAnimations(), ...calmAnimations(), ...textStyling(), ...counters(), ...classicCounters(), ...messages(), ...triggers(), ...destruction(), ...transformation(), ...multipliers(), ...multipliers2(), ...grouped(impacts(), 'Whole screen'), ...impacts2(), ...featured('impacts'), ...distortion(), ...transitions(), ...grouped(shinePresets(), 'Light on text and symbols'), ...featured('shine'), ...ambients(), ...frames(), ...legacy()].map(deepFreeze);
  }
  return cache;
}

export const builtinById = (id: string): Preset | undefined => builtinPresets().find((p) => p.id === id);
/** Presets of a category, archived and experimental ones excluded (they live under Archived). */
export const presetsOf = (cat: CategoryId): Preset[] => builtinPresets().filter((p) => p.category === cat && p.status !== 'archived' && p.status !== 'experimental');
export const legacyPresets = (): Preset[] => builtinPresets().filter((p) => p.status === 'archived' || p.status === 'experimental');
export { CATEGORIES };
