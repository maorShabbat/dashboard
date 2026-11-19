// Close-up frames of one preset around a window of time, with chosen layers removed:
//   node tools/playground/closeup.mjs <preset id> <t0> <t1> [frames=6] [cols=3] [width=620] [-layer id ...] [-set layer.param=value ...]
import { launch, serve, open, save, b64 } from './lib.mjs';
const [id, a, b, fr = '6', cols = '3', width = '620', ...rest] = process.argv.slice(2);
const drop = [], sets = []; let crop = null; for (let i = 0; i < rest.length; i++) { if (rest[i] === '-layer') drop.push(rest[++i]); else if (rest[i] === '-set') sets.push(rest[++i]); else if (rest[i] === '-crop') crop = rest[++i].split(',').map(Number); }
const t0 = +a, t1 = +b, n = +fr;
const srv = await serve(); const browser = await launch();
const { page, errors } = await open(browser, srv.url, { w: 1280, h: 720, query: 'lab=1' });
const list = await page.evaluate(() => window.__vfx.presets());
const e = list.find((x) => x.id === id || x.id.endsWith('.' + id));
if (!e) { console.log('no such preset', id); process.exit(1); }
await page.evaluate((bd) => window.__vfx.backdrop(bd), e.backdrop);
const res = await page.evaluate(async ({ pid, times, cols, width, drop, sets }) => {
  const p = window.__vfx.preset(pid);
  const sc = JSON.parse(JSON.stringify(p.scene));
  sc.fx = sc.fx.filter((l) => !drop.includes(l.id));
  for (const st of sets) { const [lp, v] = st.split('='), [lid, key] = lp.split('.'); const L = sc.fx.find((x) => x.id === lid); if (L) { const num = Number(v); L.params = { ...(L.params || {}), [key]: Number.isNaN(num) ? v : num }; } }
  return await window.__vfx.sheet(sc, times, cols, width);
}, { sets, pid: e.id, times: Array.from({ length: n }, (_, i) => t0 + ((t1 - t0) * i) / Math.max(1, n - 1)), cols: +cols, width: +width, drop });
let png = res.png;
if (crop) png = await page.evaluate(async ({ png, crop }) => { const img = new Image(); await new Promise((r) => { img.onload = r; img.src = typeof png === 'string' ? (png.startsWith('data:') ? png : 'data:image/png;base64,' + png) : URL.createObjectURL(new Blob([png])); }); const [x, y, w, h, z = 3] = crop; const c = document.createElement('canvas'); c.width = w * z; c.height = h * z; const g = c.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(img, x, y, w, h, 0, 0, w * z, h * z); return c.toDataURL('image/png'); }, { png, crop });
const f = save(`closeup-${id.replace(/[^\w.-]/g, '_')}.png`, b64(png));
console.log(f, res.errors.length ? 'ERR ' + res.errors.join('; ') : 'ok');
if (errors.length) console.log(errors.slice(0, 5).join('\n'));
await browser.close(); await srv.close();
