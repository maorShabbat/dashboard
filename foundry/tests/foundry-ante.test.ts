import { describe, expect, it } from 'vitest';
import { readFileSync, mkdtempSync, readFileSync as read } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { anteFactor, anteMode, setAnte, setReturn } from '../foundry/builder/model';
import { validate, type GameConfig } from '../foundry/compiler/config';
import { compile } from '../foundry/compiler/compile';
import { buildStrings, modeText } from '../foundry/compiler/rules';

const demo = (): GameConfig => JSON.parse(readFileSync('foundry/examples/t1-demo.config.json', 'utf8'));
const errors = (c: GameConfig) => validate(c).filter((i) => i.level === 'error');

describe('ante bet', () => {
  it('is added at 2x or 3x, keeps the RTP target and raises the free-spin hit rate', () => {
    for (const cost of [2, 3] as const) {
      const c = setAnte(demo(), cost);
      expect(errors(c)).toEqual([]);
      const a = anteMode(c)!;
      expect(a.cost).toBe(cost); expect(a.rtp).toBe(c.modes[0].rtp); expect(a.isBuyBonus).toBe(false);
      expect(c.modes.map((m) => m.name)).toEqual(['base', 'ante', 'bonus']);
      const o = c.optimization.ante.conditions;
      const sum = Object.values(o).reduce((s, x) => s + (typeof x.rtp === 'number' ? x.rtp : 0), 0);
      expect(sum).toBeCloseTo(a.rtp, 5);
      expect(anteFactor(c)!).toBeGreaterThan(cost === 2 ? 2.5 : 4);
      expect(c.run.books.ante).toBe(c.run.books.base);
    }
  });
  it('is removed again, changes with the price and follows a new RTP target', () => {
    let c = setAnte(demo(), 2);
    c = setAnte(c, 3); expect(c.modes.filter((m) => m.isAnte).length).toBe(1); expect(anteMode(c)!.cost).toBe(3);
    c = setReturn(c, 0.95); expect(anteMode(c)!.rtp).toBe(0.95);
    const sum = Object.values(c.optimization.ante.conditions).reduce((s, x) => s + (typeof x.rtp === 'number' ? x.rtp : 0), 0);
    expect(sum).toBeCloseTo(0.95, 5);
    c = setAnte(c, null); expect(anteMode(c)).toBeUndefined(); expect(c.optimization.ante).toBeUndefined();
  });
  it('refuses other prices and a second ante', () => {
    const c = setAnte(demo(), 2); c.modes[1].cost = 5;
    expect(errors(c).some((e) => /2x or 3x/.test(e.message))).toBe(true);
  });
  it('has rules text, a bet-menu entry and compiles with the features working as base game', () => {
    const c = setAnte(demo(), 2);
    expect(modeText(c, anteMode(c)!).name).toBe('Ante bet');
    expect(buildStrings(c)['ui.mode.ante.button']).toBe('ACTIVATE');
    const dir = mkdtempSync(join(tmpdir(), 'ante-')); compile(c, dir);
    const cfg = read(join(dir, c.id, 'game_config.py'), 'utf8');
    expect(cfg).toContain('name="ante"'); expect(cfg).toContain('cost=2');
    expect(read(join(dir, c.id, 'foundry_features.py'), 'utf8')).toContain('mode == "ante"');
  });
});

describe('what the ante bet does', () => {
  it('is a list: free spins more often, more wilds, better symbols, and features that work only with the ante on', async () => {
    const { getAnte, putFeature } = await import('../foundry/builder/model');
    const { defaultFeature } = await import('../foundry/compiler/features');
    let c = setAnte(demo(), 2);
    expect(getAnte(c)).toEqual({ freeSpins: true, wilds: 1, symbols: 1 }); expect(c.reels.sets.ANTE).toBeUndefined();
    c = setAnte(c, 2, { wilds: 3, symbols: 2 });
    expect(getAnte(c)).toEqual({ freeSpins: true, wilds: 3, symbols: 2 });
    expect(c.reels.sets.ANTE.W).toBe(c.reels.sets.BR0.W * 3); expect(c.reels.sets.ANTE.H1).toBe(c.reels.sets.BR0.H1 * 2);
    expect(c.modes.find((m) => m.isAnte)!.distributions.every((d) => !d.conditions.reelWeights?.base || Object.keys(d.conditions.reelWeights.base)[0] === 'ANTE')).toBe(true);
    expect(errors(c)).toEqual([]);
    const price = setAnte(c, 3); expect(getAnte(price)).toEqual({ freeSpins: true, wilds: 3, symbols: 2 }); // the choices stay when the price changes
    const off = setAnte(c, 2, { freeSpins: false, wilds: 1, symbols: 1 });
    expect(anteFactor(off)).toBe(1); expect(off.reels.sets.ANTE).toBeUndefined();
    const sum = Object.values(off.optimization.ante.conditions).reduce((s, x) => s + (typeof x.rtp === 'number' ? x.rtp : 0), 0); expect(sum).toBeCloseTo(off.modes.find((m) => m.isAnte)!.rtp, 5);
    // a feature that works only with the ante on, removed with it
    const f = { ...defaultFeature('randomWild', ['ante'], []) };
    let g = putFeature(c, f); expect(errors(g)).toEqual([]);
    expect(setAnte(demo(), 2).modes.length).toBe(3);
    const gone = setAnte(g, null); expect(gone.features).toBeUndefined();
    const withBase = putFeature(c, { ...defaultFeature('randomWild', ['base', 'ante'], []) });
    expect(setAnte(withBase, null).features![0].where).toEqual(['base']);
    const bad = putFeature(demo(), f); expect(errors(bad).some((e) => /not the base game/.test(e.message))).toBe(true); // no ante in this game
  });
});
