/**
 * More impacts for the whole screen. They are written to look expensive rather than loud: a restrained thud, a punch with a recoil,
 * footsteps that get closer, a blast with a real shove through the picture, a cracked screen, thunder, a storm lit from inside by red
 * lightning, a heartbeat and a rolling wave. Like the other impacts they move the camera in a way that always covers the frame.
 */
import { makeRng } from '../../core/util/prng';
import { color, enm, num } from '../../core/params';
import { DISTORT, FIRE_PALETTES, type Frame, type RGB } from '../engine/frame';
import { discharge, jag, ribbon } from '../engine/lightning';
import { clamp, easeOutCubic, easeOutQuart, h1, hex, lerp, mixRGB, smoothstep } from '../engine/math';
import { n, s, type EffectCtx, type ShowEffect } from './effect';
import { segment } from './pieces';
import { fireball, setVolPalette, smokePuff } from './volume';

const G = (group: string) => ({ section: 'Effect', group });
const cxp = (d = 0.5) => num('cx', 'Centre X', G('Position'), d, 0, 1, 0.001, '', 'Horizontal position, as a fraction of the stage width.');
const cyp = (d = 0.5) => num('cy', 'Centre Y', G('Position'), d, 0, 1, 0.001, '', 'Vertical position, as a fraction of the stage height.');
const dur = (def: number, min = 0.3, max = 8) => num('duration', 'Duration', G('Timing'), def, min, max, 0.01, 's', 'Total length.');
const strength = (def = 1) => num('strength', 'Strength', G('Look'), def, 0, 2.5, 0.01, 'x', 'Overall force of the hit.');
const TAU = Math.PI * 2;
const L = (ctx: EffectCtx, v: number): number => Math.max(2, Math.round(v * Math.max(0.3, ctx.quality ?? 1)));

/** Move the camera and zoom just enough that the picture still covers its frame. */
function cam(f: Frame, dx: number, dy: number, rot: number, zoom: number): void {
  const cover = 2.2 * Math.hypot(dx, dy) + 2 * Math.abs(rot);
  f.camera = { dx: f.camera.dx + dx, dy: f.camera.dy + dy, rot: f.camera.rot + rot, zoom: f.camera.zoom + zoom + cover };
}
const flash = (f: Frame, x: number, y: number, size: number, col: RGB, gain: number): void => { if (gain > 0.003) f.additive.push({ x, y, hw: size, hh: size, rot: 0, type: 3, color: col, intensity: gain }); };
const ring = (f: Frame, x: number, y: number, r: number, col: RGB, gain: number, thick = 0.07): void => { if (gain > 0.003) f.additive.push({ x, y, hw: r, hh: r, rot: 0, type: 1, color: col, intensity: gain, e1: thick }); };

/** Light the volumetric smoke with `col`: the fire ramp and the warm light on the cloud take its colour (a red storm, a blue one, a gold one). */
function tintedSmoke(f: Frame, col: RGB, smoke: string): void {
  setVolPalette(f, 'fire', smoke, [Math.min(1, col[0] * 1.1), Math.min(1, col[1] * 1.1), Math.min(1, col[2] * 1.1)]);
  f.volPalette.fire = [mixRGB(col, [0, 0, 0], 0.62), col, mixRGB(col, [1, 1, 1], 0.4), mixRGB(col, [1, 1, 1], 0.85)];
}

// ---------------------------------------------------------------------------------------------------------------------

export const thud: ShowEffect = {
  id: 'impact.thud', name: 'Thud', tagline: 'A heavy, quiet hit: the picture drops a hair and comes back, a low pulse of light crosses the screen; no flash, no dust.', category: 'candidate',
  params: [strength(), num('depth', 'How far it drops', G('Look'), 0.016, 0.004, 0.05, 0.001, '', 'How far the picture drops, as a fraction of its height.'), dur(0.7, 0.3, 3)],
  duration: (p) => n(p, 'duration'), impactAt: () => 0.02,
  cues: () => [{ t: 0.0, kind: 'thump', gain: 0.9, pitch: 0.7 }, { t: 0.02, kind: 'rumble', gain: 0.4, dur: 0.5, pitch: 0.8 }],
  build(f, t, p) {
    const D = n(p, 'duration');
    if (t < 0 || t >= D) return;
    const k = n(p, 'strength'), e = Math.exp(-t * 6.5) * smoothstep(0, 0.02, t) * (1 - smoothstep(D * 0.7, D, t)), w = Math.cos(t * 17);
    cam(f, 0, n(p, 'depth') * k * e * w, 0.0015 * k * e * Math.sin(t * 11), 0.012 * k * e);
    f.exposure *= 1 - 0.05 * k * e;
  },
};

export const recoil: ShowEffect = {
  id: 'impact.recoil', name: 'Recoil', tagline: 'The picture punches toward you, draws back past where it started and settles in two soft swings.', category: 'candidate',
  params: [cxp(), cyp(), strength(), dur(0.9, 0.4, 3)],
  duration: (p) => n(p, 'duration'), impactAt: () => 0.06,
  cues: () => [{ t: 0.05, kind: 'thump', gain: 0.9, pitch: 0.9 }, { t: 0.0, kind: 'whoosh', gain: 0.4, dur: 0.15, pitch: 1.6 }],
  build(f, t, p, ctx) {
    const D = n(p, 'duration');
    if (t < 0 || t >= D) return;
    const k = n(p, 'strength'), cx = n(p, 'cx') * ctx.aspect, cy = n(p, 'cy'), e = Math.exp(-t * 3.8) * (1 - smoothstep(D * 0.75, D, t));
    const zoom = 0.07 * k * e * Math.cos(t * 12 - 0.2);
    f.camera = { dx: f.camera.dx, dy: f.camera.dy, rot: f.camera.rot + 0.004 * k * e * Math.sin(t * 8), zoom: f.camera.zoom + Math.max(0, zoom) + 0.04 * k * e };
    f.distort.push({ kind: DISTORT.zoom, a: [0.05 * k * e * Math.cos(t * 12 - 0.2), 0, 0], b: [cx, cy, 0, 0] });
    ring(f, cx, cy, 0.2 + 0.8 * easeOutQuart(t / 0.5), [1, 1, 1], 0.5 * k * (1 - smoothstep(0, 0.5, t)), 0.05);
  },
};

export const stomp: ShowEffect = {
  id: 'impact.stomp', name: 'Footsteps', tagline: 'Something huge walks closer: each step lands harder, the picture sinks and rebounds and a low ring of dust runs out from the ground.', category: 'candidate',
  params: [num('steps', 'Steps', G('Look'), 4, 2, 8, 1, 'count', 'How many steps.', true), strength(), num('gap', 'Time between steps', G('Timing'), 0.7, 0.35, 1.5, 0.01, 's', 'How long between one step and the next.'), cyp(0.82), dur(3.6, 1, 10)],
  duration: (p) => n(p, 'duration'), impactAt: () => 0.1,
  cues: (p) => Array.from({ length: Math.round(n(p, 'steps')) }, (_, i) => ({ t: 0.1 + i * n(p, 'gap'), kind: 'thump' as const, gain: 0.55 + 0.45 * (i / Math.max(1, Math.round(n(p, 'steps')) - 1)), pitch: 0.65 })),
  build(f, t, p, ctx) {
    const D = n(p, 'duration'), N = Math.round(n(p, 'steps'));
    if (t < 0 || t >= D) return;
    const k = n(p, 'strength'), gap = n(p, 'gap'), cy = n(p, 'cy');
    let dy = 0, zoom = 0, rot = 0;
    for (let i = 0; i < N; i++) {
      const tl = t - (0.1 + i * gap);
      if (tl < 0 || tl > 1.4) continue;
      const power = 0.5 + 0.5 * (i / Math.max(1, N - 1)), e = Math.exp(-tl * 7) * power, side = i % 2 ? 1 : -1;
      dy += 0.022 * k * e * Math.cos(tl * 22); zoom += 0.014 * k * e; rot += side * 0.004 * k * e * Math.sin(tl * 15);
      const R = (0.2 + 0.8 * easeOutQuart(Math.min(1, tl / 0.7))) * (0.7 + 0.5 * power);
      for (let j = 0; j < L(ctx, 14); j++) {
        const sd = (j % 2 ? 1 : -1), a = h1(i * 31 + j) * 0.6, x = ctx.aspect / 2 + sd * R * (0.3 + 0.7 * h1(i * 7 + j * 3)) * ctx.aspect * 0.55;
        f.alphaSprites.push({ x, y: cy - 0.01 - a * 0.04 * tl, hw: 0.04 + 0.05 * tl, hh: 0.025 + 0.03 * tl, rot: 0, type: 5, color: [0.6, 0.55, 0.5], intensity: 0.42 * power * k * (1 - smoothstep(0.1, 1.2, tl)), e2: i * 20 + j });
      }
    }
    cam(f, 0, dy, rot, zoom);
  },
};

export const blast: ShowEffect = {
  id: 'impact.blast', name: 'Blast', tagline: 'An explosion at a point: a flash, a fireball with a rolling shock ring, a real shove through the picture, smoke and sparks, and a hard shake that dies away.', category: 'candidate',
  params: [cxp(), cyp(0.55), strength(), enm('fire', 'Fire', G('Look'), 'fire', [['fire', 'Orange'], ['blue', 'Blue'], ['green', 'Green'], ['violet', 'Violet'], ['white', 'White-hot']], 'The colour of the fire.'), dur(1.8, 0.8, 5)],
  duration: (p) => n(p, 'duration'), impactAt: () => 0.04,
  cues: () => [{ t: 0.03, kind: 'thump', gain: 1, pitch: 0.7 }, { t: 0.05, kind: 'rumble', gain: 0.7, dur: 0.8, pitch: 0.7 }],
  build(f, t, p, ctx) {
    const D = n(p, 'duration');
    if (t < 0 || t >= D) return;
    const k = n(p, 'strength'), cx = n(p, 'cx') * ctx.aspect, cy = n(p, 'cy'), pal = FIRE_PALETTES[s(p, 'fire')] ?? FIRE_PALETTES.fire!, hot = mixRGB(pal[1]!, pal[2]!, 0.5);
    const rise = smoothstep(0, 0.02, t), e = rise * Math.exp(-t * 6);
    cam(f, 0.011 * k * e * Math.sin(t * 66), 0.009 * k * e * Math.sin(t * 57 + 1), 0.005 * k * e * Math.sin(t * 43), 0.03 * k * e);
    f.distort.push({ kind: DISTORT.zoom, a: [0.08 * k * Math.exp(-t * 14) * rise, 0, 0], b: [cx, cy, 0, 0] });
    f.exposure *= 1 + 0.12 * k * Math.exp(-t * 14);
    flash(f, cx, cy, 0.42 * k, [1, 0.97, 0.88], 1.8 * Math.exp(-t * 14));
    ring(f, cx, cy, 0.12 + 1.2 * easeOutQuart(t / 0.6), hot, 1.2 * k * (1 - smoothstep(0, 0.6, t)), 0.06);
    setVolPalette(f, s(p, 'fire'), 'black');
    if (t < 1.0) fireball(f, { x: cx, y: cy, size: 0.18 * k * (0.5 + 1.1 * easeOutCubic(Math.min(1, t / 0.9))), age: 0.04 + 0.7 * t, seed: 5.3, t: t * 2, heat: 1, alpha: 1 - smoothstep(0.5, 1.0, t) });
    f.additive.push({ x: cx, y: cy, hw: 0.7 * k, hh: 0.7 * k, rot: 0, type: 0, color: hot, intensity: 0.5 * Math.exp(-t * 4), e1: 1 });
    for (let i = 0; i < L(ctx, 7); i++) {
      const a = h1(i * 5 + 1) * TAU, d = 0.16 * k * easeOutCubic(t / 1.4) * (0.6 + 0.8 * h1(i * 3 + 2));
      smokePuff(f, { x: cx + Math.cos(a) * d, y: cy + Math.sin(a) * d - 0.08 * t, size: 0.14 * k * (0.6 + 0.9 * easeOutCubic(t / 1.4)), age: clamp(t / 1.7) * 0.9, seed: i * 2.1, t, alpha: 0.85 * smoothstep(0.05, 0.25, t) * (1 - smoothstep(1.1, 1.8, t)), heat: 0.4 * Math.exp(-t * 3), light: [0.3, -0.9], soft: 0.3 });
    }
    for (let i = 0; i < L(ctx, 30); i++) {
      const a = h1(i * 7 + 3) * TAU, v = (0.5 + 0.9 * h1(i * 11 + 5)) * 0.9 * k, tt = t * 1.3, x = cx + Math.cos(a) * v * tt * 0.7, y = cy + Math.sin(a) * v * tt * 0.7 + 0.45 * tt * tt;
      f.additive.push({ x, y, hw: 0.025, hh: 0.0028, rot: Math.atan2(Math.sin(a) * v * 0.7 + 0.9 * tt, Math.cos(a) * v * 0.7) + Math.PI, type: 4, color: mixRGB(hot, [1, 1, 1], 0.4), intensity: 1.6 * (1 - smoothstep(0.2, 1.2, t)), e1: 1.5 });
    }
  },
};

export const crack: ShowEffect = {
  id: 'impact.crack', name: 'Cracked screen', tagline: 'The hit lands and the glass of the screen cracks from the point of impact: thin white fractures race outward and stay, with a hard shake and a flash.', category: 'candidate',
  params: [cxp(), cyp(0.5), strength(), num('seed', 'Variation', G('Look'), 4, 1, 99, 1, '', 'Pick a different crack pattern.', true), num('hold', 'Cracks stay for', G('Timing'), 1.6, 0.2, 6, 0.01, 's', 'How long the cracks remain before they fade.'), dur(2.6, 0.8, 8)],
  duration: (p) => n(p, 'duration'), impactAt: () => 0.04,
  cues: () => [{ t: 0.03, kind: 'thump', gain: 1, pitch: 0.9 }, { t: 0.05, kind: 'crack', gain: 0.9, pitch: 1.1 }, { t: 0.12, kind: 'shatter', gain: 0.4, dur: 0.5, pitch: 2 }],
  build(f, t, p, ctx) {
    const D = n(p, 'duration');
    if (t < 0 || t >= D) return;
    const k = n(p, 'strength'), cx = n(p, 'cx') * ctx.aspect, cy = n(p, 'cy'), seed = n(p, 'seed'), hold = n(p, 'hold');
    const e = smoothstep(0, 0.02, t) * Math.exp(-t * 8);
    // a glint runs out along the glass and the fractures catch the light for a moment after the hit
    cam(f, 0.01 * k * e * Math.sin(t * 64), 0.008 * k * e * Math.sin(t * 52 + 1), 0.004 * k * e * Math.sin(t * 40), 0.03 * k * e);
    flash(f, cx, cy, 0.3 * k, [1, 1, 1], 1.6 * Math.exp(-t * 15));
    f.exposure *= 1 + 0.08 * k * Math.exp(-t * 15);
    const fade = 1 - smoothstep(hold, hold + 0.8, t), grow = easeOutQuart(clamp(t / 0.28));
    const rng = makeRng(seed * 977 + 3), R = Math.hypot(ctx.aspect, 1) * 0.75;
    // long main cracks from the point of impact, each with a few shorter ones forking off it
    const N = 11;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * TAU + (rng.next() - 0.5) * 0.45, len = R * (0.35 + 0.65 * rng.next()) * grow, pts = jag(rng, { x: cx, y: cy }, { x: cx + Math.cos(a) * len, y: cy + Math.sin(a) * len }, len * 0.045, 4, 0.5);
      for (let j = 1; j < pts.length; j++) { const w = 0.0075 * (1 - 0.78 * (j / pts.length)); segment(f.polys, pts[j - 1]!, pts[j]!, w * 2.4 * k, [0.02, 0.03, 0.06], 0.7 * fade); segment(f.polys, pts[j - 1]!, pts[j]!, w * k, [0.96, 0.985, 1], 1.0 * fade); f.additive.push({ x: pts[j]!.x, y: pts[j]!.y, hw: 0.018 * (1 - 0.7 * (j / pts.length)) * k, hh: 0.018 * (1 - 0.7 * (j / pts.length)) * k, rot: 0, type: 0, color: [0.8, 0.92, 1], intensity: 0.35 * fade * Math.exp(-t * 1.5), e1: 2 }); }
      for (let b = 0; b < 3; b++) {
        const at = Math.floor(pts.length * (0.25 + 0.5 * rng.next())), p0 = pts[Math.min(at, pts.length - 1)]!, ba = a + (rng.next() < 0.5 ? -1 : 1) * (0.5 + 0.7 * rng.next()), bl = len * (0.12 + 0.2 * rng.next()), bp = jag(rng, p0, { x: p0.x + Math.cos(ba) * bl, y: p0.y + Math.sin(ba) * bl }, bl * 0.06, 3, 0.5);
        for (let j = 1; j < bp.length; j++) { segment(f.polys, bp[j - 1]!, bp[j]!, 0.0042 * (1 - 0.7 * (j / bp.length)) * 2 * k, [0.02, 0.03, 0.06], 0.55 * fade); segment(f.polys, bp[j - 1]!, bp[j]!, 0.0042 * (1 - 0.7 * (j / bp.length)) * k, [0.94, 0.98, 1], 0.95 * fade); }
      }
    }
    // concentric rings of fracture round the point, then a bright glint travelling out along each main crack
    for (let r = 1; r <= 3; r++) { const R2 = 0.06 * r * grow * (1 + 0.4 * rng.next()), pts: { x: number; y: number }[] = []; for (let j = 0; j <= 20; j++) { const a = (j / 20) * TAU, rr = R2 * (0.85 + 0.3 * rng.next()); pts.push({ x: cx + Math.cos(a) * rr, y: cy + Math.sin(a) * rr }); } for (let j = 1; j < pts.length; j++) segment(f.polys, pts[j - 1]!, pts[j]!, 0.0042 * k, [0.94, 0.98, 1], 0.9 * fade); }
    f.additive.push({ x: cx, y: cy, hw: 0.5 * k, hh: 0.5 * k, rot: 0, type: 0, color: [0.8, 0.9, 1], intensity: 0.28 * fade * (1 - smoothstep(0, 0.6, t)), e1: 1 });
  },
};

export const thunder: ShowEffect = {
  id: 'impact.thunder', name: 'Thunder', tagline: 'The whole sky flashes, a fork of lightning stands in the picture for an instant, and the shake of the thunder arrives a beat later and rolls away.', category: 'candidate',
  params: [cxp(), strength(), color('tint', 'Light colour', G('Look'), '#cfe0ff', 'The colour of the flash and the bolt.'), num('delay', 'Thunder arrives after', G('Timing'), 0.35, 0.05, 1.2, 0.01, 's', 'The pause between the flash and the shake.'), num('seed', 'Variation', G('Look'), 5, 1, 99, 1, '', 'Pick a different bolt.', true), dur(2.2, 0.8, 6)],
  duration: (p) => n(p, 'duration'), impactAt: () => 0.02,
  cues: (p) => [{ t: 0.0, kind: 'crack', gain: 0.8 }, { t: n(p, 'delay'), kind: 'rumble', gain: 0.9, dur: 1.4, pitch: 0.7 }],
  build(f, t, p, ctx) {
    const D = n(p, 'duration');
    if (t < 0 || t >= D) return;
    const k = n(p, 'strength'), cx = n(p, 'cx') * ctx.aspect, col = hex(s(p, 'tint')), d = n(p, 'delay');
    const fl = (Math.exp(-t * 13) + 0.7 * Math.exp(-Math.max(0, t - 0.11) * 16) * (t > 0.11 ? 1 : 0) + 0.45 * Math.exp(-Math.max(0, t - 0.22) * 14) * (t > 0.22 ? 1 : 0)) * smoothstep(0, 0.012, t);
    f.exposure *= 1 + 0.35 * k * fl;
    f.additive.push({ x: ctx.aspect / 2, y: 0.25, hw: ctx.aspect * 0.9, hh: 0.7, rot: 0, type: 0, color: col, intensity: 0.7 * k * fl, e1: 0.5 });
    if (t < 0.5) {
      const rng = makeRng(n(p, 'seed') * 131 + 9), origin = { x: cx + (rng.next() - 0.5) * 0.3, y: -0.04 }, ang = Math.atan2(0.55 - origin.y, 0.0 + (cx - origin.x)), reach = Math.hypot(0.55 - origin.y, cx - origin.x);
      f.boltCore = [1, 1, 1]; f.boltGlow = col;
      const a = clamp(t / 0.05), vis = (t < 0.12 ? 1 : 0.55 * Math.exp(-(t - 0.12) * 14)) * Math.min(1, k);
      for (const arc of discharge(rng, origin, ang, reach * a, 1).slice(0, 10)) ribbon(f.bolts, arc.pts, arc.level === 0 ? 0.0125 : 0.0055, (arc.level === 0 ? 1.2 : 0.8) * vis, true, true, arc.level === 0 ? 0 : 0.2, 0.08);
    }
    const tl = t - d;
    if (tl > 0) {
      const e = Math.exp(-tl * 2.6) * smoothstep(0, 0.08, tl), roll = Math.sin(tl * 21) * 0.6 + Math.sin(tl * 33 + 1) * 0.4;
      cam(f, 0.0045 * k * e * roll, 0.007 * k * e * Math.sin(tl * 17), 0.002 * k * e * roll, 0.006 * k * e);
    }
  },
};

export const storm: ShowEffect = {
  id: 'impact.storm', name: 'Storm light', tagline: 'Dark billowing cloud fills the screen, lit from inside by flashes of red (or any colour) lightning that flicker through it, with forks that show and go.', category: 'candidate',
  params: [color('tint', 'Light colour', G('Look'), '#ff3a2a', 'The colour the cloud is lit with.'), strength(), num('flashes', 'Flashes', G('Look'), 5, 1, 14, 1, 'count', 'How many times the cloud lights up.', true), num('cloud', 'Cloud', G('Look'), 1, 0, 1.5, 0.01, 'x', 'How much dark cloud fills the screen.'), num('shake', 'Shake with the thunder', G('Look'), 0.6, 0, 2, 0.01, 'x', 'How much each flash shakes the picture.'), num('seed', 'Variation', G('Look'), 4, 1, 99, 1, '', 'Pick a different storm.', true), dur(6, 2, 20)],
  duration: (p) => n(p, 'duration'), impactAt: () => 1,
  cues: (p) => Array.from({ length: Math.round(n(p, 'flashes')) }, (_, i) => ({ t: 0.5 + (i * (n(p, 'duration') - 1.4)) / Math.max(1, Math.round(n(p, 'flashes'))), kind: i % 2 ? ('crack' as const) : ('rumble' as const), gain: 0.5, dur: 0.8, pitch: 0.8 })),
  build(f, t, p, ctx) {
    const D = n(p, 'duration');
    if (t < 0 || t >= D) return;
    const col = hex(s(p, 'tint')), k = n(p, 'strength'), N = Math.round(n(p, 'flashes')), seed = n(p, 'seed'), cloud = n(p, 'cloud'), env = smoothstep(0, 0.8, t) * (1 - smoothstep(D - 0.9, D, t));
    // when each flash happens: spread over the length, not evenly
    const times: number[] = []; for (let i = 0; i < N; i++) times.push(0.5 + ((i + 0.15 + 0.7 * h1(seed * 31 + i)) / N) * (D - 1.5));
    let lit = 0.1; const hits: { t0: number; x: number; y: number; i: number }[] = [];
    times.forEach((t0, i) => { const tl = t - t0; if (tl < 0) return; lit += Math.exp(-tl * 6) + 0.6 * (tl > 0.09 ? Math.exp(-(tl - 0.09) * 9) : 0); if (tl < 0.55) hits.push({ t0, x: (0.1 + 0.8 * h1(seed * 17 + i * 3)) * ctx.aspect, y: 0.15 + 0.5 * h1(seed * 13 + i * 5), i }); });
    lit = clamp(lit, 0, 1.6);
    // the cloud: charcoal, billowing, its edges lit with the colour from inside, brightest where a flash is
    tintedSmoke(f, col, 'black');
    const NC = L(ctx, 34);
    for (let i = 0; i < NC; i++) {
      const hh = (m: number): number => h1(seed * 101 + i * 13 + m), x = hh(1) * ctx.aspect * 1.25 - ctx.aspect * 0.12, y = hh(2) * 1.15 - 0.07, sz = (0.24 + 0.24 * hh(3)) * cloud, drift = Math.sin(t * 0.3 + i) * 0.03;
      let near = 0; for (const h of hits) near = Math.max(near, Math.exp(-Math.hypot(h.x - x, h.y - y) * 3) * Math.exp(-(t - h.t0) * 5));
      smokePuff(f, { x: x + drift + t * 0.01 * (hh(4) - 0.5) * 4, y: y - Math.sin(t * 0.2 + i * 2) * 0.02, size: sz, age: 0.3 + 0.25 * hh(5), seed: seed * 7 + i, t: t * 0.4 + hh(6) * 5, alpha: 0.95 * env * Math.min(1, 0.55 + 0.45 * cloud), heat: Math.min(1, 0.05 + near * 1.3 + 0.18 * hh(8) * (0.5 + 0.5 * Math.sin(t * 1.7 + i))), light: [Math.sign(hh(7) - 0.5) * 0.4, -0.9], soft: 0.1 });
    }
    // a red-lit edge on every cloud: broad coloured glows where the flashes are
    for (const h of hits) {
      const tl = t - h.t0, a = Math.exp(-tl * 5.5) + 0.5 * (tl > 0.09 ? Math.exp(-(tl - 0.09) * 8) : 0);
      f.additive.push({ x: h.x, y: h.y, hw: 0.55 * k, hh: 0.45 * k, rot: 0, type: 0, color: col, intensity: 0.5 * a * k * env, e1: 0.8 });
      f.additive.push({ x: h.x, y: h.y, hw: 0.11 * k, hh: 0.11 * k, rot: 0, type: 3, color: mixRGB(col, [1, 1, 1], 0.45), intensity: 0.9 * a * k * env });
      if (tl < 0.4) {
        const rng = makeRng(seed * 977 + h.i * 31), origin = { x: h.x + (rng.next() - 0.5) * 0.35, y: -0.03 }, ang = Math.atan2(h.y + 0.1 - -0.03, h.x - (h.x + (rng.next() - 0.5) * 0.35)) , reach = Math.hypot(0.1 + h.y, 0.25) * (0.9 + 0.3 * rng.next());
        f.boltCore = [1, 0.95, 0.95]; f.boltGlow = col;
        const grow = clamp(tl / 0.05), vis = (tl < 0.1 ? 1 : Math.exp(-(tl - 0.1) * 12)) * env;
        for (const arc of discharge(rng, origin, ang, reach * grow, 1).slice(0, 8)) ribbon(f.bolts, arc.pts, arc.level === 0 ? 0.0095 : 0.0042, (arc.level === 0 ? 1.2 : 0.8) * vis * Math.min(1, k), true, true, arc.level === 0 ? 0 : 0.2, 0.08);
      }
    }
    f.exposure *= 1 + 0.18 * k * Math.max(0, lit - 0.1) * env;
    // the shake of each flash
    let dx = 0, dy = 0, rot = 0;
    times.forEach((t0) => { const tl = t - t0 - 0.12; if (tl < 0) return; const e = Math.exp(-tl * 5) * n(p, 'shake'); dx += 0.006 * e * Math.sin(tl * 48); dy += 0.005 * e * Math.sin(tl * 39 + 1); rot += 0.0025 * e * Math.sin(tl * 27); });
    cam(f, dx, dy, rot, 0);
  },
};

export const heartbeat: ShowEffect = {
  id: 'impact.heartbeat', name: 'Heartbeat', tagline: 'Two beats, a rest, again: the picture swells and darkens at the edges with each beat, a soft red pulse behind it. Tension, not violence.', category: 'candidate',
  params: [strength(), num('beats', 'Heartbeats', G('Timing'), 4, 1, 12, 1, 'count', 'How many double beats.', true), color('tint', 'Pulse colour', G('Look'), '#ff2a3a', 'The colour of the pulse at the edges.'), num('speed', 'Speed', G('Timing'), 1, 0.5, 2, 0.01, 'x', 'How fast the heart beats (the beats speed up on their own as it goes).'), dur(5, 1, 20)],
  duration: (p) => n(p, 'duration'), impactAt: () => 0.05,
  cues: (p) => Array.from({ length: Math.round(n(p, 'beats')) * 2 }, (_, i) => ({ t: 0.05 + Math.floor(i / 2) * (1.1 / n(p, 'speed')) + (i % 2) * 0.28 / n(p, 'speed'), kind: 'thump' as const, gain: i % 2 ? 0.5 : 0.8, pitch: 0.55 })),
  build(f, t, p, ctx) {
    const D = n(p, 'duration');
    if (t < 0 || t >= D) return;
    const k = n(p, 'strength'), col = hex(s(p, 'tint')), sp = n(p, 'speed'), env = smoothstep(0, 0.3, t) * (1 - smoothstep(D - 0.6, D, t));
    // the beats get a little quicker as the time goes on
    const tt = t * sp * (1 + 0.25 * (t / D)), ph = (tt % 1.1) / 1.1, beat = Math.max(Math.exp(-((ph - 0.06) ** 2) * 700), 0.62 * Math.exp(-((ph - 0.26) ** 2) * 600));
    const swell = beat * env * k;
    f.camera = { dx: f.camera.dx, dy: f.camera.dy, rot: f.camera.rot, zoom: f.camera.zoom + 0.028 * swell };
    f.exposure *= 1 - 0.1 * (1 - beat) * env * k;
    for (const [x, y, hw, hh] of [[ctx.aspect / 2, -0.05, ctx.aspect * 0.7, 0.28], [ctx.aspect / 2, 1.05, ctx.aspect * 0.7, 0.28], [-0.05, 0.5, 0.3, 0.8], [ctx.aspect + 0.05, 0.5, 0.3, 0.8]] as const) f.additive.push({ x, y, hw, hh, rot: 0, type: 0, color: col, intensity: (0.28 + 0.8 * beat) * env * k, e1: 0.8 });
    ring(f, ctx.aspect / 2, 0.5, 0.2 + 0.9 * easeOutQuart(clamp((ph - 0.04) / 0.4)), col, 0.5 * beat * env * k * (1 - smoothstep(0.04, 0.4, ph)), 0.06);
  },
};

export const rollingWave: ShowEffect = {
  id: 'impact.wave', name: 'Rolling wave', tagline: 'A wave of force rolls across the screen from one side to the other: the picture swells and bends as it passes, with a bright crest.', category: 'candidate',
  params: [enm('from', 'From', G('Look'), 'left', [['left', 'The left'], ['right', 'The right'], ['top', 'The top'], ['bottom', 'The bottom']], 'The side it starts from.'), strength(), color('tint', 'Crest colour', G('Look'), '#bfe6ff', 'The colour of the crest.'), dur(1.6, 0.6, 5)],
  duration: (p) => n(p, 'duration'), impactAt: () => 0.2,
  cues: (p) => [{ t: 0.0, kind: 'whoosh', gain: 0.6, dur: n(p, 'duration') * 0.8, pitch: 0.7 }, { t: n(p, 'duration') * 0.4, kind: 'thump', gain: 0.5, pitch: 0.8 }],
  build(f, t, p, ctx) {
    const D = n(p, 'duration');
    if (t < 0 || t >= D) return;
    const k = n(p, 'strength'), col = hex(s(p, 'tint')), dir = s(p, 'from'), u = clamp(t / D), env = smoothstep(0, 0.1, u) * (1 - smoothstep(0.8, 1, u));
    const horiz = dir === 'left' || dir === 'right', span = horiz ? ctx.aspect : 1, off = 0.4, rev = dir === 'right' || dir === 'bottom';
    const travel = easeOutCubic(u) * (span + off * 2.2), start = rev ? span + off : -off, front = rev ? start - travel : start + travel;
    // the wave is a ripple whose centre is far outside the screen, so across the picture it is nearly a straight front
    const ox = horiz ? start : ctx.aspect / 2, oy = horiz ? 0.5 : start;
    f.distort.push({ kind: DISTORT.ripple, a: [0.016 * k * env, travel, 0.34], b: [ox, oy, 0.55, 0.5] });
    const x = horiz ? front : ctx.aspect / 2, y = horiz ? 0.5 : front;
    f.additive.push({ x, y, hw: horiz ? 0.045 : ctx.aspect * 0.6, hh: horiz ? 0.65 : 0.045, rot: 0, type: 0, color: col, intensity: 0.9 * k * env, e1: 1.6 });
    f.additive.push({ x, y, hw: horiz ? 0.2 : ctx.aspect * 0.65, hh: horiz ? 0.75 : 0.2, rot: 0, type: 0, color: col, intensity: 0.3 * k * env, e1: 0.9 });
    cam(f, horiz ? 0 : 0.004 * k * env * Math.sin(t * 20), horiz ? 0.004 * k * env * Math.sin(t * 20) : 0, 0, 0.012 * k * env);
  },
};

export const SCREEN_FX: ShowEffect[] = [thud, recoil, stomp, blast, crack, thunder, storm, heartbeat, rollingWave];
void lerp;
