// Engine money: integers with six decimals (1,000,000 = 1.00). Source: docs/foundry/engine-docs/rgs.txt.
export const MONEY_UNIT = 1_000_000;

export interface BetConfig {
  minBet: number;
  maxBet: number;
  stepBet: number;
  defaultBetLevel: number;
  betLevels: number[];
}

export const DEFAULT_BET_CONFIG: BetConfig = {
  minBet: 100_000,
  maxBet: 1_000_000_000,
  stepBet: 10_000,
  defaultBetLevel: 1_000_000,
  betLevels: [100_000, 200_000, 400_000, 600_000, 1_000_000, 2_000_000, 10_000_000, 100_000_000, 1_000_000_000],
};

/** True when `amount` is a safe integer inside [minBet, maxBet] and divisible by stepBet. */
export function isValidBet(amount: unknown, cfg: BetConfig): amount is number {
  return (
    typeof amount === 'number' &&
    Number.isSafeInteger(amount) &&
    amount >= cfg.minBet &&
    amount <= cfg.maxBet &&
    amount % cfg.stepBet === 0
  );
}

/** Player debit = base bet x mode cost multiplier, kept an integer. */
export function debitFor(amount: number, cost: number): number {
  return Math.round(amount * cost);
}

/** Payout for a book: `payoutMultiplier` is in hundredths of the base bet (1150 = 11.5x). */
export function payoutFor(amount: number, payoutMultiplier: number): number {
  return Math.round((amount * payoutMultiplier) / 100);
}
