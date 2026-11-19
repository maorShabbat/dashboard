// Live estimate: a TypeScript port of the T1 mechanic (pay-anywhere, tumble, wild, scatter free spins, multipliers), read from
// foundry/compiler/mechanics/t1/*.py and the Math SDK (src/calculations/{board,tumble,scatter}.py). Pure, runs in a Web Worker.
// It measures the *natural* game (reel strips and pays exactly as designed). The published RTP is tuned afterwards by the SDK optimiser.
import { snapPay, spinTable, type GameConfig } from '../compiler/config';
import { mulberry32, strip } from '../compiler/reels';
import { allFeatures, hasTumbles, lowestPayingSymbol, type CellMultiplierFeature, type Feature } from '../compiler/features';
import { FxRuntime, newBonusState } from './fx';

export interface SimModel {
  reels: number; rows: number; maxWin: number;
  base: string[][]; free: string[][];
  wild: string; scatter: string; mult: string;
  payBySize: Map<string, Float64Array>; ids: string[]; idx: Map<string, number>; spin: Float64Array; round: Float64Array;
  multValues: number[]; multCum: number[];
  minBase: number; minFree: number; spinsPer: number; retrigger: Record<number, number>;
  /** Free spins for a number of scatters (the largest table entry not above it) and cash for scatters (x bet, same rule). */
  award: (n: number) => number; scatterPay: (n: number) => number;
  startMult: number; extraSpins: number;
  /** Special features, the place the free spins run in ('free' or a purchased bonus id), the paying symbols (best first) and the lowest paying one. */
  features: Feature[]; whereFree: string; paying: string[]; lowest: string;
  /** Wins are clusters of touching symbols (wilds join clusters) instead of counts anywhere. */
  cluster: boolean;
  /** Paylines games: the active lines (one row per reel). `tumbles` false: the board stays after a win and is evaluated once. */
  lines: number[][] | null; ways: boolean; tumbles: boolean;
  /** Ways games whose reels change height every spin: the lowest and highest number of symbols on a reel. */
  heights: [number, number] | null;
}

/** The value for the largest key not above n (0 when there is none). */
function tableLookup(t: Record<string, number>): (n: number) => number {
  const keys = Object.keys(t).map(Number).sort((a, b) => a - b);
  return (n) => { let v = 0; for (const k of keys) if (k <= n) v = t[String(k)]; return v; };
}

/** `bonus`: true = the first purchased bonus, a string = the purchased bonus with that mode name, absent = the natural game. */
export function buildModel(c: GameConfig, opts: { bonus?: boolean | string } = {}): SimModel {
  const names = Object.keys(c.reels.sets);
  const baseName = names.includes('BR0') ? 'BR0' : names[0];
  const freeName = names.includes('FR0') ? 'FR0' : names.find((n) => n !== baseName) ?? baseName;
  const mk = (name: string) => Array.from({ length: c.board.reels }, (_, r) => strip(c.reels.sets[name], c.reels.rows, mulberry32(c.reels.seed * 1009 + names.indexOf(name) * 101 + r)));
  const cells = c.board.reels * c.board.rows;
  const payBySize = new Map<string, Float64Array>();
  for (const p of c.symbols.paying) {
    const arr = new Float64Array(cells + 2);
    c.paytable.tiers.forEach(([lo, hi], i) => { for (let k = lo; k <= Math.min(hi, cells + 1); k++) arr[k] = c.paytable.pays[p]?.[i] ?? 0; });
    payBySize.set(p, arr);
  }
  const bonusMode = opts.bonus ? c.modes.find((x) => x.isBuyBonus && (typeof opts.bonus !== 'string' || x.name === opts.bonus)) : undefined;
  const mode0 = bonusMode ?? c.modes[0];
  const dist = mode0.distributions.find((d) => d.criteria === 'freegame') ?? mode0.distributions.find((d) => d.conditions.multValues?.free);
  const mv = dist?.conditions.multValues?.free ?? { '2': 1 };
  const multValues = Object.keys(mv).map(Number);
  let acc = 0; const multCum = Object.values(mv).map((w) => (acc += w));
  const mkFree = mk(bonusMode ? Object.keys(dist?.conditions.reelWeights?.free ?? { [freeName]: 1 })[0] ?? freeName : freeName);
  return {
    reels: c.board.reels, rows: c.board.rows, maxWin: mode0.maxWin,
    base: mk(baseName), free: mkFree,
    wild: c.symbols.wild, scatter: c.symbols.scatter, mult: c.symbols.multiplier,
    payBySize, ids: c.symbols.paying.slice(), idx: new Map(c.symbols.paying.map((p, i) => [p, i])), spin: new Float64Array(c.symbols.paying.length), round: new Float64Array(c.symbols.paying.length), multValues, multCum,
    minBase: Math.min(...Object.keys(c.freeSpinTriggers.base).map(Number)),
    minFree: Math.min(...Object.keys(c.freeSpinTriggers.free).map(Number)),
    spinsPer: c.scatterRule.spinsPerScatter,
    award: tableLookup(spinTable(c)), scatterPay: tableLookup(c.scatterRule.pays ?? {}),
    startMult: dist?.conditions.startMult ?? 1, extraSpins: dist?.conditions.extraSpins ?? 0,
    retrigger: Object.fromEntries(Object.entries(c.freeSpinTriggers.free).map(([k, v]) => [Number(k), v])),
    cluster: c.gameType === 'cluster', lines: c.gameType === 'paylines' ? (c.paylines ?? []) : null, ways: c.gameType === 'ways', heights: c.gameType === 'ways' && c.reelHeights ? [c.reelHeights.min, c.reelHeights.max] : null, tumbles: hasTumbles(c.gameType, c.tumble),
    features: allFeatures(c), whereFree: bonusMode ? bonusMode.name : 'free', paying: c.symbols.paying.slice(),
    lowest: lowestPayingSymbol(c.symbols.paying, Object.fromEntries(c.symbols.paying.map((p) => [p, c.paytable.pays[p]?.[0] ?? Infinity]))),
  };
}

interface Board { sym: string[][]; mul: number[][]; pos: number[]; strips: string[][]; wm: number[][]; wmode: 'add' | 'multiply' | null }

function drawMult(m: SimModel, rng: () => number): number {
  const t = rng() * m.multCum[m.multCum.length - 1];
  for (let i = 0; i < m.multCum.length; i++) if (t < m.multCum[i]) return m.multValues[i];
  return m.multValues[m.multValues.length - 1];
}
function cell(m: SimModel, strips: string[][], r: number, p: number, rng: () => number): [string, number] {
  const s = strips[r][((p % strips[r].length) + strips[r].length) % strips[r].length];
  return [s, s === m.mult ? drawMult(m, rng) : 0];
}
function draw(m: SimModel, strips: string[][], rng: () => number): Board {
  const pos: number[] = []; const sym: string[][] = []; const mul: number[][] = []; const wm: number[][] = [];
  for (let r = 0; r < m.reels; r++) {
    const p = Math.floor(rng() * strips[r].length); pos.push(p);
    const cs: string[] = []; const ms: number[] = [];
    const h = m.heights ? m.heights[0] + Math.floor(rng() * (m.heights[1] - m.heights[0] + 1)) : m.rows;
    for (let y = 0; y < h; y++) { const [s, v] = cell(m, strips, r, p + y, rng); cs.push(s); ms.push(v); }
    sym.push(cs); mul.push(ms); wm.push(cs.map(() => 0));
  }
  return { sym, mul, pos, strips, wm, wmode: null };
}

/** Wild multipliers: a win that includes wilds is multiplied by the sum or the product of their values. `cells` are r * rows + y. */
function wildFactor(m: SimModel, b: Board, cells: number[]): number {
  if (!b.wmode) return 1;
  let add = 0; let prod = 1; let any = false;
  for (const i of cells) { const r = Math.floor(i / m.rows); const y = i % m.rows; const v = b.wm[r]?.[y] ?? 0; if (v > 0 && b.sym[r][y] === m.wild) { any = true; add += v; prod *= v; } }
  return !any ? 1 : b.wmode === 'add' ? add : prod;
}

/** Pays for the board at the current global multiplier and marks winning cells (and every wild when anything wins) for removal.
 *  With cell multipliers, wins through marked cells are multiplied by the sum of the marks, then every winning cell is marked or upgraded. */
function evaluate(m: SimModel, b: Board, gm: number, explode: boolean[][], cms: { f: CellMultiplierFeature; t: Float64Array }[] = []): number {
  if (m.cluster) return evaluateClusters(m, b, gm, explode, cms);
  if (m.lines) return evaluateLines(m, b, gm, cms, explode);
  if (m.ways) return evaluateWays(m, b, gm, cms, explode);
  const counts = new Map<string, number>();
  let wilds = 0;
  for (let r = 0; r < m.reels; r++) for (let y = 0; y < m.rows; y++) {
    const s = b.sym[r][y];
    if (s === m.wild) wilds++; else counts.set(s, (counts.get(s) ?? 0) + 1);
  }
  const winners: { s: string; v: number }[] = [];
  for (const [s, n] of counts) { const pay = m.payBySize.get(s)?.[n + wilds]; if (pay) winners.push({ s, v: pay * gm }); }
  if (!winners.length) return 0;
  if (b.wmode) { const wc: number[] = []; for (let r = 0; r < m.reels; r++) for (let y = 0; y < m.rows; y++) if (b.sym[r][y] === m.wild) wc.push(r * m.rows + y); const k = wildFactor(m, b, wc); for (const w of winners) w.v *= k; }
  const names = new Set(winners.map((w) => w.s));
  const inWin = (r: number, y: number) => { const c = b.sym[r][y]; return c === m.wild || names.has(c); };
  for (const { f, t } of cms) {
    for (const w of winners) {
      let sum = 0;
      for (let r = 0; r < m.reels; r++) for (let y = 0; y < m.rows; y++) { const c = b.sym[r][y]; if (c === w.s || c === m.wild) sum += t[r * m.rows + y]; }
      if (sum > 0) w.v *= sum;
    }
    for (let r = 0; r < m.reels; r++) for (let y = 0; y < m.rows; y++) if (inWin(r, y)) { const i = r * m.rows + y; const cur = t[i]; t[i] = cur === 0 ? f.start : Math.min(f.max, f.growth === 'double' ? cur * 2 : cur + f.start); }
  }
  let total = 0;
  for (const w of winners) { total += w.v; const k = m.idx.get(w.s); if (k !== undefined) m.spin[k] += w.v; }
  for (let r = 0; r < m.reels; r++) for (let y = 0; y < m.rows; y++) explode[r][y] = inWin(r, y);
  return total;
}

/** Payline pays (src/calculations/lines.py): a line pays from the left reel for the symbol that starts it; wilds at the start take the first symbol that follows. */
function evaluateLines(m: SimModel, b: Board, gm: number, cms: { f: CellMultiplierFeature; t: Float64Array }[], explode?: boolean[][]): number {
  const Y = m.rows; let total = 0;
  const wins: { s: string; v: number; cells: number[] }[] = [];
  for (const line of m.lines!) {
    const first = b.sym[0][line[0]]; let finished = first !== m.wild; let firstNon: string | null = finished ? first : null;
    let wildMatches = finished ? 0 : 1; let matches = finished ? 1 : 0; let len = 1;
    for (let r = 1; r < line.length; r++) {
      const sym = b.sym[r][line[r]];
      if (finished) { if (sym === firstNon || sym === m.wild) matches++; else break; }
      else if (sym === m.wild && firstNon === null) wildMatches++;
      else if (firstNon === null) { firstNon = sym; matches++; finished = true; }
      else break;
      len++;
    }
    if (firstNon === null) continue;
    const pay = m.payBySize.get(firstNon)?.[wildMatches + matches];
    if (!pay) continue;
    wins.push({ s: firstNon, v: pay * gm, cells: line.slice(0, len).map((row, r) => r * Y + row) });
  }
  if (!wins.length) return 0;
  for (const w of wins) w.v *= wildFactor(m, b, w.cells);
  for (const { f, t } of cms) {
    for (const w of wins) { let sum = 0; for (const i of w.cells) sum += t[i]; if (sum > 0) w.v *= sum; }
    const all = new Set<number>(); for (const w of wins) for (const i of w.cells) all.add(i);
    for (const i of all) { const cur = t[i]; t[i] = cur === 0 ? f.start : Math.min(f.max, f.growth === 'double' ? cur * 2 : cur + f.start); }
  }
  for (const w of wins) { total += w.v; const k = m.idx.get(w.s); if (k !== undefined) m.spin[k] += w.v; if (explode && m.tumbles) for (const i of w.cells) explode[Math.floor(i / Y)][i % Y] = true; }
  return total;
}

/** Ways pays (src/calculations/ways.py): a symbol that shows on the first reel pays for each following reel that has it (or a wild); ways = the product of the counts. */
function evaluateWays(m: SimModel, b: Board, gm: number, cms: { f: CellMultiplierFeature; t: Float64Array }[], explode?: boolean[][]): number {
  const R = m.reels; const Y = m.rows;
  const first = new Set<string>(); for (let y = 0; y < b.sym[0].length; y++) first.add(b.sym[0][y]);
  const wins: { s: string; v: number; cells: number[] }[] = [];
  for (const s of first) {
    const rowsPay = m.payBySize.get(s); if (!rowsPay) continue;
    let kind = 0; let ways = 1; const cells: number[] = [];
    for (let r = 0; r < R; r++) {
      let n = 0; const here: number[] = [];
      for (let y = 0; y < b.sym[r].length; y++) { const c = b.sym[r][y]; if (c === s || c === m.wild) { n++; here.push(r * Y + y); } }
      if (!n) break;
      kind++; ways *= n; cells.push(...here);
    }
    const pay = rowsPay[kind]; if (!pay) continue;
    wins.push({ s, v: pay * ways * gm, cells });
  }
  if (!wins.length) return 0;
  for (const w of wins) w.v *= wildFactor(m, b, w.cells);
  for (const { f, t } of cms) {
    for (const w of wins) { let sum = 0; for (const i of w.cells) sum += t[i]; if (sum > 0) w.v *= sum; }
    const all = new Set<number>(); for (const w of wins) for (const i of w.cells) all.add(i);
    for (const i of all) { const cur = t[i]; t[i] = cur === 0 ? f.start : Math.min(f.max, f.growth === 'double' ? cur * 2 : cur + f.start); }
  }
  let total = 0; const Yw = m.rows;
  for (const w of wins) { total += w.v; const k = m.idx.get(w.s); if (k !== undefined) m.spin[k] += w.v; if (explode && m.tumbles) for (const i of w.cells) explode[Math.floor(i / Yw)][i % Yw] = true; }
  return total;
}

/** Cluster pays (src/calculations/cluster.py): groups of touching symbols (up, down, left, right); wilds join every group they touch. */
function evaluateClusters(m: SimModel, b: Board, gm: number, explode: boolean[][], cms: { f: CellMultiplierFeature; t: Float64Array }[]): number {
  const R = m.reels; const Y = m.rows; const checked = new Uint8Array(R * Y);
  const wins: { s: string; v: number; cells: number[] }[] = [];
  for (let r = 0; r < R; r++) for (let y = 0; y < Y; y++) {
    const i0 = r * Y + y; const s = b.sym[r][y];
    if (checked[i0] || s === m.wild) continue;
    const local = new Uint8Array(R * Y); const cells = [i0]; checked[i0] = 1; local[i0] = 1; const stack = [i0];
    while (stack.length) {
      const i = stack.pop()!; const cr = Math.floor(i / Y); const cy = i % Y;
      for (const [dr, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
        const nr = cr + dr; const ny = cy + dy; if (nr < 0 || nr >= R || ny < 0 || ny >= Y) continue;
        const ni = nr * Y + ny; if (local[ni]) continue; local[ni] = 1;
        const c = b.sym[nr][ny];
        if (c === s || c === m.wild) { cells.push(ni); checked[ni] = 1; stack.push(ni); }
      }
    }
    const pay = m.payBySize.get(s)?.[cells.length];
    if (pay) wins.push({ s, v: pay * gm, cells });
  }
  if (!wins.length) return 0;
  for (const w of wins) w.v *= wildFactor(m, b, w.cells);
  for (const { f, t } of cms) {
    for (const w of wins) { let sum = 0; for (const i of w.cells) sum += t[i]; if (sum > 0) w.v *= sum; }
    const all = new Set<number>(); for (const w of wins) for (const i of w.cells) all.add(i);
    for (const i of all) { const cur = t[i]; t[i] = cur === 0 ? f.start : Math.min(f.max, f.growth === 'double' ? cur * 2 : cur + f.start); }
  }
  let total = 0;
  for (const w of wins) { total += w.v; const k = m.idx.get(w.s); if (k !== undefined) m.spin[k] += w.v; for (const i of w.cells) explode[Math.floor(i / Y)][i % Y] = true; }
  return total;
}

/** Remove exploded symbols; survivors fall, new symbols come from the strip above (same order as src/calculations/tumble.py). */
function tumble(m: SimModel, b: Board, explode: boolean[][], rng: () => number): void {
  for (let r = 0; r < m.reels; r++) {
    let k = 0; for (let y = 0; y < m.rows; y++) if (explode[r][y]) k++;
    if (!k) continue;
    const keepS: string[] = []; const keepM: number[] = []; const keepW: number[] = [];
    for (let y = 0; y < m.rows; y++) if (!explode[r][y]) { keepS.push(b.sym[r][y]); keepM.push(b.mul[r][y]); keepW.push(b.wm[r][y]); }
    const newS: string[] = []; const newM: number[] = [];
    for (let i = 0; i < k; i++) { const [s, v] = cell(m, b.strips, r, b.pos[r] - k + i, rng); newS.push(s); newM.push(v); }
    b.pos[r] = ((b.pos[r] - k) % b.strips[r].length + b.strips[r].length) % b.strips[r].length;
    b.sym[r] = [...newS, ...keepS]; b.mul[r] = [...newM, ...keepM]; b.wm[r] = [...newM.map(() => 0), ...keepW];
  }
}
const count = (m: SimModel, b: Board, s: string) => { let n = 0; for (const c of b.sym) for (const x of c) if (x === s) n++; return n; };
const boardMult = (m: SimModel, b: Board) => { let t = 0; for (const c of b.mul) for (const v of c) t += v; return Math.max(1, t); };

export interface Round { pay: number; triggered: boolean; freeSpins: number; sym: Float64Array; raw: number }

/** The free spins feature: tumbles, rising global multiplier, board multipliers, retriggers, special features and the win cap (shared by the natural free spins and every purchased bonus). */
function runFree(m: SimModel, rng: () => number, startSpins: number, startTotal: number): { total: number; done: number } {
  const explode = Array.from({ length: m.reels }, () => Array<boolean>(m.rows).fill(false));
  const reset = () => { for (const col of explode) col.fill(false); };
  let total = startTotal; let tot = startSpins; let done = 0; let b: Board;
  const fx = new FxRuntime(m, m.features, m.whereFree, true); const bs = newBonusState();
  while (done < tot && done < 400) {
    done++; bs.spin = done; bs.total = tot;
    m.spin.fill(0);
    b = draw(m, m.free, rng);
    const addMult = fx.reveal(b, rng, bs); let gm = Math.max(m.startMult, fx.ladderStart(), fx.bonusMultNow()) + addMult; reset();
    const cms = fx.cellMultipliers();
    let sw = evaluate(m, b, gm, explode, cms); let acc = sw; fx.onWin(sw);
    for (let g = 0; m.tumbles && sw > 0 && g < 300; g++) { tumble(m, b, explode, rng); reset(); gm = fx.ladderNext(gm); sw = evaluate(m, b, gm, explode, cms); acc += sw; fx.onWin(sw); if (total + acc >= m.maxWin) break; }
    reset();
    const bm = (acc > 0 ? boardMult(m, b) : 1) * fx.heroFactor(acc); // each hero multiplies the spin win, then grows
    if (acc > 0) acc *= bm;
    acc += Math.min(fx.holdAndWin(rng, b.sym.reduce((a, col) => a + col.length, 0)), Math.max(0, m.maxWin - total - acc)); // orb values are flat
    acc += Math.min(fx.prize(rng), Math.max(0, m.maxWin - total - acc)); // configured prizes are flat
    const n = count(m, b, m.scatter);
    acc += Math.min(m.scatterPay(n), Math.max(0, m.maxWin - total - acc)); // scatters also pay cash, flat
    fx.afterSpin(bs, acc);
    total += acc; for (let i = 0; i < m.round.length; i++) m.round[i] += m.spin[i] * bm;
    if (total >= m.maxWin) return { total: m.maxWin, done };
    if (fx.over) tot = done; // lives ran out: the bonus ends, no retrigger
    else if (n >= m.minFree) tot += m.retrigger[n] ?? Math.max(...Object.values(m.retrigger));
  }
  return { total, done };
}

/** One paid round (base spin plus any free spins it triggers), as a multiple of the bet. */
export function playRound(m: SimModel, rng: () => number, capture?: { board?: string[][] }): Round {
  m.round.fill(0); m.spin.fill(0);
  const explode = Array.from({ length: m.reels }, () => Array<boolean>(m.rows).fill(false));
  let total = 0;
  const reset = () => { for (const col of explode) col.fill(false); };
  // base spin
  let b = draw(m, m.base, rng);
  const fxb = new FxRuntime(m, m.features, 'base', false); const addB = fxb.reveal(b, rng, newBonusState());
  if (capture) capture.board = b.sym.map((c) => c.slice());
  const bt = fxb.cellMultipliers();
  // base game: the hero multiplies the win of each tumble step; held wilds, the hero and the gadgets work after every tumble
  let gmb = Math.max(1, fxb.ladderStart()) + addB;
  let spin = 0; let w = evaluate(m, b, gmb, explode, bt); w *= fxb.heroFactor(w); fxb.onWin(w); spin += w;
  for (let g = 0; m.tumbles && w > 0 && g < 300; g++) { tumble(m, b, explode, rng); reset(); gmb = fxb.ladderStep(gmb); gmb += fxb.afterTumble(b, rng); w = evaluate(m, b, gmb, explode, bt); w *= fxb.heroFactor(w); fxb.onWin(w); spin += w; if (spin >= m.maxWin) break; }
  reset();
  spin += Math.min(fxb.holdAndWin(rng, b.sym.reduce((a, col) => a + col.length, 0)), Math.max(0, m.maxWin - spin));
  spin += Math.min(fxb.prize(rng), Math.max(0, m.maxWin - spin));
  const sc = count(m, b, m.scatter);
  spin += Math.min(m.scatterPay(sc), Math.max(0, m.maxWin - spin)); // scatters also pay cash, flat
  total += spin; for (let i = 0; i < m.round.length; i++) m.round[i] += m.spin[i];
  if (total >= m.maxWin) return { pay: m.maxWin, triggered: false, freeSpins: 0, sym: m.round, raw: total };
  if (sc < m.minBase) return { pay: total, triggered: false, freeSpins: 0, sym: m.round, raw: total };
  const fr = runFree(m, rng, m.award(sc) + m.extraSpins, total);
  return { pay: fr.total, triggered: true, freeSpins: fr.done, sym: m.round, raw: fr.total };
}


export interface Stats { spins: number; sum: number; sumSq: number; hits: number; push: number; max: number; triggers: number; wincaps: number; hitOrTrig: number; hist: number[]; bonusWin: number; baseWin: number; symWin: number[]; symHit: number[]; ids: string[] }
export const HIST_EDGES = [0.5, 1, 2, 5, 10, 25, 50, 100, 250, 500];
export const HIST_LABELS = ['0x', '<0.5x', '0.5x', '1x', '2x', '5x', '10x', '25x', '50x', '100x', '250x', '500x+'];
export const emptyStats = (ids: string[] = []): Stats => ({ spins: 0, sum: 0, sumSq: 0, hits: 0, push: 0, max: 0, triggers: 0, wincaps: 0, hitOrTrig: 0, hist: Array(HIST_EDGES.length + 2).fill(0), bonusWin: 0, baseWin: 0, symWin: ids.map(() => 0), symHit: ids.map(() => 0), ids });
export function accumulate(s: Stats, r: Round, maxWin: number): void {
  s.spins++; s.sum += r.pay; s.sumSq += r.pay * r.pay;
  if (r.pay > 0) s.hits++; if (r.pay >= 1) s.push++; if (r.pay > s.max) s.max = r.pay;
  if (r.pay > 0 || r.triggered) s.hitOrTrig++;
  { let k = 0; if (r.pay > 0) { k = 1; while (k - 1 < HIST_EDGES.length && r.pay >= HIST_EDGES[k - 1]) k++; } s.hist[k]++; }
  if (r.triggered) s.bonusWin += r.pay; else s.baseWin += r.pay;
  const scale = r.raw > 0 ? r.pay / r.raw : 0;
  for (let i = 0; i < s.ids.length; i++) if (r.sym[i] > 0) { s.symWin[i] += r.sym[i] * scale; s.symHit[i]++; }
  if (r.triggered) s.triggers++; if (r.pay >= maxWin) s.wincaps++;
}

export interface Summary { spins: number; rtp: number; rtpLow: number; rtpHigh: number; hitRate: number; hitTrigRate: number; pushRate: number; subPushRate: number; sd: number; volatility: number; volClass: string; maxSeen: number; triggerOneIn: number; wincapOneIn: number; bySymbol: Record<string, { rtpShare: number; hitRate: number }>; hist: number[]; avgWin: number; avgBonusWin: number; truncated?: boolean }
export function volClass(vi: number): string { return vi < 6 ? 'Low' : vi < 10 ? 'Medium' : vi < 15 ? 'High' : 'Very high'; }
export function summarise(s: Stats): Summary {
  const n = Math.max(1, s.spins); const mean = s.sum / n; const sd = Math.sqrt(Math.max(0, s.sumSq / n - mean * mean));
  const se = sd / Math.sqrt(n); const vi = 1.96 * sd;
  return { spins: s.spins, rtp: mean, rtpLow: mean - 1.96 * se, rtpHigh: mean + 1.96 * se, hitRate: s.hits / n, hitTrigRate: s.hitOrTrig / n, pushRate: s.push / n, subPushRate: (s.hits - s.push) / n, sd, volatility: vi, volClass: volClass(vi), maxSeen: s.max, triggerOneIn: s.triggers ? n / s.triggers : Infinity, wincapOneIn: s.wincaps ? n / s.wincaps : Infinity, hist: s.hist.map((x) => x / n), avgWin: s.baseWin / n, avgBonusWin: s.triggers ? s.bonusWin / s.triggers : 0, bySymbol: Object.fromEntries(s.ids.map((id, i) => [id, { rtpShare: s.symWin[i] / n, hitRate: s.symHit[i] / n }])) };
}

/** Deterministic run: the same design always gives the same numbers, so edits compare cleanly. */
export function* runSim(c: GameConfig, spins: number, batch = 2000, seed = 12345, maxMs = Infinity): Generator<Summary> {
  const m = buildModel(c); const rng = mulberry32(seed); const s = emptyStats(m.ids); const t0 = Date.now();
  while (s.spins < spins) {
    const end = Math.min(spins, s.spins + batch);
    while (s.spins < end) { accumulate(s, playRound(m, rng), m.maxWin); if ((s.spins & 255) === 0 && Date.now() - t0 > maxMs) { yield { ...summarise(s), truncated: true }; return; } }
    yield summarise(s);
  }
}

/** Multiply every pay by f (snapped to Stake's 0.1x step, never below 0.1x) so the whole paytable moves together. */
export function scalePays(c: GameConfig, f: number): GameConfig {
  const n = JSON.parse(JSON.stringify(c)) as GameConfig;
  for (const k of Object.keys(n.paytable.pays)) n.paytable.pays[k] = n.paytable.pays[k].map((v) => snapPay(v * f));
  return n;
}
/** Find the pay scale that brings the natural RTP onto the target (secant steps on a fixed seed, so the search is stable). */
export function tunePays(c: GameConfig, target: number, spins = 60000): { factor: number; rtp: number } {
  const rtpAt = (f: number) => { let last!: Summary; for (const s of runSim(scalePays(c, f), spins, spins)) last = s; return last.rtp; };
  // Pays snap to 0.1x, so the return is a staircase in f: keep the closest point seen instead of the last one.
  let best = { factor: 1, rtp: rtpAt(1) };
  const seen = (f: number, r: number) => { if (Math.abs(r - target) < Math.abs(best.rtp - target)) best = { factor: f, rtp: r }; };
  let f0 = 1; let r0 = best.rtp;
  if (Math.abs(r0 - target) < 0.002) return best;
  let f1 = Math.max(1e-5, Math.min(1e5, target / Math.max(r0, 0.01))); let r1 = rtpAt(f1); seen(f1, r1);
  for (let i = 0; i < 12 && Math.abs(r1 - target) >= 0.002; i++) {
    const slope = (r1 - r0) / (f1 - f0);
    const f2 = !Number.isFinite(slope) || Math.abs(slope) < 1e-6 ? f1 * (target / Math.max(r1, 0.01)) : f1 + (target - r1) / slope;
    f0 = f1; r0 = r1; f1 = Math.max(1e-5, Math.min(1e5, f2)); r1 = rtpAt(f1); seen(f1, r1);
  }
  return best;
}

/** One round for the preview window: the first board that was drawn and what the whole round paid. */
export function previewRound(c: GameConfig, rng: () => number, model = buildModel(c)): { board: string[][]; pay: number; triggered: boolean; freeSpins: number } {
  const cap: { board?: string[][] } = {};
  const r = playRound(model, rng, cap);
  return { board: cap.board ?? [], pay: r.pay, triggered: r.triggered, freeSpins: r.freeSpins };
}

// ---------------------------------------------------------------- Bonus Buy: what a purchase actually returns
export interface BonusSummary { rounds: number; cost: number; avgWin: number; avgSpins: number; sd: number; median: number; backRate: number; bigRate: number; maxSeen: number; buyRtp: number; suggestedCost: number; startScatters: { count: number; chance: number }[] }
const BUY_COSTS = [5, 10, 25, 50, 75, 100, 150, 200, 250, 500, 1000];

function drawScatters(bm: GameConfig['modes'][number] | undefined, rng: () => number): number {
  const t = bm?.distributions.find((d) => d.criteria === 'freegame')?.conditions.scatterTriggers ?? { '4': 1 };
  const keys = Object.keys(t); const total = keys.reduce((a, k) => a + t[k], 0); let r = rng() * total;
  for (const k of keys) { r -= t[k]; if (r < 0) return Number(k); }
  return Number(keys[keys.length - 1]);
}

/** Simulate buying the bonus: free spins start at once with the guaranteed scatters, using the Bonus Buy reels and multiplier values. Deterministic per seed. */
export function bonusSummary(c: GameConfig, rounds: number, seed = 777, bonusId?: string): BonusSummary | null {
  const bm = c.modes.find((x) => x.isBuyBonus && (bonusId === undefined || x.name === bonusId));
  if (!bm) return null;
  const m = buildModel(c, { bonus: bm.name }); const rng = mulberry32(seed);
  const pays = new Float64Array(rounds); let sum = 0; let sumSq = 0; let spins = 0; let back = 0; let big = 0; let max = 0;
  for (let i = 0; i < rounds; i++) {
    m.round.fill(0); m.spin.fill(0);
    const sc = drawScatters(bm, rng);
    const r = runFree(m, rng, m.award(sc) + m.extraSpins, 0);
    pays[i] = r.total; sum += r.total; sumSq += r.total * r.total; spins += r.done;
    if (r.total >= bm.cost) back++; if (r.total >= 2 * bm.cost) big++; if (r.total > max) max = r.total;
  }
  const avg = sum / rounds; const sd = Math.sqrt(Math.max(0, sumSq / rounds - avg * avg));
  const sorted = Array.from(pays).sort((a, b) => a - b);
  const target = bm.rtp;
  const suggested = BUY_COSTS.reduce((best, k) => (Math.abs(avg / k - target) < Math.abs(avg / best - target) ? k : best), BUY_COSTS[0]);
  const t = bm.distributions.find((d) => d.criteria === 'freegame')?.conditions.scatterTriggers ?? {};
  const tt = Object.values(t).reduce((a, b) => a + b, 0) || 1;
  return { rounds, cost: bm.cost, avgWin: avg, avgSpins: spins / rounds, sd, median: sorted[Math.floor(rounds / 2)], backRate: back / rounds, bigRate: big / rounds, maxSeen: max, buyRtp: avg / bm.cost, suggestedCost: suggested, startScatters: Object.entries(t).map(([k, v]) => ({ count: Number(k), chance: v / tt })) };
}

// ---------------------------------------------------------------- Balance RTP: several ways to reach the target, each with its price
export interface BalanceOption { id: string; name: string; how: string; price: string; reachable: boolean; rtp: number; hitRate: number; volatility: number; bonusOneIn: number; config: GameConfig; summary: string }

const sumOf = (c: GameConfig, spins: number): Summary => { let last!: Summary; for (const s of runSim(c, spins, spins, 12345, 4000)) last = s; return last; };
const pct1 = (x: number) => `${(x * 100).toFixed(1)}%`;

/** Solve apply(c, f) so the natural RTP reaches the target (log-space secant). Returns the best f and whether it landed. */
function solveFactor(c: GameConfig, target: number, apply: (c: GameConfig, f: number) => GameConfig, lo: number, hi: number, spins: number, tol: number): { f: number; cfg: GameConfig; rtp: number; ok: boolean } {
  const ev = (f: number) => { const cfg = apply(c, f); return { cfg, rtp: sumOf(cfg, spins).rtp }; };
  let f0 = 1; let e0 = ev(f0);
  if (Math.abs(e0.rtp - target) <= tol) return { f: 1, ...e0, ok: true };
  let b = 1; let f1 = Math.min(hi, Math.max(lo, Math.pow(target / Math.max(e0.rtp, 1e-4), 1 / b))); let e1 = ev(f1);
  let best = Math.abs(e0.rtp - target) < Math.abs(e1.rtp - target) ? { f: f0, ...e0 } : { f: f1, ...e1 };
  for (let i = 0; i < 9 && Math.abs(e1.rtp - target) > tol; i++) {
    const nb = Math.log(Math.max(e1.rtp, 1e-6) / Math.max(e0.rtp, 1e-6)) / Math.log(f1 / f0);
    if (Number.isFinite(nb) && nb > 0.05) b = nb;
    const f2 = Math.min(hi, Math.max(lo, f1 * Math.pow(target / Math.max(e1.rtp, 1e-6), 1 / b)));
    if (Math.abs(f2 - f1) < 1e-9) break;
    f0 = f1; e0 = e1; f1 = f2; e1 = ev(f1);
    if (Math.abs(e1.rtp - target) < Math.abs(best.rtp - target)) best = { f: f1, ...e1 };
  }
  return { ...best, ok: Math.abs(best.rtp - target) <= tol };
}

export function* balanceOptions(c: GameConfig, target: number, spins = 30000): Generator<BalanceOption> {
  const now = sumOf(c, spins);
  const ps = c.symbols.paying; const half = Math.ceil(ps.length / 2); const hiSyms = ps.slice(0, half); const loSyms = ps.slice(half);
  const scaleSome = (syms: string[]) => (cfg: GameConfig, f: number) => { const n = JSON.parse(JSON.stringify(cfg)) as GameConfig; for (const k of syms) n.paytable.pays[k] = n.paytable.pays[k].map((v) => snapPay(v * f)); return n; };
  const wildScale = (cfg: GameConfig, f: number) => { const n = JSON.parse(JSON.stringify(cfg)) as GameConfig; for (const set of Object.values(n.reels.sets)) if (set[n.symbols.wild]) set[n.symbols.wild] = Math.max(1, Math.round(set[n.symbols.wild] * f)); return n; };
  const finish = (id: string, name: string, how: string, r: { cfg: GameConfig; rtp: number; ok: boolean }, priceFor: (m: Summary) => string): BalanceOption => {
    const m = sumOf(r.cfg, spins);
    return { id, name, how, price: priceFor(m), reachable: r.ok, rtp: m.rtp, hitRate: m.hitRate, volatility: m.volatility, bonusOneIn: m.triggerOneIn, config: r.cfg,
      summary: `RTP ${pct1(now.rtp)} to ${pct1(m.rtp)} · hit frequency ${pct1(now.hitRate)} to ${pct1(m.hitRate)} · volatility ${now.volatility.toFixed(1)} to ${m.volatility.toFixed(1)}` };
  };
  const dir = now.rtp > target ? 'down' : 'up';
  // 1 all pays
  const a = solveFactor(c, target, scaleSome(ps), 1e-5, 1e5, spins, 0.004);
  yield finish('pays-all', 'Scale the whole paytable', `Multiplies every pay by ${a.f.toPrecision(3)}. RTP is proportional to the pays, so this lands exactly.`, a,
    (m) => `Every prize moves by the same factor, so the proportions between symbols stay the same and hit frequency stays at ${pct1(m.hitRate)}. The price: every payout changes by ${a.f.toPrecision(2)}x, so the size of wins (and the volatility index, ${now.volatility.toFixed(1)} to ${m.volatility.toFixed(1)}) changes with it${a.f < 0.2 ? ', and many small pays fall far under the bet' : ''}.`);
  // 2 high pays only
  const h = solveFactor(c, target, scaleSome(hiSyms), 1e-3, 1e3, spins, 0.004);
  yield finish('pays-high', 'Change the high-pay symbols only', `Multiplies only ${hiSyms.join(', ')} by ${h.f.toPrecision(3)} and leaves low-pay symbols alone.`, h,
    (m) => `The frequent small wins stay as they are, so hit frequency barely moves. The price: big wins ${h.f < 1 ? 'shrink' : 'grow'}, so volatility goes ${m.volatility < now.volatility ? 'down' : 'up'} (${now.volatility.toFixed(1)} to ${m.volatility.toFixed(1)}).${h.ok ? '' : ' Even at the limit this cannot reach the target alone.'}`);
  // 3 low pays only
  const l = loSyms.length ? solveFactor(c, target, scaleSome(loSyms), 1e-3, 1e3, spins, 0.004) : null;
  if (l) yield finish('pays-low', 'Change the low-pay symbols only', `Multiplies only ${loSyms.join(', ')} by ${l.f.toPrecision(3)} and leaves the high-pay symbols alone.`, l,
    (m) => `Top prizes stay, so the max-win feel stays. The price: everyday wins ${l.f < 1 ? 'shrink (more of them fall under the bet)' : 'grow'}, which changes how the balance moves between big wins. Volatility ${now.volatility.toFixed(1)} to ${m.volatility.toFixed(1)}.${l.ok ? '' : ' Even at the limit this cannot reach the target alone.'}`);
  // 4 wild weight
  const wl = solveFactor(c, target, wildScale, 0.1, 8, spins, 0.015);
  yield finish('wild', 'Change how often the wild lands', `Scales the wild's weight on the reels by ${wl.f.toPrecision(2)} (about ${dir === 'down' ? 'fewer' : 'more'} wilds).`, wl,
    (m) => `The paytable stays untouched. The price: wins that rely on wilds become ${dir === 'down' ? 'rarer' : 'more common'}, so hit frequency goes ${pct1(now.hitRate)} to ${pct1(m.hitRate)}.${wl.ok ? '' : ' The wild weight can only move in whole steps, so this lands near the target rather than on it.'}`);
  // 5 free spins length (a game without free spins has none to change)
  if (c.freeSpins === false) return;
  let bestK = c.scatterRule.spinsPerScatter; let bestR = now.rtp; let bestCfg = c;
  for (let k = 1; k <= 8; k++) { const n = JSON.parse(JSON.stringify(c)) as GameConfig; n.scatterRule.spinsPerScatter = k; const minB = Math.min(...Object.keys(n.freeSpinTriggers.base).map(Number)); const top = Math.max(10, minB + 6); const base: Record<string, number> = {}; for (let q = minB; q <= top; q++) base[String(q)] = q * k; n.freeSpinTriggers.base = base; const r = sumOf(n, spins).rtp; if (Math.abs(r - target) < Math.abs(bestR - target)) { bestK = k; bestR = r; bestCfg = n; } }
  yield finish('spins', 'Change the free spins length', `Sets ${bestK} free spins per scatter (was ${c.scatterRule.spinsPerScatter}). Only whole numbers are possible, so it lands near the target.`, { cfg: bestCfg, rtp: bestR, ok: Math.abs(bestR - target) <= 0.03 },
    (m) => `The base game is untouched: the same wins, the same hit frequency. The price: only the bonus changes (${bestK > c.scatterRule.spinsPerScatter ? 'longer, richer' : 'shorter, poorer'} free spins), so volatility goes ${now.volatility.toFixed(1)} to ${m.volatility.toFixed(1)} and the bonus is worth ${bestK > c.scatterRule.spinsPerScatter ? 'more' : 'less'} to the player.`);
}

/** Test helper: average number of wilds on the first free-spin board (after the special features), over n boards. */
export function averageFreeWilds(c: GameConfig, n: number, seed = 5): number {
  const m = buildModel(c); const rng = mulberry32(seed); let total = 0;
  for (let i = 0; i < n; i++) {
    const b = draw(m, m.free, rng); const fx = new FxRuntime(m, m.features, m.whereFree, true); const bs = newBonusState(); bs.spin = 1; bs.total = 10;
    fx.reveal(b, rng, bs);
    for (const col of b.sym) for (const s of col) if (s === m.wild) total++;
  }
  return total / n;
}

/** Test helper: what the board pays (and how many cells it removes) at global multiplier gm. Multiplier symbols count as value 0 here. */
export function evaluateBoard(c: GameConfig, sym: string[][], gm = 1): { win: number; exploded: number } {
  const m = buildModel(c); const b: Board = { sym, mul: sym.map((col) => col.map(() => 0)), pos: [], strips: [], wm: sym.map((col) => col.map(() => 0)), wmode: null };
  const explode = Array.from({ length: m.reels }, () => Array<boolean>(m.rows).fill(false));
  const win = evaluate(m, b, gm, explode);
  return { win, exploded: explode.reduce((a, col) => a + col.filter(Boolean).length, 0) };
}
