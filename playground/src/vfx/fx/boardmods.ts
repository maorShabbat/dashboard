/**
 * Effects for the board (the slot grid) only: it shakes, is zapped, is smothered in smoke, freezes, glows in a chosen texture, or is
 * dressed in a theme (Nordic, sci-fi, alien, Mexican, fire, cabaret, fishing, Egyptian). They are aimed at a board element. The ones that
 * move or colour the board itself do it through `boardMod`, so the background stays still while the grid shakes or turns to ice.
 */
import { makeRng } from '../../core/util/prng';
import { color, enm, num } from '../../core/params';
import { DISTORT, FIRE_PALETTES, type Frame, type RGB } from '../engine/frame';
import { discharge, ribbon } from '../engine/lightning';
import { clamp, easeOutCubic, easeOutQuart, h1, hex, lerp, mixRGB, smoothstep } from '../engine/math';
import { n, s, type BoardInfo, type EffectCtx, type PValues, type ShowEffect } from './effect';
import { ellipsePoly, quadPoly, triPoly } from './helpers';
import { segment } from './pieces';
import { flame, setVolPalette, smokePuff } from './volume';
import { bell, board, bulb, fract, L, perim, perimLength } from './boardgeom';
import { GLOWS2, glow2 } from './glow2';
import { THEMES2, theme2, themeMod2 } from './themes2';

const G = (group: string) => ({ section: 'Effect', group });
const durP = (def: number, min = 0.6) => num('duration', 'Length', G('Timing'), def, min, 30, 0.01, 's', 'How long the effect lasts.');
const strengthP = (def = 1) => num('strength', 'Strength', G('Look'), def, 0.2, 2.5, 0.01, 'x', 'How strong it is.');

// ---------------------------------------------------------------------------------------------------------------------
// Shake

export const boardShake: ShowEffect = {
  id: 'board.shake', name: 'Board shake', tagline: 'Only the grid shakes: a single heavy jolt, a rumble or a building quake, with the symbols rattling in their cells and dust shaken loose from the top.', category: 'candidate', usesBoard: true,
  params: [enm('mode', 'Kind of shake', G('Look'), 'jolt', [['jolt', 'One heavy jolt'], ['rumble', 'A steady rumble'], ['quake', 'A quake that builds and fades'], ['recoil', 'A punch and a recoil'], ['heartbeat', 'A heartbeat'], ['stomp', 'Heavy footsteps'], ['sway', 'A slow sway'], ['tilt', 'A tilt and a swing back']], 'How the board shakes.'), strengthP(), num('rattle', 'Symbols rattle', G('Look'), 1, 0, 3, 0.01, 'x', 'How much each symbol jiggles in its own cell.'), num('dust', 'Falling dust', G('Look'), 1, 0, 2, 0.01, 'x', 'Dust and chips shaken off the top of the board.'), durP(1.6)],
  duration: (p) => n(p, 'duration'), impactAt: () => 0.05,
  cues: (p) => [{ t: 0.02, kind: 'thump', gain: 1, pitch: 0.8 }, { t: 0.05, kind: 'rumble', gain: 0.7, dur: Math.min(1.6, n(p, 'duration')), pitch: 0.8 }],
  boardMod(t, p) {
    const D = n(p, 'duration'), k = n(p, 'strength'), u = clamp(t / D), mode = s(p, 'mode');
    if (mode === 'recoil') {         // a punch toward the viewer, then a drawn-back swing and a settle
      const e = Math.exp(-t * 4.2), w = Math.cos(t * 11);
      return { scale: 1 + 0.07 * k * e * w, dy: -0.006 * k * e * Math.sin(t * 11), rot: 0.006 * k * e * Math.sin(t * 7), rattle: 0.5 * k * Math.exp(-t * 9) };
    }
    if (mode === 'heartbeat') {      // two beats, a rest, again
      const ph = (t % 1.1) / 1.1, beat = Math.max(Math.exp(-((ph - 0.05) ** 2) * 600), 0.65 * Math.exp(-((ph - 0.25) ** 2) * 500)), env2 = smoothstep(0, 0.2, t) * (1 - smoothstep(D - 0.4, D, t));
      return { scale: 1 + 0.035 * k * beat * env2, bright: 1 + 0.12 * k * beat * env2, rattle: 0.3 * k * beat * env2 };
    }
    if (mode === 'stomp') {          // steps that get closer: each lands, sinks and rebounds
      const period = Math.max(0.5, D / 4), step = Math.floor(t / period), tl = t - step * period, power = 0.55 + 0.45 * Math.min(1, step / 3), e = Math.exp(-tl * 9) * power * (1 - smoothstep(D - 0.3, D, t));
      return { dy: 0.012 * k * e * Math.cos(tl * 24), scale: 1 - 0.014 * k * e, rattle: 0.9 * k * e, rot: (step % 2 ? 1 : -1) * 0.004 * k * e };
    }
    if (mode === 'sway') {           // a slow, wide swing like a deck in a swell
      const env2 = smoothstep(0, 0.4, t) * (1 - smoothstep(D - 0.6, D, t));
      return { rot: Math.sin(t * 2.2) * 0.018 * k * env2, dx: Math.sin(t * 2.2 + 1) * 0.008 * k * env2, dy: Math.sin(t * 4.4) * 0.003 * k * env2, rattle: 0.08 * env2 };
    }
    if (mode === 'tilt') {           // tips to one side, hangs, and swings back with a small overshoot
      const a = easeOutCubic(clamp(t / 0.25)), back = smoothstep(0.5, 1.2, t), swing = back * (1 - back) * 0.6, e = (1 - back) * a - swing * 0.35, damp = 1 - smoothstep(D - 0.4, D, t);
      return { rot: 0.045 * k * e * damp, dx: 0.012 * k * e * damp, rattle: 0.3 * k * (1 - back) * Math.exp(-t * 3) };
    }
    const env = mode === 'jolt' ? Math.exp(-t * 6.5) : mode === 'rumble' ? smoothstep(0, 0.1, t) * (1 - smoothstep(D - 0.3, D, t)) * 0.55 : bell(u) ** 1.4;
    const A = 0.011 * k * env, sp = mode === 'rumble' ? 1.5 : 1;
    return { dx: Math.sin(t * 62 * sp) * A, dy: Math.cos(t * 53 * sp) * A * 0.8, rot: Math.sin(t * 47 * sp) * 0.012 * k * env, rattle: n(p, 'rattle') * env * k, scale: 1 + 0.01 * k * env };
  },
  build(f, t, p, ctx) {
    const D = n(p, 'duration');
    if (t < 0 || t >= D) return;
    const b = board(ctx), k = n(p, 'strength'), dust = n(p, 'dust'), u = clamp(t / D), mode = s(p, 'mode');
    const env = mode === 'jolt' ? Math.exp(-t * 5) : mode === 'rumble' ? 0.7 : mode === 'recoil' ? Math.exp(-t * 4) : mode === 'stomp' ? 0.9 * (1 - smoothstep(D - 0.3, D, t)) : mode === 'sway' || mode === 'heartbeat' ? 0.15 : mode === 'tilt' ? Math.exp(-t * 3) : bell(u);
    const count = L(ctx, 22 * dust * (mode === 'sway' || mode === 'heartbeat' ? 0.3 : 1));
    for (let i = 0; i < count; i++) {
      const hh = (kk: number) => h1(i * 17 + kk), st = hh(1) * D * 0.5, tl = t - st;
      if (tl < 0 || tl > 1.1) continue;
      const x = b.box.x0 + hh(2) * (b.box.x1 - b.box.x0), y = b.box.y0 + 0.01 + 0.5 * 1.3 * tl * tl + (hh(3) - 0.2) * 0.02, a = (1 - tl / 1.1) * env;
      f.alphaSprites.push({ x: x + Math.sin(tl * 8 + i) * 0.006, y, hw: 0.012 + 0.014 * hh(4), hh: 0.011 + 0.012 * hh(4), rot: 0, type: 5, color: [0.7, 0.66, 0.6], intensity: 0.5 * a * dust, e2: i });
      if (i % 3 === 0) quadPoly(f.polys, x + hh(5) * 0.02, y + 0.02 * tl, 0.004, 0.003, tl * 9 + i, [0.35, 0.3, 0.28], a);
    }
    f.additive.push({ x: b.cx, y: b.box.y0, hw: (b.box.x1 - b.box.x0) * 0.5, hh: 0.05, rot: 0, type: 0, color: [1, 0.9, 0.7], intensity: 0.4 * env * k, e1: 2 });
    f.camera.dy += Math.sin(t * 70) * 0.0025 * k * env;
  },
};

// ---------------------------------------------------------------------------------------------------------------------
// Zap

export const boardZap: ShowEffect = {
  id: 'board.zap', name: 'Board zap', tagline: 'Electricity crawls over the grid: arcs leap between cells and run along the frame, the symbols flicker white-blue and sparks spit.', category: 'candidate', usesBoard: true,
  params: [color('tint', 'Arc colour', G('Look'), '#8fd8ff', 'Colour of the glow around the arcs.'), enm('mode', 'Where it arcs', G('Look'), 'cells', [['cells', 'Between cells'], ['frame', 'Around the frame'], ['both', 'Both']], 'Where the electricity runs.'), num('arcs', 'Arcs', G('Look'), 6, 1, 16, 1, 'count', 'Arcs alive at once.', true), strengthP(), num('flicker', 'Symbol flicker', G('Look'), 1, 0, 2, 0.01, 'x', 'How much the symbols flash while it runs.'), num('seed', 'Variation', G('Look'), 4, 1, 99, 1, '', 'Pick a different arrangement.', true), durP(2.4)],
  duration: (p) => n(p, 'duration'), impactAt: () => 0.05,
  cues: (p) => [{ t: 0, kind: 'zap', gain: 0.8, dur: n(p, 'duration') * 0.9, pitch: 1.4 }, { t: 0.1, kind: 'crack', gain: 0.4, dur: 0.2, pitch: 1.6 }],
  boardMod(t, p) {
    const D = n(p, 'duration'), env = smoothstep(0, 0.12, t) * (1 - smoothstep(D - 0.35, D, t)), step = Math.floor(t * 22), fl = (h1(step * 7 + 3) > 0.55 ? 1 : 0) * n(p, 'flicker') * env;
    return { bright: 1 + 0.55 * fl, tint: [1 - 0.18 * fl, 1 - 0.04 * fl, 1] as [number, number, number], rattle: 0.12 * env };
  },
  build(f, t, p, ctx) {
    const D = n(p, 'duration');
    if (t < 0 || t >= D) return;
    const b = board(ctx), glow = hex(s(p, 'tint')), k = n(p, 'strength'), N = L(ctx, n(p, 'arcs')), mode = s(p, 'mode'), env = smoothstep(0, 0.1, t) * (1 - smoothstep(D - 0.35, D, t)), step = Math.floor(t * 24);
    f.boltCore = [1, 1, 1]; f.boltGlow = glow;
    const rng = makeRng(step * 977 + n(p, 'seed') * 31);
    f.additive.push({ x: b.cx, y: b.cy, hw: (b.box.x1 - b.box.x0) * 0.62, hh: (b.box.y1 - b.box.y0) * 0.62, rot: 0, type: 0, color: glow, intensity: (0.22 + 0.2 * h1(step * 5)) * env * k, e1: 1 });
    for (let i = 0; i < N; i++) {
      if (rng.next() < 0.2) continue;
      let A: { x: number; y: number }, B2: { x: number; y: number };
      const useFrame = mode === 'frame' || (mode === 'both' && rng.next() < 0.5);
      if (useFrame) { const u0 = rng.next(), len = 0.04 + 0.1 * rng.next(); A = perim(b, u0); B2 = perim(b, u0 + len); }
      else { A = b.cellCenter(Math.floor(rng.next() * b.rows), Math.floor(rng.next() * b.cols)); const dr = rng.next() < 0.5 ? 1 : 0; B2 = b.cellCenter(clamp(Math.round((A.y - b.cellCenter(0, 0).y) / b.pitch) + (dr ? 1 : 0), 0, b.rows - 1), clamp(Math.round((A.x - b.cellCenter(0, 0).x) / b.pitch) + (dr ? 0 : 1), 0, b.cols - 1)); if (Math.hypot(B2.x - A.x, B2.y - A.y) < 0.02) B2 = { x: A.x + b.pitch * (rng.next() - 0.5) * 2, y: A.y + b.pitch * (rng.next() - 0.5) * 2 }; }
      const d = Math.hypot(B2.x - A.x, B2.y - A.y);
      const arcs = discharge(rng, A, Math.atan2(B2.y - A.y, B2.x - A.x), d, 0.45);
      for (const arc of arcs.slice(0, 4)) ribbon(f.bolts, arc.pts, arc.level === 0 ? 0.0042 * k : 0.0028 * k, (arc.level === 0 ? 1 : 0.7) * env * (0.75 + 0.25 * rng.next()), true);
      f.additive.push({ x: A.x, y: A.y, hw: 0.035 * k, hh: 0.035 * k, rot: 0, type: 3, color: glow, intensity: 0.9 * env });
      if (rng.next() < 0.5) f.additive.push({ x: B2.x, y: B2.y, hw: 0.05 * k, hh: 0.05 * k, rot: 0.3, type: 2, color: [1, 1, 1], intensity: 0.7 * env });
    }
    if (h1(step * 3 + 1) > 0.7) f.exposure *= 1 + 0.06 * env * k;
  },
};

// ---------------------------------------------------------------------------------------------------------------------
// Smoke

const TONES: [string, string][] = [['grey', 'Grey'], ['black', 'Black soot'], ['white', 'White steam'], ['toxic', 'Toxic green'], ['ice', 'Cold mist'], ['purple', 'Magic purple'], ['sand', 'Dust']];
export const boardSmoke: ShowEffect = {
  id: 'board.smoke', name: 'Board smoke', tagline: 'Smoke rolls in over the grid, dimming the symbols as it thickens, then drifts away.', category: 'candidate', usesBoard: true,
  params: [enm('smoke', 'Smoke', G('Look'), 'grey', TONES, 'The colour of the smoke.'), enm('from', 'Rolls in from', G('Look'), 'bottom', [['bottom', 'Below'], ['sides', 'The sides'], ['top', 'Above'], ['all', 'Everywhere']], 'Where the smoke comes from.'), num('cover', 'How thick', G('Look'), 0.8, 0.2, 1.2, 0.01, 'x', 'How much of the board the smoke hides.'), num('seed', 'Variation', G('Look'), 3, 1, 99, 1, '', 'Pick a different arrangement.', true), durP(4.2)],
  duration: (p) => n(p, 'duration'), impactAt: (p) => n(p, 'duration') * 0.4,
  cues: (p) => [{ t: 0, kind: 'whoosh', gain: 0.5, dur: n(p, 'duration') * 0.5, pitch: 0.7 }],
  boardMod(t, p) {
    const D = n(p, 'duration'), cov = smoothstep(0, D * 0.4, t) * (1 - smoothstep(D * 0.62, D * 0.95, t)) * Math.min(1, n(p, 'cover'));
    return { tint: [1 - 0.35 * cov, 1 - 0.35 * cov, 1 - 0.32 * cov] as [number, number, number], bright: 1 - 0.15 * cov };
  },
  build(f, t, p, ctx) {
    const D = n(p, 'duration');
    if (t < 0 || t >= D) return;
    const b = board(ctx), seed = n(p, 'seed'), from = s(p, 'from'), cover = n(p, 'cover');
    setVolPalette(f, 'fire', s(p, 'smoke'));
    const W = b.box.x1 - b.box.x0, H = b.box.y1 - b.box.y0, N = L(ctx, 16);
    for (let i = 0; i < N; i++) {
      const hh = (kk: number) => h1(seed * 53 + i * 11 + kk), gx = (i % 4 + 0.5 + (hh(1) - 0.5) * 0.6) / 4, gy = (Math.floor(i / 4) % 4 + 0.5 + (hh(2) - 0.5) * 0.6) / 4;
      let x = b.box.x0 + gx * W, y = b.box.y0 + gy * H, order = 0;
      if (from === 'bottom') order = 1 - gy; else if (from === 'top') order = gy; else if (from === 'sides') order = Math.abs(gx - 0.5) * 2; else order = hh(3);
      const birth = D * 0.04 + order * D * 0.28 + hh(4) * 0.2, clear = D * 0.62 + order * D * 0.22;
      const a = smoothstep(birth, birth + D * 0.2, t) * (1 - smoothstep(clear, clear + D * 0.2, t)) * Math.min(1, cover);
      if (a <= 0.01) continue;
      const tl = Math.max(0, t - birth);
      x += Math.sin(tl * 0.7 + i) * 0.03; y -= 0.05 * tl;
      smokePuff(f, { x, y, size: Math.max(b.cell * 1.3, 0.2) * lerp(0.9, 1.3, hh(5)) * (0.6 + 0.4 * easeOutCubic(tl / 1.2)), age: clamp((t - clear) / (D * 0.3)) * 0.7, seed: seed + i * 2.7, t: tl, alpha: 0.9 * a, heat: 0, light: [0.35, -0.85], soft: 0.3 });
    }
  },
};

// ---------------------------------------------------------------------------------------------------------------------
// Frozen

export const boardFrozen: ShowEffect = {
  id: 'board.frozen', name: 'Board frozen', tagline: 'Frost spreads across the grid, the symbols turn icy blue, icicles grow along the edges and crystals bloom in the corners; then the ice shatters, thaws or stays.', category: 'candidate', usesBoard: true,
  params: [enm('ending', 'At the end', G('Look'), 'shatter', [['shatter', 'Shatter with a crack and a flash'], ['thaw', 'Thaw and drip away'], ['stay', 'Stay frozen']], 'How the ice leaves.'), strengthP(), num('icicles', 'Icicles', G('Look'), 18, 0, 40, 1, 'count', 'Icicles along the board and under the cells.', true), num('seed', 'Variation', G('Look'), 6, 1, 99, 1, '', 'Pick a different arrangement.', true), durP(4)],
  duration: (p) => n(p, 'duration'), impactAt: (p) => n(p, 'duration') * 0.62,
  cues: (p) => [{ t: 0, kind: 'sweep', gain: 0.3, dur: n(p, 'duration') * 0.5, pitch: 2.4 }, ...(s(p, 'ending') === 'shatter' ? [{ t: n(p, 'duration') * 0.62, kind: 'shatter' as const, gain: 1, dur: 0.9, pitch: 2.4 }, { t: n(p, 'duration') * 0.6, kind: 'crack' as const, gain: 0.6, dur: 0.15, pitch: 1.6 }] : [])],
  boardMod(t, p) {
    const D = n(p, 'duration'), fr = smoothstep(0, D * 0.4, t) * (s(p, 'ending') === 'stay' ? 1 : 1 - smoothstep(D * 0.62, D * 0.7 + (s(p, 'ending') === 'thaw' ? D * 0.25 : 0), t));
    return { tint: [1 - 0.3 * fr, 1 - 0.1 * fr, 1 + 0.12 * fr] as [number, number, number], bright: 1 + 0.14 * fr };
  },
  build(f, t, p, ctx) {
    const D = n(p, 'duration');
    if (t < 0 || t >= D) return;
    const b = board(ctx), seed = n(p, 'seed'), k = n(p, 'strength'), ending = s(p, 'ending'), N = L(ctx, n(p, 'icicles')), icy: RGB = [0.62, 0.86, 1];
    const tShatter = D * 0.62, grow = smoothstep(0, D * 0.45, t), alive = ending === 'stay' ? 1 : 1 - smoothstep(tShatter, tShatter + (ending === 'thaw' ? D * 0.3 : 0.18), t);
    setVolPalette(f, 'white', 'ice');
    const W = b.box.x1 - b.box.x0, H = b.box.y1 - b.box.y0;
    if (alive > 0.01) {
      f.additive.push({ x: b.cx, y: b.cy, hw: W * 0.58, hh: H * 0.6, rot: 0, type: 0, color: icy, intensity: 0.28 * grow * alive * k, e1: 1.2 });
      // icicles along the top of the board and the bottom of every row
      for (let i = 0; i < N; i++) {
        const hh = (kk: number) => h1(seed * 41 + i * 7 + kk), top = i < N * 0.5, x = b.box.x0 + ((i + 0.5 + (hh(1) - 0.5) * 0.7) / (top ? Math.ceil(N * 0.5) : Math.floor(N * 0.5) || 1)) * W;
        const row = top ? -1 : Math.floor(hh(2) * b.rows), y0 = top ? b.box.y0 : b.cellCenter(row, 0).y + b.cell * 0.5;
        const g = easeOutCubic(clamp((grow - hh(3) * 0.5) / 0.5));
        if (g <= 0) continue;
        const len = b.cell * lerp(0.3, 0.8, hh(4)) * g * k * (ending === 'thaw' ? 1 - 0.5 * smoothstep(tShatter, D, t) : 1), wid = Math.max(0.005, b.cell * lerp(0.06, 0.11, hh(5)));
        const tip: [number, number] = [x, y0 + len], l: [number, number] = [x - wid, y0], r: [number, number] = [x + wid, y0], m: [number, number] = [x, y0 + len * 0.45];
        triPoly(f.polys, l, tip, m, [0.55, 0.82, 1], 0.92 * alive, [0.9, 0.98, 1], [0.9, 0.98, 1]);
        triPoly(f.polys, r, tip, m, [0.22, 0.5, 0.85], 0.92 * alive, [0.55, 0.82, 1], [0.9, 0.98, 1]);
        triPoly(f.polys, l, r, m, [0.55, 0.82, 1], 0.88 * alive);
        if (ending === 'thaw' && t > tShatter) { const ph = fract((t - tShatter) * 0.8 + hh(6)); f.additive.push({ x, y: y0 + len + ph * 0.1, hw: 0.004, hh: 0.008, rot: Math.PI / 2, type: 4, color: icy, intensity: 0.7 * (1 - ph) * alive }); }
      }
      // frost crystals in the cell corners
      for (let r = 0; r < b.rows; r++) for (let c = 0; c < b.cols; c++) {
        const ctr = b.cellCenter(r, c);
        for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
          const hh = h1(seed * 13 + r * 31 + c * 7 + (sx + 1) * 3 + (sy + 1)), g = easeOutCubic(clamp((grow - hh * 0.6) / 0.4));
          if (g <= 0) continue;
          const x = ctr.x + sx * b.cell * 0.46, y = ctr.y + sy * b.cell * 0.46;
          // a small frost frond: one main spike toward the cell's middle and two short branches on each side of it
          const a0 = Math.atan2(-sy, -sx), main = b.cell * 0.2 * g, spike = (ox: number, oy: number, a: number, len: number): void => { const px = -Math.sin(a) * len * 0.12, py = Math.cos(a) * len * 0.12; triPoly(f.polys, [ox + px, oy + py], [ox + Math.cos(a) * len, oy + Math.sin(a) * len], [ox - px, oy - py], [0.85, 0.96, 1], 0.85 * alive, [0.7, 0.9, 1], [1, 1, 1]); };
          spike(x, y, a0, main);
          for (const f2 of [0.4, 0.7]) for (const side of [-1, 1]) spike(x + Math.cos(a0) * main * f2, y + Math.sin(a0) * main * f2, a0 + side * 0.95, main * (f2 === 0.4 ? 0.5 : 0.34));
        }
        f.additive.push({ x: ctr.x, y: ctr.y, hw: b.cell * 0.55, hh: b.cell * 0.55, rot: 0, type: 0, color: icy, intensity: 0.2 * grow * alive * k, e1: 1.5 });
      }
      for (let i = 0; i < 8; i++) { const ph = fract(t * 1.4 + h1(seed + i * 5)), pt = { x: b.box.x0 + h1(seed + i * 3) * W, y: b.box.y0 + h1(seed + i * 3 + 1) * H }; f.additive.push({ x: pt.x, y: pt.y, hw: 0.03 * bell(ph), hh: 0.03 * bell(ph), rot: 0.2, type: 2, color: [0.9, 0.97, 1], intensity: bell(ph) * grow * alive }); }
    }
    if (ending === 'shatter') {
      const sh = t - tShatter;
      if (t > tShatter - 0.25 && t < tShatter) { // cracks race across the board just before it goes
        const u = (t - (tShatter - 0.25)) / 0.25, rng = makeRng(seed * 7 + 3);
        for (let i = 0; i < 9; i++) { const a = rng.next() * Math.PI * 2, reach = Math.hypot(W, H) * 0.5 * easeOutCubic(u) * (0.5 + 0.5 * rng.next()); segment(f.polys, { x: b.cx, y: b.cy }, { x: b.cx + Math.cos(a) * reach, y: b.cy + Math.sin(a) * reach * 0.8 }, 0.003, [0.95, 0.98, 1], 0.9); }
      }
      if (sh > 0 && sh < 1) {
        f.additive.push({ x: b.cx, y: b.cy, hw: W * 0.6, hh: H * 0.6, rot: 0, type: 3, color: [0.85, 0.96, 1], intensity: 1.3 * Math.exp(-sh * 9) * k });
        for (let i = 0; i < 34; i++) {
          const hh = (kk: number) => h1(seed * 19 + i * 11 + kk), a = hh(1) * Math.PI * 2, sp = lerp(0.25, 1.1, hh(2)), x = b.cx + Math.cos(a) * sp * easeOutQuart(sh) * W * 0.55, y = b.cy + Math.sin(a) * sp * easeOutQuart(sh) * H * 0.55 + 0.7 * sh * sh, sz = lerp(0.012, 0.03, hh(3)), rot = hh(4) * 6 + sh * 9, al = 1 - smoothstep(0.5, 1, sh);
          const c = Math.cos(rot), sn = Math.sin(rot), P = (lx: number, ly: number): [number, number] => [x + (c * lx - sn * ly) * sz, y + (sn * lx + c * ly) * sz];
          triPoly(f.polys, P(0, -1.3), P(0.7, 0.7), P(-0.8, 0.5), [0.55 + 0.4 * hh(5), 0.85, 1], 0.9 * al, [1, 1, 1], [0.6, 0.85, 1]);
        }
        f.camera.dx += Math.sin(sh * 80) * 0.006 * Math.exp(-sh * 8);
      }
    }
    for (let i = 0; i < 6; i++) {
      const hh = (kk: number) => h1(seed * 29 + i * 9 + kk), ph = fract(t * 0.3 + hh(1));
      smokePuff(f, { x: b.box.x0 + hh(2) * W, y: b.box.y1 + b.cell * (0.1 + 0.4 * ph), size: b.cell * 0.9 * (0.5 + ph), age: ph, seed: seed + i, t: ph * 2.5, alpha: 0.35 * grow * alive * Math.sin(Math.PI * Math.min(1, ph * 1.1)), heat: 0, light: [0.3, -0.9], soft: 0.75 });
    }
  },
};

// ---------------------------------------------------------------------------------------------------------------------
// Glow, in different textures

const TEXTURES: [string, string][] = [['neon', 'Neon tube'], ['aura', 'Soft aura'], ['embers', 'Glowing embers'], ['plasma', 'Plasma'], ['holo', 'Hologram'], ['stars', 'Starlight'], ['aurora', 'Aurora curtain'], ['caustic', 'Water caustics'], ['pulse', 'Pulse rings'], ['chase', 'Chasing lights'], ...GLOWS2];
export const boardGlow: ShowEffect = {
  id: 'board.glow', name: 'Board glow', tagline: 'A glow around and over the grid in a texture of your choice: neon tube, soft aura, embers, plasma, hologram, starlight, aurora, water caustics, pulse rings, chasing lights, a rainbow tube, a ring of fire, frost, golden comets, an electric current, lava, sunburst rays, fairy lights, a laser show or an ocean swell.', category: 'candidate', usesBoard: true,
  params: [enm('texture', 'Texture', G('Look'), 'neon', TEXTURES, 'What the glow is made of.'), color('tint', 'Colour', G('Look'), '#ffd24a', 'The main colour of the glow.'), color('tint2', 'Second colour', G('Look'), '#ff4ad8', 'A second colour (plasma, aurora and chase use it).'), strengthP(), num('speed', 'Speed', G('Look'), 1, 0.2, 3, 0.01, 'x', 'How fast the glow moves.'), durP(6, 1)],
  duration: (p) => n(p, 'duration'), impactAt: () => 0,
  cues: () => [{ t: 0.1, kind: 'sweep', gain: 0.2, dur: 0.8, pitch: 2 }],
  build(f, t, p, ctx) {
    const D = n(p, 'duration');
    if (t < 0 || t >= D) return;
    const b = board(ctx), tex = s(p, 'texture'), c1 = hex(s(p, 'tint')), c2 = hex(s(p, 'tint2')), k = n(p, 'strength'), sp = n(p, 'speed'), live = smoothstep(0, 0.5, t) * (1 - smoothstep(D - 0.5, D, t)), W = b.box.x1 - b.box.x0, H = b.box.y1 - b.box.y0;
    const T = t * sp;
    glowTexture(f, b, ctx, tex, c1, c2, k * live, T, W, H);
  },
};

function glowTexture(f: Frame, b: BoardInfo, ctx: EffectCtx, tex: string, c1: RGB, c2: RGB, k: number, T: number, W: number, H: number): void {
  const per = perimLength(b, 0.01);
  switch (tex) {
    case 'neon': {
      // a tube round the frame: a hot core with a soft halo, buzzing and flickering now and then
      const flick = 0.85 + 0.15 * Math.sin(T * 21) * (h1(Math.floor(T * 9)) > 0.15 ? 1 : 0.25), { x0, y0, x1, y1 } = b.box, ins = 0.012;
      const edges: [number, number, number, number, number][] = [[(x0 + x1) / 2, y0 + ins, W / 2, 0.012, 0], [(x0 + x1) / 2, y1 - ins, W / 2, 0.012, 0], [x0 + ins, (y0 + y1) / 2, H / 2, 0.012, Math.PI / 2], [x1 - ins, (y0 + y1) / 2, H / 2, 0.012, Math.PI / 2]];
      for (const [x, y, hw, hh, rot] of edges) {
        f.additive.push({ x, y, hw, hh: hh * 4.5, rot, type: 0, color: c1, intensity: 0.9 * k * flick, e1: 0.9 });
        f.additive.push({ x, y, hw, hh, rot, type: 0, color: mixRGB(c1, [1, 1, 1], 0.55), intensity: 2.2 * k * flick, e1: 1.6 });
      }
      f.additive.push({ x: b.cx, y: b.cy, hw: W * 0.58, hh: H * 0.6, rot: 0, type: 0, color: c1, intensity: 0.2 * k * flick, e1: 0.9 });
      break;
    }
    case 'aura': {
      const br = 0.8 + 0.2 * Math.sin(T * 2.2);
      f.additive.push({ x: b.cx, y: b.cy, hw: W * 0.78, hh: H * 0.8, rot: 0, type: 0, color: c1, intensity: 0.55 * k * br, e1: 0.6 });
      f.additive.push({ x: b.cx, y: b.cy, hw: W * 0.55, hh: H * 0.58, rot: 0, type: 0, color: mixRGB(c1, [1, 1, 1], 0.4), intensity: 0.25 * k * br, e1: 1.4 });
      break;
    }
    case 'embers': {
      f.additive.push({ x: b.cx, y: b.box.y1, hw: W * 0.62, hh: H * 0.45, rot: 0, type: 0, color: c1, intensity: (0.9 + 0.2 * Math.sin(T * 9)) * k, e1: 0.8 });
      for (let i = 0; i < L(ctx, 60); i++) { const hh = h1(i * 13 + 5), ph = fract(T * (0.25 + 0.3 * hh) + hh * 7); f.additive.push({ x: b.box.x0 + hh * W + Math.sin(ph * 9 + i) * 0.02, y: b.box.y1 - ph * H * 1.25, hw: 0.018, hh: 0.018, rot: 0, type: 0, color: mixRGB(c1, [1, 0.9, 0.6], hh * 0.5), intensity: 2 * k * (1 - ph) * (0.7 + 0.3 * Math.sin(T * 25 + i)), e1: 2.2 }); }
      break;
    }
    case 'plasma': {
      for (let i = 0; i < 7; i++) { const a = T * (0.5 + 0.13 * i) + i * 1.9, rx = W * (0.34 + 0.12 * Math.sin(T * 0.7 + i)), ry = H * (0.34 + 0.1 * Math.cos(T * 0.6 + i)); f.additive.push({ x: b.cx + Math.cos(a) * rx, y: b.cy + Math.sin(a * 1.2) * ry, hw: b.cell * 1.2, hh: b.cell * 1.2, rot: 0, type: 0, color: mixRGB(c1, c2, 0.5 + 0.5 * Math.sin(T + i)), intensity: 0.55 * k, e1: 0.9 }); }
      break;
    }
    case 'holo': {
      const ph = fract(T * 0.35), y = b.box.y0 + ph * H, fl = 0.8 + 0.2 * Math.sin(T * 33) * (h1(Math.floor(T * 12)) > 0.2 ? 1 : 0.3);
      f.additive.push({ x: b.cx, y: y - 0.04, hw: W * 0.52, hh: 0.07, rot: 0, type: 0, color: c1, intensity: 0.55 * k * fl, e1: 1.3 });
      f.additive.push({ x: b.cx, y, hw: W * 0.52, hh: 0.008, rot: 0, type: 0, color: mixRGB(c1, [1, 1, 1], 0.6), intensity: 2.2 * k * fl, e1: 1.6 });
      for (let r = 0; r <= b.rows; r++) f.additive.push({ x: b.cx, y: b.box.y0 + (r / b.rows) * H, hw: W / 2, hh: 0.004, rot: 0, type: 0, color: c1, intensity: 1.2 * k * fl, e1: 1.6 });
      for (let c = 0; c <= b.cols; c++) f.additive.push({ x: b.box.x0 + (c / b.cols) * W, y: b.cy, hw: H / 2, hh: 0.004, rot: Math.PI / 2, type: 0, color: c1, intensity: 1.2 * k * fl, e1: 1.6 });
      for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) { // bracket corners
        const x = sx < 0 ? b.box.x0 : b.box.x1, yy = sy < 0 ? b.box.y0 : b.box.y1;
        f.additive.push({ x: x - sx * -0.03, y: yy, hw: 0.05, hh: 0.007, rot: 0, type: 0, color: mixRGB(c1, [1, 1, 1], 0.5), intensity: 2 * k, e1: 1.6 });
        f.additive.push({ x, y: yy - sy * -0.03, hw: 0.05, hh: 0.007, rot: Math.PI / 2, type: 0, color: mixRGB(c1, [1, 1, 1], 0.5), intensity: 2 * k, e1: 1.6 });
      }
      break;
    }
    case 'stars': {
      for (let i = 0; i < L(ctx, 30); i++) { const hh = (kk: number) => h1(i * 17 + kk), ph = fract(T * 0.5 + hh(1)), q = perim(b, hh(2), -0.03 * hh(3)); const x = hh(4) < 0.5 ? q.x : b.box.x0 + hh(5) * W, y = hh(4) < 0.5 ? q.y : b.box.y0 + hh(6) * H; f.additive.push({ x, y, hw: 0.04 * bell(ph) * (0.6 + hh(7)), hh: 0.04 * bell(ph) * (0.6 + hh(7)), rot: 0.2, type: 2, color: mixRGB(c1, [1, 1, 1], 0.5), intensity: 1.1 * k * bell(ph) }); }
      break;
    }
    case 'aurora': {
      // curtains hanging over the top edge and rising from the bottom, drifting sideways
      for (let i = 0; i < 11; i++) {
        const x = b.box.x0 + (i / 10) * W, wob = Math.sin(T * 0.8 + i * 0.9) * 0.05, col = mixRGB(c1, c2, 0.5 + 0.5 * Math.sin(T * 0.5 + i * 0.7)), len = 0.2 + 0.07 * Math.sin(T + i * 1.3);
        f.additive.push({ x: x + wob, y: b.box.y0 + len * 0.15, hw: W / 18, hh: len + 0.1, rot: 0, type: 0, color: col, intensity: 0.8 * k * (0.7 + 0.3 * Math.sin(T * 1.3 + i)), e1: 0.8 });
        f.additive.push({ x: x - wob, y: b.box.y1 - len * 0.1, hw: W / 22, hh: len * 0.8, rot: 0, type: 0, color: mixRGB(col, [1, 1, 1], 0.15), intensity: 0.35 * k, e1: 0.9 });
      }
      f.additive.push({ x: b.cx, y: b.cy, hw: W * 0.6, hh: H * 0.62, rot: 0, type: 0, color: c1, intensity: 0.12 * k, e1: 0.9 });
      break;
    }
    case 'caustic': {
      for (let i = 0; i < L(ctx, 22); i++) { const hh = h1(i * 19 + 3), x = b.box.x0 + fract(hh + Math.sin(T * 0.3 + i) * 0.1 + T * 0.03 * (hh - 0.5)) * W, y = b.box.y0 + fract(h1(i * 7) + Math.cos(T * 0.35 + i * 1.3) * 0.1) * H; f.additive.push({ x, y, hw: b.cell * (0.5 + 0.4 * hh), hh: b.cell * (0.3 + 0.25 * hh), rot: hh * 3 + T * 0.2, type: 0, color: mixRGB(c1, [1, 1, 1], 0.4), intensity: 0.6 * k * (0.6 + 0.4 * Math.sin(T * 2 + i)), e1: 1.2 }); }
      break;
    }
    case 'pulse': {
      for (let i = 0; i < 3; i++) { const ph = fract(T * 0.4 + i / 3), r = lerp(0.3, 1, ph); f.additive.push({ x: b.cx, y: b.cy, hw: W * 0.55 * r * 1.15, hh: H * 0.55 * r * 1.15, rot: 0, type: 1, color: c1, intensity: 0.9 * k * (1 - ph) ** 1.3, e1: 0.06 }); }
      break;
    }
    case 'chase': {
      const N = L(ctx, 56);
      for (let i = 0; i < N; i++) { const q = perim(b, i / N, 0.012), on = fract(i / 4 - T * 0.8) < 0.5; bulb(f, q.x, q.y, 0.017, on ? c1 : c2, (on ? 1.6 : 0.3) * k); }
      break;
    }
    default: glow2(f, b, ctx, tex, c1, c2, k, T, W, H);
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Themes

const THEMES: [string, string][] = [['nordic', 'Nordic: runes, aurora and snow'], ['scifi', 'Sci-fi: hologram brackets, scan beam, data rain'], ['alien', 'Alien: bioluminescent waves, spores, tendrils'], ['mexican', 'Mexican: papel picado, marigold petals, candles'], ['inferno', 'Fire: flames, heat haze, embers'], ['cabaret', 'Cabaret: marquee bulbs, spotlights, velvet'], ['fishing', 'Fishing: water, light rays, bubbles, fish'], ['egyptian', 'Egyptian: gold sand, torches, glints'], ...THEMES2];

const RUNES: [number, number][][] = [
  [[0, 0], [0, 1], [0.5, 0.65], [0, 0.4]], [[0, 0], [0, 1], [0.6, 0.45], [0, 0.5]], [[0.5, 0], [0.5, 1], [0, 0.35], [1, 0.65]], [[0, 0], [1, 1], [1, 0], [0, 1]], [[0, 0], [0, 1], [0.7, 0.5], [0, 0]], [[0.5, 0], [0.5, 1], [0, 0.7], [1, 0.7]], [[0, 1], [0.5, 0], [1, 1], [0.5, 0.6]], [[0, 0], [0.5, 0.5], [0, 1], [1, 0.5], [0, 0]],
];

export const boardTheme: ShowEffect = {
  id: 'board.theme', name: 'Board theme', tagline: 'Dresses the grid in a setting: Nordic runes and aurora, sci-fi hologram, alien bioluminescence, Mexican fiesta, fire, cabaret, fishing, Egyptian gold, space, haunted, festival lanterns, candy, pirate, cyberpunk, Christmas or steampunk.', category: 'candidate', usesBoard: true,
  params: [enm('theme', 'Theme', G('Look'), 'nordic', THEMES, 'The setting.'), strengthP(), num('speed', 'Speed', G('Look'), 1, 0.2, 3, 0.01, 'x', 'How fast things move.'), num('tint', 'Tint the board', G('Look'), 1, 0, 1.5, 0.01, 'x', 'How much the symbols take on the theme\'s colour.'), durP(8, 1)],
  duration: (p) => n(p, 'duration'), impactAt: () => 0,
  cues: () => [{ t: 0.1, kind: 'sweep', gain: 0.2, dur: 0.8, pitch: 1.6 }],
  boardMod(t, p) {
    const th = s(p, 'theme'), k = n(p, 'tint'), T = t * n(p, 'speed'), D = n(p, 'duration'), live = smoothstep(0, 0.6, t) * (1 - smoothstep(D - 0.6, D, t));
    const m = (r: number, g: number, b: number, bright = 1, wob = 0): { tint: [number, number, number]; bright: number; wobble: number } => ({ tint: [lerp(1, r, k * live), lerp(1, g, k * live), lerp(1, b, k * live)], bright: lerp(1, bright, live), wobble: wob * live });
    switch (th) {
      case 'nordic': return m(0.92, 1, 1.1);
      case 'scifi': return { ...m(0.85, 1.02, 1.12, 1), bright: 1 + 0.06 * Math.sin(T * 40) * live };
      case 'alien': return m(0.9, 1.1, 0.95, 1, 0.006 * Math.sin(T * 0.8));
      case 'mexican': return m(1.08, 1, 0.92);
      case 'inferno': return { ...m(1.12, 0.9, 0.76), bright: 1 + 0.08 * Math.sin(T * 14 + h1(Math.floor(T * 9)) * 3) * live };
      case 'cabaret': return m(1.06, 0.95, 1.02);
      case 'fishing': return m(0.8, 1.02, 1.12);
      case 'egyptian': return m(1.1, 1.02, 0.84);
      default: return themeMod2(th, k, live, T) as never;
    }
  },
  build(f, t, p, ctx) {
    const D = n(p, 'duration');
    if (t < 0 || t >= D) return;
    const b = board(ctx), th = s(p, 'theme'), k = n(p, 'strength'), T = t * n(p, 'speed'), live = smoothstep(0, 0.6, t) * (1 - smoothstep(D - 0.6, D, t)) * k;
    const W = b.box.x1 - b.box.x0, H = b.box.y1 - b.box.y0, q = Math.max(0.3, ctx.quality ?? 1);
    switch (th) {
      case 'nordic': {
        const ice: RGB = [0.62, 0.9, 1], gold: RGB = [1, 0.85, 0.45];
        for (let i = 0; i < 9; i++) f.additive.push({ x: b.box.x0 + (i / 8) * W + Math.sin(T * 0.6 + i) * 0.04, y: b.box.y0 - 0.08, hw: W / 15, hh: 0.2 + 0.05 * Math.sin(T * 0.9 + i), rot: 0, type: 0, color: mixRGB([0.3, 1, 0.7], [0.6, 0.5, 1], 0.5 + 0.5 * Math.sin(T * 0.4 + i * 0.8)), intensity: 0.4 * live, e1: 0.8 });
        const nR = Math.round(11 * Math.min(1, q + 0.3));
        for (const top of [true, false]) for (let i = 0; i < nR; i++) {
          const x = b.box.x0 + ((i + 0.5) / nR) * W, y = top ? b.box.y0 - 0.055 : b.box.y1 + 0.02, rn = RUNES[(i * 3 + (top ? 0 : 5)) % RUNES.length]!, sz = 0.034;
          const pulse = Math.max(0, Math.sin(T * 1.6 - i * 0.55 + (top ? 0 : 1.5))) ** 2, col = mixRGB(ice, gold, pulse);
          for (let j = 1; j < rn.length; j++) segment(f.polys, { x: x - sz * 0.35 + rn[j - 1]![0] * sz * 0.7, y: y + rn[j - 1]![1] * sz }, { x: x - sz * 0.35 + rn[j]![0] * sz * 0.7, y: y + rn[j]![1] * sz }, 0.003, col, (0.55 + 0.45 * pulse) * live);
          f.additive.push({ x, y: y + sz * 0.5, hw: 0.04, hh: 0.04, rot: 0, type: 0, color: col, intensity: (0.2 + 0.7 * pulse) * live, e1: 1.5 });
        }
        for (let i = 0; i < Math.round(40 * q); i++) { const hh = h1(i * 13 + 2), ph = fract(T * (0.1 + 0.14 * hh) + hh * 5); f.additive.push({ x: b.box.x0 - 0.1 + fract(hh * 9) * (W + 0.2) + Math.sin(ph * 12 + i) * 0.02, y: b.box.y0 - 0.2 + ph * (H + 0.45), hw: 0.007, hh: 0.007, rot: 0, type: 0, color: [1, 1, 1], intensity: 0.8 * live, e1: 2 }); }
        break;
      }
      case 'scifi': {
        const cy: RGB = [0.3, 0.9, 1], col2: RGB = [1, 0.4, 0.9];
        const arm = 0.08, pul = 0.7 + 0.3 * Math.sin(T * 3);
        for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
          const x = sx < 0 ? b.box.x0 - 0.02 : b.box.x1 + 0.02, y = sy < 0 ? b.box.y0 - 0.02 : b.box.y1 + 0.02;
          segment(f.polys, { x, y }, { x: x - sx * arm, y }, 0.006, cy, 0.95 * live * pul); segment(f.polys, { x, y }, { x, y: y - sy * arm }, 0.006, cy, 0.95 * live * pul);
          f.additive.push({ x, y, hw: 0.05, hh: 0.05, rot: 0, type: 0, color: cy, intensity: 0.6 * live * pul, e1: 2 });
        }
        const ph = fract(T * 0.3), y = b.box.y0 + (ph < 0.5 ? ph * 2 : 2 - ph * 2) * H;
        f.additive.push({ x: b.cx, y, hw: W * 0.52, hh: 0.005, rot: 0, type: 0, color: [0.7, 1, 1], intensity: 1.3 * live, e1: 1.2 });
        f.additive.push({ x: b.cx, y: y + (ph < 0.5 ? -0.04 : 0.04), hw: W * 0.52, hh: 0.05, rot: 0, type: 0, color: cy, intensity: 0.3 * live, e1: 1.5 });
        for (let c = 0; c <= b.cols; c++) segment(f.polys, { x: b.box.x0 + (c / b.cols) * W, y: b.box.y0 }, { x: b.box.x0 + (c / b.cols) * W, y: b.box.y1 }, 0.0012, cy, 0.14 * live);
        for (let r = 0; r <= b.rows; r++) segment(f.polys, { x: b.box.x0, y: b.box.y0 + (r / b.rows) * H }, { x: b.box.x1, y: b.box.y0 + (r / b.rows) * H }, 0.0012, cy, 0.14 * live);
        for (let i = 0; i < Math.round(28 * q); i++) { const hh = h1(i * 11 + 4), side = hh < 0.5 ? -1 : 1, ph2 = fract(T * (0.3 + 0.5 * hh) + hh * 6); quadPoly(f.polys, (side < 0 ? b.box.x0 - 0.06 : b.box.x1 + 0.06) + (h1(i * 5) - 0.5) * 0.06, b.box.y0 - 0.1 + ph2 * (H + 0.2), 0.003, 0.012, 0, i % 5 === 0 ? col2 : cy, 0.8 * live * Math.sin(Math.PI * ph2)); }
        break;
      }
      case 'alien': {
        const g: RGB = [0.45, 1, 0.5], v: RGB = [0.75, 0.4, 1];
        for (let w = 0; w < 2; w++) {
          const ph = fract(T * 0.22 + w * 0.5), ox = b.cellCenter(w === 0 ? 0 : b.rows - 1, w === 0 ? 0 : b.cols - 1);
          f.additive.push({ x: ox.x, y: ox.y, hw: W * 1.2 * ph, hh: W * 1.2 * ph, rot: 0, type: 1, color: mixRGB(g, v, w), intensity: 0.8 * live * (1 - ph) ** 1.3, e1: 0.05 });
          for (let r = 0; r < b.rows; r++) for (let c = 0; c < b.cols; c++) { const ctr = b.cellCenter(r, c), d = Math.hypot(ctr.x - ox.x, ctr.y - ox.y) / (W * 1.2), pulse = Math.exp(-((d - ph) ** 2) * 60); if (pulse > 0.05) f.additive.push({ x: ctr.x, y: ctr.y, hw: b.cell * 0.8, hh: b.cell * 0.8, rot: 0, type: 0, color: mixRGB(g, v, w), intensity: 0.8 * pulse * live, e1: 1.2 }); }
        }
        for (let i = 0; i < Math.round(26 * q); i++) { const hh = h1(i * 9 + 3), ph = fract(T * (0.1 + 0.12 * hh) + hh * 7); f.additive.push({ x: b.box.x0 - 0.05 + hh * (W + 0.1) + Math.sin(T + i) * 0.03, y: b.box.y1 + 0.05 - ph * (H + 0.2), hw: 0.012 + 0.01 * hh, hh: 0.012 + 0.01 * hh, rot: 0, type: 0, color: mixRGB(g, v, hh), intensity: 0.9 * live * bell(ph), e1: 2 }); }
        for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {          // tendrils curling out of the corners
          let px = sx < 0 ? b.box.x0 : b.box.x1, py = sy < 0 ? b.box.y0 : b.box.y1, a = Math.atan2(-sy, -sx) + Math.sin(T * 0.7 + sx * 2) * 0.4;
          for (let j = 0; j < 14; j++) { const nx = px + Math.cos(a) * 0.022, ny = py + Math.sin(a) * 0.022, w = 0.011 * (1 - j / 14); segment(f.polys, { x: px, y: py }, { x: nx, y: ny }, w * 2, [0.12 + 0.2 * (j / 14), 0.55, 0.3], 0.85 * live); if (j % 4 === 0) f.additive.push({ x: nx, y: ny, hw: 0.018, hh: 0.018, rot: 0, type: 0, color: g, intensity: 0.8 * live, e1: 2 }); px = nx; py = ny; a += 0.14 * Math.sin(T * 1.3 + j * 0.6 + sx); }
        }
        break;
      }
      case 'mexican': {
        const pal: RGB[] = [[1, 0.35, 0.65], [1, 0.62, 0.15], [0.2, 0.85, 0.85], [1, 0.9, 0.25], [0.7, 0.4, 0.95]];
        const nF = Math.round(13 * Math.min(1, q + 0.3));
        segment(f.polys, { x: b.box.x0 - 0.05, y: b.box.y0 - 0.09 }, { x: b.box.x1 + 0.05, y: b.box.y0 - 0.09 }, 0.004, [0.9, 0.85, 0.7], 0.9 * live);
        for (let i = 0; i < nF; i++) {
          const x = b.box.x0 - 0.04 + ((i + 0.5) / nF) * (W + 0.08), w = (W + 0.08) / nF * 0.46, sway = Math.sin(T * 1.7 + i * 0.7) * 0.012, col = pal[i % pal.length]!, y0 = b.box.y0 - 0.09, h = 0.075;
          quadPoly(f.polys, x + sway * 0.4, y0 + h / 2, w, h / 2, sway * 1.2, col, 0.92 * live);
          for (let j = 0; j < 3; j++) ellipsePoly(f.polys, x + (j - 1) * w * 0.5 + sway * 0.4, y0 + h * 0.45, w * 0.13, h * 0.1, 0, [0.15, 0.05, 0.1], 0.6 * live, 6);
          triPoly(f.polys, [x - w + sway * 0.4, y0 + h], [x + w + sway * 0.4, y0 + h], [x + sway * 0.8, y0 + h + 0.025], col, 0.92 * live);
        }
        for (let i = 0; i < Math.round(26 * q); i++) { const hh = h1(i * 13 + 6), ph = fract(T * (0.12 + 0.15 * hh) + hh * 5), x = b.box.x0 - 0.1 + hh * (W + 0.2) + Math.sin(ph * 10 + i) * 0.03, y = b.box.y0 - 0.1 + ph * (H + 0.3), rot = ph * 9 + i; ellipsePoly(f.polys, x, y, 0.012, 0.007 + 0.004 * Math.abs(Math.sin(rot)), rot * 0.4, [1, 0.6 + 0.2 * hh, 0.1], 0.9 * live, 8); }
        setVolPalette(f, 'fire', 'grey');
        for (const sx of [-1, 1]) { const x = sx < 0 ? b.box.x0 - 0.05 : b.box.x1 + 0.05, y = b.box.y1; quadPoly(f.polys, x, y - 0.02, 0.012, 0.03, 0, [1, 0.95, 0.85], live); flame(f, { x, y: y - 0.05, w: 0.03, h: 0.07 * (0.8 + 0.2 * Math.sin(T * 9 + sx)), age: 0.1, seed: sx + 4, t: T + sx, heat: 1, alpha: live, rot: Math.sin(T * 2 + sx) * 0.1 }); f.additive.push({ x, y: y - 0.07, hw: 0.14, hh: 0.14, rot: 0, type: 0, color: [1, 0.7, 0.3], intensity: 0.4 * live * (0.85 + 0.15 * Math.sin(T * 11 + sx)), e1: 1.2 }); }
        break;
      }
      case 'inferno': {
        setVolPalette(f, 'fire', 'black');
        const nFl = Math.round(14 * Math.min(1, q + 0.3));
        for (let i = 0; i < nFl; i++) { const hh = h1(i * 7 + 1), tl = T + hh * 6, ph = 0.5 + 0.5 * Math.sin(tl * (5 + 4 * hh)), x = b.box.x0 + ((i + 0.5) / nFl) * W; flame(f, { x, y: b.box.y1 + 0.01, w: W / nFl * 1.6, h: H * lerp(0.28, 0.5, hh) * (0.65 + 0.35 * ph) * live, age: 0.1 + 0.25 * hh, seed: i * 3.1, t: tl, heat: 1, alpha: 1 }); }
        for (const sx of [-1, 1]) for (let i = 0; i < 4; i++) { const hh = h1(i * 5 + (sx > 0 ? 9 : 0)), tl = T + hh * 5; flame(f, { x: sx < 0 ? b.box.x0 - 0.01 : b.box.x1 + 0.01, y: b.box.y1 - (i / 4) * H * 0.7, w: 0.07, h: 0.18 * (0.7 + 0.3 * Math.sin(tl * 7)) * live, age: 0.15, seed: i + sx * 5, t: tl, heat: 1, alpha: 1, rot: sx * 0.35 }); }
        f.additive.push({ x: b.cx, y: b.cy, hw: W * 0.62, hh: H * 0.62, rot: 0, type: 0, color: [1, 0.45, 0.1], intensity: (0.22 + 0.06 * Math.sin(T * 13)) * live, e1: 1 });
        f.distort.push({ kind: DISTORT.heat, a: [0.006 * live, 0, 0, 20], b: [b.cx, b.cy, b.box.y0 - 0.1, b.box.y1 + 0.05] });
        f.distort[f.distort.length - 1]!.a[2] = T;
        for (let i = 0; i < Math.round(36 * q); i++) { const hh = h1(i * 13 + 8), ph = fract(T * (0.3 + 0.3 * hh) + hh * 7); f.additive.push({ x: b.box.x0 + hh * W + Math.sin(ph * 9 + i) * 0.02, y: b.box.y1 - ph * H * 1.3, hw: 0.011, hh: 0.011, rot: 0, type: 0, color: [1, 0.65, 0.25], intensity: 1.2 * live * (1 - ph) * (0.7 + 0.3 * Math.sin(T * 25 + i)), e1: 2.2 }); }
        break;
      }
      case 'cabaret': {
        const N = Math.round(60 * Math.min(1, q + 0.3));
        for (let i = 0; i < N; i++) { const qq = perim(b, i / N, -0.025), on = fract(i / 3 - T * 0.9) < 0.45; bulb(f, qq.x, qq.y, 0.012, on ? [1, 0.9, 0.6] : [1, 0.35, 0.55], (on ? 1.1 : 0.3) * live); }
        for (const sx of [-1, 1]) { const ang = (sx < 0 ? 1 : -1) * (0.35 + 0.3 * Math.sin(T * 0.8 + sx)) + Math.PI / 2; f.additive.push({ x: sx < 0 ? b.box.x0 - 0.1 : b.box.x1 + 0.1, y: b.box.y0 - 0.12, hw: 1.0, hh: 0.14, rot: ang, type: 6, color: sx < 0 ? [1, 0.9, 0.7] : [1, 0.6, 0.85], intensity: 0.55 * live, e1: 0.7 }); }
        for (const sx of [-1, 1]) { const x0 = sx < 0 ? b.box.x0 - 0.17 : b.box.x1 + 0.03; for (let i = 0; i < 6; i++) quadPoly(f.polys, x0 + i * 0.024 + Math.sin(T * 0.9 + i + sx) * 0.004, b.cy, 0.012, H * 0.62, 0, [0.62 - 0.1 * (i % 2), 0.05, 0.12], 0.95 * live); }
        for (let i = 0; i < Math.round(30 * q); i++) { const hh = h1(i * 11 + 2), ph = fract(T * (0.2 + 0.2 * hh) + hh * 5); f.additive.push({ x: b.box.x0 + hh * W, y: b.box.y0 - 0.1 + ph * (H + 0.2), hw: 0.014 * bell(fract(ph * 4 + hh)), hh: 0.014 * bell(fract(ph * 4 + hh)), rot: 0.3, type: 2, color: [1, 0.92, 0.7], intensity: 1 * live }); }
        break;
      }
      case 'fishing': {
        for (let i = 0; i < Math.round(16 * q); i++) { const hh = h1(i * 19 + 3), x = b.box.x0 + fract(hh + Math.sin(T * 0.3 + i) * 0.1) * W, y = b.box.y0 + fract(h1(i * 7) + Math.cos(T * 0.35 + i * 1.3) * 0.1) * H; f.additive.push({ x, y, hw: b.cell * (0.4 + 0.3 * hh), hh: b.cell * (0.25 + 0.2 * hh), rot: hh * 3 + T * 0.2, type: 0, color: [0.7, 1, 1], intensity: 0.26 * live * (0.6 + 0.4 * Math.sin(T * 2 + i)), e1: 1.2 }); }
        for (let i = 0; i < 5; i++) f.additive.push({ x: b.box.x0 + ((i + 0.5) / 5) * W + Math.sin(T * 0.5 + i) * 0.05, y: b.box.y0 - 0.12, hw: 0.7, hh: 0.05, rot: Math.PI / 2 + (i - 2) * 0.12, type: 6, color: [0.6, 0.95, 1], intensity: 0.28 * live, e1: 0.5 });
        for (let i = 0; i < Math.round(22 * q); i++) { const hh = h1(i * 13 + 9), ph = fract(T * (0.16 + 0.14 * hh) + hh * 5), x = b.box.x0 - 0.04 + hh * (W + 0.08) + Math.sin(ph * 11 + i) * 0.015, y = b.box.y1 + 0.05 - ph * (H + 0.2), r = 0.01 + 0.014 * hh; f.additive.push({ x, y, hw: r, hh: r, rot: 0, type: 1, color: [0.8, 1, 1], intensity: 0.8 * live * bell(ph), e1: 0.14 }); }
        for (let i = 0; i < 3; i++) {                            // fish swimming across behind the grid
          const dir = i % 2 ? -1 : 1, ph = fract(T * (0.07 + 0.03 * i) + i * 0.33), x = dir > 0 ? -0.2 + ph * (ctx.aspect + 0.4) : ctx.aspect + 0.2 - ph * (ctx.aspect + 0.4), y = b.box.y0 + (0.15 + 0.35 * i) * H + Math.sin(ph * 14 + i) * 0.02, sz = 0.05 + 0.02 * i, col: RGB = [0.12, 0.35 + 0.1 * i, 0.5];
          ellipsePoly(f.polys, x, y, sz, sz * 0.45, 0, col, 0.55 * live, 12);
          triPoly(f.polys, [x - dir * sz * 0.8, y], [x - dir * sz * 1.5, y - sz * 0.5 + Math.sin(T * 8 + i) * 0.01], [x - dir * sz * 1.5, y + sz * 0.5 + Math.sin(T * 8 + i) * 0.01], col, 0.55 * live);
        }
        break;
      }
      case 'egyptian': {
        setVolPalette(f, 'fire', 'sand');
        for (const sx of [-1, 1]) { const x = sx < 0 ? b.box.x0 - 0.07 : b.box.x1 + 0.07, y = b.box.y1 - 0.02; quadPoly(f.polys, x, y - 0.015, 0.008, 0.03, 0, [0.85, 0.65, 0.2], live); flame(f, { x, y: y - 0.045, w: 0.04, h: 0.1 * (0.8 + 0.2 * Math.sin(T * 8 + sx)), age: 0.1, seed: sx + 2, t: T + sx, heat: 1, alpha: live }); f.additive.push({ x, y: y - 0.09, hw: 0.2, hh: 0.2, rot: 0, type: 0, color: [1, 0.7, 0.25], intensity: 0.45 * live * (0.85 + 0.15 * Math.sin(T * 10 + sx)), e1: 1.2 }); }
        for (let i = 0; i < Math.round(60 * q); i++) { const hh = h1(i * 11 + 4), ph = fract(T * (0.1 + 0.18 * hh) + hh * 9), y = b.box.y0 - 0.05 + h1(i * 5) * (H + 0.1); f.additive.push({ x: b.box.x0 - 0.2 + ph * (W + 0.4), y: y + Math.sin(ph * 14 + i) * 0.01, hw: 0.007, hh: 0.007, rot: 0, type: 0, color: [1, 0.85, 0.45], intensity: 0.9 * live * bell(ph), e1: 2 }); }
        for (let i = 0; i < Math.round(14 * q); i++) { const hh = h1(i * 17 + 5), ph = fract(T * 0.5 + hh); f.additive.push({ x: b.box.x0 + hh * W, y: b.box.y0 + h1(i * 3) * H, hw: 0.035 * bell(ph), hh: 0.035 * bell(ph), rot: 0.2, type: 2, color: [1, 0.9, 0.55], intensity: bell(ph) * live }); }
        const pul = 0.7 + 0.3 * Math.sin(T * 2.5);
        f.additive.push({ x: b.cx, y: b.box.y0 - 0.04, hw: W * 0.5, hh: 0.012, rot: 0, type: 0, color: [1, 0.8, 0.3], intensity: 0.7 * live * pul, e1: 1.2 });
        f.additive.push({ x: b.cx, y: b.box.y1 + 0.03, hw: W * 0.5, hh: 0.012, rot: 0, type: 0, color: [1, 0.8, 0.3], intensity: 0.7 * live * pul, e1: 1.2 });
        break;
      }
      default: theme2(f, b, ctx, th, T, live, q);
    }
  },
};

export const BOARD_MODS: ShowEffect[] = [boardShake, boardZap, boardSmoke, boardFrozen, boardGlow, boardTheme];
void FIRE_PALETTES; void easeOutQuart;
