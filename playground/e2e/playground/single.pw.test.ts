import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { Browser } from 'playwright-core';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { readZip } from '../../src/core/util/zip';
import { verifyBundle } from '../../src/vfx/export/verify';
import { presetsOf } from '../../src/vfx/library';
import { OUT, ROOT, closeApps, launchGl, openApp, openPreset, serveStatic, settleApp, tab, type Served } from './harness';

let browser: Browser, srv: Served;
const SINGLE = join(ROOT, 'dist/playground-single');
beforeAll(async () => {
  execFileSync('node', ['scripts/build-playground-single.mjs'], { cwd: ROOT, stdio: 'ignore' });
  srv = await serveStatic(SINGLE, 'index.html'); browser = await launchGl();
});
afterAll(async () => { await browser?.close(); await srv?.close(); });
afterEach(async () => { await closeApps(); });

const TEXT = presetsOf('text-styling')[0]!.id;

describe('single-file build', () => {
  it('is one file under the artifact size limit', () => {
    expect(statSync(join(SINGLE, 'index.html')).size).toBeLessThan(15 * 1024 * 1024);
    expect(statSync(join(SINGLE, 'artifact.html')).size).toBeLessThan(15 * 1024 * 1024);
  });

  it('runs with no other file: no request but the page itself, real fonts from the embedded pack, a verified bundle export', async () => {
    const requests: string[] = [];
    const app = await openApp(browser, srv.url);
    app.page.on('request', (r) => { if (!/^(data|blob):/.test(r.url())) requests.push(r.url()); });
    await app.page.reload();
    await app.page.evaluate(() => (window as unknown as { vfxReady: Promise<void> }).vfxReady);
    await openPreset(app.page, TEXT);
    await tab(app.page, 'look');
    await app.page.getByTestId('font-open').click();
    await app.page.waitForFunction(() => document.querySelectorAll('[data-testid^="font-row-"] .sm:not(.ph):not(.er)').length >= 4);
    const fam = await app.page.evaluate(() => getComputedStyle(document.querySelector('[data-testid^="font-row-"] .sm:not(.ph):not(.er)')!).fontFamily);
    expect(fam).toMatch(/vfx-/);
    await app.page.getByTestId('font-close').click();
    await settleApp(app.page);
    expect(requests.filter((u) => u !== srv.url && u !== `${srv.origin}/` && !u.endsWith('/index.html'))).toEqual([]);

    // export a bundle from the single file: licences and fonts come from the embedded pack
    await app.page.getByTestId('tab-content').click();
    await app.page.locator('[data-testid^="input-"]').first().fill('SINGLE FILE');
    await tab(app.page, 'export');
    const [dl] = await Promise.all([app.page.waitForEvent('download', { timeout: 60000 }), app.page.getByTestId('export-bundle').click()]);
    const zip = join(OUT, `single-${Date.now()}.zip`);
    await dl.saveAs(zip);
    const entries = await readZip(new Uint8Array(readFileSync(zip)));
    const report = verifyBundle(entries);
    expect(report.problems).toEqual([]);
    expect(entries.some((e) => /\/fonts\/[^/]+\/LICENSE\.txt$/.test(e.path))).toBe(true);
    expect(app.errors).toEqual([]);
  });

  it('also opens straight from disk (file://)', async () => {
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 850 } });
    const page = await ctx.newPage();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(`file://${join(SINGLE, 'index.html')}`);
    await page.evaluate(() => (window as unknown as { vfxReady: Promise<void> }).vfxReady);
    await page.getByTestId('cat-text-styling').click();
    await page.getByTestId(`card-${TEXT}`).click();
    await page.getByTestId('stage-canvas').waitFor();
    await page.waitForFunction(() => !!window.__vfx);
    await page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
    await page.evaluate(() => window.__vfx!.controller.whenIdle());
    expect(await page.getByTestId('msg-error').count()).toBe(0);
    expect(await page.evaluate(() => { const v = window.__vfx!; v.controller.pause(); v.seek(v.duration() * 0.5); return v.hash().then((h) => h.length); })).toBe(64);
    expect(errors).toEqual([]);
    await ctx.close();
  });
});
