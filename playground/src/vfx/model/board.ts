/**
 * The reel board's behaviour as data: parameters (spin style, timing, which pattern lands) and the plan computed from them: what every
 * reel does when, what the board looks like when it stops, who wins, and every event (stops, landings, anticipation, wins, expansions,
 * pops, drops, collects) that effect layers synchronise to. The plan is a pure function of the element, so the player, the thumbnails and
 * the tests all agree on it.
 */
import { enm, num, type ParamDef } from '../../core/params';
import { clamp, easeOutBack, h1 } from '../engine/math';
import type { BoardElement, BoardSymbol, Params, SymbolRole } from './scene';

const G = (group: string) => ({ section: 'Board', group });
const bool = (key: string, label: string, group: string, def: boolean, description: string): ParamDef => ({ kind: 'boolean', key, label, section: 'Board', group, default: def, description } as ParamDef);

export const SPIN_STYLES = [['classic', 'Classic reels: symbols scroll down with motion blur, then stop with a bounce'], ['drum', 'Drum: symbols roll over a turning cylinder'], ['turbo', 'Turbo: very fast streaks and a hard stop'], ['drop', 'Drop: symbols fall out and new ones drop in with a bounce'], ['pop', 'Pop: symbols shrink away and new ones pop in one after another'], ['rest', 'No spin: the board is already at rest (for backgrounds and frames)']] as [string, string][];
export const PATTERNS = [['line-win', 'A line win'], ['spin-only', 'No win'], ['scatter-trigger', 'Scatters trigger a feature (with anticipation)'], ['expanding-wild', 'An expanding wild'], ['sticky-wilds', 'Sticky wilds'], ['bonus-tiles', 'Bonus tiles that lock and are collected'], ['cascade', 'A win, then symbols tumble and win again']] as [string, string][];
export const LINES = [['row-mid', 'Middle row'], ['row-top', 'Top row'], ['row-bottom', 'Bottom row'], ['v', 'V shape'], ['inverted-v', 'Inverted V'], ['diag-down', 'Diagonal down'], ['diag-up', 'Diagonal up'], ['zigzag', 'Zigzag']] as [string, string][];

export const BOARD_PARAMS: ParamDef[] = [
  enm('spin', 'Spin animation', G('Spin'), 'classic', SPIN_STYLES, 'How the reels spin and stop.'),
  num('startAt', 'Spin starts at', G('Spin'), 0.4, 0, 6, 0.01, 's', 'Seconds after the board appears at which the spin begins.'),
  num('spinTime', 'First reel stops after', G('Spin'), 1.2, 0.3, 6, 0.01, 's', 'How long the first reel spins.'),
  num('stagger', 'Delay between reels', G('Spin'), 0.28, 0, 1.5, 0.01, 's', 'How much later each next reel stops.'),
  num('speed', 'Spin speed', G('Spin'), 13, 4, 40, 0.1, '', 'Symbols per second while a reel spins at full speed.'),
  num('blur', 'Motion blur', G('Spin'), 0.9, 0, 1.6, 0.01, 'x', 'How much a fast symbol smears.'),
  num('bounce', 'Stop bounce', G('Spin'), 0.5, 0, 1, 0.01, '', 'How far the reel overshoots when it stops and springs back.'),
  num('brake', 'Slow-down time', G('Spin'), 0.5, 0.15, 1.2, 0.01, 's', 'How long a reel takes to come to rest.'),
  bool('anticipation', 'Anticipation', 'Spin', true, 'When two scatters have landed, the remaining reels slow down and build tension.'),
  num('anticipationTime', 'Anticipation delay', G('Spin'), 0.95, 0.3, 3, 0.01, 's', 'Extra time each anticipation reel takes.'),
  enm('pattern', 'What lands', G('Result'), 'line-win', PATTERNS, 'The result the reels stop on, and what the board does with it.'),
  enm('line', 'Winning line', G('Result'), 'row-mid', LINES, 'Which line wins (for line wins and cascades).'),
  num('winCount', 'Symbols in the win', G('Result'), 4, 3, 7, 1, 'count', 'How many matching symbols, counted from the left reel.', true),
  num('winSymbol', 'Winning symbol', G('Result'), 0, 0, 11, 1, 'count', 'Which of the board\'s symbols wins (counted from 0 in the list).', true),
  num('wildReel', 'Wild reel', G('Result'), 2, 0, 6, 1, 'count', 'Which reel the wild lands on (counted from 0).', true),
  num('expandTime', 'Expansion time', G('Result'), 0.55, 0.2, 4, 0.01, 's', 'How long the wild takes to expand over its reel. With an animation of your own for the wild, set it to the length of that animation (or let the animation be fitted to it).'),
  num('specials', 'Wilds / scatters / bonus tiles', G('Result'), 3, 1, 9, 1, 'count', 'How many wild, scatter or bonus symbols land.', true),
  num('tumbles', 'Tumbles', G('Result'), 2, 1, 4, 1, 'count', 'How many times the winners pop and new symbols drop in (cascade pattern).', true),
  num('seed', 'Variation', G('Result'), 5, 1, 99, 1, '', 'Pick different symbols for the rest of the board.', true),
  enm('winStyle', 'Winning symbols', G('Win'), 'bounce', [['bounce', 'Hop'], ['pulse', 'Pulse'], ['shake', 'Shake'], ['glow', 'Glow']], 'How the winning symbols move while the others dim.'),
  num('winDelay', 'Win starts after', G('Win'), 0.4, 0, 2, 0.01, 's', 'Pause between the last reel stopping and the win.'),
  num('dim', 'Dim the rest', G('Win'), 0.6, 0, 1, 0.01, '', 'How dark the non-winning symbols get.'),
];

export const boardDefaults = (): Params => { const o: Params = {}; for (const d of BOARD_PARAMS) o[d.key] = d.default as number | string | boolean; return o; };

export type Cell = [number, number];                 // [row, col]
export interface ReelPlan {
  c: number; style: string; start: number; stop: number; slow: boolean;
  /** Scroll styles: speed (cells/s), ramp-up time, when braking begins, scroll position then, and the final position (a whole number of cells). */
  v: number; ramp: number; brakeAt: number; pBrake: number; pEnd: number; overshoot: number;
  /** Drop and pop styles: when the first thing happens in this column. */
  dropStart: number;
}
export type BoardEventKind = 'spin-start' | 'reel-stop' | 'land' | 'anticipation' | 'win' | 'expand' | 'pop' | 'drop' | 'collect';
export interface BoardEvent { t: number; kind: BoardEventKind; reel?: number; cells?: Cell[]; role?: SymbolRole; until?: number }
export interface Fall { c: number; from: number; to: number; sym: number; at: number }
export interface TumbleStage { winAt: number; popAt: number; dropAt: number; settleAt: number; cells: Cell[]; before: number[][]; after: number[][]; falls: Fall[] }
export interface BoardPlan {
  cols: number; rows: number; style: string; pattern: string;
  initial: number[][]; layout: number[][];
  reels: ReelPlan[];
  stopEnd: number;
  win: { at: number; cells: Cell[]; line: Cell[] } | null;
  expand: { reel: number; at: number; dur: number; sym: number } | null;
  tumbles: TumbleStage[];
  locked: Cell[];
  collect: { at: number; gap: number; cells: Cell[] } | null;
  events: BoardEvent[];
  end: number;
}

const GRAVITY = 40;      // cells / s², for drops
export const DROP_BOUNCE = 0.32;

/** Where something dropped from `from` (cells, may be negative) to `to` is at `tau` seconds after release: gravity, then a few diminishing bounces. */
export function dropY(tau: number, from: number, to: number, bounce: number): number {
  if (tau <= 0) return from;
  const d = to - from;
  let t0 = Math.sqrt((2 * Math.max(0, d)) / GRAVITY);
  if (tau < t0) return from + 0.5 * GRAVITY * tau * tau;
  let v = Math.sqrt(2 * GRAVITY * Math.max(0, d)) * bounce, rest = tau - t0;
  for (let i = 0; i < 4; i++) {
    if (v < 0.4) return to;
    const air = (2 * v) / GRAVITY;
    if (rest < air) return to - (v * rest - 0.5 * GRAVITY * rest * rest);
    rest -= air; v *= bounce;
  }
  t0 = 0;
  return to;
}
/** Seconds until a drop has settled (its last bounce is small). */
export const dropTime = (from: number, to: number, bounce: number): number => {
  const d = Math.max(0, to - from);
  let t = Math.sqrt((2 * d) / GRAVITY), v = Math.sqrt(2 * GRAVITY * d) * bounce;
  for (let i = 0; i < 4 && v >= 0.4; i++) { t += (2 * v) / GRAVITY; v *= bounce; }
  return t;
};

/** Scroll position (cells) of a scrolling reel at time t (seconds on the board's clock). */
export function reelScroll(r: ReelPlan, t: number): number {
  if (t <= r.start) return 0;
  if (t >= r.stop) return r.pEnd;
  if (t < r.brakeAt) { const tau = t - r.start; return tau < r.ramp ? (r.v * tau * tau) / (2 * r.ramp) : r.v * (tau - r.ramp / 2); }
  const u = clamp((t - r.brakeAt) / Math.max(1e-3, r.stop - r.brakeAt));
  return r.pBrake + (r.pEnd - r.pBrake) * easeOutBack(u, r.overshoot);
}

const isScroll = (style: string) => style === 'classic' || style === 'drum' || style === 'turbo';

export function planBoard(el: BoardElement): BoardPlan {
  const P = { ...boardDefaults(), ...el.params } as Record<string, number | string | boolean>;
  const num_ = (k: string) => Number(P[k]);
  const C = Math.max(1, Math.round(el.cols)), R = Math.max(1, Math.round(el.rows));
  const syms: BoardSymbol[] = el.symbols.length ? el.symbols : [{ asset: 'builtin:coin', name: 'coin', role: 'normal' }];
  const idxOf = (role: SymbolRole) => syms.map((s, i) => (s.role === role ? i : -1)).filter((i) => i >= 0);
  const normals = idxOf('normal').length ? idxOf('normal') : syms.map((_, i) => i);
  const wildIdx = idxOf('wild')[0] ?? syms.length - 1, scatterIdx = idxOf('scatter')[0] ?? syms.length - 1, bonusIdx = idxOf('bonus')[0] ?? syms.length - 1;
  const seed = num_('seed') * 1009 + 17;
  const pick = (a: number, b: number, salt = 0, not: number[] = []): number => {
    const pool = normals.filter((n) => !not.includes(n));
    const list = pool.length ? pool : normals;
    return list[Math.floor(h1(seed + a * 131 + b * 31 + salt * 7919) * list.length) % list.length]!;
  };
  const grid = (f: (r: number, c: number) => number): number[][] => Array.from({ length: R }, (_, r) => Array.from({ length: C }, (_, c) => f(r, c)));
  const rest = String(P.spin) === 'rest';           // a board that is simply there: no spin, no result
  const style = rest ? 'classic' : String(P.spin), pattern = rest ? 'spin-only' : String(P.pattern);

  // the board before the spin, and a random board with no accidental triples along rows
  const initial = grid((r, c) => pick(r, c, 1));
  const layout = grid((r, c) => pick(r, c, 2));
  for (let r = 0; r < R; r++) for (let c = 2; c < C; c++) if (layout[r]![c] === layout[r]![c - 1] && layout[r]![c] === layout[r]![c - 2]) layout[r]![c] = pick(r, c, 3, [layout[r]![c]!]);

  const midRow = Math.floor((R - 1) / 2);
  const lineRows = (name: string): number[] => {
    const m = (C - 1) / 2;
    return Array.from({ length: C }, (_, c) => {
      switch (name) {
        case 'row-top': return 0;
        case 'row-bottom': return R - 1;
        case 'v': return Math.round((R - 1) * (1 - (m ? Math.abs(c - m) / m : 0)));
        case 'inverted-v': return Math.round((R - 1) * (m ? Math.abs(c - m) / m : 0));
        case 'diag-down': return Math.round(((R - 1) * c) / Math.max(1, C - 1));
        case 'diag-up': return Math.round(((R - 1) * (C - 1 - c)) / Math.max(1, C - 1));
        case 'zigzag': return c % 2 ? 0 : R - 1;
        default: return midRow;
      }
    });
  };
  const winLine = (count: number, symbol: number): Cell[] => {
    const rows = lineRows(String(P.line)), cells: Cell[] = [];
    for (let c = 0; c < count && c < C; c++) { layout[rows[c]!]![c] = symbol; cells.push([rows[c]!, c]); }
    if (count < C) { const rr = rows[count]!; if (layout[rr]![count] === symbol) layout[rr]![count] = pick(rr, count, 4, [symbol]); }
    return cells;
  };
  const countWin = clamp(Math.round(num_('winCount')), 3, Math.max(3, C));
  const winSym = normals.includes(Math.round(num_('winSymbol'))) ? Math.round(num_('winSymbol')) : normals[0]!;
  const specials = Math.max(1, Math.round(num_('specials')));
  const place = (sym: number, n: number, salt: number, avoid: Cell[] = []): Cell[] => {
    const out: Cell[] = [], cols = Array.from({ length: C }, (_, i) => i).sort((a, b) => h1(seed + a * 17 + salt) - h1(seed + b * 17 + salt));
    for (let i = 0; i < n; i++) {
      const c = cols[i % C]!, r = Math.floor(h1(seed + i * 53 + salt * 3) * R) % R;
      let rr = r;
      while (out.some((o) => o[0] === rr && o[1] === c) || avoid.some((o) => o[0] === rr && o[1] === c)) rr = (rr + 1) % R;
      layout[rr]![c] = sym; out.push([rr, c]);
    }
    return out;
  };

  let winCells: Cell[] = [], line: Cell[] = [], locked: Cell[] = [], expand: BoardPlan['expand'] = null, scatterReels: number[] = [];
  let collectCells: Cell[] = [], anticipateFrom = -1;
  if (pattern === 'line-win' || pattern === 'cascade') { winCells = winLine(countWin, winSym); line = [...winCells]; }
  else if (pattern === 'expanding-wild') {
    const wr = clamp(Math.round(num_('wildReel')), 0, C - 1), rows = lineRows('row-mid');
    for (let c = 0; c < C; c++) { layout[rows[c]!]![c] = c === wr ? wildIdx : winSym; winCells.push([rows[c]!, c]); }
    line = [...winCells];
    expand = { reel: wr, at: 0, dur: clamp(num_('expandTime'), 0.2, 4), sym: wildIdx };
    locked = [[midRow, wr]];
  } else if (pattern === 'scatter-trigger') {
    const k = clamp(specials, 2, Math.max(2, C));
    scatterReels = Array.from({ length: k }, (_, i) => (k === 1 ? 0 : Math.round((i * (C - 1)) / (k - 1))));
    for (const c of scatterReels) { const r = Math.floor(h1(seed + c * 71) * R) % R; layout[r]![c] = scatterIdx; winCells.push([r, c]); }
    if (k < 3) winCells = [];       // a near miss: two scatters land and the third reel does not
    if (scatterReels.length >= 2) anticipateFrom = scatterReels[1]! + 1;
    line = [...winCells];
  } else if (pattern === 'sticky-wilds') {
    const n = Math.min(specials, C), rows = lineRows('row-mid');
    for (let c = 0; c < C; c++) { layout[rows[c]!]![c] = winSym; }
    const cols = Array.from({ length: C }, (_, i) => i).sort((a, b) => h1(seed + a * 31) - h1(seed + b * 31)).slice(0, n);
    for (const c of cols) { layout[rows[c]!]![c] = wildIdx; locked.push([rows[c]!, c]); }
    for (let c = 0; c < C; c++) winCells.push([rows[c]!, c]);
    line = [...winCells];
  } else if (pattern === 'bonus-tiles') {
    collectCells = place(bonusIdx, Math.min(specials, C * R), 7);
    collectCells.sort((a, b) => a[1] - b[1] || a[0] - b[0]);
    locked = [...collectCells]; winCells = [...collectCells];
  }

  // reels
  const startAt = rest ? -10 : num_('startAt'), spinTime = num_('spinTime'), stagger = num_('stagger'), speed = num_('speed') * (style === 'turbo' ? 1.45 : 1), brake = num_('brake') * (style === 'turbo' ? 0.6 : 1), bounce = num_('bounce');
  const antiGap = num_('anticipationTime'), antiOn = Boolean(P.anticipation) && anticipateFrom >= 0 && anticipateFrom < C;
  const reels: ReelPlan[] = [];
  let prevStop = 0;
  const overshoot = 1.7 * bounce, ramp = 0.22;
  for (let c = 0; c < C; c++) {
    const slow = antiOn && c >= anticipateFrom;
    let start = startAt, stop = startAt + spinTime + c * stagger, dropStart = startAt;
    if (!isScroll(style)) {
      const gap = style === 'drop' ? stagger : stagger * 0.6;
      dropStart = startAt + c * gap;
      const rowGap = style === 'drop' ? 0.07 : 0.1;
      const lastFall = style === 'drop' ? 0.3 + (R - 1) * rowGap + dropTime(-1, R - 1, DROP_BOUNCE) : 0.35 + (R - 1) * rowGap + 0.5;
      stop = dropStart + lastFall;
      start = dropStart;
    }
    if (slow && c > 0) stop = Math.max(stop, prevStop + antiGap);
    prevStop = Math.max(prevStop, stop);
    const v = speed * (slow ? 0.55 : 1), br = Math.min(brake, (stop - start) * 0.8), tb = stop - br;
    const pB = tb - start < ramp ? (v * (tb - start) ** 2) / (2 * ramp) : v * (tb - start - ramp / 2);
    const delta = (v * br) / (overshoot + 3);
    const pEnd = Math.max(R + 2, Math.round(Math.max(pB, 0) + delta));
    reels.push({ c, style, start, stop, slow, v, ramp, brakeAt: tb, pBrake: Math.max(pB, 0), pEnd, overshoot, dropStart });
  }
  const stopEnd = Math.max(...reels.map((r) => r.stop));

  // events
  const events: BoardEvent[] = [{ t: startAt, kind: 'spin-start' }];
  for (const r of reels) events.push({ t: r.stop, kind: 'reel-stop', reel: r.c });
  const roleOf = (cell: Cell): SymbolRole => syms[layout[cell[0]]![cell[1]]!]!.role;
  for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
    const role = roleOf([r, c]);
    if (role !== 'normal') events.push({ t: reels[c]!.stop, kind: 'land', reel: c, cells: [[r, c]], role });
  }
  if (antiOn) events.push({ t: reels[Math.max(0, anticipateFrom - 1)]!.stop, kind: 'anticipation', reel: anticipateFrom, cells: [], until: stopEnd });

  let t = stopEnd;
  if (expand) { expand.at = t + 0.2; events.push({ t: expand.at, kind: 'expand', reel: expand.reel, until: expand.at + expand.dur }); t = expand.at + expand.dur; }
  const winAt = t + num_('winDelay');
  const win = winCells.length ? { at: winAt, cells: winCells, line } : null;
  if (win) events.push({ t: winAt, kind: 'win', cells: winCells });

  // tumbles: the winners pop, what is above falls, new symbols drop in, and the next line wins
  const tumbles: TumbleStage[] = [];
  let cur = layout.map((r) => [...r]);
  if (pattern === 'cascade' && win) {
    const rounds = Math.round(num_('tumbles'));
    let cells = winCells, at = winAt;
    for (let k = 0; k < rounds; k++) {
      const popAt = at + 1.0, dropAt = popAt + 0.4;
      const popped = new Set(cells.map(([r, c]) => `${r},${c}`));
      const after = cur.map((r) => [...r]), falls: Fall[] = [];
      for (let c = 0; c < C; c++) {
        const keepRows: number[] = []; for (let r = 0; r < R; r++) if (!popped.has(`${r},${c}`)) keepRows.push(r);
        const fresh = R - keepRows.length;
        const col = [...Array.from({ length: fresh }, (_, i) => pick(i + 40 * (k + 1), c, 11 + k)), ...keepRows.map((r) => cur[r]![c]!)];
        for (let r = 0; r < R; r++) {
          after[r]![c] = col[r]!;
          // new symbols fall in from above the board; kept ones that end up lower than they started fall too
          const wasRow = r < fresh ? -(fresh - r) : keepRows[r - fresh]!;
          if (wasRow !== r) falls.push({ c, from: wasRow, to: r, sym: col[r]!, at: dropAt + (R - 1 - r) * 0.05 + c * 0.03 });
        }
      }
      const settle = Math.max(...falls.map((f) => f.at + dropTime(f.from, f.to, DROP_BOUNCE)), dropAt) + 0.1;
      const last = k === rounds - 1;
      // the next win: a fresh line of matching symbols across the board
      let nextWin: Cell[] = [];
      if (!last) {
        const sym = pick(k, 99, 21, [winSym]), rows = lineRows(String(P.line));
        for (let c = 0; c < countWin && c < C; c++) { after[rows[c]!]![c] = sym; nextWin.push([rows[c]!, c]); }
        // the board was already settled with `after`; the forced cells are part of it
        for (const f of falls) if (nextWin.some(([r, c]) => c === f.c && r === f.to)) f.sym = after[f.to]![f.c]!;
      }
      tumbles.push({ winAt: at, popAt, dropAt, settleAt: settle, cells, before: cur, after, falls });
      events.push({ t: popAt, kind: 'pop', cells });
      events.push({ t: dropAt, kind: 'drop', cells: falls.map((f) => [f.to, f.c] as Cell) });
      cur = after;
      if (nextWin.length) { events.push({ t: settle + 0.3, kind: 'win', cells: nextWin }); cells = nextWin; at = settle + 0.3; }
    }
  }
  let end = Math.max(winAt + 1.8, tumbles.length ? tumbles[tumbles.length - 1]!.settleAt + 1.2 : 0);
  let collect: BoardPlan['collect'] = null;
  if (collectCells.length) {
    collect = { at: stopEnd + 0.7, gap: 0.22, cells: collectCells };
    collectCells.forEach((cell, i) => events.push({ t: collect!.at + i * collect!.gap, kind: 'collect', cells: [cell] }));
    end = Math.max(end, collect.at + collectCells.length * collect.gap + 1.2);
  }
  if (rest) { events.length = 0; end = 0.5; }
  events.sort((a, b) => a.t - b.t);
  return { cols: C, rows: R, style, pattern, initial, layout, reels, stopEnd, win, expand, tumbles, locked, collect, events, end };
}

/** What a board looks like for the symbol assets it needs: used by exports and the editor. */
export const boardAssets = (el: BoardElement): string[] => [...new Set([...el.symbols.flatMap((s) => (s.expand ? [s.asset, s.expand.asset] : [s.asset])), ...(el.frame ? [el.frame] : []), ...(el.panel ? [el.panel] : [])])];

/** The symbol at strip position n of a scrolling reel (n ≤ 0 is the board before the spin, the last `rows` positions are the result). */
export function stripSymbol(plan: BoardPlan, normals: number[], seed: number, c: number, n: number): number {
  const reel = plan.reels[c]!;
  if (n <= 0) { const j = -n; return j < plan.rows ? plan.initial[j]![c]! : normals[Math.floor(h1(seed + c * 977 + n * 13) * normals.length) % normals.length]!; }
  if (n > reel.pEnd - plan.rows && n <= reel.pEnd) return plan.layout[reel.pEnd - n]![c]!;
  return normals[Math.floor(h1(seed + c * 977 + n * 13) * normals.length) % normals.length]!;
}

/** Symbols a random reel fills with (the normal ones; every symbol if none is marked normal). */
export function normalSymbols(el: BoardElement): number[] {
  const n = el.symbols.map((s, i) => (s.role === 'normal' ? i : -1)).filter((i) => i >= 0);
  return n.length ? n : el.symbols.map((_, i) => i);
}
