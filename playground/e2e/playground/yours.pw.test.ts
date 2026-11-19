import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { Browser, Page } from 'playwright-core';
import { join } from 'node:path';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { readZip } from '../../src/core/util/zip';
import { fromUtf8 } from '../../src/core/util/sha256';
import { verifyBundle } from '../../src/vfx/export/verify';
import { OUT, ROOT, closeApps, launchGl, makePng, openApp, openPreset, serveStatic, settleApp, setNum, tab, type Served } from './harness';

let browser: Browser, srv: Served;
beforeAll(async () => { srv = await serveStatic(join(ROOT, 'dist/playground'), 'playground.html'); browser = await launchGl(); });
afterAll(async () => { await browser?.close(); await srv?.close(); });
afterEach(async () => { await closeApps(); });

/** A real 16-bit mono WAV: a short decaying tone. */
function makeWav(seconds = 0.4, hz = 440): Buffer {
  const rate = 22050, n = Math.round(seconds * rate), data = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++) data.writeInt16LE(Math.round(Math.sin((2 * Math.PI * hz * i) / rate) * 12000 * (1 - i / n)), i * 2);
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVE', 8); h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}

type Scene = { sound: { enabled: boolean; builtin?: boolean }; sounds?: { id: string; asset: string; cue: string; offset: number; gain: number; name: string }[]; assets: { id: string; kind: string }[]; fx: { id: string; effect: string }[] };
const scene = (page: Page) => page.evaluate(() => JSON.parse(JSON.stringify((window as unknown as { __vfxApp: { store: { doc: { scene: unknown } } } }).__vfxApp.store.doc.scene)) as Scene);
const duration = (page: Page) => page.evaluate(() => window.__vfx!.duration());

describe('your own sounds', () => {
  it('attaches a sound file to a moment of the effect, and the player works out when it plays', async () => {
    const app = await openApp(browser, srv.url);
    const { page } = app;
    await openPreset(page, 'messages.trigger-bonus');
    await tab(page, 'effects');
    await page.getByTestId('sounds-section').locator('summary').first().click();
    await page.getByTestId('sound-file').setInputFiles({ name: 'boom.wav', mimeType: 'audio/wav', buffer: makeWav() });
    await page.locator('[data-testid^="sound-row-"]').waitFor();
    const sc = await scene(page);
    expect(sc.sounds).toHaveLength(1);
    expect(sc.sound.enabled, 'attaching a sound switches sounds on').toBe(true);
    expect(sc.assets.some((a) => a.id === sc.sounds![0]!.asset && a.kind === 'audio')).toBe(true);
    const cin = sc.fx.find((f) => f.effect === 'cinema.trigger')!;
    expect(sc.sounds![0]!.cue, 'it goes on the first moment worth hitting: the impact').toBe(`fx:${cin.id}:impact`);
    const due = () => page.evaluate(() => window.__vfx!.controller.player.sounds().map((s) => Math.round(s.t * 1000) / 1000));
    expect(await due()).toEqual([0.95]);

    // another moment, a little earlier
    const id = sc.sounds![0]!.id;
    await page.getByTestId(`sound-cue-${id}`).selectOption('scene:end');
    await setNum(page, `sound-offset-${id}`, -0.5);
    await settleApp(page);
    const D = await duration(page);
    expect(await due()).toEqual([Math.round((D - 0.5) * 1000) / 1000]);

    // the cues offered include the title coming in and the effect's start, impact and end
    const keys = await page.getByTestId(`sound-cue-${id}`).locator('option').evaluateAll((o) => o.map((x) => (x as HTMLOptionElement).value));
    expect(keys).toEqual(expect.arrayContaining(['scene:start', 'scene:end', 'el:title:in', `fx:${cin.id}:start`, `fx:${cin.id}:impact`, `fx:${cin.id}:end`]));

    // the built-in sounds can be dropped
    await page.getByTestId('sound-builtin').uncheck();
    expect((await scene(page)).sound.builtin).toBe(false);
    expect(await page.evaluate(() => window.__vfx!.controller.player.cues().length)).toBe(0);
    await page.getByTestId('sound-builtin').check();
    expect((await scene(page)).sound.builtin).toBeUndefined();
    expect(await page.evaluate(() => window.__vfx!.controller.player.cues().length)).toBeGreaterThan(0);

    // removing it also drops the file from the scene
    await page.getByTestId(`sound-remove-${id}`).click();
    const after = await scene(page);
    expect(after.sounds).toBeUndefined();
    expect(after.assets.some((a) => a.kind === 'audio')).toBe(false);
    expect(app.errors).toEqual([]);
  });

  it('refuses a file that is not a sound, and one that is too big', async () => {
    const app = await openApp(browser, srv.url);
    const { page } = app;
    await openPreset(page, 'messages.trigger-bonus');
    await tab(page, 'effects');
    await page.getByTestId('sounds-section').locator('summary').first().click();
    await page.getByTestId('sound-file').setInputFiles({ name: 'fake.mp3', mimeType: 'audio/mpeg', buffer: makePng(32, [200, 10, 10]) });
    await page.getByTestId('sound-error').waitFor();
    expect(await page.getByTestId('sound-error').innerText()).toMatch(/not a sound file/i);
    expect((await scene(page)).sounds).toBeUndefined();
    await page.getByTestId('sound-file').setInputFiles({ name: 'huge.wav', mimeType: 'audio/wav', buffer: Buffer.alloc(9 * 1048576, 1) });
    await page.waitForFunction(() => /MB/.test(document.querySelector('[data-testid="sound-error"]')?.textContent ?? ''));
    expect((await scene(page)).sounds).toBeUndefined();
    expect(app.errors.filter((e) => !/Failed to load resource|decodeAudioData|EncodingError/i.test(e))).toEqual([]);
  });

  it('plays with the preview and the preview button plays it alone', async () => {
    const app = await openApp(browser, srv.url);
    const { page } = app;
    await openPreset(page, 'messages.trigger-bonus');
    await tab(page, 'effects');
    await page.getByTestId('sounds-section').locator('summary').first().click();
    await page.getByTestId('sound-file').setInputFiles({ name: 'boom.wav', mimeType: 'audio/wav', buffer: makeWav() });
    const row = page.locator('[data-testid^="sound-row-"]');
    await row.waitFor();
    const started = () => page.evaluate(() => { const c = window.__vfx!.controller as unknown as { sound: { starts: number }; previewPlayer: { starts: number } }; return { main: c.sound.starts, preview: c.previewPlayer.starts }; });
    const before = await started();
    await page.locator('[data-testid^="sound-play-"]').click();
    await page.waitForFunction((b) => (window.__vfx!.controller as unknown as { previewPlayer: { starts: number } }).previewPlayer.starts > b, before.preview, { timeout: 20000 });
    await page.evaluate(() => { const c = window.__vfx!.controller; c.restart(); });
    await page.waitForFunction((b) => (window.__vfx!.controller as unknown as { sound: { starts: number } }).sound.starts > b, before.main, { timeout: 20000 });
    expect(app.errors).toEqual([]);
  });

  it('is shipped in the exported bundle, listed in its manifest, and the bundle player tells the game when it is due', async () => {
    const a = await openApp(browser, srv.url, { viewport: { width: 1500, height: 900 } });
    const { page } = a;
    await openPreset(page, 'messages.trigger-bonus');
    await tab(page, 'effects');
    await page.getByTestId('sounds-section').locator('summary').first().click();
    const wav = makeWav(0.5, 330);
    await page.getByTestId('sound-file').setInputFiles({ name: 'my slam.wav', mimeType: 'audio/wav', buffer: wav });
    await page.locator('[data-testid^="sound-row-"]').waitFor();
    const sc = await scene(page);
    await tab(page, 'export');
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), page.getByTestId('export-bundle').click()]);
    const path = join(OUT, `dl-${Date.now()}-${dl.suggestedFilename()}`);
    await dl.saveAs(path);
    const entries = await readZip(new Uint8Array(readFileSync(path)));
    expect(verifyBundle(entries).problems).toEqual([]);
    const root = entries[0]!.path.split('/')[0]!;
    const rel = (p: string) => entries.find((e) => e.path === `${root}/${p}`);
    const manifest = JSON.parse(fromUtf8(rel('manifest.json')!.data));
    const file = manifest.assets[sc.sounds![0]!.asset] as string;
    expect(file).toMatch(/^assets\/.+\.wav$/);
    const shipped = rel(file)!;
    expect(createHash('sha256').update(shipped.data).digest('hex')).toBe(createHash('sha256').update(wav).digest('hex'));
    expect(manifest.files.find((f: { path: string }) => f.path === file)).toBeDefined();
    const preset = JSON.parse(fromUtf8(rel('preset.json')!.data));
    expect(preset.scene.sounds).toHaveLength(1);
    expect(fromUtf8(rel('README.md')!.data)).toContain('Your own sounds');

    const dir = join(OUT, `bundle-snd-${Date.now()}`);
    for (const e of entries) { const p = join(dir, e.path); mkdirSync(join(p, '..'), { recursive: true }); writeFileSync(p, e.data); }
    const bsrv = await serveStatic(join(dir, root), 'index.html');
    const bpage = await a.ctx.newPage();
    const berr: string[] = [], missing: string[] = [];
    bpage.on('response', (r) => { if (r.status() >= 400) missing.push(r.url()); });
    bpage.on('console', (m) => { if (m.type() === 'error') berr.push(m.text()); });
    bpage.on('pageerror', (e) => berr.push(e.message));
    await bpage.goto(bsrv.url);
    await bpage.waitForFunction(() => (window as unknown as { ready?: boolean }).ready !== undefined, null, { timeout: 60000 });
    expect(await bpage.evaluate(() => (window as unknown as { ready?: boolean }).ready), berr.join('\n')).toBe(true);
    const list = await bpage.evaluate(() => (window as unknown as { player: { sounds(): { t: number; url: string; gain: number; name: string }[] } }).player.sounds());
    expect(list).toHaveLength(1);
    expect(list[0]!.url).toBe(file);
    expect(list[0]!.t).toBeGreaterThan(0.5);
    expect(await bpage.getByRole('button', { name: /Sound: off/ }).isVisible(), 'the demo page offers the sound switch').toBe(true);
    await bpage.getByRole('button', { name: /Sound: off/ }).click();
    await bpage.getByRole('button', { name: /Sound: on/ }).waitFor();
    await bsrv.close();
    expect(missing.filter((u) => !/favicon/.test(u)), 'nothing the bundle asks for is missing').toEqual([]);
    expect(berr.filter((e) => !/AudioContext|autoplay|Failed to load resource/i.test(e))).toEqual([]);
    expect(a.errors).toEqual([]);
  });
});

describe('quality tiers', () => {
  const buffer = (page: Page) => page.evaluate(() => { const c = window.__vfx!.controller; return { w: c.renderer.canvas.width, h: c.renderer.canvas.height, tier: c.tier, setting: c.quality }; });

  it('lower tiers draw at a smaller size and fewer pieces; the choice is remembered', async () => {
    const app = await openApp(browser, srv.url, { viewport: { width: 1500, height: 900 } });
    const { page } = app;
    await openPreset(page, 'messages.big-win');
    await settleApp(page);
    const high = await buffer(page);
    expect(high).toMatchObject({ tier: 'high', setting: 'high' });
    const pieces = async () => page.evaluate(async () => { const v = window.__vfx!; await v.controller.whenIdle(); v.controller.pause(); v.seek(1.4); const f = v.controller.lastFrame!; return f.polys.length / 6 + f.draws.reduce((s, d) => s + d.instances.length / 24, 0) + f.additive.length + f.alphaSprites.length; });
    const fullPieces = await pieces();

    await page.getByTestId('quality').selectOption('low');
    await settleApp(page);
    const low = await buffer(page);
    expect(low.tier).toBe('low');
    expect(low.w, 'drawn at a smaller size').toBeLessThan(high.w * 0.7);
    expect(low.h).toBeLessThan(high.h * 0.7);
    expect(await pieces(), 'and with fewer pieces').toBeLessThan(fullPieces);

    await page.getByTestId('quality').selectOption('medium');
    await settleApp(page);
    const mid = await buffer(page);
    expect(mid.w).toBeGreaterThan(low.w); expect(mid.w).toBeLessThan(high.w);

    // remembered across a reload
    await page.reload();
    await page.evaluate(() => (window as unknown as { vfxReady: Promise<void> }).vfxReady);
    await openPreset(page, 'messages.big-win');
    await settleApp(page);
    expect((await buffer(page)).setting).toBe('medium');
    await page.getByTestId('quality').selectOption('high');
    await settleApp(page);
    expect((await buffer(page)).w).toBe(high.w);

    // automatic shows the tier it is using
    await page.getByTestId('quality').selectOption('auto');
    await settleApp(page);
    expect((await buffer(page)).setting).toBe('auto');
    expect(await page.getByTestId('quality').locator('option:checked').innerText()).toMatch(/Automatic: now (low|medium|high)/);
    expect(app.errors).toEqual([]);
  });

  it('the picture at a low tier is still a picture of the same effect, drawn without errors', async () => {
    const app = await openApp(browser, srv.url, { viewport: { width: 1500, height: 900 } });
    const { page } = app;
    await openPreset(page, 'shine.ambient-snow');
    await page.getByTestId('quality').selectOption('low');
    await settleApp(page);
    const cover = await page.evaluate(async () => { const v = window.__vfx!; await v.controller.whenIdle(); v.controller.pause(); v.seek(2); return v.coverage(); });
    expect(cover).toBeGreaterThan(0.1);
    expect(app.errors).toEqual([]);
  });
});
