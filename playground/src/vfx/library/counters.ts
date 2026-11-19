import type { Preset } from '../model/preset';
import { C, F, S, T, counterIn, makeGradient, mo, motion, preset, scene, shine, ts } from './kit';
import { look, vert } from './plates';

const CAT = 'counters' as const;

export function counters(): Preset[] {
  const label = (text = 'TOTAL WIN', y = 0.32) => T('label', text, { role: 'subtitle', name: 'Label', size: 0.06, y, style: ts('clean-white'), motion: motion({ entrance: mo.in('fade-in', { duration: 0.4 }) }) });
  const mk = (slug: string, name: string, description: string, c: ReturnType<typeof C>, extra: ReturnType<typeof F>[] = [], withLabel = true): Preset =>
    preset(CAT, slug, name, description, scene([...(withLabel ? [label()] : []), c], extra), { tags: ['amount', 'counter'], inputs: [counterIn('amount', 'Amount')] });
  return [
    mk('count-up', 'Count up', 'A classic win meter: the number climbs smoothly, each digit ticking, and lands with a pulse.',
      C('amount', { from: 0, to: 12500, size: 0.2, y: 0.52, style: ts('gold-chunky'), roll: 'pop', tickPop: 0.07, countStart: 0.4, countDuration: 1.8, ease: 'easeOut', landPulse: 0.14, motion: motion({ entrance: mo.in('pop', { duration: 0.45 }) }), shine: shine({ start: 2.4, duration: 0.8 }) })),
    mk('odometer', 'Odometer', 'Digits roll vertically like a mechanical odometer, higher places turning only when a lower one wraps.',
      C('amount', { from: 0, to: 98765, size: 0.2, y: 0.52, style: ts('chrome-impact'), roll: 'roll', countStart: 0.3, countDuration: 2.2, ease: 'easeInOut', landPulse: 0.1, motion: motion({ entrance: mo.in('fade-in') }) })),
    mk('slot-reels', 'Slot reels', 'Every digit is its own reel that spins and settles on its number, right-hand reels stopping last.',
      C('amount', { from: 0, to: 777777, size: 0.2, y: 0.52, style: ts('candy-bubble'), roll: 'slot', countStart: 0.2, countDuration: 2.4, ease: 'linear', landPulse: 0.16, motion: motion({ entrance: mo.in('pop') }) })),
    mk('pop-ticks', 'Pop ticks', 'The number counts in steps and every changing digit pops with a bounce.',
      C('amount', { from: 0, to: 1250, size: 0.22, y: 0.52, style: ts('comic-boom'), roll: 'pop', tickPop: 0.2, countStart: 0.4, countDuration: 1.5, ease: 'easeOut', landPulse: 0.2, motion: motion({ entrance: mo.in('slam') }) })),
    mk('flip-board', 'Flip board', 'Digits flap over like an airport board.',
      C('amount', { from: 100, to: 4375, size: 0.2, y: 0.52, style: ts('clean-white'), roll: 'flip', countStart: 0.3, countDuration: 2, ease: 'easeInOut', landPulse: 0.08, motion: motion({ entrance: mo.in('fade-in') }) }), [], false),
    mk('win-meter', 'Big win meter', 'The full treatment: currency, decimals, glow, light sweeps and a rolling landing pulse.',
      C('amount', { from: 0, to: 1250000.5, decimals: 2, prefix: '$', size: 0.17, y: 0.52, style: ts('gold-chunky', (s) => { s.glow = { ...s.glow, enabled: true, radius: 0.2, strength: 0.9 }; }), roll: 'roll', countStart: 0.5, countDuration: 2.6, ease: 'easeOut', landPulse: 0.16,
        motion: motion({ entrance: mo.in('zoom-in', { duration: 0.6 }), idle: mo.in('breathe', { start: 3.6 }) }), shine: shine({ start: 3.2, duration: 0.9, repeat: 1, interval: 0.8 }) }),
      [F('halo', 'light.halo', 0.4, { cy: 0.52, size: 0.55, duration: 4, intensity: 0.7 }), F('spark', 'light.sparkle', 3.1, { cy: 0.52, width: 1.1, height: 0.2, count: 18, duration: 1.8 })]),
    mk('burst-count', 'Burst count', 'Races up almost instantly and settles: for quick payouts.',
      C('amount', { from: 0, to: 777, size: 0.24, y: 0.52, style: ts('fire-brand'), roll: 'none', countStart: 0.2, countDuration: 0.9, ease: 'burst', landPulse: 0.25, motion: motion({ entrance: mo.in('pop') }) })),
    mk('slow-build', 'Slow build', 'A long, accelerating count with a heartbeat that quickens the tension, ending in a glow burst.',
      C('amount', { from: 0, to: 50000, prefix: '€', size: 0.18, y: 0.52, style: ts('neon-sign'), roll: 'roll', countStart: 0.4, countDuration: 3.6, ease: 'easeIn', landPulse: 0.2, motion: motion({ entrance: mo.in('fade-in'), idle: mo.in('heartbeat', { start: 0.6, duration: 1 }), emphasis: [mo.in('glow-pulse', { start: 4.0 })] }) }),
      [F('flare', 'light.flare', 4.0, { cy: 0.52, size: 0.2 })]),
    mk('countdown', 'Countdown', 'Counts down to zero, flipping each number.',
      C('amount', { from: 10, to: 0, suffix: 's', size: 0.22, y: 0.52, style: ts('sci-fi-hologram'), roll: 'flip', countStart: 0.2, countDuration: 3, ease: 'linear', landPulse: 0.25, motion: motion({ entrance: mo.in('fade-in') }) }), [], false),
  ];
}

const GA = 'Classic amounts';
/** Plain, trustworthy amount counters: a steady roll up to the figure, a small landing, nothing frantic. */
export function classicCounters(): Preset[] {
  const out: Preset[] = [];
  const label = (text: string, y: number, style = 'clean-white', size = 0.05) => T('label', text, { role: 'subtitle', name: 'Label', size, y, style: ts(style), motion: motion({ entrance: mo.in('fade-in', { duration: 0.5 }) }) });
  const amt = (o: Partial<Parameters<typeof C>[1]> & { to: number }) => C('amount', {
    from: 0, decimals: 2, size: 0.18, y: 0.52, roll: 'roll', countStart: 0.5, countDuration: 2.2, ease: 'easeOut', landPulse: 0.08, tickPop: 0,
    motion: motion({ entrance: mo.in('fade-in', { duration: 0.5 }) }), shine: shine({ start: 3, duration: 0.9, repeat: 1, interval: 1, width: 0.18, intensity: 0.8 }), ...o,
  });
  const add = (slug: string, name: string, description: string, els: ReturnType<typeof C>[] | ReturnType<typeof T>[] | unknown[], fx: ReturnType<typeof F>[] = [], tags: string[] = []): void => {
    out.push(preset(CAT, slug, name, description, scene(els as never, fx), { tags: ['amount', 'counter', 'classic', ...tags], inputs: [counterIn('amount', 'Amount')], group: GA }));
  };
  const glint = (cy = 0.52, w = 0.7) => F('spark', 'light.sparkle', 2.6, { cy, width: w, height: 0.14, count: 12, duration: 1.6 });

  add('amount-carved-gold', 'Carved gold amount', 'Heavy carved gold digits roll up to the figure and settle with a small swell and a passing glint, as on a win meter laid over the reels.',
    [amt({ to: 3600, size: 0.21, style: ts('carved-gold') })], [glint()], ['gold']);
  add('amount-carved-silver', 'Carved silver amount', 'The same carved digits in silver.', [amt({ to: 3600, size: 0.21, style: ts('carved-silver') })], [glint()], ['silver']);
  add('amount-carved-jade', 'Carved jade amount', 'The same carved digits in jade.', [amt({ to: 3600, size: 0.21, style: ts('carved-jade') })], [glint()], ['jade']);
  add('amount-ornate', 'Ornate amount with label', 'A small label above, ornate gold figures below, rolling up to a big payout.',
    [label('TOTAL WIN', 0.36, 'ornate-gold', 0.06), amt({ to: 66666, size: 0.16, y: 0.54, style: ts('ornate-digits') })], [glint(0.54, 0.9)], ['gold']);
  add('amount-euro', 'Euro amount', 'Euro formatting: the sign first, full stops between the thousands and a comma before the cents.',
    [amt({ to: 12500, size: 0.18, prefix: '€', group: '.', decimalMark: ',', style: ts('carved-gold') })], [glint()], ['euro']);
  add('amount-dollar', 'Dollar amount', 'Dollar formatting with a thousands comma, in two-tone gold.',
    [amt({ to: 8611, size: 0.2, prefix: '$', style: ts('gold-two-tone') })], [glint()], ['dollar']);
  add('amount-pound', 'Pound amount', 'Pound sterling in silver figures.', [amt({ to: 4250, size: 0.2, prefix: '£', style: ts('carved-silver') })], [glint()], ['pound']);
  add('amount-whole', 'Whole-number amount', 'No cents: a credit count rolling up in steady steps.', [amt({ to: 128500, decimals: 0, size: 0.18, style: ts('carved-gold') })], [glint()], ['credits']);
  add('amount-suffix', 'Amount with currency code', 'The figure rolls up and a currency code stays after it.', [amt({ to: 2750, size: 0.17, suffix: ' EUR', style: ts('ornate-digits') })], [glint()], ['code']);

  // on a plate: the amount sits in a dark recess like a slot machine's win window
  const frame = look(vert([[0, '#fff0a0'], [0.5, '#e8a21a'], [1, '#7a4306']]), [[0.03, '#3f1d03']], { slab: '#2a1204', depth: 0.04 });
  const recess = look(vert([[0, '#1a0a3a'], [1, '#080320']]), [[0.02, '#ffd24a'], [0.03, '#000000']], { bevel: false, shadow: false });
  add('amount-window', 'Win window', 'A gold-framed dark window with the word WIN above and carved gold figures rolling up inside it.',
    [S('frame', 'plate', frame, { name: 'Frame', y: 0.54, width: 0.95, height: 0.3, params: { radius: 0.3 }, motion: motion({ entrance: mo.in('pop', { duration: 0.5 }) }) }),
      S('inner', 'plate', recess, { name: 'Window', y: 0.54, width: 0.86, height: 0.22, params: { radius: 0.3 }, motion: motion({ entrance: mo.in('pop', { duration: 0.5 }) }) }),
      T('label', 'WIN', { role: 'subtitle', name: 'Label', y: 0.3, size: 0.07, style: ts('ornate-gold'), motion: motion({ entrance: mo.in('fade-in', { duration: 0.5 }) }) }),
      amt({ to: 3600, size: 0.14, y: 0.545, style: ts('carved-gold') })], [glint(0.545, 0.8)], ['plate']);
  const slabFace = look(makeGradient('linear', [[0, '#0b3a1c'], [0.5, '#0b3a1c'], [0.5, '#16602e'], [1, '#16602e']], { angle: 58, repeat: 14 }), [[0.016, '#8ae8a0'], [0.045, '#000000']], { bevel: false, slab: '#000000', depth: 0.05 });
  add('amount-slab', 'Striped slab amount', 'The amount on a dark green striped slab, in heavy white slanted figures: the plain win readout.',
    [S('slab', 'slab', slabFace, { name: 'Plate', y: 0.52, width: 0.9, height: 0.25, params: { chamfer: 0.2, slant: 0.2 }, motion: motion({ entrance: mo.in('slide-right', { duration: 0.5 }) }) }),
      amt({ to: 1250, size: 0.19, y: 0.525, style: ts('slab-white'), motion: motion({ entrance: mo.in('fade-in', { start: 0.2, duration: 0.4 }) }) })], [], ['slab']);
  add('amount-balance', 'Balance readout', 'A quiet readout for a balance or a bet: a small label and white figures that tick up by the amount just won.',
    [label('BALANCE', 0.42, 'clean-white', 0.045), amt({ from: 1000, to: 1360, size: 0.1, y: 0.52, style: ts('clean-white'), countStart: 0.3, countDuration: 1.2, landPulse: 0.05, shine: undefined })], [], ['hud']);
  add('amount-plus-win', 'Plus amount', 'A “+” amount that counts up and lifts away: the win being added to the balance.',
    [amt({ to: 360, prefix: '+', size: 0.16, style: ts('carved-gold'), countDuration: 1.4, motion: motion({ entrance: mo.in('slide-up', { duration: 0.5 }), exit: mo.in('drift-fade-out', { start: 3.6, duration: 0.5 }) }) })], [], ['hud']);
  return out;
}
