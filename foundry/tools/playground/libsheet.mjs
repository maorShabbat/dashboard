// Contact sheets of built-in presets: node tools/playground/libsheet.mjs [id-or-category prefix ...]
import { launch, serve, open, save, b64 } from './lib.mjs';
const prefixes = process.argv.slice(2);
const srv = await serve(); const browser = await launch();
const { page, errors } = await open(browser, srv.url, { w: 1280, h: 720, query: 'lab=1' });
const list = await page.evaluate(() => window.__vfx.presets());
const pick = list.filter((e) => !prefixes.length || prefixes.some((p) => e.id.startsWith(p) || e.category === p));
let bad = 0;
for (const e of pick) {
  await page.evaluate((b) => window.__vfx.backdrop(b), e.backdrop);
  const res = await page.evaluate(async (id) => {
    const p = window.__vfx.preset(id);
    const sc = JSON.parse(JSON.stringify(p.scene));
    const probe = await window.__vfx.sheet(sc, [0], 1, 64);
    const D = probe.duration;
    const r = await window.__vfx.sheet(sc, [0.05, 0.15, 0.27, 0.4, 0.55, 0.7, 0.85, 0.98].map((k) => k * D), 4, 340);
    return { ...r, D };
  }, e.id);
  save(`lib-${e.id}.png`, b64(res.png));
  const flag = res.errors.length ? 'ERR ' + res.errors.join('; ') : res.warnings.length ? 'warn ' + res.warnings.join('; ') : 'ok';
  if (res.errors.length) bad++;
  console.log(e.id.padEnd(42), res.D.toFixed(2).padStart(5), flag);
}
if (errors.length) console.log('PAGE ERRORS\n' + errors.slice(0, 20).join('\n'));
console.log(bad ? `${bad} presets with errors` : 'all presets loaded');
await browser.close(); await srv.close();
