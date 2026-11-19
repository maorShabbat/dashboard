/**
 * Effects for cascades (tumbles): when the winners of a board pop they burst in a style of your choice, and the symbols that fall into
 * the gaps land with a soft thud. Before they pop, the winning cells glow. Everything is read from the board's own events (`win`, `pop`,
 * `drop`), so it stays in step with however many tumbles the board plays and however it is timed.
 */
import { color, enm, num } from '../../core/params';
import type { BoardEvent } from '../model/board';
import type { Frame, RGB } from '../engine/frame';
import { clamp, easeOutCubic, easeOutQuart, h1, hex, mixRGB, smoothstep } from '../engine/math';
import { n, s, type BoardInfo, type EffectCtx, type ShowEffect } from './effect';
import { ellipsePoly, triPoly } from './helpers';
import { fireball, setVolPalette, smokePuff } from './volume';

const G = (group: string) => ({ section: 'Effect', group });
const TAU = Math.PI * 2;
const ev = (ctx: EffectCtx, kind: BoardEvent['kind']): BoardEvent[] => (ctx.board?.events ?? []).filter((e) => e.kind === kind);
const at = (ctx: EffectCtx, e: BoardEvent): number => e.t - (ctx.start ?? 0);
const L = (ctx: EffectCtx, v: number): number => Math.max(2, Math.round(v * Math.max(0.3, ctx.quality ?? 1)));
const white: RGB = [1, 1, 1];

export const BURSTS: [string, string][] = [['light', 'Light burst'], ['shards', 'Glass shards'], ['gems', 'Gems'], ['embers', 'Fire pops'], ['frost', 'Ice shatter'], ['coins', 'Coins'], ['sparkle', 'Sparkle'], ['smoke', 'Smoke puffs']];

/** A flat shard: a triangle thrown out from a cell with gravity and spin, lit on one side. */
function shard(f: Frame, x: number, y: number, size: number, rot: number, light: RGB, dark: RGB, a: number): void {
  const p = (k: number, r: number): [number, number] => [x + Math.cos(rot + k) * size * r, y + Math.sin(rot + k) * size * r];
  triPoly(f.polys, p(0, 1), p(2.2, 0.62), p(4.1, 0.7), light, a, light, dark);
  triPoly(f.polys, p(0, 1), p(4.1, 0.7), p(5.4, 0.45), dark, a, light, dark);
}
/** A faceted gem: a rhombus split into a lit and a shaded half. */
function gem(f: Frame, x: number, y: number, size: number, rot: number, light: RGB, dark: RGB, a: number): void {
  const c = Math.cos(rot), s2 = Math.sin(rot), P = (u: number, v: number): [number, number] => [x + (c * u - s2 * v) * size, y + (s2 * u + c * v) * size];
  triPoly(f.polys, P(0, -1), P(0.7, 0), P(0, 0.15), light, a, white, light);
  triPoly(f.polys, P(0, -1), P(0, 0.15), P(-0.7, 0), light, a, light, mixRGB(light, dark, 0.4));
  triPoly(f.polys, P(-0.7, 0), P(0, 0.15), P(0, 1), mixRGB(light, dark, 0.45), a, mixRGB(light, dark, 0.5), dark);
  triPoly(f.polys, P(0.7, 0), P(0, 1), P(0, 0.15), mixRGB(light, dark, 0.7), a, dark, dark);
}

function burst(f: Frame, b: BoardInfo, ctx: EffectCtx, style: string, x: number, y: number, u: number, c1: RGB, c2: RGB, k: number, seed: number): void {
  const cell = b.cell, add = (X: number, Y: number, hw: number, hh: number, rot: number, type: number, color: RGB, intensity: number, e1?: number): void => { if (intensity > 0.003) f.additive.push({ x: X, y: Y, hw, hh, rot, type, color, intensity, e1 }); };
  const t = u, rnd = (i: number, m = 0): number => h1(seed * 131 + i * 17 + m * 7919);
  const flash = (size: number, col: RGB, gain = 1.4): void => { add(x, y, size, size, 0, 3, col, gain * Math.exp(-t * 9)); };
  switch (style) {
    case 'shards': {
      flash(cell * 0.8 * k, c1, 1.1);
      add(x, y, cell * (0.35 + 1.0 * easeOutQuart(t)), cell * (0.35 + 1.0 * easeOutQuart(t)), 0, 1, c1, 1.0 * (1 - smoothstep(0, 0.7, t)), 0.08);
      const N = L(ctx, 14);
      for (let i = 0; i < N; i++) {
        const a = (i / N) * TAU + rnd(i) * 0.6, sp = (0.55 + 0.7 * rnd(i, 1)) * cell * 1.5 * k, d = sp * easeOutCubic(Math.min(1, t * 1.15)), g = 0.55 * t * t * cell * 2.4;
        const sz = cell * (0.2 + 0.22 * rnd(i, 2)) * k * (1 - 0.25 * t), al = 1 - smoothstep(0.62, 1, t);
        shard(f, x + Math.cos(a) * d, y + Math.sin(a) * d + g, sz, rnd(i, 3) * TAU + t * (3 + 5 * rnd(i, 4)) * (i % 2 ? 1 : -1), mixRGB(c1, white, 0.5), mixRGB(c2, [0, 0, 0], 0.25), al);
        if (i % 3 === 0) add(x + Math.cos(a) * d, y + Math.sin(a) * d + g, 0.026, 0.026, 0, 2, white, 1.0 * al);
      }
      break;
    }
    case 'gems': {
      flash(cell * 0.8 * k, c1, 1.0);
      add(x, y, cell * (0.3 + 1.1 * easeOutQuart(t)), cell * (0.3 + 1.1 * easeOutQuart(t)), 0, 1, c1, 0.9 * (1 - smoothstep(0, 0.7, t)), 0.07);
      const N = L(ctx, 9);
      for (let i = 0; i < N; i++) {
        const a = (i / N) * TAU + rnd(i) * 0.5 - Math.PI / 2 * 0.2, sp = (0.6 + 0.6 * rnd(i, 1)) * cell * 1.35 * k, d = sp * easeOutCubic(Math.min(1, t * 1.1)), g = 0.6 * t * t * cell * 2.2;
        const col = mixRGB(c1, c2, rnd(i, 2)), al = 1 - smoothstep(0.68, 1, t);
        gem(f, x + Math.cos(a) * d, y + Math.sin(a) * d + g, cell * (0.2 + 0.1 * rnd(i, 3)) * k, t * 2.5 * (i % 2 ? 1 : -1) + rnd(i, 4), mixRGB(col, white, 0.35), mixRGB(col, [0, 0, 0], 0.55), al);
        add(x + Math.cos(a) * d, y + Math.sin(a) * d + g, 0.02 * (1 + Math.sin(t * 24 + i)), 0.02 * (1 + Math.sin(t * 24 + i)), 0.2, 2, white, 0.9 * al);
      }
      break;
    }
    case 'embers': {
      setVolPalette(f, 'fire', 'black');
      flash(cell * 0.9 * k, [1, 0.8, 0.45], 1.3);
      if (t < 0.7) fireball(f, { x, y, size: cell * (0.35 + 0.6 * easeOutCubic(t / 0.7)) * k, age: 0.05 + 0.5 * t, seed: seed * 3.3, t: t * 2, heat: 1, alpha: 1 - smoothstep(0.4, 0.7, t) });
      add(x, y, cell * 1.6 * k, cell * 1.6 * k, 0, 0, [1, 0.5, 0.15], 0.6 * Math.exp(-t * 4), 1.2);
      const N = L(ctx, 18);
      for (let i = 0; i < N; i++) {
        const a = rnd(i) * TAU, sp = (0.5 + 0.9 * rnd(i, 1)) * cell * 1.5 * k, d = sp * easeOutCubic(Math.min(1, t * 1.2)), rise = t * cell * (0.4 + 0.8 * rnd(i, 2)), al = 1 - smoothstep(0.35, 1, t);
        add(x + Math.cos(a) * d, y + Math.sin(a) * d - rise, 0.011 * (1 - t * 0.5), 0.011 * (1 - t * 0.5), 0, 0, mixRGB([1, 0.45, 0.1], [1, 0.9, 0.5], 1 - t), 2.4 * al * (0.7 + 0.3 * Math.sin(t * 40 + i)), 2.2);
      }
      break;
    }
    case 'frost': {
      flash(cell * 0.8 * k, [0.8, 0.95, 1], 1.1);
      add(x, y, cell * (0.3 + 1.1 * easeOutQuart(t)), cell * (0.3 + 1.1 * easeOutQuart(t)), 0, 1, [0.7, 0.9, 1], 1.0 * (1 - smoothstep(0, 0.7, t)), 0.06);
      const N = L(ctx, 12);
      for (let i = 0; i < N; i++) {
        const a = (i / N) * TAU + rnd(i) * 0.4, sp = (0.5 + 0.8 * rnd(i, 1)) * cell * 1.5 * k, d = sp * easeOutCubic(Math.min(1, t * 1.15)), g = 0.5 * t * t * cell * 2, al = 1 - smoothstep(0.55, 1, t);
        const len = cell * (0.24 + 0.2 * rnd(i, 2)) * k, rot = a + t * (1.5 + 2 * rnd(i, 3)) * (i % 2 ? 1 : -1), px = x + Math.cos(a) * d, py = y + Math.sin(a) * d + g;
        const T: [number, number] = [px + Math.cos(rot) * len, py + Math.sin(rot) * len], B1: [number, number] = [px + Math.cos(rot + Math.PI / 2) * len * 0.2, py + Math.sin(rot + Math.PI / 2) * len * 0.2], B2: [number, number] = [px - Math.cos(rot + Math.PI / 2) * len * 0.2, py - Math.sin(rot + Math.PI / 2) * len * 0.2], M: [number, number] = [px, py];
        triPoly(f.polys, B1, T, M, [0.62, 0.84, 1], al, [0.95, 0.99, 1], [0.95, 0.99, 1]);
        triPoly(f.polys, M, T, B2, [0.3, 0.55, 0.95], al, [0.95, 0.99, 1], [0.5, 0.75, 1]);
      }
      for (let i = 0; i < L(ctx, 8); i++) { const a = rnd(i, 7) * TAU, d = cell * 0.9 * easeOutCubic(t) * (0.4 + rnd(i, 8)); add(x + Math.cos(a) * d, y + Math.sin(a) * d - t * cell * 0.3, 0.03 * (1 - t), 0.03 * (1 - t), 0.2, 2, [0.9, 0.98, 1], 1.0 * (1 - t)); }
      break;
    }
    case 'coins': {
      flash(cell * 0.7 * k, [1, 0.85, 0.4], 1.0);
      const N = L(ctx, 8);
      for (let i = 0; i < N; i++) {
        const a = -Math.PI / 2 + (rnd(i) - 0.5) * 2.2, v = (0.9 + 0.8 * rnd(i, 1)) * cell * 2.2 * k, tt = t * 1.1, px = x + Math.cos(a) * v * tt * 0.7, py = y + Math.sin(a) * v * tt + 0.5 * cell * 4.6 * tt * tt, spin = Math.cos(t * (14 + 10 * rnd(i, 2)) + rnd(i, 3) * TAU), al = 1 - smoothstep(0.7, 1, t), r = cell * 0.19 * k;
        ellipsePoly(f.polys, px, py, r * (0.25 + 0.75 * Math.abs(spin)), r, 0, [0.5, 0.28, 0.04], al, 14);
        ellipsePoly(f.polys, px, py, r * (0.25 + 0.75 * Math.abs(spin)) * 0.82, r * 0.82, 0, spin > 0 ? [1, 0.84, 0.28] : [0.95, 0.7, 0.18], al, 14);
        if (Math.abs(spin) > 0.85) add(px - r * 0.2, py - r * 0.3, 0.012, 0.012, 0, 0, white, 1.2 * al, 2);
      }
      break;
    }
    case 'sparkle': {
      flash(cell * 0.7 * k, c1, 1.0);
      add(x, y, cell * (0.3 + 1.0 * easeOutQuart(t)), cell * (0.3 + 1.0 * easeOutQuart(t)), 0, 1, c1, 0.9 * (1 - smoothstep(0, 0.7, t)), 0.06);
      const N = L(ctx, 10);
      for (let i = 0; i < N; i++) {
        const a = (i / N) * TAU + rnd(i) * 0.5, d = (0.5 + 0.9 * rnd(i, 1)) * cell * 1.3 * k * easeOutCubic(t), tw = Math.max(0, Math.sin(t * 18 + rnd(i, 2) * 6)) ** 2, al = 1 - smoothstep(0.4, 1, t);
        add(x + Math.cos(a) * d, y + Math.sin(a) * d + t * t * cell * 0.4, 0.04 * (0.6 + tw) * (1 - 0.4 * t), 0.04 * (0.6 + tw) * (1 - 0.4 * t), 0.2, 2, mixRGB(c1, white, 0.5), 1.3 * al);
        add(x + Math.cos(a) * d * 0.8, y + Math.sin(a) * d * 0.8, 0.008, 0.008, 0, 0, c2, 1.6 * al, 2.4);
      }
      break;
    }
    case 'smoke': {
      setVolPalette(f, 'fire', 'grey');
      flash(cell * 0.6 * k, [1, 0.9, 0.7], 0.8);
      for (let i = 0; i < L(ctx, 5); i++) {
        const a = rnd(i) * TAU, d = cell * 0.45 * easeOutCubic(t) * rnd(i, 1);
        smokePuff(f, { x: x + Math.cos(a) * d, y: y + Math.sin(a) * d - t * cell * 0.7, size: cell * (0.4 + 0.5 * t) * k, age: Math.min(0.95, t * 0.9), seed: seed * 2 + i, t: t, alpha: 0.85 * (1 - smoothstep(0.6, 1, t)), heat: 0.2 * Math.exp(-t * 4), light: [0.3, -0.9], soft: 0.3 });
      }
      break;
    }
    default: {   // light
      flash(cell * 0.95 * k, c1, 1.5);
      add(x, y, cell * (0.4 + 1.1 * easeOutQuart(t)), cell * (0.4 + 1.1 * easeOutQuart(t)), 0, 1, c1, 1.1 * (1 - smoothstep(0, 0.8, t)), 0.08);
      add(x, y, cell * (0.25 + 0.7 * easeOutQuart(Math.max(0, t - 0.06))), cell * (0.25 + 0.7 * easeOutQuart(Math.max(0, t - 0.06))), 0, 1, c2, 0.8 * (1 - smoothstep(0, 0.7, t)), 0.05);
      for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU + 0.2; add(x + Math.cos(a) * cell * 0.5, y + Math.sin(a) * cell * 0.5, cell * 0.7 * k, 0.012, a, 6, c1, 0.8 * Math.exp(-t * 5), 1); }
      for (let i = 0; i < L(ctx, 12); i++) { const a = (i / 12) * TAU + rnd(i) * 0.5, d = cell * 1.2 * k * easeOutCubic(t) * (0.6 + 0.6 * rnd(i, 1)); add(x + Math.cos(a) * d, y + Math.sin(a) * d + 0.04 * t * t, cell * 0.28 * (1 - t * 0.6), 0.0035, a, 4, mixRGB(c1, white, 0.5), 1.3 * (1 - smoothstep(0.3, 1, t)), 1.5); }
    }
  }
}

export const cascadeBurst: ShowEffect = {
  id: 'cascade.burst', name: 'Cascade burst', tagline: 'The winning cells glow, then burst when they pop (as light, glass, gems, fire, ice, coins, sparkle or smoke), and every symbol that falls into the gaps lands with a soft thud.', category: 'candidate', usesBoard: true,
  params: [
    enm('style', 'How they burst', G('Look'), 'light', BURSTS, 'What the winning symbols turn into when they pop.'),
    color('tint', 'Colour', G('Look'), '#ffe27a', 'The main colour of the burst.'),
    color('tint2', 'Second colour', G('Look'), '#ff9a3a', 'A second colour (gems and sparkle use it).'),
    num('warn', 'Glow before the pop', G('Look'), 1, 0, 2, 0.01, 'x', 'How strongly the winning cells glow while they wait to pop (0 for none).'),
    num('thump', 'Thud on landing', G('Look'), 1, 0, 3, 0.01, 'x', 'How hard the board jolts as the new symbols land (0 for none).'),
    num('strength', 'Strength', G('Look'), 1, 0.2, 2.5, 0.01, 'x', 'How big and bright the bursts are.'),
    num('duration', 'Length', G('Timing'), 10, 1, 30, 0.01, 's', 'How long the effect runs (it should cover the board\'s whole sequence).'),
  ],
  duration: (p) => n(p, 'duration'), impactAt: () => 1,
  cues: () => [{ t: 1.0, kind: 'shatter', gain: 0.6, dur: 0.5, pitch: 1.8 }, { t: 1.5, kind: 'thump', gain: 0.45, pitch: 1.5 }],
  build(f, t, p, ctx) {
    const b = ctx.board, D = n(p, 'duration');
    if (!b || t < 0 || t >= D) return;
    const style = s(p, 'style'), c1 = hex(s(p, 'tint')), c2 = hex(s(p, 'tint2')), k = n(p, 'strength'), warn = n(p, 'warn'), thump = n(p, 'thump');
    const pops = ev(ctx, 'pop');
    // the winning cells glow from the moment of the win to the pop
    if (warn > 0) for (const w of ev(ctx, 'win')) {
      const t0 = at(ctx, w), pop = pops.find((e) => at(ctx, e) > t0), t1 = pop ? at(ctx, pop) : t0 + 1.4;
      if (t < t0 || t > t1) continue;
      const u = clamp((t - t0) / Math.max(0.2, t1 - t0)), a = smoothstep(0, 0.15, u) * (1 - 0.0 * u), pulse = 0.65 + 0.35 * Math.sin((t - t0) * 9);
      for (const [r, c] of w.cells!) {
        const ctr = b.cellCenter(r, c);
        f.additive.push({ x: ctr.x, y: ctr.y, hw: b.cell * 0.75, hh: b.cell * 0.75, rot: 0, type: 0, color: c1, intensity: 0.55 * warn * a * pulse * (0.7 + 0.6 * u), e1: 1.2 });
        f.additive.push({ x: ctr.x, y: ctr.y, hw: b.cell * (0.52 + 0.06 * pulse), hh: b.cell * (0.52 + 0.06 * pulse), rot: 0, type: 1, color: mixRGB(c1, white, 0.4), intensity: 0.7 * warn * a * (0.5 + 0.5 * u), e1: 0.05 });
      }
    }
    for (const e of pops) {
      const u = (t - at(ctx, e)) / 1.0;
      if (u < 0 || u > 1.05) continue;
      for (const [r, c] of e.cells!) { const ctr = b.cellCenter(r, c); burst(f, b, ctx, style, ctr.x, ctr.y, Math.min(1, u), c1, c2, k, r * 17 + c * 5 + Math.round(e.t * 10)); }
      f.camera.dy += Math.sin(u * 60) * 0.0035 * k * Math.exp(-u * 8) * Math.min(1, thump + 0.3);
    }
    if (thump > 0) for (const e of ev(ctx, 'drop')) {
      const u = (t - at(ctx, e) - 0.36) / 0.5;
      if (u < 0 || u > 1) continue;
      f.camera.dy += Math.sin(u * 46) * 0.0042 * thump * Math.exp(-u * 7);
      for (const [r, c] of e.cells!.slice(0, 24)) {
        const ctr = b.cellCenter(r, c);
        f.alphaSprites.push({ x: ctr.x, y: ctr.y + b.cell * 0.42, hw: 0.02 + 0.022 * u, hh: 0.014 + 0.014 * u, rot: 0, type: 5, color: [0.78, 0.72, 0.62], intensity: 0.28 * (1 - u) ** 1.5, e2: r * 5 + c });
      }
    }
  },
};

export const CASCADE_FX: ShowEffect[] = [cascadeBurst];
