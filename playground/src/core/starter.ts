/** First-run library: two themes, presets and complete sequences. Ids are fixed so docs, tests and bundles can refer to them. */
import { ref, type Value } from './params';
import type { Clip, PresetContent, SeqMarker, SequenceContent, ThemeContent, Track } from './model/types';
import { approveVersion, createAsset, emptyProject, saveVersion } from './model/ops';
import { emptyArtDirection } from './model/defaults';
import { defaultSceneSpec } from './board';
import type { Project } from './model/types';

let n = 0;
function clip(seq: string, effectType: string, start: number, o: { presetId?: string; name?: string; params?: Record<string, Value>; repeat?: Clip['repeat'] } = {}): Clip {
  return {
    id: `${seq}_c${++n}`, name: o.name ?? '', presetId: o.presetId ?? null, effectType, start, overrides: { params: o.params ?? {} },
    repeat: o.repeat ?? { count: 1, step: 80, order: 'forward' }, muted: false,
  };
}
const track = (seq: string, name: string, clips: Clip[]): Track => ({ id: `${seq}_t_${name.toLowerCase().replace(/\W+/g, '')}`, name, muted: false, solo: false, locked: false, clips });
const marker = (seq: string, kind: SeqMarker['kind'], t: number, name: string, gain = 0): SeqMarker => ({ id: `${seq}_m${++n}`, kind, t, name, gain });

export const STARTER_IDS = {
  classic: 'theme_classic', neon: 'theme_neon',
  presets: { epic: 'preset_epic_banner', coinRain: 'preset_coin_rain', confetti: 'preset_confetti', impact: 'preset_heavy_impact', glow: 'preset_soft_glow', freeSpins: 'preset_free_spins', neonPulse: 'preset_neon_pulse' },
  sequences: { bigWin: 'seq_big_win', cascade: 'seq_cascade', freeSpins: 'seq_free_spins', neonWin: 'seq_neon_win' },
} as const;

export function createStarterProject(): Project {
  n = 0;
  let p = emptyProject('BANGERS Studio');
  const S = STARTER_IDS;

  const classic: ThemeContent = {
    tokens: {}, effectDefaults: {}, game: 'BANGERS Slots',
    artDirection: {
      ...emptyArtDirection(),
      summary: 'Loud, inky comic-book energy: thick outlines, halftone dots, hard drop shadows and a snappy overshoot on every pop. Wins feel like a splash page.',
      mood: ['loud', 'inked', 'halftone', 'snappy'],
      references: 'Silver-age comic splash pages; screen-printed gig posters.',
      dos: 'Keep outlines heavy and consistent. Let the win colour be the brightest thing on screen.',
      donts: 'No soft gradients on text. No thin hairline strokes.',
    },
  };
  const neon: ThemeContent = {
    game: 'BANGERS Slots · Night mode',
    artDirection: { ...emptyArtDirection(), summary: 'Late-night arcade: deep navy, magenta and cyan neon, thin crisp outlines and springy motion.', mood: ['neon', 'electric', 'crisp'], references: 'Synthwave posters; arcade cabinets.', dos: 'Glow carries the hierarchy.', donts: 'Avoid warm browns.' },
    tokens: {
      'color.background': '#05060f', 'color.backgroundAlt': '#0d1030', 'color.surface': '#0c1232', 'color.surfaceAlt': '#16205a', 'color.primary': '#ff2bd6',
      'color.secondary': '#18f2ff', 'color.accent': '#b6ff3b', 'color.win': '#fff35c', 'color.glow': '#18f2ff', 'color.outline': '#02030a',
      'outline.width': 2, 'surface.texture': 'grid', 'surface.cornerRadius': 8, 'depth.extrude': 2, 'depth.shadowOffsetY': 4, 'board.cellRadius': 10,
      'motion.easing': 'spring', 'motion.springDamping': 0.55, 'motion.durationScale': 0.9, 'intensity.glow': 1.3,
      'type.display.family': 'anton', 'type.display.size': 80, 'type.display.letterSpacing': 0.06,
    },
    effectDefaults: { shockwave: { params: { rings: 3 } }, symbolHighlight: { params: { pulses: 2 } } },
  };
  p = createAsset(p, 'theme', 'BANGERS Classic', classic, { id: S.classic, description: 'The house look. Pure BANGERS defaults, documented art direction.', tags: ['house', 'comic'] }).project;
  p = createAsset(p, 'theme', 'Neon Night', neon, { id: S.neon, description: 'A cooler night-mode variant used to prove the inheritance chain.', tags: ['variant'] }).project;

  const preset = (id: string, name: string, effectType: string, themeId: string, params: Record<string, Value>, description = ''): void => {
    const content: PresetContent = { effectType, themeId, link: 'linked', snapshot: null, overrides: { params } };
    p = createAsset(p, 'preset', name, content, { id, description }).project;
  };
  preset(S.presets.epic, 'Epic win banner', 'bigWinBanner', S.classic, { tier: 'epic', rayCount: 24, duration: 4200, raySpeed: 32 }, 'Top-tier win: more rays, longer hold.');
  preset(S.presets.coinRain, 'Gold coin rain', 'coinBurst', S.classic, { origin: 'topCentre', direction: 90, spread: 130, count: 120, speed: 500, gravity: 1400, burstWindow: 40, duration: 2400 }, 'Coins fall from the top of the board.');
  preset(S.presets.confetti, 'Confetti pop', 'coinBurst', S.classic, { shape: 'confetti', count: 90, spread: 220, speed: 1100, colorA: ref('color.primary') }, 'Multi-colour confetti burst from the centre.');
  preset(S.presets.impact, 'Heavy impact', 'screenShake', S.classic, { amplitude: 14, frequency: 14, duration: 800, rotation: 1.2, zoomPunch: 3 }, 'Weighty hit for big moments.');
  preset(S.presets.glow, 'Soft win glow', 'symbolHighlight', S.classic, { pulses: 2, dimOthers: 15, pulseScale: 1.06, cellStagger: 90 }, 'Gentle highlight for ordinary wins.');
  preset(S.presets.freeSpins, 'Free spins callout', 'textCallout', S.classic, { text: 'FREE SPINS', sizeMul: 1.1, hold: 60, duration: 1800 }, 'Feature trigger announcement.');
  preset(S.presets.neonPulse, 'Neon pulse', 'shockwave', S.neon, { rings: 4, ringStagger: 90, color: ref('color.accent') }, 'Cyan/lime concentric rings for the night theme.');

  const seq = (id: string, name: string, description: string, content: SequenceContent): void => { p = createAsset(p, 'sequence', name, content, { id, description }).project; };
  const sid = S.sequences;
  seq(sid.bigWin, 'Big win celebration', 'Impact → highlight → rings → coin rain → banner, with cues and host events.', {
    themeId: S.classic, scene: { ...defaultSceneSpec(), pattern: 'line', winAmount: 1234.5, seed: 7 }, fixedDuration: null,
    tracks: [
      track(sid.bigWin, 'Camera', [clip(sid.bigWin, 'screenShake', 0, { presetId: S.presets.impact, name: 'Impact' }), clip(sid.bigWin, 'flash', 0, { name: 'Flash', params: { duration: 380, peak: 70 } })]),
      track(sid.bigWin, 'Board', [clip(sid.bigWin, 'symbolHighlight', 120, { presetId: S.presets.glow, name: 'Highlight' }), clip(sid.bigWin, 'winLine', 120, { name: 'Win line' })]),
      track(sid.bigWin, 'FX', [
        clip(sid.bigWin, 'shockwave', 250, { name: 'Rings' }),
        clip(sid.bigWin, 'coinBurst', 350, { presetId: S.presets.coinRain, name: 'Coin rain' }),
        clip(sid.bigWin, 'coinBurst', 700, { presetId: S.presets.confetti, name: 'Confetti', repeat: { count: 2, step: 250, order: 'forward' } }),
      ]),
      track(sid.bigWin, 'Banner', [clip(sid.bigWin, 'bigWinBanner', 500, { presetId: S.presets.epic, name: 'Epic banner' })]),
    ],
    markers: [marker(sid.bigWin, 'event', 0, 'celebration.start'), marker(sid.bigWin, 'cue', 500, 'win.mega'), marker(sid.bigWin, 'event', 3300, 'counter.done'), marker(sid.bigWin, 'event', 4700, 'celebration.end')],
  });
  seq(sid.cascade, 'Cascade win', 'Highlight, pop the cluster, drop new symbols, multiplier lands, highlight again.', {
    themeId: S.classic, scene: { ...defaultSceneSpec(), cols: 6, rows: 5, pattern: 'cluster', seed: 11, winAmount: 240, multiplier: 2 }, fixedDuration: null,
    tracks: [
      track(sid.cascade, 'Symbols', [clip(sid.cascade, 'symbolHighlight', 0, { presetId: S.presets.glow, name: 'Highlight 1' }), clip(sid.cascade, 'cascadeDrop', 1000, { name: 'Cascade' }), clip(sid.cascade, 'symbolHighlight', 2300, { name: 'Highlight 2', params: { pulses: 2 } })]),
      track(sid.cascade, 'Badges', [clip(sid.cascade, 'multiplierPop', 1500, { name: 'x2', params: { value: 2, target: 'lastWin' } }), clip(sid.cascade, 'shine', 1900, { name: 'Shine' })]),
    ],
    markers: [marker(sid.cascade, 'event', 1000, 'cascade.step'), marker(sid.cascade, 'event', 2300, 'cascade.settled')],
  });
  seq(sid.freeSpins, 'Free spins intro', 'Tension builds, then the feature is announced.', {
    themeId: S.classic, scene: { ...defaultSceneSpec(), pattern: 'scatter', seed: 5, winAmount: 0 }, fixedDuration: null,
    tracks: [
      track(sid.freeSpins, 'Tension', [clip(sid.freeSpins, 'anticipationGlow', 0, { name: 'Anticipation', params: { target: 'winCells' } })]),
      track(sid.freeSpins, 'Reveal', [
        clip(sid.freeSpins, 'flash', 1500, { name: 'Flash', params: { duration: 500 } }),
        clip(sid.freeSpins, 'textCallout', 1500, { presetId: S.presets.freeSpins, name: 'Callout' }),
        clip(sid.freeSpins, 'shockwave', 1500, { name: 'Rings', repeat: { count: 2, step: 160, order: 'forward' } }),
      ]),
    ],
    markers: [marker(sid.freeSpins, 'event', 1500, 'freespins.reveal'), marker(sid.freeSpins, 'event', 3300, 'freespins.begin')],
  });
  seq(sid.neonWin, 'Neon win', 'The same structure in the night theme.', {
    themeId: S.neon, scene: { ...defaultSceneSpec(), pattern: 'line', seed: 3, winAmount: 888 }, fixedDuration: null,
    tracks: [track(sid.neonWin, 'FX', [clip(sid.neonWin, 'symbolHighlight', 0, { name: 'Highlight' }), clip(sid.neonWin, 'shockwave', 200, { presetId: S.presets.neonPulse, name: 'Pulse' }), clip(sid.neonWin, 'bigWinBanner', 500, { name: 'Banner', params: { tier: 'big' } })])],
    markers: [marker(sid.neonWin, 'event', 0, 'celebration.start')],
  });

  for (const id of [S.classic, S.neon]) p = saveVersion(p, 'theme', id, { label: 'Initial', note: 'Starter theme' }).project;
  const v = p.themes[S.classic]!.versions[0]!;
  p = approveVersion(p, 'theme', S.classic, v.id, { by: 'Studio', note: 'House look approved' });
  // Everything belonging to the house theme is released; the Neon variant stays a work in progress.
  for (const id of Object.keys(p.presets)) {
    p = saveVersion(p, 'preset', id).project;
    if (p.presets[id]!.draft.themeId === S.classic) p = approveVersion(p, 'preset', id, p.presets[id]!.versions[0]!.id, { by: 'Studio' });
  }
  for (const id of Object.keys(p.sequences)) {
    p = saveVersion(p, 'sequence', id).project;
    if (p.sequences[id]!.draft.themeId === S.classic) p = approveVersion(p, 'sequence', id, p.sequences[id]!.versions[0]!.id, { by: 'Studio' });
  }
  return p;
}
