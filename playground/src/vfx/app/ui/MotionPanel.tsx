import { MOTION_BY_ID, motionsFor, specFor } from '../../anim/motions';
import type { MotionSlot, MotionSpec, MotionUnit, SceneElement, StaggerOrder } from '../../model/scene';
import { Btn, ParamForm, Section, Select, Slider } from './widgets';
import { useStore } from './services';

const SLOT_LABEL: Record<MotionSlot, { title: string; help: string }> = {
  entrance: { title: 'Entrance', help: 'How it arrives. Ends at rest.' },
  idle: { title: 'Idle loop', help: 'What it does while it waits. Repeats.' },
  emphasis: { title: 'Emphasis', help: 'A one-off accent (a hit, a pulse). You can add several.' },
  exit: { title: 'Exit', help: 'How it leaves. Starts at rest.' },
};

function SpecEditor({ slot, spec, units, onChange, onRemove, testId }: { slot: MotionSlot; spec: MotionSpec; units: boolean; onChange: (m: (s: MotionSpec) => void, label?: string) => void; onRemove: () => void; testId: string }) {
  const def = MOTION_BY_ID.get(spec.id);
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <Select label="Animation" value={spec.id} options={motionsFor(slot).map((m) => ({ value: m.id, label: m.name }))} testId={`${testId}-id`}
        hint={def?.description} onChange={(id) => onChange((s) => { const n = specFor(id, { start: s.start }); Object.assign(s, n, units ? {} : { unit: 'block' }); })} />
      <div className="row"><div style={{ flex: 1 }}><Slider label={slot === 'idle' ? 'Starts at' : 'Starts at'} value={spec.start} min={0} max={20} step={0.05} unit="s" onChange={(v) => onChange((s) => { s.start = v; }, 'start')} testId={`${testId}-start`} /></div>
        <div style={{ flex: 1 }}><Slider label={slot === 'idle' ? 'One cycle' : 'Duration'} value={spec.duration} min={0.05} max={8} step={0.01} unit="s" onChange={(v) => onChange((s) => { s.duration = v; }, 'dur')} testId={`${testId}-duration`} /></div></div>
      {units && (
        <>
          <div className="row">
            <Select label="Animate by" value={spec.unit} options={[{ value: 'block', label: 'The whole thing' }, { value: 'line', label: 'Line' }, { value: 'word', label: 'Word' }, { value: 'char', label: 'Letter' }] as { value: MotionUnit; label: string }[]} onChange={(v) => onChange((s) => { s.unit = v; })} testId={`${testId}-unit`} />
            <Select label="Order" value={spec.order} options={[{ value: 'forward', label: 'First to last' }, { value: 'reverse', label: 'Last to first' }, { value: 'center', label: 'From the middle' }, { value: 'edges', label: 'From the ends' }, { value: 'random', label: 'Random' }] as { value: StaggerOrder; label: string }[]} onChange={(v) => onChange((s) => { s.order = v; })} />
          </div>
          {spec.unit !== 'block' && <Slider label="Delay between pieces" value={spec.stagger} min={0} max={0.6} step={0.005} unit="s" onChange={(v) => onChange((s) => { s.stagger = v; }, 'stag')} testId={`${testId}-stagger`} />}
        </>
      )}
      <Slider label="Strength" value={spec.amount} min={0} max={3} step={0.01} onChange={(v) => onChange((s) => { s.amount = v; }, 'amt')} testId={`${testId}-amount`} hint="1 = as designed. 0 = nothing." />
      {slot === 'idle' && <Slider label="Repeat" value={spec.repeat ?? 0} min={0} max={20} step={1} onChange={(v) => onChange((s) => { s.repeat = v; }, 'rep')} hint="Cycles before it stops (0 = until the element goes)." />}
      {def && def.params.length > 0 && <ParamForm defs={def.params} values={spec.params} onChange={(k, v) => onChange((s) => { s.params[k] = v; }, `p${k}`)} testPrefix={`${testId}-p`} />}
      <div><Btn small danger onClick={onRemove} testId={`${testId}-remove`}>Remove this {slot === 'emphasis' ? 'emphasis' : slot}</Btn></div>
    </div>
  );
}

export function MotionPanel() {
  const store = useStore();
  const doc = store.doc!;
  const el = doc.scene.elements.find((e) => e.id === doc.selected) as SceneElement | undefined;
  if (!el) return <div className="panel-body"><div className="note">Pick an element in the Content tab to animate it.</div></div>;
  const units = el.kind === 'text' || el.kind === 'counter';
  const edit = (mut: (m: SceneElement['motion']) => void, label?: string) => store.edit((s) => { const t = s.elements.find((x) => x.id === el.id); if (t) mut(t.motion); }, `${el.id}:m:${label ?? ''}`);
  const m = el.motion;

  const single = (slot: 'entrance' | 'idle' | 'exit') => {
    const spec = m[slot];
    return (
      <Section key={slot} title={SLOT_LABEL[slot].title} open={!!spec} hint={spec ? MOTION_BY_ID.get(spec.id)?.name : 'none'} testId={`motion-${slot}`}>
        <div className="hint" style={{ color: 'var(--muted)' }}>{SLOT_LABEL[slot].help}</div>
        {spec ? (
          <SpecEditor slot={slot} spec={spec} units={units} testId={`motion-${slot}`} onChange={(mut, label) => edit((mm) => { mut(mm[slot]!); }, `${slot}${label ?? ''}`)} onRemove={() => edit((mm) => { delete mm[slot]; })} />
        ) : (
          <Select label="Add an animation" value="" options={[{ value: '', label: 'Choose…' }, ...motionsFor(slot).map((x) => ({ value: x.id, label: x.name }))]} testId={`motion-${slot}-add`} onChange={(id) => { if (id) edit((mm) => { mm[slot] = specFor(id, { start: slot === 'exit' ? 2.5 : slot === 'idle' ? 0.8 : 0, ...(units ? {} : { unit: 'block' as const }) }); }); }} />
        )}
      </Section>
    );
  };

  return (
    <div className="panel-body" data-testid="motion-panel">
      <div className="row"><b style={{ flex: 1, fontSize: 14 }}>{el.name}</b><span className="badge">{el.kind}</span></div>
      <div className="note">Four separate layers that stack: entrance, idle loop, emphasis and exit. Each can use its own animation, timing and unit, so a per-letter entrance and a whole-line sway can run together.</div>
      {single('entrance')}
      {single('idle')}
      <Section title="Emphasis" open={(m.emphasis?.length ?? 0) > 0} hint={`${m.emphasis?.length ?? 0}`} testId="motion-emphasis">
        <div className="hint" style={{ color: 'var(--muted)' }}>{SLOT_LABEL.emphasis.help}</div>
        {(m.emphasis ?? []).map((spec, i) => (
          <details key={i} className="sec" open={i === 0} style={{ background: 'var(--panel)' }}>
            <summary>{MOTION_BY_ID.get(spec.id)?.name ?? spec.id}<small>at {Math.round(spec.start * 100) / 100}s</small></summary>
            <div className="body"><SpecEditor slot="emphasis" spec={spec} units={units} testId={`motion-emphasis-${i}`} onChange={(mut, label) => edit((mm) => { mut(mm.emphasis![i]!); }, `emph${i}${label ?? ''}`)} onRemove={() => edit((mm) => { mm.emphasis!.splice(i, 1); })} /></div>
          </details>
        ))}
        <Select label="Add an emphasis" value="" options={[{ value: '', label: 'Choose…' }, ...motionsFor('emphasis').map((x) => ({ value: x.id, label: x.name }))]} testId="motion-emphasis-add" onChange={(id) => { if (id) edit((mm) => { (mm.emphasis ??= []).push(specFor(id, { start: 1, ...(units ? {} : { unit: 'block' as const }) })); }); }} />
      </Section>
      {single('exit')}
    </div>
  );
}
