import { describe, expect, it } from 'vitest';
import start from '../foundry/examples/t1-demo.config.json';
import type { GameConfig } from '../foundry/compiler/config';
import { syncMaxWin, anchorTier, freeSpinMin, setFreeSpinRule, setLook, setPayLevel, setReturn, symbolLook, addPaying, clone, nearestRoundCosts, parseConfig, removePaying, renameSymbol, safeValidate, setTiers, shares, groupIssues } from '../foundry/builder/model';

const base = () => clone(start as unknown as GameConfig);
const errors = (c: GameConfig) => safeValidate(c).filter((i) => i.level === 'error');

describe('builder model', () => {
  it('the demo config has no errors', () => expect(errors(base())).toEqual([]));
  it('adds and removes a paying symbol and stays valid', () => {
    const c = addPaying(base(), 'H5');
    expect(c.paytable.pays.H5).toHaveLength(4);
    expect(Object.values(c.reels.sets).every((w) => w.H5 === 20)).toBe(true);
    expect(errors(c)).toEqual([]);
    expect(errors(removePaying(c, 'H5'))).toEqual([]);
  });
  it('renames a symbol everywhere', () => {
    const c = renameSymbol(base(), 'H1', 'ZZ');
    expect(c.symbols.paying).toContain('ZZ');
    expect(c.paytable.pays.ZZ).toBeTruthy();
    expect(c.reels.sets.BR0.ZZ).toBeGreaterThan(0);
    expect(errors(c)).toEqual([]);
  });
  it('keeps pays aligned when tiers change', () => {
    const c = setTiers(base(), [[8, 9], [10, 36]]);
    expect(Object.values(c.paytable.pays).every((p) => p.length === 2)).toBe(true);
  });
  it('flags a non-round mode cost and suggests round ones', () => {
    const c = base(); c.modes[1].cost = 809;
    expect(errors(c).some((i) => i.path === 'modes[1].cost')).toBe(true);
    expect(nearestRoundCosts(809)).toContain(750);
    expect(nearestRoundCosts(5.233)).toContain(5);
  });
  it('groups issues by screen and reports incomplete configs without throwing', () => {
    const c = base(); c.board.reels = 2;
    expect(groupIssues(safeValidate(c)).board.length).toBeGreaterThan(0);
    expect(safeValidate({} as GameConfig)[0].level).toBe('error');
  });
  it('shares add up to one; parseConfig rejects junk', () => {
    expect(Object.values(shares(base().reels.sets.BR0)).reduce((a, b) => a + b, 0)).toBeCloseTo(1);
    expect(parseConfig('{').error).toMatch(/JSON/);
    expect(parseConfig('{"a":1}').error).toMatch(/Foundry/);
    expect(parseConfig(JSON.stringify(base())).config?.id).toBe('foundry_t1_demo');
  });
  it('payout level scales the whole row and stays valid', () => {
    const c = setPayLevel(base(), 'H1', 30);
    expect(c.paytable.pays.H1[anchorTier(c)]).toBe(30);
    expect(errors(c)).toEqual([]);
  });
  it('return change rescales optimiser targets so the sums match', () => {
    const c = setReturn(base(), 0.955);
    expect(c.modes.every((m) => m.rtp === 0.955)).toBe(true);
    expect(errors(c)).toEqual([]);
  });
  it('free spin rule regenerates the trigger table without warnings', () => {
    const c = setFreeSpinRule(base(), 4, 3);
    expect(freeSpinMin(c)).toBe(4);
    expect(c.freeSpinTriggers.base['4']).toBe(12);
    expect(safeValidate(c).some((i) => i.path.startsWith('freeSpinTriggers.base'))).toBe(false);
  });
  it('symbol look defaults to id and colour; edits are stored on the config', () => {
    expect(symbolLook(base(), 'H1').name).toBe('H1');
    const c = setLook(base(), 'H1', { name: 'Crown', color: '#123456' });
    expect(symbolLook(c, 'H1')).toMatchObject({ name: 'Crown', color: '#123456' });
    expect(errors(c)).toEqual([]);
  });
  it('win ranges: starts define contiguous tiers to the board size, pays follow', async () => {
    const { setRangeStarts, rangeLabel } = await import('../foundry/builder/model');
    const c = setRangeStarts(base(), [6, 7, 12]);
    expect(c.paytable.tiers).toEqual([[6, 6], [7, 11], [12, 30]]);
    expect(rangeLabel(c, 2)).toBe('12+');
    expect(Object.values(c.paytable.pays).every((p) => p.length === 3)).toBe(true);
    expect(errors(c)).toEqual([]);
    expect(setRangeStarts(base(), [9, 5]).paytable.tiers[1][0]).toBe(10); // starts are kept ascending
  });
  it('max win stays in sync across modes and win-cap targets (no "wincap winCriteria must equal the mode maxWin")', () => {
    const c = base(); c.modes[0].maxWin = 10000; // as if the max win was changed before the bonus buy was added
    expect(errors(c).some((i) => /wincap winCriteria/.test(i.message))).toBe(true);
    const fixed = syncMaxWin(c);
    expect(errors(fixed)).toEqual([]);
    expect(fixed.modes.every((m) => m.maxWin === 10000 && m.distributions.filter((d) => d.criteria === 'wincap').every((d) => d.winCriteria === 10000))).toBe(true);
    expect(syncMaxWin(fixed)).toBe(fixed); // idempotent, same object when nothing to fix
  });
});
