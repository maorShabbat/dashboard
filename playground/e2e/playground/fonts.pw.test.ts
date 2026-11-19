import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { Browser, Page } from 'playwright-core';
import { join } from 'node:path';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { FONT_CATEGORIES, FONT_FAMILIES, searchFonts } from '../../src/vfx/fonts/catalog';
import { builtinPresets, presetsOf } from '../../src/vfx/library';
import { sceneFonts } from '../../src/vfx/model/scene';
import { ROOT, closeApps, hashAt, launchGl, openApp, openPreset, serveStatic, settleApp, setNum, tab, writeOut, type App, type Served } from './harness';

let browser: Browser, srv: Served;
beforeAll(async () => { srv = await serveStatic(join(ROOT, 'dist/playground'), 'playground.html'); browser = await launchGl(); });
afterAll(async () => { await browser?.close(); await srv?.close(); });
afterEach(async () => { await closeApps(); });

const firstText = presetsOf('text-styling')[0]!.id;
const total = searchFonts().length;

const docFont = (page: Page, elementIndex = 0) => page.evaluate((i) => {
  const els = (window as unknown as { __vfxApp: { store: { doc: { scene: { elements: { kind: string; style?: { font: unknown } }[] } } } } }).__vfxApp.store.doc.scene.elements.filter((e) => e.kind === 'text' || e.kind === 'counter');
  return els[i]!.style!.font as { id: string; weight: number; style: string };
}, elementIndex);

async function openBrowser(page: Page): Promise<void> {
  await tab(page, 'look');
  await page.getByTestId('font-open').click();
  await page.getByTestId('font-browser').waitFor();
}
const headerCount = async (page: Page): Promise<number> => Number(/^(\d+) of/.exec(await page.locator('[role=dialog] header .hint').innerText())![1]);

describe('font catalogue', () => {
  it('has at least 100 distinct commercially usable families, each with a recorded licence and source', () => {
    expect(total).toBeGreaterThanOrEqual(100);
    expect(new Set(FONT_FAMILIES.map((f) => f.family.toLowerCase())).size).toBe(total);
    expect(FONT_CATEGORIES).toHaveLength(10);
    for (const c of FONT_CATEGORIES) expect(FONT_FAMILIES.filter((f) => f.category === c.id).length, c.id).toBeGreaterThanOrEqual(10);
    for (const f of FONT_FAMILIES) {
      expect(f.redistributionPermitted, f.id).toBe(true);
      expect(['OFL-1.1', 'Apache-2.0']).toContain(f.licenseId);
      expect(f.sourceUrl, f.id).toMatch(/^https:\/\//);
      expect(f.dateChecked, f.id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(f.files.length, f.id).toBe(f.weights.length * f.styles.length);
    }
  });
});

describe('font browser', () => {
  it('lists every family virtualised, loads fonts only near the viewport and renders each in its own face', async () => {
    const app = await openApp(browser, srv.url);
    const { page } = app;
    const reqs: string[] = [];
    page.on('request', (r) => { if (r.url().endsWith('.woff2')) reqs.push(r.url()); });
    await openPreset(page, firstText);
    const before = reqs.length;
    await openBrowser(page);
    expect(await headerCount(page)).toBe(total);
    await page.waitForFunction(() => document.querySelectorAll('[data-testid^="font-row-"] .sm:not(.ph):not(.er)').length >= 4);
    const rows = await page.locator('[data-testid^="font-row-"]').count();
    expect(rows).toBeGreaterThan(4);
    expect(rows, 'virtualised: far fewer rows than families').toBeLessThan(30);
    const during = reqs.slice(before);
    expect(during.length).toBeLessThan(40);
    expect(new Set(during).size, 'requests are de-duplicated').toBe(during.length);

    // each loaded row is drawn in its own internal family, which really is a loaded FontFace
    const probe = await page.evaluate(() => [...document.querySelectorAll('[data-testid^="font-row-"] .sm:not(.ph):not(.er)')].slice(0, 6).map((el) => {
      const fam = getComputedStyle(el).fontFamily.replace(/"/g, '');
      return { fam, loaded: [...document.fonts].some((f) => f.family.replace(/"/g, '') === fam && f.status === 'loaded') };
    }));
    expect(probe.length).toBeGreaterThan(3);
    expect(new Set(probe.map((p) => p.fam)).size, 'rows use different families').toBe(probe.length);
    for (const p of probe) { expect(p.fam).toMatch(/^vfx-/); expect(p.loaded).toBe(true); }

    // scrolling to the end loads other files and removes the earlier rows
    const last = searchFonts().at(-1)!;
    await page.getByTestId('font-scroll').evaluate((el) => { el.scrollTop = el.scrollHeight; });
    await page.getByTestId(`font-row-${last.id}`).waitFor();
    await page.waitForFunction((id) => !!document.querySelector(`[data-testid="font-row-${id}"] .sm:not(.ph):not(.er)`), last.id);
    expect(reqs.length - before).toBeGreaterThan(during.length);
    expect(await page.locator('[data-testid^="font-row-"]').count()).toBeLessThan(30);
    expect(reqs.length - before, 'never anywhere near all files').toBeLessThan(130);
    expect(app.errors).toEqual([]);
    await app.ctx.close();
  });

  it('filters by category, searches, favourites and shows the preview in the person\'s text', async () => {
    const app = await openApp(browser, srv.url);
    const { page } = app;
    await openPreset(page, firstText);
    const text = await page.evaluate(() => (window as unknown as { __vfxApp: { store: { doc: { scene: { elements: { kind: string; text?: string }[] } } } } }).__vfxApp.store.doc.scene.elements.find((e) => e.kind === 'text')!.text!);
    await openBrowser(page);
    for (const c of FONT_CATEGORIES) {
      await page.getByTestId(`fontcat-${c.id}`).click();
      expect(await headerCount(page), c.id).toBe(FONT_FAMILIES.filter((f) => f.category === c.id).length);
    }
    await page.getByTestId('fontcat-all').click();
    await page.getByTestId('font-search').fill('slab');
    const slab = await headerCount(page);
    expect(slab).toBe(searchFonts({ text: 'slab' }).length);
    expect(slab).toBeGreaterThan(0);
    expect(slab).toBeLessThan(total);
    await page.getByTestId('font-search').fill('qqqqzzzz');
    expect(await headerCount(page)).toBe(0);
    await page.getByTestId('font-search').fill('');

    // favourite one family; the favourites filter shows exactly it
    const rowId = (await page.locator('[data-testid^="font-row-"]').nth(2).getAttribute('data-testid'))!.slice(9);
    await page.getByTestId(`font-row-${rowId}`).locator('button.fav').click();
    await page.getByTestId('fontcat-fav').click();
    expect(await headerCount(page)).toBe(1);
    // preview shows the person's own text in that family once loaded
    await page.getByTestId('fontcat-all').click();
    await page.getByTestId(`font-row-${rowId}`).click();
    await page.waitForFunction(() => /vfx-/.test(getComputedStyle(document.querySelector('[data-testid="font-preview"] > div')!).fontFamily));
    expect((await page.getByTestId('font-preview').innerText()).replace(/\s+/g, ' ').trim()).toBe(text.replace(/\s+/g, ' ').trim());
    expect(await page.getByTestId('font-licence').innerText()).toMatch(/OFL-1\.1|Apache-2\.0/);
    expect(await page.getByTestId('font-licence').innerText()).toMatch(/fonts\.google\.com/);
    await app.ctx.close();
  });

  it('chooses weight and style within one family and changes size and spacing', async () => {
    const app = await openApp(browser, srv.url);
    const { page } = app;
    const nunito: string[] = [];
    page.on('request', (r) => { if (/nunito-latin-.*\.woff2/.test(r.url())) nunito.push(r.url()); });
    await openPreset(page, firstText);
    const h0 = await hashAt(page, 0.8 * (await page.evaluate(() => window.__vfx!.duration())));
    await openBrowser(page);
    await page.getByTestId('font-search').fill('Nunito');
    await page.getByTestId('font-row-nunito').click();
    await page.getByTestId('font-weight-700').click();
    await page.getByTestId('font-style-italic').click();
    await page.waitForFunction(() => !document.querySelector('[data-testid="font-use"]')!.hasAttribute('disabled'));
    await setNum(page, 'font-size', 0.2);
    await setNum(page, 'font-letter', 0.1);
    await setNum(page, 'font-line', 1.3);
    await page.getByTestId('font-use').click();
    await page.getByTestId('font-browser').waitFor({ state: 'detached' });
    expect(await docFont(page)).toEqual({ id: 'nunito', weight: 700, style: 'italic' });
    const t = await page.evaluate(() => (window as unknown as { __vfxApp: { store: { doc: { scene: { elements: { kind: string; size: number; style: { letterSpacing: number; lineSpacing: number } }[] } } } } }).__vfxApp.store.doc.scene.elements.find((e) => e.kind === 'text')!);
    expect([t.size, t.style.letterSpacing, t.style.lineSpacing]).toEqual([0.2, 0.1, 1.3]);
    await settleApp(page);
    const D = await page.evaluate(() => window.__vfx!.duration());
    expect(await hashAt(page, 0.8 * D)).not.toBe(h0);
    // only the weights that were looked at are fetched: the italic regular was never chosen, so its file is never requested
    expect(nunito.some((u) => /nunito-latin-700-italic/.test(u))).toBe(true);
    expect(nunito.some((u) => /nunito-latin-400-italic/.test(u))).toBe(false);
    await app.ctx.close();
  });

  it('shows a loading failure with a Retry — never a silent fallback — and recovers', async () => {
    const app = await openApp(browser, srv.url);
    const { page } = app;
    await openPreset(page, firstText);
    // a family no built-in preset uses, so nothing (not even a library thumbnail) has loaded it yet
    const used = new Set(builtinPresets().flatMap((p) => sceneFonts(p.scene).map((f) => f.id)));
    const victim = FONT_FAMILIES.find((f) => !used.has(f.id) && f.files.length === 1)!;
    const pattern = `**/${victim.files[0]!.file.replace(/\.woff2$/, '')}-*.woff2`;
    await page.route(pattern, (r) => r.abort());
    await openBrowser(page);
    await page.getByTestId('font-search').fill(victim.family);
    const row = page.getByTestId(`font-row-${victim.id}`);
    await row.locator('.sm.er').waitFor({ timeout: 60000 });
    expect(await row.innerText()).toMatch(/Could not load/);
    await row.click();
    await page.getByTestId('font-preview').getByText(/could not be loaded/).waitFor();
    expect(await page.getByTestId('font-use').isDisabled(), 'cannot choose a font that did not load').toBe(true);
    await page.getByTestId('font-close').click();

    // a scene that already uses it reports the failure on the stage instead of drawing another font
    await page.evaluate((id) => { const s = (window as unknown as { __vfxApp: { store: { edit(f: (s: { elements: { kind: string; style?: { font: { id: string } } }[] }) => void): void } } }).__vfxApp.store; s.edit((sc) => { sc.elements.find((e) => e.kind === 'text')!.style!.font.id = id; }); }, victim.id);
    await page.getByTestId('msg-error').first().waitFor();
    expect(await page.getByTestId('msg-error').first().innerText()).toMatch(/font/i);
    expect(await page.getByTestId('msg-error').first().innerText()).toContain(victim.family);

    await page.unroute(pattern);
    await page.getByTestId('msg-error').first().getByRole('button', { name: 'Retry' }).click();
    await page.waitForFunction(() => document.querySelectorAll('[data-testid="msg-error"]').length === 0, null, { timeout: 15000 });
    await settleApp(page);
    expect(await page.evaluate(() => window.__vfx!.coverage())).toBeGreaterThan(0);
    await app.ctx.close();
  });

  it('uploads a custom font only with the licence statement, keeps it, and rejects invalid files visibly', async () => {
    const app = await openApp(browser, srv.url);
    const { page } = app;
    await openPreset(page, firstText);
    await openBrowser(page);
    await page.locator('summary', { hasText: 'Upload your own font' }).click();
    expect(await page.getByTestId('font-disclaimer').innerText()).toMatch(/responsible.*licen[cs]e/i);
    expect(await page.getByTestId('font-file').isDisabled(), 'locked until the statement is ticked').toBe(true);
    await page.getByTestId('font-licence-ok').check();
    expect(await page.getByTestId('font-file').isDisabled()).toBe(false);

    const bad = writeOut('bad-font.woff2', 'this is not a font');
    await page.getByTestId('font-file').setInputFiles(bad);
    await page.getByTestId('font-upload-error').waitFor();
    expect((await page.getByTestId('font-upload-error').innerText()).length).toBeGreaterThan(10);

    const dir = join(ROOT, 'assets/fonts/catalog', FONT_FAMILIES[3]!.id);
    const woff = readdirSync(dir).find((f) => f.endsWith('.woff2'))!;
    const mine = join(ROOT, 'playground-out/e2e', 'MyStudioFont.woff2');
    writeFileSync(mine, readFileSync(join(dir, woff)));
    await page.getByTestId('font-file').setInputFiles(mine);
    await page.getByTestId('font-upload-error').waitFor({ state: 'detached' });
    await page.getByTestId('fontcat-custom').click();
    expect(await headerCount(page)).toBe(1);
    await page.waitForFunction(() => document.querySelector('[data-testid^="font-row-custom"] .sm:not(.ph)') !== null || document.querySelector('[data-testid^="font-row-"] .sm:not(.ph)') !== null);
    expect(await page.locator('[data-testid^="font-row-"]').first().innerText()).toMatch(/MyStudioFont/);
    expect(await page.locator('.disclaimer').first().innerText()).toMatch(/responsible/i);
    await page.getByTestId('font-use').click();
    const f = await docFont(page);
    expect(f.id).toMatch(/^custom/i);
    await settleApp(page);
    const D = await page.evaluate(() => window.__vfx!.duration());
    expect(await page.evaluate((t) => { const v = window.__vfx!; v.seek(t); return v.coverage(); }, 0.8 * D)).toBeGreaterThan(0);

    // survives a reload (kept in this browser), listed in the licence panel as the user's responsibility
    await tab(page, 'export');
    expect(await page.getByTestId('licences').innerText()).toMatch(/responsible.*licen[cs]e/i);
    await app.page.evaluate(() => (window as unknown as { __vfxApp: { store: { saveAsNew(n?: string): unknown } } }).__vfxApp.store.saveAsNew('Custom font preset'));
    const page2 = await app.ctx.newPage();
    await page2.goto(srv.url);
    await page2.evaluate(() => (window as unknown as { vfxReady: Promise<void> }).vfxReady);
    await page2.getByTestId('nav-mine').click();
    await page2.locator('[data-testid^="card-user."]').first().click();
    await page2.getByTestId('stage-canvas').waitFor();
    await page2.evaluate(() => window.__vfx!.controller.whenIdle());
    expect(await page2.getByTestId('msg-error').count(), 'custom font restored, no error').toBe(0);
    await app.ctx.close();
  });

  it('keeps independent fonts for the title, the amount and the subtitle of a message', async () => {
    const app = await openApp(browser, srv.url);
    const { page } = app;
    const multi = presetsOf('messages').find((p) => p.scene.elements.filter((e) => e.kind === 'text' || e.kind === 'counter').length >= 2)!;
    await openPreset(page, multi.id);
    const kinds = await page.evaluate(() => (window as unknown as { __vfxApp: { store: { doc: { scene: { elements: { id: string; kind: string }[] } } } } }).__vfxApp.store.doc.scene.elements.filter((e) => e.kind === 'text' || e.kind === 'counter').map((e) => e.id));
    expect(kinds.length).toBeGreaterThanOrEqual(2);
    const chosen = ['western', 'scifi', 'elegant'].map((c) => FONT_FAMILIES.find((f) => f.category === c)!.id);
    for (let i = 0; i < Math.min(kinds.length, 3); i++) {
      await tab(page, 'content');
      await page.getByTestId(`element-${kinds[i]}`).locator('b').click();
      await openBrowser(page);
      await page.getByTestId('font-search').fill(FONT_FAMILIES.find((f) => f.id === chosen[i])!.family);
      await page.getByTestId(`font-row-${chosen[i]}`).click();
      await page.waitForFunction(() => !document.querySelector('[data-testid="font-use"]')!.hasAttribute('disabled'));
      await page.getByTestId('font-use').click();
    }
    const fonts = await page.evaluate(() => (window as unknown as { __vfxApp: { store: { doc: { scene: { elements: { kind: string; style?: { font: { id: string } } }[] } } } } }).__vfxApp.store.doc.scene.elements.filter((e) => e.kind === 'text' || e.kind === 'counter').map((e) => e.style!.font.id));
    expect(fonts.slice(0, Math.min(kinds.length, 3))).toEqual(chosen.slice(0, Math.min(kinds.length, 3)));
    await settleApp(page);
    expect(await page.getByTestId('msg-error').count()).toBe(0);
    expect(app.errors).toEqual([]);
    await app.ctx.close();
  });
});

describe('missing characters', () => {
  it('warns on the stage, naming the font and the characters, instead of silently using another font', async () => {
    const app = await openApp(browser, srv.url);
    const { page } = app;
    await openPreset(page, firstText);
    await tab(page, 'content');
    await page.locator('[data-testid^="input-"]').first().fill('WIN \u0414\u0416');
    await settleApp(page);
    const warning = page.getByTestId('msg-warning').first();
    await warning.waitFor();
    const text = await warning.innerText();
    expect(text).toMatch(/has no glyph for/);
    expect(text).toContain('\u0414');
    const used = await docFont(page);
    expect(text).toContain(FONT_FAMILIES.find((f) => f.id === used.id)!.family);
    await page.locator('[data-testid^="input-"]').first().fill('WIN');
    await settleApp(page);
    expect(await page.getByTestId('msg-warning').count()).toBe(0);
  });
});

void ({} as App);
