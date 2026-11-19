/** Coins, gems and other pieces that fountain, burst, rain and float, with real bouncing and a balance meter; also the same made from your own picture. */
import type { Preset } from '../model/preset';
import { C, F, I, T, counterIn, imageIn, mo, motion, preset, scene, ts } from './kit';

const CAT = 'messages' as const;
const G1 = 'Coin and gem fountains', G2 = 'Particles from your own picture';

/** A small balance readout in the corner that counts up while the pieces arrive. */
const balance = (from: number, to: number, start: number, dur: number) => [
  T('label', 'BALANCE', { name: 'Balance label', y: 0.035, x: 0.9, size: 0.035, style: ts('clean-white'), motion: motion({ entrance: mo.in('fade-in', { start: 0.1, duration: 0.4 }) }) }),
  C('balance', { name: 'Balance', y: 0.095, x: 0.9, size: 0.06, from, to, decimals: 2, style: ts('gold-chunky'), roll: 'roll', countStart: start, countDuration: dur, landPulse: 0.12, motion: motion({ entrance: mo.in('fade-in', { start: 0.1, duration: 0.4 }) }) }),
];

export function fountains(): Preset[] {
  const out: Preset[] = [];
  const add = (slug: string, name: string, description: string, elements: ReturnType<typeof T>[] | ReturnType<typeof C>[] | unknown[], fx: ReturnType<typeof F>[], group: string, inputs = [] as ReturnType<typeof imageIn>[], tags: string[] = []) =>
    out.push(preset(CAT, slug, name, description, scene(elements as never, fx), { tags: ['message', 'celebration', 'particles', ...tags], inputs, group }));

  add('coin-fountain', 'Coin fountain', 'Gold coins shoot up from the bottom, tumble, bounce on the floor and fly into the balance meter, which counts up as they land.', balance(1000, 2250, 3.0, 1.7),
    [F('fountain', 'emit.fountain', 0.3, { shape: 'coin' }), F('flash', 'flash', 0.3, { cx: 0.5, cy: 0.85, size: 0.12, tint: '#ffe9a0' })], G1, [counterIn('balance', 'Balance')]);
  add('gem-fountain', 'Gem fountain', 'Faceted gems of every colour shoot up, glitter as they turn, bounce and fly into the meter.', balance(500, 1750, 3.0, 1.7),
    [F('fountain', 'emit.fountain', 0.3, { shape: 'gem', count: 60, pieceSize: 0.048, glow: 0.45 })], G1, [counterIn('balance', 'Balance')]);
  add('ruby-fountain', 'Ruby fountain', 'The same fountain with rubies only.', balance(0, 800, 3.0, 1.7),
    [F('fountain', 'emit.fountain', 0.3, { shape: 'gem', palette: 'ruby', count: 50, pieceSize: 0.05, glow: 0.6 })], G1, [counterIn('balance', 'Balance')]);
  add('coin-jackpot-pour', 'Jackpot coin pour', 'A heavy pour of coins from the top of the screen that pile onto a floor and are scooped up into the meter.', balance(10000, 25000, 3.4, 2),
    [F('pour', 'emit.rain', 0.2, { shape: 'coin', count: 150, pieceSize: 0.045, speed: 0.9, gravity: 1.3, floor: 0.95, bounce: 0.35, drag: 0.05, ending: 'collect', collectAt: 0.62, glow: 0.3, life: 8, duration: 5.4 }), F('flare', 'light.flare', 0.2, { cy: 0.1, size: 0.3 })], G1, [counterIn('balance', 'Balance')]);
  add('coin-rain', 'Coin rain', 'Coins drift down across the whole screen, turning in the light.', [],
    [F('rain', 'emit.rain', 0.2, { shape: 'coin', count: 90, pieceSize: 0.04, speed: 0.55, gravity: 0.35, glow: 0.35, duration: 5.2, life: 5 })], G1);
  add('coin-burst', 'Coin burst', 'A flash and a burst of coins that fly outward, then fall away.', [],
    [F('burst', 'emit.burst', 0.3, { shape: 'coin', count: 70, pieceSize: 0.046, speed: 1.1, gravity: 1.1, glow: 0.35, duration: 2.8, life: 2.2 }), F('flash', 'flash', 0.3, { cy: 0.5, size: 0.2, tint: '#ffe9a0' })], G1);
  add('star-burst', 'Star burst', 'Golden stars explode outward and fade, with a flash.', [],
    [F('burst', 'emit.burst', 0.3, { shape: 'star', count: 50, speed: 0.95, gravity: 0.6, glow: 0.5, duration: 2.4 }), F('flash', 'flash', 0.3, { cy: 0.5, size: 0.18 })], G1);
  add('spark-fountain', 'Spark fountain', 'A fountain of glowing sparks, like a firework base.', [],
    [F('fountain', 'emit.fountain', 0.3, { shape: 'spark', count: 160, pieceSize: 0.012, speed: 1.2, gravity: 1.5, spread: 40, ending: 'fade', floor: 1.2, life: 1.6, duration: 3.4, glow: 0 })], G1);
  add('confetti-fountain', 'Confetti fountain', 'Coloured paper shoots up and flutters down.', [],
    [F('fountain', 'emit.fountain', 0.3, { shape: 'confetti', count: 140, pieceSize: 0.026, speed: 1.15, gravity: 0.9, drag: 0.7, spin: 9, floor: 1.2, ending: 'fade', life: 3, duration: 4.4, glow: 0 })], G1);
  add('petal-shower', 'Petal shower', 'Pink petals drift gently down.', [],
    [F('rain', 'emit.rain', 0.2, { shape: 'petal', count: 70, duration: 6, life: 5.5 })], G1);
  add('falling-leaves', 'Falling leaves', 'Green and golden leaves swing down the screen.', [],
    [F('rain', 'emit.rain', 0.2, { shape: 'leaf', count: 55, pieceSize: 0.05, speed: 0.3, gravity: 0.1, spin: 3, duration: 6.5, life: 6 })], G1);
  add('rising-bubbles', 'Rising bubbles', 'Soap bubbles float up from the bottom of the screen.', [],
    [F('rise', 'emit.rise', 0.2, { shape: 'bubble', cx: 0.5, cy: 1.0, areaWidth: 0.9, count: 36, duration: 5.4 })], G1);
  add('floating-sparks', 'Floating sparks', 'Glowing sparks rise and drift like embers over a campfire.', [],
    [F('rise', 'emit.rise', 0.2, { shape: 'spark', tint: '#ff9a3a', cx: 0.5, cy: 0.95, areaWidth: 0.7, count: 70, pieceSize: 0.01, speed: 0.22, duration: 5.2, glow: 0 })], G1);

  // the same engines made from a picture the player chooses
  const piece = (asset: string, size: number, x: number, y: number) => I('piece', asset, { name: 'Particle picture', size, x, y, motion: motion({ entrance: mo.in('pop', { duration: 0.4 }) }) });
  add('your-picture-fountain', 'Your picture: fountain', 'Upload a coin, gem, fruit or character (PNG or transparent WebM): it shoots up from where you place it, tumbles, bounces and flies into the meter.', [piece('builtin:coin', 0.1, 0.5, 0.82), ...balance(100, 650, 3.1, 1.6)],
    [F('fountain', 'emit.fountain', 0.6, { count: 60, glow: 0.3 }, { target: 'piece' })], G2, [imageIn('piece', 'Particle picture (PNG or WebM)'), counterIn('balance', 'Balance')], ['upload']);
  add('your-picture-burst', 'Your picture: burst', 'Your picture bursts outward in a ring of copies that tumble and fall.', [piece('builtin:star', 0.1, 0.5, 0.5)],
    [F('burst', 'emit.burst', 0.7, { count: 36, glow: 0.4, speed: 1, gravity: 1 }, { target: 'piece' }), F('flash', 'flash', 0.7, { cy: 0.5, size: 0.18 })], G2, [imageIn('piece', 'Particle picture (PNG or WebM)')], ['upload']);
  add('your-picture-rain', 'Your picture: rain', 'Copies of your picture drift down across the whole screen.', [piece('builtin:cherry', 0.1, 0.5, 0.15)],
    [F('rain', 'emit.rain', 0.5, { count: 50, speed: 0.45, gravity: 0.3, duration: 6, life: 5.5 }, { target: 'piece' })], G2, [imageIn('piece', 'Particle picture (PNG or WebM)')], ['upload']);
  add('your-picture-rise', 'Your picture: float up', 'Copies of your picture float up like balloons or bubbles.', [piece('builtin:heart', 0.08, 0.5, 0.95)],
    [F('rise', 'emit.rise', 0.5, { count: 34, areaWidth: 0.9, speed: 0.22, duration: 6, life: 4.4, glow: 0.2 }, { target: 'piece' })], G2, [imageIn('piece', 'Particle picture (PNG or WebM)')], ['upload']);
  return out;
}
