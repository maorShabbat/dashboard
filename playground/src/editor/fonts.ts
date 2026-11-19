/** Browser font plumbing: built-in font files (bundled by Vite), user fonts from the blob store, and export-time file access. */
import { BUILTIN_FONTS } from '../core/fonts';
import type { Project } from '../core/model/types';
import type { BlobStore } from '../core/store/persistence';

const urls = import.meta.glob('../../assets/fonts/**/*.woff2', { query: '?url', import: 'default', eager: true }) as Record<string, string>;
const texts = import.meta.glob('../../assets/fonts/**/*.txt', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

const byRel = (rel: string) => `../../assets/fonts/${rel}`;

export function builtinFontUrl(rel: string): string | undefined { return urls[byRel(rel)]; }

/** Provider used by the bundle exporter in the browser. */
export async function builtinFontFile(rel: string): Promise<Uint8Array | undefined> {
  const t = texts[byRel(rel)];
  if (t !== undefined) return new TextEncoder().encode(t);
  const u = builtinFontUrl(rel);
  if (!u) return undefined;
  const embedded = /^data:[^,]*;base64,(.*)$/s.exec(u); // single-file builds embed fonts; decode directly (fetch of data: URLs can be blocked by a page policy)
  if (embedded) { const bin = atob(embedded[1]!); const out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out; }
  const r = await fetch(u);
  return r.ok ? new Uint8Array(await r.arrayBuffer()) : undefined;
}

const registered = new Set<string>();

export async function registerBuiltinFonts(): Promise<void> {
  if (typeof FontFace === 'undefined') return;
  await Promise.all(BUILTIN_FONTS.flatMap((f) => f.files.map(async (file) => {
    const key = `${f.id}:${file.weight}`;
    const u = builtinFontUrl(file.file);
    if (registered.has(key) || !u) return;
    registered.add(key);
    try {
      const face = new FontFace(f.family, `url(${u})`, { weight: String(file.weight), style: file.style });
      await face.load();
      document.fonts.add(face);
    } catch { registered.delete(key); }
  })));
}

export async function registerUserFonts(p: Project, blobs: BlobStore): Promise<void> {
  if (typeof FontFace === 'undefined') return;
  await Promise.all(Object.values(p.fonts).flatMap((f) => f.files.map(async (file) => {
    const m = p.media[file.mediaId];
    if (!m) return;
    const key = `user:${f.id}:${file.weight}:${m.hash}`;
    if (registered.has(key)) return;
    const bytes = await blobs.get(m.hash);
    if (!bytes) return;
    registered.add(key);
    try {
      const face = new FontFace(f.family, bytes.slice().buffer as ArrayBuffer, { weight: String(file.weight), style: file.style });
      await face.load();
      document.fonts.add(face);
    } catch { registered.delete(key); }
  })));
}

export function userFontStacks(p: Project): Record<string, { family: string; fallback: string }> {
  return Object.fromEntries(Object.values(p.fonts).map((f) => [f.id, { family: f.family, fallback: f.fallback }]));
}
