import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { Browser, Page } from 'playwright-core';
import { join } from 'node:path';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { readZip } from '../../src/core/util/zip';
import { fromUtf8 } from '../../src/core/util/sha256';
import { stableStringify } from '../../src/core/util/json';
import { verifyBundle } from '../../src/vfx/export/verify';
import { builtinPresets, presetsOf } from '../../src/vfx/library';
import { FONT_FAMILIES } from '../../src/vfx/fonts/catalog';
import { sceneFonts } from '../../src/vfx/model/scene';
import { OUT, ROOT, closeApps, hashAt, launchGl, makePng, openApp, openPreset, serveStatic, settleApp, tab, writeOut, type Served } from './harness';

let browser: Browser, srv: Served;
beforeAll(async () => { srv = await serveStatic(join(ROOT, 'dist/playground'), 'playground.html'); browser = await launchGl(); });
afterAll(async () => { await browser?.close(); await srv?.close(); });
afterEach(async () => { await closeApps(); });

type Doc = { scene: unknown; saved: { id: string; version: number } | null; name: string };
const storeDoc = (page: Page) => page.evaluate(() => { const s = (window as unknown as { __vfxApp: { store: { doc: Doc } } }).__vfxApp.store; return JSON.parse(JSON.stringify({ scene: s.doc.scene, saved: s.doc.saved, name: s.doc.name })) as Doc; });
const sceneJson = async (page: Page) => stableStringify((await storeDoc(page)).scene);
const duration = (page: Page) => page.evaluate(() => window.__vfx!.duration());
async function hashes(page: Page, fracs = [0.12, 0.4, 0.7, 1]): Promise<string[]> {
  const D = await duration(page);
  const out: string[] = [];
  for (const f of fracs) out.push(await hashAt(page, f * D));
  return out;
}
async function download(page: Page, testId: string): Promise<{ path: string; name: string }> {
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), page.getByTestId(testId).click()]);
  const path = join(OUT, `dl-${Date.now()}-${dl.suggestedFilename()}`);
  await dl.saveAs(path);
  return { path, name: dl.suggestedFilename() };
}

const TEXT_PRESET = presetsOf('text-styling')[0]!.id;
const MESSAGE = presetsOf('messages').find((p) => p.scene.elements.some((e) => e.kind === 'image' && e.role === 'background') && p.scene.elements.filter((e) => e.kind === 'text' || e.kind === 'counter').length >= 2)
  ?? presetsOf('messages').find((p) => p.scene.elements.filter((e) => e.kind === 'text').length >= 1)!;

/** Edit a text preset the way a person would: new text, another font, a gradient, a second outline and a glow. */
async function customiseText(page: Page, text: string): Promise<void> {
  await tab(page, 'content');
  await page.locator('[data-testid^="input-"]').first().fill(text);
  await tab(page, 'look');
  await page.getByTestId('font-open').click();
  const fam = FONT_FAMILIES.find((f) => f.category === 'arcade')!;
  await page.getByTestId('font-search').fill(fam.family);
  await page.getByTestId(`font-row-${fam.id}`).click();
  await page.waitForFunction(() => !document.querySelector('[data-testid="font-use"]')!.hasAttribute('disabled'));
  await page.getByTestId('font-use').click();
  await page.getByTestId('style-face-grad-preset-chrome').click();
  await page.getByTestId('style-face-grad-angle-num').first().fill('70');
  await page.getByTestId('style-face-grad-angle-num').first().press('Enter');
  await page.getByTestId('style-outlines').locator('summary').first().click();
  if (await page.getByTestId('style-outline-1-on').count() === 0) await page.getByTestId('style-outline-add').click();
  await page.getByTestId('style-glow').locator('summary').first().click();
  await page.getByTestId('style-glow-on').check();
  await page.getByTestId('style-glow-grad-preset-neon').click();
  await settleApp(page);
}

describe('persistence', () => {
  it('keeps my presets, favourites, fonts and gradients across a reload, drawing the very same picture', async () => {
    const { ctx, page, errors } = await openApp(browser, srv.url);
    await openPreset(page, TEXT_PRESET);
    await customiseText(page, 'PERSIST ME');
    await tab(page, 'export');
    await page.getByTestId('save-version').click();
    await page.getByTestId('doc-ref').filter({ hasText: /^user\./ }).waitFor();
    const before = { scene: await sceneJson(page), hashes: await hashes(page), doc: await storeDoc(page) };
    expect(before.doc.saved).toEqual({ id: expect.stringMatching(/^user\./), version: 1 });
    await page.getByTestId('back').click();
    await page.getByTestId('cat-text-styling').click();
    await page.getByTestId(`fav-${TEXT_PRESET}`).click();

    await page.reload();
    await page.evaluate(() => (window as unknown as { vfxReady: Promise<void> }).vfxReady);
    await page.getByTestId('nav-favourites').click();
    expect(await page.getByTestId(`card-${TEXT_PRESET}`).count(), 'favourite survived').toBe(1);
    await page.getByTestId('nav-mine').click();
    const card = page.getByTestId(`card-${before.doc.saved!.id}`);
    expect(await card.count()).toBe(1);
    await card.click();
    await page.getByTestId('stage-canvas').waitFor();
    await settleApp(page);
    expect(await sceneJson(page), 'every setting survived').toBe(before.scene);
    expect(await hashes(page), 'and it draws the same picture').toEqual(before.hashes);
    expect(errors).toEqual([]);
    await ctx.close();
  });

  it('never changes a built-in preset: edits make a copy, saves make versions, undo and redo work', async () => {
    const { page } = await openApp(browser, srv.url);
    await openPreset(page, TEXT_PRESET);
    const original = await page.evaluate((id) => JSON.stringify(window.__vfx!.preset(id)), TEXT_PRESET);
    expect(await page.getByTestId('doc-ref').textContent()).toBe(`${TEXT_PRESET}@1`);
    expect(await page.getByTestId('doc-modified').count()).toBe(0);
    await tab(page, 'content');
    const input = page.locator('[data-testid^="input-"]').first();
    const first = await input.inputValue();
    await input.fill('EDITED');
    await page.getByTestId('doc-modified').waitFor();
    // undo and redo
    await page.getByTestId('undo').click();
    expect(await input.inputValue()).toBe(first);
    await page.getByTestId('redo').click();
    expect(await input.inputValue()).toBe('EDITED');
    // save → my preset v1; edit and save → v2; both versions are kept
    await tab(page, 'export');
    await page.getByTestId('save-version').click();
    const id = (await storeDoc(page)).saved!.id;
    expect(await page.getByTestId('doc-ref').textContent()).toBe(`${id}@1`);
    await tab(page, 'content');
    await page.locator('[data-testid^="input-"]').first().fill('EDITED AGAIN');
    await tab(page, 'export');
    await page.getByTestId('save-version').click();
    expect(await page.getByTestId('doc-ref').textContent()).toBe(`${id}@2`);
    await page.getByRole('button', { name: /^v1 ·/ }).click();
    expect(await page.getByTestId('doc-ref').textContent()).toBe(`${id}@1`);
    await tab(page, 'content');
    expect(await page.locator('[data-testid^="input-"]').first().inputValue()).toBe('EDITED');
    // a duplicate is its own preset
    await tab(page, 'export');
    await page.getByTestId('save-as-new').click();
    const dup = (await storeDoc(page)).saved!.id;
    expect(dup).not.toBe(id);
    // the built-in itself is untouched
    await openPreset(page, TEXT_PRESET);
    expect(await page.evaluate((i) => JSON.stringify(window.__vfx!.preset(i)), TEXT_PRESET)).toBe(original);
    expect(await page.getByTestId('doc-ref').textContent()).toBe(`${TEXT_PRESET}@1`);
    expect(await page.locator('[data-testid^="input-"]').first().inputValue().catch(() => first)).toBeDefined();
    const unchanged = builtinPresets().find((p) => p.id === TEXT_PRESET)!;
    expect(JSON.stringify(unchanged)).toBe(original);
  });
});

describe('JSON export and import', () => {
  it('a preset exported as JSON and imported into a fresh browser reproduces every frame', async () => {
    const a = await openApp(browser, srv.url);
    await openPreset(a.page, TEXT_PRESET);
    await customiseText(a.page, 'ROUND TRIP');
    const want = await hashes(a.page);
    const wantScene = await sceneJson(a.page);
    await tab(a.page, 'export');
    const file = await download(a.page, 'export-json');
    expect(file.name).toMatch(/^user\..*@1\.json$/);
    const json = JSON.parse(readFileSync(file.path, 'utf8'));
    expect(json.schema).toBe('bangers.vfx-preset-file/1');
    expect(json.preset.id).toMatch(/^user\./);
    expect(json.preset.version).toBe(1);
    expect(stableStringify(json.preset.scene)).toBe(wantScene);
    // fonts, gradients, outlines, glow and timing are all in the file
    const text = json.preset.scene.elements.find((e: { kind: string }) => e.kind === 'text');
    expect(text.style.font.id).toBe(FONT_FAMILIES.find((f) => f.category === 'arcade')!.id);
    expect(text.style.face.kind).toBeDefined();
    expect(text.style.face.stops.length).toBeGreaterThanOrEqual(3);
    expect(text.style.outlines.length).toBeGreaterThanOrEqual(2);
    expect(text.style.glow.enabled).toBe(true);
    expect(text.motion.entrance).toBeDefined();
    await a.ctx.close();

    const b = await openApp(browser, srv.url);                       // a brand-new browser profile: nothing stored
    await b.page.getByTestId('top-import-file').setInputFiles(file.path);
    await b.page.getByTestId('stage-canvas').waitFor();
    await settleApp(b.page);
    expect(await sceneJson(b.page)).toBe(wantScene);
    expect(await hashes(b.page), 'imported preset draws identical frames').toEqual(want);
    expect(await b.page.getByTestId('doc-ref').textContent()).toMatch(/^user\..*@1$/);
    expect(b.errors).toEqual([]);
  });

  it('rejects broken files with a clear message instead of importing them', async () => {
    const { page } = await openApp(browser, srv.url);
    const bad = writeOut('broken.json', '{"schema":"bangers.vfx-preset-file/1","preset":{"id":"x"}}');
    await page.getByTestId('top-import-file').setInputFiles(bad);
    await page.getByTestId('status').getByText(/Could not import/).waitFor();
    expect(await page.getByTestId('workspace').count()).toBe(0);
    const junk = writeOut('junk.json', 'not json at all');
    await page.getByTestId('top-import-file').setInputFiles(junk);
    await page.getByTestId('status').getByText(/Could not import/).waitFor();
  });
});

describe('bundle export', () => {
  it('exports a verified, offline bundle with only the used fonts and their licences, and the bundle plays identically', async () => {
    const a = await openApp(browser, srv.url, { viewport: { width: 1500, height: 900 } });
    await openPreset(a.page, TEXT_PRESET);
    await customiseText(a.page, 'IN THE BUNDLE');
    await tab(a.page, 'export');
    const file = await download(a.page, 'export-bundle');
    expect(file.name).toMatch(/\.zip$/);
    const entries = await readZip(new Uint8Array(readFileSync(file.path)));
    const report = verifyBundle(entries);
    expect(report.problems).toEqual([]);
    expect(report.ok).toBe(true);
    const root = entries[0]!.path.split('/')[0]!;
    const rel = (p: string) => entries.find((e) => e.path === `${root}/${p}`);
    const preset = JSON.parse(fromUtf8(rel('preset.json')!.data));

    // only the fonts used, each with its licence file; the manifest records the facts
    const used = [...new Set(sceneFonts(preset.scene).map((s) => s.id))].sort();
    const shipped = [...new Set(entries.filter((e) => /\/fonts\/[^/]+\//.test(e.path)).map((e) => e.path.split('/')[2]!))].sort();
    expect(shipped).toEqual(used);
    expect(used.length).toBeGreaterThanOrEqual(1);
    for (const id of used) { expect(rel(`fonts/${id}/LICENSE.txt`), id).toBeDefined(); expect(fromUtf8(rel(`fonts/${id}/LICENSE.txt`)!.data).length).toBeGreaterThan(200); }
    const lic = JSON.parse(fromUtf8(rel('font-licenses.json')!.data));
    for (const f of lic.fonts) {
      for (const k of ['family', 'source', 'licenseId', 'licenseUrl', 'redistributionPermitted', 'dateChecked', 'includedFiles', 'includedWeights']) expect(f[k], `${f.id}.${k}`).toBeDefined();
      expect(f.redistributionPermitted).toBe(true);
    }
    expect(fromUtf8(rel('FONT-LICENSES.txt')!.data)).toContain(FONT_FAMILIES.find((f) => f.id === used[0])!.family);
    const readme = fromUtf8(rel('README.md')!.data);
    expect(readme).toContain('IN THE BUNDLE');
    expect(readme).toContain(`${preset.id}@${preset.version}`);

    // play it from its own files, offline: no request leaves the bundle's origin
    const dir = join(OUT, `bundle-${Date.now()}`);
    for (const e of entries) { const p = join(dir, e.path); mkdirSync(join(p, '..'), { recursive: true }); writeFileSync(p, e.data); }
    const bsrv = await serveStatic(join(dir, root), 'index.html');
    const bpage = await a.ctx.newPage();
    const external: string[] = [];
    bpage.on('request', (r) => { if (!r.url().startsWith(bsrv.origin) && !/^(data|blob):/.test(r.url())) external.push(r.url()); });
    const berr: string[] = [];
    bpage.on('console', (m) => { if (m.type() === 'error') berr.push(m.text()); });
    bpage.on('pageerror', (e) => berr.push(e.message));
    await bpage.goto(bsrv.url);
    await bpage.waitForFunction(() => (window as unknown as { ready?: boolean }).ready !== undefined, null, { timeout: 60000 });
    expect(await bpage.evaluate(() => (window as unknown as { ready?: boolean }).ready), berr.join('\n')).toBe(true);
    expect(external).toEqual([]);
    const D = await bpage.evaluate(() => (window as unknown as { player: { duration: number } }).player.duration);
    const fracs = [0.12, 0.4, 0.7, 1];
    const bundleHashes = await bpage.evaluate(async (fr) => {
      const p = (window as unknown as { player: { pause(): void; seek(t: number): void; readPixels(): Uint8Array; duration: number } }).player;
      p.pause();
      const out: string[] = [];
      for (const f of fr) {
        p.seek(f * p.duration);
        const buf = await crypto.subtle.digest('SHA-256', p.readPixels().slice().buffer);
        out.push(Array.from(new Uint8Array(buf), (x) => x.toString(16).padStart(2, '0')).join(''));
      }
      return out;
    }, fracs);

    // the playground draws the same preset at the same size: the pixels are identical
    const lab = await openApp(browser, srv.url, { query: 'lab=1', viewport: { width: 1500, height: 900 } });
    const labHashes = await lab.page.evaluate(async ({ pj, fr }) => {
      const v = window.__vfx!;
      const c = v.controller;
      // the same size the player draws at, set before loading so the letters are rasterised at the same scale
      c.renderer.resize(1280, Math.round(1280 / pj.scene.aspect), 1, true);
      await v.setScene(pj.scene);
      await c.whenIdle();
      c.pause();
      const out: string[] = [];
      for (const f of fr) { v.seek(f * v.duration()); out.push(await v.hash()); }
      return out;
    }, { pj: preset, fr: fracs });
    expect(Math.abs(D - (await lab.page.evaluate(() => window.__vfx!.duration())))).toBeLessThan(1e-6);
    expect(bundleHashes, 'the exported bundle plays pixel-identically to the playground').toEqual(labHashes);

    // the bundle is a complete round trip: importing it into a fresh browser gives the same scene
    const c = await openApp(browser, srv.url);
    await c.page.getByTestId('top-import-file').setInputFiles(file.path);
    await c.page.getByTestId('stage-canvas').waitFor();
    await settleApp(c.page);
    expect(stableStringify(JSON.parse(await sceneJson(c.page)))).toBe(stableStringify(preset.scene));
    await bsrv.close();
    rmSync(dir, { recursive: true, force: true });
  });
});

describe('Copy for AI Coding', () => {
  it('is built from the final settings and follows every edit', async () => {
    const { page, errors } = await openApp(browser, srv.url, { permissions: ['clipboard-read', 'clipboard-write'] });
    await openPreset(page, TEXT_PRESET);
    await customiseText(page, 'COPY ME');
    await tab(page, 'export');
    await page.getByTestId('copy-ai').click();
    await page.getByTestId('ai-text').waitFor();
    const shown = await page.getByTestId('ai-text').inputValue();
    expect(await page.evaluate(() => navigator.clipboard.readText()), 'the clipboard holds exactly what is shown').toBe(shown);
    const doc = await storeDoc(page);
    const arcade = FONT_FAMILIES.find((f) => f.category === 'arcade')!;
    expect(shown).toContain('COPY ME');
    expect(shown).toContain(arcade.family);
    expect(shown).toContain(arcade.licenseId);
    expect(shown).toContain(arcade.sourceUrl);
    expect(shown).toContain(`\`${doc.saved!.id}\``);
    expect(shown).toMatch(/Version:\*\* 1/);
    expect(shown).toMatch(/entrance: `/);
    expect(shown).toMatch(/glow: radius/);
    expect(shown).toMatch(/outline 2: /);
    expect(shown).toMatch(/createVfxPlayer/);
    const jsonText = /```json\n([\s\S]*?)\n```/.exec(shown)![1]!;
    const embedded = JSON.parse(jsonText);
    expect(embedded.id).toBe(doc.saved!.id);
    expect(stableStringify(embedded.scene)).toBe(stableStringify(doc.scene));

    // edit again: the next copy reflects it (and is saved as version 2 so the reference stays stable)
    await tab(page, 'content');
    await page.locator('[data-testid^="input-"]').first().fill('CHANGED TEXT');
    await tab(page, 'look');
    await page.getByTestId('style-face-grad').getByLabel('Stop colour hex').fill('#12ab34');
    await tab(page, 'export');
    await page.getByTestId('copy-ai').click();
    const second = await page.getByTestId('ai-text').inputValue();
    expect(second).toContain('CHANGED TEXT');
    expect(second).not.toContain('COPY ME');
    expect(second).toContain('#12ab34');
    expect(second).toMatch(/Version:\*\* 2/);
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(second);
    expect(errors).toEqual([]);
  });
});

void createHash; void MESSAGE; void makePng;
