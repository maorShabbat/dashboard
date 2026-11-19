/** Node adapters for the exporter: runtime source and built-in font files come from the repository checkout. */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ExportEnv } from '../core/bundle/export';
import type { Project } from '../core/model/types';
import type { ZipEntry } from '../core/util/zip';

export function repoRoot(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 6; i++) {
    if (existsSync(join(dir, 'package.json')) && existsSync(join(dir, 'assets', 'fonts'))) return dir;
    dir = resolve(dir, '..');
  }
  throw new Error('Could not locate the repository root (package.json + assets/fonts)');
}

export function nodeExportEnv(project: Project, blobs: ReadonlyMap<string, Uint8Array> = new Map()): ExportEnv {
  const root = repoRoot();
  const runtimePath = join(root, 'generated', 'bangers-runtime.js');
  if (!existsSync(runtimePath)) throw new Error('generated/bangers-runtime.js is missing; run `npm run build:runtime` first');
  return {
    project,
    blob: (hash) => blobs.get(hash),
    builtinFontFile: (rel) => { const p = join(root, 'assets', 'fonts', rel); return existsSync(p) ? new Uint8Array(readFileSync(p)) : undefined; },
    runtimeSource: readFileSync(runtimePath, 'utf8'),
    runtimeDts: readFileSync(join(root, 'src', 'runtime', 'runtime.d.ts'), 'utf8'),
  };
}

/** Write bundle entries to a directory (used to run the shipped examples exactly as an integrator would). */
export function extractEntries(entries: ZipEntry[], dir: string): void {
  for (const e of entries) {
    const target = join(dir, e.path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, e.data);
  }
}
