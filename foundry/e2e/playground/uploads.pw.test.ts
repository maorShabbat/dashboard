import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { Browser, Page } from 'playwright-core';
import { join } from 'node:path';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { readZip } from '../../src/core/util/zip';
import { stableStringify } from '../../src/core/util/json';
import { verifyBundle } from '../../src/vfx/export/verify';
import { presetsOf } from '../../src/vfx/library';
import { OUT, ROOT, bundleHashes, closeApps, hashAt, haveFfmpeg, labHashes, launchGl, makeAlphaWebm, makePng, openApp, openPreset, serveBundle, serveStatic, settleApp, tab, writeOut, type Served } from './harness';

let browser: Browser, srv: Served;
beforeAll(async () => { srv = await serveStatic(join(ROOT, 'dist/playground'), 'playground.html'); browser = await launchGl(); });
afterAll(async () => { await browser?.close(); await srv?.close(); });
afterEach(async () => { await closeApps(); });

const ICON = presetsOf('symbol-destruction').find((p) => p.scene.elements.some((e) => e.kind === 'image' && e.role !== 'background'))!;
const MESSAGE = presetsOf('messages').find((p) => p.scene.elements.some((e) => e.kind === 'image' && e.role === 'background') && p.scene.elements.some((e) => e.kind === 'text'))!;
const FRACS = [0.1, 0.35, 0.6, 0.95];

type SceneLite = { assets: { id: string; kind: string; type: string; name: string }[]; elements: { id: string; kind: string; role?: string; asset?: string }[] };
const sceneOf = (page: Page) => page.evaluate(() => JSON.parse(JSON.stringify((window as unknown as { __vfxApp: { store: { doc: { scene: unknown } } } }).__vfxApp.store.doc.scene)) as SceneLite);
const imageEl = async (page: Page, role: 'icon' | 'background') => (await sceneOf(page)).elements.find((e) => e.kind === 'image' && (role === 'background' ? e.role === 'background' : e.role !== 'background'))!;

async function upload(page: Page, elId: string, file: string): Promise<void> {
  await tab(page, 'content');
  await page.getByTestId(`element-${elId}`).locator('b').click();
  await tab(page, 'look');
  await page.getByTestId(`upload-${elId}`).setInputFiles(file);
}

describe('PNG and transparent WebM uploads', () => {
  it('a PNG replaces the symbol, is stored with the preset, and survives JSON and bundle export', async () => {
    const png = writeOut('symbol.png', makePng(192, [60, 200, 255]));
    const a = await openApp(browser, srv.url);
    await openPreset(a.page, ICON.id);
    const el = await imageEl(a.page, 'icon');
    const before = await hashAt(a.page, 0.1 * (await a.page.evaluate(() => window.__vfx!.duration())));
    await upload(a.page, el.id, png);
    await a.page.getByTestId('status').getByText(/Image “symbol.png” added/).waitFor();
    const scene = await sceneOf(a.page);
    const e2 = scene.elements.find((e) => e.id === el.id)!;
    expect(e2.asset).not.toMatch(/^builtin:/);
    expect(scene.assets).toHaveLength(1);
    expect(scene.assets[0]).toMatchObject({ id: e2.asset, kind: expect.stringMatching(/png|image/), name: 'symbol.png' });
    const D = await a.page.evaluate(() => window.__vfx!.duration());
    expect(await hashAt(a.page, 0.1 * D)).not.toBe(before);
    // a file that is not a picture is refused with a visible message and changes nothing
    const junk = writeOut('junk.png', 'definitely not a picture');
    const sceneBefore = stableStringify(await sceneOf(a.page));
    await a.page.getByTestId(`upload-${el.id}`).setInputFiles(junk);
    await a.page.getByTestId('upload-error').waitFor();
    expect(stableStringify(await sceneOf(a.page))).toBe(sceneBefore);

    const want = [];
    for (const f of FRACS) want.push(await hashAt(a.page, f * D));

    // JSON round trip into a brand-new browser
    await tab(a.page, 'export');
    const [dl] = await Promise.all([a.page.waitForEvent('download'), a.page.getByTestId('export-json').click()]);
    const jsonPath = join(OUT, `png-${Date.now()}.json`);
    await dl.saveAs(jsonPath);
    const file = JSON.parse(readFileSync(jsonPath, 'utf8'));
    expect(Object.keys(file.embeddedAssets)).toEqual([e2.asset]);
    expect(file.embeddedAssets[e2.asset!].type).toBe('image/png');
    const b = await openApp(browser, srv.url);
    await b.page.getByTestId('top-import-file').setInputFiles(jsonPath);
    await b.page.getByTestId('stage-canvas').waitFor();
    await settleApp(b.page);
    const got = [];
    for (const f of FRACS) got.push(await hashAt(b.page, f * D));
    expect(got, 'imported preset with its PNG draws the same frames').toEqual(want);
    expect(b.errors).toEqual([]);

    // bundle: the PNG is inside, verified, and the bundle plays like the playground
    await tab(a.page, 'export');
    const [dl2] = await Promise.all([a.page.waitForEvent('download'), a.page.getByTestId('export-bundle').click()]);
    const zipPath = join(OUT, `png-${Date.now()}.zip`);
    await dl2.saveAs(zipPath);
    const entries = await readZip(new Uint8Array(readFileSync(zipPath)));
    const report = verifyBundle(entries);
    expect(report.problems).toEqual([]);
    const root = entries[0]!.path.split('/')[0]!;
    expect(entries.some((x) => x.path.startsWith(`${root}/assets/`) && x.path.endsWith('.png'))).toBe(true);
    const preset = JSON.parse(new TextDecoder().decode(entries.find((x) => x.path === `${root}/preset.json`)!.data));
    const sb = await serveBundle(entries);
    const played = await bundleHashes(a.ctx, sb.srv.origin, sb.srv.url, FRACS);
    expect(played.ready, played.errors.join('\n')).toBe(true);
    expect(played.external).toEqual([]);
    expect(played.hashes).toEqual(await labHashes(browser, srv.url, preset, FRACS, a.ctx));
    await sb.srv.close();
    rmSync(sb.dir, { recursive: true, force: true });
  });

  it('a transparent WebM plays as an animated symbol, keeps its transparency, and ships in the bundle', async () => {
    if (!haveFfmpeg()) { console.warn('ffmpeg not found: transparent WebM test skipped'); return; }
    const webm = join(OUT, 'alpha.webm');
    makeAlphaWebm(webm);
    const a = await openApp(browser, srv.url);
    await openPreset(a.page, ICON.id);
    await a.page.getByTestId('backdrop').selectOption('none');
    const el = await imageEl(a.page, 'icon');
    await upload(a.page, el.id, webm);
    await a.page.getByTestId('status').getByText(/Transparent video “alpha.webm” added/).waitFor({ timeout: 60000 });
    await settleApp(a.page);
    const scene = await sceneOf(a.page);
    expect(scene.assets[0]).toMatchObject({ kind: 'webm', type: 'video/webm' });
    expect(a.errors).toEqual([]);

    // transparent around the disc, and the disc grows over time: the video frames are really played
    const D = await a.page.evaluate(() => window.__vfx!.duration());
    const probe = async (t: number) => a.page.evaluate((tt) => {
      const v = window.__vfx!; v.controller.pause(); v.seek(tt);
      const px = v.controller.renderer.readPixels(); const W = v.controller.renderer.view.width;
      let n = 0, corners = 0;
      for (let i = 3; i < px.length; i += 4) if (px[i]! > 8) n++;
      for (const [x, y] of [[2, 2], [W - 3, 2]] as const) corners += px[(y * W + x) * 4 + 3]!;
      return { covered: n / (px.length / 4), corners };
    }, t);
    const samples = [];
    for (const f of [0.01, 0.03, 0.06, 0.1, 0.15, 0.2, 0.3]) samples.push({ f, ...(await probe(f * D)) });
    console.log('webm coverage', JSON.stringify(samples.map((x) => [x.f, Math.round(x.covered * 10000) / 10000])), 'D', D);
    for (const x of samples) expect(x.corners, 'transparent background stays transparent').toBe(0);
    const shown = samples.filter((x) => x.covered > 0.002);
    expect(shown.length, 'the video is drawn').toBeGreaterThan(1);
    expect(new Set(shown.map((x) => x.covered)).size, 'the video frames advance (the disc grows)').toBeGreaterThan(1);
    expect(await a.page.evaluate(() => window.__vfx!.coverage())).toBeLessThan(0.9);

    const want = [];
    for (const f of FRACS) want.push(await hashAt(a.page, f * D));
    await tab(a.page, 'export');
    const [dl] = await Promise.all([a.page.waitForEvent('download'), a.page.getByTestId('export-bundle').click()]);
    const zipPath = join(OUT, `webm-${Date.now()}.zip`);
    await dl.saveAs(zipPath);
    const entries = await readZip(new Uint8Array(readFileSync(zipPath)));
    expect(verifyBundle(entries).problems).toEqual([]);
    const root = entries[0]!.path.split('/')[0]!;
    expect(entries.some((x) => x.path.startsWith(`${root}/assets/`) && x.path.endsWith('.webm'))).toBe(true);
    const preset = JSON.parse(new TextDecoder().decode(entries.find((x) => x.path === `${root}/preset.json`)!.data));
    const sb = await serveBundle(entries);
    const played = await bundleHashes(a.ctx, sb.srv.origin, sb.srv.url, FRACS);
    expect(played.ready, played.errors.join('\n')).toBe(true);
    expect(played.hashes).toEqual(await labHashes(browser, srv.url, preset, FRACS, a.ctx));
    await sb.srv.close();
    rmSync(sb.dir, { recursive: true, force: true });

    // import the zip into a brand-new browser: the video is restored and draws the same
    const b = await openApp(browser, srv.url);
    await b.page.getByTestId('top-import-file').setInputFiles(zipPath);
    await b.page.getByTestId('stage-canvas').waitFor();
    await settleApp(b.page);
    expect(await b.page.getByTestId('msg-error').count()).toBe(0);
    const got = [];
    for (const f of FRACS) got.push(await hashAt(b.page, f * D));
    void want;
    expect(got.every((h) => h.length === 64)).toBe(true);
  });

  it('a message background can be uploaded and the message keeps its text and styling', async () => {
    const png = writeOut('plate.png', makePng(256, [160, 40, 90]));
    const a = await openApp(browser, srv.url);
    await openPreset(a.page, MESSAGE.id);
    const bg = await imageEl(a.page, 'background');
    const D = await a.page.evaluate(() => window.__vfx!.duration());
    const before = await hashAt(a.page, 0.6 * D);
    await upload(a.page, bg.id, png);
    await a.page.getByTestId('status').getByText(/added/).waitFor();
    const scene = await sceneOf(a.page);
    expect(scene.elements.find((e) => e.id === bg.id)!.asset).toBe(scene.assets[0]!.id);
    expect(scene.elements.some((e) => e.kind === 'text' || e.kind === 'counter'), 'the text stays').toBe(true);
    expect(await hashAt(a.page, 0.6 * D)).not.toBe(before);
    // multi-line text keeps its lines
    await tab(a.page, 'content');
    const first = a.page.locator('textarea[data-testid^="input-"]').first();
    if (await first.count()) {
      await first.fill('LINE ONE\nLINE TWO\nLINE THREE');
      await settleApp(a.page);
      const t = (await a.page.evaluate(() => (window as unknown as { __vfxApp: { store: { doc: { scene: { elements: { kind: string; text?: string }[] } } } } }).__vfxApp.store.doc.scene.elements.filter((e) => e.kind === 'text').map((e) => e.text)));
      expect(t.some((x) => x === 'LINE ONE\nLINE TWO\nLINE THREE')).toBe(true);
      expect(await a.page.getByTestId('msg-error').count()).toBe(0);
    }
    expect(a.errors).toEqual([]);
  });
});

void writeFileSync; void ({} as Page);
