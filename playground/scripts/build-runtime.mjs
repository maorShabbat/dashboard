// Bundles src/runtime/index.ts into one dependency-free ES module that is embedded in every exported bundle.
import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(root, 'generated');
mkdirSync(out, { recursive: true });

const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
const banner = `/*! BANGERS runtime v${pkg.version}. Generated from the Theme Studio source; do not edit. */`;

await build({
  entryPoints: [resolve(root, 'src/runtime/index.ts')],
  outfile: resolve(out, 'bangers-runtime.js'),
  bundle: true, format: 'esm', platform: 'neutral', target: 'es2022', minify: false, legalComments: 'none', banner: { js: banner },
});
const js = readFileSync(resolve(out, 'bangers-runtime.js'));
writeFileSync(resolve(out, 'runtime-meta.json'), JSON.stringify({ version: pkg.version, sha256: createHash('sha256').update(js).digest('hex'), bytes: js.length }, null, 2));

// `bangers` CLI (verify / export-starter). Node only, no TypeScript runtime needed.
await build({
  entryPoints: [resolve(root, 'src/cli/verify.ts')],
  outfile: resolve(root, 'dist/cli/bangers.mjs'),
  bundle: true, format: 'esm', platform: 'node', target: 'node20', legalComments: 'none',
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
});
console.log(`runtime built: ${(js.length / 1024).toFixed(1)} KiB`);
