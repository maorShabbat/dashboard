// Builds the editor as ONE self-contained HTML file (JS, CSS and fonts inlined).
//   dist/single/index.html     full document: double-click it, or host it anywhere
//   dist/single/artifact.html  body fragment for hosts that wrap the page themselves
import react from '@vitejs/plugin-react';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const tmp = resolve(root, 'dist/single-tmp');
const out = resolve(root, 'dist/single');

await build({
  root, configFile: false, plugins: [react()], base: './', logLevel: 'warn',
  build: { outDir: tmp, emptyOutDir: true, sourcemap: false, cssCodeSplit: false, assetsInlineLimit: 100_000_000, chunkSizeWarningLimit: 4000 },
});

let html = readFileSync(resolve(tmp, 'index.html'), 'utf8');
const jsRef = /<script type="module"[^>]*src="\.\/(assets\/[^"]+\.js)"[^>]*><\/script>/.exec(html);
const cssRef = /<link rel="stylesheet"[^>]*href="\.\/(assets\/[^"]+\.css)"[^>]*>/.exec(html);
if (!jsRef || !cssRef) throw new Error('Could not find the built JS/CSS references in index.html');
const js = readFileSync(resolve(tmp, jsRef[1]), 'utf8').replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '<\\!--');
const css = readFileSync(resolve(tmp, cssRef[1]), 'utf8');
if (/url\(["']?\.?\/?assets\//.test(css) || /["']\.\/assets\//.test(js)) throw new Error('Some assets were not inlined');

const title = /<title>([^<]*)<\/title>/.exec(html)?.[1] ?? 'BANGERS Theme Studio';
const icon = /<link rel="icon"[^>]*>/.exec(html)?.[0] ?? '';
const body = `<div id="root"></div>\n<script type="module">\n${js}\n</script>`;
mkdirSync(out, { recursive: true });
writeFileSync(resolve(out, 'index.html'), `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8" />\n<meta name="viewport" content="width=device-width, initial-scale=1" />\n<title>${title}</title>\n${icon}\n<style>\n${css}\n</style>\n</head>\n<body>\n${body}\n</body>\n</html>\n`);
writeFileSync(resolve(out, 'artifact.html'), `<title>${title}</title>\n<style>\n${css}\n</style>\n${body}\n`);
rmSync(tmp, { recursive: true, force: true });
const kb = (f) => (readFileSync(resolve(out, f)).length / 1024).toFixed(0);
console.log(`single-file build: index.html ${kb('index.html')} KiB, artifact.html ${kb('artifact.html')} KiB`);
