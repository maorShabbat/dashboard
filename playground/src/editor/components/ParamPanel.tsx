import { useMemo, useState } from 'react';
import { BUILTIN_SPRITES } from '../../core/model/builtinAssets';
import type { MediaItem, UserFont } from '../../core/model/types';
import { type ParamDef, type Scalar, type Value, UNIT_HELP, UNIT_LABEL, canRef, formatValue, isRef } from '../../core/params';
import { type ParamResolution, SOURCE_LABEL, type Source } from '../../core/resolve';
import { TOKEN_DEFS, fontOptions } from '../../core/tokens';
import { parseColor, toHex } from '../../core/util/color';

export type EditLayer = Exclude<Source, 'bangers'>;
const BADGE: Record<Source, string> = { bangers: 'DEFAULT', theme: 'THEME', preset: 'PRESET', instance: 'INSTANCE' };

export interface PanelProps {
  idPrefix: string;
  defs: readonly ParamDef[];
  /** Resolutions computed with the chain truncated at `editLayer`. */
  resolutions: ParamResolution[];
  editLayer: EditLayer;
  onChange(key: string, value: Value | undefined, coalesce: boolean): void;
  onResetMany(keys: string[]): void;
  resetAllLabel: string;
  overriddenOnly: boolean;
  onOverriddenOnly(v: boolean): void;
  media: MediaItem[];
  userFonts: UserFont[];
  /** Token definitions a value may link to (defaults to all tokens). */
  linkTargets?: readonly ParamDef[];
  searchable?: boolean;
  collapseGroups?: boolean;
}

const isHere = (r: ParamResolution, layer: EditLayer) => layer in r.layers;

export function ParamPanel(p: PanelProps) {
  const [q, setQ] = useState('');
  const byKey = useMemo(() => new Map(p.resolutions.map((r) => [r.key, r])), [p.resolutions]);
  const values = useMemo(() => Object.fromEntries(p.resolutions.map((r) => [r.key, r.value])), [p.resolutions]);
  const visible = p.defs.filter((d) => {
    const r = byKey.get(d.key)!;
    if (p.overriddenOnly && !isHere(r, p.editLayer)) return false;
    if (q && !`${d.label} ${d.key} ${d.group}`.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });
  const groups = new Map<string, ParamDef[]>();
  for (const d of visible) (groups.get(d.group) ?? groups.set(d.group, []).get(d.group)!).push(d);
  const overriddenKeys = p.defs.filter((d) => isHere(byKey.get(d.key)!, p.editLayer)).map((d) => d.key);
  const targets = p.linkTargets ?? TOKEN_DEFS;

  return (
    <div className="param-panel" data-testid={`${p.idPrefix}-panel`}>
      <div className="panel-bar">
        {p.searchable !== false && <input className="search" placeholder="Filter parameters…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Filter parameters" />}
        <label className="check"><input type="checkbox" checked={p.overriddenOnly} onChange={(e) => p.onOverriddenOnly(e.target.checked)} /> Overridden only</label>
        <button className="btn small" disabled={!overriddenKeys.length} onClick={() => p.onResetMany(overriddenKeys)} data-testid={`${p.idPrefix}-reset-all`} title={`Remove all ${overriddenKeys.length} override(s) at this level`}>
          ⟲ {p.resetAllLabel} <span className="count">{overriddenKeys.length}</span>
        </button>
      </div>
      {[...groups.entries()].map(([group, defs]) => {
        const n = defs.filter((d) => isHere(byKey.get(d.key)!, p.editLayer)).length;
        return (
          <details key={group} className="param-group" open={!p.collapseGroups || n > 0 || !!q}>
            <summary>
              <span>{group}</span>
              {n > 0 && <span className="pill over">{n} overridden</span>}
              {n > 0 && <button className="link-btn" onClick={(e) => { e.preventDefault(); p.onResetMany(defs.filter((d) => isHere(byKey.get(d.key)!, p.editLayer)).map((d) => d.key)); }} title="Reset this group">⟲ reset group</button>}
            </summary>
            {defs.map((d) => <ParamRow key={d.key} {...{ def: d, res: byKey.get(d.key)!, values, editLayer: p.editLayer, onChange: p.onChange, onReset: () => p.onResetMany([d.key]), media: p.media, userFonts: p.userFonts, targets, idPrefix: p.idPrefix }} />)}
          </details>
        );
      })}
      {!visible.length && <p className="muted pad">{p.overriddenOnly ? 'Nothing is overridden here: everything inherits.' : 'No parameters match.'}</p>}
    </div>
  );
}

interface RowProps {
  def: ParamDef; res: ParamResolution; values: Record<string, Scalar>; editLayer: EditLayer;
  onChange: PanelProps['onChange']; onReset(): void; media: MediaItem[]; userFonts: UserFont[]; targets: readonly ParamDef[]; idPrefix: string;
}

function ParamRow({ def, res, values, editLayer, onChange, onReset, media, userFonts, targets, idPrefix }: RowProps) {
  const here = isHere(res, editLayer);
  const inactive = def.activeWhen ? !def.activeWhen.values.includes(values[def.activeWhen.key] as Scalar) : false;
  const inheritedText = `${SOURCE_LABEL[res.inherited.source]}: ${formatValue(def, res.inherited.raw)}`;
  // Linking is offered for colour roles and for parameters designed to follow a token (default is a reference), plus anything already linked.
  const linkable = def.kind === 'color' || (def.kind !== 'text' && isRef(def.default)) || isRef(res.raw);
  const compat = linkable ? targets.filter((t) => t.key !== def.key && canRef(def, t)) : [];
  const [linkOpen, setLinkOpen] = useState(isRef(res.raw) && here);
  const set = (v: Value | undefined, coalesce = true) => onChange(def.key, v, coalesce);
  const unit = def.kind === 'number' && def.unit ? UNIT_LABEL[def.unit] : '';
  const source = here ? editLayer : res.source;
  const tip = `${def.description}${def.kind === 'number' ? `\nRange ${def.min}–${def.max} ${unit} · step ${def.step} · default ${isRef(def.default) ? def.default.$ref : def.default}${def.unit ? ` · unit: ${UNIT_HELP[def.unit]}` : ''}` : ''}`;

  return (
    <div className={`param-row ${here ? 'overridden' : ''} ${inactive ? 'inactive' : ''}`} data-testid={`${idPrefix}-row-${def.key}`} data-overridden={here} data-source={source} title={inactive ? `Inactive: only used when ${def.activeWhen!.key} is ${def.activeWhen!.values.join(' / ')}` : undefined}>
      <label className="param-label" title={tip} htmlFor={`${idPrefix}-${def.key}`}>
        {def.label}
        {unit && <span className="unit">{unit}</span>}
      </label>
      <div className="param-control">
        {def.kind === 'number' && <NumberControl id={`${idPrefix}-${def.key}`} def={def} value={res.value as number} onChange={(v, c) => set(v, c)} linked={isRef(res.raw)} />}
        {def.kind === 'boolean' && <input id={`${idPrefix}-${def.key}`} type="checkbox" className="switch" checked={res.value as boolean} onChange={(e) => set(e.target.checked, false)} />}
        {def.kind === 'enum' && (
          <select id={`${idPrefix}-${def.key}`} value={res.value as string} onChange={(e) => set(e.target.value, false)}>
            {def.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        )}
        {def.kind === 'color' && <ColorControl id={`${idPrefix}-${def.key}`} value={res.value as string} linked={isRef(res.raw)} onChange={(v, c) => set(v, c)} />}
        {def.kind === 'font' && (
          <select id={`${idPrefix}-${def.key}`} value={res.value as string} onChange={(e) => set(e.target.value, false)}>
            {fontOptions().map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            {userFonts.length > 0 && <optgroup label="Imported fonts">{userFonts.map((f) => <option key={f.id} value={f.id}>{f.label}{f.license.redistributable ? '' : ' (not bundled)'}</option>)}</optgroup>}
          </select>
        )}
        {def.kind === 'text' && <input id={`${idPrefix}-${def.key}`} type="text" value={res.value as string} maxLength={def.maxLength} onChange={(e) => set(e.target.value, true)} />}
        {def.kind === 'asset' && (
          <select id={`${idPrefix}-${def.key}`} value={res.value as string} onChange={(e) => set(e.target.value, false)}>
            <option value="">None (procedural fallback)</option>
            {def.assetKind === 'image' && Object.entries(BUILTIN_SPRITES).map(([id, s]) => <option key={id} value={id}>Built-in · {s.name}</option>)}
            {media.filter((m) => m.kind === def.assetKind).map((m) => <option key={m.id} value={m.id}>{m.name}{m.license.redistributable ? '' : ' (not bundled)'}</option>)}
          </select>
        )}
        {compat.length > 0 && (
          <button type="button" className={`icon-btn link ${isRef(res.raw) ? 'on' : ''}`} onClick={() => setLinkOpen(!linkOpen)} title={isRef(res.raw) ? `Linked to ${res.refKey}. Click to change.` : 'Link to a theme token (semantic role)'} aria-label="Link to token" data-testid={`${idPrefix}-link-${def.key}`}>⛓</button>
        )}
      </div>
      <div className="param-meta">
        <span className={`badge src-${source}`} title={here ? `Set at this level. Overrides ${inheritedText}` : `Inherited from ${SOURCE_LABEL[res.source]}`}>{BADGE[source]}</span>
        {here
          ? <button type="button" className="icon-btn reset" onClick={onReset} title={`Reset to ${inheritedText}`} aria-label={`Reset ${def.label}`} data-testid={`${idPrefix}-reset-${def.key}`}>⟲</button>
          : <span className="reset-spacer" />}
      </div>
      {(linkOpen || isRef(res.raw)) && compat.length > 0 && (
        <div className="param-link">
          <label>Linked token
            <select value={isRef(res.raw) ? res.refKey : ''} onChange={(e) => { if (e.target.value) set({ $ref: e.target.value }, false); else set(res.value, false); }} data-testid={`${idPrefix}-linksel-${def.key}`}>
              <option value="">— literal value —</option>
              {compat.map((t) => <option key={t.key} value={t.key}>{t.key}</option>)}
            </select>
          </label>
        </div>
      )}
      {here && <div className="param-hint">overrides {inheritedText}{res.clamped ? ' · clamped to bounds' : ''}</div>}
      {!here && res.source !== 'bangers' && <div className="param-hint soft">inherits {SOURCE_LABEL[res.source].toLowerCase()}{res.refKey ? ` → ${res.refKey}` : ''}</div>}
      {!here && res.source === 'bangers' && res.refKey && <div className="param-hint soft">default → {res.refKey}</div>}
    </div>
  );
}

function NumberControl({ id, def, value, onChange, linked }: { id: string; def: Extract<ParamDef, { kind: 'number' }>; value: number; onChange(v: number, coalesce: boolean): void; linked: boolean }) {
  const [text, setText] = useState<string | null>(null);
  const digits = def.step >= 1 ? 0 : def.step >= 0.1 ? 1 : def.step >= 0.01 ? 2 : 3;
  /** Returns the text to display: values above the maximum snap immediately; below-minimum text stays editable until blur. */
  const commit = (raw: string): string => {
    const n = Number(raw);
    if (raw.trim() === '' || !Number.isFinite(n)) return raw;
    const v = Math.min(def.max, Math.max(def.min, def.integer ? Math.round(n) : n));
    onChange(v, true);
    return n > def.max ? String(def.max) : raw;
  };
  return (
    <div className="num">
      <input type="range" min={def.min} max={def.max} step={def.step} value={value} onChange={(e) => onChange(Number(e.target.value), true)} aria-label={`${def.label} slider`} disabled={false} className={linked ? 'linked' : ''} />
      <input id={id} type="number" min={def.min} max={def.max} step={def.step} value={text ?? Number(value.toFixed(digits))} onChange={(e) => setText(commit(e.target.value))} onBlur={() => setText(null)} />
      <span className="bounds" aria-hidden>{def.min}–{def.max}</span>
    </div>
  );
}

function ColorControl({ id, value, onChange, linked }: { id: string; value: string; onChange(v: string, coalesce: boolean): void; linked: boolean }) {
  const [text, setText] = useState<string | null>(null);
  const six = /^#[0-9a-f]{6}$/i.test(value) ? value : toHex(parseColor(value));
  return (
    <div className="color">
      <input type="color" value={six} onChange={(e) => onChange(e.target.value, true)} aria-label="Pick colour" />
      <input id={id} type="text" value={text ?? value} spellCheck={false} onChange={(e) => { setText(e.target.value); if (/^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(e.target.value)) onChange(e.target.value, true); }} onBlur={() => setText(null)} className={linked ? 'linked' : ''} />
    </div>
  );
}
