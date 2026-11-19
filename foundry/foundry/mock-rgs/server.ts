// Mock Engine RGS for development and tests. NOT a product component and not a substitute for Engine staging.
// Contract source: docs/foundry/engine-docs/{rgs,rgs__wallet,approval-guidelines__game-replay-requirements}.txt.
// The `round` object shape is a mock assumption (the docs show `{ ... }`); verify against staging before relying on it.
import http from 'node:http';
import { draw, makeRng, type Book, type Library } from './books';
import { DEFAULT_BET_CONFIG, debitFor, isValidBet, payoutFor, type BetConfig } from './money';

export interface MockRgsOptions {
  library: Library;
  gameId?: string;
  version?: string;
  currency?: string;
  startBalance?: number;
  betConfig?: BetConfig;
  socialCasino?: boolean;
  seed?: number;
}

interface Round {
  betID: number;
  amount: number; // base bet
  payout: number;
  payoutMultiplier: number;
  active: boolean;
  mode: string;
  event: string | null;
  state: Book['events'];
}
interface Session {
  balance: number;
  round: Round | null;
  nextBetID: number;
}
export interface LogEntry {
  method: string;
  path: string;
  body: unknown;
  status: number;
  code?: string;
}

const ERR_STATUS: Record<string, number> = {
  ERR_VAL: 400,
  ERR_IPB: 400,
  ERR_IS: 400,
  ERR_ATE: 400,
  ERR_GLE: 400,
  ERR_LOC: 400,
  ERR_GEN: 500,
  ERR_MAINTENANCE: 500,
};

export function createMockRgs(opts: MockRgsOptions) {
  const gameId = opts.gameId ?? 'mock-game';
  const version = opts.version ?? '1';
  const currency = opts.currency ?? 'USD';
  const cfg = opts.betConfig ?? DEFAULT_BET_CONFIG;
  const startBalance = opts.startBalance ?? 100_000_000;
  const rng = makeRng(opts.seed ?? 1);
  const sessions = new Map<string, Session>();
  // Mode names: the Web SDK sends "BASE", the Math SDK publishes "base", the docs show both ("BASE" in /wallet/play, "SUPER" in the replay URL).
  // Assumption to verify on Engine staging: the real RGS matches mode names case-insensitively. The mock does.
  const findMode = (name: unknown) => {
    if (typeof name !== 'string') return undefined;
    for (const [k, m] of opts.library.modes) if (k.toLowerCase() === name.toLowerCase()) return m;
    return undefined;
  };
  const log: LogEntry[] = [];

  const balanceOf = (s: Session) => ({ amount: s.balance, currency });
  const roundOf = (s: Session) => (s.round ? { ...s.round } : undefined);

  function handle(method: string, path: string, body: Record<string, unknown>): { status: number; json: unknown; code?: string } {
    const fail = (code: string) => ({ status: ERR_STATUS[code], json: { error: code, message: code }, code });
    const ok = (json: unknown) => ({ status: 200, json });

    if (method === 'GET' && path === '/__log') return ok(log);
    if (method === 'POST' && path === '/__reset') {
      sessions.clear();
      log.length = 0;
      return ok({});
    }

    // Replay: sessionless and unauthenticated by design.
    const rp = /^\/bet\/replay\/([^/]+)\/([^/]+)\/([^/]+)\/([^/]+)$/.exec(path);
    if (method === 'GET' && rp) {
      const [, g, v, modeName, ev] = rp;
      const mode = findMode(modeName);
      const book = mode?.books.get(Number(ev));
      if (g !== gameId || v !== version || !mode || !book) return fail('ERR_VAL');
      return ok({ payoutMultiplier: book.payoutMultiplier / 100, costMultiplier: mode.cost, state: book.events });
    }
    if (method !== 'POST') return fail('ERR_VAL');

    const sessionID = typeof body.sessionID === 'string' ? body.sessionID : '';
    if (path === '/wallet/authenticate') {
      if (!sessionID) return fail('ERR_ATE');
      let s = sessions.get(sessionID);
      if (!s) {
        s = { balance: startBalance, round: null, nextBetID: 1 };
        sessions.set(sessionID, s);
      }
      return ok({
        balance: balanceOf(s),
        config: { ...cfg, jurisdiction: { socialCasino: opts.socialCasino ?? false, disabledFullscreen: false, disabledTurbo: false } },
        round: roundOf(s),
      });
    }

    const s = sessions.get(sessionID);
    if (!s) return fail('ERR_IS'); // not authenticated

    if (path === '/wallet/balance') return ok({ balance: balanceOf(s) });

    if (path === '/wallet/play') {
      const mode = findMode(body.mode);
      if (!mode || !isValidBet(body.amount, cfg)) return fail('ERR_VAL');
      if (s.round?.active) return fail('ERR_VAL'); // finish the active round first
      const amount = body.amount;
      const debit = debitFor(amount, mode.cost);
      if (debit > s.balance) return fail('ERR_IPB');
      s.balance -= debit;
      const book = draw(mode, rng);
      const payout = payoutFor(amount, book.payoutMultiplier);
      const round: Round = {
        betID: s.nextBetID++,
        amount,
        payout,
        payoutMultiplier: book.payoutMultiplier / 100,
        active: payout > 0, // a zero-win round is already settled: no end-round is needed
        mode: mode.name,
        event: null,
        state: book.events,
      };
      s.round = round;
      return ok({ balance: balanceOf(s), round: { ...round } });
    }

    if (path === '/bet/event') {
      if (!s.round?.active || typeof body.event !== 'string') return fail('ERR_VAL');
      s.round.event = body.event;
      return ok({ event: body.event });
    }

    if (path === '/wallet/end-round') {
      if (!s.round?.active) return fail('ERR_VAL');
      s.balance += s.round.payout;
      s.round.active = false;
      return ok({ balance: balanceOf(s) });
    }
    return fail('ERR_VAL');
  }

  const CORS = {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-allow-headers': 'content-type, authorization',
  };
  const server = http.createServer((req, res) => {
    if (req.method === 'OPTIONS') {
      // Browser preflight for the game's cross-origin JSON POSTs.
      res.writeHead(204, CORS);
      res.end();
      return;
    }
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      const path = (req.url ?? '/').split('?')[0];
      let body: Record<string, unknown> = {};
      try {
        const text = Buffer.concat(chunks).toString('utf8');
        if (text) body = JSON.parse(text) as Record<string, unknown>;
      } catch {
        // fall through with an empty body: handler answers ERR_VAL
      }
      const r = handle(req.method ?? 'GET', path, body);
      if (!path.startsWith('/__')) log.push({ method: req.method ?? 'GET', path, body, status: r.status, code: r.code });
      res.writeHead(r.status, { 'content-type': 'application/json', ...CORS });
      res.end(JSON.stringify(r.json));
    });
  });
  return { server, log, sessions };
}
