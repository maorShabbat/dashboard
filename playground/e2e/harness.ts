import { createServer, type Server } from 'node:http';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright-core';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css', '.json': 'application/json',
  '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png', '.txt': 'text/plain', '.map': 'application/json', '.md': 'text/markdown',
};

export interface StaticServer { url: string; close(): Promise<void> }

export async function serveDir(dir: string): Promise<StaticServer> {
  const root = resolve(dir);
  const server: Server = createServer((req, res) => {
    const path = normalize(decodeURIComponent((req.url ?? '/').split('?')[0]!)).replace(/^(\.\.[/\\])+/, '');
    let file = join(root, path);
    if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
    if (!existsSync(file)) { res.writeHead(404).end('not found'); return; }
    res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' }).end(readFileSync(file));
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as { port: number }).port;
  return { url: `http://127.0.0.1:${port}/`, close: () => new Promise((r) => server.close(() => r())) };
}

export function findChromium(): string | undefined {
  if (process.env.CHROME_PATH && existsSync(process.env.CHROME_PATH)) return process.env.CHROME_PATH;
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH ?? '/opt/pw-browsers';
  if (existsSync(base)) {
    for (const d of readdirSync(base).filter((x) => /^chromium-\d+$/.test(x)).sort().reverse()) {
      const p = join(base, d, 'chrome-linux', 'chrome');
      if (existsSync(p)) return p;
    }
  }
  return undefined;
}

export async function launch(): Promise<Browser> {
  const executablePath = findChromium();
  return chromium.launch({ ...(executablePath ? { executablePath } : {}), args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
}

export interface Session { ctx: BrowserContext; page: Page; errors: string[] }

export async function openStudio(browser: Browser, url: string, opts: { viewport?: { width: number; height: number }; acceptDownloads?: boolean } = {}): Promise<Session> {
  const ctx = await browser.newContext({ viewport: opts.viewport ?? { width: 1500, height: 1000 }, acceptDownloads: true });
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  await page.goto(url);
  await page.waitForSelector('[data-testid="theme-view"]');
  await page.waitForFunction(() => [...document.fonts].some((f) => f.family === 'Bangers' && f.status === 'loaded'));
  return { ctx, page, errors };
}

/** Hash of the preview canvas pixels at an exact timeline position (verified paused at that time before reading). */
export async function frameHash(page: Page, ms: number, canvasTestId = 'preview-canvas'): Promise<string> {
  const want = `${(ms / 1000).toFixed(2)}s /`;
  for (let i = 0; i < 12; i++) {
    await pausePlayback(page);
    await page.fill('[data-testid="scrub"]', String(ms));
    await page.waitForTimeout(110);
    const tc = (await page.textContent('[data-testid="timecode"]')) ?? '';
    const playing = await page.getAttribute('[data-testid="btn-play"]', 'data-playing');
    if (playing === 'false' && tc.startsWith(want)) break;
  }
  return page.evaluate(async (id) => {
    const c = document.querySelector<HTMLCanvasElement>(`[data-testid="${id}"]`)!;
    const data = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
    const buf = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
  }, canvasTestId);
}

/** Fraction of non-transparent / non-black pixels (is anything drawn?). */
export async function inkRatio(page: Page, canvasTestId = 'preview-canvas'): Promise<number> {
  return page.evaluate((id) => {
    const c = document.querySelector<HTMLCanvasElement>(`[data-testid="${id}"]`)!;
    const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i + 3]! > 10 && (d[i]! > 12 || d[i + 1]! > 12 || d[i + 2]! > 12)) n++;
    return n / (d.length / 4);
  }, canvasTestId);
}

export async function pausePlayback(page: Page): Promise<void> {
  const playing = await page.getAttribute('[data-testid="btn-play"]', 'data-playing');
  if (playing === 'true') await page.click('[data-testid="btn-play"]');
}
