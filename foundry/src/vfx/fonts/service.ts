/**
 * FontService: lazy, deduplicated, cancellable loading of font files with explicit state. Nothing is loaded until asked; each
 * (family, weight, style) is exactly one file; concurrent requests for the same file share one fetch; the fetch is aborted only
 * when every waiter has cancelled. A font that failed to load stays in the `error` state with its message and is NEVER silently
 * replaced by a fallback: callers must check `state()` / the returned promise.
 */
import { FONT_FAMILIES, getFamily, pickFile, type FontFamilyMeta, type FontFile, type FontSpec, type FontStyle } from './catalog';

export type FontLoadState = 'idle' | 'loading' | 'loaded' | 'error';
export interface FontStatus { state: FontLoadState; error?: string }

export interface CustomFontMeta {
  /** `custom:<sha256 prefix>` */
  id: string;
  /** Name of the family as given by the person who uploaded it. */
  family: string;
  fileName: string;
  weight: number;
  style: FontStyle;
  bytes: number;
  sha256: string;
}

export const CUSTOM_FONT_PREFIX = 'custom:';
export const isCustomFontId = (id: string): boolean => id.startsWith(CUSTOM_FONT_PREFIX);
export const CUSTOM_FONT_DISCLAIMER =
  'You are responsible for holding a licence that allows you to use, embed and redistribute this font file. BANGERS does not check or grant font licences. Fonts you upload are stored in this browser and are included in exported bundles on your responsibility.';

/** Loads the bytes of a bundled font file. Replaceable for tests and for the single-file build (fonts embedded in the page). */
export type FontFetcher = (family: FontFamilyMeta, file: FontFile, signal: AbortSignal) => Promise<ArrayBuffer>;

export interface FaceLike { family: string; load(): Promise<FaceLike>; }
export type FaceFactory = (cssFamily: string, bytes: ArrayBuffer, weight: number, style: FontStyle) => FaceLike;
export interface FaceRegistry { add(face: FaceLike): void; delete?(face: FaceLike): void }

/** CSS family name a loaded font is registered under: unique per font, so a missing font can never match a system font by accident. */
export const cssFamilyOf = (id: string): string => `vfx-${id.replace(/[^a-zA-Z0-9]+/g, '-')}`;

interface Entry {
  status: FontStatus;
  promise?: Promise<void>;
  controller?: AbortController;
  waiters: number;
  face?: FaceLike;
  bytes?: ArrayBuffer;
}

type Listener = () => void;

export interface FontServiceOptions {
  fetcher?: FontFetcher;
  faceFactory?: FaceFactory;
  registry?: FaceRegistry;
  /** Browser Cache Storage name (set to null to disable). */
  cacheName?: string | null;
}

/** Base URL of the bundled font files, relative to the page. Set by the app (a CDN-free relative path). */
let defaultBase = 'fonts/catalog';
export const setFontBaseUrl = (u: string): void => { defaultBase = u.replace(/\/$/, ''); };

/** Optional resolver for bundled file URLs (Vite hands the real, hashed URLs; the single-file build resolves from an embedded pack). */
let urlResolver: ((id: string, file: string) => string | undefined) | null = null;
export const setFontUrlResolver = (fn: ((id: string, file: string) => string | undefined) | null): void => { urlResolver = fn; };

let customFetcher: FontFetcher | null = null;
/** Replace how bundled font files are read (the single-file build reads them from the page itself). */
export const setFontFetcher = (fn: FontFetcher | null): void => { customFetcher = fn; };

const defaultFetcher: FontFetcher = async (family, file, signal) => {
  if (customFetcher) return customFetcher(family, file, signal);
  const url = urlResolver?.(family.id, file.file) ?? `${defaultBase}/${family.id}/${file.file}`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.arrayBuffer();
};

const defaultFaceFactory: FaceFactory = (css, bytes, weight, style) => new FontFace(css, bytes, { weight: String(weight), style }) as unknown as FaceLike;

const keyOf = (id: string, weight: number, style: FontStyle): string => `${id}|${weight}|${style}`;

export class FontService {
  private entries = new Map<string, Entry>();
  private customs = new Map<string, CustomFontMeta>();
  private listeners = new Set<Listener>();
  private version = 0;
  private fetcher: FontFetcher;
  private faceFactory: FaceFactory;
  private registry: FaceRegistry;
  private cacheName: string | null;
  /** Number of network/Cache reads performed (tests assert dedupe and caching with it). */
  fetchCount = 0;

  constructor(opts: FontServiceOptions = {}) {
    this.fetcher = opts.fetcher ?? defaultFetcher;
    this.faceFactory = opts.faceFactory ?? defaultFaceFactory;
    this.registry = opts.registry ?? (typeof document !== 'undefined' ? (document.fonts as unknown as FaceRegistry) : { add() { /* no document */ } });
    this.cacheName = opts.cacheName === undefined ? 'bangers-vfx-fonts-v1' : opts.cacheName;
  }

  // ---- subscription (UI re-renders when any state changes) ----------------------------------------------------------
  subscribe = (l: Listener): (() => void) => { this.listeners.add(l); return () => { this.listeners.delete(l); }; };
  /** Snapshot token for useSyncExternalStore. */
  snapshot = (): number => this.version;
  private emit(): void { this.version++; for (const l of [...this.listeners]) l(); }

  // ---- queries ------------------------------------------------------------------------------------------------------
  /** The font file a spec resolves to, and whether the requested weight/style exists exactly. */
  resolve(spec: FontSpec): { family: FontFamilyMeta | null; custom: CustomFontMeta | null; file: FontFile | null; exact: boolean; key: string } {
    if (isCustomFontId(spec.id)) {
      const custom = this.customs.get(spec.id) ?? null;
      return { family: null, custom, file: null, exact: !!custom && custom.weight === spec.weight && custom.style === spec.style, key: keyOf(spec.id, custom?.weight ?? spec.weight, custom?.style ?? spec.style) };
    }
    const family = getFamily(spec.id) ?? null;
    if (!family) return { family: null, custom: null, file: null, exact: false, key: keyOf(spec.id, spec.weight, spec.style) };
    const { file, exact } = pickFile(family, spec.weight, spec.style);
    return { family, custom: null, file, exact, key: keyOf(family.id, file.weight, file.style) };
  }

  status(spec: FontSpec): FontStatus {
    const r = this.resolve(spec);
    if (!r.family && !r.custom) return { state: 'error', error: isCustomFontId(spec.id) ? `Custom font ${spec.id} is not in this browser's font store. Upload it again.` : `Unknown font "${spec.id}"` };
    return this.entries.get(r.key)?.status ?? { state: 'idle' };
  }

  isLoaded(spec: FontSpec): boolean { return this.status(spec).state === 'loaded'; }

  /** The CSS family to use for canvas / CSS text, only valid once loaded. Throws if the font is not loaded, so a fallback face can never be used by mistake. */
  cssFamily(spec: FontSpec): string {
    const st = this.status(spec);
    if (st.state !== 'loaded') throw new Error(`Font "${spec.id}" ${spec.weight}${spec.style === 'italic' ? ' italic' : ''} is not loaded (${st.state}${st.error ? ': ' + st.error : ''})`);
    const [id, w, s] = this.resolve(spec).key.split('|');
    return `${cssFamilyOf(id!)}-${w}-${s}`;
  }

  /** The canvas/CSS `font` value for a loaded spec, with the exact weight and style of the file so the browser never synthesises bold or italic. */
  cssFont(spec: FontSpec, sizePx: number): string {
    const [, w, s] = this.resolve(spec).key.split('|');
    return `${s === 'italic' ? 'italic ' : ''}${w} ${sizePx}px "${this.cssFamily(spec)}"`;
  }

  // ---- loading ------------------------------------------------------------------------------------------------------
  /**
   * Load one weight/style. Resolves when the font is registered; rejects (and records the error) on failure. Concurrent calls for the
   * same file share one fetch. `signal` cancels only this caller's wait; the fetch itself stops when all waiters cancelled.
   */
  load(spec: FontSpec, signal?: AbortSignal): Promise<void> {
    const r = this.resolve(spec);
    if (!r.family && !r.custom) {
      const msg = isCustomFontId(spec.id) ? `Custom font ${spec.id} is not in this browser's font store` : `Unknown font "${spec.id}"`;
      return Promise.reject(new Error(msg));
    }
    let e = this.entries.get(r.key);
    if (e?.status.state === 'loaded') return Promise.resolve();
    if (signal?.aborted) return Promise.reject(abortError());
    if (!e || e.status.state === 'error' || e.status.state === 'idle') {
      if (r.custom) return Promise.reject(new Error(e?.status.error ?? `Custom font ${spec.id} has no data`));
      e = { status: { state: 'loading' }, waiters: 0 };
      this.entries.set(r.key, e);
      const controller = new AbortController();
      e.controller = controller;
      e.promise = this.fetchAndRegister(r.family!, r.file!, r.key, e, controller.signal);
      this.emit();
    }
    const entry = e;
    entry.waiters++;
    return new Promise<void>((resolve, reject) => {
      let done = false;
      const finish = (fn: () => void) => { if (done) return; done = true; entry.waiters--; signal?.removeEventListener('abort', onAbort); fn(); };
      const onAbort = () => {
        finish(() => reject(abortError()));
        if (entry.waiters <= 0 && entry.status.state === 'loading') entry.controller?.abort();
      };
      signal?.addEventListener('abort', onAbort, { once: true });
      entry.promise!.then(() => finish(resolve), (err) => finish(() => reject(err)));
    });
  }

  /** Load several specs; failures do not stop the others. Returns the specs that failed. */
  async loadAll(specs: FontSpec[], signal?: AbortSignal): Promise<{ failed: { spec: FontSpec; error: string }[] }> {
    const failed: { spec: FontSpec; error: string }[] = [];
    await Promise.all(specs.map((s) => this.load(s, signal).catch((err: unknown) => { if (!isAbort(err)) failed.push({ spec: s, error: (err as Error).message }); })));
    return { failed };
  }

  private async fetchAndRegister(family: FontFamilyMeta, file: FontFile, key: string, e: Entry, signal: AbortSignal): Promise<void> {
    try {
      const bytes = await this.readBytes(family, file, signal);
      const face = this.faceFactory(cssFamilyOf(family.id) + `-${file.weight}-${file.style}`, bytes, file.weight, file.style);
      await face.load();
      this.registry.add(face);
      e.face = face; e.bytes = bytes;
      e.status = { state: 'loaded' };
    } catch (err) {
      if (signal.aborted) { this.entries.delete(key); this.emit(); throw abortError(); }
      e.status = { state: 'error', error: (err as Error).message || 'Font failed to load' };
      this.emit();
      throw err;
    }
    this.emit();
  }

  private async readBytes(family: FontFamilyMeta, file: FontFile, signal: AbortSignal): Promise<ArrayBuffer> {
    const cacheKey = `https://bangers.local/fonts/${family.id}/${file.file}?sha=${file.sha256.slice(0, 16)}`;
    let cache: Cache | null = null;
    if (this.cacheName && typeof caches !== 'undefined') {
      try {
        cache = await caches.open(this.cacheName);
        const hit = await cache.match(cacheKey);
        if (hit) { const buf = await hit.arrayBuffer(); if (buf.byteLength === file.bytes) return buf; }
      } catch { cache = null; }
    }
    this.fetchCount++;
    const bytes = await this.fetcher(family, file, signal);
    if (bytes.byteLength !== file.bytes) throw new Error(`${file.file}: expected ${file.bytes} bytes, got ${bytes.byteLength}. The font file is missing or corrupt.`);
    if (cache) { try { await cache.put(cacheKey, new Response(bytes.slice(0))); } catch { /* quota or privacy mode: in-memory cache still applies */ } }
    return bytes;
  }

  /** Retry a failed font. */
  retry(spec: FontSpec): Promise<void> {
    const r = this.resolve(spec);
    const e = this.entries.get(r.key);
    if (e?.status.state === 'error') this.entries.delete(r.key);
    return this.load(spec);
  }

  // ---- custom fonts -------------------------------------------------------------------------------------------------
  /**
   * Register an uploaded font file. The file is parsed by the browser's font loader right away: a file that is not a usable font is
   * rejected with a visible error instead of being accepted and silently replaced by a fallback.
   */
  async addCustom(bytes: ArrayBuffer, info: { family: string; fileName: string; weight?: number; style?: FontStyle }, sha256: string): Promise<CustomFontMeta> {
    const meta: CustomFontMeta = {
      id: `${CUSTOM_FONT_PREFIX}${sha256.slice(0, 12)}`, family: info.family, fileName: info.fileName,
      weight: info.weight ?? 400, style: info.style ?? 'normal', bytes: bytes.byteLength, sha256,
    };
    const key = keyOf(meta.id, meta.weight, meta.style);
    const existing = this.entries.get(key);
    if (existing?.status.state === 'loaded') { this.customs.set(meta.id, meta); return meta; }
    const e: Entry = { status: { state: 'loading' }, waiters: 0 };
    this.entries.set(key, e);
    this.customs.set(meta.id, meta);
    this.emit();
    try {
      const face = this.faceFactory(cssFamilyOf(meta.id) + `-${meta.weight}-${meta.style}`, bytes.slice(0), meta.weight, meta.style);
      await face.load();
      this.registry.add(face);
      e.face = face; e.bytes = bytes;
      e.status = { state: 'loaded' };
      e.promise = Promise.resolve();
    } catch (err) {
      // a rejected upload is not kept: it must not appear in the person's font list
      const message = `This file could not be used as a font: ${(err as Error).message}`;
      this.entries.delete(key); this.customs.delete(meta.id);
      this.emit();
      throw new Error(message);
    }
    this.emit();
    return meta;
  }

  customFonts(): CustomFontMeta[] { return [...this.customs.values()]; }
  customMeta(id: string): CustomFontMeta | undefined { return this.customs.get(id); }
  removeCustom(id: string): void {
    const meta = this.customs.get(id);
    if (!meta) return;
    const key = keyOf(id, meta.weight, meta.style);
    const e = this.entries.get(key);
    if (e?.face) this.registry.delete?.(e.face);
    this.entries.delete(key); this.customs.delete(id); this.emit();
  }

  /** Raw bytes of a loaded font (for exports). */
  bytesOf(spec: FontSpec): ArrayBuffer | undefined {
    return this.entries.get(this.resolve(spec).key)?.bytes;
  }

  /** Every file currently loaded or loading (diagnostics). */
  loadedKeys(): string[] { return [...this.entries].filter(([, e]) => e.status.state === 'loaded').map(([k]) => k); }
}

const abortError = (): Error => { const e = new Error('Font load cancelled'); e.name = 'AbortError'; return e; };
export const isAbort = (e: unknown): boolean => (e as Error)?.name === 'AbortError';

/** The shared service used by the playground and by exported players. */
export const fonts = new FontService();

export const totalCatalogBytes = (): number => FONT_FAMILIES.reduce((s, f) => s + f.files.reduce((a, x) => a + x.bytes, 0), 0);
