import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { Browser, Page } from 'playwright-core';
import { join } from 'node:path';
import { readFileSync, rmSync } from 'node:fs';
import { readZip } from '../../src/core/util/zip';
import { verifyBundle } from '../../src/vfx/export/verify';
import { planBoard } from '../../src/vfx/model/board';
import type { BoardElement } from '../../src/vfx/model/scene';
import { OUT, ROOT, bundleHashes, closeApps, hashAt, haveFfmpeg, labHashes, launchGl, makeAlphaWebm, openApp, openPreset, serveBundle, serveStatic, settleApp, tab, type Served } from './harness';

let browser: Browser, srv: Served;
beforeAll(async () => { srv = await serveStatic(join(ROOT, 'dist/playground'), 'playground.html'); browser = await launchGl(); });
afterAll(async () => { await browser?.close(); await srv?.close(); });
afterEach(async () => { await closeApps(); });

type Sym = { asset: string; role: string; expand?: { asset: string; fit: string; play: string } };
type SceneLite = { assets: { id: string; kind: string }[]; elements: { id: string; kind: string; symbols?: Sym[]; params?: Record<string, unknown> }[]; fx: { effect: string }[] };
const sceneOf = (page: Page) => page.evaluate(() => JSON.parse(JSON.stringify((window as unknown as { __vfxApp: { store: { doc: { scene: unknown } } } }).__vfxApp.store.doc.scene)) as SceneLite);
const boardOf = async (page: Page) => (await sceneOf(page)).elements.find((e) => e.kind === 'board')!;
const wildIndex = async (page: Page) => (await boardOf(page)).symbols!.findIndex((s) => s.role === 'wild');
/** The moment the wild starts to expand, in scene seconds, from the board as it is now. */
const expandAt = async (page: Page): Promise<number | null> => {
  const b = await boardOf(page);
  const plan = planBoard(b as unknown as BoardElement);
  return plan.expand ? plan.expand.at + ((b as unknown as BoardElement).start ?? 0) : null;
};

describe('an expanding wild plays an animation of its own', () => {
  it('the animations that ship are drawn over the wild\'s reel while it expands, frame by frame, and the wild\'s own picture is not stretched any more', async () => {
    const a = await openApp(browser, srv.url);
    const { page } = a;
    await openPreset(page, 'symbol-transformation.expwild-fire');
    const b = await boardOf(page);
    const i = b.symbols!.findIndex((s) => s.role === 'wild');
    expect(b.symbols![i]!.expand).toMatchObject({ asset: 'builtin:wild-fire-column.webm', fit: 'fill', play: 'natural' });
    expect(b.params!.expandTime).toBeCloseTo(1.9, 2);
    await settleApp(page);
    const t0 = (await expandAt(page)) ?? 3.3;
    const during = [t0 + 0.2, t0 + 0.7, t0 + 1.4, t0 + 2.4];
    const withAnim: string[] = [];
    for (const t of during) withAnim.push(await hashAt(page, t));
    expect(new Set(withAnim).size, 'the animation moves while the wild expands').toBe(withAnim.length);

    // take the animation away: the same moments now show the stretched picture
    await tab(page, 'content');
    await page.getByTestId(`symbol-expand-clear-board-${i}`).click();
    await settleApp(page);
    expect((await boardOf(page)).symbols![i]!.expand).toBeUndefined();
    const plain = await hashAt(page, during[2]!);
    expect(plain, 'without the animation the picture is different').not.toBe(withAnim[2]);
    expect(a.errors).toEqual([]);
  });

  it('your own transparent WebM is used while the wild expands: the expansion takes as long as the animation, it plays frame by frame, and it goes into JSON and bundle exports', async () => {
    if (!haveFfmpeg()) { console.warn('ffmpeg not found: expanding wild WebM test skipped'); return; }
    const webm = join(OUT, 'alpha-expand.webm');
    makeAlphaWebm(webm);
    const a = await openApp(browser, srv.url);
    const { page } = a;
    await openPreset(page, 'symbol-transformation.expanding-wild');
    await settleApp(page);
    const i = await wildIndex(page);
    const D = await page.evaluate(() => window.__vfx!.duration());
    const t0 = (await expandAt(page)) ?? 3.0;
    const before = await hashAt(page, t0 + 0.4);
    expect((await boardOf(page)).params!.expandTime ?? 0.55).toBeCloseTo(0.55, 2);

    await tab(page, 'content');
    await page.getByTestId(`symbol-expand-file-board-${i}`).setInputFiles(webm);
    await page.waitForFunction(() => { const s = (window as unknown as { __vfxApp: { store: { doc: { scene: { elements: { kind: string; symbols?: { expand?: unknown }[] }[] } } } } }).__vfxApp.store.doc.scene; return s.elements.find((e) => e.kind === 'board')!.symbols!.some((x) => x.expand); }, undefined, { timeout: 60000 });
    await settleApp(page);
    const b = await boardOf(page);
    expect(b.symbols![i]!.expand).toMatchObject({ fit: 'grow', play: 'natural' });
    expect(b.symbols![i]!.expand!.asset).not.toMatch(/^builtin:/);
    expect(Number(b.params!.expandTime), 'the expansion lasts as long as the animation').toBeGreaterThan(0.9);
    expect(Number(b.params!.expandTime)).toBeLessThan(1.3);
    expect((await sceneOf(page)).assets.some((x) => x.kind === 'webm')).toBe(true);

    const Dn = await page.evaluate(() => window.__vfx!.duration());
    expect(Dn, 'the sequence is never shorter than before').toBeGreaterThanOrEqual(D);
    expect(planBoard((await boardOf(page)) as unknown as BoardElement).expand!.dur, 'the plan expands for as long as the animation lasts').toBeGreaterThan(0.9);
    const samples: string[] = [];
    for (const dt of [0.15, 0.4, 0.7, 1.0]) samples.push(await hashAt(page, t0 + dt));
    expect(new Set(samples).size, 'the frames of the animation advance').toBe(samples.length);
    expect(samples).not.toContain(before);

    // it can be made to cover the reel from the first frame, and to play fitted to the expansion time
    await page.getByTestId(`symbol-expand-fit-board-${i}`).selectOption('fill');
    await page.getByTestId(`symbol-expand-play-board-${i}`).selectOption('fit');
    await settleApp(page);
    expect((await boardOf(page)).symbols![i]!.expand).toMatchObject({ fit: 'fill', play: 'fit' });
    const filled = await hashAt(page, t0 + 0.4);
    expect(filled).not.toBe(samples[1]);
    expect(a.errors).toEqual([]);

    // a bundle carries the WebM and plays it exactly as the playground does
    const FRACS = [0.45, 0.55, 0.65, 0.95];
    const want = []; for (const f of FRACS) want.push(await hashAt(page, f * Dn));
    await tab(page, 'export');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-bundle').click()]);
    const zipPath = join(OUT, `expand-${Date.now()}.zip`);
    await dl.saveAs(zipPath);
    const entries = await readZip(new Uint8Array(readFileSync(zipPath)));
    expect(verifyBundle(entries).problems).toEqual([]);
    const root = entries[0]!.path.split('/')[0]!;
    expect(entries.some((x) => x.path.startsWith(`${root}/assets/`) && x.path.endsWith('.webm'))).toBe(true);
    const preset = JSON.parse(new TextDecoder().decode(entries.find((x) => x.path === `${root}/preset.json`)!.data));
    expect(preset.scene.elements.find((e: { kind: string }) => e.kind === 'board').symbols.some((s: Sym) => s.expand?.fit === 'fill')).toBe(true);
    const sb = await serveBundle(entries);
    const played = await bundleHashes(a.ctx, sb.srv.origin, sb.srv.url, FRACS);
    expect(played.ready, played.errors.join('\n')).toBe(true);
    expect(played.external).toEqual([]);
    expect(played.hashes).toEqual(await labHashes(browser, srv.url, preset, FRACS, a.ctx));
    await sb.srv.close();
    rmSync(sb.dir, { recursive: true, force: true });
  });

  it('a bundle of a preset that uses a built-in animation carries it as a video the player can read', async () => {
    const a = await openApp(browser, srv.url);
    const { page } = a;
    await openPreset(page, 'symbol-transformation.expwild-plasma');
    await settleApp(page);
    await tab(page, 'export');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-bundle').click()]);
    const zipPath = join(OUT, `expand-builtin-${Date.now()}.zip`);
    await dl.saveAs(zipPath);
    const entries = await readZip(new Uint8Array(readFileSync(zipPath)));
    expect(verifyBundle(entries).problems).toEqual([]);
    const root = entries[0]!.path.split('/')[0]!;
    expect(entries.some((x) => x.path.startsWith(`${root}/assets/builtin/`) && x.path.includes('wild-plasma-column') && x.path.endsWith('.webm'))).toBe(true);
    const preset = JSON.parse(new TextDecoder().decode(entries.find((x) => x.path === `${root}/preset.json`)!.data));
    const D = await page.evaluate(() => window.__vfx!.duration());
    const FRACS = [0.5, 0.6, 0.7, 0.95];
    const sb = await serveBundle(entries);
    const played = await bundleHashes(a.ctx, sb.srv.origin, sb.srv.url, FRACS);
    expect(played.ready, played.errors.join('\n')).toBe(true);
    expect(played.hashes).toEqual(await labHashes(browser, srv.url, preset, FRACS, a.ctx));
    expect(D).toBeGreaterThan(5);
    await sb.srv.close();
    rmSync(sb.dir, { recursive: true, force: true });
  });
});
