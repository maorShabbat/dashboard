/** Which media (images, audio, fonts) does a piece of content reference? Used for safe deletion and for bundles. */
import { EFFECTS } from '../effects/registry';
import type { ParamDef } from '../params';
import { isRef } from '../params';
import { resolveTokens } from '../resolve';
import { TOKEN_DEFS } from '../tokens';
import type { OverrideSet, PresetContent, SequenceContent, ThemeContent } from './types';

export interface MediaRefs { assets: Set<string>; fonts: Set<string> }

export function newRefs(): MediaRefs { return { assets: new Set(), fonts: new Set() }; }

export function collectThemeRefs(t: ThemeContent, into: MediaRefs = newRefs()): MediaRefs {
  const r = resolveTokens(t.tokens);
  for (const d of TOKEN_DEFS) {
    const v = r.values[d.key];
    if (d.kind === 'asset' && typeof v === 'string' && v) into.assets.add(v);
    if (d.kind === 'font' && typeof v === 'string' && v) into.fonts.add(v);
  }
  for (const [type, set] of Object.entries(t.effectDefaults)) collectOverrideRefs(type, set, into);
  return into;
}

export function collectOverrideRefs(effectType: string, set: OverrideSet | undefined, into: MediaRefs): void {
  const def = EFFECTS[effectType];
  if (!def || !set) return;
  for (const [k, v] of Object.entries(set.params)) {
    if (isRef(v) || typeof v !== 'string' || !v) continue;
    const pd: ParamDef | undefined = def.params.find((p) => p.key === k);
    if (pd?.kind === 'asset') into.assets.add(v);
    if (pd?.kind === 'font') into.fonts.add(v);
  }
}

export function collectPresetRefs(p: PresetContent, into: MediaRefs = newRefs()): MediaRefs {
  if (p.snapshot) collectThemeRefs(p.snapshot.content, into);
  collectOverrideRefs(p.effectType, p.overrides, into);
  return into;
}

export function collectSequenceRefs(s: SequenceContent, into: MediaRefs = newRefs()): MediaRefs {
  for (const t of s.tracks) for (const c of t.clips) collectOverrideRefs(c.effectType, c.overrides, into);
  return into;
}

export function mergeRefs(...rs: MediaRefs[]): MediaRefs {
  const out = newRefs();
  for (const r of rs) { r.assets.forEach((a) => out.assets.add(a)); r.fonts.forEach((f) => out.fonts.add(f)); }
  return out;
}
