/**
 * Smoke, particle, ice, acid and lightning endings for symbols. Same contract as the fire family (explosions.ts): each effect takes
 * over the symbol it works on, can follow the icon's own pixels or fill the whole square cell, and is empty at its last frame.
 */
import { makeRng } from '../../core/util/prng';
import { color, enm, num } from '../../core/params';
import { ICON_FX, type Frame, type RGB } from '../engine/frame';
import { discharge, ribbon, slice } from '../engine/lightning';
import { clamp, easeOutCubic, easeOutQuart, h1, hex, lerp, mixRGB, smoothstep } from '../engine/math';
import { n, s, type ShowEffect } from './effect';
import { blast, debris, embers, emitAt, flash, reach, ring, sparks, swell, type Blast } from './blast';
import { areaP, base, buildP, cellP, dur, fireP, G, hot, risingSmoke, smokeP, strengthP, white } from './explosions';
import { drawIcon, ellipsePoly, quadPoly, triPoly } from './helpers';
import { fireball, flame, setVolPalette, smokePuff } from './volume';

const GREY: RGB = [0.7, 0.7, 0.75];

/** A soft four-point glint, flickering. */
function glint(f: Frame, x: number, y: number, r: number, col: RGB, k: number): void {
  if (k <= 0.01) return;
  f.additive.push({ x, y, hw: r, hh: r, rot: 0.2, type: 2, color: col, intensity: 1.1 * k });
}

// ---------------------------------------------------------------------------------------------------------------------
// Smoke

export const smokeVanish: ShowEffect = {
  id: 'destroy.smoke-vanish', name: 'Vanish in smoke', tagline: 'Thick smoke billows out of the symbol and swallows it; when the smoke thins out the symbol is gone.', category: 'candidate', usesObject: true, takesOver: true,
  params: [...base(), areaP(), cellP(), smokeP('grey'), strengthP(), num('puffs', 'Puffs', G('Look'), 14, 4, 28, 1, 'count', 'How many clouds of smoke.', true), dur(2.4)],
  duration: (p) => n(p, 'duration'),
  impactAt: () => 0.25,
  cues: () => [{ t: 0, kind: 'whoosh', gain: 0.5, dur: 0.8, pitch: 0.9 }, { t: 0.05, kind: 'thump', gain: 0.35, pitch: 0.7 }],
  build(f, t, p, ctx) {
    const b = blast(p, ctx), D = n(p, 'duration');
    if (!b || t < 0 || t >= D) return;
    setVolPalette(f, 'fire', s(p, 'smoke'));
    const k = n(p, 'strength'), R = reach(b) * k, u = t / D, gone = smoothstep(0.1, 0.4, u);
    if (gone < 1) drawIcon(f, b.obj, { cx: b.Cx, cy: b.Cy, size: b.size, bright: 1 - 0.3 * gone, alpha: 1 - smoothstep(0.7, 1, gone), fx: { mode: ICON_FX.dissolve, progress: gone, seed: 2.2, p: 0.3, color: [0.2, 0.2, 0.24] } });
    flash(f, b.Cx, b.Cy, R * 0.4, [0.75, 0.75, 0.85], 0.5 * Math.exp(-t * 14));
    risingSmoke(f, b, t, 0, D * 0.98, Math.round(n(p, 'puffs')), R * 1.0, 0.22 * k, 17, 0.95, 0, 0.16);
  },
};

export const smokeBomb: ShowEffect = {
  id: 'destroy.smoke-bomb', name: 'Smoke bomb', tagline: 'A pop, and a rolling cloud bursts outward in rings, hiding the symbol; the cloud lingers, then drifts away.', category: 'candidate', usesObject: true, takesOver: true,
  params: [...base(), areaP('cell'), cellP(), smokeP('grey'), strengthP(), dur(3)],
  duration: (p) => n(p, 'duration'),
  impactAt: () => 0.1,
  cues: () => [{ t: 0.08, kind: 'thump', gain: 0.8, pitch: 1.1 }, { t: 0.1, kind: 'whoosh', gain: 0.8, dur: 1.2, pitch: 0.7 }],
  build(f, t, p, ctx) {
    const b = blast(p, ctx), D = n(p, 'duration');
    if (!b || t < 0 || t >= D) return;
    setVolPalette(f, 'fire', s(p, 'smoke'));
    const k = n(p, 'strength'), R = reach(b) * k, L = D * 0.98;
    if (t < 0.32) drawIcon(f, b.obj, { cx: b.Cx, cy: b.Cy, size: b.size, bright: 1 + 0.6 * smoothstep(0, 0.1, t), alpha: 1 - smoothstep(0.14, 0.32, t) });
    const pop = Math.exp(-Math.max(0, t - 0.08) * 12) * smoothstep(0.04, 0.08, t);
    flash(f, b.Cx, b.Cy, R * 0.8, white({ fire: 'white' }), pop);
    ring(f, b.Cx, b.Cy, R * (0.4 + 2.1 * easeOutQuart((t - 0.08) / 0.5)), [0.85, 0.85, 0.9], (1 - smoothstep(0, 0.5, t - 0.08)) * (t > 0.08 ? 1 : 0), 0.1);
    f.shocks.push({ cx: b.Cx, cy: b.Cy, radius: easeOutCubic((t - 0.08) / 0.55) * R * 2.2, width: 0.08 + 0.1 * clamp((t - 0.08) / 0.55), amp: 0.02 * k * (1 - smoothstep(0, 0.55, t - 0.08)) * (t > 0.08 ? 1 : 0), pinchR: 0, pinchK: 0, light: 0.1, color: GREY, split: 0, life: t > 0.08 ? 1 - smoothstep(0.1, 0.55, t - 0.08) : 0, strainLight: 0.1 });
    const rings = 3;
    for (let r = 0; r < rings; r++) {
      const cnt = 7 + r * 5;
      for (let i = 0; i < cnt; i++) {
        const hh = (kk: number) => h1(r * 131 + i * 17 + kk);
        const a = ((i + hh(1) * 0.6) / cnt) * Math.PI * 2 + r * 0.45, s0 = 0.08 + r * 0.05 + hh(2) * 0.08, tl = t - s0, li = L - s0;
        if (tl <= 0 || li <= 0) continue;
        const age = tl / li, reachR = R * (0.5 + 0.38 * r) * lerp(0.85, 1.15, hh(3));
        const sp = reachR * (0.15 + 0.85 * easeOutCubic(tl / (0.8 + r * 0.15)));
        const sz = R * lerp(0.5, 0.78, hh(4)) * (0.4 + 0.6 * easeOutCubic(tl / 0.65)) * (1 + 0.4 * age);
        smokePuff(f, { x: b.Cx + Math.cos(a) * sp + Math.sin(tl * 0.9 + i) * 0.01, y: b.Cy + Math.sin(a) * sp * 0.82 - 0.2 * k * age - 0.05 * (1 - Math.exp(-tl)), size: sz, age, seed: 40 + r * 29 + i * 1.7, t: tl, alpha: 0.95 * smoothstep(0, 0.1, tl) * (1 - smoothstep(0.7, 1, age)), heat: 0, light: [0.35, -0.85] });
      }
    }
    for (let i = 0; i < 4; i++) {
      const s0 = 0.1 + i * 0.05, tl = t - s0, li = L - s0;
      if (tl <= 0) continue;
      const age = tl / li;
      smokePuff(f, { x: b.Cx + (h1(i + 3) - 0.5) * R * 0.5, y: b.Cy - R * 0.25 * easeOutCubic(tl / 1.2) - 0.18 * age, size: R * 0.85 * (0.4 + 0.6 * easeOutCubic(tl / 0.6)) * (1 + 0.35 * age), age, seed: 90 + i * 3.1, t: tl, alpha: 0.95 * smoothstep(0, 0.08, tl) * (1 - smoothstep(0.7, 1, age)), heat: 0, light: [0.35, -0.85] });
    }
  },
};

export const steam: ShowEffect = {
  id: 'destroy.steam', name: 'Steam burst', tagline: 'The symbol shakes and glows red-hot under pressure, then hisses out in jets of white steam.', category: 'candidate', usesObject: true, takesOver: true,
  params: [...base(), areaP(), cellP(), smokeP('white'), strengthP(), buildP(0.4), num('jets', 'Steam jets', G('Look'), 6, 2, 12, 1, 'count', 'Number of jets of steam.', true), dur(2.4)],
  duration: (p) => n(p, 'duration'),
  impactAt: (p) => n(p, 'buildup'),
  cues: (p) => [{ t: 0, kind: 'rumble', gain: 0.4, dur: n(p, 'buildup'), pitch: 1.3 }, { t: n(p, 'buildup'), kind: 'whoosh', gain: 0.9, dur: 1.2, pitch: 1.4 }, { t: n(p, 'buildup'), kind: 'thump', gain: 0.5 }],
  build(f, t, p, ctx) {
    const b = blast(p, ctx), D = n(p, 'duration');
    if (!b || t < 0 || t >= D) return;
    setVolPalette(f, 'fire', s(p, 'smoke'));
    const tb = n(p, 'buildup'), k = n(p, 'strength'), R = reach(b) * k, J = Math.round(n(p, 'jets')), L = D * 0.98;
    if (t < tb) {
      const u = t / tb, sh = 0.008 * u;
      drawIcon(f, b.obj, { cx: b.Cx + Math.sin(t * 95) * sh, cy: b.Cy + Math.cos(t * 83) * sh, size: b.size, sx: 1 + 0.08 * u * u, sy: 1 + 0.08 * u * u, bright: 1 + 0.5 * u, tint: [1, 1 - 0.35 * u, 1 - 0.55 * u] });
      f.additive.push({ x: b.Cx, y: b.Cy, hw: b.size * 0.6 * u, hh: b.size * 0.6 * u, rot: 0, type: 0, color: [1, 0.35, 0.15], intensity: 0.5 * u, e1: 1.2 });
      for (let i = 0; i < 4; i++) {                       // small leaks of steam before it goes
        const s0 = 0.1 + i * 0.07, tl = t - s0;
        if (tl <= 0) continue;
        const o = emitAt(b, h1(i + 5), h1(i + 15)), age = clamp(tl / 0.7);
        smokePuff(f, { x: o.x, y: o.y - 0.05 * tl, size: R * 0.22 * (0.5 + age), age, seed: 7 + i * 2.3, t: tl, alpha: 0.6 * (1 - age), heat: 0, light: [0.3, -0.9] });
      }
    }
    const sec = t - tb;
    if (sec < 0) return;
    const gone = smoothstep(0, 0.35, sec);
    if (gone < 1) drawIcon(f, b.obj, { cx: b.Cx, cy: b.Cy, size: b.size, bright: 1.6, tint: [1, 0.7, 0.55], alpha: 1 - gone, fx: { mode: ICON_FX.dissolve, progress: gone, seed: 4.1, p: 0, color: [1, 0.55, 0.3] } });
    flash(f, b.Cx, b.Cy, R * 0.6, [1, 0.85, 0.75], Math.exp(-sec * 14));
    ring(f, b.Cx, b.Cy, R * (0.5 + 1.6 * easeOutQuart(sec / 0.4)), [1, 0.95, 0.9], 1 - smoothstep(0, 0.4, sec), 0.1);
    for (let j = 0; j < J; j++) {
      const a0 = ((j + 0.5 + (h1(j + 3) - 0.5) * 0.9) / J) * Math.PI * 2 - 0.3, jd = h1(j + 41) * 0.22, jl = lerp(0.55, 1.15, h1(j + 51));
      const o0 = b.area === 'cell' ? { x: b.Cx + Math.cos(a0) * b.half * 0.85, y: b.Cy + Math.sin(a0) * b.half * 0.85 } : { x: b.Cx + Math.cos(a0) * b.W * 0.3, y: b.Cy + Math.sin(a0) * b.H * 0.3 };
      for (let i = 0; i < 16; i++) {
        const hh = (kk: number) => h1(j * 97 + i * 7 + kk + 20);
        const s0 = jd + i * 0.04 + hh(1) * 0.03, tl = sec - s0, li = L - tb - s0;
        if (tl <= 0 || li <= 0) continue;
        const age = tl / li, a = a0 + (hh(2) - 0.5) * 0.8, v = R * 3 * jl * lerp(0.45, 1.2, hh(3)), dist = v * (1 - Math.exp(-1.3 * tl)) / 1.3;
        const lift = 0.16 * tl ** 1.5 + 0.1 * age;
        smokePuff(f, {
          x: o0.x + Math.cos(a) * dist + Math.sin(tl * 2.2 + j + i) * 0.015 * Math.min(1, tl * 2), y: o0.y + Math.sin(a) * dist - lift,
          size: R * lerp(0.3, 0.5, hh(4)) * (0.35 + 0.65 * easeOutCubic(tl / 0.45)) * (1 + 1.5 * age), age, seed: 11 + j * 7.3 + i * 1.9, t: tl,
          alpha: 0.55 * smoothstep(0, 0.06, tl) * (1 - smoothstep(0.3, 1, age)), heat: 0, light: [0.3, -0.9], soft: 0.85,
        });
      }
    }
    risingSmoke(f, b, sec, 0.05, L - tb, 7, R * 0.9, 0.2 * k, 53, 0.5, 0, 0.3, 0.85);
  },
};

// ---------------------------------------------------------------------------------------------------------------------
// Burning down

export const ash: ShowEffect = {
  id: 'destroy.ash', name: 'Burn to ash', tagline: 'A glowing front crawls across the symbol, small flames lick up, and what is left crumbles into drifting ash.', category: 'candidate', usesObject: true, takesOver: true,
  params: [...base(), areaP(), cellP(), fireP(), strengthP(), num('flakes', 'Ash flakes', G('Look'), 40, 0, 90, 1, 'count', 'Pieces of ash that drift away.', true), dur(3)],
  duration: (p) => n(p, 'duration'),
  impactAt: () => 0.8,
  cues: (p) => [{ t: 0, kind: 'whoosh', gain: 0.45, dur: n(p, 'duration') * 0.5, pitch: 0.6 }, { t: 0.2, kind: 'crack', gain: 0.25, dur: 0.3, pitch: 0.8 }, { t: 1.0, kind: 'tick', gain: 0.3, pitch: 0.6 }],
  build(f, t, p, ctx) {
    const b = blast(p, ctx), D = n(p, 'duration');
    if (!b || t < 0 || t >= D) return;
    setVolPalette(f, s(p, 'fire'), 'black');
    const k = n(p, 'strength'), col = hot(p), u = t / D, burn = smoothstep(0.06, 0.62, u), R = reach(b) * k;
    if (u < 0.7) drawIcon(f, b.obj, { cx: b.Cx, cy: b.Cy, size: b.size, bright: 1 + 0.2 * Math.sin(Math.PI * burn), alpha: 1 - smoothstep(0.58, 0.7, u), fx: { mode: ICON_FX.burn, progress: burn * 0.96, seed: 5.3, p: 0, color: col } });
    const glow = Math.sin(Math.PI * clamp(u / 0.8));
    f.additive.push({ x: b.Cx, y: b.Cy, hw: R * 1.2, hh: R * 1.2, rot: 0, type: 0, color: col, intensity: 0.35 * glow, e1: 1.5 });
    const N = 9;
    for (let i = 0; i < N; i++) {                               // small flames licking up where the front is
      const o = emitAt(b, h1(i + 5), 0.25 + 0.65 * h1(i + 15)), s0 = 0.06 + (1 - (o.y - (b.Cy - b.H / 2)) / Math.max(1e-3, b.H)) * 0.45 + h1(i + 25) * 0.05, tl = (u - s0) * D, age = clamp(tl / (D * 0.28));
      if (tl <= 0 || age >= 1) continue;
      flame(f, { x: o.x, y: o.y + b.H * 0.12, w: Math.min(b.W, b.H) * 0.34 * k * (0.7 + 0.5 * h1(i + 35)), h: Math.min(b.W, b.H) * 0.8 * k * (0.7 + 0.6 * h1(i + 45)) * easeOutCubic(tl / 0.4) * (1 - 0.4 * age), age, seed: 13 + i * 3.7, t: tl, heat: 1, alpha: 1 - smoothstep(0.7, 1, age) });
    }
    embers(f, b, t, 0.08 * D, D * 0.8, 46, col, 0.5, 201);
    const nf = Math.round(n(p, 'flakes'));
    for (let i = 0; i < nf; i++) {
      const s0 = (0.2 + h1(i * 5 + 1) * 0.5) * D, tl = t - s0, life = D * 0.5 * lerp(0.7, 1, h1(i * 5 + 2));
      if (tl <= 0 || tl >= life) continue;
      const q = tl / life, o = emitAt(b, h1(i * 5 + 3), h1(i * 5 + 4));
      const x = o.x + (0.04 + 0.1 * h1(i + 7)) * (1 - Math.exp(-tl * 1.5)) + Math.sin(tl * 3 + i) * 0.012, y = o.y - 0.18 * easeOutCubic(q) * (0.4 + h1(i + 9)) + 0.03 * q;
      const r = lerp(0.006, 0.015, h1(i + 11)) * (1 - 0.3 * q);
      f.alphaSprites.push({ x, y, hw: r, hh: r * 0.8, rot: 0, type: 5, color: mixRGB([0.1, 0.095, 0.09], [0.5, 0.48, 0.45], h1(i + 13) * 0.6), intensity: 0.85 * (1 - smoothstep(0.5, 1, q)), e2: i });
    }
    risingSmoke(f, b, t - 0.12 * D, 0, D * 0.8, b.area === 'cell' ? 5 : 4, R * 0.5, 0.28 * k, 231, 0.5, 0.35, 0.5);
  },
};

export const turnToEmbers: ShowEffect = {
  id: 'destroy.embers', name: 'Turn to embers', tagline: 'The symbol chars and glows from within, then lifts off as a cloud of glowing embers that drift up and go out.', category: 'candidate', usesObject: true, takesOver: true,
  params: [...base(), areaP(), cellP(), fireP(), strengthP(), num('embers', 'Embers', G('Look'), 90, 20, 200, 1, 'count', 'Number of glowing embers.', true), dur(3)],
  duration: (p) => n(p, 'duration'),
  impactAt: () => 0.5,
  cues: (p) => [{ t: 0, kind: 'rumble', gain: 0.25, dur: 0.8, pitch: 0.9 }, { t: 0.6, kind: 'whoosh', gain: 0.5, dur: n(p, 'duration') * 0.5, pitch: 0.9 }],
  build(f, t, p, ctx) {
    const b = blast(p, ctx), D = n(p, 'duration');
    if (!b || t < 0 || t >= D) return;
    setVolPalette(f, s(p, 'fire'), 'black');
    const k = n(p, 'strength'), col = hot(p), u = t / D, R = reach(b) * k, charr = smoothstep(0, 0.28, u), go = smoothstep(0.2, 0.62, u);
    if (go < 1) drawIcon(f, b.obj, { cx: b.Cx, cy: b.Cy, size: b.size, bright: 1 - 0.55 * charr + 0.5 * Math.sin(Math.PI * go), tint: [1 - 0.35 * charr, 1 - 0.65 * charr, 1 - 0.8 * charr], fx: { mode: ICON_FX.dust, progress: go, seed: 6.6, p: 0, color: col } });
    f.additive.push({ x: b.Cx, y: b.Cy, hw: R * 0.9, hh: R * 0.9, rot: 0, type: 0, color: col, intensity: 0.6 * Math.sin(Math.PI * clamp(u / 0.75)) * (0.8 + 0.2 * Math.sin(t * 17)), e1: 1.4 });
    const N = Math.round(n(p, 'embers'));
    for (let i = 0; i < N; i++) {
      const hh = (kk: number) => h1(i * 13 + kk + 300);
      const st = (0.1 + hh(1) * 0.5) * D, tl = t - st, life = D * lerp(0.35, 0.55, hh(2));
      if (tl <= 0 || tl >= life) continue;
      const q = tl / life, o = emitAt(b, hh(3), hh(4));
      const x = o.x + (0.12 + 0.2 * hh(5)) * easeOutCubic(q) * k + Math.sin(tl * 4 + i) * 0.012, y = o.y - (0.25 + 0.25 * hh(6)) * easeOutCubic(q) * k - 0.02 * tl;
      const r = lerp(0.005, 0.016, hh(7)) * (1 - 0.5 * q);
      f.additive.push({ x, y, hw: r * 2.8, hh: r * 2.8, rot: 0, type: 0, color: mixRGB(col, [1, 0.85, 0.5], hh(8) * 0.5), intensity: 1.3 * (1 - smoothstep(0.45, 1, q)) * (0.7 + 0.3 * Math.sin(tl * 29 + i * 3)), e1: 2.2 });
    }
    risingSmoke(f, b, t - 0.2 * D, 0, D * 0.7, 4, R * 0.5, 0.3 * k, 311, 0.4, 0.4, 0.5);
  },
};

// ---------------------------------------------------------------------------------------------------------------------
// Particles

export const sparkBurst: ShowEffect = {
  id: 'destroy.sparks', name: 'Spark burst', tagline: 'The symbol flares white and bursts into hundreds of streaking sparks that arc down and burn out.', category: 'candidate', usesObject: true, takesOver: true,
  params: [...base(), areaP(), cellP(), color('tint', 'Spark colour', G('Look'), '#ffc94a', 'Colour of the sparks.'), strengthP(), buildP(0.14), num('count', 'Sparks', G('Look'), 110, 20, 300, 1, 'count', 'Number of sparks.', true), dur(1.8)],
  duration: (p) => n(p, 'duration'),
  impactAt: (p) => n(p, 'buildup'),
  cues: (p) => [{ t: 0, kind: 'sweep', gain: 0.3, dur: n(p, 'buildup'), pitch: 2 }, { t: n(p, 'buildup'), kind: 'shatter', gain: 0.8, dur: 0.8, pitch: 2.4 }, { t: n(p, 'buildup'), kind: 'zap', gain: 0.4, dur: 0.3 }],
  build(f, t, p, ctx) {
    const b = blast(p, ctx), D = n(p, 'duration');
    if (!b || t < 0 || t >= D) return;
    const tb = n(p, 'buildup'), k = n(p, 'strength'), col = hex(s(p, 'tint')), R = reach(b) * k, cnt = Math.round(n(p, 'count'));
    if (swell(f, b, t, tb, col, 0.1)) return;
    const sec = t - tb, life = D - tb;
    if (sec < 0.34) drawIcon(f, b.obj, { cx: b.Cx, cy: b.Cy, size: b.size, bright: 1.8 - 0.8 * sec / 0.34, tint: [1, 0.95, 0.85], fx: { mode: ICON_FX.dissolve, progress: sec / 0.3, seed: 8.8, p: 0.4, color: col } });
    flash(f, b.Cx, b.Cy, R * 0.9, mixRGB(col, [1, 1, 1], 0.5), Math.exp(-sec * 11));
    ring(f, b.Cx, b.Cy, R * (0.5 + 1.8 * easeOutQuart(sec / 0.4)), col, 1 - smoothstep(0, 0.4, sec), 0.06);
    sparks(f, b, t, tb, life * 0.9, cnt, col, 1.35 * k, 0.9, 401);
    sparks(f, b, t, tb, life * 0.7, Math.round(cnt * 0.5), mixRGB(col, [1, 1, 1], 0.5), 0.8 * k, 0.6, 451);
    embers(f, b, t, tb, life * 0.8, Math.round(cnt * 0.25), col, 0.15, 471);
    for (let i = 0; i < 7; i++) {
      const o = emitAt(b, h1(i + 3), h1(i + 13)), tl = sec - 0.03 * i;
      if (tl > 0) glint(f, o.x, o.y, R * lerp(0.2, 0.4, h1(i + 23)), mixRGB(col, [1, 1, 1], 0.6), Math.exp(-tl * 5) * (0.6 + 0.4 * Math.sin(tl * 40 + i)));
    }
    f.exposure *= 1 + 0.06 * Math.exp(-sec * 10);
  },
};

const PARTY: Record<string, RGB[]> = {
  party: [[1, 0.35, 0.4], [1, 0.82, 0.25], [0.3, 0.8, 1], [0.5, 1, 0.5], [0.82, 0.5, 1], [1, 0.62, 0.2]],
  gold: [[1, 0.85, 0.3], [1, 0.7, 0.15], [1, 0.95, 0.65], [0.9, 0.6, 0.12]],
  cool: [[0.3, 0.8, 1], [0.45, 0.6, 1], [0.7, 0.9, 1], [0.2, 0.95, 0.85], [0.75, 0.6, 1]],
  hot: [[1, 0.25, 0.3], [1, 0.5, 0.2], [1, 0.8, 0.3], [1, 0.4, 0.65]],
  pastel: [[1, 0.75, 0.82], [0.75, 0.9, 1], [1, 0.95, 0.7], [0.8, 1, 0.82], [0.88, 0.8, 1]],
};

export const confettiPop: ShowEffect = {
  id: 'destroy.confetti-pop', name: 'Confetti pop', tagline: 'The symbol pops like a party popper: its pieces and a burst of confetti fly out, flutter and fall.', category: 'candidate', usesObject: true, takesOver: true,
  params: [...base(), areaP(), cellP(), enm('palette', 'Confetti colours', G('Look'), 'party', [['party', 'Party'], ['gold', 'Gold'], ['cool', 'Cool'], ['hot', 'Hot'], ['pastel', 'Pastel']], 'Colours of the paper.'), strengthP(), buildP(0.12), num('count', 'Confetti', G('Look'), 90, 20, 240, 1, 'count', 'Pieces of confetti.', true), dur(2.6)],
  duration: (p) => n(p, 'duration'),
  impactAt: (p) => n(p, 'buildup'),
  cues: (p) => [{ t: n(p, 'buildup'), kind: 'thump', gain: 0.7, pitch: 1.5 }, { t: n(p, 'buildup'), kind: 'shatter', gain: 0.5, dur: 0.5, pitch: 2.3 }, { t: n(p, 'buildup') + 0.25, kind: 'tick', gain: 0.25, pitch: 2.2 }],
  build(f, t, p, ctx) {
    const b = blast(p, ctx), D = n(p, 'duration');
    if (!b || t < 0 || t >= D) return;
    const tb = n(p, 'buildup'), k = n(p, 'strength'), R = reach(b) * k, cnt = Math.round(n(p, 'count')), pal = PARTY[s(p, 'palette')] ?? PARTY.party!;
    if (t < tb) {
      const u = t / tb, sq = 1 + 0.3 * u * u;
      drawIcon(f, b.obj, { cx: b.Cx, cy: b.Cy, size: b.size, sx: sq * (1 - 0.1 * u), sy: sq * (1 + 0.05 * u), bright: 1 + 0.25 * u });
      return;
    }
    const sec = t - tb, life = D - tb;
    debris(f, b, { pieces: 16, force: 0.6 * k, gravity: 1, since: sec, life: Math.min(1.1, life * 0.5), shade: 1, glint: 0.4 });
    flash(f, b.Cx, b.Cy, R * 0.7, [1, 0.95, 0.85], Math.exp(-sec * 13));
    ring(f, b.Cx, b.Cy, R * (0.5 + 1.8 * easeOutQuart(sec / 0.4)), [1, 0.92, 0.7], 1 - smoothstep(0, 0.4, sec), 0.07);
    for (let i = 0; i < cnt; i++) {
      const hh = (kk: number) => h1(i * 11 + kk + 500);
      const tl = sec - hh(1) * 0.07, life2 = life * lerp(0.55, 1, hh(2));
      if (tl <= 0 || tl >= life2) continue;
      const u = tl / life2, o = emitAt(b, hh(3), hh(4));
      const ang = Math.atan2(o.y - b.Cy, o.x - b.Cx) * 0.5 + (-Math.PI / 2) * 0.5 + (hh(5) - 0.5) * 2.4, v = 1.15 * k * lerp(0.45, 1.3, hh(6) ** 0.7), drag = 2.4, trav = (1 - Math.exp(-drag * tl)) / drag;
      const x = o.x + Math.cos(ang) * v * trav + Math.sin(tl * 5 + hh(7) * 6) * 0.02, y = o.y + Math.sin(ang) * v * trav + 0.5 * 0.9 * tl * tl;
      const spin = (4 + 8 * hh(8)) * (hh(9) < 0.5 ? 1 : -1), flip = Math.cos(tl * spin * 1.3 + hh(10) * 6.283), rot = Math.sin(tl * 3 + hh(10) * 6.283) * 0.9 + tl * spin * 0.15;
      const sz = lerp(0.7, 1.3, hh(11)), col = pal[Math.floor(hh(12) * pal.length)]!, shade = flip > 0 ? 1 : 0.72, a = 1 - smoothstep(0.78, 1, u);
      quadPoly(f.polys, x, y, 0.0105 * sz * Math.max(0.12, Math.abs(flip)), 0.0185 * sz, rot, [col[0] * shade, col[1] * shade, col[2] * shade], a);
      if (i % 11 === 0 && Math.abs(flip) < 0.16) glint(f, x, y, 0.022, [1, 1, 1], 0.7 * a);
    }
  },
};

// A faceted gem: five flat facets, lit from the top left.
export function gem(out: number[], x: number, y: number, r: number, rot: number, sq: number, col: RGB, a: number): void {
  const c = Math.cos(rot), sn = Math.sin(rot);
  const P = (lx: number, ly: number): [number, number] => { const ax = lx * r * sq, ay = ly * r; return [x + c * ax - sn * ay, y + sn * ax + c * ay]; };
  const TL = P(-0.55, -0.6), TR = P(0.55, -0.6), R = P(1, -0.05), Bm = P(0, 1), L = P(-1, -0.05), M = P(0, -0.12), Cm = P(0, -0.6);
  const sh = (k: number): RGB => [Math.min(1, col[0] * k), Math.min(1, col[1] * k), Math.min(1, col[2] * k)];
  triPoly(out, TL, TR, M, sh(1.45), a);                  // table
  triPoly(out, TL, L, M, sh(1.0), a);
  triPoly(out, TR, R, M, sh(0.7), a);
  triPoly(out, L, M, Bm, sh(0.82), a);
  triPoly(out, R, M, Bm, sh(0.5), a);
  triPoly(out, TL, Cm, M, sh(1.7), a * 0.7);
}

export const GEMS: Record<string, RGB[]> = {
  rainbow: [[1, 0.2, 0.3], [0.2, 0.85, 0.45], [0.25, 0.5, 1], [1, 0.75, 0.2], [0.8, 0.4, 1]],
  ruby: [[1, 0.12, 0.25], [0.9, 0.08, 0.2], [1, 0.3, 0.4]],
  emerald: [[0.1, 0.85, 0.4], [0.15, 0.7, 0.35], [0.4, 1, 0.6]],
  sapphire: [[0.2, 0.45, 1], [0.15, 0.35, 0.9], [0.45, 0.65, 1]],
  diamond: [[0.8, 0.95, 1], [0.95, 1, 1], [0.7, 0.88, 1]],
  gold: [[1, 0.8, 0.2], [1, 0.65, 0.1], [1, 0.9, 0.5]],
};

export const gemBurst: ShowEffect = {
  id: 'destroy.gems', name: 'Gem burst', tagline: 'The symbol glitters, cracks, and bursts into flying gems and glinting shards with a starburst of light.', category: 'candidate', usesObject: true, takesOver: true,
  params: [...base(), areaP(), cellP(), enm('gems', 'Gems', G('Look'), 'rainbow', [['rainbow', 'Mixed jewels'], ['ruby', 'Rubies'], ['emerald', 'Emeralds'], ['sapphire', 'Sapphires'], ['diamond', 'Diamonds'], ['gold', 'Gold topaz']], 'Which jewels fly out.'), strengthP(), buildP(0.3), num('count', 'Gems', G('Look'), 26, 6, 80, 1, 'count', 'Number of gems.', true), dur(2.4)],
  duration: (p) => n(p, 'duration'),
  impactAt: (p) => n(p, 'buildup'),
  cues: (p) => [{ t: 0, kind: 'tick', gain: 0.3, pitch: 2.8 }, { t: n(p, 'buildup') * 0.6, kind: 'crack', gain: 0.5, dur: 0.2, pitch: 1.6 }, { t: n(p, 'buildup'), kind: 'shatter', gain: 0.9, dur: 0.9, pitch: 2.2 }],
  build(f, t, p, ctx) {
    const b = blast(p, ctx), D = n(p, 'duration');
    if (!b || t < 0 || t >= D) return;
    const tb = n(p, 'buildup'), k = n(p, 'strength'), R = reach(b) * k, cnt = Math.round(n(p, 'count')), pal = GEMS[s(p, 'gems')] ?? GEMS.rainbow!;
    const white2: RGB = [1, 0.97, 0.9];
    if (t < tb) {
      const u = t / tb, jit = 0.005 * u * u;
      drawIcon(f, b.obj, { cx: b.Cx + Math.sin(t * 100) * jit, cy: b.Cy + Math.cos(t * 87) * jit, size: b.size, bright: 1 + 0.6 * u * (0.7 + 0.3 * Math.sin(t * 40)), tint: [1, 1, 1] });
      for (let i = 0; i < 6; i++) {
        const o = emitAt(b, h1(i + 3), h1(i + 13)), ph = (t * 3.5 + h1(i + 23)) % 1;
        glint(f, o.x, o.y, R * 0.28 * Math.sin(Math.PI * ph), white2, Math.sin(Math.PI * ph) * (0.4 + 0.6 * u));
      }
      return;
    }
    const sec = t - tb, life = D - tb;
    flash(f, b.Cx, b.Cy, R * 0.9, white2, Math.exp(-sec * 10));
    glint(f, b.Cx, b.Cy, R * (0.8 + 1.2 * easeOutCubic(sec / 0.3)), white2, Math.exp(-sec * 6));
    ring(f, b.Cx, b.Cy, R * (0.5 + 2 * easeOutQuart(sec / 0.45)), white2, 1 - smoothstep(0, 0.45, sec), 0.06);
    for (let i = 0; i < 9; i++) {                           // a fan of rays turning slowly
      const a = (i / 9) * Math.PI * 2 + sec * 0.6 + h1(i + 3) * 0.3;
      f.additive.push({ x: b.Cx + Math.cos(a) * R * 0.15, y: b.Cy + Math.sin(a) * R * 0.15, hw: R * lerp(1.2, 2.2, h1(i + 9)), hh: R * 0.05, rot: a, type: 6, color: white2, intensity: 0.7 * Math.exp(-sec * 4.5), e1: 0.5 });
    }
    debris(f, b, { pieces: 20, force: 0.8 * k, gravity: 0.8, since: sec, life: Math.min(1.5, life * 0.7), shade: 1.25, glint: 1 });
    for (let i = 0; i < cnt; i++) {
      const hh = (kk: number) => h1(i * 13 + kk + 600);
      const tl = sec - hh(1) * 0.05, life2 = life * lerp(0.55, 0.95, hh(2));
      if (tl <= 0 || tl >= life2) continue;
      const u = tl / life2, o = emitAt(b, hh(3), hh(4));
      const ang = Math.atan2(o.y - b.Cy, o.x - b.Cx) + (hh(5) - 0.5) * 1.2 - 0.25, v = 0.95 * k * lerp(0.45, 1.25, hh(6) ** 0.8), drag = 2.8, trav = (1 - Math.exp(-drag * tl)) / drag;
      const x = o.x + Math.cos(ang) * v * trav, y = o.y + Math.sin(ang) * v * trav + 0.5 * 1.1 * tl * tl;
      const spin = (3 + 6 * hh(7)) * (hh(8) < 0.5 ? 1 : -1), flip = Math.cos(tl * spin + hh(9) * 6.283), col = pal[Math.floor(hh(10) * pal.length)]!;
      const r = lerp(0.014, 0.03, hh(11)) * (0.8 + 0.2 * k), a = 1 - smoothstep(0.7, 1, u);
      gem(f.polys, x, y, r, Math.sin(tl * 2 + hh(9) * 6) * 0.6 + tl * spin * 0.1, Math.max(0.25, Math.abs(flip)), col, a);
      if (Math.abs(flip) > 0.86) glint(f, x - r * 0.3, y - r * 0.4, r * 3, white2, a * (Math.abs(flip) - 0.86) / 0.14);
    }
  },
};

// ---------------------------------------------------------------------------------------------------------------------
// Ice and acid

function crystals(f: Frame, b: Blast, count: number, grow: number, k: number, seed: number, fade: number): void {
  if (fade <= 0.01) return;
  for (let i = 0; i < count; i++) {
    const hh = (kk: number) => h1(seed + i * 7 + kk);
    const a = (i / count) * Math.PI * 2 + (hh(1) - 0.5) * 0.5, g = easeOutCubic(clamp((grow - hh(2) * 0.4) / 0.6));
    if (g <= 0) continue;
    const rx = b.area === 'cell' ? b.half * 0.95 : b.W * 0.5, ry = b.area === 'cell' ? b.half * 0.95 : b.H * 0.5;
    const ox = b.Cx + Math.cos(a) * rx * 0.85, oy = b.Cy + Math.sin(a) * ry * 0.85;
    const len = Math.max(rx, ry) * lerp(0.35, 0.8, hh(3)) * g * k, wid = len * lerp(0.16, 0.26, hh(4));
    const dx = Math.cos(a + (hh(5) - 0.5) * 0.3), dy = Math.sin(a + (hh(5) - 0.5) * 0.3), px = -dy, py = dx;
    const tip: [number, number] = [ox + dx * len, oy + dy * len], l: [number, number] = [ox + px * wid, oy + py * wid], r: [number, number] = [ox - px * wid, oy - py * wid], m: [number, number] = [ox + dx * len * 0.35, oy + dy * len * 0.35];
    const lit: RGB = [0.86, 0.97, 1], mid: RGB = [0.5, 0.8, 1], dark: RGB = [0.22, 0.5, 0.85];
    triPoly(f.polys, l, tip, m, mid, 0.85 * fade, lit, lit);
    triPoly(f.polys, r, tip, m, dark, 0.85 * fade, mid, lit);
    triPoly(f.polys, l, r, m, mid, 0.8 * fade);
    f.additive.push({ x: ox + dx * len * 0.55, y: oy + dy * len * 0.55, hw: len * 0.5, hh: wid * 0.35, rot: Math.atan2(dy, dx), type: 4, color: [0.7, 0.9, 1], intensity: 0.5 * fade * g, e1: 1.2 });
  }
}

export const iceShatter: ShowEffect = {
  id: 'destroy.ice', name: 'Freeze and shatter', tagline: 'Frost creeps over the symbol and ice spikes grow out of it; one crack and it explodes into glittering ice shards and cold mist.', category: 'candidate', usesObject: true, takesOver: true,
  params: [...base(), areaP(), cellP(), strengthP(), num('buildup', 'Freeze time', G('Timing'), 0.85, 0.2, 2, 0.01, 's', 'Time the frost takes to cover the symbol before it cracks.'), num('spikes', 'Ice spikes', G('Look'), 14, 4, 28, 1, 'count', 'Number of ice crystals that grow out of the symbol.', true), num('shards', 'Ice shards', G('Look'), 30, 6, 80, 1, 'count', 'Pieces the ice breaks into.', true), dur(2.9)],
  duration: (p) => n(p, 'duration'),
  impactAt: (p) => n(p, 'buildup'),
  cues: (p) => [{ t: 0.05, kind: 'sweep', gain: 0.3, dur: n(p, 'buildup'), pitch: 2.4 }, { t: n(p, 'buildup') - 0.08, kind: 'crack', gain: 0.6, dur: 0.15, pitch: 1.8 }, { t: n(p, 'buildup'), kind: 'shatter', gain: 1, dur: 0.9, pitch: 2.6 }, { t: n(p, 'buildup'), kind: 'thump', gain: 0.5, pitch: 1.2 }],
  build(f, t, p, ctx) {
    const b = blast(p, ctx), D = n(p, 'duration');
    if (!b || t < 0 || t >= D) return;
    setVolPalette(f, 'white', 'ice');
    const tb = n(p, 'buildup'), k = n(p, 'strength'), R = reach(b) * k, N = Math.round(n(p, 'spikes')), icy: RGB = [0.6, 0.85, 1];
    if (t < tb) {
      const u = t / tb, g = smoothstep(0, 0.9, u);
      drawIcon(f, b.obj, { cx: b.Cx, cy: b.Cy, size: b.size, bright: 1 + 0.2 * g, tint: [1 - 0.38 * g, 1 - 0.14 * g, 1 + 0.2 * g] });
      f.additive.push({ x: b.Cx, y: b.Cy, hw: R * 0.95, hh: R * 0.95, rot: 0, type: 0, color: icy, intensity: 0.5 * g, e1: 1.6 });
      crystals(f, b, N, u, k, 700, 1);
      risingSmoke(f, b, t, 0, tb * 1.2, 4, R * 0.5, 0.02, 713, 0.5 * g, 0, 0.3);
      for (let i = 0; i < 5; i++) { const o = emitAt(b, h1(i + 3), h1(i + 13)), ph = (t * 2.5 + h1(i + 23)) % 1; glint(f, o.x, o.y, R * 0.2 * Math.sin(Math.PI * ph), [0.85, 0.95, 1], g * Math.sin(Math.PI * ph)); }
      return;
    }
    const sec = t - tb, life = D - tb;
    flash(f, b.Cx, b.Cy, R * 0.9, [0.8, 0.95, 1], Math.exp(-sec * 12));
    ring(f, b.Cx, b.Cy, R * (0.5 + 2 * easeOutQuart(sec / 0.45)), icy, 1 - smoothstep(0, 0.45, sec), 0.07);
    f.shocks.push({ cx: b.Cx, cy: b.Cy, radius: easeOutCubic(sec / 0.5) * R * 2.2, width: 0.06 + 0.08 * clamp(sec / 0.5), amp: 0.02 * k * (1 - smoothstep(0, 0.5, sec)), pinchR: 0, pinchK: 0, light: 0.35, color: icy, split: 0.3, life: 1 - smoothstep(0.1, 0.5, sec), strainLight: 0.2 });
    crystals(f, b, N, 1, k, 700, 1 - smoothstep(0, 0.22, sec));
    debris(f, b, { pieces: 26, force: 0.85 * k, gravity: 0.9, since: sec, life: Math.min(1.6, life * 0.7), shade: 1.3, glint: 1 });
    const M = Math.round(n(p, 'shards'));
    for (let i = 0; i < M; i++) {                          // flat ice shards, sharp triangles that tumble outward
      const hh = (kk: number) => h1(i * 17 + kk + 800);
      const tl = sec - hh(1) * 0.04, life2 = life * lerp(0.5, 0.9, hh(2));
      if (tl <= 0 || tl >= life2) continue;
      const u = tl / life2, o = emitAt(b, hh(3), hh(4)), ang = Math.atan2(o.y - b.Cy, o.x - b.Cx) + (hh(5) - 0.5) * 0.8, v = 1.1 * k * lerp(0.35, 1.2, hh(6) ** 0.8), drag = 3, trav = (1 - Math.exp(-drag * tl)) / drag;
      const x = o.x + Math.cos(ang) * v * trav, y = o.y + Math.sin(ang) * v * trav + 0.5 * 0.95 * tl * tl, rot = hh(7) * 6.28 + tl * (hh(8) - 0.5) * 14, sz = lerp(0.012, 0.032, hh(9)) * (0.8 + 0.2 * k), a = (1 - smoothstep(0.7, 1, u)) * 0.9;
      const c = Math.cos(rot), sn = Math.sin(rot), P = (lx: number, ly: number): [number, number] => [x + c * lx * sz - sn * ly * sz, y + sn * lx * sz + c * ly * sz];
      const sh = Math.abs(Math.cos(tl * 7 + hh(10) * 6)), base2: RGB = [0.45 + 0.4 * sh, 0.75 + 0.2 * sh, 1];
      triPoly(f.polys, P(0, -1.3), P(0.7, 0.7), P(-0.8, 0.5), base2, a, [1, 1, 1], base2);
      if (sh > 0.9) glint(f, x, y, sz * 3, [1, 1, 1], a * (sh - 0.9) * 10);
    }
    risingSmoke(f, b, sec, 0.02, life * 0.98, b.area === 'cell' ? 7 : 6, R * 0.62, 0.12 * k, 733, 0.7, 0, 0.3);
    embers(f, b, t, tb, life * 0.9, 34, [0.8, 0.95, 1], 0.12, 751);
  },
};

export const acid: ShowEffect = {
  id: 'destroy.acid', name: 'Acid melt', tagline: 'Toxic green acid eats the symbol: it bubbles, sags and runs into a glowing puddle under rising poison fumes.', category: 'candidate', usesObject: true, takesOver: true,
  params: [...base(), areaP(), cellP(), smokeP('toxic'), strengthP(), num('bubbles', 'Bubbles', G('Look'), 18, 0, 40, 1, 'count', 'Bubbles that rise and pop on the symbol.', true), dur(3)],
  duration: (p) => n(p, 'duration'),
  impactAt: () => 0.5,
  cues: (p) => [{ t: 0, kind: 'whoosh', gain: 0.3, dur: n(p, 'duration') * 0.5, pitch: 0.5 }, { t: 0.1, kind: 'tick', gain: 0.25, pitch: 2.4 }, { t: 0.5, kind: 'tick', gain: 0.25, pitch: 2 }, { t: 0.9, kind: 'tick', gain: 0.2, pitch: 2.6 }],
  build(f, t, p, ctx) {
    const b = blast(p, ctx), D = n(p, 'duration');
    if (!b || t < 0 || t >= D) return;
    setVolPalette(f, 'green', s(p, 'smoke'), [0.4, 1, 0.3]);
    const k = n(p, 'strength'), R = reach(b) * k, u = t / D, melt = smoothstep(0.1, 0.72, u), acidC: RGB = [0.35, 1, 0.2];
    if (melt < 1) drawIcon(f, b.obj, { cx: b.Cx, cy: b.Cy, size: b.size, bright: 1 + 0.25 * Math.sin(Math.PI * melt), tint: [1 - 0.6 * melt, 1, 1 - 0.7 * melt], fx: { mode: ICON_FX.melt, progress: melt, seed: 9.4, p: 0, color: acidC } });
    f.additive.push({ x: b.Cx, y: b.Cy, hw: R * 0.9, hh: R * 0.9, rot: 0, type: 0, color: acidC, intensity: 0.45 * Math.sin(Math.PI * clamp(u / 0.8)), e1: 1.4 });
    const baseY = b.area === 'cell' ? b.Cy + b.half * 0.85 : b.Cy + b.H * 0.46, pw = (b.area === 'cell' ? b.half * 1.5 : b.W * 1.0) * k;
    const pud = smoothstep(0.25, 0.7, u) * (1 - smoothstep(0.82, 1, u));
    if (pud > 0.01) {
      ellipsePoly(f.polys, b.Cx, baseY, pw * pud * 0.9, pw * 0.16 * pud, 0, [0.12, 0.55, 0.08], 0.85 * pud, 24);
      ellipsePoly(f.polys, b.Cx - pw * 0.08 * pud, baseY - pw * 0.02 * pud, pw * pud * 0.55, pw * 0.09 * pud, 0, [0.4, 0.95, 0.2], 0.7 * pud, 20);
      f.additive.push({ x: b.Cx, y: baseY, hw: pw * pud, hh: pw * 0.28 * pud, rot: 0, type: 0, color: acidC, intensity: 0.8 * pud, e1: 1 });
    }
    for (let i = 0; i < 5; i++) {                           // drips falling into the puddle
      const s0 = (0.18 + h1(i + 3) * 0.4) * D, per = 0.5 + 0.3 * h1(i + 9), tl = ((t - s0) % per + per) % per;
      if (t < s0 || u > 0.8) continue;
      const x = b.Cx + (h1(i + 13) - 0.5) * (b.area === 'cell' ? b.half * 1.4 : b.W * 0.8), y0 = b.Cy + b.H * 0.1, y = lerp(y0, baseY, easeOutCubic(tl / per) * 0.9 + 0.1 * tl / per);
      f.additive.push({ x, y, hw: 0.028, hh: 0.0045, rot: Math.PI / 2, type: 4, color: acidC, intensity: 0.9 * (1 - tl / per), e1: 1.5 });
    }
    const nb = Math.round(n(p, 'bubbles'));
    for (let i = 0; i < nb; i++) {
      const per = 0.5 + 0.5 * h1(i + 5), s0 = h1(i + 15) * D * 0.55, tl = t - s0;
      if (tl <= 0 || tl > per * 2.2 || u > 0.78) continue;
      const q = clamp((tl % per) / per), cyc = Math.floor(tl / per), o = emitAt(b, h1(i * 7 + cyc * 13 + 3), h1(i * 7 + cyc * 13 + 4));
      const r = lerp(0.008, 0.02, h1(i + 25)) * (0.4 + 0.6 * easeOutCubic(q));
      f.additive.push({ x: o.x, y: o.y - 0.03 * q, hw: r, hh: r, rot: 0, type: 1, color: [0.6, 1, 0.45], intensity: 0.9 * (1 - smoothstep(0.7, 1, q)), e1: 0.22 });
      if (q > 0.85) f.additive.push({ x: o.x, y: o.y - 0.03 * q, hw: r * 1.8, hh: r * 1.8, rot: 0, type: 0, color: acidC, intensity: 0.8 * (q - 0.85) / 0.15, e1: 2 });
    }
    sparks(f, b, t, 0.25 * D, 1.2, 10, [0.5, 1, 0.3], 0.35 * k, 0.4, 801);
    risingSmoke(f, b, t - 0.1 * D, 0, D * 0.85, b.area === 'cell' ? 9 : 7, R * 0.7, 0.26 * k, 831, 0.5, 0.4, 0.55, 0.6);
  },
};

// ---------------------------------------------------------------------------------------------------------------------
// Lightning

export const struckByLightning: ShowEffect = {
  id: 'destroy.lightning', name: 'Struck by lightning', tagline: 'Bolts crack down on the symbol, arcs crawl over it and it chars and crumbles in a shower of sparks and a puff of smoke.', category: 'candidate', usesObject: true, takesOver: true,
  params: [...base(), areaP(), cellP(), color('tint', 'Bolt colour', G('Look'), '#bfe3ff', 'Colour of the glow around the bolts.'), strengthP(), num('strikes', 'Strikes', G('Look'), 2, 1, 4, 1, 'count', 'Number of bolts.', true), num('seed', 'Variation', G('Look'), 4, 1, 99, 1, '', 'Pick a different bolt shape.', true), dur(2.6)],
  duration: (p) => n(p, 'duration'),
  impactAt: () => 0.1,
  cues: (p) => Array.from({ length: Math.round(n(p, 'strikes')) }, (_, i) => [{ t: 0.4 * i, kind: 'zap' as const, gain: 0.9, dur: 0.5 }, { t: 0.1 + 0.4 * i, kind: 'thump' as const, gain: 1 }, { t: 0.1 + 0.4 * i, kind: 'crack' as const, gain: 0.8 }]).flat(),
  build(f, t, p, ctx) {
    const b = blast(p, ctx), D = n(p, 'duration');
    if (!b || t < 0 || t >= D) return;
    setVolPalette(f, 'white', 'black');
    const k = n(p, 'strength'), R = reach(b) * k, glow = hex(s(p, 'tint')), S = Math.round(n(p, 'strikes')), hits = Array.from({ length: S }, (_, i) => 0.1 + i * 0.4), last = hits[S - 1]!;
    f.boltCore = [1, 1, 1]; f.boltGlow = glow;
    // the symbol: pulses white at each hit, then chars and crumbles after the last
    const since = t - (hits.filter((h) => h <= t).pop() ?? -1), hitK = hits.some((h) => h <= t) ? Math.exp(-since * 13) : 0, after = clamp((t - last) / (D * 0.55));
    const burn = smoothstep(0.05, 0.9, after);
    if (after < 1) drawIcon(f, b.obj, { cx: b.Cx + Math.sin(t * 120) * 0.004 * hitK, cy: b.Cy + Math.cos(t * 110) * 0.004 * hitK, size: b.size, bright: 1 + 2.2 * hitK, tint: [1 - 0.15 * hitK, 1 - 0.05 * hitK, 1], alpha: 1 - smoothstep(0.85, 1, after), fx: burn > 0 ? { mode: ICON_FX.burn, progress: burn * 0.96, seed: 3.9, p: 0, color: [1, 0.55, 0.2] } : undefined });
    for (let i = 0; i < S; i++) {
      const hit = hits[i]!, tl = t - (hit - 0.09);
      if (tl < 0 || tl > 1.2) continue;
      const rng = makeRng(n(p, 'seed') * 131 + i * 977 + 7), origin = { x: b.Cx + (rng.next() - 0.5) * 0.3, y: -0.04 };
      const arcs = discharge(rng, origin, Math.atan2(b.Cy - origin.y, b.Cx - origin.x), Math.hypot(b.Cx - origin.x, b.Cy - origin.y), 1);
      const grow = clamp(tl / 0.09), flick = tl < 0.09 ? 1 : (0.5 + 0.5 * Math.sin(tl * 90)) * Math.exp(-(tl - 0.09) * 6) + 0.35 * Math.exp(-(tl - 0.09) * 3) * (h1(Math.floor(tl * 40) + i * 17) > 0.5 ? 1 : 0.4);
      const fade = 1 - smoothstep(0.35, 0.8, tl);
      for (const arc of arcs) {
        const part = slice(arc.pts, 0, arc.level === 0 ? grow : clamp((grow - arc.at) / 0.4));
        if (part.length < 2) continue;
        ribbon(f.bolts, part, arc.level === 0 ? 0.0045 : 0.0028, (arc.level === 0 ? 1 : 0.75) * k * flick * fade, true, arc.level === 0);
      }
      if (tl >= 0.09) {
        const q = tl - 0.09;
        flash(f, b.Cx, b.Cy, R * 1.0, mixRGB(glow, [1, 1, 1], 0.5), Math.exp(-q * 9));
        glint(f, b.Cx, b.Cy, R * 1.6, glow, Math.exp(-q * 9));
        ring(f, b.Cx, b.Cy, R * (0.4 + 2 * easeOutQuart(q / 0.45)), glow, 1 - smoothstep(0, 0.45, q), 0.07);
        f.shocks.push({ cx: b.Cx, cy: b.Cy, radius: easeOutCubic(q / 0.5) * R * 2.2, width: 0.06 + 0.08 * clamp(q / 0.5), amp: 0.025 * k * (1 - smoothstep(0, 0.5, q)), pinchR: 0, pinchK: 0, light: 0.3, color: glow, split: 0.3, life: 1 - smoothstep(0.1, 0.5, q), strainLight: 0.2 });
        f.camera.dx += Math.sin(q * 90) * 0.008 * k * Math.exp(-q * 9); f.camera.dy += Math.cos(q * 77) * 0.007 * k * Math.exp(-q * 9);
        f.exposure *= 1 + 0.12 * k * Math.exp(-q * 12);
      }
    }
    // arcs crawling over the symbol while it is being hit and shortly after
    if (t > 0.1 && t < last + 0.55) {
      const rng = makeRng(Math.floor(t * 30) * 31 + 5), strength = Math.min(1, (t - 0.1) * 8) * (1 - smoothstep(last + 0.2, last + 0.55, t));
      for (let i = 0; i < 5; i++) {
        const a = emitAt(b, rng.next(), rng.next()), c = emitAt(b, rng.next(), rng.next()), pts = discharge(rng, a, Math.atan2(c.y - a.y, c.x - a.x), Math.hypot(c.x - a.x, c.y - a.y) + 1e-3, 0.3)[0]!.pts;
        ribbon(f.bolts, pts, 0.0016, 0.6 * strength * (rng.next() < 0.3 ? 0.2 : 1), true);
      }
    }
    if (t > last + 0.05) {
      const col: RGB = [1, 0.62, 0.25];
      sparks(f, b, t, last + 0.02, 1.1, 50, [1, 0.85, 0.5], 1.1 * k, 0.9, 901);
      embers(f, b, t, last + 0.1, 1.2, 22, col, 0.3, 921);
      risingSmoke(f, b, t - last - 0.2, 0, D - last - 0.25, 5, R * 0.55, 0.3 * k, 941, 0.6, 0.3, 0.45);
    }
  },
};

export const EXPLOSIONS2: ShowEffect[] = [smokeVanish, smokeBomb, steam, ash, turnToEmbers, sparkBurst, confettiPop, gemBurst, iceShatter, acid, struckByLightning];
void fireball; void hot; void white; void cellP;
