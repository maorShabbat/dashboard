import { enm, num } from '../../core/params';
import { CUE_KINDS, type CueKind } from '../engine/audio';
import { n, s, type ShowEffect } from './effect';

const G = (group: string) => ({ section: 'Effect', group });
const LABEL: Record<CueKind, string> = { thump: 'Thump', crack: 'Crack', shatter: 'Shatter', zap: 'Zap', whoosh: 'Whoosh', sweep: 'Rising sweep', tick: 'Tick', rumble: 'Rumble' };

/**
 * Sound on its own: one synthesised cue, no picture. Every other effect also describes its own sound, and the playground's Sound toggle
 * plays those together with the picture. (All sounds are synthesised in the browser; there are no audio files.)
 */
export const sound: ShowEffect = {
  id: 'sound',
  name: 'Sound',
  tagline: 'A synthesised sound cue, with no picture. Press Replay (needs a click to unlock audio).',
  category: 'primitive',
  params: [
    enm('kind', 'Cue', G('Sound'), 'shatter', CUE_KINDS.map((k) => [k, LABEL[k]] as [string, string]), 'Which sound to play.'),
    num('volume', 'Volume', G('Sound'), 0.8, 0, 1.5, 0.01, 'x', 'Loudness.'),
    num('pitch', 'Pitch', G('Sound'), 1, 0.5, 2, 0.01, 'x', 'Pitch multiplier.'),
    num('length', 'Length', G('Sound'), 0.6, 0.1, 2, 0.01, 's', 'How long the cue lasts.'),
  ],
  duration: (p) => n(p, 'length') + 0.2,
  cues: (p) => [{ t: 0, kind: s(p, 'kind') as CueKind, gain: n(p, 'volume'), pitch: n(p, 'pitch'), dur: n(p, 'length') }],
  build() { /* sound only */ },
};
