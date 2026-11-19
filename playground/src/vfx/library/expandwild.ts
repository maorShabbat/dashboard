/** Expanding wilds that play an animation while they stretch over their reel (a transparent WebM, here the ones that ship with the playground). */
import type { Preset } from '../model/preset';
import { defaultBoardSymbols, type BoardSymbol, type ExpandAnimation } from '../model/scene';
import { F } from './kit';
import { reelPreset, type ReelOpts } from './reels';

const GROUP = 'Expanding wilds with animation';
const o: ReelOpts = { cat: 'symbol-transformation', group: GROUP };
/** The length of the WebM animations that ship: 57 frames at 30 per second. */
const LENGTH = 1.9;

/** The board's symbols, with the wild playing `expand` while it expands. */
const symbols = (expand: ExpandAnimation): BoardSymbol[] => defaultBoardSymbols().map((s) => (s.role === 'wild' ? { ...s, expand } : s));
const grid = { pattern: 'expanding-wild', wildReel: 2, spin: 'classic', startAt: 0.3, spinTime: 1.0, stagger: 0.2, brake: 0.45 } as const;

function wild(slug: string, name: string, description: string, asset: string, extra: ReturnType<typeof F>[] = [], over: { play?: ExpandAnimation['play']; time?: number; light?: Record<string, number | string | boolean> } = {}, tags: string[] = []): Preset {
  const play = over.play ?? 'natural', time = over.time ?? LENGTH;
  return reelPreset(slug, name, description, { ...grid, expandTime: time }, {
    ...o, tags: ['expanding-wild', 'animated-wild', ...tags], board: { y: 0.56, symbols: symbols({ asset, fit: 'fill', play }) },
    fx: (id, end) => [
      F('land', 'board.landing', 0, { duration: end, which: 'specials' }, { target: id }),
      F('light', 'board.expand', 0, { duration: end, ...(over.light ?? {}) }, { target: id }),
      F('win', 'board.winline', 0, { duration: end }, { target: id }),
      ...extra.map((l) => ({ ...l, params: { duration: end, ...l.params }, target: id })),
    ],
  });
}
const lane = (id: string, params: Record<string, number | string | boolean>) => F(id, 'lane.run', 0, params);

export function expandingWilds(): Preset[] {
  return [
    wild('expwild-fire', 'Expanding wild: pillar of fire', 'The wild lands, then a pillar of real flame rises over its whole reel and stays burning while the line wins through it.', 'builtin:wild-fire-column.webm', [], { light: { tint: '#ff9a3a' } }, ['fire']),
    wild('expwild-lightning', 'Expanding wild: pillar of lightning', 'A column of electricity strikes down the wild\'s reel, forks crackling off it, and holds a white-blue glow.', 'builtin:wild-lightning-column.webm', [], { light: { tint: '#8ad0ff' } }, ['energy', 'electric']),
    wild('expwild-gold', 'Expanding wild: pillar of golden light', 'A shaft of golden light pours over the reel in a shower of sparkles.', 'builtin:wild-gold-column.webm', [], { light: { tint: '#ffd24a' } }, ['light', 'gold']),
    wild('expwild-plasma', 'Expanding wild: plasma helix', 'Two strands of violet and cyan plasma twist up the reel round a swirling core.', 'builtin:wild-plasma-column.webm', [], { light: { tint: '#c88aff' } }, ['plasma', 'energy']),
    wild('expwild-fire-fast', 'Expanding wild: quick fire', 'The same pillar of fire played at twice the speed, for a fast game: the expansion takes under a second.', 'builtin:wild-fire-column.webm', [], { play: 'fit', time: 0.95, light: { tint: '#ff9a3a' } }, ['fire', 'fast']),
    wild('expwild-fire-then-row', 'Expanding wild: fire up the reel, fire along the line', 'The pillar of fire fills the reel, then flame runs out along the winning line and the symbols glow.', 'builtin:wild-fire-column.webm',
      [lane('row', { element: 'fire', along: 'row', anchor: 'win', delay: 0.1, symbols: 'glow', travel: 0.8, linger: 1.4 })], { light: { tint: '#ff9a3a' } }, ['fire']),
    wild('expwild-storm-then-row', 'Expanding wild: storm', 'Lightning fills the reel, then a bolt cracks along the winning line and the symbols jump.', 'builtin:wild-lightning-column.webm',
      [lane('row', { element: 'lightning', along: 'row', anchor: 'win', delay: 0.05, symbols: 'jump', travel: 0.5, linger: 1.0 })], { light: { tint: '#8ad0ff' } }, ['energy', 'electric']),
    wild('expwild-gold-then-row', 'Expanding wild: gold rush', 'A shaft of golden light fills the reel and a shower of gold dust sweeps along the winning line.', 'builtin:wild-gold-column.webm',
      [lane('row', { element: 'glitter', along: 'row', anchor: 'win', delay: 0.05, symbols: 'jump', travel: 0.9, linger: 1.6 })], { light: { tint: '#ffd24a' } }, ['light', 'gold']),
  ];
}
