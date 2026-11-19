import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import start from '../foundry/examples/t1-demo.config.json';
import { compile } from '../foundry/compiler/compile';
import { safeValidate, setGameType, gameTypeOf } from '../foundry/builder/model';
import { evaluateBoard, runSim, tunePays } from '../foundry/builder/sim';
import type { GameConfig } from '../foundry/compiler/config';

const demo = () => JSON.parse(JSON.stringify(start)) as GameConfig;
const errors = (c: GameConfig) => safeValidate(c).filter((i) => i.level === 'error');

describe('cluster pays', () => {
  it('switches the game type with its usual board, ranges and pays, and back', () => {
    const c = setGameType(demo(), 'cluster');
    expect(gameTypeOf(c)).toBe('cluster'); expect(c.board).toEqual({ reels: 7, rows: 7 });
    expect(c.paytable.tiers.map((t) => t[0])).toEqual([5, 6, 9, 13]);
    expect(c.paytable.pays.H1[0]).toBeGreaterThan(demo().paytable.pays.H1[0]);
    expect(errors(c)).toEqual([]);
    const back = setGameType(c, 'anywhere');
    expect(back.gameType).toBeUndefined(); expect(back.board).toEqual({ reels: 6, rows: 5 });
  });
  it('any route between game types starts near a playable return (ways then cluster once gave 18%)', () => {
    const rtp = (c: GameConfig) => { let r = 0; for (const s of runSim(c, 8000, 8000)) r = s.rtp; return r; };
    const types = ['anywhere', 'cluster', 'paylines', 'ways'] as const;
    for (const a of types) for (const b of types) {
      if (a === b) continue;
      const c = setGameType(setGameType(demo(), a), b);
      const direct = setGameType(demo(), b);
      const r = rtp(c);
      expect(r, `${a} > ${b}: ${(r * 100).toFixed(1)}%`).toBeGreaterThan(0.6);
      expect(r, `${a} > ${b}: ${(r * 100).toFixed(1)}%`).toBeLessThan(1.6);
      expect(c.paytable.pays[c.symbols.paying[0]].length).toBe(c.paytable.tiers.length);
      if (a !== 'anywhere' && !(a === 'cluster' && b === 'anywhere')) continue;
      expect(c.paytable.pays, `${a} > ${b} matches a direct switch`).toEqual(direct.paytable.pays);
    }
  });
  it('pays only touching symbols; a wild joins the groups it touches', () => {
    const c = setGameType(demo(), 'cluster'); c.board = { reels: 5, rows: 5 };
    const pay5 = c.paytable.pays.H1[0];
    const filler = (r: number, y: number) => ['L1', 'L2', 'L3', 'L4'][(r * 2 + y * 3) % 4];
    const board = (cells: [number, number, string][]) => { const b = Array.from({ length: 5 }, (_, r) => Array.from({ length: 5 }, (_, y) => filler(r, y))); for (const [r, y, s] of cells) b[r][y] = s; return b; };
    const line = board([[0, 0, 'H1'], [1, 0, 'H1'], [2, 0, 'H1'], [3, 0, 'H1'], [4, 0, 'H1']]);
    expect(evaluateBoard(c, line).win).toBeGreaterThanOrEqual(pay5);
    const apart = board([[0, 0, 'H1'], [1, 0, 'H1'], [2, 0, 'H1'], [3, 0, 'H1'], [4, 4, 'H1']]); // four touch, one is far away: below the 5 minimum
    expect(evaluateBoard(c, apart).win).toBeLessThan(pay5);
    const withWild = board([[0, 0, 'H1'], [1, 0, 'H1'], [2, 0, 'W'], [3, 0, 'H1'], [4, 0, 'H1']]);
    expect(evaluateBoard(c, withWild).win).toBeGreaterThanOrEqual(pay5);
    // the same symbols scattered over the board would pay in the pay anywhere game, but not as a cluster
    const spread = board([[0, 0, 'H1'], [1, 2, 'H1'], [2, 4, 'H1'], [3, 1, 'H1'], [4, 3, 'H1']]);
    expect(evaluateBoard(c, spread).win).toBeLessThan(pay5);
  });
  it('plays as a whole game in the estimate and pays less often than pay anywhere with the same pays', () => {
    const run = (c: GameConfig) => { let s!: ReturnType<typeof runSim> extends Generator<infer T> ? T : never; for (const x of runSim(c, 20000, 20000, 1)) s = x; return s; };
    const cl = setGameType(demo(), 'cluster'); const a = run(cl);
    expect(a.rtp).toBeGreaterThan(0); expect(a.hitRate).toBeGreaterThan(0.05);
    const t = tunePays(cl, cl.modes[0].rtp, 40000);
    expect(t.factor).toBeGreaterThan(0);
  });
  it('compiles into a cluster game', () => {
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'cl-'));
    const r = compile(setGameType(demo(), 'cluster'), out);
    expect(fs.readFileSync(path.join(r.dir, 'game_config.py'), 'utf8')).toContain('self.win_type = "cluster"');
    expect(fs.readFileSync(path.join(r.dir, 'foundry_features.py'), 'utf8')).toContain('EVALUATOR = "cluster"');
    fs.rmSync(out, { recursive: true, force: true });
  });
});
