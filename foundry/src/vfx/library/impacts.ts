import type { Preset } from '../model/preset';
import { F, preset, scene } from './kit';

const CAT = 'impacts' as const;
const solo = (slug: string, name: string, description: string, fx: ReturnType<typeof F>[], o: { status?: 'approved' | 'archived' | 'experimental' | 'stable'; tags?: string[] } = {}): Preset =>
  preset(CAT, slug, name, description, scene([], fx, { hold: 0 }), { status: o.status ?? 'stable', tags: ['impact', 'full-screen', ...(o.tags ?? [])] });

/**
 * The approved looks are exactly the effects' own defaults: no parameter is overridden, so they cannot drift.
 * Shockwave and Vortex are approved and frozen; Plasma is the clean-ending version 2 (version 1 lives under Archived).
 */
export function impacts(): Preset[] {
  return [
    solo('shockwave', 'Shockwave', 'Real texture displacement radiating from the point of impact: a brief squeeze, a travelling crest with a trailing trough, restrained colour split and a thin ring of light. Approved: unchanged.', [F('shockwave', 'shockwave', 0.1)], { status: 'approved', tags: ['approved'] }),
    solo('vortex', 'Vortex', 'An implosion that pulls, twists and releases the picture. Approved: unchanged; no smoke, no extra particles.', [F('vortex', 'vortex', 0.1)], { status: 'approved', tags: ['approved'] }),
    solo('plasma', 'Plasma impact', 'A charged impact with branching electricity and a clean ending: the discharge dissipates, a brief glow remains, and everything fades. Version 2 (no smoke).', [F('plasma', 'plasma', 0.1)], { tags: ['plasma'] }),
    solo('slam', 'Slam', 'A heavy hit: the whole screen punches in, shakes, and a ring of dust bursts out.', [F('slam', 'impact.slam', 0.15)]),
    solo('lightning', 'Lightning strike', 'A branching bolt cracks down from the top of the screen and hits the centre with a blinding flash.', [F('bolt', 'impact.lightning', 0.15, { cy: 0.6 })]),
    solo('comic-burst', 'Comic burst', 'Hard radial speed lines and a starburst, like a cartoon impact.', [F('burst', 'impact.burst', 0.15)]),
    solo('ground-pound', 'Ground pound', 'Something heavy lands: the ground shakes, flat shock rings race sideways and dust billows.', [F('pound', 'impact.pound', 0.15)]),
    solo('flash', 'Flash', 'A short, compact impact flash: hot core, glint and a faint exposure punch.', [F('flash', 'flash', 0.15)], { tags: ['light'] }),
    solo('shake', 'Screen shake', 'A decaying camera shake of the whole scene. The camera zooms with the shake so no edge is ever exposed.', [F('shake', 'shake', 0.15)]),
    solo('combo-hit', 'Combo hit', 'A slam, a subtle shockwave, a flash and a burst of sparks together: a ready-made big hit.', [
      F('slam', 'impact.slam', 0.15, { strength: 0.9 }), F('shock', 'shockwave', 0.17, { strength: 0.55, distortion: 0.7, radius: 0.9, duration: 1 }), F('flash', 'flash', 0.15, { size: 0.16 }),
      F('sparks', 'particles', 0.17, { count: 36, kind: 'sparks', speed: 1.3 }),
    ]),
  ];
}

/** Presets that are not part of the ten categories: kept reachable under Archived / Experimental. */
export function legacy(): Preset[] {
  return [
    preset(CAT, 'plasma-v1', 'Plasma impact (version 1)', 'The plasma as first approved, before the ending change: it finishes with smoke and a scorch. Archived and frozen; kept so earlier work stays reproducible.', scene([], [F('plasma', 'plasma-v1', 0.1)], { hold: 0 }), { status: 'archived', tags: ['archived', 'plasma'] }),
    preset(CAT, 'smoke', 'Smoke burst', 'Rejected in review (outlined, illustrated, not atmospheric). Kept only as an experiment. If revisited: no dark outlines, soft transparent edges, irregular overlapping opacity, fewer and smaller forms, slower expansion, colour sampled from the scene.', scene([], [F('smoke', 'smoke', 0.1)], { hold: 0 }), { status: 'experimental', tags: ['experimental', 'smoke'] }),
  ];
}

const GS = 'Screen shakes', GI = 'Screen impacts';
const mk = (slug: string, name: string, description: string, fx: ReturnType<typeof F>[], group: string, tags: string[] = [], dur?: number): Preset =>
  preset(CAT, slug, name, description, scene([], fx, { hold: 0, ...(dur ? { duration: dur } : {}) }), { status: 'stable', tags: ['impact', 'full-screen', ...tags], group });

/** More screen shakes and impacts, each a small combination so it reads as a finished hit. */
export function impacts2(): Preset[] {
  return [
    // shakes -----------------------------------------------------------------------------------------------------------------
    mk('shake-tremor', 'Tremor', 'A fine, quick tremor that dies away: the picture shivers.', [F('shake', 'shake', 0.1, { amplitude: 0.004, rotation: 0.1, frequency: 40, decay: 1.4, duration: 0.9 })], GS, ['shake']),
    mk('shake-bump', 'Bump', 'One short, firm bump: something small hits the table.', [F('shake', 'shake', 0.1, { amplitude: 0.009, rotation: 0.25, frequency: 22, decay: 3, duration: 0.3 })], GS, ['shake']),
    mk('shake-hit', 'Hard hit', 'A hard, clean hit that shakes the picture sharply and settles.', [F('shake', 'shake', 0.1, { amplitude: 0.02, rotation: 0.7, frequency: 28, decay: 2.2, duration: 0.5 }), F('flash', 'flash', 0.1, { size: 0.12, cy: 0.5 })], GS, ['shake']),
    mk('shake-quake', 'Earthquake', 'A long, rolling quake: strong and slow, with a second wave under it.', [F('shake', 'shake', 0.1, { amplitude: 0.014, rotation: 0.6, frequency: 12, decay: 1.2, duration: 2.4 }), F('shake2', 'shake', 0.4, { amplitude: 0.006, rotation: 0.2, frequency: 31, decay: 1.5, duration: 2 })], GS, ['shake']),
    mk('shake-aftershocks', 'Quake and aftershocks', 'A big shake followed by two smaller aftershocks.', [F('s1', 'shake', 0.1, { amplitude: 0.022, rotation: 0.7, frequency: 20, decay: 1.8, duration: 1 }), F('s2', 'shake', 1.3, { amplitude: 0.011, rotation: 0.3, frequency: 24, decay: 2, duration: 0.7 }), F('s3', 'shake', 2.2, { amplitude: 0.005, rotation: 0.15, frequency: 26, decay: 2.2, duration: 0.5 })], GS, ['shake']),
    mk('shake-engine', 'Engine rumble', 'A steady low rumble: a vibration with no decay for the length of a held moment.', [F('s1', 'shake', 0.1, { amplitude: 0.0035, rotation: 0.08, frequency: 34, decay: 0.8, duration: 1.5 }), F('s2', 'shake', 1.5, { amplitude: 0.0035, rotation: 0.08, frequency: 36, decay: 0.8, duration: 1.5 }), F('s3', 'shake', 3.0, { amplitude: 0.0035, rotation: 0.08, frequency: 34, decay: 0.8, duration: 1.5 })], GS, ['shake'], 4.8),
    mk('shake-thud', 'Thud', 'A heavy, quiet hit: the picture drops a hair and comes back with a low pulse of light.', [F('thud', 'impact.thud', 0.1)], GS, ['shake']),
    mk('shake-thud-heavy', 'Heavy thud', 'The same thud, deeper and slower.', [F('thud', 'impact.thud', 0.1, { strength: 1.5, depth: 0.03, duration: 1 })], GS, ['shake']),
    mk('shake-recoil', 'Recoil', 'The picture punches toward you, draws back and settles in two soft swings.', [F('recoil', 'impact.recoil', 0.1)], GS, ['shake']),
    mk('shake-heartbeat', 'Heartbeat', 'Two beats and a rest, the edges pulsing red: tension.', [F('beat', 'impact.heartbeat', 0.1)], GS, ['shake', 'tension']),
    mk('shake-footsteps', 'Footsteps', 'Something huge walks closer, each step harder than the last, with a low ring of dust.', [F('steps', 'impact.stomp', 0.1)], GS, ['shake']),
    mk('shake-wave', 'Rolling wave', 'A wave of force rolls across the screen from the left, bending the picture as it passes.', [F('wave', 'impact.wave', 0.1)], GS, ['shake']),
    mk('shake-wave-up', 'Wave from below', 'The same wave rising from the bottom of the screen.', [F('wave', 'impact.wave', 0.1, { from: 'bottom' })], GS, ['shake']),
    // impacts ----------------------------------------------------------------------------------------------------------------
    mk('impact-blast', 'Blast', 'An explosion at the centre: a flash, a fireball with a shock ring, a real shove through the picture, smoke and sparks.', [F('blast', 'impact.blast', 0.1)], GI, ['fire']),
    mk('impact-blast-blue', 'Blue blast', 'The same blast in blue flame.', [F('blast', 'impact.blast', 0.1, { fire: 'blue' })], GI, ['fire']),
    mk('impact-blast-violet', 'Violet blast', 'The same blast in violet flame.', [F('blast', 'impact.blast', 0.1, { fire: 'violet' })], GI, ['fire']),
    mk('impact-blast-big', 'Huge blast', 'A big, slow blast with a long shake and a lot of smoke.', [F('blast', 'impact.blast', 0.1, { strength: 1.6, duration: 2.6 })], GI, ['fire']),
    mk('impact-crack', 'Cracked screen', 'The hit lands and the screen cracks from the point of impact: white fractures race out and stay a moment.', [F('crack', 'impact.crack', 0.1)], GI, ['glass']),
    mk('impact-crack-low', 'Cracked screen, from below', 'The same crack centred low on the screen.', [F('crack', 'impact.crack', 0.1, { cy: 0.78, seed: 9 })], GI, ['glass']),
    mk('impact-crack-slam', 'Slam and crack', 'A heavy slam, a shockwave and then the glass cracks.', [F('slam', 'impact.slam', 0.1), F('crack', 'impact.crack', 0.12, { seed: 6 }), F('shock', 'shockwave', 0.12, { strength: 0.45, distortion: 0.6, radius: 0.8, duration: 1 })], GI, ['glass']),
    mk('impact-thunder', 'Thunder', 'The sky flashes white, a fork of lightning stands for an instant, and the thunder arrives a beat later and rolls away.', [F('thunder', 'impact.thunder', 0.1)], GI, ['lightning']),
    mk('impact-thunder-violet', 'Violet thunder', 'The same strike in violet light.', [F('thunder', 'impact.thunder', 0.1, { tint: '#c8a0ff', seed: 8 })], GI, ['lightning']),
    mk('impact-storm-red', 'Red storm', 'Dark billowing cloud fills the screen and is lit from inside by flashes of red lightning, each with a shake.', [F('storm', 'impact.storm', 0.1)], GI, ['storm', 'lightning'], 6.2),
    mk('impact-storm-blue', 'Blue storm', 'The same storm in cold blue light.', [F('storm', 'impact.storm', 0.1, { tint: '#5aa8ff', seed: 7 })], GI, ['storm', 'lightning'], 6.2),
    mk('impact-storm-violet', 'Violet storm', 'The same storm in violet.', [F('storm', 'impact.storm', 0.1, { tint: '#b46aff', seed: 9, flashes: 6 })], GI, ['storm', 'lightning'], 6.2),
    mk('impact-storm-gold', 'Golden storm', 'A storm cloud lit from inside with golden light: a jackpot sky.', [F('storm', 'impact.storm', 0.1, { tint: '#ffb02a', seed: 5, flashes: 6 })], GI, ['storm', 'lightning'], 6.2),
    mk('impact-storm-quiet', 'Slow storm', 'Fewer, slower flashes in the dark cloud, a low shake with each: for a build-up.', [F('storm', 'impact.storm', 0.1, { flashes: 3, shake: 0.3, duration: 7 })], GI, ['storm', 'lightning'], 7.2),
    mk('impact-combo-hit', 'Hit and recoil', 'A thud, a recoil and a ring of light together: the way a big win lands.', [F('thud', 'impact.thud', 0.1, { strength: 1.2 }), F('recoil', 'impact.recoil', 0.12, { strength: 0.8 })], GI, ['combo']),
    mk('impact-combo-boom', 'Boom and shockwave', 'A blast with a shockwave through the picture and a hard shake.', [F('blast', 'impact.blast', 0.1, { strength: 1.1 }), F('shock', 'shockwave', 0.12, { strength: 0.6, distortion: 0.8, radius: 1, duration: 1.2 })], GI, ['combo']),
  ];
}
