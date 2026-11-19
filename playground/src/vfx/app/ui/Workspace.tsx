import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { categoryDef, presetRef, type CategoryId } from '../../model/preset';
import { sceneFonts } from '../../model/scene';
import { BACKDROPS, makeBackdrop, type BackdropId } from '../backdrops';
import { effectById } from '../../fx';
import { PreviewController } from '../controller';
import { QUALITY_OPTIONS, isQualitySetting } from '../../engine/quality';
import { installTestApi } from '../testApi';
import { ContentPanel } from './ContentPanel';
import { EffectsPanel } from './EffectsPanel';
import { ExportPanel } from './ExportPanel';
import { LookPanel } from './LookPanel';
import { MotionPanel } from './MotionPanel';
import { useServices, useStore } from './services';
import { Btn, Select, cx } from './widgets';

const SPEEDS: { value: string; label: string }[] = [{ value: '0.1', label: '0.1×' }, { value: '0.25', label: '0.25×' }, { value: '0.5', label: '0.5×' }, { value: '1', label: '1×' }, { value: '2', label: '2×' }];
const backdropMemory = new Map<CategoryId, BackdropId>();

function Transport({ c }: { c: PreviewController }) {
  useSyncExternalStore(c.subscribe, c.snapshot);
  const D = c.duration;
  return (
    <div className="transport" data-testid="transport">
      <Btn primary onClick={() => c.toggle()} testId="play">{c.playing ? '❚❚ Pause' : c.time >= D - 1e-3 ? '↻ Play again' : '▶ Play'}</Btn>
      <Btn onClick={() => c.restart()} testId="restart" title="Replay from the start">⟲ Replay</Btn>
      <Btn small ghost onClick={() => { c.pause(); c.seek(c.time - 1 / 60); }} title="Back one frame" testId="step-back">‹</Btn>
      <Btn small ghost onClick={() => { c.pause(); c.seek(c.time + 1 / 60); }} title="Forward one frame" testId="step-fwd">›</Btn>
      <div className="scrub"><input type="range" min={0} max={Math.max(0.01, D)} step={0.001} value={Math.min(c.time, D)} onChange={(e) => c.seek(Number(e.target.value))} aria-label="Time" data-testid="scrub" /></div>
      <span className="time" data-testid="time">{Math.min(c.time, D).toFixed(2)} / {D.toFixed(2)} s</span>
      <Select value={String(c.rate)} options={SPEEDS} onChange={(v) => c.setRate(Number(v))} testId="speed" label="Speed" />
      <label className="toggle"><input type="checkbox" checked={c.loop} onChange={(e) => c.setLoop(e.target.checked)} data-testid="loop" /> Loop</label>
      <Select value={c.quality} options={QUALITY_OPTIONS.map((o) => (o.value === 'auto' && c.quality === 'auto' ? { ...o, label: `Automatic: now ${c.tier}` } : o))} onChange={(v) => { c.setQuality(v); try { localStorage.setItem('vfx.quality', v); } catch { /* storage is optional */ } }} testId="quality" label="Quality" />
    </div>
  );
}

export function Workspace({ onBack }: { onBack: () => void }) {
  const store = useStore();
  const services = useServices();
  const { fonts, images, barnUrl } = services;
  const doc = store.doc!;
  const canvas = useRef<HTMLCanvasElement>(null);
  const [controller, setController] = useState<PreviewController | null>(null);
  const [tab, setTab] = useState<'content' | 'look' | 'motion' | 'effects' | 'export'>('content');
  const [backdrop, setBackdrop] = useState<BackdropId>(backdropMemory.get(doc.category) ?? (categoryDef(doc.category).backdrop as BackdropId));
  const loadedBase = useRef<unknown>(null);

  useEffect(() => {
    const cv = canvas.current!;
    const c = new PreviewController(cv, { fonts, images });
    try { const saved = localStorage.getItem('vfx.quality'); if (isQualitySetting(saved) && saved !== 'high') c.setQuality(saved); } catch { /* storage is optional */ }
    installTestApi(c, fonts, images, services.store);
    setController(c);
    return () => { c.dispose(); setController(null); loadedBase.current = null; };
  }, [fonts, images, services.store]);

  useEffect(() => {
    if (!controller) return;
    const first = loadedBase.current !== doc.base;
    loadedBase.current = doc.base;
    void controller.setScene(doc.scene, { reload: first }).then(() => { if (first) controller.restart(); });
  }, [controller, doc.rev, doc.base, doc.scene]);

  const transition = useMemo(() => doc.scene.fx.some((l) => effectById(l.effect)?.transition), [doc.scene.fx]);
  const screenA = (transition ? (doc.scene.screens?.from as BackdropId | undefined) : undefined) ?? backdrop;
  const screenB = (doc.scene.screens?.to as BackdropId | undefined) ?? 'daylight';
  const setScreen = (which: 'from' | 'to', v: BackdropId) => store.edit((sc) => { sc.screens = { ...sc.screens, from: sc.screens?.from ?? screenA, to: sc.screens?.to ?? screenB, [which]: v }; });

  useEffect(() => {
    if (!controller) return;
    let dead = false;
    void makeBackdrop(screenA, barnUrl).then((src) => { if (!dead) controller.setBackdrop(src); });
    if (!transition) backdropMemory.set(doc.category, backdrop);
    return () => { dead = true; };
  }, [controller, screenA, backdrop, transition, barnUrl, doc.category]);

  useEffect(() => {
    if (!controller || !transition) return;
    let dead = false;
    void makeBackdrop(screenB, barnUrl).then((src) => { if (!dead) controller.setBackdropTo(src); });
    return () => { dead = true; };
  }, [controller, screenB, transition, barnUrl]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest('input, textarea, select, [contenteditable]')) return;
      if (e.key === ' ' && controller) { e.preventDefault(); controller.toggle(); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) store.redo(); else store.undo(); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); store.redo(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [controller, store]);

  // select an element that exists
  useEffect(() => { if (doc.selected && !doc.scene.elements.some((e) => e.id === doc.selected)) store.select(doc.scene.elements[0]?.id ?? null); }, [doc.scene, doc.selected, store]);

  const status = controller?.status ?? 'loading';
  const report = controller?.report;
  const fontSpecs = useMemo(() => sceneFonts(doc.scene), [doc.scene]);
  useSyncExternalStore(controller?.subscribe ?? (() => () => undefined), controller?.snapshot ?? (() => 0));
  const cat = categoryDef(doc.category);

  return (
    <div className="work" data-testid="workspace">
      <div className="stage-col">
        <div className="crumbs">
          <Btn small onClick={onBack} testId="back">← {cat.name}</Btn>
          <input value={doc.name} onChange={(e) => store.rename(e.target.value)} aria-label="Preset name" data-testid="doc-name" />
          <span className="badge" data-testid="doc-ref">{presetRef(store.currentPreset()!)}</span>
          {store.isModified() && <span className="badge" style={{ background: '#4a3a22', color: '#e8c58b' }} data-testid="doc-modified">changed</span>}
          <Btn small ghost onClick={() => store.undo()} disabled={!doc.history.length} title="Undo (Ctrl+Z)" testId="undo">↶</Btn>
          <Btn small ghost onClick={() => store.redo()} disabled={!doc.future.length} title="Redo (Ctrl+Y)" testId="redo">↷</Btn>
        </div>
        <div className="stage-wrap" data-testid="stage" style={{ aspectRatio: String(doc.scene.aspect) }}>
          <canvas ref={canvas} data-testid="stage-canvas" aria-label="Effect preview" />
          <div className="stage-msg">
            {status === 'loading' && <div className="load" data-testid="msg-loading">Loading {fontSpecs.length ? 'fonts and ' : ''}pictures…</div>}
            {report?.errors.map((e, i) => (
              <div key={i} data-testid="msg-error" role="alert">
                <b>{e.name}:</b> {e.message}{' '}
                {/font/i.test(e.message) && <Btn small onClick={() => { void Promise.all(fontSpecs.map((s) => fonts.status(s).state === 'error' ? fonts.retry(s).catch(() => undefined) : undefined)).then(() => controller?.setScene(doc.scene, { reload: true })); }}>Retry</Btn>}
              </div>
            ))}
            {report?.warnings.map((w, i) => <div key={i} className="warn" data-testid="msg-warning">{w}</div>)}
          </div>
        </div>
        {controller && <Transport c={controller} />}
        <div className="row wrap">
          <Select label={transition ? 'First screen' : 'Behind the effect'} value={screenA} options={BACKDROPS.map((b) => ({ value: b.id, label: b.name }))} onChange={(v) => (transition ? setScreen('from', v) : setBackdrop(v))} testId="backdrop" />
          {transition && <Select label="Next screen" value={screenB} options={BACKDROPS.filter((b) => b.id !== 'none').map((b) => ({ value: b.id, label: b.name }))} onChange={(v) => setScreen('to', v)} testId="backdrop-to" />}
          <span className="hint" style={{ color: 'var(--muted)', flex: 1, minWidth: 220 }}>{transition ? 'Two stand-in pictures for the two screens the transition goes between. They are never part of the export: in your game the transition runs between your own screens.' : backdrop === 'none' ? 'Transparent: the checkerboard shows through. Screen distortions then bend only the effect itself.' : 'A stand-in picture so distortions and impacts have something to bend. It is never part of the export.'}</span>
        </div>
        <div style={{ color: 'var(--muted)', maxWidth: '80ch' }}>{doc.description}</div>
      </div>

      <div className="panel">
        <div className="tabs" role="tablist">
          {([['content', 'Content'], ['look', 'Look'], ['motion', 'Motion'], ['effects', 'Effects'], ['export', 'Save & export']] as const).map(([k, label]) => (
            <button key={k} type="button" role="tab" className="tab" aria-selected={tab === k} data-testid={`tab-${k}`} onClick={() => setTab(k)}>{label}</button>
          ))}
        </div>
        {tab === 'content' && <ContentPanel />}
        {tab === 'look' && <LookPanel />}
        {tab === 'motion' && <MotionPanel />}
        {tab === 'effects' && <EffectsPanel controller={controller} />}
        {tab === 'export' && <ExportPanel controller={controller} onOpenPreset={(id, v) => { const p = store.findPreset(id, v); if (p) store.open(p); }} />}
      </div>
    </div>
  );
}
void cx;
