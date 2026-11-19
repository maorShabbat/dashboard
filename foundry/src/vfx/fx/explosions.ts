/**
 * Explosions, fire, smoke and particle bursts for symbols. Each effect takes over the symbol it works on (the symbol's own draw is
 * hidden from the effect's start), can work on the icon's own pixels or fill the whole square cell, and can take the frame with it
 * (the player composes the frame and the icon into one picture first). Every effect is empty at its last frame.
 */
import { color, enm, num } from '../../core/params';
import { FIRE_PALETTES, type Frame, type RGB } from '../engine/frame';
import { clamp, easeInQuad, easeOutCubic, easeOutQuart, h1, hex, lerp, mixRGB, smoothstep } from '../engine/math';
import { n, s, type PValues, type ShowEffect } from './effect';
import { blast, debris, embers, emitAt, flash, reach, ring, sparks, swell, type Blast } from './blast';
import { drawIcon } from './helpers';
import { ICON_FX } from '../engine/frame';
import { fireball, flame, setVolPalette, smokePuff } from './volume';

export const G = (group: string) => ({ section: 'Effect', group });
export const base = () => [
  num('cx', 'Icon X', G('Icon'), 0.5, 0, 1, 0.001, '', 'Horizontal centre of the icon, as a fraction of the stage width.'),
  num('cy', 'Icon Y', G('Icon'), 0.55, 0, 1, 0.001, '', 'Vertical centre of the icon, as a fraction of the stage height.'),
  num('size', 'Icon size', G('Icon'), 0.3, 0.05, 0.9, 0.005, '', 'Length of the icon\'s longest side, in stage heights.'),
];
export const areaP = (def = 'icon') => enm('area', 'Fills', G('Area'), def, [['icon', 'The icon only'], ['cell', 'The whole square, frame included']], 'Whether the effect follows the icon\'s own pixels or fills the square cell around it.');
export const cellP = () => num('cell', 'Square size', G('Area'), 1.15, 0.8, 2.4, 0.01, 'x', 'Side of the symbol square as a multiple of the icon size (used when the effect fills the square).');
export const fireP = (def = 'fire') => enm('fire', 'Fire colour', G('Look'), def, [['fire', 'Orange fire'], ['blue', 'Blue flame'], ['green', 'Green fire'], ['violet', 'Violet fire'], ['white', 'White-hot']], 'The colour of the flames and the fireball.');
export const smokeP = (def = 'grey') => enm('smoke', 'Smoke', G('Look'), def, [['grey', 'Grey'], ['black', 'Black soot'], ['white', 'White steam'], ['toxic', 'Toxic green'], ['ice', 'Cold mist'], ['purple', 'Magic purple'], ['sand', 'Dust']], 'The colour of the smoke.');
export const strengthP = (def = 1) => num('strength', 'Strength', G('Look'), def, 0.3, 2, 0.01, 'x', 'How big and bright the blast is.');
export const dur = (def: number, min = 0.8, max = 4) => num('duration', 'Duration', G('Timing'), def, min, max, 0.01, 's', 'Total length, from the first moment until nothing is left.');
export const buildP = (def: number) => num('buildup', 'Build-up', G('Timing'), def, 0.05, 0.8, 0.005, 's', 'Time the symbol swells before it goes.');

export const hot = (p: PValues): RGB => { const pal = FIRE_PALETTES[s(p, 'fire')] ?? FIRE_PALETTES.fire!; return mixRGB(pal[2]!, pal[1]!, 0.4); };
export const white = (p: PValues): RGB => mixRGB(hot(p), [1, 1, 1], 0.55);

/** Smoke that rises from emit points, grows and thins out; the smoke nearest the blast is lit by it. */
export function risingSmoke(f: Frame, b: Blast, sec: number, start: number, life: number, count: number, size: number, rise: number, seed: number, alpha = 0.95, warm = 1, spread = 0.35, soft = 0): void {
  for (let i = 0; i < count; i++) {
    const s0 = start + h1(seed + i * 3) * life * spread, tl = sec - s0, li = life - s0;
    if (tl <= 0 || li <= 0) continue;
    const age = tl / li;
    const o = emitAt(b, h1(seed + i * 3 + 1), h1(seed + i * 3 + 2));
    const sz = size * lerp(0.55, 1.15, h1(seed + i * 11)) * (0.45 + 0.55 * easeOutCubic(tl / 0.7)) * (1 + 0.55 * age);
    smokePuff(f, {
      x: o.x + Math.sin(tl * 1.3 + i * 2.1) * 0.02 + (h1(seed + i * 5) - 0.5) * 0.05 * tl, y: o.y - rise * (1 - Math.exp(-tl * 1.3)) * (0.5 + h1(seed + i * 7)),
      size: sz, age, seed: seed + i * 1.37, t: tl, alpha: alpha * smoothstep(0, 0.14, tl) * (1 - smoothstep(0.75, 1, age)), heat: warm * Math.exp(-tl * 2.6), light: [0.35, -0.85], soft,
    });
  }
}

// ---------------------------------------------------------------------------------------------------------------------

export const fireballFx: ShowEffect = {
  id: 'destroy.fireball', name: 'Fireball', tagline: 'The symbol swells white-hot, then erupts in a rolling fireball with a flash, a shock ring, flying debris, sparks and black smoke.', category: 'candidate', usesObject: true, takesOver: true,
  params: [...base(), areaP(), cellP(), fireP(), smokeP('black'), strengthP(), buildP(0.2), num('debris', 'Debris', G('Look'), 22, 0, 60, 1, 'count', 'Pieces of the symbol thrown outward.', true), dur(2.4)],
  duration: (p) => n(p, 'duration'),
  impactAt: (p) => n(p, 'buildup'),
  cues: (p) => [{ t: 0, kind: 'sweep', gain: 0.3, dur: n(p, 'buildup'), pitch: 1.5 }, { t: n(p, 'buildup'), kind: 'thump', gain: 1 }, { t: n(p, 'buildup'), kind: 'rumble', gain: 0.8, dur: 1.2 }, { t: n(p, 'buildup') + 0.02, kind: 'shatter', gain: 0.5, dur: 0.5 }],
  build(f, t, p, ctx) {
    const b = blast(p, ctx), D = n(p, 'duration');
    if (!b || t < 0 || t >= D) return;
    setVolPalette(f, s(p, 'fire'), s(p, 'smoke'));
    const tb = n(p, 'buildup'), k = n(p, 'strength'), col = hot(p);
    if (swell(f, b, t, tb, col, 0.18)) return;
    const sec = t - tb, life = D - tb, R = reach(b) * k;
    // flash, ring and a real shove of whatever is behind
    flash(f, b.Cx, b.Cy, R * 0.85, white(p), Math.exp(-sec * 12));
    ring(f, b.Cx, b.Cy, R * (0.6 + 2.2 * easeOutQuart(sec / 0.5)), col, 1 - smoothstep(0, 0.5, sec), 0.08);
    const front = easeOutCubic(sec / 0.55) * R * 2.4;
    f.shocks.push({ cx: b.Cx, cy: b.Cy, radius: front, width: 0.07 + 0.12 * (sec / 0.55), amp: 0.03 * k * (1 - smoothstep(0, 0.6, sec)), pinchR: 0, pinchK: 0, light: 0.25, color: col, split: 0, life: 1 - smoothstep(0.15, 0.6, sec), strainLight: 0.2 });
    // the fireballs: one big rolling ball and a few smaller ones inside it
    const age = clamp(sec / (life * 0.72));
    fireball(f, { x: b.Cx, y: b.Cy - R * 0.1 * easeOutCubic(sec / 1.2), size: R * (0.35 + 0.75 * easeOutCubic(sec / 0.42)) * (1 + 0.2 * age), age, seed: 3.1, t: sec, heat: 1, alpha: 1 - smoothstep(0.8, 1, age) });
    for (let i = 0; i < 5; i++) {
      const st = 0.03 + h1(i + 9) * 0.2, tl = sec - st, li = life * 0.55;
      if (tl <= 0) continue;
      const o = emitAt(b, h1(i * 5 + 40), h1(i * 5 + 41)), a2 = tl / li;
      fireball(f, { x: o.x, y: o.y - R * 0.2 * easeOutCubic(tl / 0.9), size: R * lerp(0.28, 0.5, h1(i + 21)) * (0.3 + 0.8 * easeOutCubic(tl / 0.35)), age: a2, seed: 10 + i * 4.7, t: tl, heat: 0.95, alpha: 1 - smoothstep(0.75, 1, a2) });
    }
    if (n(p, 'debris') > 0) debris(f, b, { pieces: Math.round(n(p, 'debris')), force: 0.55 * k, gravity: 0.7, since: sec, life: Math.min(1.4, life * 0.7), shade: 0.8, glint: 0.5 });
    sparks(f, b, t, tb, 1.0, 34, col, 0.95 * k, 0.9, 61);
    risingSmoke(f, b, sec, 0.12, life * 0.98, b.area === 'cell' ? 9 : 7, R * 0.62, 0.34 * k, 83);
    embers(f, b, t, tb + 0.1, 1.5, 24, col, 0.3, 91);
    f.camera.dy += Math.sin(sec * 90) * 0.006 * k * Math.exp(-sec * 9);
    f.exposure *= 1 + 0.06 * Math.exp(-sec * 10);
  },
};


// ---------------------------------------------------------------------------------------------------------------------
// Fire family

export const inferno: ShowEffect = {
  id: 'destroy.inferno', name: 'Engulfed in flames', tagline: 'Flames rise and lick over the symbol until it burns away, then die back to embers and thin smoke.', category: 'candidate', usesObject: true, takesOver: true,
  params: [...base(), areaP(), cellP(), fireP(), smokeP('black'), strengthP(), num('flames', 'Flames', G('Look'), 8, 3, 16, 1, 'count', 'Number of flame tongues.', true), dur(2.8)],
  duration: (p) => n(p, 'duration'),
  impactAt: () => 0.1,
  cues: (p) => [{ t: 0, kind: 'whoosh', gain: 0.6, dur: n(p, 'duration') * 0.6, pitch: 0.7 }, { t: 0.05, kind: 'rumble', gain: 0.4, dur: n(p, 'duration') * 0.7 }],
  build(f, t, p, ctx) {
    const b = blast(p, ctx), D = n(p, 'duration');
    if (!b || t < 0 || t >= D) return;
    setVolPalette(f, s(p, 'fire'), s(p, 'smoke'));
    const k = n(p, 'strength'), col = hot(p), u = t / D;
    const burn = smoothstep(0.1, 0.6, u);
    if (burn < 1) drawIcon(f, b.obj, { cx: b.Cx, cy: b.Cy, size: b.size, bright: 1 + 0.25 * Math.sin(Math.PI * burn), fx: { mode: ICON_FX.burn, progress: burn * 0.97, seed: 3.7, p: 0, color: col } });
    const N = Math.round(n(p, 'flames')), baseY = b.area === 'cell' ? b.Cy + b.half * 0.95 : b.Cy + b.H * 0.42, span = b.area === 'cell' ? b.half * 1.9 : b.W * 1.05, tall = (b.area === 'cell' ? b.half * 2.1 : b.H * 1.25) * k;
    for (let i = 0; i < N; i++) {
      const s0 = 0.02 + h1(i + 5) * 0.16, die = 0.58 + h1(i + 15) * 0.12, tl = t - s0 * D;
      if (tl <= 0) continue;
      const grow = easeOutCubic(tl / 0.55), age = clamp((u - die) / (0.92 - die));
      const x = b.Cx + ((i + 0.5) / N - 0.5) * span + (h1(i + 25) - 0.5) * span * 0.12;
      const w = (b.area === 'cell' ? b.half * 0.7 : b.W * 0.42) * lerp(0.8, 1.25, h1(i + 35)) * k, hh = tall * lerp(0.7, 1.15, h1(i + 45)) * grow * (1 - 0.5 * age);
      flame(f, { x, y: baseY, w, h: hh, age, seed: 7 + i * 3.3, t: tl, heat: Math.min(1, tl / 0.3), alpha: 1 - smoothstep(0.8, 1, age) });
      if (i % 2 === 0) flame(f, { x: x + w * 0.25, y: baseY, w: w * 0.6, h: hh * 0.62, age: Math.min(1, age + 0.1), seed: 70 + i * 2.1, t: tl * 1.2, heat: 1, alpha: 1 - smoothstep(0.8, 1, age) });
    }
    f.additive.push({ x: b.Cx, y: b.Cy, hw: reach(b) * 1.5, hh: reach(b) * 1.5, rot: 0, type: 0, color: col, intensity: 0.5 * Math.sin(Math.PI * clamp(u / 0.85)), e1: 1.3 });
    embers(f, b, t, 0.2 * D, D * 0.7, 36, col, 0.4, 111);
    risingSmoke(f, b, t - 0.35 * D, 0, D * 0.62, b.area === 'cell' ? 7 : 5, reach(b) * 0.55, 0.3, 131, 0.55, 0.5);
  },
};

export const bomb: ShowEffect = {
  id: 'destroy.bomb', name: 'Bomb blast', tagline: 'A huge flash and fireball, a shove through the picture, debris and sparks, and a mushroom of black smoke.', category: 'candidate', usesObject: true, takesOver: true,
  params: [...base(), areaP('cell'), cellP(), fireP(), smokeP('black'), strengthP(1), buildP(0.14), num('debris', 'Debris', G('Look'), 36, 0, 60, 1, 'count', 'Pieces of the symbol thrown outward.', true), dur(3)],
  duration: (p) => n(p, 'duration'),
  impactAt: (p) => n(p, 'buildup'),
  cues: (p) => [{ t: 0, kind: 'sweep', gain: 0.3, dur: n(p, 'buildup'), pitch: 1.8 }, { t: n(p, 'buildup'), kind: 'thump', gain: 1 }, { t: n(p, 'buildup'), kind: 'rumble', gain: 1, dur: 1.8 }, { t: n(p, 'buildup') + 0.03, kind: 'shatter', gain: 0.7, dur: 0.7 }],
  build(f, t, p, ctx) {
    const b = blast(p, ctx), D = n(p, 'duration');
    if (!b || t < 0 || t >= D) return;
    setVolPalette(f, s(p, 'fire'), s(p, 'smoke'));
    const tb = n(p, 'buildup'), k = n(p, 'strength'), col = hot(p);
    if (swell(f, b, t, tb, col, 0.25)) return;
    const sec = t - tb, life = D - tb, R = reach(b) * k * 1.3;
    flash(f, b.Cx, b.Cy, R * 1.5, white(p), Math.exp(-sec * 9));
    f.additive.push({ x: b.Cx, y: b.Cy, hw: 1.6, hh: 1.6, rot: 0, type: 0, color: white(p), intensity: 1.4 * Math.exp(-sec * 16), e1: 0.3 });
    ring(f, b.Cx, b.Cy, R * (0.5 + 3 * easeOutQuart(sec / 0.6)), col, 1 - smoothstep(0, 0.6, sec), 0.07);
    f.shocks.push({ cx: b.Cx, cy: b.Cy, radius: easeOutCubic(sec / 0.7) * R * 4, width: 0.09 + 0.16 * (sec / 0.7), amp: 0.06 * k * (1 - smoothstep(0, 0.7, sec)), pinchR: 0.5, pinchK: 0.5 * Math.exp(-sec * 12), light: 0.3, color: col, split: 0.4, life: 1 - smoothstep(0.2, 0.7, sec), strainLight: 0.25 });
    const age = clamp(sec / (life * 0.62));
    fireball(f, { x: b.Cx, y: b.Cy - R * 0.12 * easeOutCubic(sec / 1.4), size: R * (0.3 + 0.85 * easeOutCubic(sec / 0.4)) * (1 + 0.3 * age), age, seed: 5.5, t: sec, heat: 1, alpha: 1 - smoothstep(0.82, 1, age) });
    for (let i = 0; i < 8; i++) {
      const st = 0.02 + h1(i + 9) * 0.25, tl = sec - st, li = life * 0.5;
      if (tl <= 0) continue;
      const o = emitAt(b, h1(i * 5 + 40), h1(i * 5 + 41)), a2 = tl / li;
      fireball(f, { x: o.x, y: o.y - R * 0.25 * easeOutCubic(tl / 0.9), size: R * lerp(0.3, 0.55, h1(i + 21)) * (0.3 + 0.8 * easeOutCubic(tl / 0.35)), age: a2, seed: 20 + i * 4.7, t: tl, heat: 0.95, alpha: 1 - smoothstep(0.75, 1, a2) });
    }
    if (n(p, 'debris') > 0) debris(f, b, { pieces: Math.round(n(p, 'debris')), force: 0.95 * k, gravity: 0.8, since: sec, life: Math.min(1.6, life * 0.6), shade: 0.8, glint: 0.4 });
    sparks(f, b, t, tb, 1.2, 60, col, 1.2 * k, 0.9, 61);
    // the mushroom: a rising stem of puffs and a cap that rolls outward at the top
    const rise = easeOutCubic(sec / 1.6) * R * 2.3, sm = life * 0.98;
    for (let i = 0; i < 6; i++) {
      const s0 = 0.18 + i * 0.07, tl = sec - s0, li = sm - s0;
      if (tl <= 0) continue;
      const a2 = tl / li, yy = b.Cy - rise * (0.15 + 0.85 * (i / 5)) * easeOutCubic(tl / 1.1);
      smokePuff(f, { x: b.Cx + Math.sin(tl * 1.7 + i) * R * 0.08, y: yy, size: R * lerp(0.42, 0.34, i / 5) * (0.5 + 0.5 * easeOutCubic(tl / 0.6)) * (1 + 0.4 * a2), age: a2, seed: 301 + i * 2.3, t: tl, alpha: 0.95 * smoothstep(0, 0.12, tl) * (1 - smoothstep(0.78, 1, a2)), heat: Math.exp(-tl * 2.2), light: [0.3, -0.9] });
    }
    for (let i = 0; i < 9; i++) {
      const s0 = 0.4 + h1(i + 71) * 0.12, tl = sec - s0, li = sm - s0;
      if (tl <= 0) continue;
      const a2 = tl / li, ang = (i / 9) * Math.PI * 2, spread = R * (0.25 + 0.75 * easeOutCubic(tl / 1.2)) * 0.85;
      smokePuff(f, { x: b.Cx + Math.cos(ang) * spread, y: b.Cy - rise * 1.02 + Math.sin(ang) * spread * 0.4, size: R * 0.36 * (0.5 + 0.5 * easeOutCubic(tl / 0.7)) * (1 + 0.5 * a2), age: a2, seed: 401 + i * 3.1, t: tl, alpha: 0.9 * smoothstep(0, 0.15, tl) * (1 - smoothstep(0.78, 1, a2)), heat: 0.3 * Math.exp(-tl * 2.2), light: [0.3, -0.9] });
    }
    embers(f, b, t, tb + 0.1, 1.8, 36, col, 0.4, 91);
    f.camera.dx += Math.sin(sec * 80) * 0.012 * k * Math.exp(-sec * 5); f.camera.dy += Math.cos(sec * 71) * 0.01 * k * Math.exp(-sec * 5);
    f.exposure *= 1 + 0.12 * Math.exp(-sec * 8);
  },
};

export const chain: ShowEffect = {
  id: 'destroy.chain', name: 'Chain reaction', tagline: 'Small blasts pop across the symbol one after another, faster and faster, until the last one takes it apart.', category: 'candidate', usesObject: true, takesOver: true,
  params: [...base(), areaP('cell'), cellP(), fireP(), smokeP('grey'), strengthP(), num('blasts', 'Small blasts', G('Look'), 8, 3, 14, 1, 'count', 'Number of small blasts before the big one.', true), dur(2.8)],
  duration: (p) => n(p, 'duration'),
  impactAt: () => 1.0,
  cues: (p) => { const N = Math.round(n(p, 'blasts')); return [...Array.from({ length: N }, (_, i) => ({ t: 0.1 + i * 0.12, kind: 'thump' as const, gain: 0.35 + 0.04 * i, pitch: 1.4 - i * 0.04 })), { t: 0.1 + N * 0.12, kind: 'thump' as const, gain: 1 }, { t: 0.1 + N * 0.12, kind: 'rumble' as const, gain: 0.8, dur: 1.4 }]; },
  build(f, t, p, ctx) {
    const b = blast(p, ctx), D = n(p, 'duration');
    if (!b || t < 0 || t >= D) return;
    setVolPalette(f, s(p, 'fire'), s(p, 'smoke'));
    const N = Math.round(n(p, 'blasts')), k = n(p, 'strength'), col = hot(p), R = reach(b) * k;
    const times: number[] = []; let tt = 0.1;
    for (let i = 0; i < N; i++) { times.push(tt); tt += 0.17 - 0.09 * (i / Math.max(1, N - 1)); }
    const tLast = tt + 0.05;
    if (t < tLast) {
      const hits = times.filter((x) => x <= t).length, last = hits ? times[hits - 1]! : -1;
      const sh = 0.012 * (hits / N), pulse = last >= 0 ? Math.exp(-(t - last) * 22) : 0;
      drawIcon(f, b.obj, { cx: b.Cx + Math.sin(t * 90) * sh, cy: b.Cy + Math.cos(t * 77) * sh, size: b.size, bright: 1 + 0.5 * (hits / N) + 0.9 * pulse, tint: [1, 1 - 0.15 * (hits / N), 1 - 0.35 * (hits / N)] });
    }
    times.forEach((ts, i) => {
      const tl = t - ts;
      if (tl <= 0 || tl > 1.4) return;
      const o = emitAt(b, h1(i * 7 + 3), h1(i * 7 + 4)), a2 = clamp(tl / 0.7);
      flash(f, o.x, o.y, R * 0.28, white(p), Math.exp(-tl * 18));
      fireball(f, { x: o.x, y: o.y - R * 0.12 * easeOutCubic(tl / 0.6), size: R * lerp(0.22, 0.34, h1(i + 2)) * (0.35 + 0.75 * easeOutCubic(tl / 0.22)), age: a2, seed: 31 + i * 5.3, t: tl, heat: 0.95, alpha: 1 - smoothstep(0.7, 1, a2) });
      smokePuff(f, { x: o.x, y: o.y - R * 0.3 * easeOutCubic(tl / 1.2), size: R * 0.3 * (0.4 + 0.6 * easeOutCubic(tl / 0.5)) * (1 + 0.4 * clamp(tl / 1.4)), age: clamp(tl / 1.4), seed: 61 + i * 2.9, t: tl, alpha: 0.7 * (1 - smoothstep(0.7, 1, clamp(tl / 1.4))), heat: Math.exp(-tl * 3), light: [0.3, -0.9] });
    });
    const sec = t - tLast;
    if (sec >= 0) {
      const life = D - tLast, age = clamp(sec / (life * 0.7));
      flash(f, b.Cx, b.Cy, R * 1.0, white(p), Math.exp(-sec * 10));
      ring(f, b.Cx, b.Cy, R * (0.6 + 2.4 * easeOutQuart(sec / 0.5)), col, 1 - smoothstep(0, 0.5, sec), 0.08);
      f.shocks.push({ cx: b.Cx, cy: b.Cy, radius: easeOutCubic(sec / 0.55) * R * 2.6, width: 0.07 + 0.1 * (sec / 0.55), amp: 0.035 * k * (1 - smoothstep(0, 0.6, sec)), pinchR: 0, pinchK: 0, light: 0.25, color: col, split: 0, life: 1 - smoothstep(0.15, 0.6, sec), strainLight: 0.2 });
      fireball(f, { x: b.Cx, y: b.Cy - R * 0.1 * easeOutCubic(sec / 1.2), size: R * (0.4 + 0.75 * easeOutCubic(sec / 0.42)) * (1 + 0.2 * age), age, seed: 9.9, t: sec, heat: 1, alpha: 1 - smoothstep(0.8, 1, age) });
      debris(f, b, { pieces: 30, force: 0.7 * k, gravity: 0.8, since: sec, life: Math.min(1.4, life * 0.65), shade: 0.8, glint: 0.4 });
      sparks(f, b, t, tLast, 1.0, 40, col, 1.0 * k, 0.9, 71);
      risingSmoke(f, b, sec, 0.1, life * 0.98, 7, R * 0.6, 0.32 * k, 85);
      f.camera.dx += Math.sin(sec * 85) * 0.008 * k * Math.exp(-sec * 8);
    }
  },
};

export const flameBurst: ShowEffect = {
  id: 'destroy.flame-burst', name: 'Flame burst', tagline: 'The symbol turns white-hot and tongues of flame shoot out in every direction around a small fireball.', category: 'candidate', usesObject: true, takesOver: true,
  params: [...base(), areaP(), cellP(), fireP(), smokeP('grey'), strengthP(), buildP(0.22), num('tongues', 'Flame tongues', G('Look'), 12, 5, 24, 1, 'count', 'Number of flames thrown outward.', true), dur(2)],
  duration: (p) => n(p, 'duration'),
  impactAt: (p) => n(p, 'buildup'),
  cues: (p) => [{ t: 0, kind: 'sweep', gain: 0.3, dur: n(p, 'buildup'), pitch: 1.4 }, { t: n(p, 'buildup'), kind: 'whoosh', gain: 0.9, dur: 0.8, pitch: 0.8 }, { t: n(p, 'buildup'), kind: 'thump', gain: 0.8 }],
  build(f, t, p, ctx) {
    const b = blast(p, ctx), D = n(p, 'duration');
    if (!b || t < 0 || t >= D) return;
    setVolPalette(f, s(p, 'fire'), s(p, 'smoke'));
    const tb = n(p, 'buildup'), k = n(p, 'strength'), col = hot(p);
    if (swell(f, b, t, tb, col, 0.15)) return;
    const sec = t - tb, life = D - tb, R = reach(b) * k, N = Math.round(n(p, 'tongues'));
    flash(f, b.Cx, b.Cy, R * 0.8, white(p), Math.exp(-sec * 12));
    for (let i = 0; i < N; i++) {
      const ang = (i / N) * Math.PI * 2 + (h1(i + 3) - 0.5) * 0.35, s0 = h1(i + 13) * 0.08, tl = sec - s0;
      if (tl <= 0) continue;
      const age = clamp(tl / (life * lerp(0.4, 0.6, h1(i + 23)))), len = R * lerp(1.4, 2.4, h1(i + 33)) * easeOutCubic(tl / 0.4) * (1 - 0.35 * age);
      const bx = b.Cx + Math.cos(ang) * R * 0.18, by = b.Cy + Math.sin(ang) * R * 0.18;
      flame(f, { x: bx, y: by, w: R * lerp(0.5, 0.8, h1(i + 43)), h: len, age, seed: 5 + i * 2.7, t: tl, heat: 1, alpha: 1 - smoothstep(0.75, 1, age), rot: ang + Math.PI / 2 });
    }
    const age = clamp(sec / (life * 0.5));
    fireball(f, { x: b.Cx, y: b.Cy, size: R * (0.3 + 0.55 * easeOutCubic(sec / 0.3)), age, seed: 4.4, t: sec, heat: 1, alpha: 1 - smoothstep(0.8, 1, age) });
    ring(f, b.Cx, b.Cy, R * (0.5 + 2 * easeOutQuart(sec / 0.45)), col, 1 - smoothstep(0, 0.45, sec), 0.08);
    sparks(f, b, t, tb, 0.9, 28, col, 0.9 * k, 0.5, 51);
    risingSmoke(f, b, sec, 0.25, life * 0.98, 5, R * 0.5, 0.28, 63, 0.7, 0.6);
    embers(f, b, t, tb + 0.1, 1.2, 20, col, 0.3, 77);
  },
};

export const EXPLOSIONS: ShowEffect[] = [fireballFx, inferno, bomb, chain, flameBurst];
void drawIcon; void easeInQuad; void lerp; void hex;
