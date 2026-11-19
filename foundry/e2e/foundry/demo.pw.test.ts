// The playable demo build: no server, no launch parameters, the RGS answers inside the page (foundry/demo/shim.ts).
// Run: FOUNDRY_DEMO=1 FOUNDRY_WEBSDK_BUILD=<web-sdk>/apps/foundry_t1_demo/build npm run foundry:e2e
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright-core';
import { findChromium } from '../harness';

const BUILD = process.env.FOUNDRY_WEBSDK_BUILD ?? '/home/user/engineio/web-sdk/apps/foundry_t1_demo/build';
const MIME: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.gif': 'image/gif', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.woff2': 'font/woff2', '.wasm': 'application/wasm' };

let browser: Browser;
let web: Server;
let port = 0;
const contexts: BrowserContext[] = [];

async function open(query = '', viewport = { width: 1280, height: 800 }, touch = false) {
  const ctx = await browser.newContext({ viewport, hasTouch: touch, isMobile: touch });
  contexts.push(ctx);
  const page: Page = await ctx.newPage();
  const errors: string[] = [];
  const urls: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('request', (r) => urls.push(r.url()));
  await page.goto(`http://127.0.0.1:${port}/${query}`);
  return { page, errors, urls };
}
const balance = (page: Page) => page.evaluate(() => Number(sessionStorage.getItem('foundry-demo-balance') ?? 0));
const until = async (cond: () => boolean | Promise<boolean>, ms = 60000) => {
  const t = Date.now();
  while (Date.now() - t < ms) { if (await cond()) return true; await new Promise((r) => setTimeout(r, 300)); }
  return false;
};

describe.skipIf(!process.env.FOUNDRY_DEMO || !existsSync(join(BUILD, 'demo-rgs.js')))('playable demo (in-browser RGS)', () => {
  beforeAll(async () => {
    const base = resolve(BUILD);
    web = createServer((req, res) => {
      let f = join(base, normalize(decodeURIComponent((req.url ?? '/').split('?')[0]!)));
      if (existsSync(f) && statSync(f).isDirectory()) f = join(f, 'index.html');
      if (!f.startsWith(base) || !existsSync(f)) { res.writeHead(404).end(); return; }
      res.writeHead(200, { 'content-type': MIME[extname(f)] ?? 'application/octet-stream' }).end(readFileSync(f));
    });
    await new Promise<void>((r) => web.listen(0, '127.0.0.1', r));
    port = (web.address() as { port: number }).port;
    browser = await chromium.launch({
      ...(findChromium() ? { executablePath: findChromium()! } : {}),
      args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', '--autoplay-policy=no-user-gesture-required'],
    });
  });
  afterEach(async () => { for (const c of contexts.splice(0)) await c.close().catch(() => undefined); });
  afterAll(async () => { await browser?.close(); await new Promise((r) => web?.close(r)); });

  it('opens from a plain URL, adds the demo launch parameters itself, and plays rounds that move the balance', async () => {
    const g = await open('');
    await g.page.waitForURL(/sessionID=demo/, { timeout: 30000 });
    expect(g.page.url()).toMatch(/rgs_url=demo\.local/);
    await g.page.waitForTimeout(9000);
    await g.page.mouse.click(640, 400); // "press anywhere to continue"
    await g.page.waitForTimeout(5000);
    expect(await until(async () => (await balance(g.page)) > 0)).toBe(true); // authenticate answered in the page
    expect(await balance(g.page)).toBe(1_000_000_000);
    for (let i = 0; i < 12 && (await balance(g.page)) === 1_000_000_000; i++) { await g.page.keyboard.press('Space'); await g.page.waitForTimeout(4000); }
    expect(await balance(g.page)).not.toBe(1_000_000_000); // a round was bought (and maybe won)
    const hosts = [...new Set(g.urls.map((u) => (u.startsWith('data:') || u.startsWith('blob:') ? '' : new URL(u).host)).filter(Boolean))];
    expect(hosts, `hosts: ${hosts.join(', ')}`).toEqual([`127.0.0.1:${port}`]); // nothing leaves the page: no RGS, no CDN, no font host
    expect(g.errors.filter((e) => !/WebGPU/.test(e))).toEqual([]);
    await g.page.screenshot({ path: join(resolve(import.meta.dirname, '../../.cache/foundry'), 'demo-play.png') });
  });

  it('hides WebGPU from the game even when the browser offers it (PixiJS then uses WebGL, the tested path)', async () => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    contexts.push(ctx);
    await ctx.addInitScript(() => Object.defineProperty(navigator, 'gpu', { value: { requestAdapter: async () => null }, configurable: true })); // a browser with WebGPU
    const page = await ctx.newPage();
    await page.goto(`http://127.0.0.1:${port}/?sessionID=demo&rgs_url=demo.local&lang=en&device=desktop`);
    await page.waitForTimeout(3000);
    expect(await page.evaluate(() => (navigator as unknown as { gpu?: unknown }).gpu)).toBeUndefined();
  });

  it('the bonus buy and the info screen work in the demo', async () => {
    const g = await open('?sessionID=demo&rgs_url=demo.local&lang=en&device=desktop');
    await g.page.waitForTimeout(9000);
    await g.page.mouse.click(640, 400);
    await g.page.waitForTimeout(6000);
    const body = g.page.locator('body');
    for (let i = 0; i < 3 && !/Bonus buy/i.test(await body.innerText()); i++) { await g.page.mouse.click(298, 748); await g.page.waitForTimeout(3000); }
    expect(await body.innerText()).toMatch(/Costs 200x the bet/i);
    await g.page.getByRole('button', { name: /^buy$/i }).first().dispatchEvent('click');
    await g.page.waitForTimeout(2000);
    expect(await balance(g.page)).toBe(1_000_000_000); // nothing bought before the confirmation
    await g.page.getByRole('button', { name: /^confirm$/i }).first().dispatchEvent('click');
    expect(await until(async () => (await balance(g.page)) !== 1_000_000_000, 30000)).toBe(true);
    expect(await balance(g.page)).toBeLessThanOrEqual(1_000_000_000 - 200_000_000 + 5_000_000_000); // paid 200x the bet (plus any win)
  });

  it('works the way the artifact host serves it: a host page with the game in a frame under /game/, under a strict content policy', async () => {
    // The first hosted version showed a black screen: the router had no route for /game/index.html, assets resolved to the site root, and
    // PixiJS needed eval. This serves that layout (host page at /, game files under /game/) with a policy that has no unsafe-eval.
    const csp = "default-src 'none'; script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: blob:; media-src 'self' data: blob:; font-src 'self' data: https://fonts.gstatic.com; connect-src 'self' data: blob:; worker-src 'self' blob:; frame-src 'self'";
    const hostPage = readFileSync(resolve(import.meta.dirname, '../../foundry/demo/publish/host-page.html'), 'utf8');
    const base = resolve(BUILD);
    const nested = createServer((req, res) => {
      const url = decodeURIComponent((req.url ?? '/').split('?')[0]!);
      if (url === '/' || url === '/index.html') { res.writeHead(200, { 'content-type': 'text/html', 'content-security-policy': csp }).end(hostPage); return; }
      let f = join(base, normalize(url.replace(/^\/game/, '')));
      if (existsSync(f) && statSync(f).isDirectory()) f = join(f, 'index.html');
      if (!url.startsWith('/game/') || !f.startsWith(base) || !existsSync(f)) { res.writeHead(404).end(); return; }
      res.writeHead(200, { 'content-type': MIME[extname(f)] ?? 'application/octet-stream', 'content-security-policy': csp }).end(readFileSync(f));
    });
    await new Promise<void>((r) => nested.listen(0, '127.0.0.1', r));
    try {
      const np = (nested.address() as { port: number }).port;
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      contexts.push(ctx);
      const page = await ctx.newPage();
      const failures: string[] = [];
      page.on('requestfailed', (r) => failures.push(r.url()));
      page.on('response', (r) => { if (r.status() === 404 && !/\.(ts|m4a|ac3)$/.test(r.url())) failures.push(`404 ${r.url()}`); });
      await page.goto(`http://127.0.0.1:${np}/`);
      await page.waitForTimeout(14000);
      await page.mouse.click(640, 350); // press anywhere
      await page.waitForTimeout(6000);
      expect(await page.locator('#diag').isHidden()).toBe(true); // the host page saw the game running
      const frame = page.frames().find((f) => f.url().includes('/game/'))!;
      for (let i = 0; i < 4 && Number(await frame.evaluate(() => sessionStorage.getItem('foundry-demo-balance'))) === 1_000_000_000; i++) { await page.keyboard.press('Space'); await page.waitForTimeout(6000); }
      expect(Number(await frame.evaluate(() => sessionStorage.getItem('foundry-demo-balance')))).not.toBe(1_000_000_000); // a round was played
      expect(await frame.evaluate(() => document.querySelectorAll('canvas').length)).toBeGreaterThan(0);
      expect(failures.filter((u) => !/app\.js$|favicon/.test(u))).toEqual([]); // no missing game file
    } finally {
      nested.close();
    }
  });

  it('a replay link plays a published round with no wallet activity', async () => {
    const g = await open('?replay=true&game=foundry_t1_demo&version=1&mode=base&event=3942&rgs_url=demo.local&lang=en&device=desktop');
    await g.page.waitForTimeout(10000);
    await g.page.mouse.click(640, 400);
    await g.page.waitForTimeout(8000);
    expect(await g.page.evaluate(() => sessionStorage.getItem('foundry-demo-balance'))).toBeNull(); // no session, no balance
    expect(await g.page.evaluate(() => document.querySelectorAll('canvas').length)).toBeGreaterThan(0);
    expect(g.errors.filter((e) => !/WebGPU/.test(e))).toEqual([]);
    await g.page.screenshot({ path: join(resolve(import.meta.dirname, '../../.cache/foundry'), 'demo-replay.png') });
  });
});
