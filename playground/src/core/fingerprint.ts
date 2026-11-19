/**
 * Replay fingerprints. A fingerprint is the SHA-256 of a rounded, canonical display list, so "does an imported bundle
 * replay identically?" is a hash comparison that works in Node, browsers and the exported runtime alike.
 */
import { viewportPreset } from './board';
import { type CompiledSequence, type Frame, type FrameOptions, NO_ASSETS, evaluateFrame, timelineEvents } from './engine';
import type { AssetIndex } from './effects/types';
import { roundDeep, stableStringify } from './util/json';
import { sha256Hex } from './util/sha256';

/**
 * Media ids are local names (an import may rename them), so fingerprints reference media by content hash instead.
 */
export function frameFingerprint(frame: Frame, assets: AssetIndex = NO_ASSETS): string {
  const ops = frame.ops.map((o) => (o.op === 'image' ? { ...o, asset: assets.hash(o.asset) ?? `missing:${o.asset}` } : o));
  return sha256Hex(stableStringify(roundDeep({ v: frame.viewport, layers: frame.layers, camera: frame.camera, ops })));
}

export function eventsFingerprint(seq: CompiledSequence, assets: AssetIndex = NO_ASSETS): { hash: string; count: number } {
  const events = timelineEvents(seq).map((e) => (e.audio && e.audio.asset ? { ...e, audio: { ...e.audio, asset: assets.hash(e.audio.asset) ?? `missing:${e.audio.asset}` } } : e));
  return { hash: sha256Hex(stableStringify(roundDeep(events))), count: events.length };
}

export const SAMPLE_COUNT = 9;

export function sampleTimes(duration: number, n = SAMPLE_COUNT): number[] {
  if (duration <= 0) return [0];
  return Array.from({ length: n }, (_, i) => Math.round((duration * i) / (n - 1)));
}

export interface ReplaySample { t: number; hash: string }
export interface ViewportFingerprint { viewport: string; samples: ReplaySample[] }
export interface SequenceFingerprint { duration: number; viewports: ViewportFingerprint[]; events: { hash: string; count: number } }

export function fingerprintSequence(seq: CompiledSequence, viewportIds: readonly string[], assets: AssetIndex = NO_ASSETS, reducedMotion = false): SequenceFingerprint {
  const times = sampleTimes(seq.duration);
  return {
    duration: Math.round(seq.duration),
    viewports: viewportIds.map((id) => {
      const vp = viewportPreset(id);
      const opts: FrameOptions = { viewport: { w: vp.w, h: vp.h }, assets, reducedMotion };
      return { viewport: id, samples: times.map((t) => ({ t, hash: frameFingerprint(evaluateFrame(seq, t, opts), assets) })) };
    }),
    events: eventsFingerprint(seq, assets),
  };
}

export function fingerprintsEqual(a: SequenceFingerprint, b: SequenceFingerprint): { ok: boolean; detail: string } {
  if (a.duration !== b.duration) return { ok: false, detail: `duration ${a.duration} ≠ ${b.duration}` };
  if (a.events.hash !== b.events.hash) return { ok: false, detail: `event log differs (${a.events.count} vs ${b.events.count} events)` };
  for (const va of a.viewports) {
    const vb = b.viewports.find((v) => v.viewport === va.viewport);
    if (!vb) return { ok: false, detail: `viewport ${va.viewport} missing` };
    for (let i = 0; i < va.samples.length; i++) {
      if (va.samples[i]!.hash !== vb.samples[i]?.hash) return { ok: false, detail: `frame at ${va.samples[i]!.t} ms (${va.viewport}) differs` };
    }
  }
  return { ok: true, detail: `${a.viewports.length} viewport(s) × ${a.viewports[0]?.samples.length ?? 0} frames + ${a.events.count} events match` };
}
