/**
 * More glow textures for the board: a rainbow tube, a ring of fire, frost, comets that circle the frame, an electric current, lava,
 * sunburst rays, fairy lights, a laser show and an ocean swell. `glowTexture` in boardmods.ts hands the texture it does not know to
 * `glow2`; every texture is drawn from the board's outline, with the two colours of the effect, so it follows the board's size.
 */
import { makeRng } from '../../core/util/prng';
import { FIRE_PALETTES, type Frame, type RGB } from '../engine/frame';
import { jag, ribbon } from '../engine/lightning';
import { h1, lerp, mixRGB, smoothstep } from '../engine/math';
import type { BoardInfo, EffectCtx } from './effect';
import { bell, bulb, fract, hue, L, perim, perimLength } from './boardgeom';
import { triPoly } from './helpers';
import { flame, setVolPalette, smokePuff } from './volume';

const TAU = Math.PI * 2;
export const GLOWS2: [string, string][] = [['rainbow', 'Rainbow tube'], ['flames', 'Ring of fire'], ['frost', 'Frost rim'], ['comets', 'Golden comets'], ['current', 'Electric current'], ['lava', 'Molten lava'], ['sunburst', 'Sunburst rays'], ['fairies', 'Fairy lights'], ['lasers', 'Laser show'], ['waves', 'Ocean swell']];

/** A point `u` ∈ [0, 1) round a rounded rectangle that is `out` outside the board's box, with corner radius `r` (so a tail goes round the corners instead of snapping to them). */
function rperim(b: BoardInfo, u: number, out: number, r: number): { x: number; y: number; nx: number; ny: number } {
  const x0 = b.box.x0 - out, y0 = b.box.y0 - out, x1 = b.box.x1 + out, y1 = b.box.y1 + out, w = x1 - x0 - 2 * r, h = y1 - y0 - 2 * r, arc = (Math.PI * r) / 2, per = 2 * (w + h) + 4 * arc;
  let d = fract(u) * per;
  const seg = (len: number): boolean => { if (d < len) return true; d -= len; return false; };
  if (seg(w)) return { x: x0 + r + d, y: y0, nx: 0, ny: -1 };
  if (seg(arc)) { const a = -Math.PI / 2 + d / r; return { x: x1 - r + Math.cos(a) * r, y: y0 + r + Math.sin(a) * r, nx: Math.cos(a), ny: Math.sin(a) }; }
  if (seg(h)) return { x: x1, y: y0 + r + d, nx: 1, ny: 0 };
  if (seg(arc)) { const a = d / r; return { x: x1 - r + Math.cos(a) * r, y: y1 - r + Math.sin(a) * r, nx: Math.cos(a), ny: Math.sin(a) }; }
  if (seg(w)) return { x: x1 - r - d, y: y1, nx: 0, ny: 1 };
  if (seg(arc)) { const a = Math.PI / 2 + d / r; return { x: x0 + r + Math.cos(a) * r, y: y1 - r + Math.sin(a) * r, nx: Math.cos(a), ny: Math.sin(a) }; }
  if (seg(h)) return { x: x0, y: y1 - r - d, nx: -1, ny: 0 };
  const a = Math.PI + d / r;
  return { x: x0 + r + Math.cos(a) * r, y: y0 + r + Math.sin(a) * r, nx: Math.cos(a), ny: Math.sin(a) };
}

type Add = (x: number, y: number, hw: number, hh: number, rot: number, type: number, color: RGB, intensity: number, e1?: number) => void;

/** Draw one of the extra textures; returns false when `tex` is not one of them. */
export function glow2(f: Frame, b: BoardInfo, ctx: EffectCtx, tex: string, c1: RGB, c2: RGB, k: number, T: number, W: number, H: number): boolean {
  const add: Add = (x, y, hw, hh, rot, type, color, intensity, e1) => { if (intensity > 0.003) f.additive.push({ x, y, hw, hh, rot, type, color, intensity, e1 }); };
  const white: RGB = [1, 1, 1], { x0, y0, x1, y1 } = b.box, per = perimLength(b, 0.012);
  switch (tex) {
    case 'rainbow': {
      // a tube round the frame whose colour runs round it, drawn as overlapping glows so it is one smooth line of light
      const N = L(ctx, 160);
      for (let i = 0; i < N; i++) {
        const u = i / N, q = perim(b, u, 0.012), col = hue(u * 1.0 - T * 0.12);
        add(q.x, q.y, 0.044, 0.044, 0, 0, col, 0.85 * k, 2.2);
        add(q.x, q.y, 0.017, 0.017, 0, 0, mixRGB(col, white, 0.55), 1.5 * k, 2.6);
      }
      for (let j = 0; j < 10; j++) { const u = j / 10, q = perim(b, u, 0.04), col = hue(u - T * 0.12); add(q.x, q.y, W * 0.22, H * 0.3, 0, 0, col, 0.1 * k, 1.6); }
      return true;
    }
    case 'flames': {
      // flames burning all the way round the frame, leaning out from it
      setVolPalette(f, 'fire', 'black');
      const pal = FIRE_PALETTES.fire!, NF = L(ctx, 64);
      for (let i = 0; i < NF; i++) {
        const hh = (m: number): number => h1(i * 17 + m), q = perim(b, (i + hh(1) * 0.8) / NF, -0.006), tl = T + hh(2) * 6, ph = 0.5 + 0.5 * Math.sin(tl * (5 + 4 * hh(3))), len = lerp(0.07, 0.17, hh(4)) * (0.65 + 0.35 * ph);
        flame(f, { x: q.x, y: q.y, w: (per / NF) * 2.4, h: len * k, age: 0.06 + 0.24 * hh(5), seed: i * 3.1, t: tl, heat: 1, alpha: 0.95, rot: Math.atan2(q.nx, -q.ny) + Math.sin(tl * 2.2 + i) * 0.14, soft: true });
      }
      const heat = mixRGB(pal[1]!, pal[2]!, 0.5);
      for (let j = 0; j < 20; j++) { const q = perim(b, j / 20, -0.02); add(q.x, q.y, 0.1, 0.1, 0, 0, heat, (0.3 + 0.08 * Math.sin(T * 9 + j)) * k, 1.4); }
      for (let i = 0; i < L(ctx, 40); i++) {
        const hh = (m: number): number => h1(i * 13 + m + 90), ph = fract(T * (0.25 + 0.3 * hh(1)) + hh(2) * 5), q = perim(b, hh(3), 0);
        add(q.x + q.nx * ph * 0.22 + Math.sin(ph * 9 + i) * 0.015, q.y + q.ny * ph * 0.22 - ph * 0.1, 0.009, 0.009, 0, 0, mixRGB(c1, [1, 0.9, 0.6], hh(4) * 0.5), 2.2 * k * (1 - ph) * (0.7 + 0.3 * Math.sin(T * 25 + i)), 2.2);
      }
      return true;
    }
    case 'frost': {
      // a pale tube, faceted crystals growing out of the frame, glints, and a cold mist along the bottom
      const N = L(ctx, 120), rim = mixRGB(c1, white, 0.45);
      for (let i = 0; i < N; i++) { const q = perim(b, i / N, 0.012); add(q.x, q.y, 0.03, 0.03, 0, 0, c1, 0.6 * k, 2.2); add(q.x, q.y, 0.011, 0.011, 0, 0, rim, 1.3 * k, 2.6); }
      const NC = L(ctx, 52);
      for (let i = 0; i < NC; i++) {
        const hh = (m: number): number => h1(i * 19 + m), u = (i + 0.5 + (hh(1) - 0.5) * 0.5) / NC, q = perim(b, u, 0.006), grow = smoothstep(0, 1.2, T - hh(2) * 1.4), len = (0.03 + 0.07 * hh(3)) * (0.85 + 0.15 * Math.sin(T * 0.8 + i)) * grow, w = len * 0.22 + 0.005, tx = -q.ny, ty = q.nx, tilt = (hh(4) - 0.5) * 0.7;
        const ax = q.nx * Math.cos(tilt) - q.ny * Math.sin(tilt), ay = q.nx * Math.sin(tilt) + q.ny * Math.cos(tilt);
        const tip: [number, number] = [q.x + ax * len, q.y + ay * len], b1: [number, number] = [q.x + tx * w, q.y + ty * w], b2: [number, number] = [q.x - tx * w, q.y - ty * w], mid: [number, number] = [q.x + ax * len * 0.2, q.y + ay * len * 0.2];
        triPoly(f.polys, b1, tip, mid, [0.55, 0.82, 1], 0.9 * k, [0.9, 0.98, 1], [0.9, 0.98, 1]);
        triPoly(f.polys, mid, tip, b2, [0.25, 0.5, 0.9], 0.9 * k, [0.9, 0.98, 1], [0.5, 0.75, 1]);
        add((mid[0] + tip[0]) / 2, (mid[1] + tip[1]) / 2, len * 0.5, 0.0022, Math.atan2(ay, ax), 0, white, 0.9 * k * grow, 5);
      }
      for (let i = 0; i < L(ctx, 16); i++) { const hh = (m: number): number => h1(i * 23 + m + 40), ph = fract(T * 0.45 + hh(1)), q = perim(b, hh(2), -0.01); add(q.x, q.y, 0.045 * bell(ph), 0.045 * bell(ph), 0.2, 2, white, 1.2 * k * bell(ph)); }
      setVolPalette(f, 'fire', 'ice');
      for (let i = 0; i < 7; i++) { const ph = fract(T * 0.12 + i / 7); smokePuff(f, { x: x0 + (i / 6) * W + Math.sin(T * 0.6 + i) * 0.03, y: y1 + 0.01 - ph * 0.06, size: 0.1, age: ph, seed: i + 5, t: T * 0.4, alpha: 0.3 * k * bell(ph), heat: 0, light: [0.3, -0.9], soft: 0.85 }); }
      return true;
    }
    case 'comets': {
      // bright comets run round the frame at different speeds; each has a long tail drawn as a ribbon that thins to a point, with sparkles shed along it
      add(b.cx, b.cy, W * 0.62, H * 0.64, 0, 0, c1, 0.06 * k, 1.2);
      for (let i = 0; i < 40; i++) { const q = rperim(b, i / 40, 0.075, 0.1); add(q.x, q.y, 0.04, 0.04, 0, 0, c1, 0.14 * k, 2.2); }
      const M = 44;
      for (let ci = 0; ci < 3; ci++) {
        const dir = ci === 1 ? -1 : 1, u = fract(T * (0.075 + 0.025 * ci) * dir + ci / 3), tail = 0.26 + 0.06 * ci, col = ci === 1 ? c2 : mixRGB(c1, c2, ci / 3);
        const pts: { x: number; y: number }[] = [];
        for (let m = 0; m <= M; m++) { const q = rperim(b, u - dir * (m / M) * tail, 0.075, 0.1); pts.push({ x: q.x, y: q.y }); }
        const set = { core: mixRGB(col, white, 0.2), glow: col, verts: [] as number[] };
        ribbon(set.verts, pts, 0.0042 * Math.min(1.4, k), 0.9 * Math.min(1.4, k), true, false, 0.3, 0.2, 3.5);
        f.boltSets.push(set);
        for (let m = 0; m < 56; m++) {                                              // the body of the tail: small glows that grow fainter and smaller toward its end
          const w = m / 56, q = pts[Math.round(w * M)]!, fade = (1 - w) ** 1.5, sz = 0.042 * (1 - 0.6 * w);
          add(q.x, q.y, sz, sz, 0, 0, col, 0.6 * fade * Math.min(1.4, k), 2.0);
        }
        for (let m = 0; m < 14; m++) {
          const w = (m + 0.5) / 14, q = rperim(b, u - dir * w * tail, 0.075, 0.1), fade = (1 - w) ** 1.4;
          if (h1(m * 7 + ci * 31) < 0.75) { const ph = fract(T * 1.5 + m * 0.13); add(q.x + q.nx * ph * 0.06, q.y + q.ny * ph * 0.06, 0.016, 0.016, 0.3, 2, mixRGB(col, white, 0.6), 1.3 * k * fade * (1 - ph)); }
        }
        const hq = rperim(b, u, 0.075, 0.1);
        add(hq.x, hq.y, 0.05, 0.05, 0, 3, mixRGB(col, white, 0.3), 1.3 * k);
        add(hq.x, hq.y, 0.09, 0.09, T * 0.8, 2, mixRGB(col, white, 0.5), 0.9 * k);
      }
      return true;
    }
    case 'current': {
      // an electric current crawling along the frame, with arcs that jump inward to the symbols
      f.boltCore = [1, 1, 1]; f.boltGlow = c1;
      const rng = makeRng(Math.floor(T * 22) * 977 + 31), N = L(ctx, 90);
      for (let i = 0; i < N; i++) { const q = perim(b, i / N, 0.012); add(q.x, q.y, 0.03, 0.03, 0, 0, c1, 0.3 * k, 2.2); }
      for (let a = 0; a < 7; a++) {
        const u0 = rng.next(), len = 0.04 + 0.1 * rng.next(), pts: { x: number; y: number }[] = [], S = 14;
        for (let j = 0; j <= S; j++) { const q = perim(b, u0 + (j / S) * len, 0.012), d = (j === 0 || j === S ? 0 : (rng.next() - 0.5) * 0.034); pts.push({ x: q.x + q.nx * d, y: q.y + q.ny * d }); }
        ribbon(f.bolts, pts, 0.0034 * Math.min(1.5, k), 1.0 * Math.min(1.5, k), true, true, 0.05, 0.1);
      }
      for (let a = 0; a < 3; a++) {
        const q = perim(b, rng.next(), 0.012), r = Math.floor(rng.next() * b.rows), c = Math.floor(rng.next() * b.cols), to = b.cellCenter(r, c);
        ribbon(f.bolts, jag(rng, { x: q.x, y: q.y }, to, 0.035, 4), 0.0028 * Math.min(1.5, k), 0.8 * Math.min(1.5, k), true, true, 0.05, 0.1);
        add(to.x, to.y, b.cell * 0.55, b.cell * 0.55, 0, 3, c1, 0.5 * k);
      }
      for (let i = 0; i < L(ctx, 10); i++) { const ph = fract(T * 2 + h1(i * 5)), q = perim(b, h1(i * 9 + 1), 0.012), a2 = Math.atan2(q.ny, q.nx) + (h1(i * 3) - 0.5) * 1.8; add(q.x + Math.cos(a2) * ph * 0.06, q.y + Math.sin(a2) * ph * 0.06, 0.014, 0.0022, a2, 4, mixRGB(c1, white, 0.6), 1.4 * k * (1 - ph), 1.5); }
      return true;
    }
    case 'lava': {
      // molten rock under the grid: a hot light climbing from below, glowing cracks, a crust of bright pools and bubbles that swell and pop
      const pulse = 0.85 + 0.15 * Math.sin(T * 2.1);
      add(b.cx, y1 + 0.02, W * 0.66, H * 0.62, 0, 0, c1, 1.15 * k * pulse, 0.7);
      add(b.cx, y1 - 0.01, W * 0.56, H * 0.3, 0, 0, mixRGB(c1, c2, 0.5), 0.7 * k * pulse, 1.0);
      add(b.cx, y1 - 0.004, W * 0.5, 0.03, 0, 0, mixRGB(c1, c2, 0.6), 2.4 * k * pulse, 1.6);
      for (let i = 0; i < L(ctx, 14); i++) {                                           // bright pools that drift and merge along the bottom
        const hh = (m: number): number => h1(i * 7 + m + 200), x = x0 + fract(hh(1) + T * 0.02 * (hh(2) - 0.5) * 4) * W, w = 0.05 + 0.08 * hh(3);
        add(x, y1 - 0.004, w, 0.02 + 0.012 * Math.sin(T * 1.7 + i), 0, 0, mixRGB(c2, white, 0.3), 1.6 * k * (0.7 + 0.3 * Math.sin(T * 2.3 + i)), 1.8);
      }
      f.boltCore = mixRGB(c2, [1, 0.8, 0.45], 0.4); f.boltGlow = mixRGB(c1, [1, 0.25, 0.05], 0.5);
      for (let i = 0; i < 12; i++) {
        const rng = makeRng(i * 7919 + 13), x = x0 + ((i + 0.5 + (rng.next() - 0.5) * 0.4) / 12) * W, top = y1 - 0.06 - rng.next() * 0.2;
        const pts = jag(rng, { x, y: y1 }, { x: x + (rng.next() - 0.5) * 0.1, y: top }, 0.03, 4), live = 0.75 + 0.25 * Math.sin(T * 2 + i);
        ribbon(f.bolts, pts, 0.0046, live * Math.min(1.5, k), true, true, 0.2, 0.12);
        for (let j = 0; j < pts.length; j += 2) add(pts[j]!.x, pts[j]!.y, 0.03, 0.03, 0, 0, c1, 0.3 * live * k, 2.2);
      }
      for (let i = 0; i < L(ctx, 22); i++) {
        const hh = (m: number): number => h1(i * 11 + m), ph = fract(T * (0.1 + 0.1 * hh(1)) + hh(2) * 7), x = x0 + hh(3) * W, y = y1 - ph * H * 0.6, r = 0.014 + 0.03 * hh(4) * (0.4 + ph);
        add(x, y, r, r, 0, 0, mixRGB(c1, c2, ph), 1.5 * k * (1 - ph * 0.5), 2);
        add(x, y, r * 0.45, r * 0.45, 0, 3, mixRGB(c2, white, 0.5), 1.0 * k * (1 - ph * 0.5));
        if (ph > 0.88) add(x, y, r * (1 + (ph - 0.88) * 14), r * (1 + (ph - 0.88) * 14), 0, 1, c2, 1.4 * k * (1 - (ph - 0.88) / 0.12), 0.12);
      }
      for (let i = 0; i < L(ctx, 34); i++) { const hh = (m: number): number => h1(i * 13 + m + 60), ph = fract(T * (0.25 + 0.3 * hh(1)) + hh(2) * 7); add(x0 + hh(3) * W + Math.sin(ph * 9 + i) * 0.02, y1 - ph * H * 1.1, 0.009, 0.009, 0, 0, mixRGB(c2, [1, 0.9, 0.6], hh(4) * 0.5), 2.2 * k * (1 - ph) * (0.7 + 0.3 * Math.sin(T * 25 + i)), 2.2); }
      return true;
    }
    case 'sunburst': {
      // golden rays turning round the frame, leaving it and fading into the dark, with motes riding them
      const NR = 16, reach = Math.max(W, H) * 0.7;
      add(b.cx, b.cy, W * 0.66, H * 0.7, 0, 0, c1, 0.12 * k, 0.8);
      for (let i = 0; i < NR; i++) {
        const a = T * 0.12 + (i / NR) * TAU, ca = Math.cos(a), sa = Math.sin(a), r0 = Math.min((W / 2) / Math.max(1e-3, Math.abs(ca)), (H / 2) / Math.max(1e-3, Math.abs(sa))) * 0.98;
        const wide = i % 2 === 0, len = reach * (wide ? 1 : 0.7), flick = 0.65 + 0.35 * Math.sin(T * 1.4 + i * 1.7);
        add(b.cx + ca * (r0 + len), b.cy + sa * (r0 + len), len, wide ? 0.05 : 0.026, a, 6, wide ? c1 : mixRGB(c1, c2, 0.5), (wide ? 0.85 : 0.6) * k * flick, 0.5);
      }
      for (let i = 0; i < L(ctx, 26); i++) {
        const hh = (m: number): number => h1(i * 7 + m), a = (hh(1) * NR | 0) / NR * TAU + T * 0.12, ca = Math.cos(a), sa = Math.sin(a), r0 = Math.min((W / 2) / Math.max(1e-3, Math.abs(ca)), (H / 2) / Math.max(1e-3, Math.abs(sa))), ph = fract(T * (0.2 + 0.2 * hh(2)) + hh(3) * 5);
        add(b.cx + ca * (r0 + ph * reach * 0.8), b.cy + sa * (r0 + ph * reach * 0.8), 0.02 * bell(ph), 0.02 * bell(ph), 0.3, 2, mixRGB(c1, white, 0.5), 1.2 * k * bell(ph));
      }
      return true;
    }
    case 'fairies': {
      // fairy lights strung along the top and fireflies wandering round the board, each with a short trail
      const NB = L(ctx, 34);
      for (let i = 0; i < NB; i++) {
        const u = (i + 0.5) / NB, x = x0 - 0.02 + u * (W + 0.04), sag = Math.sin(u * Math.PI) * 0.035, tw = 0.5 + 0.5 * Math.sin(T * (1.4 + 0.8 * h1(i)) + i * 2.1);
        bulb(f, x, y0 - 0.03 + sag, 0.009, i % 2 ? c1 : c2, (0.5 + 0.8 * tw) * k);
      }
      for (let i = 0; i < L(ctx, 34); i++) {
        const hh = (m: number): number => h1(i * 17 + m), base = perim(b, hh(1), -0.045 * (0.3 + hh(2))), sp = 0.3 + 0.5 * hh(3);
        const pos = (tt: number): { x: number; y: number } => ({ x: base.x + Math.sin(tt * sp + i * 2.1) * 0.06 + Math.sin(tt * 0.9 + i) * 0.02, y: base.y + Math.cos(tt * sp * 0.8 + i * 1.3) * 0.05 });
        const q = pos(T), pulse = (0.5 + 0.5 * Math.sin(T * (1 + 2 * hh(4)) + i * 3)) ** 2, col = mixRGB(c1, c2, hh(5));
        for (let m = 1; m <= 4; m++) { const o = pos(T - m * 0.07); add(o.x, o.y, 0.02 * (1 - m * 0.18), 0.02 * (1 - m * 0.18), 0, 0, col, 0.4 * pulse * k * (1 - m * 0.22), 2); }
        add(q.x, q.y, 0.034, 0.034, 0, 0, col, 0.9 * pulse * k, 2);
        add(q.x, q.y, 0.011, 0.011, 0, 3, mixRGB(col, white, 0.6), 1.2 * pulse * k);
      }
      return true;
    }
    case 'lasers': {
      // a laser show: beams fan out of the four corners and sweep across the board, bright where they meet the frame
      const corners: [number, number, number][] = [[x0 - 0.03, y0 - 0.03, Math.PI * 0.25], [x1 + 0.03, y0 - 0.03, Math.PI * 0.75], [x0 - 0.03, y1 + 0.03, -Math.PI * 0.25], [x1 + 0.03, y1 + 0.03, -Math.PI * 0.75]];
      add(b.cx, b.cy, W * 0.6, H * 0.62, 0, 0, c1, 0.05 * k, 1.2);
      corners.forEach(([cx, cy, base], ci) => {
        const col = ci % 2 ? c2 : c1;
        for (let j = 0; j < 3; j++) {
          const a = base + Math.sin(T * (0.5 + 0.17 * j) + ci * 1.7 + j * 2.1) * 0.5 + (j - 1) * 0.28, len = 1.5, mx = cx + Math.cos(a) * len / 2, my = cy + Math.sin(a) * len / 2;
          add(mx, my, len / 2, 0.02, a, 0, col, 0.4 * k, 3);
          add(mx, my, len / 2, 0.0045, a, 0, mixRGB(col, white, 0.5), 2.2 * k, 3);
        }
        add(cx, cy, 0.05, 0.05, 0, 3, col, 1.0 * k);
        add(cx, cy, 0.09, 0.09, T * 0.5, 2, mixRGB(col, white, 0.5), 0.8 * k);
      });
      for (let i = 0; i < L(ctx, 14); i++) { const q = perim(b, h1(i * 5 + 2), 0.005), ph = 0.5 + 0.5 * Math.sin(T * (2 + h1(i)) + i * 2); add(q.x, q.y, 0.03 * ph, 0.03 * ph, 0.2, 2, i % 2 ? c2 : c1, 1.2 * k * ph); }
      return true;
    }
    case 'waves': {
      // an ocean swell along the bottom in three layers: a body of water, crests with foam, light shafts from above and rising bubbles
      const NW = L(ctx, 64);
      for (let l = 2; l >= 0; l--) {
        const col = mixRGB(c1, c2, l / 2), base = y1 - 0.02 - l * 0.075;
        for (let i = 0; i < NW; i++) {
          const u = i / (NW - 1), x = x0 - 0.05 + u * (W + 0.1), ph = u * 20 + T * (1.1 + 0.35 * l) + l * 2.1, ph2 = u * 9 - T * 0.7 + l, y = base + Math.sin(ph) * 0.026 + Math.sin(ph2) * 0.012;
          add(x, y + 0.045, 0.07, 0.07, 0, 0, col, (0.5 - 0.1 * l) * k, 1.3);                  // the water under the crest
          add(x, y, 0.045, 0.026, 0, 0, mixRGB(col, white, 0.35), (0.9 - 0.15 * l) * k, 1.8);   // the crest
          if (Math.sin(ph) > 0.86 && (i + l) % 2 === 0) { add(x, y - 0.01, 0.034, 0.034, 0.2, 2, white, 1.3 * k); add(x, y - 0.004, 0.016, 0.012, 0, 0, white, 1.2 * k, 2); }
        }
      }
      for (let i = 0; i < 5; i++) add(x0 + ((i + 0.5) / 5) * W + Math.sin(T * 0.5 + i) * 0.04, y0 - 0.1, 0.7, 0.05, Math.PI / 2 + (i - 2) * 0.1 + Math.sin(T * 0.4 + i) * 0.03, 6, mixRGB(c1, white, 0.4), 0.35 * k, 0.5);
      for (let i = 0; i < L(ctx, 18); i++) { const hh = (m: number): number => h1(i * 13 + m + 70), ph = fract(T * (0.14 + 0.12 * hh(1)) + hh(2) * 5), r = 0.011 + 0.016 * hh(3); add(x0 + hh(4) * W + Math.sin(ph * 11 + i) * 0.015, y1 + 0.02 - ph * H * 0.95, r, r, 0, 1, mixRGB(c1, white, 0.6), 0.9 * k * bell(ph), 0.14); }
      return true;
    }
    default: return false;
  }
}
