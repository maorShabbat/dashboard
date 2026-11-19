// Bundles src/vfx/runtime/index.ts into one dependency-free ES module (generated/vfx-player.js) that is copied into every exported bundle.
import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(root, 'generated');
mkdirSync(out, { recursive: true });
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
await build({
  entryPoints: [resolve(root, 'src/vfx/runtime/index.ts')], outfile: resolve(out, 'vfx-player.js'),
  bundle: true, format: 'esm', platform: 'browser', target: 'es2022', minifyWhitespace: true, minifySyntax: true, legalComments: 'none',
  banner: { js: `/*! BANGERS VFX player v${pkg.version}. Generated from the playground source; do not edit. */` },
});
const js = readFileSync(resolve(out, 'vfx-player.js'));
writeFileSync(resolve(out, 'vfx-player-meta.json'), JSON.stringify({ version: pkg.version, sha256: createHash('sha256').update(js).digest('hex'), bytes: js.length }, null, 2));
console.log(`vfx player built: ${(js.length / 1024).toFixed(1)} KiB`);
