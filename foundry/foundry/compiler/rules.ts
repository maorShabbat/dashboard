// Generates the player-facing rules strings (keyed, English) and their social (Stake.US) variant from the config.
// Every string has a key; nothing is hard-coded in generated code (spec/PRODUCT.md). Disclaimer text is Engine's template, verbatim.
import { spinTable } from './config';
import { allFeatures, featureRule, hasTumbles } from './features';
import type { GameConfig, Mode } from './config';
import { scanRestricted, toSocial } from './social';

export const DISCLAIMER =
  'Malfunction voids all wins and plays. A consistent internet connection is required. In the event of a disconnection, reload the game to finish any uncompleted rounds. The expected return is calculated over many plays. The game display is not representative of any physical device and is for illustrative purposes only. Winnings are settled according to the amount received from the Remote Game Server';

const pct = (x: number) => `${(x * 100).toFixed(2)}%`;
const x = (n: number) => `${n}x`;

function triggerCounts(mode: Mode): string {
  const d = mode.distributions.find((q) => q.criteria === 'freegame');
  const k = d?.conditions.scatterTriggers ? Object.keys(d.conditions.scatterTriggers) : [];
  return k.length < 2 ? (k[0] ?? '') : `${k.slice(0, -1).join(', ')} or ${k[k.length - 1]}`; // "4 or 5", "4, 5 or 6"
}

/** How many times more often the free spins start than in the base game (the ratio of the free-spin hit rates the optimiser targets). */
export function anteFactor(c: GameConfig, m: Mode): number {
  const hr = (mode: Mode) => { const h = c.optimization[mode.name]?.conditions.freegame?.hr; return typeof h === 'number' ? h : NaN; };
  const f = hr(c.modes[0]) / hr(m);
  return Number.isFinite(f) ? Math.round(f * 10) / 10 : 2;
}

/** How wins are found, in words, for the game type. */
function payText(c: GameConfig): string {
  const t = c.paytable.tiers; const min = t[0][0]; const size = `${c.board.reels}x${c.board.rows}`;
  if (c.gameType === 'cluster') return `Symbols pay in clusters on the ${size} board. A win needs at least ${min} matching symbols touching each other up, down, left or right. ${c.symbols.wild} (Wild) joins every cluster it touches.`;
  if (c.gameType === 'paylines') return `Wins pay on ${(c.paylines ?? []).length} paylines on the ${size} board. A win needs at least ${min} matching symbols in a row from the leftmost reel along a payline. Line wins are added together.`;
  if (c.gameType === 'ways') return `Symbols pay in ways on the ${size} board${c.reelHeights ? `, where every reel shows ${c.reelHeights.min} to ${c.reelHeights.max} symbols on each spin` : ''}. A win needs at least ${min} adjacent reels from the left that each show the symbol; the pay is multiplied by the number of ways, the product of the matching symbols on each reel.`;
  return `Symbols pay anywhere on the ${size} board. A win needs at least ${min} matching symbols; no paylines.`;
}

/** A mode with forced win-cap rounds reaches its maximum win; without them (a game with no free spins) the cap is a limit, not a promise. */
const reachesCap = (m: Mode) => m.distributions.some((d) => d.criteria === 'wincap');
const maxWinText = (m: Mode) => (reachesCap(m) ? `maximum win ${x(m.maxWin)}` : `wins are capped at ${x(m.maxWin)}`);

export function modeText(c: GameConfig, m: Mode): { name: string; description: string } {
  const s = c.symbols.scatter;
  if (m.isAnte) {
    const a = m.ante ?? { freeSpins: true, wilds: 1, symbols: 1 };
    const does = [a.freeSpins !== false ? `Free spins start about ${anteFactor(c, m)} times as often.` : '', a.wilds > 1 ? 'More wilds land.' : '', a.symbols > 1 ? 'The best symbols land more often.' : ''].filter(Boolean).join(' ');
    return { name: 'Ante bet', description: `Costs ${x(m.cost)} the bet for every spin.${does ? ` ${does}` : ''} Switch it off to play at the normal bet. RTP ${pct(m.rtp)}, ${maxWinText(m)}.` };
  }
  if (m.isBuyBonus) {
    const cond = m.distributions.find((d) => d.criteria === 'freegame')?.conditions;
    const perks = [
      cond?.startMult && cond.startMult > 1 ? ` The feature starts with the multiplier at ${cond.startMult}.` : '',
      cond?.extraSpins ? ` ${cond.extraSpins} extra free spins are added.` : '',
    ].join('');
    return {
      name: m.displayName ?? `Bonus buy`,
      description: `Costs ${x(m.cost)} the bet. Buy the free spins feature directly: it starts at once with ${triggerCounts(m)} ${s} symbols already awarded.${perks} RTP ${pct(m.rtp)}, ${maxWinText(m)}.`,
    };
  }
  return {
    name: 'Base game',
    description: `Standard play at ${x(m.cost)} the bet. RTP ${pct(m.rtp)}, ${maxWinText(m)}.`,
  };
}

/** Display names of the places features can work in, for the rules text. */
const bonusNames = (c: GameConfig): Record<string, string> => Object.fromEntries(c.modes.filter((m) => m.isBuyBonus || m.isAnte).map((m) => [m.name, m.isAnte ? 'the ante bet' : (m.displayName ?? m.name)]));

export function buildStrings(c: GameConfig): Record<string, string | number> {
  const t = c.paytable.tiers;
  const tierLabel = (i: number) => (t[i][0] === t[i][1] ? `${t[i][0]}` : `${t[i][0]}-${t[i][1]}`);
  const sp = c.scatterRule.spinsPerScatter;
  const base = c.freeSpinTriggers.base;
  const free = c.freeSpinTriggers.free;
  const minBase = Math.min(...Object.keys(base).map(Number));
  const minFree = Math.min(...Object.keys(free).map(Number));
  const fs = c.freeSpins !== false;
  const out: Record<string, string | number> = {
    'meta.id': c.id,
    'meta.version': c.version,
    'meta.name': c.name,
    'meta.provider': c.provider ?? 'Foundry',
    'rules.rtp': c.modes.map((m) => `${modeText(c, m).name}: RTP ${pct(m.rtp)}`).join('. ') + '.',
    'rules.rtpValue': Number((c.modes[0].rtp * 100).toFixed(2)),
    'rules.maxWin': c.modes.map((m) => `${modeText(c, m).name}: ${maxWinText(m)} the bet`).join('. ') + '.',
    'rules.maxWinValue': Math.max(...c.modes.map((m) => m.maxWin)),
    'rules.payAnywhere': payText(c),
    'rules.paytableHeader': `Pays for ${t.map((_, i) => tierLabel(i)).join(' / ')} matching symbols, as a multiple of the bet:`,
    ...Object.fromEntries(c.symbols.paying.map((p) => [`rules.pay.${p}`, `${p}: ${c.paytable.pays[p].map((v, i) => `${tierLabel(i)} = ${x(v)}`).join(', ')}`])),
    'rules.wild': `${c.symbols.wild} (Wild) substitutes for every paying symbol.${fs ? ` It does not substitute for ${c.symbols.scatter} or ${c.symbols.multiplier}.` : ''}`,
    'rules.tumble': hasTumbles(c.gameType, c.tumble) ? 'After a win, winning symbols are removed and new symbols drop in. Tumbles continue until no win remains. All wins from the tumbles are added together.' : 'Symbols stay on the board after a win. Each spin is evaluated once.',
    // T1: the award is scatters x spinsPerScatter (game_executables.update_freespin_amount); the base table only sets the trigger threshold.
    // a game without free spins has no scatter, free spins or retrigger rule: the keys stay (the frontend reads them) but are empty and not shown
    'rules.scatter': !fs ? '' : `${minBase} or more ${c.symbols.scatter} (Scatter) symbols anywhere trigger the free spins feature. ${c.scatterRule.custom ? `Free spins awarded: ${Object.entries(spinTable(c)).slice(0, 8).map(([k, v]) => `${k} = ${v}`).join(', ')}.` : `Each ${c.symbols.scatter} awards ${sp} free spins.`}${Object.keys(c.scatterRule.pays ?? {}).length ? ` ${c.symbols.scatter} symbols also pay a cash win on top, as a multiple of the bet: ${Object.entries(c.scatterRule.pays!).map(([k, v]) => `${k} = ${x(v)}`).join(', ')}.` : ''}`,
    'rules.freeSpins': !fs ? '' : `During free spins, ${hasTumbles(c.gameType, c.tumble) ? 'every tumble raises the multiplier by 1. The multiplier stays for the whole feature. ' : ''}Each ${c.symbols.multiplier} (Multiplier) symbol adds its value to the final multiplier of the spin.`,
    'rules.retrigger': !fs ? '' : `${minFree} or more ${c.symbols.scatter} during free spins award more free spins: ${Object.entries(free).map(([k, v]) => `${k} = +${v}`).join(', ')}. The feature can be retriggered; the total win is limited by the maximum win.`,
    ...Object.fromEntries(allFeatures(c).map((f) => [`rules.feature.${f.id}`, featureRule(f, c.symbols.wild, bonusNames(c))])),
    'rules.maxWinStop': 'When the maximum win is reached the round ends immediately and the win is paid.',
    'rules.heading.modes': 'Modes',
    'rules.heading.return': 'Return and maximum win',
    'rules.heading.pays': 'Pays',
    'rules.heading.features': 'Features',
    'rules.heading.guide': 'How to use the game',
    'rules.heading.disclaimer': 'Disclaimer',
    'rules.disclaimer': DISCLAIMER,
    'ui.guide': 'Bet: change the bet size. Spin: place the bet and start a round (space bar). Turbo: faster animations. Autoplay: needs confirmation before it starts. Sound: switch sound off or on. Info: rules and paytable.',
  };
  for (const m of c.modes) {
    const mt = modeText(c, m);
    // Bonus-buy screen texts (the Web SDK's bet-mode cards); the social variant rewords "buy".
    const shown = m.isBuyBonus || !!m.isAnte;
    out[`ui.mode.${m.name}.button`] = m.isAnte ? 'ACTIVATE' : m.isBuyBonus ? 'BUY' : '';
    out[`ui.mode.${m.name}.tickerIdle`] = m.isAnte ? 'ANTE BET IS ACTIVE' : m.isBuyBonus ? 'PLACE YOUR BET' : '';
    out[`ui.mode.${m.name}.tickerSpin`] = m.isAnte ? 'GOOD LUCK' : m.isBuyBonus ? 'BONUS BUY ACTIVATED' : '';
    void shown;
    out[`rules.mode.${m.name}.name`] = mt.name;
    out[`rules.mode.${m.name}.description`] = mt.description;
    out[`rules.mode.${m.name}.cost`] = m.cost;
    out[`rules.mode.${m.name}.rtp`] = Number((m.rtp * 100).toFixed(2));
    out[`rules.mode.${m.name}.maxWin`] = m.maxWin;
    if (!reachesCap(m)) out[`rules.mode.${m.name}.maxWinIsCap`] = 1; // the rules state a cap, not a win the books contain
  }
  return out;
}

const socialModeName = (m: Mode) => (m.isAnte ? 'Boost' : m.isBuyBonus ? 'Bonus' : 'Base game');

/** Sentences where a word-for-word replacement reads badly get hand-written social wording (still scanned afterwards). */
function socialOverrides(c: GameConfig): Record<string, string> {
  const o: Record<string, string> = {
    'rules.maxWinStop': 'When the maximum win is reached the round ends immediately and the win is awarded.',
    'ui.guide': 'Play amount: change the amount for each round. Spin: start a round (space bar). Turbo: faster animations. Autoplay: needs confirmation before it starts. Sound: switch sound off or on. Info: rules and paytable.',
  };
  o['rules.maxWin'] = c.modes.map((m) => `${socialModeName(m)}: maximum win ${x(m.maxWin)} the play amount`).join('. ') + '.';
  const t = c.paytable.tiers;
  o['rules.paytableHeader'] = `Wins for ${t.map((r) => (r[0] === r[1] ? `${r[0]}` : `${r[0]}-${r[1]}`)).join(' / ')} matching symbols, as a multiple of the play amount:`;
  for (const m of c.modes) {
    const trig = triggerCounts(m);
    o[`rules.mode.${m.name}.description`] = m.isAnte
      ? `Costs ${x(m.cost)} the play amount for every round. Free spins start about ${anteFactor(c, m)} times as often. RTP ${pct(m.rtp)}, maximum win ${x(m.maxWin)}.`
      : m.isBuyBonus
      ? `Costs ${x(m.cost)} the play amount. Start the free spins feature directly with ${trig} ${c.symbols.scatter} symbols already awarded. RTP ${pct(m.rtp)}, maximum win ${x(m.maxWin)}.`
      : `Standard play at ${x(m.cost)} the play amount. RTP ${pct(m.rtp)}, maximum win ${x(m.maxWin)}.`;
    o[`rules.mode.${m.name}.name`] = m.isAnte ? 'Boost' : m.isBuyBonus ? (m.displayName ?? 'Bonus') : 'Base game';
  }
  return o;
}

/** Social variant: restricted-term replacements on every text string, with hand-written overrides for awkward sentences. */
export function buildSocialStrings(strings: Record<string, string | number>, c?: GameConfig): Record<string, string | number> {
  const over = c ? socialOverrides(c) : {};
  return Object.fromEntries(
    Object.entries(strings).map(([k, v]) => [k, k in over ? over[k] : typeof v === 'string' && k !== 'meta.id' ? toSocial(v) : v]),
  );
}

export function restrictedHits(strings: Record<string, string | number>): { key: string; terms: string[] }[] {
  return Object.entries(strings)
    .filter(([k, v]) => typeof v === 'string' && k !== 'meta.id')
    .map(([k, v]) => ({ key: k, terms: scanRestricted(v as string) }))
    .filter((h) => h.terms.length > 0);
}

/** One readable page for reviewers and the AI assistant (English). */
export function renderRulesMarkdown(c: GameConfig, s: Record<string, string | number>): string {
  const keys = Object.keys(s).filter((k) => typeof s[k] === 'string');
  const get = (k: string) => String(s[k]);
  const modes = c.modes.map((m) => `- **${get(`rules.mode.${m.name}.name`)}**: ${get(`rules.mode.${m.name}.description`)}`).join('\n');
  const pays = c.symbols.paying.map((p) => `- ${get(`rules.pay.${p}`)}`).join('\n');
  return `# ${c.name}: game rules (generated, English)

${get('rules.payAnywhere')}

## Modes
${modes}

## Return and maximum win
${get('rules.rtp')}
${get('rules.maxWin')}

## Pays
${get('rules.paytableHeader')}
${pays}

## Features
${['rules.wild', 'rules.tumble', 'rules.scatter', 'rules.freeSpins', 'rules.retrigger'].map(get).filter(Boolean).map((t) => `- ${t}\n`).join('')}${allFeatures(c).map((f) => `- ${get(`rules.feature.${f.id}`)}\n`).join('')}- ${get('rules.maxWinStop')}

## How to use the game
${get('ui.guide')}

## Disclaimer
${get('rules.disclaimer')}

<!-- ${keys.length} keyed strings in strings/en.json; social variant in strings/sweeps_en.json -->
`;
}
