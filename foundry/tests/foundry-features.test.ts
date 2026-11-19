import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import start from '../foundry/examples/t1-demo.config.json';
import { isPayStep, snapPay, type GameConfig } from '../foundry/compiler/config';
import { compile } from '../foundry/compiler/compile';
import { buildStrings } from '../foundry/compiler/rules';
import { allFeatures, defaultFeature, describeTrigger, migrateFeatures, validateFeatures, type Condition, type Feature, type FeatureType, type Trigger } from '../foundry/compiler/features';
import { safeValidate, suggestPays, syncMaxWin } from '../foundry/builder/model';
import { bonusSummary, runSim, scalePays, tunePays } from '../foundry/builder/sim';

const base = start as unknown as GameConfig;
const withFeatures = (features: Feature[]): GameConfig => ({ ...JSON.parse(JSON.stringify(base)), features });
const last = (c: GameConfig, n = 30000) => { let s; for (const x of runSim(c, n, n, 12345)) s = x; return s!; };
const errors = (c: GameConfig) => safeValidate(c).filter((i) => i.level === 'error');
const ctx = { cells: 30, symbols: ['H1', 'L1', 'W', 'S', 'M'], places: ['base', 'free', 'bonus'] };
const msgs = (f: Feature[]) => validateFeatures(f, ctx).map((i) => i.message).join(' | ');
/** A feature of a type with some fields changed. */
const make = <T extends FeatureType>(type: T, o: Record<string, unknown> = {}, where = ['free', 'bonus']): Feature => ({ ...defaultFeature(type, where), ...o }) as Feature;
const gs = (need: number, tool: 'wilds' | 'multiplier' | 'remove', power: number, o: Record<string, unknown> = {}) => ({ charge: { kind: 'wins' }, need, tool, power, repeat: false, ...o });
/** The bar has one cell for each reel (6 in the demo): the cells a test is not about do nothing (they open at 50 charges). */
const inert = { charge: { kind: 'land', symbols: ['S'] }, need: 50, tool: 'remove', power: 1, repeat: false };
const fill = (slots: Record<string, unknown>[], n = 6) => [...slots, ...Array.from({ length: Math.max(0, n - slots.length) }, () => ({ ...inert }))];
const always: Trigger = { match: 'all', conditions: [] };
const chance = (p: number): Trigger => ({ match: 'all', conditions: [{ kind: 'chance', p }] });

describe('pays sit on Stake\'s 0.1x step (the SDK verifier rejects any round payout that is not a multiple of 0.1)', () => {
  const allSteps = (c: GameConfig) => Object.values(c.paytable.pays).every((row) => row.every(isPayStep));
  it('snapPay rounds to a tenth and never goes below 0.1', () => {
    expect([snapPay(2.63), snapPay(0.04), snapPay(0.26), snapPay(15), snapPay(7.449)]).toEqual([2.6, 0.1, 0.3, 15, 7.4]);
  });
  it('the validator rejects cents and the editor snaps old designs', () => {
    const c = JSON.parse(JSON.stringify(base)) as GameConfig; c.paytable.pays.H1[0] = 2.63;
    expect(safeValidate(c).some((i) => i.level === 'error' && /multiples of 0.1x/.test(i.message))).toBe(true);
    const fixed = syncMaxWin(c);
    expect(allSteps(fixed)).toBe(true); expect(fixed.paytable.pays.H1[0]).toBe(2.6);
    expect(syncMaxWin(base)).toBe(base);
  });
  it('scaling, tuning and suggesting produce only 0.1x steps', () => {
    expect(allSteps(scalePays(base, 0.5137))).toBe(true);
    const t = tunePays(base, 0.962, 20000);
    expect(allSteps(scalePays(base, t.factor))).toBe(true);
    expect(Math.abs(t.rtp - 0.962)).toBeLessThan(0.05);
    expect(allSteps(suggestPays(base).config)).toBe(true);
  }, 120000);
});

describe('feature instances: where, triggers, ids', () => {
  it('a game without features is unchanged and valid', () => {
    expect(errors(base)).toEqual([]);
    expect(last(base, 5000).rtp).toBe(last({ ...base, features: [] }, 5000).rtp);
  });

  it('validates ids, places and bonus-only features', () => {
    expect(msgs([make('randomWild', { id: 'a b' })])).toMatch(/id:/);
    expect(msgs([make('randomWild'), make('randomWild')])).toMatch(/share the id/);
    expect(errors(withFeatures([make('randomWild'), make('randomWild', { id: 'randomWild2' })]))).toEqual([]); // two instances are fine
    expect(msgs([make('randomWild', { where: [] })])).toMatch(/choose where/);
    expect(msgs([make('randomWild', { where: ['nowhere'] })])).toMatch(/not the base game/);
    // sticky wilds, the hero and the gadget row need steps inside a round: tumbles in the base game of a tumbling game, none in paylines or ways
    expect(validateFeatures([make('gadgetPanel', { where: ['base'] })], { cells: 15, places: ['base', 'free'], tumbles: false })).toEqual([]); // the gadget row works in any base game
    for (const f of [make('stickyWild', { where: ['base', 'free'] }), make('heroWild', { where: ['base'] })]) {
      expect(msgs([f])).toBe('');
      expect(validateFeatures([f], { cells: 15, places: ['base', 'free'], tumbles: false }).map((i) => i.message).join(' | ')).toMatch(/bonus only/);
    }
  });

  it('validates every kind of condition and keeps bonus-only ones out of the base game', () => {
    const t = (...c: Condition[]): Trigger => ({ match: 'all', conditions: c });
    const bad = (c: Condition, where = ['free']) => msgs([make('randomWild', { trigger: t(c), where })]);
    expect(bad({ kind: 'chance', p: 0 })).toMatch(/chance/);
    expect(bad({ kind: 'scatters', min: 0 })).toMatch(/scatters/);
    expect(bad({ kind: 'scatters', min: 4, max: 2 })).toMatch(/maximum/);
    expect(bad({ kind: 'symbols', symbol: 'Z', min: 3 })).toMatch(/symbols/);
    expect(bad({ kind: 'symbols', symbol: 'H1', min: 99 })).toMatch(/symbol count/);
    expect(bad({ kind: 'spinIs', which: 'every', n: 1 })).toMatch(/free spin number/);
    expect(bad({ kind: 'prevSpin', result: 'big' })).toMatch(/previous spin/);
    expect(bad({ kind: 'streak', of: 'loss', n: 1 })).toMatch(/streak/);
    expect(bad({ kind: 'bonusWin', atLeast: 0 })).toMatch(/bonus win/);
    expect(bad({ kind: 'spinsLeft', atMost: -1 })).toMatch(/spins left/);
    for (const c of [{ kind: 'chance', p: 0.2 }, { kind: 'scatters', min: 2 }, { kind: 'symbols', symbol: 'H1', min: 4 }, { kind: 'spinIs', which: 'first' }, { kind: 'prevSpin', result: 'loss' }, { kind: 'streak', of: 'win', n: 2 }, { kind: 'bonusWin', atLeast: 10 }, { kind: 'spinsLeft', atMost: 2 }] as Condition[]) expect(bad(c)).toBe('');
    // the base game has no memory between rounds
    expect(bad({ kind: 'spinIs', which: 'first' }, ['base'])).toMatch(/only exists inside a bonus/);
    expect(bad({ kind: 'bonusWin', atLeast: 5 }, ['base', 'free'])).toMatch(/only exists inside a bonus/);
    expect(bad({ kind: 'scatters', min: 2 }, ['base'])).toBe('');
  });

  it('describes a trigger in plain English', () => {
    expect(describeTrigger(always)).toBe('every spin');
    expect(describeTrigger({ match: 'all', conditions: [{ kind: 'chance', p: 0.15 }, { kind: 'prevSpin', result: 'loss' }] })).toBe('15% chance and previous spin lost');
    expect(describeTrigger({ match: 'any', conditions: [{ kind: 'scatters', min: 2, max: 2 }, { kind: 'spinIs', which: 'every', n: 3 }] })).toBe('2 scatters land or every 3rd free spin');
  });

  it('upgrades designs saved with scope and chance', () => {
    const old = { ...JSON.parse(JSON.stringify(base)), features: [
      { type: 'randomWild', scope: 'both', chance: 0.4, counts: { '1': 1 } },
      { type: 'expandWild', scope: 'free', chance: 0.5, shape: 'reel' },
      { type: 'stickyWild', lifetime: 2 } ] };
    const c = migrateFeatures(old) as GameConfig;
    expect(c.features![0]).toMatchObject({ id: 'randomWild', where: ['base', 'free', 'bonus'], trigger: { match: 'all', conditions: [{ kind: 'chance', p: 0.4 }] } });
    expect(c.features![1]).toMatchObject({ where: ['free', 'bonus'], chance: 0.5, trigger: { conditions: [] } });
    expect((c.features![0] as unknown as Record<string, unknown>).scope).toBeUndefined();
    expect(migrateFeatures(c)).toBe(c); // already new: untouched
    expect(errors(syncMaxWin(old))).toEqual([]);
  });
});

describe('what the features do to the return (browser estimate)', () => {
  it('random wilds raise the return; where and chance matter; two instances add up', () => {
    const ref = last(base).rtp;
    const rw = (o: Record<string, unknown>) => last(withFeatures([make('randomWild', { counts: { '2': 1 }, ...o })])).rtp;
    const free = rw({ trigger: chance(0.4), where: ['free', 'bonus'] });
    const both = rw({ trigger: chance(0.4), where: ['base', 'free', 'bonus'] });
    expect(free).toBeGreaterThan(ref); expect(both).toBeGreaterThan(free);
    expect(rw({ trigger: chance(0.95), where: ['free', 'bonus'] })).toBeGreaterThan(rw({ trigger: chance(0.1), where: ['free', 'bonus'] })); // a wide gap: the whole-game return is a noisy heavy-tailed measure
    const two = last(withFeatures([make('randomWild', { counts: { '2': 1 }, trigger: chance(0.4) }), make('randomWild', { id: 'randomWild2', counts: { '2': 1 }, trigger: chance(0.4) })])).rtp;
    expect(two).toBeGreaterThan(rw({ trigger: chance(0.15), where: ['free', 'bonus'] })); // two instances stack (compared with a clearly weaker single one: this is a noisy heavy-tailed measure)
    expect(last(withFeatures([make('randomWild', { where: ['bonus'], trigger: chance(0.9) })]), 20000).rtp).toBeCloseTo(ref, 0); // a purchased bonus only: the natural game is untouched
  }, 120000);

  it('triggers gate the feature: a rarer or stricter trigger gives less', () => {
    const rw = (trigger: Trigger) => last(withFeatures([make('randomWild', { counts: { '3': 1 }, trigger })])).rtp;
    const every = rw(always);
    expect(rw(chance(0.1))).toBeLessThan(every);
    const lossOnly = rw({ match: 'all', conditions: [{ kind: 'prevSpin', result: 'loss' }] });
    expect(lossOnly).toBeLessThan(every); expect(lossOnly).toBeGreaterThan(last(base).rtp);
    expect(rw({ match: 'all', conditions: [{ kind: 'spinIs', which: 'first' }] })).toBeLessThan(rw({ match: 'all', conditions: [{ kind: 'spinIs', which: 'every', n: 2 }] }));
    expect(rw({ match: 'all', conditions: [{ kind: 'chance', p: 1 }, { kind: 'chance', p: 0.2 }] })).toBeLessThan(rw({ match: 'any', conditions: [{ kind: 'chance', p: 1 }, { kind: 'chance', p: 0.2 }] }));
    expect(rw({ match: 'all', conditions: [{ kind: 'bonusWin', atLeast: 100000 }] })).toBeCloseTo(last(base).rtp, 0); // never reached
  }, 120000);

  it('sticky wilds, hero wild, expanding and spreading wilds, cell multipliers and the gadget row all raise the free-spin return', () => {
    const ref = last(base).rtp;
    const seed = make('randomWild', { counts: { '1': 1 }, trigger: chance(0.4) });
    const rtp = (...f: Feature[]) => last(withFeatures(f)).rtp;
    const refSeed = rtp(seed);
    expect(rtp(make('stickyWild', { lifetime: 0 }))).toBeGreaterThan(ref);
    expect(rtp(make('stickyWild', { lifetime: 0 }))).toBeGreaterThan(rtp(make('stickyWild', { lifetime: 1 })));
    expect(rtp(make('heroWild', { startFactor: 2, growth: 0 }))).toBeGreaterThan(ref);
    expect(rtp(make('heroWild', { startFactor: 2, growth: 2, maxFactor: 20 }))).toBeGreaterThan(rtp(make('heroWild', { startFactor: 2, growth: 0 })));
    expect(rtp(seed, make('expandWild', { chance: 1 }))).toBeGreaterThan(refSeed);
    expect(rtp(seed, make('expandWild', { chance: 1, shape: 'cross' }))).toBeGreaterThan(rtp(seed, make('expandWild', { chance: 1 })));
    expect(rtp(seed, make('spreadWild', { chance: 1, copies: 4 }))).toBeGreaterThan(rtp(seed, make('spreadWild', { chance: 1, copies: 1 })));
    expect(rtp(make('cellMultiplier', { memory: 'bonus' }))).toBeGreaterThan(rtp(make('cellMultiplier', { memory: 'spin' })));
    expect(rtp(make('cellMultiplier', { memory: 'bonus' }))).toBeGreaterThan(rtp(make('cellMultiplier', { memory: 'bonus', growth: 'add', max: 16 })));
    for (const tool of ['wilds', 'multiplier', 'remove'] as const) expect(rtp(make('gadgetPanel', { slots: [gs(1, tool, 3)] }))).toBeGreaterThan(ref);
    expect(rtp(make('gadgetPanel', { slots: [gs(2, 'multiplier', 5)] }))).toBeGreaterThan(rtp(make('gadgetPanel', { slots: [gs(12, 'multiplier', 5)] })));
    expect(rtp(make('gadgetPanel', { slots: [gs(2, 'multiplier', 3, { repeat: true })] }))).toBeGreaterThan(rtp(make('gadgetPanel', { slots: [gs(2, 'multiplier', 3)] })));
    expect(rtp(make('mystery', { counts: { '8': 1 }, trigger: chance(0.5) }))).toBeGreaterThan(rtp(make('mystery', { counts: { '3': 1 }, trigger: chance(0.5) })));
    expect(rtp(make('mystery', { counts: { '6': 1 }, trigger: chance(0.5), pool: 'high' }))).toBeGreaterThan(rtp(make('mystery', { counts: { '6': 1 }, trigger: chance(0.5), pool: 'all' })));
  }, 300000);

  it('a purchased bonus runs its own features', () => {
    const c = withFeatures([make('heroWild', { startFactor: 3, growth: 0, where: ['bonus'] })]);
    const plain = bonusSummary(base, 6000)!.avgWin;
    expect(bonusSummary(c, 6000)!.avgWin).toBeGreaterThan(plain * 1.3);
    expect(bonusSummary(withFeatures([make('heroWild', { startFactor: 3, growth: 0, where: ['free'] })]), 6000)!.avgWin).toBeCloseTo(plain, -1); // natural free spins only
  }, 120000);
});

describe('compiler and rules', () => {
  it('writes the features, the place ids and the lowest symbol into the game', () => {
    const all = (['randomWild', 'mystery', 'expandWild', 'spreadWild', 'cellMultiplier', 'stickyWild', 'heroWild', 'gadgetPanel'] as FeatureType[]).map((t) => make(t, {}, ['base', 'free', 'bonus'].filter((w) => w !== 'base' || !['stickyWild', 'heroWild', 'gadgetPanel'].includes(t))));
    const c = withFeatures(all);
    expect(errors(c)).toEqual([]);
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'feat-'));
    const r = compile(c, out);
    const py = fs.readFileSync(path.join(r.dir, 'foundry_features.py'), 'utf8');
    for (const t of ['randomWild', 'mystery', 'expandWild', 'spreadWild', 'cellMultiplier', 'stickyWild', 'heroWild', 'gadgetPanel']) expect(py).toContain(`"type": "${t}"`);
    expect(py).toContain('"where": ['); expect(py).toContain('"trigger": {'); expect(py).toMatch(/LOWEST_SYMBOL = "L4"/); expect(py).toContain('PAYING = [');
    expect(fs.readFileSync(path.join(r.dir, 'game_override.py'), 'utf8')).toContain('apply_reveal_features');
    expect(JSON.parse(fs.readFileSync(path.join(r.dir, 'features.json'), 'utf8')).length).toBe(8);
    expect(fs.readFileSync(path.join(compile(base, out).dir, 'foundry_features.py'), 'utf8')).toContain('FEATURES = []');
    fs.rmSync(out, { recursive: true, force: true });
  });

  it('every feature has rules text that names where it works and when it fires', () => {
    const f = make('randomWild', { trigger: { match: 'all', conditions: [{ kind: 'prevSpin', result: 'loss' }, { kind: 'chance', p: 0.3 }] } }, ['free', 'bonus']);
    const s = buildStrings({ ...withFeatures([f, make('mystery'), make('expandWild'), make('spreadWild'), make('cellMultiplier'), make('stickyWild'), make('heroWild'), make('gadgetPanel')]), modes: base.modes.map((m) => (m.isBuyBonus ? { ...m, displayName: 'Hyper Spins' } : m)) });
    expect(String(s['rules.feature.randomWild'])).toMatch(/During free spins and during Hyper Spins, random W \(Wild\) symbols can land/);
    expect(String(s['rules.feature.randomWild'])).toMatch(/It works when previous spin lost and 30% chance/);
    expect(String(s['rules.feature.mystery'])).toMatch(/mystery symbols can appear/);
    expect(String(s['rules.feature.heroWild'])).toMatch(/hero W/);
    expect(String(s['rules.feature.cellMultiplier'])).toMatch(/sum of their multipliers/);
    expect(String(s['rules.feature.gadgetPanel'])).toMatch(/cell 1 \(Wilds\) gains 1 charge from each H1 that lands, opens at 6 and drops 1 W/);
    expect(String(s['rules.feature.stickyWild'])).toMatch(/stays on its position/);
  });
});

describe('hold and win', () => {
  it('validates its settings and describes itself in the rules', () => {
    const f = make('holdAndWin', {}, ['free']) as Feature & { respins: number };
    expect(errors(withFeatures([f]))).toEqual([]);
    const bad = (o: Record<string, unknown>) => errors(withFeatures([make('holdAndWin', o, ['free'])])).length;
    expect(bad({ respins: 9 })).toBeGreaterThan(0); expect(bad({ landChance: 0 })).toBeGreaterThan(0); expect(bad({ fullMult: 4 })).toBeGreaterThan(0);
    expect(bad({ values: { '2.5': 1 } })).toBeGreaterThan(0); expect(bad({ counts: { '30': 1 } })).toBeGreaterThan(0);
    const s = buildStrings(withFeatures([make('holdAndWin', {}, ['free'])]));
    expect(String(s['rules.feature.holdAndWin'])).toMatch(/hold and win round can start: 6 to 8 orbs/);
    expect(String(s['rules.feature.holdAndWin'])).toMatch(/multiplied by 2/);
  });
  it('adds a flat, capped value to the game; a purchased bonus with it is worth more', () => {
    const plain = bonusSummary(base, 6000)!.avgWin;
    const c = withFeatures([make('holdAndWin', { trigger: always, values: { '5': 1 }, counts: { '6': 1 }, landChance: 0.01, respins: 1, fullMult: 1 }, ['bonus'])]);
    // every free spin starts 6 orbs of 5x = 30x, almost never more: about 10 spins x 30x on top
    expect(bonusSummary(c, 6000)!.avgWin).toBeGreaterThan(plain + 150);
    const capped = bonusSummary(withFeatures([make('holdAndWin', { trigger: always, values: { '1000': 1 }, counts: { '8': 1 } }, ['bonus'])]), 300)!;
    expect(capped.maxSeen).toBeLessThanOrEqual(base.modes[0].maxWin);
  });
  it('compiles into the game with its event', () => {
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'hw-'));
    const r = compile(withFeatures([make('holdAndWin', {}, ['free'])]), out);
    expect(fs.readFileSync(path.join(r.dir, 'foundry_features.py'), 'utf8')).toContain('"type": "holdAndWin"');
    expect(fs.readFileSync(path.join(r.dir, 'foundry_features.py'), 'utf8')).toContain('def apply_hold_and_win');
    expect(fs.readFileSync(path.join(r.dir, 'game_override.py'), 'utf8')).toContain('apply_hold_and_win');
    fs.rmSync(out, { recursive: true, force: true });
  });
});

describe('scatter rewards', () => {
  it('can give free spins, cash or both per scatter count, and the list can be edited', async () => {
    const { scatterRows, setScatterRows } = await import('../foundry/builder/model');
    const c = JSON.parse(JSON.stringify(base)) as GameConfig;
    const rows = scatterRows(c); expect(rows[0]).toEqual({ count: 3, spins: 6, pay: 0 }); // the demo's table is scatters x 2
    const next = setScatterRows(c, [{ count: 3, spins: 10, pay: 1 }, { count: 4, spins: 15, pay: 3 }, { count: 5, spins: 25, pay: 10 }, { count: 2, spins: 0, pay: 0.5 }]);
    expect(next.scatterRule.custom).toBe(true); expect(next.freeSpinTriggers.base).toEqual({ '3': 10, '4': 15, '5': 25 }); expect(next.scatterRule.pays).toEqual({ '2': 0.5, '3': 1, '4': 3, '5': 10 });
    expect(errors(next)).toEqual([]);
    const bad = JSON.parse(JSON.stringify(next)); bad.scatterRule.pays = { '3': 2.55 }; expect(errors(bad).length).toBeGreaterThan(0);
    expect(setScatterRows(c, [{ count: 3, spins: 0, pay: 1 }])).toBe(c); // free spins need a count that starts them
    const run = (x: GameConfig) => { let s!: { rtp: number }; for (const r of runSim(x, 40000, 40000, 9)) s = r; return s.rtp; };
    const cash = setScatterRows(c, [{ count: 3, spins: 6, pay: 50 }, { count: 4, spins: 8, pay: 50 }, { count: 5, spins: 10, pay: 50 }]);
    expect(run(cash)).toBeGreaterThan(run(c) + 0.05); // the same free spins plus a cash win
    const rich = setScatterRows(c, [{ count: 3, spins: 20, pay: 0 }]);
    expect(bonusSummary(rich, 4000)!.avgWin).toBeGreaterThan(bonusSummary(c, 4000)!.avgWin); // a longer award is worth more
  });
  it('is written into the game and its rules', () => {
    const c = JSON.parse(JSON.stringify(base)) as GameConfig; c.scatterRule.pays = { '3': 1, '4': 3 };
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'sr-')); const r = compile(c, out);
    expect(fs.readFileSync(path.join(r.dir, 'foundry_features.py'), 'utf8')).toContain('SCATTER_PAYS = {"3":1,"4":3}');
    expect(fs.readFileSync(path.join(r.dir, 'game_executables.py'), 'utf8')).toContain('self.fs_award(');
    expect(String(buildStrings(c)['rules.scatter'])).toMatch(/also pay a cash win on top.*3 = 1x, 4 = 3x/);
    fs.rmSync(out, { recursive: true, force: true });
  });
});

describe('features that step through the tumbles of a base round', () => {
  const baseOnly = (f: Feature) => ({ ...f, where: ['base'] }) as Feature;
  it('are allowed in the base game of tumbling games and raise its return', () => {
    const ref = last(base).rtp;
    for (const f of [make('stickyWild', { lifetime: 0 }), make('heroWild', { startFactor: 2, growth: 1 }), make('gadgetPanel', { slots: [gs(1, 'wilds', 3)] })]) {
      const c = withFeatures([baseOnly(f)]);
      expect(errors(c)).toEqual([]);
      expect(last(c).rtp).toBeGreaterThan(ref * 1.02);
    }
  });
  it('are refused in the base game of paylines and ways, which have no tumbles', () => {
    const c = JSON.parse(JSON.stringify(withFeatures([baseOnly(make('stickyWild'))]))); c.gameType = 'paylines'; c.paylines = [[0, 0, 0, 0, 0, 0]];
    expect(errors(c).map((e) => e.message).join(' ')).toMatch(/needs steps inside a round/);
  });
});

describe('multiplier ladder, wilds with multipliers and colossal wilds', () => {
  const everywhere = (f: Feature) => ({ ...f, where: ['base', 'free'] }) as Feature;
  it('validate their settings', () => {
    expect(msgs([make('multiplierLadder', { start: 3, step: 2, max: 2 })])).toMatch(/start value up to 500/);
    expect(msgs([make('wildMultiplier', { values: { '1': 10 } })])).toMatch(/2x to 100x/);
    expect(msgs([make('wildMultiplier', { combine: 'sum' })])).toMatch(/add or multiply/);
    expect(msgs([make('colossalWild', { size: 5 })])).toMatch(/2, 3 or 4/);
    expect(msgs([make('colossalWild', { size: 4 })])).toMatch(/too big/); // 16 of 30 cells
    for (const t of ['multiplierLadder', 'wildMultiplier', 'colossalWild'] as const) expect(msgs([make(t)])).toBe('');
  });
  it('a ladder on tumbling base rounds is allowed; the rules say what it does', () => {
    const c = withFeatures([everywhere(make('multiplierLadder', { start: 2, step: 3, max: 12 }))]);
    expect(errors(c)).toEqual([]);
    expect(buildStrings(c)['rules.feature.multiplierLadder']).toMatch(/starts every spin at 2x and grows by 3 after every tumble, up to 12x/);
  });
  it('raise the return when they work on every spin', () => {
    const ref = last(base).rtp;
    expect(last(withFeatures([everywhere(make('multiplierLadder', { start: 2, step: 2, max: 20 }))])).rtp).toBeGreaterThan(ref * 1.05);
    const wilds = [everywhere(make('randomWild', { trigger: chance(0.4) }))];
    const plain = last(withFeatures(wilds)).rtp;
    const add = last(withFeatures([...wilds, everywhere(make('wildMultiplier', { trigger: always, values: { '2': 1 }, combine: 'add' }))])).rtp;
    expect(add).toBeGreaterThan(plain * 1.05);
    expect(last(withFeatures([everywhere(make('colossalWild', { trigger: chance(0.2) }))])).rtp).toBeGreaterThan(ref * 1.05);
  });
  it('multiplying several wild values pays more than adding them', () => {
    const f = (combine: string) => withFeatures([everywhere(make('randomWild', { trigger: always, counts: { '3': 1 } })), everywhere(make('wildMultiplier', { trigger: always, values: { '3': 1 }, combine }))]);
    expect(last(f('multiply')).rtp).toBeGreaterThan(last(f('add')).rtp);
  });
  it('compile into the game', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fx-'));
    const r = compile(withFeatures([everywhere(make('multiplierLadder')), everywhere(make('wildMultiplier')), everywhere(make('colossalWild'))]), dir);
    expect(fs.readFileSync(path.join(r.dir, 'foundry_features.py'), 'utf8')).toMatch(/"wildMultiplier"/);
  });
});

describe('the top gadget bar is a mechanic of the game', () => {
  it('a gadget row saved as a feature moves to the top gadget bar', () => {
    const old = { ...JSON.parse(JSON.stringify(base)), features: [make('gadgetPanel', { source: 'wilds', slots: [{ need: 2, tool: 'wilds', power: 1 }, { need: 3, tool: 'multiplier', power: 2 }], reuse: true }), make('randomWild')] } as GameConfig;
    const fixed = syncMaxWin(old);
    expect(fixed.gadgetBar!.slots.slice(0, 2)).toMatchObject([{ charge: { kind: 'land', symbols: ['W'] }, need: 2, repeat: true }, { need: 5, tool: 'multiplier' }]); expect(fixed.gadgetBar!.slots.length).toBe(6); // the old shared meter: the second cell opens at the running total
    expect(fixed.features!.map((f) => f.type)).toEqual(['randomWild']);
    const only = syncMaxWin({ ...JSON.parse(JSON.stringify(base)), features: [make('gadgetPanel')] } as GameConfig);
    expect(only.features).toBeUndefined();
  });
  it('works on every spin of every place, shows in the rules and raises the return', () => {
    const c = { ...JSON.parse(JSON.stringify(base)), gadgetBar: { slots: [{ charge: { kind: 'land', symbols: ['W'] }, need: 1, tool: 'multiplier', power: 3, repeat: true }] } } as GameConfig;
    expect(errors(syncMaxWin(c))).toEqual([]); // the bar is made to fit: one cell for each reel
    expect(syncMaxWin(c).gadgetBar!.slots.length).toBe(6);
    expect(errors(c).map((e) => e.message).join(' ')).toMatch(/one cell per reel of the board: 6 cells/);
    const af = allFeatures(c).find((f) => f.id === 'gadgetBar')!;
    expect(af.where).toEqual(expect.arrayContaining(['base', 'free'])); expect(af.trigger.conditions).toEqual([]);
    expect(String(buildStrings(c)['rules.feature.gadgetBar'])).toMatch(/cell 1 gains 1 charge from each W that lands, opens at 1 and adds 3 to the multiplier/);
    const fitted = { ...c, gadgetBar: { slots: fill(c.gadgetBar!.slots as unknown as Record<string, unknown>[]) } } as unknown as GameConfig;
    expect(last(fitted).rtp).toBeGreaterThan(last(base).rtp * 1.05);
    c.gadgetBar!.slots[0].power = 0;
    expect(errors(syncMaxWin(c)).map((e) => e.message).join(' ')).toMatch(/power/);
  });
});

describe('bonus multiplier, symbol removal and configured prize', () => {
  const both = (f: Feature) => ({ ...f, where: ['free', 'bonus'] }) as Feature;
  it('validate their settings and keep the bonus multiplier out of the base game', () => {
    expect(msgs([make('bonusMultiplier', { start: 3, step: 1, max: 2 })])).toMatch(/start value up to 500/);
    expect(msgs([make('bonusMultiplier', { where: ['base'] })])).toMatch(/free spins and purchased bonuses only/);
    expect(msgs([make('removeSymbols', { target: 'all' })])).toMatch(/lowest or low/);
    expect(msgs([make('prizeAward', { values: { '0': 1 } })])).toMatch(/1x to 1000x/);
    for (const t of ['bonusMultiplier', 'removeSymbols', 'prizeAward'] as const) expect(msgs([make(t)])).toBe('');
  });
  it('raise the return and the rules say what they do', () => {
    const ref = last(base).rtp;
    expect(last(withFeatures([both(make('bonusMultiplier', { start: 2, step: 2, max: 20 }))])).rtp).toBeGreaterThan(ref * 1.05);
    expect(last(withFeatures([both(make('removeSymbols', { trigger: always, target: 'low' }))])).rtp).toBeGreaterThan(ref * 1.02);
    expect(last(withFeatures([{ ...make('prizeAward', { trigger: chance(0.1), values: { '5': 1 } }), where: ['base', 'free'] } as Feature])).rtp).toBeGreaterThan(ref + 0.3);
    const c = withFeatures([both(make('bonusMultiplier', { start: 2, step: 3, max: 12 }))]);
    expect(buildStrings(c)['rules.feature.bonusMultiplier']).toMatch(/starts at 2x and grows by 3 after every free spin that wins, up to 12x/);
  });
});

describe('lives and symbol shuffle', () => {
  const free = (f: Feature) => ({ ...f, where: ['free', 'bonus'] }) as Feature;
  it('validate: lives belong to bonuses, a shuffle needs a game where position matters', () => {
    expect(msgs([make('lives', { lives: 0 })])).toMatch(/1 to 10/);
    expect(msgs([make('lives', { where: ['base'] })])).toMatch(/free spins and purchased bonuses only/);
    expect(validateFeatures([make('shuffle')], { ...ctx, positional: false }).map((i) => i.message).join(' ')).toMatch(/where position matters/);
    expect(validateFeatures([make('shuffle')], { ...ctx, positional: true })).toEqual([]);
    expect(msgs([make('lives'), make('shuffle', { id: 'shuffle' })])).toBe('');
  });
  it('fewer lives end the bonus sooner and lower the return', () => {
    const r = (lives: number) => last(withFeatures([free(make('lives', { lives }))]), 40000).rtp;
    const ref = last(base, 40000).rtp;
    expect(r(1)).toBeLessThan(ref);
    expect(r(1)).toBeLessThan(r(5));
    expect(buildStrings(withFeatures([free(make('lives', { lives: 2 }))]))['rules.feature.lives']).toMatch(/starts with 2 lives/);
  });
  it('a shuffle in a lines game changes the return', async () => {
    const c = JSON.parse(JSON.stringify((await import('../foundry/examples/lines-demo.config.json')).default)) as GameConfig;
    const rtp = (x: GameConfig) => { let s: { rtp: number } | undefined; for (const r of runSim(x, 40000, 40000, 5)) s = r as { rtp: number }; return s!.rtp; };
    const ref = rtp(c);
    c.features = [{ ...make('shuffle', { trigger: always }), where: ['base', 'free'] } as Feature];
    expect(errors(c)).toEqual([]);
    expect(Math.abs(rtp(c) - ref)).toBeGreaterThan(0.01);
  });
});

describe('gadget bar cells', () => {
  it('upgrade, repeat and per-cell symbols validate and change the return', () => {
    const bar = (slot: Record<string, unknown>) => ({ ...JSON.parse(JSON.stringify(base)), gadgetBar: { slots: fill([{ charge: { kind: 'land', symbols: ['H1'] }, need: 2, tool: 'multiplier', power: 2, repeat: false, ...slot }]) } } as GameConfig);
    expect(errors(bar({}))).toEqual([]);
    expect(errors(bar({ charge: { kind: 'land', symbols: [] } })).map((e) => e.message).join(' ')).toMatch(/at least one symbol/);
    expect(errors(bar({ charge: { kind: 'land', symbols: ['ZZ'] } })).map((e) => e.message).join(' ')).toMatch(/own symbols/);
    expect(errors(bar({ eliteNeed: 2, elitePower: 3 })).map((e) => e.message).join(' ')).toMatch(/above the opening charge/);
    expect(errors(bar({ eliteNeed: 6, elitePower: 4 }))).toEqual([]);
    const plain = last(bar({})).rtp;
    expect(last(bar({ eliteNeed: 6, elitePower: 6 })).rtp).toBeGreaterThan(plain);
    expect(last(bar({ repeat: true })).rtp).toBeGreaterThan(plain);
    expect(last(bar({ charge: { kind: 'land', symbols: ['H1', 'H2', 'H3', 'H4'] } })).rtp).toBeGreaterThan(plain); // more symbols charge it faster
  });

  it('lock wild reels and opening in order', () => {
    const bar = (slots: Record<string, unknown>[], extra: Record<string, unknown> = {}) => ({ ...JSON.parse(JSON.stringify(base)), gadgetBar: { slots: fill(slots), ...extra } } as GameConfig);
    const reel = (o: Record<string, unknown> = {}) => ({ charge: { kind: 'land', symbols: ['H1', 'H2'] }, need: 3, tool: 'wildReel', power: 1, repeat: false, ...o });
    expect(errors(bar([reel()]))).toEqual([]);
    expect(errors(bar([reel({ power: 6 })])).map((e) => e.message).join(' ')).toMatch(/power: whole number from 1 to 5/);
    const plain = last(bar([reel()])).rtp; const held = last(bar([reel({ hold: true })])).rtp;
    expect(plain).toBeGreaterThan(last(base).rtp);
    expect(held).toBeGreaterThan(plain); // reels that stay wild pay more than one that is wild for a single spin
    const two = [reel({ need: 3, tool: 'multiplier', power: 2 }), reel({ need: 3, tool: 'multiplier', power: 2 })];
    expect(last(bar(two, { sequence: true })).rtp).toBeLessThan(last(bar(two)).rtp); // the second cell waits for the first
    expect(String(buildStrings(bar([reel({ hold: true })], { sequence: true }))['rules.feature.gadgetBar'])).toMatch(/open in order, like doors.*turns 1 random reel into W \(Wild\) symbols and keeps them wild until the bonus ends/);
  });
});

describe('a bar saved in the first shape', () => {
  it('becomes cells with their own charge when the design is opened', () => {
    const old = { ...JSON.parse(JSON.stringify(base)), gadgetBar: { source: 'wilds', reuse: true, slots: [{ need: 2, tool: 'wilds', power: 1 }, { need: 3, tool: 'multiplier', power: 2 }] } } as unknown as GameConfig;
    const fixed = syncMaxWin(old);
    expect(fixed.gadgetBar!.slots.slice(0, 2)).toMatchObject([{ charge: { kind: 'land', symbols: ['W'] }, need: 2, repeat: true }, { charge: { kind: 'land', symbols: ['W'] }, need: 5, repeat: true }]);
    expect(errors(fixed)).toEqual([]);
    expect(syncMaxWin(fixed)).toBe(fixed);
  });
});
