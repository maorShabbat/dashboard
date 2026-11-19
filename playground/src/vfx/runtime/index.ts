/**
 * BANGERS VFX player: plays a preset exported from the playground, with no dependencies. It is the same code the playground runs:
 * the same renderer, text rasteriser, gradients, motion and effects. Fonts and images are read from the bundle's own files;
 * nothing is fetched from anywhere else.
 *
 *   import { createVfxPlayer } from './vfx-player.js';
 *   const preset = await (await fetch('./preset.json')).json();
 *   const player = await createVfxPlayer(canvas, { preset, base: './' });
 *   player.play();
 */
import type { SoundCue } from '../engine/audio';
import { resolveSounds } from '../fx/cues';
import { AutoQuality, TIERS, startingTier, type QualitySetting, type QualityTier } from '../engine/quality';
import { Renderer } from '../engine/renderer';
import { FontService, setFontFetcher, setFontUrlResolver } from '../fonts/service';
import type { FontManifest } from '../fonts/manifest';
import { importPresetJson } from '../model/serialize';
import type { Preset } from '../model/preset';
import { validatePreset } from '../model/validate';
import { cloneScene, type Scene } from '../model/scene';
import { ImageLibrary, MemoryAssetStore, blobOfUrl } from '../player/assets';
import { ScenePlayer } from '../player/player';

export interface BundleManifest {
  schema: 'bangers.vfx-bundle/1';
  preset: { id: string; version: number; ref: string };
  /** asset id → path relative to the bundle root */
  assets: Record<string, string>;
  /** custom font id → [{path, weight, style, family, fileName, sha256}] */
  fonts?: { id: string; family: string; fileName: string; weight: number; style: 'normal' | 'italic'; sha256: string; path: string; userSupplied: boolean }[];
}

export interface PlayerSource {
  /** The preset (the object from preset.json). */
  preset: Preset;
  /** Folder URL the bundle's files live in (default './'). */
  base?: string;
  /** Provide files yourself instead of fetching them: path → bytes. */
  files?: Record<string, Uint8Array | ArrayBuffer | Blob>;
  manifest?: BundleManifest;
}
export interface PlayerOptions {
  /** A picture to draw behind: screen distortions bend it together with the effect. */
  backdrop?: HTMLCanvasElement | ImageBitmap | HTMLImageElement | null;
  /** For screen transitions: the picture of the screen the transition leads to (`backdrop` is the screen it leaves). */
  backdropTo?: HTMLCanvasElement | ImageBitmap | HTMLImageElement | null;
  /** Drawing-buffer pixel ratio (default: the device's, capped at 2). Ignored when `width` and `height` are given. */
  pixelRatio?: number;
  width?: number;
  height?: number;
  loop?: boolean;
  /** Seconds the final pose rests before looping. */
  rest?: number;
  /**
   * How much to draw: 'high', 'medium' or 'low' (for weak phones), or 'auto' (the default): it starts from a guess about the device and
   * steps down when frames run slow, and back up after a long smooth stretch. Pass 'high' to always draw everything at full resolution.
   */
  quality?: QualitySetting;
  /** Play the sound files attached to the scene with it (browsers only allow this after a click or key press on the page). Default off. */
  sound?: boolean;
  autoplay?: boolean;
}

export interface VfxPlayer {
  readonly preset: Preset;
  readonly duration: number;
  readonly time: number;
  readonly playing: boolean;
  readonly warnings: string[];
  play(): void;
  pause(): void;
  restart(): void;
  seek(seconds: number): void;
  /** Draw the current time (called for you while playing). */
  render(): void;
  setText(elementId: string, text: string): Promise<void>;
  setCounter(elementId: string, v: { from?: number; to?: number }): Promise<void>;
  setBackdrop(src: PlayerOptions['backdrop']): void;
  /** The screen a transition leads to. */
  setBackdropTo(src: PlayerOptions['backdropTo']): void;
  onEnd(fn: () => void): () => void;
  /** Sound cues of the effects (the playground previews them with a built-in synthesiser). */
  cues(): SoundCue[];
  /** The quality tier in use right now (it changes by itself when `quality` is 'auto'). */
  readonly quality: QualityTier;
  /** Change the quality setting. */
  setQuality(setting: QualitySetting): void;
  /** The sound files of your own attached to the scene, each with the second it plays at and where its file is (relative to the bundle). */
  sounds(): AttachedSound[];
  /** Turn playing the attached sound files with the animation on or off (call it from a click so the browser allows audio). */
  setSound(on: boolean): void;
  resize(width: number, height: number): void;
  readPixels(): Uint8Array;
  dispose(): void;
}

export interface AttachedSound { id: string; name: string; asset: string; /** Seconds from the start of the scene. */ t: number; gain: number; /** The file, relative to the bundle's base. */ url: string }

const extOf = (path: string): string => /\.([a-z0-9]+)$/i.exec(path)?.[1]?.toLowerCase() ?? 'png';

export async function createVfxPlayer(canvas: HTMLCanvasElement, src: PlayerSource, opts: PlayerOptions = {}): Promise<VfxPlayer> {
  const v = validatePreset(JSON.parse(JSON.stringify(src.preset)), { hasCustomFont: () => true });
  if (!v.ok) throw new Error(`This preset is not valid:\n${v.errors.join('\n')}`);
  const preset = v.preset!;
  const base = (src.base ?? './').replace(/([^/])$/, '$1/');
  const read = async (path: string): Promise<Blob> => {
    const f = src.files?.[path];
    if (f instanceof Blob) return f;
    if (f) return new Blob([f as BlobPart]);
    return blobOfUrl(base + path, path);
  };

  let manifest: BundleManifest | undefined = src.manifest;
  if (!manifest && !src.files) { try { manifest = (await (await fetch(`${base}manifest.json`)).json()) as BundleManifest; } catch { manifest = undefined; } }
  else if (!manifest && src.files?.['manifest.json']) manifest = JSON.parse(await (await read('manifest.json')).text()) as BundleManifest;

  // fonts: read from the bundle's own fonts folder
  const fonts = new FontService({ cacheName: null, fetcher: async (family, file) => (await read(`fonts/${family.id}/${file.file}`)).arrayBuffer() });
  void setFontFetcher; void setFontUrlResolver;
  for (const cf of manifest?.fonts ?? []) {
    if (!cf.userSupplied) continue;
    await fonts.addCustom(await (await read(cf.path)).arrayBuffer(), { family: cf.family, fileName: cf.fileName, weight: cf.weight, style: cf.style }, cf.sha256);
  }

  // images: bundled assets by id, built-ins by name
  const images = new ImageLibrary(new MemoryAssetStore());
  const assetPaths = manifest?.assets ?? {};
  for (const [id, path] of Object.entries(assetPaths)) {
    if (id.startsWith('builtin:')) images.registerGenerated(id.slice(8), () => read(path));
    else await images.storeRef().put(id, await read(path), path.split('/').pop() ?? id);
  }
  for (const a of preset.scene.assets) if (!assetPaths[a.id]) {
    const guess = `assets/${a.id}.${a.kind === 'webm' ? 'webm' : extOf(a.name)}`;
    try { await images.storeRef().put(a.id, await read(guess), a.name); } catch { /* reported when the scene loads */ }
  }

  const ratio = opts.pixelRatio ?? Math.min(2, window.devicePixelRatio || 1);
  const renderer = new Renderer(canvas, preset.scene.aspect);
  // quality: a tier fixes the resolution and the share of particles; 'auto' follows how long frames really take
  let setting: QualitySetting = opts.quality ?? 'auto', auto: AutoQuality | null = setting === 'auto' ? new AutoQuality(startingTier()) : null;
  let tier: QualityTier = auto ? auto.tier : (setting as QualityTier);
  renderer.qualityScale = TIERS[tier].scale;
  const sizeToCanvas = () => {
    if (opts.width && opts.height) renderer.resize(opts.width, opts.height, 1, true);
    else renderer.resize(canvas.clientWidth || canvas.width || 640, canvas.clientHeight || canvas.height || 360, ratio, true);
  };
  sizeToCanvas();
  if (opts.backdrop) renderer.setBackdrop(opts.backdrop as never);
  if (opts.backdropTo) renderer.setBackdropB(opts.backdropTo as never);
  const player = new ScenePlayer({ renderer, fonts, images });
  player.quality = TIERS[tier].particles;
  let scene: Scene = cloneScene(preset.scene);
  const report = await player.load(scene);
  if (report.errors.length) throw new Error(`The preset could not be loaded:\n${report.errors.map((e) => `${e.name}: ${e.message}`).join('\n')}`);

  let time = 0, playing = false, raf = 0, last = 0, rest = 0, disposed = false;
  const endFns = new Set<() => void>();
  const loop = opts.loop ?? false, restSeconds = opts.rest ?? 0.6;

  // your own sound files: decoded once, scheduled against the audio clock from wherever playback starts
  let soundOn = opts.sound ?? false, audioCtx: AudioContext | null = null;
  const decoded = new Map<string, Promise<AudioBuffer>>(), active = new Set<AudioBufferSourceNode>();
  const stopSounds = (): void => { for (const x of active) { try { x.stop(); } catch { /* already stopped */ } } active.clear(); };
  const soundList = (): AttachedSound[] => (scene.sound.enabled ? resolveSounds(scene, player.duration).sounds : []).map((x) => ({ ...x, url: assetPaths[x.asset] ?? `assets/${x.asset}` }));
  const startSounds = async (from: number): Promise<void> => {
    if (!soundOn || disposed) return;
    const list = soundList().filter((x) => x.t >= from - 1e-3);
    if (!list.length) return;
    try { audioCtx ??= new AudioContext(); await audioCtx.resume(); } catch { return; }
    const ctx = audioCtx, t0 = ctx.currentTime;
    for (const x of list) {
      try {
        let p = decoded.get(x.asset);
        if (!p) { p = read(x.url).then((b) => b.arrayBuffer()).then((ab) => ctx.decodeAudioData(ab)); decoded.set(x.asset, p); }
        const buf = await p, src = ctx.createBufferSource(), g = ctx.createGain();
        g.gain.value = x.gain; src.buffer = buf; src.connect(g).connect(ctx.destination);
        src.start(t0 + Math.max(0, x.t - from)); active.add(src); src.onended = () => { active.delete(src); };
      } catch { /* a sound file that cannot be read is skipped */ }
    }
  };
  const opt = { grid: 0, gridDensity: 14, bloom: 1 };
  const draw = () => { if (!disposed) player.render(Math.min(time, player.duration), opt); };
  const applyTier = (t: QualityTier): void => {
    tier = t; renderer.qualityScale = TIERS[t].scale; player.quality = TIERS[t].particles;
    sizeToCanvas(); void player.rescale().then(draw); draw();
  };
  const tick = (now: number) => {
    if (!playing || disposed) return;
    const raw = now - last, dt = Math.min(0.1, raw / 1000); last = now;
    if (auto) { const changed = auto.frame(raw); if (changed) applyTier(changed); }
    if (rest > 0) { rest -= dt; if (rest <= 0) { if (loop) { time = 0; stopSounds(); void startSounds(0); } else { playing = false; for (const f of endFns) f(); return; } } }
    else { time += dt; if (time >= player.duration) { if (loop && scene.seamless) { time %= player.duration; stopSounds(); void startSounds(time); } else { time = player.duration; rest = loop ? restSeconds : 0.0001; } } }
    draw();
    raf = requestAnimationFrame(tick);
  };
  draw();

  const api: VfxPlayer = {
    preset, warnings: report.warnings,
    get duration() { return player.duration; }, get time() { return time; }, get playing() { return playing; },
    play() { if (playing) return; if (time >= player.duration - 1e-3) time = 0; playing = true; rest = 0; last = performance.now(); raf = requestAnimationFrame(tick); stopSounds(); void startSounds(time); },
    pause() { playing = false; cancelAnimationFrame(raf); stopSounds(); },
    restart() { time = 0; rest = 0; draw(); api.play(); },
    seek(s) { time = Math.max(0, Math.min(player.duration, s)); draw(); if (playing) { stopSounds(); void startSounds(time); } },
    render: draw,
    async setText(id, text) { const sc = cloneScene(scene); const e = sc.elements.find((x) => x.id === id); if (!e || e.kind !== 'text') throw new Error(`No text element "${id}"`); e.text = text; scene = sc; await player.update(scene); draw(); },
    async setCounter(id, val) { const sc = cloneScene(scene); const e = sc.elements.find((x) => x.id === id); if (!e || e.kind !== 'counter') throw new Error(`No counter element "${id}"`); if (val.from !== undefined) e.from = val.from; if (val.to !== undefined) e.to = val.to; scene = sc; await player.update(scene); draw(); },
    setBackdrop(s) { renderer.setBackdrop((s ?? null) as never); draw(); },
    setBackdropTo(s) { renderer.setBackdropB((s ?? null) as never); draw(); },
    onEnd(fn) { endFns.add(fn); return () => { endFns.delete(fn); }; },
    cues: () => player.cues(),
    get quality() { return tier; },
    setQuality(s) { setting = s; auto = s === 'auto' ? new AutoQuality(startingTier()) : null; applyTier(auto ? auto.tier : (s as QualityTier)); },
    sounds: soundList,
    setSound(on) { soundOn = on; if (!on) stopSounds(); else if (playing) void startSounds(time); },
    resize(w, h) { renderer.resize(w, h, 1, true); void player.rescale().then(draw); draw(); },
    readPixels: () => renderer.readPixels(),
    dispose() { disposed = true; cancelAnimationFrame(raf); stopSounds(); void audioCtx?.close().catch(() => undefined); player.dispose(); renderer.dispose(); },
  };
  return api;
}

export { importPresetJson };
export type { FontManifest };
