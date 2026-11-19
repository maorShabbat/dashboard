// Pure helpers behind the builder screens (no React), so they can be unit tested.
import { defaultGadgetBar, fitGadgetBar, gadgetBarCells, hasTumbles, migrateFeatures, type Feature, type GadgetBar } from '../compiler/features';
import start from '../examples/t1-demo.config.json';
import { spinTable, isPayStep, isRoundCost, snapPay, validate, type GameConfig, type GameType, type Issue } from '../compiler/config';
import { tunePays } from './sim';
import { paylineLibrary, sameLine } from '../compiler/paylines';

export const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

/** Next free symbol id for a new paying symbol: H5, H6 ... or L5 ... */
export function nextSymbolId(c: GameConfig, prefix: 'H' | 'L'): string {
  const all = new Set([...c.symbols.paying, c.symbols.wild, c.symbols.scatter, c.symbols.multiplier]);
  for (let i = 1; i < 100; i++) if (!all.has(`${prefix}${i}`)) return `${prefix}${i}`;
  return `${prefix}99`;
}

/** Add a paying symbol with pays copied from the cheapest existing one, and a modest weight in every reel set. */
export function addPaying(c: GameConfig, id: string): GameConfig {
  const n = clone(c);
  const last = n.symbols.paying[n.symbols.paying.length - 1];
  n.symbols.paying.push(id);
  n.paytable.pays[id] = last ? [...n.paytable.pays[last]] : n.paytable.tiers.map(() => 1);
  for (const w of Object.values(n.reels.sets)) w[id] = 20;
  return n;
}

export function removePaying(c: GameConfig, id: string): GameConfig {
  const n = clone(c);
  n.symbols.paying = n.symbols.paying.filter((s) => s !== id);
  delete n.paytable.pays[id];
  for (const w of Object.values(n.reels.sets)) delete w[id];
  return n;
}

/** Rename a symbol id everywhere it appears. */
export function renameSymbol(c: GameConfig, from: string, to: string): GameConfig {
  if (from === to) return c;
  const n = clone(c);
  const s = n.symbols;
  s.paying = s.paying.map((x) => (x === from ? to : x));
  if (s.wild === from) s.wild = to;
  if (s.scatter === from) s.scatter = to;
  if (s.multiplier === from) s.multiplier = to;
  if (n.paytable.pays[from]) { n.paytable.pays[to] = n.paytable.pays[from]; delete n.paytable.pays[from]; }
  for (const w of Object.values(n.reels.sets)) if (from in w) { w[to] = w[from]; delete w[from]; }
  return n;
}

/** Re-shape every symbol's pays when the tier list changes (new tier copies the last pay, removed tier drops it). */
export function setTiers(c: GameConfig, tiers: [number, number][]): GameConfig {
  const n = clone(c);
  n.paytable.tiers = tiers;
  for (const p of n.symbols.paying) {
    const cur = n.paytable.pays[p] ?? [];
    n.paytable.pays[p] = tiers.map((_, i) => cur[i] ?? cur[cur.length - 1] ?? 1);
  }
  return n;
}

/** Share of each symbol in a reel set, as fractions. */
export function shares(set: Record<string, number>): Record<string, number> {
  const t = Object.values(set).reduce((a, b) => a + b, 0) || 1;
  return Object.fromEntries(Object.entries(set).map(([k, v]) => [k, v / t]));
}

/** Rounding hints for a cost that is not a round number: the nearest allowed ones. */
export function nearestRoundCosts(cost: number): number[] {
  const out: number[] = [];
  for (let e = 0; e <= 4; e++) for (const d of [1, 1.5, 2, 2.5, 3, 4, 5, 7.5]) {
    const v = d * 10 ** e;
    if (Number.isInteger(v) && isRoundCost(v)) out.push(v);
  }
  return [...new Set(out)].sort((a, b) => Math.abs(a - cost) - Math.abs(b - cost)).slice(0, 3).sort((a, b) => a - b);
}

export interface Summary { cells: number; payingCount: number; minCluster: number; maxCluster: number; modes: { name: string; cost: number; rtp: number; maxWin: number }[] }
export function summarize(c: GameConfig): Summary {
  return {
    cells: c.board.reels * c.board.rows,
    payingCount: c.symbols.paying.length,
    minCluster: c.paytable.tiers[0]?.[0] ?? 0,
    maxCluster: c.paytable.tiers[c.paytable.tiers.length - 1]?.[1] ?? 0,
    modes: c.modes.map((m) => ({ name: m.name, cost: m.cost, rtp: m.rtp, maxWin: m.maxWin })),
  };
}

export interface Grouped { section: string; issues: Issue[] }
const SECTIONS: [RegExp, string][] = [
  [/^(board|limits)/, 'board'],
  [/^(id|name|version|template|run)/, 'game'],
  [/^(symbols|paytable)/, 'symbols'],
  [/^reels/, 'reels'],
  [/^(scatterRule|freeSpinTriggers|features)/, 'features'],
  [/^(modes|optimization)/, 'modes'],
];
export function sectionOf(path: string): string { return SECTIONS.find(([r]) => r.test(path))?.[1] ?? 'game'; }
export function groupIssues(issues: Issue[]): Record<string, Issue[]> {
  const out: Record<string, Issue[]> = { game: [], board: [], symbols: [], reels: [], features: [], modes: [] };
  for (const i of issues) out[sectionOf(i.path)].push(i);
  return out;
}

export function safeValidate(c: GameConfig): Issue[] {
  try { return validate(c); } catch (e) { return [{ level: 'error', path: 'config', message: `config is incomplete: ${(e as Error).message}` }]; }
}

/** Parse pasted config JSON; returns the config or a readable error. */
export function parseConfig(text: string): { config?: GameConfig; error?: string } {
  try {
    const c = JSON.parse(text) as GameConfig;
    if (!c || typeof c !== 'object' || !c.board || !c.symbols || !c.modes) return { error: 'This does not look like a Foundry game config (board, symbols and modes are missing).' };
    return { config: c };
  } catch (e) { return { error: `Not valid JSON: ${(e as Error).message}` }; }
}

// ---- plain-language controls (the wizard hides weights, tiers and tables behind these) ----

const PALETTE = ['#ff5d73', '#35d3a0', '#ffb43a', '#4b8bff', '#b26bff', '#ff8a3d', '#38c8ff', '#e6e9f5', '#9be15d', '#ff7ac8'];
const SPECIAL_COLORS: Record<string, string> = { W: '#22b55a', S: '#16b7c9', M: '#f0902a' };
export function symbolLook(c: GameConfig, id: string): { name: string; color: string; image?: string } {
  const l = c.look?.[id];
  const kind = id === c.symbols.wild ? 'W' : id === c.symbols.scatter ? 'S' : id === c.symbols.multiplier ? 'M' : '';
  const idx = Math.max(0, c.symbols.paying.indexOf(id));
  return { name: l?.name || id, color: l?.color || SPECIAL_COLORS[kind] || PALETTE[idx % PALETTE.length], ...(l?.image ? { image: l.image } : {}) };
}
export function setLook(c: GameConfig, id: string, patch: { name?: string; color?: string; image?: string | null; asset?: string | null }): GameConfig {
  const n = clone(c);
  n.look = n.look ?? {};
  const cur = { ...(n.look[id] ?? {}) };
  if (patch.name !== undefined) cur.name = patch.name;
  if (patch.color !== undefined) cur.color = patch.color;
  if (patch.image === null) { delete cur.image; delete cur.asset; } else if (patch.image !== undefined) cur.image = patch.image;
  if (patch.asset === null) delete cur.asset; else if (patch.asset !== undefined) cur.asset = patch.asset;
  n.look[id] = cur;
  return n;
}

/** The tier a single "how much does it pay" number refers to: 11-13 matching in the demo (or the middle tier). */
export function anchorTier(c: GameConfig): number {
  const t = c.paytable.tiers;
  const i = t.findIndex(([lo, hi]) => lo <= 12 && 12 <= hi);
  return i >= 0 ? i : Math.floor(t.length / 2);
}
/** Set one symbol's payout level (pay for the anchor group size); the other sizes scale with it. */
export function setPayLevel(c: GameConfig, id: string, value: number): GameConfig {
  const n = clone(c);
  const row = n.paytable.pays[id];
  const a = anchorTier(n);
  if (!row || !(value > 0)) return c;
  const f = value / (row[a] || 1);
  n.paytable.pays[id] = row.map((v, i) => snapPay(i === a ? value : v * f));
  // keep non-decreasing
  for (let i = 1; i < n.paytable.pays[id].length; i++) if (n.paytable.pays[id][i] < n.paytable.pays[id][i - 1]) n.paytable.pays[id][i] = n.paytable.pays[id][i - 1];
  return n;
}

/** Target return for every mode at once (modes must stay within 0.2% of each other). The optimiser targets are rescaled to match. */
export function setReturn(c: GameConfig, rtp: number): GameConfig {
  const n = clone(c);
  for (const m of n.modes) {
    const opt = n.optimization[m.name];
    const sum = opt ? Object.values(opt.conditions).reduce((a, x) => a + (typeof x.rtp === 'number' ? x.rtp : 0), 0) : 0;
    if (opt && sum > 0) for (const x of Object.values(opt.conditions)) if (typeof x.rtp === 'number') x.rtp = Math.round((x.rtp * rtp / sum) * 1e6) / 1e6;
    m.rtp = rtp;
    // absorb rounding drift in the largest condition
    if (opt) {
      const entries = Object.values(opt.conditions).filter((x) => typeof x.rtp === 'number') as { rtp: number }[];
      const drift = rtp - entries.reduce((a, x) => a + x.rtp, 0);
      if (entries.length) { const big = entries.reduce((a, b) => (b.rtp > a.rtp ? b : a)); big.rtp = Math.round((big.rtp + drift) * 1e6) / 1e6; }
    }
  }
  const ante = n.modes.find((m) => m.isAnte);
  return ante ? setAnte(n, ante.cost as 2 | 3) : n;
}

/** Free spin rule in plain terms: how many scatters trigger the feature and how many spins each one awards. */
export function setFreeSpinRule(c: GameConfig, minScatters: number, spinsPerScatter: number): GameConfig {
  const n = clone(c);
  const top = Math.max(10, minScatters + 6);
  n.scatterRule.spinsPerScatter = spinsPerScatter;
  const base: Record<string, number> = {};
  for (let k = minScatters; k <= top; k++) base[String(k)] = k * spinsPerScatter;
  n.freeSpinTriggers.base = base; delete n.scatterRule.custom;
  return n;
}
export function freeSpinMin(c: GameConfig): number { return Math.min(...Object.keys(c.freeSpinTriggers.base).map(Number)); }

/** Downscale an uploaded picture to a small data URL so the config stays light. */
export async function pictureToDataUrl(file: Blob, size = 96): Promise<string> {
  const bmp = await createImageBitmap(file);
  const cv = document.createElement('canvas'); cv.width = size; cv.height = size;
  const g = cv.getContext('2d')!;
  const k = Math.min(size / bmp.width, size / bmp.height);
  g.drawImage(bmp, (size - bmp.width * k) / 2, (size - bmp.height * k) / 2, bmp.width * k, bmp.height * k);
  return cv.toDataURL('image/png');
}

/** Smallest group that wins (for pay anywhere). Widens or trims the first pay tier; pays stay as they are. */
export function setMinMatch(c: GameConfig, n: number): GameConfig {
  const t = clone(c.paytable.tiers);
  if (!t.length || !Number.isInteger(n) || n < 2) return c;
  if (n > t[0][1]) { while (t.length > 1 && n > t[0][1]) t.shift(); t[0][0] = Math.min(n, t[0][1]); } else t[0][0] = n;
  return setTiers(c, t);
}
export const minMatch = (c: GameConfig): number => c.paytable.tiers[0]?.[0] ?? 0;

/** One "how often does it appear" number per symbol. Paying symbols and the wild use the same weight in the main game and the free spins. */
export function setFrequency(c: GameConfig, id: string, weight: number): GameConfig {
  const n = clone(c);
  const [baseName, freeName] = Object.keys(n.reels.sets);
  const names = [baseName, ...(freeName && freeName !== 'WCAP' ? [freeName] : [])];
  const isScatter = id === n.symbols.scatter;
  const w = Math.max(isScatter || n.symbols.paying.includes(id) ? 1 : 0, Math.round(weight));
  const before = n.reels.sets[baseName]?.[id] ?? 0;
  for (const name of names) {
    const set = n.reels.sets[name];
    if (!set) continue;
    if (name === baseName) set[id] = w;
    else if (isScatter && before > 0) set[id] = Math.max(1, Math.round(((set[id] ?? before) / before) * w));
    else set[id] = w;
    if (!set[id]) delete set[id];
  }
  return n;
}
export const frequency = (c: GameConfig, id: string): number => c.reels.sets[Object.keys(c.reels.sets)[0]]?.[id] ?? 0;

// ---- ready-made styles: one click sets payouts and frequencies together ----
export interface Feel { id: 'low' | 'medium' | 'high'; name: string; tagline: string; detail: string; pay: [number, number]; weight: [number, number]; wildWeight: number }
export const FEELS: Feel[] = [
  { id: 'low', name: 'Low volatility', tagline: 'Frequent, smaller wins', detail: 'High hit frequency with modest top pays. Steady balance, long sessions.', pay: [9, 2], weight: [38, 42], wildWeight: 8 },
  { id: 'medium', name: 'Medium volatility', tagline: 'Balanced', detail: 'A mix of regular small wins and occasional big hits. A safe starting point.', pay: [15, 1.5], weight: [28, 40], wildWeight: 6 },
  { id: 'high', name: 'High volatility', tagline: 'Rare, larger wins', detail: 'Lower hit frequency with big top pays. Swingy balance, bigger max-win potential.', pay: [30, 1], weight: [18, 44], wildWeight: 4 },
];
export function applyFeel(c: GameConfig, id: Feel['id']): GameConfig {
  const f = FEELS.find((x) => x.id === id)!;
  let n = clone(c);
  const ps = n.symbols.paying; const last = Math.max(1, ps.length - 1);
  ps.forEach((p, i) => {
    const r = i / last;
    n = setPayLevel(n, p, Math.round((f.pay[0] + (f.pay[1] - f.pay[0]) * r) * 10) / 10);
    n = setFrequency(n, p, Math.round(f.weight[0] + (f.weight[1] - f.weight[0]) * r));
  });
  return setFrequency(n, n.symbols.wild, f.wildWeight);
}
export const SPIN_STYLES: { id: string; name: string; tagline: string; min: number; per: number }[] = [
  { id: 'tight', name: 'Tight', tagline: '4 scatters, 2 spins each', min: 4, per: 2 },
  { id: 'classic', name: 'Classic', tagline: '3 scatters, 2 spins each', min: 3, per: 2 },
  { id: 'generous', name: 'Generous', tagline: '3 scatters, 5 spins each', min: 3, per: 5 },
];

// ---- flexible win ranges: the author picks where each range starts; each ends one before the next, the last runs to the board size ----
export const rangeStarts = (c: GameConfig): number[] => c.paytable.tiers.map((t) => t[0]);
export function setRangeStarts(c: GameConfig, starts: number[]): GameConfig {
  const cells = c.board.reels * c.board.rows;
  const s: number[] = [];
  starts.forEach((v, i) => { const lo = i === 0 ? 2 : s[i - 1] + 1; s.push(Math.max(lo, Math.min(Math.round(v) || lo, cells - (starts.length - 1 - i)))); });
  const tiers = s.map((lo, i) => [lo, i === s.length - 1 ? cells : s[i + 1] - 1] as [number, number]);
  return setTiers(c, tiers);
}
export function rangeLabel(c: GameConfig, i: number): string {
  const [lo, hi] = c.paytable.tiers[i];
  const last = i === c.paytable.tiers.length - 1;
  return last ? `${lo}+` : lo === hi ? `${lo}` : `${lo}-${hi}`;
}

/** A defensible starting paytable: payouts follow the symbol order (top symbol pays most) and rarer symbols pay more, then the whole table is tuned onto the target RTP. */
export function suggestPays(c: GameConfig): { config: GameConfig; rtp: number } {
  const set = c.reels.sets[Object.keys(c.reels.sets)[0]] ?? {};
  const total = Object.values(set).reduce((a, b) => a + b, 0) || 1;
  const ps = c.symbols.paying; const last = Math.max(1, ps.length - 1);
  const rar = ps.map((p) => total / Math.max(1, set[p] ?? 1));
  const med = [...rar].sort((a, b) => a - b)[Math.floor(rar.length / 2)] || 1;
  let n = c;
  ps.forEach((p, i) => { const curve = 20 * Math.pow(1.2 / 20, i / last); n = setPayLevel(n, p, snapPay(curve * Math.pow(rar[i] / med, 0.5))); });
  const t = tunePays(n, c.modes[0].rtp, 60000);
  const out = clone(n);
  for (const p of ps) out.paytable.pays[p] = out.paytable.pays[p].map((v) => snapPay(v * t.factor));
  return { config: out, rtp: t.rtp };
}

export type SymbolKind = 'high' | 'low' | 'wild' | 'scatter' | 'multiplier';
export function symbolKind(c: GameConfig, id: string): SymbolKind {
  if (id === c.symbols.wild) return 'wild';
  if (id === c.symbols.scatter) return 'scatter';
  if (id === c.symbols.multiplier) return 'multiplier';
  const i = c.symbols.paying.indexOf(id);
  return i < Math.ceil(c.symbols.paying.length / 2) ? 'high' : 'low';
}

// ---- Bonus Buy: the levers that give a purchase its value ----
export type MultPreset = 'standard' | 'boosted' | 'high';
export const MULT_PRESETS: Record<MultPreset, { name: string; blurb: string; weights: Record<string, number> }> = {
  standard: { name: 'Standard', blurb: 'Multiplier symbols are worth 2x to 10x, mostly the small ones.', weights: { '2': 100, '4': 80, '5': 50, '7': 20, '10': 10 } },
  boosted: { name: 'Boosted', blurb: 'Bigger multipliers appear more often: 2x up to 25x.', weights: { '2': 60, '3': 50, '5': 50, '10': 30, '15': 15, '25': 5 } },
  high: { name: 'High', blurb: 'Rare but huge: 5x up to 100x. Very swingy.', weights: { '5': 50, '10': 40, '25': 20, '50': 8, '100': 2 } },
};
export interface BonusSettings { minScatters: number; maxScatters: number; chanceMax: number; extraSpins: number; startMult: number; multPreset: MultPreset; multBoost: number; wildBoost: number; premiumBoost: number; scatterBoost: number }
export const BONUS_DEFAULTS: Pick<BonusSettings, 'extraSpins' | 'startMult' | 'multPreset' | 'multBoost' | 'wildBoost' | 'premiumBoost' | 'scatterBoost'> = { extraSpins: 0, startMult: 1, multPreset: 'standard', multBoost: 1, wildBoost: 1, premiumBoost: 1, scatterBoost: 1 };

/** The purchased bonus with this id (mode name); without an id, the first one. */
function bonusMode(c: GameConfig, id?: string) { return c.modes.find((m) => m.isBuyBonus && (id === undefined || m.name === id)); }
function bonusDist(c: GameConfig, id?: string) { return bonusMode(c, id)?.distributions.find((d) => d.criteria === 'freegame'); }
/** Name of the boosted free-spins reel set of a bonus. The default bonus ('bonus') keeps the name FRB. */
export const boostedSetName = (id: string) => (id === 'bonus' ? 'FRB' : `FRB_${id}`);
function baseFreeSet(c: GameConfig): string { const names = Object.keys(c.reels.sets); return names.includes('FR0') ? 'FR0' : names.find((n) => n !== names[0] && !n.startsWith('FRB') && n !== 'WCAP') ?? names[0]; }
const premiumSymbols = (c: GameConfig) => c.symbols.paying.slice(0, Math.ceil(c.symbols.paying.length / 2));

export function getBonusSettings(c: GameConfig, id?: string): BonusSettings | null {
  const bm = bonusMode(c, id); const d = bonusDist(c, id); if (!d || !bm) return null;
  const t = d.conditions.scatterTriggers ?? { '4': 1 };
  const keys = Object.keys(t).map(Number).sort((a, b) => a - b);
  const total = Object.values(t).reduce((a, b) => a + b, 0) || 1;
  const hi = keys[keys.length - 1];
  const mv = JSON.stringify(Object.entries(d.conditions.multValues?.free ?? {}).sort());
  const preset = (Object.keys(MULT_PRESETS) as MultPreset[]).find((k) => JSON.stringify(Object.entries(MULT_PRESETS[k].weights).sort()) === mv) ?? 'standard';
  const free = c.reels.sets[baseFreeSet(c)] ?? {}; const boosted = c.reels.sets[boostedSetName(bm.name)];
  const ratio = (sym: string) => (boosted && free[sym] ? Math.max(1, Math.round((boosted[sym] ?? 0) / free[sym])) : 1);
  return {
    minScatters: keys[0], maxScatters: hi, chanceMax: keys.length > 1 ? Math.round(((t[String(hi)] ?? 0) / total) * 100) : 0,
    extraSpins: d.conditions.extraSpins ?? 0, startMult: d.conditions.startMult ?? 1, multPreset: preset,
    multBoost: ratio(c.symbols.multiplier), wildBoost: ratio(c.symbols.wild), premiumBoost: ratio(premiumSymbols(c)[0]), scatterBoost: ratio(c.symbols.scatter),
  };
}

/** Apply the Bonus Buy bundle to the config: guaranteed scatters, extra spins, starting multiplier, multiplier values and a boosted free-spins reel set. */
export function setBonusSettings(c: GameConfig, patch: Partial<BonusSettings>, id?: string): GameConfig {
  const cur = getBonusSettings(c, id); if (!cur) return c;
  const bid = bonusMode(c, id)!.name; const setName = boostedSetName(bid);
  const s = { ...cur, ...patch };
  const n = clone(c); const floor = freeSpinMin(n);
  const top = Math.max(floor, Math.min(10, n.board.reels)); // a forced board puts one scatter on a reel, so no more than the reels
  s.minScatters = Math.max(floor, Math.min(top, Math.round(s.minScatters)));
  s.maxScatters = Math.max(s.minScatters, Math.min(top, Math.round(s.maxScatters)));
  s.chanceMax = Math.max(0, Math.min(100, Math.round(s.chanceMax)));
  s.extraSpins = Math.max(0, Math.min(30, Math.round(s.extraSpins))); s.startMult = Math.max(1, Math.min(20, Math.round(s.startMult)));
  const freeName = baseFreeSet(n); const base = n.reels.sets[freeName];
  const boosted = s.multBoost > 1 || s.wildBoost > 1 || s.premiumBoost > 1 || s.scatterBoost > 1;
  if (boosted && base) {
    const copy = clone(base); const mul = (sym: string, k: number) => { if (k > 1 && copy[sym]) copy[sym] = Math.max(1, Math.round(copy[sym] * k)); };
    mul(n.symbols.multiplier, s.multBoost); mul(n.symbols.wild, s.wildBoost); mul(n.symbols.scatter, s.scatterBoost); for (const p of premiumSymbols(n)) mul(p, s.premiumBoost);
    n.reels.sets[setName] = copy;
  } else delete n.reels.sets[setName];
  for (const d of bonusMode(n, bid)!.distributions) {
    if (d.criteria === 'freegame') {
      d.conditions.scatterTriggers = s.minScatters === s.maxScatters ? { [String(s.minScatters)]: 1 } : { [String(s.minScatters)]: 100 - s.chanceMax, [String(s.maxScatters)]: s.chanceMax };
      if (!d.conditions.scatterTriggers[String(s.maxScatters)]) d.conditions.scatterTriggers[String(s.maxScatters)] = 1;
      d.conditions.multValues = { ...d.conditions.multValues, free: clone(MULT_PRESETS[s.multPreset].weights) };
      d.conditions.reelWeights.free = { [boosted && base ? setName : freeName]: 1 };
    }
    if (s.startMult > 1) d.conditions.startMult = s.startMult; else delete d.conditions.startMult;
    if (s.extraSpins > 0) d.conditions.extraSpins = s.extraSpins; else delete d.conditions.extraSpins;
  }
  return n;
}

/** What each perk adds to the average win of a purchase (x bet): the bundle with the perk, minus the bundle without it. */
export interface PerkValue { id: string; name: string; value: number }
export function perkBreakdown(c: GameConfig, withAvg: number, rounds: number, sim: (c: GameConfig, n: number) => number, id?: string): PerkValue[] {
  const s = getBonusSettings(c, id); if (!s) return [];
  const floor = freeSpinMin(c);
  const tests: { id: string; name: string; active: boolean; off: Partial<BonusSettings> }[] = [
    { id: 'scatters', name: 'Guaranteed scatters', active: s.maxScatters > floor || s.minScatters > floor, off: { minScatters: floor, maxScatters: floor, chanceMax: 0 } },
    { id: 'extraSpins', name: 'Extra free spins', active: s.extraSpins > 0, off: { extraSpins: 0 } },
    { id: 'startMult', name: 'Starting multiplier', active: s.startMult > 1, off: { startMult: 1 } },
    { id: 'multipliers', name: 'Multiplier symbols', active: s.multPreset !== 'standard' || s.multBoost > 1, off: { multPreset: 'standard', multBoost: 1 } },
    { id: 'wilds', name: 'Extra wilds', active: s.wildBoost > 1, off: { wildBoost: 1 } },
    { id: 'premium', name: 'Better symbols', active: s.premiumBoost > 1, off: { premiumBoost: 1 } },
    { id: 'retrigger', name: 'More retriggers', active: s.scatterBoost > 1, off: { scatterBoost: 1 } },
  ];
  return tests.filter((t) => t.active).map((t) => ({ id: t.id, name: t.name, value: withAvg - sim(setBonusSettings(c, t.off, id), rounds) }));
}

/** Every mode shares the first mode's max win, and each win-cap distribution must target exactly that value. Returns the same object when nothing needs fixing. */
export function syncMaxWin(c: GameConfig): GameConfig {
  c = migrateFeatures(c); // designs saved before features had a place and a trigger
  c = fitGadgetBar(c); // the top gadget bar has one cell for each reel (or row)
  // pays always sit on Stake's 0.1x step (older saved designs may carry cents)
  if (Object.values(c.paytable?.pays ?? {}).some((row) => row.some((v) => !isPayStep(v)))) {
    c = clone(c);
    for (const k of Object.keys(c.paytable.pays)) c.paytable.pays[k] = c.paytable.pays[k].map(snapPay);
  }
  // a forced board puts one scatter on each reel, so no distribution may ask for more scatters than the board has reels
  if (c.modes?.some((m) => m.distributions.some((d) => Object.keys(d.conditions.scatterTriggers ?? {}).some((k) => Number(k) > c.board.reels)))) {
    c = clone(c);
    for (const m of c.modes) for (const d of m.distributions) {
      const t = d.conditions.scatterTriggers; if (!t) continue;
      const fixed: Record<string, number> = {};
      for (const [k, w] of Object.entries(t)) { const key = String(Math.min(Number(k), c.board.reels)); fixed[key] = (fixed[key] ?? 0) + w; }
      d.conditions.scatterTriggers = fixed;
    }
  }
  const mw = c.modes?.[0]?.maxWin;
  if (!mw) return c;
  const bad = c.modes.some((m) => m.maxWin !== mw || m.distributions.some((d) => d.criteria === 'wincap' && d.winCriteria !== mw));
  if (!bad) return c;
  const n = clone(c);
  for (const m of n.modes) { m.maxWin = mw; for (const d of m.distributions) if (d.criteria === 'wincap') d.winCriteria = mw; }
  return n;
}

/** The Bonus Buy with every perk removed: the bare free spins at the minimum trigger. */
export function plainBonus(c: GameConfig, id?: string): GameConfig {
  const f = freeSpinMin(c);
  return setBonusSettings(c, { ...BONUS_DEFAULTS, minScatters: f, maxScatters: f, chanceMax: 0 }, id);
}

// ---- places, bonuses and feature instances
export interface Place { id: string; name: string; kind: 'base' | 'free' | 'bonus' | 'ante' }
/** Where a feature can work: the base game, the scatter-triggered free spins and every purchased bonus. */
export function places(c: GameConfig): Place[] {
  return [{ id: 'base', name: 'Base game', kind: 'base' }, ...(c.freeSpins === false ? [] : [{ id: 'free', name: 'Free spins', kind: 'free' as const }]), ...c.modes.filter((m) => m.isBuyBonus || m.isAnte).map((m) => ({ id: m.name, name: m.isAnte ? 'Ante bet' : (m.displayName ?? (m.name === 'bonus' ? 'Bonus buy' : m.name)), kind: (m.isAnte ? 'ante' : 'bonus') as 'ante' | 'bonus' }))];
}
export const bonusModes = (c: GameConfig) => c.modes.filter((m) => m.isBuyBonus);
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').replace(/^[0-9]/, 'b$&').slice(0, 20);
/** A free mode id for a new bonus called `name`. */
export function newBonusId(c: GameConfig, name: string): string {
  const taken = new Set([...c.modes.map((m) => m.name), 'base', 'free']);
  let base = slug(name); if (base.length < 2) base = 'bonus';
  let id = base; for (let i = 2; taken.has(id); i++) id = `${base.slice(0, 20 - String(i).length - 1)}_${i}`;
  return id;
}
/** Adds a purchasable bonus (a copy of the demo's bundle without perks) called `name`, priced at a placeholder until the estimate recommends one. */
export function addBonus(c: GameConfig, name: string, cost = 100): GameConfig {
  const n = clone(c); const src = start as unknown as GameConfig;
  const id = newBonusId(n, name);
  const t = clone(src.modes.find((x) => x.isBuyBonus)!);
  t.name = id; t.displayName = name.trim().slice(0, 40) || 'Bonus'; t.rtp = n.modes[0].rtp; t.maxWin = n.modes[0].maxWin; t.cost = cost;
  for (const d of t.distributions) { delete d.conditions.startMult; delete d.conditions.extraSpins; if (d.criteria === 'freegame') d.conditions.reelWeights.free = { [baseFreeSet(n)]: 1 }; }
  n.modes.push(t);
  n.optimization[id] = clone(src.optimization[src.modes.find((x) => x.isBuyBonus)!.name]);
  n.run.books[id] = src.run.books[src.modes.find((x) => x.isBuyBonus)!.name] ?? 10000;
  for (const [k, v] of Object.entries(src.reels.sets)) if (!n.reels.sets[k] && (k === 'WCAP')) n.reels.sets[k] = clone(v);
  return setReturn(n, n.modes[0].rtp);
}
export function renameBonus(c: GameConfig, id: string, name: string): GameConfig {
  const n = clone(c); const m = n.modes.find((x) => x.name === id && x.isBuyBonus); if (m) m.displayName = name.slice(0, 40); return n;
}
/** Removes a purchased bonus and every place it was named in; a feature that no longer works anywhere is deleted. */
export function removeBonus(c: GameConfig, id: string): GameConfig {
  const n = clone(c);
  n.modes = n.modes.filter((m) => !(m.isBuyBonus && m.name === id));
  delete n.optimization[id]; delete n.run.books[id]; delete n.reels.sets[boostedSetName(id)];
  if (n.features) { n.features = n.features.map((f) => ({ ...f, where: f.where.filter((w) => w !== id) })).filter((f) => f.where.length > 0); if (!n.features.length) delete n.features; }
  return n;
}
export function setBonusCost(c: GameConfig, id: string, cost: number): GameConfig {
  const n = clone(c); const m = n.modes.find((x) => x.name === id && x.isBuyBonus); if (m) m.cost = cost; return n;
}
export const featureById = (c: GameConfig, id: string) => c.features?.find((f) => f.id === id);
/** Adds a feature (or replaces the one with the same id). */
export function putFeature(c: GameConfig, f: Feature): GameConfig {
  const n = clone(c); const rest = (n.features ?? []).filter((x) => x.id !== f.id);
  const idx = (n.features ?? []).findIndex((x) => x.id === f.id);
  const next = idx >= 0 ? (n.features ?? []).map((x) => (x.id === f.id ? f : x)) : [...rest, f];
  n.features = next; return n;
}
export function dropFeature(c: GameConfig, id: string): GameConfig {
  const n = clone(c); n.features = (n.features ?? []).filter((x) => x.id !== id); if (!n.features.length) delete n.features; return n;
}

/** A fresh id for a feature of this type. */
export function newFeatureId(c: GameConfig, type: string): string {
  const ids = (c.features ?? []).map((f) => f.id); let id = type; for (let i = 2; ids.includes(id); i++) id = `${type}${i}`; return id;
}
/** Adds a saved feature template (or an AI-built one) as a new feature that works in `where`. */
export function addFeatureFrom(c: GameConfig, template: Omit<Feature, 'id' | 'where'>, where: string[]): { cfg: GameConfig; id: string } {
  const id = newFeatureId(c, template.type);
  return { cfg: putFeature(c, { ...clone(template), id, where } as Feature), id };
}
/** Makes a feature also work in `place` (a bonus id, 'base' or 'free'). */
export function enableIn(c: GameConfig, fid: string, place: string): GameConfig {
  const f = featureById(c, fid); if (!f || f.where.includes(place)) return c;
  return putFeature(c, { ...f, where: [...f.where, place] } as Feature);
}
/** Stops a feature working in `place`; with no place left it is removed. */
export function disableIn(c: GameConfig, fid: string, place: string): GameConfig {
  const f = featureById(c, fid); if (!f) return c;
  const where = f.where.filter((w) => w !== place);
  return where.length ? putFeature(c, { ...f, where } as Feature) : dropFeature(c, fid);
}
/** The features that work in a purchased bonus, as templates (no id and no place) for saving as a favorite. */
export const bonusFeatureTemplates = (c: GameConfig, id: string) => (c.features ?? []).filter((f) => f.where.includes(id)).map((f) => { const { id: _i, where: _w, ...rest } = clone(f); return rest as Omit<Feature, 'id' | 'where'>; });
/** Builds a new bonus from a saved one: its bundle, price and features. */
export function addBonusFrom(c: GameConfig, name: string, settings: BonusSettings, features: Omit<Feature, 'id' | 'where'>[], cost: number): { cfg: GameConfig; id: string } {
  let n = addBonus(c, name, cost); const id = n.modes[n.modes.length - 1].name;
  n = setBonusSettings(n, settings, id);
  for (const t of features) n = addFeatureFrom(n, t, [id]).cfg;
  return { cfg: n, id };
}

// ---- ante bet
export const anteMode = (c: GameConfig) => c.modes.find((m) => m.isAnte);
/**
 * Switches the ante bet on at 2x or 3x the bet, or off (null). The player pays more for every spin and the free spins come more often:
 * the optimiser targets the same RTP on the higher price, so the free-spin hit rate rises by (price x RTP share left for free spins) / the base share.
 */
export interface AnteSettings { freeSpins: boolean; wilds: number; symbols: number }
export const ANTE_DEFAULTS: AnteSettings = { freeSpins: true, wilds: 1, symbols: 1 };
export const getAnte = (c: GameConfig): AnteSettings | null => { const a = anteMode(c); return a ? { ...ANTE_DEFAULTS, ...(a.ante ?? {}) } : null; };
export function setAnte(c: GameConfig, cost: 2 | 3 | null, patch: Partial<AnteSettings> = {}): GameConfig {
  const n = clone(c); const prev = getAnte(c);
  n.modes = n.modes.filter((m) => !m.isAnte); delete n.optimization.ante; delete n.run.books.ante; delete n.reels.sets.ANTE;
  if (n.features) { n.features = n.features.map((f) => ({ ...f, where: cost === null ? f.where.filter((w) => w !== 'ante') : f.where })).filter((f) => f.where.length > 0); if (!n.features.length) delete n.features; }
  if (cost === null) return n;
  const st: AnteSettings = { ...ANTE_DEFAULTS, ...(prev ?? {}), ...patch };
  if (c.freeSpins === false) st.freeSpins = false; // nothing to make more frequent
  const base = n.modes[0]; const opt = n.optimization[base.name];
  const f = opt.conditions.freegame; const b = opt.conditions.basegame; const w = opt.conditions.wincap;
  // a game without free spins has neither condition: their shares are 0 and the base game carries the whole return
  const fBase = typeof f?.rtp === 'number' ? f.rtp : f || c.freeSpins === false ? 0 : 0.37; const bBase = typeof b?.rtp === 'number' ? b.rtp : 0.59; const wBase = typeof w?.rtp === 'number' ? w.rtp : c.freeSpins === false ? 0 : 0.001;
  const hrBase = typeof f?.hr === 'number' ? f.hr : 200;
  const rtp = base.rtp;
  // free spins more often: the free-spin share of the return grows to what the higher price needs; otherwise it stays as it is and the base game carries the rest
  const bAnte = st.freeSpins ? Math.round((bBase / cost) * 1e6) / 1e6 : 0;
  const wAnte = wBase;
  const fAnte = st.freeSpins ? Math.round((rtp - bAnte - wAnte) * 1e6) / 1e6 : Math.round((fBase / cost) * 1e6) / 1e6;
  const bFinal = st.freeSpins ? bAnte : Math.round((rtp - wAnte - fAnte) * 1e6) / 1e6;
  const hr = st.freeSpins ? Math.max(2, Math.round((hrBase * fBase) / (cost * fAnte) * 10) / 10) : hrBase;
  const mode = clone(base);
  mode.name = 'ante'; mode.displayName = 'Ante bet'; mode.cost = cost; mode.isAnte = true; mode.isBuyBonus = false; mode.rtp = rtp; mode.ante = st;
  const q = st.freeSpins ? Math.min(0.45, Math.round(((0.099 * hrBase) / hr) * 1000) / 1000) : null;
  if (q !== null) {
    for (const d of mode.distributions) {
      if (d.criteria === 'freegame') d.quota = q;
      else if (d.criteria === '0') d.quota = 0.25;
      else if (d.criteria === 'basegame') d.quota = 0;
    }
    const rest = 1 - mode.distributions.filter((d) => d.criteria !== 'basegame').reduce((a, d) => a + d.quota, 0);
    const bg = mode.distributions.find((d) => d.criteria === 'basegame'); if (bg) bg.quota = Math.round(rest * 1e6) / 1e6;
  }
  // more wilds and better symbols: the ante's own copy of the base reels
  if (st.wilds > 1 || st.symbols > 1) {
    const set = n.reels.sets[Object.keys(n.reels.sets)[0]]; const copy = clone(set);
    const mul = (sym: string, k: number) => { if (k > 1 && copy[sym]) copy[sym] = Math.max(1, Math.round(copy[sym] * k)); };
    mul(n.symbols.wild, st.wilds); for (const p of premiumSymbols(n)) mul(p, st.symbols);
    n.reels.sets.ANTE = copy;
    for (const d of mode.distributions) if (d.conditions.reelWeights?.base) d.conditions.reelWeights.base = { ANTE: 1 };
  }
  const o = clone(opt);
  if (o.conditions.freegame) { o.conditions.freegame.rtp = fAnte; o.conditions.freegame.hr = hr; }
  if (o.conditions.basegame) o.conditions.basegame.rtp = bFinal;
  n.modes.splice(1, 0, mode); n.optimization.ante = o; n.run.books.ante = n.run.books[base.name] ?? 10000;
  return n;
}
/** How many times more often free spins start with the ante bet on. */
export const anteFactor = (c: GameConfig): number | null => {
  const a = anteMode(c); if (!a) return null;
  const hr = (name: string) => { const h = c.optimization[name]?.conditions.freegame?.hr; return typeof h === 'number' ? h : NaN; };
  const f = hr(c.modes[0].name) / hr('ante'); return Number.isFinite(f) ? Math.round(f * 10) / 10 : null;
};

// ---- game type: how wins are found
export const GAME_TYPE_PRESETS: Record<GameType, { starts: number[]; board: [number, number]; payScale: number }> = {
  anywhere: { starts: [8, 9, 11, 14], board: [6, 5], payScale: 1 },
  cluster: { starts: [5, 6, 9, 13], board: [7, 7], payScale: 1.6 },
  paylines: { starts: [3, 4, 5], board: [5, 3], payScale: 1 },
  ways: { starts: [3, 4, 5], board: [5, 4], payScale: 0.1 },
};
/** Group games pay for a count of symbols, line games for a run from the left: their pay ladders have different shapes and cannot be converted into each other. */
const payFamily = (t: GameType) => (t === 'paylines' || t === 'ways' ? 'line' : 'group');
/** The usual pay ladder of each family, best symbol first (pay anywhere scale; one row per paying symbol, the last row repeats). */
const GROUP_LADDER = [[3, 7.5, 15, 60], [2, 5, 10, 40], [1.3, 3.2, 7, 30], [1, 2.5, 6, 20], [0.6, 1.5, 4, 10], [0.4, 1.2, 3.5, 8], [0.2, 0.8, 2.5, 5], [0.1, 0.5, 1.5, 4]];
const LINE_TOP = [100, 50, 25, 15, 8, 5, 3, 2]; const LINE_RATIO = [0.05, 0.2, 1];
/** Every paying symbol gets the standard ladder of the game type, fitted to the number of pay tiers (counted from the biggest group). */
function standardPays(n: GameConfig, type: GameType): void {
  const scale = GAME_TYPE_PRESETS[type].payScale; const k = n.paytable.tiers.length;
  n.symbols.paying.forEach((sym, i) => {
    const row = payFamily(type) === 'line' ? LINE_RATIO.map((r) => LINE_TOP[Math.min(i, LINE_TOP.length - 1)] * r) : GROUP_LADDER[Math.min(i, GROUP_LADDER.length - 1)];
    n.paytable.pays[sym] = Array.from({ length: k }, (_, t) => snapPay(scale * (row[row.length - k + t] ?? row[0])));
  });
}
export const gameTypeOf = (c: GameConfig): GameType => c.gameType ?? 'anywhere';
/** Switches how wins are found. The pay ranges, board size and pay level move to that type's usual values; tune the pays afterwards. */
export function setGameType(c: GameConfig, type: GameType): GameConfig {
  const from_ = gameTypeOf(c); const from = from_; if (from === type) return c; // (`from` and `from_` are the same)
  const a = GAME_TYPE_PRESETS[from]; const b = GAME_TYPE_PRESETS[type];
  let n = clone(c);
  if (type === 'anywhere') delete n.gameType; else n.gameType = type;
  delete n.paylines; delete n.reelHeights; delete n.tumble;
  if ((n.board.reels === a.board[0] && n.board.rows === a.board[1]) || c.reelHeights || (from === 'ways' && n.board.reels === 6 && n.board.rows === 7)) { n.board.reels = b.board[0]; n.board.rows = b.board[1]; } // a board that is still the old type's usual size (or the 6x7 of changing reel heights) moves to the new type's
  n = setRangeStarts(n, b.starts);
  if (payFamily(from) === 'group' && payFamily(type) === 'group') {
    // pay anywhere and cluster share a ladder shape: keep the designer's pays at the new type's level. Line ladders are rebuilt (ways pays are too small to scale up)
    const k = b.payScale / a.payScale;
    for (const p of Object.keys(n.paytable.pays)) n.paytable.pays[p] = n.paytable.pays[p].map((v) => snapPay(v * k));
  } else standardPays(n, type);
  if (type === 'paylines') n.paylines = paylineLibrary(n.board.reels, n.board.rows).slice(0, 20);
  moveWincapBoost(n, capBoosted(from_, hasTumbles(c.gameType, c.tumble)), capBoosted(type, hasTumbles(n.gameType, n.tumble)));
  return syncMaxWin(n);
}

// ---- paylines
/** Keeps the lines valid for the current board: the lines that still fit stay, otherwise the first 20 of the library. */
export function fitPaylines(c: GameConfig): GameConfig {
  if (c.reelHeights) {
    const max = c.board.rows; const min = Math.max(2, Math.min(c.reelHeights.min, max));
    if (c.reelHeights.max !== max || c.reelHeights.min !== min) { const n = clone(c); n.reelHeights = { min, max }; return fitPaylines(n); }
  }
  if (c.gameType !== 'paylines') return c;
  const lib = paylineLibrary(c.board.reels, c.board.rows);
  const keep = (c.paylines ?? []).filter((l) => lib.some((x) => sameLine(x, l)));
  if (keep.length === (c.paylines ?? []).length && keep.length) return c;
  const n = clone(c); n.paylines = keep.length ? keep : lib.slice(0, 20); return n;
}
export const lineOn = (c: GameConfig, line: number[]) => (c.paylines ?? []).some((l) => sameLine(l, line));
/** Switches one payline on or off (at least one stays on). Lines keep the library's order. */
export function togglePayline(c: GameConfig, line: number[]): GameConfig {
  const lib = paylineLibrary(c.board.reels, c.board.rows); const n = clone(c);
  const on = lineOn(c, line);
  if (on && (c.paylines ?? []).length <= 1) return c;
  n.paylines = lib.filter((l) => (sameLine(l, line) ? !on : lineOn(c, l)));
  return n;
}
/** The first `count` lines of the library. */
export function setPaylineCount(c: GameConfig, count: number): GameConfig {
  const n = clone(c); n.paylines = paylineLibrary(c.board.reels, c.board.rows).slice(0, count); return n;
}

// ---- reel heights (ways games)
/** Every reel keeps the same height, or gets a random height from `min` to the number of rows on every spin. */
export function setReelHeights(c: GameConfig, random: boolean, min = 2): GameConfig {
  const n = clone(c); if (n.gameType !== 'ways') return c;
  if (!random) { delete n.reelHeights; return n; }
  delete n.tumble;
  if (n.board.rows < 6) n.board.rows = 7;
  if (n.board.reels < 6) n.board.reels = 6;
  n.reelHeights = { min: Math.max(2, Math.min(min, n.board.rows - 1)), max: n.board.rows };
  return fitPaylines(n);
}

// ---- scatter rewards: what landing scatters gives, one row per count
export interface ScatterRow { count: number; spins: number; pay: number }
export function scatterRows(c: GameConfig): ScatterRow[] {
  const spins = spinTable(c); const pays = c.scatterRule.pays ?? {};
  const counts = [...new Set([...Object.keys(spins), ...Object.keys(pays)].map(Number))].sort((a, b) => a - b);
  // the usual table runs up to 10 scatters in steps of one; show the rows that matter (up to the first count that repeats the last award)
  const rows = counts.map((count) => ({ count, spins: spins[String(count)] ?? 0, pay: pays[String(count)] ?? 0 }));
  while (rows.length > 3 && rows[rows.length - 1].pay === 0 && rows[rows.length - 1].spins >= rows[rows.length - 2].spins && rows.length > 6) rows.pop();
  return rows;
}
/** Saves the list: counts with free spins become the free spins table, counts with cash become the scatter pays. At least one count must award free spins. */
export function setScatterRows(c: GameConfig, rows: ScatterRow[]): GameConfig {
  const n = clone(c); const sorted = [...rows].sort((a, b) => a.count - b.count);
  const base: Record<string, number> = {}; const pays: Record<string, number> = {};
  for (const r of sorted) { if (r.spins > 0) base[String(r.count)] = Math.round(r.spins); if (r.pay > 0) pays[String(r.count)] = snapPay(r.pay); }
  if (!Object.keys(base).length) return c;
  n.freeSpinTriggers.base = base; n.scatterRule.custom = true;
  if (Object.keys(pays).length) n.scatterRule.pays = pays; else delete n.scatterRule.pays;
  return n;
}

/** Switches the top gadget bar on (with the usual gadgets) or off. */
export function setGadgetBar(c: GameConfig, on: boolean): GameConfig {
  if (on === !!c.gadgetBar) return c;
  const n = clone(c); if (on) n.gadgetBar = defaultGadgetBar(n.symbols.paying, gadgetBarCells(n.board), 'top'); else delete n.gadgetBar; return n;
}
/** Moves the bar to the top (a cell for each reel) or the side (a cell for each row); the cells are made to fit. */
export function setGadgetPosition(c: GameConfig, position: 'top' | 'side'): GameConfig {
  if (!c.gadgetBar) return c;
  const n = clone(c); n.gadgetBar = { ...n.gadgetBar!, position }; return fitGadgetBar(n);
}
export function patchGadgetBar(c: GameConfig, patch: Partial<GadgetBar>): GameConfig {
  if (!c.gadgetBar) return c;
  const n = clone(c); n.gadgetBar = { ...n.gadgetBar!, ...patch }; return n;
}

// A game finds its biggest win (the forced win-cap rounds) only with plenty of multipliers and wilds on the win-cap reels when it has no tumbles; line
// games have always had the boost, with or without tumbles (that is what was verified through the SDK).
const capBoosted = (t: GameType, tumbling: boolean) => t === 'paylines' || t === 'ways' || !tumbling;
function moveWincapBoost(n: GameConfig, was: boolean, now: boolean): void {
  const wc = n.reels.sets.WCAP; if (!wc || was === now) return;
  const f = (k: number) => (now ? k : 1 / k);
  if (wc[n.symbols.multiplier]) wc[n.symbols.multiplier] = Math.max(1, Math.round(wc[n.symbols.multiplier] * f(4)));
  if (wc[n.symbols.wild]) wc[n.symbols.wild] = Math.max(1, Math.round(wc[n.symbols.wild] * f(3)));
}
/** Winning symbols tumble away and new ones drop in until no win remains; without tumbles each spin is evaluated once. Every game type can have them
 *  (paylines and ways: off unless switched on; pay anywhere and cluster: on unless switched off). Not combined with changing reel heights yet. */
export function setTumble(c: GameConfig, on: boolean): GameConfig {
  if (hasTumbles(c.gameType, c.tumble) === on) return c;
  const t = gameTypeOf(c); const n = clone(c);
  if (t === 'paylines' || t === 'ways') { if (on) { n.tumble = true; delete n.reelHeights; } else delete n.tumble; }
  else if (on) delete n.tumble; else n.tumble = false;
  moveWincapBoost(n, capBoosted(t, !on), capBoosted(t, on));
  return n;
}

// ---- new game wizard: the answers become a game that starts from the demo
export interface NewGameAnswers { name: string; type: GameType; tumble: boolean; gadgetBar: boolean; reels: number; rows: number }
export const gameSlug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').replace(/^[0-9]/, 'g$&').slice(0, 30) || 'my_game';
const scalePaysTo = (c: GameConfig, f: number): GameConfig => { const n = clone(c); for (const k of Object.keys(n.paytable.pays)) n.paytable.pays[k] = n.paytable.pays[k].map((v) => snapPay(v * f)); return n; };
export function newGameFrom(base: GameConfig, a: NewGameAnswers): GameConfig {
  let c = setGameType(clone(base), a.type);
  c.name = a.name.trim() || 'My new slot'; c.id = gameSlug(c.name);
  const clamp = (n: number) => Math.max(3, Math.min(8, Math.round(n) || 3));
  c.board = { reels: clamp(a.reels), rows: clamp(a.rows) };
  c = fitPaylines(setRangeStarts(c, rangeStarts(c)));
  // ways pay for every way; a row more or less changes the number of ways a lot: about (4 / rows)^5 keeps the start near the target (measured 3 to 6 rows)
  if (a.type === 'ways' && c.board.rows !== 4) c = scalePaysTo(c, (4 / c.board.rows) ** 5);
  c = setTumble(c, a.tumble);
  c = setGadgetBar(c, a.gadgetBar);
  // a new game starts with no features: free spins, bonus buys, the ante and the rest are added on the Features page
  c = setFreeSpins(setAnte(c, null), false); delete c.features;
  return syncMaxWin(c);
}

// ---- free spins: a feature the designer adds or removes
export const hasFreeSpins = (c: GameConfig): boolean => c.freeSpins !== false;
const FS_CRITERIA = ['freegame', 'wincap'];
/**
 * Off: the scatter leaves every reel set, the free spins and win-cap distributions and their optimiser targets go (the basegame target takes their
 * share of the return), bonus buys go (they start free spins), features that only worked in free spins go, scatter cash goes, and an ante bet keeps
 * its other effects. On: the demo game's free spins come back (distributions, targets, scatter weights), scaled to this game's max win and return.
 */
export function setFreeSpins(c: GameConfig, on: boolean): GameConfig {
  if (hasFreeSpins(c) === on) return c;
  let n = clone(c); const sc = n.symbols.scatter; const demo = start as unknown as GameConfig;
  if (!on) {
    n.freeSpins = false;
    const gone = n.modes.filter((m) => m.isBuyBonus).map((m) => m.name);
    n.modes = n.modes.filter((m) => !m.isBuyBonus);
    for (const g of gone) { delete n.optimization[g]; delete n.run.books[g]; }
    for (const m of n.modes) {
      m.distributions = m.distributions.filter((d) => !FS_CRITERIA.includes(d.criteria));
      const q = m.distributions.reduce((a, d) => a + d.quota, 0) || 1; let left = 1;
      m.distributions.forEach((d, i) => { d.quota = i === m.distributions.length - 1 ? Math.round(left * 1e6) / 1e6 : Math.round((d.quota / q) * 1e6) / 1e6; left -= d.quota; });
      if (m.ante) m.ante = { ...m.ante, freeSpins: false };
      const o = n.optimization[m.name]; if (!o) continue;
      for (const k of FS_CRITERIA) delete o.conditions[k];
      o.scaling = o.scaling.filter((s) => !FS_CRITERIA.includes(s.criteria));
      if (o.conditions.basegame) o.conditions.basegame.rtp = Math.round((m.rtp - Object.entries(o.conditions).reduce((a, [k, x]) => a + (k !== 'basegame' && typeof x.rtp === 'number' ? x.rtp : 0), 0)) * 1e6) / 1e6;
    }
    for (const set of Object.values(n.reels.sets)) delete set[sc];
    if (n.scatterRule.pays) { delete n.scatterRule.pays; }
    if (n.features) { n.features = n.features.map((f) => ({ ...f, where: f.where.filter((w) => w !== 'free' && !gone.includes(w)) })).filter((f) => f.where.length > 0); if (!n.features.length) delete n.features; }
    return n;
  }
  delete n.freeSpins;
  const mw = n.modes[0].maxWin; const dBase = demo.modes[0]; const oBase = demo.optimization[dBase.name];
  for (const m of n.modes) {
    const keep = m.distributions;
    const add = clone(dBase.distributions.filter((d) => FS_CRITERIA.includes(d.criteria))).map((d) => (d.criteria === 'wincap' ? { ...d, winCriteria: mw } : d));
    for (const d of add) {
      if (d.conditions.reelWeights?.base && keep[0]?.conditions.reelWeights?.base) d.conditions.reelWeights.base = clone(keep[0].conditions.reelWeights.base); // the ante keeps its own reels
      for (const set of Object.keys(d.conditions.reelWeights?.free ?? {})) if (!n.reels.sets[set]) n.reels.sets[set] = clone(demo.reels.sets[set]);
    }
    const share = add.reduce((a, d) => a + d.quota, 0);
    m.distributions = [...add, ...keep.map((d) => ({ ...d, quota: Math.round(d.quota * (1 - share) * 1e6) / 1e6 }))];
    const fix = 1 - m.distributions.reduce((a, d) => a + d.quota, 0); m.distributions[m.distributions.length - 1].quota = Math.round((m.distributions[m.distributions.length - 1].quota + fix) * 1e6) / 1e6;
    const o = n.optimization[m.name]; if (!o) continue;
    const scale = m.rtp / dBase.rtp;
    o.conditions.wincap = { ...clone(oBase.conditions.wincap), avWin: mw, searchConditions: mw };
    o.conditions.freegame = { ...clone(oBase.conditions.freegame), rtp: Math.round((oBase.conditions.freegame.rtp as number) * scale * 1e6) / 1e6 };
    o.scaling = [...o.scaling, ...clone(oBase.scaling.filter((s) => s.criteria === 'freegame'))];
    if (o.conditions.basegame) o.conditions.basegame.rtp = Math.round((m.rtp - Object.entries(o.conditions).reduce((a, [k, x]) => a + (k !== 'basegame' && typeof x.rtp === 'number' ? x.rtp : 0), 0)) * 1e6) / 1e6;
  }
  for (const [name, set] of Object.entries(n.reels.sets)) set[sc] = demo.reels.sets[name]?.[sc] ?? demo.reels.sets.BR0[sc];
  n = syncMaxWin(n);
  const am = anteMode(n); if (am) n = setAnte(n, am.cost as 2 | 3, getAnte(n)!); // the ante is rebuilt on the base mode that has free spins again
  return n;
}
