// The asset library: files the user drops once (images, videos, sounds, JSON/atlas data) and picks from everywhere.
// Stored in the browser (IndexedDB) so they survive a reload; falls back to memory when storage is blocked.

export type AssetKind = 'image' | 'video' | 'audio' | 'data';
export interface AssetMeta { id: string; name: string; kind: AssetKind; mime: string; size: number; added: number; width?: number; height?: number; duration?: number; thumb?: string }

export const MAX_FILE = 60 * 1024 * 1024;
export const KIND_LABEL: Record<AssetKind, string> = { image: 'Images', video: 'Videos', audio: 'Sounds', data: 'Data' };

export function kindOf(file: { name: string; type: string }): AssetKind | null {
  const t = file.type.toLowerCase(); const n = file.name.toLowerCase();
  if (t.startsWith('image/') || /\.(png|jpe?g|webp|gif|svg|avif)$/.test(n)) return 'image';
  if (t.startsWith('video/') || /\.(webm|mp4|mov|m4v)$/.test(n)) return 'video';
  if (t.startsWith('audio/') || /\.(mp3|ogg|wav|m4a|aac|flac)$/.test(n)) return 'audio';
  if (t === 'application/json' || /\.(json|atlas|skel|txt|csv)$/.test(n)) return 'data';
  return null;
}
export const ACCEPT = 'image/*,video/*,audio/*,.json,.atlas,.skel,.txt,.csv';
export const humanSize = (n: number) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : n >= 1024 ? `${Math.round(n / 1024)} KB` : `${n} B`);

// ---- storage ------------------------------------------------------------------------------------------------------
interface Store { list(): Promise<AssetMeta[]>; put(meta: AssetMeta, blob: Blob): Promise<void>; remove(id: string): Promise<void>; blob(id: string): Promise<Blob | undefined>; update(meta: AssetMeta): Promise<void>; persistent: boolean }

function memoryStore(): Store {
  const metas = new Map<string, AssetMeta>(); const blobs = new Map<string, Blob>();
  return { persistent: false, list: async () => [...metas.values()], put: async (m, b) => { metas.set(m.id, m); blobs.set(m.id, b); }, remove: async (id) => { metas.delete(id); blobs.delete(id); }, blob: async (id) => blobs.get(id), update: async (m) => { metas.set(m.id, m); } };
}

function idbStore(db: IDBDatabase): Store {
  const tx = <T,>(store: string, mode: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest<T>) => new Promise<T>((res, rej) => { const r = f(db.transaction(store, mode).objectStore(store)); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  return {
    persistent: true,
    list: () => tx<AssetMeta[]>('meta', 'readonly', (s) => s.getAll() as IDBRequest<AssetMeta[]>),
    put: async (m, b) => { await tx('blobs', 'readwrite', (s) => s.put(b, m.id)); await tx('meta', 'readwrite', (s) => s.put(m)); },
    remove: async (id) => { await tx('meta', 'readwrite', (s) => s.delete(id)); await tx('blobs', 'readwrite', (s) => s.delete(id)); },
    blob: (id) => tx<Blob | undefined>('blobs', 'readonly', (s) => s.get(id) as IDBRequest<Blob | undefined>),
    update: async (m) => { await tx('meta', 'readwrite', (s) => s.put(m)); },
  };
}

let storePromise: Promise<Store> | null = null;
export function getStore(): Promise<Store> {
  if (!storePromise) {
    storePromise = new Promise<Store>((resolve) => {
      try {
        const req = indexedDB.open('foundry-builder-assets', 1);
        req.onupgradeneeded = () => { const d = req.result; d.createObjectStore('meta', { keyPath: 'id' }); d.createObjectStore('blobs'); };
        req.onsuccess = () => resolve(idbStore(req.result));
        req.onerror = () => resolve(memoryStore());
        req.onblocked = () => resolve(memoryStore());
      } catch { resolve(memoryStore()); }
    });
  }
  return storePromise;
}

// ---- reading files --------------------------------------------------------------------------------------------------
async function imageInfo(blob: Blob): Promise<{ width: number; height: number; thumb: string } | null> {
  try {
    const bmp = await createImageBitmap(blob);
    const k = Math.min(1, 160 / Math.max(bmp.width, bmp.height)); const cv = document.createElement('canvas'); cv.width = Math.max(1, Math.round(bmp.width * k)); cv.height = Math.max(1, Math.round(bmp.height * k));
    cv.getContext('2d')!.drawImage(bmp, 0, 0, cv.width, cv.height);
    return { width: bmp.width, height: bmp.height, thumb: cv.toDataURL('image/png') };
  } catch { return null; }
}
async function videoInfo(blob: Blob): Promise<{ width: number; height: number; duration: number; thumb?: string } | null> {
  return new Promise((resolve) => {
    const v = document.createElement('video'); const url = URL.createObjectURL(blob); v.muted = true; v.preload = 'metadata'; v.src = url;
    const done = (r: { width: number; height: number; duration: number; thumb?: string } | null) => { URL.revokeObjectURL(url); resolve(r); };
    const timer = setTimeout(() => done(null), 4000);
    v.onloadeddata = () => {
      clearTimeout(timer);
      try { const k = Math.min(1, 160 / Math.max(v.videoWidth, v.videoHeight)); const cv = document.createElement('canvas'); cv.width = Math.max(1, Math.round(v.videoWidth * k)); cv.height = Math.max(1, Math.round(v.videoHeight * k)); cv.getContext('2d')!.drawImage(v, 0, 0, cv.width, cv.height); done({ width: v.videoWidth, height: v.videoHeight, duration: v.duration, thumb: cv.toDataURL('image/png') }); }
      catch { done({ width: v.videoWidth, height: v.videoHeight, duration: v.duration }); }
    };
    v.onerror = () => { clearTimeout(timer); done(null); };
  });
}
async function audioDuration(blob: Blob): Promise<number | undefined> {
  return new Promise((resolve) => { const a = document.createElement('audio'); const url = URL.createObjectURL(blob); a.preload = 'metadata'; a.src = url; const t = setTimeout(() => { URL.revokeObjectURL(url); resolve(undefined); }, 3000); a.onloadedmetadata = () => { clearTimeout(t); URL.revokeObjectURL(url); resolve(Number.isFinite(a.duration) ? a.duration : undefined); }; a.onerror = () => { clearTimeout(t); URL.revokeObjectURL(url); resolve(undefined); }; });
}

export interface AddResult { added: AssetMeta[]; rejected: { name: string; reason: string }[] }
export async function addFiles(files: File[]): Promise<AddResult> {
  const store = await getStore(); const added: AssetMeta[] = []; const rejected: { name: string; reason: string }[] = [];
  for (const f of files) {
    const kind = kindOf(f);
    if (!kind) { rejected.push({ name: f.name, reason: 'This file type is not supported (images, videos, sounds, JSON/atlas).' }); continue; }
    if (f.size > MAX_FILE) { rejected.push({ name: f.name, reason: `Larger than ${humanSize(MAX_FILE)}.` }); continue; }
    const meta: AssetMeta = { id: `a${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`, name: f.name, kind, mime: f.type || 'application/octet-stream', size: f.size, added: Date.now() };
    if (kind === 'image') { const i = await imageInfo(f); if (!i && !/\.svg$/i.test(f.name)) { rejected.push({ name: f.name, reason: 'This image could not be read.' }); continue; } if (i) Object.assign(meta, i); }
    if (kind === 'video') { const i = await videoInfo(f); if (i) Object.assign(meta, i); }
    if (kind === 'audio') meta.duration = await audioDuration(f);
    try { await store.put(meta, f); added.push(meta); } catch { rejected.push({ name: f.name, reason: 'The browser could not store this file (storage full or blocked).' }); }
  }
  return { added, rejected };
}
