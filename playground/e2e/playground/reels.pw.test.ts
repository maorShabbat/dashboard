import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { Browser, Page } from 'playwright-core';
import { join } from 'node:path';
import { presetsOf } from '../../src/vfx/library';
import { ROOT, closeApps, hashAt, launchGl, makePng, openApp, openPreset, serveStatic, settleApp, setNum, tab, type Served } from './harness';

let browser: Browser, srv: Served;
beforeAll(async () => { srv = await serveStatic(join(ROOT, 'dist/playground'), 'playground.html'); browser = await launchGl(); });
afterAll(async () => { await browser?.close(); await srv?.close(); });
afterEach(async () => { await closeApps(); });

const duration = (page: Page) => page.evaluate(() => window.__vfx!.duration());
type Doc = { scene: { elements: { id: string; kind: string; cols?: number; rows?: number; symbols?: { asset: string; role: string }[]; params?: Record<string, unknown> }[]; fx: { id: string; effect: string; target?: string }[] } };
const doc = (page: Page) => page.evaluate(() => JSON.parse(JSON.stringify({ scene: (window as unknown as { __vfxApp: { store: { doc: { scene: unknown } } } }).__vfxApp.store.doc.scene })) as Doc);

describe('reels in the library', () => {
  it('the new groups are there with their presets', async () => {
    const app = await openApp(browser, srv.url);
    const { page } = app;
    const heads = async (cat: string) => { await page.getByTestId(`cat-${cat}`).click(); return page.locator('h3.group').evaluateAll((hs) => hs.map((h) => h.getAttribute('data-testid')!.replace('group-', ''))); };
    expect(await heads('symbol-transformation')).toEqual(expect.arrayContaining(['Reel spins', 'Special symbols']));
    expect(await page.locator('[data-testid^="card-symbol-transformation.spin-"]').count()).toBeGreaterThanOrEqual(8);
    expect(await heads('impacts')).toEqual(expect.arrayContaining(['Reel landings', 'Board hits', 'Board elements']));
    expect(await heads('shine')).toEqual(expect.arrayContaining(['Win lines and spotlights', 'Board glows', 'Board themes']));
    expect(await page.locator('[data-testid^="card-shine.board-glow-"]').count()).toBe(20);
    expect(await page.locator('[data-testid^="card-shine.board-theme-"]').count()).toBe(16);
    expect(app.errors).toEqual([]);
  });
});

describe('editing a reel board', () => {
  it('changes its size, symbols and spin the way a person would, and the picture follows', async () => {
    const app = await openApp(browser, srv.url);
    const { page } = app;
    await openPreset(page, 'symbol-transformation.spin-classic');
    await tab(page, 'content');
    await page.getByTestId('reels-section-board').waitFor();
    const D = await duration(page);
    const rest = () => hashAt(page, D - 0.1), spinning = () => hashAt(page, 0.9);
    const base = { rest: await rest(), spinning: await spinning() };
    expect(base.rest).not.toBe(base.spinning);

    // more reels
    await setNum(page, 'board-cols-board', 6);
    await settleApp(page);
    expect((await doc(page)).scene.elements.find((e) => e.kind === 'board')!.cols).toBe(6);
    expect(await rest(), 'six reels draw a different picture').not.toBe(base.rest);
    await setNum(page, 'board-cols-board', 5);

    // another picture for the first symbol, taken from the built-ins
    await page.getByTestId('symbol-asset-board-0').selectOption('builtin:gem');
    await settleApp(page);
    expect((await doc(page)).scene.elements.find((e) => e.kind === 'board')!.symbols![0]!.asset).toBe('builtin:gem');

    // a symbol of your own
    await page.getByTestId('symbol-file-board-1').setInputFiles({ name: 'mine.png', mimeType: 'image/png', buffer: makePng(96, [40, 200, 90]) });
    await page.waitForFunction(() => { const d = (window as unknown as { __vfxApp: { store: { doc: { scene: { elements: { kind: string; symbols?: { asset: string }[] }[] } } } } }).__vfxApp.store.doc.scene; return !d.elements.find((e) => e.kind === 'board')!.symbols![1]!.asset.startsWith('builtin:'); });
    await settleApp(page);
    const mine = (await doc(page)).scene.elements.find((e) => e.kind === 'board')!.symbols![1]!.asset;
    expect(mine).not.toMatch(/^builtin:/);
    const withMine = await rest();
    expect(withMine).not.toBe(base.rest);

    // a role
    await page.getByTestId('symbol-role-board-0').selectOption('wild');
    expect((await doc(page)).scene.elements.find((e) => e.kind === 'board')!.symbols![0]!.role).toBe('wild');

    // another way of spinning
    await page.getByTestId('board-board-spin').selectOption('drum');
    await settleApp(page);
    expect(await spinning(), 'a drum spins differently').not.toBe(base.spinning);

    // one more symbol, and one fewer
    const n0 = (await doc(page)).scene.elements.find((e) => e.kind === 'board')!.symbols!.length;
    await page.getByTestId('symbol-add-board').click();
    expect((await doc(page)).scene.elements.find((e) => e.kind === 'board')!.symbols!.length).toBe(n0 + 1);
    await page.getByTestId(`symbol-remove-board-${n0}`).click();
    expect((await doc(page)).scene.elements.find((e) => e.kind === 'board')!.symbols!.length).toBe(n0);
    expect(app.errors).toEqual([]);
  });

  it('+ Reels adds a board to any effect, and board effects aim at it', async () => {
    const app = await openApp(browser, srv.url);
    const { page } = app;
    await openPreset(page, presetsOf('text-styling')[0]!.id);
    await tab(page, 'effects');
    await page.getByTestId('fx-add-boardonly').selectOption('board.shake');
    await page.locator('[data-testid$="-needs-board"]').waitFor();
    await tab(page, 'content');
    await page.getByTestId('add-reels').click();
    await settleApp(page);
    await tab(page, 'effects');
    expect(await page.locator('[data-testid$="-needs-board"]').count(), 'the warning goes once a board exists').toBe(0);
    const d = await doc(page);
    const board = d.scene.elements.find((e) => e.kind === 'board')!;
    const sel = page.locator('[data-testid$="-target"]').first();
    await sel.selectOption(board.id);
    await settleApp(page);
    expect((await doc(page)).scene.fx.find((f) => f.effect === 'board.shake')!.target).toBe(board.id);
    // a new board effect added now is aimed at the board straight away
    await page.getByTestId('fx-add-boardonly').selectOption('board.glow');
    expect((await doc(page)).scene.fx.find((f) => f.effect === 'board.glow')!.target).toBe(board.id);
    expect(app.errors).toEqual([]);
  });

  it('the board-only effects change the grid and not the background', async () => {
    const app = await openApp(browser, srv.url);
    const { page } = app;
    await openPreset(page, 'impacts.board-frozen-shatter');
    const D = await duration(page);
    const withFx = await hashAt(page, D * 0.55);
    await tab(page, 'effects');
    await page.locator('[data-testid$="-on"]').first().uncheck();
    await settleApp(page);
    const without = await hashAt(page, D * 0.55);
    expect(withFx).not.toBe(without);
    expect(app.errors).toEqual([]);
  });
});
