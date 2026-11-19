import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { FEATURE_HUD_SVELTE, patchFeatureEvents, BET_MODE_META_TS, buildFrontend, patchAssetUrls, LOADER_SVELTE, patchAppHtml, patchSpriteLang, SPRITE_LANG_TS, VITE_CONFIG_JS, WEBFONT_STUB_TS, MODALS_SVELTE, patchGame, RULES_MODAL_SVELTE, patchLayout, renderFrontConfig, renderStringsModule } from '../foundry/compiler/frontend';
import { compile } from '../foundry/compiler/compile';
import type { GameConfig } from '../foundry/compiler/config';

const WEBSDK = process.env.FOUNDRY_WEBSDK ?? '/home/user/engineio/web-sdk';
const scatter = path.join(WEBSDK, 'apps/scatter');
const have = fs.existsSync(path.join(scatter, 'src/routes/+layout.svelte'));
const cfg = (): GameConfig => JSON.parse(fs.readFileSync(path.resolve(__dirname, '../foundry/examples/t1-demo.config.json'), 'utf8'));

describe('frontend generator', () => {
  it('renders the config and strings modules', () => {
    expect(renderFrontConfig({ gameID: 'g', numReels: 6 })).toMatch(/^\/\/ Generated.*\nexport default \{\n\t"gameID": "g",/);
    const m = renderStringsModule({ a: 'bet' }, { a: 'play' });
    expect(m).toContain('export const strings');
    expect(m).toContain('export const sweepsStrings');
    expect(m).toContain('"play"');
  });

  it('the loader placeholder is a plain overlay with no Stake Engine branding', () => {
    expect(LOADER_SVELTE).not.toMatch(/stake/i);
    expect(LOADER_SVELTE).toContain('role="status"');
  });

  it('the rules modal renders keyed strings, switches to the social wording and has no placeholder text', () => {
    expect(RULES_MODAL_SVELTE).toContain('stateUrlDerived.social() ? sweepsStrings : strings');
    for (const key of ['rules.rtp', 'rules.maxWin', 'rules.disclaimer', 'ui.guide', 'rules.retrigger', 'rules.paytableHeader']) expect(RULES_MODAL_SVELTE).toContain(key);
    expect(RULES_MODAL_SVELTE).not.toMatch(/ADD YOUR/);
    expect(RULES_MODAL_SVELTE).not.toMatch(/<h[23]>[A-Za-z]/); // every heading is a keyed string, so the social wording pass reaches it
    expect(RULES_MODAL_SVELTE).toContain("t('rules.heading.pays')");
    expect(RULES_MODAL_SVELTE).toContain('max-height: 85vh'); // long rules scroll inside the popup instead of overflowing it
    expect(MODALS_SVELTE).not.toMatch(/ModalGameRules|ModalPayTable/);
    expect(MODALS_SVELTE).toContain('ModalBuyBonusConfirm'); // bonus buy confirmation stays
    expect(MODALS_SVELTE).toContain('ModalAutoSpin'); // autoplay confirmation stays
  });

  it('the bet-mode meta uses this game\'s modes, local placeholder images only and the social strings', () => {
    expect(BET_MODE_META_TS).not.toMatch(/https?:\/\//);
    expect(BET_MODE_META_TS).toContain('sweepsStrings');
    expect(BET_MODE_META_TS).toContain("name.toUpperCase()");
    expect(BET_MODE_META_TS).toContain("m.buyBonus ? 'buy' : 'default'");
  });

  it('the webfont stub never touches the network and is wired in by an alias', () => {
    expect(WEBFONT_STUB_TS).not.toMatch(/https?:\/\/|typekit|fetch|XMLHttpRequest/i);
    expect(WEBFONT_STUB_TS).toContain('options.active?.()');
    expect(VITE_CONFIG_JS).toContain('webfontloader: path.resolve');
    expect(VITE_CONFIG_JS).toContain("import config from 'config-vite'");
  });

  it('localized sprite keys use spriteLang(), which falls back to English for an unsupported language', () => {
    const src = '<script lang="ts">\n\timport x from "y";\n</script>\n<Sprite key="pressToContinueText_{stateUrlDerived.lang()}.png" />\n<Sprite key="winsmall_{stateUrlDerived.lang()}.png" />';
    const r = patchSpriteLang(src);
    expect(r.changed).toBe(2);
    expect(r.text).toContain('key="pressToContinueText_{spriteLang()}.png"');
    expect(r.text).toContain("import { spriteLang } from '../game/spriteLang';");
    expect(r.text).not.toContain('stateUrlDerived.lang()');
    expect(patchSpriteLang('<div/>').changed).toBe(0);
    expect(SPRITE_LANG_TS).toContain("SPRITE_LANGUAGES = ['en']");
    expect(SPRITE_LANG_TS).toContain("includes(lang) ? lang : 'en'");
  });

  it.skipIf(!have)('every localized sprite key of the stock app is patched', () => {
    let n = 0;
    for (const f of fs.readdirSync(path.join(scatter, 'src/components')).filter((x) => x.endsWith('.svelte'))) n += patchSpriteLang(fs.readFileSync(path.join(scatter, 'src/components', f), 'utf8')).changed;
    expect(n).toBeGreaterThanOrEqual(4);
  });

  it('asset addresses resolve against the page, not the script file', () => {
    const src = "export const a = { atlas: new URL('../../assets/spines/x/x.atlas', import.meta.url).href, b: new URL('../../assets/sprites/y.json', import.meta.url).href };";
    const r = patchAssetUrls(src);
    expect(r.changed).toBe(2);
    expect(r.text).toContain("assetUrl('assets/spines/x/x.atlas')");
    expect(r.text).not.toContain('import.meta.url');
    expect(r.text).toContain('document.baseURI');
    expect(r.text).toContain("typeof document !== 'undefined'"); // prerender has no document
    expect(patchAssetUrls('const x = 1;').changed).toBe(0);
  });

  it.skipIf(!have)('every asset address of the stock app is patched', () => {
    const r = patchAssetUrls(fs.readFileSync(path.join(scatter, 'src/game/assets.ts'), 'utf8'));
    expect(r.changed).toBeGreaterThanOrEqual(50);
    expect(r.text).not.toMatch(/\.\.\/\.\.\/assets/);
  });

  it.skipIf(!have)('patches app.html: no external stylesheet, zoom disabled', () => {
    const html = fs.readFileSync(path.join(scatter, 'src/app.html'), 'utf8');
    const out = patchAppHtml(html);
    expect(out).not.toMatch(/typekit|https?:\/\//);
    expect(out).toContain('user-scalable=no');
    expect(out).toContain('maximum-scale=1');
    expect(out).toContain('touch-action: manipulation');
    expect(out).toContain('history.replaceState');
    expect(out).toContain('Object.defineProperty(navigator, "gpu"'); // WebGPU hidden: PixiJS uses WebGL, the verified path // index.html is rewritten to its directory so the router finds the page
    expect(out).toMatch(/html,\s+body \{\s+overflow: hidden;\s+height: 100%;/);
    expect(out).toMatch(/font-family: "proxima-nova";\s+src: local\(/); // local fallback for the hosted font name, still no network
    expect(() => patchAppHtml('nothing')).toThrow(/expected exactly one/);
  });

  it.skipIf(!have)('demo build: app.html gets a title and loads the in-browser RGS first', () => {
    const html = fs.readFileSync(path.join(scatter, 'src/app.html'), 'utf8');
    const out = patchAppHtml(html, { title: 'My <Game> & Co' });
    expect(out).toContain('<title>My Game  Co</title>');
    expect(out.indexOf('demo-rgs.js')).toBeGreaterThan(-1);
    expect(out.indexOf('demo-rgs.js')).toBeLessThan(out.indexOf('%sveltekit.head%')); // before the app's own scripts
    expect(patchAppHtml(html)).not.toContain('demo-rgs.js'); // the normal build never has it
  });

  it.skipIf(!have)('patches the stock layout and game components, and fails loudly if they change', () => {
    const layout = fs.readFileSync(path.join(scatter, 'src/routes/+layout.svelte'), 'utf8');
    const out = patchLayout(layout, 'My Game');
    expect(out).not.toMatch(/LoaderStakeEngine|LoaderExample|stake-engine-loader|loader\.gif|showYourLoader/);
    expect(out).toContain('<FoundryLoader name="My Game" />');
    expect(out).toContain("import 'pixi.js/unsafe-eval';"); // strict CSP hosts refuse new Function: without this the screen stays black
    expect(() => patchLayout('nothing', 'x')).toThrow(/expected exactly one/);

    const game = fs.readFileSync(path.join(scatter, 'src/components/Game.svelte'), 'utf8');
    const g = patchGame(game, 'My Game', 'Studio');
    expect(g).not.toMatch(/I18nTest|SCATTER GAME|ADD YOUR LOGO/);
    expect(g).toContain('<UiGameName name="My Game" />');
    expect(g).toContain('text="Studio"');
    expect(g).toContain('<FoundryModals />');
    expect(g).toContain('stateMeta.betModeMeta = buildBetModeMeta(stateUrlDerived.social())');
    expect(g).not.toMatch(/GameVersion|<Modals>/);
    expect(() => patchGame('nothing', 'x', 'y')).toThrow(/expected exactly one/);
  });

  it.skipIf(!have)('feature events: the template gets types, handlers and a HUD; nothing else about the events changes', () => {
    const types = fs.readFileSync(path.join(scatter, 'src/game/typesBookEvent.ts'), 'utf8');
    const handlers = fs.readFileSync(path.join(scatter, 'src/game/bookEventHandlerMap.ts'), 'utf8');
    const r = patchFeatureEvents(types, handlers);
    expect(r.types).toContain("type: 'cellMultipliers'"); expect(r.types).toContain("type: 'gadgetPanel'"); expect(r.types).toContain('| BookEventCellMultipliers'); expect(r.types).toContain('| BookEventMysteryReveal'); expect(r.types).toContain("type: 'holdAndWin'"); expect(r.types).toContain('| BookEventHoldAndWin');
    for (const k of ['cellMultipliers:', 'gadgetPanel:', 'mysteryReveal:', 'holdAndWin:', 'scatterPay:', 'foundryFeatures.json', 'resetFeatureHud();', "import { featureHud, resetFeatureHud }"]) expect(r.handlers).toContain(k);
    expect(r.handlers).toContain("reveal: async"); expect(r.handlers).toContain("boardMultiplierInfo: async");
    expect(() => patchFeatureEvents('nothing', handlers)).toThrow(/expected exactly one/);
    expect(FEATURE_HUD_SVELTE).toContain('data-testid="feature-hud"');
    expect(FEATURE_HUD_SVELTE).not.toMatch(/https?:\/\//);
  });

  it.skipIf(!have)('builds an app folder from a compiled game without touching the template', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fe-'));
    // a minimal web-sdk: only the template files the generator reads
    const fake = path.join(tmp, 'web-sdk/apps/scatter');
    fs.mkdirSync(path.join(tmp, 'web-sdk/packages/pixi-svelte'), { recursive: true });
    fs.copyFileSync(path.join(WEBSDK, 'packages/pixi-svelte/package.json'), path.join(tmp, 'web-sdk/packages/pixi-svelte/package.json'));
    for (const f of fs.readdirSync(path.join(scatter, 'src/components')).filter((x) => x.endsWith('.svelte')).map((x) => `src/components/${x}`)) {
      fs.mkdirSync(path.dirname(path.join(fake, f)), { recursive: true });
      fs.copyFileSync(path.join(scatter, f), path.join(fake, f));
    }
    for (const f of ['package.json', 'src/routes/+layout.svelte', 'src/components/Game.svelte', 'src/components/I18nTest.svelte', 'src/game/config.ts', 'src/game/assets.ts', 'src/game/typesBookEvent.ts', 'src/game/bookEventHandlerMap.ts', 'src/app.html', 'vite.config.js', 'static/loader.gif', 'static/stake-engine-loader.gif', 'static/favicon.svg']) {
      fs.mkdirSync(path.dirname(path.join(fake, f)), { recursive: true });
      fs.copyFileSync(path.join(scatter, f), path.join(fake, f));
    }
    fs.mkdirSync(path.join(fake, 'static/assets'), { recursive: true });
    fs.writeFileSync(path.join(fake, 'static/assets/sample.txt'), 'sample art');
    const { dir } = compile(cfg(), path.join(tmp, 'out'));
    const front = path.join(tmp, 'config_fe.json');
    fs.writeFileSync(front, JSON.stringify({ gameID: 'foundry_t1_demo', numReels: 6, symbols: [], betModes: {} }));
    const r = buildFrontend({ webSdk: path.join(tmp, 'web-sdk'), gameDir: dir, frontConfig: front });
    expect(r.appName).toBe('foundry_t1_demo');
    expect(r.devArt).toBe(true);
    const app = r.appDir;
    expect(fs.readFileSync(path.join(app, 'src/game/config.ts'), 'utf8')).toContain('"gameID": "foundry_t1_demo"');
    expect(fs.readFileSync(path.join(app, 'src/game/foundryStrings.ts'), 'utf8')).toContain('rules.disclaimer');
    expect(fs.existsSync(path.join(app, 'src/components/FoundryLoader.svelte'))).toBe(true);
    expect(fs.existsSync(path.join(app, 'src/components/FoundryModals.svelte'))).toBe(true);
    expect(fs.existsSync(path.join(app, 'src/game/webfontStub.ts'))).toBe(true);
    expect(fs.existsSync(path.join(app, 'src/game/spriteLang.ts'))).toBe(true);
    expect(fs.readFileSync(path.join(app, 'vite.config.js'), 'utf8')).toContain('webfontloader');
    expect(fs.existsSync(path.join(app, 'src/components/FoundryRulesModal.svelte'))).toBe(true);
    expect(fs.existsSync(path.join(app, 'src/components/I18nTest.svelte'))).toBe(false);
    expect(fs.existsSync(path.join(app, 'static/stake-engine-loader.gif'))).toBe(false);
    expect(fs.existsSync(path.join(app, 'static/loader.gif'))).toBe(false);
    expect(fs.lstatSync(path.join(app, 'static/assets')).isSymbolicLink()).toBe(true); // dev art is linked, not copied
    const pkg = JSON.parse(fs.readFileSync(path.join(app, 'package.json'), 'utf8'));
    expect(pkg.name).toBe('foundry-t1-demo');
    expect(pkg.dependencies['pixi.js']).toMatch(/^\d+\.\d+\.\d+$/); // pinned to the version pixi-svelte uses
    expect(fs.readFileSync(path.join(app, 'FOUNDRY_APP.md'), 'utf8')).toContain('devArt: true');
    // the template itself is untouched
    expect(fs.readFileSync(path.join(fake, 'src/routes/+layout.svelte'), 'utf8')).toContain('LoaderStakeEngine');
    const none = buildFrontend({ webSdk: path.join(tmp, 'web-sdk'), gameDir: dir, frontConfig: front, appName: 'other', devArt: 'none' });
    expect(none.devArt).toBe(false);
    expect(fs.existsSync(path.join(none.appDir, 'static/assets'))).toBe(false);
  });
});
