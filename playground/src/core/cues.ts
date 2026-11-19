/**
 * Sound cue catalogue. A cue is a semantic name ("coin.burst"); the theme maps each cue to an optional audio asset plus
 * gain/pitch. Effects and sequences place cue *markers* on a timeline; the runtime reports them through `onCue`.
 * Cues without an audio asset play a tiny built-in synth blip in the editor so timing can be auditioned.
 */

export interface SynthSpec { wave: 'sine' | 'square' | 'triangle' | 'sawtooth' | 'noise'; freq: number; endFreq?: number; ms: number; gain: number }
export interface CueDef { id: string; label: string; description: string; synth: SynthSpec }

export const CUES: CueDef[] = [
  { id: 'win.small', label: 'Win · small', description: 'Short sting for a regular win highlight.', synth: { wave: 'triangle', freq: 660, endFreq: 880, ms: 160, gain: 0.5 } },
  { id: 'win.big', label: 'Win · big', description: 'Big win banner arrival.', synth: { wave: 'square', freq: 392, endFreq: 784, ms: 420, gain: 0.35 } },
  { id: 'win.mega', label: 'Win · mega', description: 'Mega/epic win hit.', synth: { wave: 'sawtooth', freq: 262, endFreq: 1046, ms: 700, gain: 0.3 } },
  { id: 'coin.burst', label: 'Coin burst', description: 'Coins leaving the emitter.', synth: { wave: 'noise', freq: 3200, ms: 260, gain: 0.35 } },
  { id: 'coin.land', label: 'Coin land', description: 'Coins settling / tail of a burst.', synth: { wave: 'triangle', freq: 1760, endFreq: 1320, ms: 120, gain: 0.35 } },
  { id: 'cascade.pop', label: 'Cascade pop', description: 'Winning symbols popping out.', synth: { wave: 'sine', freq: 520, endFreq: 1040, ms: 110, gain: 0.5 } },
  { id: 'cascade.land', label: 'Cascade land', description: 'New symbols landing.', synth: { wave: 'sine', freq: 220, endFreq: 110, ms: 160, gain: 0.55 } },
  { id: 'anticipation.rise', label: 'Anticipation rise', description: 'Tension build while a feature is possible.', synth: { wave: 'sawtooth', freq: 180, endFreq: 720, ms: 900, gain: 0.2 } },
  { id: 'multiplier.hit', label: 'Multiplier hit', description: 'Multiplier badge landing.', synth: { wave: 'square', freq: 330, endFreq: 660, ms: 200, gain: 0.35 } },
  { id: 'shake.impact', label: 'Impact', description: 'Low thump that pairs with screen shake.', synth: { wave: 'sine', freq: 90, endFreq: 40, ms: 280, gain: 0.8 } },
  { id: 'whoosh', label: 'Whoosh', description: 'Shockwave / sweep.', synth: { wave: 'noise', freq: 800, ms: 320, gain: 0.3 } },
  { id: 'shine.sparkle', label: 'Sparkle', description: 'Light sweep glint.', synth: { wave: 'sine', freq: 2093, endFreq: 3136, ms: 180, gain: 0.25 } },
  { id: 'line.draw', label: 'Line draw', description: 'Win line tracing across the board.', synth: { wave: 'triangle', freq: 440, endFreq: 880, ms: 360, gain: 0.3 } },
  { id: 'counter.tick', label: 'Counter tick', description: 'Win counter step.', synth: { wave: 'square', freq: 1200, ms: 40, gain: 0.15 } },
  { id: 'counter.end', label: 'Counter end', description: 'Win counter finished.', synth: { wave: 'triangle', freq: 988, endFreq: 1318, ms: 260, gain: 0.4 } },
  { id: 'callout.hit', label: 'Callout hit', description: 'Text callout (free spins, etc.) arrival.', synth: { wave: 'square', freq: 294, endFreq: 588, ms: 240, gain: 0.35 } },
];

export const CUE_IDS = CUES.map((c) => c.id);
export function cueDef(id: string): CueDef | undefined { return CUES.find((c) => c.id === id); }

/** A marker placed on an effect or sequence timeline. */
export interface CueMarker {
  id: string;
  /** Milliseconds from the start of the owning effect (or sequence). */
  at: number;
  cue: string;
  /** Additional gain on top of the theme's per-cue gain. */
  gain: number;
}
