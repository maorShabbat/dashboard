import { describe, expect, it } from 'vitest';
import start from '../foundry/examples/t1-demo.config.json';
import { anteMode, getAnte, newGameFrom, safeValidate, setAnte, setFreeSpins, type NewGameAnswers } from '../foundry/builder/model';
import { buildStrings, renderRulesMarkdown } from '../foundry/compiler/rules';
import { compile } from '../foundry/compiler/compile';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runSim } from '../foundry/builder/sim';
import { mediaSlotFor, symbolTargets } from '../foundry/builder/wizard';
import type { GameConfig } from '../foundry/compiler/config';

const demo = () => JSON.parse(JSON.stringify(start)) as GameConfig;
const rtp = (c: GameConfig) => { let r = 0; for (const s of runSim(c, 6000, 6000)) r = s.rtp; return r; };
const make = (a: Partial<NewGameAnswers>) => newGameFrom(demo(), { name: 'Sweet Cascade', type: 'anywhere', tumble: false, gadgetBar: false, reels: 6, rows: 5, ...a });

describe('new game wizard', () => {
  it('turns the answers into a valid game: name and id, type, grid, tumbles and the top feature row', () => {
    const c = make({ type: 'ways', tumble: true, gadgetBar: true, reels: 5, rows: 5 });
    expect(c.name).toBe('Sweet Cascade'); expect(c.id).toBe('sweet_cascade');
    expect(c.gameType).toBe('ways'); expect(c.board).toEqual({ reels: 5, rows: 5 }); expect(c.tumble).toBe(true);
    expect(c.gadgetBar?.position).toBe('top'); expect(c.gadgetBar?.slots).toHaveLength(5); // one cell for each reel
    expect(safeValidate(c).filter((i) => i.level === 'error')).toEqual([]);
    const lines = make({ type: 'paylines', reels: 5, rows: 4 });
    expect(lines.paylines!.length).toBeGreaterThan(0); expect(lines.tumble).toBeUndefined();
    expect(make({ type: 'cluster', tumble: false, reels: 7, rows: 7 }).gameType).toBe('cluster'); // cluster always tumbles: nothing to switch
    expect(make({ reels: 20, rows: 1 }).board).toEqual({ reels: 8, rows: 3 }); // 3 to 8 each way
    expect(make({ name: '  ' }).name).toBe('My new slot');
  });

  it('every combination starts close enough to the target for the automatic balance (the first feature row multiplied the return up to 100 times)', () => {
    for (const type of ['anywhere', 'cluster', 'paylines', 'ways'] as const) for (const bar of [false, true]) {
      const [reels, rows] = type === 'cluster' ? [7, 7] : type === 'anywhere' ? [6, 5] : [5, type === 'ways' ? 5 : 3];
      const off = rtp(make({ type, reels, rows })); const on = rtp(make({ type, reels, rows, gadgetBar: bar }));
      expect(on, `${type} ${reels}x${rows} bar ${bar}: ${(on * 100).toFixed(0)}%`).toBeGreaterThan(0.6);
      expect(on, `${type} ${reels}x${rows} bar ${bar}: ${(on * 100).toFixed(0)}%`).toBeLessThan(1.6);
      if (bar) expect(on / off, `${type}: the default feature row costs a little, not a multiple`).toBeLessThan(1.35);
    }
  });

  it('pictures go to the symbols: named wild and scatter first, the rest in file-name order', () => {
    const c = demo();
    expect(symbolTargets(c, ['10_crown.png', '2_bell.png', 'Wild.png', '1_cherry.png', 'scatter-coin.png'])).toEqual({ 'Wild.png': c.symbols.wild, 'scatter-coin.png': c.symbols.scatter, '1_cherry.png': 'H1', '2_bell.png': 'H2', '10_crown.png': 'H3' });
    const many = Array.from({ length: 12 }, (_, i) => `s${i}.png`);
    expect(Object.keys(symbolTargets(c, many))).toHaveLength(c.symbols.paying.length); // extra pictures stay in the library only
  });

  it('a file name fills the matching media slot', () => {
    expect(mediaSlotFor('main', 'game_logo.png')).toBe('logo');
    expect(mediaSlotFor('main', 'bg_night.webm')).toBe('background');
    expect(mediaSlotFor('main', 'reel-frame.png')).toBe('frame');
    expect(mediaSlotFor('main', 'hero.png')).toBeNull();
    expect(mediaSlotFor('audio', 'main_theme.mp3')).toBe('music');
    expect(mediaSlotFor('audio', 'big_win.mp3')).toBe('sfxBigWin');
    expect(mediaSlotFor('audio', 'win.mp3')).toBe('sfxWin');
    expect(mediaSlotFor('audio', 'reel_spin.ogg')).toBe('sfxSpin');
    expect(mediaSlotFor('audio', 'free_spins_start.ogg')).toBe('sfxBonus');
    expect(mediaSlotFor('other', 'logo.png')).toBeNull();
  });

  it('a new game starts with no features: no free spins, no bonus buy, no ante, no feature tiles', () => {
    const c = make({});
    expect(c.freeSpins).toBe(false); expect(c.modes.map((m) => m.name)).toEqual(['base']); expect(c.features).toBeUndefined();
    expect(Object.values(c.reels.sets).some((set) => c.symbols.scatter in set)).toBe(false);
    expect(safeValidate(c).filter((i) => i.level === 'error')).toEqual([]);
  });
});

describe('free spins as a feature', () => {
  const errors = (c: GameConfig) => safeValidate(c).filter((i) => i.level === 'error');
  it('off: no scatter, no free spins or win-cap distribution, bonus buys and free-spin-only features go; on again restores the demo setup', () => {
    const d = demo(); d.features = [{ ...(JSON.parse(JSON.stringify({ id: 'f1', type: 'randomWild', counts: { '1': 1 }, where: ['free'], trigger: { match: 'all', conditions: [] } }))) }];
    const off = setFreeSpins(d, false);
    expect(errors(off)).toEqual([]);
    expect(off.modes.map((m) => m.name)).toEqual(['base']);
    expect(off.modes[0].distributions.map((x) => x.criteria)).toEqual(['0', 'basegame']);
    expect(off.optimization.base.conditions.basegame.rtp).toBeCloseTo(off.modes[0].rtp, 6);
    expect(off.features).toBeUndefined();
    let r = 0; for (const s of runSim(off, 4000, 4000)) r = s.triggerOneIn; expect(r).toBe(Infinity);
    const on = setFreeSpins(off, true);
    expect(errors(on)).toEqual([]);
    expect(on.modes[0].distributions.map((x) => [x.criteria, x.quota])).toEqual(demo().modes[0].distributions.map((x) => [x.criteria, x.quota]));
    expect(on.reels.sets.BR0[on.symbols.scatter]).toBe(demo().reels.sets.BR0[on.symbols.scatter]);
    const bad = setFreeSpins(demo(), false); bad.reels.sets.BR0[bad.symbols.scatter] = 3; expect(errors(bad).length).toBeGreaterThan(0);
  });
  it('compiles, and the rules leave out scatter and free spins and state the max win as a cap', () => {
    const off = setFreeSpins(demo(), false);
    const s = buildStrings(off);
    expect(s['rules.scatter']).toBe(''); expect(s['rules.freeSpins']).toBe(''); expect(s['rules.retrigger']).toBe('');
    expect(String(s['rules.wild'])).not.toMatch(/scatter|S or M/i);
    expect(String(s['rules.maxWin'])).toMatch(/capped at 5000x/); expect(s['rules.mode.base.maxWinIsCap']).toBe(1);
    expect(renderRulesMarkdown(off, s)).not.toMatch(/^- $/m); // no empty rule lines
    expect(buildStrings(demo())['rules.mode.base.maxWinIsCap']).toBeUndefined();
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'nfs-')); const r = compile(off, out);
    expect(fs.readFileSync(path.join(r.dir, 'game_config.py'), 'utf8')).not.toMatch(/"freegame"/);
    fs.rmSync(out, { recursive: true, force: true });
  });
  it('an ante bet works without free spins and keeps its settings when free spins come back', () => {
    const off = setAnte(setFreeSpins(demo(), false), 2, { wilds: 2 });
    expect(errors(off)).toEqual([]); expect(getAnte(off)?.freeSpins).toBe(false);
    const sum = Object.values(off.optimization.ante.conditions).reduce((a, x) => a + (typeof x.rtp === 'number' ? x.rtp : 0), 0);
    expect(sum).toBeCloseTo(off.modes[0].rtp, 6);
    const on = setFreeSpins(off, true);
    expect(errors(on)).toEqual([]); expect(anteMode(on)?.cost).toBe(2); expect(getAnte(on)?.wilds).toBe(2);
  });
});
