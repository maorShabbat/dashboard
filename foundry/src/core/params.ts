/**
 * Parameter definitions. Every adjustable value in BANGERS (theme tokens and effect parameters alike) is described by
 * a ParamDef carrying its default, bounds, unit and documentation, so editors, validators, bundle verification and the
 * runtime all share one source of truth.
 */

export type Unit =
  | '' | 'ms' | 's' | 'px' | 'cell%' | 'cell%/s' | 'cell%/s²' | '%' | 'deg' | 'deg/s' | 'x' | 'count' | 'ratio' | 'em' | 'hz' | 'dB' | 'semitones';

export interface Ref { $ref: string }
export type Scalar = number | boolean | string;
export type Value = Scalar | Ref;

export function isRef(v: unknown): v is Ref {
  return !!v && typeof v === 'object' && typeof (v as Ref).$ref === 'string';
}

interface Base {
  key: string;
  label: string;
  /** Top-level editor section (tokens) or effect tab. */
  section: string;
  /** Sub-heading inside the section. */
  group: string;
  description: string;
  unit?: Unit;
  /** Parameter only has a visible effect when another parameter holds one of these values. */
  activeWhen?: { key: string; values: Scalar[] };
}

export interface NumberDef extends Base { kind: 'number'; default: number | Ref; min: number; max: number; step: number; integer?: boolean }
export interface BoolDef extends Base { kind: 'boolean'; default: boolean }
export interface EnumDef extends Base { kind: 'enum'; default: string; options: { value: string; label: string }[] }
export interface ColorDef extends Base { kind: 'color'; default: string | Ref }
export interface FontDef extends Base { kind: 'font'; default: string | Ref }
export interface TextDef extends Base { kind: 'text'; default: string; maxLength: number }
export interface AssetDef extends Base { kind: 'asset'; default: string; assetKind: 'image' | 'audio' }
export type ParamDef = NumberDef | BoolDef | EnumDef | ColorDef | FontDef | TextDef | AssetDef;
export type ParamKind = ParamDef['kind'];

export const UNIT_LABEL: Record<Unit, string> = {
  '': '', ms: 'ms', s: 's', px: 'px', 'cell%': '% cell', 'cell%/s': '% cell/s', 'cell%/s²': '% cell/s²', '%': '%', deg: '°',
  'deg/s': '°/s', x: '×', count: '', ratio: '', em: 'em', hz: 'Hz', dB: 'dB', semitones: 'st',
};

export const UNIT_HELP: Record<Unit, string> = {
  '': 'unitless', ms: 'milliseconds', s: 'seconds', px: 'screen pixels', 'cell%': 'percent of one board cell (board-aware: scales with the board)',
  'cell%/s': 'percent of a cell per second', 'cell%/s²': 'percent of a cell per second squared', '%': 'percent', deg: 'degrees', 'deg/s': 'degrees per second',
  x: 'multiplier', count: 'whole items', ratio: 'unitless ratio', em: 'multiples of the font size', hz: 'cycles per second', dB: 'decibels', semitones: 'semitones',
};

// ---------------------------------------------------------------------------------------------------------------------
// Constructors

type Meta = Pick<Base, 'section' | 'group' | 'activeWhen'>;

export const num = (
  key: string, label: string, meta: Meta, def: number | Ref, min: number, max: number, step: number, unit: Unit, description: string, integer = false,
): NumberDef => ({ kind: 'number', key, label, ...meta, default: def, min, max, step, unit, description, integer });
export const bool = (key: string, label: string, meta: Meta, def: boolean, description: string): BoolDef => ({ kind: 'boolean', key, label, ...meta, default: def, description });
export const enm = (key: string, label: string, meta: Meta, def: string, options: [string, string][], description: string): EnumDef => ({
  kind: 'enum', key, label, ...meta, default: def, options: options.map(([value, label]) => ({ value, label })), description,
});
export const color = (key: string, label: string, meta: Meta, def: string | Ref, description: string): ColorDef => ({ kind: 'color', key, label, ...meta, default: def, description });
export const font = (key: string, label: string, meta: Meta, def: string | Ref, description: string): FontDef => ({ kind: 'font', key, label, ...meta, default: def, description });
export const text = (key: string, label: string, meta: Meta, def: string, maxLength: number, description: string): TextDef => ({ kind: 'text', key, label, ...meta, default: def, maxLength, description });
export const asset = (key: string, label: string, meta: Meta, assetKind: 'image' | 'audio', description: string): AssetDef => ({ kind: 'asset', key, label, ...meta, default: '', assetKind, description });
export const ref = (key: string): Ref => ({ $ref: key });

// ---------------------------------------------------------------------------------------------------------------------
// Coercion / validation

export interface Coerced { value: Scalar; clamped: boolean; invalid: boolean }

const HEX = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

/** Coerce a raw scalar into a legal value for `def`. `fallback` is used when the raw value is the wrong type/unknown. */
export function coerce(def: ParamDef, raw: unknown, fallback: Scalar): Coerced {
  switch (def.kind) {
    case 'number': {
      if (typeof raw !== 'number' || !Number.isFinite(raw)) return { value: fallback, clamped: false, invalid: true };
      let v = def.integer ? Math.round(raw) : raw;
      const c = Math.min(def.max, Math.max(def.min, v));
      const clamped = c !== v;
      v = c;
      return { value: v, clamped, invalid: false };
    }
    case 'boolean':
      return typeof raw === 'boolean' ? { value: raw, clamped: false, invalid: false } : { value: fallback, clamped: false, invalid: true };
    case 'enum':
      return typeof raw === 'string' && def.options.some((o) => o.value === raw) ? { value: raw, clamped: false, invalid: false } : { value: fallback, clamped: false, invalid: true };
    case 'color':
      return typeof raw === 'string' && HEX.test(raw) ? { value: raw, clamped: false, invalid: false } : { value: fallback, clamped: false, invalid: true };
    case 'font':
      return typeof raw === 'string' && raw.length > 0 && raw.length <= 64 ? { value: raw, clamped: false, invalid: false } : { value: fallback, clamped: false, invalid: true };
    case 'text': {
      if (typeof raw !== 'string') return { value: fallback, clamped: false, invalid: true };
      const clamped = raw.length > def.maxLength;
      return { value: clamped ? raw.slice(0, def.maxLength) : raw, clamped, invalid: false };
    }
    case 'asset':
      return typeof raw === 'string' && raw.length <= 96 ? { value: raw, clamped: false, invalid: false } : { value: fallback, clamped: false, invalid: true };
  }
}

/** Can `def` reference `target` as a token? Same kind, and for numbers the same unit. */
export function canRef(def: ParamDef, target: ParamDef): boolean {
  if (def.kind !== target.kind) return false;
  if (def.kind === 'color' || def.kind === 'font') return true;
  if (def.kind === 'number' && target.kind === 'number') return def.unit === target.unit;
  return false;
}

export function isLiteralEqual(a: Value | undefined, b: Value | undefined): boolean {
  if (isRef(a) || isRef(b)) return isRef(a) && isRef(b) && a.$ref === b.$ref;
  return a === b;
}

export function formatValue(def: ParamDef, v: Value): string {
  if (isRef(v)) return `→ ${v.$ref}`;
  if (def.kind === 'number') {
    const digits = def.step >= 1 ? 0 : def.step >= 0.1 ? 1 : def.step >= 0.01 ? 2 : 3;
    return `${Number(v).toFixed(digits)}${def.unit ? ' ' + UNIT_LABEL[def.unit] : ''}`.trim();
  }
  if (def.kind === 'boolean') return v ? 'on' : 'off';
  if (def.kind === 'enum') return def.options.find((o) => o.value === v)?.label ?? String(v);
  if (def.kind === 'asset') return v ? String(v) : 'none';
  return String(v);
}
