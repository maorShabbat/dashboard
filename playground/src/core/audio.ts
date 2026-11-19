/**
 * Cue audio for editors and the exported runtime. A cue plays its assigned audio asset (gain/pitch from the theme), or a
 * small synthesised blip from the cue catalogue when no asset is assigned. Browser-only; safe to import elsewhere.
 */
import { cueDef } from './cues';
import type { TimelineEvent } from './engine';

export interface AudioSource { /** Fetch the bytes of an audio asset by id. */ load(assetId: string): Promise<ArrayBuffer | undefined> }

export interface CueAudio {
  /** Must be called from a user gesture before sound can play. */
  resume(): Promise<void>;
  play(ev: TimelineEvent): Promise<void>;
  setMuted(m: boolean): void;
  dispose(): void;
}

export function createCueAudio(source: AudioSource): CueAudio | null {
  const AC: typeof AudioContext | undefined = (globalThis as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext
    ?? (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  let ctx: AudioContext | null = null;
  let muted = false;
  const buffers = new Map<string, Promise<AudioBuffer | undefined>>();
  const get = () => (ctx ??= new AC());

  const buffer = (id: string) => {
    let p = buffers.get(id);
    if (!p) {
      p = (async () => {
        const raw = await source.load(id);
        if (!raw) return undefined;
        try { return await get().decodeAudioData(raw.slice(0)); } catch { return undefined; }
      })();
      buffers.set(id, p);
    }
    return p;
  };

  return {
    async resume() { const c = get(); if (c.state === 'suspended') await c.resume(); },
    setMuted(m) { muted = m; },
    dispose() { void ctx?.close(); ctx = null; },
    async play(ev) {
      if (muted || ev.kind !== 'cue' || !ev.audio?.enabled) return;
      const c = get();
      const gain = c.createGain();
      gain.gain.value = 10 ** (ev.audio.gainDb / 20);
      gain.connect(c.destination);
      const pitch = 2 ** (ev.audio.pitch / 12);
      if (ev.audio.asset) {
        const buf = await buffer(ev.audio.asset);
        if (buf) {
          const src = c.createBufferSource();
          src.buffer = buf; src.playbackRate.value = pitch; src.connect(gain); src.start();
          return;
        }
      }
      const def = cueDef(ev.name);
      if (!def) return;
      const s = def.synth;
      const dur = s.ms / 1000;
      gain.gain.setValueAtTime(gain.gain.value * s.gain, c.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
      if (s.wave === 'noise') {
        const len = Math.max(1, Math.floor(c.sampleRate * dur));
        const nb = c.createBuffer(1, len, c.sampleRate);
        const d = nb.getChannelData(0);
        let seed = 1234567;
        for (let i = 0; i < len; i++) { seed = (seed * 1664525 + 1013904223) >>> 0; d[i] = (seed / 4294967296) * 2 - 1; }
        const src = c.createBufferSource();
        const filter = c.createBiquadFilter();
        filter.type = 'bandpass'; filter.frequency.value = s.freq * pitch;
        src.buffer = nb; src.connect(filter); filter.connect(gain); src.start();
        return;
      }
      const osc = c.createOscillator();
      osc.type = s.wave;
      osc.frequency.setValueAtTime(s.freq * pitch, c.currentTime);
      if (s.endFreq) osc.frequency.exponentialRampToValueAtTime(s.endFreq * pitch, c.currentTime + dur);
      osc.connect(gain); osc.start(); osc.stop(c.currentTime + dur);
    },
  };
}
