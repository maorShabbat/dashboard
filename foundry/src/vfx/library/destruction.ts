import { defaultsOf } from '../fx/effect';
import { effectById } from '../fx';
import type { Preset } from '../model/preset';
import type { FxLayer } from '../model/scene';
import { F, I, imageIn, mo, motion, preset, scene } from './kit';

const CAT = 'symbol-destruction' as const;
const START = 1.1;

/** A companion started on the target's impact moment, the same way the approved fragmentation presets do it. */
function companion(id: string, effect: string, baseStart: number, baseImpact: number, over: Record<string, number | string | boolean> = {}, offset = 0): FxLayer {
  const e = effectById(effect)!;
  const subtle = e.companion?.subtle ?? {};
  const params = { ...defaultsOf(e), ...subtle, ...over };
  const start = baseStart + baseImpact + offset - (e.impactAt?.(params) ?? 0);
  return F(id, effect, Math.max(0, start), { ...subtle, ...over }, { target: 'sym', amount: 1 });
}

const sym = (asset: string, y = 0.55) => I('sym', asset, { name: 'Symbol', size: 0.3, y, motion: motion({ entrance: mo.in('pop', { duration: 0.5 }), idle: mo.in('float', { start: 0.55 }) }) });

function destroy(slug: string, name: string, description: string, effect: string, asset: string, params: Record<string, number | string | boolean> = {}, extra: FxLayer[] = [], tags: string[] = []): Preset {
  const main = F('destroy', effect, START, params, { target: 'sym' });
  return preset(CAT, slug, name, description, scene([sym(asset)], [main, ...extra], { hold: 0.2 }), { tags: ['symbol', 'destroy', ...tags], inputs: [imageIn('sym', 'Symbol (PNG or WebM)')] });
}

/** A whole symbol tile: a frame and the symbol in it, destroyed together (the player composes them into one picture). */
function tile(slug: string, name: string, description: string, effect: string, frameAsset: string, icon: string, params: Record<string, number | string | boolean> = {}): Preset {
  const e = effectById(effect)!, pop = (start: number) => motion({ entrance: mo.in('pop', { duration: 0.5, start }) });
  const fits = { ...(e.params.some((d) => d.key === 'area') ? { area: 'cell' } : {}), ...(e.params.some((d) => d.key === 'cell') ? { cell: 1 } : {}) };
  const frame = I('frame', frameAsset, { name: 'Symbol frame', role: 'background', size: 0.36, y: 0.55, motion: pop(0) });
  const sym = I('sym', icon, { name: 'Symbol', size: 0.23, y: 0.55, motion: pop(0.06) });
  const main = F('destroy', effect, START, { ...fits, ...params }, { target: 'sym', frame: 'frame' });
  return preset(CAT, slug, name, description, scene([frame, sym], [main], { hold: 0.2 }), { tags: ['symbol', 'frame', 'tile', 'destroy'], inputs: [imageIn('sym', 'Symbol (PNG or WebM)'), imageIn('frame', 'Frame (PNG or WebM)')] });
}

const TILE_SLUGS = ['tile-shatter', 'tile-explode', 'tile-fireball', 'tile-bomb', 'tile-chain', 'tile-inferno', 'tile-smoke-bomb', 'tile-steam', 'tile-ash', 'tile-embers', 'tile-sparks', 'tile-confetti', 'tile-gems', 'tile-ice', 'tile-acid', 'tile-lightning', 'tile-dust', 'tile-pixelate'];

const GROUPS: [string, string[]][] = [
  ['Breaking apart', ['fragment', 'fragment-shockwave', 'fragment-plasma', 'fragment-vortex', 'shatter', 'explode', 'pop', 'slice', 'pixelate', 'implode', 'spin']],
  ['Fire and explosions', ['fireball', 'fireball-blue', 'inferno', 'inferno-violet', 'bomb', 'chain', 'flame-burst', 'lightning']],
  ['Smoke and steam', ['smoke-vanish', 'smoke-bomb', 'smoke-bomb-magic', 'toxic-cloud', 'steam']],
  ['Burning away', ['burn', 'ash', 'embers']],
  ['Sparks, confetti and gems', ['sparks', 'confetti-pop', 'gems']],
  ['Melting, freezing and dissolving', ['dissolve', 'dust', 'melt', 'ice', 'acid']],
  ['Whole tile: frame and symbol together', TILE_SLUGS],
];

export function destruction(): Preset[] {
  return grouped(all());
}

function grouped(list: Preset[]): Preset[] {
  const order = new Map<string, { g: string; i: number }>();
  GROUPS.forEach(([g, slugs], gi) => slugs.forEach((slug, i) => order.set(`${CAT}.${slug}`, { g, i: gi * 100 + i })));
  const rank = (p: Preset) => order.get(p.id)?.i ?? 9999;
  return list.map((p) => (order.has(p.id) ? { ...p, group: order.get(p.id)!.g } : { ...p, group: 'Not a destruction' })).sort((a, b) => rank(a) - rank(b));
}

function all(): Preset[] {
  const fr = defaultsOf(effectById('fragment')!);
  const impact = Number(fr.buildup);
  const base = (): FxLayer[] => [companion('flash', 'flash', START, impact, { tint: '#fff1cf' }), companion('shake', 'shake', START, impact), companion('sparks', 'particles', START, impact, { fromObject: true })];
  return [
    destroy('fragment', 'Fragment', 'Cracks from the inside, then breaks into pieces cut from the symbol\'s own pixels that fly outward and vanish. One way: it never comes back.', 'fragment', 'builtin:gem', {}, base(), ['approved-look']),
    destroy('fragment-shockwave', 'Fragment + shockwave', 'The fragmentation with a subtle shockwave rolling out from the break.', 'fragment', 'builtin:gem', {}, [...base(), companion('shock', 'shockwave', START, impact)]),
    destroy('fragment-plasma', 'Fragment + plasma', 'The fragmentation hit by a reduced plasma discharge (the plasma supplies the flash).', 'fragment', 'builtin:horseshoe', {}, [companion('plasma', 'plasma', START, impact), companion('shake', 'shake', START, impact), companion('sparks', 'particles', START, impact, { fromObject: true })]),
    destroy('fragment-vortex', 'Fragment + vortex', 'The fragmentation while a reduced vortex pulls the background toward the break.', 'fragment', 'builtin:star', {}, [...base(), companion('vortex', 'vortex', START, impact)]),
    destroy('shatter', 'Shatter', 'A sharp crack, then large angular pieces fall away spinning, like glass.', 'destroy.shatter', 'builtin:gem', {}, [F('sparks', 'particles', START + 0.07, { cy: 0.55, count: 14, kind: 'sparks', tint: '#cfeaff', lifetime: 0.6 })]),
    destroy('explode', 'Explode', 'The symbol swells and whitens, then bursts into many fast fragments with a flash, a ring and embers.', 'destroy.explode', 'builtin:seven', {}, [F('shake', 'shake', START + 0.16, { amplitude: 0.008, duration: 0.35 })]),
    destroy('pop', 'Pop', 'Inflates like a bubble, wobbles, and pops into a ring and droplets.', 'destroy.pop', 'builtin:cherry', {}),
    destroy('dissolve', 'Dissolve', 'The symbol eats itself away through noise with a glowing edge.', 'destroy.dissolve', 'builtin:crown', {}),
    destroy('burn', 'Burn away', 'A flame front climbs the symbol, leaving char that crumbles to embers.', 'destroy.burn', 'builtin:horseshoe', {}),
    destroy('dust', 'Turn to dust', 'The symbol crumbles to fine dust that drifts away on the wind.', 'destroy.dust', 'builtin:coin', {}),
    destroy('slice', 'Slice', 'A clean diagonal cut with a bright slash; the halves slide apart and vanish.', 'destroy.slice', 'builtin:bell', {}),
    destroy('pixelate', 'Pixelate away', 'Breaks into coarse blocks that drop out one by one.', 'destroy.pixelate', 'builtin:star', {}),
    destroy('melt', 'Melt', 'Sags and runs downward until it is gone.', 'destroy.melt', 'builtin:heart', {}),
    destroy('implode', 'Implode', 'Spirals into a point, then releases a bright burst.', 'destroy.implode', 'builtin:clover', {}),
    destroy('spin', 'Spin away', 'Spins up, shrinks and whirls out of sight with a glowing trail.', 'destroy.spin', 'builtin:seven', {}),
    destroy('fireball', 'Fireball', 'The symbol swells white-hot, then erupts in a rolling fireball with a flash, a shock ring, flying debris, sparks and black smoke.', 'destroy.fireball', 'builtin:seven', {}),
    destroy('inferno', 'Engulfed in flames', 'Flames rise and lick over the symbol until it burns away, then die back to embers and thin smoke.', 'destroy.inferno', 'builtin:crown', {}),
    destroy('bomb', 'Bomb blast', 'A huge flash and fireball, a shove through the picture, debris and sparks, and a mushroom of black smoke.', 'destroy.bomb', 'builtin:coin', {}),
    destroy('chain', 'Chain reaction', 'Small blasts pop across the symbol one after another, faster and faster, until the last one takes it apart.', 'destroy.chain', 'builtin:horseshoe', {}),
    destroy('flame-burst', 'Flame burst', 'The symbol turns white-hot and tongues of flame shoot out in every direction around a small fireball.', 'destroy.flame-burst', 'builtin:star', {}),
    destroy('fireball-blue', 'Blue fireball', 'The same rolling fireball in cold blue flame with grey smoke.', 'destroy.fireball', 'builtin:gem', { fire: 'blue', smoke: 'grey' }),
    destroy('inferno-violet', 'Violet inferno', 'Magic violet flames climb over the symbol and burn it away into purple smoke.', 'destroy.inferno', 'builtin:star', { fire: 'violet', smoke: 'purple' }),
    destroy('smoke-vanish', 'Vanish in smoke', 'Thick smoke billows out of the symbol and swallows it; when the smoke thins out the symbol is gone.', 'destroy.smoke-vanish', 'builtin:heart', {}),
    destroy('smoke-bomb', 'Smoke bomb', 'A pop, and a rolling cloud bursts outward in rings, hiding the symbol; the cloud lingers, then drifts away.', 'destroy.smoke-bomb', 'builtin:bell', {}),
    destroy('smoke-bomb-magic', 'Magic smoke', 'A purple smoke bomb: the symbol disappears in a swirl of magic fumes.', 'destroy.smoke-bomb', 'builtin:clover', { smoke: 'purple' }),
    destroy('toxic-cloud', 'Toxic cloud', 'A poison-green cloud billows over the symbol and rots it away.', 'destroy.smoke-bomb', 'builtin:cherry', { smoke: 'toxic' }),
    destroy('steam', 'Steam burst', 'The symbol shakes and glows red-hot under pressure, then hisses out in jets of white steam.', 'destroy.steam', 'builtin:coin', {}),
    destroy('ash', 'Burn to ash', 'A glowing front crawls across the symbol, small flames lick up, and what is left crumbles into drifting ash.', 'destroy.ash', 'builtin:seven', {}),
    destroy('embers', 'Turn to embers', 'The symbol chars and glows from within, then lifts off as a cloud of glowing embers that drift up and go out.', 'destroy.embers', 'builtin:crown', {}),
    destroy('sparks', 'Spark burst', 'The symbol flares white and bursts into hundreds of streaking sparks that arc down and burn out.', 'destroy.sparks', 'builtin:gem', {}),
    destroy('confetti-pop', 'Confetti pop', 'The symbol pops like a party popper: its pieces and a burst of confetti fly out, flutter and fall.', 'destroy.confetti-pop', 'builtin:cherry', {}),
    destroy('gems', 'Gem burst', 'The symbol glitters, cracks, and bursts into flying gems and glinting shards with a starburst of light.', 'destroy.gems', 'builtin:crown', {}),
    destroy('ice', 'Freeze and shatter', 'Frost creeps over the symbol and ice spikes grow out of it; one crack and it explodes into glittering ice shards and cold mist.', 'destroy.ice', 'builtin:star', {}),
    destroy('acid', 'Acid melt', 'Toxic green acid eats the symbol: it bubbles, sags and runs into a glowing puddle under rising poison fumes.', 'destroy.acid', 'builtin:heart', {}),
    destroy('lightning', 'Struck by lightning', 'Bolts crack down on the symbol, arcs crawl over it and it chars and crumbles in a shower of sparks and a puff of smoke.', 'destroy.lightning', 'builtin:horseshoe', {}),
    tile('tile-shatter', 'Tile shatters', 'The whole tile, frame and symbol together, cracks and falls apart in large glass-like pieces.', 'destroy.shatter', 'builtin:tile-blue', 'builtin:gem'),
    tile('tile-explode', 'Tile explodes', 'The tile swells, whitens and bursts into fast fragments with a flash, a ring and embers.', 'destroy.explode', 'builtin:tile-gold', 'builtin:seven'),
    tile('tile-fireball', 'Tile fireball', 'The tile heats up and erupts in a rolling fireball that fills the whole square.', 'destroy.fireball', 'builtin:tile-green', 'builtin:cherry'),
    tile('tile-bomb', 'Tile bomb', 'A bomb blast through the whole tile: flash, shock, debris of the frame, a mushroom of smoke.', 'destroy.bomb', 'builtin:tile-wood', 'builtin:coin'),
    tile('tile-chain', 'Tile chain reaction', 'Small blasts pop across the tile one after another until the last one takes it apart.', 'destroy.chain', 'builtin:tile-gold', 'builtin:horseshoe'),
    tile('tile-inferno', 'Tile in flames', 'Flames climb the tile, burn the frame and the symbol, and die back to embers.', 'destroy.inferno', 'builtin:tile-wood', 'builtin:crown'),
    tile('tile-smoke-bomb', 'Tile in a smoke bomb', 'A pop, and a rolling cloud hides the whole tile; the cloud lingers and drifts away.', 'destroy.smoke-bomb', 'builtin:tile-neon', 'builtin:star'),
    tile('tile-steam', 'Tile steam burst', 'The tile shakes red-hot under pressure and vents in jets of steam.', 'destroy.steam', 'builtin:tile-blue', 'builtin:bell'),
    tile('tile-ash', 'Tile burns to ash', 'A glowing front crawls over frame and symbol; what is left crumbles into drifting ash.', 'destroy.ash', 'builtin:tile-wood', 'builtin:clover'),
    tile('tile-embers', 'Tile turns to embers', 'The tile chars and glows from within, then lifts off as a cloud of embers.', 'destroy.embers', 'builtin:tile-gold', 'builtin:heart'),
    tile('tile-sparks', 'Tile spark burst', 'The tile flares and bursts into a shower of streaking sparks.', 'destroy.sparks', 'builtin:tile-neon', 'builtin:gem'),
    tile('tile-confetti', 'Tile confetti pop', 'The tile pops like a party popper: pieces of it and confetti fly out and flutter down.', 'destroy.confetti-pop', 'builtin:tile-green', 'builtin:clover'),
    tile('tile-gems', 'Tile gem burst', 'The tile glitters and bursts into flying gems with a starburst of light.', 'destroy.gems', 'builtin:tile-gold', 'builtin:crown'),
    tile('tile-ice', 'Tile freezes and shatters', 'Frost and ice spikes cover the tile; one crack and it explodes into ice shards and mist.', 'destroy.ice', 'builtin:tile-blue', 'builtin:star'),
    tile('tile-acid', 'Tile dissolves in acid', 'Toxic acid eats the tile and runs into a glowing puddle under green fumes.', 'destroy.acid', 'builtin:tile-green', 'builtin:cherry'),
    tile('tile-lightning', 'Tile struck by lightning', 'Bolts hit the whole tile; arcs crawl over it and it chars and crumbles in sparks and smoke.', 'destroy.lightning', 'builtin:tile-neon', 'builtin:seven'),
    tile('tile-dust', 'Tile turns to dust', 'The tile crumbles to fine dust that drifts away on the wind.', 'destroy.dust', 'builtin:tile-wood', 'builtin:coin'),
    tile('tile-pixelate', 'Tile pixelates away', 'The tile breaks into coarse blocks that drop out one by one.', 'destroy.pixelate', 'builtin:tile-neon', 'builtin:star'),
    preset(CAT, 'win-pop', 'Win pop', 'Not a destruction: the winning symbol hops, swells and glows with a ring and sparkles, then settles.',
      scene([I('sym', 'builtin:crown', { size: 0.3, y: 0.55, motion: motion({ entrance: mo.in('pop', { duration: 0.5 }), emphasis: [mo.in('emph-hop', { start: 1.1 }), mo.in('emph-pulse', { start: 1.1, duration: 0.5, params: { size: 0.22 } }), mo.in('glow-pulse', { start: 1.1 })] }) })],
        [F('halo', 'light.halo', 1.0, { cy: 0.55, size: 0.38, duration: 1.8, pulses: 2 }), F('spark', 'light.sparkle', 1.1, { cy: 0.55, count: 12, duration: 1.2 }, { target: 'sym' })], { hold: 0.9 }),
      { tags: ['symbol', 'win'], inputs: [imageIn('sym', 'Symbol (PNG or WebM)')] }),
  ];
}
