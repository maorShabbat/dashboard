// Same text and style in many fonts, side by side: node tools/playground/fontcompare.mjs <name> "<text>" <preset id> <cols> <cellW> font[:weight[:style]] ...
import { launch, serve, open, save, b64 } from './lib.mjs';
const [name, text, presetId, colsArg, cellArg, ...fonts] = process.argv.slice(2);
const srv = await serve(); const browser = await launch();
const { page, errors } = await open(browser, srv.url, { w: 800, h: 450, query: 'lab=1' });
const png = await page.evaluate(async ({ text, presetId, cols, cellW, fonts }) => {
  const v = window.__vfx; const cv = v.controller.canvas;
  const cellH = Math.round(cellW * 9 / 16), rows = Math.ceil(fonts.length / cols);
  const out = document.createElement('canvas'); out.width = cellW * cols; out.height = cellH * rows;
  const g = out.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, out.width, out.height);
  await v.backdrop('night');
  const log = [];
  for (let i = 0; i < fonts.length; i++) {
    const [id, w = '400', st = 'normal'] = fonts[i].split(':');
    const sc = JSON.parse(JSON.stringify(v.preset(presetId).scene));
    const el = sc.elements[0]; el.text = text; el.style.font = { id, weight: Number(w), style: st };
    delete el.motion.idle; delete el.motion.entrance; el.shine = undefined;
    const rep = await v.controller.setScene(sc, { reload: true });
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    await v.controller.whenIdle(); v.controller.pause();
    if (rep.errors.length) log.push(id + ': ' + rep.errors.map((x) => x.message).join('; '));
    v.seek(1);
    const x = (i % cols) * cellW, y = Math.floor(i / cols) * cellH;
    g.drawImage(cv, x, y, cellW, cellH);
    g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(x + 4, y + 4, fonts[i].length * 7 + 12, 16); g.fillStyle = '#fff'; g.font = '11px monospace'; g.fillText(fonts[i], x + 8, y + 16);
  }
  return { png: out.toDataURL('image/png'), log };
}, { text, presetId, cols: Number(colsArg), cellW: Number(cellArg), fonts });
save(`fonts-${name}.png`, b64(png.png));
console.log(`playground-out/fonts-${name}.png`, png.log.join('\n'), errors.slice(0, 3).join('\n'));
await browser.close(); await srv.close();
