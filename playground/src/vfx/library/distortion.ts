import type { Preset } from '../model/preset';
import { F, T, mo, motion, preset, scene, textIn, ts } from './kit';

const CAT = 'screen-distortion' as const;

/** A static line of text sits in the picture, so you can see the distortion bend content as well as the backdrop. */
function dist(slug: string, name: string, description: string, effect: string, params: Record<string, number | string | boolean> = {}, start = 0.6): Preset {
  const label = T('label', 'BIG WIN', { size: 0.2, y: 0.5, style: ts('gold-chunky'), motion: motion({ entrance: mo.in('fade-in', { duration: 0.3 }) }) });
  return preset(CAT, slug, name, description, scene([label], [F('distort', effect, start, params)], { hold: 0.5 }), { tags: ['distortion', 'screen'], inputs: [textIn('label', 'Text')], group: 'Bend the picture' });
}

export function distortion(): Preset[] {
  return [
    dist('ripple', 'Water ripple', 'Concentric rings travel outward and bend everything they pass, backdrop and text alike.', 'distort.ripple', { amplitude: 0.017, shine: 0.8 }),
    dist('lens-bulge', 'Lens bulge', 'A section of the picture swells like a magnifying glass.', 'distort.lens', { mode: 'bulge', strength: 0.75 }),
    dist('lens-pinch', 'Lens pinch', 'The picture is squeezed toward a point and released.', 'distort.lens', { mode: 'pinch', strength: 0.7 }),
    dist('heat-haze', 'Heat haze', 'The air shimmers: a slow wobbling shimmer rising through the picture.', 'distort.heat', { amplitude: 0.01 }, 0.3),
    dist('glitch', 'Digital glitch', 'Slices of the picture jump sideways with colour tearing, in short bursts.', 'distort.glitch', {}, 0.5),
    dist('wobble', 'Wobble', 'The picture sways like jelly or underwater.', 'distort.wave', { amplitude: 0.016 }, 0.4),
    dist('zoom-punch', 'Zoom punch', 'A radial rush toward the centre: a speed punch.', 'distort.zoom', { strength: 0.2 }),
    dist('colour-split', 'Colour split', 'Red and blue slide apart toward the edges, then snap back.', 'distort.chroma', { amount: 0.04 }),
    dist('pixelate', 'Pixelate pulse', 'The picture breaks into blocks and resolves again.', 'distort.pixelate', {}),
    dist('crt', 'CRT scanlines', 'Old-monitor scanlines drift down the picture with a darkened vignette.', 'distort.scan', {}, 0.3),
    dist('shear-hit', 'Shear hit', 'The picture slams sideways and wobbles back, like a heavy hit.', 'distort.shear', { amount: 0.12 }),
  ];
}
