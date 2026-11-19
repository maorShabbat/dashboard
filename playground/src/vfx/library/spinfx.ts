/** Effects that run while the reels spin: trails, sparks, fire, energy and more, each on a board that spins and then wins. */
import type { Preset } from '../model/preset';
import type { Params } from '../model/scene';
import { F } from './kit';
import { reelPreset, type ReelOpts } from './reels';

type Over = Record<string, number | string | boolean>;
const GROUP = 'Reel spin effects';
const o: ReelOpts = { cat: 'symbol-transformation', group: GROUP, board: { y: 0.56 } };
/** A longer, steady spin so the effect has time to build, run and die, then a line win. */
const spin: Params = { spin: 'classic', startAt: 0.3, spinTime: 2.0, stagger: 0.34, brake: 0.6, line: 'row-mid', winCount: 4, pattern: 'line-win' };

function fx(slug: string, name: string, description: string, layers: [string, Over][], board: Params = {}, tags: string[] = []): Preset {
  return reelPreset(slug, name, description, { ...spin, ...board }, {
    ...o, tags: ['spin-effect', ...tags],
    fx: (id, end) => [...layers.map(([effect, p], i) => F(`spin${i}`, effect, 0, { duration: end, ...p }, { target: id })), F('win', 'board.winline', 0, { duration: end }, { target: id })],
  });
}

export function spinEffects(): Preset[] {
  return [
    fx('spinfx-streaks', 'Speed streaks', 'Thin streaks of ice-blue light race down every turning reel, longer as the reel speeds up.', [['spin.streaks', {}]], {}, ['streaks']),
    fx('spinfx-streaks-gold', 'Gold speed streaks', 'Gold streaks rush down the reels on a fast, turbo spin.', [['spin.streaks', { tint: '#ffd24a', tint2: '#fff3b0', count: 14 }]], { spin: 'turbo', spinTime: 1.4, stagger: 0.18 }, ['streaks']),
    fx('spinfx-trail', 'Golden light trails', 'Every symbol drags a glowing golden comet tail down the reel.', [['spin.trail', {}]], {}, ['trail']),
    fx('spinfx-trail-pink', 'Neon trails', 'Pink and violet light trails behind the symbols of a drum reel.', [['spin.trail', { tint: '#ff7ad8', tint2: '#7a4aff', length: 1.4 }]], { spin: 'drum', speed: 11 }, ['trail', 'neon']),
    fx('spinfx-sparks', 'Sparks', 'Sparks fly off the edges of the turning reels and fall in arcs.', [['spin.sparks', {}]], {}, ['sparks']),
    fx('spinfx-sparks-blue', 'Blue sparks', 'Cold blue sparks spray from the reels.', [['spin.sparks', { tint: '#5ab8ff', tint2: '#e0f4ff', count: 50 }]], {}, ['sparks']),
    fx('spinfx-fire', 'Fire spin', 'Every symbol streaks down the reel trailing a tongue of real flame.', [['spin.fire', {}], ['spin.sparks', { count: 24 }]], {}, ['fire']),
    fx('spinfx-fire-blue', 'Blue fire spin', 'The same, in cold blue flame.', [['spin.fire', { fire: 'blue' }], ['spin.sparks', { tint: '#7ab8ff', tint2: '#e0f4ff', count: 20 }]], {}, ['fire']),
    fx('spinfx-fire-violet', 'Magic fire spin', 'Violet fire trails the symbols and the board trembles.', [['spin.fire', { fire: 'violet' }], ['spin.rumble', {}]], {}, ['fire', 'magic']),
    fx('spinfx-energy', 'Electric spin', 'Electricity crackles down every turning reel and leaps between them.', [['spin.energy', {}]], {}, ['energy', 'electric']),
    fx('spinfx-energy-storm', 'Purple storm', 'A violet storm: many arcs, frequent leaps between the reels.', [['spin.energy', { tint: '#b48aff', tint2: '#ff9aff', arcs: 3, between: 1.8 }], ['spin.rails', { tint: '#b48aff', tint2: '#ff9aff' }]], { spin: 'drum', speed: 11 }, ['energy', 'electric']),
    fx('spinfx-plasma', 'Plasma spin', 'Churning blobs of violet and pink plasma ride the reels inside a pulsing aura.', [['spin.plasma', {}]], {}, ['energy', 'plasma']),
    fx('spinfx-plasma-toxic', 'Toxic plasma', 'Sickly green and yellow plasma.', [['spin.plasma', { tint: '#6aff3a', tint2: '#e6ff4a' }], ['spin.bubbles', { tint: '#b8ff7a', count: 8 }]], {}, ['energy', 'plasma', 'alien']),
    fx('spinfx-smoke', 'Smoke spin', 'Soft grey smoke streams off the symbols as the reels turn.', [['spin.smoke', {}]], {}, ['smoke']),
    fx('spinfx-steam', 'Steam spin', 'White steam billows off the reels.', [['spin.smoke', { smoke: 'white' }], ['spin.wind', { count: 4 }]], {}, ['smoke', 'steam']),
    fx('spinfx-glitter', 'Gold glitter spin', 'Gold dust and twinkling glints pour down the reels.', [['spin.glitter', {}]], {}, ['glitter']),
    fx('spinfx-glitter-silver', 'Silver sparkle spin', 'Silver and ice-white sparkle on a turbo spin.', [['spin.glitter', { tint: '#d8e8ff', tint2: '#ffffff', count: 40 }], ['spin.streaks', { tint: '#e8f2ff', count: 6 }]], { spin: 'turbo', spinTime: 1.4, stagger: 0.18 }, ['glitter']),
    fx('spinfx-digital', 'Digital rain spin', 'Streams of green data fall down each reel.', [['spin.digital', {}]], {}, ['digital', 'scifi']),
    fx('spinfx-digital-red', 'Red alert spin', 'Red data streams and neon rails.', [['spin.digital', { tint: '#ff4a5a', tint2: '#ffd0d0' }], ['spin.rails', { tint: '#ff4a5a', tint2: '#ff9a3a' }]], {}, ['digital', 'scifi']),
    fx('spinfx-frost', 'Frost spin', 'Ice shards and snow crystals stream down the reels in a cold mist.', [['spin.frost', {}]], {}, ['frost', 'ice']),
    fx('spinfx-wind', 'Air rush spin', 'Long swaying lines of air whip down the turning reels.', [['spin.wind', {}], ['spin.streaks', { tint: '#e8f4ff', count: 5 }]], { spin: 'turbo', spinTime: 1.4, stagger: 0.18 }, ['wind']),
    fx('spinfx-comets', 'Comet spin', 'Bright blue orbs with long tails shoot down the reels.', [['spin.comets', {}]], {}, ['comets']),
    fx('spinfx-comets-gold', 'Gold comets', 'Golden comets and glitter.', [['spin.comets', { tint: '#ffd24a', tint2: '#fff6c8' }], ['spin.glitter', { count: 14 }]], {}, ['comets']),
    fx('spinfx-rainbow', 'Rainbow trails', 'Every symbol leaves a ribbon of colours behind it.', [['spin.rainbow', {}]], {}, ['rainbow']),
    fx('spinfx-bubbles', 'Bubble spin', 'Bubbles stream up the reels against the way they turn.', [['spin.bubbles', {}], ['spin.trail', { tint: '#7ad8ff', tint2: '#3a8aff', length: 0.8 }]], {}, ['bubbles', 'water']),
    fx('spinfx-rails', 'Neon rails spin', 'Glowing rails run down both sides of every reel with bright pulses.', [['spin.rails', {}]], {}, ['neon']),
    fx('spinfx-rumble', 'Rumbling spin', 'The whole board vibrates while the reels spin and settles with a thump.', [['spin.rumble', {}], ['spin.streaks', { count: 5 }]], {}, ['rumble']),
    fx('spinfx-dragon', 'Dragon spin', 'Fire trails the symbols, sparks spray, and the board rumbles.', [['spin.fire', { size: 1.2 }], ['spin.sparks', { count: 44 }], ['spin.rumble', { strength: 1.3 }]], { spin: 'turbo', spinTime: 1.6, stagger: 0.22 }, ['fire']),
    fx('spinfx-cosmic', 'Cosmic spin', 'Comets, plasma and glitter on a drum reel.', [['spin.plasma', { strength: 0.8 }], ['spin.comets', {}], ['spin.glitter', { count: 20 }]], { spin: 'drum', speed: 11 }, ['comets', 'plasma']),
    fx('spinfx-storm', 'Lightning drum', 'Electricity arcs between drum reels with neon rails.', [['spin.energy', { between: 1.6 }], ['spin.rails', {}], ['spin.rumble', { strength: 0.8 }]], { spin: 'drum', speed: 11 }, ['energy']),
    fx('spinfx-turbo-streaks', 'Turbo blast', 'Streaks, air rush and sparks on a hard-stopping turbo spin.', [['spin.streaks', { count: 14 }], ['spin.wind', {}], ['spin.sparks', { count: 24 }]], { spin: 'turbo', spinTime: 1.3, stagger: 0.16, bounce: 0.2 }, ['streaks']),
  ];
}
