/** Transitions between screens: fire, smoke, ice, glass, lasers and more, each between two stand-in pictures (never part of an export). */
import type { Preset } from '../model/preset';
import { F, preset, scene } from './kit';

const CAT = 'screen-distortion' as const;
const GROUP = 'Transitions between screens';

type Screen = 'reels' | 'barn' | 'night' | 'daylight' | 'bonus' | 'lava';
function tr(slug: string, name: string, description: string, effect: string, from: Screen, to: Screen, params: Record<string, number | string | boolean> = {}): Preset {
  return preset(CAT, slug, name, description, scene([], [F('transition', effect, 0.45, params)], { hold: 0, screens: { from, to } }), { tags: ['transition', 'screen'], group: GROUP });
}

export function transitions(): Preset[] {
  return [
    tr('burn', 'Burn through', 'The first screen catches fire and burns away like paper, flames licking along the edge, until the next screen is all that is left.', 'transition.burn', 'reels', 'bonus'),
    tr('burn-blue', 'Burn through, blue flame', 'The same burn from the top down, in cold blue flame with white smoke.', 'transition.burn', 'barn', 'daylight', { dir: 'down', fire: 'blue', smoke: 'grey' }),
    tr('burn-hole', 'Burn a hole', 'A hole burns open in the first screen and grows outward in a ring of flame, showing the next screen through it.', 'transition.burn-hole', 'reels', 'daylight'),
    tr('fire-wall', 'Wall of fire', 'A towering wall of flame and rolling fireballs sweeps across the screen, and the next screen is standing behind it.', 'transition.fire-wall', 'bonus', 'reels'),
    tr('fire-wall-violet', 'Violet fire wall', 'A wall of magic violet fire sweeps from right to left.', 'transition.fire-wall', 'daylight', 'night', { dir: 'left', fire: 'violet', smoke: 'purple' }),
    tr('smoke', 'Smoke cover', 'Billowing smoke rolls over the screen until nothing shows, and when it clears the next screen is there.', 'transition.smoke', 'reels', 'bonus'),
    tr('smoke-black', 'Black smoke', 'Thick black soot rolls up the screen and swallows it.', 'transition.smoke', 'daylight', 'lava', { smoke: 'black' }),
    tr('smoke-magic', 'Magic smoke', 'Purple magic fumes billow over the first screen and clear on the next.', 'transition.smoke', 'night', 'bonus', { smoke: 'purple', dir: 'right' }),
    tr('steam-fog', 'Steam fog', 'White steam rolls in from above and lifts off the next screen.', 'transition.smoke', 'daylight', 'reels', { smoke: 'white', dir: 'down' }),
    tr('ink', 'Ink bleed', 'Ink blooms from a point and floods the screen; it drains away to leave the next screen.', 'transition.ink', 'bonus', 'night'),
    tr('ice', 'Freeze and shatter', 'Frost creeps in from the edges and ice spikes grow over the first screen; a crack, and it shatters into glittering ice to show the next one.', 'transition.ice', 'reels', 'daylight'),
    tr('glass', 'Glass break', 'Cracks spread from a hit in the first screen, then it falls apart in shards and the next screen is behind it.', 'transition.glass', 'reels', 'daylight'),
    tr('glass-corner', 'Glass break, off-centre', 'The glass is hit near the top left and shatters outward.', 'transition.glass', 'bonus', 'night', { cx: 0.28, cy: 0.3 }),
    tr('lasers', 'Laser scan', 'Rows of cyan laser beams sweep across the screen, each leaving the next screen behind it.', 'transition.lasers', 'reels', 'lava'),
    tr('lasers-red', 'Red laser scan', 'Red laser rows scan the first screen away.', 'transition.lasers', 'daylight', 'reels', { laser: 'red', rows: 14 }),
    tr('laser-cut', 'Laser cut', 'Laser beams slice the first screen into slabs that slide apart along the glowing cuts, uncovering the next screen.', 'transition.laser-cut', 'bonus', 'reels'),
    tr('shock', 'Shockwave wipe', 'A shockwave bursts outward and bends the first screen; behind its front the next screen is already there.', 'transition.shock', 'reels', 'bonus'),
    tr('portal', 'Portal', 'A glowing portal tears open and swirls wider, pulling the first screen into it and showing the next.', 'transition.portal', 'night', 'bonus'),
    tr('portal-green', 'Green portal', 'A toxic-green portal opens from the left.', 'transition.portal', 'daylight', 'lava', { tint: '#6bff8a', cx: 0.25, cy: 0.55 }),
    tr('whirlpool', 'Whirlpool', 'The first screen twists into a whirlpool, flashes at the centre and unwinds into the next screen.', 'transition.vortex', 'reels', 'daylight'),
    tr('lightning', 'Lightning flash', 'Bolts crack down, the screen whites out in a blinding flash, and the next screen is there as it fades back.', 'transition.lightning', 'night', 'daylight'),
    tr('pixels', 'Pixel dissolve', 'The picture breaks into blocks that flash and switch to the next screen one by one.', 'transition.pixels', 'reels', 'bonus'),
    tr('tile-flip', 'Tile flip', 'The screen is a grid of tiles that turn over one after another, each showing the next screen on its back.', 'transition.tile-flip', 'bonus', 'reels'),
    tr('blinds', 'Blinds', 'The screen is cut into slats that turn like venetian blinds to show the next screen.', 'transition.blinds', 'daylight', 'reels'),
    tr('glitch-cut', 'Glitch cut', 'The picture tears into shifted rows, splits into colours and flickers between the two screens before it settles on the next.', 'transition.glitch', 'reels', 'lava'),
    tr('zoom', 'Zoom through', 'The camera plunges into the first screen in a rush of motion blur and bursts out into the next.', 'transition.zoom', 'reels', 'bonus'),
  ];
}
