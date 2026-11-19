// In-browser stand-in for the Engine RGS, so a generated game can be played with no server (a demo, not a certified RGS).
// It answers the same requests as foundry/mock-rgs from a weighted sample of the game's verified rounds (see sample.ts).
import { DEFAULT_BET_CONFIG, debitFor, isValidBet, payoutFor, type BetConfig } from '../mock-rgs/money';

export interface DemoBook {
  /** payoutMultiplier in hundredths of the bet (1150 = 11.5x), as in the published books */
  p: number;
  e: unknown[];
}
export interface DemoMode {
  cost: number;
  /** representative rounds and the cumulative probability of drawing each one (last value is 1): a stratified, reweighted sample of the real distribution */
  ids: number[];
  cum: number[];
  books: Record<string, DemoBook>;
}

/** Draw one round id by probability (`u` in [0, 1)). */
export function pickId(mode: DemoMode, u: number): number {
  let lo = 0;
  let hi = mode.cum.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (mode.cum[mid] > u) hi = mid;
    else lo = mid + 1;
  }
  return mode.ids[lo];
}
export interface DemoData {
  game: string;
  version: string;
  currency: string;
  startBalance: number;
  bet?: BetConfig;
  modes: Record<string, DemoMode>;
}
interface Round {
  betID: number;
  amount: number;
  payout: number;
  payoutMultiplier: number;
  active: boolean;
  mode: string;
  event: string | null;
  state: unknown[];
}
export interface DemoState {
  balance: number;
  round: Round | null;
  nextBetID: number;
}

const ERR: Record<string, number> = { ERR_VAL: 400, ERR_IPB: 400, ERR_IS: 400, ERR_ATE: 400, ERR_GLE: 400, ERR_LOC: 400, ERR_GEN: 500, ERR_MAINTENANCE: 500 };

export const newState = (data: DemoData): DemoState => ({ balance: data.startBalance, round: null, nextBetID: 1 });

const findMode = (data: DemoData, name: unknown): [string, DemoMode] | undefined => {
  if (typeof name !== 'string') return undefined;
  return Object.entries(data.modes).find(([k]) => k.toLowerCase() === name.toLowerCase());
};

export interface Reply {
  status: number;
  json: unknown;
}

/** `rand` returns a float in [0, 1). `social` toggles the jurisdiction flag the game reads from authenticate. */
export function handleDemo(
  data: DemoData,
  sessions: Map<string, DemoState>,
  method: string,
  path: string,
  body: Record<string, unknown>,
  rand: () => number,
  social = false,
): Reply {
  const cfg = data.bet ?? DEFAULT_BET_CONFIG;
  const fail = (code: string): Reply => ({ status: ERR[code], json: { error: code, message: code } });
  const ok = (json: unknown): Reply => ({ status: 200, json });
  const bal = (s: DemoState) => ({ amount: s.balance, currency: data.currency });

  const rp = /^\/bet\/replay\/([^/]+)\/([^/]+)\/([^/]+)\/([^/]+)$/.exec(path);
  if (method === 'GET' && rp) {
    const [, g, v, m, ev] = rp;
    const mode = findMode(data, m);
    const book = mode?.[1].books[ev];
    if (g !== data.game || v !== data.version || !mode || !book) return fail('ERR_VAL');
    return ok({ payoutMultiplier: book.p / 100, costMultiplier: mode[1].cost, state: book.e });
  }
  if (method !== 'POST') return fail('ERR_VAL');

  const sessionID = typeof body.sessionID === 'string' ? body.sessionID : '';
  if (path === '/wallet/authenticate') {
    if (!sessionID) return fail('ERR_ATE');
    let s = sessions.get(sessionID);
    if (!s) sessions.set(sessionID, (s = newState(data)));
    return ok({
      balance: bal(s),
      config: { ...cfg, jurisdiction: { socialCasino: social, disabledFullscreen: false, disabledTurbo: false } },
      round: s.round ? { ...s.round } : undefined,
    });
  }
  const s = sessions.get(sessionID);
  if (!s) return fail('ERR_IS');
  if (path === '/wallet/balance') return ok({ balance: bal(s) });

  if (path === '/wallet/play') {
    const mode = findMode(data, body.mode);
    if (!mode || !isValidBet(body.amount, cfg)) return fail('ERR_VAL');
    if (s.round?.active) return fail('ERR_VAL');
    const amount = body.amount;
    const debit = debitFor(amount, mode[1].cost);
    if (debit > s.balance) return fail('ERR_IPB');
    s.balance -= debit;
    const id = pickId(mode[1], rand());
    const book = mode[1].books[String(id)];
    const payout = payoutFor(amount, book.p);
    s.round = { betID: s.nextBetID++, amount, payout, payoutMultiplier: book.p / 100, active: payout > 0, mode: mode[0], event: null, state: book.e };
    return ok({ balance: bal(s), round: { ...s.round } });
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
    return ok({ balance: bal(s) });
  }
  return fail('ERR_VAL');
}
