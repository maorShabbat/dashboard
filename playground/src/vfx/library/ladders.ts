/** Win ladders: the message escalates from tier to tier (BIG WIN → HUGE WIN → EPIC WIN, …) with a counter that keeps speeding up, and every tier hits harder than the last. */
import type { Preset } from '../model/preset';
import type { ShapeId } from '../model/scene';
import type { ShapeStyle } from '../style/textStyle';
import { C, F, S, T, counterIn, mo, motion, plate, preset, scene, shine, textIn, ts } from './kit';

const CAT = 'messages' as const;
const GROUP = 'Win ladders: the message switches tier';

interface Tier { word: string; style: string; size: number; shape: ShapeId; plate: ShapeStyle; w: number; h: number; ray: string; enter: string }

const green = plate(['#3ed84a', '#0d7a2a'], '#f4ffd0', { glow: '#7dff6a', thick: 0.04 });
const blue = plate(['#3d7bff', '#12307a'], '#d8ecff', { glow: '#6aa8ff', thick: 0.04 });
const gold = plate(['#8a1736', '#3d0618'], '#ffd24a', { glow: '#ff3a5a', thick: 0.045 });
const violet = plate(['#8a3dff', '#3b1296'], '#ffe27a', { glow: '#b36bff', thick: 0.04 });
const fire = plate(['#e8261a', '#5a0a06'], '#ffd24a', { glow: '#ff7a1a', thick: 0.045 });

const BIG: Tier = { word: 'BIG WIN', style: 'candy-green', size: 0.2, shape: 'banner', plate: green, w: 1.1, h: 0.4, ray: '#9dff7a', enter: 'pop' };
const MEGA: Tier = { word: 'MEGA WIN', style: 'sapphire', size: 0.18, shape: 'banner', plate: blue, w: 1.2, h: 0.46, ray: '#8ac2ff', enter: 'slam' };
const HUGE: Tier = { word: 'HUGE WIN', style: 'gold-two-tone', size: 0.2, shape: 'burst', plate: gold, w: 1.15, h: 1.0, ray: '#ffe08a', enter: 'slam' };
const SUPER: Tier = { word: 'SUPER WIN', style: 'royal-purple', size: 0.17, shape: 'burst', plate: violet, w: 1.2, h: 1.05, ray: '#d9a8ff', enter: 'zoom-in' };
const EPIC: Tier = { word: 'EPIC WIN', style: 'magma', size: 0.2, shape: 'burst', plate: fire, w: 1.3, h: 1.15, ray: '#ff9a3a', enter: 'elastic' };
const INSANE: Tier = { word: 'LEGENDARY', style: 'fire-brand', size: 0.15, shape: 'burst', plate: fire, w: 1.35, h: 1.2, ray: '#ffb23a', enter: 'elastic' };

function ladder(slug: string, name: string, description: string, tiers: Tier[], total: number, o: { tierLen?: number; tail?: number; coins?: boolean } = {}): Preset {
  const L = o.tierLen ?? 1.7, tail = o.tail ?? 2.8, T0 = 0.3, N = tiers.length;
  const at = (i: number) => T0 + i * L;
  const end = at(N - 1) + tail;
  const els: ReturnType<typeof S>[] | unknown[] = [];
  tiers.forEach((t, i) => {
    const last = i === N - 1, len = last ? tail : L, outAt = len - 0.3;
    const exit = (id: string) => (last ? mo.in('zoom-out', { start: outAt - 0.15, duration: 0.45 }) : mo.in(id, { start: outAt, duration: 0.3 }));
    (els as unknown[]).push(S(`plate${i}`, t.shape, t.plate, { name: `Tier ${i + 1} plate`, y: 0.42, width: t.w, height: t.h, start: at(i), ...(last ? {} : { end: at(i + 1) + 0.15 }), motion: motion({ entrance: mo.in(i === 0 ? 'elastic' : 'pop', { duration: 0.6 }), idle: mo.in('breathe', { start: 0.8, duration: 2.5 }), exit: exit('zoom-out') }) }));
    (els as unknown[]).push(T(`title${i}`, t.word, { name: `Tier ${i + 1} title`, y: 0.41, size: t.size, style: ts(t.style), start: at(i) + 0.1, ...(last ? {} : { end: at(i + 1) + 0.15 }), motion: motion({ entrance: mo.in(t.enter, { duration: 0.55 }), idle: mo.in('breathe', { start: 0.9 }), exit: exit('fade-out') }), shine: shine({ start: 0.7, duration: 0.8, repeat: 1, interval: 1, width: 0.2, intensity: 0.8 }) }));
  });
  (els as unknown[]).push(C('amount', { name: 'Amount', y: 0.74, size: 0.12, from: 0, to: total, decimals: 2, prefix: '$', style: ts('gold-chunky'), roll: 'roll', ease: 'easeIn', countStart: 0.2, countDuration: end - T0 - 0.8, landPulse: 0.16, start: T0, motion: motion({ entrance: mo.in('pop', { duration: 0.4 }), exit: mo.in('zoom-out', { start: end - T0 - 0.55, duration: 0.45 }) }) }));
  const fx: ReturnType<typeof F>[] = [];
  tiers.forEach((t, i) => {
    const s = at(i), k = i / Math.max(1, N - 1), len = i === N - 1 ? tail : L;
    fx.push(F(`rays${i}`, 'light.rays', s, { duration: len + 0.3, tint: t.ray, length: 1.1 + 0.4 * k, intensity: 0.5 + 0.35 * k }));
    fx.push(F(`flash${i}`, 'flash', s + 0.05, { cy: 0.42, size: 0.2 + 0.1 * k }));
    fx.push(F(`shake${i}`, 'shake', s + 0.1, { amplitude: 0.005 + 0.008 * k, duration: 0.35 + 0.2 * k }));
    fx.push(F(`shock${i}`, 'shockwave', s + 0.08, { cy: 0.42, strength: 0.35 + 0.35 * k, distortion: 0.5 + 0.3 * k, radius: 0.8 + 0.4 * k, duration: 1 }));
    fx.push(F(`burst${i}`, 'emit.burst', s + 0.1, { cx: 0.5, cy: 0.42, shape: i === N - 1 ? 'gem' : 'coin', count: 36 + Math.round(40 * k), speed: 1 + 0.4 * k, gravity: 1.1, pieceSize: 0.042, glow: 0.35, duration: 2.6, life: 2.2 }));
  });
  fx.push(F('sparkle', 'light.sparkle', at(1) , { cy: 0.42, width: 1.2, height: 0.4, count: 30, duration: end - at(1) - 0.5, tint: '#fff4c4' }));
  if (o.coins !== false) {
    const fs = at(N - 1) + 0.2, d = Math.max(3.2, tail + 0.4);
    fx.push(F('fountainL', 'emit.fountain', fs, { cx: 0.14, cy: 0.9, shape: 'coin', count: 55, spread: 34, speed: 1.35, ending: 'collect', meterX: 0.5, meterY: 0.76, collectAt: 0.5, duration: d, life: 3 }));
    fx.push(F('fountainR', 'emit.fountain', fs + 0.1, { cx: 0.86, cy: 0.9, shape: 'coin', count: 55, spread: 34, speed: 1.35, ending: 'collect', meterX: 0.5, meterY: 0.76, collectAt: 0.5, duration: d, life: 3, seed: 9 }));
  }
  const inputs = [...tiers.map((t, i) => textIn(`title${i}`, `Tier ${i + 1}: ${t.word}`)), counterIn('amount', 'Amount')];
  return preset(CAT, slug, name, description, scene(els as never, fx), { tags: ['message', 'celebration', 'ladder', 'tiers'], inputs, group: GROUP });
}

export function ladders(): Preset[] {
  return [
    ladder('ladder-big-huge-epic', 'Big → Huge → Epic', 'The message switches twice: BIG WIN, then HUGE WIN, then EPIC WIN. Each tier slams in harder with bigger rays, a stronger shockwave and more coins, while the amount counts up faster and faster.', [BIG, HUGE, EPIC], 125000),
    ladder('ladder-big-mega-super-epic', 'Big → Mega → Super → Epic', 'Four tiers, from green BIG WIN through blue MEGA, purple SUPER and a fiery EPIC WIN, with two coin fountains flying into the counter at the end.', [BIG, MEGA, SUPER, EPIC], 480000, { tierLen: 1.5 }),
    ladder('ladder-big-epic', 'Big → Epic (quick)', 'A short two-step ladder: BIG WIN is knocked aside by EPIC WIN.', [BIG, EPIC], 60000, { tierLen: 1.4, tail: 2.4 }),
    ladder('ladder-five-tiers', 'Five-tier ladder', 'The full climb: BIG, MEGA, HUGE, EPIC and LEGENDARY, each with its own colour, plate and level of fireworks.', [BIG, MEGA, HUGE, EPIC, INSANE], 1250000, { tierLen: 1.35, tail: 3 }),
    ladder('ladder-no-coins', 'Big → Huge → Epic, no coins', 'The three-tier ladder with light and shockwaves only (no coin fountains), for games without a coin theme.', [BIG, HUGE, EPIC], 125000, { coins: false }),
  ];
}
