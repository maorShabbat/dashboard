import { useMemo, useRef } from 'react';
import { EFFECTS } from '../../core/effects/registry';
import { jsonDiff } from '../../core/model/diff';
import { setOverride, setOverrideCues } from '../../core/model/edit';
import { detachPresetToSnapshot, getAsset, relinkPreset, updateDraft } from '../../core/model/ops';
import type { PresetContent, ThemeContent } from '../../core/model/types';
import { resolveCues, resolveParams, resolveTokens } from '../../core/resolve';
import { AssetHeader, DescriptionBox, VersionsPanel } from '../components/AssetChrome';
import { CueEditor } from '../components/CueEditor';
import { ParamPanel } from '../components/ParamPanel';
import { PreviewStage } from '../components/PreviewStage';
import { PlayerController } from '../playerController';
import { useCommit, useProject, useStudio, useUi } from '../studio';
import { EmptyState } from './ThemeView';
import { useMediaLists, usePreviewSequence } from './shared';

export function PresetView() {
  const project = useProject();
  const ui = useUi();
  const studio = useStudio();
  const commit = useCommit();
  const ctrl = useRef(new PlayerController()).current;
  const { media, userFonts } = useMediaLists();
  const asset = ui.presetId ? getAsset<PresetContent>(project, 'preset', ui.presetId) : undefined;
  const pr = asset?.draft;
  const def = pr ? EFFECTS[pr.effectType] : undefined;
  const themeOf = pr ? (pr.link === 'snapshot' && pr.snapshot ? undefined : project.themes[pr.themeId ?? '']) : undefined;
  const base: ThemeContent | undefined = pr ? (pr.link === 'snapshot' && pr.snapshot ? pr.snapshot.content : themeOf?.draft) : undefined;
  const compiled = usePreviewSequence('preset', { themeId: pr?.themeId ?? ui.themeId, presetId: ui.presetId });
  const tokens = useMemo(() => resolveTokens(base?.tokens), [base]);
  const themeSet = pr && base ? base.effectDefaults[pr.effectType] : undefined;
  const res = useMemo(() => (def && pr ? resolveParams(def.params, tokens, [{ source: 'theme', overrides: themeSet?.params }, { source: 'preset', overrides: pr.overrides.params }]) : []), [def, pr, tokens, themeSet]);
  if (!asset || !pr || !def) return <EmptyState what="preset" />;
  const id = asset.id;
  const edit = (label: string, fn: (d: PresetContent) => PresetContent, key?: string) => commit(label, (p) => updateDraft<PresetContent>(p, 'preset', id, fn), key ? `${id}:${key}` : undefined);

  const themes = Object.values(project.themes);
  const snap = pr.snapshot;
  const sourceTheme = pr.link === 'snapshot' ? project.themes[snap?.fromThemeId ?? ''] : themeOf;
  const drift = snap && sourceTheme ? jsonDiff(snap.content, sourceTheme.draft).length : 0;
  const cues = resolveCues(def.defaultCues.map((c, i) => ({ id: `default-${i}`, at: c.at, cue: c.cue, gain: 0 })), [{ source: 'theme', set: themeSet }, { source: 'preset', set: pr.overrides }]);
  const inheritedCues = resolveCues(def.defaultCues.map((c, i) => ({ id: `default-${i}`, at: c.at, cue: c.cue, gain: 0 })), [{ source: 'theme', set: themeSet }]);
  const dur = (res.find((r) => r.key === 'duration')!.value as number) * (tokens.values['motion.durationScale'] as number);
  const usedIn = Object.values(project.sequences).filter((s) => s.draft.tracks.some((t) => t.clips.some((c) => c.presetId === id)));

  const doDetach = (source: 'draft' | 'approved') => commit('Save independent snapshot', (p) => detachPresetToSnapshot(p, id, source));
  const doRelink = (themeId?: string) => { try { commit('Relink preset to theme', (p) => relinkPreset(p, id, themeId)); } catch (e) { studio.toasts.push((e as Error).message, 'error'); } };

  return (
    <div className="view split" data-testid="preset-view">
      <div className="editor-col">
        <AssetHeader kind="preset" id={id} onDeleted={() => studio.ui.set({ presetId: null })} onDuplicated={(nid) => studio.ui.set({ presetId: nid })}>
          <span className="pill" title={def.description}>{def.label}</span>
        </AssetHeader>
        <DescriptionBox kind="preset" id={id} />
        <div className={`link-panel ${pr.link}`} data-testid="link-panel" data-link={pr.link}>
          {pr.link === 'linked' ? (
            <>
              <div className="link-status"><span className="pill ok">⛓ linked</span> Follows <strong>{themeOf?.name ?? 'a missing theme'}</strong> as it changes.</div>
              <div className="link-actions">
                <label>Theme <select value={pr.themeId ?? ''} onChange={(e) => doRelink(e.target.value)} data-testid="link-theme">{themes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
                <button className="btn small" onClick={() => doDetach('draft')} data-testid="btn-detach" title="Freeze the theme's current draft into this preset. Later theme edits will not affect it.">Save independent snapshot</button>
                {themeOf?.approvedVersionId && <button className="btn small" onClick={() => doDetach('approved')} title="Freeze the theme's approved version into this preset">Snapshot approved version</button>}
              </div>
            </>
          ) : (
            <>
              <div className="link-status"><span className="pill snap">❄ independent snapshot</span> of <strong>{snap?.fromThemeName}</strong> ({snap?.fromVersion ? `approved ${`v${snap.fromVersion.number}`}` : 'draft'}, {snap ? new Date(snap.takenAt).toLocaleString() : ''}). Theme edits no longer affect this preset.</div>
              <div className="link-actions">
                {drift > 0 ? <span className="pill warn" data-testid="drift">{drift} difference(s) from the theme's current draft</span> : <span className="pill">identical to the theme's current draft</span>}
                <button className="btn small" onClick={() => doRelink()} data-testid="btn-relink">⛓ Relink to {sourceTheme?.name ?? 'theme'}</button>
                <button className="btn small" onClick={() => doDetach('draft')} title="Take a fresh snapshot of the theme's current draft">Refresh snapshot (draft)</button>
                {sourceTheme?.approvedVersionId && <button className="btn small" onClick={() => doDetach('approved')}>Refresh snapshot (approved)</button>}
              </div>
            </>
          )}
        </div>
        <p className="muted small">{def.description} Used in {usedIn.length} sequence(s){usedIn.length ? `: ${usedIn.map((s) => s.name).join(', ')}` : ''}.</p>
        <h3 className="sub">Parameters <span className="muted small">inherit BANGERS → theme → <strong>this preset</strong></span></h3>
        <ParamPanel idPrefix="preset" defs={def.params} resolutions={res} editLayer="preset" media={media} userFonts={userFonts}
          onChange={(key, value, coalesce) => edit(`Edit ${def.params.find((p) => p.key === key)?.label ?? key}`, (d) => ({ ...d, overrides: setOverride(d.overrides, key, value) }), coalesce ? key : undefined)}
          onResetMany={(keys) => edit(keys.length === 1 ? 'Reset to theme value' : `Reset ${keys.length} parameters to theme`, (d) => ({ ...d, overrides: { ...d.overrides, params: Object.fromEntries(Object.entries(d.overrides.params).filter(([k]) => !keys.includes(k))) } }))}
          resetAllLabel="Reset all to theme" overriddenOnly={ui.overriddenOnly} onOverriddenOnly={(v) => studio.ui.set({ overriddenOnly: v })} />
        <CueEditor idPrefix="preset" duration={dur} markers={cues.markers} source={cues.source} inheritedSource={inheritedCues.source} editLayer="preset"
          onChange={(m, coalesce) => edit('Edit cue markers', (d) => ({ ...d, overrides: setOverrideCues(d.overrides, m) }), coalesce ? 'cues' : undefined)} />
        <details className="section-box"><summary>Versions</summary><VersionsPanel kind="preset" id={id} /></details>
      </div>
      <div className="preview-col">
        <PreviewStage ctrl={ctrl} compiled={compiled} replayKey={JSON.stringify([pr, base])} />
      </div>
    </div>
  );
}
