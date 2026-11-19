import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { loadLibrary } from '../foundry/mock-rgs/books';
import { createMockRgs } from '../foundry/mock-rgs/server';

const FIX = path.resolve(__dirname, '../foundry/spec/fixtures');
const fixture = (n: string) => JSON.parse(fs.readFileSync(path.join(FIX, n), 'utf8'));
const PILOT = '/home/user/engineio/math-sdk/games/0_0_scatter/library/publish_files';

let dir: string;
let base: string;
let stop: () => void;
let rgs: ReturnType<typeof createMockRgs>;

async function post(p: string, body: unknown) {
  const r = await fetch(base + p, { method: 'POST', body: JSON.stringify(body) });
  return { status: r.status, json: (await r.json()) as any };
}
async function get(p: string) {
  const r = await fetch(base + p);
  return { status: r.status, json: (await r.json()) as any };
}
const reset = () => post('/__reset', {});
const log = async () => (await get('/__log')).json as { method: string; path: string; status: number; code?: string }[];

// Books with one fixed payout each so the tests can force a loss or a win by weight.
function writeLibrary(files: { base: string[]; weights: Record<string, number> }) {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mockrgs-'));
  const books = files.base.map(fixture);
  fs.writeFileSync(path.join(dir, 'books_base.jsonl'), books.map((b) => JSON.stringify(b)).join('\n') + '\n');
  fs.writeFileSync(
    path.join(dir, 'lookUpTable_base_0.csv'),
    books.map((b) => `${b.id},${files.weights[b.id] ?? 1},${b.payoutMultiplier}`).join('\n') + '\n',
  );
  fs.writeFileSync(
    path.join(dir, 'index.json'),
    JSON.stringify({ modes: [{ name: 'base', cost: 1.0, events: 'books_base.jsonl', weights: 'lookUpTable_base_0.csv' }] }),
  );
}

async function start(weights: Record<string, number>, extra: Partial<Parameters<typeof createMockRgs>[0]> = {}) {
  writeLibrary({ base: ['base_loss.json', 'base_tumble_win.json'], weights });
  rgs = createMockRgs({ library: await loadLibrary(dir), gameId: 'g', version: '1', ...extra });
  await new Promise<void>((res) => rgs.server.listen(0, res));
  base = `http://127.0.0.1:${(rgs.server.address() as AddressInfo).port}`;
  stop = () => rgs.server.close();
}

describe('mock RGS: loss-only library', () => {
  beforeAll(() => start({ '1': 1, '3': 0 }));
  afterAll(() => stop());

  it('rejects wallet calls before authenticate with ERR_IS', async () => {
    const r = await post('/wallet/play', { sessionID: 'x', amount: 1_000_000, mode: 'base' });
    expect(r.status).toBe(400);
    expect(r.json.error).toBe('ERR_IS');
  });

  it('authenticate returns balance, bet config and jurisdiction flags', async () => {
    const r = await post('/wallet/authenticate', { sessionID: 's1' });
    expect(r.status).toBe(200);
    expect(r.json.balance).toEqual({ amount: 100_000_000, currency: 'USD' });
    expect(r.json.config.betLevels.length).toBeGreaterThan(0);
    expect(r.json.config.jurisdiction.socialCasino).toBe(false);
    expect(r.json.round).toBeUndefined();
  });

  it('accepts the mode name in any case (Web SDK sends BASE)', async () => {
    await post('/wallet/authenticate', { sessionID: 'case' });
    expect((await post('/wallet/play', { sessionID: 'case', amount: 1_000_000, mode: 'BASE' })).status).toBe(200);
  });

  it('validates bet size, step and mode (ERR_VAL) without touching the balance', async () => {
    await post('/wallet/authenticate', { sessionID: 's2' });
    for (const amount of [50_000, 1_005_000, 2_000_000_000, 1.5, '1000000']) {
      const r = await post('/wallet/play', { sessionID: 's2', amount, mode: 'base' });
      expect(r.json.error).toBe('ERR_VAL');
    }
    expect((await post('/wallet/play', { sessionID: 's2', amount: 1_000_000, mode: 'nope' })).json.error).toBe('ERR_VAL');
    expect((await post('/wallet/balance', { sessionID: 's2' })).json.balance.amount).toBe(100_000_000);
  });

  it('a zero-win round debits the bet, is already settled and needs no end-round', async () => {
    await post('/wallet/authenticate', { sessionID: 's3' });
    const play = await post('/wallet/play', { sessionID: 's3', amount: 1_000_000, mode: 'base' });
    expect(play.status).toBe(200);
    expect(play.json.round.payoutMultiplier).toBe(0);
    expect(play.json.round.active).toBe(false);
    expect(play.json.balance.amount).toBe(99_000_000);
    expect(play.json.round.state.map((e: any) => e.type)).toEqual(['reveal', 'setTotalWin', 'finalWin']);
    // a second bet is allowed straight away, and an end-round for a settled round is refused
    expect((await post('/wallet/end-round', { sessionID: 's3' })).json.error).toBe('ERR_VAL');
    expect((await post('/wallet/play', { sessionID: 's3', amount: 1_000_000, mode: 'base' })).status).toBe(200);
  });

  it('refuses a bet the balance cannot cover (ERR_IPB) and leaves the balance alone', async () => {
    await reset();
    await post('/wallet/authenticate', { sessionID: 's4' });
    for (let i = 0; i < 100; i++) await post('/wallet/play', { sessionID: 's4', amount: 1_000_000, mode: 'base' });
    expect((await post('/wallet/balance', { sessionID: 's4' })).json.balance.amount).toBe(0);
    const r = await post('/wallet/play', { sessionID: 's4', amount: 1_000_000, mode: 'base' });
    expect(r.json.error).toBe('ERR_IPB');
    expect((await post('/wallet/balance', { sessionID: 's4' })).json.balance.amount).toBe(0);
  });

  it('answers browser preflight and sends CORS headers (the game runs on another origin)', async () => {
    const pre = await fetch(base + '/wallet/play', { method: 'OPTIONS' });
    expect(pre.status).toBe(204);
    expect(pre.headers.get('access-control-allow-origin')).toBe('*');
    expect(pre.headers.get('access-control-allow-methods')).toContain('POST');
    expect(pre.headers.get('access-control-allow-headers')).toContain('content-type');
    const r = await fetch(base + '/wallet/balance', { method: 'POST', body: JSON.stringify({ sessionID: 'none' }) });
    expect(r.headers.get('access-control-allow-origin')).toBe('*');
  });

  it('records every request so a client test can assert what was (not) sent', async () => {
    await reset();
    await post('/wallet/authenticate', { sessionID: 's5' });
    await post('/wallet/play', { sessionID: 's5', amount: 1_000_000, mode: 'base' });
    const l = await log();
    expect(l.map((e) => e.path)).toEqual(['/wallet/authenticate', '/wallet/play']);
    expect(l.some((e) => e.path === '/wallet/end-round')).toBe(false);
  });
});

describe('mock RGS: win-only library', () => {
  beforeAll(() => start({ '1': 0, '3': 1 }, { socialCasino: true }));
  afterAll(() => stop());

  it('pays only at end-round; the round stays active and a /bet/event marker survives re-authenticate', async () => {
    await post('/wallet/authenticate', { sessionID: 'w1' });
    const play = await post('/wallet/play', { sessionID: 'w1', amount: 1_000_000, mode: 'base' });
    expect(play.json.round.payoutMultiplier).toBe(1.6);
    expect(play.json.round.payout).toBe(1_600_000);
    expect(play.json.round.active).toBe(true);
    expect(play.json.balance.amount).toBe(99_000_000);
    expect((await post('/wallet/play', { sessionID: 'w1', amount: 1_000_000, mode: 'base' })).json.error).toBe('ERR_VAL');

    expect((await post('/bet/event', { sessionID: 'w1', event: '4' })).json.event).toBe('4');
    const again = await post('/wallet/authenticate', { sessionID: 'w1' });
    expect(again.json.round.active).toBe(true);
    expect(again.json.round.event).toBe('4');
    expect(again.json.round.amount).toBe(1_000_000); // bet amount restored from authenticate
    expect(again.json.config.jurisdiction.socialCasino).toBe(true);

    const end = await post('/wallet/end-round', { sessionID: 'w1' });
    expect(end.json.balance.amount).toBe(100_600_000);
  });

  it('serves replay without a session: payout, cost, state; 400 for unknown ids and wrong game/version', async () => {
    const fx = fixture('base_tumble_win.json');
    const r = await get('/bet/replay/g/1/base/3');
    expect(r.status).toBe(200);
    expect(r.json).toEqual({ payoutMultiplier: 1.6, costMultiplier: 1.0, state: fx.events });
    expect((await get('/bet/replay/g/1/base/999')).status).toBe(400);
    expect((await get('/bet/replay/other/1/base/3')).status).toBe(400);
    expect((await get('/bet/replay/g/2/base/3')).status).toBe(400);
    expect((await get('/bet/replay/g/1/bonus/3')).status).toBe(400);
    // mode names match case-insensitively (the Web SDK sends BASE, the books say base)
    expect((await get('/bet/replay/g/1/BASE/3')).status).toBe(200);
    const l = await log();
    expect(l.filter((e) => e.path.startsWith('/bet/replay')).every((e) => e.method === 'GET')).toBe(true);
  });
});

describe.skipIf(!fs.existsSync(PILOT))('mock RGS with the real pilot publication files (zstd)', () => {
  it('loads both modes, checks lookup vs book payouts, serves a bonus-buy round at 200x cost', async () => {
    const library = await loadLibrary(PILOT, { maxBooks: 500 });
    expect([...library.modes.keys()]).toEqual(['base', 'bonus']);
    expect(library.modes.get('bonus')!.cost).toBe(200);
    const r = createMockRgs({ library, gameId: 'g', version: '1', seed: 7 });
    await new Promise<void>((res) => r.server.listen(0, res));
    const url = `http://127.0.0.1:${(r.server.address() as AddressInfo).port}`;
    const j = async (p: string, b: unknown) => (await fetch(url + p, { method: 'POST', body: JSON.stringify(b) })).json() as Promise<any>;
    await j('/wallet/authenticate', { sessionID: 'p' });
    const play = await j('/wallet/play', { sessionID: 'p', amount: 100_000, mode: 'bonus' });
    expect(play.balance.amount).toBe(100_000_000 - 20_000_000);
    expect(play.round.state[0].type).toBe('reveal');
    expect(play.round.state.at(-1).type).toBe('finalWin');
    r.server.close();
  });
});
