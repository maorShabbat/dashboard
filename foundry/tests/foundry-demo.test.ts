import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { handleDemo, newState, type DemoData, type DemoState } from '../foundry/demo/engine';
import { buildDemoData, sampleHit, sampleRtp, stratify, trueStats, type Row } from '../foundry/demo/sample';
import { pickId } from '../foundry/demo/engine';
import { writeFixtureLibrary } from '../foundry/mock-rgs/testlib';

const data = (p: number, extra: Partial<DemoData> = {}): DemoData => ({
  game: 'g',
  version: '1',
  currency: 'USD',
  startBalance: 100_000_000,
  modes: { base: { cost: 1, ids: [1], cum: [1], books: { '1': { p, e: [{ type: 'reveal', index: 0 }, { type: 'finalWin', index: 1, amount: p }] } } }, bonus: { cost: 200, ids: [1], cum: [1], books: { '1': { p: 0, e: [] } } } },
  ...extra,
});
const call = (d: DemoData, s: Map<string, DemoState>, m: string, p: string, b: Record<string, unknown> = {}) => handleDemo(d, s, m, p, b, () => 0.5);
const auth = (d: DemoData, s: Map<string, DemoState>, id = 'x') => call(d, s, 'POST', '/wallet/authenticate', { sessionID: id });

describe('demo RGS engine', () => {
  it('needs authenticate first, then validates bets', () => {
    const d = data(0);
    const s = new Map<string, DemoState>();
    expect((call(d, s, 'POST', '/wallet/play', { sessionID: 'x', amount: 1_000_000, mode: 'base' }).json as { error: string }).error).toBe('ERR_IS');
    auth(d, s);
    for (const amount of [50_000, 1_005_000, 2_000_000_000, 1.5, '1000000']) expect((call(d, s, 'POST', '/wallet/play', { sessionID: 'x', amount, mode: 'base' }).json as { error: string }).error).toBe('ERR_VAL');
    expect((call(d, s, 'POST', '/wallet/play', { sessionID: 'x', amount: 1_000_000, mode: 'nope' }).json as { error: string }).error).toBe('ERR_VAL');
  });

  it('zero win: debits, settles at once, and refuses an end-round', () => {
    const d = data(0);
    const s = new Map<string, DemoState>();
    auth(d, s);
    const r = call(d, s, 'POST', '/wallet/play', { sessionID: 'x', amount: 1_000_000, mode: 'BASE' }); // mode in any case
    expect(r.status).toBe(200);
    expect((r.json as { round: { active: boolean } }).round.active).toBe(false);
    expect((r.json as { balance: { amount: number } }).balance.amount).toBe(99_000_000);
    expect(call(d, s, 'POST', '/wallet/end-round', { sessionID: 'x' }).status).toBe(400);
  });

  it('win: pays at end-round, keeps the resume marker, blocks a second bet meanwhile', () => {
    const d = data(160);
    const s = new Map<string, DemoState>();
    auth(d, s);
    const play = call(d, s, 'POST', '/wallet/play', { sessionID: 'x', amount: 1_000_000, mode: 'base' });
    expect((play.json as { round: { payout: number } }).round.payout).toBe(1_600_000);
    expect(call(d, s, 'POST', '/wallet/play', { sessionID: 'x', amount: 1_000_000, mode: 'base' }).status).toBe(400);
    expect(call(d, s, 'POST', '/bet/event', { sessionID: 'x', event: '4' }).status).toBe(200);
    const again = auth(d, s);
    expect((again.json as { round: { event: string; amount: number } }).round).toMatchObject({ event: '4', amount: 1_000_000 });
    const end = call(d, s, 'POST', '/wallet/end-round', { sessionID: 'x' });
    expect((end.json as { balance: { amount: number } }).balance.amount).toBe(100_600_000);
  });

  it('insufficient balance: ERR_IPB and no debit', () => {
    const d = data(0, { startBalance: 500_000 });
    const s = new Map<string, DemoState>();
    auth(d, s);
    expect((call(d, s, 'POST', '/wallet/play', { sessionID: 'x', amount: 1_000_000, mode: 'base' }).json as { error: string }).error).toBe('ERR_IPB');
    expect(s.get('x')!.balance).toBe(500_000);
    expect((call(d, s, 'POST', '/wallet/play', { sessionID: 'x', amount: 100_000, mode: 'bonus' }).json as { error: string }).error).toBe('ERR_IPB'); // 200x of $0.10
  });

  it('replay needs no session and returns payout, cost and state; unknown ids and games fail', () => {
    const d = data(160);
    const s = new Map<string, DemoState>();
    const r = call(d, s, 'GET', '/bet/replay/g/1/BASE/1');
    expect(r.json).toMatchObject({ payoutMultiplier: 1.6, costMultiplier: 1 });
    expect(call(d, s, 'GET', '/bet/replay/g/1/base/9').status).toBe(400);
    expect(call(d, s, 'GET', '/bet/replay/other/1/base/1').status).toBe(400);
    expect(s.size).toBe(0);
  });

  it('reports the social flag in the jurisdiction config', () => {
    const r = handleDemo(data(0), new Map(), 'POST', '/wallet/authenticate', { sessionID: 'x' }, () => 0, true);
    expect((r.json as { config: { jurisdiction: { socialCasino: boolean } } }).config.jurisdiction.socialCasino).toBe(true);
  });

  it('newState starts from the configured balance', () => {
    expect(newState(data(0, { startBalance: 7 })).balance).toBe(7);
  });
});

describe('demo sampling', () => {
  // a heavy-tailed synthetic distribution: many small payouts, rare large ones
  const rows = (): Row[] => {
    const out: Row[] = [];
    let id = 0;
    for (let i = 0; i < 6000; i++) out.push({ id: id++, weight: 1000n + BigInt(i % 7), payout: 0 });
    for (let i = 0; i < 3000; i++) out.push({ id: id++, weight: 300n, payout: 10 + (i % 90) }); // 0.1x to 1x
    for (let i = 0; i < 500; i++) out.push({ id: id++, weight: 40n, payout: 200 + i * 5 }); // 2x to 4.5x
    for (let i = 0; i < 40; i++) out.push({ id: id++, weight: 3n, payout: 5000 + i * 1000 }); // 50x to 90x
    out.push({ id: id++, weight: 1n, payout: 500000 }); // 5000x
    return out;
  };

  it('keeps small bands whole and every band at its exact total probability', () => {
    const r = rows();
    const picks = stratify(r, 20);
    const total = r.reduce((a, x) => a + x.weight, 0n);
    const prob = (list: Row[]) => Number(list.reduce((a, x) => a + x.weight, 0n)) / Number(total);
    expect(picks.reduce((a, p) => a + p.prob, 0)).toBeCloseTo(1, 6);
    const maxRow = r.find((x) => x.payout === 500000)!;
    expect(picks.find((p) => p.id === maxRow.id)!.prob).toBeCloseTo(Number(maxRow.weight) / Number(total), 9); // the 5000x round keeps its own probability
    const losses = r.filter((x) => x.payout === 0);
    const pickedLoss = picks.filter((p) => r[p.id].payout === 0).reduce((a, p) => a + p.prob, 0);
    expect(pickedLoss).toBeCloseTo(prob(losses), 6);
    expect(picks.length).toBeLessThanOrEqual(14 * 20); // at most perBand rounds per band, far fewer than the 9,500 in the table
  });

  it('a stratified sample reproduces the RTP and hit rate of the full table', () => {
    const r = rows();
    const picks = stratify(r, 25);
    const byId = new Map(r.map((x) => [x.id, x]));
    const mean = picks.reduce((a, p) => a + p.prob * byId.get(p.id)!.payout, 0);
    const hit = picks.filter((p) => byId.get(p.id)!.payout > 0).reduce((a, p) => a + p.prob, 0);
    const real = trueStats(r, 1);
    expect(mean / 100).toBeCloseTo(real.rtp, 1);
    expect(Math.abs(mean / 100 - real.rtp) / real.rtp).toBeLessThan(0.02);
    expect(Math.abs(hit - real.hit)).toBeLessThan(1e-6);
  });

  it('pickId follows the cumulative probabilities', () => {
    const m = { cost: 1, ids: [10, 20, 30], cum: [0.5, 0.75, 1], books: {} };
    expect([0, 0.49, 0.5, 0.74, 0.75, 0.99].map((u) => pickId(m, u))).toEqual([10, 10, 20, 20, 30, 30]);
  });

  it('builds demo data from publication files, keeping forced ids replayable', async () => {
    const dir = writeFixtureLibrary({ 'base_loss.json': 5, 'base_tumble_win.json': 1, 'base_wincap.json': 0 });
    const d = await buildDemoData(dir, { game: 'g', perBand: { base: 10 }, forceIds: { base: [7] } });
    expect(Object.keys(d.modes.base.books)).toContain('7'); // the zero-weight win-cap round is kept for replay
    expect(d.modes.base.ids.includes(7)).toBe(false); // but never drawn
    expect(d.modes.base.books['3'].p).toBe(160);
    expect(d.modes.base.cum.at(-1)).toBe(1);
    expect(sampleHit(d.modes.base)).toBeCloseTo(1 / 6, 6);
    expect(sampleRtp(d.modes.base)).toBeCloseTo((1 / 6) * 1.6, 6);
  });

  const PUB = '/home/user/engineio/math-sdk/games/foundry_t1_demo/library/publish_files';
  it.skipIf(!fs.existsSync(path.join(PUB, 'index.json')))('the demo sample of the real T1 game matches its real RTP and hit rate', async () => {
    const d = await buildDemoData(PUB, { game: 'foundry_t1_demo', perBand: { base: 120, bonus: 40 } });
    for (const mode of ['base', 'bonus']) {
      const rows = fs.readFileSync(path.join(PUB, `lookUpTable_${mode}_0.csv`), 'utf8').split('\n').filter(Boolean).map((l) => {
        const [id, w, p] = l.split(',');
        return { id: Number(id), weight: BigInt(w), payout: Number(p) };
      });
      const real = trueStats(rows, d.modes[mode].cost);
      expect(Math.abs(sampleRtp(d.modes[mode]) - real.rtp) / real.rtp, `${mode} RTP`).toBeLessThan(0.03);
      expect(Math.abs(sampleHit(d.modes[mode]) - real.hit), `${mode} hit`).toBeLessThan(0.002);
    }
  }, 120000);
});
