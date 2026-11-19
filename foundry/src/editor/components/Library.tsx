import { useRef, useState } from 'react';
import { EFFECT_LIST, EFFECTS } from '../../core/effects/registry';
import { emptySequenceContent, emptyThemeContent } from '../../core/model/defaults';
import { importThemePackage } from '../../core/model/exchange';
import { createAsset, createPreset, createTheme, toggleFavourite } from '../../core/model/ops';
import type { LibraryAsset } from '../../core/model/types';
import { dirtyBadge } from './AssetChrome';
import { useCommit, useProject, useStudio, useUi } from '../studio';
import type { Tab } from '../ui';

function matches(a: LibraryAsset<unknown>, q: string, favOnly: boolean): boolean {
  if (favOnly && !a.favourite) return false;
  return !q || `${a.name} ${a.description} ${a.tags.join(' ')}`.toLowerCase().includes(q.toLowerCase());
}

export function Library() {
  const project = useProject();
  const ui = useUi();
  const studio = useStudio();
  const commit = useCommit();
  const fileRef = useRef<HTMLInputElement>(null);
  const [newPreset, setNewPreset] = useState(false);
  const [presetType, setPresetType] = useState('coinBurst');
  const [presetName, setPresetName] = useState('');

  const themes = Object.values(project.themes).filter((a) => matches(a, ui.libraryFilter, ui.favouritesOnly)).sort((a, b) => Number(b.favourite) - Number(a.favourite) || a.name.localeCompare(b.name));
  const theme = ui.themeId ? project.themes[ui.themeId] : undefined;
  const presets = Object.values(project.presets)
    .filter((a) => ui.showAllPresets || a.draft.themeId === ui.themeId || a.draft.link === 'snapshot')
    .filter((a) => matches(a, ui.libraryFilter, ui.favouritesOnly)).sort((a, b) => Number(b.favourite) - Number(a.favourite) || a.name.localeCompare(b.name));
  const sequences = Object.values(project.sequences).filter((a) => ui.showAllPresets || a.draft.themeId === ui.themeId).filter((a) => matches(a, ui.libraryFilter, ui.favouritesOnly)).sort((a, b) => Number(b.favourite) - Number(a.favourite) || a.name.localeCompare(b.name));

  const open = (tab: Tab, patch: Parameters<typeof studio.ui.set>[0]) => studio.ui.set({ tab, ...patch });
  const star = (kind: 'theme' | 'preset' | 'sequence', a: LibraryAsset<unknown>) => (
    <button className={`icon-btn star ${a.favourite ? 'on' : ''}`} aria-label={a.favourite ? 'Unfavourite' : 'Favourite'} aria-pressed={a.favourite} data-testid={`fav-${a.id}`}
      onClick={(e) => { e.stopPropagation(); commit('Toggle favourite', (p) => toggleFavourite(p, kind, a.id)); }}>
      {a.favourite ? '★' : '☆'}
    </button>
  );

  const importFile = async (f: File) => {
    try {
      const json = JSON.parse(await f.text());
      const r = importThemePackage(project, json);
      for (const bytes of r.blobs.values()) await studio.blobs.put(bytes);
      commit('Import theme', () => r.project);
      studio.ui.set({ themeId: r.themeId, tab: 'theme' });
      studio.toasts.push(`Imported “${r.project.themes[r.themeId]!.name}” as a new theme`, r.warnings.length ? 'warn' : 'ok', r.warnings);
    } catch (e) { studio.toasts.push(`Could not import: ${(e as Error).message}`, 'error'); }
  };

  return (
    <aside className="library" data-testid="library">
      <div className="lib-search">
        <input placeholder="Search library…" value={ui.libraryFilter} onChange={(e) => studio.ui.set({ libraryFilter: e.target.value })} aria-label="Search library" />
        <button className={`icon-btn star ${ui.favouritesOnly ? 'on' : ''}`} title="Favourites only" aria-pressed={ui.favouritesOnly} onClick={() => studio.ui.set({ favouritesOnly: !ui.favouritesOnly })} data-testid="fav-filter">{ui.favouritesOnly ? '★' : '☆'}</button>
      </div>

      <section>
        <h3>Themes <span className="count">{themes.length}</span>
          <button className="icon-btn" title="New theme from BANGERS defaults" aria-label="New theme" data-testid="new-theme" onClick={() => {
            let id = ''; commit('Create theme', (p) => { const r = createTheme(p, 'New theme', emptyThemeContent()); id = r.id; return r.project; }); open('theme', { themeId: id });
          }}>＋</button>
          <button className="icon-btn" title="Import a theme file (.bangers-theme.json)" aria-label="Import theme" data-testid="import-theme" onClick={() => fileRef.current?.click()}>⤒</button>
          <input ref={fileRef} type="file" accept=".json,application/json" hidden data-testid="import-theme-input" onChange={(e) => { const f = e.target.files?.[0]; if (f) void importFile(f); e.target.value = ''; }} />
        </h3>
        <ul className="lib-list" data-testid="theme-list">
          {themes.map((a) => (
            <li key={a.id} className={a.id === ui.themeId ? 'active' : ''} data-testid={`theme-item-${a.id}`}>
              {star('theme', a)}
              <button className="lib-name" onClick={() => open(ui.tab === 'presets' || ui.tab === 'sequences' || ui.tab === 'sheet' || ui.tab === 'bundle' ? ui.tab : 'theme', { themeId: a.id, presetId: null, sequenceId: null, previewKey: `effect:${ui.effectType}` })}>
                <span className="n">{a.name}</span>{dirtyBadge(a)}
              </button>
            </li>
          ))}
          {!themes.length && <li className="muted">No themes match.</li>}
        </ul>
      </section>

      <section>
        <h3>Effect presets <span className="count">{presets.length}</span>
          <button className="icon-btn" title="New preset" aria-label="New preset" data-testid="new-preset" onClick={() => setNewPreset(!newPreset)} disabled={!theme}>＋</button></h3>
        {newPreset && theme && (
          <form className="mini-form" onSubmit={(e) => {
            e.preventDefault();
            let id = '';
            commit('Create preset', (p) => { const r = createPreset(p, { name: presetName.trim() || `${EFFECTS[presetType]!.label} preset`, effectType: presetType, themeId: theme.id }); id = r.id; return r.project; });
            setNewPreset(false); setPresetName(''); open('presets', { presetId: id });
          }}>
            <select value={presetType} onChange={(e) => setPresetType(e.target.value)} aria-label="Effect type" data-testid="new-preset-type">{EFFECT_LIST.map((e) => <option key={e.type} value={e.type}>{e.label}</option>)}</select>
            <input placeholder="Name" value={presetName} onChange={(e) => setPresetName(e.target.value)} aria-label="Preset name" data-testid="new-preset-name" />
            <button className="btn small primary" type="submit" data-testid="new-preset-create">Create</button>
          </form>
        )}
        <ul className="lib-list" data-testid="preset-list">
          {presets.map((a) => (
            <li key={a.id} className={a.id === ui.presetId && ui.tab === 'presets' ? 'active' : ''} data-testid={`preset-item-${a.id}`}>
              {star('preset', a)}
              <button className="lib-name" onClick={() => open('presets', { presetId: a.id })}>
                <span className="n">{a.name}</span>
                <span className="muted small">{EFFECTS[a.draft.effectType]?.label}</span>
                {a.draft.link === 'snapshot' && <span className="pill snap" title="Independent snapshot: does not follow theme edits">snapshot</span>}
              </button>
            </li>
          ))}
          {!presets.length && <li className="muted">No presets yet.</li>}
        </ul>
      </section>

      <section>
        <h3>Sequences <span className="count">{sequences.length}</span>
          <button className="icon-btn" title="New sequence" aria-label="New sequence" data-testid="new-sequence" disabled={!theme} onClick={() => {
            if (!theme) return; let id = '';
            commit('Create sequence', (p) => { const r = createAsset(p, 'sequence', 'New sequence', emptySequenceContent(theme.id)); id = r.id; return r.project; });
            open('sequences', { sequenceId: id, selectedClipIds: [], selectedMarkerId: null });
          }}>＋</button></h3>
        <ul className="lib-list" data-testid="sequence-list">
          {sequences.map((a) => (
            <li key={a.id} className={a.id === ui.sequenceId && ui.tab === 'sequences' ? 'active' : ''} data-testid={`sequence-item-${a.id}`}>
              {star('sequence', a)}
              <button className="lib-name" onClick={() => open('sequences', { sequenceId: a.id, selectedClipIds: [], selectedMarkerId: null })}><span className="n">{a.name}</span>{dirtyBadge(a)}</button>
            </li>
          ))}
          {!sequences.length && <li className="muted">No sequences yet.</li>}
        </ul>
      </section>
      <label className="check small"><input type="checkbox" checked={ui.showAllPresets} onChange={(e) => studio.ui.set({ showAllPresets: e.target.checked })} /> Show assets of all themes</label>
    </aside>
  );
}
