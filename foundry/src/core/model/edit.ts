/** Small pure editors for override sets (shared by theme defaults, presets and clip instances). */
import type { CueMarker } from '../cues';
import type { Value } from '../params';
import type { OverrideSet, ThemeContent } from './types';

export function setOverride(set: OverrideSet, key: string, value: Value | undefined): OverrideSet {
  const params = { ...set.params };
  if (value === undefined) delete params[key]; else params[key] = value;
  return { ...set, params };
}

export function setOverrideCues(set: OverrideSet, cues: CueMarker[] | undefined): OverrideSet {
  const { cues: _drop, ...rest } = set;
  void _drop;
  return cues === undefined ? rest : { ...rest, cues };
}

export function clearOverrides(set: OverrideSet, keys?: string[]): OverrideSet {
  if (!keys) return { params: {} };
  const params = { ...set.params };
  for (const k of keys) delete params[k];
  return { ...set, params };
}

export function setToken(t: ThemeContent, key: string, value: Value | undefined): ThemeContent {
  const tokens = { ...t.tokens };
  if (value === undefined) delete tokens[key]; else tokens[key] = value;
  return { ...t, tokens };
}

export function clearTokens(t: ThemeContent, keys: string[]): ThemeContent {
  const tokens = { ...t.tokens };
  for (const k of keys) delete tokens[k];
  return { ...t, tokens };
}

const isEmptySet = (s: OverrideSet) => Object.keys(s.params).length === 0 && s.cues === undefined;

export function updateEffectDefault(t: ThemeContent, effectType: string, fn: (s: OverrideSet) => OverrideSet): ThemeContent {
  const next = fn(t.effectDefaults[effectType] ?? { params: {} });
  const effectDefaults = { ...t.effectDefaults };
  if (isEmptySet(next)) delete effectDefaults[effectType]; else effectDefaults[effectType] = next;
  return { ...t, effectDefaults };
}
