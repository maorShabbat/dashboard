import { defaultSceneSpec } from '../board';
import { newId } from '../util/ids';
import type { ArtDirection, Clip, OverrideSet, SeqMarker, SequenceContent, ThemeContent, Track } from './types';

export const emptyArtDirection = (): ArtDirection => ({ summary: '', mood: [], references: '', dos: '', donts: '' });
export const emptyOverrides = (): OverrideSet => ({ params: {} });
export const emptyThemeContent = (): ThemeContent => ({ tokens: {}, effectDefaults: {}, artDirection: emptyArtDirection(), game: '' });

export function newTrack(name = 'Track'): Track { return { id: newId('trk'), name, muted: false, solo: false, locked: false, clips: [] }; }

export function newClip(effectType: string, start: number, presetId: string | null = null, name = ''): Clip {
  return { id: newId('clip'), name, presetId, effectType, start, overrides: emptyOverrides(), repeat: { count: 1, step: 80, order: 'forward' }, muted: false };
}

export function newMarker(kind: SeqMarker['kind'], t: number, name: string): SeqMarker { return { id: newId('mk'), t, kind, name, gain: 0 }; }

export function emptySequenceContent(themeId: string | null): SequenceContent {
  return { themeId, scene: defaultSceneSpec(), tracks: [newTrack('Track 1')], markers: [], fixedDuration: null };
}
