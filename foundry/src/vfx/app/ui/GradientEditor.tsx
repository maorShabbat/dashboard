import { useEffect, useRef, useState } from 'react';
import {
  GRADIENT_PRESETS, addStop, cloneGradient, distributeEvenly, duplicateStop, rampAt, removeStop, reverseStops, sortedStops, withKind, withStop, type Gradient, type GradientKind,
} from '../../style/gradient';
import { Btn, ColorField, Field, Select, Slider, Toggle, useDrag } from './widgets';

/** Draws the ramp (stops, colours and opacity, exactly as the renderer reads them). */
export function RampSwatch({ gradient, width, height, className }: { gradient: Gradient; width: number; height: number; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const g = c.getContext('2d')!;
    const img = g.createImageData(width, height);
    for (let x = 0; x < width; x++) {
      const [r, gg, b, a] = rampAt(gradient, width === 1 ? 0 : x / (width - 1));
      for (let y = 0; y < height; y++) { const o = (y * width + x) * 4; img.data[o] = r * 255; img.data[o + 1] = gg * 255; img.data[o + 2] = b * 255; img.data[o + 3] = a * 255; }
    }
    g.putImageData(img, 0, 0);
  }, [gradient, width, height]);
  return <canvas ref={ref} width={width} height={height} className={className} />;
}

const KINDS: { value: GradientKind; label: string }[] = [
  { value: 'solid', label: 'Solid' }, { value: 'linear', label: 'Linear' }, { value: 'radial', label: 'Radial' }, { value: 'conic', label: 'Conic' }, { value: 'reflected', label: 'Reflected (metal)' },
];

/** `simple`: only what a colour ramp needs (stops, stretch, repeat, mirror, phase, animation): no type, angle, centre or radius. */
export function GradientEditor({ value, onChange, label, testId = 'grad', simple = false }: { value: Gradient; onChange: (g: Gradient) => void; label?: string; testId?: string; simple?: boolean }) {
  const g = value;
  const [sel, setSel] = useState<string>(sortedStops(g)[0]?.id ?? '');
  const stop = g.stops.find((s) => s.id === sel) ?? sortedStops(g)[0]!;
  const barRef = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(280);
  useEffect(() => { const el = barRef.current; if (!el) return; const ro = new ResizeObserver(() => setW(Math.max(80, Math.round(el.clientWidth)))); ro.observe(el); setW(Math.max(80, Math.round(el.clientWidth))); return () => ro.disconnect(); }, []);
  const set = (patch: Partial<Gradient>) => onChange({ ...g, ...patch });
  const posFrom = (clientX: number): number => { const r = barRef.current!.getBoundingClientRect(); return Math.min(1, Math.max(0, Math.round(((clientX - r.left) / r.width) * 1000) / 1000)); };

  const showAngle = !simple && (g.kind === 'linear' || g.kind === 'reflected' || g.kind === 'conic');
  const showCentre = !simple && (g.kind === 'radial' || g.kind === 'conic' || g.kind === 'reflected');
  const endsDiffer = sortedStops(g).length > 1 && (() => { const s = sortedStops(g); const a = s[0]!, b = s[s.length - 1]!; return a.color.toLowerCase() !== b.color.toLowerCase() || Math.abs(a.alpha - b.alpha) > 0.01; })();

  const startDrag = useDrag((e) => { if (draggingRef.current) onChangeRef.current(withStop(gRef.current, draggingRef.current, { pos: posFrom(e.clientX) })); });
  const draggingRef = useRef<string | null>(null);
  const gRef = useRef(g); gRef.current = g;
  const onChangeRef = useRef(onChange); onChangeRef.current = onChange;

  return (
    <div className="ge" data-testid={testId}>
      {label && <div className="lab" style={{ fontWeight: 700, fontSize: 12.5 }}>{label}</div>}
      {!simple && <div className="chips" role="group" aria-label="Gradient type">
        {KINDS.map((k) => <button type="button" key={k.value} className="chip" aria-pressed={g.kind === k.value} data-testid={`${testId}-kind-${k.value}`} onClick={() => { const n = withKind(g, k.value); onChange(n); setSel(sortedStops(n)[0]!.id); }}>{k.label}</button>)}
      </div>}

      <div ref={barRef} className="ge-bar" onDoubleClick={(e) => { if (g.kind === 'solid') return; const r = addStop(g, posFrom(e.clientX)); onChange(r.gradient); setSel(r.id); }}>
        <RampSwatch gradient={g.kind === 'solid' ? { ...g, stops: [g.stops[0]!] } : { ...g, kind: 'linear' }} width={w} height={22} />
        {g.kind !== 'solid' && g.stops.map((s) => {
          return (
            <div key={s.id} className="ge-stop" role="slider" tabIndex={0} aria-label={`Colour stop at ${Math.round(s.pos * 100)}%`} aria-selected={s.id === stop.id} aria-valuenow={Math.round(s.pos * 100)} data-testid={`${testId}-stop`}
              style={{ left: `${s.pos * 100}%`, background: s.color }}
              onPointerDown={(e) => { setSel(s.id); draggingRef.current = s.id; startDrag(e); }}
              onKeyDown={(e) => {
                if (e.key === 'ArrowLeft') onChange(withStop(g, s.id, { pos: s.pos - (e.shiftKey ? 0.05 : 0.005) }));
                else if (e.key === 'ArrowRight') onChange(withStop(g, s.id, { pos: s.pos + (e.shiftKey ? 0.05 : 0.005) }));
                else if (e.key === 'Delete' || e.key === 'Backspace') { onChange(removeStop(g, s.id)); }
              }} />
          );
        })}
      </div>
      {g.kind !== 'solid' && <div className="hint" style={{ marginTop: -8, color: 'var(--faint)', fontSize: 11 }}>Double-click the bar to add a stop. Drag a stop to move it; arrow keys nudge it.</div>}

      <div className="row wrap">
        <div style={{ flex: '1 1 120px' }}><ColorField label="Stop colour" value={stop.color} onChange={(c) => onChange(withStop(g, stop.id, { color: c }))} /></div>
        {g.kind !== 'solid' && <div style={{ flex: '1 1 110px' }}><Field label="Position (%)"><input className="inp" type="number" min={0} max={100} step={0.5} value={Math.round(stop.pos * 1000) / 10} data-testid={`${testId}-pos`} onChange={(e) => { const v = Number(e.target.value); if (Number.isFinite(v)) onChange(withStop(g, stop.id, { pos: v / 100 })); }} /></Field></div>}
      </div>
      <Slider label="Stop opacity" value={stop.alpha} min={0} max={1} step={0.01} onChange={(a) => onChange(withStop(g, stop.id, { alpha: a }))} testId={`${testId}-alpha`} />
      {g.kind !== 'solid' && (
        <div className="row wrap">
          <Btn small onClick={() => { const r = duplicateStop(g, stop.id); onChange(r.gradient); setSel(r.id); }} testId={`${testId}-dup`}>Duplicate stop</Btn>
          <Btn small danger disabled={g.stops.length <= 2} onClick={() => { const n = removeStop(g, stop.id); onChange(n); setSel(sortedStops(n)[0]!.id); }} testId={`${testId}-del`}>Delete stop</Btn>
          <Btn small onClick={() => onChange(reverseStops(g))} testId={`${testId}-reverse`}>Reverse</Btn>
          <Btn small onClick={() => onChange(distributeEvenly(g))} testId={`${testId}-distribute`}>Distribute evenly</Btn>
        </div>
      )}

      {g.kind !== 'solid' && (
        <>
          {showAngle && <Slider label={g.kind === 'conic' ? 'Start angle' : 'Angle'} value={g.angle} min={-180} max={360} step={1} unit="°" onChange={(v) => set({ angle: v })} testId={`${testId}-angle`} />}
          {showCentre && <div className="row"><div style={{ flex: 1 }}><Slider label="Centre X" value={g.cx} min={-0.5} max={1.5} step={0.01} onChange={(v) => set({ cx: v })} testId={`${testId}-cx`} /></div><div style={{ flex: 1 }}><Slider label="Centre Y" value={g.cy} min={-0.5} max={1.5} step={0.01} onChange={(v) => set({ cy: v })} testId={`${testId}-cy`} /></div></div>}
          <Slider label="Scale" value={g.scale} min={0.1} max={4} step={0.01} onChange={(v) => set({ scale: v })} hint="Stretch the ramp across more or less of the shape." testId={`${testId}-scale`} />
          {!simple && g.kind === 'radial' && <Slider label="Radius" value={g.radius} min={0.1} max={3} step={0.01} onChange={(v) => set({ radius: v })} testId={`${testId}-radius`} />}
          <div className="row wrap">
            <div style={{ flex: '1 1 160px' }}><Slider label="Repeat" value={g.repeat} min={1} max={10} step={0.1} onChange={(v) => set({ repeat: v })} testId={`${testId}-repeat`} /></div>
            <Toggle label="Mirror repeats" value={g.reflect} onChange={(v) => set({ reflect: v })} testId={`${testId}-reflect`} />
          </div>
          <Slider label="Phase (slide the ramp)" value={g.phase} min={-1} max={1} step={0.01} onChange={(v) => set({ phase: v })} testId={`${testId}-phase`} />
        </>
      )}

      {g.kind !== 'solid' && (
        <div className="sec" style={{ background: 'var(--panel)' }}>
          <div style={{ padding: '9px 12px', display: 'grid', gap: 10 }}>
            <Toggle label="Wavy colour boundaries" value={!!g.wave} testId={`${testId}-wave`} onChange={(on) => onChange(on ? { ...g, wave: { amount: 0.08, count: 2, phase: 0, speed: 0 } } : (({ wave: _w, ...rest }) => rest as Gradient)(g))} />
            {g.wave && (
              <>
                <Slider label="Wave height" value={g.wave.amount} min={-0.5} max={0.5} step={0.005} onChange={(v) => set({ wave: { ...g.wave!, amount: v } })} testId={`${testId}-wave-amount`} hint="How far the boundaries shift, as a fraction of the ramp." />
                <Slider label="Ripples" value={g.wave.count} min={0} max={12} step={0.1} onChange={(v) => set({ wave: { ...g.wave!, count: v } })} testId={`${testId}-wave-count`} />
                <Slider label="Wave offset" value={g.wave.phase} min={-1} max={1} step={0.01} onChange={(v) => set({ wave: { ...g.wave!, phase: v } })} testId={`${testId}-wave-phase`} />
                <Slider label="Wave speed" value={g.wave.speed} min={-3} max={3} step={0.01} unit="ripples / s" onChange={(v) => set({ wave: { ...g.wave!, speed: v } })} testId={`${testId}-wave-speed`} />
              </>
            )}
          </div>
        </div>
      )}

      <div className="sec" style={{ background: 'var(--panel)' }}>
        <div style={{ padding: '9px 12px', display: 'grid', gap: 10 }}>
          <Toggle label="Animate this gradient" value={g.anim.enabled} testId={`${testId}-anim`} onChange={(on) => set({ anim: { ...g.anim, enabled: on }, ...(on && endsDiffer && !g.reflect ? { reflect: true } : {}) })} />
          {g.anim.enabled && (
            <>
              {endsDiffer && !g.reflect && <div className="note warn">The first and last colours differ, so the loop would show a hard seam. Turn on “Mirror repeats” or make them the same.</div>}
              <Slider label="Speed" value={g.anim.speed} min={0} max={3} step={0.01} unit="cycles / s" onChange={(v) => set({ anim: { ...g.anim, speed: v } })} testId={`${testId}-speed`} />
              <div className="row">
                <Select label="Direction" value={g.anim.direction} options={[{ value: 'forward', label: 'Forward' }, { value: 'reverse', label: 'Reverse' }]} onChange={(v) => set({ anim: { ...g.anim, direction: v } })} testId={`${testId}-direction`} />
                <Select label="Loop" value={g.anim.loop} options={[{ value: 'loop', label: 'Keep going' }, { value: 'pingpong', label: 'Back and forth' }, { value: 'once', label: 'One sweep, then rest' }]} onChange={(v) => set({ anim: { ...g.anim, loop: v } })} testId={`${testId}-loop`} />
              </div>
            </>
          )}
        </div>
      </div>

      <div className="lab">Presets</div>
      <div className="ge-presets">
        {GRADIENT_PRESETS.map((p) => (
          <button type="button" key={p.id} title={p.name} data-testid={`${testId}-preset-${p.id}`} onClick={() => { const n = cloneGradient(p.gradient); onChange(n); setSel(sortedStops(n)[0]!.id); }} style={{ position: 'relative' }}>
            <RampSwatch gradient={{ ...p.gradient, kind: 'linear' }} width={58} height={28} className="sw" />
            <span style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>{p.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
