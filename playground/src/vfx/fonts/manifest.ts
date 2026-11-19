/**
 * The font-licence manifest written next to every exported bundle: for each font actually used, its family, source, licence,
 * the files and weights that are included, whether redistribution is permitted and when the licence was checked.
 */
import { getFamily, type FontSpec } from './catalog';
import { CUSTOM_FONT_DISCLAIMER, isCustomFontId, type CustomFontMeta } from './service';

export interface FontManifestFile { file: string; weight: number; style: 'normal' | 'italic'; sha256: string; bytes: number }
export interface FontManifestEntry {
  family: string;
  id: string;
  source: string;
  sourceUrl: string;
  licenseId: string;
  licenseUrl: string;
  /** Path of the licence text in the bundle (relative to the bundle root). */
  licenseFile: string | null;
  copyright: string;
  includedFiles: FontManifestFile[];
  includedWeights: number[];
  redistributionPermitted: boolean | 'user-responsibility';
  note: string;
  dateChecked: string;
  userSupplied: boolean;
}
export interface FontManifest { schema: 'bangers.font-licenses/1'; generated: string; fonts: FontManifestEntry[] }

/** Distinct (family, file) pairs for a list of specs, resolved to the file that is actually bundled. */
export function usedFontFiles(specs: FontSpec[], customs: (id: string) => CustomFontMeta | undefined = () => undefined): { id: string; weight: number; style: 'normal' | 'italic'; custom: boolean }[] {
  const out = new Map<string, { id: string; weight: number; style: 'normal' | 'italic'; custom: boolean }>();
  for (const s of specs) {
    if (isCustomFontId(s.id)) {
      const c = customs(s.id);
      const w = c?.weight ?? s.weight, st = c?.style ?? s.style;
      out.set(`${s.id}|${w}|${st}`, { id: s.id, weight: w, style: st, custom: true });
      continue;
    }
    const f = getFamily(s.id);
    if (!f) continue;
    const exact = f.files.find((x) => x.weight === s.weight && x.style === s.style);
    const file = exact ?? f.files.reduce((best, x) => (Math.abs(x.weight - s.weight) + (x.style === s.style ? 0 : 1000) < Math.abs(best.weight - s.weight) + (best.style === s.style ? 0 : 1000) ? x : best), f.files[0]!);
    out.set(`${f.id}|${file.weight}|${file.style}`, { id: f.id, weight: file.weight, style: file.style, custom: false });
  }
  return [...out.values()];
}

export function buildFontManifest(specs: FontSpec[], opts: { customs?: (id: string) => CustomFontMeta | undefined; generated?: string } = {}): FontManifest {
  const customs = opts.customs ?? (() => undefined);
  const files = usedFontFiles(specs, customs);
  const byFamily = new Map<string, typeof files>();
  for (const f of files) byFamily.set(f.id, [...(byFamily.get(f.id) ?? []), f]);
  const fonts: FontManifestEntry[] = [];
  for (const [id, list] of [...byFamily].sort((a, b) => a[0].localeCompare(b[0]))) {
    if (isCustomFontId(id)) {
      const c = customs(id);
      fonts.push({
        family: c?.family ?? id, id, source: `Uploaded by the user (${c?.fileName ?? 'unknown file'})`, sourceUrl: '',
        licenseId: 'user-supplied', licenseUrl: '', licenseFile: null, copyright: '',
        includedFiles: list.map((l) => ({ file: `fonts/${safeName(id)}/${safeName(c?.fileName ?? id)}`, weight: l.weight, style: l.style, sha256: c?.sha256 ?? '', bytes: c?.bytes ?? 0 })),
        includedWeights: [...new Set(list.map((l) => l.weight))].sort((a, b) => a - b),
        redistributionPermitted: 'user-responsibility', note: CUSTOM_FONT_DISCLAIMER, dateChecked: '', userSupplied: true,
      });
      continue;
    }
    const meta = getFamily(id)!;
    const chosen = list.map((l) => meta.files.find((x) => x.weight === l.weight && x.style === l.style)!);
    fonts.push({
      family: meta.family, id: meta.id, source: meta.source, sourceUrl: meta.sourceUrl, licenseId: meta.licenseId, licenseUrl: meta.licenseUrl,
      licenseFile: meta.licenseFile, copyright: meta.copyright,
      includedFiles: chosen.map((x) => ({ file: `fonts/${meta.id}/${x.file}`, weight: x.weight, style: x.style, sha256: x.sha256, bytes: x.bytes })),
      includedWeights: [...new Set(chosen.map((x) => x.weight))].sort((a, b) => a - b),
      redistributionPermitted: meta.redistributionPermitted, note: meta.redistributionNote, dateChecked: meta.dateChecked, userSupplied: false,
    });
  }
  return { schema: 'bangers.font-licenses/1', generated: opts.generated ?? new Date().toISOString().slice(0, 10), fonts };
}

export const safeName = (s: string): string => s.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'file';

/** Human-readable licence summary (written to FONT-LICENSES.txt in bundles). */
export function manifestText(m: FontManifest): string {
  const lines = ['BANGERS font licences', `Generated ${m.generated}`, ''];
  for (const f of m.fonts) {
    lines.push(`${f.family}`, `  Licence: ${f.licenseId}${f.licenseUrl ? ' (' + f.licenseUrl + ')' : ''}`, `  Source:  ${f.source}`,
      `  Files:   ${f.includedFiles.map((x) => `${x.file} (${x.weight} ${x.style})`).join(', ')}`,
      `  Redistribution permitted: ${f.redistributionPermitted === true ? 'yes' : f.redistributionPermitted === false ? 'NO' : 'user responsibility'}`,
      `  Checked: ${f.dateChecked || 'n/a'}`, f.copyright ? `  ${f.copyright}` : '', f.note ? `  ${f.note}` : '', '');
  }
  return lines.filter((l, i, a) => !(l === '' && a[i - 1] === '')).join('\n');
}
