// Bundles the builder to <out>/builder.js and copies host.html to <out>/index.html. Usage: node foundry/builder/build.mjs [outDir]
import { buildSync } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
const out = path.resolve(process.argv[2] ?? '.cache/foundry/builder');
fs.mkdirSync(out, { recursive: true });
buildSync({ entryPoints: ['foundry/builder/main.tsx'], bundle: true, minify: true, format: 'iife', target: 'es2020', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' }, outfile: path.join(out, 'builder.js'), logLevel: 'warning' });
buildSync({ entryPoints: ['foundry/builder/sim.worker.ts'], bundle: true, minify: true, format: 'iife', target: 'es2020', outfile: path.join(out, 'sim.worker.js'), logLevel: 'warning' });
fs.copyFileSync('foundry/builder/host.html', path.join(out, 'index.html'));
console.log(`builder -> ${out} (${(fs.statSync(path.join(out, 'builder.js')).size / 1024).toFixed(0)} KB)`);
