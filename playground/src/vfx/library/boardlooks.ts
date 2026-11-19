/** Effects that act on the board (the slot grid) only: shake, zap, smoke, frozen, glow textures and themed packs. */
import type { Preset } from '../model/preset';
import { F } from './kit';
import { reelPreset, type ReelOpts } from './reels';

type Over = Record<string, number | string | boolean>;
const aim = (id: string) => ({ target: id });

/** A short, quiet spin so the grid is settled, then the effect on it from the moment the last reel stops. */
const quiet: Over = { startAt: 0.15, spinTime: 0.55, stagger: 0.09, brake: 0.3, pattern: 'spin-only', anticipation: false };
const settled = (stopEnd: number): number => Math.ceil((stopEnd + 0.15) * 10) / 10;

const hit: ReelOpts = { cat: 'impacts', group: 'Board hits', board: { y: 0.56 } };
const elem: ReelOpts = { cat: 'impacts', group: 'Board elements', board: { y: 0.56 } };
const glows: ReelOpts = { cat: 'shine', group: 'Board glows', board: { y: 0.56 } };
const themes: ReelOpts = { cat: 'shine', group: 'Board themes', board: { y: 0.56 } };

/** A board preset: the settled grid, and one effect on it. */
function onBoard(o: ReelOpts, slug: string, name: string, description: string, effect: string, params: Over, len: number, tags: string[] = []): Preset {
  return reelPreset(slug, name, description, quiet, { ...o, tags: ['board-effect', ...tags], fx: (id, _end, stop) => [F('fx', effect, settled(stop), { duration: len, ...params }, aim(id))] });
}

/** A themed grid: the theme runs through the whole spin while a line wins. */
function themed(slug: string, name: string, description: string, theme: string, over: Over = {}, win: Over = {}): Preset {
  return reelPreset(slug, name, description, { line: 'row-mid', winCount: 4, spin: 'classic', ...over }, {
    ...themes, tags: ['board-effect', 'theme', theme],
    fx: (id, end) => [F('theme', 'board.theme', 0, { duration: end, theme }, aim(id)), F('winline', 'board.winline', 0, { duration: end, ...win }, aim(id))],
  });
}

export function boardLooks(): Preset[] {
  return [
    onBoard(hit, 'board-shake-jolt', 'Board jolt', 'One heavy jolt: only the grid kicks and the symbols rattle in their cells, with dust shaken off the top. The background stays still.', 'board.shake', { mode: 'jolt' }, 1.4, ['shake']),
    onBoard(hit, 'board-shake-rumble', 'Board rumble', 'A steady rumble through the grid, the symbols trembling in their cells.', 'board.shake', { mode: 'rumble', strength: 0.8 }, 2.2, ['shake']),
    onBoard(hit, 'board-shake-quake', 'Board quake', 'A quake that builds, peaks and fades: the grid sways and shudders, chips raining off the top.', 'board.shake', { mode: 'quake', strength: 1.3, dust: 1.5 }, 2.8, ['shake']),
    onBoard(hit, 'board-shake-recoil', 'Board recoil', 'The grid punches toward you, draws back and settles in two soft swings, the symbols rattling once.', 'board.shake', { mode: 'recoil' }, 1.8, ['shake']),
    onBoard(hit, 'board-shake-heartbeat', 'Board heartbeat', 'The grid swells and brightens with two beats and a rest, again and again: tension.', 'board.shake', { mode: 'heartbeat' }, 4.4, ['shake', 'tension']),
    onBoard(hit, 'board-shake-stomp', 'Board footsteps', 'Heavy steps, each harder than the last: the grid sinks and rebounds and the symbols rattle.', 'board.shake', { mode: 'stomp', strength: 1.1 }, 3.4, ['shake']),
    onBoard(hit, 'board-shake-sway', 'Board sway', 'A slow swing like a deck in a swell.', 'board.shake', { mode: 'sway' }, 4, ['shake']),
    onBoard(hit, 'board-shake-tilt', 'Board tilt', 'The grid tips to one side, hangs, and swings back with a small overshoot.', 'board.shake', { mode: 'tilt' }, 2.4, ['shake']),
    onBoard(hit, 'board-shake-hard', 'Board slam', 'One very heavy jolt: the grid kicks hard, the symbols rattle and dust shakes off the top.', 'board.shake', { mode: 'jolt', strength: 1.8, rattle: 2 }, 1.6, ['shake']),
    onBoard(hit, 'board-shake-aftershock', 'Board quake with a jolt', 'A building quake and a jolt on top of it.', 'board.shake', { mode: 'quake', strength: 1.5, dust: 1.5, rattle: 1.8 }, 3.2, ['shake']),
    onBoard(hit, 'board-zap-cells', 'Zap between cells', 'Electric arcs leap from cell to cell across the grid; the symbols flash white-blue as they are hit.', 'board.zap', { mode: 'cells' }, 2.4, ['zap', 'electric']),
    onBoard(hit, 'board-zap-frame', 'Zap round the frame', 'Lightning runs around the edge of the grid and spits sparks into the symbols.', 'board.zap', { mode: 'frame', arcs: 8 }, 2.4, ['zap', 'electric']),
    onBoard(hit, 'board-zap-storm', 'Zap storm', 'Arcs inside the grid and all round its frame, violet and fierce, the symbols flickering hard.', 'board.zap', { mode: 'both', arcs: 12, tint: '#c8a0ff', flicker: 1.5 }, 2.8, ['zap', 'electric']),

    onBoard(elem, 'board-smoke-grey', 'Smoke over the grid', 'Grey smoke rolls up from below and thickens over the grid, dimming the symbols, then drifts off.', 'board.smoke', { smoke: 'grey', from: 'bottom' }, 4.2, ['smoke']),
    onBoard(elem, 'board-smoke-soot', 'Black soot from the sides', 'Thick black smoke pours in from both sides and swallows the symbols.', 'board.smoke', { smoke: 'black', from: 'sides', cover: 1 }, 4.2, ['smoke']),
    onBoard(elem, 'board-smoke-steam', 'Steam', 'White steam drifts down over the grid like a hot spring.', 'board.smoke', { smoke: 'white', from: 'top', cover: 0.6 }, 4.2, ['smoke']),
    onBoard(elem, 'board-smoke-toxic', 'Toxic fumes', 'Sickly green gas seeps up through the grid.', 'board.smoke', { smoke: 'toxic', from: 'all', cover: 0.7 }, 4.2, ['smoke']),
    onBoard(elem, 'board-smoke-mist', 'Cold mist', 'A cold mist creeps across the grid.', 'board.smoke', { smoke: 'ice', from: 'sides', cover: 0.7 }, 4.2, ['smoke']),
    onBoard(elem, 'board-smoke-magic', 'Magic smoke', 'Purple magic smoke curls over the grid.', 'board.smoke', { smoke: 'purple', from: 'bottom', cover: 0.8 }, 4.2, ['smoke']),
    onBoard(elem, 'board-frozen-shatter', 'Frozen, then shatter', 'Frost spreads over the grid, the symbols turn icy blue and icicles grow; a crack, a flash, and the ice bursts away.', 'board.frozen', { ending: 'shatter' }, 4, ['frozen', 'ice']),
    onBoard(elem, 'board-frozen-thaw', 'Frozen, then thaw', 'The grid freezes over and slowly thaws, water dripping off the icicles.', 'board.frozen', { ending: 'thaw' }, 4.4, ['frozen', 'ice']),
    onBoard(elem, 'board-frozen-stay', 'Frozen solid', 'The grid freezes and stays frozen: for a locked or blocked state.', 'board.frozen', { ending: 'stay', strength: 1.2 }, 3.4, ['frozen', 'ice']),

    onBoard(glows, 'board-glow-neon', 'Neon tube', 'The grid is outlined in a bright cyan neon tube that hums and flickers.', 'board.glow', { texture: 'neon', tint: '#3affea' }, 6, ['glow']),
    onBoard(glows, 'board-glow-aura', 'Soft aura', 'A soft golden aura breathes around the grid.', 'board.glow', { texture: 'aura' }, 6, ['glow']),
    onBoard(glows, 'board-glow-embers', 'Glowing embers', 'Embers glow along the frame and drift up off the grid.', 'board.glow', { texture: 'embers', tint: '#ff7a2a', tint2: '#ffd24a' }, 6, ['glow', 'fire']),
    onBoard(glows, 'board-glow-plasma', 'Plasma', 'Two colours of plasma churn around the grid.', 'board.glow', { texture: 'plasma', tint: '#7a5aff', tint2: '#ff4ad8' }, 6, ['glow']),
    onBoard(glows, 'board-glow-holo', 'Hologram', 'A cyan hologram flickers over the grid with scan lines.', 'board.glow', { texture: 'holo', tint: '#5ad8ff' }, 6, ['glow', 'scifi']),
    onBoard(glows, 'board-glow-stars', 'Starlight', 'Stars twinkle around the grid.', 'board.glow', { texture: 'stars', tint: '#fff3b0' }, 6, ['glow']),
    onBoard(glows, 'board-glow-aurora', 'Aurora curtain', 'A green and violet aurora waves over the grid.', 'board.glow', { texture: 'aurora', tint: '#5aff9a', tint2: '#7a5aff' }, 6, ['glow', 'nordic']),
    onBoard(glows, 'board-glow-caustic', 'Water caustics', 'Rippling light from the bottom of a pool plays over the grid.', 'board.glow', { texture: 'caustic', tint: '#5ad8ff' }, 6, ['glow', 'water']),
    onBoard(glows, 'board-glow-pulse', 'Pulse rings', 'Rings of light pulse out from the frame.', 'board.glow', { texture: 'pulse' }, 6, ['glow']),
    onBoard(glows, 'board-glow-chase', 'Chasing lights', 'Lights chase round the frame in two colours.', 'board.glow', { texture: 'chase', tint: '#ffd24a', tint2: '#ff4a4a' }, 6, ['glow', 'cabaret']),

    onBoard(glows, 'board-glow-rainbow', 'Rainbow tube', 'A tube of light runs round the grid and its colour runs round it, the whole spectrum turning slowly.', 'board.glow', { texture: 'rainbow' }, 6, ['glow', 'neon']),
    onBoard(glows, 'board-glow-flames', 'Ring of fire', 'Real flames burn all the way round the grid, leaning out from the frame, with embers lifting off them.', 'board.glow', { texture: 'flames', tint: '#ff7a2a', tint2: '#ffc84a' }, 6, ['glow', 'fire']),
    onBoard(glows, 'board-glow-frost', 'Frost rim', 'A pale blue rim of light, faceted ice crystals growing out of the frame, glints and a cold mist along the bottom.', 'board.glow', { texture: 'frost', tint: '#8ad8ff' }, 6, ['glow', 'ice']),
    onBoard(glows, 'board-glow-comets', 'Golden comets', 'Three golden comets circle the grid, each trailing a long tail of light and sparkles.', 'board.glow', { texture: 'comets', tint: '#ffd24a', tint2: '#fff3b0' }, 6, ['glow', 'gold']),
    onBoard(glows, 'board-glow-current', 'Electric current', 'A current crawls round the frame in crackling arcs, with bolts that jump in to the symbols.', 'board.glow', { texture: 'current', tint: '#7ad8ff' }, 6, ['glow', 'electric']),
    onBoard(glows, 'board-glow-lava', 'Molten lava', 'Lava glows under the grid: a hot light from below, glowing cracks and bubbles that swell and pop.', 'board.glow', { texture: 'lava', tint: '#ff5a1a', tint2: '#ffc84a' }, 6, ['glow', 'fire']),
    onBoard(glows, 'board-glow-sunburst', 'Sunburst rays', 'Golden rays turn slowly round the grid and fade into the dark, motes of light riding them.', 'board.glow', { texture: 'sunburst', tint: '#ffd24a', tint2: '#ff9a3a' }, 6, ['glow', 'gold']),
    onBoard(glows, 'board-glow-fairies', 'Fairy lights', 'A string of fairy lights along the top and fireflies drifting round the grid, each leaving a short trail.', 'board.glow', { texture: 'fairies', tint: '#ffe08a', tint2: '#9affd8' }, 6, ['glow', 'magic']),
    onBoard(glows, 'board-glow-lasers', 'Laser show', 'Magenta and cyan laser beams fan out of the four corners and sweep across the grid.', 'board.glow', { texture: 'lasers', tint: '#ff3ad0', tint2: '#3affea' }, 6, ['glow', 'scifi']),
    onBoard(glows, 'board-glow-waves', 'Ocean swell', 'Three layers of swell roll along the bottom of the grid with foam glinting on the crests, light shafts from above and rising bubbles.', 'board.glow', { texture: 'waves', tint: '#3ab0ff', tint2: '#7affea' }, 6, ['glow', 'water']),

    themed('board-theme-nordic', 'Nordic grid', 'Runes glow on the frame, an aurora waves above and snow drifts past while a line wins.', 'nordic'),
    themed('board-theme-scifi', 'Sci-fi grid', 'Hologram brackets, a scan beam and falling data over the grid while a line wins.', 'scifi', {}, { tint: '#6ae8ff' }),
    themed('board-theme-alien', 'Alien grid', 'Bioluminescent waves, spores and tendrils crawl over the grid while a line wins.', 'alien', {}, { tint: '#9aff7a' }),
    themed('board-theme-mexican', 'Mexican fiesta grid', 'Papel picado flags, marigold petals and candles dress the grid while a line wins.', 'mexican', {}, { tint: '#ff9ad8' }),
    themed('board-theme-fire', 'Fire grid', 'Flames lick the frame, heat haze shimmers and embers rise while a line wins.', 'inferno', {}, { tint: '#ffb04a' }),
    themed('board-theme-cabaret', 'Cabaret grid', 'Marquee bulbs, roving spotlights and velvet curtains while a line wins.', 'cabaret', {}, { tint: '#ffe08a' }),
    themed('board-theme-fishing', 'Fishing grid', 'Light rays through water, rising bubbles and fish crossing the grid while a line wins.', 'fishing', {}, { tint: '#8ae8ff' }),
    themed('board-theme-egyptian', 'Egyptian grid', 'Drifting gold sand, torches and glints on the frame while a line wins.', 'egyptian', {}, { tint: '#ffd24a' }),
    themed('board-theme-space', 'Space grid', 'A nebula drifts behind the grid, stars twinkle, a ringed planet orbits it and shooting stars cross while a line wins.', 'space', {}, { tint: '#b8a0ff' }),
    themed('board-theme-haunted', 'Haunted grid', 'A big pale moon, bats crossing it, mist along the ground and candles flickering at the corners while a line wins.', 'haunted', {}, { tint: '#b8ffd8' }),
    themed('board-theme-festival', 'Festival grid', 'Red paper lanterns sway above the grid, glowing from inside, and blossom drifts down while a line wins.', 'festival', {}, { tint: '#ffb04a' }),
    themed('board-theme-candy', 'Candy grid', 'Sprinkles tumble past the grid, lollipops stand at the top corners and a pink and blue glow breathes round the frame while a line wins.', 'candy', {}, { tint: '#ff7ad8' }),
    themed('board-theme-pirate', 'Pirate grid', 'Ship\'s lanterns swing from a rope above the grid, sea fog rolls along the bottom and gold glints while a line wins.', 'pirate', {}, { tint: '#ffd24a' }),
    themed('board-theme-cyberpunk', 'Cyberpunk grid', 'Neon rain falls past two glowing signs, scanlines cross the grid and it glitches now and then while a line wins.', 'cyberpunk', {}, { tint: '#ff4ad8' }),
    themed('board-theme-christmas', 'Christmas grid', 'A string of coloured lights round the frame, snow falling, baubles hanging from the top and a star over the middle while a line wins.', 'christmas', {}, { tint: '#ff6a6a' }),
    themed('board-theme-steampunk', 'Steampunk grid', 'Brass gears turn at the corners, rivets run along the frame and steam vents from pipes at the sides while a line wins.', 'steampunk', {}, { tint: '#ffb04a' }),
  ];
}
