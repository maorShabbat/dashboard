/** Import a preset file (.json) or a bundle (.zip) into this browser: images and fonts it carries are stored, the preset is validated. */
import { readZip } from '../../core/util/zip';
import { fromUtf8 } from '../../core/util/sha256';
import type { FontService } from '../fonts/service';
import type { Preset } from '../model/preset';
import { fromB64, importPresetJson } from '../model/serialize';
import { validatePreset } from '../model/validate';
import type { BundleManifest } from '../runtime';
import type { ImageLibrary } from '../player/assets';

export interface ImportOutcome { ok: boolean; preset?: Preset; errors: string[]; warnings: string[] }

export async function importFile(file: File, deps: { fonts: FontService; images: ImageLibrary }): Promise<ImportOutcome> {
  const { fonts, images } = deps;
  const store = images.storeRef();
  try {
    if (/\.zip$/i.test(file.name) || file.type === 'application/zip') {
      const entries = await readZip(new Uint8Array(await file.arrayBuffer()));
      const root = entries[0]?.path.split('/')[0];
      const get = (p: string) => entries.find((e) => e.path === `${root}/${p}`);
      const pj = get('preset.json');
      if (!pj) return { ok: false, errors: ['This zip has no preset.json: it is not a BANGERS VFX bundle.'], warnings: [] };
      const manifest = JSON.parse(fromUtf8(get('manifest.json')?.data ?? new Uint8Array())) as BundleManifest;
      for (const f of manifest.fonts ?? []) {
        if (!f.userSupplied) continue;
        const data = get(f.path);
        if (data) await fonts.addCustom(data.data.slice().buffer, { family: f.family, fileName: f.fileName, weight: f.weight, style: f.style }, f.sha256);
      }
      const r = validatePreset(JSON.parse(fromUtf8(pj.data)), { hasCustomFont: (id) => !!fonts.customMeta(id) });
      if (!r.ok) return { ok: false, errors: r.errors, warnings: r.warnings };
      for (const [id, path] of Object.entries(manifest.assets ?? {})) {
        if (id.startsWith('builtin:')) continue;
        const d = get(path);
        const ref = r.preset!.scene.assets.find((a) => a.id === id);
        if (d) await store.put(id, new Blob([d.data.slice().buffer], { type: ref?.type ?? '' }), ref?.name ?? path);
      }
      return { ok: true, preset: r.preset, errors: [], warnings: r.warnings };
    }
    const text = await file.text();
    const r = importPresetJson(text, { hasCustomFont: (id) => !!fonts.customMeta(id) });
    if (!r.ok) return { ok: false, errors: r.errors, warnings: r.warnings };
    for (const [id, a] of Object.entries(r.embedded)) {
      const ref = r.preset!.scene.assets.find((x) => x.id === id);
      await store.put(id, new Blob([fromB64(a.base64).slice().buffer], { type: a.type }), ref?.name ?? id);
    }
    return { ok: true, preset: r.preset, errors: [], warnings: r.warnings };
  } catch (e) { return { ok: false, errors: [`Could not read ${file.name}: ${(e as Error).message}`], warnings: [] }; }
}
