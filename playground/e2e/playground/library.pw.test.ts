import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { Browser } from 'playwright-core';
import { closeApps, launchGl, openApp, openPreset, serveStatic, settleApp, type App, type Served, ROOT } from './harness';
import { join } from 'node:path';
import { presetsOf } from '../../src/vfx/library';

let browser: Browser, srv: Served;
beforeAll(async () => { srv = await serveStatic(join(ROOT, 'dist/playground'), 'playground.html'); browser = await launchGl(); });
afterAll(async () => { await browser?.close(); await srv?.close(); });
afterEach(async () => { await closeApps(); });

const TEN = ['text-animations', 'text-styling', 'counters', 'messages', 'symbol-destruction', 'symbol-transformation', 'multipliers', 'impacts', 'screen-distortion', 'shine'];

describe('library', () => {
  it('has exactly ten categories and every one has real effects, with animated thumbnails', async () => {
    const app = await openApp(browser, srv.url);
    const { page } = app;
    const ids = await page.evaluate(() => [...document.querySelectorAll('[data-testid^="cat-"]')].map((e) => e.getAttribute('data-testid')!.slice(4)));
    expect(ids).toEqual(TEN);
    for (const id of TEN) {
      await page.getByTestId(`cat-${id}`).click();
      const n = await page.locator('[data-testid^="card-"]').count();
      expect(n, `${id} has presets`).toBeGreaterThanOrEqual(5);
      // the thumbnails of the visible cards are live: two samples a moment apart differ
      const cards = page.locator('[data-testid^="card-"] canvas');
      const take = async () => cards.evaluateAll((cs) => cs.slice(0, 4).map((c) => (c as HTMLCanvasElement).toDataURL()));
      await page.waitForTimeout(700);
      const a = await take();
      // thumbnails share one renderer, so give them time: any of the first few moving is enough
      let moving = 0;
      for (let i = 0; i < 20 && !moving; i++) { await page.waitForTimeout(600); const b = await take(); moving = a.filter((x, k) => x !== b[k]).length; }
      expect(moving, `${id}: at least one of the first thumbnails animates`).toBeGreaterThan(0);
      for (const x of a) expect(x.length, `${id}: thumbnail not blank`).toBeGreaterThan(3000);
    }
    expect(app.errors).toEqual([]);
    await app.ctx.close();
  });

  it('search finds effects across categories and favourites persist', async () => {
    const app = await openApp(browser, srv.url);
    const { page } = app;
    await page.getByTestId('search').fill('shatter');
    const hits = await page.locator('[data-testid^="card-"]').count();
    expect(hits).toBeGreaterThan(0);
    await page.getByTestId('search').fill('zzzzqq');
    expect(await page.locator('[data-testid^="card-"]').count()).toBe(0);
    await page.getByTestId('search').fill('');
    await page.getByTestId('cat-multipliers').click();
    const first = page.locator('[data-testid^="card-"]').first();
    const id = (await first.getAttribute('data-testid'))!.slice(5);
    await page.getByTestId(`fav-${id}`).click();
    await page.getByTestId('nav-favourites').click();
    expect(await page.getByTestId(`card-${id}`).count()).toBe(1);
    await app.ctx.close();
  });

});

// One test per category on a small canvas: software WebGL is slow, and a failure then names the category.
describe('every preset', () => {
  for (const cat of TEN) {
    it(`${cat}: loads without errors, draws something and changes over time`, async () => {
      const app = await openApp(browser, srv.url, { query: 'lab=1', viewport: { width: 640, height: 360 } });
      const ids = presetsOf(cat as never).map((p) => p.id);
      expect(ids.length).toBeGreaterThanOrEqual(5);
      const bad: string[] = [];
      // impacts and screen distortion bend what is behind them, so they are checked over a picture
      const behind = cat === 'screen-distortion' || cat === 'impacts';
      await app.page.evaluate((b) => window.__vfx!.backdrop(b ? 'reels' : 'none'), behind);
      for (const id of ids) {
        const r = await app.page.evaluate(async (pid) => {
          const v = window.__vfx!;
          const meta = v.presets().find((x) => x.id === pid)!;
          if (meta.backdropTo) { await v.backdrop(meta.backdrop); await v.backdropTo(meta.backdropTo); }   // a transition goes between two screens
          const rep = await v.setScene(v.preset(pid)!.scene);
          await v.controller.whenIdle();
          v.controller.pause();
          const D = v.duration();
          const hashes = new Set<string>(); let cover = 0;
          for (const f of [0.03, 0.2, 0.4, 0.6, 0.8, 1]) {
            v.seek(Math.min(D, f * D));
            cover = Math.max(cover, v.coverage());
            hashes.add(await v.hash());
          }
          return { errors: rep.errors.map((e) => `${e.name}: ${e.message}`), D, distinct: hashes.size, cover };
        }, id);
        if (r.errors.length || r.D <= 0.2 || r.distinct < 2 || (r.cover < 0.0015 && !behind)) bad.push(`${id}: ${JSON.stringify(r)}`);
      }
      expect(bad, bad.join('\n')).toEqual([]);
      expect(app.errors).toEqual([]);
    }, 1200000);
  }
});

describe('deterministic drawing', () => {
  it('a frame depends only on the scene and the time: never on what was drawn before, and the first frame after a load is never a black box', async () => {
    const app = await openApp(browser, srv.url, { query: 'lab=1' });
    const picks = ['text-styling', 'messages', 'counters', 'multipliers', 'symbol-destruction'].map((c) => presetsOf(c as never)[0]!.id);
    const bad: string[] = [];
    for (const id of picks) {
      const r = await app.page.evaluate(async (pid) => {
        const v = window.__vfx!;
        await v.backdrop('night');
        await v.controller.setScene(JSON.parse(JSON.stringify(v.preset(pid)!.scene)), { reload: true });
        await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
        await v.controller.whenIdle();
        v.controller.pause();
        const D = v.duration();
        const first = [];
        for (const f of [0.35, 0.65, 0.35, 0.9, 0.65]) { v.seek(f * D); first.push(await v.hash()); }
        return { sameAgain: first[0] === first[2] && first[1] === first[4], distinct: new Set(first).size };
      }, id);
      if (!r.sameAgain || r.distinct < 2) bad.push(`${id}: ${JSON.stringify(r)}`);
    }
    expect(bad, bad.join('\n')).toEqual([]);
  });
});

describe('switching', () => {
  it('switching presets repeatedly never leaves a blank frame', async () => {
    const app = await openApp(browser, srv.url);
    const { page } = app;
    const pool = ['messages', 'text-styling', 'counters', 'multipliers', 'symbol-destruction'].flatMap((c) => presetsOf(c as never).slice(0, 2).map((p) => p.id));
    await openPreset(page, pool[0]!);
    await page.getByTestId('backdrop').selectOption('none');
    const blank: string[] = [];
    for (let round = 0; round < 2; round++) {
      for (const id of pool) {
        await openPreset(page, id);
        await page.getByTestId('backdrop').selectOption('none');
        const cover = await page.evaluate(async () => { const v = window.__vfx!; await v.controller.whenIdle(); v.controller.pause(); v.seek(v.duration() * 0.5); return v.coverage(); });
        if (cover < 0.0008) blank.push(`${id} (round ${round}): coverage ${cover}`);
      }
    }
    expect(blank, blank.join('\n')).toEqual([]);
    expect(app.errors).toEqual([]);
    await app.ctx.close();
  }, 600000);
});

describe('sound', () => {
  it('the sound switch decides whether the effects\' cues play, and is saved in the scene', async () => {
    const app = await openApp(browser, srv.url);
    const { page } = app;
    const withCues = presetsOf('impacts').find((p) => p.scene.fx.some((l) => ['shockwave', 'vortex', 'impact.slam', 'impact.lightning', 'impact.burst'].includes(l.effect)))!;
    await openPreset(page, withCues.id);
    await page.getByTestId('tab-effects').click();
    const cues = () => page.evaluate(() => window.__vfx!.controller.player.cues().length);
    const sceneSound = () => page.evaluate(() => (window as unknown as { __vfxApp: { store: { doc: { scene: { sound: { enabled: boolean } } } } } }).__vfxApp.store.doc.scene.sound.enabled);
    if (await sceneSound()) await page.getByTestId('sound-on').uncheck();
    await settleApp(page);
    expect(await cues()).toBe(0);
    await page.getByTestId('sound-on').check();
    await settleApp(page);
    expect(await sceneSound()).toBe(true);
    expect(await cues(), 'cues exist once sound is on').toBeGreaterThan(0);
    await page.getByTestId('sound-on').uncheck();
    await settleApp(page);
    expect(await cues()).toBe(0);
    expect(app.errors).toEqual([]);
  });
});

void settleApp; void ({} as App);
