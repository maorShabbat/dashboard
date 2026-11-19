/**
 * BANGERS runtime: the zero-dependency module shipped inside every bundle. It is built from the same source as the
 * editor, so what you preview is what your game replays.
 */
import { createCueAudio, type CueAudio } from '../core/audio';
import { compareReplay, computeReplay, libraryViewOf, assetIndexFrom, type MediaIndexEntry, type ReplayDiff } from '../core/bundle/replay';
import type { BundleLibrary, BundleManifest } from '../core/bundle/types';
import { type CompiledSequence, type Frame, type TimelineEvent, compileSequence, evaluateFrame, eventsBetween, timelineEvents } from '../core/engine';
import type { AssetIndex } from '../core/effects/types';
import { Player, type PlayerOptions } from '../core/player';
import type { PainterAssets } from '../core/render';
import { effectPreviewSequence, presetPreviewSequence } from '../core/bundle/replay';
import { PACKAGE_VERSION, RUNTIME_VERSION, SCHEMA_VERSION, BUNDLE_VERSION } from '../core/version';
import { fromUtf8 } from '../core/util/sha256';

export {
  compileSequence, evaluateFrame, timelineEvents, eventsBetween, Player, computeReplay, compareReplay, libraryViewOf, assetIndexFrom,
  effectPreviewSequence, presetPreviewSequence, PACKAGE_VERSION, RUNTIME_VERSION, SCHEMA_VERSION, BUNDLE_VERSION,
};
export { buildScene, computeLayout, BOARD_PRESETS, VIEWPORT_PRESETS } from '../core/board';
export { paintFrame } from '../core/render';
export { frameFingerprint, fingerprintSequence } from '../core/fingerprint';
export { resolveTokens } from '../core/resolve';
export { EFFECT_LIST } from '../core/effects/registry';
export type { CompiledSequence, Frame, TimelineEvent, BundleLibrary, BundleManifest, MediaIndexEntry, ReplayDiff };

export type FileReader = (path: string) => Promise<Uint8Array>;

export interface LoadedBundle {
  manifest: BundleManifest;
  library: BundleLibrary;
  read: FileReader;
  mediaIndex: MediaIndexEntry[];
  /** Base URL when loaded over HTTP; used to resolve font/asset URLs. */
  baseUrl: string | null;
}

/** Load a bundle from a base URL (the folder containing manifest.json) or from any async file reader. */
export async function loadBundle(source: string | FileReader): Promise<LoadedBundle> {
  let read: FileReader;
  let baseUrl: string | null = null;
  if (typeof source === 'string') {
    baseUrl = source.endsWith('/') ? source : source + '/';
    read = async (path) => {
      const r = await fetch(baseUrl + path);
      if (!r.ok) throw new Error(`Failed to load ${path}: HTTP ${r.status}`);
      return new Uint8Array(await r.arrayBuffer());
    };
  } else read = source;
  const manifest = JSON.parse(fromUtf8(await read('manifest.json'))) as BundleManifest;
  if (manifest.format !== 'bangers.bundle') throw new Error('Not a BANGERS bundle');
  if (manifest.bundleVersion > BUNDLE_VERSION) throw new Error(`Bundle version ${manifest.bundleVersion} is newer than this runtime (${BUNDLE_VERSION})`);
  const library = JSON.parse(fromUtf8(await read('config/library.json'))) as BundleLibrary;
  return { manifest, library, read, baseUrl, mediaIndex: manifest.media.map((m) => ({ id: m.id, sha256: m.sha256 })) };
}

/** Recompute replay fingerprints from the bundle's own config and compare them with the manifest. */
export function verifyReplay(bundle: LoadedBundle): { ok: boolean; compared: number; diffs: ReplayDiff[] } {
  return compareReplay(bundle.manifest.replay, computeReplay(bundle.library, bundle.mediaIndex));
}

export interface PreparedBundle {
  assets: AssetIndex;
  painterAssets: PainterAssets;
  fontStacks: Record<string, { family: string; fallback: string }>;
  audio: CueAudio | null;
}

/** Browser only: register bundled fonts, decode images, and set up cue audio. */
export async function prepareBundle(bundle: LoadedBundle): Promise<PreparedBundle> {
  const images = new Map<string, CanvasImageSource>();
  const fontStacks: PreparedBundle['fontStacks'] = {};
  const tasks: Promise<void>[] = [];
  for (const f of bundle.manifest.fonts) {
    if (f.origin === 'system') continue;
    fontStacks[f.id] = { family: f.family, fallback: f.fallback };
    if (!f.bundled || typeof FontFace === 'undefined') continue;
    for (const file of f.files) {
      tasks.push((async () => {
        const bytes = await bundle.read(file.path);
        const face = new FontFace(f.family, bytes.slice().buffer as ArrayBuffer, { weight: String(file.weight), style: file.style });
        await face.load();
        document.fonts.add(face);
      })().catch(() => undefined));
    }
  }
  for (const m of bundle.manifest.media) {
    if (m.kind !== 'image' || typeof Image === 'undefined') continue;
    tasks.push((async () => {
      const bytes = await bundle.read(m.path);
      const url = URL.createObjectURL(new Blob([bytes.slice().buffer as ArrayBuffer], { type: m.mime }));
      const img = new Image();
      img.src = url;
      await img.decode();
      images.set(m.id, img);
    })().catch(() => undefined));
  }
  await Promise.all(tasks);
  const audioMedia = new Map(bundle.manifest.media.filter((m) => m.kind === 'audio').map((m) => [m.id, m]));
  const audio = createCueAudio({ async load(id) { const m = audioMedia.get(id); return m ? ((await bundle.read(m.path)).slice().buffer as ArrayBuffer) : undefined; } });
  return { assets: assetIndexFrom(bundle.mediaIndex), painterAssets: { image: (id) => images.get(id) }, fontStacks, audio };
}

export interface BundlePlayerOptions extends Omit<PlayerOptions, 'sequence' | 'assets'> {
  bundle: LoadedBundle;
  prepared?: PreparedBundle;
  /** One of: sequence id, preset id, or effect type. */
  sequence?: string;
  preset?: string;
  effect?: string;
}

export function compileFromBundle(bundle: LoadedBundle, o: { sequence?: string; preset?: string; effect?: string }): CompiledSequence {
  const view = libraryViewOf(bundle.library);
  const lib = bundle.library;
  if (o.sequence) {
    const s = lib.sequences.find((x) => x.id === o.sequence);
    if (!s) throw new Error(`Sequence "${o.sequence}" is not in this bundle`);
    return compileSequence(s.content, view);
  }
  if (o.preset) {
    const p = lib.presets.find((x) => x.id === o.preset);
    if (!p) throw new Error(`Preset "${o.preset}" is not in this bundle`);
    return compileSequence(presetPreviewSequence(lib.theme.id, p.id, p.content.effectType), view);
  }
  if (o.effect) return compileSequence(effectPreviewSequence(lib.theme.id, o.effect), view);
  throw new Error('Pass sequence, preset or effect');
}

/** Create a ready-to-play player for a sequence/preset/effect of a bundle. */
export async function createBundlePlayer(o: BundlePlayerOptions): Promise<Player> {
  const prepared = o.prepared ?? (await prepareBundle(o.bundle));
  const { bundle, prepared: _p, sequence, preset, effect, ...rest } = o;
  void _p;
  return new Player({
    ...rest, sequence: compileFromBundle(bundle, { sequence, preset, effect }), assets: prepared.assets,
    paint: { ...(rest.paint ?? {}), assets: prepared.painterAssets, fontStacks: prepared.fontStacks },
  });
}

export function frameAt(bundle: LoadedBundle, sequenceId: string, t: number, viewport = { w: 1280, h: 720 }): Frame {
  return evaluateFrame(compileFromBundle(bundle, { sequence: sequenceId }), t, { viewport, assets: assetIndexFrom(bundle.mediaIndex) });
}
