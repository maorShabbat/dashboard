// A real Web SDK `scatter` app build (dev art, not shippable) playing Foundry books against the mock RGS in headless Chromium.
// Needs the Web SDK build (pnpm run build --filter=scatter in the web-sdk checkout); skipped when it is absent.
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright-core';
import { findChromium } from '../harness';
import { createMockRgs, loadLibrary, type LogEntry } from '../../foundry/mock-rgs';
import { writeFixtureLibrary } from '../../foundry/mock-rgs/testlib';
import { scanRestricted } from '../../foundry/compiler/social';

const BUILD = process.env.FOUNDRY_WEBSDK_BUILD ?? '/home/user/engineio/web-sdk/apps/scatter/build';
const MIME: Record<string, string> = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.webp': 'image/webp', '.gif': 'image/gif', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.woff2': 'font/woff2', '.wasm': 'application/wasm',
};
const GAME = 'foundry_t1_demo';

let browser: Browser;
let web: Server;
let webPort = 0;
const servers: Server[] = [];
const contexts: BrowserContext[] = [];

async function startWeb() {
  const base = resolve(BUILD);
  web = createServer((req, res) => {
    let f = join(base, normalize(decodeURIComponent((req.url ?? '/').split('?')[0]!)));
    if (existsSync(f) && statSync(f).isDirectory()) f = join(f, 'index.html');
    if (!f.startsWith(base) || !existsSync(f)) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'content-type': MIME[extname(f)] ?? 'application/octet-stream' }).end(readFileSync(f));
  });
  await new Promise<void>((r) => web.listen(0, '127.0.0.1', r));
  webPort = (web.address() as { port: number }).port;
}

/** Start a mock RGS over the given publication folder; the game reaches it as https://rgs.test (the Web SDK hard-codes https://). */
async function openGame(libDir: string, query: string, seed = 1, o: { startBalance?: number; mobile?: boolean } = {}) {
  const library = await loadLibrary(libDir, { maxBooks: 3000 });
  const rgs = createMockRgs({ library, gameId: GAME, version: '1', seed, ...(o.startBalance ? { startBalance: o.startBalance } : {}) });
  await new Promise<void>((r) => rgs.server.listen(0, '127.0.0.1', r));
  servers.push(rgs.server);
  const rport = (rgs.server.address() as { port: number }).port;
  const ctx: BrowserContext = await browser.newContext(o.mobile ? { viewport: { width: 390, height: 780 }, hasTouch: true, isMobile: true } : { viewport: { width: 1280, height: 800 } });
  await ctx.route('https://rgs.test/**', async (route) => {
    const u = new URL(route.request().url());
    const req = route.request();
    if (req.method() === 'OPTIONS') { await route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } }); return; }
    const r = await fetch(`http://127.0.0.1:${rport}${u.pathname}`, { method: req.method(), body: req.method() === 'POST' ? (req.postData() ?? undefined) : undefined });
    await route.fulfill({ status: r.status, body: await r.text(), headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' } });
  });
  contexts.push(ctx);
  const page: Page = await ctx.newPage();
  const errors: string[] = [];
  const urls: string[] = [];
  page.on('request', (r) => urls.push(r.url()));
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`http://127.0.0.1:${webPort}/?${query}`);
  return { page, ctx, rgs, errors, urls, paths: () => rgs.log.map((l: LogEntry) => `${l.method} ${l.path}`) };
}
const until = async (cond: () => boolean | Promise<boolean>, ms = 60000) => {
  const t = Date.now();
  while (Date.now() - t < ms) { if (await cond()) return true; await new Promise((r) => setTimeout(r, 250)); }
  return false;
};

describe.skipIf(!existsSync(join(BUILD, 'index.html')))('Web SDK scatter app on Foundry books (mock RGS)', () => {
  beforeAll(async () => {
    await startWeb();
    browser = await chromium.launch({
      ...(findChromium() ? { executablePath: findChromium()! } : {}),
      args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', '--autoplay-policy=no-user-gesture-required'],
    });
  });
  // A failing test must not leave a rendering page behind: it would slow every test after it.
  afterEach(async () => {
    for (const c of contexts.splice(0)) await c.close().catch(() => undefined);
  });
  afterAll(async () => {
    await browser?.close();
    await new Promise((r) => web?.close(r));
    for (const s of servers) s.close();
  });

  it.skipIf(!process.env.FOUNDRY_GENERATED)('a generated app build contains no stock loader, placeholder text or sample title', () => {
    const walk = (d: string): string[] => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? (e.name === 'assets' ? [] : walk(join(d, e.name))) : [join(d, e.name)]));
    const files = walk(resolve(BUILD));
    expect(files.some((f) => /stake-engine-loader|loader\.gif/.test(f))).toBe(false);
    const text = files.filter((f) => /\.(js|html|css)$/.test(f)).map((f) => readFileSync(f, 'utf8')).join('\n');
    for (const bad of ['stake-engine-loader', 'Add Your Loader', 'TRANSLATIONS TEST', 'ADD YOUR LOGO', 'SCATTER GAME', 'ADD YOUR GAME RULES', 'ADD YOUR PAY TABLE']) expect(text.includes(bad), bad).toBe(false);
    expect(text).toContain('Foundry T1 demo');
  });

  const normal = 'sessionID=s1&rgs_url=rgs.test&lang=en&device=desktop';
  /** Press space until the game sends its play request (the first presses can land while it is still loading). */
  const spin = async (g: { page: Page; paths: () => string[] }) => {
    for (let i = 0; i < 6 && !g.paths().includes('POST /wallet/play'); i++) {
      await g.page.keyboard.press('Space');
      await until(() => g.paths().includes('POST /wallet/play'), 6000);
    }
  };
  const start = async (page: Page) => {
    await page.waitForTimeout(8000);
    await page.mouse.click(640, 400); // "press anywhere to continue"
    await page.waitForTimeout(4000);
  };

  /** Open MENU -> INFO and return the text of the generated rules screen (clicks are retried: early ones can land while the game is loading). */
  const openRules = async (page: Page) => {
    const modal = page.locator('[data-testid=rules-modal]');
    await page.waitForTimeout(8000);
    for (let i = 0; i < 4 && (await modal.count()) === 0; i++) {
      await page.mouse.click(198, 748); // MENU (the same spot is EXIT while the menu is open)
      await page.waitForTimeout(2500);
      await page.mouse.click(198, 421); // INFO
      await page.waitForTimeout(2500);
    }
    return modal.first().innerText();
  };

  it.skipIf(!process.env.FOUNDRY_GENERATED)('the info screen shows the generated rules: modes, RTP, max win, pays, features, guide, disclaimer', async () => {
    const g = await openGame(writeFixtureLibrary({ 'base_loss.json': 1 }), normal);
    await until(() => g.paths().includes('POST /wallet/authenticate'));
    await start(g.page);
    const text = await openRules(g.page);
    for (const must of ['RTP 96.20%', 'maximum win 5000x', 'Costs 200x the bet', 'H1: 8 = 3x', 'free spins', 'space bar', 'Malfunction voids all wins and plays']) expect(text, must).toContain(must);
    expect(text).not.toMatch(/ADD YOUR/);
    expect(g.paths().filter((p) => p.includes('/wallet/play'))).toEqual([]); // reading the rules never plays
    await g.page.screenshot({ path: join(resolve(import.meta.dirname, '../../.cache/foundry'), 'rules.png') });
    await g.ctx.close();
  });

  it.skipIf(!process.env.FOUNDRY_GENERATED)('social mode (social=true): the rules screen has no restricted term', async () => {
    const g = await openGame(writeFixtureLibrary({ 'base_loss.json': 1 }), normal + '&social=true');
    await until(() => g.paths().includes('POST /wallet/authenticate'));
    await start(g.page);
    const text = await openRules(g.page);
    expect(text).toContain('RTP 96.20%');
    expect(scanRestricted(text), `restricted terms in: ${text.slice(0, 300)}`).toEqual([]);
    await g.page.screenshot({ path: join(resolve(import.meta.dirname, '../../.cache/foundry'), 'rules-social.png') });
    await g.ctx.close();
  });


  const hostOf = (u: string) => (u.startsWith('data:') || u.startsWith('blob:') ? '' : new URL(u).host);

  it.skipIf(!process.env.FOUNDRY_GENERATED)('the generated app makes no request outside the game host and the RGS (static build, no external fonts or images)', async () => {
    const g = await openGame(writeFixtureLibrary({ 'base_loss.json': 1 }), normal);
    await until(() => g.paths().includes('POST /wallet/authenticate'));
    await start(g.page);
    await openRules(g.page);
    await g.page.mouse.click(1255, 25); // close the rules
    await g.page.mouse.click(298, 748); // BUY BONUS screen too
    await g.page.waitForTimeout(3000);
    const hosts = [...new Set(g.urls.map(hostOf).filter(Boolean))];
    expect(hosts.filter((h) => !/^127\.0\.0\.1:\d+$/.test(h) && h !== 'rgs.test'), `external hosts: ${hosts.join(', ')}`).toEqual([]);
    await g.ctx.close();
  });

  it.skipIf(!process.env.FOUNDRY_GENERATED)('zoom is disabled, the page cannot scroll, and a junk language does not break the game', async () => {
    const g = await openGame(writeFixtureLibrary({ 'base_loss.json': 1 }), 'sessionID=s1&rgs_url=rgs.test&lang=zz-ZZ&device=desktop');
    await until(() => g.paths().includes('POST /wallet/authenticate'));
    await start(g.page);
    const facts = await g.page.evaluate(() => {
      window.scrollTo(0, 300);
      document.documentElement.scrollTo(0, 300);
      return { meta: document.querySelector('meta[name=viewport]')?.getAttribute('content') ?? '', touch: getComputedStyle(document.body).touchAction, y: window.scrollY, canvas: document.querySelectorAll('canvas').length };
    });
    expect(facts.meta).toMatch(/user-scalable=no/);
    expect(facts.meta).toMatch(/maximum-scale=1/);
    expect(facts.touch).toBe('manipulation');
    expect(facts.y).toBe(0);
    expect(facts.canvas).toBeGreaterThan(0);
    await spin(g);
    expect(g.paths()).toContain('POST /wallet/play'); // a language the game does not know still plays
    expect(g.errors.filter((e) => !/status of 4|WebGPU/.test(e))).toEqual([]);
    await g.ctx.close();
  });

  it.skipIf(!process.env.FOUNDRY_GENERATED)('bonus buy: the screen shows this game\'s mode, buying needs a confirmation, and nothing is played before it', async () => {
    const g = await openGame(writeFixtureLibrary({ 'base_loss.json': 1 }), normal, 1, { startBalance: 1_000_000_000 }); // $1000: the buy costs 200x a $1 bet
    await until(() => g.paths().includes('POST /wallet/authenticate'));
    await start(g.page);
    await g.page.waitForTimeout(6000);
    const body = g.page.locator('body');
    for (let i = 0; i < 3 && !/Bonus buy/i.test(await body.innerText()); i++) { await g.page.mouse.click(298, 748); await g.page.waitForTimeout(3000); }
    const text = await body.innerText();
    expect(text).toMatch(/Bonus buy/i);
    expect(text).toMatch(/Costs 200x the bet/i);
    expect(text).not.toMatch(/SAMURAI|BOOST|MOTHERSHIP/i); // the SDK sample cards are gone
    await g.page.screenshot({ path: join(resolve(import.meta.dirname, '../../.cache/foundry'), 'buy-modal.png') });
    await g.page.getByRole('button', { name: /^buy$/i }).first().dispatchEvent('click'); // the popup is rendered twice: click the element itself, not a coordinate
    await g.page.waitForTimeout(2000);
    expect(g.paths()).not.toContain('POST /wallet/play'); // the confirmation comes first
    await g.page.getByRole('button', { name: /^confirm$/i }).first().dispatchEvent('click');
    expect(await until(() => g.paths().includes('POST /wallet/play'), 20000)).toBe(true);
    const play = g.rgs.log.find((l: LogEntry) => l.path === '/wallet/play')!;
    expect(String((play.body as { mode: string }).mode).toUpperCase()).toBe('BONUS');
    await g.ctx.close();
  });

  it.skipIf(!process.env.FOUNDRY_GENERATED)('autoplay needs a confirmation: choosing a number of rounds plays nothing until it is started', async () => {
    const g = await openGame(writeFixtureLibrary({ 'base_loss.json': 1 }), normal);
    await until(() => g.paths().includes('POST /wallet/authenticate'));
    await start(g.page);
    await g.page.waitForTimeout(6000);
    const body = g.page.locator('body');
    for (let i = 0; i < 3 && !/START AUTOPLAY/i.test(await body.innerText()); i++) { await g.page.mouse.click(558, 748); await g.page.waitForTimeout(3000); }
    expect(await body.innerText()).toMatch(/START AUTOPLAY/i);
    await g.page.getByRole('button', { name: '25', exact: true }).first().dispatchEvent('click');
    await g.page.waitForTimeout(1500);
    expect(g.paths()).not.toContain('POST /wallet/play');
    await g.page.getByRole('button', { name: /START AUTOPLAY/i }).first().dispatchEvent('click');
    expect(await until(() => g.paths().includes('POST /wallet/play'), 30000)).toBe(true);
    await g.ctx.close();
  });

  it.skipIf(!process.env.FOUNDRY_GENERATED)('insufficient balance: the bet is refused locally and no play request is sent', async () => {
    const g = await openGame(writeFixtureLibrary({ 'base_loss.json': 1 }), normal, 1, { startBalance: 500_000 }); // $0.50 against a $1.00 bet
    await until(() => g.paths().includes('POST /wallet/authenticate'));
    await start(g.page);
    await g.page.waitForTimeout(5000);
    for (let i = 0; i < 3; i++) { await g.page.keyboard.press('Space'); await g.page.waitForTimeout(1500); }
    expect(g.paths()).toEqual(['POST /wallet/authenticate']);
    await g.page.screenshot({ path: join(resolve(import.meta.dirname, '../../.cache/foundry'), 'no-balance.png') });
    await g.ctx.close();
  });

  it.skipIf(!process.env.FOUNDRY_GENERATED)('a phone-sized touch viewport loads and plays a round', async () => {
    const g = await openGame(writeFixtureLibrary({ 'base_loss.json': 1 }), 'sessionID=s1&rgs_url=rgs.test&lang=en&device=mobile', 1, { mobile: true });
    await until(() => g.paths().includes('POST /wallet/authenticate'));
    await g.page.waitForTimeout(8000);
    await g.page.touchscreen.tap(195, 390);
    await g.page.waitForTimeout(4000);
    await spin(g);
    expect(g.paths()).toContain('POST /wallet/play');
    const overflow = await g.page.evaluate(() => ({ x: document.documentElement.scrollWidth > innerWidth }));
    expect(overflow.x).toBe(false); // no horizontal scroll on a phone
    await g.page.screenshot({ path: join(resolve(import.meta.dirname, '../../.cache/foundry'), 'mobile.png') });
    await g.ctx.close();
  });

  it('authenticates first, sends play on space, and sends NO end-round after a zero-win round', async () => {
    const lib = writeFixtureLibrary({ 'base_loss.json': 1 });
    const g = await openGame(lib, normal);
    await until(() => g.paths().includes('POST /wallet/authenticate'));
    await start(g.page);
    await spin(g);
    expect(g.paths()).toContain('POST /wallet/play');
    await g.page.waitForTimeout(12000); // let the round animate to the end
    const paths = g.paths();
    expect(paths[0]).toBe('POST /wallet/authenticate');
    expect(paths.filter((p) => p === 'POST /wallet/play')).toHaveLength(1);
    expect(paths).not.toContain('POST /wallet/end-round'); // checklist: zero-win bets send no end-round
    const play = g.rgs.log.find((l: LogEntry) => l.path === '/wallet/play')!;
    expect(play.body).toMatchObject({ amount: 1_000_000, sessionID: 's1' });
    expect(String((play.body as { mode: string }).mode).toLowerCase()).toBe('base');
    expect(g.errors.filter((e) => !/status of 4|WebGPU/.test(e))).toEqual([]);
    await g.page.screenshot({ path: join(resolve(import.meta.dirname, '../../.cache/foundry'), 'play-loss.png') });
    await g.ctx.close();
  });

  it('a winning round is closed with end-round and the payout reaches the balance', async () => {
    const lib = writeFixtureLibrary({ 'base_tumble_win.json': 1 }); // book id 3 pays 1.6x
    const g = await openGame(lib, normal);
    await until(() => g.paths().includes('POST /wallet/authenticate'));
    await start(g.page);
    await spin(g);
    const closed = await until(() => g.paths().includes('POST /wallet/end-round'), 90000);
    if (!closed) await g.page.screenshot({ path: join(resolve(import.meta.dirname, '../../.cache/foundry'), 'play-win-timeout.png') });
    expect(closed, `requests so far: ${g.paths().join(', ')}; page errors: ${g.errors.join(' | ')}`).toBe(true);
    const order = g.paths();
    expect(order.indexOf('POST /wallet/play')).toBeGreaterThan(order.indexOf('POST /wallet/authenticate'));
    expect(order.indexOf('POST /wallet/end-round')).toBeGreaterThan(order.indexOf('POST /wallet/play'));
    const session = [...g.rgs.sessions.values()][0];
    expect(session.balance).toBe(100_000_000 - 1_000_000 + 1_600_000);
    await g.page.waitForTimeout(8000); // let the UI settle on the final state before looking at it
    await g.page.screenshot({ path: join(resolve(import.meta.dirname, '../../.cache/foundry'), 'play-win.png') });
    await g.ctx.close();
  });

  it('a bad rgs_url does not reach the wallet and never plays a round', async () => {
    const lib = writeFixtureLibrary({ 'base_loss.json': 1 });
    const g = await openGame(lib, 'sessionID=s1&rgs_url=nowhere.invalid&lang=en&device=desktop');
    await g.page.waitForTimeout(10000);
    await g.page.mouse.click(640, 400);
    await g.page.keyboard.press('Space');
    await g.page.waitForTimeout(4000);
    expect(g.paths()).toEqual([]); // nothing reached the mock RGS
    await g.ctx.close();
  });

  it('replay mode: fetches the book without a session, makes no wallet call, shows the board', async () => {
    const lib = writeFixtureLibrary({ 'base_loss.json': 1, 'base_tumble_win.json': 0 });
    const g = await openGame(lib, `replay=true&game=${GAME}&version=1&mode=base&event=3&rgs_url=rgs.test&lang=en&device=desktop`);
    expect(await until(() => g.paths().some((p) => p.startsWith('GET /bet/replay/')), 60000)).toBe(true);
    await g.page.waitForTimeout(25000); // assets load, then the replay waits behind a Play button
    const paths = g.paths();
    expect(paths).toContain(`GET /bet/replay/${GAME}/1/base/3`);
    expect(paths.filter((p) => p.includes('/wallet/'))).toEqual([]); // sessionless: no wallet calls at all
    await g.page.screenshot({ path: join(resolve(import.meta.dirname, '../../.cache/foundry'), 'replay.png') });
    await g.page.mouse.click(640, 400); // past the start screen
    await g.page.waitForTimeout(10000);
    await g.page.screenshot({ path: join(resolve(import.meta.dirname, '../../.cache/foundry'), 'replay-after-start.png') });
    expect(g.paths().filter((p) => p.includes('/wallet/'))).toEqual([]); // still no wallet call after the click
    await g.ctx.close();
  });
});
