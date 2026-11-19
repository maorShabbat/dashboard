import { useMemo, useRef, useState } from 'react';
import { BOARD_PRESETS, WIN_PATTERNS, defaultSceneSpec } from '../../core/board';
import { CUES } from '../../core/cues';
import { EFFECTS } from '../../core/effects/registry';
import { resolveClip } from '../../core/engine';
import { setOverride, setOverrideCues } from '../../core/model/edit';
import { createPreset, getAsset, libraryView, updateDraft } from '../../core/model/ops';
import { deleteMarker, findClip, updateClip, updateMarker } from '../../core/model/seqEdit';
import type { Clip, SequenceContent } from '../../core/model/types';
import { resolveCues } from '../../core/resolve';
import { AssetHeader, DescriptionBox, VersionsPanel } from '../components/AssetChrome';
import { CueEditor } from '../components/CueEditor';
import { ParamPanel } from '../components/ParamPanel';
import { PreviewStage } from '../components/PreviewStage';
import { Timeline } from '../components/Timeline';
import { PlayerController } from '../playerController';
import { useCommit, useProject, useStudio, useUi } from '../studio';
import { EmptyState } from './ThemeView';
import { useMediaLists, usePreviewSequence } from './shared';

export function SequenceView() {
  const project = useProject();
  const ui = useUi();
  const studio = useStudio();
  const ctrl = useRef(new PlayerController()).current;
  const asset = ui.sequenceId ? getAsset<SequenceContent>(project, 'sequence', ui.sequenceId) : undefined;
  const compiled = usePreviewSequence('sequence', { themeId: asset?.draft.themeId ?? null, sequenceId: ui.sequenceId });
  const [tab, setTab] = useState<'selection' | 'sequence' | 'versions'>('selection');
  if (!asset) return <EmptyState what="sequence" />;
  const content = asset.draft;
  const id = asset.id;
  const clipSel = ui.selectedClipIds.length === 1 ? findClip(content, ui.selectedClipIds[0]!) : undefined;
  const marker = ui.selectedMarkerId ? content.markers.find((m) => m.id === ui.selectedMarkerId) : undefined;

  return (
    <div className="view seq" data-testid="sequence-view">
      <div className="seq-main">
        <AssetHeader kind="sequence" id={id} onDeleted={() => studio.ui.set({ sequenceId: null, selectedClipIds: [] })} onDuplicated={(nid) => studio.ui.set({ sequenceId: nid, selectedClipIds: [] })} />
        <PreviewStage ctrl={ctrl} compiled={compiled} sceneControls={false} replayKey={undefined} compact />
        <Timeline ctrl={ctrl} seqId={id} content={content} compiled={compiled} />
      </div>
      <aside className="inspector" data-testid="inspector">
        <div className="seg tabs" role="tablist">
          {(['selection', 'sequence', 'versions'] as const).map((t) => <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)} data-testid={`insp-${t}`}>{t[0]!.toUpperCase() + t.slice(1)}</button>)}
        </div>
        {tab === 'selection' && (clipSel ? <ClipInspector seqId={id} content={content} clipId={clipSel.clip.id} />
          : marker ? <MarkerInspector seqId={id} markerId={marker.id} />
            : <div className="muted pad" data-testid="insp-empty">{ui.selectedClipIds.length > 1 ? `${ui.selectedClipIds.length} clips selected. Use Stagger, Chain, Duplicate or Delete in the toolbar.` : 'Select a clip or marker on the timeline to edit it. Clip parameters are overrides at the INSTANCE layer, on top of its preset, theme and BANGERS defaults.'}</div>)}
        {tab === 'sequence' && <SequenceSettings seqId={id} content={content} />}
        {tab === 'versions' && <VersionsPanel kind="sequence" id={id} />}
      </aside>
    </div>
  );
}

function ClipInspector({ seqId, content, clipId }: { seqId: string; content: SequenceContent; clipId: string }) {
  const project = useProject();
  const ui = useUi();
  const studio = useStudio();
  const commit = useCommit();
  const { media, userFonts } = useMediaLists();
  const found = findClip(content, clipId);
  const lib = useMemo(() => libraryView(project, 'draft'), [project]);
  const clip = found?.clip;
  const seqTheme = content.themeId ? lib.theme(content.themeId) : undefined;
  const r = useMemo(() => (clip ? resolveClip(clip.effectType, clip.presetId, clip.overrides, seqTheme, lib) : null), [clip, seqTheme, lib]);
  const inherited = useMemo(() => (clip ? resolveClip(clip.effectType, clip.presetId, null, seqTheme, lib) : null), [clip, seqTheme, lib]);
  if (!clip || !r || !inherited) return null;
  const def = EFFECTS[clip.effectType]!;
  const edit = (label: string, fn: (c: Clip) => Clip, key?: string) => commit(label, (p) => updateDraft<SequenceContent>(p, 'sequence', seqId, (s) => updateClip(s, clipId, fn)), key ? `${seqId}:${clipId}:${key}` : undefined);
  const compatible = Object.values(project.presets).filter((p) => p.draft.effectType === clip.effectType && (p.draft.themeId === content.themeId || p.draft.link === 'snapshot'));
  const dur = (r.params.duration as number) * (r.tokens.values['motion.durationScale'] as number);
  const presetName = clip.presetId ? project.presets[clip.presetId]?.name : undefined;
  const nOver = Object.keys(clip.overrides.params).length + (clip.overrides.cues ? 1 : 0);

  const promote = () => {
    const old = clip.presetId ? project.presets[clip.presetId]?.draft.overrides : undefined;
    let newId = '';
    commit('Promote overrides to preset', (p) => {
      const rr = createPreset(p, { name: `${clip.name || def.label} preset`, effectType: clip.effectType, themeId: content.themeId, overrides: { params: { ...(old?.params ?? {}), ...clip.overrides.params }, ...((clip.overrides.cues ?? old?.cues) ? { cues: clip.overrides.cues ?? old!.cues } : {}) } });
      newId = rr.id;
      return updateDraft<SequenceContent>(rr.project, 'sequence', seqId, (s) => updateClip(s, clipId, (c) => ({ ...c, presetId: newId, overrides: { params: {} } })));
    });
    studio.toasts.push('Saved the clip\'s overrides as a new preset and linked the clip to it', 'ok');
  };

  return (
    <div className="clip-inspector" data-testid="clip-inspector">
      <div className="insp-head"><span className={`pill cat-${def.category}`}>{def.label}</span><span className="muted small">{Math.round(dur)} ms · {nOver} override(s)</span></div>
      <div className="form-grid">
        <label>Name <input value={clip.name} placeholder={presetName ?? def.label} onChange={(e) => edit('Rename clip', (c) => ({ ...c, name: e.target.value }), 'name')} data-testid="clip-name" /></label>
        <label>Start (ms) <input type="number" min={0} step={10} value={Math.round(clip.start)} onChange={(e) => edit('Set clip start', (c) => ({ ...c, start: Math.max(0, Math.round(Number(e.target.value) || 0)) }), 'start')} data-testid="clip-start" /></label>
        <label>Preset <select value={clip.presetId ?? ''} onChange={(e) => edit('Change preset', (c) => ({ ...c, presetId: e.target.value || null }))} data-testid="clip-preset">
          <option value="">None (theme defaults)</option>{compatible.map((p) => <option key={p.id} value={p.id}>{p.name}{p.draft.link === 'snapshot' ? ' ❄' : ''}</option>)}
        </select></label>
        <label className="check"><input type="checkbox" checked={clip.muted} onChange={(e) => edit('Mute clip', (c) => ({ ...c, muted: e.target.checked }))} /> Muted</label>
      </div>
      <fieldset className="repeat">
        <legend>Repeat &amp; stagger {(clip.repeat.count !== 1 || clip.repeat.step !== 80 || clip.repeat.order !== 'forward') && <button type="button" className="icon-btn reset" title="Reset repeat to 1 instance, 80 ms, forward" aria-label="Reset repeat" data-testid="clip-repeat-reset" onClick={() => edit('Reset repeat', (c) => ({ ...c, repeat: { count: 1, step: 80, order: 'forward' } }))}>⟲</button>}</legend>
        <label>Instances <input type="number" min={1} max={32} value={clip.repeat.count} onChange={(e) => edit('Set repeat', (c) => ({ ...c, repeat: { ...c.repeat, count: Math.min(32, Math.max(1, Math.round(Number(e.target.value) || 1))) } }), 'rep')} data-testid="clip-repeat-count" /></label>
        <label>Step (ms) <input type="number" min={0} max={5000} step={10} value={clip.repeat.step} onChange={(e) => edit('Set repeat step', (c) => ({ ...c, repeat: { ...c.repeat, step: Math.min(5000, Math.max(0, Number(e.target.value) || 0)) } }), 'step')} data-testid="clip-repeat-step" /></label>
        <label>Order <select value={clip.repeat.order} onChange={(e) => edit('Set repeat order', (c) => ({ ...c, repeat: { ...c.repeat, order: e.target.value as Clip['repeat']['order'] } }))}><option value="forward">Forward</option><option value="reverse">Reverse</option><option value="center">Centre-out</option><option value="random">Random (seeded)</option></select></label>
        <p className="muted small">Each instance is its own copy with its own random seed. The theme's stagger scale ({String(r.tokens.values['motion.staggerScale'])}×) multiplies the step.</p>
      </fieldset>
      <div className="insp-actions">
        <button className="btn small" disabled={!nOver} onClick={() => edit('Reset clip overrides', (c) => ({ ...c, overrides: { params: {} } }))} data-testid="clip-reset-all" title="Remove every instance override: the clip falls back to its preset/theme">⟲ Reset all to preset{presetName ? ` “${presetName}”` : '/theme'}</button>
        <button className="btn small" disabled={!nOver} onClick={promote} data-testid="clip-promote" title="Create a new preset from this clip's overrides and link the clip to it">Save overrides as preset</button>
      </div>
      {r.warnings.length > 0 && <ul className="warn-list">{r.warnings.map((w) => <li key={w}>{w}</li>)}</ul>}
      <h3 className="sub">Parameters <span className="muted small">BANGERS → theme → preset → <strong>this clip</strong></span></h3>
      <ParamPanel idPrefix="clip" defs={def.params} resolutions={r.resolution} editLayer="instance" media={media} userFonts={userFonts}
        onChange={(key, value, coalesce) => edit(`Edit ${def.params.find((p) => p.key === key)?.label ?? key} (instance)`, (c) => ({ ...c, overrides: setOverride(c.overrides, key, value) }), coalesce ? key : undefined)}
        onResetMany={(keys) => edit(keys.length === 1 ? 'Reset to inherited value' : `Reset ${keys.length} overrides`, (c) => ({ ...c, overrides: { ...c.overrides, params: Object.fromEntries(Object.entries(c.overrides.params).filter(([k]) => !keys.includes(k))) } }))}
        resetAllLabel="Reset all to preset" overriddenOnly={ui.overriddenOnly} onOverriddenOnly={(v) => studio.ui.set({ overriddenOnly: v })} />
      <CueEditor idPrefix="clip" duration={dur} markers={r.cues} source={r.cueSource as 'bangers' | 'theme' | 'preset' | 'instance'} inheritedSource={inherited.cueSource as 'bangers' | 'theme' | 'preset' | 'instance'} editLayer="instance"
        onChange={(m, coalesce) => edit('Edit cue markers', (c) => ({ ...c, overrides: setOverrideCues(c.overrides, m) }), coalesce ? 'cues' : undefined)} />
      {void resolveCues}
    </div>
  );
}

function MarkerInspector({ seqId, markerId }: { seqId: string; markerId: string }) {
  const project = useProject();
  const commit = useCommit();
  const studio = useStudio();
  const m = project.sequences[seqId]?.draft.markers.find((x) => x.id === markerId);
  if (!m) return null;
  const edit = (label: string, patch: Partial<typeof m>, key?: string) => commit(label, (p) => updateDraft<SequenceContent>(p, 'sequence', seqId, (s) => updateMarker(s, markerId, patch)), key ? `${seqId}:${markerId}:${key}` : undefined);
  return (
    <div className="marker-inspector" data-testid="marker-inspector">
      <div className="form-grid">
        <label>Kind <select value={m.kind} onChange={(e) => edit('Change marker kind', { kind: e.target.value as typeof m.kind, name: e.target.value === 'cue' ? 'whoosh' : m.name })} data-testid="marker-kind">
          <option value="event">Event (for the game)</option><option value="cue">Sound cue</option><option value="label">Label (annotation)</option></select></label>
        {m.kind === 'cue'
          ? <label>Cue <select value={m.name} onChange={(e) => edit('Change cue', { name: e.target.value })} data-testid="marker-name">{CUES.map((c) => <option key={c.id} value={c.id}>{c.id}</option>)}</select></label>
          : <label>Name <input value={m.name} onChange={(e) => edit('Rename marker', { name: e.target.value.slice(0, 80) }, 'name')} data-testid="marker-name" /></label>}
        <label>Time (ms) <input type="number" min={0} step={10} value={Math.round(m.t)} onChange={(e) => edit('Move marker', { t: Number(e.target.value) || 0 }, 't')} data-testid="marker-time" /></label>
        {m.kind === 'cue' && <label>Gain (dB) <input type="number" min={-40} max={12} step={0.5} value={m.gain} onChange={(e) => edit('Set marker gain', { gain: Math.min(12, Math.max(-40, Number(e.target.value) || 0)) }, 'gain')} /></label>}
      </div>
      <p className="muted small">{m.kind === 'event' ? 'Event markers are delivered to your game through onEvent (for example "celebration.end" to unlock the spin button).' : m.kind === 'cue' ? 'Cue markers trigger a named sound; the theme decides which audio asset, gain and pitch it uses.' : 'Labels are annotations for people; they are not delivered to the game.'}</p>
      <button className="btn small danger" onClick={() => { commit('Delete marker', (p) => updateDraft<SequenceContent>(p, 'sequence', seqId, (s) => deleteMarker(s, markerId))); studio.ui.set({ selectedMarkerId: null }); }}>Delete marker</button>
    </div>
  );
}

function SequenceSettings({ seqId, content }: { seqId: string; content: SequenceContent }) {
  const project = useProject();
  const commit = useCommit();
  const edit = (label: string, fn: (s: SequenceContent) => SequenceContent, key?: string) => commit(label, (p) => updateDraft<SequenceContent>(p, 'sequence', seqId, fn), key ? `${seqId}:${key}` : undefined);
  const sc = content.scene;
  const boardId = BOARD_PRESETS.find((b) => b.cols === sc.cols && b.rows === sc.rows)?.id ?? 'custom';
  const setScene = (patch: Partial<typeof sc>, key?: string) => edit('Edit scene', (s) => ({ ...s, scene: { ...s.scene, ...patch } }), key ?? 'scene');
  return (
    <div className="seq-settings" data-testid="seq-settings">
      <DescriptionBox kind="sequence" id={seqId} />
      <div className="form-grid">
        <label>Theme <select value={content.themeId ?? ''} onChange={(e) => edit('Change sequence theme', (s) => ({ ...s, themeId: e.target.value || null }))} data-testid="seq-theme">
          <option value="">BANGERS defaults</option>{Object.values(project.themes).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
        <label>Board <select value={boardId} onChange={(e) => { const b = BOARD_PRESETS.find((x) => x.id === e.target.value); if (b) setScene({ cols: b.cols, rows: b.rows }); }} data-testid="seq-board">
          {BOARD_PRESETS.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}{boardId === 'custom' && <option value="custom">Custom {sc.cols}×{sc.rows}</option>}</select></label>
        <label>Columns <input type="number" min={1} max={12} value={sc.cols} onChange={(e) => setScene({ cols: Math.min(12, Math.max(1, Number(e.target.value) || 1)) }, 'cols')} /></label>
        <label>Rows <input type="number" min={1} max={12} value={sc.rows} onChange={(e) => setScene({ rows: Math.min(12, Math.max(1, Number(e.target.value) || 1)) }, 'rows')} /></label>
        <label>Win pattern <select value={sc.pattern} onChange={(e) => setScene({ pattern: e.target.value as typeof sc.pattern })}>{WIN_PATTERNS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
        <label>Seed <input type="number" min={0} max={99999} value={sc.seed} onChange={(e) => setScene({ seed: Math.min(99999, Math.max(0, Number(e.target.value) || 0)) }, 'seed')} /></label>
        <label>Win amount <input type="number" min={0} step={10} value={sc.winAmount} onChange={(e) => setScene({ winAmount: Math.max(0, Number(e.target.value) || 0) }, 'amount')} data-testid="seq-amount" /></label>
        <label>Multiplier <input type="number" min={1} max={1000} value={sc.multiplier} onChange={(e) => setScene({ multiplier: Math.min(1000, Math.max(1, Math.round(Number(e.target.value) || 1))) }, 'mult')} /></label>
        <label className="check"><input type="checkbox" checked={content.fixedDuration !== null} onChange={(e) => edit('Toggle fixed duration', (s) => ({ ...s, fixedDuration: e.target.checked ? 5000 : null }))} /> Fixed length</label>
        {content.fixedDuration !== null && <label>Length (ms) <input type="number" min={100} max={600000} step={100} value={content.fixedDuration} onChange={(e) => edit('Set fixed length', (s) => ({ ...s, fixedDuration: Math.min(600000, Math.max(100, Number(e.target.value) || 100)) }), 'fixed')} /></label>}
      </div>
      <div className="insp-actions"><button className="btn small" disabled={JSON.stringify(sc) === JSON.stringify(defaultSceneSpec())} onClick={() => edit('Reset scene', (s) => ({ ...s, scene: defaultSceneSpec() }))} data-testid="seq-scene-reset">⟲ Reset scene to defaults</button></div>
      <p className="muted small">The scene is the sample board state this sequence replays against. It is saved with the sequence and exported in bundles; your game supplies the real board at runtime.</p>
    </div>
  );
}
