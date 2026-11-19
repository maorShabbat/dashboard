// Builds the VFX playground as ONE self-contained HTML file: JS, CSS, pictures, every bundled font file and every font licence inline.
//   dist/playground-single/index.html     full document
//   dist/playground-single/artifact.html  body fragment for hosts that wrap the page themselves
// Fonts and licence texts sit in a non-script JSON block and are decoded one file at a time, only when a font is shown or exported.
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { build } from 'vite';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const tmp = resolve(root, 'dist/playground-tmp');
const out = resolve(root, 'dist/playground-single');
const catalog = resolve(root, 'assets/fonts/catalog');

/** The multi-file build loads fonts and licences through import.meta.glob (separate files); here they come from the embedded pack. */
const stubGlobs = () => ({
  name: 'vfx-single-stub-globs', enforce: 'pre',
  transform(code, id) {
    if (!/(export\/bundle|app\/fontUrls)\.ts$/.test(id)) return null;
    return { code: code.replace(/import\.meta\.glob\(\s*'[^']*'\s*,\s*\{[^}]*\}\s*\)/g, '({})'), map: null };
  },
});

await build({
  root, configFile: false, base: './', logLevel: 'warn', plugins: [react(), stubGlobs()],
  build: { outDir: tmp, emptyOutDir: true, sourcemap: false, cssCodeSplit: false, assetsInlineLimit: 100_000_000, chunkSizeWarningLimit: 8000, rollupOptions: { input: resolve(root, 'playground.html'), output: { codeSplitting: false } } },
});

const html = readFileSync(resolve(tmp, 'playground.html'), 'utf8');
const jsRef = /<script type="module"[^>]*src="\.\/(assets\/[^"]+\.js)"[^>]*><\/script>/.exec(html);
const cssRef = /<link rel="stylesheet"[^>]*href="\.\/(assets\/[^"]+\.css)"[^>]*>/.exec(html);
if (!jsRef || !cssRef) throw new Error('Could not find the built JS/CSS references in playground.html');
const js = readFileSync(resolve(tmp, jsRef[1]), 'utf8').replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '<\\!--');
const css = readFileSync(resolve(tmp, cssRef[1]), 'utf8');
if (/url\(["']?\.?\/?assets\//.test(css) || /["']\.\/assets\//.test(js)) throw new Error('Some assets were not inlined');

// the font pack: every bundled woff2 (base64) and every licence text
const pack = { fonts: {}, licenses: {} };
for (const id of readdirSync(catalog).sort()) {
  for (const f of readdirSync(join(catalog, id))) {
    if (f.endsWith('.woff2')) pack.fonts[`${id}/${f}`] = readFileSync(join(catalog, id, f)).toString('base64');
    else if (f === 'LICENSE.txt') pack.licenses[id] = readFileSync(join(catalog, id, f), 'utf8');
  }
}
const packJson = JSON.stringify(pack).replace(/</g, '\\u003c');
const catalogJson = JSON.parse(readFileSync(resolve(root, 'src/vfx/fonts/catalog.json'), 'utf8'));
const missing = catalogJson.families.flatMap((f) => [...f.files.map((x) => `${f.id}/${x.file}`), ...(pack.licenses[f.id] ? [] : [`${f.id}/LICENSE.txt`])]).filter((k) => !(k in pack.fonts) && !k.endsWith('LICENSE.txt'));
if (missing.length || catalogJson.families.some((f) => !pack.licenses[f.id])) throw new Error(`Font pack incomplete: ${missing.join(', ')}`);

const title = /<title>([^<]*)<\/title>/.exec(html)?.[1] ?? 'BANGERS VFX Playground';
const body = `<div id="root"></div>\n<script type="application/json" id="vfx-font-pack">${packJson}</script>\n<script type="module">\n${js}\n</script>`;
mkdirSync(out, { recursive: true });
writeFileSync(resolve(out, 'index.html'), `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8" />\n<meta name="viewport" content="width=device-width, initial-scale=1" />\n<title>${title}</title>\n<link rel="icon" href="data:," />\n<style>\n${css}\n</style>\n</head>\n<body>\n${body}\n</body>\n</html>\n`);
writeFileSync(resolve(out, 'artifact.html'), `<title>${title}</title>\n<style>\n${css}\n</style>\n${body}\n`);
rmSync(tmp, { recursive: true, force: true });
const kb = (f) => (readFileSync(resolve(out, f)).length / 1024).toFixed(0);
console.log(`playground single-file build: index.html ${kb('index.html')} KiB, artifact.html ${kb('artifact.html')} KiB (${Object.keys(pack.fonts).length} font files, ${Object.keys(pack.licenses).length} licences)`);
