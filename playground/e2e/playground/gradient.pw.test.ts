import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { Browser, Page } from 'playwright-core';
import { join } from 'node:path';
import { presetsOf, builtinPresets } from '../../src/vfx/library';
import { effectById } from '../../src/vfx/fx';
import { defaultsOf } from '../../src/vfx/fx/effect';
import { ROOT, closeApps, hashLate, launchGl, openApp, openPreset, serveStatic, settleApp, setNum, tab, type Served } from './harness';

let browser: Browser, srv: Served;
beforeAll(async () => { srv = await serveStatic(join(ROOT, 'dist/playground'), 'playground.html'); browser = await launchGl(); });
afterAll(async () => { await browser?.close(); await srv?.close(); });
afterEach(async () => { await closeApps(); });

const TEXT = presetsOf('text-styling')[0]!.id;
const FACE = 'style-face-grad';

/** Applies each action and requires the picture to change; returns what failed. */
async function steps(page: Page, list: [string, () => Promise<void>][], frac = 0.85): Promise<string[]> {
  const bad: string[] = [];
  let prev = await hashLate(page, frac);
  for (const [name, act] of list) {
    await act();
    const h = await hashLate(page, frac);
    if (h === prev) bad.push(name);
    prev = h;
  }
  return bad;
}
const stopsIn = (page: Page, id = FACE) => page.getByTestId(id).getByTestId(`${id}-stop`).count();

describe('gradient editor changes what is drawn', () => {
  it('every control of the face gradient affects the output', async () => {
    const { page, errors } = await openApp(browser, srv.url);
    await openPreset(page, TEXT);
    await tab(page, 'look');
    const g = (t: string) => page.getByTestId(`${FACE}-${t}`);
    await g('preset-rainbow').click();

    const bad = await steps(page, [
      ['kind radial', () => g('kind-radial').click()],
      ['radial centre x', () => setNum(page, `${FACE}-cx`, 0.2)],
      ['radial centre y', () => setNum(page, `${FACE}-cy`, 0.8)],
      ['radial radius', () => setNum(page, `${FACE}-radius`, 0.4)],
      ['kind conic', () => g('kind-conic').click()],
      ['conic start angle', () => setNum(page, `${FACE}-angle`, 90)],
      ['conic centre x', () => setNum(page, `${FACE}-cx`, 0.7)],
      ['kind reflected', () => g('kind-reflected').click()],
      ['reflected angle', () => setNum(page, `${FACE}-angle`, 20)],
      ['kind linear', () => g('kind-linear').click()],
      ['linear angle', () => setNum(page, `${FACE}-angle`, 135)],
      ['scale', () => setNum(page, `${FACE}-scale`, 2.5)],
      ['repeat', () => setNum(page, `${FACE}-repeat`, 3)],
      ['mirror repeats', () => g('reflect').click()],
      ['phase', () => setNum(page, `${FACE}-phase`, 0.3)],
    ]);
    expect(bad, `controls with no visible effect: ${bad.join(', ')}`).toEqual([]);
    expect(errors).toEqual([]);
  });

  it('stops: colour, exact position, opacity, add, duplicate, reverse, distribute and delete', async () => {
    const { page } = await openApp(browser, srv.url);
    await openPreset(page, TEXT);
    await tab(page, 'look');
    const g = (t: string) => page.getByTestId(`${FACE}-${t}`);
    await g('preset-gold').click();
    await g('kind-linear').click();
    await setNum(page, `${FACE}-angle`, 90);
    const n0 = await stopsIn(page);
    expect(n0).toBeGreaterThanOrEqual(3);

    const hexOfStop = page.getByTestId(FACE).getByLabel('Stop colour hex');
    const bad = await steps(page, [
      ['stop colour', async () => { await hexOfStop.fill('#00ff66'); }],
      ['stop position (exact %)', async () => { await g('pos').fill('20'); }],
      ['stop opacity', () => setNum(page, `${FACE}-alpha`, 0.25)],
      ['reverse', () => g('reverse').click()],
      ['distribute evenly', () => g('distribute').click()],
    ]);
    expect(bad, bad.join(', ')).toEqual([]);

    // add (double-click on the bar), duplicate and delete change the number of stops
    const bar = page.getByTestId(FACE).locator('.ge-bar');
    const box = (await bar.boundingBox())!;
    await bar.dblclick({ position: { x: box.width * 0.37, y: 10 } });
    expect(await stopsIn(page)).toBe(n0 + 1);
    await g('dup').click();
    expect(await stopsIn(page)).toBe(n0 + 2);
    const beforeDelete = await hashLate(page);
    await hexOfStop.fill('#ff00ff');
    expect(await hashLate(page), 'a stop added by double-click is a real stop').not.toBe(beforeDelete);
    await g('del').click();
    expect(await stopsIn(page)).toBe(n0 + 1);
    // cannot delete down to fewer than two stops
    for (let i = 0; i < 6; i++) { if (await g('del').isDisabled()) break; await g('del').click(); }
    expect(await stopsIn(page)).toBe(2);
    expect(await g('del').isDisabled()).toBe(true);

    // dragging a stop moves it
    const stop = page.getByTestId(FACE).getByTestId(`${FACE}-stop`).first();
    const sb = (await stop.boundingBox())!;
    const before = await g('pos').inputValue();
    await page.mouse.move(sb.x + sb.width / 2, sb.y + sb.height / 2);
    await page.mouse.down();
    await page.mouse.move(sb.x + sb.width / 2 + 60, sb.y + sb.height / 2, { steps: 6 });
    await page.mouse.up();
    expect(await g('pos').inputValue()).not.toBe(before);
  });

  it('animated gradients move with time, with speed, direction and loop controlling them', async () => {
    const { page } = await openApp(browser, srv.url);
    await openPreset(page, TEXT);
    await tab(page, 'look');
    const g = (t: string) => page.getByTestId(`${FACE}-${t}`);
    // take away the preset's own idle motion and shine, so only the gradient can change the picture over time
    await page.evaluate(() => { const st = (window as unknown as { __vfxApp: { store: { edit(f: (s: { elements: { motion: { idle?: unknown }; shine?: { enabled: boolean } }[] }) => void): void } } }).__vfxApp.store; st.edit((sc) => { for (const e of sc.elements) { delete e.motion.idle; if (e.shine) e.shine.enabled = false; } }); });
    await g('preset-gold').click();
    const D = await page.evaluate(() => window.__vfx!.duration());
    const at = async (f: number) => hashLate(page, f);

    // still gradient: nothing moves between two late moments
    await g('kind-linear').click();
    const s1 = await at(0.8), s2 = await at(0.95);
    expect(s1, 'a still gradient on still text does not change over time').toBe(s2);
    // animation on: the same two moments now differ
    await g('anim').check();
    await setNum(page, `${FACE}-speed`, 0.7);
    const a1 = await at(0.8), a2 = await at(0.95);
    expect(a1).not.toBe(a2);
    expect(a1, 'turning animation on changes the picture').not.toBe(s1);
    // direction
    await g('direction').selectOption('reverse');
    const r1 = await at(0.8);
    expect(r1).not.toBe(a1);
    await g('direction').selectOption('forward');
    expect(await at(0.8)).toBe(a1);
    // speed
    await setNum(page, `${FACE}-speed`, 1.9);
    expect(await at(0.8)).not.toBe(a1);
    // one sweep then rest: after the sweep has finished the picture holds still
    await g('loop').selectOption('once');
    await setNum(page, `${FACE}-speed`, 3);
    expect(D * 0.8).toBeGreaterThan(1 / 3 + 0.2);
    expect(await at(0.8)).toBe(await at(0.95));
    // keep going / back and forth keep moving
    await g('loop').selectOption('pingpong');
    await setNum(page, `${FACE}-speed`, 0.9);
    expect(await at(0.8)).not.toBe(await at(0.95));
  });

  it('the seven presets are distinct, and editable after applying', async () => {
    const { page } = await openApp(browser, srv.url);
    await openPreset(page, TEXT);
    await tab(page, 'look');
    const seen = new Map<string, string>();
    for (const id of ['gold', 'chrome', 'neon', 'rainbow', 'fire', 'ice', 'alien']) {
      await page.getByTestId(`${FACE}-preset-${id}`).click();
      seen.set(id, await hashLate(page));
    }
    expect(new Set(seen.values()).size, JSON.stringify([...seen.keys()])).toBe(7);
    // an applied preset is editable: it is only a starting point
    await page.getByTestId(`${FACE}-preset-gold`).click();
    const before = await hashLate(page);
    await page.getByTestId(FACE).getByLabel('Stop colour hex').fill('#2244ff');
    expect(await hashLate(page)).not.toBe(before);
    expect(await page.evaluate(() => window.__vfx !== undefined)).toBe(true);
  });

  it('gradients apply independently to the face, each outline, extrusion, glow and an image mask', async () => {
    const { page, errors } = await openApp(browser, srv.url);
    await openPreset(page, TEXT);
    await tab(page, 'look');
    const open = (id: string) => page.getByTestId(id).locator('summary').first().click();
    await open('style-outlines');
    await open('style-extrusion');
    await open('style-glow');
    await page.getByTestId('style-extrusion-on').check();
    await page.getByTestId('style-glow-on').check();
    // outline 0 and 1 (add a second if needed)
    if (await page.getByTestId('style-outline-1-on').count() === 0) await page.getByTestId('style-outline-add').click();
    await page.getByTestId('style-outlines').locator('summary', { hasText: 'Outline 2' }).click();
    const targets = ['style-face-grad', 'style-outline-0-grad', 'style-outline-1-grad', 'style-extrusion-grad', 'style-glow-grad'];
    const results: Record<string, boolean> = {};
    for (const [i, t] of targets.entries()) {
      const before = await hashLate(page);
      await page.getByTestId(`${t}-preset-${['rainbow', 'fire', 'ice', 'neon', 'alien'][i]}`).scrollIntoViewIfNeeded();
      await page.getByTestId(`${t}-preset-${['rainbow', 'fire', 'ice', 'neon', 'alien'][i]}`).click();
      results[t] = (await hashLate(page)) !== before;
    }
    expect(results).toEqual(Object.fromEntries(targets.map((t) => [t, true])));

    // an icon: replace its colours with a gradient (the image's own shape is the mask)
    const icon = presetsOf('symbol-destruction')[0]!.id;
    await openPreset(page, icon);
    await tab(page, 'content');
    await tab(page, 'look');
    if (await page.getByTestId('image-look-select').count()) {
      await page.getByTestId('image-look').locator('summary').first().click();
      const base = await hashLate(page, 0.05);
      await page.getByTestId('image-look-select').selectOption('gradient');
      const g1 = await hashLate(page, 0.05);
      expect(g1, 'gradient replaces the picture colours').not.toBe(base);
      await setNum(page, 'image-grad-angle', 10);
      expect(await hashLate(page, 0.05)).not.toBe(g1);
    }
    expect(errors).toEqual([]);
  });

  it('an effect layer can be recoloured with a gradient ramp: it changes the effect, moves with its animation and survives export and import', async () => {
    // a preset whose effect has colour settings (so a ramp is offered) and is clearly visible partway through
    const pick = ['shine', 'impacts', 'messages'].flatMap((c) => presetsOf(c as never)).find((p) => p.scene.fx.some((l) => ['light.rays', 'light.flare', 'light.sparkle', 'celebrate.confetti', 'particles', 'shockwave'].includes(l.effect) && effectById(l.effect)?.params.some((d) => d.kind === 'color')))
      ?? builtinPresets().find((p) => p.scene.fx.some((l) => effectById(l.effect)?.params.some((d) => d.kind === 'color')))!;
    const layer = pick.scene.fx.find((l) => effectById(l.effect)?.params.some((d) => d.kind === 'color'))!;
    const e = effectById(layer.effect)!;
    const t = layer.start + 0.4 * e.duration({ ...defaultsOf(e), ...layer.params });
    const { page, errors } = await openApp(browser, srv.url);
    await openPreset(page, pick.id);
    await tab(page, 'effects');
    const at = async (tt = t) => { await settleApp(page); return page.evaluate((x) => window.__vfx!.settle(x), tt); };
    const before = await at();
    await page.getByTestId(`fx-${layer.id}-ramp-section`).locator('summary').click();
    await page.getByTestId(`fx-${layer.id}-ramp-on`).check();
    const fire = await at();
    expect(fire, 'the ramp recolours the effect').not.toBe(before);
    await page.getByTestId(`fx-${layer.id}-ramp-preset-ice`).click();
    const ice = await at();
    expect(ice).not.toBe(fire);
    expect(ice).not.toBe(before);
    // simple ramp editor: no type / angle / centre controls, but stops, stretch, repeat, mirror, phase, animation
    expect(await page.getByTestId(`fx-${layer.id}-ramp-kind-linear`).count()).toBe(0);
    expect(await page.getByTestId(`fx-${layer.id}-ramp-angle`).count()).toBe(0);
    await page.getByTestId(`fx-${layer.id}-ramp`).getByTestId(`fx-${layer.id}-ramp-stop`).last().click();   // the bright end, where a hot effect samples
    await page.getByTestId(`fx-${layer.id}-ramp`).getByLabel('Stop colour hex').fill('#00ff00');
    const green = await at();
    expect(green).not.toBe(ice);
    await page.getByTestId(`fx-${layer.id}-ramp-scale-num`).fill('2.5');
    await page.getByTestId(`fx-${layer.id}-ramp-scale-num`).press('Enter');
    const stretched = await at();
    expect(stretched).not.toBe(green);
    await page.getByTestId(`fx-${layer.id}-ramp-anim`).check();
    await setNum(page, `fx-${layer.id}-ramp-speed`, 1);
    const a1 = await at(t), a2 = await at(t + 0.05);
    expect(a1).not.toBe(a2);

    // export, import into a fresh browser, same frames
    await tab(page, 'export');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-json').click()]);
    const path = join(ROOT, 'playground-out/e2e', `ramp-${Date.now()}.json`);
    await dl.saveAs(path);
    const file = JSON.parse((await import('node:fs')).readFileSync(path, 'utf8'));
    const saved = file.preset.scene.fx.find((l: { id: string }) => l.id === layer.id);
    expect(saved.ramp.anim.enabled).toBe(true);
    expect(saved.ramp.stops.length).toBeGreaterThanOrEqual(2);
    const want = [await at(t), await at(t + 0.05)];
    const b = await openApp(browser, srv.url);
    await b.page.getByTestId('top-import-file').setInputFiles(path);
    await b.page.getByTestId('stage-canvas').waitFor();
    await settleApp(b.page);
    const got = [await b.page.evaluate((x) => window.__vfx!.settle(x), t), await b.page.evaluate((x) => window.__vfx!.settle(x), t + 0.05)];
    expect(got).toEqual(want);
    expect(errors).toEqual([]);

    // switching it off restores the original colours
    await page.getByTestId('tab-effects').click();
    await page.getByTestId(`fx-${layer.id}-ramp-section`).locator('summary').click();
    await page.getByTestId(`fx-${layer.id}-ramp-on`).uncheck();
    expect(await at()).toBe(before);
  });
});
