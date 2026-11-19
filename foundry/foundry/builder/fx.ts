// Special features in the live estimate: the same rules, in the same order, as foundry/compiler/mechanics/t1/foundry_features.py.
// Pure; used by sim.ts for the base game spin and for every free spins feature (natural or purchased).
import { type Condition, type Feature, type CellMultiplierFeature, type GadgetPanelFeature, type GadgetSlot, type HeroWildFeature, type Trigger } from '../compiler/features';

export interface FxBoard { sym: string[][]; mul: number[][]; strips: string[][]; /** Multipliers carried by wilds (0 = none) and how a win combines them; set by the wild multiplier feature. */ wm?: number[][]; wmode?: 'add' | 'multiply' | null }
export interface FxModel { /** false: a base round has no steps (paylines or ways without tumbles) */ tumbles?: boolean; reels: number; rows: number; wild: string; scatter: string; mult: string; paying: string[]; lowest: string }

/** What the bonus conditions read. Filled in by the free spins loop. */
export interface BonusState { spin: number; total: number; prevWin: number | null; winStreak: number; lossStreak: number; bonusWin: number }
export const newBonusState = (): BonusState => ({ spin: 0, total: 0, prevWin: null, winStreak: 0, lossStreak: 0, bonusWin: 0 });

interface Held { held: Map<number, number> }
interface Hero { cell: [number, number] | null; factor: number | null }
interface GadgetCell { charge: number; level: number; done: boolean; opened: boolean }
interface Gadget { cells: GadgetCell[]; pending: { slot: GadgetSlot; power: number }[]; reels: Set<number> }

export class FxRuntime {
  active: Feature[] = [];
  private held = new Map<string, Held>();
  private hero = new Map<string, Hero>();
  private gad = new Map<string, Gadget>();
  private bm = new Map<string, number>();
  private lives = new Map<string, number>();
  /** A bonus whose lives ran out ends after the current spin. */
  over = false;
  /** Marks of each cell multiplier instance, indexed reel * rows + row. */
  terrain = new Map<string, Float64Array>();
  /** @param whereId 'base', 'free' (scatter-triggered free spins), a purchased bonus id, or several of them (the ante bet's base game is 'base' and 'ante') */
  private places: string[];
  constructor(private m: FxModel, private features: Feature[], whereId: string | string[], private free: boolean) { this.places = Array.isArray(whereId) ? whereId : [whereId]; }

  get hasAny(): boolean { return this.features.some((f) => f.where.some((w) => this.places.includes(w))); }
  cellMultipliers(): { f: CellMultiplierFeature; t: Float64Array }[] {
    return this.active.filter((f): f is CellMultiplierFeature => f.type === 'cellMultiplier').map((f) => ({ f, t: this.terrain.get(f.id) ?? this.mkTerrain(f.id) }));
  }
  private mkTerrain(id: string) { const t = new Float64Array(this.m.reels * this.m.rows); this.terrain.set(id, t); return t; }

  private cond(c: Condition, names: string[], b: BonusState, rng: () => number): boolean {
    switch (c.kind) {
      case 'chance': return rng() < c.p;
      case 'scatters': { const n = names.filter((x) => x === this.m.scatter).length; return n >= c.min && (c.max === undefined || n <= c.max); }
      case 'symbols': return names.filter((x) => x === c.symbol).length >= c.min;
      case 'spinIs': return c.which === 'first' ? b.spin === 1 : c.which === 'last' ? b.spin >= b.total : c.which === 'every' ? b.spin % (c.n ?? 2) === 0 : b.spin >= (c.n ?? 1);
      case 'prevSpin': return b.prevWin === null ? false : c.result === 'win' ? b.prevWin > 0 : c.result === 'loss' ? b.prevWin === 0 : b.prevWin >= (c.x ?? 0);
      case 'streak': return (c.of === 'win' ? b.winStreak : b.lossStreak) >= c.n;
      case 'bonusWin': return b.bonusWin >= c.atLeast;
      case 'spinsLeft': return b.total - b.spin <= c.atMost;
    }
  }
  private trig(t: Trigger, names: string[], b: BonusState, rng: () => number): boolean {
    const r = t.conditions.map((c) => this.cond(c, names, b, rng)); // every condition is evaluated (no short cut), like the game
    if (!r.length) return true;
    return t.match === 'all' ? r.every(Boolean) : r.some(Boolean);
  }
  private of<T extends Feature['type']>(t: T): Extract<Feature, { type: T }>[] { return this.active.filter((f): f is Extract<Feature, { type: T }> => f.type === t); }
  private pick(counts: Record<string, number>, rng: () => number): number {
    const ks = Object.keys(counts); const total = ks.reduce((a, k) => a + counts[k], 0);
    let t = rng() * total;
    for (const k of ks) { t -= counts[k]; if (t < 0) return Number(k); }
    return Number(ks[ks.length - 1]);
  }
  private cells(b: FxBoard, skipWild = true): [number, number][] {
    const out: [number, number][] = [];
    for (let r = 0; r < this.m.reels; r++) for (let y = 0; y < b.sym[r].length; y++) { const s = b.sym[r][y]; if (s !== this.m.scatter && s !== this.m.mult && (!skipWild || s !== this.m.wild)) out.push([r, y]); }
    return out;
  }
  private sample(cells: [number, number][], n: number, rng: () => number): [number, number][] {
    const out: [number, number][] = [];
    for (let i = 0; i < Math.min(n, cells.length); i++) { const j = i + Math.floor(rng() * (cells.length - i)); [cells[i], cells[j]] = [cells[j], cells[i]]; out.push(cells[i]); }
    return out;
  }
  private put(b: FxBoard, [r, y]: [number, number], s: string) { b.sym[r][y] = s; b.mul[r][y] = 0; if (b.wm) b.wm[r][y] = 0; }

  /** Everything that happens when a new board is revealed. Returns the multiplier steps added by gadgets for this spin. */
  reveal(b: FxBoard, rng: () => number, bonus: BonusState): number {
    const m = this.m;
    const names = b.sym.flat();
    this.active = this.features.filter((f) => f.where.some((w) => this.places.includes(w)) && this.trig(f.trigger, names, bonus, rng));
    b.wmode = null;
    if (!this.active.length) return 0;
    const wild = m.wild; const key = (r: number, y: number) => r * m.rows + y;

    for (const f of this.of('cellMultiplier')) if (!this.free || f.memory === 'spin') this.terrain.get(f.id)?.fill(0);
    // 1. held wilds come back
    this.stickyReturn(b);
    // 2. random wilds
    for (const f of this.of('randomWild')) { const n = this.pick(f.counts, rng); for (const c of this.sample(this.cells(b), n, rng)) this.put(b, c, wild); }
    // 2b. a colossal block of wilds
    for (const f of this.of('colossalWild')) this.colossal(b, f.size, rng);
    // 3. mystery reveal
    for (const f of this.of('mystery')) {
      const n = this.pick(f.counts, rng);
      const freq = new Map<string, number>(); for (const col of b.strips) for (const x of col) if (x !== m.scatter && x !== m.mult && x !== wild) freq.set(x, (freq.get(x) ?? 0) + 1);
      const pool = (f.pool === 'high' ? m.paying.slice(0, Math.floor((m.paying.length + 1) / 2)) : m.paying).filter((x) => freq.has(x));
      const wsum = pool.reduce((a, x) => a + (freq.get(x) ?? 0), 0);
      let u = rng() * wsum; let symbol = pool[pool.length - 1];
      for (const x of pool) { u -= freq.get(x) ?? 0; if (u < 0) { symbol = x; break; } }
      for (const c of this.sample(this.cells(b), n, rng)) this.put(b, c, symbol);
    }
    // 3b. low paying symbols are swapped for better ones
    for (const f of this.of('removeSymbols')) this.removeSymbols(b, f.target, rng);
    // 3c. the ordinary symbols change places
    for (const _f of this.of('shuffle')) {
      const cs = this.cells(b); const syms = cs.map(([r, y]) => b.sym[r][y]);
      for (let i = syms.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [syms[i], syms[j]] = [syms[j], syms[i]]; }
      cs.forEach(([r, y], i) => { b.sym[r][y] = syms[i]; });
    }
    // 4. expanding and spreading wilds act on the wilds on the board now, not on each other's output
    const grow = [...this.of('expandWild'), ...this.of('spreadWild')];
    if (grow.length) {
      const sources: [number, number][] = [];
      for (let r = 0; r < m.reels; r++) for (let y = 0; y < b.sym[r].length; y++) if (b.sym[r][y] === wild) sources.push([r, y]);
      const fill: [number, number][] = [];
      for (const [r, y] of sources) for (const f of grow) {
        if (!(rng() < f.chance)) continue;
        if (f.type === 'expandWild') {
          if (f.shape === 'reel' || f.shape === 'cross') for (let k = 0; k < b.sym[r].length; k++) fill.push([r, k]);
          if (f.shape === 'row' || f.shape === 'cross') for (let k = 0; k < m.reels; k++) fill.push([k, y]);
        } else {
          const near = ([[1, 0], [-1, 0], [0, 1], [0, -1]] as const).map(([dr, dy]) => [r + dr, y + dy] as [number, number]).filter(([a, c]) => a >= 0 && a < m.reels && c >= 0 && c < b.sym[a].length && c < m.rows);
          fill.push(...this.sample(near, f.copies, rng));
        }
      }
      for (const [r, y] of fill) { const s = b.sym[r][y]; if (s !== m.scatter && s !== m.mult) this.put(b, [r, y], wild); }
    }
    // 5. every wild on the board is held for the next free spins
    this.stickyRecord(b);
    // 6. the hero wild moves
    this.heroMove(b, rng);
    // 7. gadget rows: opened gadgets work first, then the new board charges the meters
    const addMult = this.gadgetsStep(b, rng);
    this.assignWildMults(b, rng);
    return addMult;
  }

  /** The bonus-wide multiplier for the spin that was just revealed (0 when there is none). */
  bonusMultNow(): number {
    let v = 0;
    for (const f of this.of('bonusMultiplier')) { if (!this.bm.has(f.id)) this.bm.set(f.id, f.start); v = Math.max(v, this.bm.get(f.id)!); }
    return v;
  }
  /** Prizes that fired on this spin: flat, after every multiplier. */
  prize(rng: () => number): number { let t = 0; for (const f of this.of('prizeAward')) t += this.pick(f.values, rng); return t; }
  private removeSymbols(b: FxBoard, target: 'lowest' | 'low', rng: () => number) {
    const m = this.m;
    const set = new Set(target === 'lowest' ? [m.lowest] : m.paying.slice(Math.floor((m.paying.length + 1) / 2)));
    const freq = new Map<string, number>(); for (const col of b.strips) for (const x of col) if (x !== m.scatter && x !== m.mult && x !== m.wild && !set.has(x)) freq.set(x, (freq.get(x) ?? 0) + 1);
    const names = [...freq.keys()]; const total = [...freq.values()].reduce((a, c) => a + c, 0);
    if (!names.length) return;
    for (let r = 0; r < m.reels; r++) for (let y = 0; y < b.sym[r].length; y++) if (set.has(b.sym[r][y])) {
      let t = rng() * total; let pick = names[names.length - 1];
      for (const k of names) { t -= freq.get(k) ?? 0; if (t < 0) { pick = k; break; } }
      this.put(b, [r, y], pick);
    }
  }

  /** Where the multiplier ladder starts every spin (0 when there is none). */
  ladderStart(): number { return this.of('multiplierLadder')[0]?.start ?? 0; }
  /** The global multiplier after a tumble: the ladder's step up to its limit, or +1 without a ladder (free spins only). */
  ladderNext(gm: number): number { const f = this.of('multiplierLadder')[0]; return f ? (f.step > 0 && gm < f.max ? Math.min(f.max, gm + f.step) : gm) : gm + 1; }
  /** Base game: the ladder only moves when there is one. */
  ladderStep(gm: number): number { return this.of('multiplierLadder').length ? this.ladderNext(gm) : gm; }

  private colossal(b: FxBoard, n: number, rng: () => number) {
    const m = this.m; const anchors: [number, number][] = [];
    for (let r = 0; r + n <= m.reels; r++) {
      let h = Infinity; for (let k = 0; k < n; k++) h = Math.min(h, b.sym[r + k].length);
      for (let y = 0; y + n <= h; y++) {
        let ok = true;
        for (let i = 0; i < n && ok; i++) for (let j = 0; j < n; j++) { const s = b.sym[r + i][y + j]; if (s === m.scatter || s === m.mult) { ok = false; break; } }
        if (ok) anchors.push([r, y]);
      }
    }
    if (!anchors.length) return;
    const [r, y] = anchors[Math.floor(rng() * anchors.length)];
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) this.put(b, [r + i, y + j], m.wild);
  }
  /** Wilds without a multiplier get one; they keep it while they tumble down. */
  private assignWildMults(b: FxBoard, rng: () => number) {
    const f = this.of('wildMultiplier')[0]; if (!f || !b.wm) return;
    b.wmode = f.combine;
    for (let r = 0; r < this.m.reels; r++) for (let y = 0; y < b.sym[r].length; y++) if (b.sym[r][y] === this.m.wild && !b.wm[r][y]) b.wm[r][y] = this.pick(f.values, rng);
  }

  private stickyReturn(b: FxBoard) {
    const m = this.m;
    for (const f of this.of('stickyWild')) {
      const st = this.held.get(f.id) ?? { held: new Map<number, number>() }; this.held.set(f.id, st);
      for (const [k, left] of [...st.held]) {
        if (left <= 0) { st.held.delete(k); continue; }
        const r = Math.floor(k / m.rows); const y = k % m.rows; const s = b.sym[r]?.[y];
        if (s !== undefined && s !== m.scatter && s !== m.mult) this.put(b, [r, y], m.wild);
        st.held.set(k, left - 1);
      }
    }
  }
  private stickyRecord(b: FxBoard) {
    const m = this.m;
    for (const f of this.of('stickyWild')) {
      const st = this.held.get(f.id) ?? { held: new Map<number, number>() }; this.held.set(f.id, st); const hold = f.lifetime > 0 ? f.lifetime : 1e9;
      for (let r = 0; r < m.reels; r++) for (let y = 0; y < b.sym[r].length; y++) if (b.sym[r][y] === m.wild) st.held.set(r * m.rows + y, hold);
    }
  }
  private heroMove(b: FxBoard, rng: () => number) {
    for (const f of this.of('heroWild')) {
      const st = this.hero.get(f.id) ?? { cell: null, factor: null }; this.hero.set(f.id, st);
      if (st.factor === null) st.factor = f.startFactor;
      const cells = this.cells(b, false);
      let target: [number, number] | undefined;
      if (f.move === 'step' && st.cell) {
        const [hr, hy] = st.cell;
        const near = cells.filter(([r, y]) => !(r === hr && y === hy) && Math.abs(r - hr) <= 1 && Math.abs(y - hy) <= 1);
        if (near.length) target = near[Math.floor(rng() * near.length)];
      }
      if (!target && cells.length) target = cells[Math.floor(rng() * cells.length)];
      if (target) { this.put(b, target, this.m.wild); st.cell = target; }
    }
  }
  private gadgetsStep(b: FxBoard, rng: () => number): number {
    let addMult = 0;
    for (const f of this.of('gadgetPanel')) {
      const g = this.gadget(f);
      this.wildReels(b, [...g.reels]); // locked wild reels stay wild
      addMult += this.fire(f, g, b, rng);
      const names = b.sym.flat();
      f.slots.forEach((sl, i) => { if (sl.charge.kind === 'land') { const set = sl.charge.symbols; this.charge(f, g, i, names.filter((x) => set.includes(x)).length); } });
      if (!this.free && this.m.tumbles === false) addMult += this.fire(f, g, b, rng); // no steps in a base round: what opened works at once on this board
    }
    return addMult;
  }
  /** The base game has no spins inside a round, only tumbles: after every tumble held wilds come back, the hero moves and the gadgets work. Returns the multiplier the gadgets add. */
  afterTumble(b: FxBoard, rng: () => number): number {
    if (this.free || !this.active.length) return 0;
    this.stickyReturn(b); this.stickyRecord(b); this.heroMove(b, rng);
    const add = this.gadgetsStep(b, rng);
    this.assignWildMults(b, rng);
    return add;
  }

  private wildReels(b: FxBoard, reels: number[]) { for (const r of reels) for (let y = 0; y < (b.sym[r]?.length ?? 0); y++) { const s = b.sym[r][y]; if (s !== this.m.scatter && s !== this.m.mult) this.put(b, [r, y], this.m.wild); } }
  private gadget(f: GadgetPanelFeature): Gadget { let g = this.gad.get(f.id); if (!g) { g = { cells: f.slots.map(() => ({ charge: 0, level: 0, done: false, opened: false })), pending: [], reels: new Set<number>() }; this.gad.set(f.id, g); } return g; }
  /** Adds charge to one cell: it opens at its threshold, upgrades at its elite threshold, then repeats or stays done. */
  private charge(f: GadgetPanelFeature, g: Gadget, i: number, n: number) {
    const c = g.cells[i]; const sl = f.slots[i];
    if (n <= 0 || c.done) return;
    if (f.sequence && i > 0 && !g.cells[i - 1].opened) return; // doors: a cell only starts charging once the one before it has opened
    c.charge += n;
    const last = sl.eliteNeed ? 2 : 1;
    if (c.level === 0 && c.charge >= sl.need && g.pending.length < 20) { c.level = 1; c.opened = true; g.pending.push({ slot: sl, power: sl.power }); }
    if (c.level === 1 && sl.eliteNeed && c.charge >= sl.eliteNeed && g.pending.length < 20) { c.level = 2; g.pending.push({ slot: sl, power: sl.elitePower ?? sl.power }); }
    if (c.level === last) { if (sl.repeat) { c.charge = 0; c.level = 0; } else c.done = true; }
  }
  private fire(_f: GadgetPanelFeature, g: Gadget, b: FxBoard, rng: () => number): number {
    const m = this.m; let addMult = 0; const pending = g.pending; g.pending = [];
    for (const { slot, power } of pending) {
      if (slot.tool === 'wilds') for (const c of this.sample(this.cells(b), power, rng)) this.put(b, c, m.wild);
      else if (slot.tool === 'wildReel') {
        const free = Array.from({ length: m.reels }, (_, r) => r).filter((r) => !g.reels.has(r)); const chosen: number[] = [];
        for (let i = 0; i < Math.min(power, free.length); i++) { const j = i + Math.floor(rng() * (free.length - i)); [free[i], free[j]] = [free[j], free[i]]; chosen.push(free[i]); }
        this.wildReels(b, chosen); if (slot.hold) for (const r of chosen) g.reels.add(r);
      }
      else if (slot.tool === 'multiplier') addMult += power;
      else if (slot.tool === 'remove') {
        const freq = new Map<string, number>(); for (const col of b.strips) for (const x of col) if (x !== m.scatter && x !== m.mult && x !== m.wild && x !== m.lowest) freq.set(x, (freq.get(x) ?? 0) + 1);
        const names = [...freq.keys()]; const total = [...freq.values()].reduce((a, c) => a + c, 0);
        for (let r = 0; r < m.reels; r++) for (let y = 0; y < b.sym[r].length; y++) if (b.sym[r][y] === m.lowest && names.length) {
          let t = rng() * total; let pick = names[names.length - 1];
          for (const k of names) { t -= freq.get(k) ?? 0; if (t < 0) { pick = k; break; } }
          this.put(b, [r, y], pick);
        }
      }
    }
    return addMult;
  }
  /** A winning step charges the gadget rows that run on wins. */
  onWin(w: number): void { if (w > 0) for (const f of this.of('gadgetPanel')) f.slots.forEach((sl, i) => { if (sl.charge.kind === 'wins') this.charge(f, this.gadget(f), i, 1); }); }

  /** The spin's win after the tumbles: every active hero multiplies it, then grows. Returns the product of the hero factors (1 when none). */
  heroFactor(win: number): number {
    if (!(win > 0)) return 1;
    let product = 1;
    for (const f of this.of('heroWild') as HeroWildFeature[]) {
      const st = this.hero.get(f.id); if (!st || st.factor === null) continue;
      product *= st.factor; st.factor = Math.min(f.maxFactor, st.factor + f.growth);
    }
    return product;
  }
  /** Hold and win rounds that fired on this spin: the orb values (flat, after every multiplier). */
  holdAndWin(rng: () => number, cells = this.m.reels * this.m.rows): number {
    let total = 0;
    for (const f of this.of('holdAndWin')) {
      let filled = Math.min(this.pick(f.counts, rng), cells - 1); let win = 0;
      for (let i = 0; i < filled; i++) win += this.pick(f.values, rng);
      let left = f.respins;
      while (left > 0 && filled < cells) {
        let n = 0; for (let i = filled; i < cells; i++) if (rng() < f.landChance) n++;
        if (n > 0) { for (let i = 0; i < n; i++) win += this.pick(f.values, rng); filled += n; left = f.respins; } else left--;
      }
      total += filled === cells ? win * f.fullMult : win;
    }
    return total;
  }
  /** Bonus bookkeeping the triggers read, after the spin's final win. */
  afterSpin(b: BonusState, win: number): void {
    if (win > 0) for (const f of this.of('bonusMultiplier')) if (f.step > 0) this.bm.set(f.id, Math.min(f.max, (this.bm.get(f.id) ?? f.start) + f.step));
    for (const f of this.of('lives')) { const left = (this.lives.get(f.id) ?? f.lives) - (win <= 0 ? 1 : 0); this.lives.set(f.id, left); if (left <= 0) this.over = true; }
    b.prevWin = win;
    if (win > 0) { b.winStreak++; b.lossStreak = 0; } else { b.lossStreak++; b.winStreak = 0; }
    b.bonusWin += win;
  }
}
