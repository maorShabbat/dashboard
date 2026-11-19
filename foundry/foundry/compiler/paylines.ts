// Paylines: each line is one row index per reel, read left to right. The library lists the usual lines for a board, simplest first;
// a game keeps the ones the designer switches on.

/** The 20 lines of the Math SDK's sample lines game (5 reels, 3 rows). */
const SAMPLE_5X3: number[][] = [
  [0, 0, 0, 0, 0], [1, 1, 1, 1, 1], [2, 2, 2, 2, 2], [0, 1, 2, 1, 0], [2, 1, 0, 1, 2], [0, 0, 1, 2, 2], [2, 2, 1, 0, 0], [1, 0, 1, 2, 1], [1, 2, 1, 0, 1], [0, 1, 1, 1, 2],
  [2, 1, 1, 1, 0], [0, 1, 0, 1, 2], [2, 1, 2, 1, 0], [1, 1, 0, 1, 1], [1, 1, 2, 1, 1], [0, 2, 1, 0, 2], [2, 0, 1, 2, 0], [0, 0, 2, 0, 0], [2, 2, 0, 2, 2], [1, 0, 0, 0, 1],
];

export const MAX_PAYLINES = 40;

/** All lines for the board that stay close to a straight line, simplest first (straight rows, then gentle bends, then zigzags). */
export function paylineLibrary(reels: number, rows: number): number[][] {
  const out: number[][] = []; const seen = new Set<string>();
  const add = (l: number[]) => { const k = l.join(','); if (!seen.has(k) && l.length === reels && l.every((r) => r >= 0 && r < rows)) { seen.add(k); out.push(l); } };
  if (reels === 5 && rows === 3) SAMPLE_5X3.forEach(add);
  const total = Math.pow(rows, reels);
  if (total <= 20000) {
    const all: { l: number[]; rough: number; turns: number }[] = [];
    for (let n = 0; n < total; n++) {
      const l: number[] = []; let x = n; for (let r = 0; r < reels; r++) { l.push(x % rows); x = Math.floor(x / rows); }
      let rough = 0; let turns = 0;
      for (let r = 1; r < reels; r++) rough += Math.abs(l[r] - l[r - 1]);
      for (let r = 2; r < reels; r++) if ((l[r] - l[r - 1]) * (l[r - 1] - l[r - 2]) < 0) turns++;
      all.push({ l, rough, turns });
    }
    all.sort((a, b) => a.rough - b.rough || a.turns - b.turns || a.l.join('').localeCompare(b.l.join('')));
    for (const { l } of all) { if (out.length >= MAX_PAYLINES) break; add(l); }
  }
  return out.slice(0, MAX_PAYLINES);
}

/** The line counts offered as one-click presets (those that fit the library). */
export const PAYLINE_PRESETS = [5, 10, 20, 25, 40];
export const paylinePresets = (reels: number, rows: number): number[] => PAYLINE_PRESETS.filter((n) => n <= paylineLibrary(reels, rows).length);

export const sameLine = (a: number[], b: number[]) => a.length === b.length && a.every((v, i) => v === b[i]);
