import { useEffect, useMemo, useRef, useState } from 'react';
import { EFFECT_LIST, EFFECTS } from '../../core/effects/registry';
import { type CompiledClip, type CompiledSequence } from '../../core/engine';
import { addClip, addMarker, addTrack, chainWithOverlap, deleteClips, deleteMarker, duplicateClips, findClip, mapClips, moveClip, orderedSelection, removeTrack, snapTime, staggerClips, updateClip, updateMarker, updateTrack } from '../../core/model/seqEdit';
import { setOverride } from '../../core/model/edit';
import { updateDraft } from '../../core/model/ops';
import type { Clip, PresetAsset, SeqMarker, SequenceContent } from '../../core/model/types';
import type { PlayerController } from '../playerController';
import { useCommit, useProject, useStudio, useUi } from '../studio';
import { PauseIcon, PlayIcon, ReplayIcon } from './Icons';
import { fmtTime, usePlayerClock } from './PreviewStage';

const HEAD_W = 176;
const CLIP_H = 28;
const GAP = 4;
const PAD = 6;
const RULER_H = 26;
const MARK_H = 32;

interface Block { clip: Clip; inst: CompiledClip; primary: boolean; row: number; overlaps: [number, number][] }

function layoutTrack(clips: Clip[], insts: CompiledClip[]): { blocks: Block[]; rows: number } {
  const sorted = [...insts].sort((a, b) => a.start - b.start || a.instance.index - b.instance.index);
  const rowEnds: number[] = [];
  const primaryStart = new Map<string, number>();
  for (const i of insts) primaryStart.set(i.clipId, Math.min(primaryStart.get(i.clipId) ?? Infinity, i.start));
  const blocks: Block[] = [];
  for (const inst of sorted) {
    const clip = clips.find((c) => c.id === inst.clipId);
    if (!clip) continue;
    let row = rowEnds.findIndex((e) => e <= inst.start + 0.5);
    if (row < 0) { row = rowEnds.length; rowEnds.push(0); }
    rowEnds[row] = inst.end;
    blocks.push({ clip, inst, primary: inst.start === primaryStart.get(inst.clipId), row, overlaps: [] });
  }
  for (const a of blocks) for (const b of blocks) {
    if (a === b || a.inst.clipId === b.inst.clipId) continue;
    const s = Math.max(a.inst.start, b.inst.start), e = Math.min(a.inst.end, b.inst.end);
    if (e - s > 1) a.overlaps.push([s, e]);
  }
  return { blocks, rows: Math.max(1, rowEnds.length) };
}

interface Props { ctrl: PlayerController; seqId: string; content: SequenceContent; compiled: CompiledSequence | null }

export function Timeline({ ctrl, seqId, content, compiled }: Props) {
  const project = useProject();
  const ui = useUi();
  const studio = useStudio();
  const commit = useCommit();
  const { time, playing, duration } = usePlayerClock(ctrl);
  const playheadRef = useRef<HTMLDivElement>(null);
  const laneRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const rootRef = useRef<HTMLDivElement>(null);
  const [stagger, setStagger] = useState(100);
  const [overlap, setOverlap] = useState(50);
  const [markerKind, setMarkerKind] = useState<SeqMarker['kind']>('event');
  const [addPick, setAddPick] = useState('');

  const zoom = ui.zoom;
  const total = Math.max(compiled?.duration ?? 0, 3000);
  const width = Math.max(720, (total + 1500) * zoom);
  const selected = ui.selectedClipIds;
  const edit = (label: string, fn: (s: SequenceContent) => SequenceContent, key?: string) => commit(label, (p) => updateDraft<SequenceContent>(p, 'sequence', seqId, fn), key ? `${seqId}:${key}` : undefined);
  const select = (ids: string[], marker: string | null = null) => studio.ui.set({ selectedClipIds: ids, selectedMarkerId: marker });

  useEffect(() => ctrl.onFrame((t) => { if (playheadRef.current) playheadRef.current.style.transform = `translateX(${t * zoom}px)`; }), [ctrl, zoom]);
  useEffect(() => { if (playheadRef.current) playheadRef.current.style.transform = `translateX(${ctrl.time * zoom}px)`; }, [zoom, ctrl, compiled]);

  const layouts = useMemo(() => content.tracks.map((t) => layoutTrack(t.clips, compiled?.clips.filter((c) => c.trackId === t.id) ?? [])), [content.tracks, compiled]);
  const durations = useMemo(() => new Map((compiled?.clips ?? []).filter((c) => c.instance.index === 0 || true).map((c) => [c.clipId, c.duration])), [compiled]);
  const anchors = (excludeIds: string[]) => [
    ...(compiled?.clips.filter((c) => !excludeIds.includes(c.clipId)).flatMap((c) => [c.start, c.end]) ?? []), ...content.markers.map((m) => m.t), ctrl.time,
  ];
  const snap = (t: number, exclude: string[]) => ui.snap ? snapTime(t, { grid: 10, anchors: anchors(exclude), magnet: 7 / zoom }) : Math.max(0, Math.round(t));

  const timeFromX = (clientX: number, el: HTMLElement) => Math.max(0, (clientX - el.getBoundingClientRect().left) / zoom);

  const scrub = (e: React.PointerEvent<HTMLElement>) => {
    const lane = e.currentTarget;
    lane.setPointerCapture(e.pointerId);
    ctrl.pause(); ctrl.seek(Math.min(timeFromX(e.clientX, lane), compiled?.duration ?? 0));
    const move = (ev: PointerEvent) => ctrl.seek(Math.min(timeFromX(ev.clientX, lane), compiled?.duration ?? 0));
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  };

  const dragClip = (e: React.PointerEvent, b: Block, mode: 'move' | 'resize') => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const track = content.tracks.find((t) => t.clips.some((c) => c.id === b.clip.id))!;
    if (track.locked) { select([b.clip.id]); return; }
    const additive = e.shiftKey || e.metaKey || e.ctrlKey;
    let sel = selected.includes(b.clip.id) ? selected : additive ? [...selected, b.clip.id] : [b.clip.id];
    if (additive && selected.includes(b.clip.id) && mode === 'move') sel = selected.filter((i) => i !== b.clip.id);
    select(sel);
    if (!sel.includes(b.clip.id)) return;
    const startX = e.clientX, startY = e.clientY;
    const orig = new Map(content.tracks.flatMap((t) => t.clips.filter((c) => sel.includes(c.id)).map((c) => [c.id, c.start] as const)));
    const origDur = (b.clip.overrides.params.duration as number | undefined) ?? (b.inst.params.duration as number);
    const scale = b.inst.tokens.values['motion.durationScale'] as number;
    const durDef = EFFECTS[b.clip.effectType]!.params.find((p) => p.key === 'duration')!;
    const dMin = durDef.kind === 'number' ? durDef.min : 100, dMax = durDef.kind === 'number' ? durDef.max : 12000;
    let moved = false;
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      if (!moved && Math.hypot(ev.clientX - startX, ev.clientY - startY) < 3) return;
      moved = true;
      if (mode === 'resize') {
        const eff = Math.max(30, b.inst.duration + (ev.clientX - startX) / zoom);
        const snapped = snap(b.inst.start + eff, sel) - b.inst.start;
        const base = Math.min(dMax, Math.max(dMin, Math.round(snapped / scale / 10) * 10));
        edit('Resize clip', (s) => updateClip(s, b.clip.id, (c) => ({ ...c, overrides: setOverride(c.overrides, 'duration', base) })), `resize:${b.clip.id}`);
        void origDur;
        return;
      }
      const dtRaw = (ev.clientX - startX) / zoom;
      const dt = snap((orig.get(b.clip.id) ?? 0) + dtRaw, sel) - (orig.get(b.clip.id) ?? 0);
      let destTrack: string | undefined;
      if (sel.length === 1) {
        for (const t of content.tracks) { const r = laneRefs.current[t.id]?.getBoundingClientRect(); if (r && ev.clientY >= r.top && ev.clientY <= r.bottom) destTrack = t.id; }
      }
      edit('Move clip', (s) => {
        let out = mapClips(s, (c) => (orig.has(c.id) ? { ...c, start: Math.max(0, Math.round(orig.get(c.id)! + dt)) } : c));
        if (destTrack) out = moveClip(out, b.clip.id, findClip(out, b.clip.id)!.clip.start, destTrack);
        return out;
      }, `move:${b.clip.id}`);
    };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  };

  const dragMarker = (e: React.PointerEvent, m: SeqMarker) => {
    e.stopPropagation();
    select([], m.id);
    const lane = (e.currentTarget as HTMLElement).parentElement!;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => edit('Move marker', (s) => updateMarker(s, m.id, { t: snap(timeFromX(ev.clientX, lane), []) }), `mk:${m.id}`);
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  };

  const addEffect = (value: string) => {
    if (!value) return;
    const [kind, id] = value.split(':') as ['effect' | 'preset', string];
    const preset = kind === 'preset' ? project.presets[id] : undefined;
    const effectType = kind === 'effect' ? id : preset?.draft.effectType;
    if (!effectType) return;
    let newId = '';
    const selTrack = content.tracks.find((t) => t.clips.some((c) => selected.includes(c.id)) && !t.locked)?.id;
    edit('Add clip', (s) => { const r = addClip(s, { effectType, presetId: preset?.id ?? null, start: Math.round(ctrl.time / 10) * 10, ...(selTrack ? { trackId: selTrack } : {}), name: preset?.name ?? '' }); newId = r.clipId; return r.content; });
    select([newId]);
    setAddPick('');
  };

  const deleteSelection = () => {
    if (ui.selectedMarkerId) { edit('Delete marker', (s) => deleteMarker(s, ui.selectedMarkerId!)); select([]); }
    else if (selected.length) { edit('Delete clips', (s) => deleteClips(s, selected)); select([]); }
  };
  const duplicateSelection = () => { if (!selected.length) return; let ids: string[] = []; edit('Duplicate clips', (s) => { const r = duplicateClips(s, selected, 200); ids = r.ids; return r.content; }); select(ids); };

  const onKey = (e: React.KeyboardEvent) => {
    const tag = (e.target as HTMLElement).tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); deleteSelection(); }
    else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'd') { e.preventDefault(); duplicateSelection(); }
    else if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && selected.length) { e.preventDefault(); const dt = (e.shiftKey ? 100 : 10) * (e.key === 'ArrowLeft' ? -1 : 1); edit('Nudge clips', (s) => mapClips(s, (c) => (selected.includes(c.id) ? { ...c, start: Math.max(0, c.start + dt) } : c)), `nudge:${selected.join()}`); }
    else if (e.key.toLowerCase() === 'm') { let id = ''; edit('Add marker', (s) => { const r = addMarker(s, markerKind, Math.round(ctrl.time), markerKind === 'cue' ? 'whoosh' : 'marker'); id = r.markerId; return r.content; }); select([], id); }
    else if (e.key === 'a' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); select(content.tracks.flatMap((t) => t.clips.map((c) => c.id))); }
  };

  // ruler ticks
  const stepCandidates = [50, 100, 250, 500, 1000, 2000, 5000];
  const step = stepCandidates.find((s) => s * zoom >= 56) ?? 5000;
  const ticks: number[] = [];
  for (let t = 0; t <= total + 1500; t += step) ticks.push(t);

  const presets = Object.values(project.presets).filter((p: PresetAsset) => p.draft.themeId === content.themeId || p.draft.link === 'snapshot');
  const markerColor = (k: SeqMarker['kind']) => (k === 'cue' ? 'mk-cue' : k === 'event' ? 'mk-event' : 'mk-label');

  return (
    <div className="timeline" ref={rootRef} tabIndex={0} onKeyDown={onKey} data-testid="timeline" aria-label="Sequence timeline">
      <div className="tl-toolbar">
        <button className="btn icon primary" onClick={() => ctrl.toggle()} data-testid="tl-play" title="Play / pause (Space)" aria-label={playing ? 'Pause' : 'Play'}>{playing ? <PauseIcon /> : <PlayIcon />}</button>
        <button className="btn icon" onClick={() => ctrl.replay()} data-testid="tl-replay" title="Replay (R)" aria-label="Replay"><ReplayIcon /></button>
        <span className="timecode" data-testid="tl-time">{fmtTime(time)} / {fmtTime(duration)}</span>
        <span className="sep" />
        <select value={addPick} onChange={(e) => addEffect(e.target.value)} aria-label="Add effect" data-testid="tl-add-effect">
          <option value="">＋ Add effect…</option>
          <optgroup label="Effects (theme defaults)">{EFFECT_LIST.map((e) => <option key={e.type} value={`effect:${e.type}`}>{e.label}</option>)}</optgroup>
          {presets.length > 0 && <optgroup label="Presets">{presets.map((p) => <option key={p.id} value={`preset:${p.id}`}>{p.name} · {EFFECTS[p.draft.effectType]?.label}</option>)}</optgroup>}
        </select>
        <button className="btn small" onClick={() => edit('Add track', (s) => addTrack(s).content)} data-testid="tl-add-track">＋ Track</button>
        <span className="sep" />
        <select value={markerKind} onChange={(e) => setMarkerKind(e.target.value as SeqMarker['kind'])} aria-label="Marker kind" data-testid="tl-marker-kind"><option value="event">Event marker</option><option value="cue">Sound cue marker</option><option value="label">Label</option></select>
        <button className="btn small" data-testid="tl-add-marker" title="Add a marker at the playhead (M)" onClick={() => { let id = ''; edit('Add marker', (s) => { const r = addMarker(s, markerKind, Math.round(ctrl.time), markerKind === 'cue' ? 'whoosh' : markerKind === 'event' ? 'my.event' : 'note'); id = r.markerId; return r.content; }); select([], id); }}>＋ Marker</button>
        <span className="sep" />
        <label className="tool">Stagger <input type="number" min={0} max={2000} step={10} value={stagger} onChange={(e) => setStagger(Number(e.target.value) || 0)} aria-label="Stagger step ms" data-testid="tl-stagger-step" />ms
          <button className="btn small" disabled={selected.length < 2} data-testid="tl-stagger" onClick={() => edit('Stagger clips', (s) => staggerClips(s, selected, stagger))} title="Space the selected clips' starts evenly">Apply</button></label>
        <label className="tool">Overlap <input type="number" min={-100} max={100} step={5} value={overlap} onChange={(e) => setOverlap(Math.min(100, Math.max(-100, Number(e.target.value) || 0)))} aria-label="Overlap percent" data-testid="tl-overlap-pct" />%
          <button className="btn small" disabled={selected.length < 2} data-testid="tl-chain" onClick={() => edit('Chain with overlap', (s) => chainWithOverlap(s, selected, overlap, durations))} title="Chain selected clips; each starts when the previous is (100−overlap)% through">Chain</button></label>
        <span className="sep" />
        <button className="btn small" disabled={!selected.length && !ui.selectedMarkerId} onClick={duplicateSelection} title="Duplicate (Ctrl+D)">⧉</button>
        <button className="btn small danger" disabled={!selected.length && !ui.selectedMarkerId} onClick={deleteSelection} title="Delete (Del)" data-testid="tl-delete">🗑</button>
        <span className="spacer" />
        <label className="check"><input type="checkbox" checked={ui.snap} onChange={(e) => studio.ui.set({ snap: e.target.checked })} /> Snap</label>
        <label className="tool">Zoom <input type="range" min={0.03} max={0.4} step={0.01} value={zoom} onChange={(e) => studio.ui.set({ zoom: Number(e.target.value) })} aria-label="Zoom" data-testid="tl-zoom" /></label>
      </div>

      <div className="tl-scroll" data-testid="tl-scroll">
        <div className="tl-grid" style={{ width: HEAD_W + width }}>
          <div className="tl-row" style={{ height: RULER_H }}>
            <div className="tl-head ruler-head">Time</div>
            <div className="tl-lane ruler" style={{ width }} onPointerDown={scrub} data-testid="tl-ruler">
              {ticks.map((t) => <div key={t} className="tick" style={{ left: t * zoom }}><span>{t % 1000 === 0 || step >= 500 ? `${t / 1000}s` : `${t}`}</span></div>)}
            </div>
          </div>
          <div className="tl-row" style={{ height: MARK_H }}>
            <div className="tl-head">Markers</div>
            <div className="tl-lane markers" style={{ width }} onPointerDown={scrub} data-testid="tl-markers">
              {content.markers.map((m) => (
                <div key={m.id} className={`marker ${markerColor(m.kind)} ${ui.selectedMarkerId === m.id ? 'sel' : ''}`} style={{ left: m.t * zoom }} onPointerDown={(e) => dragMarker(e, m)} title={`${m.kind}: ${m.name} @ ${m.t} ms`} data-testid={`marker-${m.id}`}>
                  <span>{m.kind === 'cue' ? '♪ ' : m.kind === 'event' ? '⚑ ' : ''}{m.name}</span>
                </div>
              ))}
            </div>
          </div>
          {content.tracks.map((t, ti) => {
            const lay = layouts[ti]!;
            const h = PAD * 2 + lay.rows * CLIP_H + (lay.rows - 1) * GAP;
            return (
              <div key={t.id} className={`tl-row track ${t.muted ? 'muted' : ''} ${t.locked ? 'locked' : ''}`} style={{ height: h }} data-testid={`track-${ti}`}>
                <div className="tl-head">
                  <input className="track-name" value={t.name} onChange={(e) => edit('Rename track', (s) => updateTrack(s, t.id, { name: e.target.value }), `tn:${t.id}`)} aria-label="Track name" />
                  <button className={`icon-btn ${t.muted ? 'on' : ''}`} title="Mute track" aria-pressed={t.muted} onClick={() => edit('Mute track', (s) => updateTrack(s, t.id, { muted: !t.muted }))} data-testid={`track-mute-${ti}`}>M</button>
                  <button className={`icon-btn ${t.solo ? 'on' : ''}`} title="Solo track" aria-pressed={t.solo} onClick={() => edit('Solo track', (s) => updateTrack(s, t.id, { solo: !t.solo }))} data-testid={`track-solo-${ti}`}>S</button>
                  <button className={`icon-btn ${t.locked ? 'on' : ''}`} title="Lock track (prevents moving/deleting its clips)" aria-pressed={t.locked} onClick={() => edit('Lock track', (s) => updateTrack(s, t.id, { locked: !t.locked }))} data-testid={`track-lock-${ti}`}>🔒</button>
                  <button className="icon-btn" title="Remove track" disabled={content.tracks.length <= 1} onClick={() => edit('Remove track', (s) => removeTrack(s, t.id))}>✕</button>
                </div>
                <div className="tl-lane" style={{ width }} ref={(el) => { laneRefs.current[t.id] = el; }} onPointerDown={(e) => { if (e.target === e.currentTarget) { select([]); scrub(e); } }}>
                  {lay.blocks.map((b) => {
                    const left = b.inst.start * zoom, w = Math.max(8, b.inst.duration * zoom);
                    const def = EFFECTS[b.clip.effectType]!;
                    const isSel = selected.includes(b.clip.id);
                    const label = b.clip.name || (b.clip.presetId ? project.presets[b.clip.presetId]?.name : '') || def.label;
                    const hasOv = Object.keys(b.clip.overrides.params).length > 0 || !!b.clip.overrides.cues;
                    return (
                      <div key={`${b.clip.id}#${b.inst.instance.index}`} className={`clip cat-${def.category} ${isSel ? 'sel' : ''} ${b.primary ? '' : 'ghost'} ${b.clip.muted || !b.inst.audible ? 'off' : ''}`}
                        style={{ left, width: w, top: PAD + b.row * (CLIP_H + GAP), height: CLIP_H }} onPointerDown={(e) => dragClip(e, b, 'move')} data-testid={`clip-${b.clip.id}`} data-start={Math.round(b.inst.start)} data-duration={Math.round(b.inst.duration)}
                        title={`${label} · ${def.label}\nstart ${Math.round(b.inst.start)} ms · length ${Math.round(b.inst.duration)} ms${b.inst.instance.count > 1 ? `\ninstance ${b.inst.instance.index + 1}/${b.inst.instance.count}` : ''}${b.overlaps.length ? `\noverlaps another clip on this track` : ''}`}>
                        {b.overlaps.map(([s, e], i) => <i key={i} className="overlap" style={{ left: (s - b.inst.start) * zoom, width: (e - s) * zoom }} data-testid="overlap" />)}
                        {b.inst.cues.map((c) => <i key={c.id} className="cue-pin" style={{ left: Math.min(c.at, b.inst.duration) * zoom }} title={`♪ ${c.cue}`} />)}
                        <span className="clip-label">{b.primary ? label : ''}{b.primary && b.inst.instance.count > 1 ? ` ×${b.inst.instance.count}` : ''}{hasOv && b.primary ? ' •' : ''}</span>
                        {b.primary && <span className="resize" onPointerDown={(e) => dragClip(e, b, 'resize')} data-testid={`resize-${b.clip.id}`} />}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
          <div className="playhead" ref={playheadRef} style={{ left: HEAD_W }} data-testid="playhead"><span /></div>
        </div>
      </div>
      <p className="muted small tl-help">Click a clip to inspect it · drag to move (snaps to 10 ms and neighbouring edges) · drag the right edge to resize · Shift/Ctrl-click for multi-select · Del deletes · Ctrl+D duplicates · ←/→ nudge · M adds a marker · click the ruler to scrub.</p>
    </div>
  );
}

export { orderedSelection };
