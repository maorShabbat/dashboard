// Special features for the pay-anywhere template (T1). A feature is an instance with an id, a place where it works (the base game and/or
// bonuses) and a trigger (when it fires on a spin). The same rules exist twice: in mechanics/t1/foundry_features.py (the real game) and in
// builder/fx.ts (the live estimate). Catalogue references (M numbers) point to docs/foundry/spec/Slot_Foundry_Product_Specification_v2.txt.

/** 'base' = the base game; 'free' = the free spins triggered by scatters; any other id is a purchased bonus (its mode name). */
export type Where = string;
export const BASE: Where = 'base';
export const NATURAL_FREE: Where = 'free';

// ---------------------------------------------------------------- triggers
/** One test on a spin. All are evaluated on the board as it was drawn, before any special feature changes it. */
export type Condition =
  | { kind: 'chance'; p: number }
  | { kind: 'scatters'; min: number; max?: number }
  | { kind: 'symbols'; symbol: string; min: number }
  | { kind: 'spinIs'; which: 'first' | 'last' | 'every' | 'from'; n?: number }
  | { kind: 'prevSpin'; result: 'win' | 'loss' | 'big'; x?: number }
  | { kind: 'streak'; of: 'win' | 'loss'; n: number }
  | { kind: 'bonusWin'; atLeast: number }
  | { kind: 'spinsLeft'; atMost: number };
export type ConditionKind = Condition['kind'];
/** An empty list means the feature fires on every spin. */
export interface Trigger { match: 'all' | 'any'; conditions: Condition[] }

/** Conditions that only make sense inside a bonus (the base game keeps nothing between rounds). */
export const BONUS_ONLY: ConditionKind[] = ['spinIs', 'prevSpin', 'streak', 'bonusWin', 'spinsLeft'];

export const CONDITION_INFO: Record<ConditionKind, { name: string; bonusOnly: boolean }> = {
  chance: { name: 'Random chance', bonusOnly: false },
  scatters: { name: 'Scatters on the board', bonusOnly: false },
  symbols: { name: 'Symbol count on the board', bonusOnly: false },
  spinIs: { name: 'Free spin number', bonusOnly: true },
  prevSpin: { name: 'Result of the previous spin', bonusOnly: true },
  streak: { name: 'Win or loss streak', bonusOnly: true },
  bonusWin: { name: 'Bonus win so far', bonusOnly: true },
  spinsLeft: { name: 'Spins left', bonusOnly: true },
};

export function defaultCondition(kind: ConditionKind): Condition {
  switch (kind) {
    case 'chance': return { kind, p: 0.15 };
    case 'scatters': return { kind, min: 2 };
    case 'symbols': return { kind, symbol: '', min: 3 };
    case 'spinIs': return { kind, which: 'every', n: 3 };
    case 'prevSpin': return { kind, result: 'loss' };
    case 'streak': return { kind, of: 'loss', n: 2 };
    case 'bonusWin': return { kind, atLeast: 20 };
    case 'spinsLeft': return { kind, atMost: 2 };
  }
}

const N = (x: number) => (Number.isInteger(x) ? String(x) : String(Number(x.toFixed(2))));
const ord = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10 > 3 ? 0 : n % 10]}`;
/** A plain-English line for one condition. */
export function describeCondition(c: Condition): string {
  switch (c.kind) {
    case 'chance': return `${N(c.p * 100)}% chance`;
    case 'scatters': return c.max !== undefined && c.max !== c.min ? `${c.min} to ${c.max} scatters land` : `${c.min}${c.max === undefined ? '+' : ''} scatter${c.min === 1 && c.max !== undefined ? '' : 's'} land`;
    case 'symbols': return `${c.min}+ ${c.symbol || '(symbol)'} on the board`;
    case 'spinIs': return c.which === 'first' ? 'first free spin' : c.which === 'last' ? 'last free spin' : c.which === 'every' ? `every ${ord(c.n ?? 2)} free spin` : `from free spin ${c.n ?? 1}`;
    case 'prevSpin': return c.result === 'win' ? 'previous spin won' : c.result === 'loss' ? 'previous spin lost' : `previous spin won ${N(c.x ?? 10)}x or more`;
    case 'streak': return `${c.n} ${c.of === 'win' ? 'wins' : 'losses'} in a row`;
    case 'bonusWin': return `bonus has won ${N(c.atLeast)}x or more`;
    case 'spinsLeft': return `${c.atMost} or fewer spins left`;
  }
}
export function describeTrigger(t: Trigger): string {
  if (!t.conditions.length) return 'every spin';
  return t.conditions.map(describeCondition).join(t.match === 'all' ? ' and ' : ' or ');
}

// ---------------------------------------------------------------- feature types
interface Base { id: string; name?: string; where: Where[]; trigger: Trigger }

/** Wilds dropped on random ordinary cells before the reveal is evaluated (M21). */
export interface RandomWildFeature extends Base {
  type: 'randomWild';
  /** Number of wilds placed, as weights: { "1": 60, "2": 30, "3": 10 }. */
  counts: Record<string, number>;
}
/** Wilds that land stay on the board for the next free spins (M03). Bonuses only. */
export interface StickyWildFeature extends Base {
  type: 'stickyWild';
  /** Free spins a wild is held after the spin it landed on; 0 = until the bonus ends. */
  lifetime: number;
}
/** A wild hero that moves every free spin and multiplies the spin win; it grows after each winning spin (M04/M27 with M29). Bonuses only. */
export interface HeroWildFeature extends Base {
  type: 'heroWild';
  startFactor: number;
  growth: number;
  maxFactor: number;
  /** 'random': any ordinary cell; 'step': a neighbouring cell (falls back to random when none is free). */
  move: 'random' | 'step';
}
/** Each wild on the board can grow to fill its whole reel (or row) before the spin is paid (M02). */
export interface ExpandWildFeature extends Base {
  type: 'expandWild';
  /** Chance that each wild expands. */
  chance: number;
  shape: 'reel' | 'row' | 'cross';
}
/** Each wild can copy itself onto neighbouring cells, one step only (M22). */
export interface SpreadWildFeature extends Base {
  type: 'spreadWild';
  /** Chance that each wild spreads. */
  chance: number;
  /** How many of the four neighbouring cells receive a copy. */
  copies: number;
}
/** Cells that take part in a win get a multiplier; later wins through those cells are multiplied by them (M17). */
export interface CellMultiplierFeature extends Base {
  type: 'cellMultiplier';
  start: number;
  growth: 'double' | 'add';
  max: number;
  /** 'spin': cleared every spin. 'bonus': kept for the whole bonus (the base game always clears every spin). */
  memory: 'spin' | 'bonus';
}
export type GadgetTool = 'wilds' | 'multiplier' | 'remove' | 'wildReel';
/** What charges one cell of the bar: every listed symbol that lands on a new board adds 1, or every winning step adds 1. */
export type GadgetCharge = { kind: 'land'; symbols: string[] } | { kind: 'wins' };
/** One cell of the gadget bar: its own charge, threshold, tool and optional elite upgrade (M43 = collection meter M26 + queue M48 + tools). */
export interface GadgetSlot {
  /** Short name shown on the cell (the tool's name when empty). */
  name?: string;
  charge: GadgetCharge;
  /** Charge that opens the cell. */
  need: number;
  tool: GadgetTool;
  power: number;
  /** Total charge at which the cell upgrades to elite and works again with `elitePower`. Empty = no upgrade. */
  eliteNeed?: number;
  elitePower?: number;
  /** Lock wild reels only: the reels stay wild for the rest of the bonus (or the base round). */
  hold?: boolean;
  /** After the last level the charge starts again and the cell can open again. */
  repeat: boolean;
}
/** The row of gadget cells above the grid. Each cell charges on its own; an opened cell works at the next step. */
export interface GadgetPanelFeature extends Base {
  type: 'gadgetPanel';
  slots: GadgetSlot[];
  position?: GadgetBarPosition;
  /** true: cells charge in order, like doors: a cell only starts charging once the one before it has opened. */
  sequence?: boolean;
}
/** Several ordinary cells turn into the same symbol before the spin is paid (a shared mystery reveal, M24). */
export interface MysteryFeature extends Base {
  type: 'mystery';
  counts: Record<string, number>;
  pool: 'all' | 'high';
}
/** Orbs with cash values land and lock; every new orb restarts the respins; when they run out the orbs are paid (a hold and win round). */
export interface HoldAndWinFeature extends Base {
  type: 'holdAndWin';
  /** Orbs the round starts with, as weights: { "6": 60, "7": 25 }. */
  counts: Record<string, number>;
  /** Chance that each empty cell fills with an orb on a respin. */
  landChance: number;
  /** Respins at the start and after every new orb. */
  respins: number;
  /** Orb values (x bet), as weights: { "1": 50, "2": 25 }. Whole numbers. */
  values: Record<string, number>;
  /** The total is multiplied by this when every cell is filled (1 = no bonus). */
  fullMult: number;
}
/** The global multiplier of a bonus spin (or of a base round that tumbles) climbs a configurable ladder: where it starts, how much it grows after each tumble, where it stops (M18). */
export interface MultiplierLadderFeature extends Base {
  type: 'multiplierLadder';
  /** Multiplier at the start of every spin (1 = the usual). */
  start: number;
  /** Added after every tumble (0 = it never grows). */
  step: number;
  /** The ladder stops growing here. */
  max: number;
}
/** Every wild that lands carries a multiplier; a win that includes wilds is multiplied by their values (M15). */
export interface WildMultiplierFeature extends Base {
  type: 'wildMultiplier';
  /** Values as weights: { "2": 60, "3": 25, "5": 10 }. */
  values: Record<string, number>;
  /** Several wilds in one win: their values are added or multiplied. */
  combine: 'add' | 'multiply';
}
/** A big block of wilds lands at once (M28). */
export interface ColossalWildFeature extends Base {
  type: 'colossalWild';
  /** Block width and height in cells. */
  size: 2 | 3 | 4;
}
/** One multiplier for a whole bonus: it starts at a value and grows by a step after every free spin that wins; every spin's wins use it (M19). */
export interface BonusMultiplierFeature extends Base {
  type: 'bonusMultiplier';
  start: number;
  step: number;
  max: number;
}
/** Low paying symbols on the board are swapped for other paying symbols before the spin is paid (M23). */
export interface RemoveSymbolsFeature extends Base {
  type: 'removeSymbols';
  /** 'lowest': the single lowest paying symbol; 'low': the lower half of the paying symbols. */
  target: 'lowest' | 'low';
}
/** A configured prize: when it fires, a cash amount (x bet) is added to the spin win, flat (M52). */
export interface PrizeAwardFeature extends Base {
  type: 'prizeAward';
  /** Prize values (x bet) as weights: { "5": 60, "10": 30 }. Whole numbers. */
  values: Record<string, number>;
}
/** All ordinary symbols on the board change places at random before the spin is paid (M31). Only games where position matters (cluster, paylines, ways). */
export interface ShuffleFeature extends Base { type: 'shuffle' }
/** A bonus has lives: every free spin without a win costs one, and the bonus ends early when they run out (M46). */
export interface LivesFeature extends Base {
  type: 'lives';
  lives: number;
}
export type Feature = ShuffleFeature | LivesFeature | BonusMultiplierFeature | RemoveSymbolsFeature | PrizeAwardFeature | MultiplierLadderFeature | WildMultiplierFeature | ColossalWildFeature | RandomWildFeature | StickyWildFeature | HeroWildFeature | ExpandWildFeature | SpreadWildFeature | CellMultiplierFeature | GadgetPanelFeature | MysteryFeature | HoldAndWinFeature;
export type FeatureType = Feature['type'];

/** Games where a base round has tumbles. Sticky wilds, the hero and the gadget row need steps inside a round (tumbles in the base game, spins in a bonus). */
/** Paylines and ways tumble only when `tumble` is true; pay anywhere and cluster tumble unless it is false (older designs have no field and keep tumbling). */
export const hasTumbles = (gameType?: string, tumble?: boolean): boolean => (gameType === 'paylines' || gameType === 'ways' ? !!tumble : tumble !== false);
/** Can this feature work in the base game of this game type? */
export const baseAllowed = (type: FeatureType, gameType?: string, tumble?: boolean): boolean => type !== 'bonusMultiplier' && type !== 'lives' && (!FEATURE_INFO[type].bonusOnly || hasTumbles(gameType, tumble));

export const FEATURE_INFO: Record<FeatureType, { name: string; promise: string; family: string; bonusOnly: boolean; color: string }> = {
  randomWild: { name: 'Random wilds', promise: 'Wilds drop onto random cells before the spin is paid.', family: 'M21', bonusOnly: false, color: '#3ddc97' },
  mystery: { name: 'Mystery reveal', promise: 'Several cells reveal the same symbol before the spin is paid.', family: 'M24', bonusOnly: false, color: '#b57bff' },
  expandWild: { name: 'Expanding wilds', promise: 'A wild grows to fill its whole reel before the spin is paid.', family: 'M02', bonusOnly: false, color: '#38c8ff' },
  spreadWild: { name: 'Spreading wilds', promise: 'A wild copies itself onto neighbouring cells.', family: 'M22', bonusOnly: false, color: '#7a5cff' },
  cellMultiplier: { name: 'Cell multipliers', promise: 'Cells that win get a multiplier that boosts later wins through them.', family: 'M17', bonusOnly: false, color: '#ffb43a' },
  stickyWild: { name: 'Sticky wilds', promise: 'Wilds that land stay for the next spins of a bonus, or for the next tumbles of a base round.', family: 'M03', bonusOnly: true, color: '#ffb43a' },
  heroWild: { name: 'Walking hero wild', promise: 'A wild hero moves every spin of a bonus (every tumble in the base game), multiplies the win and grows on every winning step.', family: 'M04, M27, M29', bonusOnly: true, color: '#ff5fa8' },
  holdAndWin: { name: 'Hold and win', promise: 'Cash orbs land and lock; every new orb restarts the respins, and the orbs are paid at the end.', family: 'M07, M08', bonusOnly: false, color: '#f6bd4a' },
  multiplierLadder: { name: 'Multiplier ladder', promise: 'The global multiplier starts where you choose and climbs by your step after every tumble, up to your limit.', family: 'M18', bonusOnly: true, color: '#ffd24a' },
  wildMultiplier: { name: 'Wilds with multipliers', promise: 'Every wild carries a multiplier; wins that include wilds are multiplied by their values.', family: 'M15', bonusOnly: false, color: '#ff7ad9' },
  colossalWild: { name: 'Colossal wild', promise: 'A big block of wilds lands at once.', family: 'M28', bonusOnly: false, color: '#2fd6c1' },
  shuffle: { name: 'Symbol shuffle', promise: 'The symbols on the board change places at random before the spin is paid.', family: 'M31', bonusOnly: false, color: '#4fa8ff' },
  lives: { name: 'Lives', promise: 'A bonus ends early when its lives run out: every free spin without a win costs one.', family: 'M46', bonusOnly: true, color: '#ff6b7c' },
  bonusMultiplier: { name: 'Bonus multiplier', promise: 'One multiplier for the whole bonus: it starts where you choose and grows after every free spin that wins.', family: 'M19', bonusOnly: true, color: '#ffa93a' },
  removeSymbols: { name: 'Symbol removal', promise: 'Low paying symbols are swapped for better ones before the spin is paid.', family: 'M23', bonusOnly: false, color: '#5fd0a5' },
  prizeAward: { name: 'Configured prize', promise: 'A cash prize with its own chance, added to the spin win.', family: 'M52', bonusOnly: false, color: '#f6d44a' },
  gadgetPanel: { name: 'Gadget row', promise: 'A row above the board charges as you play and fires its gadgets at the next free spin, at the next tumble, or (in a game with no steps) at once on the board that landed.', family: 'M43, M26, M48', bonusOnly: false, color: '#ff8a4c' },
};
export const FEATURE_ORDER: FeatureType[] = ['randomWild', 'mystery', 'expandWild', 'spreadWild', 'cellMultiplier', 'stickyWild', 'heroWild', 'multiplierLadder', 'bonusMultiplier', 'lives', 'shuffle', 'wildMultiplier', 'colossalWild', 'removeSymbols', 'prizeAward', 'holdAndWin'];

const everySpin: Trigger = { match: 'all', conditions: [] };
const chanceTrigger = (p: number): Trigger => ({ match: 'all', conditions: [{ kind: 'chance', p }] });

/** A new feature with sensible settings. `where` is the places it works in; `existing` ids avoid a clash. */
export function defaultFeature(type: FeatureType, where: Where[] = [NATURAL_FREE], existing: string[] = []): Feature {
  let id = type; for (let i = 2; existing.includes(id); i++) id = `${type}${i}` as FeatureType;
  const base = { id, where, trigger: everySpin };
  switch (type) {
    case 'randomWild': return { ...base, type, trigger: chanceTrigger(0.15), counts: { '1': 60, '2': 30, '3': 10 } };
    case 'mystery': return { ...base, type, trigger: chanceTrigger(0.12), counts: { '3': 50, '4': 30, '5': 20 }, pool: 'all' };
    case 'expandWild': return { ...base, type, chance: 0.5, shape: 'reel' };
    case 'spreadWild': return { ...base, type, chance: 0.5, copies: 2 };
    case 'cellMultiplier': return { ...base, type, start: 2, growth: 'double', max: 128, memory: 'bonus' };
    case 'stickyWild': return { ...base, type, lifetime: 0 };
    case 'heroWild': return { ...base, type, startFactor: 1, growth: 1, maxFactor: 10, move: 'step' };
    case 'holdAndWin': return { ...base, type, trigger: chanceTrigger(0.02), counts: { '6': 60, '7': 25, '8': 15 }, landChance: 0.04, respins: 3, values: { '1': 50, '2': 25, '3': 12, '5': 8, '10': 4, '25': 1 }, fullMult: 2 };
    case 'multiplierLadder': return { ...base, type, start: 1, step: 1, max: 10 };
    case 'shuffle': return { ...base, type, trigger: chanceTrigger(0.2) };
    case 'lives': return { ...base, type, lives: 3 };
    case 'bonusMultiplier': return { ...base, type, start: 1, step: 1, max: 20 };
    case 'removeSymbols': return { ...base, type, trigger: chanceTrigger(0.15), target: 'lowest' };
    case 'prizeAward': return { ...base, type, trigger: chanceTrigger(0.02), values: { '5': 60, '10': 30, '25': 10 } };
    case 'wildMultiplier': return { ...base, type, trigger: everySpin, values: { '2': 60, '3': 25, '5': 10, '10': 5 }, combine: 'add' };
    case 'colossalWild': return { ...base, type, trigger: chanceTrigger(0.05), size: 2 };
    case 'gadgetPanel': return { ...base, type, slots: defaultGadgetBar(['H1', 'H2']).slots }; // an internal type: the game's bar is made by setGadgetBar with the game's own symbols
  }
}

/** The first gadget bars charged one shared meter and opened their gadgets in order: the same cells, each with its own meter and the running total as its threshold. */
function oldGadgetToBar(g: Record<string, unknown>, sym: { wild?: string; multiplier?: string } = {}): unknown {
  const slots = (g.slots ?? []) as Record<string, unknown>[];
  if (slots.every((sl) => sl.charge)) return { slots };
  let total = 0;
  const charge = g.source === 'wilds' ? { kind: 'land', symbols: [sym.wild ?? 'W'] } : g.source === 'multipliers' ? { kind: 'land', symbols: [sym.multiplier ?? 'M'] } : { kind: 'wins' };
  return { slots: slots.map((sl) => { total += Number(sl.need) || 1; return { charge, need: total, tool: sl.tool, power: sl.power, repeat: !!g.reuse }; }) };
}

/** The gadget row is a mechanic of the whole game (the top gadget bar), not a feature: designs saved with it as a feature move it to `gadgetBar`. */
function migrateGadgetBar<T extends { features?: unknown[]; gadgetBar?: unknown }>(c: T): T {
  const list = (c.features ?? []) as Record<string, unknown>[];
  const gad = list.filter((f) => f.type === 'gadgetPanel');
  // a bar saved with the first shape (one shared meter: source, slots without their own charge, reuse) becomes cells with their own charge
  const bar = c.gadgetBar as Record<string, unknown> | undefined;
  if (!gad.length && bar && Array.isArray(bar.slots) && (bar.slots as Record<string, unknown>[]).some((sl) => !sl.charge)) {
    return { ...c, gadgetBar: oldGadgetToBar(bar, (c as { symbols?: { wild?: string; multiplier?: string } }).symbols) } as T;
  }
  if (!gad.length) return c;
  const rest = list.filter((f) => f.type !== 'gadgetPanel');
  const out = { ...c } as Record<string, unknown>;
  if (!c.gadgetBar) out.gadgetBar = oldGadgetToBar(gad[0], (c as { symbols?: { wild?: string; multiplier?: string } }).symbols);
  if (rest.length) out.features = rest; else delete out.features;
  return out as T;
}

/** The top gadget bar: a row above the board that is there on every spin of every place (base game, free spins, bonuses, ante). */
/** Where the bar sits: on top it has one cell per reel (the cells are columns), at the side one cell per row of the board. */
export type GadgetBarPosition = 'top' | 'side';
export interface GadgetBar { slots: GadgetSlot[]; sequence?: boolean; position?: GadgetBarPosition }
/** How many cells the bar has: one per reel on top, one per row at the side. */
export const gadgetBarCells = (board: { reels: number; rows: number }, position: GadgetBarPosition = 'top'): number => (position === 'side' ? board.rows : board.reels);
export const GADGET_BAR_ID = 'gadgetBar';
/** A bar of three cells the first symbols of the game charge: wilds, a multiplier and a clean-up. */
// A starting bar a designer can feel without it running the game: each cell charges from its own symbol (the first four in turn) and opens after about
// two landings per cell of the bar, so one or two cells open in a typical bonus. The first version (every cell on the top symbol, open at 4, +2 each)
// multiplied the return 10 to 100 times, which no pay scaling can bring back to a sensible paytable.
export const defaultGadgetBar = (symbols: string[] = [], cells = 3, position: GadgetBarPosition = 'top'): GadgetBar => {
  const need = Math.max(6, cells * 2);
  const make = (i: number): GadgetSlot => {
    const sym = symbols.length ? [symbols[i % Math.min(4, symbols.length)]] : [];
    return [
      { name: 'Wilds', charge: { kind: 'land', symbols: sym }, need, tool: 'wilds', power: 1, repeat: false },
      { name: 'Multiplier', charge: { kind: 'land', symbols: sym }, need: need * 2, tool: 'multiplier', power: 1, repeat: false },
      { name: 'Clean-up', charge: { kind: 'wins' }, need: Math.max(6, cells), tool: 'remove', power: 1, repeat: false },
    ][i % 3] as GadgetSlot;
  };
  return { position, slots: Array.from({ length: cells }, (_, i) => make(i)) };
};
/** The bar has one cell for each reel (top) or row (side) of the board: cells are added or dropped to fit. Returns the same object when nothing changes. */
export function fitGadgetBar<T extends { gadgetBar?: GadgetBar | null; board?: { reels: number; rows: number }; symbols?: { paying: string[] } }>(c: T): T {
  const b = c.gadgetBar; if (!b || !c.board) return c;
  const want = gadgetBarCells(c.board, b.position);
  if (b.position && b.slots.length === want) return c;
  const position = b.position ?? 'top';
  const extra = defaultGadgetBar(c.symbols?.paying ?? [], want, position).slots;
  return { ...c, gadgetBar: { ...b, position, slots: Array.from({ length: want }, (_, i) => b.slots[i] ?? extra[i]) } };
}

/** The features of a game as the math runs them: the listed features plus the top gadget bar (as a gadget row that works everywhere on every spin). */
export function allFeatures(c: { features?: Feature[]; gadgetBar?: GadgetBar | null; modes?: { name: string; isBuyBonus: boolean; isAnte?: boolean }[] }): Feature[] {
  const list = c.features ?? [];
  if (!c.gadgetBar) return list;
  const places = [BASE, NATURAL_FREE, ...(c.modes ?? []).filter((m) => m.isBuyBonus || m.isAnte).map((m) => m.name)];
  return [...list, { id: GADGET_BAR_ID, type: 'gadgetPanel', where: places, trigger: { match: 'all', conditions: [] }, ...c.gadgetBar } as Feature];
}

/** Upgrades designs saved before features had a place and a trigger (scope + chance). Returns the same object when nothing changes. */
export function migrateFeatures<T extends { features?: unknown[]; gadgetBar?: unknown; modes?: { name: string; isBuyBonus: boolean; isAnte?: boolean }[] }>(c: T): T {
  c = fitGadgetBar(migrateGadgetBar(c as never) as never) as T;
  const list = (c.features ?? []) as Record<string, unknown>[];
  if (!list.some((f) => !('where' in f) || !('trigger' in f))) return c;
  const buys = (c.modes ?? []).filter((m) => m.isBuyBonus || m.isAnte).map((m) => m.name);
  const features = list.map((raw) => {
    if ('where' in raw && 'trigger' in raw) return raw;
    const { scope, chance, ...rest } = raw as { scope?: string; chance?: number } & Record<string, unknown>;
    const where = scope === 'base' ? [BASE] : scope === 'both' ? [BASE, NATURAL_FREE, ...buys] : [NATURAL_FREE, ...buys];
    const usesTrigger = rest.type === 'randomWild' || rest.type === 'mystery';
    const out: Record<string, unknown> = { id: rest.type, ...rest, where, trigger: usesTrigger && chance !== undefined ? chanceTrigger(chance) : everySpin };
    if (!usesTrigger && chance !== undefined) out.chance = chance;
    return out;
  });
  return { ...c, features } as T;
}

// ---------------------------------------------------------------- validation
export interface FeatureContext { cells: number; symbols: string[]; places: Where[] }

export function validateFeatures(features: Feature[] | undefined, ctx: { cells: number; symbols?: string[]; places?: Where[]; tumbles?: boolean; positional?: boolean; reels?: number; rows?: number }): { path: string; message: string }[] {
  const out: { path: string; message: string }[] = [];
  const add = (path: string, message: string) => out.push({ path, message });
  const cells = ctx.cells; const places = ctx.places ?? [BASE, NATURAL_FREE];
  const ids = new Set<string>();
  (features ?? []).forEach((f, i) => {
    const p = `features[${i}]`;
    if (!(f.type in FEATURE_INFO)) { add(p, `unknown feature type ${String((f as { type: string }).type)}`); return; }
    const info = FEATURE_INFO[f.type];
    if (!/^[A-Za-z][A-Za-z0-9_]{0,31}$/.test(f.id ?? '')) add(`${p}.id`, 'id: letters, digits and underscores, starting with a letter');
    if (ids.has(f.id)) add(`${p}.id`, `two features share the id ${f.id}`);
    ids.add(f.id);
    if (!Array.isArray(f.where) || !f.where.length) add(`${p}.where`, 'choose where it works: the base game, free spins or a bonus');
    else {
      for (const w of f.where) if (!places.includes(w)) add(`${p}.where`, `${w} is not the base game, the free spins or a bonus of this game`);
      if (f.type === 'lives' && f.where.includes(BASE)) add(`${p}.where`, 'lives belong to a bonus: they work in free spins and purchased bonuses only');
      if (f.type === 'bonusMultiplier' && f.where.includes(BASE)) add(`${p}.where`, 'the bonus multiplier carries over the free spins of a bonus, so it works in free spins and purchased bonuses only');
      else if (info.bonusOnly && f.where.includes(BASE) && ctx.tumbles === false) add(`${p}.where`, `${info.name} needs steps inside a round: in this game type the base game has none (no tumbles), so it works inside a bonus only`);
      if (f.type === 'cellMultiplier' && f.memory === 'bonus' && f.where.length === 1 && f.where[0] === BASE) add(`${p}.memory`, 'the base game always clears the marks every spin');
    }
    const tr = f.trigger;
    if (!tr || !['all', 'any'].includes(tr.match) || !Array.isArray(tr.conditions)) add(`${p}.trigger`, 'a trigger needs a match rule (all or any) and a list of conditions');
    else {
      if (tr.conditions.length > 8) add(`${p}.trigger`, 'at most 8 conditions');
      tr.conditions.forEach((c, k) => {
        const cp = `${p}.trigger.conditions[${k}]`;
        if (!(c.kind in CONDITION_INFO)) { add(cp, `unknown condition ${String((c as { kind: string }).kind)}`); return; }
        if (CONDITION_INFO[c.kind].bonusOnly && f.where?.includes(BASE)) add(cp, `"${CONDITION_INFO[c.kind].name}" only exists inside a bonus; remove the base game from where this works, or remove the condition`);
        if (c.kind === 'chance' && !(c.p > 0 && c.p <= 1)) add(cp, 'chance must be above 0 and at most 1');
        if (c.kind === 'scatters' && !(Number.isInteger(c.min) && c.min >= 1 && c.min <= 12 && (c.max === undefined || (Number.isInteger(c.max) && c.max >= c.min && c.max <= 12)))) add(cp, 'scatters: whole numbers from 1 to 12, maximum not below minimum');
        if (c.kind === 'symbols') {
          if (!(Number.isInteger(c.min) && c.min >= 1 && c.min <= cells)) add(cp, `symbol count: whole number from 1 to ${cells}`);
          if (ctx.symbols && !ctx.symbols.includes(c.symbol)) add(cp, `choose one of the game's symbols`);
        }
        if (c.kind === 'spinIs' && (!['first', 'last', 'every', 'from'].includes(c.which) || ((c.which === 'every' || c.which === 'from') && !(Number.isInteger(c.n) && (c.n as number) >= (c.which === 'every' ? 2 : 1) && (c.n as number) <= 100)))) add(cp, 'free spin number: first, last, every Nth (2 to 100) or from spin N');
        if (c.kind === 'prevSpin' && (!['win', 'loss', 'big'].includes(c.result) || (c.result === 'big' && !(c.x !== undefined && c.x > 0 && c.x <= 5000)))) add(cp, 'previous spin: win, loss, or a win of at least a size (x bet, up to 5000)');
        if (c.kind === 'streak' && !(['win', 'loss'].includes(c.of) && Number.isInteger(c.n) && c.n >= 2 && c.n <= 20)) add(cp, 'streak: win or loss, 2 to 20 in a row');
        if (c.kind === 'bonusWin' && !(c.atLeast > 0 && c.atLeast <= 5000)) add(cp, 'bonus win: above 0 and up to 5000x');
        if (c.kind === 'spinsLeft' && !(Number.isInteger(c.atMost) && c.atMost >= 0 && c.atMost <= 50)) add(cp, 'spins left: whole number from 0 to 50');
      });
    }
    if (f.type === 'randomWild') {
      const ks = Object.keys(f.counts ?? {});
      if (!ks.length || ks.some((k) => !Number.isInteger(Number(k)) || Number(k) < 1 || Number(k) > Math.floor(cells / 3))) add(`${p}.counts`, `wild counts must be whole numbers from 1 to ${Math.floor(cells / 3)}`);
      if (Object.values(f.counts ?? {}).some((w) => !(w > 0))) add(`${p}.counts`, 'weights must be above 0');
    }
    if (f.type === 'mystery') {
      const ks = Object.keys(f.counts ?? {});
      if (!ks.length || ks.some((k) => !Number.isInteger(Number(k)) || Number(k) < 2 || Number(k) > Math.floor(cells / 2))) add(`${p}.counts`, `cell counts must be whole numbers from 2 to ${Math.floor(cells / 2)}`);
      if (Object.values(f.counts ?? {}).some((w) => !(w > 0))) add(`${p}.counts`, 'weights must be above 0');
      if (!['all', 'high'].includes(f.pool)) add(`${p}.pool`, 'all or high');
    }
    if (f.type === 'expandWild' || f.type === 'spreadWild') {
      if (!(f.chance > 0 && f.chance <= 1)) add(`${p}.chance`, 'chance must be above 0 and at most 1');
    }
    if (f.type === 'expandWild' && !['reel', 'row', 'cross'].includes(f.shape)) add(`${p}.shape`, 'reel, row or cross');
    if (f.type === 'spreadWild' && !(Number.isInteger(f.copies) && f.copies >= 1 && f.copies <= 4)) add(`${p}.copies`, 'whole number from 1 to 4');
    if (f.type === 'stickyWild' && !(Number.isInteger(f.lifetime) && f.lifetime >= 0 && f.lifetime <= 50)) add(`${p}.lifetime`, 'whole number from 0 to 50 (0 = until the bonus ends)');
    if (f.type === 'heroWild') {
      if (!(Number.isInteger(f.startFactor) && f.startFactor >= 1 && f.startFactor <= 20)) add(`${p}.startFactor`, 'whole number from 1 to 20');
      if (!(Number.isInteger(f.growth) && f.growth >= 0 && f.growth <= 10)) add(`${p}.growth`, 'whole number from 0 to 10');
      if (!(Number.isInteger(f.maxFactor) && f.maxFactor >= f.startFactor && f.maxFactor <= 100)) add(`${p}.maxFactor`, 'whole number from the start multiplier up to 100');
      if (!['random', 'step'].includes(f.move)) add(`${p}.move`, 'random or step');
    }
    if (f.type === 'cellMultiplier') {
      if (!(Number.isInteger(f.start) && f.start >= 2 && f.start <= 10)) add(`${p}.start`, 'whole number from 2 to 10');
      if (!(Number.isInteger(f.max) && f.max >= f.start && f.max <= 1024)) add(`${p}.max`, 'whole number from the start value up to 1024');
      if (!['double', 'add'].includes(f.growth)) add(`${p}.growth`, 'double or add');
      if (!['spin', 'bonus'].includes(f.memory)) add(`${p}.memory`, 'spin or bonus');
    }
    if (f.type === 'holdAndWin') {
      const ks = Object.keys(f.counts ?? {});
      if (!ks.length || ks.some((k) => !Number.isInteger(Number(k)) || Number(k) < 1 || Number(k) >= cells)) add(`${p}.counts`, `starting orbs: whole numbers from 1 to ${cells - 1}`);
      if (Object.values(f.counts ?? {}).some((w) => !(w > 0))) add(`${p}.counts`, 'weights must be above 0');
      if (!(f.landChance >= 0.01 && f.landChance <= 0.5)) add(`${p}.landChance`, 'chance for each empty cell: 1% to 50%');
      if (!(Number.isInteger(f.respins) && f.respins >= 1 && f.respins <= 5)) add(`${p}.respins`, 'respins: whole number from 1 to 5');
      const vs = Object.keys(f.values ?? {});
      if (!vs.length || vs.some((k) => !Number.isInteger(Number(k)) || Number(k) < 1 || Number(k) > 1000)) add(`${p}.values`, 'orb values: whole numbers from 1x to 1000x the bet');
      if (Object.values(f.values ?? {}).some((w) => !(w > 0))) add(`${p}.values`, 'weights must be above 0');
      if (![1, 2, 3, 5, 10].includes(f.fullMult)) add(`${p}.fullMult`, 'full grid multiplier: 1, 2, 3, 5 or 10');
    }
    if (f.type === 'multiplierLadder') {
      if (!(Number.isInteger(f.start) && f.start >= 1 && f.start <= 20)) add(`${p}.start`, 'whole number from 1 to 20');
      if (!(Number.isInteger(f.step) && f.step >= 0 && f.step <= 10)) add(`${p}.step`, 'whole number from 0 to 10');
      if (!(Number.isInteger(f.max) && f.max >= f.start && f.max <= 500)) add(`${p}.max`, 'whole number from the start value up to 500');
    }
    if (f.type === 'bonusMultiplier') {
      if (!(Number.isInteger(f.start) && f.start >= 1 && f.start <= 20)) add(`${p}.start`, 'whole number from 1 to 20');
      if (!(Number.isInteger(f.step) && f.step >= 0 && f.step <= 10)) add(`${p}.step`, 'whole number from 0 to 10');
      if (!(Number.isInteger(f.max) && f.max >= f.start && f.max <= 500)) add(`${p}.max`, 'whole number from the start value up to 500');
    }
    if (f.type === 'lives' && !(Number.isInteger(f.lives) && f.lives >= 1 && f.lives <= 10)) add(`${p}.lives`, 'lives: whole number from 1 to 10');
    if (f.type === 'shuffle' && ctx.positional === false) add(`${p}.type`, 'a shuffle only changes a game where position matters (cluster, paylines or ways); in a pay anywhere game it changes nothing');
    if (f.type === 'removeSymbols' && !['lowest', 'low'].includes(f.target)) add(`${p}.target`, 'lowest or low');
    if (f.type === 'prizeAward') {
      const vs = Object.keys(f.values ?? {});
      if (!vs.length || vs.some((k) => !Number.isInteger(Number(k)) || Number(k) < 1 || Number(k) > 1000)) add(`${p}.values`, 'prize values: whole numbers from 1x to 1000x the bet');
      if (Object.values(f.values ?? {}).some((w) => !(w > 0))) add(`${p}.values`, 'weights must be above 0');
    }
    if (f.type === 'wildMultiplier') {
      const vs = Object.keys(f.values ?? {});
      if (!vs.length || vs.some((k) => !Number.isInteger(Number(k)) || Number(k) < 2 || Number(k) > 100)) add(`${p}.values`, 'wild multipliers: whole numbers from 2x to 100x');
      if (Object.values(f.values ?? {}).some((w) => !(w > 0))) add(`${p}.values`, 'weights must be above 0');
      if (!['add', 'multiply'].includes(f.combine)) add(`${p}.combine`, 'add or multiply');
    }
    if (f.type === 'colossalWild') {
      if (![2, 3, 4].includes(f.size)) add(`${p}.size`, 'block size: 2, 3 or 4');
      else if (f.size * f.size > cells / 2) add(`${p}.size`, 'the block is too big for this board');
    }
    if (f.type === 'gadgetPanel') {
      if (!Array.isArray(f.slots) || f.slots.length < 1 || f.slots.length > 12) add(`${p}.slots`, 'one to twelve gadget cells');
      else if (f.id === GADGET_BAR_ID && ctx.reels && ctx.rows && f.slots.length !== gadgetBarCells({ reels: ctx.reels, rows: ctx.rows }, f.position)) add(`${p}.slots`, `the bar has one cell per ${f.position === 'side' ? 'row' : 'reel'} of the board: ${gadgetBarCells({ reels: ctx.reels, rows: ctx.rows }, f.position)} cells`);
      if (f.position !== undefined && !['top', 'side'].includes(f.position)) add(`${p}.position`, 'top or side');
      (f.slots ?? []).forEach((sl, k) => {
        const sp = `${p}.slots[${k}]`;
        if (sl.name !== undefined && String(sl.name).length > 16) add(`${sp}.name`, 'name: at most 16 characters');
        if (!sl.charge || !['land', 'wins'].includes(sl.charge.kind)) add(`${sp}.charge`, 'a cell is charged by symbols that land or by winning steps');
        else if (sl.charge.kind === 'land') {
          if (!Array.isArray(sl.charge.symbols) || !sl.charge.symbols.length) add(`${sp}.charge`, 'choose at least one symbol that charges this cell');
          else if (ctx.symbols && sl.charge.symbols.some((x) => !ctx.symbols!.includes(x))) add(`${sp}.charge`, "choose the game's own symbols");
        }
        if (!(Number.isInteger(sl.need) && sl.need >= 1 && sl.need <= 50)) add(`${sp}.need`, 'charge needed: whole number from 1 to 50');
        if (!['wilds', 'multiplier', 'remove', 'wildReel'].includes(sl.tool)) add(`${sp}.tool`, 'wilds, multiplier, remove or wildReel');
        const maxPower = sl.tool === 'wilds' ? Math.floor(cells / 3) : sl.tool === 'wildReel' ? Math.max(1, (ctx.reels ?? 4) - 1) : 10;
        if (!(Number.isInteger(sl.power) && sl.power >= 1 && sl.power <= maxPower)) add(`${sp}.power`, `power: whole number from 1 to ${maxPower}`);
        if (sl.eliteNeed !== undefined) {
          if (!(Number.isInteger(sl.eliteNeed) && sl.eliteNeed > sl.need && sl.eliteNeed <= 100)) add(`${sp}.eliteNeed`, 'upgrade charge: a whole number above the opening charge, up to 100');
          if (!(Number.isInteger(sl.elitePower) && (sl.elitePower as number) >= 1 && (sl.elitePower as number) <= maxPower)) add(`${sp}.elitePower`, `upgraded power: whole number from 1 to ${maxPower}`);
        }
      });
    }
  });
  return out;
}

// ---------------------------------------------------------------- rules text
const wherePhrase = (where: Where[], names: Record<string, string>): string => {
  const parts = where.map((w) => (w === BASE ? 'in the base game' : w === NATURAL_FREE ? 'during free spins' : `during ${names[w] ?? w}`));
  return parts.length <= 1 ? parts[0] ?? '' : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
};
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** One or two sentences for the rules screen and the AI instructions. `names` maps bonus ids to their display names. */
export function featureRule(f: Feature, wild: string, names: Record<string, string> = {}): string {
  const where = cap(wherePhrase(f.where, names));
  const when = f.trigger.conditions.length ? ` It works when ${describeTrigger(f.trigger)}.` : ' It works on every spin.';
  switch (f.type) {
    case 'randomWild': {
      const ks = Object.keys(f.counts).map(Number).sort((a, b) => a - b);
      return `${where}, random ${wild} (Wild) symbols can land: ${ks.length === 1 ? ks[0] : `${ks[0]} to ${ks[ks.length - 1]}`} ${wild} symbols are added to random positions before the spin is paid. They never replace scatters or multipliers.${when}`;
    }
    case 'mystery': {
      const ks = Object.keys(f.counts).map(Number).sort((a, b) => a - b);
      return `${where}, mystery symbols can appear: ${ks.length === 1 ? ks[0] : `${ks[0]} to ${ks[ks.length - 1]}`} positions reveal the same ${f.pool === 'high' ? 'high paying ' : ''}symbol before the spin is paid. All of them are the same symbol, picked at random. They never cover scatters, multipliers or wilds.${when}`;
    }
    case 'expandWild': return `${where}, a ${wild} (Wild) symbol can expand ${f.shape === 'reel' ? 'to cover its whole reel' : f.shape === 'row' ? 'to cover its whole row' : 'to cover its whole reel and row'} before the spin is paid. Scatters and multipliers are never covered.${when}`;
    case 'spreadWild': return `${where}, a ${wild} (Wild) symbol can copy itself onto ${f.copies === 1 ? 'one neighbouring position' : `up to ${f.copies} neighbouring positions`} before the spin is paid. Copies do not spread again. Scatters and multipliers are never covered.${when}`;
    case 'stickyWild': return `${where}, every ${wild} (Wild) that lands stays on its position for ${f.lifetime === 0 ? 'the rest of the feature' : `the next ${f.lifetime} free spin${f.lifetime === 1 ? '' : 's'}`}.${f.where.includes(BASE) ? ` In the base game it stays through the tumbles of the round${f.lifetime === 0 ? '' : ` (${f.lifetime} tumble${f.lifetime === 1 ? '' : 's'})`}.` : ''}${when}`;
    case 'heroWild': return `${where}, a hero ${wild} (Wild) appears and moves ${f.move === 'step' ? 'to a neighbouring position' : 'to a random position'} on every free spin. When a free spin wins, its win is multiplied by the hero's multiplier (in the base game the hero moves and multiplies every tumble that wins), which starts at ${f.startFactor}x${f.growth > 0 ? ` and grows by ${f.growth} after every winning free spin, up to ${f.maxFactor}x` : ''}.${when}`;
    case 'cellMultiplier': return `${where}, every position that takes part in a win gets a multiplier of ${f.start}x. Each time that position takes part in another win its multiplier ${f.growth === 'double' ? 'doubles' : `grows by ${f.start}`}, up to ${f.max}x. A win that includes marked positions is multiplied by the sum of their multipliers. Marks are cleared ${f.memory === 'bonus' && !f.where.every((w) => w === BASE) ? 'when the free spins end' : 'at the end of every spin'}.${when}`;
    case 'multiplierLadder': return `${where}, the global multiplier starts every spin at ${f.start}x${f.step > 0 ? ` and grows by ${f.step} after every tumble, up to ${f.max}x` : ' and does not grow'}. It applies to every win of the spin.${f.where.includes(BASE) ? ' In the base game it applies to the tumbles of one round.' : ''}${when}`;
    case 'shuffle': return `${where}, the ordinary symbols on the board change places at random before the spin is paid. Scatters, wilds and multipliers stay where they are.${when}`;
    case 'lives': return `${where}, the bonus starts with ${f.lives} li${f.lives === 1 ? 'fe' : 'ves'}. Every free spin that does not win costs one life. When no life is left the bonus ends, even if free spins remain.${when}`;
    case 'bonusMultiplier': return `${where}, one multiplier applies to every win of the bonus. It starts at ${f.start}x${f.step > 0 ? ` and grows by ${f.step} after every free spin that wins, up to ${f.max}x` : ' and does not grow'}. It is kept from one free spin to the next and ends with the bonus.${when}`;
    case 'removeSymbols': return `${where}, ${f.target === 'lowest' ? 'the lowest paying symbol' : 'the lower paying half of the symbols'} on the board ${f.target === 'lowest' ? 'is' : 'are'} swapped for other paying symbols before the spin is paid. Scatters, wilds and multipliers are never changed.${when}`;
    case 'prizeAward': {
      const vs = Object.keys(f.values).map(Number).sort((a, b) => a - b);
      return `${where}, a cash prize can be won: ${vs.length === 1 ? `${vs[0]}x` : `${vs[0]}x to ${vs[vs.length - 1]}x`} the bet is added to the spin win. The prize is not changed by multipliers.${when}`;
    }
    case 'wildMultiplier': {
      const vs = Object.keys(f.values).map(Number).sort((a, b) => a - b);
      return `${where}, every ${wild} (Wild) that lands carries a multiplier of ${vs.length === 1 ? `${vs[0]}x` : `${vs[0]}x to ${vs[vs.length - 1]}x`}. A win that includes ${wild} symbols is multiplied by ${f.combine === 'add' ? 'the sum' : 'the product'} of their values.${when}`;
    }
    case 'colossalWild': return `${where}, a colossal block of ${f.size} by ${f.size} ${wild} (Wild) symbols can land anywhere on the board before the spin is paid. It never covers scatters or multipliers.${when}`;
    case 'holdAndWin': {
      const ks = Object.keys(f.counts).map(Number).sort((a, b) => a - b); const vs = Object.keys(f.values).map(Number).sort((a, b) => a - b);
      return `${where}, a hold and win round can start: ${ks.length === 1 ? ks[0] : `${ks[0]} to ${ks[ks.length - 1]}`} orbs land and lock, each showing a cash value from ${vs[0]}x to ${vs[vs.length - 1]}x the bet. Each empty position can fill with another orb on every respin. You get ${f.respins} respin${f.respins === 1 ? '' : 's'}, and every new orb restarts them. When the respins run out, the values of all orbs are added to the spin win${f.fullMult > 1 ? `; if every position fills, the total is multiplied by ${f.fullMult}` : ''}. Orb values are not affected by multipliers.${when}`;
    }
    case 'gadgetPanel': {
      const toolText = (sl: GadgetSlot, power: number) => (sl.tool === 'wildReel' ? `turns ${power} random reel${power === 1 ? '' : 's'} into ${wild} (Wild) symbols${sl.hold ? ' and keeps them wild until the bonus ends' : ''}` : sl.tool === 'wilds' ? `drops ${power} ${wild} (Wild) symbol${power === 1 ? '' : 's'}` : sl.tool === 'multiplier' ? `adds ${power} to the multiplier` : 'removes the lowest paying symbol and refills it');
      const cells = f.slots.map((sl, i) => {
        const what = sl.charge.kind === 'wins' ? 'each winning step' : `each ${sl.charge.symbols.join(', ')} that lands`;
        return `cell ${i + 1}${sl.name ? ` (${sl.name})` : ''} gains 1 charge from ${what}, opens at ${sl.need} and ${toolText(sl, sl.power)}${sl.eliteNeed ? `; at ${sl.eliteNeed} charges it upgrades and ${toolText(sl, sl.elitePower ?? sl.power)}` : ''}${sl.repeat ? '; then its charge starts again' : ''}`;
      }).join('. ');
      return `${where} a bar of ${f.slots.length} gadget cell${f.slots.length === 1 ? '' : 's'} is shown ${f.position === 'side' ? 'beside the board, one cell for each row' : 'above the board, one cell for each reel'}. ${f.sequence ? 'The cells open in order, like doors: a cell only starts charging once the one before it has opened. ' : ''}Every cell charges on its own: ${cells}. An opened cell works at the next free spin${f.where.includes(BASE) ? ' (in the base game, after the next tumble; a base round with no tumbles has no next step, so a cell that opens on the board that landed works at once on that board)' : ''}. The bar is always shown ${f.position === 'side' ? 'beside' : 'above'} the board.${when}`;
    }
  }
}

/** The paying symbol with the smallest pay for the smallest winning group (ties: the later one in the list). Used by the 'remove' gadget in the game and in the estimate. */
export function lowestPayingSymbol(paying: string[], firstTierPays: Record<string, number>): string {
  let best = paying[paying.length - 1];
  for (const p of paying) if ((firstTierPays[p] ?? Infinity) <= (firstTierPays[best] ?? Infinity)) best = p;
  return best;
}
