// Contact sheets of effects: node tools/playground/fxsheet.mjs [idPrefix ...]
import { launch, serve, open, save, b64 } from './lib.mjs';
const prefixes = process.argv.slice(2);
const srv = await serve(); const browser = await launch();
const { page, errors } = await open(browser, srv.url, { w: 1280, h: 720, query: 'lab=1' });
const list = await page.evaluate(() => window.__vfx.effectIds());
const pick = list.filter((e) => !prefixes.length || prefixes.some((p) => e.id.startsWith(p)));
for (const e of pick) {
  const backdrop = e.id.startsWith('distort') || e.id.startsWith('impact') ? 'reels' : e.id.startsWith('light') || e.id.startsWith('celebrate') ? 'night' : 'night';
  await page.evaluate((b) => window.__vfx.backdrop(b), backdrop);
  const res = await page.evaluate(async ([id, uses, uses2]) => {
    const ids = { gem: 'builtin:gem', shoe: 'builtin:horseshoe', star: 'builtin:star' };
    const mk = (asset, id2, x, extra = {}) => ({ id: id2, name: id2, kind: 'image', asset, x, y: 0.55, scale: 1, rotation: 0, opacity: 1, start: 0, motion: {}, size: 0.3, look: 'original', gradient: null, outline: null, role: 'icon', playback: 'loop', ...extra });
    const elements = []; const fx = [];
    if (uses) elements.push(mk(ids.gem, 'A', 0.5));
    if (uses2) elements.push(mk(ids.star, 'B', 0.5, {}));
    fx.push({ id: 'f1', effect: id, start: 0.2, enabled: true, amount: 1, params: {}, ...(uses ? { target: 'A' } : {}), ...(uses2 ? { target2: 'B' } : {}) });
    const scene = { schema: 'bangers.vfx-scene/1', aspect: 16 / 9, seed: 7, elements, fx, hold: 0.6, assets: [], sound: { enabled: false, volume: 0.8 } };
    const dur0 = 1;
    const tmp = await window.__vfx.sheet(scene, [0], 1, 64);
    const D = tmp.duration;
    const times = [0, 0.12, 0.25, 0.4, 0.55, 0.7, 0.85, 1].map((k) => k * D);
    const r = await window.__vfx.sheet(scene, times, 4, 400);
    void dur0;
    return r;
  }, [e.id, e.usesObject, e.usesObject2]);
  save(`fx-${e.id}.png`, b64(res.png));
  console.log(e.id.padEnd(22), 'dur', res.duration.toFixed(2), res.errors.length ? 'ERR ' + res.errors.join('; ') : 'ok');
}
if (errors.length) console.log('PAGE ERRORS\n' + errors.join('\n'));
await browser.close(); await srv.close();
