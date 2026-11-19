// Reel strip generation shared by the compiler and the builder's live estimate (pure, no Node APIs).

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Exact symbol counts by largest remainder so every strip has `rows` cells and proportions follow the weights. */
export function strip(weights: Record<string, number>, rows: number, rng: () => number): string[] {
  const total = Object.values(weights).reduce((a, b) => a + b, 0);
  const raw = Object.entries(weights).map(([s, w]) => ({ s, x: (w / total) * rows }));
  const counts = raw.map((r) => ({ s: r.s, n: Math.max(1, Math.floor(r.x)), f: r.x - Math.floor(r.x) }));
  let diff = rows - counts.reduce((a, b) => a + b.n, 0);
  const byFrac = [...counts].sort((a, b) => b.f - a.f);
  for (let i = 0; diff !== 0; i = (i + 1) % byFrac.length) {
    if (diff > 0) { byFrac[i].n++; diff--; } else if (byFrac[i].n > 1) { byFrac[i].n--; diff++; }
  }
  const cells = counts.flatMap((c) => Array<string>(c.n).fill(c.s));
  for (let i = cells.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [cells[i], cells[j]] = [cells[j], cells[i]];
  }
  return cells;
}
