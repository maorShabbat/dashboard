import { useEffect, useSyncExternalStore } from 'react';
import { PACKAGE_VERSION, SCHEMA_VERSION } from '../core/version';
import { RedoIcon, UndoIcon } from './components/Icons';
import { Library } from './components/Library';
import { useHistoryInfo, useProject, useStudio, useUi } from './studio';
import type { Tab } from './ui';
import { BundleView } from './views/BundleView';
import { MediaView } from './views/MediaView';
import { PresetView } from './views/PresetView';
import { SequenceView } from './views/SequenceView';
import { SheetView } from './views/SheetView';
import { ThemeView } from './views/ThemeView';

const TABS: { id: Tab; label: string; hint: string }[] = [
  { id: 'theme', label: 'Theme', hint: 'Edit tokens, motion, intensity, layers and per-effect defaults' },
  { id: 'sheet', label: 'Preview sheet', hint: 'Everything about the theme on one page' },
  { id: 'presets', label: 'Presets', hint: 'Reusable effect configurations, linked or snapshot' },
  { id: 'sequences', label: 'Sequences', hint: 'Combine effects on a timeline' },
  { id: 'bundle', label: 'Bundle', hint: 'Export, verify and import portable bundles' },
  { id: 'media', label: 'Media', hint: 'Images, audio and fonts with licences' },
];

export function App() {
  const studio = useStudio();
  const project = useProject();
  const ui = useUi();
  const hist = useHistoryInfo();
  const toasts = useSyncExternalStore(studio.toasts.subscribe, () => studio.toasts.getRevision());
  void toasts;

  // keep selections valid
  useEffect(() => {
    const first = (o: Record<string, unknown>) => Object.keys(o)[0] ?? null;
    const patch: Partial<typeof ui> = {};
    if (!ui.themeId || !project.themes[ui.themeId]) patch.themeId = first(project.themes);
    if (ui.presetId && !project.presets[ui.presetId]) patch.presetId = null;
    if (ui.sequenceId && !project.sequences[ui.sequenceId]) patch.sequenceId = null;
    if (Object.keys(patch).length) studio.ui.set(patch);
  });
  useEffect(() => {
    // pick sensible defaults when a view opens without a selection
    const t = ui.themeId;
    if (ui.tab === 'presets' && !ui.presetId) { const p = Object.values(project.presets).find((x) => x.draft.themeId === t) ?? Object.values(project.presets)[0]; if (p) studio.ui.set({ presetId: p.id }); }
    if (ui.tab === 'sequences' && !ui.sequenceId) { const s = Object.values(project.sequences).find((x) => x.draft.themeId === t) ?? Object.values(project.sequences)[0]; if (s) studio.ui.set({ sequenceId: s.id }); }
  }, [ui.tab, ui.themeId, ui.presetId, ui.sequenceId, project.presets, project.sequences, studio.ui]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      const typing = el.tagName === 'INPUT' && !['range', 'checkbox', 'radio'].includes((el as HTMLInputElement).type) || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'z' && !typing) { e.preventDefault(); if (e.shiftKey) studio.store.redo(); else studio.store.undo(); }
      else if (mod && e.key.toLowerCase() === 'y' && !typing) { e.preventDefault(); studio.store.redo(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [studio.store]);

  useSyncExternalStore(studio.saveStatus.subscribe, studio.saveStatus.getRevision);
  const status = studio.saveStatus.value;

  return (
    <div className="app" data-testid="app">
      <header className="topbar">
        <div className="brand"><span className="logo" aria-hidden>★</span><b>BANGERS</b><span>Theme Studio</span></div>
        <nav className="tabs" role="tablist" aria-label="Workspace">
          {TABS.map((t) => <button key={t.id} role="tab" aria-selected={ui.tab === t.id} className={ui.tab === t.id ? 'on' : ''} title={t.hint} onClick={() => studio.ui.set({ tab: t.id })} data-testid={`tab-${t.id}`}>{t.label}</button>)}
        </nav>
        <div className="top-actions">
          <button className="btn icon" onClick={() => studio.store.undo()} disabled={!hist.canUndo} title={hist.undoLabel ? `Undo: ${hist.undoLabel} (Ctrl+Z)` : 'Nothing to undo'} aria-label="Undo" data-testid="undo"><UndoIcon /></button>
          <button className="btn icon" onClick={() => studio.store.redo()} disabled={!hist.canRedo} title={hist.redoLabel ? `Redo: ${hist.redoLabel} (Ctrl+Shift+Z)` : 'Nothing to redo'} aria-label="Redo" data-testid="redo"><RedoIcon /></button>
          <details className="history-menu">
            <summary title="Recent changes" data-testid="history-toggle">History <span className="pill">{hist.depth}</span></summary>
            <ol data-testid="history-list">{studio.store.recent(14).map((l, i) => <li key={i} className={i === 0 ? 'latest' : ''}>{l}</li>)}{!hist.depth && <li className="muted">No changes yet</li>}</ol>
            <button className="btn small" disabled={!hist.canUndo} onClick={() => studio.store.undo()}>Undo last</button>
          </details>
          <span className={`save-status ${status}`} data-testid="save-status" title="Changes are saved in this browser (IndexedDB)">{status === 'saving' ? 'Saving…' : status === 'error' ? 'Not saved!' : status === 'saved' ? 'Saved' : ''}</span>
        </div>
      </header>
      <div className="body">
        <Library />
        <main className="main" data-testid="main">
          {ui.tab === 'theme' && <ThemeView />}
          {ui.tab === 'sheet' && <SheetView />}
          {ui.tab === 'presets' && <PresetView />}
          {ui.tab === 'sequences' && <SequenceView />}
          {ui.tab === 'bundle' && <BundleView />}
          {ui.tab === 'media' && <MediaView />}
        </main>
      </div>
      <footer className="foot muted small">Studio {PACKAGE_VERSION} · data schema v{SCHEMA_VERSION} · themes, presets and sequences are saved locally; export a bundle to ship.</footer>
      <Toasts />
    </div>
  );
}

function Toasts() {
  const studio = useStudio();
  useSyncExternalStore(studio.toasts.subscribe, studio.toasts.getRevision);
  return (
    <div className="toasts" aria-live="polite" data-testid="toasts">
      {studio.toasts.items.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`} role="status" onClick={() => studio.toasts.dismiss(t.id)}>
          <div>{t.text}</div>
          {t.details && <ul>{t.details.map((d, i) => <li key={i}>{d}</li>)}</ul>}
        </div>
      ))}
    </div>
  );
}
