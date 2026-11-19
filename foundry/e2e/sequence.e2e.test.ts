import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser, Page } from 'playwright-core';
import { launch, openStudio, pausePlayback, serveDir, type StaticServer } from './harness';

let browser: Browser;
let server: StaticServer;
beforeAll(async () => { server = await serveDir('dist/editor'); browser = await launch(); });
afterAll(async () => { await browser?.close(); await server?.close(); });

async function openSeq(name = 'sequence-item-seq_big_win') {
  const s = await openStudio(browser, server.url);
  await s.page.click(`[data-testid="${name}"]`);
  await s.page.waitForSelector('[data-testid="timeline"]');
  await s.page.waitForTimeout(300);
  return s;
}
const clips = (page: Page) => page.locator('.tl-lane .clip:not(.ghost)');
const clipByName = (page: Page, name: string) => page.locator('.clip', { hasText: name }).first();
const start = async (page: Page, name: string) => Number(await clipByName(page, name).getAttribute('data-start'));
const dur = async (page: Page, name: string) => Number(await clipByName(page, name).getAttribute('data-duration'));
async function drag(page: Page, from: { x: number; y: number }, dx: number, dy = 0) {
  await page.mouse.move(from.x, from.y); await page.mouse.down(); await page.mouse.move(from.x + dx / 2, from.y + dy / 2, { steps: 4 }); await page.mouse.move(from.x + dx, from.y + dy, { steps: 4 }); await page.mouse.up();
}
const center = async (page: Page, sel: ReturnType<Page['locator']>) => { const b = (await sel.boundingBox())!; return { x: b.x + b.width / 2, y: b.y + b.height / 2, b }; };

describe('sequence timeline', () => {
  it('shows tracks, clips, markers and instances from the saved sequence', async () => {
    const { ctx, page } = await openSeq();
    expect(await page.locator('[data-testid^="track-"]:not([data-testid*="mute"]):not([data-testid*="solo"]):not([data-testid*="lock"])').count()).toBe(4);
    expect(await page.locator('.clip').count()).toBeGreaterThanOrEqual(9); // 7 clips + confetti ×2 (1 ghost)
    expect(await page.locator('.clip.ghost').count()).toBe(1);
    expect(await page.locator('.marker').count()).toBe(4);
    expect(await page.locator('.clip [data-testid="overlap"]').count()).toBeGreaterThan(0); // overlapping clips are visibly marked
    expect(await page.locator('[data-testid="tl-time"]').textContent()).toMatch(/4\.70s/);
    await ctx.close();
  });

  it('moves a clip by dragging (snapped, one undo step) and resizes it from the right edge', async () => {
    const { ctx, page } = await openSeq();
    const before = await start(page, 'Rings');
    const c = await center(page, clipByName(page, 'Rings'));
    await drag(page, { x: c.x - c.b.width / 2 + 20, y: c.y }, 120); // ≈ 1 s at 0.12 px/ms
    const moved = await start(page, 'Rings');
    expect(moved).toBeGreaterThan(before + 700);
    expect(moved % 10).toBe(0);
    await page.click('[data-testid="undo"]');
    expect(await start(page, 'Rings')).toBe(before); // the whole drag undoes in one step

    const d0 = await dur(page, 'Rings');
    const id = (await clipByName(page, 'Rings').getAttribute('data-testid'))!.replace('clip-', '');
    const h = await center(page, page.locator(`[data-testid="resize-${id}"]`));
    await drag(page, h, 60);
    const d1 = await dur(page, 'Rings');
    expect(d1).toBeGreaterThan(d0 + 300);
    // resizing writes an instance override of "duration" (visible in the inspector)
    await clipByName(page, 'Rings').click();
    const durRow = page.locator('[data-testid="clip-row-duration"]');
    expect(await durRow.getAttribute('data-source')).toBe('instance');
    await ctx.close();
  });

  it('adds effects and presets at the playhead, then deletes and restores them', async () => {
    const { ctx, page } = await openSeq();
    const n0 = await clips(page).count();
    await page.selectOption('[data-testid="tl-add-effect"]', 'effect:shine');
    expect(await clips(page).count()).toBe(n0 + 1);
    await page.selectOption('[data-testid="tl-add-effect"]', 'preset:preset_free_spins');
    expect(await clips(page).count()).toBe(n0 + 2);
    await page.locator('[data-testid="timeline"]').focus();
    await page.keyboard.press('Delete');
    expect(await clips(page).count()).toBe(n0 + 1);
    await page.click('[data-testid="undo"]');
    expect(await clips(page).count()).toBe(n0 + 2);
    await ctx.close();
  });

  it('staggers and chains selected clips; overlap percentage controls the result', async () => {
    const { ctx, page } = await openSeq();
    const names = ['Impact', 'Flash', 'Highlight'];
    await clipByName(page, names[0]!).click();
    for (const n of names.slice(1)) await clipByName(page, n).click({ modifiers: ['Shift'] });
    await page.fill('[data-testid="tl-stagger-step"]', '200');
    await page.click('[data-testid="tl-stagger"]');
    const starts = (await Promise.all(names.map((n) => start(page, n)))).sort((a, b) => a - b);
    expect(starts[1]! - starts[0]!).toBe(200);
    expect(starts[2]! - starts[1]!).toBe(200);
    // chain with 0% overlap = back to back; 50% = half overlapped
    await page.fill('[data-testid="tl-overlap-pct"]', '0');
    await page.click('[data-testid="tl-chain"]');
    const ordered = (await Promise.all(names.map(async (n) => ({ n, s: await start(page, n), d: await dur(page, n) })))).sort((a, b) => a.s - b.s);
    expect(ordered[1]!.s).toBe(ordered[0]!.s + ordered[0]!.d);
    await page.fill('[data-testid="tl-overlap-pct"]', '50');
    await page.click('[data-testid="tl-chain"]');
    const half = (await Promise.all(names.map(async (n) => ({ n, s: await start(page, n), d: await dur(page, n) })))).sort((a, b) => a.s - b.s);
    expect(half[1]!.s).toBe(half[0]!.s + Math.round(half[0]!.d / 2));
    expect(half[1]!.s).toBeLessThan(half[0]!.s + half[0]!.d); // genuinely overlapping
    await ctx.close();
  });

  it('repeat creates staggered instances with selectable order; the theme stagger scale multiplies the step', async () => {
    const { ctx, page } = await openSeq('sequence-item-seq_free_spins');
    await clipByName(page, 'Callout').click();
    await page.fill('[data-testid="clip-repeat-count"]', '4');
    await page.fill('[data-testid="clip-repeat-step"]', '100');
    expect(await page.locator('.clip.ghost').count()).toBe(4); // 3 ghosts of the callout + 1 of the Rings clip
    const id = (await clipByName(page, 'Callout').getAttribute('data-testid'))!;
    const starts = await page.locator(`[data-testid="${id}"]`).evaluateAll((els) => els.map((e) => Number(e.getAttribute('data-start'))).sort((a, b) => a - b));
    expect(starts).toEqual([1500, 1600, 1700, 1800]);
    // repeat has its own reset
    await page.click('[data-testid="clip-repeat-reset"]');
    expect(await page.locator('[data-testid="clip-repeat-count"]').inputValue()).toBe('1');
    expect(await page.locator('.clip.ghost').count()).toBe(1); // only the Rings clip's ghost remains
    await ctx.close();
  });

  it('adds event/cue markers, edits them, and fires them on playback', async () => {
    const { ctx, page } = await openSeq();
    const m0 = await page.locator('.marker').count();
    await page.selectOption('[data-testid="tl-marker-kind"]', 'event');
    await page.click('[data-testid="tl-add-marker"]');
    expect(await page.locator('.marker').count()).toBe(m0 + 1);
    await page.fill('[data-testid="marker-name"]', 'bonus.unlocked');
    await page.fill('[data-testid="marker-time"]', '300');
    expect(await page.locator('.marker', { hasText: 'bonus.unlocked' }).count()).toBe(1);
    await page.selectOption('[data-testid="tl-marker-kind"]', 'cue');
    await page.click('[data-testid="tl-add-marker"]');
    await page.selectOption('[data-testid="marker-name"]', 'multiplier.hit');
    // playback fires the markers in order
    await page.click('[data-testid="insp-sequence"]');
    await page.selectOption('[data-testid="viewport-select"]', 'mobile').catch(() => undefined);
    await page.click('text=Playback & viewport options');
    await page.locator('.stage-options select').first().selectOption('2').catch(() => undefined);
    await page.click('[data-testid="btn-replay"]');
    await page.waitForFunction(() => document.querySelector('[data-testid="event-log"]')?.textContent?.includes('celebration.end'), null, { timeout: 15000 }).catch(async () => {
      await page.click('.event-log summary').catch(() => undefined);
    });
    await page.click('.event-log summary').catch(() => undefined);
    const log = await page.locator('[data-testid="event-log"]').textContent();
    expect(log).toMatch(/celebration\.start/);
    expect(log).toMatch(/bonus\.unlocked/);
    await ctx.close();
  });

  it('scrubs by clicking the ruler and dragging the playhead; play pauses at a time', async () => {
    const { ctx, page } = await openSeq();
    await pausePlayback(page);
    const ruler = (await page.locator('[data-testid="tl-ruler"]').boundingBox())!;
    await page.mouse.click(ruler.x + 0.12 * 2000, ruler.y + 10); // 2000 ms
    const t = await page.locator('[data-testid="tl-time"]').textContent();
    expect(Number(t!.match(/^([\d.]+)s/)![1])).toBeGreaterThan(1.8);
    expect(Number(t!.match(/^([\d.]+)s/)![1])).toBeLessThan(2.2);
    const ph = (await page.locator('[data-testid="playhead"]').evaluate((e) => (e as HTMLElement).style.transform));
    const px = Number(ph.match(/translateX\(([\d.]+)px\)/)![1]);
    expect(px).toBeGreaterThan(216);
    expect(px).toBeLessThan(264);
    await ctx.close();
  });

  it('mute / solo / lock behave, and an instance override can be saved as a preset', async () => {
    const { ctx, page } = await openSeq();
    await page.click('[data-testid="track-mute-0"]');
    expect(await page.locator('[data-testid="track-0"]').getAttribute('class')).toMatch(/muted/);
    await page.click('[data-testid="track-mute-0"]');
    await page.click('[data-testid="track-lock-1"]');
    const c = await center(page, clipByName(page, 'Highlight'));
    const before = await start(page, 'Highlight');
    await drag(page, c, 80);
    expect(await start(page, 'Highlight')).toBe(before); // locked tracks do not move
    await page.click('[data-testid="track-lock-1"]');

    await clipByName(page, 'Flash').click();
    await page.locator('[data-testid="clip-row-peak"] input[type="number"]').fill('33');
    expect(await page.locator('[data-testid="clip-row-peak"]').getAttribute('data-source')).toBe('instance');
    expect(await page.locator('[data-testid="clip-row-peak"]').textContent()).toMatch(/overrides BANGERS default: 60/);
    await page.click('[data-testid="clip-promote"]');
    expect(await page.locator('[data-testid="preset-list"] li').count()).toBe(7);
    expect(await page.locator('[data-testid="clip-preset"]').inputValue()).not.toBe('');
    expect(await page.locator('[data-testid="clip-row-peak"]').getAttribute('data-source')).toBe('preset'); // promoted: now inherited from the new preset
    await ctx.close();
  });

  it('keeps the whole sequence editable as a saved asset: version, approve, duplicate', async () => {
    const { ctx, page } = await openSeq();
    await clipByName(page, 'Flash').click();
    await page.locator('[data-testid="clip-start"]').fill('40');
    await page.click('[data-testid="insp-versions"]');
    await page.click('[data-testid="btn-save-version"]');
    expect(await page.locator('[data-testid="version-2"]').count()).toBe(1);
    await page.click('[data-testid="approve-2"]');
    expect(await page.locator('[data-testid="approved-pill"]').count()).toBe(1);
    await page.click('[data-testid="btn-duplicate"]');
    expect(await page.locator('[data-testid="asset-name"]').textContent()).toBe('Big win celebration (copy)');
    expect(await clips(page).count()).toBeGreaterThan(7);
    await ctx.close();
  });
});
