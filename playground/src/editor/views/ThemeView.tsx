import { useMemo, useRef } from 'react';
import { EFFECT_LIST, EFFECTS } from '../../core/effects/registry';
import { CUES, type CueMarker } from '../../core/cues';
import { clearTokens, setOverride, setOverrideCues, setToken, updateEffectDefault } from '../../core/model/edit';
import { updateDraft } from '../../core/model/ops';
import type { ThemeContent } from '../../core/model/types';
import type { Value } from '../../core/params';
import { resolveCues, resolveParams } from '../../core/resolve';
import { LAYERS, TOKEN_SECTIONS, tokensInSection, TOKEN_DEFS } from '../../core/tokens';
import { ArtDirection, AssetHeader, DescriptionBox, VersionsPanel } from '../components/AssetChrome';
import { CueEditor } from '../components/CueEditor';
import { ParamPanel } from '../components/ParamPanel';
import { PreviewStage } from '../components/PreviewStage';
import { PlayerController } from '../playerController';
import { useCommit, useProject, useStudio, useUi } from '../studio';
import { themeResolutions, useMediaLists, usePreviewSequence } from './shared';

const PERSONALITIES: Record<string, { label: string; tokens: Record<string, Value>; blurb: string }> = {
  snappy: { label: 'Snappy', blurb: 'Quick, decisive, almost no wind-up.', tokens: { 'motion.easing': 'easeOutQuad', 'motion.durationScale': 0.8, 'motion.staggerScale': 0.8, 'motion.anticipation': 0 } },
  bouncy: { label: 'Bouncy', blurb: 'Playful overshoot with a noticeable wind-up.', tokens: { 'motion.easing': 'easeOutBack', 'motion.overshoot': 2.6, 'motion.durationScale': 1, 'motion.staggerScale': 1, 'motion.anticipation': 18 } },
  springy: { label: 'Springy', blurb: 'Damped spring that rings before settling.', tokens: { 'motion.easing': 'spring', 'motion.springFrequency': 3, 'motion.springDamping': 0.35, 'motion.durationScale': 1.1, 'motion.staggerScale': 1, 'motion.anticipation': 10 } },
  heavy: { label: 'Heavy', blurb: 'Slow to start, weighty, no bounce.', tokens: { 'motion.easing': 'easeOutCubic', 'motion.durationScale': 1.35, 'motion.staggerScale': 1.2, 'motion.anticipation': 0 } },
  smooth: { label: 'Smooth', blurb: 'Eased in and out, calm.', tokens: { 'motion.easing': 'easeInOutCubic', 'motion.durationScale': 1.1, 'motion.staggerScale': 1, 'motion.anticipation': 6 } },
};

export function ThemeView() {
  const project = useProject();
  const ui = useUi();
  const studio = useStudio();
  const commit = useCommit();
  const ctrl = useRef(new PlayerController()).current;
  const { media, userFonts } = useMediaLists();
  const theme = ui.themeId ? project.themes[ui.themeId] : undefined;
  const compiled = usePreviewSequence('theme', { themeId: ui.themeId });
  const resolved = useMemo(() => (theme ? themeResolutions(theme.draft) : null), [theme?.draft]);
  if (!theme || !resolved) return <EmptyState what="theme" />;
  const id = theme.id;
  const section = ui.themeSection;
  const edit = (label: string, fn: (d: ThemeContent) => ThemeContent, key?: string) => commit(label, (p) => updateDraft<ThemeContent>(p, 'theme', id, fn), key ? `${id}:${key}` : undefined);

  const sectionDefs = TOKEN_SECTIONS.find((s) => s.id === section);
  const usage = Object.values(project.presets).filter((p) => p.draft.themeId === id).length;
  const seqUsage = Object.values(project.sequences).filter((s) => s.draft.themeId === id);

  const body = (() => {
    if (section === 'versions') return <VersionsPanel kind="theme" id={id} />;
    if (section === 'effects') return <EffectDefaults theme={theme.draft} onEdit={edit} />;
    const defs = tokensInSection(section);
    const res = resolved.res.filter((r) => defs.some((d) => d.key === r.key));
    return (
      <>
        {sectionDefs && <p className="muted small section-blurb">{sectionDefs.blurb}</p>}
        {section === 'motion' && <Personalities theme={theme.draft} onApply={(name) => edit(`Apply ${PERSONALITIES[name]!.label} motion`, (d) => Object.entries(PERSONALITIES[name]!.tokens).reduce((t, [k, v]) => setToken(t, k, v), d))} />}
        {section === 'layers' && <LayerOrder tokens={resolved.tokens.values} onReorder={(order) => edit('Reorder layers', (d) => order.reduce((t, lid, i) => setToken(t, `layer.${lid}.z`, (i + 1) * 10), d))} />}
        {section === 'sound' && <CueAudition tokens={resolved.tokens.values} />}
        {section === 'assets' && <p className="muted small">Add images and audio in the <button className="link-btn" onClick={() => studio.ui.set({ tab: 'media' })}>Media</button> tab; only files with a redistributable licence are packaged into bundles.</p>}
        <ParamPanel idPrefix="theme" defs={defs} resolutions={res} editLayer="theme" collapseGroups={section === 'sound'}
          onChange={(key, value, coalesce) => edit(`Edit ${TOKEN_DEFS.find((d) => d.key === key)?.label ?? key}`, (d) => setToken(d, key, value), coalesce ? key : undefined)}
          onResetMany={(keys) => edit(keys.length === 1 ? 'Reset to BANGERS default' : `Reset ${keys.length} tokens to BANGERS defaults`, (d) => clearTokens(d, keys))}
          resetAllLabel="Reset section to BANGERS" overriddenOnly={ui.overriddenOnly} onOverriddenOnly={(v) => studio.ui.set({ overriddenOnly: v })} media={media} userFonts={userFonts} />
      </>
    );
  })();

  const effectKey = ui.previewKey;
  return (
    <div className="view split" data-testid="theme-view">
      <div className="editor-col">
        <AssetHeader kind="theme" id={id} onDeleted={() => studio.ui.set({ themeId: Object.keys(project.themes).find((k) => k !== id) ?? null })} onDuplicated={(nid) => studio.ui.set({ themeId: nid })} />
        <DescriptionBox kind="theme" id={id} docOnly />
        <ArtDirection id={id} />
        <div className="meta-row muted small">Used by {usage} preset(s) and {seqUsage.length} sequence(s). {Object.keys(theme.draft.tokens).length} token override(s) · {Object.keys(theme.draft.effectDefaults).length} effect default(s).</div>
        <nav className="chips" aria-label="Theme sections" data-testid="theme-sections">
          {[...TOKEN_SECTIONS, { id: 'effects', label: 'Effect defaults', blurb: '' }, { id: 'versions', label: 'Versions', blurb: '' }].map((s) => {
            const n = s.id === 'effects' ? Object.values(theme.draft.effectDefaults).reduce((a, e) => a + Object.keys(e.params).length + (e.cues ? 1 : 0), 0)
              : s.id === 'versions' ? 0 : tokensInSection(s.id).filter((d) => d.key in theme.draft.tokens).length;
            return <button key={s.id} className={`chip ${section === s.id ? 'active' : ''}`} onClick={() => studio.ui.set({ themeSection: s.id })} data-testid={`section-${s.id}`}>{s.label}{n > 0 && <span className="dot">{n}</span>}</button>;
          })}
        </nav>
        <div className="section-body">{body}</div>
      </div>
      <div className="preview-col">
        <PreviewStage ctrl={ctrl} compiled={compiled} replayKey={JSON.stringify([theme.draft, effectKey])}
          header={
            <div className="stage-head">
              <label>Preview
                <select value={effectKey} onChange={(e) => studio.ui.set({ previewKey: e.target.value, ...(e.target.value.startsWith('effect:') ? { effectType: e.target.value.slice(7) } : {}) })} data-testid="preview-target">
                  <optgroup label="Effects with theme defaults">{EFFECT_LIST.map((e) => <option key={e.type} value={`effect:${e.type}`}>{e.label}</option>)}</optgroup>
                  <optgroup label="Sequences">{seqUsage.map((s) => <option key={s.id} value={`sequence:${s.id}`}>{s.name}</option>)}</optgroup>
                </select>
              </label>
              <div className="seg" role="group" aria-label="Preview source">
                <button className={ui.source === 'draft' ? 'on' : ''} onClick={() => studio.ui.set({ source: 'draft' })} data-testid="source-draft">Draft</button>
                <button className={ui.source === 'approved' ? 'on' : ''} disabled={!theme.approvedVersionId} onClick={() => studio.ui.set({ source: 'approved' })} title={theme.approvedVersionId ? 'Preview the approved version' : 'No approved version yet'} data-testid="source-approved">Approved</button>
              </div>
            </div>
          } />
      </div>
    </div>
  );
}

export function EmptyState({ what }: { what: string }) {
  return <div className="view empty" data-testid={`empty-${what}`}><p>No {what} selected.</p><p className="muted">Pick one from the library, or create a new {what} with ＋.</p></div>;
}

function Personalities({ theme, onApply }: { theme: ThemeContent; onApply(name: string): void }) {
  const { tokens } = themeResolutions(theme);
  const match = Object.entries(PERSONALITIES).find(([, p]) => Object.entries(p.tokens).every(([k, v]) => tokens.values[k] === v))?.[0];
  return (
    <div className="personalities" data-testid="personalities">
      <div className="seg-row">
        {Object.entries(PERSONALITIES).map(([k, p]) => (
          <button key={k} className={`btn small ${match === k ? 'primary' : ''}`} title={p.blurb} onClick={() => onApply(k)} data-testid={`personality-${k}`}>{p.label}</button>
        ))}
        <span className="muted small">{match ? `Matches “${PERSONALITIES[match]!.label}”` : 'Custom'}</span>
      </div>
      <p className="muted small">A personality only fills in the explicit numbers below (easing, overshoot, duration/stagger scale, anticipation). The renderer reads those numbers, never the name.</p>
    </div>
  );
}

function LayerOrder({ tokens, onReorder }: { tokens: Record<string, number | boolean | string>; onReorder(order: string[]): void }) {
  const order = [...LAYERS].map((l, i) => ({ id: l.id, label: l.label, z: tokens[`layer.${l.id}.z`] as number, i })).sort((a, b) => a.z - b.z || a.i - b.i);
  const move = (idx: number, d: -1 | 1) => { const o = order.map((x) => x.id); const j = idx + d; if (j < 0 || j >= o.length) return; [o[idx], o[j]] = [o[j]!, o[idx]!]; onReorder(o); };
  return (
    <div className="layer-order" data-testid="layer-order">
      <h4>Draw order (bottom → top)</h4>
      <ol>
        {order.map((l, i) => (
          <li key={l.id} data-layer={l.id}><span>{l.label}</span><span className="muted small">z {l.z}</span>
            <button className="icon-btn" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`Move ${l.label} down`} data-testid={`layer-down-${l.id}`}>▼</button>
            <button className="icon-btn" disabled={i === order.length - 1} onClick={() => move(i, 1)} aria-label={`Move ${l.label} up`} data-testid={`layer-up-${l.id}`}>▲</button></li>
        ))}
      </ol>
    </div>
  );
}

function CueAudition({ tokens }: { tokens: Record<string, number | boolean | string> }) {
  const studio = useStudio();
  return (
    <div className="cue-audition">
      <h4>Audition</h4>
      <div className="seg-row wrap">
        {CUES.map((c) => (
          <button key={c.id} className="btn small" title={c.description} onClick={() => { void studio.audio?.resume().then(() => studio.audio!.play({ t: 0, kind: 'cue', name: c.id, source: 'sequence', audio: { enabled: tokens[`cue.${c.id}.enabled`] as boolean, asset: tokens[`cue.${c.id}.asset`] as string, gainDb: tokens[`cue.${c.id}.gain`] as number, pitch: tokens[`cue.${c.id}.pitch`] as number } })); }}>♪ {c.id}</button>
        ))}
      </div>
    </div>
  );
}

function EffectDefaults({ theme, onEdit }: { theme: ThemeContent; onEdit(label: string, fn: (d: ThemeContent) => ThemeContent, key?: string): void }) {
  const ui = useUi();
  const studio = useStudio();
  const { media, userFonts } = useMediaLists();
  const type = EFFECTS[ui.effectType] ? ui.effectType : EFFECT_LIST[0]!.type;
  const def = EFFECTS[type]!;
  const { tokens } = useMemo(() => themeResolutions(theme), [theme]);
  const set = theme.effectDefaults[type];
  const res = useMemo(() => resolveParams(def.params, tokens, [{ source: 'theme', overrides: set?.params }]), [def, tokens, set]);
  const cues = resolveCues(def.defaultCues.map((c, i) => ({ id: `default-${i}`, at: c.at, cue: c.cue, gain: 0 })), [{ source: 'theme', set }]);
  const dur = (res.find((r) => r.key === 'duration')!.value as number) * (tokens.values['motion.durationScale'] as number);
  const groups = [...new Set(def.params.map((p) => p.group))];
  void groups;
  return (
    <div data-testid="effect-defaults">
      <p className="muted small section-blurb">Defaults for one effect type in this theme. Presets and sequence clips of this effect inherit these and may override them. Every one of the {def.params.length} parameters is available here.</p>
      <div className="effect-pick" role="tablist" aria-label="Effect type">
        {EFFECT_LIST.map((e) => {
          const n = Object.keys(theme.effectDefaults[e.type]?.params ?? {}).length + (theme.effectDefaults[e.type]?.cues ? 1 : 0);
          return <button key={e.type} role="tab" aria-selected={e.type === type} className={`chip ${e.type === type ? 'active' : ''}`} onClick={() => studio.ui.set({ effectType: e.type, previewKey: `effect:${e.type}` })} data-testid={`effect-${e.type}`}>{e.label}{n > 0 && <span className="dot">{n}</span>}</button>;
        })}
      </div>
      <p className="muted small">{def.description}</p>
      <ParamPanel idPrefix={`fx-${type}`} defs={def.params} resolutions={res} editLayer="theme"
        onChange={(key, value, coalesce) => onEdit(`Edit ${def.label} · ${def.params.find((p) => p.key === key)?.label}`, (d) => updateEffectDefault(d, type, (s) => setOverride(s, key, value)), coalesce ? `${type}.${key}` : undefined)}
        onResetMany={(keys) => onEdit(`Reset ${def.label} defaults`, (d) => updateEffectDefault(d, type, (s) => ({ ...s, params: Object.fromEntries(Object.entries(s.params).filter(([k]) => !keys.includes(k))) })))}
        resetAllLabel="Reset to BANGERS" overriddenOnly={ui.overriddenOnly} onOverriddenOnly={(v) => studio.ui.set({ overriddenOnly: v })} media={media} userFonts={userFonts} />
      <CueEditor idPrefix={`fx-${type}`} duration={dur} markers={cues.markers as CueMarker[]} source={cues.source} inheritedSource="bangers" editLayer="theme"
        onChange={(m, coalesce) => onEdit(`Edit ${def.label} cues`, (d) => updateEffectDefault(d, type, (s) => setOverrideCues(s, m)), coalesce ? `${type}.cues` : undefined)} />
    </div>
  );
}
