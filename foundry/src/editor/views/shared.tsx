import { useMemo } from 'react';
import { EFFECTS } from '../../core/effects/registry';
import type { CompiledSequence } from '../../core/engine';
import { compileSequence, resolveClip } from '../../core/engine';
import { effectPreviewSequence, presetPreviewSequence } from '../../core/bundle/replay';
import type { LibraryView } from '../../core/engine';
import { libraryView } from '../../core/model/ops';
import type { MediaItem, Project, ThemeContent, UserFont } from '../../core/model/types';
import { resolveParams, resolveTokens } from '../../core/resolve';
import { TOKEN_DEFS } from '../../core/tokens';
import { sceneFromUi } from '../components/PreviewStage';
import { useProject, useUi } from '../studio';
import type { UiState } from '../ui';

export function useMediaLists(): { media: MediaItem[]; userFonts: UserFont[] } {
  const p = useProject();
  return useMemo(() => ({ media: Object.values(p.media), userFonts: Object.values(p.fonts) }), [p.media, p.fonts]);
}

export function themeResolutions(theme: ThemeContent) {
  const tokens = resolveTokens(theme.tokens);
  const res = resolveParams(TOKEN_DEFS, tokens, [{ source: 'theme', overrides: theme.tokens }]);
  return { tokens, res };
}

export function useLibraryView(source: UiState['source'] = 'draft'): LibraryView {
  const p = useProject();
  return useMemo(() => libraryView(p, source), [p, source]);
}

/** Compile whatever the current view previews. */
export function usePreviewSequence(kind: 'theme' | 'preset' | 'sequence', ids: { themeId: string | null; presetId?: string | null; sequenceId?: string | null }): CompiledSequence | null {
  const project: Project = useProject();
  const ui = useUi();
  const lib = useLibraryView(kind === 'theme' ? ui.source : 'draft');
  return useMemo(() => {
    try {
      const scene = sceneFromUi(ui);
      if (kind === 'sequence') {
        const s = ids.sequenceId ? project.sequences[ids.sequenceId] : undefined;
        return s ? compileSequence(s.draft, lib) : null;
      }
      if (kind === 'preset') {
        const pr = ids.presetId ? project.presets[ids.presetId] : undefined;
        if (!pr) return null;
        // An independent snapshot is previewed entirely in its own frozen theme (board, symbols and layers included),
        // not just for the effect parameters: otherwise the stage would silently follow the live theme.
        const snap = pr.draft.link === 'snapshot' ? pr.draft.snapshot : null;
        if (snap) {
          const SNAP = '__snapshot__';
          const view: LibraryView = { theme: (id) => (id === SNAP ? snap.content : lib.theme(id)), preset: (id) => lib.preset(id) };
          return compileSequence({ ...presetPreviewSequence(SNAP, pr.id, pr.draft.effectType), scene }, view);
        }
        return compileSequence({ ...presetPreviewSequence(pr.draft.themeId ?? ids.themeId, pr.id, pr.draft.effectType), scene }, lib);
      }
      const key = ui.previewKey;
      if (key.startsWith('sequence:')) {
        const s = project.sequences[key.slice(9)];
        if (s && s.draft.themeId === ids.themeId) return compileSequence(s.draft, lib);
      }
      const type = key.startsWith('effect:') && EFFECTS[key.slice(7)] ? key.slice(7) : ui.effectType;
      return compileSequence({ ...effectPreviewSequence(ids.themeId, type), scene }, lib);
    } catch { return null; }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project, lib, ui.previewKey, ui.effectType, ui.cols, ui.rows, ui.pattern, ui.seed, ui.winAmount, kind, ids.themeId, ids.presetId, ids.sequenceId]);
}

export { resolveClip };
