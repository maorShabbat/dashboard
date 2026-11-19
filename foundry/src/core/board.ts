/**
 * Board-aware sizing. All board-relative lengths in parameters are "% of a cell"; the layout turns that into pixels for
 * the current board shape and viewport, so the same theme looks proportionate on a 3×3 phone board and a 7×7 desktop one.
 */
import { makeRng } from './util/prng';
import type { SceneSpec, WinPattern } from './model/types';

export interface Cell { col: number; row: number }
export interface Rect { x: number; y: number; w: number; h: number; cx: number; cy: number }

export interface BoardPreset { id: string; label: string; cols: number; rows: number }
export const BOARD_PRESETS: BoardPreset[] = [
  { id: 'slots-5x3', label: 'Slots 5×3', cols: 5, rows: 3 },
  { id: 'slots-5x4', label: 'Slots 5×4', cols: 5, rows: 4 },
  { id: 'scatter-6x5', label: 'Scatter 6×5', cols: 6, rows: 5 },
  { id: 'classic-3x3', label: 'Classic 3×3', cols: 3, rows: 3 },
  { id: 'cluster-7x7', label: 'Cluster 7×7', cols: 7, rows: 7 },
  { id: 'grid-8x8', label: 'Grid 8×8', cols: 8, rows: 8 },
];

export interface ViewportPreset { id: string; label: string; w: number; h: number }
export const VIEWPORT_PRESETS: ViewportPreset[] = [
  { id: 'desktop', label: 'Desktop 16:9', w: 1280, h: 720 },
  { id: 'tablet', label: 'Tablet 4:3', w: 1024, h: 768 },
  { id: 'mobile', label: 'Mobile portrait', w: 390, h: 844 },
  { id: 'wide', label: 'Ultra-wide 21:9', w: 1680, h: 720 },
];
export const REPLAY_VIEWPORTS = ['desktop', 'mobile'] as const;
export function viewportPreset(id: string): ViewportPreset { return VIEWPORT_PRESETS.find((v) => v.id === id) ?? VIEWPORT_PRESETS[0]!; }

export interface LayoutTokens { gap: number; padding: number; frameWidth: number }

export interface BoardLayout {
  vw: number; vh: number; cols: number; rows: number;
  /** Cell edge length in px. */
  cell: number;
  gapPx: number; padPx: number; framePx: number;
  /** Outer board rect including padding. */
  board: Rect;
  /** Convert "% of cell" into px. */
  px(pct: number): number;
  cellRect(col: number, row: number): Rect;
  centre: { x: number; y: number };
}

export const MAX_BOARD = 12;

export function computeLayout(cols: number, rows: number, vw: number, vh: number, t: LayoutTokens): BoardLayout {
  const c = Math.max(1, Math.min(MAX_BOARD, Math.round(cols)));
  const r = Math.max(1, Math.min(MAX_BOARD, Math.round(rows)));
  const g = t.gap / 100, p = t.padding / 100;
  const unitsW = c + (c - 1) * g + 2 * p;
  const unitsH = r + (r - 1) * g + 2 * p;
  const cell = Math.max(4, Math.min((vw * 0.94) / unitsW, (vh * 0.94) / unitsH));
  const gapPx = g * cell, padPx = p * cell;
  const bw = unitsW * cell, bh = unitsH * cell;
  const bx = (vw - bw) / 2, by = (vh - bh) / 2;
  const board: Rect = { x: bx, y: by, w: bw, h: bh, cx: bx + bw / 2, cy: by + bh / 2 };
  return {
    vw, vh, cols: c, rows: r, cell, gapPx, padPx, framePx: (t.frameWidth / 100) * cell, board,
    px: (pct) => (pct / 100) * cell,
    cellRect: (col, row) => {
      const x = bx + padPx + col * (cell + gapPx);
      const y = by + padPx + row * (cell + gapPx);
      return { x, y, w: cell, h: cell, cx: x + cell / 2, cy: y + cell / 2 };
    },
    centre: { x: board.cx, y: board.cy },
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Scene (sample board state used for preview and sequence replay)

export interface Scene {
  cols: number; rows: number;
  /** symbols[col][row] ∈ 0..SYMBOL_KINDS-1 */
  symbols: number[][];
  winCells: Cell[];
  winAmount: number; bet: number; multiplier: number;
}

export const SYMBOL_KINDS = 8;
export const WIN_PATTERNS: [WinPattern, string][] = [
  ['line', 'Win line'], ['cluster', 'Cluster'], ['scatter', 'Scatters'], ['all', 'Whole board'], ['none', 'No win'],
];

export function defaultSceneSpec(): SceneSpec {
  return { cols: 5, rows: 3, pattern: 'line', seed: 7, winAmount: 1234.5, bet: 1, multiplier: 2 };
}

export function clampSceneSpec(s: SceneSpec): SceneSpec {
  const n = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Number.isFinite(v) ? v : lo));
  return {
    cols: Math.round(n(s.cols, 1, MAX_BOARD)), rows: Math.round(n(s.rows, 1, MAX_BOARD)),
    pattern: (['line', 'cluster', 'scatter', 'all', 'none'] as WinPattern[]).includes(s.pattern) ? s.pattern : 'line',
    seed: Math.round(n(s.seed, 0, 99999)), winAmount: n(s.winAmount, 0, 1e9), bet: n(s.bet, 0, 1e6), multiplier: Math.round(n(s.multiplier, 1, 1000)),
  };
}

export function buildScene(raw: SceneSpec): Scene {
  const spec = clampSceneSpec(raw);
  const rng = makeRng(spec.seed * 2654435761);
  const { cols, rows } = spec;
  const symbols: number[][] = Array.from({ length: cols }, () => Array.from({ length: rows }, () => rng.int(0, SYMBOL_KINDS - 1)));
  const winCells: Cell[] = [];
  const winSymbol = rng.int(0, SYMBOL_KINDS - 1);
  const mark = (col: number, row: number) => { winCells.push({ col, row }); symbols[col]![row] = winSymbol; };
  switch (spec.pattern) {
    case 'line': {
      let row = rng.int(0, rows - 1);
      for (let col = 0; col < cols; col++) {
        mark(col, row);
        row = Math.min(rows - 1, Math.max(0, row + rng.int(-1, 1)));
      }
      break;
    }
    case 'cluster': {
      const target = Math.max(3, Math.min(cols * rows, Math.round(cols * rows * 0.3)));
      const inSet = new Set<string>();
      const first = { col: rng.int(0, cols - 1), row: rng.int(0, rows - 1) };
      inSet.add(`${first.col},${first.row}`); mark(first.col, first.row);
      let guard = 0;
      while (winCells.length < target && guard++ < 500) {
        const base = winCells[rng.int(0, winCells.length - 1)]!;
        const d = rng.pick([[1, 0], [-1, 0], [0, 1], [0, -1]] as const);
        const col = base.col + d[0], row = base.row + d[1];
        if (col < 0 || row < 0 || col >= cols || row >= rows || inSet.has(`${col},${row}`)) continue;
        inSet.add(`${col},${row}`); mark(col, row);
      }
      break;
    }
    case 'scatter': {
      const target = Math.min(5, cols * rows);
      const inSet = new Set<string>();
      let guard = 0;
      while (winCells.length < target && guard++ < 500) {
        const col = rng.int(0, cols - 1), row = rng.int(0, rows - 1);
        if (inSet.has(`${col},${row}`)) continue;
        inSet.add(`${col},${row}`); mark(col, row);
      }
      break;
    }
    case 'all':
      for (let col = 0; col < cols; col++) for (let row = 0; row < rows; row++) mark(col, row);
      break;
    case 'none':
      break;
  }
  return { cols, rows, symbols, winCells, winAmount: spec.winAmount, bet: spec.bet, multiplier: spec.multiplier };
}
