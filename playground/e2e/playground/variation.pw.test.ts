import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { Browser } from 'playwright-core';
import { closeApps, launchGl, openApp, openPreset, serveStatic, tab, type Served, ROOT } from './harness';
import { join } from 'node:path';

let browser: Browser, srv: Served;
beforeAll(async () => { srv = await serveStatic(join(ROOT, 'dist/playground'), 'playground.html'); browser = await launchGl(); });
afterAll(async () => { await browser?.close(); await srv?.close(); });
afterEach(async () => { await closeApps(); });

describe('headings in the library', () => {
  it('the destruction category is split under headings, with the whole-tile versions together', async () => {
    const app = await openApp(browser, srv.url, { viewport: { width: 1500, height: 900 } });
    const { page } = app;
    await page.getByTestId('cat-symbol-destruction').click();
    const groups = await page.locator('h3.group').evaluateAll((hs) => hs.map((h) => h.getAttribute('data-testid')!.replace('group-', '')));
    expect(groups).toEqual(expect.arrayContaining(['Fire and explosions', 'Smoke and steam', 'Sparks, confetti and gems', 'Whole tile: frame and symbol together']));
    expect(await page.locator('[data-testid^="card-symbol-destruction.tile-"]').count()).toBeGreaterThanOrEqual(15);
    await page.getByTestId('cat-screen-distortion').click();
    expect(await page.getByTestId('group-Transitions between screens').count()).toBe(1);
    expect(app.errors).toEqual([]);
  });
});

describe('a frame taken along with its symbol', () => {
  it('the tile is destroyed together with the symbol, and the choice is in the effects panel', async () => {
    const app = await openApp(browser, srv.url, { viewport: { width: 1500, height: 900 } });
    const { page } = app;
    await openPreset(page, 'symbol-destruction.tile-fireball');
    await page.getByTestId('backdrop').selectOption('none');
    await tab(page, 'effects');
    const sel = page.locator('[data-testid$="-frame"]').first();
    expect(await sel.inputValue()).toBe('frame');
    const probe = () => page.evaluate(async () => { const v = window.__vfx!; await v.controller.whenIdle(); v.controller.pause(); v.seek(v.duration()); return v.coverage(); });
    const withFrame = await probe();
    expect(withFrame, 'nothing of the tile is left once the effect is over').toBeLessThan(0.002);
    await sel.selectOption('');
    const without = await probe();
    expect(without, 'without the frame, the frame is still standing').toBeGreaterThan(0.02);
    await sel.selectOption('frame');
    expect(await probe()).toBeLessThan(0.002);
    expect(app.errors).toEqual([]);
  });

  it('+ Symbol frame puts a tile behind the symbol and an effect can take it along', async () => {
    const app = await openApp(browser, srv.url, { viewport: { width: 1500, height: 900 } });
    const { page } = app;
    await openPreset(page, 'symbol-destruction.fireball');
    await tab(page, 'content');
    await page.getByTestId('add-frame').click();
    const kinds = await page.locator('[data-testid^="element-"] b').allInnerTexts();
    expect(kinds[0]).toBe('Symbol frame');                   // behind everything
    await tab(page, 'effects');
    const sel = page.locator('[data-testid$="-frame"]').first();
    await sel.selectOption({ index: 1 });
    await page.evaluate(async () => { const v = window.__vfx!; await v.controller.whenIdle(); });
    const errs = await page.evaluate(() => window.__vfx!.controller.report.errors.map((e) => e.message));
    expect(errs).toEqual([]);
    expect(app.errors).toEqual([]);
  });
});

describe('transitions between screens', () => {
  it('the first screen and the next screen are chosen separately and the effect goes from one to the other', async () => {
    const app = await openApp(browser, srv.url, { viewport: { width: 1500, height: 900 } });
    const { page } = app;
    await openPreset(page, 'screen-distortion.glass');
    expect(await page.getByTestId('backdrop-to').count()).toBe(1);
    const at = (f: number) => page.evaluate(async (fr) => { const v = window.__vfx!; await v.controller.whenIdle(); v.controller.pause(); v.seek(fr === 1 ? v.duration() : fr * v.duration()); return v.hash(); }, f);
    const start = await at(0.02), end = await at(1);
    expect(start).not.toBe(end);
    await page.getByTestId('backdrop-to').selectOption('night');
    const end2 = await at(1);
    expect(end2, 'a different next screen gives a different last frame').not.toBe(end);
    expect(await at(0.02), 'the first screen is unchanged').toBe(start);
    await page.getByTestId('backdrop').selectOption('bonus');
    expect(await at(0.02), 'a different first screen gives a different first frame').not.toBe(start);
    expect(app.errors).toEqual([]);
  });

  it('every kind of transition draws, changes over time and ends on the next screen', async () => {
    const app = await openApp(browser, srv.url, { query: 'lab=1', viewport: { width: 640, height: 360 } });
    const bad: string[] = [];
    const ids = await app.page.evaluate(() => window.__vfx!.presets().filter((p) => p.backdropTo).map((p) => p.id));
    expect(ids.length).toBeGreaterThanOrEqual(24);
    for (const id of ids) {
      const r = await app.page.evaluate(async (pid) => {
        const v = window.__vfx!;
        const meta = v.presets().find((x) => x.id === pid)!;
        await v.backdrop(meta.backdrop); await v.backdropTo(meta.backdropTo!);
        const rep = await v.setScene(v.preset(pid)!.scene);
        await v.controller.whenIdle(); v.controller.pause();
        const D = v.duration(), hs: string[] = [];
        for (const f of [0, 0.35, 0.55, 0.75, 1]) { v.seek(f * D); hs.push(await v.hash()); }
        // the last two frames are the same picture: the new screen stays up
        v.seek(D); const last = await v.hash(); v.seek(D * 0.97); const near = await v.hash();
        return { errors: rep.errors.length, distinct: new Set(hs).size, settled: last === near };
      }, id);
      if (r.errors || r.distinct < 3 || !r.settled) bad.push(`${id}: ${JSON.stringify(r)}`);
    }
    expect(bad, bad.join('\n')).toEqual([]);
    expect(app.errors).toEqual([]);
  }, 900000);
});
