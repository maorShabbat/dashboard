// Shared helpers for the playground verification tools: static server, headless Chromium (software WebGL2) and page access.
import { createServer } from 'node:http';
import { existsSync, readFileSync, readdirSync, statSync, mkdirSync, writeFileSync } from 'node:fs';
import { extname, join, resolve, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const OUT = join(ROOT, 'playground-out');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.webp': 'image/webp', '.png': 'image/png', '.woff2': 'font/woff2', '.json': 'application/json', '.webm': 'video/webm', '.txt': 'text/plain', '.zip': 'application/zip' };

export async function serve(dir = join(ROOT, 'dist/playground'), entry = 'playground.html') {
  const base = resolve(dir);
  const server = createServer((req, res) => {
    const path = normalize(decodeURIComponent((req.url ?? '/').split('?')[0])).replace(/^(\.\.[/\\])+/, '');
    let file = join(base, path);
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, entry);
    if (!file.startsWith(base) || !existsSync(file)) { res.writeHead(404).end('nf'); return; }
    res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream', 'accept-ranges': 'bytes' }).end(readFileSync(file));
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { url: `http://127.0.0.1:${server.address().port}/${entry}`, origin: `http://127.0.0.1:${server.address().port}`, close: () => new Promise((r) => server.close(r)) };
}

export function findChromium() {
  if (process.env.CHROME_PATH && existsSync(process.env.CHROME_PATH)) return process.env.CHROME_PATH;
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH ?? '/opt/pw-browsers';
  if (existsSync(base)) for (const d of readdirSync(base).filter((x) => /^chromium-\d+$/.test(x)).sort().reverse()) {
    const p = join(base, d, 'chrome-linux', 'chrome');
    if (existsSync(p)) return p;
  }
  return undefined;
}

export async function launch() {
  const executablePath = findChromium();
  return chromium.launch({
    ...(executablePath ? { executablePath } : {}),
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', '--disable-gpu-vsync', '--autoplay-policy=no-user-gesture-required'],
  });
}

/** Open the playground. `query` e.g. "lab=1". Waits for window.vfxReady. */
export async function open(browser, url, { w = 1280, h = 720, query = '' } = {}) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  await page.goto(query ? `${url}?${query}` : url);
  await page.evaluate(() => window.vfxReady);
  return { ctx, page, errors };
}

export const b64 = (dataUrl) => Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64');
export function save(name, buf) { mkdirSync(OUT, { recursive: true }); const p = join(OUT, name); writeFileSync(p, buf); return p; }

/** The exact frame at scene time t, as PNG bytes. */
export async function frameAt(page, t) {
  return b64(await page.evaluate((tt) => { const a = window.__vfx; a.seek(tt); return a.png(); }, t));
}
