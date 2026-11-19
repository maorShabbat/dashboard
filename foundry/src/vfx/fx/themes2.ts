/**
 * Eight more board themes: space (nebula, orbiting planet, shooting stars), haunted (moon, mist, bats, candles), festival (paper
 * lanterns and blossom), candy (sprinkles, lollipops), pirate (lanterns, sea fog, coin glints), cyberpunk (neon rain, signs, glitch),
 * Christmas (lights, snow, baubles) and steampunk (turning gears, steam, rivets). `board.theme` in boardmods.ts hands them the theme it
 * does not know; each draws round and outside the board, so it follows the board's size, and tints the grid through `themeMod2`.
 */
import type { Frame, RGB } from '../engine/frame';
import { h1, lerp, mixRGB } from '../engine/math';
import type { BoardInfo, EffectCtx } from './effect';
import { bell, bulb, fract, perim } from './boardgeom';
import { ellipsePoly, quadPoly, triPoly } from './helpers';
import { segment } from './pieces';
import { flame, setVolPalette, smokePuff } from './volume';

const TAU = Math.PI * 2;
export const THEMES2: [string, string][] = [['space', 'Space: nebula, orbiting planet, shooting stars'], ['haunted', 'Haunted: moon, mist, bats, candles'], ['festival', 'Festival: paper lanterns and blossom'], ['candy', 'Candy: sprinkles, lollipops, sugar glints'], ['pirate', 'Pirate: lanterns, sea fog, coin glints'], ['cyberpunk', 'Cyberpunk: neon rain, signs, glitch'], ['christmas', 'Christmas: lights, snow, baubles'], ['steampunk', 'Steampunk: gears, steam, rivets']];

type Mod = { tint: [number, number, number]; bright: number; wobble: number };
/** How a theme tints and moves the grid itself; null for a theme that is not one of these. */
export function themeMod2(th: string, k: number, live: number, T: number): Mod | null {
  const m = (r: number, g: number, b: number, bright = 1, wob = 0): Mod => ({ tint: [lerp(1, r, k * live), lerp(1, g, k * live), lerp(1, b, k * live)], bright: lerp(1, bright, live), wobble: wob * live });
  switch (th) {
    case 'space': return m(0.9, 0.93, 1.14);
    case 'haunted': return m(0.94, 0.9, 1.08, 0.97);
    case 'festival': return m(1.09, 0.96, 0.92);
    case 'candy': return m(1.07, 0.97, 1.07);
    case 'pirate': return m(1.05, 1.0, 0.88);
    case 'cyberpunk': return { ...m(0.93, 0.95, 1.14), bright: 1 + 0.05 * Math.sin(T * 37) * (h1(Math.floor(T * 7)) > 0.5 ? 1 : 0.2) * live };
    case 'christmas': return m(1.02, 1.04, 0.98);
    case 'steampunk': return m(1.09, 1.0, 0.86);
    default: return null;
  }
}

const white: RGB = [1, 1, 1];
/** A toothed wheel: a ring of teeth round a body, with spokes and a hub; `rot` is its turn. */
function gear(f: Frame, x: number, y: number, r: number, teeth: number, rot: number, col: RGB, dark: RGB, a: number): void {
  const tw = (TAU / teeth) * 0.28;
  for (let i = 0; i < teeth; i++) {
    const t0 = rot + (i / teeth) * TAU, c0 = Math.cos(t0), s0 = Math.sin(t0), px = -s0, py = c0;
    triPoly(f.polys, [x + c0 * r * 0.86 + px * r * tw, y + s0 * r * 0.86 + py * r * tw], [x + c0 * r * 1.12 + px * r * tw * 0.7, y + s0 * r * 1.12 + py * r * tw * 0.7], [x + c0 * r * 1.12 - px * r * tw * 0.7, y + s0 * r * 1.12 - py * r * tw * 0.7], col, a);
    triPoly(f.polys, [x + c0 * r * 0.86 + px * r * tw, y + s0 * r * 0.86 + py * r * tw], [x + c0 * r * 1.12 - px * r * tw * 0.7, y + s0 * r * 1.12 - py * r * tw * 0.7], [x + c0 * r * 0.86 - px * r * tw, y + s0 * r * 0.86 - py * r * tw], col, a);
  }
  ellipsePoly(f.polys, x, y, r, r, 0, col, a, 24);
  ellipsePoly(f.polys, x, y, r * 0.74, r * 0.74, 0, dark, a, 24);
  for (let i = 0; i < 5; i++) { const t0 = rot + (i / 5) * TAU; quadPoly(f.polys, x + Math.cos(t0) * r * 0.4, y + Math.sin(t0) * r * 0.4, r * 0.34, r * 0.07, t0, col, a); }
  ellipsePoly(f.polys, x, y, r * 0.26, r * 0.26, 0, col, a, 14);
  ellipsePoly(f.polys, x - r * 0.04, y - r * 0.04, r * 0.12, r * 0.12, 0, mixRGB(col, white, 0.5), a, 10);
}

/** Draw a theme; false when `th` is not one of these. `live` fades it in and out (and carries the strength), `q` is the quality tier. */
export function theme2(f: Frame, b: BoardInfo, ctx: EffectCtx, th: string, T: number, live: number, q: number): boolean {
  const add = (x: number, y: number, hw: number, hh: number, rot: number, type: number, color: RGB, intensity: number, e1?: number): void => { if (intensity > 0.003) f.additive.push({ x, y, hw, hh, rot, type, color, intensity, e1 }); };
  const { x0, y0, x1, y1 } = b.box, W = x1 - x0, H = y1 - y0, n = (v: number): number => Math.max(2, Math.round(v * Math.min(1, q + 0.3)));
  switch (th) {
    case 'space': {
      // soft nebula clouds drift behind the frame, stars twinkle all round it, a ringed planet orbits it and shooting stars cross now and then
      const neb: RGB[] = [[0.45, 0.25, 0.95], [0.2, 0.5, 1], [0.95, 0.3, 0.75], [0.3, 0.85, 0.9]];
      for (let i = 0; i < 7; i++) { const a = T * 0.05 + i * 0.9, x = b.cx + Math.cos(a) * W * 0.62, y = b.cy + Math.sin(a * 1.3 + i) * H * 0.58; add(x, y, W * 0.32, H * 0.42, a, 0, neb[i % 4]!, 0.3 * live * (0.75 + 0.25 * Math.sin(T * 0.4 + i)), 0.5); }
      for (let i = 0; i < n(70); i++) {
        const hh = (m: number): number => h1(i * 17 + m), x = b.cx + (hh(1) - 0.5) * (W + 0.5), y = b.cy + (hh(2) - 0.5) * (H + 0.35), inside = x > x0 - 0.02 && x < x1 + 0.02 && y > y0 - 0.02 && y < y1 + 0.02;
        if (inside) continue;
        const tw = 0.5 + 0.5 * Math.sin(T * (0.8 + 1.6 * hh(3)) + hh(4) * 6);
        add(x, y, 0.012 + 0.016 * hh(5) * tw, 0.012 + 0.016 * hh(5) * tw, 0.2, 2, mixRGB([0.8, 0.9, 1], [1, 0.9, 0.7], hh(6)), (0.5 + 0.8 * tw) * live);
      }
      const pa = T * 0.16, px = b.cx + Math.cos(pa) * (W * 0.58), py = b.cy + Math.sin(pa) * (H * 0.62), pr = 0.05, back = Math.sin(pa) < 0;
      const planet = (): void => {
        ellipsePoly(f.polys, px, py, pr, pr, 0, [0.35, 0.2, 0.7], 0.96 * live, 24); ellipsePoly(f.polys, px - pr * 0.18, py - pr * 0.18, pr * 0.78, pr * 0.78, 0, [0.62, 0.42, 0.95], 0.9 * live, 24);
        ellipsePoly(f.polys, px - pr * 0.32, py - pr * 0.34, pr * 0.34, pr * 0.3, 0, [0.9, 0.78, 1], 0.7 * live, 16);
        add(px, py, pr * 2.6, pr * 0.62, -0.35, 1, [1, 0.88, 0.6], 0.8 * live, 0.1); add(px, py, pr * 3.1, pr * 0.74, -0.35, 1, [0.9, 0.6, 1], 0.4 * live, 0.12);
        add(px, py, pr * 2.4, pr * 2.4, 0, 0, [0.6, 0.4, 1], 0.3 * live, 1.8);
      };
      void back; planet();
      for (let s = 0; s < 2; s++) {
        const ph = fract(T * 0.22 + s * 0.5 + 0.13), on = ph < 0.3 ? ph / 0.3 : 0, x = x0 - 0.1 + fract(h1(s * 7 + Math.floor(T * 0.22 + s * 0.5 + 0.13) * 13)) * (W + 0.2) + on * 0.5, y = y0 - 0.14 + on * 0.34;
        add(x, y, 0.2, 0.0035, Math.atan2(0.34, 0.5), 4, [0.85, 0.95, 1], 1.6 * live * Math.sin(Math.PI * on), 1.6);
      }
      return true;
    }
    case 'haunted': {
      // a big pale moon, bats crossing it, mist along the ground, flickering candles at the corners, wisps rising off the frame
      const mx = x1 + 0.14, my = y0 + 0.07, mr = 0.085;
      add(mx, my, mr * 3.4, mr * 3.4, 0, 0, [0.75, 0.82, 1], 0.4 * live, 1.4);
      ellipsePoly(f.polys, mx, my, mr, mr, 0, [0.93, 0.96, 1], 0.95 * live, 28); ellipsePoly(f.polys, mx - mr * 0.3, my + mr * 0.15, mr * 0.2, mr * 0.2, 0, [0.78, 0.84, 0.95], 0.55 * live, 12); ellipsePoly(f.polys, mx + mr * 0.25, my - mr * 0.3, mr * 0.14, mr * 0.14, 0, [0.8, 0.86, 0.96], 0.5 * live, 10); ellipsePoly(f.polys, mx + mr * 0.2, my + mr * 0.38, mr * 0.24, mr * 0.18, 0, [0.82, 0.88, 0.97], 0.45 * live, 12);
      for (let i = 0; i < 4; i++) {
        const ph = fract(T * (0.05 + 0.015 * i) + i * 0.27), x = -0.1 + ph * (ctx.aspect + 0.2), y = y0 - 0.02 + Math.sin(ph * 9 + i * 2) * 0.06 + (i % 2) * 0.12 - 0.05, flap = Math.sin(T * 12 + i * 2), sz = 0.04 + 0.012 * (i % 2), dir = i % 2 ? -1 : 1, X = dir > 0 ? x : ctx.aspect - x;
        const wing = (sd: number): void => { const wy = -flap * sz * 0.9; triPoly(f.polys, [X, y], [X + sd * sz * 1.5, y + wy - sz * 0.2], [X + sd * sz * 0.8, y + sz * 0.5], [0.05, 0.03, 0.1], 0.95 * live); triPoly(f.polys, [X + sd * sz * 1.5, y + wy - sz * 0.2], [X + sd * sz * 2.1, y + wy * 0.6 + sz * 0.5], [X + sd * sz * 0.8, y + sz * 0.5], [0.05, 0.03, 0.1], 0.95 * live); };
        wing(-1); wing(1); ellipsePoly(f.polys, X, y, sz * 0.32, sz * 0.5, 0, [0.04, 0.02, 0.08], 0.98 * live, 8);
      }
      setVolPalette(f, 'fire', 'grey');
      for (let i = 0; i < 9; i++) { const ph = fract(T * 0.07 + i / 9), x = x0 - 0.1 + ((i + 0.5) / 9) * (W + 0.2); smokePuff(f, { x, y: y1 + 0.0 - Math.sin(ph * Math.PI) * 0.05, size: 0.14 + 0.04 * (i % 3), age: ph, seed: i + 3, t: T * 0.3, alpha: 0.8 * live * bell(ph), heat: 0, light: [-0.3, -0.9], soft: 0.9 }); }
      setVolPalette(f, 'fire', 'black');
      for (const sx of [-1, 1]) {
        const x = sx < 0 ? x0 - 0.06 : x1 + 0.06, y = y1 - 0.02, fl = 0.8 + 0.2 * Math.sin(T * 11 + sx * 3);
        quadPoly(f.polys, x, y - 0.03, 0.013, 0.04, 0, [0.9, 0.86, 0.75], 0.97 * live); ellipsePoly(f.polys, x, y - 0.075, 0.012, 0.006, 0, [0.95, 0.9, 0.8], 0.95 * live, 8);
        flame(f, { x, y: y - 0.078, w: 0.026, h: 0.07 * fl, age: 0.1, seed: sx + 9, t: T + sx, heat: 1, alpha: live, rot: Math.sin(T * 3 + sx) * 0.08, soft: true });
        add(x, y - 0.1, 0.18, 0.18, 0, 0, [1, 0.62, 0.22], 0.5 * live * fl, 1.2);
      }
      for (let i = 0; i < n(10); i++) { const hh = (m: number): number => h1(i * 13 + m + 5), ph = fract(T * (0.08 + 0.06 * hh(1)) + hh(2) * 4); add(x0 + hh(3) * W + Math.sin(ph * 8 + i) * 0.03, y1 + 0.05 - ph * (H + 0.2), 0.016, 0.07, 0, 0, [0.6, 1, 0.8], 0.28 * live * bell(ph), 1.0); }
      return true;
    }
    case 'festival': {
      // red paper lanterns hang from a cord above the grid and sway, each lit from inside; blossom drifts down
      segment(f.polys, { x: x0 - 0.06, y: y0 - 0.1 }, { x: x1 + 0.06, y: y0 - 0.12 }, 0.004, [0.5, 0.3, 0.1], 0.95 * live);
      const N = n(7);
      for (let i = 0; i < N; i++) {
        const u = (i + 0.5) / N, x0l = x0 - 0.04 + u * (W + 0.08), sway = Math.sin(T * 1.3 + i * 1.1) * 0.012, y = y0 - 0.1 + 0.03 + (i % 2) * 0.02, rx = 0.038, ry = 0.05, glow = 0.8 + 0.2 * Math.sin(T * 3 + i * 2);
        segment(f.polys, { x: x0l, y: y0 - 0.11 }, { x: x0l + sway, y: y - ry }, 0.0022, [0.5, 0.3, 0.1], 0.9 * live);
        add(x0l + sway, y, 0.11, 0.1, 0, 0, [1, 0.35, 0.1], 0.5 * live * glow, 1.3);
        ellipsePoly(f.polys, x0l + sway, y, rx, ry, 0, [0.7, 0.05, 0.05], 0.97 * live, 18); ellipsePoly(f.polys, x0l + sway, y, rx * 0.8, ry * 0.9, 0, [0.95, 0.2, 0.1], 0.95 * live, 18); ellipsePoly(f.polys, x0l + sway, y, rx * 0.45, ry * 0.8, 0, [1, 0.55, 0.2], 0.8 * live * glow, 14);
        for (const o of [-0.5, 0, 0.5]) segment(f.polys, { x: x0l + sway + o * rx * 1.5, y: y - ry * 0.85 }, { x: x0l + sway + o * rx * 0.6, y: y + ry * 0.9 }, 0.0015, [0.55, 0.05, 0.05], 0.7 * live);
        quadPoly(f.polys, x0l + sway, y - ry, rx * 0.5, 0.004, 0, [0.95, 0.75, 0.2], 0.97 * live); quadPoly(f.polys, x0l + sway, y + ry, rx * 0.5, 0.004, 0, [0.95, 0.75, 0.2], 0.97 * live);
        segment(f.polys, { x: x0l + sway, y: y + ry }, { x: x0l + sway + Math.sin(T * 2 + i) * 0.004, y: y + ry + 0.03 }, 0.003, [0.95, 0.75, 0.2], 0.95 * live);
      }
      for (let i = 0; i < n(34); i++) {
        const hh = (m: number): number => h1(i * 11 + m), ph = fract(T * (0.07 + 0.09 * hh(1)) + hh(2) * 6), rot = ph * 12 + i;
        ellipsePoly(f.polys, x0 - 0.1 + hh(3) * (W + 0.2) + Math.sin(ph * 9 + i) * 0.035, y0 - 0.12 + ph * (H + 0.35), 0.011, 0.005 + 0.004 * Math.abs(Math.sin(rot)), rot * 0.5, mixRGB([1, 0.78, 0.86], [1, 0.95, 0.97], hh(4)), 0.92 * live, 8);
      }
      for (const sx of [-1, 1]) add(sx < 0 ? x0 - 0.04 : x1 + 0.04, b.cy, 0.05, H * 0.55, 0, 0, [1, 0.75, 0.25], 0.18 * live, 1.2);
      return true;
    }
    case 'candy': {
      // sprinkles tumbling down, lollipops at the top corners, a pink and sky-blue glow breathing round the frame, sugar glints
      const cols: RGB[] = [[1, 0.35, 0.65], [0.3, 0.85, 1], [1, 0.9, 0.3], [0.6, 1, 0.5], [0.75, 0.5, 1], [1, 0.6, 0.25]];
      add(b.cx, b.cy, W * 0.72, H * 0.75, 0, 0, mixRGB([1, 0.45, 0.8], [0.4, 0.85, 1], 0.5 + 0.5 * Math.sin(T * 0.5)), 0.3 * live * (0.8 + 0.2 * Math.sin(T * 1.7)), 0.6);
      for (let i = 0; i < n(40); i++) {
        const hh = (m: number): number => h1(i * 13 + m), ph = fract(T * (0.1 + 0.12 * hh(1)) + hh(2) * 5), x = x0 - 0.1 + hh(3) * (W + 0.2), y = y0 - 0.12 + ph * (H + 0.35);
        if (x > x0 && x < x1 && y > y0 && y < y1 && hh(4) < 0.6) continue;
        quadPoly(f.polys, x + Math.sin(ph * 8 + i) * 0.01, y, 0.0058, 0.0165, ph * 11 + i * 2, cols[i % cols.length]!, 0.95 * live);
      }
      for (const sx of [-1, 1]) {
        const x = sx < 0 ? x0 - 0.05 : x1 + 0.05, y = y0 - 0.06, r = 0.058, sway = Math.sin(T * 1.2 + sx) * 0.01;
        quadPoly(f.polys, x + sway * 0.5, y + 0.12, 0.0065, 0.1, 0, [0.95, 0.92, 0.9], 0.97 * live);
        ellipsePoly(f.polys, x + sway, y, r, r, 0, [1, 0.95, 0.95], 0.98 * live, 24);
        for (let j = 0; j < 7; j++) { const a0 = (j / 7) * TAU + T * 0.15, a1 = a0 + TAU / 14; triPoly(f.polys, [x + sway, y], [x + sway + Math.cos(a0) * r * 0.97, y + Math.sin(a0) * r * 0.97], [x + sway + Math.cos(a1) * r * 0.97, y + Math.sin(a1) * r * 0.97], cols[(j + (sx < 0 ? 0 : 2)) % 3 === 0 ? 0 : 1]!, 0.95 * live); }
        ellipsePoly(f.polys, x + sway - r * 0.3, y - r * 0.32, r * 0.22, r * 0.14, -0.7, [1, 1, 1], 0.7 * live, 10);
        add(x + sway, y, r * 2.6, r * 2.6, 0, 0, [1, 0.5, 0.8], 0.3 * live, 1.5);
      }
      for (let i = 0; i < n(16); i++) { const hh = (m: number): number => h1(i * 19 + m + 3), ph = fract(T * 0.5 + hh(1)), q2 = perim(b, hh(2), -0.02 - 0.04 * hh(3)); add(q2.x, q2.y, 0.04 * bell(ph), 0.04 * bell(ph), 0.2, 2, mixRGB(cols[i % cols.length]!, white, 0.5), 1.1 * live * bell(ph)); }
      return true;
    }
    case 'pirate': {
      // two ship's lanterns swinging on long ropes beside the frame, teal sea fog along the bottom, a rope along the top edge, glints of gold
      const rope: RGB = [0.62, 0.48, 0.3], iron: RGB = [0.2, 0.17, 0.12];
      segment(f.polys, { x: x0 - 0.05, y: y0 - 0.075 }, { x: x1 + 0.05, y: y0 - 0.075 }, 0.0065, rope, 0.95 * live);
      for (let i = 0; i < n(40); i++) { const x = x0 - 0.05 + (i / 39) * (W + 0.1); segment(f.polys, { x: x - 0.004, y: y0 - 0.079 }, { x: x + 0.004, y: y0 - 0.071 }, 0.0022, [0.38, 0.28, 0.16], 0.9 * live); }
      setVolPalette(f, 'fire', 'black');
      for (const sx of [-1, 1]) {
        const ax = sx < 0 ? x0 - 0.1 : x1 + 0.1, ay = y0 - 0.18, len = 0.2, ang = Math.sin(T * 1.1 + sx * 1.7) * 0.09, lx = ax + Math.sin(ang) * len, ly = ay + Math.cos(ang) * len, ca = Math.cos(ang), sa = Math.sin(ang);
        const at = (u: number, v: number): [number, number] => [lx + ca * u + sa * v, ly - sa * u + ca * v];       // a point of the lantern: u across, v down, turning with the rope
        segment(f.polys, { x: ax, y: ay }, { x: lx, y: ly - 0.04 }, 0.0042, rope, 0.95 * live);
        quadPoly(f.polys, lx, ly - 0.03, 0.026, 0.01, ang, iron, 0.97 * live);                                         // cap
        triPoly(f.polys, at(-0.022, -0.02), at(0.022, -0.02), at(0, -0.055), iron, 0.97 * live);
        quadPoly(f.polys, lx, ly + 0.005, 0.021, 0.03, ang, [1, 0.78, 0.35], 0.6 * live);                              // glass lit from inside
        for (const o of [-1, 1]) { const p0 = at(o * 0.022, -0.025), p1 = at(o * 0.022, 0.036); segment(f.polys, { x: p0[0], y: p0[1] }, { x: p1[0], y: p1[1] }, 0.0034, iron, 0.97 * live); }
        const bs = at(0, 0.043); quadPoly(f.polys, bs[0], bs[1], 0.028, 0.008, ang, iron, 0.97 * live);                 // base
        const fp = at(0, 0.03); flame(f, { x: fp[0], y: fp[1], w: 0.034, h: 0.075 * (0.8 + 0.2 * Math.sin(T * 10 + sx)), age: 0.1, seed: sx + 12, t: T + sx, heat: 1, alpha: live, soft: true });
        add(lx, ly + 0.005, 0.3, 0.3, 0, 0, [1, 0.7, 0.3], 0.6 * live * (0.85 + 0.15 * Math.sin(T * 9 + sx)), 1.2);
      }
      setVolPalette(f, 'fire', 'ice');
      for (let i = 0; i < 9; i++) { const ph = fract(T * 0.06 + i / 9), x = x0 - 0.1 + ((i + 0.5) / 9) * (W + 0.2); smokePuff(f, { x, y: y1 + 0.01 - Math.sin(ph * Math.PI) * 0.04, size: 0.14, age: ph, seed: i + 8, t: T * 0.3, alpha: 0.6 * live * bell(ph), heat: 0, light: [-0.3, -0.9], soft: 0.9 }); }
      for (let i = 0; i < n(14); i++) { const hh = (m: number): number => h1(i * 17 + m + 7), ph = fract(T * 0.55 + hh(1)), x = x0 + hh(2) * W, y = y1 - 0.02 - hh(3) * 0.12; add(x, y, 0.036 * bell(ph), 0.036 * bell(ph), 0.2, 2, [1, 0.88, 0.4], 1.2 * live * bell(ph)); }
      return true;
    }
    case 'cyberpunk': {
      // neon rain falling through the light of two signs, a pink bar above and a cyan bar below, scanlines, and now and then a glitch
      const pink: RGB = [1, 0.2, 0.7], cyan: RGB = [0.1, 0.9, 1], fl = 0.8 + 0.2 * Math.sin(T * 23) * (h1(Math.floor(T * 8)) > 0.2 ? 1 : 0.3);
      for (let i = 0; i < n(46); i++) {
        const hh = (m: number): number => h1(i * 13 + m), ph = fract(T * (0.7 + 0.8 * hh(1)) + hh(2) * 5), x = x0 - 0.12 + hh(3) * (W + 0.24), y = y0 - 0.2 + ph * (H + 0.5);
        add(x, y, 0.05 + 0.05 * hh(4), 0.0024, -Math.PI / 2, 4, hh(5) < 0.5 ? pink : cyan, 2.4 * live * (0.5 + 0.5 * hh(6)), 1.5);
      }
      add(b.cx, y0 - 0.03, W * 0.52, 0.012, 0, 0, pink, 2.6 * live * fl, 1.6); add(b.cx, y0 - 0.03, W * 0.56, 0.09, 0, 0, pink, 0.75 * live * fl, 1.4);
      add(b.cx, y1 + 0.03, W * 0.52, 0.012, 0, 0, cyan, 2.6 * live * fl, 1.6); add(b.cx, y1 + 0.03, W * 0.56, 0.09, 0, 0, cyan, 0.75 * live * fl, 1.4);
      for (const sx of [-1, 1]) { const x = sx < 0 ? x0 - 0.06 : x1 + 0.06, col = sx < 0 ? cyan : pink; add(x, b.cy, 0.014, H * 0.5, 0, 0, col, 2.4 * live * fl, 1.6); add(x, b.cy, 0.1, H * 0.56, 0, 0, col, 0.7 * live * fl, 1.2); }
      for (let r = 0; r <= H / 0.012; r++) add(b.cx, y0 + r * 0.012, W / 2, 0.0008, 0, 0, cyan, 0.16 * live, 1.4);
      const gl = h1(Math.floor(T * 6) * 7 + 3) > 0.8 ? 1 : 0;
      for (let i = 0; i < 3 * gl; i++) { const hh = (m: number): number => h1(Math.floor(T * 6) * 31 + i * 7 + m), y = y0 + hh(1) * H; add(b.cx + (hh(2) - 0.5) * 0.04, y, W / 2, 0.005 + 0.012 * hh(3), 0, 0, i % 2 ? pink : cyan, 1.0 * live, 1.4); }
      return true;
    }
    case 'christmas': {
      // a string of coloured lights round the frame, snow falling in two sizes, baubles hanging from the top corners and a star over the middle
      const cols: RGB[] = [[1, 0.2, 0.2], [0.3, 1, 0.4], [1, 0.85, 0.3], [0.35, 0.6, 1]];
      const N = n(64);
      for (let i = 0; i < N; i++) { const qq = perim(b, i / N, -0.032), on = (Math.sin(T * 2.4 + i * 1.7) + 1) / 2; bulb(f, qq.x, qq.y, 0.011, cols[i % 4]!, (0.5 + 0.9 * on) * live); }
      for (let i = 0; i < n(60); i++) {
        const hh = (m: number): number => h1(i * 11 + m), ph = fract(T * (0.1 + 0.16 * hh(1)) + hh(2) * 5), big = hh(3) < 0.25;
        add(x0 - 0.12 + hh(4) * (W + 0.24) + Math.sin(ph * 11 + i) * 0.025, y0 - 0.2 + ph * (H + 0.45), big ? 0.011 : 0.006, big ? 0.011 : 0.006, 0, 0, white, (big ? 1.5 : 1.0) * live, 2);
      }
      for (const sx of [-1, 1]) {
        const ax = sx < 0 ? x0 + 0.05 : x1 - 0.05, sw = Math.sin(T * 1.4 + sx) * 0.006, y = y0 - 0.075, col: RGB = sx < 0 ? [0.85, 0.1, 0.12] : [0.15, 0.4, 0.9];
        segment(f.polys, { x: ax, y: y0 - 0.12 }, { x: ax + sw, y: y - 0.02 }, 0.0022, [0.85, 0.75, 0.4], 0.95 * live);
        quadPoly(f.polys, ax + sw, y - 0.017, 0.008, 0.005, 0, [0.95, 0.8, 0.3], 0.97 * live);
        ellipsePoly(f.polys, ax + sw, y + 0.005, 0.026, 0.026, 0, mixRGB(col, [0, 0, 0], 0.35), 0.98 * live, 20); ellipsePoly(f.polys, ax + sw - 0.003, y + 0.002, 0.022, 0.022, 0, col, 0.97 * live, 20); ellipsePoly(f.polys, ax + sw - 0.009, y - 0.007, 0.008, 0.005, -0.7, white, 0.85 * live, 8);
        add(ax + sw, y + 0.005, 0.07, 0.07, 0, 0, col, 0.3 * live, 1.4);
      }
      add(b.cx, y0 - 0.09, 0.08, 0.08, T * 0.2, 2, [1, 0.9, 0.5], 1.3 * live * (0.8 + 0.2 * Math.sin(T * 2)));
      add(b.cx, y0 - 0.09, 0.2, 0.2, 0, 0, [1, 0.85, 0.4], 0.25 * live, 1.4);
      return true;
    }
    case 'steampunk': {
      // brass gears turning at the corners and meshing with each other, rivets along the frame, steam venting from pipes at the sides
      const brass: RGB = [0.82, 0.58, 0.2], dark: RGB = [0.32, 0.2, 0.08];
      const G: [number, number, number, number, number][] = [[x0 - 0.04, y0 - 0.04, 0.075, 14, 0.25], [x0 + 0.062, y0 - 0.1, 0.04, 8, -0.4375], [x1 + 0.04, y0 - 0.04, 0.06, 12, -0.3], [x1 + 0.03, y1 - 0.01, 0.062, 13, 0.27], [x0 - 0.035, y1 - 0.0, 0.048, 10, -0.33]];
      for (const [gx, gy, r, tn, sp] of G) { gear(f, gx, gy, r, tn, T * sp, brass, dark, 0.97 * live); add(gx, gy, r * 1.8, r * 1.8, 0, 0, [1, 0.7, 0.3], 0.12 * live, 1.6); }
      for (let i = 0; i < n(24); i++) { const qq = perim(b, i / 24, -0.012); ellipsePoly(f.polys, qq.x, qq.y, 0.005, 0.005, 0, brass, 0.95 * live, 8); ellipsePoly(f.polys, qq.x - 0.001, qq.y - 0.001, 0.002, 0.002, 0, [1, 0.9, 0.6], 0.9 * live, 6); }
      setVolPalette(f, 'fire', 'white');
      for (const sx of [-1, 1]) {
        const x = sx < 0 ? x0 - 0.075 : x1 + 0.075, y = b.cy + 0.1;
        quadPoly(f.polys, x, y + 0.12, 0.011, 0.14, 0, [0.5, 0.33, 0.14], 0.97 * live); quadPoly(f.polys, x - sx * 0.002, y + 0.12, 0.004, 0.14, 0, [0.9, 0.7, 0.35], 0.6 * live);
        for (let i = 0; i < 5; i++) { const ph = fract(T * 0.45 + i / 5 + (sx > 0 ? 0.3 : 0)); smokePuff(f, { x: x + Math.sin(ph * 7 + i) * 0.02, y: y - ph * 0.28, size: 0.035 + 0.06 * ph, age: ph * 0.7, seed: i + sx * 4, t: T * 0.4, alpha: 0.55 * live * Math.sin(Math.PI * ph), heat: 0, light: [0.3, -0.9], soft: 0.5 }); }
      }
      add(b.cx, y1 + 0.03, W * 0.5, 0.012, 0, 0, [1, 0.65, 0.2], 0.4 * live * (0.8 + 0.2 * Math.sin(T * 3)), 1.3);
      return true;
    }
    default: return false;
  }
}
