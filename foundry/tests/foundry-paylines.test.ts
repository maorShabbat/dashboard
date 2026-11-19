import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import start from '../foundry/examples/t1-demo.config.json';
import { compile } from '../foundry/compiler/compile';
import { paylineLibrary } from '../foundry/compiler/paylines';
import { setTumble, safeValidate, setReelHeights, setGameType, setPaylineCount, togglePayline, fitPaylines, lineOn } from '../foundry/builder/model';
import { evaluateBoard, runSim } from '../foundry/builder/sim';
import type { GameConfig } from '../foundry/compiler/config';
import { defaultFeature } from '../foundry/compiler/features';
import { buildStrings } from '../foundry/compiler/rules';

const demo = () => JSON.parse(JSON.stringify(start)) as GameConfig;
const errors = (c: GameConfig) => safeValidate(c).filter((i) => i.level === 'error');
const lines = () => setGameType(demo(), 'paylines');

describe('paylines', () => {
  it('has a library of lines for any board and a 20 line start', () => {
    expect(paylineLibrary(5, 3).length).toBe(40); expect(paylineLibrary(5, 3)[0]).toEqual([0, 0, 0, 0, 0]);
    for (const [r, y] of [[5, 4], [6, 5], [3, 3]] as const) { const l = paylineLibrary(r, y); expect(l.length).toBeGreaterThan(5); expect(l.every((x) => x.length === r && x.every((v) => v >= 0 && v < y))).toBe(true); }
    const c = lines();
    expect(c.gameType).toBe('paylines'); expect(c.board).toEqual({ reels: 5, rows: 3 }); expect(c.paylines!.length).toBe(20); expect(c.paytable.tiers.map((t) => t[0])).toEqual([3, 4, 5]);
    expect(errors(c)).toEqual([]);
  });
  it('lets lines be switched on and off but never none, and follows the board', () => {
    let c = lines(); const second = paylineLibrary(5, 3)[1];
    c = togglePayline(c, second); expect(lineOn(c, second)).toBe(false); expect(c.paylines!.length).toBe(19);
    c = togglePayline(c, second); expect(lineOn(c, second)).toBe(true);
    c = setPaylineCount(c, 1); expect(c.paylines!.length).toBe(1); expect(togglePayline(c, c.paylines![0]).paylines!.length).toBe(1);
    const wider = lines(); wider.board = { reels: 5, rows: 4 }; const fit = fitPaylines(wider); expect(errors(fit)).toEqual([]);
    const bad = lines(); bad.paylines = [[0, 0, 0, 0, 9]]; expect(errors(bad).length).toBeGreaterThan(0);
    const none = lines(); none.paylines = []; expect(errors(none).length).toBeGreaterThan(0);
  });
  it('pays a line from the left with wilds counting, and nothing for a broken line', () => {
    const c = lines(); c.paylines = [[1, 1, 1, 1, 1]];
    const filler = (r: number, y: number) => ['L1', 'L2', 'L3', 'L4'][(r + y * 2) % 4];
    const board = (mid: string[]) => Array.from({ length: 5 }, (_, r) => Array.from({ length: 3 }, (_, y) => (y === 1 ? mid[r] : filler(r, y))));
    const pay = (mid: string[]) => evaluateBoard(c, board(mid)).win;
    const h5 = pay(['H1', 'H1', 'H1', 'H1', 'H1']); expect(h5).toBe(c.paytable.pays.H1[2]);
    expect(pay(['H1', 'H1', 'H1', 'H1', 'L4'])).toBe(c.paytable.pays.H1[1]);
    expect(pay(['H1', 'H1', 'W', 'H1', 'H1'])).toBe(h5);
    expect(pay(['W', 'W', 'H1', 'H1', 'H1'])).toBe(h5);
    expect(pay(['H1', 'H1', 'L4', 'H1', 'H1'])).toBe(0); // two in a row is below the shortest win
    expect(pay(['H1', 'L4', 'H1', 'H1', 'H1'])).toBe(0);
    expect(pay(['S', 'H1', 'H1', 'H1', 'H1'])).toBe(0);
  });
  it('plays as a whole game (no tumbles) and compiles into a lines game', () => {
    const c = lines(); let s!: { rtp: number; hitRate: number }; for (const x of runSim(c, 20000, 20000, 3)) s = x;
    expect(s.rtp).toBeGreaterThan(0); expect(s.hitRate).toBeGreaterThan(0.1);
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'pl-'));
    const r = compile(c, out);
    const cfg = fs.readFileSync(path.join(r.dir, 'game_config.py'), 'utf8');
    expect(cfg).toContain('self.win_type = "lines"'); expect(cfg).toContain('self.paylines = {'); expect(cfg).toContain('1: [0, 0, 0, 0, 0],');
    expect(fs.readFileSync(path.join(r.dir, 'foundry_features.py'), 'utf8')).toContain('EVALUATOR = "paylines"');
    fs.rmSync(out, { recursive: true, force: true });
  });
});

describe('ways to win', () => {
  const ways = () => setGameType(demo(), 'ways');
  it('switches to a ways game with its own board, ranges and pay ladder', () => {
    const c = ways();
    expect(c.gameType).toBe('ways'); expect(c.board).toEqual({ reels: 5, rows: 4 }); expect(c.paylines).toBeUndefined(); expect(c.paytable.tiers.map((t) => t[0])).toEqual([3, 4, 5]);
    expect(errors(c)).toEqual([]);
  });
  it('multiplies the pay by the number of ways, lets wilds help and needs the symbol on the first reel', () => {
    const c = ways(); c.board = { reels: 5, rows: 3 };
    const base = (s?: string) => Array.from({ length: 5 }, (_, r) => Array.from({ length: 3 }, () => s ?? ['L1', 'L2', 'L3', 'L4', 'L1'][r]));
    const put = (b: string[][], cells: [number, number, string][]) => { for (const [r, y, s] of cells) b[r][y] = s; return b; };
    const pays = c.paytable.pays.H1;
    const one = put(base(), [[0, 0, 'H1'], [1, 0, 'H1'], [2, 0, 'H1']]);
    const w1 = evaluateBoard(c, one).win; expect(w1).toBeGreaterThanOrEqual(pays[0]);
    const two = put(base(), [[0, 0, 'H1'], [1, 0, 'H1'], [1, 1, 'H1'], [2, 0, 'H1']]); // two on the second reel: twice the ways
    expect(evaluateBoard(c, two).win).toBeGreaterThanOrEqual(w1 * 2 - 1e-9);
    const wild = put(base(), [[0, 0, 'H1'], [1, 0, 'W'], [2, 0, 'H1']]);
    expect(evaluateBoard(c, wild).win).toBeGreaterThanOrEqual(pays[0]);
    const notFirst = put(base(), [[1, 0, 'H1'], [2, 0, 'H1'], [3, 0, 'H1']]);
    const withH1 = evaluateBoard(c, notFirst).win; const first = evaluateBoard(c, put(base(), [[0, 0, 'H1'], [1, 0, 'H1'], [2, 0, 'H1']])).win;
    expect(first).toBeGreaterThan(withH1);
  });
  it('plays as a whole game and compiles into a ways game', () => {
    const c = ways(); let s!: { rtp: number; hitRate: number }; for (const x of runSim(c, 20000, 20000, 3)) s = x;
    expect(s.rtp).toBeGreaterThan(0);
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'wy-'));
    const r = compile(c, out);
    expect(fs.readFileSync(path.join(r.dir, 'game_config.py'), 'utf8')).toContain('self.win_type = "ways"');
    expect(fs.readFileSync(path.join(r.dir, 'foundry_features.py'), 'utf8')).toContain('EVALUATOR = "ways"');
    fs.rmSync(out, { recursive: true, force: true });
  });
  it('can change the height of every reel on every spin (a megaways style game)', () => {
    const c = setReelHeights(ways(), true);
    expect(c.reelHeights).toEqual({ min: 2, max: 7 }); expect(c.board).toEqual({ reels: 6, rows: 7 }); expect(errors(c)).toEqual([]);
    const bad = JSON.parse(JSON.stringify(c)); bad.reelHeights = { min: 1, max: 7 }; expect(errors(bad).length).toBeGreaterThan(0);
    const wrongType = demo(); wrongType.reelHeights = { min: 2, max: 5 }; expect(errors(wrongType).length).toBeGreaterThan(0);
    let s!: { rtp: number; hitRate: number }; for (const x of runSim(c, 20000, 20000, 5)) s = x;
    expect(s.rtp).toBeGreaterThan(0);
    // a shorter average reel pays less often than the full board
    let full!: { hitRate: number }; for (const x of runSim({ ...c, reelHeights: undefined }, 20000, 20000, 5)) full = x;
    expect(s.hitRate).toBeLessThan(full.hitRate);
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'mw-')); const r = compile(c, out);
    expect(fs.readFileSync(path.join(r.dir, 'foundry_features.py'), 'utf8')).toContain('REEL_HEIGHTS = (2, 7)');
    fs.rmSync(out, { recursive: true, force: true });
  });
  it('can add tumbles to paylines and ways games', () => {
    for (const type of ['paylines', 'ways'] as const) {
      const off = setGameType(demo(), type); const on = setTumble(off, true);
      expect(on.tumble).toBe(true); expect(errors(on)).toEqual([]); expect(setTumble(on, false).tumble).toBeUndefined();
      const run = (c: GameConfig) => { let s!: { rtp: number; hitRate: number }; for (const x of runSim(c, 30000, 30000, 4)) s = x; return s; };
      expect(run(on).rtp).toBeGreaterThan(run(off).rtp); // tumbles add wins
      const out = fs.mkdtempSync(path.join(os.tmpdir(), 'tb-')); const r = compile(on, out);
      expect(fs.readFileSync(path.join(r.dir, 'foundry_features.py'), 'utf8')).toContain('TUMBLE = True');
      expect(JSON.parse(fs.readFileSync(path.join(r.dir, 'build-manifest.json'), 'utf8')).tumble).toBe(true);
      expect(String(buildStrings(on)['rules.tumble'])).toMatch(/tumble|removed/); expect(String(buildStrings(off)['rules.tumble'])).toMatch(/stay on the board/);
      fs.rmSync(out, { recursive: true, force: true });
    }
    const bad = setTumble(setGameType(demo(), 'ways'), true); bad.reelHeights = { min: 2, max: 4 }; expect(errors(bad).length).toBeGreaterThan(0);
    // pay anywhere and cluster tumble unless switched off; off, each spin is evaluated once (older designs without the field keep tumbling)
    for (const type of ['anywhere', 'cluster'] as const) {
      const on = setGameType(demo(), type); const off = setTumble(on, false);
      expect(on.tumble).toBeUndefined(); expect(off.tumble).toBe(false); expect(errors(off)).toEqual([]); expect(setTumble(off, true).tumble).toBeUndefined();
      expect(off.reels.sets.WCAP[off.symbols.multiplier]).toBeGreaterThan(on.reels.sets.WCAP[on.symbols.multiplier]); // the win cap needs more help without tumbles
      expect(setTumble(off, true).reels.sets.WCAP).toEqual(on.reels.sets.WCAP);
      const run = (c: GameConfig) => { let s!: { rtp: number }; for (const x of runSim(c, 20000, 20000, 4)) s = x; return s.rtp; };
      expect(run(off)).toBeLessThan(run(on));
      const out = fs.mkdtempSync(path.join(os.tmpdir(), 'tb-')); const r = compile(off, out);
      expect(fs.readFileSync(path.join(r.dir, 'foundry_features.py'), 'utf8')).toContain('TUMBLE = False');
      expect(JSON.parse(fs.readFileSync(path.join(r.dir, 'build-manifest.json'), 'utf8')).tumble).toBe(false);
      expect(String(buildStrings(off)['rules.tumble'])).toMatch(/stay on the board/);
      fs.rmSync(out, { recursive: true, force: true });
      const r2 = compile(on, fs.mkdtempSync(path.join(os.tmpdir(), 'tb-'))); expect(fs.readFileSync(path.join(r2.dir, 'foundry_features.py'), 'utf8')).toContain('TUMBLE = True');
    }
    // with tumbles the base game has steps, so the sticky wild, hero and gadget row are allowed there
    expect(errors({ ...setTumble(setGameType(demo(), 'paylines'), true), features: [{ ...defaultFeature('stickyWild', ['base']) }] } as GameConfig)).toEqual([]);
  });
});

describe('forced scatter counts', () => {
  it('cannot ask for more scatters than the board has reels (the SDK would search forever)', async () => {
    const { validate } = await import('../foundry/compiler/config');
    const c = JSON.parse(JSON.stringify((await import('../foundry/examples/lines-demo.config.json')).default));
    expect(validate(c).filter((i: { level: string }) => i.level === 'error')).toEqual([]);
    c.modes[1].distributions[0].conditions.scatterTriggers = { '6': 1 };
    expect(validate(c).some((i: { level: string; message: string }) => i.level === 'error' && /at most 5 scatters/.test(i.message))).toBe(true);
  });
});

describe('gadget row in a game without base steps', () => {
  it('is allowed in the base game of paylines, opens at once on the landed board and raises the return', async () => {
    const { runSim } = await import('../foundry/builder/sim');
    const { validate } = await import('../foundry/compiler/config');
    const c = JSON.parse(JSON.stringify((await import('../foundry/examples/lines-demo.config.json')).default));
    const rtp = (x: unknown) => { let s: { rtp: number } | undefined; for (const r of runSim(x as never, 30000, 30000, 5)) s = r as { rtp: number }; return s!.rtp; };
    const ref = rtp(c);
    c.gadgetBar = { slots: Array.from({ length: 5 }, (_, i) => (i === 0 ? { charge: { kind: 'land', symbols: ['W'] }, need: 1, tool: 'multiplier', power: 3, repeat: true } : { charge: { kind: 'land', symbols: ['S'] }, need: 50, tool: 'remove', power: 1, repeat: false })) } as never; // lines demo: 5 reels, one cell each
    expect(validate(c).filter((i: { level: string }) => i.level === 'error')).toEqual([]);
    expect(rtp(c)).toBeGreaterThan(ref * 1.05);
  });
});
