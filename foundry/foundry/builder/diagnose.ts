// Plain-language diagnosis of an RTP that is far from the target: what is too high, what to change, and how it changes the player's experience.
import type { GameConfig } from '../compiler/config';
import type { Summary } from './sim';
import { frequency, symbolLook } from './model';

export interface Finding { id: string; severity: 'high' | 'medium'; title: string; detail: string; fix: string }
export interface Diagnosis { rtp: number; target: number; ratio: number; findings: Finding[]; experience: string[]; verdict: string; canFixAutomatically: boolean }

const pct = (x: number, d = 1) => `${(x * 100).toFixed(d)}%`;
const big = (x: number) => (x >= 10 ? `${Math.round(x * 100).toLocaleString('en-US')}%` : pct(x));
const oneIn = (p: number) => `1 in ${p >= 0.01 ? (1 / p).toFixed(p >= 0.1 ? 1 : 0) : Math.round(1 / p).toLocaleString('en-US')}`;

export function diagnose(cfg: GameConfig, s: Summary | undefined): Diagnosis {
  const target = cfg.modes[0].rtp; const maxWin = cfg.modes[0].maxWin;
  const rtp = s?.rtp ?? NaN; const ratio = s ? rtp / target : NaN;
  const findings: Finding[] = [];
  const total = Object.values(cfg.reels.sets[Object.keys(cfg.reels.sets)[0]] ?? {}).reduce((a, b) => a + b, 0) || 1;
  const wShare = (id: string) => (frequency(cfg, id) / total) * 100;
  const name = (id: string) => symbolLook(cfg, id).name;
  const over = !!s && rtp > target * 1.05; const under = !!s && rtp < target * 0.95;

  // pays above the max win: impossible prizes
  for (const p of cfg.symbols.paying) {
    const row = cfg.paytable.pays[p] ?? []; const top = Math.max(0, ...row);
    if (top > maxWin) findings.push({ id: `pay-${p}`, severity: 'high', title: `${name(p)} pays more than the max win`, detail: `${name(p)} has a pay of ${top.toLocaleString('en-US')}x, but a round can never pay more than ${maxWin.toLocaleString('en-US')}x. The extra is wasted and makes every number look wrong.`, fix: `Lower ${name(p)}'s highest pay to ${maxWin.toLocaleString('en-US')}x or less (usually far less: top pays of 50x to 500x are typical).` });
  }
  if (s) {
    // symbols that carry the RTP alone
    const ranked = cfg.symbols.paying.map((p) => ({ p, b: s.bySymbol[p] })).filter((x) => x.b).sort((a, b) => b.b.rtpShare - a.b.rtpShare);
    for (const { p, b } of ranked) {
      if (over && (b.rtpShare > target || b.rtpShare > 0.5 * rtp) && b.rtpShare > 0.2) {
        const row = cfg.paytable.pays[p] ?? []; const top = Math.max(0, ...row);
        findings.push({ id: `share-${p}`, severity: 'high', title: `${name(p)} returns ${big(b.rtpShare)} of the bet on its own`, detail: `${name(p)} wins ${oneIn(b.hitRate)} spins and carries ${pct(b.rtpShare / Math.max(rtp, 1e-9), 0)} of the whole RTP. A single symbol should return roughly 5% to 25%. Its pays go up to ${top.toLocaleString('en-US')}x and it is ${wShare(p).toFixed(1)}% of the reel symbols.`, fix: `Lower ${name(p)}'s pays${wShare(p) > 12 ? ' and its weight' : ''}. Aim for it to return about ${pct(target / Math.max(cfg.symbols.paying.length, 1), 0)} of the bet.` });
        break;
      }
    }
    // scatter and bonus frequency
    const sc = cfg.symbols.scatter; const scW = wShare(sc);
    if (scW > 2.5 || s.triggerOneIn < 40) findings.push({ id: 'scatter', severity: s.triggerOneIn < 15 ? 'high' : 'medium', title: `Scatters are too common (${scW.toFixed(1)}% of the symbols)`, detail: `Free spins start ${Number.isFinite(s.triggerOneIn) ? oneIn(1 / s.triggerOneIn) : 'rarely'} spins. A healthy bonus triggers about 1 in 100 to 1 in 300. With this many scatters on the reels, free spins also retrigger almost every spin and the bonus never ends.`, fix: `Lower the scatter weight to about 1% to 2%.` });
    const wl = cfg.symbols.wild; if (wShare(wl) > 4) findings.push({ id: 'wild', severity: 'medium', title: `Wilds are too common (${wShare(wl).toFixed(1)}% of the symbols)`, detail: `Wilds stand in for every paying symbol, so this many of them turns almost every board into a win.`, fix: `Lower the wild weight to about 1% to 4%.` });
    if (Number.isFinite(s.wincapOneIn) && s.wincapOneIn < 300) findings.push({ id: 'wincap', severity: 'high', title: `The max win is reached ${oneIn(1 / s.wincapOneIn)} spins`, detail: `Rounds hit the ${maxWin.toLocaleString('en-US')}x cap constantly. The cap is a rare event (one in tens of thousands). When it is common, no amount of balancing can tune the RTP, because the cap hides every other number.`, fix: `Lower the pays or the multipliers until the cap is a rare event.` });
    if (s.hitRate > 0.6) findings.push({ id: 'hit', severity: 'medium', title: `Almost every spin wins (${pct(s.hitRate, 0)})`, detail: `Healthy slots win roughly 20% to 45% of spins. At this level the game has no tension.`, fix: `Lower symbol weights for the common low symbols, the wild weight, or the minimum group size.` });
    if (s.truncated) findings.push({ id: 'slow', severity: 'medium', title: 'This design is very slow to simulate', detail: 'Rounds contain extremely long free-spin chains, so the simulation stopped early and the numbers shown are from fewer spins.', fix: 'Fix the scatter weight and the pays first; the numbers settle once rounds are normal.' });
  }
  if (!findings.length && s && (over || under)) findings.push({ id: 'general', severity: 'medium', title: over ? 'The RTP is above the target' : 'The RTP is below the target', detail: `No single setting stands out. The paytable and the symbol weights together return ${big(rtp)} against the ${pct(target)} target.`, fix: 'Use one of the balancing options below; each shows its price before you apply it.' });

  const experience: string[] = [];
  if (s) {
    experience.push(`Right now players win on ${pct(s.hitRate, 0)} of spins (${oneIn(s.hitRate)}), the volatility index is ${s.volatility.toFixed(1)} (${s.volClass}), and the bonus triggers ${Number.isFinite(s.triggerOneIn) ? oneIn(1 / s.triggerOneIn) : 'rarely'}.`);
    if (over && ratio > 3) experience.push(`A game this far above the target would pay out much more than it takes in. It cannot be published, and every statistic on this page is dominated by the cap, so it does not describe how the real game would feel.`);
    experience.push('Lowering pays shrinks prizes (more wins fall under the bet, the balance drains slower but jackpots are smaller). Lowering weights makes those symbols rarer (fewer wins, more tension). Lowering scatters makes the bonus rarer but more special.');
  }
  const bad = findings.some((f) => f.severity === 'high');
  const verdict = !s ? 'Waiting for the simulation...' : !over && !under ? `The RTP (${big(rtp)}) is on the ${pct(target)} target. Nothing needs balancing.` : bad && ratio > 3
    ? `The game returns ${big(rtp)} against a ${pct(target)} target (${ratio.toFixed(0)} times too much). Scaling the paytable alone can technically bring this down, but only by shrinking every prize to almost nothing. Fix the problems below first, then balance the last few points.`
    : `The game returns ${big(rtp)} against a ${pct(target)} target. Pick one of the balancing options below; each shows what it costs.`;
  return { rtp, target, ratio, findings, experience, verdict, canFixAutomatically: !(bad && ratio > 3) };
}
