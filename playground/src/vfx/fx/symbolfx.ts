/**
 * Animations for the special symbols on a reel board (wilds, scatters, bonus tiles, the winners, or any symbol): `symbol.motion`
 * moves the symbols themselves (a heartbeat, a hover, a coin flip, a jelly wobble, a tada …) and `symbol.aura` dresses them
 * (flames, arcs of electricity, turning rays, orbiting sparkles, rings, a shine …). Both choose their symbols by role and start on
 * the moment each one lands, when the win is shown, or at the start of the effect.
 */
import { makeRng } from '../../core/util/prng';
import { color, enm, num } from '../../core/params';
import { FIRE_PALETTES, type Frame, type RGB } from '../engine/frame';
import { jag, ribbon } from '../engine/lightning';
import { clamp, easeOutBack, easeOutCubic, h1, hex, mixRGB, smoothstep } from '../engine/math';
import { n, s, type BoardInfo, type CellMod, type CellModFn, type EffectCtx, type PValues, type ShowEffect } from './effect';
import { flame, setVolPalette, smokePuff } from './volume';
import { triPoly } from './helpers';

const G = (group: string) => ({ section: 'Effect', group });
const TAU = Math.PI * 2;
const fract = (x: number): number => x - Math.floor(x);

function board(ctx: EffectCtx): BoardInfo {
  if (ctx.board) return ctx.board;
  const cx = ctx.aspect / 2, cy = 0.5, W = 1.3, H = 0.75, cell = 0.23, pitch = 0.25;
  const roles = [['normal', 'wild', 'normal', 'scatter', 'normal'], ['normal', 'normal', 'wild', 'normal', 'bonus'], ['bonus', 'normal', 'normal', 'wild', 'normal']] as BoardInfo['roles'];
  return { cols: 5, rows: 3, cell, pitch, cx, cy, box: { x0: cx - W / 2, y0: cy - H / 2, x1: cx + W / 2, y1: cy + H / 2 }, cellCenter: (r, c) => ({ x: cx - 2 * pitch + c * pitch, y: cy - pitch + r * pitch }), events: [{ t: 0.6, kind: 'land', cells: [[0, 1]], role: 'wild' }, { t: 0.8, kind: 'land', cells: [[0, 3]], role: 'scatter' }], roles, end: 0, style: 'classic', pattern: '' };
}

const WHO: [string, string][] = [['specials', 'Every wild, scatter and bonus tile'], ['wild', 'Wilds'], ['scatter', 'Scatters'], ['bonus', 'Bonus tiles'], ['winners', 'The winning symbols'], ['all', 'Every symbol']];
const WHEN: [string, string][] = [['land', 'When each one lands'], ['win', 'When the win is shown'], ['start', 'From the start of the effect']];

/** The cells an effect works on and when its animation starts on each (seconds, in the effect's own time). */
function targets(b: BoardInfo, ctx: EffectCtx, who: string, when: string, delay: number): { r: number; c: number; start: number }[] {
  const t0 = ctx.start ?? 0, out: { r: number; c: number; start: number }[] = [];
  const win = b.events.find((e) => e.kind === 'win');
  const winCells = new Set<string>((win?.cells ?? []).map(([r, c]) => `${r},${c}`));
  const stopOf = (c: number): number => (b.events.find((e) => e.kind === 'reel-stop' && e.reel === c)?.t ?? t0) - t0;
  const landOf = (r: number, c: number): number | null => { const e = b.events.find((x) => x.kind === 'land' && x.cells?.some(([rr, cc]) => rr === r && cc === c)); return e ? e.t - t0 : null; };
  for (let r = 0; r < b.rows; r++) for (let c = 0; c < b.cols; c++) {
    const role = b.roles[r]?.[c] ?? 'normal';
    const ok = who === 'all' ? true : who === 'specials' ? role !== 'normal' : who === 'winners' ? winCells.has(`${r},${c}`) : role === who;
    if (!ok) continue;
    let start: number;
    if (when === 'win') start = win ? win.t - t0 : stopOf(c) + 0.3;
    else if (when === 'start') start = 0;
    else start = landOf(r, c) ?? stopOf(c);
    out.push({ r, c, start: start + delay });
  }
  return out;
}
const common = (def: { who?: string; when?: string; length?: number }) => [
  enm('who', 'Which symbols', G('Which'), def.who ?? 'specials', WHO, 'Which symbols of the board it works on.'),
  enm('when', 'Starts', G('Timing'), def.when ?? 'land', WHEN, 'When it starts on each symbol.'),
  num('delay', 'Delay', G('Timing'), 0, -1, 3, 0.01, 's', 'Extra wait after that moment.'),
  num('length', 'Plays for', G('Timing'), def.length ?? 3.2, 0.3, 20, 0.01, 's', 'How long it plays on each symbol.'),
  num('repeat', 'Repeats', G('Timing'), 1, 1, 12, 1, 'count', 'How many times the motion repeats within that time.', true),
  num('strength', 'Strength', G('Look'), 1, 0.2, 2.5, 0.01, 'x', 'How strong it is.'),
  num('seed', 'Variation', G('Look'), 3, 1, 99, 1, '', 'Pick a different arrangement.', true),
  num('duration', 'Length of the effect', G('Timing'), 7, 1, 40, 0.01, 's', 'How long the effect layer is on (it ends every animation).'),
];
const baseFx: Pick<ShowEffect, 'category' | 'usesBoard' | 'duration' | 'impactAt'> = { category: 'candidate', usesBoard: true, duration: (p) => n(p, 'duration'), impactAt: () => 0 };

// ---------------------------------------------------------------------------------------------------------------------
// Motions

const MOTIONS: [string, string][] = [['pulse', 'Pulse'], ['heartbeat', 'Heartbeat'], ['float', 'Hover'], ['jelly', 'Jelly wobble'], ['wobble', 'Sway'], ['spin', 'Coin flip'], ['tada', 'Ta-da'], ['bounce', 'Bounce'], ['swing', 'Pendulum'], ['shake', 'Shake'], ['punch', 'Punch in'], ['flicker', 'Neon flicker'], ['breathe', 'Breathe and glow']];
/** One motion at time u (seconds into it), with phase ph ∈ [0, 1) through the current repeat and fade-in/out `env`. */
function motionOf(kind: string, u: number, ph: number, env: number, k: number): CellMod {
  const a = env * k;
  switch (kind) {
    case 'pulse': { const w = 0.5 - 0.5 * Math.cos(ph * TAU); return { scale: 1 + 0.16 * w * a, bright: 1 + 0.35 * w * a }; }
    case 'heartbeat': { const b1 = Math.exp(-((ph - 0.12) ** 2) / 0.004), b2 = Math.exp(-((ph - 0.3) ** 2) / 0.006) * 0.7; return { scale: 1 + 0.2 * (b1 + b2) * a, bright: 1 + 0.4 * (b1 + b2) * a }; }
    case 'float': { const w = Math.sin(ph * TAU); return { dy: -0.09 * w * a - 0.04 * a, scale: 1 + 0.03 * a, bright: 1 + 0.12 * a * (0.5 + 0.5 * w) }; }
    case 'jelly': { const d = Math.exp(-ph * 3.2), w = Math.sin(ph * TAU * 3); return { sx: 1 + 0.26 * w * d * a, sy: 1 - 0.26 * w * d * a }; }
    case 'wobble': return { rot: 0.16 * Math.sin(ph * TAU) * a, scale: 1 + 0.03 * a };
    case 'spin': { const c = Math.cos(ph * TAU); return { sx: Math.max(0.04, Math.abs(c)), bright: 0.7 + 0.5 * Math.abs(c) + 0.3 * a * (1 - Math.abs(c)) }; }
    case 'tada': { const e = easeOutBack(clamp(ph * 3), 2.2), w = Math.sin(ph * TAU * 6) * Math.exp(-ph * 3.5); return { scale: 1 + 0.28 * Math.min(1, e) * (1 - ph) * a, rot: 0.2 * w * a, bright: 1 + 0.3 * (1 - ph) * a }; }
    case 'bounce': { const w = Math.abs(Math.sin(ph * Math.PI)); return { dy: -0.2 * w * a, sy: 1 + 0.12 * (1 - w) * a * (ph < 0.5 ? 1 : 0.4), sx: 1 - 0.08 * (1 - w) * a }; }
    case 'swing': return { rot: 0.28 * Math.sin(ph * TAU) * a, dx: 0.05 * Math.sin(ph * TAU) * a, dy: 0.03 * (1 - Math.cos(ph * TAU * 2)) * 0.5 * a };
    case 'shake': return { dx: Math.sin(u * 52) * 0.04 * a, dy: Math.cos(u * 47) * 0.03 * a, rot: Math.sin(u * 61) * 0.04 * a };
    case 'punch': { const e = Math.exp(-ph * 6); return { scale: 1 + 0.5 * e * a, bright: 1 + 0.9 * e * a }; }
    case 'flicker': { const f = h1(Math.floor(u * 18) * 7 + 3) > 0.28 ? 1 : 0.35; return { bright: 0.75 + 0.7 * f * a, alpha: 1 - 0.25 * (1 - f) * a }; }
    default: { const w = 0.5 - 0.5 * Math.cos(ph * TAU); return { scale: 1 + 0.05 * w * a, bright: 1 + 0.5 * w * a, tint: [1 + 0.1 * w * a, 1 + 0.04 * w * a, 1] as [number, number, number] }; }   // breathe
  }
}

export const symbolMotion: ShowEffect = {
  ...baseFx, id: 'symbol.motion', name: 'Symbol animation', tagline: 'The special symbols themselves move: a pulse, heartbeat, hover, jelly wobble, coin flip, ta-da, bounce, pendulum, shake, punch-in, neon flicker or a breath of light.',
  params: [enm('motion', 'Animation', G('Look'), 'pulse', MOTIONS, 'How the symbols move.'), ...common({})],
  cues: () => [{ t: 0.6, kind: 'tick', gain: 0.3, dur: 0.2, pitch: 2 }],
  cellMod(t, p, ctx) {
    const D = n(p, 'duration');
    if (t < 0 || t >= D) return null;
    const b = board(ctx), kind = s(p, 'motion'), len = n(p, 'length'), rep = Math.max(1, Math.round(n(p, 'repeat'))), k = n(p, 'strength');
    const tg = new Map<string, number>();
    for (const c of targets(b, ctx, s(p, 'who'), s(p, 'when'), n(p, 'delay'))) tg.set(`${c.r},${c.c}`, c.start);
    return (row, col): CellMod | null => {
      const st = tg.get(`${row},${col}`);
      if (st === undefined) return null;
      const u = t - st;
      if (u < 0 || u > len) return null;
      const ph = fract((u / len) * rep), env = kind === 'tada' || kind === 'punch' ? 1 : smoothstep(0, 0.12, u) * (1 - smoothstep(len - 0.25, len, u));
      return motionOf(kind, u, ph, env, k);
    };
  },
  build() { /* the motion is all in cellMod */ },
};

// ---------------------------------------------------------------------------------------------------------------------
// Auras

const AURAS: [string, string][] = [['flames', 'Wreath of flames'], ['lightning', 'Crawling electricity'], ['halo', 'Turning rays'], ['orbit', 'Orbiting sparkles'], ['rings', 'Pulsing rings'], ['shine', 'Sweeping shine'], ['smoke', 'Rising smoke'], ['frost', 'Frost and ice'], ['plasma', 'Swirling plasma'], ['runes', 'Rune circle'], ['embers', 'Rising embers'], ['sparkle', 'Twinkling glints']];

function aura(f: Frame, kind: string, x: number, y: number, cell: number, T: number, u: number, env: number, c1: RGB, c2: RGB, seed: number, ctx: EffectCtx, fire: string): void {
  const k = env, R = cell * 0.5, hh = (a: number, b: number) => h1(seed * 977 + a * 31 + b);
  switch (kind) {
    case 'flames': {
      setVolPalette(f, fire, 'black');
      const pal = FIRE_PALETTES[fire] ?? FIRE_PALETTES.fire!;
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * TAU + 0.4, fx = x + Math.cos(a) * R * 0.78, fy = y + Math.sin(a) * R * 0.78 + R * 0.25, lean = Math.cos(a) * 0.3;
        flame(f, { x: fx, y: fy, w: cell * 0.5, h: cell * (0.5 + 0.25 * hh(i, 1) + 0.12 * Math.sin(T * 6 + i)), age: 0.05, seed: seed + i * 3.3, t: T + i * 0.4, heat: 1, alpha: 0.85 * k, rot: lean, soft: true });
      }
      f.additive.push({ x, y, hw: R * 1.5, hh: R * 1.5, rot: 0, type: 0, color: mixRGB(pal[1]!, pal[2]!, 0.5), intensity: 0.4 * k, e1: 1 });
      break;
    }
    case 'lightning': {
      // arcs crawl round the symbol's edge and now and then one leaps across it
      const rng = makeRng(Math.floor(T * 20) * 977 + seed * 31 + Math.round(x * 100));
      f.boltCore = [1, 1, 1]; f.boltGlow = c1;
      for (let i = 0; i < 3; i++) {
        const a0 = rng.next() * TAU, span = 0.7 + rng.next() * 1.1, pts: { x: number; y: number }[] = [];
        for (let j = 0; j <= 12; j++) { const a = a0 + (j / 12) * span, d = j === 0 || j === 12 ? 0 : (rng.next() - 0.5) * R * 0.2, rr = R * 0.86 + d; pts.push({ x: x + Math.cos(a) * rr, y: y + Math.sin(a) * rr }); }
        ribbon(f.bolts, pts, 0.0034, 1.0 * k, true, true, 0.05, 0.12);
      }
      if (h1(Math.floor(T * 20) * 7 + 3) > 0.55) { const a = rng.next() * TAU; ribbon(f.bolts, jag(rng, { x: x + Math.cos(a) * R * 0.86, y: y + Math.sin(a) * R * 0.86 }, { x: x - Math.cos(a) * R * 0.86, y: y - Math.sin(a) * R * 0.86 }, R * 0.2, 4), 0.0028, 0.85 * k, true, true, 0.05, 0.1); }
      f.additive.push({ x, y, hw: R * 1.25, hh: R * 1.25, rot: 0, type: 0, color: c1, intensity: (0.16 + 0.16 * h1(Math.floor(T * 20) * 3 + 1)) * k, e1: 1 });
      break;
    }
    case 'halo': {
      f.additive.push({ x, y, hw: R * 1.7, hh: R * 1.7, rot: 0, type: 0, color: c1, intensity: 0.5 * k, e1: 0.9 });
      for (let i = 0; i < 10; i++) { const a = (i / 10) * TAU + T * 0.8, len = R * (1.7 + 0.5 * (i % 2)); f.additive.push({ x: x + Math.cos(a) * len * 0.5, y: y + Math.sin(a) * len * 0.5, hw: len * 0.5, hh: 0.014, rot: a, type: 6, color: i % 2 ? c2 : c1, intensity: 0.62 * k, e1: 1 }); }
      break;
    }
    case 'orbit': {
      for (let i = 0; i < 5; i++) {
        const a = T * (2.2 + 0.3 * (i % 2)) + (i / 5) * TAU, rx = R * 1.05, ry = R * 0.8, tilt = 0.5, ex = Math.cos(a) * rx, ey = Math.sin(a) * ry, px = x + ex * Math.cos(tilt) - ey * Math.sin(tilt), py = y + ex * Math.sin(tilt) + ey * Math.cos(tilt), front = 0.65 + 0.35 * Math.sin(a);
        f.additive.push({ x: px, y: py, hw: 0.028 * front, hh: 0.028 * front, rot: T, type: 2, color: mixRGB(c1, c2, i / 5), intensity: 1.2 * k });
        f.additive.push({ x: px, y: py, hw: 0.014, hh: 0.014, rot: 0, type: 0, color: c2, intensity: 1.2 * k, e1: 2.2 });
      }
      break;
    }
    case 'rings': {
      for (let i = 0; i < 3; i++) { const ph = fract(T * 0.8 + i / 3); f.additive.push({ x, y, hw: R * (0.9 + 1.1 * ph), hh: R * (0.9 + 1.1 * ph), rot: 0, type: 1, color: mixRGB(c1, c2, ph), intensity: 0.95 * (1 - ph) ** 1.2 * k, e1: 0.06 }); }
      f.additive.push({ x, y, hw: R * 1.2, hh: R * 1.2, rot: 0, type: 0, color: c1, intensity: 0.25 * k, e1: 1.2 });
      break;
    }
    case 'shine': {
      const ph = fract(T * 0.55), cx = x - R * 1.4 + ph * R * 2.8, sw = Math.sin(Math.PI * clamp(ph * 1.1));
      for (let j = -3; j <= 3; j++) f.additive.push({ x: cx + j * R * 0.07, y: y + j * R * 0.2, hw: R * 0.14, hh: R * 0.35, rot: 0.5, type: 0, color: mixRGB(c1, [1, 1, 1], 0.5), intensity: 0.95 * sw * k * (1 - Math.abs(j) / 4), e1: 1.2 });
      f.additive.push({ x: cx, y, hw: R * 0.55 * sw, hh: R * 0.55 * sw, rot: 0.3, type: 2, color: c2, intensity: 1.5 * sw * k });
      break;
    }
    case 'smoke': {
      setVolPalette(f, 'fire', 'grey');
      for (let i = 0; i < 3; i++) { const ph = fract(T * 0.5 + i / 3 + hh(i, 2)); smokePuff(f, { x: x + (hh(i, 3) - 0.5) * R * 0.8, y: y + R * 0.2 - ph * cell * 1.1, size: cell * (0.35 + 0.35 * ph), age: ph, seed: seed + i, t: T * 0.6 + i, alpha: 0.85 * k * Math.sin(Math.PI * ph), heat: 0, light: [0.3, -0.9], soft: 0.5 }); }
      break;
    }
    case 'frost': {
      f.additive.push({ x, y, hw: R * 1.4, hh: R * 1.4, rot: 0, type: 0, color: c1, intensity: 0.3 * k, e1: 1 });
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU + 0.2, len = R * (0.35 + 0.25 * hh(i, 4)) * (0.6 + 0.4 * easeOutCubic(clamp(u / 0.6))), bx = x + Math.cos(a) * R * 0.92, by = y + Math.sin(a) * R * 0.92, ax = Math.cos(a), ay = Math.sin(a), px = -ay, py = ax, w = len * 0.2;
        triPoly(f.polys, [bx + px * w, by + py * w], [bx + ax * len, by + ay * len], [bx - px * w, by - py * w], [0.6, 0.85, 1], 0.9 * k, [0.95, 0.99, 1], [0.4, 0.7, 1]);
      }
      for (let i = 0; i < 4; i++) { const tw = Math.max(0, Math.sin(T * 5 + i * 1.7)) ** 2; f.additive.push({ x: x + (hh(i, 5) - 0.5) * cell, y: y + (hh(i, 6) - 0.5) * cell, hw: 0.025 * tw, hh: 0.025 * tw, rot: 0.2, type: 2, color: [0.9, 0.97, 1], intensity: tw * k }); }
      break;
    }
    case 'plasma': {
      // two strands of plasma circle the symbol and a spark runs round each, so the symbol stays clear; a thin aura breathes behind it
      f.additive.push({ x, y, hw: R * 1.3, hh: R * 1.3, rot: 0, type: 0, color: mixRGB(c1, c2, 0.5 + 0.5 * Math.sin(T * 1.6)), intensity: 0.2 * k * (0.8 + 0.2 * Math.sin(T * 3)), e1: 1.1 });
      for (let st = 0; st < 2; st++) {
        const col = st ? c2 : c1;
        for (let j = 0; j < 34; j++) {
          const a = (j / 34) * TAU + T * (st ? -1.1 : 1.3), rr = R * (1.02 + 0.1 * Math.sin(a * 3 + T * 2.5 + st * 2)), depth = 0.5 + 0.5 * Math.cos(a * 2 + T * 3 + st * Math.PI);
          f.additive.push({ x: x + Math.cos(a) * rr, y: y + Math.sin(a) * rr * 0.96, hw: 0.016, hh: 0.016, rot: 0, type: 0, color: col, intensity: (0.3 + 0.55 * depth) * k, e1: 2.2 });
        }
        const a = T * (st ? -2.2 : 2.6) + st * 2; f.additive.push({ x: x + Math.cos(a) * R * 1.05, y: y + Math.sin(a) * R * 1.05, hw: R * 0.2, hh: R * 0.2, rot: 0, type: 3, color: col, intensity: 1.0 * k });
      }
      break;
    }
    case 'runes': {
      f.additive.push({ x, y, hw: R * 1.12, hh: R * 1.12, rot: 0, type: 1, color: c1, intensity: 0.55 * k, e1: 0.025 });
      for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU + T * 0.9, ra = R * 1.12; f.additive.push({ x: x + Math.cos(a) * ra, y: y + Math.sin(a) * ra, hw: 0.011, hh: 0.026 * (0.6 + 0.4 * hh(i, 7)), rot: a + Math.PI / 2, type: 0, color: i % 3 === 0 ? c2 : c1, intensity: 1.2 * k * (0.6 + 0.4 * Math.sin(T * 4 + i)), e1: 1.6 }); }
      break;
    }
    case 'embers': {
      for (let i = 0; i < 18; i++) { const ph = fract(T * (0.6 + 0.5 * hh(i, 8)) + hh(i, 9)); f.additive.push({ x: x + (hh(i, 10) - 0.5) * cell * 0.9 + Math.sin(ph * 8 + i) * 0.01, y: y + R * 0.6 - ph * cell * 1.3, hw: 0.017, hh: 0.017, rot: 0, type: 0, color: mixRGB(c1, c2, hh(i, 11)), intensity: 2.2 * (1 - ph) * k, e1: 2.2 }); }
      f.additive.push({ x, y: y + R * 0.4, hw: R * 1.2, hh: R * 0.8, rot: 0, type: 0, color: c1, intensity: 0.3 * k, e1: 1 });
      break;
    }
    default: {   // sparkle
      for (let i = 0; i < 6; i++) { const ph = fract(T * 0.9 + hh(i, 12)), sw = Math.sin(Math.PI * ph); const a = hh(i, 13) * TAU, r = R * (0.5 + 0.7 * hh(i, 14)); f.additive.push({ x: x + Math.cos(a) * r, y: y + Math.sin(a) * r, hw: 0.055 * sw, hh: 0.055 * sw, rot: 0.2, type: 2, color: mixRGB(c1, c2, hh(i, 15)), intensity: 1.6 * sw * k }); }
    }
  }
  void ctx;
}

export const symbolAura: ShowEffect = {
  ...baseFx, id: 'symbol.aura', name: 'Symbol aura', tagline: 'Dress the special symbols: a wreath of flames, crawling electricity, turning rays, orbiting sparkles, pulsing rings, a sweeping shine, smoke, frost, plasma, a rune circle, embers or twinkling glints.',
  params: [enm('aura', 'Aura', G('Look'), 'halo', AURAS, 'What surrounds the symbols.'), color('tint', 'Colour', G('Look'), '#ffd24a', 'The main colour.'), color('tint2', 'Second colour', G('Look'), '#ffffff', 'A second colour.'),
    enm('fire', 'Flame colour', G('Look'), 'fire', [['fire', 'Orange fire'], ['blue', 'Blue flame'], ['green', 'Green fire'], ['violet', 'Violet fire'], ['white', 'White-hot']], 'The colour of the flames (for the wreath of flames).'), ...common({}).filter((d) => d.key !== 'repeat')],
  cues: () => [{ t: 0.5, kind: 'sweep', gain: 0.3, dur: 0.8, pitch: 2 }],
  build(f, t, p, ctx) {
    const D = n(p, 'duration');
    if (t < 0 || t >= D) return;
    const b = board(ctx), T = t, len = n(p, 'length'), c1 = hex(s(p, 'tint')), c2 = hex(s(p, 'tint2')), kind = s(p, 'aura'), seed = n(p, 'seed');
    for (const cell of targets(b, ctx, s(p, 'who'), s(p, 'when'), n(p, 'delay'))) {
      const u = t - cell.start;
      if (u < 0 || u > len) continue;
      const env = smoothstep(0, 0.3, u) * (1 - smoothstep(len - 0.4, len, u)) * n(p, 'strength'), ctr = b.cellCenter(cell.r, cell.c);
      aura(f, kind, ctr.x, ctr.y, b.cell, T + cell.c * 0.31 + cell.r * 0.17, u, Math.min(1.5, env), c1, c2, seed + cell.r * 7 + cell.c * 13, ctx, s(p, 'fire'));
    }
  },
};

export const SYMBOL_FX: ShowEffect[] = [symbolMotion, symbolAura];
