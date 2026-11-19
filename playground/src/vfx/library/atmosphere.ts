/** Atmosphere: ambient loops behind the reels, animated frames, and the feature-trigger cinematic. */
import type { Preset } from '../model/preset';
import { boardElement, defaultBoardSymbols } from '../model/scene';
import { C, F, S, T, counterIn, mo, motion, plate, preset, scene, shine, textIn, ts } from './kit';

type Over = Record<string, number | string | boolean>;

/** A board that is simply at rest, framed and panelled: something for the atmosphere to sit behind or round. */
const restBoard = () => boardElement({ id: 'board', name: 'Reels', cols: 5, rows: 3, cell: 0.2, gap: 0.07, symbols: defaultBoardSymbols(), frame: 'builtin:tile-dark', panel: 'builtin:reel-panel', y: 0.54, params: { spin: 'rest', seed: 5 } });

// ---------------------------------------------------------------------------------------------------------------------
// Ambient loops

function ambient(slug: string, name: string, description: string, effect: string, params: Over, o: { back?: string; loop?: number; tags?: string[] } = {}): Preset {
  const L = o.loop ?? 8;
  return preset('shine', slug, name, description + ' Plays as a seamless loop.', scene([restBoard()], [F('ambient', effect, 0, { loop: L, ...params })], { seamless: true, duration: L, hold: 0, screens: { from: o.back ?? 'night' } }), { tags: ['ambient', 'loop', 'atmosphere', ...(o.tags ?? [])], group: 'Ambient loops behind the reels' });
}

export function ambients(): Preset[] {
  return [
    ambient('ambient-embers', 'Rising embers', 'Glowing sparks rise from below and flicker out behind the reels.', 'ambient.embers', {}, { back: 'lava', tags: ['fire'] }),
    ambient('ambient-embers-dragon', 'Dragon embers', 'Thick red-orange embers blown sideways by a hot wind.', 'ambient.embers', { count: 120, tint: '#ff4a1a', tint2: '#ffb04a', wind: 0.9, size: 1.3, speed: 2 }, { back: 'lava', tags: ['fire'] }),
    ambient('ambient-embers-magic', 'Magic sparks', 'Cold blue-violet sparks drifting up.', 'ambient.embers', { tint: '#6aa8ff', tint2: '#d89aff', count: 80, wind: -0.4 }, { back: 'night', tags: ['magic'] }),
    ambient('ambient-snow', 'Snowfall', 'Snowflakes in three depths drift down behind the reels.', 'ambient.snow', {}, { back: 'night', tags: ['snow', 'nordic'] }),
    ambient('ambient-blizzard', 'Blizzard', 'A hard wind drives dense snow across the screen, some of it in front.', 'ambient.snow', { count: 230, wind: 1, speed: 2, layer: 'both' }, { back: 'night', tags: ['snow', 'nordic'] }),
    ambient('ambient-fireflies', 'Fireflies', 'Soft yellow-green lights wander and blink in the dark.', 'ambient.fireflies', {}, { back: 'barn', tags: ['night'] }),
    ambient('ambient-fireflies-alien', 'Alien spores', 'Cyan and green lights drift slowly, blinking out of step.', 'ambient.fireflies', { tint: '#5affd8', tint2: '#b06aff', count: 34, size: 1.2 }, { back: 'night', tags: ['alien'] }),
    ambient('ambient-rays', 'God rays', 'Long warm beams fan down from the top left, swaying and breathing, with dust in the light.', 'ambient.rays', {}, { back: 'barn', tags: ['light'] }),
    ambient('ambient-rays-temple', 'Rays from above', 'Golden light pours straight down from above.', 'ambient.rays', { from: 'top', count: 6, tint: '#ffd77a', spread: 0.7 }, { back: 'daylight', tags: ['light'] }),
    ambient('ambient-rays-cold', 'Cold rays', 'Pale blue beams from the top right, like light through ice or water.', 'ambient.rays', { from: 'topright', tint: '#a8e6ff', tint2: '#ffffff', count: 8 }, { back: 'night', tags: ['light', 'water'] }),
    ambient('ambient-bokeh', 'Golden bokeh', 'Big soft discs of golden light float and breathe, with fine dust rising.', 'ambient.bokeh', {}, { back: 'night', tags: ['glamour'] }),
    ambient('ambient-bokeh-neon', 'Neon bokeh', 'Pink and cyan out-of-focus lights, some drifting in front of the reels.', 'ambient.bokeh', { tint: '#38e8ff', tint2: '#ff3ad0', count: 20, layer: 'both' }, { back: 'night', tags: ['neon', 'scifi'] }),
    ambient('ambient-dust', 'Dust motes', 'Only fine dust turning slowly in a shaft of light: very quiet.', 'ambient.bokeh', { count: 4, dust: 2, tint: '#fff0c0', opacity: 0.5 }, { back: 'barn', tags: ['quiet'] }),
    ambient('ambient-stars', 'Twinkling stars', 'A field of stars, each twinkling at its own pace.', 'ambient.stars', {}, { back: 'night', tags: ['night', 'space'] }),
    ambient('ambient-shooting-stars', 'Shooting stars', 'Fewer stars, and three shooting stars crossing the sky every loop.', 'ambient.stars', { count: 40, shooting: 3, loop: 10 }, { back: 'night', loop: 10, tags: ['night', 'space'] }),
  ];
}

// ---------------------------------------------------------------------------------------------------------------------
// Animated frames

function framed(slug: string, name: string, description: string, effect: string, params: Over, o: { loop?: number; back?: string; tags?: string[] } = {}): Preset {
  const L = o.loop ?? 6;
  return preset('shine', slug, name, description + ' Plays as a seamless loop.', scene([restBoard()], [F('frame', effect, 0, { loop: L, ...params }, { target: 'board' })], { seamless: true, duration: L, hold: 0, screens: { from: o.back ?? 'night' } }), { tags: ['frame', 'loop', 'atmosphere', ...(o.tags ?? [])], group: 'Animated frames' });
}

/** The same frame effects on a win plate, to show they work on any element. */
function plated(slug: string, name: string, description: string, effect: string, params: Over, o: { text: string; style: string; back?: string }): Preset {
  const pl = plate(['#8a1736', '#3d0618'], '#ffd24a', { glow: '#ff3a5a' });
  const els = [S('plate', 'banner', pl, { name: 'Message background', y: 0.5, width: 1.15, height: 0.34 }), T('title', o.text, { y: 0.5, size: 0.17, style: ts(o.style), motion: motion({ idle: mo.in('breathe', { start: 0, duration: 3 }) }) })];
  const L = Number(params.loop ?? 6);
  return preset('shine', slug, name, description + ' Plays as a seamless loop.', scene(els, [F('frame', effect, 0, { loop: L, ...params }, { target: 'plate' })], { seamless: true, duration: L, hold: 0, screens: { from: o.back ?? 'night' } }), { tags: ['frame', 'loop', 'atmosphere', 'plate'], group: 'Animated frames', inputs: [textIn('title', 'Title')] });
}

export function frames(): Preset[] {
  return [
    framed('frame-marquee-run', 'Marquee bulbs running', 'A group of golden bulbs chases round the reel frame.', 'frame.chase', { mode: 'run' }, { tags: ['bulbs', 'cabaret'] }),
    framed('frame-marquee-alternate', 'Alternating bulbs', 'Every other bulb blinks, the old arcade way.', 'frame.chase', { mode: 'alternate', laps: 3, tint: '#fff2a8' }, { tags: ['bulbs'] }),
    framed('frame-marquee-wave', 'Wave of light', 'A wave of brightness rolls round the frame in pink and amber.', 'frame.chase', { mode: 'wave', tint: '#ff7ad8', tint2: '#5a1a3a', spacing: 0.04 }, { tags: ['bulbs'] }),
    framed('frame-marquee-twinkle', 'Twinkling bulbs', 'The bulbs twinkle at random, each in its own rhythm.', 'frame.chase', { mode: 'twinkle', tint: '#fff6c8', spacing: 0.04, bulb: 0.009 }, { tags: ['bulbs'] }),
    framed('frame-marquee-fill', 'Bulbs filling up', 'The bulbs light one after another until the frame is full, then start again.', 'frame.chase', { mode: 'fill', laps: 1, tint: '#7affc8', tint2: '#0e3a2a' }, { tags: ['bulbs'] }),
    framed('frame-neon-cyan', 'Neon tube, cyan', 'A cyan neon tube with a faint buzz.', 'frame.neon', { mode: 'buzz' }, { tags: ['neon'] }),
    framed('frame-neon-failing', 'Failing neon sign', 'A tired pink sign: segments flicker and drop out, then come back.', 'frame.neon', { mode: 'failing', tint: '#ff4ab8', tint2: '#ffb04a' }, { back: 'night', tags: ['neon'] }),
    framed('frame-neon-breathing', 'Breathing neon', 'The tube slowly swells and dims, like something alive.', 'frame.neon', { mode: 'breathing', tint: '#9a6aff' }, { back: 'night', tags: ['neon'] }),
    framed('frame-neon-two', 'Two-colour neon', 'Half the tube is cyan, half pink, and the two colours chase each other round.', 'frame.neon', { mode: 'two', laps: 1 }, { back: 'night', tags: ['neon'] }),
    framed('frame-shimmer', 'Shimmer sweep', 'A band of light sweeps across the reels now and then, flaring at the edges.', 'frame.shimmer', {}, { loop: 4, tags: ['shine'] }),
    framed('frame-shimmer-slow', 'Slow wide sheen', 'A broad, soft sheen glides across, once per loop.', 'frame.shimmer', { band: 0.22, angle: 18, loop: 7, pause: 0.45, tint: '#cfe8ff' }, { loop: 7, tags: ['shine'] }),
    framed('frame-glints', 'Racing glints', 'Bright glints race round the border at different speeds, leaving glittering trails.', 'frame.sparkle', {}, { loop: 5, tags: ['sparkle'] }),
    framed('frame-rainbow', 'Colour-cycling border', 'A border of bulbs whose colours flow round the reels in a full spectrum.', 'frame.rainbow', {}, { tags: ['rainbow', 'gaming'] }),
    plated('frame-plate-shimmer', 'Shimmer on a win plate', 'A band of light sweeps over a burgundy and gold win banner.', 'frame.shimmer', { loop: 4, angle: 22 }, { text: 'BIG WIN', style: 'gold-chunky' }),
    plated('frame-plate-marquee', 'Marquee round a banner', 'Marquee bulbs run round a win banner.', 'frame.chase', { mode: 'run', inset: 0.02, spacing: 0.045 }, { text: 'MEGA WIN', style: 'gold-chunky' }),
  ];
}

// ---------------------------------------------------------------------------------------------------------------------
// Feature-trigger cinematic

const IMPACT = 0.95, LENGTH = 3.8;
interface Trigger { slug: string; name: string; description: string; title?: string; sub?: string; count?: number; style?: string; size?: number; params?: Over; back?: string; extras?: ReturnType<typeof F>[] }

function trigger(o: Trigger): Preset {
  const els = [];
  const out = mo.in('zoom-out', { start: LENGTH - 0.75, duration: 0.5 });
  if (o.title) els.push(T('title', o.title, { y: o.count !== undefined || o.sub ? 0.43 : 0.5, size: o.size ?? 0.19, style: ts(o.style ?? 'gold-chunky'), motion: motion({ entrance: mo.in('slam', { start: IMPACT - 0.1 }), exit: out }), shine: shine({ start: IMPACT + 0.5, duration: 0.9, repeat: 1, interval: 1.2 }) }));
  if (o.sub) els.push(T('subtitle', o.sub, { role: 'subtitle', name: 'Subtitle', y: 0.6, size: 0.065, style: ts('clean-white'), motion: motion({ entrance: mo.in('slide-down', { start: IMPACT + 0.3, duration: 0.5 }), exit: mo.in('fade-out', { start: LENGTH - 0.75, duration: 0.4 }) }) }));
  if (o.count !== undefined) els.push(C('count', { y: 0.62, size: 0.16, from: 0, to: o.count, countStart: IMPACT + 0.35, countDuration: 0.9, roll: 'roll', style: ts('gold-chunky'), motion: motion({ exit: mo.in('fade-out', { start: LENGTH - 0.75, duration: 0.4 }) }) }));
  const inputs = [...(o.title ? [textIn('title', 'Title')] : []), ...(o.sub ? [textIn('subtitle', 'Subtitle')] : []), ...(o.count !== undefined ? [counterIn('count', 'Number')] : [])];
  return preset('messages', o.slug, o.name, o.description, scene(els, [F('cinema', 'cinema.trigger', 0, { duration: LENGTH, impact: IMPACT, ...(o.params ?? {}) }), ...(o.extras ?? [])], { duration: LENGTH, hold: 0, screens: { from: o.back ?? 'reels' } }), { tags: ['feature', 'trigger', 'cinematic', 'message'], inputs, group: 'Feature triggers' });
}

export function triggers(): Preset[] {
  return [
    trigger({ slug: 'trigger-bonus', name: 'Bonus triggered', description: 'Letterbox bars close in and the picture pushes toward the middle; on the beat BONUS slams down in a flash, rays and rings.', title: 'BONUS!', sub: 'FEATURE UNLOCKED', style: 'gold-chunky',
      extras: [F('spark', 'light.sparkle', IMPACT + 0.3, { cy: 0.45, width: 1.1, height: 0.25, duration: 2, count: 16 })] }),
    trigger({ slug: 'trigger-free-spins', name: 'Free spins triggered', description: 'The same cinematic with a violet light: FREE SPINS slams in and the number of spins counts up under it.', title: 'FREE SPINS', size: 0.15, count: 10, style: 'candy-bubble', params: { tint: '#c89aff', edge: '#c89aff' },
      extras: [F('confetti', 'celebrate.confetti', IMPACT + 0.1, { cy: 0.4, count: 70 })] }),
    trigger({ slug: 'trigger-hold-and-win', name: 'Hold and win', description: 'A cooler green flash and a slower, deeper push: the hold-and-win feature starting.', title: 'HOLD & WIN', size: 0.16, sub: 'LOCK THEM IN', style: 'neon-sign', params: { tint: '#5affc0', edge: '#5affc0', zoom: 0.18, punch: 0.04 } }),
    trigger({ slug: 'trigger-jackpot', name: 'Jackpot trigger', description: 'The hardest hit: a white flash, sixteen rays, three rings and a jolt of shake before JACKPOT lands.', title: 'JACKPOT', size: 0.22, style: 'comic-boom', params: { flash: 1.6, rays: 1.6, rings: 3, punch: 0.1, shake: 0.012, bars: 0.14, tint: '#ff5a3a', edge: '#ffd24a' },
      extras: [F('coins', 'celebrate.coins', IMPACT + 0.2, { origin: 'rain', count: 60 })] }),
    trigger({ slug: 'trigger-pushin', name: 'Cinematic push-in', description: 'No text: the bars close in and the picture slowly pushes in, a soft flash on the beat, then everything eases back. For building tension.', params: { zoom: 0.22, punch: 0.02, flash: 0.35, rays: 0, rings: 1, shake: 0.002 } }),
    trigger({ slug: 'trigger-snap-bars', name: 'Bars snap shut', description: 'The picture is untouched until the beat, when the bars snap shut with a punch and a flash.', title: 'LET’S GO!', size: 0.17, style: 'comic-boom', params: { bars_in: 'snap', zoom: 0.06, punch: 0.1, shake: 0.01 } }),
    trigger({ slug: 'trigger-wide', name: 'Wide letterbox', description: 'Tall bars and a long slow push: the cinematic look without any flash.', params: { bars: 0.2, zoom: 0.16, punch: 0, flash: 0, rays: 0, rings: 0, shake: 0 } }),
  ];
}
