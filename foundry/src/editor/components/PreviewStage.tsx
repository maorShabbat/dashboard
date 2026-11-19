import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { BOARD_PRESETS, VIEWPORT_PRESETS, WIN_PATTERNS, defaultSceneSpec, viewportPreset } from '../../core/board';
import type { CompiledSequence } from '../../core/engine';
import { LAYERS } from '../../core/tokens';
import type { SceneSpec } from '../../core/model/types';
import { userFontStacks } from '../fonts';
import type { PlayerController } from '../playerController';
import { PauseIcon, PlayIcon, ReplayIcon, StopIcon } from './Icons';
import { useKey, useMediaVersion, useProject, useStudio, useUi } from '../studio';

export function sceneFromUi(ui: ReturnType<typeof useUi>): SceneSpec {
  return { cols: ui.cols, rows: ui.rows, pattern: ui.pattern, seed: ui.seed, winAmount: ui.winAmount, bet: 1, multiplier: 2 };
}

export function fmtTime(ms: number): string { return `${(ms / 1000).toFixed(2)}s`; }

/** Re-render at most ~15×/s while the player is running (for readouts only; the canvas itself is painted by the player). */
export function usePlayerClock(ctrl: PlayerController): { time: number; playing: boolean; duration: number } {
  useSyncExternalStore(ctrl.subscribe, () => `${ctrl.playing}|${ctrl.duration}|${ctrl.events.length}`);
  const [, setTick] = useState(0);
  useEffect(() => {
    let last = 0;
    return ctrl.onFrame(() => { const n = performance.now(); if (n - last > 66) { last = n; setTick((x) => x + 1); } });
  }, [ctrl]);
  return { time: ctrl.time, playing: ctrl.playing, duration: ctrl.duration };
}

interface Props {
  ctrl: PlayerController;
  compiled: CompiledSequence | null;
  /** Show board/pattern/amount controls (theme & preset views). Sequences own their scene. */
  sceneControls?: boolean;
  header?: ReactNode;
  footer?: ReactNode;
  showEvents?: boolean;
  /** Smaller canvas and collapsed options: used where the timeline needs the room. */
  compact?: boolean;
  /** Called whenever an edit should trigger a replay (auto-replay). */
  replayKey?: string;
}

export function PreviewStage({ ctrl, compiled, sceneControls = true, header, footer, showEvents = true, replayKey, compact = false }: Props) {
  const studio = useStudio();
  const project = useProject();
  const ui = useUi();
  const mediaVersion = useMediaVersion();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scrubRef = useRef<HTMLInputElement>(null);
  const { time, playing, duration } = usePlayerClock(ctrl);
  const vp = viewportPreset(ui.viewportId);

  useEffect(() => { ctrl.attach(canvasRef.current); return () => ctrl.attach(null); }, [ctrl]);
  useKey((e) => {
    const el = e.target as HTMLElement;
    if (el.tagName === 'INPUT' && !['range', 'checkbox', 'radio'].includes((el as HTMLInputElement).type)) return;
    if (el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || e.metaKey || e.ctrlKey) return;
    if (e.key === ' ' && el.tagName !== 'BUTTON') { e.preventDefault(); ctrl.toggle(); }
    else if (e.key.toLowerCase() === 'r') ctrl.replay();
  });
  useEffect(() => ctrl.onFrame((t) => { if (scrubRef.current && document.activeElement !== scrubRef.current) scrubRef.current.value = String(Math.round(t)); }), [ctrl]);

  useEffect(() => {
    if (!compiled) return;
    ctrl.configure({
      sequence: compiled, viewport: { w: vp.w, h: vp.h }, assets: studio.media, painterAssets: studio.media, fontStacks: userFontStacks(project),
      layerOverrides: ui.layerOverrides, reducedMotion: ui.reducedMotion, loop: ui.loop, speed: ui.speed, audio: studio.audio, soundOn: ui.soundOn,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctrl, compiled, vp.w, vp.h, ui.layerOverrides, ui.reducedMotion, ui.loop, ui.speed, ui.soundOn, mediaVersion, project.fonts]);

  // auto replay after edits (debounced)
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; if (compiled && !ctrl.playing && ctrl.time === 0) setTimeout(() => { if (!ctrl.playing && ctrl.time === 0) ctrl.replay(); }, 60); return; } // never override a pause/scrub made in the meantime
    if (!ui.autoReplay || replayKey === undefined) return;
    const h = setTimeout(() => ctrl.replay(), 250);
    return () => clearTimeout(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [replayKey, ui.autoReplay]);

  const boardId = BOARD_PRESETS.find((b) => b.cols === ui.cols && b.rows === ui.rows)?.id ?? 'custom';
  const cell = useMemo(() => ctrl.player?.frame?.cell, [ctrl, time]);

  return (
    <section className={`stage ${compact ? 'compact' : ''}`} data-testid="preview-stage">
      {header}
      <div className="stage-canvas-wrap" style={{ aspectRatio: `${vp.w} / ${vp.h}`, ['--ar' as string]: vp.w / vp.h }}>
        <canvas ref={canvasRef} className="stage-canvas" data-testid="preview-canvas" aria-label="Effect preview" />
      </div>
      <div className="transport">
        <button className="btn icon" onClick={() => ctrl.replay()} title="Replay from start (R)" aria-label="Replay" data-testid="btn-replay"><ReplayIcon /></button>
        <button className="btn icon primary" onClick={() => ctrl.toggle()} title="Play / pause (Space)" aria-label={playing ? 'Pause' : 'Play'} data-testid="btn-play" data-playing={playing}>{playing ? <PauseIcon /> : <PlayIcon />}</button>
        <button className="btn icon" onClick={() => ctrl.stop()} title="Stop and rewind" aria-label="Stop"><StopIcon /></button>
        <input ref={scrubRef} className="scrub" type="range" min={0} max={Math.max(1, Math.round(duration))} step={1} defaultValue={0}
          onInput={(e) => { ctrl.pause(); ctrl.seek(Number((e.target as HTMLInputElement).value)); }} aria-label="Scrub timeline" data-testid="scrub" />
        <span className="timecode" data-testid="timecode">{fmtTime(time)} / {fmtTime(duration)}</span>
      </div>
      <Opts compact={compact}>
      <div className="stage-options">
        <label className="check"><input type="checkbox" checked={ui.loop} onChange={(e) => studio.ui.set({ loop: e.target.checked })} /> Loop</label>
        <label className="check"><input type="checkbox" checked={ui.autoReplay} onChange={(e) => studio.ui.set({ autoReplay: e.target.checked })} /> Replay on edit</label>
        <label className="check" title="Applies the theme's reduced-motion scale to shake, flash, motion and particles"><input type="checkbox" checked={ui.reducedMotion} onChange={(e) => studio.ui.set({ reducedMotion: e.target.checked })} /> Reduced motion</label>
        <label className="check" title="Audition sound cues (uses the theme's audio assets or a built-in blip)"><input type="checkbox" checked={ui.soundOn} onChange={(e) => { studio.ui.set({ soundOn: e.target.checked }); if (e.target.checked) void studio.audio?.resume(); }} data-testid="sound-toggle" /> Sound</label>
        <label>Speed <select value={ui.speed} onChange={(e) => studio.ui.set({ speed: Number(e.target.value) })}>{[0.25, 0.5, 1, 2].map((s) => <option key={s} value={s}>{s}×</option>)}</select></label>
        <label>Viewport <select value={ui.viewportId} onChange={(e) => studio.ui.set({ viewportId: e.target.value })} data-testid="viewport-select">{VIEWPORT_PRESETS.map((v) => <option key={v.id} value={v.id}>{v.label} ({v.w}×{v.h})</option>)}</select></label>
        {cell !== undefined && <span className="muted" data-testid="cell-size" title="Board cell edge in pixels. All “% cell” parameters scale with it.">cell {cell.toFixed(0)} px</span>}
      </div>
      {sceneControls && (
        <div className="stage-options scene">
          <label>Board <select value={boardId} onChange={(e) => { const b = BOARD_PRESETS.find((x) => x.id === e.target.value); if (b) studio.ui.set({ cols: b.cols, rows: b.rows }); }} data-testid="board-select">
            {BOARD_PRESETS.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}{boardId === 'custom' && <option value="custom">Custom {ui.cols}×{ui.rows}</option>}
          </select></label>
          <label>Cols <input type="number" min={1} max={12} value={ui.cols} onChange={(e) => studio.ui.set({ cols: Math.min(12, Math.max(1, Number(e.target.value) || 1)) })} /></label>
          <label>Rows <input type="number" min={1} max={12} value={ui.rows} onChange={(e) => studio.ui.set({ rows: Math.min(12, Math.max(1, Number(e.target.value) || 1)) })} /></label>
          <label>Win <select value={ui.pattern} onChange={(e) => studio.ui.set({ pattern: e.target.value as typeof ui.pattern })}>{WIN_PATTERNS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
          <label>Seed <input type="number" min={0} max={99999} value={ui.seed} onChange={(e) => studio.ui.set({ seed: Math.min(99999, Math.max(0, Number(e.target.value) || 0)) })} /></label>
          <button className="icon-btn reset" title="Reset board, win pattern, seed and amount to defaults" aria-label="Reset scene" data-testid="scene-reset" disabled={JSON.stringify(sceneFromUi(ui)) === JSON.stringify({ ...defaultSceneSpec(), bet: 1, multiplier: 2 })} onClick={() => { const d = defaultSceneSpec(); studio.ui.set({ cols: d.cols, rows: d.rows, pattern: d.pattern, seed: d.seed, winAmount: d.winAmount }); }}>⟲</button>
          <label>Amount <input style={{ width: 96 }} type="number" min={0} step={10} value={ui.winAmount} onChange={(e) => studio.ui.set({ winAmount: Math.max(0, Number(e.target.value) || 0) })} /></label>
        </div>
      )}
      </Opts>
      <LayerControls />
      {compiled && compiled.warnings.length > 0 && <ul className="warn-list">{compiled.warnings.map((w) => <li key={w}>{w}</li>)}</ul>}
      {showEvents && <EventLog ctrl={ctrl} compact={compact} />}
      {footer}
    </section>
  );
}

function Opts({ compact, children }: { compact: boolean; children: ReactNode }) {
  return compact ? <details className="stage-opts-details"><summary>Playback &amp; viewport options</summary>{children}</details> : <>{children}</>;
}

function LayerControls() {
  const studio = useStudio();
  const ui = useUi();
  const set = (id: string, patch: { visible?: boolean; solo?: boolean; opacity?: number }) => studio.ui.set({ layerOverrides: { ...ui.layerOverrides, [id]: { ...ui.layerOverrides[id], ...patch } } });
  const anyOverride = Object.values(ui.layerOverrides).some((o) => o && (o.visible === false || o.solo || (o.opacity ?? 1) !== 1));
  return (
    <details className="layers" data-testid="layer-controls">
      <summary>Layers {anyOverride && <span className="pill over">preview override</span>}</summary>
      <p className="muted small">Preview-only: eye, solo and opacity do not change the theme. Persisted layer order, opacity and blend live in the theme's Layers section.</p>
      <ul>
        {[...LAYERS].reverse().map((l) => {
          const o = ui.layerOverrides[l.id] ?? {};
          return (
            <li key={l.id} data-layer={l.id}>
              <button className={`icon-btn ${o.visible === false ? '' : 'on'}`} onClick={() => set(l.id, { visible: o.visible === false })} title={o.visible === false ? 'Show layer' : 'Hide layer'} aria-label={`Toggle ${l.label}`} data-testid={`layer-eye-${l.id}`}>{o.visible === false ? '◌' : '◉'}</button>
              <button className={`icon-btn ${o.solo ? 'on' : ''}`} onClick={() => set(l.id, { solo: !o.solo })} title="Solo layer" aria-label={`Solo ${l.label}`} data-testid={`layer-solo-${l.id}`}>S</button>
              <span className="layer-name">{l.label}</span>
              <input type="range" min={0} max={100} value={Math.round((o.opacity ?? 1) * 100)} onChange={(e) => set(l.id, { opacity: Number(e.target.value) / 100 })} aria-label={`${l.label} opacity`} />
            </li>
          );
        })}
      </ul>
      {anyOverride && <button className="btn small" onClick={() => studio.ui.set({ layerOverrides: {} })}>Clear preview overrides</button>}
    </details>
  );
}

function EventLog({ ctrl, compact }: { ctrl: PlayerController; compact: boolean }) {
  const { events } = ctrl;
  return (
    <details className="event-log" open={!compact && events.length > 0}>
      <summary>Cues &amp; events fired <span className="pill">{events.length}</span></summary>
      <ul data-testid="event-log">
        {events.slice(-40).map((e, i) => <li key={i} className={`ev-${e.kind}`}><span className="t">{(e.t / 1000).toFixed(2)}s</span><span className="k">{e.kind}</span><span>{e.name}</span></li>)}
        {!events.length && <li className="muted">Play to see markers fire.</li>}
      </ul>
    </details>
  );
}
