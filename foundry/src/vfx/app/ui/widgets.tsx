import { useEffect, useRef, useState, type ReactNode } from 'react';
import { isRef, type ParamDef } from '../../../core/params';
import type { PValue } from '../../model/scene';

export const cx = (...a: (string | false | null | undefined)[]): string => a.filter(Boolean).join(' ');

export function Field({ label, hint, children, right }: { label: string; hint?: string; children: ReactNode; right?: ReactNode }) {
  return (
    <div className="field">
      <div className="lab"><span>{label}</span>{right}</div>
      {children}
      {hint && <div className="hint">{hint}</div>}
    </div>
  );
}

const fmt = (v: number, step: number): string => (Number.isInteger(step) ? String(Math.round(v)) : String(Math.round(v / step) * step).slice(0, 9).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, ''));

export function Slider({ label, value, min, max, step = 0.01, onChange, unit, hint, testId }: { label: string; value: number; min: number; max: number; step?: number; onChange: (v: number) => void; unit?: string; hint?: string; testId?: string }) {
  const [text, setText] = useState<string | null>(null);
  const shown = text ?? fmt(value, step);
  const commit = () => { if (text === null) return; const v = Number(text.replace(',', '.')); setText(null); if (Number.isFinite(v)) onChange(Math.min(max, Math.max(min, v))); };
  return (
    <Field label={label} hint={hint} right={unit ? <span className="hint">{unit}</span> : undefined}>
      <div className="slider">
        <input type="range" min={min} max={max} step={step} value={Math.min(max, Math.max(min, value))} onChange={(e) => onChange(Number(e.target.value))} data-testid={testId} aria-label={label} />
        <input className="inp" value={shown} inputMode="decimal" aria-label={`${label} value`} onChange={(e) => setText(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setText(null); }} data-testid={testId ? `${testId}-num` : undefined} />
      </div>
    </Field>
  );
}

export function NumberField({ label, value, onChange, step = 1, min, max, testId }: { label: string; value: number; onChange: (v: number) => void; step?: number; min?: number; max?: number; testId?: string }) {
  return (
    <Field label={label}>
      <input className="inp" type="number" value={value} step={step} min={min} max={max} data-testid={testId} onChange={(e) => { const v = Number(e.target.value); if (Number.isFinite(v)) onChange(v); }} />
    </Field>
  );
}

export function TextField({ label, value, onChange, multi, testId, placeholder }: { label: string; value: string; onChange: (v: string) => void; multi?: boolean; testId?: string; placeholder?: string }) {
  return (
    <Field label={label}>
      {multi ? <textarea className="inp" value={value} rows={Math.min(6, value.split('\n').length + 1)} onChange={(e) => onChange(e.target.value)} data-testid={testId} placeholder={placeholder} />
        : <input className="inp" value={value} onChange={(e) => onChange(e.target.value)} data-testid={testId} placeholder={placeholder} />}
    </Field>
  );
}

export function Select<T extends string>({ label, value, options, onChange, hint, testId }: { label?: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; hint?: string; testId?: string }) {
  const el = <select className="sel" value={value} onChange={(e) => onChange(e.target.value as T)} data-testid={testId} aria-label={label}>{options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>;
  return label ? <Field label={label} hint={hint}>{el}</Field> : el;
}

const HEX6 = /^#[0-9a-f]{6}$/i;
export function ColorField({ value, onChange, label }: { value: string; onChange: (v: string) => void; label?: string }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  const el = (
    <div className="color">
      <input type="color" value={HEX6.test(value) ? value : '#ffffff'} onChange={(e) => onChange(e.target.value)} aria-label={label ?? 'Colour'} />
      <input className="inp" value={text} spellCheck={false} onChange={(e) => { setText(e.target.value); if (HEX6.test(e.target.value)) onChange(e.target.value.toLowerCase()); }} onBlur={() => setText(value)} aria-label={`${label ?? 'Colour'} hex`} />
    </div>
  );
  return label ? <Field label={label}>{el}</Field> : el;
}

export function Toggle({ label, value, onChange, testId }: { label: string; value: boolean; onChange: (v: boolean) => void; testId?: string }) {
  return <label className="toggle"><input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} data-testid={testId} /> {label}</label>;
}

export function Section({ title, open, children, hint, testId }: { title: string; open?: boolean; children: ReactNode; hint?: string; testId?: string }) {
  return (
    <details className="sec" open={open} data-testid={testId}>
      <summary>{title}{hint && <small>{hint}</small>}</summary>
      <div className="body">{children}</div>
    </details>
  );
}

export function Btn({ children, onClick, primary, small, danger, disabled, title, testId, icon, ghost }: { children?: ReactNode; onClick?: () => void; primary?: boolean; small?: boolean; danger?: boolean; disabled?: boolean; title?: string; testId?: string; icon?: boolean; ghost?: boolean }) {
  return <button type="button" className={cx('btn', primary && 'primary', small && 'small', danger && 'danger', icon && 'icon', ghost && 'ghost')} onClick={onClick} disabled={disabled} title={title} data-testid={testId}>{children}</button>;
}

/** Controls for a list of effect / motion parameter definitions. */
export function ParamForm({ defs, values, onChange, testPrefix }: { defs: ParamDef[]; values: Record<string, PValue>; onChange: (key: string, v: PValue) => void; testPrefix?: string }) {
  return (
    <>
      {defs.map((d) => {
        if (d.key === 'cx' || d.key === 'cy' || d.key === 'size' && d.group === 'Icon') return null;
        const raw = values[d.key] ?? d.default;
        const v = isRef(raw) ? d.default : raw;
        const tid = testPrefix ? `${testPrefix}-${d.key}` : undefined;
        switch (d.kind) {
          case 'number': return <Slider key={d.key} label={d.label} value={Number(v)} min={d.min} max={d.max} step={d.step} unit={d.unit && d.unit !== 'count' ? d.unit : undefined} hint={d.description} onChange={(x) => onChange(d.key, d.integer ? Math.round(x) : x)} testId={tid} />;
          case 'enum': return <Select key={d.key} label={d.label} value={String(v)} options={d.options} hint={d.description} onChange={(x) => onChange(d.key, x)} testId={tid} />;
          case 'color': return <ColorField key={d.key} label={d.label} value={String(v)} onChange={(x) => onChange(d.key, x)} />;
          case 'boolean': return <Toggle key={d.key} label={d.label} value={v === true} onChange={(x) => onChange(d.key, x)} testId={tid} />;
          default: return null;
        }
      })}
    </>
  );
}

/** Pointer-draggable helper used by the gradient stops. */
export function useDrag(onMove: (e: PointerEvent) => void) {
  const ref = useRef(onMove);
  ref.current = onMove;
  return (e: React.PointerEvent) => {
    e.preventDefault();
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => ref.current(ev);
    const up = () => { target.removeEventListener('pointermove', move); target.removeEventListener('pointerup', up); target.removeEventListener('pointercancel', up); };
    target.addEventListener('pointermove', move); target.addEventListener('pointerup', up); target.addEventListener('pointercancel', up);
  };
}
