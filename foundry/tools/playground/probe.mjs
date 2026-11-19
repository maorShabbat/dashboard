// Probe one preset at a few times: node tools/playground/probe.mjs <preset id> <t1,t2,...>  → reports render errors, status and coverage
import { launch, serve, open } from './lib.mjs';
const [id, times = '1'] = process.argv.slice(2);
const srv = await serve(); const browser = await launch();
const { page, errors } = await open(browser, srv.url, { w: 800, h: 450, query: 'lab=1' });
const out = await page.evaluate(async ({ id, times }) => {
  const v = window.__vfx; const c = v.controller;
  await v.backdrop(v.presets().find((e) => e.id === id).backdrop);
  const bt = v.presets().find((e) => e.id === id).backdropTo; if (bt) await v.backdropTo(bt);
  await c.setScene(JSON.parse(JSON.stringify(v.preset(id).scene)), { reload: true });
  await c.whenIdle(); c.pause();
  const res = [];
  for (const t of times.split(',').map(Number)) { v.seek(t); res.push({ t, status: c.status, errors: c.report.errors.map((e) => e.message), stats: c.renderer.lastStats ?? null }); }
  return res;
}, { id, times });
console.log(JSON.stringify(out, null, 1), errors.slice(0, 5));
await browser.close(); await srv.close();
