/**
 * Particle emitters that behave like real things: coins and gems that fountain up, bounce on a floor and fly to a balance meter,
 * pieces that burst, rain down or float up. The pieces can be vector shapes (coin, gem, star, confetti, leaf, petal, bubble, spark)
 * or your own picture (the symbol the effect is aimed at becomes the particle). Everything is a pure function of time: each piece is
 * simulated from its launch with a fixed step, so scrubbing and recording give exactly the same frame.
 */
import { color, enm, num } from '../../core/params';
import type { Frame, RGB } from '../engine/frame';
import { clamp, easeInOutCubic, easeOutCubic, h1, hex, lerp, mixRGB, smoothstep } from '../engine/math';
import { n, s, type EffectCtx, type PValues, type ShowEffect } from './effect';
import { GEMS, gem } from './explosions2';
import { drawIcons, ellipsePoly, quadPoly, triPoly, type IconDraw } from './helpers';

type Mode = 'fountain' | 'burst' | 'rain' | 'rise';

const G = (group: string) => ({ section: 'Effect', group });
const SHAPES: [string, string][] = [['coin', 'Gold coin'], ['gem', 'Gem'], ['star', 'Star'], ['confetti', 'Confetti'], ['leaf', 'Leaf'], ['petal', 'Petal'], ['bubble', 'Bubble'], ['spark', 'Glowing spark']];
const SHAPE_TINT: Record<string, string> = { coin: '#ffc933', gem: '#ffffff', star: '#ffe27a', confetti: '#ffffff', leaf: '#5fcf3a', petal: '#ff8fb8', bubble: '#bfe8ff', spark: '#ffd27a' };
const PALETTES: [string, string][] = [['rainbow', 'Mixed jewels'], ['ruby', 'Rubies'], ['emerald', 'Emeralds'], ['sapphire', 'Sapphires'], ['diamond', 'Diamonds'], ['gold', 'Gold topaz']];
const CONFETTI: RGB[] = [[1, 0.35, 0.4], [1, 0.82, 0.25], [0.3, 0.8, 1], [0.5, 1, 0.5], [0.82, 0.5, 1], [1, 0.62, 0.2]];
const LEAVES: RGB[] = [[0.35, 0.8, 0.22], [0.5, 0.9, 0.25], [0.88, 0.68, 0.18], [0.9, 0.4, 0.15]];

interface Spec {
  mode: Mode; shape: string; count: number; size: number; speed: number; spread: number; dir: number; gravity: number; drag: number; spin: number;
  floor: number; bounce: number; life: number; ending: 'fade' | 'collect' | 'stay'; meter: { x: number; y: number }; collectAt: number; glow: number;
  tint: RGB; natural: RGB; palette: string; seed: number; D: number; cx: number; cy: number; areaW: number; sizeVar: number; flip: boolean; quality: number;
}

const isWhite = (c: RGB) => c[0] > 0.99 && c[1] > 0.99 && c[2] > 0.99;
const naturalOf = (shape: string, tint: RGB): RGB => (isWhite(tint) ? hex(SHAPE_TINT[shape] ?? '#ffffff') : tint);

function spec(p: PValues, mode: Mode, ctx: EffectCtx): Spec {
  return {
    mode, shape: s(p, 'shape'), count: Math.max(1, Math.round(n(p, 'count') * Math.max(0.25, ctx.quality ?? 1))), size: n(p, 'pieceSize'), speed: n(p, 'speed'), spread: (n(p, 'spread') * Math.PI) / 180, dir: ((p.direction !== undefined ? n(p, 'direction') : -90) * Math.PI) / 180,
    gravity: n(p, 'gravity'), drag: n(p, 'drag'), spin: n(p, 'spin'), floor: p.floor !== undefined ? n(p, 'floor') : 9, bounce: p.bounce !== undefined ? n(p, 'bounce') : 0.4, life: p.life !== undefined ? n(p, 'life') : n(p, 'duration'),
    ending: (p.ending !== undefined ? s(p, 'ending') : 'fade') as Spec['ending'], meter: { x: p.meterX !== undefined ? n(p, 'meterX') * ctx.aspect : 0, y: p.meterY !== undefined ? n(p, 'meterY') : 0 }, collectAt: p.collectAt !== undefined ? n(p, 'collectAt') : 0.6,
    glow: n(p, 'glow'), tint: hex(s(p, 'tint')), natural: naturalOf(s(p, 'shape'), hex(s(p, 'tint'))), palette: p.palette !== undefined ? s(p, 'palette') : 'rainbow', seed: n(p, 'seed') * 101, D: n(p, 'duration'), cx: n(p, 'cx') * ctx.aspect, cy: n(p, 'cy'),
    areaW: p.areaWidth !== undefined ? n(p, 'areaWidth') : 0.4, sizeVar: n(p, 'sizeVar'), flip: p.flip === undefined ? true : p.flip === true || p.flip === 'true', quality: ctx.quality ?? 1,
  };
}

interface Launch { t0: number; x: number; y: number; vx: number; vy: number; size: number; spin: number; phase: number; col: number; dirSign: number }

function launch(i: number, S: Spec, aspect: number): Launch {
  const h = (k: number) => h1(S.seed + i * 17 + k);
  const emitSpan = S.mode === 'burst' ? 0.06 : S.mode === 'fountain' ? Math.min(S.D * 0.4, 1.6) : S.D * 0.7;
  const t0 = emitSpan * (S.mode === 'burst' ? h(1) : (i + h(1) * 0.9) / S.count);
  const size = S.size * lerp(1 - S.sizeVar, 1 + S.sizeVar, h(2));
  let x = S.cx, y = S.cy, vx = 0, vy = 0;
  if (S.mode === 'fountain') { const a = S.dir + (h(3) - 0.5) * S.spread, v = S.speed * lerp(0.62, 1.12, h(4)); vx = Math.cos(a) * v; vy = Math.sin(a) * v; x += (h(5) - 0.5) * 0.04; }
  else if (S.mode === 'burst') { const a = S.dir + (h(3) - 0.5) * S.spread, v = S.speed * lerp(0.3, 1.15, h(4)); vx = Math.cos(a) * v; vy = Math.sin(a) * v; }
  else if (S.mode === 'rain') { x = h(3) * aspect; y = -size - h(5) * 0.1; vx = (h(6) - 0.5) * 0.12; vy = S.speed * lerp(0.6, 1.2, h(4)); }
  else { x = S.cx + (h(3) - 0.5) * S.areaW * 2; y = S.cy + (h(5) - 0.5) * 0.05; vx = (h(6) - 0.5) * 0.05; vy = -S.speed * lerp(0.5, 1.2, h(4)); }
  return { t0, x, y, vx, vy, size, spin: (S.spin * (0.4 + h(7))) * (h(8) < 0.5 ? 1 : -1), phase: h(9) * Math.PI * 2, col: Math.floor(h(10) * 64), dirSign: h(11) < 0.5 ? -1 : 1 };
}

interface Sim { x: number; y: number; vx: number; vy: number; collectAt: number | null; bounces: number }
const DT = 1 / 90;
const FLIGHT = 0.75;

/** Fixed-step physics from the launch to `age`: gravity, drag, a bouncing floor, and the moment a piece sets off for the meter. */
function simulate(L: Launch, age: number, S: Spec, i: number): Sim {
  let { x, y, vx, vy } = L;
  let bounces = 0, collectAt: number | null = null;
  // when this piece sets off for the meter (a point in the effect's time, so the last ones still arrive before the end)
  const window = Math.max(0.2, S.D - FLIGHT - 0.85 - S.collectAt * S.D);
  const collectBase = S.ending === 'collect' ? Math.max(0.35, S.collectAt * S.D + h1(S.seed + i * 17 + 12) * window * 0.85 - L.t0) : Infinity;
  const k = Math.exp(-S.drag * DT);
  for (let a = 0; a < Math.min(age, 14); a += DT) {
    if (a >= collectBase && (collectAt === null)) { const settled = Math.abs(vy) < 0.05 && Math.abs(vx) < 0.05; if (settled || a >= collectBase + 0.7) { collectAt = a; break; } }
    vx *= k; vy = vy * k + S.gravity * DT;
    x += vx * DT; y += vy * DT;
    if (y > S.floor && vy > 0) {
      y = S.floor; vy = -vy * S.bounce; vx *= 0.8; bounces++;
      if (Math.abs(vy) < 0.1) { vy = 0; vx *= 0.9; }
    } else if (y >= S.floor && vy === 0) vx *= 0.96;
  }
  return { x, y, vx, vy, collectAt, bounces };
}

function pieceColor(S: Spec, c: number): RGB {
  if (S.shape === 'confetti') return CONFETTI[c % CONFETTI.length]!;
  if (S.shape === 'leaf') return isWhite(S.tint) ? LEAVES[c % LEAVES.length]! : mixRGB(LEAVES[c % LEAVES.length]!, S.tint, 0.5);
  if (S.shape === 'gem') { const pal = GEMS[S.palette] ?? GEMS.rainbow!; return pal[c % pal.length]!; }
  return S.natural;
}

function star(out: number[], x: number, y: number, r: number, rot: number, sq: number, col: RGB, a: number): void {
  const pt = (k: number, rr: number): [number, number] => { const an = rot + (k / 10) * Math.PI * 2 - Math.PI / 2; return [x + Math.cos(an) * rr * sq, y + Math.sin(an) * rr]; };
  const hi: RGB = [Math.min(1, col[0] * 1.25 + 0.1), Math.min(1, col[1] * 1.25 + 0.1), Math.min(1, col[2] * 1.2 + 0.05)], lo: RGB = [col[0] * 0.7, col[1] * 0.62, col[2] * 0.5];
  for (let k = 0; k < 10; k++) triPoly(out, [x, y], pt(k, k % 2 ? r * 0.45 : r), pt(k + 1, (k + 1) % 2 ? r * 0.45 : r), k % 2 ? lo : hi, a, k % 2 ? lo : hi, k % 2 ? hi : lo);
}

function drawVector(f: Frame, S: Spec, x: number, y: number, r: number, rot: number, flipCos: number, col: RGB, a: number, i: number, t: number): void {
  const sq = Math.max(S.flip ? 0.14 : 1, S.flip ? Math.abs(flipCos) : 1), side = flipCos >= 0 ? 1 : 0.72;
  switch (S.shape) {
    case 'coin': {
      const rim: RGB = [col[0] * 0.62, col[1] * 0.5, col[2] * 0.2], face: RGB = [col[0], col[1] * 0.92, Math.min(1, col[2] + 0.1)], shine: RGB = [1, 0.97, 0.78];
      ellipsePoly(f.polys, x, y + r * 0.1 * (1 - sq), r * sq, r, rot, rim, a);
      ellipsePoly(f.polys, x, y, r * 0.82 * sq, r * 0.82, rot, side === 1 ? face : [face[0] * 0.85, face[1] * 0.8, face[2] * 0.7], a);
      if (sq > 0.5) ellipsePoly(f.polys, x - r * 0.18 * sq, y - r * 0.2, r * 0.3 * sq, r * 0.36, rot, shine, a * 0.8 * (sq - 0.4));
      if (S.flip && sq > 0.94) f.additive.push({ x: x - r * 0.2, y: y - r * 0.2, hw: r * 1.7, hh: r * 1.7, rot: 0.4, type: 2, color: shine, intensity: a * (sq - 0.94) / 0.06 });
      break;
    }
    case 'gem': gem(f.polys, x, y, r, rot * 0.3, sq, col, a); if (sq > 0.88) f.additive.push({ x: x - r * 0.3, y: y - r * 0.4, hw: r * 2.4, hh: r * 2.4, rot: 0, type: 2, color: [1, 1, 1], intensity: a * (sq - 0.88) / 0.12 }); break;
    case 'star': star(f.polys, x, y, r, rot, sq, col, a); break;
    case 'confetti': quadPoly(f.polys, x, y, r * 0.5 * sq, r * 0.9, rot, [col[0] * side, col[1] * side, col[2] * side], a); break;
    case 'leaf': {
      ellipsePoly(f.polys, x, y, r * 0.5 * sq, r, rot, [col[0] * side, col[1] * side, col[2] * side], a, 10);
      quadPoly(f.polys, x, y, r * 0.04, r * 0.9, rot, [Math.min(1, col[0] + 0.25), Math.min(1, col[1] + 0.2), col[2] * 0.7], a * 0.7);
      break;
    }
    case 'petal': {
      const c2: RGB = [col[0] * side, col[1] * side, col[2] * side];
      ellipsePoly(f.polys, x, y, r * 0.55 * sq, r * 0.85, rot, c2, a, 10);
      ellipsePoly(f.polys, x, y - r * 0.15, r * 0.25 * sq, r * 0.4, rot, [Math.min(1, col[0] + 0.1), Math.min(1, col[1] + 0.25), Math.min(1, col[2] + 0.2)], a * 0.7, 8);
      break;
    }
    case 'bubble': {
      f.additive.push({ x, y, hw: r, hh: r, rot: 0, type: 1, color: col, intensity: 0.9 * a, e1: 0.12 });
      ellipsePoly(f.polys, x, y, r * 0.95, r * 0.95, 0, [col[0] * 0.6, col[1] * 0.75, col[2]], a * 0.16, 14);
      f.additive.push({ x: x - r * 0.3, y: y - r * 0.35, hw: r * 0.4, hh: r * 0.4, rot: 0, type: 0, color: [1, 1, 1], intensity: 0.8 * a, e1: 2 });
      break;
    }
    case 'spark': f.additive.push({ x, y, hw: r * 2.4, hh: r * 2.4, rot: 0, type: 0, color: col, intensity: 1.3 * a * (0.75 + 0.25 * Math.sin(t * 25 + i)), e1: 2 }); break;
  }
  if (S.glow > 0 && S.shape !== 'spark' && S.shape !== 'bubble') f.additive.push({ x, y, hw: r * 2.2, hh: r * 2.2, rot: 0, type: 0, color: col, intensity: S.glow * 0.45 * a, e1: 2.4 });
}

function build(f: Frame, t: number, p: PValues, ctx: EffectCtx, mode: Mode): void {
  const S = spec(p, mode, ctx), D = S.D;
  if (t < 0 || t >= D) return;
  const pics: IconDraw[] = [], obj = ctx.object;
  const arrivals: number[] = [];
  for (let i = 0; i < S.count; i++) {
    const L = launch(i, S, ctx.aspect), age = t - L.t0;
    const probe = S.ending === 'collect' ? simulate(L, Math.max(0, D - L.t0), S, i) : null;
    if (probe && probe.collectAt !== null) arrivals.push(L.t0 + probe.collectAt + FLIGHT);
    if (age < 0) continue;
    const sim = simulate(L, age, S, i);
    let x = sim.x, y = sim.y, alpha = 1, scale = 1;
    if (sim.collectAt !== null && S.ending === 'collect') {
      const u = clamp((age - sim.collectAt) / FLIGHT), e = easeInOutCubic(u), ctrlX = (x + S.meter.x) / 2 + L.dirSign * 0.16, ctrlY = Math.min(y, S.meter.y) - 0.18;
      const P0 = { x, y };
      x = (1 - e) * (1 - e) * P0.x + 2 * (1 - e) * e * ctrlX + e * e * S.meter.x;
      y = (1 - e) * (1 - e) * P0.y + 2 * (1 - e) * e * ctrlY + e * e * S.meter.y;
      scale = lerp(1, 0.5, e); alpha = 1 - smoothstep(0.9, 1, u);
      if (u >= 1) continue;
    } else {
      const life = Math.min(S.life, D - L.t0);
      if (S.ending === 'stay') alpha = 1 - smoothstep(D - 0.4, D, t); else alpha = 1 - smoothstep(Math.max(0.1, life - 0.45), life, age);
      if (alpha <= 0.003) continue;
    }
    alpha *= smoothstep(0, 0.05, age);
    if (y > 1.25 || x < -0.3 || x > ctx.aspect + 0.3) continue;
    const flipCos = Math.cos(age * L.spin * 1.7 + L.phase), rot = S.shape === 'coin' || S.shape === 'gem' ? Math.sin(age * 2.3 + L.phase) * 0.4 : age * L.spin * 0.35 + L.phase;
    const col = pieceColor(S, L.col), r = L.size * scale;
    if (obj?.tex) {
      const sq = S.flip ? Math.max(0.14, Math.abs(flipCos)) : 1;
      pics.push({ cx: x, cy: y, size: r * 2, rot: S.shape === 'coin' ? rot : age * L.spin * 0.25 + L.phase * 0.2, sx: sq, alpha, bright: S.flip ? (flipCos >= 0 ? 1 : 0.7) : 1, tint: isWhite(S.tint) ? undefined : S.tint });
      if (S.glow > 0) f.additive.push({ x, y, hw: r * 2.2, hh: r * 2.2, rot: 0, type: 0, color: S.natural, intensity: S.glow * 0.4 * alpha, e1: 2.4 });
    } else drawVector(f, S, x, y, r, rot, flipCos, col, alpha, i, age);
  }
  if (obj?.tex) drawIcons(f, obj, pics);
  if (S.ending === 'collect') {
    let pulse = 0;
    for (const a of arrivals) if (t >= a) pulse += Math.exp(-(t - a) * 11);
    pulse = Math.min(2.2, pulse);
    if (pulse > 0.02) {
      const col = S.shape === 'gem' ? [0.8, 0.9, 1] as RGB : mixRGB(S.natural, [1, 1, 1], 0.3);
      f.additive.push({ x: S.meter.x, y: S.meter.y, hw: 0.07 + 0.03 * pulse, hh: 0.07 + 0.03 * pulse, rot: 0, type: 3, color: col, intensity: 0.7 * pulse });
      f.additive.push({ x: S.meter.x, y: S.meter.y, hw: 0.12, hh: 0.12, rot: 0, type: 2, color: col, intensity: 0.5 * Math.min(1, pulse) });
    }
  }
}

const dur = (def: number, max = 10) => num('duration', 'Length', G('Timing'), def, 0.8, max, 0.01, 's', 'Total length: every piece is gone by the end.');
const seedP = (def = 5) => num('seed', 'Variation', G('Look'), def, 1, 99, 1, '', 'Pick a different arrangement.', true);
const where = (x: number, y: number) => [
  num('cx', 'Start X', G('Position'), x, 0, 1, 0.001, '', 'Where the pieces start, as a fraction of the stage width. Aim the effect at a picture to start from that picture.'),
  num('cy', 'Start Y', G('Position'), y, 0, 1.2, 0.001, '', 'Where the pieces start, as a fraction of the stage height.'),
];
const look = (shape: string, size: number, tint?: string) => [
  enm('shape', 'Pieces', G('Look'), shape, SHAPES, 'What the pieces look like. Aim the effect at a picture to use your own picture instead.'),
  enm('palette', 'Jewels', G('Look'), 'rainbow', PALETTES, 'Which jewels, when the pieces are gems.'),
  color('tint', 'Colour', G('Look'), tint ?? '#ffffff', 'Colour of the pieces. White keeps each shape\'s natural colour (gold coins, green leaves, …) and leaves your own picture as it is.'),
  num('pieceSize', 'Piece size', G('Look'), size, 0.01, 0.2, 0.001, '', 'Size of one piece, in stage heights.'),
  num('sizeVar', 'Size variety', G('Look'), 0.25, 0, 0.8, 0.01, '', 'How much the sizes differ.'),
  num('glow', 'Glow', G('Look'), 0.25, 0, 1.5, 0.01, 'x', 'A soft halo around every piece that feeds the bloom.'),
  { kind: 'boolean', key: 'flip', label: 'Turn over in the air', section: 'Effect', group: 'Look', default: true, description: 'Coins and gems turn face-on and edge-on as they spin.' } as never,
];
const motion = (speed: number, gravity: number, drag: number, spin: number) => [
  num('speed', 'Speed', G('Motion'), speed, 0.02, 3, 0.01, '', 'Launch speed, in stage heights per second.'),
  num('gravity', 'Gravity', G('Motion'), gravity, -1, 4, 0.01, 'x', 'How hard the pieces are pulled down (negative floats them up).'),
  num('drag', 'Air drag', G('Motion'), drag, 0, 2, 0.01, '', 'How quickly the pieces slow down in the air.'),
  num('spin', 'Spin', G('Motion'), spin, 0, 14, 0.1, '', 'How fast the pieces turn.'),
];
const floorP = (def: number) => [
  num('floor', 'Floor', G('Floor'), def, 0.3, 1.2, 0.001, '', 'Height of the floor the pieces bounce on, as a fraction of the stage height (above 1 there is no floor).'),
  num('bounce', 'Bounce', G('Floor'), 0.42, 0, 0.9, 0.01, '', 'How much speed a piece keeps after hitting the floor.'),
];
const endingP = (def: string) => [
  enm('ending', 'At the end', G('Ending'), def, [['fade', 'Fade away'], ['collect', 'Fly to the meter'], ['stay', 'Stay until the end']], 'What the pieces do when their time is up.'),
  num('meterX', 'Meter X', G('Ending'), 0.9, 0, 1, 0.001, '', 'Where the balance meter is, as a fraction of the stage width.'),
  num('meterY', 'Meter Y', G('Ending'), 0.08, 0, 1, 0.001, '', 'Where the balance meter is, as a fraction of the stage height.'),
  num('collectAt', 'Collect at', G('Ending'), 0.55, 0.1, 0.9, 0.01, '', 'When the pieces set off for the meter, as a fraction of the length.'),
];

export const fountain: ShowEffect = {
  id: 'emit.fountain', name: 'Fountain', tagline: 'Coins, gems or your own pictures shoot up, tumble, bounce on a floor and, if you like, fly off to the balance meter.', category: 'candidate', usesObject: true, takesOver: true,
  params: [...where(0.5, 0.78), ...look('coin', 0.05), num('count', 'Pieces', G('Look'), 90, 4, 300, 1, 'count', 'How many pieces.', true), num('spread', 'Spread', G('Motion'), 58, 5, 170, 1, 'deg', 'Width of the fan the pieces shoot up in.'), ...motion(1.32, 1.7, 0.12, 6), ...floorP(0.93), ...endingP('collect'), num('life', 'Life', G('Motion'), 3.6, 0.5, 10, 0.01, 's', 'How long a piece lasts before it fades (when it does not fly to the meter).'), seedP(), dur(4.6)],
  duration: (p) => n(p, 'duration'), impactAt: () => 0,
  cues: (p) => [{ t: 0, kind: 'whoosh', gain: 0.45, dur: 0.5, pitch: 1.6 }, ...Array.from({ length: 10 }, (_, i) => ({ t: 0.7 + i * 0.13, kind: 'tick' as const, gain: 0.22, pitch: 2.2 + (i % 3) * 0.3 })), ...(s(p, 'ending') === 'collect' ? [{ t: n(p, 'duration') * n(p, 'collectAt') + 0.7, kind: 'sweep' as const, gain: 0.3, dur: 0.6, pitch: 2.6 }] : [])],
  build: (f, t, p, ctx) => build(f, t, p, ctx, 'fountain'),
};

export const burst: ShowEffect = {
  id: 'emit.burst', name: 'Particle burst', tagline: 'A pop of coins, stars, gems or your own pictures flying outward and falling away.', category: 'candidate', usesObject: true, takesOver: true,
  params: [...where(0.5, 0.5), ...look('star', 0.05), num('count', 'Pieces', G('Look'), 60, 4, 300, 1, 'count', 'How many pieces.', true), num('spread', 'Spread', G('Motion'), 360, 10, 360, 1, 'deg', 'Width of the fan the pieces fly in (360 = all around).'), num('direction', 'Direction', G('Motion'), -90, -180, 180, 1, 'deg', 'Where the middle of the fan points (−90 is up).'), ...motion(0.95, 0.9, 0.9, 5), ...floorP(1.15), ...endingP('fade'), num('life', 'Life', G('Motion'), 1.7, 0.3, 8, 0.01, 's', 'How long a piece lasts before it fades.'), seedP(), dur(2.4)],
  duration: (p) => n(p, 'duration'), impactAt: () => 0.02,
  cues: () => [{ t: 0.02, kind: 'shatter', gain: 0.4, dur: 0.5, pitch: 2.2 }],
  build: (f, t, p, ctx) => build(f, t, p, ctx, 'burst'),
};

export const rain: ShowEffect = {
  id: 'emit.rain', name: 'Falling pieces', tagline: 'Coins, petals, leaves, confetti or your own pictures drift down across the whole screen.', category: 'candidate', usesObject: true, takesOver: true,
  params: [...where(0.5, 0.5), ...look('petal', 0.04), num('count', 'Pieces', G('Look'), 70, 4, 300, 1, 'count', 'How many pieces.', true), ...motion(0.38, 0.12, 0.25, 4), ...floorP(1.2), ...endingP('fade'), num('life', 'Life', G('Motion'), 6, 0.5, 12, 0.01, 's', 'How long a piece lasts before it fades.'), seedP(), dur(5)],
  duration: (p) => n(p, 'duration'), impactAt: () => 0,
  cues: () => [{ t: 0.1, kind: 'whoosh', gain: 0.15, dur: 1.5, pitch: 2 }],
  build: (f, t, p, ctx) => build(f, t, p, ctx, 'rain'),
};

export const rise: ShowEffect = {
  id: 'emit.rise', name: 'Rising pieces', tagline: 'Bubbles, sparks, petals or your own pictures float up from a spot and drift away.', category: 'candidate', usesObject: true, takesOver: true,
  params: [...where(0.5, 0.8), num('areaWidth', 'Area width', G('Position'), 0.5, 0.02, 1.8, 0.01, '', 'How wide the pieces start spread out, in stage heights.'), ...look('bubble', 0.035), num('count', 'Pieces', G('Look'), 40, 4, 300, 1, 'count', 'How many pieces.', true), ...motion(0.2, -0.04, 0.2, 2), ...floorP(1.2), ...endingP('fade'), num('life', 'Life', G('Motion'), 3.6, 0.5, 12, 0.01, 's', 'How long a piece lasts before it fades.'), seedP(), dur(4.6)],
  duration: (p) => n(p, 'duration'), impactAt: () => 0,
  cues: () => [{ t: 0.1, kind: 'tick', gain: 0.1, pitch: 2.8 }],
  build: (f, t, p, ctx) => build(f, t, p, ctx, 'rise'),
};

export const EMITTERS: ShowEffect[] = [fountain, burst, rain, rise];
void easeOutCubic;
