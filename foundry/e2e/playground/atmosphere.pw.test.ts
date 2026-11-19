import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { Browser, Page } from 'playwright-core';
import { join } from 'node:path';
import { ROOT, closeApps, launchGl, openApp, openPreset, serveStatic, settleApp, tab, type Served } from './harness';

let browser: Browser, srv: Served;
beforeAll(async () => { srv = await serveStatic(join(ROOT, 'dist/playground'), 'playground.html'); browser = await launchGl(); });
afterAll(async () => { await browser?.close(); await srv?.close(); });
afterEach(async () => { await closeApps(); });

const duration = (page: Page) => page.evaluate(() => window.__vfx!.duration());
const clock = (page: Page) => page.evaluate(() => (window.__vfx!.controller as unknown as { time: number }).time);
async function playFromNearEnd(page: Page, before = 0.05): Promise<void> {
  await page.evaluate((b) => { const c = window.__vfx!.controller; c.setLoop(true); c.seek(c.duration - b); c.play(); }, before);
}

describe('atmosphere in the library', () => {
  it('ambient loops, animated frames and feature triggers are listed under their headings', async () => {
    const app = await openApp(browser, srv.url);
    const { page } = app;
    await page.getByTestId('cat-shine').click();
    const heads = await page.locator('h3.group').evaluateAll((hs) => hs.map((h) => h.getAttribute('data-testid')!.replace('group-', '')));
    expect(heads).toEqual(expect.arrayContaining(['Ambient loops behind the reels', 'Animated frames']));
    expect(await page.locator('[data-testid^="card-shine.ambient-"]').count()).toBeGreaterThanOrEqual(14);
    expect(await page.locator('[data-testid^="card-shine.frame-"]').count()).toBeGreaterThanOrEqual(14);
    await page.getByTestId('cat-messages').click();
    expect(await page.getByTestId('group-Feature triggers').count()).toBe(1);
    expect(await page.locator('[data-testid^="card-messages.trigger-"]').count()).toBeGreaterThanOrEqual(7);
    expect(app.errors).toEqual([]);
  });
});

describe('seamless loops', () => {
  it('an ambient loop goes straight round again with no rest, an ordinary effect rests on its last frame', async () => {
    const app = await openApp(browser, srv.url);
    const { page } = app;
    // frames can be slow in software WebGL, so wait for things to happen instead of for a fixed time
    const frames = (n: number) => page.evaluate((k) => new Promise<void>((r) => { let i = 0; const f = () => { if (++i >= k) r(); else requestAnimationFrame(f); }; requestAnimationFrame(f); }), n);
    await openPreset(page, 'shine.ambient-snow');
    const D = await duration(page);
    await playFromNearEnd(page, 0.05);
    await page.waitForFunction((d) => (window.__vfx!.controller as unknown as { time: number }).time < d - 0.2, D, { timeout: 30000 });
    expect(await page.evaluate(() => window.__vfx!.controller.playing), 'it keeps playing after the wrap').toBe(true);
    await page.evaluate(() => window.__vfx!.controller.pause());
    // an ordinary preset stops on its last frame for the rest period
    await openPreset(page, 'messages.trigger-bonus');
    const D2 = await duration(page);
    await playFromNearEnd(page, 0.05);
    await page.waitForFunction((d) => (window.__vfx!.controller as unknown as { time: number }).time >= d - 0.001, D2, { timeout: 30000 });
    await frames(3);
    expect(await clock(page), 'an ordinary effect rests on its last frame').toBeGreaterThanOrEqual(D2 - 0.001);
    expect(app.errors).toEqual([]);
  });

  it('the last frame of an ambient loop is the frame before the first (no jump when it goes round)', async () => {
    const app = await openApp(browser, srv.url);
    const { page } = app;
    for (const id of ['shine.ambient-embers', 'shine.frame-rainbow']) {
      await openPreset(page, id);
      const d = await page.evaluate(async () => {
        const v = window.__vfx!; await v.controller.whenIdle(); v.controller.pause();
        const cv = v.controller.canvas, D = v.duration();
        const grab = (t: number): Uint8ClampedArray => { v.seek(t); const c = document.createElement('canvas'); c.width = cv.width; c.height = cv.height; const g = c.getContext('2d')!; g.drawImage(cv, 0, 0); return g.getImageData(0, 0, c.width, c.height).data; };
        const a = grab(0), last = grab(D - 1e-4), later = grab(D * 0.5), step = grab(0.04);
        const diff = (x: Uint8ClampedArray, y: Uint8ClampedArray) => { let s = 0; for (let i = 0; i < x.length; i += 4) s += Math.abs(x[i]! - y[i]!) + Math.abs(x[i + 1]! - y[i + 1]!) + Math.abs(x[i + 2]! - y[i + 2]!); return s / (x.length / 4); };
        return { seam: diff(a, last), step: diff(a, step), later: diff(a, later) };
      });
      expect(d.later, `${id} moves`).toBeGreaterThan(0.05);
      // going round the seam changes the picture no more than an ordinary 40 ms step does
      expect(d.seam, `${id} seam`).toBeLessThanOrEqual(d.step * 1.5 + 0.05);
    }
    expect(app.errors).toEqual([]);
  });

  it('the seamless switch is in the effects panel and is saved with the scene', async () => {
    const app = await openApp(browser, srv.url);
    const { page } = app;
    await openPreset(page, 'messages.trigger-bonus');
    await tab(page, 'effects');
    const box = page.getByTestId('seamless');
    await box.check();
    await settleApp(page);
    const seamless = () => page.evaluate(() => (window as unknown as { __vfxApp: { store: { doc: { scene: { seamless?: boolean } } } } }).__vfxApp.store.doc.scene.seamless);
    expect(await seamless()).toBe(true);
    await box.uncheck();
    expect(await seamless()).toBeUndefined();
    expect(app.errors).toEqual([]);
  });
});

describe('adding atmosphere from the effects tab', () => {
  it('has headings for ambient loops, frames and the cinematic, and a frame is aimed at an element', async () => {
    const app = await openApp(browser, srv.url);
    const { page } = app;
    await openPreset(page, 'messages.trigger-bonus');
    await tab(page, 'effects');
    for (const [tid, id] of [['fx-add-ambient', 'ambient.snow'], ['fx-add-frames', 'frame.neon'], ['fx-add-cinema', 'cinema.trigger']] as const) {
      expect(await page.getByTestId(tid).locator(`option[value="${id}"]`).count(), id).toBe(1);
    }
    await page.getByTestId('fx-add-frames').selectOption('frame.neon');
    const sel = page.locator('[data-testid$="-target"]').last();
    expect(await sel.count()).toBe(1);
    const title = await page.evaluate(() => (window as unknown as { __vfxApp: { store: { doc: { scene: { elements: { id: string; kind: string }[] } } } } }).__vfxApp.store.doc.scene.elements.find((e) => e.kind === 'text')!.id);
    await sel.selectOption(title);
    await settleApp(page);
    expect(app.errors).toEqual([]);
  });
});
