import { allFeatures, hasTumbles, validateFeatures, type Feature, type GadgetBar } from './features';

// Canonical T1 game config (pay-anywhere, tumble, wild, scatter) and its validator.
// Limits come from docs/foundry/engine-docs/approval-guidelines__math-verification.txt; Foundry defaults are stricter (spec/MATH.md).

export interface Distribution {
  criteria: string;
  quota: number;
  winCriteria?: number;
  conditions: {
    reelWeights: { base?: Record<string, number>; free?: Record<string, number> };
    multValues: { base?: Record<string, number>; free?: Record<string, number> };
    scatterTriggers?: Record<string, number>;
    forceWincap: boolean;
    forceFreegame: boolean;
    /** Free spins start every spin at this global multiplier instead of 1x (Bonus Buy perk). */
    startMult?: number;
    /** Extra free spins added on top of scatters x spinsPerScatter when the feature is triggered (Bonus Buy perk). */
    extraSpins?: number;
  };
}
export interface Mode {
  /** Id used by the SDK, the frontend and the features' `where` (letters, digits, underscores). */
  name: string;
  /** What players see for a purchased bonus (the card in the bet menu and the rules). */
  displayName?: string;
  cost: number;
  rtp: number;
  maxWin: number;
  isFeature: boolean;
  isBuyBonus: boolean;
  /** An ante bet: the player pays 2x or 3x per spin and free spins come more often. Always named `ante`. */
  isAnte?: boolean;
  /** What the ante bet does besides costing more: free spins start more often (the optimiser's hit rate), more wilds and better symbols on its reels (1 = as normal). Features can also be set to work only with the ante on. */
  ante?: { freeSpins: boolean; wilds: number; symbols: number };
  distributions: Distribution[];
}
export interface OptCondition {
  rtp?: number | 'x';
  avWin?: number;
  hr?: number | 'x';
  searchConditions?: number | { symbol: string };
}
export interface OptMode {
  conditions: Record<string, OptCondition>;
  scaling: { criteria: string; scaleFactor: number; winRange: [number, number]; probability: number }[];
  parameters: {
    numShow: number; numPerFence: number; minM2m: number; maxM2m: number; pmbRtp: number; simTrials: number;
    testSpins: number[]; testWeights: number[]; scoreType: string; maxTrialDist: number;
  };
  bias: { appliedCriteria: string[]; biasRanges: [number, number][]; biasWeights: number[] };
}
export type GameType = 'anywhere' | 'cluster' | 'paylines' | 'ways';
export const GAME_TYPES: GameType[] = ['anywhere', 'cluster', 'paylines', 'ways'];

/** The free spins awarded for each scatter count when free spins start: the designer's own list, or scatters x spinsPerScatter. */
export function spinTable(c: { freeSpinTriggers: { base: Record<string, number> }; scatterRule: { spinsPerScatter: number; custom?: boolean } }): Record<string, number> {
  if (c.scatterRule.custom) return c.freeSpinTriggers.base;
  return Object.fromEntries(Object.keys(c.freeSpinTriggers.base).map((k) => [k, Number(k) * c.scatterRule.spinsPerScatter]));
}

export interface GameConfig {
  id: string;
  version: number;
  name: string;
  /** Studio name shown in the game's logo slot. */
  provider?: string;
  template: 'T1';
  /** How wins are found: symbols anywhere (the pilot), clusters of touching symbols, paylines, or ways. Absent means anywhere. */
  gameType?: GameType;
  /** Paylines games only: the active lines, one row index per reel, left to right. */
  paylines?: number[][];
  /** Winning symbols tumble away and new ones drop in until no win remains. Paylines and ways: off unless true. Pay anywhere and cluster: on unless false. */
  tumble?: boolean;
  /** Ways games only: every reel gets a random number of symbols from min to max on every spin (board.rows is the most). */
  reelHeights?: { min: number; max: number };
  board: { reels: number; rows: number };
  symbols: { paying: string[]; wild: string; scatter: string; multiplier: string };
  paytable: { tiers: [number, number][]; pays: Record<string, number[]> };
  /** spinsPerScatter builds the default free spins table; `pays` is cash for landing scatters (x bet, by count), paid on top of any free spins. */
  scatterRule: { spinsPerScatter: number; pays?: Record<string, number>; /** true: the free spins table is the designer's own list; absent: the table is scatters x spinsPerScatter. */ custom?: boolean };
  freeSpinTriggers: { base: Record<string, number>; free: Record<string, number> };
  /** false: the game has no free spins (no scatter on the reels, no free spins or win-cap distribution, no bonus buy). Absent: free spins are on. */
  freeSpins?: boolean;
  reels: { rows: number; seed: number; sets: Record<string, Record<string, number>> };
  modes: Mode[];
  optimization: Record<string, OptMode>;
  run: { books: Record<string, number>; threads: number; batch: number };
  limits: { maxEventsPerRound: number };
  /** Special features (random wilds, sticky wilds, ...). Each one changes the board at the reveal. */
  features?: Feature[];
  /** The top gadget bar: a row above the board on every spin. */
  gadgetBar?: GadgetBar | null;
  /** Builder-only: how each symbol looks (name, colour, optional small image as a data URL). Ignored by the compiler. */
  look?: Record<string, { name?: string; color?: string; image?: string; asset?: string }>;
  /** Builder-only: files chosen from the asset library for logo, background and sounds (references by id and name; the files live in the browser). */
  media?: Record<string, { id: string; name: string; kind: 'image' | 'video' | 'audio' | 'data' }>;
  /** Builder-only: one-line description shown in the project header. */
  description?: string;
}

export interface Issue {
  level: 'error' | 'warning';
  path: string;
  message: string;
}

/** Engine hard limits and Foundry defaults (stricter). */
export const LIMITS = {
  engineRtpMax: 0.967,
  engineRtpMin: 0.9,
  foundryRtpMax: 0.966,
  foundryRtpSpread: 0.002,
  engineMaxCost: 2000,
  foundryMaxCost: 1000,
  engineMaxPayout: 500000,
  foundryMaxPayout: 50000,
  maxEventsPerMode: 10_000_000,
  eventsBudget: 9_000_000,
};

/** Stake books pay in steps of 0.1x: every complete-round payout must be a multiple of 0.1 (verifier: payout % 10 == 0 in hundredths). With whole-number multipliers that holds when every pay is a multiple of 0.1. */
export const PAY_STEP = 0.1;
export const snapPay = (v: number): number => Math.max(PAY_STEP, Math.round(v / PAY_STEP) / 10);
export const isPayStep = (v: number): boolean => Math.abs(v * 10 - Math.round(v * 10)) < 1e-9;

const near = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) <= eps;

/**
 * Round-number rule for mode costs (product rule, 2026-10-06): a whole number whose significant digits are 1, 1.5, 2, 2.5, 3, 4, 5 or 7.5
 * times a power of ten, e.g. 5, 10, 25, 50, 75, 100, 150, 200, 250, 500, 1000. Never 5.233, 10.2 or 809.
 */
export const ROUND_COST_DIGITS = ['1', '15', '2', '25', '3', '4', '5', '75'];
export function isRoundCost(cost: number): boolean {
  if (!Number.isInteger(cost) || cost < 1) return false;
  return ROUND_COST_DIGITS.includes(String(cost).replace(/0+$/, ''));
}

export function validate(c: GameConfig): Issue[] {
  const out: Issue[] = [];
  const err = (path: string, message: string) => out.push({ level: 'error', path, message });
  const warn = (path: string, message: string) => out.push({ level: 'warning', path, message });

  if (!/^[a-z][a-z0-9_]{2,40}$/.test(c.id ?? '')) err('id', 'must match /^[a-z][a-z0-9_]{2,40}$/ (it becomes the game folder)');
  if (c.template !== 'T1') err('template', 'only template T1 exists');
  if (!Number.isInteger(c.version) || c.version < 1) err('version', 'positive integer');
  if (!Number.isInteger(c.board?.reels) || !Number.isInteger(c.board?.rows) || c.board.reels < 3 || c.board.rows < 3) {
    err('board', 'reels and rows must be integers >= 3');
  }

  const s = c.symbols;
  const all = [...(s?.paying ?? []), s?.wild, s?.scatter, s?.multiplier];
  if (new Set(all).size !== all.length) err('symbols', 'symbol ids must be unique across paying, wild, scatter, multiplier');
  if (all.some((x) => typeof x !== 'string' || !/^[A-Za-z][A-Za-z0-9]{0,7}$/.test(x))) err('symbols', 'symbol ids are 1-8 alphanumerics starting with a letter');

  const tiers = c.paytable?.tiers ?? [];
  tiers.forEach(([lo, hi], i) => {
    if (!(Number.isInteger(lo) && Number.isInteger(hi) && lo <= hi)) err(`paytable.tiers[${i}]`, 'need integers lo <= hi');
    if (i > 0 && lo !== tiers[i - 1][1] + 1) err(`paytable.tiers[${i}]`, 'tiers must be contiguous and ascending');
  });
  if (tiers.length && tiers[tiers.length - 1][1] > c.board.reels * c.board.rows) {
    warn('paytable.tiers', 'top tier ends above the number of board cells (harmless, unreachable sizes)');
  }
  for (const p of s?.paying ?? []) {
    const pays = c.paytable?.pays?.[p];
    if (!pays || pays.length !== tiers.length) err(`paytable.pays.${p}`, `needs ${tiers.length} values, one per tier`);
    else if (pays.some((v) => !isPayStep(v))) err(`paytable.pays.${p}`, 'pays must be multiples of 0.1x: Stake books pay in steps of 0.1x, so a pay such as 2.63x cannot be published (use 2.6x)');
    else if (pays.some((v, i) => !(v > 0) || (i > 0 && v < pays[i - 1]))) err(`paytable.pays.${p}`, 'values must be positive and non-decreasing');
    else if (pays.some((v) => v > (c.modes?.[0]?.maxWin ?? 5000))) err(`paytable.pays.${p}`, `a single pay cannot be above the max win (${c.modes?.[0]?.maxWin ?? 5000}x)`);
  }
  for (const k of Object.keys(c.paytable?.pays ?? {})) if (!(s?.paying ?? []).includes(k)) err(`paytable.pays.${k}`, 'not a paying symbol');

  if (!Number.isInteger(c.scatterRule?.spinsPerScatter) || c.scatterRule.spinsPerScatter < 1) err('scatterRule.spinsPerScatter', 'positive integer');
  for (const g of ['base', 'free'] as const) {
    const t = c.freeSpinTriggers?.[g] ?? {};
    const keys = Object.keys(t).map(Number);
    if (!keys.length || keys.some((k) => !Number.isInteger(k) || k < 1)) err(`freeSpinTriggers.${g}`, 'needs integer scatter counts');
    if (Object.values(t).some((v) => !Number.isInteger(v) || v < 1)) err(`freeSpinTriggers.${g}`, 'spin awards must be positive integers');
    const award = Object.entries(t).map(([k, v]) => [Number(k), v] as const).sort((x, y) => x[0] - y[0]);
    const dip = award.find(([, v], i) => i > 0 && v < award[i - 1][1]);
    if (dip) warn(`freeSpinTriggers.${g}`, `${dip[0]} scatters award fewer spins (${dip[1]}) than fewer scatters do: players expect more scatters to give more`);
  }

  for (const [k, v] of Object.entries(c.scatterRule?.pays ?? {})) {
    if (!Number.isInteger(Number(k)) || Number(k) < 2 || Number(k) > 12) err(`scatterRule.pays.${k}`, 'scatter counts from 2 to 12');
    else if (!isPayStep(v) || !(v > 0) || v > (c.modes?.[0]?.maxWin ?? 5000)) err(`scatterRule.pays.${k}`, 'a scatter pay is a multiple of 0.1x above 0 and not above the max win');
  }
  const known = new Set(all as string[]);
  const sets = c.reels?.sets ?? {};
  if (!(c.reels?.rows >= 50)) err('reels.rows', 'at least 50 rows per reel strip');
  for (const [name, w] of Object.entries(sets)) {
    for (const [sym, n] of Object.entries(w)) {
      if (!known.has(sym)) err(`reels.sets.${name}.${sym}`, 'unknown symbol');
      if (!(n > 0)) err(`reels.sets.${name}.${sym}`, 'weight must be > 0');
    }
    for (const must of [...(s?.paying ?? []), ...(c.freeSpins === false ? [] : [s?.scatter])]) if (!(w[must] > 0)) err(`reels.sets.${name}`, `must contain ${must}`);
    if (c.freeSpins === false && w[s?.scatter] !== undefined) err(`reels.sets.${name}`, `a game without free spins has no ${s?.scatter} on its reels`);
  }

  if (c.gameType !== undefined && !GAME_TYPES.includes(c.gameType)) err('gameType', `unknown game type ${String(c.gameType)}`);
  if (c.gameType === 'paylines') {
    const reelsN = c.board?.reels ?? 0; const rowsN = c.board?.rows ?? 0; const lines = c.paylines ?? [];
    if (!lines.length) err('paylines', 'switch on at least one payline');
    if (lines.length > 40) err('paylines', 'at most 40 paylines');
    lines.forEach((l, i) => { if (!Array.isArray(l) || l.length !== reelsN || l.some((r) => !Number.isInteger(r) || r < 0 || r >= rowsN)) err(`paylines[${i}]`, `a payline has one row from 0 to ${rowsN - 1} for each of the ${reelsN} reels`); });
    if (new Set(lines.map((l) => l.join(','))).size !== lines.length) err('paylines', 'two paylines are the same');
  } else if (c.paylines) err('paylines', 'paylines belong to a paylines game');
  if (c.tumble && c.reelHeights) err('tumble', 'tumbles and reels that change height are not combined yet: switch one off');
  if (c.reelHeights) {
    const h = c.reelHeights;
    if (c.gameType !== 'ways') err('reelHeights', 'changing reel heights belongs to a ways game');
    else if (!(Number.isInteger(h.min) && Number.isInteger(h.max) && h.min >= 2 && h.max >= h.min && h.max === c.board.rows)) err('reelHeights', `reels change between a minimum of 2 or more and a maximum equal to the rows (${c.board?.rows})`);
  }
  const modes = c.modes ?? [];
  if (c.freeSpins === false) {
    if (modes.some((m) => m.isBuyBonus)) err('modes', 'a bonus buy starts free spins: add free spins first');
    if (modes.some((m) => m.distributions.some((d) => d.criteria === 'freegame' || d.conditions.forceFreegame))) err('modes', 'a game without free spins has no free spins distribution');
    if (Object.keys(c.scatterRule?.pays ?? {}).length) err('scatterRule.pays', 'scatter cash needs scatters on the reels: add free spins first');
    if ((c.features ?? []).some((f) => f.where.includes('free'))) err('features', 'a feature works in free spins, but the game has none');
  }
  if (!modes.length || modes[0].name !== 'base') err('modes[0]', 'first mode must be named "base"');
  const minCost = Math.min(...modes.map((m) => m.cost));
  const rtps = modes.map((m) => m.rtp);
  modes.forEach((m, i) => {
    const p = `modes[${i}]`;
    if (!/^[a-z][a-z0-9_]{1,23}$/.test(m.name ?? '')) err(`${p}.name`, 'mode id: lowercase letters, digits and underscores, 2 to 24 characters');
    if (m.displayName !== undefined && !(m.displayName.trim().length >= 1 && m.displayName.length <= 40)) err(`${p}.displayName`, 'bonus name: 1 to 40 characters');
    if (i === 0 && m.cost !== 1) err(`${p}.cost`, 'base mode must cost exactly 1.0');
    if (i === 0 && m.cost !== minCost) err(`${p}.cost`, 'base mode must be the cheapest');
    if (m.isAnte) {
      if (m.name !== 'ante') err(`${p}.name`, 'the ante mode is named ante');
      if (m.isBuyBonus) err(`${p}.isBuyBonus`, 'an ante bet is not a bonus buy');
      if (m.cost !== 2 && m.cost !== 3) err(`${p}.cost`, 'an ante bet costs 2x or 3x the bet');
      if (modes.filter((x) => x.isAnte).length > 1) err(p, 'only one ante bet');
    }
    if (i > 0 && !isRoundCost(m.cost)) err(`${p}.cost`, `${m.cost}x is not a round number: use a whole number such as 5, 10, 25, 50, 75, 100, 150, 200, 250, 500, 1000 (not 5.233, 10.2 or 809)`);
    if (m.cost > LIMITS.engineMaxCost) err(`${p}.cost`, `exceeds the Engine limit ${LIMITS.engineMaxCost}x`);
    else if (m.cost > LIMITS.foundryMaxCost) err(`${p}.cost`, `exceeds the Foundry limit ${LIMITS.foundryMaxCost}x (2-star tier)`);
    if (m.rtp < LIMITS.engineRtpMin || m.rtp > LIMITS.engineRtpMax) err(`${p}.rtp`, `Engine band is ${LIMITS.engineRtpMin} to ${LIMITS.engineRtpMax}`);
    else if (m.rtp > LIMITS.foundryRtpMax) err(`${p}.rtp`, `above the Foundry ceiling ${LIMITS.foundryRtpMax} (keep margin under the Engine limit)`);
    if (m.maxWin > LIMITS.engineMaxPayout) err(`${p}.maxWin`, `exceeds the Engine limit ${LIMITS.engineMaxPayout}x`);
    else if (m.maxWin > LIMITS.foundryMaxPayout) err(`${p}.maxWin`, `exceeds the Foundry limit ${LIMITS.foundryMaxPayout}x (2-star tier)`);
    const q = m.distributions.reduce((a, d) => a + d.quota, 0);
    if (!near(q, 1, 1e-9)) err(`${p}.distributions`, `quotas sum to ${q}, need 1`);
    const names = new Set<string>();
    m.distributions.forEach((d, j) => {
      const dp = `${p}.distributions[${j}]`;
      if (names.has(d.criteria)) err(dp, `duplicate criteria ${d.criteria}`);
      names.add(d.criteria);
      if (d.criteria === 'wincap' && d.winCriteria !== m.maxWin) err(dp, 'wincap winCriteria must equal the mode maxWin');
      for (const g of ['base', 'free'] as const) {
        for (const set of Object.keys(d.conditions.reelWeights?.[g] ?? {})) if (!sets[set]) err(`${dp}.conditions.reelWeights.${g}`, `unknown reel set ${set}`);
      }
      if (d.conditions.forceWincap) {
        // Measured on the pilot: a weighted multiplier share of about 1.4% never reached the cap (endless redraws); 4.7% did.
        const free = d.conditions.reelWeights?.free ?? {};
        const wsum = Object.values(free).reduce((x, y) => x + y, 0) || 1;
        let share = 0;
        for (const [set, weight] of Object.entries(free)) {
          const w = sets[set] ?? {};
          const total = Object.values(w).reduce((x, y) => x + y, 0) || 1;
          share += (weight / wsum) * ((w[s.multiplier] ?? 0) / total);
        }
        if (share < 0.03) warn(`${dp}.conditions.reelWeights.free`, `weighted multiplier share ${(share * 100).toFixed(1)}% is low; a forced win-cap round may never be found (raise it; 4.7% worked, 1.4% did not)`);
      }
      if (d.conditions.startMult !== undefined && !(Number.isInteger(d.conditions.startMult) && d.conditions.startMult >= 1 && d.conditions.startMult <= 20)) err(`${dp}.conditions.startMult`, 'starting multiplier must be a whole number from 1 to 20');
      if (d.conditions.extraSpins !== undefined && !(Number.isInteger(d.conditions.extraSpins) && d.conditions.extraSpins >= 0 && d.conditions.extraSpins <= 30)) err(`${dp}.conditions.extraSpins`, 'extra spins must be a whole number from 0 to 30');
      if (d.conditions.forceFreegame && !d.conditions.scatterTriggers) err(dp, 'forceFreegame needs scatterTriggers');
      if (d.conditions.forceFreegame && d.conditions.scatterTriggers && Object.keys(d.conditions.scatterTriggers).some((k) => !(Number(k) >= 1 && Number(k) <= c.board.reels))) err(`${dp}.conditions.scatterTriggers`, `a forced board puts one scatter on each reel, so it can hold at most ${c.board.reels} scatters (the SDK would search forever for more)`);
      if (d.conditions.forceFreegame && !d.conditions.reelWeights.free) err(dp, 'forceFreegame needs free reel weights');
    });
    const opt = c.optimization?.[m.name];
    if (!opt) err(`optimization.${m.name}`, 'missing optimiser settings for this mode');
    else {
      for (const k of Object.keys(opt.conditions)) if (!names.has(k)) err(`optimization.${m.name}.conditions.${k}`, 'no distribution with this criteria');
      for (const k of names) if (!opt.conditions[k] && k !== 'wincap') warn(`optimization.${m.name}.conditions`, `criteria ${k} has no optimiser condition`);
      const sum = Object.values(opt.conditions).reduce((a, x) => a + (typeof x.rtp === 'number' ? x.rtp : 0), 0);
      if (!near(sum, m.rtp)) err(`optimization.${m.name}.conditions`, `condition RTPs sum to ${sum.toFixed(6)}, mode rtp is ${m.rtp}`);
    }
    const books = c.run?.books?.[m.name];
    if (!(Number.isInteger(books) && books >= 1000)) err(`run.books.${m.name}`, 'integer >= 1000');
  });
  if (rtps.length && Math.max(...rtps) - Math.min(...rtps) > LIMITS.foundryRtpSpread) err('modes', `RTP spread above ${LIMITS.foundryRtpSpread}`);
  for (const i of validateFeatures(allFeatures(c), { cells: (c.board?.reels ?? 0) * (c.board?.rows ?? 0), symbols: [...(c.symbols?.paying ?? []), c.symbols?.wild, c.symbols?.scatter, c.symbols?.multiplier], places: ['base', 'free', ...(c.modes ?? []).filter((m) => m.isBuyBonus || m.isAnte).map((m) => m.name)], tumbles: hasTumbles(c.gameType, c.tumble), positional: !!c.gameType && c.gameType !== 'anywhere', reels: c.board?.reels, rows: c.board?.rows })) err(i.path.replace(new RegExp(`^features\\[${(c.features ?? []).length}\\]`), 'gadgetBar'), i.message);
  if (!(c.limits?.maxEventsPerRound >= 50)) err('limits.maxEventsPerRound', 'integer >= 50');
  if (!(c.run?.threads >= 1 && c.run?.batch >= 100)) err('run', 'threads >= 1 and batch >= 100');
  return out;
}
