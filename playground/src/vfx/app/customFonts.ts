/** Uploaded fonts live in this browser (IndexedDB): the bytes plus a small description, restored on every start. */
import { sha256Hex } from '../../core/util/sha256';
import type { FontStyle } from '../fonts/catalog';
import type { CustomFontMeta, FontService } from '../fonts/service';
import type { AssetStore } from '../player/assets';

const metaKey = (id: string) => `fontmeta:${id}`;
const dataKey = (id: string) => `fontdata:${id}`;

export async function addCustomFont(fonts: FontService, store: AssetStore, file: File, opts: { family: string; weight: number; style: FontStyle }): Promise<CustomFontMeta> {
  const bytes = await file.arrayBuffer();
  const sha = sha256Hex(new Uint8Array(bytes));
  const meta = await fonts.addCustom(bytes, { family: opts.family, fileName: file.name, weight: opts.weight, style: opts.style }, sha);
  await store.put(dataKey(meta.id), new Blob([bytes], { type: file.type || 'font/woff2' }), file.name);
  await store.put(metaKey(meta.id), new Blob([JSON.stringify(meta)], { type: 'application/json' }), 'meta.json');
  return meta;
}

export async function removeCustomFont(fonts: FontService, store: AssetStore, id: string): Promise<void> {
  fonts.removeCustom(id);
  await store.delete(dataKey(id)); await store.delete(metaKey(id));
}

export async function restoreCustomFonts(fonts: FontService, store: AssetStore): Promise<CustomFontMeta[]> {
  const out: CustomFontMeta[] = [];
  for (const rec of await store.list()) {
    if (!rec.id.startsWith('fontmeta:')) continue;
    try {
      const metaRec = await store.get(rec.id);
      const meta = JSON.parse(await metaRec!.blob.text()) as CustomFontMeta;
      const data = await store.get(dataKey(meta.id));
      if (!data) continue;
      await fonts.addCustom(await data.blob.arrayBuffer(), { family: meta.family, fileName: meta.fileName, weight: meta.weight, style: meta.style }, meta.sha256);
      out.push(meta);
    } catch { /* a stored font that no longer loads is skipped; presets that use it show a visible warning */ }
  }
  return out;
}

export const familyFromFileName = (name: string): string => name.replace(/\.[a-z0-9]+$/i, '').replace(/[-_]+/g, ' ').replace(/\b(regular|bold|italic|medium|light)\b/gi, '').replace(/\s+/g, ' ').trim() || 'My font';
