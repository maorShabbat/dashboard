/** Animations for the special symbols (wilds, scatters, bonus tiles): the symbols move, and they are dressed in flames, rays, sparkles and more. */
import type { Preset } from '../model/preset';
import type { Params } from '../model/scene';
import { F } from './kit';
import { reelPreset, type ReelOpts } from './reels';

type Over = Record<string, number | string | boolean>;
type Role = 'wild' | 'scatter' | 'bonus';
const o: ReelOpts = { cat: 'symbol-transformation', group: 'Special symbol animations', board: { y: 0.56 } };
const SETUP: Record<Role, Params> = {
  wild: { pattern: 'sticky-wilds', specials: 3, line: 'row-mid' },
  scatter: { pattern: 'scatter-trigger', specials: 3, anticipation: false },
  bonus: { pattern: 'bonus-tiles', specials: 4 },
};
const SPIN: Params = { spin: 'classic', startAt: 0.3, spinTime: 1.0, stagger: 0.2, brake: 0.45 };
const WORD: Record<Role, string> = { wild: 'wild', scatter: 'scatter', bonus: 'bonus tile' };

function sym(slug: string, name: string, description: string, role: Role, layers: [string, Over][], tags: string[] = []): Preset {
  return reelPreset(slug, name, description, { ...SPIN, ...SETUP[role] }, {
    ...o, tags: ['special-symbol', role, ...tags],
    fx: (id, end) => [F('land', 'board.landing', 0, { duration: end, which: 'specials' }, { target: id }), ...layers.map(([e, p], i) => F(`sym${i}`, e, 0, { duration: end, who: role, ...p }, { target: id }))],
  });
}
const motion = (slug: string, name: string, role: Role, kind: string, text: string, over: Over = {}): Preset =>
  sym(`sym-${slug}`, name, `${text} Plays on every ${WORD[role]} once it has landed.`, role, [['symbol.motion', { motion: kind, length: 3.4, repeat: 3, ...over }]], ['motion']);
const auraP = (slug: string, name: string, role: Role, kind: string, text: string, over: Over = {}): Preset =>
  sym(`sym-${slug}`, name, `${text} Starts on every ${WORD[role]} as it lands.`, role, [['symbol.aura', { aura: kind, length: 3.6, ...over }]], ['aura']);

export function symbolAnimations(): Preset[] {
  return [
    motion('wild-pulse', 'Wild: pulse', 'wild', 'pulse', 'The wilds swell and glow in a steady pulse.'),
    motion('scatter-heartbeat', 'Scatter: heartbeat', 'scatter', 'heartbeat', 'The scatters beat like a heart, double-thump and rest.', { repeat: 2 }),
    motion('bonus-float', 'Bonus tile: hover', 'bonus', 'float', 'The bonus tiles hover up and down as if weightless.', { repeat: 2 }),
    motion('wild-jelly', 'Wild: jelly wobble', 'wild', 'jelly', 'The wilds wobble like jelly, squashing and stretching.', { repeat: 2 }),
    motion('scatter-sway', 'Scatter: sway', 'scatter', 'wobble', 'The scatters sway slowly from side to side.'),
    motion('bonus-flip', 'Bonus tile: coin flip', 'bonus', 'spin', 'The bonus tiles spin like coins, turning edge-on and back.', { repeat: 3 }),
    motion('scatter-tada', 'Scatter: ta-da', 'scatter', 'tada', 'Each scatter bursts up with a wiggle on landing, then settles.', { length: 1.6, repeat: 1 }),
    motion('wild-bounce', 'Wild: bounce', 'wild', 'bounce', 'The wilds hop in place, squashing as they land.', { repeat: 4 }),
    motion('bonus-swing', 'Bonus tile: pendulum', 'bonus', 'swing', 'The bonus tiles swing like pendulums.'),
    motion('wild-shake', 'Wild: shake', 'wild', 'shake', 'The wilds shake with energy.', { length: 1.6 }),
    motion('scatter-punch', 'Scatter: punch in', 'scatter', 'punch', 'Each scatter lands with a hard punch of size and light.', { length: 1.2, repeat: 1 }),
    motion('wild-flicker', 'Wild: neon flicker', 'wild', 'flicker', 'The wilds flicker like a neon sign.', { length: 3 }),
    motion('bonus-breathe', 'Bonus tile: breathe', 'bonus', 'breathe', 'The bonus tiles slowly swell and fill with light.', { repeat: 2 }),

    auraP('wild-flames', 'Wild: wreath of flames', 'wild', 'flames', 'A wreath of real flames licks round the wilds.'),
    auraP('scatter-lightning', 'Scatter: crawling electricity', 'scatter', 'lightning', 'Arcs of electricity crawl round the scatters.', { tint: '#8fd8ff' }),
    auraP('scatter-halo', 'Scatter: turning rays', 'scatter', 'halo', 'Golden rays turn behind each scatter.'),
    auraP('bonus-orbit', 'Bonus tile: orbiting sparkles', 'bonus', 'orbit', 'Sparkles circle each bonus tile.', { tint: '#c89aff', tint2: '#ffe08a' }),
    auraP('wild-rings', 'Wild: pulsing rings', 'wild', 'rings', 'Rings of light pulse out from the wilds.', { tint: '#6aff9a', tint2: '#d8ffe8' }),
    auraP('bonus-shine', 'Bonus tile: sweeping shine', 'bonus', 'shine', 'A band of light sweeps across each bonus tile, again and again.'),
    auraP('wild-smoke', 'Wild: rising smoke', 'wild', 'smoke', 'Smoke rises off the wilds.'),
    auraP('scatter-frost', 'Scatter: frost', 'scatter', 'frost', 'Ice crystals grow round the scatters and glint.', { tint: '#9ad8ff' }),
    auraP('bonus-plasma', 'Bonus tile: swirling plasma', 'bonus', 'plasma', 'Violet and pink plasma swirls round each bonus tile.', { tint: '#8a5aff', tint2: '#ff4ad8' }),
    auraP('scatter-runes', 'Scatter: rune circle', 'scatter', 'runes', 'A circle of runes turns round each scatter.', { tint: '#7affd8', tint2: '#ffe08a' }),
    auraP('wild-embers', 'Wild: rising embers', 'wild', 'embers', 'Glowing embers rise off the wilds.', { tint: '#ff7a2a', tint2: '#ffd24a' }),
    auraP('bonus-sparkle', 'Bonus tile: twinkling glints', 'bonus', 'sparkle', 'Glints twinkle across the bonus tiles.'),

    sym('sym-burning-wild', 'Burning wild', 'Wreath of flames, rising embers and a steady pulse: the wild is on fire.', 'wild', [['symbol.aura', { aura: 'flames', length: 3.6 }], ['symbol.aura', { aura: 'embers', length: 3.6, tint: '#ff7a2a' }], ['symbol.motion', { motion: 'pulse', length: 3.6, repeat: 4 }]], ['fire']),
    sym('sym-storm-scatter', 'Storm scatter', 'Electricity crawls round each scatter and shakes it.', 'scatter', [['symbol.aura', { aura: 'lightning', length: 3, tint: '#9ad8ff' }], ['symbol.motion', { motion: 'shake', length: 3, strength: 0.6 }]], ['energy']),
    sym('sym-holy-scatter', 'Holy scatter', 'Rays turn behind a hovering scatter and glints twinkle round it.', 'scatter', [['symbol.aura', { aura: 'halo', length: 3.6 }], ['symbol.aura', { aura: 'sparkle', length: 3.6 }], ['symbol.motion', { motion: 'float', length: 3.6, repeat: 2 }]], ['light']),
    sym('sym-frozen-scatter', 'Frozen scatter', 'Frost grows round the scatter, which breathes slowly in the cold.', 'scatter', [['symbol.aura', { aura: 'frost', length: 3.6, tint: '#9ad8ff' }], ['symbol.motion', { motion: 'breathe', length: 3.6, repeat: 2 }]], ['ice']),
    sym('sym-magic-bonus', 'Magic bonus tile', 'A rune circle, orbiting sparkles and a coin flip.', 'bonus', [['symbol.aura', { aura: 'runes', length: 3.6, tint: '#c89aff', tint2: '#7affd8' }], ['symbol.aura', { aura: 'orbit', length: 3.6, tint: '#ffe08a', tint2: '#ffffff' }], ['symbol.motion', { motion: 'spin', length: 3.6, repeat: 2 }]], ['magic']),
    sym('sym-gold-bonus', 'Golden bonus tile', 'A sweeping shine, glints and a gentle hover.', 'bonus', [['symbol.aura', { aura: 'shine', length: 3.6 }], ['symbol.aura', { aura: 'sparkle', length: 3.6 }], ['symbol.motion', { motion: 'float', length: 3.6, repeat: 2 }]], ['gold']),
    sym('sym-plasma-wild', 'Plasma wild', 'Plasma swirls round a swaying wild.', 'wild', [['symbol.aura', { aura: 'plasma', length: 3.6, tint: '#38e8ff', tint2: '#a06aff' }], ['symbol.motion', { motion: 'wobble', length: 3.6 }]], ['plasma']),
    sym('sym-cursed-wild', 'Cursed wild', 'Smoke rises, electricity crackles and the wild flickers.', 'wild', [['symbol.aura', { aura: 'smoke', length: 3.6 }], ['symbol.aura', { aura: 'lightning', length: 3.6, tint: '#c86aff' }], ['symbol.motion', { motion: 'flicker', length: 3.6 }]], ['dark']),
  ];
}
