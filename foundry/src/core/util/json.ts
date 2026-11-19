/** Deterministic JSON helpers. Everything that is hashed goes through these. */

export function stableStringify(value: unknown): string {
  return JSON.stringify(canonical(value));
}

function canonical(v: unknown): unknown {
  if (v === null || typeof v !== 'object') {
    if (typeof v === 'number') {
      if (!Number.isFinite(v)) throw new Error(`Non-finite number cannot be serialised: ${v}`);
      return Object.is(v, -0) ? 0 : v;
    }
    return v;
  }
  if (Array.isArray(v)) return v.map(canonical);
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(v as object).sort()) {
    const x = (v as Record<string, unknown>)[k];
    if (x !== undefined) out[k] = canonical(x);
  }
  return out;
}

export function deepClone<T>(v: T): T {
  return v === undefined ? v : (JSON.parse(JSON.stringify(v)) as T);
}

/** Round every number in a structure so cross-engine float noise cannot change a fingerprint. */
export function roundDeep(v: unknown, digits = 3): unknown {
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) throw new Error(`Non-finite number in display list: ${v}`);
    const f = 10 ** digits;
    const r = Math.round(v * f) / f;
    return Object.is(r, -0) ? 0 : r;
  }
  if (Array.isArray(v)) return v.map((x) => roundDeep(x, digits));
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) if (x !== undefined) out[k] = roundDeep(x, digits);
    return out;
  }
  return v;
}

export function isPlainObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}
