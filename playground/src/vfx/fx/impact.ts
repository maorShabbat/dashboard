/** Impacts that hit the whole screen: a slam, a lightning strike, a comic burst and a ground pound. */
import { makeRng } from '../../core/util/prng';
import { color, num } from '../../core/params';
import { DISTORT, type Frame, type RGB } from '../engine/frame';
import { discharge, ribbon, slice } from '../engine/lightning';
import { clamp, easeOutCubic, easeOutQuart, h1, hex, lerp, smoothstep } from '../engine/math';
import { n, s, type ShowEffect } from './effect';

const G = (group: string) => ({ section: 'Effect', group });
const cxp = (d = 0.5) => num('cx', 'Centre X', G('Position'), d, 0, 1, 0.001, '', 'Horizontal position, as a fraction of the stage width.');
const cyp = (d = 0.5) => num('cy', 'Centre Y', G('Position'), d, 0, 1, 0.001, '', 'Vertical position, as a fraction of the stage height.');
const dur = (def: number, min = 0.3, max = 3) => num('duration', 'Duration', G('Timing'), def, min, max, 0.01, 's', 'Total length.');
const strength = (def = 1) => num('strength', 'Strength', G('Look'), def, 0, 2.5, 0.01, 'x', 'Overall force of the hit.');

function dustRing(f: Frame, cx: number, cy: number, t: number, R: number, count: number, col: RGB, squash: number, alpha: number): void {
  const k = clamp(t / 0.7);
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + h1(i) * 0.4, r = R * easeOutQuart(k) * (0.85 + 0.3 * h1(i + 50));
    const sz = lerp(0.03, 0.065, h1(i + 9)) * (0.5 + 0.9 * easeOutCubic(k));
    f.alphaSprites.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r * squash - 0.02 * k, hw: sz, hh: sz, rot: 0, type: 5, color: col, intensity: alpha * (1 - smoothstep(0.1, 1, k)), e2: i });
  }
}

export const slam: ShowEffect = {
  id: 'impact.slam', name: 'Slam', tagline: 'A heavy hit: the whole screen punches in, shakes, and a ring of dust bursts out.', category: 'candidate',
  params: [cxp(), cyp(0.55), strength(), num('punch', 'Zoom punch', G('Look'), 0.05, 0, 0.15, 0.002, '', 'How far the screen zooms in on impact.'), color('tint', 'Flash colour', G('Look'), '#fff0cf', 'Colour of the flash and ring.'), dur(0.85)],
  duration: (p) => n(p, 'duration'), impactAt: () => 0.03,
  cues: () => [{ t: 0.02, kind: 'thump', gain: 1 }, { t: 0.03, kind: 'rumble', gain: 0.5, dur: 0.4, pitch: 1.3 }],
  build(f: Frame, t, p, ctx) {
    const D = n(p, 'duration');
    if (t < 0 || t >= D) return;
    const k = n(p, 'strength'), cx = n(p, 'cx') * ctx.aspect, cy = n(p, 'cy'), tint = hex(s(p, 'tint'));
    const rise = smoothstep(0, 0.025, t), punch = rise * Math.exp(-t * 9) * (1 - smoothstep(D * 0.7, D, t));
    const shake = 0.012 * k * punch * Math.sin(t * 70), shake2 = 0.008 * k * punch * Math.sin(t * 53 + 1);
    f.camera = { dx: f.camera.dx + shake, dy: f.camera.dy + shake2, rot: f.camera.rot + 0.004 * k * punch * Math.sin(t * 41), zoom: f.camera.zoom + n(p, 'punch') * k * punch + 0.03 * k * punch };
    f.distort.push({ kind: DISTORT.zoom, a: [0.07 * k * Math.exp(-t * 16) * rise, 0, 0], b: [cx, cy, 0, 0] });
    f.additive.push({ x: cx, y: cy, hw: 0.2 * k, hh: 0.2 * k, rot: 0, type: 3, color: tint, intensity: 1.5 * k * Math.exp(-t * 16) });
    const ring = 0.15 + 0.9 * easeOutQuart(t / 0.5);
    f.additive.push({ x: cx, y: cy, hw: ring, hh: ring, rot: 0, type: 1, color: tint, intensity: 1.2 * k * (1 - smoothstep(0, 0.5, t)), e1: 0.07 });
    dustRing(f, cx, cy, t, 0.5 * k, 14, [0.62, 0.56, 0.5], 0.55, 0.5);
    f.exposure *= 1 + 0.07 * k * Math.exp(-t * 16);
  },
};

export const lightning: ShowEffect = {
  id: 'impact.lightning', name: 'Lightning strike', tagline: 'A branching bolt cracks down from the top of the screen and hits the target with a blinding flash.', category: 'candidate',
  params: [cxp(), cyp(0.6), num('branches', 'Branching', G('Look'), 1, 0, 2, 0.05, 'x', 'How many side branches the bolt throws.'), strength(), color('tint', 'Bolt colour', G('Look'), '#bfe3ff', 'Colour of the glow around the bolt.'), num('seed', 'Variation', G('Look'), 4, 1, 99, 1, '', 'Pick a different bolt shape.', true), dur(0.9)],
  duration: (p) => n(p, 'duration'), impactAt: () => 0.09,
  cues: () => [{ t: 0.0, kind: 'zap', gain: 0.9, dur: 0.5 }, { t: 0.09, kind: 'thump', gain: 1 }, { t: 0.1, kind: 'crack', gain: 0.8 }],
  build(f: Frame, t, p, ctx) {
    const D = n(p, 'duration');
    if (t < 0 || t >= D) return;
    const k = n(p, 'strength'), cx = n(p, 'cx') * ctx.aspect, cy = n(p, 'cy'), glow = hex(s(p, 'tint'));
    const rng = makeRng(n(p, 'seed') * 131 + 7);
    const origin = { x: cx + (rng.next() - 0.5) * 0.12, y: -0.04 };
    const dx = cx - origin.x, dy = cy - origin.y, reach = Math.hypot(dx, dy), ang = Math.atan2(dy, dx);
    const arcs = discharge(rng, origin, ang, reach, n(p, 'branches'));
    f.boltCore = [1, 1, 1]; f.boltGlow = glow;
    const grow = clamp(t / 0.09);
    const flick = t < 0.09 ? 1 : (0.5 + 0.5 * Math.sin(t * 90)) * Math.exp(-(t - 0.09) * 6) + 0.35 * Math.exp(-(t - 0.09) * 3) * (h1(Math.floor(t * 40)) > 0.5 ? 1 : 0.4);
    const fade = 1 - smoothstep(D * 0.5, D * 0.95, t);
    for (const arc of arcs) {
      const from = arc.level === 0 ? 0 : arc.at * grow, to = arc.level === 0 ? grow : clamp(grow + 0.15 - arc.at * 0.2) * 1;
      const part = slice(arc.pts, 0, arc.level === 0 ? grow : clamp((grow - arc.at) / 0.4));
      void from; void to;
      if (part.length < 2) continue;
      ribbon(f.bolts, part, arc.level === 0 ? 0.0045 : 0.0028, (arc.level === 0 ? 1 : 0.75) * k * flick * fade, true, arc.level === 0);
    }
    if (t >= 0.09) {
      const u = t - 0.09;
      f.additive.push({ x: cx, y: cy, hw: 0.28 * k, hh: 0.28 * k, rot: 0, type: 3, color: glow, intensity: 1.7 * k * Math.exp(-u * 9) });
      f.additive.push({ x: cx, y: cy, hw: 0.7 * k, hh: 0.12 * k, rot: 0, type: 2, color: glow, intensity: 0.9 * k * Math.exp(-u * 10) });
      const ring = 0.1 + 0.6 * easeOutQuart(u / 0.5);
      f.additive.push({ x: cx, y: cy, hw: ring, hh: ring * 0.6, rot: 0, type: 1, color: glow, intensity: 0.9 * k * (1 - smoothstep(0, 0.5, u)), e1: 0.08 });
      f.exposure *= 1 + 0.14 * k * Math.exp(-u * 12);
      f.camera = { ...f.camera, dx: f.camera.dx + 0.006 * k * Math.sin(u * 80) * Math.exp(-u * 8), dy: f.camera.dy, zoom: f.camera.zoom + 0.012 * k * Math.exp(-u * 8) };
    } else f.exposure *= 1 + 0.08 * k * grow;
  },
};

export const burst: ShowEffect = {
  id: 'impact.burst', name: 'Comic burst', tagline: 'Hard radial speed lines and a starburst: a cartoon "BAM" without the word.', category: 'candidate',
  params: [
    cxp(), cyp(),
    num('lines', 'Lines', G('Look'), 28, 8, 70, 1, 'count', 'Number of speed lines.', true),
    num('length', 'Length', G('Look'), 0.9, 0.2, 2, 0.01, '', 'Reach of the lines, in stage heights.'),
    color('tint', 'Colour', G('Look'), '#fff6c8', 'Colour of the lines.'),
    num('seed', 'Variation', G('Look'), 3, 1, 99, 1, '', 'Pick a different arrangement.', true),
    dur(0.55, 0.2, 2),
  ],
  duration: (p) => n(p, 'duration'), impactAt: () => 0.02,
  cues: () => [{ t: 0.01, kind: 'crack', gain: 0.7 }, { t: 0.02, kind: 'thump', gain: 0.6 }],
  build(f: Frame, t, p, ctx) {
    const D = n(p, 'duration');
    if (t < 0 || t >= D) return;
    const cx = n(p, 'cx') * ctx.aspect, cy = n(p, 'cy'), tint = hex(s(p, 'tint')), N = Math.round(n(p, 'lines')), L = n(p, 'length'), seed = n(p, 'seed') * 37;
    const u = t / D, grow = easeOutQuart(clamp(u / 0.35)), fade = 1 - smoothstep(0.45, 1, u);
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2 + (h1(seed + i) - 0.5) * (Math.PI * 2 / N) * 0.9;
      const r1 = L * (0.45 + 0.55 * h1(seed + i * 3 + 1)) * grow, r0 = r1 * lerp(0.3, 0.6, h1(seed + i * 3 + 2)) + 0.05 * u * u;
      if (r1 - r0 < 0.003) continue;
      const w = lerp(0.012, 0.045, h1(seed + i * 3 + 3));
      const ca = Math.cos(a), sa = Math.sin(a), px = -sa, py = ca;
      const alpha = fade * (i % 3 === 0 ? 1 : 0.8);
      const x0 = cx + ca * r0, y0 = cy + sa * r0, x1 = cx + ca * r1, y1 = cy + sa * r1;
      f.polys.push(x0 + px * w * 0.5, y0 + py * w * 0.5, tint[0], tint[1], tint[2], alpha, x0 - px * w * 0.5, y0 - py * w * 0.5, tint[0], tint[1], tint[2], alpha, x1, y1, tint[0], tint[1], tint[2], alpha);
    }
    const star = easeOutQuart(clamp(u / 0.25));
    f.additive.push({ x: cx, y: cy, hw: 0.25 * star, hh: 0.25 * star, rot: 0.2, type: 2, color: tint, intensity: 1.4 * fade });
    f.additive.push({ x: cx, y: cy, hw: 0.14 * star, hh: 0.14 * star, rot: 0, type: 3, color: tint, intensity: 1.3 * fade });
    f.exposure *= 1 + 0.05 * Math.exp(-t * 14);
  },
};

export const groundPound: ShowEffect = {
  id: 'impact.pound', name: 'Ground pound', tagline: 'Something heavy lands: the ground shakes, flat shock rings race sideways and dust billows.', category: 'candidate',
  params: [cxp(), cyp(0.78), strength(), color('tint', 'Dust colour', G('Look'), '#c9b79a', 'Colour of the dust.'), dur(1)],
  duration: (p) => n(p, 'duration'), impactAt: () => 0.03,
  cues: () => [{ t: 0.02, kind: 'thump', gain: 1 }, { t: 0.03, kind: 'rumble', gain: 0.8, dur: 0.6, pitch: 0.8 }],
  build(f: Frame, t, p, ctx) {
    const D = n(p, 'duration');
    if (t < 0 || t >= D) return;
    const k = n(p, 'strength'), cx = n(p, 'cx') * ctx.aspect, cy = n(p, 'cy'), dustCol = hex(s(p, 'tint'));
    const rise = smoothstep(0, 0.02, t), decay = rise * Math.exp(-t * 6.5) * (1 - smoothstep(D * 0.75, D, t));
    f.camera = { dx: f.camera.dx + 0.004 * k * decay * Math.sin(t * 61), dy: f.camera.dy + 0.016 * k * decay * Math.sin(t * 48), rot: f.camera.rot, zoom: f.camera.zoom + 0.022 * k * decay };
    for (const side of [-1, 1]) {
      const r = 0.1 + 1.1 * easeOutQuart(t / 0.7);
      f.additive.push({ x: cx + side * r * 0.5, y: cy, hw: r * 0.55, hh: 0.035 + 0.02 * (1 - t), rot: 0, type: 2, color: [1, 0.93, 0.8], intensity: 0.9 * k * (1 - smoothstep(0, 0.7, t)) });
    }
    f.additive.push({ x: cx, y: cy, hw: 0.2 * k, hh: 0.1 * k, rot: 0, type: 3, color: [1, 0.95, 0.85], intensity: 1.2 * k * Math.exp(-t * 14) });
    for (let i = 0; i < 18; i++) {
      const side = i % 2 ? 1 : -1, k2 = clamp((t - h1(i) * 0.08) / 0.85);
      if (k2 <= 0) continue;
      const x = cx + side * (0.04 + 0.6 * easeOutQuart(k2)) * (0.4 + 0.8 * h1(i + 30)) * k, y = cy - 0.02 - 0.1 * easeOutCubic(k2) * h1(i + 60) - 0.01 * k2;
      const sz = lerp(0.035, 0.085, h1(i + 90)) * (0.5 + easeOutCubic(k2));
      f.alphaSprites.push({ x, y, hw: sz, hh: sz * 0.8, rot: 0, type: 5, color: dustCol, intensity: 0.55 * k * (1 - smoothstep(0.15, 1, k2)), e2: i });
    }
    f.exposure *= 1 + 0.04 * k * Math.exp(-t * 14);
  },
};

export const IMPACTS: ShowEffect[] = [slam, lightning, burst, groundPound];
