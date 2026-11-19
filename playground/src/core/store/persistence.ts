/** Persistence behind a tiny async key/value interface: IndexedDB in the browser, memory in tests/Node. */
import { sha256Hex } from '../util/sha256';
import type { Project } from '../model/types';
import { SCHEMA_VERSION } from '../version';
import { sanitizeProject } from '../model/exchange';

export interface KV {
  get(key: string): Promise<Uint8Array | string | undefined>;
  set(key: string, value: Uint8Array | string): Promise<void>;
  delete(key: string): Promise<void>;
  keys(prefix?: string): Promise<string[]>;
}

export class MemoryKV implements KV {
  private m = new Map<string, Uint8Array | string>();
  async get(k: string) { return this.m.get(k); }
  async set(k: string, v: Uint8Array | string) { this.m.set(k, v); }
  async delete(k: string) { this.m.delete(k); }
  async keys(prefix = '') { return [...this.m.keys()].filter((k) => k.startsWith(prefix)); }
}

export class IdbKV implements KV {
  private db: Promise<IDBDatabase>;
  constructor(name = 'bangers-studio') {
    this.db = new Promise((resolve, reject) => {
      const req = indexedDB.open(name, 1);
      req.onupgradeneeded = () => { req.result.createObjectStore('kv'); };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  private async tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    const db = await this.db;
    return new Promise((resolve, reject) => {
      const r = fn(db.transaction('kv', mode).objectStore('kv'));
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  }
  get(k: string) { return this.tx('readonly', (s) => s.get(k)) as Promise<Uint8Array | string | undefined>; }
  async set(k: string, v: Uint8Array | string) { await this.tx('readwrite', (s) => s.put(v, k)); }
  async delete(k: string) { await this.tx('readwrite', (s) => s.delete(k)); }
  async keys(prefix = '') { return ((await this.tx('readonly', (s) => s.getAllKeys())) as string[]).filter((k) => k.startsWith(prefix)); }
}

const PROJECT_KEY = 'project.json';

/** Content-addressed binary store for media and font files. */
export class BlobStore {
  private cache = new Map<string, Uint8Array>();
  constructor(private kv: KV) {}

  async put(bytes: Uint8Array): Promise<string> {
    const hash = sha256Hex(bytes);
    if (!this.cache.has(hash)) { this.cache.set(hash, bytes); await this.kv.set(`blob:${hash}`, bytes); }
    return hash;
  }
  async get(hash: string): Promise<Uint8Array | undefined> {
    const c = this.cache.get(hash);
    if (c) return c;
    const v = await this.kv.get(`blob:${hash}`);
    if (v instanceof Uint8Array) { this.cache.set(hash, v); return v; }
    return undefined;
  }
  /** Synchronous read for blobs already loaded this session. */
  peek(hash: string): Uint8Array | undefined { return this.cache.get(hash); }
  async has(hash: string): Promise<boolean> { return this.cache.has(hash) || (await this.kv.get(`blob:${hash}`)) !== undefined; }
}

export async function loadProject(kv: KV): Promise<{ project: Project; warnings: string[] } | null> {
  const raw = await kv.get(PROJECT_KEY);
  if (typeof raw !== 'string') return null;
  try { return sanitizeProject(JSON.parse(raw)); } catch { return null; }
}

export async function saveProject(kv: KV, p: Project): Promise<void> {
  await kv.set(PROJECT_KEY, JSON.stringify(p));
}

/** Debounced autosave. Returns a flush+dispose function. */
export function attachAutosave(store: { subscribe(fn: () => void): () => void; state: Project }, kv: KV, onStatus?: (s: 'saving' | 'saved' | 'error') => void, delay = 400): () => Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending = false;
  const run = async () => {
    pending = false;
    onStatus?.('saving');
    try { await saveProject(kv, store.state); onStatus?.('saved'); } catch { onStatus?.('error'); }
  };
  const unsub = store.subscribe(() => { pending = true; if (timer) clearTimeout(timer); timer = setTimeout(run, delay); });
  return async () => { unsub(); if (timer) clearTimeout(timer); if (pending) await run(); };
}

export { SCHEMA_VERSION };
