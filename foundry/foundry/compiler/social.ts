// Stake.US restricted terms and replacements. Source: docs/foundry/engine-docs/approval-guidelines__jurisdiction-requirements.txt
// (fetched 2026-10-06). Longest phrases first so "total bet" wins over "bet".
export const RESTRICTED: [string, string][] = [
  ['be awarded to player’s accounts', 'appear in player’s accounts'],
  ['place your bets', 'come and play'],
  ['win feature', 'play feature'],
  ['paid out', 'won'],
  ['pays out', 'won'],
  ['pay out', 'win'],
  ['buy bonus', 'get bonus'],
  ['bonus buy', 'bonus'],
  ['at the cost of', 'for'],
  ['cost of', 'can be played for'],
  ['total bet', 'total play'],
  ['bought', 'instantly triggered'],
  ['purchase', 'play'],
  ['currency', 'token'],
  ['withdraw', 'redeem'],
  ['deposit', 'get coins'],
  ['betting', 'playing'],
  ['gamble', 'play'],
  ['credit', 'balance'],
  ['wager', 'play'],
  ['rebet', 'respin'],
  ['stake', 'play amount'],
  ['payer', 'winner'],
  ['money', 'coins'],
  ['bets', 'plays'],
  ['paid', 'won'],
  ['pays', 'wins'],
  ['cash', 'coins'],
  ['fund', 'balance'],
  ['buy', 'play'],
  ['bet', 'play'],
  ['pay', 'win'],
];

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const re = (term: string) => new RegExp(`(?<![A-Za-z])${esc(term)}(?![A-Za-z])`, 'gi');

/** Terms from the restricted table that appear in `text` (whole words / phrases, case-insensitive). */
export function scanRestricted(text: string): string[] {
  const hits = new Set<string>();
  for (const [term] of RESTRICTED) if (re(term).test(text)) hits.add(term);
  return [...hits];
}

function matchCase(from: string, to: string): string {
  if (from === from.toUpperCase() && from.length > 1) return to.toUpperCase();
  if (from[0] === from[0].toUpperCase()) return to[0].toUpperCase() + to.slice(1);
  return to;
}

/** Replace every restricted term (phrases first). Whole-word matching, case preserved on the first letter. */
export function toSocial(text: string): string {
  let out = text;
  for (const [term, rep] of RESTRICTED) out = out.replace(re(term), (m) => matchCase(m, rep));
  return out;
}
