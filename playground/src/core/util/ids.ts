let counter = 0;
let override: (() => string) | null = null;

/** Tests can pin id generation for reproducible fixtures. */
export function setIdGenerator(fn: (() => string) | null): void { override = fn; }

export function newId(prefix: string): string {
  if (override) return `${prefix}_${override()}`;
  const c: Crypto | undefined = (globalThis as { crypto?: Crypto }).crypto;
  let rand: string;
  if (c?.getRandomValues) {
    const b = new Uint8Array(6);
    c.getRandomValues(b);
    rand = Array.from(b, (x) => x.toString(36).padStart(2, '0')).join('').slice(0, 9);
  } else {
    rand = Math.random().toString(36).slice(2, 11);
  }
  counter = (counter + 1) % 46656;
  return `${prefix}_${rand}${counter.toString(36)}`;
}

export function slugify(s: string): string {
  return s.toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '-').replace(/-+/g, '-').slice(0, 48) || 'untitled';
}

export function nowIso(): string {
  return new Date().toISOString();
}
