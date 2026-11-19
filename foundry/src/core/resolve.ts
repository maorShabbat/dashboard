/**
 * Inheritance: BANGERS defaults → game theme → effect preset → instance override.
 * Pure functions that return values *and* provenance, so the editor can show exactly where each value comes from
 * and what "reset" would restore.
 */
import type { CueMarker } from './cues';
import { type ParamDef, type Scalar, type Value, canRef, coerce, isRef } from './params';
import { TOKEN_BY_KEY, TOKEN_DEFS, type TokenValues } from './tokens';
import type { OverrideSet } from './model/types';

export type Source = 'bangers' | 'theme' | 'preset' | 'instance';
export const SOURCE_ORDER: Source[] = ['bangers', 'theme', 'preset', 'instance'];
export const SOURCE_LABEL: Record<Source, string> = { bangers: 'BANGERS default', theme: 'Game theme', preset: 'Effect preset', instance: 'Instance override' };

export interface Warning { key: string; message: string }

// ---------------------------------------------------------------------------------------------------------------------
// Tokens

export interface ResolvedTokens {
  values: TokenValues;
  /** Winning layer for each token. */
  sources: Record<string, Source>;
  /** Winning raw value (literal or token reference). */
  raw: Record<string, Value>;
  warnings: Warning[];
}

export function resolveTokens(themeTokens: Record<string, Value> | undefined): ResolvedTokens {
  const theme = themeTokens ?? {};
  const values: TokenValues = {};
  const sources: Record<string, Source> = {};
  const raw: Record<string, Value> = {};
  const warnings: Warning[] = [];
  const memo = new Map<string, Scalar>();

  for (const k of Object.keys(theme)) if (!TOKEN_BY_KEY.has(k)) warnings.push({ key: k, message: 'Unknown token ignored' });

  const resolve = (key: string, stack: string[]): Scalar => {
    const hit = memo.get(key);
    if (hit !== undefined) return hit;
    const def = TOKEN_BY_KEY.get(key)!;
    let candidate: Value | undefined = key in theme ? theme[key] : undefined;
    let source: Source = candidate !== undefined ? 'theme' : 'bangers';
    let result: Scalar | undefined;

    const tryValue = (v: Value, src: Source): Scalar | undefined => {
      if (isRef(v)) {
        const target = TOKEN_BY_KEY.get(v.$ref);
        if (!target || !canRef(def, target)) { warnings.push({ key, message: `Invalid token reference "${v.$ref}"` }); return undefined; }
        if (stack.includes(v.$ref) || v.$ref === key) { warnings.push({ key, message: `Circular token reference via "${v.$ref}"` }); return undefined; }
        const rv = resolve(v.$ref, [...stack, key]);
        const c = coerce(def, rv, rv);
        if (c.clamped) warnings.push({ key, message: `Clamped to ${String(c.value)}` });
        raw[key] = v; sources[key] = src;
        return c.value;
      }
      const c = coerce(def, v, def.default as Scalar);
      if (c.invalid) { warnings.push({ key, message: 'Invalid value, using default' }); return undefined; }
      if (c.clamped) warnings.push({ key, message: `Clamped to ${String(c.value)}` });
      raw[key] = c.value; sources[key] = src;
      return c.value;
    };

    if (candidate !== undefined) result = tryValue(candidate, source);
    if (result === undefined) {
      candidate = def.default; source = 'bangers';
      result = tryValue(candidate, source);
      if (result === undefined) { result = isRef(def.default) ? '' : def.default; raw[key] = def.default; sources[key] = 'bangers'; }
    }
    memo.set(key, result);
    return result;
  };

  for (const d of TOKEN_DEFS) values[d.key] = resolve(d.key, []);
  return { values, sources, raw, warnings };
}

// ---------------------------------------------------------------------------------------------------------------------
// Effect parameters

export interface ParamResolution {
  key: string;
  def: ParamDef;
  /** Final scalar value used for rendering (refs expanded, clamped to bounds). */
  value: Scalar;
  /** The raw value carried by the winning layer (literal or token reference). */
  raw: Value;
  source: Source;
  /** What the parameter would resolve to if the winning layer's override were removed. */
  inherited: { value: Scalar; raw: Value; source: Source };
  /** Raw value carried by each layer that sets this parameter; "bangers" always present. */
  layers: Partial<Record<Source, Value>>;
  clamped: boolean;
  /** Token key when the winning raw value is a reference. */
  refKey?: string;
}

export interface ChainLayer { source: Exclude<Source, 'bangers'>; overrides?: Record<string, Value> | undefined }

/** Evaluate one raw value for `def` against resolved tokens. Returns undefined when unusable. */
function evalRaw(def: ParamDef, rawValue: Value, tokens: ResolvedTokens): { value: Scalar; clamped: boolean } | undefined {
  if (isRef(rawValue)) {
    const target = TOKEN_BY_KEY.get(rawValue.$ref);
    if (!target || !canRef(def, target)) return undefined;
    const tv = tokens.values[rawValue.$ref]!;
    const c = coerce(def, tv, def.default as Scalar);
    return c.invalid ? undefined : { value: c.value, clamped: c.clamped };
  }
  const c = coerce(def, rawValue, def.default as Scalar);
  return c.invalid ? undefined : { value: c.value, clamped: c.clamped };
}

export function resolveParam(def: ParamDef, tokens: ResolvedTokens, chain: ChainLayer[]): ParamResolution {
  const layers: Partial<Record<Source, Value>> = { bangers: def.default };
  // candidates from lowest to highest priority
  const cands: { source: Source; raw: Value; value: Scalar; clamped: boolean }[] = [];
  const base = evalRaw(def, def.default, tokens) ?? { value: isRef(def.default) ? '' : def.default, clamped: false };
  cands.push({ source: 'bangers', raw: def.default, value: base.value, clamped: base.clamped });
  for (const layer of chain) {
    const ov = layer.overrides;
    if (!ov || !(def.key in ov)) continue;
    const rv = ov[def.key]!;
    layers[layer.source] = rv;
    const e = evalRaw(def, rv, tokens);
    if (e) cands.push({ source: layer.source, raw: rv, value: e.value, clamped: e.clamped });
  }
  const win = cands[cands.length - 1]!;
  const below = cands.length > 1 ? cands[cands.length - 2]! : win;
  const out: ParamResolution = {
    key: def.key, def, value: win.value, raw: win.raw, source: win.source,
    inherited: { value: below.value, raw: below.raw, source: below.source }, layers, clamped: win.clamped,
  };
  if (isRef(win.raw)) out.refKey = win.raw.$ref;
  return out;
}

export function resolveParams(defs: readonly ParamDef[], tokens: ResolvedTokens, chain: ChainLayer[]): ParamResolution[] {
  return defs.map((d) => resolveParam(d, tokens, chain));
}

export function paramValues(res: ParamResolution[]): Record<string, Scalar> {
  const o: Record<string, Scalar> = {};
  for (const r of res) o[r.key] = r.value;
  return o;
}

// ---------------------------------------------------------------------------------------------------------------------
// Cue markers

export interface CueResolution { markers: CueMarker[]; source: Source; inheritedSource: Source }

export function resolveCues(defaults: CueMarker[], chain: { source: Exclude<Source, 'bangers'>; set?: OverrideSet | undefined }[]): CueResolution {
  let markers = defaults;
  let source: Source = 'bangers';
  let inheritedSource: Source = 'bangers';
  for (const l of chain) {
    if (l.set?.cues) { inheritedSource = source; markers = l.set.cues; source = l.source; }
  }
  return { markers, source, inheritedSource };
}

/** The value a layer would inherit for `cues` (i.e. everything below it). */
export function inheritedCues(defaults: CueMarker[], below: { source: Exclude<Source, 'bangers'>; set?: OverrideSet | undefined }[]): CueMarker[] {
  return resolveCues(defaults, below).markers;
}
