/** Checks a bundle's contents: every listed file is present and unchanged, every font used has its file and licence, every image resolves. */
import { sha256Hex } from '../../core/util/sha256';
import { fromUtf8 } from '../../core/util/sha256';
import type { ZipEntry } from '../../core/util/zip';
import type { FontManifest } from '../fonts/manifest';
import { sceneAllAssets, sceneFonts } from '../model/scene';
import type { Preset } from '../model/preset';

export interface BundleReport { ok: boolean; problems: string[]; fonts: string[]; files: number }

export function verifyBundle(entries: ZipEntry[]): BundleReport {
  const problems: string[] = [];
  const roots = new Set(entries.map((e) => e.path.split('/')[0]));
  if (roots.size !== 1) return { ok: false, problems: ['The archive must contain one folder.'], fonts: [], files: entries.length };
  const root = [...roots][0]!;
  const get = (p: string) => entries.find((e) => e.path === `${root}/${p}`);
  const text = (p: string) => { const e = get(p); if (!e) { problems.push(`missing ${p}`); return ''; } return fromUtf8(e.data); };

  const manifest = JSON.parse(text('manifest.json') || '{}') as { files?: { path: string; bytes: number; sha256: string }[]; assets?: Record<string, string>; player?: { sha256: string } };
  for (const f of manifest.files ?? []) {
    const e = get(f.path);
    if (!e) problems.push(`listed but missing: ${f.path}`);
    else if (e.data.length !== f.bytes || sha256Hex(e.data) !== f.sha256) problems.push(`changed: ${f.path}`);
  }
  for (const e of entries) { const rel = e.path.slice(root.length + 1); if (rel !== 'manifest.json' && !(manifest.files ?? []).some((f) => f.path === rel)) problems.push(`not in the manifest: ${rel}`); }

  const preset = JSON.parse(text('preset.json') || '{}') as Preset;
  const lic = JSON.parse(text('font-licenses.json') || '{}') as FontManifest;
  const used = sceneFonts(preset.scene ?? { elements: [] } as never);
  for (const spec of used) {
    const entry = lic.fonts?.find((f) => f.id === spec.id);
    if (!entry) { problems.push(`font ${spec.id} is used but not in font-licenses.json`); continue; }
    for (const k of ['family', 'source', 'licenseId', 'dateChecked'] as const) if (!entry.userSupplied && !entry[k]) problems.push(`font-licenses.json: ${spec.id} has no ${k}`);
    if (!entry.userSupplied && entry.redistributionPermitted !== true) problems.push(`font ${spec.id}: redistribution is not permitted`);
    for (const f of entry.includedFiles) if (!get(f.file)) problems.push(`font file missing: ${f.file}`);
    if (!entry.userSupplied && (!entry.licenseFile || !get(entry.licenseFile))) problems.push(`licence text missing for ${spec.id}`);
  }
  // only fonts that are used may be shipped
  const shipped = new Set(entries.filter((e) => /\/fonts\/[^/]+\//.test(e.path)).map((e) => e.path.split('/')[2]));
  for (const f of shipped) if (!used.some((u) => u.id === f || u.id.replace(/[^a-zA-Z0-9._-]+/g, '-') === f)) problems.push(`unused font shipped: ${f}`);
  for (const asset of preset.scene ? sceneAllAssets(preset.scene) : []) {
    const p = manifest.assets?.[asset];
    if (!p || !get(p)) problems.push(`asset ${asset} is not in the bundle`);
  }
  if (!get('vfx-player.js') || !get('index.html')) problems.push('player or demo page missing');
  return { ok: problems.length === 0, problems, fonts: used.map((u) => u.id), files: entries.length };
}
