import { describe, expect, it } from 'vitest';
import start from '../foundry/examples/t1-demo.config.json';
import type { GameConfig } from '../foundry/compiler/config';
import { diagnose } from '../foundry/builder/diagnose';
import { perkBreakdown } from '../foundry/builder/model';
import { getBonusSettings, setFrequency, safeValidate, setBonusSettings, suggestPays } from '../foundry/builder/model';
import { balanceOptions, bonusSummary, runSim, scalePays, tunePays, type Summary } from '../foundry/builder/sim';

const cfg = start as unknown as GameConfig;
const run = (c: GameConfig, n: number) => { let last!: Summary; for (const s of runSim(c, n, n)) last = s; return last; };

describe('builder live estimate (TS port of the T1 mechanic)', () => {
  it('matches the official SDK played naturally (docs/foundry/tools/natural_run.py, 300,000 spins: RTP 1.0847 +-0.0053, hit 39.83%, 1x or more 29.95%)', () => {
    const s = run(cfg, 200000);
    expect(Math.abs(s.rtp - 1.0847)).toBeLessThan(0.035);
    expect(Math.abs(s.hitRate - 0.3983)).toBeLessThan(0.006);
    expect(Math.abs(s.pushRate - 0.2995)).toBeLessThan(0.006);
  }, 60000);
  it('is deterministic: the same design gives the same numbers', () => {
    expect(run(cfg, 5000)).toEqual(run(cfg, 5000));
  });
  it('paying more raises RTP; scalePays keeps pays positive and ordered', () => {
    const up = scalePays(cfg, 1.5);
    expect(run(up, 20000).rtp).toBeGreaterThan(run(cfg, 20000).rtp);
    for (const row of Object.values(up.paytable.pays)) row.forEach((v, i) => { expect(v).toBeGreaterThan(0); if (i) expect(v).toBeGreaterThanOrEqual(row[i - 1]); });
  });
  it('tunePays lands near the target RTP', () => {
    const t = tunePays(cfg, 0.962, 30000);
    expect(Math.abs(t.rtp - 0.962)).toBeLessThan(0.01);
    expect(t.factor).toBeLessThan(1);
  }, 60000);
  it('wincap is respected and volatility class is reported', () => {
    const s = run(cfg, 20000);
    expect(s.maxSeen).toBeLessThanOrEqual(5000);
    expect(['Low', 'Medium', 'High', 'Very high']).toContain(s.volClass);
  });
  it('per-symbol shares add up to the RTP and are reported for every paying symbol', () => {
    const s = run(cfg, 30000);
    const sum = Object.values(s.bySymbol).reduce((a, b) => a + b.rtpShare, 0);
    expect(Object.keys(s.bySymbol)).toEqual(cfg.symbols.paying);
    expect(Math.abs(sum - s.rtp)).toBeLessThan(1e-6);
    expect(s.bySymbol.H1.hitRate).toBeGreaterThan(0);
  });
  it('suggestPays lands on target with the top symbol paying most', () => {
    const r = suggestPays(cfg);
    expect(Math.abs(r.rtp - 0.962)).toBeLessThan(0.012);
    const a = r.config.paytable.pays; const top = a.H1[2]; const low = a.L4[2];
    expect(top).toBeGreaterThan(low);
    for (const row of Object.values(a)) row.forEach((v, i) => { if (i) expect(v).toBeGreaterThanOrEqual(row[i - 1]); });
  }, 90000);
  it('Bonus Buy: settings round-trip, stay valid, and each lever changes what a buy returns', () => {
    const base = getBonusSettings(cfg)!;
    expect(base.multPreset).toBe('standard'); expect(base.multBoost).toBe(1);
    const errors = (c: GameConfig) => safeValidate(c).filter((i) => i.level === 'error');
    const run = (c: GameConfig) => bonusSummary(c, 6000)!;
    const ref = run(cfg);
    expect(ref.avgWin).toBeGreaterThan(0);
    expect(run(cfg)).toEqual(ref); // deterministic
    const hi = setBonusSettings(cfg, { multPreset: 'high' });
    expect(errors(hi)).toEqual([]); expect(getBonusSettings(hi)!.multPreset).toBe('high');
    expect(run(hi).avgWin).toBeGreaterThan(ref.avgWin);
    const boost = setBonusSettings(cfg, { multBoost: 3 });
    expect(errors(boost)).toEqual([]); expect(getBonusSettings(boost)!.multBoost).toBe(3); expect(boost.reels.sets.FRB).toBeTruthy();
    expect(run(boost).avgWin).toBeGreaterThan(ref.avgWin);
    const sc = setBonusSettings(cfg, { minScatters: 6, maxScatters: 6 });
    expect(errors(sc)).toEqual([]); expect(run(sc).avgWin).toBeGreaterThan(ref.avgWin);
    expect(setBonusSettings(boost, { multBoost: 1 }).reels.sets.FRB).toBeUndefined();
    expect(BUY(ref.suggestedCost)).toBe(true);
    expect(bonusSummary({ ...cfg, modes: [cfg.modes[0]] } as GameConfig, 100)).toBeNull();
  }, 60000);
  it('Balance RTP: every strategy is explained, reachable ones land on target, and applying one never breaks the config', () => {
    const wild = scalePays(cfg, 3); // far above target
    const opts = [...balanceOptions(wild, 0.962, 12000)];
    expect(opts.map((o) => o.id)).toEqual(['pays-all', 'pays-high', 'pays-low', 'wild', 'spins']);
    for (const o of opts) {
      expect(o.how.length).toBeGreaterThan(20); expect(o.price.length).toBeGreaterThan(20);
      expect(safeValidate(o.config).filter((i) => i.level === 'error')).toEqual([]);
      if (o.reachable && o.id.startsWith('pays')) expect(Math.abs(o.rtp - 0.962)).toBeLessThan(0.02);
    }
    expect(opts[0].reachable).toBe(true);
  }, 120000);
  it('diagnose: explains what is too high, what to change and how it affects the player; stays quiet for a healthy design', () => {
    const sum = (c: GameConfig, n = 6000) => { let last!: Summary; for (const s of runSim(c, n, n, 12345, 8000)) last = s; return last; };
    const healthy = diagnose(cfg, undefined);
    expect(healthy.verdict).toMatch(/Waiting/);
    const tuned = scalePays(cfg, 0.9);
    const ok = diagnose(tuned, sum(tuned));
    expect(ok.findings.filter((f) => f.severity === 'high')).toEqual([]);
    // a pay above the max win
    const big = JSON.parse(JSON.stringify(cfg)) as GameConfig; big.paytable.pays.H1 = [3, 7.5, 15, 20000];
    const dBig = diagnose(big, sum(big));
    expect(dBig.findings.some((f) => f.id === 'pay-H1' && /max win/.test(f.title))).toBe(true);
    // far too many scatters
    const scat = setFrequency(cfg, cfg.symbols.scatter, 80);
    const dScat = diagnose(scat, sum(scat, 3000));
    expect(dScat.findings.some((f) => f.id === 'scatter')).toBe(true);
    for (const d of [dBig, dScat]) { expect(d.experience.length).toBeGreaterThan(0); expect(d.findings.every((f) => f.detail.length > 20 && f.fix.length > 10)).toBe(true); }
    expect(dScat.canFixAutomatically).toBe(false);
  }, 60000);
  it('Bonus Buy perks: each lever is stored on the right distribution, stays valid, and raises the average win', () => {
    const errors = (c: GameConfig) => safeValidate(c).filter((i) => i.level === 'error');
    const avg = (c: GameConfig) => bonusSummary(c, 6000)!.avgWin;
    const ref = avg(cfg);
    const cases: [string, Partial<ReturnType<typeof getBonusSettings> & object>][] = [
      ['extraSpins', { extraSpins: 6 }], ['startMult', { startMult: 3 }], ['wildBoost', { wildBoost: 3 }], ['premiumBoost', { premiumBoost: 3 }], ['scatterBoost', { scatterBoost: 3 }],
    ];
    for (const [k, patch] of cases) {
      const c = setBonusSettings(cfg, patch as never);
      expect(errors(c)).toEqual([]);
      expect(getBonusSettings(c)![k as 'extraSpins']).toBe((patch as Record<string, number>)[k]);
      expect(avg(c)).toBeGreaterThan(ref);
    }
    const c = setBonusSettings(cfg, { startMult: 3, extraSpins: 6 });
    for (const d of c.modes[1].distributions) { expect(d.conditions.startMult).toBe(3); expect(d.conditions.extraSpins).toBe(6); }
    expect(c.modes[0].distributions.every((d) => d.conditions.startMult === undefined)).toBe(true); // the base game is untouched
    const back = setBonusSettings(c, { startMult: 1, extraSpins: 0 });
    expect(back.modes[1].distributions.every((d) => d.conditions.startMult === undefined && d.conditions.extraSpins === undefined)).toBe(true);
    // validation rejects impossible values
    const bad = JSON.parse(JSON.stringify(c)) as GameConfig; bad.modes[1].distributions[1].conditions.startMult = 99;
    expect(errors(bad).some((i) => /starting multiplier/.test(i.message))).toBe(true);
    // the breakdown names every active perk with a positive value
    const bundle = setBonusSettings(cfg, { startMult: 3, extraSpins: 6, wildBoost: 3 });
    const sim = (x: GameConfig, n: number) => bonusSummary(x, n)!.avgWin;
    const parts = perkBreakdown(bundle, sim(bundle, 6000), 6000, sim);
    expect(parts.map((p) => p.id)).toEqual(['scatters', 'extraSpins', 'startMult', 'wilds']);
    expect(parts.every((p) => p.value > 0)).toBe(true);
  }, 120000);
});
const BUY = (n: number) => [5, 10, 25, 50, 75, 100, 150, 200, 250, 500, 1000].includes(n);
