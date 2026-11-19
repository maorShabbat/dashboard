import { createServer, type Server } from 'node:http';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import { deflateSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright-core';
import { findChromium } from '../harness';
import '../../src/vfx/app/testApi';

export const ROOT = resolve(import.meta.dirname, '../..');
export const OUT = join(ROOT, 'playground-out', 'e2e');
mkdirSync(OUT, { recursive: true });

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.webp': 'image/webp', '.png': 'image/png', '.woff2': 'font/woff2',
  '.json': 'application/json', '.webm': 'video/webm', '.txt': 'text/plain', '.zip': 'application/zip', '.md': 'text/markdown',
};

export interface Served { url: string; origin: string; close(): Promise<void> }

export async function serveStatic(dir: string, entry: string): Promise<Served> {
  const base = resolve(dir);
  const server: Server = createServer((req, res) => {
    const path = normalize(decodeURIComponent((req.url ?? '/').split('?')[0]!)).replace(/^(\.\.[/\\])+/, '');
    let file = join(base, path);
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, entry);
    if (!file.startsWith(base) || !existsSync(file)) { res.writeHead(404).end('not found'); return; }
    res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' }).end(readFileSync(file));
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as { port: number }).port;
  return { url: `http://127.0.0.1:${port}/${entry}`, origin: `http://127.0.0.1:${port}`, close: () => new Promise((r) => server.close(() => r())) };
}

export async function launchGl(): Promise<Browser> {
  const executablePath = findChromium();
  return chromium.launch({
    ...(executablePath ? { executablePath } : {}),
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', '--disable-gpu-vsync', '--autoplay-policy=no-user-gesture-required'],
  });
}

export interface App { ctx: BrowserContext; page: Page; errors: string[] }

const opened = new Set<BrowserContext>();
/** Close every context a test opened (a failing test must not leave a rendering page behind to slow the next one). */
export async function closeApps(): Promise<void> { for (const c of [...opened]) { opened.delete(c); await c.close().catch(() => undefined); } }

/** Open the playground in a fresh browser context (or the one you pass in, to keep storage across reloads). */
export async function openApp(browser: Browser, url: string, o: { query?: string; viewport?: { width: number; height: number }; ctx?: BrowserContext; permissions?: string[] } = {}): Promise<App> {
  const ctx = o.ctx ?? await browser.newContext({ viewport: o.viewport ?? { width: 1500, height: 900 }, deviceScaleFactor: 1, acceptDownloads: true, ...(o.permissions ? { permissions: o.permissions } : {}) });
  opened.add(ctx);
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  await page.goto(o.query ? `${url}?${o.query}` : url);
  await page.evaluate(() => (window as unknown as { vfxReady: Promise<void> }).vfxReady);
  return { ctx, page, errors };
}

/** Open a preset from the library the way a person does: category in the sidebar, then its card. */
export async function openPreset(page: Page, id: string): Promise<void> {
  const category = await page.evaluate((i) => (window as unknown as { __vfxApp: { store: { findPreset(id: string): { category: string } | undefined } } }).__vfxApp.store.findPreset(i)?.category, id);
  if (!category) throw new Error(`no preset ${id}`);
  if (await page.getByTestId('workspace').count()) await page.getByTestId('back').click();
  await page.getByTestId(`cat-${category}`).click();
  const card = page.getByTestId(`card-${id}`);
  await card.scrollIntoViewIfNeeded();
  await card.click();
  await page.getByTestId('stage-canvas').waitFor();
  await settleApp(page);
}

export async function tab(page: Page, name: 'content' | 'look' | 'motion' | 'effects' | 'export'): Promise<void> { await page.getByTestId(`tab-${name}`).click(); }

/** Wait for fonts and pictures to finish loading, then pause. */
export async function settleApp(page: Page): Promise<void> {
  await page.waitForFunction(() => !!window.__vfx, null, { timeout: 30000 });
  // two animation frames let React apply an edit to the preview before we wait for it to finish loading
  await page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
  await page.evaluate(() => window.__vfx!.controller.whenIdle());
}

/** Canvas hash at exactly scene time t. */
export async function hashAt(page: Page, t: number): Promise<string> { await settleApp(page); return page.evaluate((tt) => window.__vfx!.settle(tt), t); }

/** Canvas hash late in the effect (everything has arrived), for comparing looks. */
export async function hashLate(page: Page, frac = 0.85): Promise<string> { await settleApp(page); return page.evaluate((f) => window.__vfx!.settle(window.__vfx!.duration() * f), frac); }

/** Set a slider through its number box (what a person does when typing a value). */
export async function setNum(page: Page, testId: string, value: number): Promise<void> {
  const box = page.getByTestId(`${testId}-num`).first();
  await box.fill(String(value));
  await box.press('Enter');
}

// ---- test files ----------------------------------------------------------------------------------------------------------

function crc32(buf: Uint8Array): number {
  let c = ~0;
  for (const b of buf) { c ^= b; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); }
  return ~c >>> 0;
}
function chunk(type: string, data: Uint8Array): Buffer {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), Buffer.from(data)]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
/** A real RGBA PNG: a filled disc with a soft edge and a ring, transparent corners. */
export function makePng(size: number, rgb: [number, number, number]): Buffer {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const dx = x - size / 2 + 0.5, dy = y - size / 2 + 0.5, d = Math.hypot(dx, dy) / (size / 2);
      const a = d < 0.92 ? 255 : d < 1 ? Math.round(255 * (1 - (d - 0.92) / 0.08)) : 0;
      const ring = d > 0.55 && d < 0.68 ? 0.45 : 1;
      const o = y * (size * 4 + 1) + 1 + x * 4;
      raw[o] = rgb[0] * ring; raw[o + 1] = rgb[1] * ring; raw[o + 2] = rgb[2] * ring; raw[o + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', new Uint8Array())]);
}

export function haveFfmpeg(): boolean { try { execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' }); return true; } catch { return false; } }

/** A VP9 WebM with an alpha channel: a coloured disc that grows, on a transparent background. */
export function makeAlphaWebm(path: string): void {
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=0xff7a1a:s=160x160:d=1:r=24', '-vf', "format=yuva420p,geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='if(lt(hypot(X-80,Y-80),24+T*48),255,0)'", '-c:v', 'libvpx-vp9', '-pix_fmt', 'yuva420p', '-auto-alt-ref', '0', path]);
}

export function writeOut(name: string, data: string | Uint8Array): string { const p = join(OUT, name); writeFileSync(p, data); return p; }


/** Write a bundle's files to a folder and serve it; returns the served root. */
export async function serveBundle(entries: { path: string; data: Uint8Array }[]): Promise<{ srv: Served; dir: string; root: string }> {
  const root = entries[0]!.path.split('/')[0]!;
  const dir = join(OUT, `bundle-${Date.now()}-${Math.floor(Math.random() * 1e6)}`);
  for (const e of entries) { const p = join(dir, e.path); mkdirSync(join(p, '..'), { recursive: true }); writeFileSync(p, e.data); }
  return { srv: await serveStatic(join(dir, root), 'index.html'), dir, root };
}

/** Open a bundle's own demo page in the given context, then return the player's frame hashes at fractions of its duration. */
export async function bundleHashes(ctx: BrowserContext, origin: string, url: string, fracs: number[]): Promise<{ hashes: string[]; external: string[]; errors: string[]; ready: boolean | undefined; duration: number }> {
  const page = await ctx.newPage();
  const external: string[] = [], errors: string[] = [];
  page.on('request', (r) => { if (!r.url().startsWith(origin) && !/^(data|blob):/.test(r.url())) external.push(r.url()); });
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(url);
  await page.waitForFunction(() => (window as unknown as { ready?: boolean }).ready !== undefined, null, { timeout: 60000 });
  const ready = await page.evaluate(() => (window as unknown as { ready?: boolean }).ready);
  if (!ready) return { hashes: [], external, errors, ready, duration: 0 };
  const r = await page.evaluate(async (fr) => {
    const p = (window as unknown as { player: { pause(): void; seek(t: number): void; readPixels(): Uint8Array; duration: number } }).player;
    p.pause();
    const out: string[] = [];
    for (const f of fr) {
      p.seek(f * p.duration);
      const buf = await crypto.subtle.digest('SHA-256', p.readPixels().slice().buffer);
      out.push(Array.from(new Uint8Array(buf), (x) => x.toString(16).padStart(2, '0')).join(''));
    }
    return { out, duration: p.duration };
  }, fracs);
  await page.close();
  return { hashes: r.out, external, errors, ready, duration: r.duration };
}

/** The playground's own frames of a preset at the exact size a bundle's demo page draws at. Pass `ctx` to share a browser profile (its uploaded images and fonts). */
export async function labHashes(browser: Browser, url: string, preset: { scene: { aspect: number } }, fracs: number[], ctx?: BrowserContext): Promise<string[]> {
  const lab = await openApp(browser, url, { query: 'lab=1', ...(ctx ? { ctx } : {}) });
  const out = await lab.page.evaluate(async ({ pj, fr }) => {
    const v = window.__vfx!;
    const c = v.controller;
    c.renderer.resize(1280, Math.round(1280 / pj.scene.aspect), 1, true);
    const rep = await v.setScene(pj.scene as never);
    if (rep.errors.length) throw new Error(rep.errors.map((e) => e.message).join('; '));
    await c.whenIdle();
    c.pause();
    const hs: string[] = [];
    for (const f of fr) { v.seek(f * v.duration()); hs.push(await v.hash()); }
    return hs;
  }, { pj: preset, fr: fracs });
  if (ctx) await lab.page.close(); else await lab.ctx.close();
  return out;
}
