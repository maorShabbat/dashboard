import { useRef } from 'react';
import { CUES, type CueMarker } from '../../core/cues';
import { SOURCE_LABEL, type Source } from '../../core/resolve';
import { newId } from '../../core/util/ids';
import { useStudio, useUi } from '../studio';

interface Props {
  /** Effective effect duration in ms (the strip's extent). */
  duration: number;
  markers: CueMarker[];
  /** Where the current markers come from. */
  source: Source;
  editLayer: 'theme' | 'preset' | 'instance';
  inheritedSource: Source;
  /** Replace the markers at this level; undefined removes the override and re-inherits. */
  onChange(markers: CueMarker[] | undefined, coalesce: boolean): void;
  idPrefix: string;
}

export function CueEditor({ duration, markers, source, editLayer, inheritedSource, onChange, idPrefix }: Props) {
  const studio = useStudio();
  const ui = useUi();
  const strip = useRef<HTMLDivElement>(null);
  const here = source === editLayer;
  const dur = Math.max(1, duration);
  const audition = (m: CueMarker) => {
    if (!studio.audio) return;
    void studio.audio.resume().then(() => studio.audio!.play({ t: 0, kind: 'cue', name: m.cue, source: 'clip', audio: { enabled: true, asset: '', gainDb: m.gain, pitch: 0 } }));
  };
  const update = (id: string, patch: Partial<CueMarker>, coalesce = true) => onChange(markers.map((m) => (m.id === id ? { ...m, ...patch } : m)), coalesce);
  const drag = (id: string, e: React.PointerEvent) => {
    const el = strip.current;
    if (!el) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      const r = el.getBoundingClientRect();
      update(id, { at: Math.round(Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width)) * dur / 5) * 5 });
    };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  };
  return (
    <div className={`cue-editor ${here ? 'overridden' : ''}`} data-testid={`${idPrefix}-cues`} data-source={source}>
      <div className="cue-head">
        <h4>Sound cue markers</h4>
        <span className={`badge src-${source}`}>{here ? editLayer.toUpperCase() : source === 'bangers' ? 'DEFAULT' : source.toUpperCase()}</span>
        {here && <button className="icon-btn reset" title={`Reset to ${SOURCE_LABEL[inheritedSource]} markers`} onClick={() => onChange(undefined, false)} data-testid={`${idPrefix}-cues-reset`}>⟲</button>}
        <button className="btn small" onClick={() => onChange([...markers, { id: newId('cue'), at: Math.round(dur / 2 / 5) * 5, cue: 'whoosh', gain: 0 }], false)} data-testid={`${idPrefix}-cue-add`}>+ Marker</button>
      </div>
      <div className="cue-strip" ref={strip} aria-label="Cue marker timeline">
        {markers.map((m) => (
          <div key={m.id} className="cue-tick" style={{ left: `${(Math.min(m.at, dur) / dur) * 100}%` }} onPointerDown={(e) => drag(m.id, e)} title={`${m.cue} @ ${m.at} ms`} data-testid={`${idPrefix}-tick`}>
            <span className="cue-flag">{m.cue}</span>
          </div>
        ))}
        <span className="cue-end">{Math.round(dur)} ms</span>
      </div>
      <ul className="cue-list">
        {markers.map((m) => (
          <li key={m.id}>
            <select value={m.cue} onChange={(e) => update(m.id, { cue: e.target.value }, false)} aria-label="Cue" data-testid={`${idPrefix}-cue-select`}>
              {CUES.map((c) => <option key={c.id} value={c.id}>{c.id}</option>)}
              {!CUES.some((c) => c.id === m.cue) && <option value={m.cue}>{m.cue} (custom)</option>}
            </select>
            <label>at <input type="number" min={0} max={60000} step={5} value={Math.round(m.at)} onChange={(e) => update(m.id, { at: Math.max(0, Number(e.target.value) || 0) })} aria-label="Time in ms" /> ms</label>
            <label>gain <input type="number" min={-40} max={12} step={0.5} value={m.gain} onChange={(e) => update(m.id, { gain: Math.min(12, Math.max(-40, Number(e.target.value) || 0)) })} aria-label="Gain in dB" /> dB</label>
            <button className="icon-btn" title="Audition this cue" onClick={() => audition(m)} aria-label="Audition">♪</button>
            <button className="icon-btn" title="Remove marker" onClick={() => onChange(markers.filter((x) => x.id !== m.id), false)} aria-label="Remove marker">✕</button>
          </li>
        ))}
        {!markers.length && <li className="muted">No cue markers{here ? ' (cleared at this level)' : ''}.</li>}
      </ul>
      <p className="muted small">Markers fire named cues; the theme's Sound cues section maps each to audio, gain and pitch.{!ui.soundOn && ' Enable “Sound” in the preview to hear them during playback.'}</p>
    </div>
  );
}
