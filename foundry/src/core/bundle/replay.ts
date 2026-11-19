/**
 * Replay computation shared by export (to record fingerprints), verification (to recompute them after import) and the
 * exported runtime (so integrators can self-check in their own pipeline).
 */
import { REPLAY_VIEWPORTS, defaultSceneSpec } from '../board';
import { EFFECT_LIST } from '../effects/registry';
import { type LibraryView, compileSequence, type CompiledSequence } from '../engine';
import type { AssetIndex } from '../effects/types';
import { type SequenceFingerprint, fingerprintSequence, fingerprintsEqual } from '../fingerprint';
import { newClip } from '../model/defaults';
import type { SequenceContent } from '../model/types';
import type { BundleLibrary, ReplayRecord } from './types';

export interface MediaIndexEntry { id: string; sha256: string }

export function assetIndexFrom(entries: readonly MediaIndexEntry[]): AssetIndex {
  const m = new Map(entries.map((e) => [e.id, e.sha256]));
  return { has: (id) => m.has(id), hash: (id) => m.get(id) };
}

export function libraryViewOf(lib: BundleLibrary): LibraryView {
  return {
    theme: (id) => (id === lib.theme.id ? lib.theme.content : undefined),
    preset: (id) => lib.presets.find((p) => p.id === id)?.content,
  };
}

function singleClipSequence(themeId: string | null, effectType: string, presetId: string | null, id: string): SequenceContent {
  const clip = newClip(effectType, 0, presetId, effectType);
  clip.id = id; // fixed id: seeded randomness depends on it
  return { themeId, scene: defaultSceneSpec(), tracks: [{ id: 'preview', name: 'Preview', muted: false, solo: false, locked: false, clips: [clip] }], markers: [], fixedDuration: null };
}

export const presetPreviewSequence = (themeId: string | null, presetId: string, effectType: string) => singleClipSequence(themeId, effectType, presetId, `preview_${presetId}`);
export const effectPreviewSequence = (themeId: string | null, effectType: string) => singleClipSequence(themeId, effectType, null, `effect_${effectType}`);

export function compileLibrarySequence(lib: BundleLibrary, id: string): CompiledSequence | undefined {
  const s = lib.sequences.find((x) => x.id === id);
  return s ? compileSequence(s.content, libraryViewOf(lib)) : undefined;
}

/** Fingerprint every sequence (all replay viewports), every preset, and every required effect resolved through the theme. */
export function computeReplay(lib: BundleLibrary, media: readonly MediaIndexEntry[]): ReplayRecord {
  const view = libraryViewOf(lib);
  const assets = assetIndexFrom(media);
  const desktopOnly = [REPLAY_VIEWPORTS[0]];
  const rec: ReplayRecord = { viewports: [...REPLAY_VIEWPORTS], sequences: {}, presets: {}, effects: {} };
  for (const s of lib.sequences) rec.sequences[s.id] = fingerprintSequence(compileSequence(s.content, view), REPLAY_VIEWPORTS, assets);
  for (const p of lib.presets) rec.presets[p.id] = fingerprintSequence(compileSequence(presetPreviewSequence(lib.theme.id, p.id, p.content.effectType), view), desktopOnly, assets);
  for (const e of EFFECT_LIST) rec.effects[e.type] = fingerprintSequence(compileSequence(effectPreviewSequence(lib.theme.id, e.type), view), desktopOnly, assets);
  return rec;
}

export interface ReplayDiff { scope: 'sequence' | 'preset' | 'effect'; id: string; detail: string }

export function compareReplay(expected: ReplayRecord, actual: ReplayRecord): { ok: boolean; compared: number; diffs: ReplayDiff[] } {
  const diffs: ReplayDiff[] = [];
  let compared = 0;
  const cmp = (scope: ReplayDiff['scope'], a: Record<string, SequenceFingerprint>, b: Record<string, SequenceFingerprint>) => {
    for (const [id, fp] of Object.entries(a)) {
      const other = b[id];
      if (!other) { diffs.push({ scope, id, detail: 'missing from replay' }); continue; }
      compared++;
      const r = fingerprintsEqual(fp, other);
      if (!r.ok) diffs.push({ scope, id, detail: r.detail });
    }
    for (const id of Object.keys(b)) if (!(id in a)) diffs.push({ scope, id, detail: 'not recorded in manifest' });
  };
  cmp('sequence', expected.sequences, actual.sequences);
  cmp('preset', expected.presets, actual.presets);
  cmp('effect', expected.effects, actual.effects);
  return { ok: diffs.length === 0, compared, diffs };
}
