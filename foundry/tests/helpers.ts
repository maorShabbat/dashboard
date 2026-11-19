import type { LibraryView } from '../src/core/engine';
import type { PresetContent, SequenceContent, ThemeContent } from '../src/core/model/types';
import { emptyThemeContent, emptyOverrides, newClip, emptySequenceContent } from '../src/core/model/defaults';

export function lib(themes: Record<string, ThemeContent> = {}, presets: Record<string, PresetContent> = {}): LibraryView {
  return { theme: (id) => themes[id], preset: (id) => presets[id] };
}

export function seqWith(effectType: string, themeId: string | null = null, presetId: string | null = null): SequenceContent {
  const s = emptySequenceContent(themeId);
  const clip = newClip(effectType, 0, presetId, effectType);
  s.tracks[0]!.clips.push(clip);
  return s;
}

export { emptyThemeContent, emptyOverrides };
