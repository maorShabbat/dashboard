// Builds the demo's round data: a weighted sample (with replacement) of the verified published rounds of each mode.
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import zlib from 'node:zlib';
import type { DemoBook, DemoData, DemoMode } from './engine';

export interface SampleOptions {
  /** most representative rounds kept per payout band, per mode */
  perBand: Record<string, number>;
  /** ids that must be present and replayable per mode (reviewer scenarios); they get probability 0 unless already sampled */
  forceIds?: Record<string, number[]>;
  game: string;
  version?: string;
  currency?: string;
  startBalance?: number;
}

export interface Row {
  id: number;
  weight: bigint;
  /** payoutMultiplier as published (hundredths of the bet) */
  payout: number;
}

/** Payout bands, in hundredths of the bet: loss, then roughly doubling bands up to the largest wins. */
export const BAND_EDGES = [0, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 25000, 50000, 100000, 250000];

const bandOf = (payout: number) => {
  let i = 0;
  while (i < BAND_EDGES.length && payout > BAND_EDGES[i]) i++;
  return i; // 0 = exactly zero, 1 = (0, 0.5x], ...
};

/**
 * Stratified, reweighted sample: rounds are grouped by payout band; a band with at most `perBand` rounds is kept whole, a larger one is cut into
 * `perBand` equal-probability slices (in payout order) each represented by its median round. Every band keeps its exact total probability, so win
 * frequency and RTP stay close to the real game even though most rounds are left out.
 */
export function stratify(rows: Row[], perBand: number): { id: number; prob: number }[] {
  const total = rows.reduce((a, r) => a + r.weight, 0n);
  if (total === 0n) throw new Error('zero total weight');
  const bands = new Map<number, Row[]>();
  for (const r of rows) {
    if (r.weight === 0n) continue;
    const b = bandOf(r.payout);
    (bands.get(b) ?? bands.set(b, []).get(b)!).push(r);
  }
  const out: { id: number; prob: number }[] = [];
  const asProb = (w: bigint) => Number((w * 1_000_000_000_000n) / total) / 1e12;
  for (const list of bands.values()) {
    const bandWeight = list.reduce((a, r) => a + r.weight, 0n);
    if (list.length <= perBand) {
      for (const r of list) out.push({ id: r.id, prob: asProb(r.weight) });
      continue;
    }
    list.sort((x, y) => x.payout - y.payout || x.id - y.id);
    const prefix: bigint[] = [];
    let acc = 0n;
    for (const r of list) prefix.push((acc += r.weight));
    // slice s covers the weight interval [s, s+1) / perBand of the band; its representative is the round holding the midpoint
    let i = 0;
    const per = BigInt(perBand);
    for (let sl = 0; sl < perBand; sl++) {
      const target = bandWeight * BigInt(2 * sl + 1);
      while (i < list.length - 1 && prefix[i] * 2n * per < target) i++;
      const prob = asProb(bandWeight) / perBand;
      const same = out.find((o) => o.id === list[i].id);
      if (same) same.prob += prob;
      else out.push({ id: list[i].id, prob });
    }
  }
  return out;
}

async function pickBooks(file: string, wanted: Set<number>): Promise<Map<number, DemoBook>> {
  const raw = fs.createReadStream(file);
  const input = file.endsWith('.zst') ? raw.pipe(zlib.createZstdDecompress()) : raw;
  const rl = readline.createInterface({ input, crlfDelay: Infinity });
  const found = new Map<number, DemoBook>();
  for await (const line of rl) {
    if (!line.trim()) continue;
    const b = JSON.parse(line) as { id: number; payoutMultiplier: number; events: unknown[] };
    if (wanted.has(b.id)) {
      found.set(b.id, { p: b.payoutMultiplier, e: b.events });
      if (found.size === wanted.size) {
        rl.close();
        raw.destroy();
        break;
      }
    }
  }
  return found;
}

export async function buildDemoData(publishDir: string, o: SampleOptions): Promise<DemoData> {
  const index = JSON.parse(fs.readFileSync(path.join(publishDir, 'index.json'), 'utf8')) as { modes: { name: string; cost: number; events: string; weights: string }[] };
  const modes: Record<string, DemoMode> = {};
  for (const m of index.modes) {
    const rows: Row[] = fs
      .readFileSync(path.join(publishDir, m.weights), 'utf8')
      .split('\n')
      .filter((l) => l.trim())
      .map((l) => {
        const [id, weight, payout] = l.split(',');
        return { id: Number(id), weight: BigInt(weight), payout: Number(payout) };
      });
    const picks = stratify(rows, o.perBand[m.name] ?? 100);
    const sum = picks.reduce((a, p) => a + p.prob, 0);
    const ids: number[] = [];
    const cum: number[] = [];
    let c = 0;
    for (const p of picks) {
      c += p.prob / sum;
      ids.push(p.id);
      cum.push(c);
    }
    cum[cum.length - 1] = 1;
    const wanted = new Set<number>([...ids, ...(o.forceIds?.[m.name] ?? [])]);
    const found = await pickBooks(path.join(publishDir, m.events), wanted);
    for (const id of wanted) if (!found.has(id)) throw new Error(`mode ${m.name}: round ${id} not found in ${m.events}`);
    modes[m.name] = { cost: m.cost, ids, cum, books: Object.fromEntries([...found].map(([id, b]) => [String(id), b])) };
  }
  return { game: o.game, version: o.version ?? '1', currency: o.currency ?? 'USD', startBalance: o.startBalance ?? 1_000_000_000, modes };
}

/** Expected return of the sampled distribution, per unit of cost (compare with the true RTP of the mode). */
export function sampleRtp(mode: DemoMode): number {
  let prev = 0;
  let e = 0;
  mode.ids.forEach((id, i) => {
    e += (mode.cum[i] - prev) * mode.books[String(id)].p;
    prev = mode.cum[i];
  });
  return e / 100 / mode.cost;
}

/** The same figures from the full lookup table: the real RTP and hit rate of a mode, for comparison. */
export function trueStats(rows: Row[], cost: number): { rtp: number; hit: number } {
  const total = rows.reduce((a, r) => a + r.weight, 0n);
  let mean = 0;
  let hit = 0;
  for (const r of rows) {
    const p = Number((r.weight * 1_000_000_000_000n) / total) / 1e12;
    mean += p * r.payout;
    if (r.payout > 0) hit += p;
  }
  return { rtp: mean / 100 / cost, hit };
}

export function sampleHit(mode: DemoMode): number {
  let prev = 0;
  let h = 0;
  mode.ids.forEach((id, i) => {
    if (mode.books[String(id)].p > 0) h += mode.cum[i] - prev;
    prev = mode.cum[i];
  });
  return h;
}
