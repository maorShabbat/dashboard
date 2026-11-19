import { launch, serve, open, frameAt, save } from './lib.mjs';
const times = (process.argv[2] ?? '0.3,0.7,1.2,2').split(',').map(Number);
const srv = await serve(); const browser = await launch();
const { page, errors } = await open(browser, srv.url, { w: 1280, h: 720, query: 'lab=1' });
for (const t of times) { const p = save(`shot-${t}.png`, await frameAt(page, t)); console.log(p); }
console.log('stats', JSON.stringify(await page.evaluate(() => window.__vfx.stats())), 'dur', await page.evaluate(() => window.__vfx.duration()));
if (errors.length) console.log('ERRORS', errors.join('\n'));
await browser.close(); await srv.close();
