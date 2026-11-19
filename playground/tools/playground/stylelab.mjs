// One settled frame of each text-styling preset, side by side: node tools/playground/stylelab.mjs <backdrop> <preset id or slug> ...
//   slugs without a dot are looked up in text-styling; an id like messages.big-win is used as it is.
import { launch, serve, open, save, b64 } from './lib.mjs';
const [backdrop, ...ids] = process.argv.slice(2);
const CELL = Number(process.env.CELL || 640), COLS = Number(process.env.COLS || 2), TIME = Number(process.env.TIME || 1.8), CROP = process.env.CROP ? process.env.CROP.split(',').map(Number) : null;
const srv = await serve(); const browser = await launch();
const { page, errors } = await open(browser, srv.url, { w: 1280, h: 720, query: 'lab=1' });
await page.evaluate((b) => window.__vfx.backdrop(b), backdrop);
const data = await page.evaluate(async ({ ids, CELL, COLS, TIME }) => {
  const pngs = [];
  for (const id of ids) {
    const p = window.__vfx.preset(id.includes('.') ? id : 'text-styling.' + id);
    if (!p) { pngs.push(null); continue; }
    const sc = JSON.parse(JSON.stringify(p.scene));
    const D = (await window.__vfx.sheet(sc, [0], 1, 64)).duration;
    const r = await window.__vfx.sheet(sc, [Math.min(D - 0.1, TIME)], 1, CELL);
    pngs.push(r.png);
  }
  const imgs = await Promise.all(pngs.map((p) => (p ? new Promise((res) => { const im = new Image(); im.onload = () => res(im); im.src = p; }) : null)));
  const first = imgs.find(Boolean), cols = COLS, cw = first.width, ch = first.height, rows = Math.ceil(imgs.length / cols);
  const c = document.createElement('canvas'); c.width = cw * cols; c.height = ch * rows; const g = c.getContext('2d');
  imgs.forEach((im, i) => { if (!im) return; g.drawImage(im, (i % cols) * cw, Math.floor(i / cols) * ch); g.fillStyle = '#fff'; g.font = '13px sans-serif'; g.fillText(ids[i], (i % cols) * cw + 8, Math.floor(i / cols) * ch + 16); });
  return c.toDataURL('image/png');
}, { ids, CELL, COLS, TIME });
console.log(save('stylelab.png', b64(data)));
if (errors.length) console.log(errors.slice(0, 5).join('\n'));
await browser.close(); await srv.close();
