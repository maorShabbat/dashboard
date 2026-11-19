/** Reading bundles back: ZIP → validated contents → a theme package that the normal importer understands. */
import { fromUtf8 } from '../util/sha256';
import { type ZipEntry, readZip } from '../util/zip';
import { SCHEMA_VERSION } from '../version';
import { type ImportResult, type ThemePackage, base64ToBytes, bytesToBase64, importThemePackage } from '../model/exchange';
import { contentHash } from '../model/ops';
import type { Project, UserFont } from '../model/types';
import { sha256Hex } from '../util/sha256';
import { LIBRARY_PATH, MANIFEST_PATH, type BundleLibrary, type BundleManifest } from './types';

export class BundleError extends Error {}

export interface BundleContents { entries: Map<string, Uint8Array>; manifest: BundleManifest; library: BundleLibrary; order: ZipEntry[] }

export async function readBundle(bytes: Uint8Array): Promise<BundleContents> {
  let order: ZipEntry[];
  try { order = await readZip(bytes); } catch (e) { throw new BundleError(`Not a valid bundle archive: ${(e as Error).message}`); }
  const entries = new Map(order.map((e) => [e.path, e.data]));
  const m = entries.get(MANIFEST_PATH);
  if (!m) throw new BundleError('manifest.json is missing');
  let manifest: BundleManifest;
  try { manifest = JSON.parse(fromUtf8(m)) as BundleManifest; } catch { throw new BundleError('manifest.json is not valid JSON'); }
  if (manifest.format !== 'bangers.bundle') throw new BundleError('manifest.json is not a BANGERS bundle manifest');
  const l = entries.get(LIBRARY_PATH);
  if (!l) throw new BundleError(`${LIBRARY_PATH} is missing`);
  let library: BundleLibrary;
  try { library = JSON.parse(fromUtf8(l)) as BundleLibrary; } catch { throw new BundleError(`${LIBRARY_PATH} is not valid JSON`); }
  return { entries, manifest, library, order };
}

const FONT_MIME: Record<string, string> = { woff2: 'font/woff2', woff: 'font/woff', ttf: 'font/ttf', otf: 'font/otf' };

/** Convert bundle contents into the portable theme-package shape so one importer (with all its sanitising) serves both. */
export function bundleToThemePackage(c: BundleContents): ThemePackage {
  const { manifest, library, entries } = c;
  const licenseOf = (key: string | null) => {
    const l = manifest.licenses.find((x) => x.key === key);
    const text = l && entries.get(l.path) ? fromUtf8(entries.get(l.path)!) : undefined;
    return { id: l?.id ?? 'custom', name: l?.name ?? 'Unspecified licence', ...(l?.holder ? { holder: l.holder } : {}), ...(l?.url ? { url: l.url } : {}), ...(l?.attribution ? { attribution: l.attribution } : {}), ...(text ? { text } : {}), redistributable: l?.redistributable === true };
  };
  const media: ThemePackage['media'] = [];
  for (const m of manifest.media) {
    if (m.id.startsWith('builtin:')) continue; // built-ins ship with the app
    const data = entries.get(m.path);
    if (!data) continue;
    media.push({ id: m.id, kind: m.kind, name: m.name, mime: m.mime, size: data.length, hash: sha256Hex(data), license: licenseOf(m.license), data: bytesToBase64(data) });
  }
  const fonts: UserFont[] = [];
  for (const f of manifest.fonts) {
    if (f.origin !== 'user' || !f.bundled) continue;
    const files: UserFont['files'] = [];
    for (const file of f.files) {
      const data = entries.get(file.path);
      if (!data) continue;
      const mediaId = `font_${f.id}_${file.weight}${file.style === 'italic' ? 'i' : ''}`;
      media.push({ id: mediaId, kind: 'font', name: file.path.split('/').pop()!, mime: FONT_MIME[file.format] ?? 'font/woff2', size: data.length, hash: sha256Hex(data), license: licenseOf(f.license), data: bytesToBase64(data) });
      files.push({ weight: file.weight, style: file.style, mediaId });
    }
    if (files.length) fonts.push({ id: f.id, label: f.family, family: f.family, fallback: f.fallback, files, license: licenseOf(f.license) });
  }
  const t = manifest.theme;
  const verId = t.version?.id ?? `ver_${t.contentHash.slice(0, 12)}`;
  return {
    format: 'bangers.theme', schemaVersion: manifest.schemaVersion, packageVersion: manifest.packageVersion, exportedAt: manifest.createdAt,
    theme: {
      id: library.theme.id, name: library.theme.name, description: library.theme.description, tags: [], draft: library.theme.content,
      versions: [{
        id: verId, number: t.version?.number ?? 1, label: t.version?.label ?? 'Imported', note: `Imported from bundle "${manifest.name}"`, createdAt: manifest.createdAt,
        hash: contentHash(library.theme.content), content: library.theme.content, approval: t.approved ? { status: 'approved', at: manifest.createdAt, note: 'Approved at source' } : { status: 'none' },
      }],
      approvedVersionId: t.approved ? verId : null,
    },
    presets: library.presets.map((p) => ({ id: p.id, name: p.name, description: p.description, tags: [], draft: p.content })),
    sequences: library.sequences.map((s) => ({ id: s.id, name: s.name, description: s.description, tags: [], draft: s.content })),
    media, fonts,
  };
}

export interface BundleImport extends ImportResult { contents: BundleContents }

/** Import a bundle into `project` as a new theme (fresh ids unless `preserveIds`, which is for verification into an empty project). */
export async function importBundle(project: Project, bytes: Uint8Array, opts: { preserveIds?: boolean } = {}): Promise<BundleImport> {
  const contents = await readBundle(bytes);
  if (contents.manifest.schemaVersion > SCHEMA_VERSION) throw new BundleError(`Bundle schema ${contents.manifest.schemaVersion} is newer than this studio understands (${SCHEMA_VERSION})`);
  const res = importThemePackage(project, bundleToThemePackage(contents), opts);
  return { ...res, contents };
}

export { base64ToBytes };
