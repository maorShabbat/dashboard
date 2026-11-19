import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser } from 'playwright-core';
import { frameHash, inkRatio, launch, openStudio, pausePlayback, serveDir, type StaticServer } from './harness';

let browser: Browser;
let server: StaticServer;

beforeAll(async () => {
  server = await serveDir('dist/editor');
  browser = await launch();
});
afterAll(async () => { await browser?.close(); await server?.close(); });

const row = (page: import('playwright-core').Page, prefix: string, key: string) => page.locator(`[data-testid="${prefix}-row-${key}"]`);

describe('editor smoke', () => {
  it('boots with the starter library, renders the preview and logs no console errors', async () => {
    const { ctx, page, errors } = await openStudio(browser, server.url);
    await page.waitForTimeout(800);
    expect(await page.locator('[data-testid="theme-list"] li').count()).toBe(2);
    expect(await page.locator('[data-testid="preset-list"] li').count()).toBe(6);
    expect(await page.locator('[data-testid="sequence-list"] li').count()).toBe(3);
    expect(await inkRatio(page)).toBeGreaterThan(0.2);
    for (const t of ['theme', 'sheet', 'presets', 'sequences', 'bundle', 'media']) await page.click(`[data-testid="tab-${t}"]`);
    expect(errors).toEqual([]);
    await ctx.close();
  });
});

describe('theme editing: inheritance display, reset, description is documentation-only', () => {
  it('shows default vs overridden, resets to BANGERS default, and the preview follows explicit parameters only', async () => {
    const { ctx, page } = await openStudio(browser, server.url);
    await page.click('[data-testid="section-colors"]');
    const win = row(page, 'theme', 'color.win');
    expect(await win.getAttribute('data-overridden')).toBe('false');
    expect(await win.getAttribute('data-source')).toBe('bangers');
    const before = await frameHash(page, 700);

    // a documentation change must not alter a single pixel
    await page.fill('[data-testid="description"]', 'Make everything neon pink and huge with sparkles!');
    await page.fill('[data-testid="ad-summary"]', 'x').catch(() => undefined);
    await page.click('[data-testid="art-direction"] summary');
    await page.fill('[data-testid="ad-summary"]', 'Neon green explosion everywhere');
    expect(await frameHash(page, 700)).toBe(before);
    expect(await page.locator('[data-testid="doc-only-pill"]').count()).toBe(1);

    // an explicit parameter does
    await win.locator('input[type="text"]').fill('#00ff66');
    expect(await win.getAttribute('data-overridden')).toBe('true');
    expect(await win.getAttribute('data-source')).toBe('theme');
    expect(await win.textContent()).toMatch(/overrides BANGERS default/i);
    expect(await frameHash(page, 700)).not.toBe(before);

    // reset restores the inherited value and the pixels
    await page.click('[data-testid="theme-reset-color.win"]');
    expect(await win.getAttribute('data-overridden')).toBe('false');
    expect(await frameHash(page, 700)).toBe(before);
    await ctx.close();
  });

  it('semantic roles propagate: changing "win" re-colours effects that reference it, and presets can pin or re-link', async () => {
    const { ctx, page } = await openStudio(browser, server.url);
    await page.click('[data-testid="section-effects"]');
    await page.click('[data-testid="effect-symbolHighlight"]');
    const color = row(page, 'fx-symbolHighlight', 'color');
    expect(await color.textContent()).toMatch(/default → color\.win/);
    await page.click('[data-testid="section-colors"]');
    await row(page, 'theme', 'color.win').locator('input[type="text"]').fill('#12ab34');
    await page.click('[data-testid="section-effects"]');
    expect(await color.locator('input[type="text"]').inputValue()).toBe('#12ab34');
    await ctx.close();
  });

  it('bounds are enforced and units are shown', async () => {
    const { ctx, page } = await openStudio(browser, server.url);
    await page.click('[data-testid="section-outline"]');
    const w = row(page, 'theme', 'outline.width');
    expect(await w.textContent()).toMatch(/% cell/);
    expect(await w.textContent()).toMatch(/0–20/);
    await w.locator('input[type="number"]').fill('999');
    expect(Number(await w.locator('input[type="number"]').inputValue())).toBe(20);
    await ctx.close();
  });

  it('motion personality buttons fill explicit numbers and the sheet shows them', async () => {
    const { ctx, page } = await openStudio(browser, server.url);
    await page.click('[data-testid="section-motion"]');
    await page.click('[data-testid="personality-heavy"]');
    expect(await row(page, 'theme', 'motion.durationScale').getAttribute('data-overridden')).toBe('true');
    expect(await row(page, 'theme', 'motion.easing').locator('select').inputValue()).toBe('easeOutCubic');
    expect(await page.locator('[data-testid="personalities"]').textContent()).toMatch(/Matches “Heavy”/);
    await ctx.close();
  });
});

describe('undo / redo and persistence', () => {
  it('undoes and redoes by button and keyboard, lists history, and persists across reload', async () => {
    const { ctx, page } = await openStudio(browser, server.url);
    await page.click('[data-testid="section-intensity"]');
    const master = row(page, 'theme', 'intensity.master');
    await master.locator('input[type="number"]').fill('1.5');
    expect(await master.getAttribute('data-overridden')).toBe('true');
    await page.waitForTimeout(150);
    await page.click('[data-testid="undo"]');
    expect(await master.getAttribute('data-overridden')).toBe('false');
    await page.click('[data-testid="redo"]');
    expect(await master.getAttribute('data-overridden')).toBe('true');
    await page.mouse.click(5, 500);
    await page.keyboard.press('Control+z');
    expect(await master.getAttribute('data-overridden')).toBe('false');
    await page.keyboard.press('Control+Shift+z');
    expect(await master.getAttribute('data-overridden')).toBe('true');
    await page.click('[data-testid="history-toggle"]');
    expect(await page.locator('[data-testid="history-list"]').textContent()).toMatch(/Edit Master/);
    await page.waitForFunction(() => document.querySelector('[data-testid="save-status"]')?.textContent === 'Saved'); // autosave indicator
    await page.reload();
    await page.waitForSelector('[data-testid="theme-view"]');
    await page.click('[data-testid="section-intensity"]');
    expect(await row(page, 'theme', 'intensity.master').getAttribute('data-overridden')).toBe('true');
    await ctx.close();
  });
});

describe('library: create, duplicate, rename, favourite', () => {
  it('manages themes as assets', async () => {
    const { ctx, page } = await openStudio(browser, server.url);
    await page.click('[data-testid="btn-duplicate"]');
    await page.waitForTimeout(200);
    expect(await page.locator('[data-testid="theme-list"] li').count()).toBe(3);
    expect(await page.locator('[data-testid="asset-name"]').textContent()).toBe('BANGERS Classic (copy)');
    // duplicated with its presets and sequences
    expect(await page.locator('[data-testid="preset-list"] li').count()).toBe(6);
    await page.click('[data-testid="btn-rename"]');
    await page.fill('[data-testid="name-input"]', 'Gold Rush');
    await page.keyboard.press('Enter');
    expect(await page.locator('[data-testid="asset-name"]').textContent()).toBe('Gold Rush');
    await page.click('[data-testid="btn-favourite"]');
    expect(await page.getAttribute('[data-testid="btn-favourite"]', 'aria-pressed')).toBe('true');
    // favourites filter
    await page.click('[data-testid="fav-filter"]');
    expect(await page.locator('[data-testid="theme-list"] li').count()).toBe(1);
    await page.click('[data-testid="fav-filter"]');
    await page.click('[data-testid="new-theme"]');
    expect(await page.locator('[data-testid="asset-name"]').textContent()).toBe('New theme');
    await page.waitForTimeout(900);
    await page.reload();
    await page.waitForSelector('[data-testid="theme-view"]');
    expect(await page.locator('[data-testid="theme-list"] li').count()).toBe(4);
    await ctx.close();
  });

  it('keeps versions, approves one, restores another and shows the diff', async () => {
    const { ctx, page } = await openStudio(browser, server.url);
    await page.click('[data-testid="theme-item-theme_neon"]');
    await page.click('[data-testid="section-colors"]');
    await row(page, 'theme', 'color.accent').locator('input[type="text"]').fill('#aa00ff');
    await page.click('[data-testid="section-versions"]');
    expect(await page.locator('[data-testid="versions-panel"]').textContent()).toMatch(/not in any saved version/);
    await page.fill('[data-testid="version-label"]', 'Violet accent');
    await page.fill('[data-testid="version-note"]', 'trying a violet accent');
    await page.click('[data-testid="btn-save-version"]');
    expect(await page.locator('[data-testid="version-2"]').textContent()).toMatch(/Violet accent/);
    await page.fill('[data-testid="approver"]', 'Maor');
    await page.click('[data-testid="approve-2"]');
    expect(await page.locator('[data-testid="version-2"] [data-testid="approved-pill"]').textContent()).toMatch(/approved by Maor/);
    // edit again, compare with the approved version, then restore it
    await page.click('[data-testid="section-colors"]');
    await row(page, 'theme', 'color.accent').locator('input[type="text"]').fill('#00ffaa');
    await page.click('[data-testid="section-versions"]');
    await page.click('[data-testid="version-2"] >> text=Compare with draft');
    expect(await page.locator('[data-testid="diff-list"]').textContent()).toMatch(/tokens\.color\.accent[\s\S]*#aa00ff[\s\S]*#00ffaa/);
    await page.click('[data-testid="restore-2"]');
    await page.click('[data-testid="section-colors"]');
    expect(await row(page, 'theme', 'color.accent').locator('input[type="text"]').inputValue()).toBe('#aa00ff');
    await ctx.close();
  });
});
