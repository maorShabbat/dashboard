/** Pure logic of amount counters: formatting, easing, and what each digit slot shows at a time. */
import { easeInCubic, easeInOutCubic, easeInOutSine, easeOutBack, easeOutCubic, easeOutExpo, clamp01, smooth } from '../anim/easing';
import type { CounterElement } from '../model/scene';

export function formatNumber(v: number, decimals: number, group: string, mark: string): string {
  const neg = v < 0 && Math.round(Math.abs(v) * 10 ** decimals) > 0;
  const n = Math.round(Math.abs(v) * 10 ** decimals);
  const s = String(n).padStart(decimals + 1, '0');
  let int = s.slice(0, s.length - decimals);
  const frac = decimals > 0 ? s.slice(s.length - decimals) : '';
  if (group) int = int.replace(/\B(?=(\d{3})+(?!\d))/g, group);
  return (neg ? '-' : '') + int + (decimals > 0 ? mark + frac : '');
}

export function easeValue(ease: CounterElement['ease'], u: number): number {
  switch (ease) {
    case 'linear': return clamp01(u);
    case 'easeIn': return easeInCubic(u);
    case 'easeInOut': return easeInOutCubic(u);
    case 'burst': return easeOutExpo(u);
    default: return easeOutCubic(u);
  }
}

export type SlotPart = 'prefix' | 'num' | 'suffix';
export interface Slot { ch: string; digit: boolean; exp: number; part: SlotPart; sign?: boolean }

/** Slots of the widest string the counter will show; digits never move once placed. */
export function buildTemplate(el: Pick<CounterElement, 'from' | 'to' | 'decimals' | 'group' | 'decimalMark' | 'prefix' | 'suffix'>): Slot[] {
  const maxAbs = Math.max(Math.abs(el.from), Math.abs(el.to));
  const intDigits = String(Math.floor(Math.round(maxAbs * 10 ** el.decimals) / 10 ** el.decimals)).length;
  const widest = Number('9'.repeat(Math.max(1, intDigits)) + (el.decimals > 0 ? '.' + '9'.repeat(el.decimals) : ''));
  const str = formatNumber(widest, el.decimals, el.group, el.decimalMark).replace(/9/g, '8');
  const slots: Slot[] = [];
  for (const ch of [...el.prefix]) slots.push({ ch, digit: false, exp: 0, part: 'prefix' });
  if (el.from < 0 || el.to < 0) slots.push({ ch: '-', digit: false, exp: 0, part: 'num', sign: true });
  const digitsTotal = [...str].filter((c) => c >= '0' && c <= '9').length;
  let seen = 0;
  for (const ch of [...str]) {
    const isDigit = ch >= '0' && ch <= '9';
    if (isDigit) { seen++; slots.push({ ch, digit: true, exp: digitsTotal - seen - el.decimals, part: 'num' }); } else slots.push({ ch, digit: false, exp: 0, part: 'num' });
  }
  for (const ch of [...el.suffix]) slots.push({ ch, digit: false, exp: 0, part: 'suffix' });
  return slots;
}

export function counterValue(el: Pick<CounterElement, 'from' | 'to' | 'countStart' | 'countDuration' | 'ease'>, tl: number): { v: number; u: number } {
  const u = clamp01((tl - el.countStart) / Math.max(0.01, el.countDuration));
  return { v: el.from + (el.to - el.from) * easeValue(el.ease, u), u };
}

export interface SlotState {
  /** Character drawn now, and (while rolling) the one arriving. */
  ch: string | null;
  next: string | null;
  /** Roll amount 0..1. */
  r: number;
  alphaNow: number;
  alphaNext: number;
  /** Extra scale from a tick pop. */
  pop: number;
}

const HIDDEN: SlotState = { ch: null, next: null, r: 0, alphaNow: 0, alphaNext: 0, pop: 1 };

/** What every slot shows at counter time `tl`. */
export function slotStates(el: CounterElement, tl: number, slots: Slot[]): SlotState[] {
  const { v, u } = counterValue(el, tl);
  const settled = u >= 1;
  const val = settled ? el.to : v;
  const absV = Math.abs(val);
  const nf = settled ? Math.round(absV * 10 ** el.decimals) : absV * 10 ** el.decimals;
  const lowest = -el.decimals;
  const digitSlots = slots.map((s, i) => ({ s, i })).filter((x) => x.s.digit);
  const out: SlotState[] = slots.map(() => HIDDEN);
  const visibleDigit = new Map<number, boolean>();
  const rollMode = el.roll;
  const activity = 1 - smooth(0.9, 1, u);
  digitSlots.forEach(({ s, i }, di) => {
    const x = nf / 10 ** (s.exp + el.decimals);
    let pos = x;
    let fr = x - Math.floor(x);
    if (rollMode === 'slot' && !settled) {
      const rankLeft = di;
      const uk = clamp01((tl - el.countStart - rankLeft * 0.07) / Math.max(0.05, el.countDuration * 0.85));
      const target = Math.floor(settled ? x : (Math.round(absV * 10 ** el.decimals) / 10 ** (s.exp + el.decimals)));
      const travel = 18 + 9 * (digitSlots.length - 1 - di);
      pos = target - (1 - easeOutBack(uk, 0.8)) * travel;
      fr = pos - Math.floor(pos);
    }
    const base = ((Math.floor(pos) % 10) + 10) % 10;
    const leading = s.exp > 0 && Math.floor(x) < 1 && !(rollMode === 'slot' && !settled);
    let r = 0;
    if (rollMode === 'roll' || rollMode === 'flip') r = settled ? 0 : s.exp === lowest ? easeInOutSine(fr) : smooth(0.8, 1, fr);
    else if (rollMode === 'slot') r = settled ? 0 : fr;
    const nextDigit = String((base + 1) % 10);
    const nextVisible = !leading || r > 0;
    const curVisible = !leading;
    let pop = 1;
    if (rollMode === 'pop' && !settled && el.tickPop > 0) pop = 1 + el.tickPop * (1 - fr) ** 3 * activity;
    if (!curVisible && !(nextVisible && r > 0.001)) { out[i] = HIDDEN; visibleDigit.set(i, false); return; }
    visibleDigit.set(i, true);
    out[i] = { ch: curVisible ? String(base) : null, next: r > 0.001 ? nextDigit : null, r, alphaNow: curVisible ? 1 - r : 0, alphaNext: r, pop };
    if (!curVisible) out[i]!.alphaNext = r;
  });
  // separators and fixed text
  slots.forEach((s, i) => {
    if (s.digit) return;
    if (s.part !== 'num') { out[i] = { ch: s.ch, next: null, r: 0, alphaNow: 1, alphaNext: 0, pop: 1 }; return; }
    if (s.sign) { out[i] = val < 0 ? { ch: '-', next: null, r: 0, alphaNow: 1, alphaNext: 0, pop: 1 } : HIDDEN; return; }
    // a separator shows when the next digit to its left is showing something
    let left = -1;
    for (let j = i - 1; j >= 0; j--) if (slots[j]!.digit) { left = j; break; }
    const isMark = s.ch === el.decimalMark && el.decimals > 0 && slots.slice(i + 1).some((q) => q.digit && q.exp < 0);
    const shows = isMark || left < 0 || out[left]!.ch !== null || out[left]!.next !== null;
    out[i] = shows ? { ch: s.ch, next: null, r: 0, alphaNow: left >= 0 && !isMark ? Math.max(out[left]!.alphaNow, out[left]!.alphaNext) : 1, alphaNext: 0, pop: 1 } : HIDDEN;
  });
  return out;
}

/** Scale pulse after landing on the target. */
export function landScale(el: Pick<CounterElement, 'landPulse' | 'countStart' | 'countDuration'>, tl: number): number {
  if (el.landPulse <= 0) return 1;
  const t = tl - (el.countStart + el.countDuration);
  if (t < 0 || t > 0.45) return 1;
  const k = t / 0.45;
  return 1 + el.landPulse * Math.sin(Math.PI * k) * (1 - k * 0.5);
}
