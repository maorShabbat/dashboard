import type { GameConfig } from '../compiler/config';
import { perkBreakdown, plainBonus, type PerkValue } from './model';
import { balanceOptions, bonusSummary, runSim, tunePays, type BalanceOption, type BonusSummary, type Summary } from './sim';
import { suggestPays } from './model';

export type SimRequest = { id: number; cfg: GameConfig; spins: number; batch?: number; seed?: number; tune?: boolean; suggest?: boolean; bonus?: boolean; bonusId?: string; bonusAll?: boolean; balance?: number; fx?: boolean };
export type SimReply = { id: number; summary?: Summary; done?: boolean; error?: string; tuned?: { factor: number; rtp: number }; suggested?: { pays: Record<string, number[]>; rtp: number }; bonusResult?: BonusSummary | null; perks?: PerkValue[]; core?: number; option?: BalanceOption; effects?: FxEffect[]; all?: Record<string, BonusSummary> };
export interface FxEffect { id: string; rtp: number; hit: number; vol: number; bonus: Record<string, number> }

let current = 0;
self.onmessage = (e: MessageEvent<SimRequest>) => {
  const { id, cfg, spins, batch, seed, tune, suggest, bonus, bonusId, bonusAll, balance, fx } = e.data;
  current = id;
  try {
    if (balance !== undefined) {
      const it = balanceOptions(cfg, balance);
      const step = () => { if (id !== current) return; const r = it.next(); if (r.done) { (self as unknown as Worker).postMessage({ id, done: true } satisfies SimReply); return; } (self as unknown as Worker).postMessage({ id, option: r.value } satisfies SimReply); setTimeout(step, 0); };
      step(); return;
    }
    if (fx) {
      const last = (c: typeof cfg) => { let r!: Summary; for (const x of runSim(c, 40000, 40000, 12345, 8000)) r = x; return r; };
      const all = last(cfg);
      const effects: FxEffect[] = (cfg.features ?? []).map((f) => {
        const without = { ...cfg, features: (cfg.features ?? []).filter((x) => x.id !== f.id) };
        const natural = f.where.some((w) => w === 'base' || w === 'free');
        const o = natural ? last(without) : all;
        const bonus: Record<string, number> = {};
        for (const w of f.where) if (w !== 'base' && w !== 'free') bonus[w] = (bonusSummary(cfg, 5000, 777, w)?.avgWin ?? 0) - (bonusSummary(without, 5000, 777, w)?.avgWin ?? 0);
        return { id: f.id, rtp: all.rtp - o.rtp, hit: all.hitRate - o.hitRate, vol: all.volatility - o.volatility, bonus };
      });
      (self as unknown as Worker).postMessage({ id, effects } satisfies SimReply); return;
    }
    if (bonusAll) {
      const all: Record<string, BonusSummary> = {};
      for (const m of cfg.modes) if (m.isBuyBonus) { const r = bonusSummary(cfg, spins, 777, m.name); if (r) all[m.name] = r; }
      (self as unknown as Worker).postMessage({ id, all } satisfies SimReply); return;
    }
    if (bonus) {
      const r = bonusSummary(cfg, spins, 777, bonusId); let perks: PerkValue[] = []; let core: number | undefined;
      if (r) { const sim = (c: typeof cfg, n: number) => bonusSummary(c, n, 777, bonusId)!.avgWin; const avg6 = sim(cfg, 6000); perks = perkBreakdown(cfg, avg6, 6000, sim, bonusId); core = sim(plainBonus(cfg, bonusId), 6000); }
      (self as unknown as Worker).postMessage({ id, bonusResult: r, perks, core } satisfies SimReply); return;
    }
    if (suggest) { const r = suggestPays(cfg); (self as unknown as Worker).postMessage({ id, suggested: { pays: r.config.paytable.pays, rtp: r.rtp } } satisfies SimReply); return; }
    if (tune) { (self as unknown as Worker).postMessage({ id, tuned: tunePays(cfg, cfg.modes[0].rtp) } satisfies SimReply); return; }
    const it = runSim(cfg, spins, batch ?? 2000, seed ?? 12345, spins <= 60000 ? 8000 : 60000);
    const step = () => {
      if (id !== current) return; // a newer request replaced this one
      const r = it.next();
      if (r.done) { (self as unknown as Worker).postMessage({ id, done: true } satisfies SimReply); return; }
      (self as unknown as Worker).postMessage({ id, summary: r.value } satisfies SimReply);
      setTimeout(step, 0);
    };
    step();
  } catch (err) { (self as unknown as Worker).postMessage({ id, error: String((err as Error).message) } satisfies SimReply); }
};
