// `npm run vfx`: build the VFX playground as one self-contained HTML file (fonts inside) and open it in your default browser.
// No dev server, no port, no network: if opening fails, the printed path can be opened by hand.
import { spawn, spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const major = Number(process.versions.node.split('.')[0]);
const minor = Number(process.versions.node.split('.')[1]);
if (major < 20 || (major === 20 && minor < 19)) {
  console.error(`Node ${process.versions.node} is too old: the playground needs Node 20.19 or newer (22 recommended). Install a newer Node from https://nodejs.org and run this again.`);
  process.exit(1);
}
for (const script of ['build-vfx-runtime.mjs', 'build-playground-single.mjs']) {
  const r = spawnSync(process.execPath, [resolve(root, 'scripts', script)], { stdio: 'inherit', cwd: root });
  if (r.status !== 0) { console.error(`\n${script} failed (exit ${r.status}). Copy the output above when asking for help.`); process.exit(r.status ?? 1); }
}
const file = resolve(root, 'dist/playground-single/index.html');
console.log(`\nThe VFX Playground is ready. Open this file in your browser if it does not open by itself:\n\n  ${file}\n  ${pathToFileURL(file).href}\n`);
const [cmd, args] = process.platform === 'darwin' ? ['open', [file]] : process.platform === 'win32' ? ['cmd', ['/c', 'start', '', file]] : ['xdg-open', [file]];
try { spawn(cmd, args, { stdio: 'ignore', detached: true }).on('error', () => console.log('(could not launch a browser automatically; open the file above)')).unref(); } catch { /* printed path is enough */ }
