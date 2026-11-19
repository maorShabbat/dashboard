/**
 * Effects for a whole slot row or a whole reel: fire, electricity, a lightning bolt, a laser, plasma, ice, a beam of light, smoke,
 * glitter, a wave of water, wind, a rainbow, shockwaves, magic or a blade slash sweep along it from one end to the other, and the
 * symbols in that row or reel can react as the front passes (glow, jump, shake or fade). They start with the layer, or on a moment of
 * the board: the win, the last reel stopping, the wild expanding, the first special symbol landing.
 */
import { makeRng } from '../../core/util/prng';
import { color, enm, num } from '../../core/params';
import { FIRE_PALETTES, type Frame, type RGB } from '../engine/frame';
import { discharge, jag, ribbon } from '../engine/lightning';
import { clamp, easeOutBack, h1, hex, mixRGB, smoothstep } from '../engine/math';
import { n, s, b as bool, type BoardInfo, type CellMod, type EffectCtx, type PValues, type ShowEffect } from './effect';
import { triPoly } from './helpers';
import { flame, setVolPalette, smokePuff } from './volume';

const G = (group: string) => ({ section: 'Effect', group });
const TAU = Math.PI * 2;
const fract = (x: number): number => x - Math.floor(x);
const L = (ctx: EffectCtx, v: number): number => Math.max(1, Math.round(v * Math.max(0.3, ctx.quality ?? 1)));

function board(ctx: EffectCtx): BoardInfo {
  if (ctx.board) return ctx.board;
  const cx = ctx.aspect / 2, cy = 0.5, W = 1.3, H = 0.75, cell = 0.23, pitch = 0.25;
  return { cols: 5, rows: 3, cell, pitch, cx, cy, box: { x0: cx - W / 2, y0: cy - H / 2, x1: cx + W / 2, y1: cy + H / 2 }, cellCenter: (r, c) => ({ x: cx - 2 * pitch + c * pitch, y: cy - pitch + r * pitch }), events: [], roles: [], end: 0, style: 'classic', pattern: '' };
}

const ELEMENTS: [string, string][] = [['fire', 'Fire'], ['energy', 'Energy: electric arcs'], ['lightning', 'Lightning bolt'], ['laser', 'Laser beam'], ['plasma', 'Plasma stream'], ['ice', 'Ice and frost'], ['light', 'Beam of light'], ['smoke', 'Smoke'], ['glitter', 'Glitter and gold dust'], ['water', 'Wave of water'], ['wind', 'Wind'], ['rainbow', 'Rainbow'], ['shock', 'Shockwaves'], ['magic', 'Magic runes'], ['slash', 'Blade slash']];
const NATURAL: Record<string, [string, string]> = {
  fire: ['#ff8a2a', '#ffd36a'], energy: ['#7fd8ff', '#c8a0ff'], lightning: ['#a8d0ff', '#ffffff'], laser: ['#ff3a4a', '#ffd0d0'], plasma: ['#8a5aff', '#ff4ad8'], ice: ['#9ad8ff', '#ffffff'], light: ['#ffe9a0', '#ffffff'], smoke: ['#aaaaaa', '#ffffff'],
  glitter: ['#ffd24a', '#ffffff'], water: ['#3ab0ff', '#c8f0ff'], wind: ['#e6f3ff', '#ffffff'], rainbow: ['#ffffff', '#ffffff'], shock: ['#ffd24a', '#fff3b0'], magic: ['#c89aff', '#7affd8'], slash: ['#ffffff', '#9ad8ff'],
};
const ALONG: [string, string][] = [['row', 'A row, left to right'], ['row-back', 'A row, right to left'], ['reel', 'A reel, top to bottom'], ['reel-up', 'A reel, bottom to top']];
const ANCHOR: [string, string][] = [['start', 'The start of the effect'], ['win', 'The win being shown'], ['last-stop', 'The last reel stopping'], ['land', 'The first special symbol landing'], ['expand', 'The wild expanding']];
const REACT: [string, string][] = [['none', 'Nothing: the symbols stay as they are'], ['glow', 'They glow'], ['jump', 'They jump'], ['shake', 'They shake'], ['fade', 'They fade into it and come back']];

interface Lane { vertical: boolean; idx: number; ax: number; ay: number; dx: number; dy: number; nx: number; ny: number; len: number; cell: number; cells: number; t0: number; reverse: boolean }
function laneOf(b: BoardInfo, along: string, idx: number, t0: number): Lane {
  const vertical = along.startsWith('reel'), reverse = along === 'row-back' || along === 'reel-up';
  if (!vertical) {
    const y = b.cellCenter(idx, 0).y, len = b.box.x1 - b.box.x0;
    return { vertical, idx, ax: reverse ? b.box.x1 : b.box.x0, ay: y, dx: reverse ? -1 : 1, dy: 0, nx: 0, ny: 1, len, cell: b.cell, cells: b.cols, t0, reverse };
  }
  const x = b.cellCenter(0, idx).x, len = b.box.y1 - b.box.y0;
  return { vertical, idx, ax: x, ay: reverse ? b.box.y1 : b.box.y0, dx: 0, dy: reverse ? -1 : 1, nx: 1, ny: 0, len, cell: b.cell, cells: b.rows, t0, reverse };
}
const P = (l: Lane, sPos: number, off = 0): { x: number; y: number } => ({ x: l.ax + l.dx * sPos * l.len + l.nx * off, y: l.ay + l.dy * sPos * l.len + l.ny * off });

/** The moment (effect time) an anchor happens, or null if the board has no such moment. */
function anchorTime(b: BoardInfo, ctx: EffectCtx, anchor: string): number | null {
  const t0 = ctx.start ?? 0;
  if (anchor === 'start') return 0;
  const ev = (k: string) => b.events.filter((e) => e.kind === k);
  if (anchor === 'win') { const e = ev('win')[0]; return e ? e.t - t0 : null; }
  if (anchor === 'last-stop') { const e = ev('reel-stop'); return e.length ? Math.max(...e.map((x) => x.t)) - t0 : null; }
  if (anchor === 'land') { const e = ev('land')[0]; return e ? e.t - t0 : null; }
  const e = ev('expand')[0]; return e ? e.t - t0 : null;
}
function lanesOf(b: BoardInfo, ctx: EffectCtx, p: PValues): Lane[] {
  const along = s(p, 'along'), vertical = along.startsWith('reel'), count = vertical ? b.cols : b.rows;
  const base = (anchorTime(b, ctx, s(p, 'anchor')) ?? (ctx.start === undefined ? 0 : 0.2)) + n(p, 'delay');
  if (bool(p, 'all')) return Array.from({ length: count }, (_, i) => laneOf(b, along, i, base + i * n(p, 'gap')));
  const want = Math.round(n(p, 'lane')), idx = want <= 0 ? Math.floor((count - 1) / 2) : clamp(want - 1, 0, count - 1);
  return [laneOf(b, along, idx, base)];
}
const palette = (p: PValues): [RGB, RGB] => { const el = s(p, 'element'), nat = bool(p, 'natural'), d = NATURAL[el] ?? NATURAL.fire!; return nat ? [hex(d[0]), hex(d[1])] : [hex(s(p, 'tint')), hex(s(p, 'tint2'))]; };

// ---------------------------------------------------------------------------------------------------------------------

/** Draw one element for one lane at effect time t. */
function drawLane(f: Frame, el: string, l: Lane, t: number, p: PValues, ctx: EffectCtx, k: number, c1: RGB, c2: RGB, seed: number): void {
  const travel = n(p, 'travel'), linger = n(p, 'linger'), u = (t - l.t0) / travel, head = clamp(u), thick = l.cell * n(p, 'thickness');
  if (u < -0.02) return;
  const afterEnv = 1 - smoothstep(l.t0 + travel + linger * 0.5, l.t0 + travel + linger, t);      // the whole effect fades after the front has crossed
  if (afterEnv <= 0.003) return;
  const kk = Math.min(1.5, k), aEnv = afterEnv * k, hp = P(l, head), ang = Math.atan2(l.dy, l.dx), rnd = (a: number, b2 = 0): number => h1(seed * 977 + a * 31 + b2 * 7919);
  const cell = l.cell, front = u < 1.02;
  const stepsN = Math.max(2, Math.round(l.len / (cell * 0.55)));
  const ageAt = (sp: number): number => t - (l.t0 + sp * travel);
  /** How alive something is that the front reached `age` seconds ago: it rises quickly, then fades out over the lingering time. */
  const life = (age: number, rise = 0.12, hold = 0.45): number => age <= 0 ? 0 : smoothstep(0, rise, age) * (1 - smoothstep(linger * hold, linger, age));
  const add = (x: number, y: number, hw: number, hh: number, rot: number, type: number, color: RGB, intensity: number, e1?: number): void => { if (intensity > 0.002) f.additive.push({ x, y, hw, hh, rot, type, color, intensity, e1 }); };
  /** A soft band of glow along the lane between two positions (edges fade to nothing), `across` wide on each side. */
  const band = (sp0: number, sp1: number, across: number, col: RGB, intensity: number, e1 = 3, off = 0): void => {
    const a = P(l, sp0, off), b = P(l, sp1, off), len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len > 1e-4) add((a.x + b.x) / 2, (a.y + b.y) / 2, len / 2 + across * 0.35, across, ang, 0, col, intensity, e1);
  };
  const rib = (pts: { x: number; y: number }[], core: number, intensity: number, rootMin: number, rootLen: number, halo = 9): void => ribbon(f.bolts, pts, core, intensity, true, true, rootMin, rootLen, halo);
  /** A soft glow that follows a bolt, drawn as small overlapping glows so it stays smooth and fades out on every side (a ribbon's own halo is cut off at the edge of its strip). */
  const glowAlong = (pts: { x: number; y: number }[], size: number, intensity: number, col: RGB, step = 2): void => { for (let i = 0; i < pts.length; i += step) add(pts[i]!.x, pts[i]!.y, size, size, 0, 0, col, intensity, 2.2); };
  const headFlare = (size: number, col: RGB, bright = 1): void => { if (front && bool(p, 'flare')) { add(hp.x, hp.y, size, size, 0, 3, col, 1.15 * aEnv * bright); add(hp.x, hp.y, size * 2.4, size * 2.4, t * 0.6, 2, c2, 0.9 * aEnv * bright); } };
  switch (el) {
    case 'fire': {
      setVolPalette(f, 'fire', 'black');
      const pal = FIRE_PALETTES.fire!, hot = mixRGB(pal[1]!, pal[2]!, 0.5);
      /** One rank of flames standing along the lane: a few tall tongues, a lower busier row, and a fringe of small flickers that joins them. */
      const rank = (count: number, w0: number, h0: number, salt: number, lean: number, alpha: number): void => {
        for (let i = 0; i < count; i++) {
          const x = (q: number): number => rnd(salt * 131 + i * 13 + q), sp = (i + x(1)) / count, age = ageAt(sp), lf = life(age, 0.16);
          if (lf <= 0.01) continue;
          const tl = t + x(3) * 5, ph = 0.5 + 0.5 * Math.sin(tl * (5 + 4 * x(4)) + i * 1.7), burst = 0.75 + 0.25 * Math.sin(tl * 2.3 + x(8) * 6), c = P(l, sp, (x(2) - 0.5) * thick * (l.vertical ? 0.95 : 0.3));
          flame(f, { x: c.x, y: c.y + cell * 0.46, w: w0 * k * (0.8 + 0.5 * x(6)), h: h0 * k * (0.55 + 0.7 * x(5)) * (0.7 + 0.3 * ph) * burst * lf, age: 0.04 + 0.22 * x(7), seed: seed + salt + i * 3.7, t: tl, heat: 1, alpha: alpha * (l.vertical ? 1 - 0.5 * Math.abs(x(2) - 0.5) * 2 : 1), rot: Math.sin(tl * 2.6 + i) * lean * (l.vertical ? 1.6 : 1), soft: true });
        }
      };
      const dense = l.vertical ? 2.2 : 1, fine = l.vertical ? 0.74 : 1;                   // down a reel the flames are narrower and more of them stand side by side
      rank(L(ctx, l.cells * 3.2 * dense), cell * 0.8 * fine, cell * 1.9 * (l.vertical ? 0.85 : 1), 0, 0.14, 0.82);
      rank(L(ctx, l.cells * 5 * dense), cell * 0.52 * fine, cell * 0.95, 7, 0.2, 0.7);
      rank(L(ctx, l.cells * 7 * dense), cell * 0.36 * fine, cell * 0.5, 13, 0.3, 0.6);
      band(0, Math.min(1, head + 0.02), cell * 0.16, mixRGB(pal[0]!, pal[1]!, 0.6), 0.5 * afterEnv * Math.min(1.2, k), 3, cell * 0.44);       // the bed of the fire, so the flames do not stand on a bare line
      for (let i = 0; i < stepsN * 2; i++) {                                           // the heat the fire throws on the symbols and the air above
        const sp = (i + 0.5) / (stepsN * 2), lf = life(ageAt(sp), 0.1, 0.55), c = P(l, sp);
        add(c.x, c.y - cell * 0.15, cell * 0.7, cell * 0.95, 0, 0, hot, 0.34 * lf * Math.min(1.3, k), 2.4);
      }
      for (let i = 0; i < L(ctx, 34); i++) {                                           // embers lifting off the flames
        const born = l.t0 + (rnd(i, 21) * 0.95) * travel, tau = t - born, span = 0.9 + 0.9 * rnd(i, 22);
        if (tau < 0 || tau > span) continue;
        const sp = (born - l.t0) / travel, c = P(l, sp, (rnd(i, 23) - 0.5) * thick), r = tau / span, rise = tau * cell * (0.7 + 0.8 * rnd(i, 24));
        add(c.x + Math.sin(tau * 5 + i) * cell * 0.12, c.y - cell * 0.2 - rise, 0.0085 * (1 - r * 0.5), 0.0085 * (1 - r * 0.5), 0, 0, mixRGB([1, 0.45, 0.1], [1, 0.85, 0.35], 1 - r), 2.2 * (1 - r) ** 1.3 * (0.65 + 0.35 * Math.sin(tau * 30 + i * 9)) * afterEnv, 2);
      }
      headFlare(cell * 0.42, c1);
      break;
    }
    case 'energy': {
      const rng = makeRng(Math.floor(t * 24) * 977 + seed * 31 + l.idx * 13);
      f.boltCore = [1, 1, 1]; f.boltGlow = c1;
      const A = P(l, 0), E = P(l, head), reach = Math.hypot(E.x - A.x, E.y - A.y);
      band(0, head, cell * 0.7, c1, 0.42 * aEnv, 3);
      band(0, head, cell * 0.25, mixRGB(c1, [1, 1, 1], 0.5), 0.5 * aEnv, 3);
      for (let i = 0; i < 4; i++) {
        const o0 = (rng.next() - 0.5) * thick * 0.4, o1 = (rng.next() - 0.5) * thick * 0.4;
        rib(jag(rng, { x: A.x + l.nx * o0, y: A.y + l.ny * o0 }, { x: E.x + l.nx * o1, y: E.y + l.ny * o1 }, Math.max(0.02, reach * 0.055), 5), (i === 0 ? 0.0058 : 0.0036) * kk, (i === 0 ? 1.15 : 0.75) * afterEnv, 0, 0.07);
      }
      for (let i = 0; i < 5 && head > 0.05; i++) {                                     // short arcs that leap off the main current
        const sp = rng.next() * head, o = P(l, sp, (rng.next() - 0.5) * thick * 0.3), side = rng.next() < 0.5 ? -1 : 1, a2 = Math.atan2(l.ny * side, l.nx * side) + (rng.next() - 0.5) * 1.1, len = cell * (0.35 + 0.5 * rng.next());
        rib(jag(rng, o, { x: o.x + Math.cos(a2) * len, y: o.y + Math.sin(a2) * len }, len * 0.25, 3), 0.0026 * kk, 0.7 * afterEnv, 0.1, 0.12);
      }
      for (let i = 0; i < l.cells; i++) {                                              // where the current touches a symbol it flares
        const sp = (i + 0.5) / l.cells, age = ageAt(sp);
        if (age < 0) continue;
        const c = P(l, sp), fl = 0.55 + 0.45 * Math.sin(t * 47 + i * 3.1);
        add(c.x, c.y, cell * 0.5, cell * 0.5, 0, 3, c1, 0.65 * fl * aEnv * (1 - smoothstep(linger * 0.5, linger, age)));
      }
      for (let i = 0; i < L(ctx, 14); i++) {                                           // sparks thrown off it
        const ph = fract(t * 2.2 + rnd(i, 31)), sp = clamp(head - ph * 0.1 * rnd(i, 32)), o = P(l, sp), a2 = rnd(i, 33) * TAU;
        add(o.x + Math.cos(a2) * ph * 0.05, o.y + Math.sin(a2) * ph * 0.05 + ph * ph * 0.05, 0.016, 0.0022, -a2 + 0, 4, c2, 1.5 * (1 - ph) * aEnv, 1.5);
      }
      headFlare(cell * 0.32, c1);
      break;
    }
    case 'lightning': {
      const rng = makeRng(Math.floor(t * 18) * 977 + seed * 31 + l.idx * 7), A = P(l, 0), reach = Math.hypot(hp.x - A.x, hp.y - A.y);
      f.boltCore = [1, 1, 1]; f.boltGlow = c1;
      const flash = Math.exp(-Math.max(0, t - l.t0) * 4.5) * aEnv;
      band(0, 1, cell * 1.1, c1, 0.5 * flash, 3);
      band(0, head, cell * 0.55, c1, 0.28 * aEnv, 3);
      if (reach > 0.02) for (const arc of discharge(rng, A, Math.atan2(hp.y - A.y, hp.x - A.x), reach, 1).slice(0, 9)) { rib(arc.pts, arc.level === 0 ? 0.0072 * kk : 0.0034 * kk, (arc.level === 0 ? 1.0 : 0.7) * afterEnv, arc.level === 0 ? 0 : 0.2, arc.level === 0 ? 0.06 : 0.15, 6); glowAlong(arc.pts, arc.level === 0 ? 0.05 : 0.026, (arc.level === 0 ? 0.3 : 0.16) * aEnv, c1, arc.level === 0 ? 2 : 3); }
      for (let i = 0; i < l.cells; i++) {                                              // the bolt lights every symbol it passes
        const sp = (i + 0.5) / l.cells, age = ageAt(sp);
        if (age < 0) continue;
        const c = P(l, sp);
        add(c.x, c.y, cell * 0.6, cell * 0.6, 0, 3, c1, 0.5 * Math.exp(-age * 6) * aEnv);
      }
      headFlare(cell * 0.4, c2);
      break;
    }
    case 'laser': {
      const A = P(l, 0), len = Math.hypot(hp.x - A.x, hp.y - A.y), mid = { x: (A.x + hp.x) / 2, y: (A.y + hp.y) / 2 }, pulse = 0.92 + 0.08 * Math.sin(t * 60);
      if (len > 1e-3) {
        add(mid.x, mid.y, len / 2, cell * 0.55, ang, 0, c1, 0.2 * aEnv, 3.5);
        add(mid.x, mid.y, len / 2, 0.09 * kk, ang, 0, c1, 1.0 * aEnv * pulse, 3);
        add(mid.x, mid.y, len / 2, 0.032 * kk, ang, 0, c1, 2.6 * aEnv * pulse, 3);
        add(mid.x, mid.y, len / 2, 0.011 * kk, ang, 0, mixRGB(c1, [1, 1, 1], 0.8), 3.8 * aEnv * pulse, 3);
      }
      for (let i = 0; i < l.cells; i++) {                                              // a bright hit where the beam crosses each symbol
        const sp = (i + 0.5) / l.cells, age = ageAt(sp);
        if (age < 0) continue;
        const c = P(l, sp);
        add(c.x, c.y, cell * 0.42, cell * 0.42, 0, 3, c1, 0.8 * (0.35 + 0.65 * Math.exp(-age * 5)) * aEnv);
      }
      if (front) {                                                                     // the scanning head: a cross-bar of light and sparks flung back from it
        add(hp.x, hp.y, 0.006, cell * 0.62, ang, 0, c2, 1.8 * aEnv, 3);
        for (let i = 0; i < L(ctx, 12); i++) { const ph = fract(t * 3.4 + rnd(i, 3)), o = P(l, clamp(head - ph * 0.08), (rnd(i, 4) - 0.5) * thick * 0.25); add(o.x, o.y + ph * ph * 0.04, 0.02, 0.0024, ang + Math.PI + (rnd(i, 5) - 0.5) * 1.6, 4, c2, 1.5 * (1 - ph) * aEnv, 1.5); }
      }
      headFlare(cell * 0.3, c2, 1.2);
      break;
    }
    case 'plasma': {
      const strands: [RGB, number, number, number][] = [[c1, 11, 3.1, 0], [c2, 8, -2.6, 1.7], [mixRGB(c1, c2, 0.5), 14, 4.2, 3.3]], N = L(ctx, 120);
      band(0, head, cell * 0.55, mixRGB(c1, c2, 0.5), 0.3 * aEnv, 3);
      for (const [col, freq, speed, ph0] of strands) {
        for (let j = 0; j < N; j++) {                                                  // a twisting strand, drawn as a chain of small glows so it stays smooth
          const sp = (j / (N - 1)) * head, age = ageAt(sp), lf = life(age, 0.08, 0.5);
          if (lf <= 0.01) continue;
          const off = Math.sin(sp * freq + t * speed + ph0) * thick * 0.34 * smoothstep(0, 0.1, sp), q = P(l, sp, off);
          add(q.x, q.y, 0.021, 0.021, 0, 0, col, 0.42 * lf * Math.min(1.3, k), 2.2);
          if (j % 6 === 0) add(q.x, q.y, 0.006, 0.006, 0, 0, [1, 1, 1], 0.9 * lf * k, 2.5);
        }
      }
      for (let i = 0; i < stepsN; i++) {
        const sp = (i + 0.5) / stepsN, age = ageAt(sp);
        if (age < 0) continue;
        const lf = life(age, 0.1, 0.5), q = P(l, sp, Math.sin(t * 3.2 + i * 1.9) * thick * 0.2);
        add(q.x, q.y, cell * 0.5, cell * 0.5, 0, 0, mixRGB(c1, c2, 0.5 + 0.5 * Math.sin(t * 2 + i)), 0.38 * lf * Math.min(1.3, k), 1.4);
      }
      for (let i = 0; i < L(ctx, 16); i++) {                                           // charged specks orbiting the stream
        const sp = rnd(i, 41) * head, age = ageAt(sp), lf = life(age, 0.1, 0.5), a2 = t * (2 + 2 * rnd(i, 42)) + rnd(i, 43) * TAU;
        if (lf <= 0.01) continue;
        const q = P(l, sp, Math.sin(a2) * thick * 0.5);
        add(q.x, q.y, 0.012, 0.012, 0, 2, c2, 1.1 * lf * (0.5 + 0.5 * Math.cos(a2)) * aEnv);
      }
      headFlare(cell * 0.38, c1);
      break;
    }
    case 'ice': {
      const light: RGB = [0.82, 0.95, 1], mid: RGB = [0.45, 0.72, 1], deep: RGB = [0.2, 0.42, 0.82];
      for (let i = 0; i < stepsN; i++) {
        const sp = (i + 0.5) / stepsN, age = ageAt(sp);
        if (age < 0) continue;
        const g = easeOutBack(clamp(age / 0.4), 1.2), a = (1 - smoothstep(linger * 0.6, linger, age)) * Math.min(1.2, k), c = P(l, sp);
        for (const side of [-1, 1]) {
          for (let m = 0; m < 3; m++) {                                                // each crystal: a long central spike and two smaller ones, faceted
            const ofs = (m - 1) * cell * 0.2 * (0.8 + 0.4 * rnd(i, 50 + m)), lenM = cell * (m === 1 ? 0.55 + 0.4 * rnd(i, 51) : 0.28 + 0.22 * rnd(i, 52 + m)) * g, tilt = (m - 1) * 0.3 + (rnd(i, 55 + m) - 0.5) * 0.18;
            const bx = c.x + l.nx * side * thick * 0.55 + l.dx * ofs, by = c.y + l.ny * side * thick * 0.55 + l.dy * ofs, ca = Math.cos(tilt), sa = Math.sin(tilt);
            const ax = (l.nx * ca - l.ny * sa) * side, ay = (l.nx * sa + l.ny * ca) * side, px = -ay, py = ax, w = lenM * 0.2 + cell * 0.012;
            if (lenM < 0.004) continue;
            const T: [number, number] = [bx + ax * lenM, by + ay * lenM], Bc: [number, number] = [bx, by], B1: [number, number] = [bx + px * w, by + py * w], B2: [number, number] = [bx - px * w, by - py * w], Mr: [number, number] = [bx + ax * lenM * 0.18, by + ay * lenM * 0.18];
            triPoly(f.polys, B1, T, Mr, mid, 0.95 * a, light, light);                    // lit facet
            triPoly(f.polys, Mr, T, B2, deep, 0.95 * a, light, mid);                     // shaded facet
            triPoly(f.polys, B1, Mr, Bc, mid, 0.7 * a, deep, deep);
            triPoly(f.polys, Bc, Mr, B2, deep, 0.7 * a, deep, mid);
            add((Mr[0] + T[0]) / 2, (Mr[1] + T[1]) / 2, lenM * 0.46, 0.0022, Math.atan2(ay, ax), 0, [1, 1, 1], 0.9 * a * g, 5);   // the bright ridge
          }
        }
        add(c.x, c.y, cell * 0.55, cell * 0.55, 0, 0, c1, 0.2 * a * Math.min(1, age * 4), 2.6);
        if (rnd(i, 59) < 0.5) { const q = P(l, sp, (rnd(i, 60) - 0.5) * thick); add(q.x, q.y, 0.032, 0.032, 0.2, 2, c2, 1.0 * a * Math.max(0, Math.sin(t * 7 + i * 2.3)) ** 2); }
      }
      for (const side of [-1, 1]) band(0, head, cell * 0.12, c2, 0.3 * aEnv, 3, side * thick * 0.55);   // frost along both edges, where the crystals grow from
      setVolPalette(f, 'fire', 'ice');
      for (let i = 0; i < 5; i++) { const sp = clamp(head - i * 0.06), q = P(l, sp), ph = fract(t * 0.6 + i / 5); smokePuff(f, { x: q.x, y: q.y - ph * cell * 0.4, size: cell * 0.6, age: ph, seed: seed + i, t: t * 0.5, alpha: 0.32 * aEnv * Math.sin(Math.PI * ph), heat: 0, light: [0.3, -0.9], soft: 0.85 }); }
      headFlare(cell * 0.3, c1);
      break;
    }
    case 'light': {
      const A = P(l, 0), len = Math.hypot(hp.x - A.x, hp.y - A.y);
      if (len > 1e-3) {
        band(0, head, thick * 0.9, c1, 0.4 * aEnv, 3);
        band(0, head, thick * 0.38, c1, 0.75 * aEnv, 3);
        band(0, head, thick * 0.1, c2, 1.9 * aEnv, 3);
      }
      if (front) {
        add(hp.x, hp.y, cell * 2.2, 0.03, ang, 0, c2, 1.1 * aEnv, 3);                // anamorphic streak
        add(hp.x, hp.y, 0.03, cell * 1.2, ang, 0, c1, 0.6 * aEnv, 3);
        for (let i = 0; i < 9; i++) { const a2 = (i / 9) * TAU + t * 0.6; add(hp.x, hp.y, cell * (0.7 + 0.5 * rnd(i, 61)), 0.012, a2, 6, c1, 0.85 * aEnv, 1); }
      }
      for (let i = 0; i < L(ctx, 26); i++) {                                           // dust drifting in the beam
        const sp = rnd(i, 62) * head, age = ageAt(sp), lf = life(age, 0.1, 0.5);
        if (lf <= 0.01) continue;
        const q = P(l, sp, (rnd(i, 63) - 0.5) * thick * 1.3);
        add(q.x + Math.sin(t * 1.3 + i) * 0.01, q.y - age * 0.03, 0.011, 0.011, 0, 2, c2, 1.2 * lf * Math.max(0, Math.sin(t * (4 + 5 * rnd(i, 64)) + i * 2)) ** 2 * aEnv / Math.max(0.3, afterEnv));
      }
      headFlare(cell * 0.5, c2);
      break;
    }
    case 'smoke': {
      setVolPalette(f, 'fire', 'grey');
      for (let i = 0; i < stepsN * 2; i++) {
        const sp = (i + 0.5) / (stepsN * 2), age = ageAt(sp);
        if (age < 0) continue;
        const q = P(l, sp, (rnd(i, 12) - 0.5) * thick * 0.5), a = life(age, 0.2, 0.5), big = i % 2;
        smokePuff(f, { x: q.x + (rnd(i, 13) - 0.5) * cell * 0.4, y: q.y - age * cell * (0.35 + 0.3 * rnd(i, 14)), size: cell * (big ? 0.62 : 0.46) * (0.8 + 0.5 * Math.min(1, age)), age: clamp(age / (linger + 0.5)) * 0.75, seed: seed + i * 1.7, t: age + rnd(i, 15) * 3, alpha: (big ? 0.7 : 0.55) * a * Math.min(1.2, k), heat: 0, light: [0.3, -0.9], soft: big ? 0.25 : 0.55 });
      }
      break;
    }
    case 'glitter': {
      band(0, head, cell * 0.6, mixRGB(c1, [1, 0.8, 0.3], 0.4), 0.22 * aEnv, 3);
      for (let i = 0; i < L(ctx, stepsN * 11); i++) {
        const sp = rnd(i, 14) * head, age = ageAt(sp);
        if (age < 0) continue;
        const fade = 1 - smoothstep(linger * 0.3, linger, age), tw = Math.max(0, Math.sin(t * (5 + 7 * rnd(i, 15)) + i * 2.1)) ** 2, q = P(l, sp, (rnd(i, 16) - 0.5) * thick * 1.15), drop = age * 0.05 * (0.4 + rnd(i, 19));
        if (rnd(i, 17) < 0.42) add(q.x, q.y + drop, 0.05 * (0.5 + tw) * (0.6 + 0.7 * rnd(i, 18)), 0.05 * (0.5 + tw) * (0.6 + 0.7 * rnd(i, 18)), 0.2, 2, mixRGB(c1, c2, rnd(i, 20)), 1.5 * tw * fade * aEnv / Math.max(0.3, afterEnv));
        else add(q.x, q.y + drop, 0.0085, 0.0085, 0, 0, mixRGB(c1, c2, rnd(i, 20) * 0.6), 2.0 * fade * (0.5 + 0.5 * tw) * aEnv / Math.max(0.3, afterEnv), 2);
      }
      headFlare(cell * 0.3, c1);
      break;
    }
    case 'water': {
      const deepC = mixRGB(c1, [0.1, 0.3, 0.8], 0.4);
      for (let i = 0; i < stepsN * 2; i++) {                                           // the body of the wave: a swell of water behind its crest
        const sp = (i + 0.5) / (stepsN * 2), age = ageAt(sp);
        if (age < 0) continue;
        const crest = Math.exp(-age * 5), a = life(age, 0.08, 0.5) * Math.min(1.2, k), q = P(l, sp, Math.sin(sp * 13 - t * 6) * thick * 0.14);
        add(q.x, q.y, cell * 0.5, cell * (0.3 + 0.36 * crest), ang, 0, mixRGB(deepC, c2, crest), (0.5 + 0.9 * crest) * a, 1.6);
      }
      if (front) {                                                                     // the crest: a curling arc of foam across the lane
        for (let j = -14; j <= 14; j++) {
          const o = (j / 14) * thick * 0.62, curl = (1 - Math.abs(j / 14) ** 2) * cell * 0.18, q = P(l, head, o), qx = q.x + l.dx * curl, qy = q.y + l.dy * curl;
          add(qx, qy, 0.02, 0.02, 0, 0, c2, 0.75 * aEnv, 2.2);
          if (j % 3 === 0) add(qx, qy, 0.011, 0.011, 0, 2, [1, 1, 1], 0.9 * aEnv * (0.6 + 0.4 * Math.sin(t * 12 + j)));
        }
        add(hp.x, hp.y, cell * 0.28, cell * 0.8, ang + Math.PI / 2, 1, c2, 0.8 * aEnv, 0.12);
      }
      for (let i = 0; i < L(ctx, 46); i++) {                                           // spray thrown up off the crest, falling back
        const born = l.t0 + rnd(i, 70) * travel * 0.97, tau = t - born, span = 0.55 + 0.45 * rnd(i, 71);
        if (tau < 0 || tau > span) continue;
        const sp = (born - l.t0) / travel, o = P(l, sp, (rnd(i, 72) - 0.5) * thick * 0.7), vf = 0.14 + 0.2 * rnd(i, 73), vu = 0.2 + 0.3 * rnd(i, 74);
        const x = o.x + l.dx * vf * tau * 0.5, y = o.y + l.dy * vf * tau * 0.5 - vu * tau + 0.5 * 0.55 * tau * tau, r = tau / span, vy = -vu + 0.55 * tau, vx = l.dx * vf * 0.5;
        add(x, y, 0.0105 * (1 - r * 0.4), 0.0105 * (1 - r * 0.4), 0, 0, [0.9, 0.98, 1], 2.4 * (1 - r) ** 0.8 * aEnv, 2);
        add(x - vx * 0.03, y - vy * 0.03, 0.014, 0.0018, Math.atan2(vy, vx) + Math.PI, 4, c2, 0.6 * (1 - r) * aEnv, 1.5);
      }
      for (let i = 0; i < 9; i++) {                                                    // bubbles that rise in the water
        const sp = rnd(i, 75) * head, age = ageAt(sp), lf = life(age, 0.15, 0.4);
        if (lf <= 0.01) continue;
        const q = P(l, sp, (rnd(i, 76) - 0.5) * thick * 0.8);
        add(q.x, q.y - age * 0.05, 0.012, 0.012, 0, 1, c2, 0.8 * lf, 0.16);
      }
      break;
    }
    case 'wind': {
      band(0, head, cell * 0.6, c1, 0.12 * aEnv, 3);
      for (let i = 0; i < L(ctx, 7); i++) {                                            // long flowing swooshes: smooth S-curves drawn as a chain of soft glows that taper at both ends
        const off = (rnd(i, 21) - 0.5) * thick * 1.15, span = 0.26 + 0.2 * rnd(i, 22), speed = 1.0 + 0.5 * rnd(i, 23), ph = fract((t - l.t0) * speed / (travel * 1.2) + rnd(i, 24)), s1 = ph * (1 + span) - 0.04, fadeIn = 1 - smoothstep(0.82, 1, ph) ;
        if (ph < 0.02 || s1 - span > head + 0.05) continue;
        const NN = L(ctx, 26);
        for (let j = 0; j < NN; j++) {
          const w = j / (NN - 1), sp = s1 - span * (1 - w);
          if (sp < 0 || sp > 1) continue;
          const taper = Math.sin(Math.PI * w) ** 0.8, curl = Math.sin(sp * 11 + i * 2.3 + t * 2.4) * thick * 0.09 + Math.sin(sp * 4.5 + i) * thick * 0.12, q = P(l, sp, off + curl);
          add(q.x, q.y, 0.0145, 0.0145, 0, 0, mixRGB(c1, c2, w), 0.42 * taper * fadeIn * aEnv, 2.2);
        }
      }
      for (let i = 0; i < L(ctx, 18); i++) {                                           // thin bright streaks of air that overtake the front
        const off = (rnd(i, 25) - 0.5) * thick * 1.3, speed = 1.2 + 0.6 * rnd(i, 26), len = 0.14 + 0.24 * rnd(i, 27), ph = fract((t - l.t0) * speed / (travel * 1.15) + rnd(i, 28)), sp = ph * 1.05 - 0.02;
        if (sp > head + 0.12 || sp < 0.0) continue;
        const q = P(l, sp, off + Math.sin(sp * 9 + i * 2.1 + t * 2) * thick * 0.06), fadeIn = smoothstep(0, 0.12, sp) * (1 - smoothstep(0.88, 1.02, sp));
        add(q.x, q.y, len * 0.5, 0.0045 + 0.003 * rnd(i, 29), ang, 4, mixRGB(c1, c2, 0.6), (0.75 + 0.6 * rnd(i, 30)) * fadeIn * aEnv, 1.2);
      }
      for (let i = 0; i < L(ctx, 16); i++) {                                           // specks of dust carried along, swirling
        const sp = clamp(rnd(i, 31) * head), ph = fract(t * (0.8 + 0.6 * rnd(i, 32)) + rnd(i, 33)), q = P(l, clamp(sp + ph * 0.1), (rnd(i, 34) - 0.5) * thick * 1.1 + Math.sin(t * 5 + i * 2) * thick * 0.18);
        add(q.x, q.y, 0.0085, 0.0085, 0, 0, c2, 1.5 * Math.sin(Math.PI * ph) * aEnv, 2);
      }
      break;
    }
    case 'rainbow': {
      const hsv = (hue: number): RGB => { const kq = (m: number): number => (m + hue * 6) % 6, v = (m: number): number => 1 - 0.9 * Math.max(0, Math.min(kq(m), 4 - kq(m), 1)); return [v(5), v(3), v(1)]; };
      const bands = 12, A = P(l, 0), len = Math.hypot(hp.x - A.x, hp.y - A.y);
      if (len > 1e-3) {
        band(0, head, thick * 0.78, [1, 1, 1], 0.12 * aEnv, 3);
        for (let j = 0; j < bands; j++) {
          const off = ((j + 0.5) / bands - 0.5) * thick * 0.95, ww = (thick * 0.95 / bands) * 0.85, col = hsv(0.0 + (j / (bands - 1)) * 0.78);
          band(0, head, ww, col, 1.05 * aEnv, 3, off);
        }
        band(0, head, thick * 0.12, [1, 1, 1], 0.35 * aEnv, 3);
      }
      for (let i = 0; i < L(ctx, 16); i++) {
        const sp = rnd(i, 80) * head, age = ageAt(sp), lf = life(age, 0.1, 0.4);
        if (lf <= 0.01) continue;
        const q = P(l, sp, (rnd(i, 81) - 0.5) * thick);
        add(q.x, q.y, 0.03, 0.03, 0.2, 2, hsv(rnd(i, 82)), 1.2 * lf * Math.max(0, Math.sin(t * 8 + i * 2.7)) ** 2 * aEnv);
      }
      headFlare(cell * 0.3, [1, 1, 1]);
      break;
    }
    case 'shock': {
      for (let i = 0; i < l.cells; i++) {
        const sp = (i + 0.5) / l.cells, age = ageAt(sp);
        if (age < 0) continue;
        const q = P(l, sp), ph = clamp(age / 0.75), ph2 = clamp((age - 0.12) / 0.75), fall = (1 - ph) ** 1.4;
        add(q.x, q.y, cell * 0.8, cell * 0.8, 0, 3, c2, 1.6 * Math.exp(-age * 11) * aEnv);
        add(q.x, q.y, cell * (0.25 + 1.15 * easeOutBack(ph, 0.4)), cell * (0.25 + 1.15 * easeOutBack(ph, 0.4)), 0, 1, mixRGB(c1, c2, ph), 1.7 * fall * aEnv, 0.08);
        if (age > 0.12) add(q.x, q.y, cell * (0.2 + 0.95 * ph2), cell * (0.2 + 0.95 * ph2), 0, 1, c1, 0.9 * (1 - ph2) ** 1.4 * aEnv, 0.06);
        add(q.x, q.y, cell * (0.3 + 0.8 * ph), cell * (0.3 + 0.8 * ph), 0, 0, c1, 0.22 * fall * aEnv, 2.5);
        for (let m = 0; m < 10; m++) { const a2 = (m / 10) * TAU + rnd(i, 90 + m) * 0.5, r0 = cell * (0.25 + 0.9 * ph), r1 = cell * 0.5 * (1 - ph * 0.6); add(q.x + Math.cos(a2) * r0, q.y + Math.sin(a2) * r0, r1 * 0.5, 0.0035, a2, 4, c2, 1.1 * fall * aEnv, 1.4); }
      }
      break;
    }
    case 'magic': {
      for (let i = 0; i < l.cells; i++) {
        const sp = (i + 0.5) / l.cells, age = ageAt(sp);
        if (age < 0) continue;
        const q = P(l, sp), g = easeOutBack(clamp(age / 0.4), 1.1), a = life(age, 0.12, 0.6) * Math.min(1.2, k), r0 = cell * 0.62 * g, dir = i % 2 ? 1 : -1;
        add(q.x, q.y, cell * 0.8 * g, cell * 0.8 * g, 0, 0, c1, 0.36 * a, 2.2);
        add(q.x, q.y, r0, r0, 0, 1, c1, 1.25 * a, 0.045);
        add(q.x, q.y, r0 * 0.74, r0 * 0.74, 0, 1, c2, 0.7 * a, 0.03);
        for (let m = 0; m < 12; m++) {                                                 // rune strokes round the ring, turning one way, and dots the other
          const a2 = (m / 12) * TAU + t * 0.9 * dir, rr = r0 * 0.87;
          add(q.x + Math.cos(a2) * rr, q.y + Math.sin(a2) * rr, 0.011, 0.0032, a2 + Math.PI / 2 + (m % 2) * 0.9, 4, m % 3 === 0 ? c2 : c1, 1.7 * a, 1.2);
          const a3 = (m / 12) * TAU - t * 1.3 * dir; add(q.x + Math.cos(a3) * r0 * 1.1, q.y + Math.sin(a3) * r0 * 1.1, 0.0075, 0.0075, 0, 0, c2, 1.5 * a * (0.55 + 0.45 * Math.sin(t * 6 + m)), 2);
        }
        add(q.x, q.y - cell * 0.1, 0.012, cell * 0.95 * g, 0, 0, c1, 0.5 * a * Math.exp(-age * 1.5), 3);   // a thin column of light rising from the symbol
        for (let m = 0; m < 3; m++) { const ph = fract(t * 0.8 + m / 3 + i * 0.37); add(q.x + (rnd(i, 100 + m) - 0.5) * cell * 0.6, q.y + cell * 0.3 - ph * cell * 1.3, 0.022, 0.022, ph * 3, 2, c2, 1.1 * a * Math.sin(Math.PI * ph)); }
      }
      headFlare(cell * 0.28, c1);
      break;
    }
    default: {   // slash: a bright blade stroke cuts across every symbol as the front reaches it
      const d = l.vertical ? [-0.62, 0.78] : [0.7, 0.72];
      for (let i = 0; i < l.cells; i++) {
        const sp = (i + 0.5) / l.cells, age = ageAt(sp);
        if (age < 0) continue;
        const q = P(l, sp), dd = Math.hypot(d[0]!, d[1]!), ux = d[0]! / dd, uy = d[1]! / dd, a2 = Math.atan2(uy, ux), sw = clamp(age / 0.11), fade = Math.exp(-Math.max(0, age - 0.11) * 8) * aEnv, reach = cell * 0.72;
        const hx = q.x + ux * reach * (sw * 2 - 1), hy = q.y + uy * reach * (sw * 2 - 1), tl = reach * 2 * sw;
        add(hx - ux * tl * 0.44, hy - uy * tl * 0.44, tl * 0.5 + 0.001, 0.014, a2, 4, c1, 3.0 * fade, 1.6);            // the blade's streak, growing as it cuts
        add(q.x, q.y, reach, 0.0042, a2, 0, [1, 1, 1], 2.4 * Math.exp(-age * 2.4) * aEnv, 4);
        add(q.x, q.y, reach, 0.02, a2, 0, c1, 0.7 * Math.exp(-age * 2.4) * aEnv, 3);
        add(q.x, q.y, cell * 0.55, cell * 0.55, 0, 3, c1, 1.3 * Math.exp(-age * 9) * aEnv);                            // the line it leaves, which fades slowly
        add(q.x, q.y, reach * 0.9, reach * 0.9, 0, 0, c2, 0.4 * Math.exp(-age * 7) * aEnv, 2.2);
        if (sw < 1) add(hx, hy, cell * 0.28, cell * 0.28, 0, 3, [1, 1, 1], 1.6 * aEnv);
        for (let m = 0; m < 8; m++) { const sa = a2 + (rnd(i, 110 + m) - 0.5) * 2.4 + Math.PI / 2 * (m % 2 ? 1 : -1) * 0.6, sv = 0.1 + 0.2 * rnd(i, 120 + m), st = Math.max(0, age - 0.05), x = q.x + Math.cos(sa) * sv * st * 1.2, y = q.y + Math.sin(sa) * sv * st * 1.2 + st * st * 0.2; add(x, y, 0.024, 0.0032, sa, 4, c2, 2.2 * Math.exp(-st * 3.2) * aEnv, 1.4); }
      }
      break;
    }
  }
}

export const laneRun: ShowEffect = {
  category: 'candidate', usesBoard: true,
  id: 'lane.run', name: 'Whole row or reel', tagline: 'Fire, electricity, a lightning bolt, a laser, plasma, ice, a beam of light, smoke, glitter, a wave of water, wind, a rainbow, shockwaves, magic or a blade slash sweeps along a whole row or reel, and the symbols in it can glow, jump, shake or fade as it passes.',
  params: [
    enm('element', 'What sweeps along', G('Look'), 'fire', ELEMENTS, 'The element that runs along the row or reel.'),
    enm('along', 'Along', G('Where'), 'row', ALONG, 'Whether it runs along a row or down a reel, and which way.'),
    num('lane', 'Which one', G('Where'), 0, 0, 8, 1, 'count', 'Which row or reel (1 is the first; 0 is the middle one).', true),
    { ...enm('all', 'Every row / reel in turn', G('Where'), 'false', [['false', 'Just that one'], ['true', 'Every one, one after another']], 'Run along every row (or every reel) one after another.') },
    num('gap', 'Wait between them', G('Where'), 0.22, 0, 2, 0.01, 's', 'How long after one the next one starts.'),
    enm('anchor', 'Starts with', G('Timing'), 'start', ANCHOR, 'The moment it starts at (the first moment of the effect if the board has no such moment).'),
    num('delay', 'Delay', G('Timing'), 0.3, -1, 4, 0.01, 's', 'Extra wait after that moment.'),
    num('travel', 'Time to cross', G('Timing'), 0.9, 0.2, 4, 0.01, 's', 'How long the front takes to run from one end to the other.'),
    num('linger', 'Lingers for', G('Timing'), 1.2, 0.2, 4, 0.01, 's', 'How long it stays after the front has passed.'),
    enm('symbols', 'What the symbols do', G('Symbols'), 'glow', REACT, 'How the symbols in the row or reel react as the front passes them.'),
    num('thickness', 'Width', G('Look'), 1, 0.4, 2, 0.01, 'x', 'How wide the effect is across the row or reel.'),
    { ...enm('flare', 'Bright head', G('Look'), 'true', [['true', 'A flare marks the front'], ['false', 'No flare: just the effect']], 'Whether a bright flare travels at the front of the effect.') },
    { ...enm('natural', 'Colours', G('Look'), 'true', [['true', 'The element’s own colours'], ['false', 'The two colours below']], 'Use the element’s own colours, or your own.') },
    color('tint', 'Colour', G('Look'), '#ffd24a', 'The main colour (when not using the element’s own).'),
    color('tint2', 'Second colour', G('Look'), '#ffffff', 'The second colour (when not using the element’s own).'),
    num('strength', 'Strength', G('Look'), 1, 0.2, 2.5, 0.01, 'x', 'How strong it is.'),
    num('seed', 'Variation', G('Look'), 3, 1, 99, 1, '', 'Pick a different arrangement.', true),
    num('duration', 'Length of the effect', G('Timing'), 5.5, 1, 40, 0.01, 's', 'How long the effect layer is on.'),
  ],
  duration: (p) => n(p, 'duration'), impactAt: (p) => n(p, 'delay') + n(p, 'travel') * 0.5,
  cues: (p) => [{ t: n(p, 'delay'), kind: 'whoosh', gain: 0.6, dur: n(p, 'travel') + 0.3, pitch: 1.2 }, { t: n(p, 'delay') + n(p, 'travel') * 0.5, kind: 'zap', gain: 0.4, dur: 0.6, pitch: 1.6 }],
  cellMod(t, p, ctx) {
    const D = n(p, 'duration'), react = s(p, 'symbols');
    if (t < 0 || t >= D || react === 'none') return null;
    const b = board(ctx), lanes = lanesOf(b, ctx, p), [c1] = palette(p), travel = n(p, 'travel'), linger = n(p, 'linger'), k = Math.min(1.5, n(p, 'strength'));
    return (row, col): CellMod | null => {
      for (const l of lanes) {
        const on = l.vertical ? col === l.idx : row === l.idx;
        if (!on) continue;
        const i = l.vertical ? row : col, ci = l.reverse ? l.cells - 1 - i : i, tHit = l.t0 + travel * ((ci + 0.5) / l.cells), u = t - tHit;
        if (u < 0) return null;
        if (react === 'glow') { const e = Math.exp(-u * 2.2) , w = 1 - smoothstep(linger * 0.6, linger + 0.4, u); return { bright: 1 + 0.9 * (0.4 * w + 0.6 * e) * k, tint: [1 - 0.15 * w * (1 - c1[0]), 1 - 0.15 * w * (1 - c1[1]), 1 - 0.15 * w * (1 - c1[2])] }; }
        if (react === 'jump') { const w = u < 0.55 ? Math.abs(Math.sin((u / 0.55) * Math.PI)) * Math.exp(-u * 2) : 0; return { dy: -0.4 * w * k, scale: 1 + 0.12 * w }; }
        if (react === 'shake') { const e = Math.exp(-u * 2.6); return { dx: Math.sin(u * 55) * 0.05 * e * k, dy: Math.cos(u * 47) * 0.035 * e * k, rot: Math.sin(u * 61) * 0.06 * e * k, bright: 1 + 0.3 * e }; }
        // fade: they dim and sink back as the front passes, stay dim while it lingers, then come back
        const down = smoothstep(0, 0.3, u), back = smoothstep(linger * 0.55, linger * 0.55 + 0.6, u), v = down * (1 - back);
        return { scale: 1 - 0.12 * v, alpha: 1 - 0.78 * v, bright: 1 - 0.35 * v };
      }
      return null;
    };
  },
  build(f, t, p, ctx) {
    const D = n(p, 'duration');
    if (t < 0 || t >= D) return;
    const b = board(ctx), [c1, c2] = palette(p), el = s(p, 'element'), k = n(p, 'strength'), seed = n(p, 'seed');
    for (const l of lanesOf(b, ctx, p)) drawLane(f, el, l, t, p, ctx, k, c1, c2, seed + l.idx * 11);
  },
};

export const LANE_FX: ShowEffect[] = [laneRun];
