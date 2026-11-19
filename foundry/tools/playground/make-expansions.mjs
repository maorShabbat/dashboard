// Renders the animations a wild can play while it expands over its reel (assets/showcase/expansions/*.webm).
// Each is an effect of the playground itself, drawn on a transparent stage over one reel and cropped to that reel, so what ships
// is exactly what the effects look like. Needs ffmpeg (VP9 with alpha) and a build of the playground (npx vite build --config vite.playground.config.ts).
//   node tools/playground/make-expansions.mjs [name ...]
import { spawnSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { launch, serve, open, ROOT } from './lib.mjs';

const OUT_DIR = join(ROOT, 'assets/showcase/expansions');
const FPS = 30;

/** name, the library preset whose board and reel effect are used, and how to change its effect layers. */
const SPEC = [
  { name: 'wild-fire-column', from: 'lane-fire-reel', length: 1.9, fx: [{ effect: 'lane.run', params: { element: 'fire', along: 'reel-up', travel: 0.75, linger: 5, symbols: 'none', thickness: 1.25, strength: 1.25 } }] },
  { name: 'wild-lightning-column', from: 'lane-energy-reel', length: 1.9, fx: [{ effect: 'lane.run', params: { element: 'energy', along: 'reel', travel: 0.5, linger: 5, symbols: 'none', thickness: 1.3, strength: 1.3 } }, { effect: 'lane.run', params: { element: 'lightning', along: 'reel', travel: 0.35, linger: 0.9, symbols: 'none', delay: 0.05, natural: 'false', tint: '#9ad8ff', tint2: '#ffffff', seed: 7 } }, { effect: 'lane.run', params: { element: 'lightning', along: 'reel', travel: 0.35, linger: 0.9, symbols: 'none', delay: 0.75, natural: 'false', tint: '#c8a0ff', tint2: '#ffffff', seed: 11 } }] },
  { name: 'wild-gold-column', from: 'lane-light-reel', length: 1.9, fx: [{ effect: 'lane.run', params: { element: 'light', along: 'reel', travel: 0.6, linger: 5, symbols: 'none', thickness: 1.2 } }, { effect: 'lane.run', params: { element: 'glitter', along: 'reel', travel: 0.9, linger: 5, symbols: 'none', thickness: 1.4, delay: 0.1 } }] },
  { name: 'wild-plasma-column', from: 'lane-plasma-reel', length: 1.9, fx: [{ effect: 'lane.run', params: { element: 'plasma', along: 'reel-up', travel: 0.7, linger: 5, symbols: 'none', thickness: 1.45, strength: 1.4 } }, { effect: 'lane.run', params: { element: 'plasma', along: 'reel', travel: 0.9, linger: 5, symbols: 'none', thickness: 1.0, natural: 'false', tint: '#38e8ff', tint2: '#a06aff', delay: 0.2, seed: 9 } }] },
];

const only = process.argv.slice(2);
const list = SPEC.filter((s) => !only.length || only.includes(s.name));
const srv = await serve(); const browser = await launch();
mkdirSync(OUT_DIR, { recursive: true });
const probe = await (async () => { const { page } = await open(browser, srv.url, { w: 1403, h: 789, query: 'lab=1' }); return page; })();
await probe.evaluate(() => window.__vfx.backdrop('none'));

for (const sp of list) {
  const tmp = join(ROOT, 'playground-out/expansion-frames', sp.name);
  rmSync(tmp, { recursive: true, force: true }); mkdirSync(tmp, { recursive: true });
  const info = await probe.evaluate(async ({ from, fx, length }) => {
    const p = window.__vfx.preset(`symbol-transformation.${from}`);
    const sc = JSON.parse(JSON.stringify(p.scene));
    const b = sc.elements.find((e) => e.kind === 'board');
    b.opacity = 0;                                              // only the effect is drawn, over the reel the wild expands over
    const lane0 = sc.fx.find((l) => l.effect === 'lane.run');
    sc.fx = fx.map((f, i) => ({ ...lane0, id: `exp${i}`, effect: f.effect, start: 0, params: { duration: length + 1, anchor: 'start', delay: 0.05, lane: 3, natural: 'true', flare: 'false', ...f.params }, target: b.id }));
    sc.hold = 0; sc.duration = length + 1;
    const r = await window.__vfx.setScene(sc);
    return { errors: r.errors, aspect: sc.aspect, x: b.x, y: b.y, cell: b.cell, gap: b.gap, cols: b.cols, rows: b.rows, wild: Number(b.params.wildReel ?? 2) };
  }, { from: sp.from, fx: sp.fx, length: sp.length });
  if (info.errors.length) throw new Error(`${sp.name}: ${JSON.stringify(info.errors)}`);
  const W = 1403, H = 789;
  const pitch = info.cell * (1 + info.gap), reelH = (info.rows - 1) * pitch + info.cell;
  const cw = Math.round(info.cell * 1.9 * H / 2) * 2, ch = Math.round(reelH * H / 2) * 2;
  const cx = info.x * W + (info.wild - (info.cols - 1) / 2) * pitch * H, cy = info.y * H;
  const x0 = Math.round(cx - cw / 2), y0 = Math.round(cy - ch / 2);
  const frames = Math.round(sp.length * FPS);
  for (let i = 0; i < frames; i++) {
    // draw the frame, cut the reel out of it and fade its top and bottom edges, so nothing ends in a hard line
    const png = await probe.evaluate(async ({ t, x0, y0, cw, ch }) => {
      await window.__vfx.settle(t);
      const img = new Image(); await new Promise((r) => { img.onload = r; img.src = window.__vfx.png(); });
      const c = document.createElement('canvas'); c.width = cw; c.height = ch; const g = c.getContext('2d');
      g.drawImage(img, x0, y0, cw, ch, 0, 0, cw, ch);
      const m = g.createLinearGradient(0, 0, 0, ch); m.addColorStop(0, 'rgba(0,0,0,0)'); m.addColorStop(0.07, 'rgba(0,0,0,1)'); m.addColorStop(0.93, 'rgba(0,0,0,1)'); m.addColorStop(1, 'rgba(0,0,0,0)');
      g.globalCompositeOperation = 'destination-in'; g.fillStyle = m; g.fillRect(0, 0, cw, ch);
      return c.toDataURL('image/png');
    }, { t: i / FPS, x0, y0, cw, ch });
    writeFileSync(join(tmp, `f${String(i).padStart(3, '0')}.png`), Buffer.from(png.slice(png.indexOf(',') + 1), 'base64'));
  }
  const out = join(OUT_DIR, `${sp.name}.webm`);
  const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', join(tmp, 'f%03d.png'), '-vf', 'format=yuva420p', '-c:v', 'libvpx-vp9', '-pix_fmt', 'yuva420p', '-b:v', '0', '-crf', '36', '-auto-alt-ref', '0', '-row-mt', '1', out], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`ffmpeg: ${r.stderr}`);
  console.log(`${sp.name}: ${frames} frames, ${cw}x${ch}, ${(statSync(out).size / 1024).toFixed(0)} KB`);
}
await browser.close(); await srv.close();
