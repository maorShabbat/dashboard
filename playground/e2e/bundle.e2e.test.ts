import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser, Page } from 'playwright-core';
import { createZip, readZip } from '../src/core/util/zip';
import { fromUtf8, sha256Hex, utf8 } from '../src/core/util/sha256';
import { extractEntries } from '../src/cli/nodeEnv';
import { inkRatio, launch, openStudio, serveDir, type StaticServer } from './harness';

let browser: Browser;
let server: StaticServer;
const tmp = mkdtempSync(join(tmpdir(), 'bangers-e2e-'));
beforeAll(async () => { server = await serveDir('dist/editor'); browser = await launch(); });
afterAll(async () => { await browser?.close(); await server?.close(); });

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const WAV = (() => { const b = Buffer.alloc(52); b.write('RIFF', 0); b.writeUInt32LE(44, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(8000, 24); b.writeUInt32LE(16000, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(8, 40); return b; })();

async function buildBundle(page: Page): Promise<void> {
  await page.click('[data-testid="tab-bundle"]');
  await page.click('[data-testid="export-build"]');
  await page.waitForSelector('[data-testid="export-result"]', { timeout: 60000 });
}

async function download(page: Page, name: string): Promise<string> {
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-testid="export-download"]')]);
  const dest = join(tmp, name);
  copyFileSync(await dl.path(), dest);
  return dest;
}

function cli(args: string[]) {
  return spawnSync(process.execPath, ['dist/cli/bangers.mjs', ...args], { encoding: 'utf8' });
}

describe('bundle export in the UI, verified by the UI, the CLI and the shipped examples', () => {
  let zipPath = '';

  it('builds an approved bundle, verifies it in the browser (import + replay) and downloads it', async () => {
    const { ctx, page, errors } = await openStudio(browser, server.url);
    await buildBundle(page);
    const overall = page.locator('[data-testid="export-verify"] [data-testid="verify-overall"]');
    expect(await overall.getAttribute('data-ok')).toBe('true');
    for (const id of ['archive', 'versions', 'files', 'structure', 'licenses', 'fonts', 'assets', 'config', 'import', 'replay-core', 'replay-runtime', 'examples', 'approval']) {
      expect(await page.locator(`[data-testid="export-verify"] [data-testid="verify-check-${id}"]`).getAttribute('data-status'), id).toBe('pass');
    }
    const summary = await page.locator('[data-testid="export-result"]').textContent();
    expect(summary).toMatch(/bundle layout v1 · data schema v1 · studio 0\.1\.0 · runtime 0\.1\.0/i);
    expect(summary).toMatch(/theme from approved \(approved Initial\)/);
    zipPath = await download(page, 'classic.bangers-bundle.zip');
    expect(errors).toEqual([]);
    await ctx.close();
  });

  it('the CLI verifies the downloaded file and runs its Node example', () => {
    const r = cli(['verify', zipPath, '--run-examples']);
    expect(r.stdout).toMatch(/Bundle verified\./);
    expect(r.stdout).toMatch(/REPLAY OK: 21 fingerprints match/);
    expect(r.status).toBe(0);
  });

  it('the shipped web example works in a browser: fonts, canvas, self-verification, cues and events', async () => {
    const dir = mkdtempSync(join(tmp, 'ex-'));
    extractEntries(await readZip(new Uint8Array(readFileSync(zipPath))), dir);
    const ex = await serveDir(dir);
    try {
      const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 } });
      const page = await ctx.newPage();
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
      await page.goto(`${ex.url}examples/web/index.html`);
      await page.waitForFunction(() => (window as unknown as { __bangers?: { ready: boolean } }).__bangers?.ready === true, null, { timeout: 30000 });
      const verify = await page.evaluate(() => (window as unknown as { __bangers: { verify: { ok: boolean; compared: number } } }).__bangers.verify);
      expect(verify).toMatchObject({ ok: true, compared: 21 });
      expect(await page.locator('#verify').textContent()).toMatch(/replay verified \(21 fingerprints\)/);
      expect(await page.evaluate(() => [...document.fonts].some((f) => f.family === 'Bangers' && f.status === 'loaded'))).toBe(true);
      await page.click('#replay');
      await page.waitForFunction(() => document.getElementById('log')!.textContent!.includes('celebration.start'), null, { timeout: 15000 });
      await page.waitForTimeout(1200);
      const canvas = page.locator('#stage');
      const ink = await canvas.evaluate((c: HTMLCanvasElement) => { const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i + 3]! > 10 && (d[i]! > 12 || d[i + 1]! > 12 || d[i + 2]! > 12)) n++; return n / (d.length / 4); });
      expect(ink).toBeGreaterThan(0.2);
      const log = await page.locator('#log').textContent();
      expect(log).toMatch(/cue\s+shake\.impact/);
      expect(log).toMatch(/event\s+celebration\.start/);
      // switching sequence works
      await page.selectOption('#seq', { label: 'Cascade win' });
      await page.waitForTimeout(500);
      expect(await page.locator('#log').textContent()).not.toMatch(/celebration\.start/);
      expect(errors).toEqual([]);

      // DOM/CSS example is styled from config/theme.css
      await page.goto(`${ex.url}examples/dom-css/index.html`);
      await page.waitForFunction(() => [...document.fonts].some((f) => f.family === 'Bangers' && f.status === 'loaded'), null, { timeout: 15000 });
      const css = await page.evaluate(() => { const h = getComputedStyle(document.querySelector('h1')!); return { family: h.fontFamily, color: h.color, bg: getComputedStyle(document.body).backgroundColor }; });
      expect(css.family).toMatch(/Bangers/);
      expect(css.color).toBe('rgb(255, 225, 77)');
      expect(css.bg).toBe('rgb(20, 11, 46)');
      await ctx.close();
    } finally { await ex.close(); }
  });

  it('imports the downloaded bundle into a different library after verifying it', async () => {
    const { ctx, page } = await openStudio(browser, server.url);
    await page.click('[data-testid="tab-bundle"]');
    await page.setInputFiles('[data-testid="import-bundle-input"]', zipPath);
    await page.waitForSelector('[data-testid="import-result"]', { timeout: 60000 });
    expect(await page.locator('[data-testid="import-verify"] [data-testid="verify-overall"]').getAttribute('data-ok')).toBe('true');
    await page.click('[data-testid="import-confirm"]');
    await page.waitForSelector('[data-testid="theme-view"]');
    expect(await page.locator('[data-testid="theme-list"] li').count()).toBe(3);
    expect(await page.locator('[data-testid="asset-name"]').textContent()).toBe('BANGERS Classic (imported)');
    expect(await page.locator('[data-testid="theme-header"]').textContent()).toMatch(/✓/); // approval travelled with the bundle
    expect(await page.locator('[data-testid="preset-list"] li').count()).toBeGreaterThanOrEqual(6);
    // and it replays: open an imported sequence
    await page.click('[data-testid="tab-sequences"]');
    expect(await page.locator('[data-testid="sequence-list"] li').count()).toBe(3);
    await page.waitForTimeout(500);
    expect(await inkRatio(page)).toBeGreaterThan(0.2);
    await ctx.close();
  });

  it('refuses a tampered bundle: failed checks are listed and import is disabled', async () => {
    const entries = await readZip(new Uint8Array(readFileSync(zipPath)));
    const lib = entries.find((e) => e.path === 'config/library.json')!;
    const tampered = fromUtf8(lib.data).replace('"effectType"', '"effectTypo"');
    expect(tampered).not.toBe(fromUtf8(lib.data)); // the edit really changed something
    const bad = entries.map((e) => (e === lib ? { path: e.path, data: utf8(tampered) } : e));
    const badPath = join(tmp, 'tampered.zip');
    writeFileSync(badPath, createZip(bad));
    const { ctx, page } = await openStudio(browser, server.url);
    await page.click('[data-testid="tab-bundle"]');
    await page.setInputFiles('[data-testid="import-bundle-input"]', badPath);
    await page.waitForSelector('[data-testid="import-result"]');
    expect(await page.locator('[data-testid="import-verify"] [data-testid="verify-overall"]').getAttribute('data-ok')).toBe('false');
    expect(await page.locator('[data-testid="import-verify"] [data-testid="verify-check-files"]').getAttribute('data-status')).toBe('fail');
    expect(await page.locator('[data-testid="import-verify"] [data-testid="verify-check-files"]').textContent()).toMatch(/config\/library\.json: checksum mismatch/);
    expect(await page.locator('[data-testid="import-confirm"]').isDisabled()).toBe(true);
    const r = cli(['verify', badPath]);
    expect(r.status).toBe(1);
    expect(r.stdout).toMatch(/Bundle FAILED verification/);
    await ctx.close();
  });
});

describe('licences: only permitted fonts and assets are packaged', () => {
  it('bundles a redistributable sprite and font, omits a restricted font and audio, and says so', async () => {
    const { ctx, page } = await openStudio(browser, server.url);
    await page.click('[data-testid="tab-media"]');

    // 1. CC0 sprite
    await page.setInputFiles('[data-testid="media-file"]', { name: 'gem.png', mimeType: 'image/png', buffer: PNG });
    await page.selectOption('[data-testid="new-license-preset"]', 'CC0-1.0');
    await page.fill('[data-testid="new-holder"]', 'Example Artist');
    await page.click('[data-testid="media-add"]');
    await page.waitForSelector('[data-testid^="media-m_"]');

    // 2. restricted audio (not declared → not redistributable)
    await page.click('[data-testid="media-kind-audio"]');
    await page.setInputFiles('[data-testid="media-file"]', { name: 'sting.wav', mimeType: 'audio/wav', buffer: WAV });
    await page.click('[data-testid="media-add"]');
    await page.waitForFunction(() => document.querySelectorAll('[data-testid^="media-m_"]').length === 2);

    // 3. a permitted font and a restricted one (real font bytes, different declarations)
    const font = readFileSync('assets/fonts/anton/anton-latin-400-normal.woff2');
    await page.click('[data-testid="media-kind-font"]');
    await page.setInputFiles('[data-testid="media-file"]', { name: 'FreeSans.woff2', mimeType: 'font/woff2', buffer: font });
    await page.fill('[data-testid="media-family"]', 'FreeSans Test');
    await page.selectOption('[data-testid="new-license-preset"]', 'OFL-1.1');
    await page.click('[data-testid="media-add"]');
    await page.waitForFunction(() => document.querySelector('[data-testid="font-list"]')!.textContent!.includes('FreeSans Test'));
    await page.setInputFiles('[data-testid="media-file"]', { name: 'Paid.woff2', mimeType: 'font/woff2', buffer: Buffer.concat([font, Buffer.from([0])]) });
    await page.fill('[data-testid="media-family"]', 'Paid Sans');
    expect(await page.locator('[data-testid="new-license-preset"]').inputValue()).toBe('unknown'); // nothing is inherited from the previous upload
    await page.selectOption('[data-testid="new-license-preset"]', 'proprietary');
    await page.click('[data-testid="media-add"]');
    await page.waitForFunction(() => document.querySelector('[data-testid="font-list"]')!.textContent!.includes('Paid Sans'));
    expect(await page.locator('[data-testid="font-list"]').textContent()).toMatch(/referenced by name only/);

    // use them in the theme
    await page.click('[data-testid="tab-theme"]');
    await page.click('[data-testid="section-assets"]');
    const sprite = (await page.locator('[data-testid="theme-row-asset.particle"] select option').allTextContents()).findIndex((t) => t.includes('gem.png'));
    expect(sprite).toBeGreaterThan(0);
    await page.locator('[data-testid="theme-row-asset.particle"] select').selectOption({ label: (await page.locator('[data-testid="theme-row-asset.particle"] select option').allTextContents())[sprite]! });
    await page.click('[data-testid="section-sound"]');
    await page.click('[data-testid="theme-panel"] details:has-text("Win · big") summary');
    const opts = await page.locator('[data-testid="theme-row-cue.win.big.asset"] select option').allTextContents();
    await page.locator('[data-testid="theme-row-cue.win.big.asset"] select').selectOption({ label: opts.find((o) => o.includes('sting.wav'))! });
    await page.click('[data-testid="section-typography"]');
    await page.locator('[data-testid="theme-row-type.headline.family"] select').selectOption({ label: 'FreeSans Test' });
    await page.locator('[data-testid="theme-row-type.label.family"] select').selectOption({ label: 'Paid Sans (not bundled)' });

    // approve so the approved export contains the new references, then export
    await page.click('[data-testid="section-versions"]');
    await page.click('[data-testid="btn-save-version"]');
    await page.click('[data-testid="approve-2"]');
    await buildBundle(page);
    expect(await page.locator('[data-testid="export-verify"] [data-testid="verify-overall"]').getAttribute('data-ok')).toBe('true');
    const omitted = await page.locator('[data-testid="export-omitted"]').textContent();
    expect(omitted).toMatch(/asset sting\.wav/);
    expect(omitted).toMatch(/font Paid Sans[\s\S]*does not permit embedding or redistribution/);
    expect(omitted).not.toMatch(/FreeSans/);
    expect(await page.locator('[data-testid="export-verify"] [data-testid="verify-check-fonts"]').getAttribute('data-status')).toBe('warn'); // visible, not hidden
    expect(await page.locator('[data-testid="export-verify"] [data-testid="verify-check-licenses"]').textContent()).toMatch(/4 font\(s\)|5 font\(s\)/);
    const zip = await download(page, 'licensed.bangers-bundle.zip');
    const entries = await readZip(new Uint8Array(readFileSync(zip)));
    const paths = entries.map((e) => e.path);
    expect(paths.some((p) => p.startsWith('fonts/font-freesans-test/'))).toBe(true);
    expect(paths.some((p) => /paid/i.test(p))).toBe(false);
    expect(paths.some((p) => p.endsWith('.wav'))).toBe(false);
    expect(paths.some((p) => p.startsWith('assets/gem-') && p.endsWith('.png'))).toBe(true);
    const manifest = JSON.parse(fromUtf8(entries.find((e) => e.path === 'manifest.json')!.data));
    expect(manifest.licenses.some((l: { id: string; holder?: string }) => l.id === 'CC0-1.0' && l.holder === 'Example Artist')).toBe(true);
    expect(fromUtf8(entries.find((e) => e.path === 'LICENSES.md')!.data)).toMatch(/Not included[\s\S]*Paid Sans/);
    const r = cli(['verify', zip, '--run-examples']);
    expect(r.status).toBe(0);
    expect(sha256Hex(PNG)).toBe(manifest.media.find((m: { name: string }) => m.name === 'gem.png').sha256);
    await ctx.close();
  });

  it('rejects mislabelled and unsafe uploads', async () => {
    const { ctx, page } = await openStudio(browser, server.url);
    await page.click('[data-testid="tab-media"]');
    await page.setInputFiles('[data-testid="media-file"]', { name: 'fake.png', mimeType: 'image/png', buffer: Buffer.from('not really a png') });
    await page.click('[data-testid="media-add"]');
    await page.waitForSelector('.toast.error');
    expect(await page.locator('.toast.error').first().textContent()).toMatch(/does not match its type/);
    await page.setInputFiles('[data-testid="media-file"]', { name: 'evil.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>') });
    await page.click('[data-testid="media-add"]');
    await page.waitForFunction(() => [...document.querySelectorAll('.toast.error')].some((t) => /active content/.test(t.textContent ?? '')));
    expect(await page.locator('[data-testid="media-list"] li.media-card').count()).toBe(0);
    await ctx.close();
  });
});

describe('theme files and the preview sheet', () => {
  it('round-trips a theme through a .bangers-theme.json file', async () => {
    const { ctx, page } = await openStudio(browser, server.url);
    await page.click('[data-testid="tab-bundle"]');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-testid="export-theme-file"]')]);
    const file = join(tmp, 'classic.bangers-theme.json');
    copyFileSync(await dl.path(), file);
    const pkg = JSON.parse(readFileSync(file, 'utf8'));
    expect(pkg).toMatchObject({ format: 'bangers.theme', schemaVersion: 1, packageVersion: '0.1.0' });
    expect(pkg.presets.length).toBe(6);
    await page.setInputFiles('[data-testid="import-theme-input"]', file);
    await page.waitForSelector('[data-testid="theme-view"]');
    await page.waitForFunction(() => document.querySelectorAll('[data-testid="theme-list"] li').length === 3);
    expect(await page.locator('[data-testid="asset-name"]').textContent()).toBe('BANGERS Classic (imported)');
    await ctx.close();
  });

  it('the preview sheet shows colours, contrast, type, all 12 effects and board-aware sizing', async () => {
    const { ctx, page, errors } = await openStudio(browser, server.url);
    await page.click('[data-testid="tab-sheet"]');
    await page.waitForSelector('[data-testid="sheet-view"]');
    await page.waitForTimeout(1200);
    expect(await page.locator('[data-testid^="swatch-color."]').count()).toBe(17);
    expect(await page.locator('[data-testid="contrast"] .c-item').count()).toBe(6);
    expect(await page.locator('[data-testid^="specimen-"]').count()).toBe(5);
    expect(await page.locator('[data-testid^="gallery-"] canvas').count()).toBe(12);
    const cells = await page.locator('[data-testid^="vp-"] figcaption').allTextContents();
    expect(cells.length).toBe(4);
    const px = cells.map((c) => Number(c.match(/cell (\d+) px/)![1]));
    expect(new Set(px).size).toBeGreaterThanOrEqual(3); // different viewports → different cell sizes
    const boards = (await page.locator('[data-testid^="board-"] figcaption').allTextContents()).map((c) => Number(c.match(/cell (\d+) px/)![1]));
    expect(boards[0]).toBeGreaterThan(boards[2]!); // 3×3 cells are bigger than 7×7 cells
    expect(await page.locator('[data-testid="sheet-art"]').textContent()).toMatch(/documentation only/);
    // gallery canvases actually draw something
    const ink = await page.locator('[data-testid="gallery-bigWinBanner"] canvas').evaluate((c: HTMLCanvasElement) => { const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i + 3]! > 10 && d[i]! > 12) n++; return n; });
    expect(ink).toBeGreaterThan(1000);
    // regression: thumbnails show the WHOLE board (the frame colour must reach the right and bottom edges)
    const edges = await page.locator('[data-testid="gallery-winLine"] canvas').evaluate((c: HTMLCanvasElement) => {
      const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
      const pink = (i: number) => d[i]! > 200 && d[i + 1]! < 110 && d[i + 2]! > 80 && d[i + 2]! < 160; // theme primary #ff3d6e (frame)
      let right = 0, bottom = 0;
      for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) { const i = (y * c.width + x) * 4; if (pink(i)) { if (x > c.width * 0.65) right++; if (y > c.height * 0.65) bottom++; } }
      return { right, bottom };
    });
    expect(edges.right).toBeGreaterThan(20);
    expect(edges.bottom).toBeGreaterThan(20);
    // approved view toggles
    await page.click('[data-testid="sheet-view"] >> text=Approved');
    expect(await page.locator('[data-testid="sheet-title"]').textContent()).toMatch(/preview sheet/);
    expect(errors).toEqual([]);
    await ctx.close();
  });
});

void execFileSync;
