// One image with a frame of every matching preset: node tools/playground/grid.mjs <name> <fraction> <cols> <cellWidth> [prefix ...]
// e.g. node tools/playground/grid.mjs styles 0.62 4 360 text-styling
import { launch, serve, open, save, b64 } from './lib.mjs';
const [name = 'grid', frac = '0.62', colsArg = '4', cellArg = '360', ...prefixes] = process.argv.slice(2);
const srv = await serve(); const browser = await launch();
const { page, errors } = await open(browser, srv.url, { w: Number(process.env.W ?? 800), h: Number(process.env.H ?? 450), query: 'lab=1' });
const list = await page.evaluate(() => window.__vfx.presets());
const pick = list.filter((e) => !prefixes.length || prefixes.some((p) => e.id.startsWith(p) || e.category === p));
const fr = frac.split(',').map(Number);
const png = await page.evaluate(async ({ ids, fr, cols, cellW, abs, back }) => {
  const v = window.__vfx; const cv = v.controller.canvas;
  const cellH = Math.round(cellW * 9 / 16);
  const per = ids.length * fr.length, rows = Math.ceil(per / cols);
  const out = document.createElement('canvas'); out.width = cellW * cols; out.height = cellH * rows;
  const g = out.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, out.width, out.height);
  let i = 0; const log = [];
  for (const e of ids) {
    await v.backdrop(back || e.backdrop);
    if (e.backdropTo) await v.backdropTo(e.backdropTo);
    const rep = await v.controller.setScene(JSON.parse(JSON.stringify(v.preset(e.id).scene)), { reload: true });
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    await v.controller.whenIdle(); v.controller.pause();
    if (rep.errors.length) log.push(e.id + ': ' + rep.errors.map((x) => x.message).join('; '));
    for (const f of fr) {
      v.seek(Math.min(v.duration(), abs || f >= 1 ? f : f * v.duration()));  // values >= 1 are seconds
      const x = (i % cols) * cellW, y = Math.floor(i / cols) * cellH;
      g.drawImage(cv, x, y, cellW, cellH);
      g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(x + 4, y + 4, Math.min(cellW - 8, e.id.length * 7 + 12), 16);
      g.fillStyle = '#fff'; g.font = '11px monospace'; g.fillText(e.id.split('.').pop(), x + 8, y + 16);
      i++;
    }
  }
  return { png: out.toDataURL('image/png'), log };
}, { ids: pick.map((e) => ({ id: e.id, backdrop: e.backdrop, backdropTo: e.backdropTo })), fr, cols: Number(colsArg), cellW: Number(cellArg), abs: !!process.env.ABS, back: process.env.BACK || '' });
save(`grid-${name}.png`, b64(png.png));
console.log(`${pick.length} presets → playground-out/grid-${name}.png`, png.log.length ? '\n' + png.log.join('\n') : '', errors.length ? '\nPAGE ERRORS ' + errors.slice(0, 5).join('\n') : '');
await browser.close(); await srv.close();
