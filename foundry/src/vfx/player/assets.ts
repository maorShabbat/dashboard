/**
 * Image assets: PNG / WebP / GIF stills and transparent WebM video (VP8/VP9 with alpha). Video is decoded once into frames
 * (ImageBitmaps with alpha) so playback is a pure function of time: scrubbing, slow motion and frame-accurate recording are exact.
 */
import { sha256Hex } from '../../core/util/sha256';
import type { ObjectInfo } from '../engine/object';
import { objectFromImage } from '../engine/object';
import { decodeAudio } from '../engine/audio';
import type { TexRef } from '../engine/frame';

export interface LoadedImage {
  id: string;
  kind: 'static' | 'video';
  width: number;
  height: number;
  aspect: number;
  /** Alpha mask of the first frame (silhouette for fragmentation, sparkles, outlines). */
  info: ObjectInfo;
  frameCount: number;
  fps: number;
  duration: number;
  /** Texture for time `t` seconds after the element appeared. */
  texAt(t: number, playback: 'loop' | 'once'): TexRef;
  /** Source of frame `i` (for rasterising the silhouette style). */
  frame(i: number): ImageBitmap;
  dispose(): void;
}

/** Where uploaded files live. Implemented over IndexedDB in the browser, in memory for tests and exported players. */
export interface AssetStore {
  get(id: string): Promise<{ blob: Blob; name: string; type: string } | undefined>;
  put(id: string, blob: Blob, name: string): Promise<void>;
  delete(id: string): Promise<void>;
  list(): Promise<{ id: string; name: string; bytes: number; type: string }[]>;
}

export class MemoryAssetStore implements AssetStore {
  private m = new Map<string, { blob: Blob; name: string; type: string }>();
  async get(id: string) { return this.m.get(id); }
  async put(id: string, blob: Blob, name: string) { this.m.set(id, { blob, name, type: blob.type }); }
  async delete(id: string) { this.m.delete(id); }
  async list() { return [...this.m].map(([id, v]) => ({ id, name: v.name, bytes: v.blob.size, type: v.type })); }
}

/** IndexedDB-backed store; falls back to memory when storage is unavailable (private windows). */
export class IdbAssetStore implements AssetStore {
  private db: Promise<IDBDatabase | null>;
  private mem = new MemoryAssetStore();
  constructor(private name = 'bangers-vfx-assets') {
    this.db = new Promise((resolve) => {
      try {
        const req = indexedDB.open(this.name, 1);
        req.onupgradeneeded = () => { req.result.createObjectStore('files'); };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
        req.onblocked = () => resolve(null);
      } catch { resolve(null); }
    });
  }
  private async tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | undefined> {
    const db = await this.db;
    if (!db) return undefined;
    return new Promise((resolve) => {
      try {
        const r = fn(db.transaction('files', mode).objectStore('files'));
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => resolve(undefined);
      } catch { resolve(undefined); }
    });
  }
  async get(id: string) {
    const v = await this.tx('readonly', (s) => s.get(id)) as { blob: Blob; name: string; type: string } | undefined;
    return v ?? this.mem.get(id);
  }
  async put(id: string, blob: Blob, name: string) {
    await this.mem.put(id, blob, name);
    await this.tx('readwrite', (s) => s.put({ blob, name, type: blob.type }, id));
  }
  async delete(id: string) { await this.mem.delete(id); await this.tx('readwrite', (s) => s.delete(id)); }
  async list() {
    const db = await this.db;
    if (!db) return this.mem.list();
    return new Promise<{ id: string; name: string; bytes: number; type: string }[]>((resolve) => {
      const out: { id: string; name: string; bytes: number; type: string }[] = [];
      const req = db.transaction('files', 'readonly').objectStore('files').openCursor();
      req.onsuccess = () => {
        const c = req.result;
        if (!c) { resolve(out); return; }
        const v = c.value as { blob: Blob; name: string; type: string };
        out.push({ id: String(c.key), name: v.name, bytes: v.blob.size, type: v.type });
        c.continue();
      };
      req.onerror = () => resolve(out);
    });
  }
}

export const isVideoType = (type: string, name = ''): boolean => type.startsWith('video/') || /\.webm$/i.test(name);

export async function assetIdFor(blob: Blob): Promise<{ id: string; sha256: string }> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const sha = sha256Hex(bytes);
  return { id: `asset-${sha.slice(0, 16)}`, sha256: sha };
}

// ---------------------------------------------------------------------------------------------------------------------

const MAX_VIDEO_PIXELS = 48_000_000;
const MAX_VIDEO_FRAMES = 150;

function once(el: EventTarget, ok: string, err = 'error'): Promise<void> {
  return new Promise((resolve, reject) => {
    const onOk = () => { cleanup(); resolve(); };
    const onErr = () => { cleanup(); reject(new Error('The browser could not decode this video. Transparent WebM needs VP8/VP9 with alpha (Chrome, Edge and Firefox play it; Safari does not).')); };
    const cleanup = () => { el.removeEventListener(ok, onOk); el.removeEventListener(err, onErr); };
    el.addEventListener(ok, onOk); el.addEventListener(err, onErr);
  });
}

export interface VideoFrames { frames: ImageBitmap[]; fps: number; duration: number; width: number; height: number }

/** Decode a (transparent) WebM into frames at `fps`, capped to a pixel budget. Alpha is preserved. */
export async function extractVideoFrames(blob: Blob, opts: { fps?: number } = {}): Promise<VideoFrames> {
  const url = URL.createObjectURL(blob);
  const video = document.createElement('video');
  video.muted = true; video.playsInline = true; video.preload = 'auto'; video.crossOrigin = 'anonymous';
  try {
    video.src = url;
    await once(video, 'loadeddata');
    const duration = video.duration;
    if (!isFinite(duration) || duration <= 0) throw new Error('This WebM has no duration (an unfinished or streamed recording). Re-export it with a duration.');
    const vw = video.videoWidth, vh = video.videoHeight;
    if (!vw || !vh) throw new Error('This video has no picture.');
    const fps = Math.max(1, Math.min(60, opts.fps ?? 30));
    let count = Math.min(MAX_VIDEO_FRAMES, Math.max(1, Math.ceil(duration * fps)));
    let scale = 1;
    while (count * vw * scale * vh * scale > MAX_VIDEO_PIXELS && scale > 0.2) scale *= 0.85;
    if (count * vw * scale * vh * scale > MAX_VIDEO_PIXELS) count = Math.max(1, Math.floor(MAX_VIDEO_PIXELS / (vw * scale * vh * scale)));
    const w = Math.max(2, Math.round(vw * scale)), h = Math.max(2, Math.round(vh * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: false })!;
    const frames: ImageBitmap[] = [];
    for (let i = 0; i < count; i++) {
      const t = Math.min(duration - 1e-3, (i / count) * duration);
      if (Math.abs(video.currentTime - t) > 1e-4 || i === 0) { video.currentTime = t; await once(video, 'seeked'); }
      ctx.clearRect(0, 0, w, h);
      ctx.drawImage(video, 0, 0, w, h);
      frames.push(await createImageBitmap(canvas));
    }
    return { frames, fps: count / duration, duration, width: w, height: h };
  } finally {
    video.removeAttribute('src'); video.load();
    URL.revokeObjectURL(url);
  }
}

/** A blob from a URL; data: URLs are decoded directly (a page policy may block fetch() of them). */
export async function blobOfUrl(url: string, label = url): Promise<Blob> {
  const m = /^data:([^;,]*)(;base64)?,(.*)$/s.exec(url);
  if (m) {
    const raw = m[2] ? atob(m[3]!) : decodeURIComponent(m[3]!);
    const out = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return new Blob([out.buffer as ArrayBuffer], { type: m[1] || 'application/octet-stream' });
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not load "${label}" (HTTP ${res.status})`);
  return res.blob();
}

let uidSeq = 0;

export async function loadImageBlob(id: string, blob: Blob, name = ''): Promise<LoadedImage> {
  const uid = `img:${id}:${uidSeq++}`;
  if (isVideoType(blob.type, name)) {
    const v = await extractVideoFrames(blob);
    const info = objectFromImage(id, v.frames[0]!);
    const refs = v.frames.map((f, i): TexRef => ({ uid, version: i, w: v.width, h: v.height, load: () => ({ kind: 'image', source: f }) }));
    return {
      id, kind: 'video', width: v.width, height: v.height, aspect: v.width / v.height, info, frameCount: v.frames.length, fps: v.fps, duration: v.duration,
      texAt(t, playback) {
        const n = v.frames.length;
        const i = Math.floor(Math.max(0, t) * v.fps);
        return refs[playback === 'once' ? Math.min(n - 1, i) : i % n]!;
      },
      frame: (i) => v.frames[Math.max(0, Math.min(v.frames.length - 1, i))]!,
      dispose() { for (const f of v.frames) f.close(); },
    };
  }
  let bmp: ImageBitmap;
  try { bmp = await createImageBitmap(blob, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' }); } catch { throw new Error(`"${name || id}" is not an image the browser can read. Use a PNG, WebP or transparent WebM.`); }
  const info = objectFromImage(id, bmp);
  const ref: TexRef = { uid, version: 0, w: bmp.width, h: bmp.height, load: () => ({ kind: 'image', source: bmp }) };
  info.tex = ref;
  return {
    id, kind: 'static', width: bmp.width, height: bmp.height, aspect: bmp.width / bmp.height, info, frameCount: 1, fps: 0, duration: 0,
    texAt: () => ref, frame: () => bmp, dispose() { bmp.close(); },
  };
}

/** Resolves asset ids to loaded images: bundled icons by `builtin:<name>`, uploads from the store. Loads once, shares the result. */
export class ImageLibrary {
  private cache = new Map<string, Promise<LoadedImage>>();
  private builtin = new Map<string, string>();
  constructor(private store: AssetStore) {}
  private generated = new Map<string, () => Promise<Blob>>();
  registerBuiltin(name: string, url: string): void { this.builtin.set(name, url); }
  /** A built-in picture drawn in code (icons and message backgrounds): there is no file for it, so it is rendered to a PNG on demand. */
  registerGenerated(name: string, make: () => Promise<Blob>): void { this.generated.set(name, make); }
  /** The file bytes of a built-in asset id (`builtin:name`), for exports. */
  async builtinBlob(id: string): Promise<Blob> {
    const name = id.slice(8);
    const gen = this.generated.get(name);
    if (gen) return gen();
    const url = this.builtin.get(name);
    if (!url) throw new Error(`Unknown built-in asset "${id}"`);
    return blobOfUrl(url, id);
  }
  isBuiltin(id: string): boolean { const n = id.slice(8); return id.startsWith('builtin:') && (this.generated.has(n) || this.builtin.has(n)); }
  builtinNames(): string[] { return [...this.builtin.keys(), ...this.generated.keys()]; }
  has(id: string): boolean { return this.cache.has(id); }
  /** A picture made at run time (a composed symbol cell): kept under its content key for the life of the scene, never stored. */
  async transient(id: string, blob: Blob, name = ''): Promise<LoadedImage> {
    const p = loadImageBlob(id, blob, name);
    this.cache.set(id, p);
    p.catch(() => { this.cache.delete(id); });
    return p;
  }

  async get(id: string): Promise<LoadedImage> {
    let p = this.cache.get(id);
    if (!p) {
      p = this.fetch(id);
      this.cache.set(id, p);
      p.catch(() => { this.cache.delete(id); });
    }
    return p;
  }

  private async fetch(id: string): Promise<LoadedImage> {
    if (id.startsWith('builtin:')) {
      if (!this.isBuiltin(id)) throw new Error(`Unknown built-in icon "${id}"`);
      return loadImageBlob(id, await this.builtinBlob(id), id);
    }
    const rec = await this.store.get(id);
    if (!rec) throw new Error(`The image "${id}" is not in this browser's storage. Upload it again.`);
    return loadImageBlob(id, rec.blob, rec.name);
  }

  async drop(id: string): Promise<void> {
    const p = this.cache.get(id);
    this.cache.delete(id);
    if (p) (await p.catch(() => null))?.dispose();
  }

  /** Add an uploaded file: stores it and returns the asset reference to put in a scene. */
  async add(file: Blob, name: string): Promise<{ id: string; kind: 'png' | 'webm' | 'image'; name: string; bytes: number; sha256: string; type: string }> {
    const { id, sha256 } = await assetIdFor(file);
    const video = isVideoType(file.type, name);
    // decode before accepting, so a bad file is reported now and never reaches a preset
    const test = await loadImageBlob(id, file, name);
    test.dispose();
    await this.store.put(id, file, name);
    this.cache.delete(id);
    return { id, kind: video ? 'webm' : /\.png$/i.test(name) || file.type === 'image/png' ? 'png' : 'image', name, bytes: file.size, sha256, type: file.type || (video ? 'video/webm' : 'image/png') };
  }

  /** Add a sound file: it is decoded now (so a file the browser cannot play is refused here), stored, and its reference returned. */
  async addAudio(file: Blob, name: string): Promise<{ id: string; kind: 'audio'; name: string; bytes: number; sha256: string; type: string }> {
    if (file.size > MAX_AUDIO_BYTES) throw new Error(`“${name}” is ${(file.size / 1048576).toFixed(1)} MB. Sound files can be up to ${MAX_AUDIO_BYTES / 1048576} MB: use a shorter or more compressed one (MP3 or OGG).`);
    let buf;
    try { buf = await decodeAudio(file); } catch { throw new Error(`“${name}” is not a sound file this browser can play. Use MP3, WAV, OGG or M4A.`); }
    if (buf.duration > MAX_AUDIO_SECONDS) throw new Error(`“${name}” is ${Math.round(buf.duration)} seconds long. Sounds can be up to ${MAX_AUDIO_SECONDS} seconds.`);
    const { id, sha256 } = await assetIdFor(file);
    await this.store.put(id, file, name);
    return { id, kind: 'audio', name, bytes: file.size, sha256, type: file.type || 'audio/mpeg' };
  }

  storeRef(): AssetStore { return this.store; }
}

export const MAX_AUDIO_BYTES = 8 * 1048576;
export const MAX_AUDIO_SECONDS = 120;
