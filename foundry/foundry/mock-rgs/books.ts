// Loads Math SDK publication files (index.json, books_<mode>.jsonl[.zst], lookUpTable_<mode>_0.csv) and draws books by weight.
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import zlib from 'node:zlib';

export interface BookEvent {
  type: string;
  index: number;
  [key: string]: unknown;
}
export interface Book {
  id: number;
  payoutMultiplier: number;
  events: BookEvent[];
}
export interface Mode {
  name: string;
  cost: number;
  books: Map<number, Book>;
  ids: number[];
  cumulative: bigint[]; // cumulative weights, aligned with ids
  total: bigint;
}
export interface Library {
  modes: Map<string, Mode>;
}
export interface LoadOptions {
  /** Keep only the first N books per mode (the mock re-weights among them). Default 20000. */
  maxBooks?: number;
}

async function readBooks(file: string, maxBooks: number): Promise<Book[]> {
  const raw = fs.createReadStream(file);
  const input = file.endsWith('.zst') ? raw.pipe(zlib.createZstdDecompress()) : raw;
  const rl = readline.createInterface({ input, crlfDelay: Infinity });
  const books: Book[] = [];
  for await (const line of rl) {
    if (!line.trim()) continue;
    books.push(JSON.parse(line) as Book);
    if (books.length >= maxBooks) {
      rl.close();
      raw.destroy();
      break;
    }
  }
  return books;
}

function readLookup(file: string): Map<number, { weight: bigint; payout: number }> {
  const out = new Map<number, { weight: bigint; payout: number }>();
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    const [id, weight, payout] = line.split(',');
    out.set(Number(id), { weight: BigInt(weight), payout: Number(payout) });
  }
  return out;
}

export async function loadLibrary(dir: string, opts: LoadOptions = {}): Promise<Library> {
  const maxBooks = opts.maxBooks ?? 20000;
  const index = JSON.parse(fs.readFileSync(path.join(dir, 'index.json'), 'utf8')) as {
    modes: { name: string; cost: number; events: string; weights: string }[];
  };
  const modes = new Map<string, Mode>();
  for (const m of index.modes) {
    const lookup = readLookup(path.join(dir, m.weights));
    const books = new Map<number, Book>();
    for (const b of await readBooks(path.join(dir, m.events), maxBooks)) {
      const row = lookup.get(b.id);
      if (!row) throw new Error(`book ${b.id} in ${m.name} has no lookup row`);
      if (row.payout !== b.payoutMultiplier) {
        throw new Error(`mode ${m.name} id ${b.id}: lookup payout ${row.payout} != book ${b.payoutMultiplier}`);
      }
      books.set(b.id, b);
    }
    const ids: number[] = [];
    const cumulative: bigint[] = [];
    let total = 0n;
    for (const id of books.keys()) {
      total += lookup.get(id)!.weight;
      ids.push(id);
      cumulative.push(total);
    }
    if (total === 0n) throw new Error(`mode ${m.name} has zero total weight`);
    modes.set(m.name, { name: m.name, cost: m.cost, books, ids, cumulative, total });
  }
  return { modes };
}

/** Deterministic PRNG (mulberry32) so tests and replays of a mock session are repeatable. */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Weighted draw: 64 random bits reduced modulo the total weight (negligible bias for a mock). */
export function draw(mode: Mode, rng: () => number): Book {
  const hi = BigInt(Math.floor(rng() * 4294967296));
  const lo = BigInt(Math.floor(rng() * 4294967296));
  const r = ((hi << 32n) | lo) % mode.total;
  let lo2 = 0;
  let hi2 = mode.cumulative.length - 1;
  while (lo2 < hi2) {
    const mid = (lo2 + hi2) >> 1;
    if (mode.cumulative[mid] > r) hi2 = mid;
    else lo2 = mid + 1;
  }
  return mode.books.get(mode.ids[lo2])!;
}
