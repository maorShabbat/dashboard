/** Effects for a whole slot row or a whole reel: fire, electricity, lightning, lasers and more sweep along it while the symbols react. */
import type { Preset } from '../model/preset';
import type { Params } from '../model/scene';
import { F } from './kit';
import { reelPreset, type ReelOpts } from './reels';

type Over = Record<string, number | string | boolean>;
const GROUP = 'Whole row and reel effects';
const o: ReelOpts = { cat: 'symbol-transformation', group: GROUP, board: { y: 0.56 } };
const SPIN: Params = { spin: 'classic', startAt: 0.3, spinTime: 0.9, stagger: 0.18, brake: 0.45 };
/** A line win on the middle row, so a row effect has a moment to start on. */
const ROW_SETUP: Params = { ...SPIN, pattern: 'line-win', line: 'row-mid', winCount: 5 };
/** A wild that expands over the middle reel, so a reel effect starts when it expands. */
const REEL_SETUP: Params = { ...SPIN, pattern: 'expanding-wild', wildReel: 2 };

function lane(slug: string, name: string, description: string, vertical: boolean, layers: [Over][], tags: string[] = []): Preset {
  return reelPreset(slug, name, description, vertical ? REEL_SETUP : ROW_SETUP, {
    ...o, tags: ['whole-lane', vertical ? 'reel' : 'row', ...tags],
    fx: (id, end) => [
      ...layers.map(([p], i) => F(`lane${i}`, 'lane.run', 0, { duration: end, anchor: vertical ? 'expand' : 'win', along: vertical ? 'reel' : 'row', ...p }, { target: id })),
    ],
  });
}
const row = (slug: string, name: string, element: string, text: string, over: Over = {}, tags: string[] = []): Preset =>
  lane(`lane-${slug}`, name, `${text} It runs along the winning row, and the symbols in the row react as it passes.`, false, [[{ element, ...over }]], [element, ...tags]);
const reel = (slug: string, name: string, element: string, text: string, over: Over = {}, tags: string[] = []): Preset =>
  lane(`lane-${slug}`, name, `${text} It runs down the reel the wild expands over, and the symbols in the reel react as it passes.`, true, [[{ element, ...over }]], [element, ...tags]);

export function laneEffects(): Preset[] {
  return [
    row('fire-row', 'Row of fire', 'fire', 'A wall of real flame sweeps from left to right and the symbols glow.', { symbols: 'glow' }),
    row('energy-row', 'Electric current along the row', 'energy', 'Electric arcs crackle along the row from one end to the other and the symbols shake.', { symbols: 'shake' }),
    row('lightning-row', 'Lightning bolt along the row', 'lightning', 'A forked bolt of lightning cracks across the row with a flash.', { symbols: 'jump', travel: 0.5 }),
    row('laser-row', 'Laser sweep along the row', 'laser', 'A red laser beam scans along the row with a spray of sparks.', { symbols: 'glow', travel: 0.7 }),
    row('plasma-row', 'Plasma stream along the row', 'plasma', 'A churning stream of violet and pink plasma flows along the row.', { symbols: 'glow' }),
    row('ice-row', 'Freezing row', 'ice', 'Ice spikes grow from both edges of the row and a cold mist rolls through it.', { symbols: 'shake' }),
    row('light-row', 'Beam of light along the row', 'light', 'A warm beam of light runs along the row and the symbols light up.', { symbols: 'glow' }),
    row('smoke-row', 'Smoke along the row', 'smoke', 'Thick smoke billows along the row and the symbols fade into it, then come back.', { symbols: 'fade', travel: 0.8 }),
    row('glitter-row', 'Gold dust along the row', 'glitter', 'Gold dust and glints pour along the row.', { symbols: 'jump' }),
    row('water-row', 'Wave along the row', 'water', 'A wave of water rolls along the row with spray.', { symbols: 'jump' }),
    row('wind-row', 'Gust along the row', 'wind', 'Lines of air whip along the row and the symbols tremble.', { symbols: 'shake', travel: 0.6 }),
    row('rainbow-row', 'Rainbow along the row', 'rainbow', 'A band of colours stretches along the row.', { symbols: 'glow' }),
    row('shock-row', 'Shockwaves along the row', 'shock', 'A ring of light bursts out of every symbol in turn.', { symbols: 'jump', travel: 0.9 }),
    row('magic-row', 'Magic runes along the row', 'magic', 'Circles of runes open round each symbol in the row in turn.', { symbols: 'glow', travel: 1.1 }),
    row('slash-row', 'Blade slash along the row', 'slash', 'A blade cuts across every symbol of the row in turn, in a stroke of light and a spray of sparks.', { symbols: 'shake', travel: 0.6 }),

    reel('fire-reel', 'Pillar of fire down the reel', 'fire', 'A pillar of flame runs down the reel.', { symbols: 'glow', travel: 0.8 }),
    reel('energy-reel', 'Electric current up the reel', 'energy', 'Electric arcs crackle up the reel from the bottom.', { along: 'reel-up', symbols: 'shake', travel: 0.7 }),
    reel('lightning-reel', 'Lightning strike down the reel', 'lightning', 'A bolt of lightning strikes down the whole reel with a flash.', { symbols: 'jump', travel: 0.4 }),
    reel('laser-reel', 'Laser down the reel', 'laser', 'A laser beam scans down the reel.', { symbols: 'glow', travel: 0.6 }),
    reel('ice-reel', 'Frozen reel', 'ice', 'Ice spikes grow down the reel from the top.', { symbols: 'shake', travel: 0.9 }),
    reel('light-reel', 'Pillar of light', 'light', 'A beam of light pours down the reel.', { symbols: 'glow', travel: 0.6 }),
    reel('water-reel', 'Waterfall down the reel', 'water', 'A wave of water falls down the reel.', { symbols: 'jump', travel: 0.8 }),
    reel('plasma-reel', 'Plasma column', 'plasma', 'Plasma rises up the reel in a glowing column.', { along: 'reel-up', symbols: 'glow', travel: 0.8 }),
    reel('magic-reel', 'Rune column', 'magic', 'Circles of runes open down the reel one after another.', { symbols: 'glow', travel: 1.0 }),

    row('fire-every-row', 'Fire through every row', 'fire', 'Flame runs along every row in turn.', { all: 'true', gap: 0.35, travel: 0.8, symbols: 'jump', anchor: 'last-stop', delay: 0.2 }),
    reel('energy-every-reel', 'Electricity through every reel', 'energy', 'Electric arcs run down every reel one after another.', { all: 'true', gap: 0.18, travel: 0.6, symbols: 'shake', anchor: 'last-stop', delay: 0.2 }),
    row('rainbow-every-row', 'Rainbows on every row', 'rainbow', 'A rainbow sweeps along every row in turn.', { all: 'true', gap: 0.3, travel: 0.8, symbols: 'glow', anchor: 'last-stop', delay: 0.2 }),
    reel('glitter-every-reel', 'Gold dust on every reel', 'glitter', 'Gold dust pours down every reel one after another.', { all: 'true', gap: 0.15, travel: 0.7, symbols: 'jump', anchor: 'last-stop', delay: 0.2 }),

    lane('lane-fire-cross', 'Cross of fire', 'Fire runs along the winning row and down the reel at the same time, crossing in the middle.', false, [[{ element: 'fire', symbols: 'glow' }], [{ element: 'fire', along: 'reel', symbols: 'none', delay: 0.3 }]], ['fire', 'cross']),
    lane('lane-storm-grid', 'Lightning grid', 'Lightning cracks along every row, then down every reel.', false, [[{ element: 'lightning', all: 'true', gap: 0.14, travel: 0.4, anchor: 'last-stop', delay: 0.2, symbols: 'glow' }], [{ element: 'lightning', along: 'reel', all: 'true', gap: 0.14, travel: 0.4, anchor: 'last-stop', delay: 1.0, symbols: 'none', tint: '#c8a0ff' }]], ['energy', 'grid']),
    lane('lane-fire-and-ice', 'Fire and ice', 'Fire runs along the row from the left, ice runs from the right, and they meet in the middle.', false, [[{ element: 'fire', symbols: 'glow', travel: 1.1 }], [{ element: 'ice', along: 'row-back', symbols: 'none', travel: 1.1 }]], ['fire', 'ice']),
  ];
}
