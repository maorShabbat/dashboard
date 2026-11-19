/** Leaf-level JSON diff used to show "what changed" between a draft and a saved version. */
export interface DiffEntry { path: string; before: unknown; after: unknown }

export function jsonDiff(a: unknown, b: unknown, path = '', out: DiffEntry[] = [], limit = 300): DiffEntry[] {
  if (out.length >= limit) return out;
  if (JSON.stringify(a) === JSON.stringify(b)) return out;
  const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
  if (isObj(a) && isObj(b)) {
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) jsonDiff(a[k], b[k], path ? `${path}.${k}` : k, out, limit);
  } else if (Array.isArray(a) && Array.isArray(b) && a.every((x) => isObj(x) && typeof x.id === 'string') && b.every((x) => isObj(x) && typeof x.id === 'string')) {
    const ia = new Map(a.map((x) => [(x as { id: string }).id, x])), ib = new Map(b.map((x) => [(x as { id: string }).id, x]));
    for (const id of new Set([...ia.keys(), ...ib.keys()])) jsonDiff(ia.get(id), ib.get(id), `${path}[${id}]`, out, limit);
  } else out.push({ path, before: a, after: b });
  return out;
}

export function showValue(v: unknown): string {
  if (v === undefined) return '∅';
  if (typeof v === 'string') return v.length > 40 ? `${v.slice(0, 40)}…` : v;
  const s = JSON.stringify(v);
  return s.length > 60 ? `${s.slice(0, 60)}…` : s;
}
