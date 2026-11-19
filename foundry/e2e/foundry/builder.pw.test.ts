// The builder page, served under a sub-path with a strict CSP (no eval, no external requests except fonts).
// Every flow is driven the way a person does it; after each kind of edit the numbers on screen are compared with an independent
// simulation of the saved config (the simulator is deterministic, so they must be identical).
// Run: FOUNDRY_BUILDER=1 npm run foundry:e2e   (build first: node foundry/builder/build.mjs)
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { chromium, type Browser, type Page } from 'playwright-core';
import { findChromium } from '../harness';
import { bonusSummary, runSim, type Summary } from '../../foundry/builder/sim';
import type { GameConfig } from '../../foundry/compiler/config';

const DIR = resolve('.cache/foundry/builder');
let browser: Browser; let web: Server; let port = 0;
const MIME: Record<string, string> = { '.js': 'text/javascript', '.html': 'text/html' };
import { deflateSync } from 'node:zlib';
function crc32(buf: Uint8Array): number { let c = ~0; for (const b of buf) { c ^= b; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); } return ~c >>> 0; }
function chunk(type: string, data: Uint8Array): Buffer { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type, 'ascii'), Buffer.from(data)]); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, crc]); }
function makePng(size: number): Buffer { const raw = Buffer.alloc((size * 4 + 1) * size); for (let y = 0; y < size; y++) { raw[y * (size * 4 + 1)] = 0; for (let x = 0; x < size; x++) { const o = y * (size * 4 + 1) + 1 + x * 4; raw[o] = 200; raw[o + 1] = 80 + x * 4; raw[o + 2] = 40 + y * 4; raw[o + 3] = 255; } } const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6; return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', new Uint8Array())]); }
const PNG = makePng(32);
function wav(): Buffer { const n = 1600; const b = Buffer.alloc(44 + n * 2); b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(8000, 24); b.writeUInt32LE(16000, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40); return b; }
const files = { png: { name: 'cow.png', mimeType: 'image/png', buffer: PNG }, png2: { name: 'barn.png', mimeType: 'image/png', buffer: PNG }, wav: { name: 'spin.wav', mimeType: 'audio/wav', buffer: wav() }, json: { name: 'cow.json', mimeType: 'application/json', buffer: Buffer.from('{"skeleton":{}}') }, exe: { name: 'virus.exe', mimeType: 'application/octet-stream', buffer: Buffer.from('MZ') } };

describe.skipIf(!process.env.FOUNDRY_BUILDER || !existsSync(join(DIR, 'builder.js')))('builder page', () => {
  beforeAll(async () => {
    web = createServer((req, res) => {
      const p = (req.url ?? '').split('?')[0]!.replace(/^\/nested\/path\//, '');
      const f = join(DIR, p === '' || p === '/' ? 'index.html' : p);
      if (!existsSync(f) || !f.startsWith(DIR)) { res.writeHead(404).end(); return; }
      const ext = f.slice(f.lastIndexOf('.'));
      res.writeHead(200, { 'content-type': MIME[ext] ?? 'text/html', 'content-security-policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; worker-src 'self'" }).end(readFileSync(f));
    });
    await new Promise<void>((r) => web.listen(0, '127.0.0.1', r));
    port = (web.address() as { port: number }).port;
    browser = await chromium.launch({ ...(findChromium() ? { executablePath: findChromium()! } : {}), args: ['--no-sandbox'] });
  });
  afterAll(async () => { await browser?.close(); await new Promise((r) => web?.close(r)); });

  async function open(width = 1360, height = 900) {
    const ctx = await browser.newContext({ viewport: { width, height }, permissions: ['clipboard-read', 'clipboard-write'] });
    const page = await ctx.newPage();
    const errors: string[] = []; const external: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('response', (r) => { if (r.status() >= 400) errors.push(`HTTP ${r.status()} ${r.url()}`); });
    page.on('request', (r) => { if (!r.url().startsWith(`http://127.0.0.1:${port}`) && !r.url().startsWith('data:') && !/fonts\.(googleapis|gstatic)\.com/.test(r.url())) external.push(r.url()); });
    await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
    await page.goto(`http://127.0.0.1:${port}/nested/path/`);
    await page.waitForSelector('[data-testid=games-home], .hubbody'); // after the splash
    return { ctx, page, errors, external };
  }
  /** Start a new slot through the wizard: name, type, then the defaults for add-ons, grid and assets. */
  const wizard = async (page: Page, name: string, type?: string) => {
    await page.getByTestId('new-game-open').click(); await page.getByTestId('wiz-name').fill(name); await page.getByTestId('wiz-next').click();
    if (type) await page.getByTestId(`wiz-type-${type}`).click();
    for (let i = 0; i < 3; i++) await page.getByTestId('wiz-next').click();
    await page.getByTestId('wiz-create').click(); await page.waitForSelector('.hubbody');
  };
  const begin = async (page: Page) => { await page.getByTestId('start-demo').click(); await page.waitForSelector('.hubbody'); };
  const toGames = async (page: Page) => { await page.getByTestId('nav-home').click(); await page.getByTestId('games-home').waitFor(); };
  const WHERE: Record<string, [string, string?]> = { info: ['game'], board: ['game'], symbols: ['symbols', 'table'], strips: ['symbols', 'strips'], features: ['features', 'extras'], buy: ['features', 'buy'], extras: ['features', 'extras'], return: ['math', 'targets'], assets: ['assets'], math: ['math', 'results'], review: ['export'] };
  const step = async (page: Page, id: string) => { const [a, tab] = WHERE[id]; await page.getByTestId(`nav-${a}`).click(); if (tab) await page.getByTestId(`ptab-${tab}`).click(); if (id === 'features') { await page.getByTestId('core-free-spins-open').click(); await page.getByTestId('spins-dialog').waitFor(); } };
  const closeDialog = async (page: Page) => { await page.keyboard.press('Escape'); await page.locator('.drawerback').waitFor({ state: 'detached' }); };
  const addBonusNamed = async (page: Page, name: string) => { await page.getByTestId('bonus-add').click(); await page.getByTestId('bonus-add-name').fill(name); await page.getByTestId('bonus-add-create').click(); await page.getByTestId('bonus-add-dialog').waitFor({ state: 'detached' }); };
  const confirmRemove = async (page: Page) => { await page.getByTestId('confirm').locator('button.danger').click(); await page.getByTestId('confirm').waitFor({ state: 'detached' }); };
  const openPreview = async (page: Page) => { await page.getByTestId('open-preview').click(); await page.getByTestId('preview-drawer').waitFor(); };
  const title = (page: Page) => page.getByTestId('page-title').textContent();
  const saved = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('foundry-builder-config-v1')!) as GameConfig);
  const cache = new Map<string, Summary>();
  const expectedFor = (cfg: GameConfig, spins = 40000): Summary => {
    const key = JSON.stringify([spins, cfg.gameType, cfg.paylines, cfg.reelHeights, cfg.tumble, cfg.board, cfg.symbols, cfg.paytable, cfg.reels, cfg.scatterRule, cfg.freeSpinTriggers, cfg.modes[0].maxWin, cfg.modes[0].distributions.find((d) => d.criteria === 'freegame')?.conditions.multValues, cfg.features, cfg.gadgetBar]);
    let s = cache.get(key);
    if (!s) { for (const x of runSim(cfg, spins, 4000, 12345)) s = x; cache.set(key, s!); }
    return s!;
  };
  /** The displayed RTP, hit frequency and volatility must equal an independent run of the saved config, and must not be flagged stale.
   *  A very slow design stops early (time budget) and says so; it is then compared over the same number of spins (the same random stream). */
  async function expectMath(page: Page, label: string) {
    const t0 = Date.now(); let last = '';
    while (Date.now() - t0 < 90000) {
      const cfg = await saved(page);
      const partial = await page.evaluate(() => /^Partial/.test(document.querySelector('[data-testid=live-mode]')?.textContent ?? ''));
      const spins = partial ? Number(await page.getByTestId('live').getAttribute('data-spins')) : 40000;
      const e = expectedFor(cfg, spins);
      const shown = await page.evaluate(() => ({
        rtp: document.querySelector('[data-testid=live-rtp]')?.textContent ?? '', hit: document.querySelector('[data-testid=live-hit]')?.textContent ?? '',
        vol: document.querySelector('[data-testid=live-vol]')?.textContent ?? '', stale: document.querySelector('[data-testid=live]')?.getAttribute('data-stale'), run: !!document.querySelector('.pulse.on'),
      }));
      const want = { rtp: `${(e.rtp * 100).toFixed(2)}%`, hit: `${(e.hitRate * 100).toFixed(2)}%`, vol: e.volatility.toFixed(1) };
      last = `shown ${JSON.stringify(shown)} want ${JSON.stringify(want)}`;
      if (shown.stale === '0' && !shown.run && shown.rtp === want.rtp && shown.hit.startsWith(want.hit) && shown.vol.startsWith(want.vol)) return;
      await page.waitForTimeout(300);
    }
    throw new Error(`live math out of date after "${label}": ${last}`);
  }

  it('start screen, then the app: no console errors, no external requests, no sideways scroll (desktop and phone)', async () => {
    for (const w of [1360, 400]) {
      const { ctx, page, errors, external } = await open(w);
      expect(await page.getByTestId('start-demo').count()).toBe(1);
      await begin(page);
      expect(await page.getByTestId('top-name').textContent()).toBe('My first slot');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await expectMath(page, 'first load');
      expect(errors).toEqual([]); expect(external).toEqual([]);
      await ctx.close();
    }
  });

  it('first screen: your games as tiles and a button for a new game; the builder layout only shows inside a game', async () => {
    const { ctx, page } = await open();
    await begin(page);
    expect(await page.getByTestId('games-home').count()).toBe(0);
    expect(await page.locator('.rail').count()).toBe(1);
    await page.getByTestId('nav-home').click();
    await page.getByTestId('games-home').waitFor();
    expect(await page.locator('.rail, .topbar, .live').count()).toBe(0); // no menu, nothing else
    expect(await page.locator('[data-testid^=game-row-]').count()).toBe(1);
    expect(await page.getByTestId('new-game-open').count()).toBe(1);
    await page.locator('[data-testid^=open-game-]').first().click();
    await page.waitForSelector('.hubbody');
    expect(await title(page)).toBe('Game');
    const seen: string[] = [];
    for (const a of ['game', 'symbols', 'features', 'math', 'assets', 'export']) { await page.getByTestId(`nav-${a}`).click(); seen.push((await title(page))!); }
    expect(seen).toEqual(['Game', 'Paytable', 'Game features', 'Targets', 'Assets', 'Export']);
    await page.getByTestId('nav-symbols').click(); await page.getByTestId('ptab-strips').click(); expect(await title(page)).toBe('Reel strips');
    await page.getByTestId('nav-features').click(); await page.getByTestId('ptab-buy').click(); expect(await title(page)).toBe('Purchased bonuses');
    await page.getByTestId('nav-math').click(); await page.getByTestId('ptab-results').click(); expect(await title(page)).toBe('Results');
    await page.getByTestId('nav-assets').click(); expect(await page.getByTestId('ptab-files').count()).toBe(0); // one page, no tabs
    expect(await page.getByTestId('nav-assets').getAttribute('class')).toContain('on');
    await ctx.close();
  });

  it('the live math strip is on every page and keeps the numbers right', async () => {
    const { ctx, page } = await open();
    await begin(page);
    for (const a of ['game', 'symbols', 'features', 'math', 'assets', 'export']) { await page.getByTestId(`nav-${a}`).click(); expect(await page.getByTestId('live-rtp').count()).toBe(1); }
    await expectMath(page, 'strip on every page');
    await ctx.close();
  });

  it('pay model: shown on the Game page with an explanation on demand', async () => {
    const { ctx, page } = await open();
    await begin(page); await step(page, 'board');
    expect(await page.locator('.main').textContent()).toContain('Pay anywhere');
    await page.getByRole('button', { name: 'What is Pay model?' }).click();
    expect(await page.getByTestId('hint-pop').textContent()).toContain('no paylines');
    await ctx.close();
  });

  it('grid and pay tiers: free tier editing, grid size, add tier; the math follows each edit', async () => {
    const { ctx, page } = await open();
    await begin(page); await expectMath(page, 'load');
    await step(page, 'board');
    await page.locator('.tier').first().locator('input').fill('6');
    await expectMath(page, 'first tier starts at 6');
    await page.getByRole('button', { name: '+ Add a pay tier' }).click();
    expect(await page.locator('.tier:not(.add)').count()).toBe(5);
    await expectMath(page, 'add a pay tier');
    await page.getByLabel('Rows').fill('4');
    await expectMath(page, 'rows 4');
    expect((await saved(page)).board).toEqual({ reels: 6, rows: 4 });
    await page.locator('.main label', { has: page.locator('.lab', { hasText: /^Reels$/ }) }).locator('input').fill('5');
    await expectMath(page, 'reels 5');
    await step(page, 'symbols');
    expect(await page.getByTestId('paytable').textContent()).toContain('6-');
    await page.locator('.pill.bad').waitFor({ state: 'detached' });
    await ctx.close();
  });

  it('symbols: volatility presets, names, colours, library filter, add and remove, strips; the math follows every edit', async () => {
    const { ctx, page } = await open();
    await begin(page); await step(page, 'symbols');
    await step(page, 'return');
    await page.getByTestId('vol-slider').fill('2');
    await expectMath(page, 'high volatility preset');
    expect((await saved(page)).reels.sets.BR0.H1).toBe(18);
    await page.getByTestId('vol-slider').fill('0');
    await expectMath(page, 'low volatility preset');
    expect((await saved(page)).reels.sets.BR0.H1).toBe(38);
    await step(page, 'symbols');
    await page.getByTestId('pays-H1').locator('input').nth(2).fill('20');
    await expectMath(page, 'paytable cell edit');
    expect((await saved(page)).paytable.pays.H1[2]).toBe(20);
    await page.getByLabel('Name of H1').fill('Golden Crown');
    await page.getByTestId('style-H1').click(); await page.getByLabel('Colour of Golden Crown').fill('#ff8800'); await page.keyboard.press('Escape');
    expect(await page.getByLabel('Name of H1').inputValue()).toBe('Golden Crown');
    expect(await page.getByTestId('sym-H1').locator('.wcap').textContent()).toMatch(/about 1 in \d+/);
    await page.getByLabel('How often Golden Crown appears').fill('60');
    await expectMath(page, 'frequency of Golden Crown');
    await page.getByRole('tab', { name: 'Special' }).click();
    expect(await page.locator('.symrow').count()).toBe(3);
    await page.getByRole('tab', { name: 'All' }).click();
    await page.getByRole('button', { name: /Add symbol/ }).click();
    expect((await saved(page)).symbols.paying.length).toBe(9);
    await expectMath(page, 'add symbol');
    await page.getByRole('button', { name: 'Remove H5' }).click();
    await page.getByRole('button', { name: 'Cancel' }).click();
    expect((await saved(page)).symbols.paying.length).toBe(9); // cancelling keeps the symbol
    await page.getByRole('button', { name: 'Remove H5' }).click();
    await page.getByRole('button', { name: 'Confirm delete H5' }).click();
    expect((await saved(page)).symbols.paying.length).toBe(8);
    await expectMath(page, 'remove symbol');
    await step(page, 'strips');
    await page.getByTestId('shuffle').click();
    expect((await saved(page)).reels.seed).toBe(2);
    await expectMath(page, 'shuffle strips');
    expect(await page.locator('.strip').count()).toBe(6);
    await page.locator('.pill.bad').waitFor({ state: 'detached' });
    await ctx.close();
  });

  it('each symbol shows its share of the RTP, and Suggest paytable lands on target', async () => {
    const { ctx, page } = await open();
    await begin(page); await step(page, 'symbols');
    await page.getByTestId('share-H1').getByText(/of RTP/).waitFor({ timeout: 30000 });
    await page.waitForFunction(() => !document.querySelector('.pulse.on'), null, { timeout: 60000 });
    await page.getByTestId('suggest').click();
    await page.waitForFunction(() => /On target/.test(document.querySelector('.targetnote')?.textContent ?? ''), null, { timeout: 120000 });
    await expectMath(page, 'suggest paytable');
    await ctx.close();
  });

  it('features: free spins preset, a bonus price is a round-number dropdown, add and remove a bonus; the math follows', async () => {
    const { ctx, page } = await open();
    await begin(page); await step(page, 'features');
    await page.getByTestId('spins-generous').click();
    expect(await page.locator('.tip').textContent()).toContain('15 free spins');
    expect((await saved(page)).scatterRule.spinsPerScatter).toBe(5);
    await closeDialog(page);
    await expectMath(page, 'generous free spins');
    await step(page, 'buy');
    const opts = await page.getByLabel('Bonus price').locator('option').allTextContents();
    expect(opts).toContain('200x the bet'); expect(opts.some((o) => o.startsWith('809'))).toBe(false);
    await page.getByLabel('Bonus price').selectOption('500');
    expect((await saved(page)).modes[1].cost).toBe(500);
    await page.getByTestId('bonus-remove').click(); await confirmRemove(page);
    expect((await saved(page)).modes.length).toBe(1);
    await page.getByTestId('bonus-add').waitFor();
    await page.locator('.pill.bad').waitFor({ state: 'detached' });
    await addBonusNamed(page, 'Dawn Spins');
    const c = await saved(page);
    expect(c.modes.length).toBe(2); expect(c.modes[1].name).toBe('dawn_spins'); expect(c.modes[1].displayName).toBe('Dawn Spins');
    await page.locator('.pill.bad').waitFor({ state: 'detached' });
    await expectMath(page, 'bonus removed and added');
    await ctx.close();
  });

  it('RTP & max win: valid edits keep the game valid; an invalid RTP blocks export and Go to this step fixes it', async () => {
    const { ctx, page } = await open();
    await begin(page); await step(page, 'return');
    await page.getByLabel('RTP (%)').fill('95.5');
    await page.locator('.main select').first().selectOption('10000');
    const c = await saved(page); expect(c.modes.every((m) => m.rtp === 0.955 && m.maxWin === 10000)).toBe(true);
    await page.locator('.pill.bad').waitFor({ state: 'detached' });
    await expectMath(page, 'rtp 95.5 and max win 10000');
    await page.getByLabel('RTP (%)').fill('99');
    await page.locator('.pill.bad').waitFor();
    await step(page, 'review');
    expect(await page.getByRole('button', { name: 'Copy config JSON' }).isDisabled()).toBe(true);
    await page.locator('.pagebody li.error').first().getByRole('button', { name: 'Go to this step' }).click();
    expect(await title(page)).toBe('Targets');
    await page.getByLabel('RTP (%)').fill('96');
    await page.locator('.pill.bad').waitFor({ state: 'detached' });
    await ctx.close();
  });

  it('math & analytics: stat tiles, win distribution, symbol table, Monte Carlo 100K finishes, Balance to RTP lands on target', async () => {
    const { ctx, page } = await open();
    await begin(page); await step(page, 'math');
    await page.waitForFunction(() => document.querySelectorAll('.fact').length === 5 && !document.querySelector('.pulse.on'), null, { timeout: 60000 });
    expect(await page.locator('.stats').textContent()).toMatch(/Volatility.*(Low|Medium|High)/);
    expect(await page.locator('svg.chart rect').count()).toBe(12);
    expect(await page.locator('.contrib tbody tr').count()).toBeGreaterThanOrEqual(9);
    await page.waitForFunction(() => /On target/.test(document.querySelector('.targetnote')?.textContent ?? ''), null, { timeout: 120000 });
    await page.getByTestId('mc-spins').selectOption('100000');
    await page.getByTestId('mc-run').click();
    await page.waitForFunction(() => document.querySelector('[data-testid=live-mode]')?.textContent?.startsWith('Monte Carlo'), null, { timeout: 10000 });
    await page.waitForFunction(() => !document.querySelector('.pulse.on'), null, { timeout: 90000 });
    await page.getByTestId('mc-done').waitFor({ state: 'attached' });
    expect(await page.getByTestId('simbar').textContent()).toContain('100,000');
    // an edit returns to the live estimate and the numbers are those of the new design
    await step(page, 'features'); await page.getByTestId('spins-tight').click();
    await expectMath(page, 'edit after Monte Carlo');
    await ctx.close();
  });

  it('undo and redo restore the design and the math follows', async () => {
    const { ctx, page } = await open();
    await begin(page); await step(page, 'features');
    await page.waitForTimeout(700);
    await page.getByTestId('spins-generous').click(); await closeDialog(page);
    await expectMath(page, 'generous');
    await page.getByRole('button', { name: 'Undo' }).click();
    expect((await saved(page)).scatterRule.spinsPerScatter).toBe(2);
    await expectMath(page, 'undo');
    await page.getByRole('button', { name: 'Redo' }).click();
    expect((await saved(page)).scatterRule.spinsPerScatter).toBe(5);
    await expectMath(page, 'redo');
    await ctx.close();
  });

  it('live preview: a spin changes the balance by exactly bet minus win, and the history records it', async () => {
    const { ctx, page } = await open();
    await begin(page);
    await openPreview(page);
    const money = async () => Number((await page.getByTestId('balance').textContent())!.replace(/[$,]/g, ''));
    expect(await money()).toBe(1000);
    for (let i = 0; i < 5; i++) {
      const before = await money();
      await page.getByTestId('spin').click();
      await page.waitForFunction((n) => document.querySelector('.history')?.children.length === n, i + 1);
      const row = (await page.locator('.history li').first().textContent())!;
      const win = row.includes('+$') ? Number(row.match(/\+\$([\d,.]+)/)![1].replace(/,/g, '')) : 0;
      expect(Math.round((await money()) * 100)).toBe(Math.round((before - 1 + win) * 100));
    }
    await ctx.close();
  });

  it('export: valid config copies exactly what is saved; reload keeps the design and the step', async () => {
    const { ctx, page } = await open();
    await begin(page); await step(page, 'symbols');
    await page.getByLabel('Name of H1').fill('Crown');
    await page.reload(); await page.waitForSelector('.hubbody');
    expect(await title(page)).toBe('Paytable');
    expect(await page.getByLabel('Name of H1').inputValue()).toBe('Crown');
    await step(page, 'review');
    await page.getByRole('button', { name: 'Copy config JSON' }).click();
    const txt = await page.evaluate(() => navigator.clipboard.readText());
    expect(JSON.parse(txt)).toEqual(await saved(page));
    expect(await page.locator('pre.doc').textContent()).toContain('Symbols pay anywhere');
    expect(await page.locator('.pagebody').textContent()).toContain('restricted-term scan');
    await expectMath(page, 'after reload');
    await ctx.close();
  });

  it('Bonus Buy designer: the bundle is built from perks, each stored on the bonus mode, valued, and the returns shown equal an independent simulation', async () => {
    const { ctx, page } = await open();
    await begin(page); await step(page, 'buy');
    const gets = page.getByTestId('bonus-gets');
    await page.locator('.bbmore > summary').click(); await gets.waitFor();
    expect(await gets.textContent()).toContain('Skips the base game');
    expect(await gets.textContent()).toContain('Pays 200x the bet');
    await page.getByTestId('perk-scatters').waitFor();
    // a perk is in the bundle (a tile) or waits in the palette; pressing + moves it into the bundle
    const ensurePerk = async (id: string) => { if (!(await page.getByTestId(`perk-${id}`).count())) await page.getByTestId(`pal-perk-${id}-add`).click(); await page.getByTestId(`perk-${id}`).waitFor(); };
    const readAvg = async () => {
      await page.waitForFunction(() => document.querySelector('[data-testid=bonus-results]')?.getAttribute('data-stale') === '0', null, { timeout: 90000 });
      return Number((await page.getByTestId('bonus-avg').textContent())!.match(/[0-9.,]+/)![0].replace(/,/g, ''));
    };
    const expectAvg = async (label: string) => {
      const t0 = Date.now(); let last = '';
      while (Date.now() - t0 < 90000) {
        const got = await readAvg(); const want = bonusSummary(await saved(page), 10000)!.avgWin;
        const wantTxt = want >= 100 ? Math.round(want) : Math.round(want * 10) / 10;
        last = `${got} vs ${wantTxt}`;
        if (Math.abs(got - wantTxt) < 0.051) return;
        await page.waitForTimeout(300);
      }
      throw new Error(`bonus numbers out of date after ${label}: ${last}`);
    };
    const editPerk = async (id: string) => { await ensurePerk(id); await page.getByTestId(`perk-${id}-open`).click(); await page.getByTestId('perk-drawer').waitFor(); };
    const closeDrawer = async () => { await page.keyboard.press('Escape'); await page.getByTestId('perk-drawer').waitFor({ state: 'detached' }); };
    const bonusDist = async () => (await saved(page)).modes[1].distributions.find((d) => d.criteria === 'freegame')!.conditions;
    await expectAvg('load');
    // multipliers: values and frequency
    await editPerk('multipliers'); await page.getByTestId('mult-high').click();
    expect(Object.keys((await bonusDist()).multValues.free!)).toContain('100');
    await page.getByTestId('boost-3').click(); await closeDrawer();
    expect((await saved(page)).reels.sets.FRB).toBeTruthy();
    await expectAvg('high multipliers, 3x frequency');
    // extra spins
    await ensurePerk('extraSpins');
    await page.waitForFunction(() => { const c = JSON.parse(localStorage.getItem('foundry-builder-config-v1')!); return c.modes[1].distributions.find((d: { criteria: string }) => d.criteria === 'freegame').conditions.extraSpins === 4; });
    await editPerk('extraSpins'); await page.getByTestId('perk-drawer').locator('input').fill('8'); await closeDrawer();
    await page.waitForFunction(() => { const c = JSON.parse(localStorage.getItem('foundry-builder-config-v1')!); return c.modes[1].distributions.find((d: { criteria: string }) => d.criteria === 'freegame').conditions.extraSpins === 8; });
    expect(await gets.textContent()).toContain('including 8 extra');
    await expectAvg('8 extra spins');
    // starting multiplier
    await editPerk('startMult'); await page.getByTestId('startmult-5').click(); await closeDrawer();
    expect((await bonusDist()).startMult).toBe(5);
    expect(await gets.textContent()).toContain('starts at 5x');
    await expectAvg('start multiplier 5x');
    // richer reels
    await editPerk('wilds'); await page.getByTestId('wild-3').click(); await closeDrawer(); await editPerk('premium'); await page.getByTestId('premium-2').click(); await closeDrawer(); await editPerk('retrigger'); await page.getByTestId('scatterboost-2').click(); await closeDrawer();
    const frb = (await saved(page)).reels.sets.FRB; const fr0 = (await saved(page)).reels.sets.FR0;
    expect(frb.W).toBe(fr0.W * 3); expect(frb.H1).toBe(fr0.H1 * 2); expect(frb.S).toBe(fr0.S * 2);
    expect(await gets.textContent()).toContain('Richer reels');
    await expectAvg('richer reels');
    // guaranteed scatters
    await editPerk('scatters');
    const nums = page.getByTestId('perk-drawer').locator('input');
    await nums.nth(0).fill('5'); await nums.nth(1).fill('5'); await closeDrawer();
    expect(Object.keys((await bonusDist()).scatterTriggers!)).toEqual(['5']);
    expect(await gets.textContent()).toContain('Starts with 5');
    await expectAvg('5 guaranteed scatters');
    // every active perk is valued and shown in the breakdown
    await page.waitForFunction(() => /^[+-]/.test(document.querySelector('[data-testid=perkvalue-startMult]')?.textContent ?? ''), null, { timeout: 90000 });
    for (const id of ['extraSpins', 'startMult', 'multipliers', 'wilds', 'premium', 'retrigger']) expect(await page.getByTestId(`perkvalue-${id}`).textContent()).toMatch(/^[+-]/);
    expect(await page.getByTestId('value-breakdown').textContent()).toContain('Plain free spins');
    await page.locator('.pill.bad').waitFor({ state: 'detached' });
    // price advice
    if (await page.getByTestId('bonus-suggest').count()) { const before = (await saved(page)).modes[1].cost; await page.getByTestId('bonus-suggest').click(); expect((await saved(page)).modes[1].cost).not.toBe(before); }
    await page.locator('.pill.bad').waitFor({ state: 'detached' });
    expect(await page.getByTestId('bonus-verdict').count()).toBe(1);
    // turning perks off again clears the stored values
    await page.getByTestId('perk-extraSpins-remove').click();
    await page.getByTestId('perk-startMult-remove').click();
    await page.waitForFunction(() => { const c = JSON.parse(localStorage.getItem('foundry-builder-config-v1')!); const k = c.modes[1].distributions.find((d: { criteria: string }) => d.criteria === 'freegame').conditions; return k.extraSpins === undefined && k.startMult === undefined; });
    await page.getByTestId('bonus-remove').click(); await confirmRemove(page);
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('foundry-builder-config-v1')!).modes.length === 1);
    await ctx.close();
  });

  it('Balance RTP: a design far off target gets several explained options; applying one brings the RTP onto the target', async () => {
    const { ctx, page } = await open();
    await begin(page); await step(page, 'symbols');
    await page.waitForFunction(() => /On target/.test(document.querySelector('.targetnote')?.textContent ?? ''), null, { timeout: 120000 });
    for (const sym of ['H1', 'H2', 'H3']) await page.getByTestId(`pays-${sym}`).locator('input').nth(2).fill('900');
    await page.waitForFunction(() => /pts high/.test(document.querySelector('.targetnote')?.textContent ?? ''), null, { timeout: 60000 });
    await page.getByTestId('tune').click();
    await page.getByTestId('balance-modal').waitFor();
    await page.getByTestId('bal-pays-all').waitFor({ timeout: 60000 });
    await page.getByTestId('bal-spins').waitFor({ timeout: 90000 });
    expect(await page.getByTestId('balance-options').locator('.balopt').count()).toBeGreaterThanOrEqual(4);
    expect(await page.getByTestId('balance-findings').count()).toBeGreaterThanOrEqual(0);
    const txt = await page.getByTestId('bal-pays-high').textContent();
    expect(txt).toContain('Price'); expect(txt).toContain('How');
    await page.getByTestId('bal-apply-pays-all').click();
    await page.getByTestId('balance-modal').waitFor({ state: 'detached' });
    await page.waitForFunction(() => /On target/.test(document.querySelector('.targetnote')?.textContent ?? ''), null, { timeout: 90000 });
    await expectMath(page, 'after applying a balance option');
    await ctx.close();
  });

  it('game info: editable name and description show on Home with tags; the device toggle resizes the preview', async () => {
    const { ctx, page } = await open();
    await begin(page);
    await step(page, 'info');
    await page.getByLabel('Game name').first().fill('Alien Farm 2');
    await page.getByLabel('Game description').fill('A cosmic farm adventure');
    const c = await saved(page); expect(c.name).toBe('Alien Farm 2'); expect(c.description).toBe('A cosmic farm adventure');
    expect(await page.getByTestId('top-name').textContent()).toBe('Alien Farm 2');
    await openPreview(page);
    await page.getByTestId('device-mobile').click();
    expect(await page.locator('.screen').getAttribute('class')).toContain('mobile');
    await page.getByTestId('device-desktop').click();
    await ctx.close();
  });

  it('game balance: the volatility slider reshapes the design and the RTP is rebalanced to the target', async () => {
    const { ctx, page } = await open();
    await begin(page); await step(page, 'return');
    await page.waitForFunction(() => /On target/.test(document.querySelector('.targetnote')?.textContent ?? ''), null, { timeout: 120000 });
    await page.getByTestId('vol-slider').fill('2');
    await page.waitForFunction(() => /On target/.test(document.querySelector('.targetnote')?.textContent ?? ''), null, { timeout: 120000 });
    expect((await saved(page)).reels.sets.BR0.H1).toBe(18); // high volatility profile applied
    await expectMath(page, 'volatility high, rebalanced');
    await ctx.close();
  });

  it('changing the max win before and after adding a bonus never leaves a win-cap error', async () => {
    const { ctx, page } = await open();
    await begin(page); await step(page, 'buy');
    await page.getByTestId('bonus-remove').click(); await confirmRemove(page);
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('foundry-builder-config-v1')!).modes.length === 1);
    await step(page, 'return');
    await page.locator('.main select').first().selectOption('10000');
    await step(page, 'buy');
    await addBonusNamed(page, 'Late bonus');
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('foundry-builder-config-v1')!).modes.length === 2);
    const c = await saved(page);
    expect(c.modes.every((m) => m.maxWin === 10000)).toBe(true);
    expect(c.modes[1].distributions.find((d) => d.criteria === 'wincap')!.winCriteria).toBe(10000);
    await page.locator('.pill.bad').waitFor({ state: 'detached' });
    await ctx.close();
  });

  it('game features: each feature is added from the catalog as a tile, edited in its dialog, valued and stored; the live math follows each change', async () => {
    const { ctx, page } = await open();
    await begin(page); await page.getByTestId('nav-features').click();
    expect(await title(page)).toBe('Game features');
    expect((await saved(page)).features).toBeUndefined();
    const add = async (type: string) => { await page.getByTestId('feature-add').click(); await page.getByTestId(`add-type-${type}-open`).click(); await page.getByTestId('feature-dialog').waitFor(); };
    const features = async () => (await saved(page)).features as unknown as Record<string, unknown>[];
    const find = async (type: string) => (await features()).find((x) => x.type === type)!;
    // random wilds: where it works and its trigger
    await add('randomWild');
    expect(await find('randomWild')).toMatchObject({ id: 'randomWild', where: ['free'], trigger: { match: 'all', conditions: [{ kind: 'chance', p: 0.15 }] } });
    await expectMath(page, 'random wilds in free spins');
    await page.getByTestId('where-base').click();
    await page.getByLabel('Condition 1 chance (%)').fill('40');
    expect(await find('randomWild')).toMatchObject({ where: ['free', 'base'], trigger: { conditions: [{ kind: 'chance', p: 0.4 }] } });
    expect(await page.getByTestId('trigger-summary').textContent()).toContain('40%');
    // a second condition, combined with "any"; bonus-only conditions are not offered for the base game
    await page.getByTestId('trig-add').selectOption('scatters');
    expect((await find('randomWild') as { trigger: { conditions: unknown[] } }).trigger.conditions.length).toBe(2);
    await page.getByTestId('trig-match-any').click();
    expect((await find('randomWild') as { trigger: { match: string } }).trigger.match).toBe('any');
    expect(await page.getByTestId('trig-add').locator('option[value=streak]').isDisabled()).toBe(true);
    await page.getByTestId('trig-remove-1').click();
    await closeDialog(page);
    await expectMath(page, 'random wilds in both, 40%');
    // the tile summarises the trigger and shows where it works
    expect(await page.getByTestId('feature-randomWild').textContent()).toContain('40%');
    expect(await page.getByTestId('feature-randomWild').textContent()).toContain('Base game');
    await add('stickyWild'); expect((await find('stickyWild'))).toMatchObject({ where: ['base', 'free'] }); // a step feature starts in the base game too
    await page.getByTestId('sticky-2').click(); await page.getByTestId('where-base').click(); await closeDialog(page);
    expect((await find('stickyWild'))).toMatchObject({ lifetime: 2, where: ['free'] });
    await expectMath(page, 'sticky wilds 2 spins');
    await add('heroWild'); await page.getByTestId('where-base').click(); await page.getByTestId('hero-start-2').click(); await page.getByTestId('hero-growth-2').click(); await page.getByTestId('hero-move-random').click(); await closeDialog(page);
    expect(await find('heroWild')).toMatchObject({ startFactor: 2, growth: 2, move: 'random' });
    await expectMath(page, 'hero wild 2x, +2, random');
    await add('expandWild'); await page.getByTestId('expand-shape-cross').click(); await page.getByTestId('where-base').click(); await closeDialog(page);
    await add('spreadWild'); await page.getByTestId('spread-copies-3').click(); await closeDialog(page);
    expect(await find('expandWild')).toMatchObject({ shape: 'cross', where: ['free', 'base'] });
    expect(await find('spreadWild')).toMatchObject({ copies: 3 });
    await expectMath(page, 'expanding and spreading wilds');
    await add('cellMultiplier'); await page.getByTestId('cm-start-3').click(); await page.getByTestId('cm-growth-add').click(); await page.getByTestId('cm-memory-spin').click(); await page.getByTestId('where-base').click(); await closeDialog(page);
    expect(await find('cellMultiplier')).toMatchObject({ start: 3, growth: 'add', memory: 'spin', where: ['free', 'base'] });
    await expectMath(page, 'cell multipliers 3x, add, one spin, both');
    await add('mystery'); await page.getByTestId('my-pool-high').click(); await page.getByLabel('Condition 1 chance (%)').fill('30'); await closeDialog(page);
    expect(await find('mystery')).toMatchObject({ pool: 'high', where: ['free'] });
    await expectMath(page, 'mystery reveal, free spins, high pay');
    await add('holdAndWin'); await page.getByTestId('hw-respins-2').click(); await page.getByTestId('hw-full-5').click(); await page.getByLabel('Chance for each empty cell (%)').fill('6'); await closeDialog(page);
    expect(await find('holdAndWin')).toMatchObject({ respins: 2, fullMult: 5, landChance: 0.06, where: ['free'] });
    await expectMath(page, 'hold and win in free spins');
    // the board can be filtered by place; step features can be ticked for the base game because this game tumbles
    await page.getByTestId('fx-filter-base').click();
    expect(await page.getByTestId('feature-mystery').count()).toBe(0);
    expect(await page.getByTestId('feature-randomWild').count()).toBe(1);
    await page.getByTestId('fx-filter-all').click();
    await page.getByTestId('feature-heroWild-open').click();
    expect(await page.getByTestId('where-base').isDisabled()).toBe(false); // this game tumbles, so the base round has steps for the hero
    await closeDialog(page);
    // each feature shows what it adds on its own
    await page.waitForFunction(() => ['randomWild', 'stickyWild', 'heroWild', 'expandWild', 'spreadWild', 'cellMultiplier', 'mystery', 'holdAndWin'].every((k) => /RTP [+-]\d/.test(document.querySelector(`[data-testid=feature-effect-${k}]`)?.textContent ?? '')), null, { timeout: 90000 });
    // the rules describe them on the export page
    await step(page, 'review');
    await page.locator('pre.doc').waitFor();
    expect(await page.locator('.pagebody').textContent()).toContain('random W');
    // removing them removes the field again
    await step(page, 'extras');
    for (const t of ['randomWild', 'stickyWild', 'heroWild', 'expandWild', 'spreadWild', 'cellMultiplier', 'mystery', 'holdAndWin']) {
      await page.getByTestId(`feature-${t}-open`).click(); await page.getByTestId('feature-remove').click(); await confirmRemove(page);
      await page.getByTestId('feature-dialog').waitFor({ state: 'detached' });
    }
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('foundry-builder-config-v1')!).features === undefined);
    await expectMath(page, 'features off again');
    await ctx.close();
  });

  it('game mechanics: tumbles and the top gadget bar are chosen on the Game page, not added as features', async () => {
    const { ctx, page } = await open();
    await begin(page);
    // pay anywhere tumbles unless switched off; off, each spin is evaluated once
    expect(await page.getByRole('switch', { name: 'Tumbles' }).getAttribute('aria-checked')).toBe('true');
    await page.getByRole('switch', { name: 'Tumbles' }).click();
    expect((await saved(page)).tumble).toBe(false); expect(await page.getByTestId('tumble-state').textContent()).toBe('No');
    await page.getByRole('switch', { name: 'Tumbles' }).click();
    expect((await saved(page)).tumble).toBeUndefined(); expect(await page.getByTestId('tumble-state').textContent()).toBe('Yes');
    // the gadget row is not in the feature catalog any more
    await page.getByTestId('nav-features').click(); await page.getByTestId('feature-add').click();
    expect(await page.getByTestId('add-type-gadgetPanel').count()).toBe(0); await page.keyboard.press('Escape');
    await page.getByTestId('nav-game').click();
    expect((await saved(page)).gadgetBar).toBeUndefined();
    await page.getByRole('switch', { name: 'Gadget bar' }).click();
    type Bar = { slots: { hold?: boolean; name?: string; need: number; tool: string; power: number; eliteNeed?: number; elitePower?: number; repeat: boolean; charge: { kind: string; symbols?: string[] } }[] };
    const bar = async () => (await saved(page)).gadgetBar as unknown as Bar;
    let g = await bar();
    expect(g.slots.length).toBe(6); expect((g as unknown as { position?: string }).position).toBe('top'); // one cell for each of the 6 reels
    expect(g.slots[0].charge).toMatchObject({ kind: 'land', symbols: ['H1'] }); expect(g.slots[2].charge.kind).toBe('wins');
    // each cell has its own symbols, threshold, tool and upgrade
    await page.getByTestId('gcell-0-sym-H2').click();
    await page.getByLabel('Cell 1 name').fill('Spooky');
    await page.getByLabel('Cell 1 opens at').fill('3');
    await page.getByLabel('Cell 2 tool').selectOption('wilds');
    await page.getByTestId('gcell-1-wins').click();
    await page.getByLabel('Cell 3 upgrade').click(); // the switch: upgrade on
    await page.getByLabel('Cell 3 repeats').click();
    g = await bar();
    expect(g.slots[0]).toMatchObject({ name: 'Spooky', need: 3 }); expect(g.slots[0].charge.symbols).toEqual(['H1', 'H2']);
    expect(g.slots[1]).toMatchObject({ tool: 'wilds', charge: { kind: 'wins' } });
    expect(g.slots[2].eliteNeed).toBeGreaterThan(g.slots[2].need); expect(g.slots[2].repeat).toBe(true);
    // locked wild reels that stay wild, and cells that open in order like doors
    await page.getByLabel('Cell 1 tool').selectOption('wildReel'); await page.getByLabel('Cell 1 keeps the reels wild').click();
    await page.getByLabel('Cells open in order').click();
    g = await bar();
    expect(g.slots[0]).toMatchObject({ tool: 'wildReel', hold: true }); expect((g as unknown as { sequence?: boolean }).sequence).toBe(true);
    // the bar is part of the preview layout; at the side it has a cell for each row
    await openPreview(page); expect(await page.getByTestId('preview-drawer').getByTestId('preview-gadget-bar').locator('li').count()).toBe(6); expect(await page.getByTestId('preview-gadget-bar').count()).toBe(2); // the grid on the Game page shows it too
    await closeDialog(page);
    await page.getByTestId('gadget-pos-side').click();
    expect((await bar()).slots.length).toBe(5); expect((await bar()).slots[0]).toMatchObject({ name: 'Spooky', need: 3 }); // the first cells are kept
    await openPreview(page); expect(await page.getByTestId('preview-drawer').locator('[data-testid=preview-gadget-bar].side li').count()).toBe(5); await closeDialog(page);
    await page.getByTestId('gadget-pos-top').click(); expect((await bar()).slots.length).toBe(6);
    await expectMath(page, 'top gadget bar with its own cells');
    await page.getByTestId('nav-export').click(); await page.locator('pre.doc').waitFor();
    expect(await page.locator('.pagebody').textContent()).toContain('cell 1 (Spooky) gains 1 charge');
    await page.getByTestId('nav-game').click(); await page.getByRole('switch', { name: 'Gadget bar' }).click();
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('foundry-builder-config-v1')!).gadgetBar === undefined);
    // paylines: tumbles can be switched on and off
    await page.getByTestId('type-paylines').click();
    expect(await page.getByRole('switch', { name: 'Tumbles' }).getAttribute('aria-checked')).toBe('false');
    await page.getByRole('switch', { name: 'Tumbles' }).click();
    expect((await saved(page)).tumble).toBe(true);
    await page.getByRole('switch', { name: 'Tumbles' }).click();
    expect((await saved(page)).tumble).toBeUndefined();
    await ctx.close();
  });

  it('a design saved with the first gadget bar shape opens without a crash and is upgraded to cells', async () => {
    const { ctx, page, errors } = await open();
    await begin(page); await page.waitForTimeout(800);
    await page.evaluate(() => {
      const old = { source: 'wilds', reuse: false, slots: [{ need: 2, tool: 'wilds', power: 1 }, { need: 3, tool: 'multiplier', power: 2 }] };
      const lib = JSON.parse(localStorage.getItem('foundry-builder-games-v1')!); lib[0].config.gadgetBar = old; localStorage.setItem('foundry-builder-games-v1', JSON.stringify(lib));
      const cur = JSON.parse(localStorage.getItem('foundry-builder-config-v1')!); cur.gadgetBar = old; localStorage.setItem('foundry-builder-config-v1', JSON.stringify(cur));
    });
    await page.reload(); await page.waitForSelector('.hubbody');
    expect(await page.getByTestId('crash').count()).toBe(0);
    await page.getByTestId('nav-game').click();
    await page.getByTestId('gadget-cell-1').waitFor();
    expect((await saved(page)).gadgetBar!.slots[0].charge).toMatchObject({ kind: 'land', symbols: ['W'] });
    expect(errors).toEqual([]);
    await ctx.close();
  });

  it('multiplier ladder, wilds with multipliers and colossal wild: tiles, dialogs, stored settings, math follows, rules mention them', async () => {
    const { ctx, page } = await open();
    await begin(page); await page.getByTestId('nav-features').click();
    const add = async (type: string) => { await page.getByTestId('feature-add').click(); await page.getByTestId(`add-type-${type}-open`).click(); await page.getByTestId('feature-dialog').waitFor(); };
    const find = async (type: string) => ((await saved(page)).features as unknown as Record<string, unknown>[]).find((x) => x.type === type)!;
    await add('multiplierLadder'); await page.getByTestId('ladder-start-2').click(); await page.getByTestId('ladder-step-3').click(); await closeDialog(page);
    expect(await find('multiplierLadder')).toMatchObject({ start: 2, step: 3, where: ['base', 'free'] });
    await expectMath(page, 'multiplier ladder 2x, +3');
    await add('wildMultiplier'); await page.getByTestId('wm-combine-multiply').click(); await closeDialog(page);
    expect(await find('wildMultiplier')).toMatchObject({ combine: 'multiply', where: ['free'] });
    await expectMath(page, 'wild multipliers, multiply');
    await add('colossalWild'); await page.getByTestId('colossal-size-3').click(); await closeDialog(page);
    expect(await find('colossalWild')).toMatchObject({ size: 3 });
    await expectMath(page, 'colossal wild 3x3');
    await step(page, 'review'); await page.locator('pre.doc').waitFor();
    const text = await page.locator('.pagebody').textContent();
    expect(text).toContain('starts every spin at 2x'); expect(text).toContain('colossal block of 3 by 3');
    await step(page, 'extras');
    for (const t of ['multiplierLadder', 'wildMultiplier', 'colossalWild']) { await page.getByTestId(`feature-${t}-open`).click(); await page.getByTestId('feature-remove').click(); await confirmRemove(page); await page.getByTestId('feature-dialog').waitFor({ state: 'detached' }); }
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('foundry-builder-config-v1')!).features === undefined);
    await ctx.close();
  });
  it('bonus multiplier, symbol removal and configured prize: tiles, dialogs, stored settings, math follows, rules mention them', async () => {
    const { ctx, page } = await open();
    await begin(page); await page.getByTestId('nav-features').click();
    const add = async (type: string) => { await page.getByTestId('feature-add').click(); await page.getByTestId(`add-type-${type}-open`).click(); await page.getByTestId('feature-dialog').waitFor(); };
    const find = async (type: string) => ((await saved(page)).features as unknown as Record<string, unknown>[]).find((x) => x.type === type)!;
    await add('bonusMultiplier'); await page.getByTestId('bm-start-2').click(); await page.getByTestId('bm-step-3').click(); await closeDialog(page);
    expect(await find('bonusMultiplier')).toMatchObject({ start: 2, step: 3, where: ['free'] }); // free spins only: never the base game
    await expectMath(page, 'bonus multiplier 2x, +3');
    await add('removeSymbols'); await page.getByTestId('remove-target-low').click(); await closeDialog(page);
    expect(await find('removeSymbols')).toMatchObject({ target: 'low' });
    await expectMath(page, 'symbol removal, lower half');
    await add('prizeAward'); await closeDialog(page);
    expect(await find('prizeAward')).toMatchObject({ values: { '5': 60, '10': 30, '25': 10 } });
    await expectMath(page, 'configured prize');
    await step(page, 'review'); await page.locator('pre.doc').waitFor();
    const text = await page.locator('.pagebody').textContent();
    expect(text).toContain('one multiplier applies to every win of the bonus'); expect(text).toContain('a cash prize can be won');
    await step(page, 'extras');
    for (const t of ['bonusMultiplier', 'removeSymbols', 'prizeAward']) { await page.getByTestId(`feature-${t}-open`).click(); await page.getByTestId('feature-remove').click(); await confirmRemove(page); await page.getByTestId('feature-dialog').waitFor({ state: 'detached' }); }
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('foundry-builder-config-v1')!).features === undefined);
    await ctx.close();
  });
  it('lives and symbol shuffle: lives are a bonus tile; the shuffle is offered only where position matters', async () => {
    const { ctx, page } = await open();
    await begin(page); await page.getByTestId('nav-features').click();
    await page.getByTestId('feature-add').click();
    expect(await page.getByTestId('add-type-shuffle').count()).toBe(0); // pay anywhere: position does not matter
    await page.getByTestId('add-type-lives-open').click(); await page.getByTestId('feature-dialog').waitFor();
    await page.getByTestId('lives-2').click(); await closeDialog(page);
    expect(((await saved(page)).features as unknown as Record<string, unknown>[]).find((x) => x.type === 'lives')).toMatchObject({ lives: 2, where: ['free'] });
    await expectMath(page, 'two lives');
    await page.getByTestId('nav-game').click(); await page.getByTestId('type-ways').click();
    await page.getByTestId('nav-features').click(); await page.getByTestId('feature-add').click();
    expect(await page.getByTestId('add-type-shuffle').count()).toBe(1);
    await ctx.close();
  });

  it('purchased bonuses: several bonuses, tiles dragged into one, its own features and trigger, a recommended round price, favorites and a saved copy', async () => {
    const { ctx, page } = await open();
    await begin(page); await step(page, 'buy');
    await addBonusNamed(page, 'Dawn Spins');
    expect((await saved(page)).modes.map((m) => m.name)).toEqual(['base', 'bonus', 'dawn_spins']);
    await page.getByTestId('bonus-card-dawn_spins').waitFor();
    // the recommended price is one of the round-number prices, shown per bonus
    await page.waitForFunction(() => /[0-9]+x/.test(document.querySelector('[data-testid=bonus-recommended]')?.textContent ?? ''), null, { timeout: 90000 });
    const rec = Number((await page.getByTestId('bonus-recommended').textContent())!.match(/([0-9]+)x/)![1]);
    expect([5, 10, 25, 50, 75, 100, 150, 200, 250, 500, 1000]).toContain(rec);
    if (await page.getByTestId('bonus-suggest').count()) await page.getByTestId('bonus-suggest').click();
    expect((await saved(page)).modes[2].cost).toBe(rec);
    // drag a feature tile from the palette into the bonus
    const dt = await page.evaluateHandle(() => new DataTransfer());
    await page.getByTestId('pal-type-heroWild').dispatchEvent('dragstart', { dataTransfer: dt });
    await page.getByTestId('bonus-zone').dispatchEvent('dragover', { dataTransfer: dt });
    await page.getByTestId('bonus-zone').dispatchEvent('drop', { dataTransfer: dt });
    await page.getByTestId('feature-dialog').waitFor();
    expect(((await saved(page)).features ?? []).find((f) => f.type === 'heroWild')).toMatchObject({ where: ['dawn_spins'] });
    // inside a bonus the bonus-only conditions are available
    await page.getByTestId('trig-add').selectOption('streak');
    await page.getByLabel('Condition 1 streak length').fill('3');
    expect(await page.getByTestId('trigger-summary').textContent()).toMatch(/3/);
    await page.getByTestId('feature-favorite').click();
    await closeDialog(page);
    expect(await page.getByTestId('feat-heroWild').count()).toBe(1);
    await page.waitForFunction(() => /[+-][0-9]/.test(document.querySelector('[data-testid=feat-value-heroWild]')?.textContent ?? ''), null, { timeout: 90000 });
    // the same feature can also work in the other bonus: the palette offers it, and + adds it
    await page.getByTestId('bonus-card-bonus').click();
    await page.getByTestId('pal-feat-heroWild-add').click();
    expect(((await saved(page)).features ?? []).find((f) => f.type === 'heroWild')).toMatchObject({ where: ['dawn_spins', 'bonus'] });
    // take it out again: it stays in the other bonus
    await page.getByTestId('feat-heroWild-remove').click();
    expect(((await saved(page)).features ?? []).find((f) => f.type === 'heroWild')).toMatchObject({ where: ['dawn_spins'] });
    // the favorite appears in the catalog and adds a copy that works in free spins
    await page.getByTestId('ptab-extras').click();
    await page.getByTestId('feature-add').click();
    await page.getByTestId('add-type-mystery').waitFor();
    const fav = page.locator('[data-testid^=add-fav-]').first(); await fav.waitFor();
    await fav.getByRole('button').first().click();
    await page.getByTestId('feature-dialog').waitFor();
    expect(((await saved(page)).features ?? []).filter((f) => f.type === 'heroWild').length).toBe(2);
    await closeDialog(page);
    // a whole bonus can be saved and rebuilt in another game
    await page.getByTestId('ptab-buy').click(); await page.getByTestId('bonus-card-dawn_spins').click();
    await page.getByTestId('bonus-favorite').click();
    await page.getByTestId('bonus-add').click();
    await page.locator('[data-testid^=bonus-fav-]').first().getByRole('button').first().click();
    expect((await saved(page)).modes.length).toBe(4);
    await page.locator('.pill.bad').waitFor({ state: 'detached' });
    // removing a bonus removes the features that only worked there
    await page.getByTestId('bonus-remove').click(); await confirmRemove(page);
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('foundry-builder-config-v1')!).modes.length === 3);
    await page.locator('.pill.bad').waitFor({ state: 'detached' });
    await expectMath(page, 'several bonuses');
    await ctx.close();
  });

  it('a real mouse drag of a palette tile into the bonus adds it', async () => {
    const { ctx, page } = await open(1360, 1700);
    await begin(page); await step(page, 'buy');
    const src = page.getByTestId('pal-type-mystery'); const dst = page.getByTestId('bonus-zone');
    await src.evaluate((el) => el.scrollIntoView({ block: 'nearest' })); await page.evaluate(() => window.scrollTo(0, 0));
    const a = (await src.boundingBox())!; const b = (await dst.boundingBox())!;
    await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2); await page.mouse.down();
    await page.mouse.move(a.x + a.width / 2 + 10, a.y + a.height / 2 + 10, { steps: 4 });
    const b2 = (await dst.boundingBox())!; await page.mouse.move(b2.x + 40, b2.y + Math.min(40, b2.height / 2), { steps: 12 }); await page.mouse.up();
    await page.getByTestId('feature-dialog').waitFor();
    expect(((await saved(page)).features ?? []).find((f) => f.type === 'mystery')).toMatchObject({ where: ['bonus'] });
    await ctx.close();
  });

  it('ante bet: a game feature tile, switched on at 2x or 3x, stored with its own optimiser numbers, and removed again', async () => {
    const { ctx, page } = await open();
    await begin(page); await page.getByTestId('nav-features').click();
    expect(await title(page)).toBe('Game features');
    expect(await page.getByTestId('ptab-bets').count()).toBe(0);
    expect(await page.getByTestId('core-ante').count()).toBe(0); // not on the board until it is added
    await page.getByTestId('feature-add').click(); await page.getByTestId('add-type-ante-open').click(); await page.getByTestId('ante-dialog').waitFor();
    expect((await saved(page)).modes.find((m) => m.isAnte)?.cost).toBe(2); // added at 2x
    await page.getByTestId('ante-2').click();
    let c = await saved(page); let a = c.modes.find((m) => m.isAnte)!;
    expect(a).toMatchObject({ name: 'ante', cost: 2 }); expect(c.optimization.ante).toBeTruthy();
    expect(await page.getByTestId('ante-summary').textContent()).toMatch(/Players pay 2x the bet/);
    await page.getByTestId('ante-wilds-3').click(); await page.getByTestId('ante-symbols-2').click();
    c = await saved(page); expect(c.modes.find((m) => m.isAnte)!.ante).toMatchObject({ freeSpins: true, wilds: 3, symbols: 2 }); expect(c.reels.sets.ANTE.W).toBe(c.reels.sets.BR0.W * 3);
    await page.getByTestId('ante-add-feature').click(); await page.getByTestId('add-type-randomWild-open').click(); await page.getByTestId('feature-dialog').waitFor();
    expect(((await saved(page)).features ?? [])[0]).toMatchObject({ type: 'randomWild', where: ['ante'] });
    await page.keyboard.press('Escape'); await page.getByTestId('feature-dialog').waitFor({ state: 'detached' }); // Escape closes the top dialog only
    expect(await page.getByTestId('ante-feat-randomWild').count()).toBe(1);
    await page.getByTestId('ante-3').click();
    c = await saved(page); a = c.modes.find((m) => m.isAnte)!; expect(a.cost).toBe(3); expect(a.ante).toMatchObject({ wilds: 3 }); expect(c.modes.filter((m) => m.isAnte).length).toBe(1);
    await page.locator('.pill.bad').waitFor({ state: 'detached' });
    await expectMath(page, 'ante on');
    await page.getByTestId('ante-off').click();
    expect((await saved(page)).modes.some((m) => m.isAnte)).toBe(false); expect((await saved(page)).features).toBeUndefined(); // the feature that worked only with the ante goes with it
    await closeDialog(page);
    expect(await page.getByTestId('core-ante').count()).toBe(0);
    await ctx.close();
  });

  it('game types: every type is a tile; cluster, paylines and ways change the board, the ranges and the math; paylines are tiles that switch on and off', async () => {
    const { ctx, page } = await open();
    await begin(page); await page.getByTestId('nav-game').click();
    for (const t of ['anywhere', 'cluster', 'paylines', 'ways']) expect(await page.getByTestId(`type-${t}`).count()).toBe(1);
    await page.getByTestId('type-cluster').click();
    let c = await saved(page); expect(c.gameType).toBe('cluster'); expect(c.board).toEqual({ reels: 7, rows: 7 });
    await page.locator('.pill.bad').waitFor({ state: 'detached' });
    await expectMath(page, 'cluster pays');
    await page.getByTestId('type-paylines').click();
    c = await saved(page); expect(c.gameType).toBe('paylines'); expect(c.paylines!.length).toBe(20); expect(c.board).toEqual({ reels: 5, rows: 3 });
    expect(await page.getByTestId('payline-count').textContent()).toContain('20 of 40');
    await page.getByTestId('payline-2').getByRole('switch').click();
    expect((await saved(page)).paylines!.length).toBe(19);
    await page.getByTestId('payline-preset-10').click();
    expect((await saved(page)).paylines!.length).toBe(10);
    expect(await page.getByTestId('payline-tiles').locator('li').count()).toBe(40);
    await page.locator('.pill.bad').waitFor({ state: 'detached' });
    await expectMath(page, 'paylines');
    await page.getByRole('switch', { name: 'Tumbles' }).click();
    expect((await saved(page)).tumble).toBe(true);
    await page.locator('.pill.bad').waitFor({ state: 'detached' });
    await expectMath(page, 'paylines with tumbles');
    await page.getByRole('switch', { name: 'Tumbles' }).click();
    expect((await saved(page)).tumble).toBeUndefined();
    await page.getByTestId('type-ways').click();
    c = await saved(page); expect(c.gameType).toBe('ways'); expect(c.paylines).toBeUndefined();
    await expectMath(page, 'ways');
    await page.getByTestId('heights-random').click();
    c = await saved(page); expect(c.reelHeights).toEqual({ min: 2, max: 7 }); expect(c.board).toEqual({ reels: 6, rows: 7 });
    await page.locator('.pill.bad').waitFor({ state: 'detached' });
    await expectMath(page, 'ways with changing reel heights');
    await page.getByTestId('heights-fixed').click();
    expect((await saved(page)).reelHeights).toBeUndefined();
    await page.getByTestId('type-anywhere').click();
    c = await saved(page); expect(c.gameType).toBeUndefined(); expect(c.board).toEqual({ reels: 6, rows: 5 });
    await ctx.close();
  });

  it('new slot wizard: name, type, add-ons, grid and assets step by step; pictures land on the symbols; it opens balanced on the Symbols page', async () => {
    const { ctx, page, errors } = await open();
    await page.getByTestId('new-game-open').click();
    expect(await page.getByTestId('wiz-next').isDisabled()).toBe(true); // a name first
    await page.getByTestId('wiz-name').fill('Gadget Ways'); await page.getByTestId('wiz-name').press('Enter');
    await page.getByTestId('wiz-type-ways').click(); await page.getByTestId('wiz-next').click();
    await page.getByTestId('wiz-addon-bar').click(); await page.getByTestId('wiz-addon-tumble').click();
    expect(await page.getByTestId('wiz-addon-tumble').getAttribute('aria-checked')).toBe('true');
    await page.getByTestId('wiz-back').click(); await page.getByTestId('wiz-type-cluster').click(); await page.getByTestId('wiz-next').click();
    expect(await page.getByTestId('wiz-addon-tumble').getAttribute('aria-checked')).toBe('true'); // every type can switch tumbles; the choice is kept
    await page.getByTestId('wiz-back').click(); await page.getByTestId('wiz-type-ways').click(); await page.getByTestId('wiz-next').click();
    await page.getByTestId('wiz-next').click();
    await page.getByLabel('Columns').fill('6'); await page.getByTestId('wiz-next').click();
    await page.getByTestId('wiz-file-symbols').setInputFiles([{ ...files.png, name: '1_cow.png' }, { ...files.png2, name: '2_barn.png' }, { ...files.png, name: 'wild.png' }]);
    await page.getByTestId('wiz-symbol-map').waitFor();
    await page.getByTestId('wiz-file-audio').setInputFiles([{ ...files.wav, name: 'reel_spin.wav' }]);
    await page.getByTestId('wiz-create').click(); await page.waitForSelector('.hubbody');
    expect(await title(page)).toBe('Paytable');
    const c = await saved(page);
    expect(c).toMatchObject({ name: 'Gadget Ways', gameType: 'ways', board: { reels: 6, rows: 4 }, tumble: true });
    expect(c.gadgetBar?.slots).toHaveLength(6); // one cell for each reel
    expect(c.freeSpins).toBe(false); expect(c.modes.map((m) => m.name)).toEqual(['base']); expect(c.features).toBeUndefined(); // a new game has no features
    expect(c.look?.H1?.asset).toBe('1_cow.png'); expect(c.look?.H2?.asset).toBe('2_barn.png'); expect(c.look?.[c.symbols.wild]?.asset).toBe('wild.png'); expect(c.look?.H1?.image).toMatch(/^data:image\//);
    expect(c.media?.sfxSpin?.name).toBe('reel_spin.wav');
    await page.waitForFunction(() => document.querySelector('[data-testid=live]')?.getAttribute('data-stale') === '0' && document.querySelector('[data-testid=tune]')?.textContent === 'Balance', undefined, { timeout: 120000 });
    await expectMath(page, 'wizard game, balanced');
    await toGames(page); expect(await page.locator('[data-testid^=game-row-]').count()).toBe(1);
    // the library measures a sound's length through a blob: address, which this page's strict content policy refuses (the length is then unknown)
    expect(errors.filter((e) => !/Refused to load media from 'blob:/.test(e))).toEqual([]);
    await ctx.close();
  });

  it('wizard defaults: both add-ons off; the Features page starts empty, free spins and the ante bet are added from the list and free spins can be removed again', async () => {
    const { ctx, page } = await open();
    await page.getByTestId('new-game-open').click(); await page.getByTestId('wiz-name').fill('Plain'); await page.getByTestId('wiz-next').click();
    await page.getByTestId('wiz-next').click();
    for (const a of ['bar', 'tumble']) expect(await page.getByTestId(`wiz-addon-${a}`).getAttribute('aria-checked'), a).toBe('false');
    for (let i = 0; i < 2; i++) await page.getByTestId('wiz-next').click();
    await page.getByTestId('wiz-create').click(); await page.waitForSelector('.hubbody');
    let c = await saved(page); expect(c.tumble).toBe(false); expect(c.gadgetBar).toBeUndefined();
    await page.getByTestId('nav-features').click();
    expect(await page.getByTestId('features-empty').count()).toBe(1);
    expect(await page.locator('[data-testid=extras-list] li').count()).toBe(0);
    expect(await page.getByTestId('fx-filter-free').count()).toBe(0); // no free spins place yet
    await page.getByTestId('ptab-buy').click(); expect(await page.getByTestId('bonus-add').count()).toBe(0); expect(await page.getByTestId('bonus-add-spins').count()).toBe(1);
    await page.getByTestId('ptab-extras').click();
    await page.getByTestId('feature-add').click();
    expect(await page.getByTestId('add-type-freeSpins').count()).toBe(1); expect(await page.getByTestId('add-type-ante').count()).toBe(1);
    await page.getByTestId('add-type-freeSpins-open').click(); await page.getByTestId('spins-dialog').waitFor();
    c = await saved(page); expect(c.freeSpins).toBeUndefined(); expect(c.modes[0].distributions.some((d) => d.criteria === 'freegame')).toBe(true);
    await closeDialog(page);
    expect(await page.getByTestId('core-free-spins').count()).toBe(1);
    await page.locator('.pill.bad').waitFor({ state: 'detached' });
    await expectMath(page, 'free spins added');
    await page.getByTestId('core-free-spins-open').click(); await page.getByTestId('spins-remove').click();
    await page.getByTestId('confirm').locator('button.danger').click();
    c = await saved(page); expect(c.freeSpins).toBe(false);
    expect(await page.getByTestId('core-free-spins').count()).toBe(0);
    await ctx.close();
  });

  it('options open as centred pop-ups, not side panels', async () => {
    const { ctx, page } = await open();
    await begin(page); await step(page, 'features');
    const box = (await page.getByTestId('spins-dialog').boundingBox())!; const vw = page.viewportSize()!.width;
    expect(Math.abs(box.x + box.width / 2 - vw / 2)).toBeLessThan(4); // centred
    await closeDialog(page);
    await ctx.close();
  });

  it('switching the game type rebalances the return by itself (ways then cluster once stayed at 18%)', async () => {
    const { ctx, page } = await open();
    await begin(page); await page.getByTestId('nav-game').click();
    const tune = page.getByTestId('tune');
    const settled = async () => { await page.waitForFunction(() => document.querySelector('[data-testid=live]')?.getAttribute('data-stale') === '0' && document.querySelector('[data-testid=tune]')?.textContent === 'Balance', undefined, { timeout: 90000 }); };
    for (const t of ['ways', 'cluster', 'paylines', 'anywhere']) {
      await page.getByTestId(`type-${t}`).click();
      await settled(); // no click on Fix RTP: the balance after the switch must land
      expect(await tune.textContent(), t).toBe('Balance');
      const c = await saved(page); const rtp = [...runSim(c, 20000, 20000)].pop()!.rtp;
      expect(Math.abs(rtp - c.modes[0].rtp), `${t}: ${(rtp * 100).toFixed(2)}%`).toBeLessThan(0.02);
    }
    await ctx.close();
  });

  it('games: a new game keeps the old one in the list; open switches between them', async () => {
    const { ctx, page } = await open();
    await begin(page); await page.waitForTimeout(800);
    await toGames(page);
    expect(await page.locator('[data-testid^=game-row-]').count()).toBe(1);
    await wizard(page, 'Sweet Cascade', 'paylines');
    let c = await saved(page); expect(c.name).toBe('Sweet Cascade'); expect(c.id).toBe('sweet_cascade'); expect(c.gameType).toBe('paylines'); expect(c.paylines!.length).toBe(20);
    expect(await title(page)).toBe('Paytable'); // a new game opens on the Symbols page
    await page.locator('.pill.bad').waitFor({ state: 'detached' });
    await expectMath(page, 'new paylines game');
    await page.waitForTimeout(800);
    await toGames(page);
    expect(await page.locator('[data-testid^=game-row-]').count()).toBe(2);
    await page.locator('[data-testid^=game-row-]', { hasText: 'My first slot' }).locator('[data-testid^=open-game-]').click(); // the first game
    await page.waitForSelector('.hubbody');
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('foundry-builder-config-v1')!).name === 'My first slot');
    expect((await saved(page)).gameType).toBeUndefined();
    await expectMath(page, 'back on the first game');
    await page.reload(); await page.waitForSelector('.hubbody');
    expect(await page.getByTestId('top-name').textContent()).toBe('My first slot'); // the open game is remembered
    // a game saved by the older single-game version moves into the list
    await page.evaluate(() => { localStorage.removeItem('foundry-builder-games-v1'); localStorage.removeItem('foundry-builder-current-v1'); });
    await page.reload(); await page.waitForSelector('.hubbody');
    expect(await page.getByTestId('top-name').textContent()).toBe('My first slot');
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('foundry-builder-games-v1')!).length)).toBe(1);
    await ctx.close();
  });

  it('delete game: a game is removed after a confirmation; the last one returns the start screen', async () => {
    const { ctx, page } = await open();
    await begin(page); await page.waitForTimeout(800);
    await toGames(page);
    await page.locator('[data-testid^=delete-game-]').first().click();
    await page.getByTestId('confirm').locator('button:not(.danger)').click();
    expect(await page.locator('[data-testid^=game-row-]').count()).toBe(1); // cancelled: still there
    await wizard(page, 'Second'); await page.waitForTimeout(800);
    await toGames(page);
    expect(await page.locator('[data-testid^=game-row-]').count()).toBe(2);
    await page.locator('[data-testid^=delete-game-]').first().click(); await confirmRemove(page);
    expect(await page.locator('[data-testid^=game-row-]').count()).toBe(1);
    await page.locator('[data-testid^=delete-game-]').first().click(); await confirmRemove(page); // the last one
    await page.getByTestId('start-demo').waitFor();
    expect(await page.evaluate(() => localStorage.getItem('foundry-builder-config-v1'))).toBeNull();
    await page.reload(); await page.getByTestId('start-demo').waitFor(); // stays gone after a reload
    await ctx.close();
  });

  it('scatter rewards: a list of rows (free spins, cash or both) that can be edited, added to and removed from; the math follows', async () => {
    const { ctx, page } = await open();
    await begin(page); await step(page, 'features');
    await page.getByTestId('scatter-rewards').waitFor();
    expect(await page.getByLabel('Reward 1 free spins').inputValue()).toBe('6');
    await page.getByLabel('Reward 1 free spins').fill('10'); await page.getByLabel('Reward 1 cash win').fill('2');
    let c = await saved(page); expect(c.freeSpinTriggers.base['3']).toBe(10); expect(c.scatterRule.pays).toEqual({ '3': 2 }); expect(c.scatterRule.custom).toBe(true);
    await page.getByTestId('reward-add').click();
    const rows = await page.locator('[data-testid^=reward-row-]').count(); expect(rows).toBeGreaterThan(3);
    await page.getByTestId(`reward-remove-${rows - 1}`).click();
    expect(await page.locator('[data-testid^=reward-row-]').count()).toBe(rows - 1);
    await closeDialog(page);
    await page.locator('.pill.bad').waitFor({ state: 'detached' });
    await expectMath(page, 'scatter rewards');
    await step(page, 'features'); await page.getByTestId('reward-reset').click();
    c = await saved(page); expect(c.scatterRule.custom).toBeUndefined(); expect(c.freeSpinTriggers.base['3']).toBe(6);
    await ctx.close();
  });

  it('describe a feature in words: the builder fills in a feature from the answer, or records a concept it cannot build yet', async () => {
    const { ctx, page } = await open();
    await ctx.addInitScript(() => {
      let n = 0;
      const answers = [
        { ok: true, name: 'Wild after a loss', feature: { type: 'randomWild', counts: { '1': 100 }, trigger: { match: 'all', conditions: [{ kind: 'prevSpin', result: 'loss' }, { kind: 'spinIs', which: 'from', n: 2 }] }, where: ['free'] } },
        { ok: false, concept: 'a collector that fills a bar', why: 'the builder has no collector' },
      ];
      const sample = Object.assign(async () => ({ text: '' }), { json: async () => answers[Math.min(n++, answers.length - 1)] });
      (window as unknown as { claude: unknown }).claude = { use: async (name: string) => (name === 'sample' ? sample : null) };
    });
    await page.reload(); await page.waitForSelector('[data-testid=games-home], .hubbody');
    if (await page.getByTestId('start-demo').count()) await begin(page);
    await page.getByTestId('nav-features').click();
    await page.getByTestId('ptab-extras').click();
    await page.getByTestId('feature-add').click();
    await page.getByTestId('describe-box').waitFor();
    await page.getByTestId('describe-text').fill('from the second free spin a wild lands after every losing spin');
    await page.getByTestId('describe-go').click();
    await page.getByTestId('feature-dialog').waitFor();
    const f = ((await saved(page)).features ?? [])[0];
    expect(f).toMatchObject({ type: 'randomWild', name: 'Wild after a loss', where: ['free'] });
    expect(await page.getByTestId('trigger-summary').textContent()).toMatch(/loses|loss|lost/i);
    await closeDialog(page);
    await page.getByTestId('feature-add').click();
    await page.getByTestId('describe-text').fill('a collector that fills a bar and then pays out');
    await page.getByTestId('describe-go').click();
    await page.getByTestId('describe-msg').waitFor();
    expect(await page.getByTestId('describe-msg').textContent()).toContain('cannot run this yet');
    expect(((await saved(page)).features ?? []).length).toBe(1);
    await ctx.close();
  });

  it('Balance RTP pop-up: an extreme design is explained (what is too high, what to change, how it affects the player) even when it cannot be balanced', async () => {
    const { ctx, page } = await open();
    await begin(page); await step(page, 'symbols');
    await page.waitForFunction(() => /On target/.test(document.querySelector('.targetnote')?.textContent ?? ''), null, { timeout: 120000 });
    await page.getByLabel('How often S appears').fill('80');
    await page.getByTestId('pays-H1').locator('input').nth(3).fill('20000');
    await page.getByTestId('tune').waitFor();
    expect(await page.getByTestId('tune').isDisabled()).toBe(false); // clickable even while the numbers update
    await page.getByTestId('tune').click();
    const modal = page.getByTestId('balance-modal');
    await modal.waitFor();
    await page.getByTestId('balance-findings').getByText(/pays more than the max win/).waitFor({ timeout: 60000 });
    await page.getByTestId('balance-findings').getByText(/Scatters are too common/).waitFor({ timeout: 60000 });
    expect(await page.getByTestId('balance-changes').textContent()).toMatch(/Lower/);
    expect(await page.getByTestId('balance-experience').textContent()).toMatch(/players win on/);
    await page.waitForFunction(() => /Fix the problems below first|times too much|against a/.test(document.querySelector('[data-testid=balance-verdict]')?.textContent ?? ''), null, { timeout: 90000 });
    await page.getByTestId('bal-pays-all').waitFor({ timeout: 60000 });
    await page.getByRole('button', { name: 'Close' }).last().click();
    await modal.waitFor({ state: 'detached' });
    await ctx.close();
  });

  it('asset library: drop images, sounds and data once; filter, search, rename, delete with confirmation; files survive a reload; unsupported files are refused', async () => {
    const { ctx, page } = await open();
    await begin(page); await step(page, 'assets');
    expect(await page.getByTestId('library-empty').textContent()).toContain('empty');
    await page.getByTestId('file-input').setInputFiles([files.png, files.png2, files.wav, files.json, files.exe]);
    await page.getByTestId('asset-cow.png').waitFor();
    expect(await page.locator('[data-testid^=asset-]').count()).toBe(4);
    expect(await page.locator('.fix').textContent()).toContain('virus.exe');
    await page.getByRole('tab', { name: /Sounds/ }).click();
    expect(await page.locator('[data-testid^=asset-]').count()).toBe(1);
    await page.getByRole('tab', { name: /Images \(2\)/ }).click();
    await page.getByLabel('Search library').fill('barn');
    expect(await page.locator('[data-testid^=asset-]').count()).toBe(1);
    await page.getByLabel('Search library').fill('');
    await page.getByRole('button', { name: 'Rename cow.png' }).click();
    await page.getByRole('textbox', { name: 'Rename cow.png' }).fill('cow-wild.png'); await page.getByRole('textbox', { name: 'Rename cow.png' }).press('Enter');
    await page.getByTestId('asset-cow-wild.png').waitFor(); await page.waitForTimeout(800); // let the library finish writing before the reload
    await page.reload(); await page.waitForSelector('.hubbody');
    await step(page, 'assets');
    await page.getByTestId('asset-cow-wild.png').waitFor();
    expect(await page.locator('[data-testid^=asset-]').count()).toBe(4);
    await page.getByRole('button', { name: 'Delete barn.png' }).click();
    await page.getByRole('button', { name: 'Cancel' }).click();
    expect(await page.locator('[data-testid^=asset-]').count()).toBe(4);
    await page.getByRole('button', { name: 'Delete barn.png' }).click();
    await page.getByRole('button', { name: 'Confirm delete barn.png' }).click();
    await page.waitForFunction(() => document.querySelectorAll('[data-testid^=asset-]').length === 3);
    await ctx.close();
  });

  it('pickers open the library: a symbol picture is chosen from it, dropped files join it, deleting a file removes it', async () => {
    const { ctx, page } = await open();
    await begin(page); await step(page, 'assets');
    await page.getByTestId('file-input').setInputFiles([files.png, files.wav]);
    await page.getByTestId('asset-spin.wav').waitFor();
    // symbol picture
    await step(page, 'symbols');
    await page.getByTestId('style-H1').click(); await page.getByTestId('choose-pic-H1').click();
    const picker = page.getByTestId('asset-picker'); await picker.waitFor();
    expect(await picker.locator('[data-testid^=pick-]').count()).toBe(1); // images only
    await picker.getByTestId('pick-cow.png').click(); await picker.getByTestId('use-selected').click();
    await picker.waitFor({ state: 'detached' });
    await page.waitForFunction(() => !!JSON.parse(localStorage.getItem('foundry-builder-config-v1')!).look?.H1?.image);
    expect((await saved(page)).look!.H1.asset).toBe('cow.png');
    // dropping into the picker adds to the library and selects it
    await page.keyboard.press('Escape'); await page.getByTestId('symbol-drawer').waitFor({ state: 'detached' });
    await page.getByTestId('style-H2').click(); await page.getByTestId('choose-pic-H2').click();
    await page.getByTestId('asset-picker').getByTestId('file-input').setInputFiles({ name: 'new.png', mimeType: 'image/png', buffer: PNG });
    await page.getByTestId('asset-picker').getByTestId('pick-new.png').waitFor();
    await page.getByTestId('use-selected').click();
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('foundry-builder-config-v1')!).look?.H2?.asset === 'new.png');
    await page.keyboard.press('Escape');
    // deleting a used picture keeps the config and the library lists what is left
    await step(page, 'assets');
    await page.getByRole('button', { name: 'Delete spin.wav' }).click();
    await page.getByRole('button', { name: 'Confirm delete spin.wav' }).click();
    await page.getByTestId('asset-spin.wav').waitFor({ state: 'detached' });
    await ctx.close();
  });
});
