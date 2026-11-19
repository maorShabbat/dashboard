import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser, Page } from 'playwright-core';
import { EFFECTS } from '../src/core/effects/registry';
import { frameHash, launch, openStudio, serveDir, type StaticServer } from './harness';

let browser: Browser;
let server: StaticServer;
beforeAll(async () => { server = await serveDir('dist/editor'); browser = await launch(); });
afterAll(async () => { await browser?.close(); await server?.close(); });

const row = (page: Page, prefix: string, key: string) => page.locator(`[data-testid="${prefix}-row-${key}"]`);

describe('presets inherit from the theme and show where each value comes from', () => {
  it('lists preset overrides with their source, resets one, and resets all to theme', async () => {
    const { ctx, page } = await openStudio(browser, server.url);
    await page.click('[data-testid="preset-item-preset_coin_rain"]');
    expect(await page.locator('[data-testid="link-panel"]').getAttribute('data-link')).toBe('linked');
    const count = row(page, 'preset', 'count');
    expect(await count.getAttribute('data-overridden')).toBe('true');
    expect(await count.getAttribute('data-source')).toBe('preset');
    expect(await count.locator('input[type="number"]').inputValue()).toBe('120');
    expect(await count.textContent()).toMatch(/overrides BANGERS default: 60/);
    await page.click('[data-testid="preset-reset-count"]');
    expect(await count.getAttribute('data-source')).toBe('bangers');
    expect(await count.locator('input[type="number"]').inputValue()).toBe('60');
    // a theme-level default flows into the preset until the preset overrides it
    await page.click('[data-testid="tab-theme"]');
    await page.click('[data-testid="section-effects"]');
    await page.click('[data-testid="effect-coinBurst"]');
    await row(page, 'fx-coinBurst', 'count').locator('input[type="number"]').fill('80');
    await page.click('[data-testid="tab-presets"]');
    expect(await count.getAttribute('data-source')).toBe('theme');
    expect(await count.locator('input[type="number"]').inputValue()).toBe('80');
    expect(await count.textContent()).toMatch(/inherits game theme/i);
    // reset-all-to-theme clears every preset override
    const n = await page.locator('[data-testid="preset-reset-all"]').textContent();
    expect(n).toMatch(/Reset all to theme/);
    await page.click('[data-testid="preset-reset-all"]');
    expect(await page.locator('[data-testid="preset-panel"] [data-overridden="true"]').count()).toBe(0);
    await ctx.close();
  });

  it('linked presets follow theme edits; an independent snapshot does not; relinking follows again', async () => {
    const { ctx, page } = await openStudio(browser, server.url);
    await page.click('[data-testid="preset-item-preset_confetti"]');
    const setTheme = async (colour: string | null) => {
      await page.click('[data-testid="tab-theme"]');
      await page.click('[data-testid="section-colors"]');
      const input = row(page, 'theme', 'color.primary');
      if (colour) await input.locator('input[type="text"]').fill(colour);
      else await page.click('[data-testid="theme-reset-color.primary"]');
      await page.click('[data-testid="tab-presets"]');
      await page.waitForTimeout(150);
    };
    const hash = () => frameHash(page, 420);
    const h0 = await hash();
    await setTheme('#00ffcc');
    const h1 = await hash();
    expect(h1).not.toBe(h0); // linked → follows the theme
    await setTheme(null);
    expect(await hash()).toBe(h0);

    await page.click('[data-testid="btn-detach"]');
    expect(await page.locator('[data-testid="link-panel"]').getAttribute('data-link')).toBe('snapshot');
    expect(await page.locator('[data-testid="preset-item-preset_confetti"]').textContent()).toMatch(/snapshot/);
    await setTheme('#00ffcc');
    expect(await hash()).toBe(h0); // snapshot → independent
    expect(await page.locator('[data-testid="drift"]').textContent()).toMatch(/1 difference/);

    await page.click('[data-testid="btn-relink"]');
    expect(await page.locator('[data-testid="link-panel"]').getAttribute('data-link')).toBe('linked');
    expect(await hash()).toBe(h1);
    await ctx.close();
  });

  it('edits sound cue markers on a preset and can reset them to the inherited ones', async () => {
    const { ctx, page } = await openStudio(browser, server.url);
    await page.click('[data-testid="preset-item-preset_heavy_impact"]');
    const cues = page.locator('[data-testid="preset-cues"]');
    expect(await cues.getAttribute('data-source')).toBe('bangers');
    expect(await cues.locator('[data-testid="preset-tick"]').count()).toBe(1);
    await page.click('[data-testid="preset-cue-add"]');
    expect(await cues.getAttribute('data-source')).toBe('preset');
    expect(await cues.locator('[data-testid="preset-tick"]').count()).toBe(2);
    await cues.locator('[data-testid="preset-cue-select"]').last().selectOption('win.big');
    expect(await cues.textContent()).toMatch(/win\.big/);
    await page.click('[data-testid="preset-cues-reset"]');
    expect(await cues.getAttribute('data-source')).toBe('bangers');
    expect(await cues.locator('[data-testid="preset-tick"]').count()).toBe(1);
    await ctx.close();
  });

  it('creates a new preset for any of the 12 effects', async () => {
    const { ctx, page } = await openStudio(browser, server.url);
    await page.click('[data-testid="new-preset"]');
    await page.selectOption('[data-testid="new-preset-type"]', 'shine');
    await page.fill('[data-testid="new-preset-name"]', 'Gold sweep');
    await page.click('[data-testid="new-preset-create"]');
    expect(await page.locator('[data-testid="asset-name"]').textContent()).toBe('Gold sweep');
    expect(await page.locator('[data-testid="preset-view"]').textContent()).toMatch(/Shine sweep/);
    expect(await page.locator('[data-testid="preset-list"] li').count()).toBe(7);
    // every parameter of the effect is editable at preset level
    expect(await page.locator('[data-testid="preset-panel"] [data-testid^="preset-row-"]').count()).toBe(EFFECTS.shine!.params.length);
    await ctx.close();
  });
});

describe('scene and repeat settings have resets too', () => {
  it('resets the preview scene to its defaults', async () => {
    const { ctx, page } = await openStudio(browser, server.url);
    expect(await page.locator('[data-testid="scene-reset"]').isDisabled()).toBe(true);
    await page.selectOption('[data-testid="board-select"]', 'classic-3x3');
    expect(await page.locator('[data-testid="scene-reset"]').isDisabled()).toBe(false);
    await page.click('[data-testid="scene-reset"]');
    expect(await page.locator('[data-testid="board-select"]').inputValue()).toBe('slots-5x3');
    expect(await page.locator('[data-testid="scene-reset"]').isDisabled()).toBe(true);
    await ctx.close();
  });
});

describe('layer controls and theme layers', () => {
  it('hides, solos and dims layers in the preview without changing the theme', async () => {
    const { ctx, page } = await openStudio(browser, server.url);
    const full = await frameHash(page, 1500);
    await page.click('[data-testid="layer-controls"] summary');
    await page.click('[data-testid="layer-eye-ui"]');
    const noUi = await frameHash(page, 1500);
    expect(noUi).not.toBe(full);
    await page.click('[data-testid="layer-eye-ui"]');
    expect(await frameHash(page, 1500)).toBe(full);
    await page.click('[data-testid="layer-solo-backdrop"]');
    const solo = await frameHash(page, 1500);
    expect(solo).not.toBe(full);
    expect(solo).not.toBe(noUi);
    // the theme itself was never modified
    expect(await page.locator('[data-testid="undo"]').isDisabled()).toBe(true);
    await ctx.close();
  });

  it('reorders layers persistently through explicit z tokens', async () => {
    const { ctx, page } = await openStudio(browser, server.url);
    await page.click('[data-testid="section-layers"]');
    expect(await page.locator('[data-testid="layer-order"] li').last().getAttribute('data-layer')).toBe('ui'); // listed bottom→top in the DOM; shown top-first
    await page.click('[data-testid="layer-down-ui"]');
    expect(await row(page, 'theme', 'layer.ui.z').getAttribute('data-overridden')).toBe('true');
    expect(await row(page, 'theme', 'layer.overlay.z').getAttribute('data-overridden')).toBe('true');
    await row(page, 'theme', 'layer.ui.opacity').locator('input[type="number"]').fill('50');
    await row(page, 'theme', 'layer.ui.blend').locator('select').selectOption('screen');
    expect(await row(page, 'theme', 'layer.ui.blend').getAttribute('data-source')).toBe('theme');
    await ctx.close();
  });
});
