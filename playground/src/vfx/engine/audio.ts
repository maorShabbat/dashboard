import { makeRng } from '../../core/util/prng';

/** The sound vocabulary. Every effect describes its sound as a few cues; they are synthesised, so no audio files are needed. */
export type CueKind = 'thump' | 'crack' | 'shatter' | 'zap' | 'whoosh' | 'sweep' | 'tick' | 'rumble';
export const CUE_KINDS: CueKind[] = ['thump', 'crack', 'shatter', 'zap', 'whoosh', 'sweep', 'tick', 'rumble'];

export interface SoundCue {
  /** Seconds from the start of the composition. */
  t: number;
  kind: CueKind;
  /** 0..1.5 */
  gain: number;
  /** Pitch multiplier (1 = natural). */
  pitch?: number;
  /** Length in seconds (kind-specific default when omitted). */
  dur?: number;
  seed?: number;
}

export const SAMPLE_RATE = 44100;

const DEFAULT_DUR: Record<CueKind, number> = { thump: 0.45, crack: 0.12, shatter: 0.55, zap: 0.7, whoosh: 0.6, sweep: 0.5, tick: 0.08, rumble: 0.8 };
export const cueEnd = (c: SoundCue): number => c.t + (c.dur ?? DEFAULT_DUR[c.kind]) + 0.15;

function noiseBuffer(ctx: BaseAudioContext, seconds: number, seed: number): AudioBuffer {
  const b = ctx.createBuffer(1, Math.max(1, Math.ceil(seconds * ctx.sampleRate)), ctx.sampleRate);
  const d = b.getChannelData(0);
  const rng = makeRng(seed);
  for (let i = 0; i < d.length; i++) d[i] = rng.next() * 2 - 1;
  return b;
}

function env(g: GainNode, t0: number, attack: number, peak: number, decay: number): void {
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(peak, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + decay);
}

function schedule(ctx: BaseAudioContext, out: AudioNode, c: SoundCue, idx: number): void {
  const t0 = c.t, pitch = c.pitch ?? 1, dur = c.dur ?? DEFAULT_DUR[c.kind], gain = c.gain;
  const seed = (c.seed ?? 0) + idx * 101 + 7;
  const noise = (len: number) => { const s = ctx.createBufferSource(); s.buffer = noiseBuffer(ctx, len, seed); return s; };
  const biquad = (type: BiquadFilterType, f: number, q = 1) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; };
  const stop = (n: AudioScheduledSourceNode, t: number) => n.stop(t);
  switch (c.kind) {
    case 'thump': {
      const o = ctx.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(170 * pitch, t0); o.frequency.exponentialRampToValueAtTime(42 * pitch, t0 + dur * 0.5);
      const g = ctx.createGain(); env(g, t0, 0.003, gain * 0.9, dur);
      o.connect(g).connect(out); o.start(t0); stop(o, t0 + dur + 0.05);
      const n = noise(0.08), lp = biquad('lowpass', 900 * pitch), ng = ctx.createGain(); env(ng, t0, 0.001, gain * 0.35, 0.06);
      n.connect(lp).connect(ng).connect(out); n.start(t0); stop(n, t0 + 0.09);
      break;
    }
    case 'crack': {
      const n = noise(dur + 0.05), hp = biquad('highpass', 1500 * pitch, 0.7), g = ctx.createGain(); env(g, t0, 0.0008, gain * 0.7, dur * 0.5);
      n.connect(hp).connect(g).connect(out); n.start(t0); stop(n, t0 + dur + 0.05);
      break;
    }
    case 'shatter': {
      const rng = makeRng(seed);
      const grains = 18;
      for (let i = 0; i < grains; i++) {
        const gt = t0 + Math.pow(rng.next(), 1.7) * dur;
        const n = noise(0.12), bp = biquad('bandpass', (2200 + rng.next() * 7000) * pitch, 4 + rng.next() * 6), g = ctx.createGain();
        env(g, gt, 0.0006, gain * (0.25 + rng.next() * 0.45) * (1 - (gt - t0) / (dur * 1.4)), 0.02 + rng.next() * 0.07);
        n.connect(bp).connect(g).connect(out); n.start(gt); stop(n, gt + 0.12);
      }
      const n = noise(0.1), hp = biquad('highpass', 2500, 0.7), g = ctx.createGain(); env(g, t0, 0.0006, gain * 0.6, 0.07);
      n.connect(hp).connect(g).connect(out); n.start(t0); stop(n, t0 + 0.1);
      break;
    }
    case 'zap': {
      const n = noise(dur + 0.1), bp = biquad('bandpass', 700 * pitch, 1.4);
      bp.frequency.setValueAtTime(600 * pitch, t0); bp.frequency.exponentialRampToValueAtTime(5200 * pitch, t0 + dur * 0.35); bp.frequency.exponentialRampToValueAtTime(900 * pitch, t0 + dur);
      const gate = ctx.createGain();
      const rng = makeRng(seed);
      for (let tt = 0; tt < dur; tt += 0.012) gate.gain.setValueAtTime(rng.next() < 0.28 ? 0.1 : 0.6 + rng.next() * 0.5, t0 + tt);   // electrical crackle: random gating
      const g = ctx.createGain(); env(g, t0, 0.004, gain * 0.55, dur);
      n.connect(bp).connect(gate).connect(g).connect(out); n.start(t0); stop(n, t0 + dur + 0.1);
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(900 * pitch, t0); o.frequency.exponentialRampToValueAtTime(110 * pitch, t0 + dur * 0.6);
      const og = ctx.createGain(); env(og, t0, 0.002, gain * 0.16, dur * 0.7);
      o.connect(og).connect(out); o.start(t0); stop(o, t0 + dur);
      break;
    }
    case 'whoosh': {
      const n = noise(dur + 0.1), bp = biquad('bandpass', 400 * pitch, 0.9);
      bp.frequency.setValueAtTime(300 * pitch, t0); bp.frequency.exponentialRampToValueAtTime(2600 * pitch, t0 + dur * 0.45); bp.frequency.exponentialRampToValueAtTime(500 * pitch, t0 + dur);
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(gain * 0.5, t0 + dur * 0.4); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      n.connect(bp).connect(g).connect(out); n.start(t0); stop(n, t0 + dur + 0.1);
      break;
    }
    case 'sweep': {
      const o = ctx.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(110 * pitch, t0); o.frequency.exponentialRampToValueAtTime(1100 * pitch, t0 + dur);
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(gain * 0.35, t0 + dur * 0.9); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur + 0.04);
      o.connect(g).connect(out); o.start(t0); stop(o, t0 + dur + 0.06);
      break;
    }
    case 'tick': {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(1300 * pitch, t0); o.frequency.exponentialRampToValueAtTime(700 * pitch, t0 + dur);
      const g = ctx.createGain(); env(g, t0, 0.001, gain * 0.5, dur);
      o.connect(g).connect(out); o.start(t0); stop(o, t0 + dur + 0.02);
      break;
    }
    case 'rumble': {
      const n = noise(dur + 0.2), lp = biquad('lowpass', 180 * pitch, 0.8), g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(gain * 0.8, t0 + dur * 0.25); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      n.connect(lp).connect(g).connect(out); n.start(t0); stop(n, t0 + dur + 0.1);
      break;
    }
  }
}

/** Render cues to an AudioBuffer (offline, so the result is deterministic and can be muxed into a recording). */
/** A sound file of your own, already decoded, played from time t. */
export interface SampleCue { t: number; buffer: AudioBuffer; gain: number }

/** Decode an audio file (any format the browser plays). Used for checking an upload and for playing it. */
export async function decodeAudio(blob: Blob): Promise<AudioBuffer> {
  const ctx = new OfflineAudioContext(1, 1, SAMPLE_RATE);
  return ctx.decodeAudioData(await blob.arrayBuffer());
}

export async function renderCues(cues: SoundCue[], volume = 1, sampleRate = SAMPLE_RATE, samples: SampleCue[] = []): Promise<AudioBuffer> {
  const end = Math.max(0.1, ...cues.map(cueEnd), ...samples.map((x) => x.t + x.buffer.duration + 0.05)) + 0.1;
  const ctx = new OfflineAudioContext(2, Math.ceil(end * sampleRate), sampleRate);
  const master = ctx.createGain(); master.gain.value = volume * 0.8;
  const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -10; comp.ratio.value = 6; comp.attack.value = 0.002; comp.release.value = 0.12;
  master.connect(comp).connect(ctx.destination);
  cues.forEach((c, i) => schedule(ctx, master, c, i));
  for (const x of samples) {
    const src = ctx.createBufferSource(), g = ctx.createGain();
    src.buffer = x.buffer; g.gain.value = x.gain;
    src.connect(g).connect(master); src.start(x.t);
  }
  return ctx.startRendering();
}

/** 16-bit PCM WAV bytes of an AudioBuffer. */
export function bufferToWav(buf: AudioBuffer): Uint8Array {
  const ch = buf.numberOfChannels, n = buf.length, bytes = n * ch * 2;
  const out = new Uint8Array(44 + bytes), v = new DataView(out.buffer);
  const w = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); v.setUint32(4, 36 + bytes, true); w(8, 'WAVE'); w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, ch, true);
  v.setUint32(24, buf.sampleRate, true); v.setUint32(28, buf.sampleRate * ch * 2, true); v.setUint16(32, ch * 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, bytes, true);
  const data = Array.from({ length: ch }, (_, c) => buf.getChannelData(c));
  let o = 44;
  for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) { const x = Math.max(-1, Math.min(1, data[c]![i]!)); v.setInt16(o, x < 0 ? x * 0x8000 : x * 0x7fff, true); o += 2; }
  return out;
}

/** Plays a rendered buffer in real time at a playback rate (slow motion lowers the pitch, like slowed footage). */
export class SoundPlayer {
  private ctx: AudioContext | null = null;
  private src: AudioBufferSourceNode | null = null;
  /** Total sounds started, for tests. */
  starts = 0;
  play(buf: AudioBuffer, offset: number, rate: number): void {
    this.stop();
    try {
      if (!this.ctx) this.ctx = new AudioContext();
      void this.ctx.resume();
      const s = this.ctx.createBufferSource();
      s.buffer = buf; s.playbackRate.value = rate;
      s.connect(this.ctx.destination);
      s.start(0, Math.max(0, Math.min(offset, buf.duration - 0.01)));
      this.src = s; this.starts++;
    } catch { /* audio is optional */ }
  }
  stop(): void { try { this.src?.stop(); } catch { /* already stopped */ } this.src = null; }
  dispose(): void { this.stop(); void this.ctx?.close().catch(() => undefined); this.ctx = null; }
}
