import { enm, num } from '../../core/params';
import { makeRng } from '../../core/util/prng';
import { n, s, type EffectCtx, type PValues, type ShowEffect } from './effect';
import type { Frame, RGB } from '../engine/frame';
import { discharge, ribbon, slice } from '../engine/lightning';
import { clamp, easeInCubic, easeInOutCubic, easeOutBack, easeOutCubic, easeOutExpo, easeOutQuart, h1, lerp, smoothstep } from '../engine/math';

const G = (group: string) => ({ section: 'Effect', group });

interface Pal { core: RGB; glow: RGB; spark: RGB; smoke: [RGB, RGB, RGB, RGB] }
const PAL: Record<string, Pal> = {
  electric: { core: [0.93, 0.98, 1], glow: [0.2, 0.6, 1], spark: [0.62, 0.92, 1], smoke: [[0.1, 0.14, 0.36], [0.26, 0.38, 0.72], [0.62, 0.8, 1], [0.7, 0.95, 1]] },
  violet: { core: [1, 0.95, 1], glow: [0.66, 0.3, 1], spark: [0.92, 0.72, 1], smoke: [[0.2, 0.1, 0.38], [0.44, 0.26, 0.72], [0.78, 0.62, 1], [1, 0.8, 1]] },
  gold: { core: [1, 0.98, 0.86], glow: [1, 0.66, 0.18], spark: [1, 0.86, 0.42], smoke: [[0.34, 0.16, 0.1], [0.66, 0.4, 0.26], [0.95, 0.74, 0.5], [1, 0.9, 0.5]] },
  toxic: { core: [0.95, 1, 0.9], glow: [0.32, 1, 0.42], spark: [0.82, 1, 0.5], smoke: [[0.08, 0.26, 0.18], [0.22, 0.56, 0.36], [0.56, 0.9, 0.62], [0.9, 1, 0.6]] },
};

const CHARGE = 0.34;

function plasmaParams(durationDefault: number, ending: string) {
  return [
    num('cx', 'Centre X', G('Impact'), 0.5, 0, 1, 0.001, '', 'Horizontal impact position as a fraction of the image width (click or drag the preview).'),
    num('cy', 'Centre Y', G('Impact'), 0.42, 0, 1, 0.001, '', 'Vertical impact position as a fraction of the image height.'),
    enm('palette', 'Palette', G('Look'), 'electric', [['electric', 'Electric blue'], ['violet', 'Violet'], ['gold', 'Gold'], ['toxic', 'Toxic green']], 'Colour family of the core halo, arcs and sparks.'),
    num('intensity', 'Intensity', G('Look'), 1, 0.3, 1.8, 0.01, 'x', 'Overall brightness of the light; the picture is never pushed to white.'),
    num('reach', 'Arc reach', G('Arcs'), 0.55, 0.15, 1.1, 0.01, '', 'Length of the main arcs in image heights.'),
    num('density', 'Particle density', G('Arcs'), 1, 0, 2, 0.01, 'x', 'Amount of sparks, streaks and embers.'),
    num('distortion', 'Distortion', G('Wave'), 1, 0, 2, 0.01, 'x', 'How strongly the shockwave and impact squeeze displace the background.'),
    num('duration', 'Duration', G('Timing'), durationDefault, 1.2, 4, 0.05, 's', `Total length. ${ending}`),
  ];
}

const plasmaCommon = {
  duration: (p: PValues) => n(p, 'duration'),
  impactAt: () => CHARGE,
  cues: (p: PValues) => [
    { t: 0, kind: 'sweep' as const, gain: 0.55, dur: CHARGE },
    { t: CHARGE, kind: 'thump' as const, gain: 0.85 },
    { t: CHARGE, kind: 'zap' as const, gain: 0.8, dur: Math.min(0.8, n(p, 'duration') * 0.4) },
    { t: CHARGE + 0.55, kind: 'zap' as const, gain: 0.3, dur: 0.4, seed: 5 },
  ],
  companion: {
    subtle: { intensity: 0.7, reach: 0.38, density: 0.45, distortion: 0.45, duration: 1.3 },
    scale: (p: PValues, k: number) => ({ ...p, intensity: n(p, 'intensity') * k, reach: n(p, 'reach') * (0.6 + 0.4 * k), density: n(p, 'density') * k, distortion: n(p, 'distortion') * k }),
  },
};

/**
 * Effect 4 — energy impact with electrical discharge (v2).
 * One timeline: a short charge (motes converge, the picture dims and is drawn inward, the core flickers), a compact white-hot
 * impact, irregular branching arcs that snap outward and flicker at 20 Hz while the tail retreats, a shockwave that really
 * displaces the picture, sparks and streaks on drag + gravity. The ending is only light: the remaining arcs get shorter and sparser
 * as they die, a brief residual glow breathes, then everything fades to nothing. There is no smoke and no scorch.
 */
export const plasma: ShowEffect = {
  id: 'plasma',
  name: 'Plasma Impact',
  tagline: 'Charge, impact, branching arcs and real distortion; the electricity dissipates, a brief glow, then a clean fade.',
  category: 'approved',
  params: plasmaParams(1.7, 'The ending is electricity dissipating, a brief residual glow and a clean fade.'),
  ...plasmaCommon,
  build: (f, t, p, ctx) => buildPlasma(f, t, p, ctx, 'clean'),
};

/** The plasma as first approved (v1): same everything, but it ends with cartoon smoke and a scorch mark. Kept only as a frozen reference preset. */
export const plasmaV1: ShowEffect = {
  id: 'plasma-v1',
  name: 'Plasma Impact v1 (smoke ending)',
  tagline: 'The version reviewed before the ending change. Archived reference.',
  category: 'archived',
  params: plasmaParams(2.1, 'Includes the smoke ending of the original review.'),
  ...plasmaCommon,
  build: (f, t, p, ctx) => buildPlasma(f, t, p, ctx, 'smoke'),
};

function buildPlasma(f: Frame, t: number, p: PValues, ctx: EffectCtx, ending: 'clean' | 'smoke'): void {
  const D = n(p, 'duration');
  if (t < 0 || t >= D) return;
  const cx = n(p, 'cx') * ctx.aspect, cy = n(p, 'cy');
  const pal = PAL[s(p, 'palette')] ?? PAL.electric!;
  const I = n(p, 'intensity'), reach = n(p, 'reach'), dens = n(p, 'density'), dist = n(p, 'distortion');
  f.boltCore = pal.core; f.boltGlow = pal.glow; f.smokePalette = pal.smoke;
  const tI = t - CHARGE;                                  // time since impact (negative while charging)
  const O = { x: cx, y: cy };
  const tail = D - CHARGE;

  // ---------------------------------------------------------------------------------------------------- charge
  if (t < CHARGE) {
    const a = t / CHARGE;
    const e = easeInCubic(a);
    f.exposure = 1 - 0.1 * easeInOutCubic(a);
    f.shocks.push({ cx, cy, radius: 0, width: 0.05, amp: 0, pinchR: 0.34, pinchK: 0.22 * dist * e, light: 0.5 * I, color: pal.glow, split: 0, life: 1, strainLight: 0 });
    const fl = (0.78 + 0.22 * Math.sin(t * 90) * Math.sin(t * 37 + 1)) * smoothstep(0, 0.07, t);   // the core ignites from nothing
    const r = 0.014 + 0.07 * e;
    f.additive.push({ x: cx, y: cy, hw: r * 2.6, hh: r * 2.6, rot: 0, type: 0, color: pal.glow, intensity: (0.25 + 0.9 * e) * fl * I, e1: 1 });
    f.additive.push({ x: cx, y: cy, hw: r * 1.4, hh: r * 1.4, rot: 0, type: 3, color: pal.core, intensity: (0.2 + 0.9 * e) * fl * I });
    // converging motes
    for (let i = 0; i < Math.round(34 * dens); i++) {
      const t0 = h1(i * 3 + 1) * CHARGE * 0.55;
      const life = CHARGE * lerp(0.5, 0.95, h1(i * 3 + 2));
      const k = (t - t0) / life;
      if (k <= 0 || k >= 1) continue;
      const a0 = h1(i * 3 + 3) * Math.PI * 2;
      const r0 = lerp(0.18, 0.42, h1(i * 3 + 4));
      const pr = easeInCubic(k);
      const rr = r0 * (1 - pr) + 0.004;
      const ang = a0 + pr * 1.1;
      const px = cx + Math.cos(ang) * rr, py = cy + Math.sin(ang) * rr;
      const vx = -Math.cos(ang) - Math.sin(ang) * 0.5, vy = -Math.sin(ang) + Math.cos(ang) * 0.5;
      const dir = Math.atan2(vy, vx);
      const len = lerp(0.016, 0.05, k) * lerp(0.7, 1.2, h1(i * 3 + 5));
      f.additive.push({ x: px - Math.cos(dir) * len * 0.88, y: py - Math.sin(dir) * len * 0.88, hw: len, hh: 0.0065, rot: dir, type: 4, color: pal.spark, intensity: 1.3 * Math.sin(k * Math.PI) ** 0.6 * I, e1: 1.5 });
    }
    // crackle at the end of the charge: tiny arcs that flicker around the core
    if (a > 0.45) {
      const step = Math.floor(t * 24);
      const rng = makeRng(9100 + step * 31);
      const cnt = 2 + Math.floor(a * 3);
      for (let i = 0; i < cnt; i++) {
        const ang = rng.next() * Math.PI * 2;
        const arcs = discharge(rng, O, ang, rng.range(0.05, 0.14) * (0.6 + 0.8 * a), 0.2);
        for (const arc of arcs) ribbon(f.bolts, arc.pts, 0.0021, 0.7 * (a - 0.3) * I * (rng.next() < 0.18 ? 0.2 : 1), true);
      }
    }
    return;
  }

  // ---------------------------------------------------------------------------------------------------- impact
  const k = Math.max(0, tI);
  const pulseIn = smoothstep(0, 0.008, k);
  f.exposure = 1 + 0.11 * Math.exp(-k * 13) * pulseIn;
  // flash
  const flash = pulseIn * (1 - smoothstep(0.03, 0.2, k));
  if (flash > 0.001) {
    const r = 0.035 + 0.055 * easeOutCubic(k / 0.16);
    f.additive.push({ x: cx, y: cy, hw: r, hh: r, rot: 0, type: 3, color: pal.core, intensity: 0.85 * flash * I });
    const gl = 0.22 + 0.3 * easeOutQuart(k / 0.18);
    f.additive.push({ x: cx, y: cy, hw: gl, hh: gl, rot: Math.PI / 8, type: 2, color: pal.glow, intensity: 0.55 * flash * I });
  }
  const ringK = k / 0.22;
  if (ringK < 1) f.additive.push({ x: cx, y: cy, hw: 0.04 + 0.34 * easeOutExpo(ringK), hh: 0.04 + 0.34 * easeOutExpo(ringK), rot: 0, type: 1, color: pal.glow, intensity: 0.8 * (1 - ringK) ** 1.5 * I, e1: 0.05 });
  // lingering core glow (the plasma cooling) with a restrained flicker
  const clean = ending === 'clean';
const cool = pulseIn * (clean ? 1 - smoothstep(tail * 0.46, tail * 0.9, k) : 1 - smoothstep(0.15, tail * 0.55, k));   // the plasma cooling: a brief residual glow, then a clean fade
  if (cool > 0.001) {
    const fl = 0.85 + 0.15 * Math.sin(k * 70) * Math.sin(k * 23);
    const gr = (clean ? 0.085 : 0.06) + 0.04 * (1 - cool);
    f.additive.push({ x: cx, y: cy, hw: gr, hh: gr, rot: 0, type: 0, color: pal.glow, intensity: (clean ? 1.05 : 0.5) * cool * fl * I, e1: 1.5 });
    f.additive.push({ x: cx, y: cy, hw: 0.022, hh: 0.022, rot: 0, type: 3, color: pal.core, intensity: (clean ? 0.8 : 0.45) * cool * fl * I });
  }

  // distortion: the impact squeeze and a real displacing wave (+ a faint echo)
  const launch = 0.05;
  const sq = k < launch ? 1 - (1 - k / launch) ** 2 : Math.exp(-(k - launch) * 14) * Math.cos((k - launch) * 20) * (1 - smoothstep(0.22, 0.32, k));
  const span = Math.max(0.5, tail * 0.5);
  const pr = clamp((k - launch) / span);
  const front = k < launch ? 0 : 1.05 * (1 - (1 - pr) ** 2.1);
  const life = 1 - smoothstep(span * 0.55, span * 1.05, k);
  f.shocks.push({ cx, cy, radius: front, width: 0.026 + 0.05 * pr, amp: 0.062 * dist * (0.75 + 0.25 * (1 - pr)), pinchR: 0.22, pinchK: 0.8 * dist * sq, light: 0.8 * I, color: pal.glow, split: 0.18, life, strainLight: 0.2 });
  if (k > launch + 0.09) {
    const p2 = clamp((k - launch - 0.09) / span);
    f.shocks.push({ cx, cy, radius: 0.8 * (1 - (1 - p2) ** 2), width: 0.05 + 0.08 * p2, amp: 0.026 * dist, pinchR: 0, pinchK: 0, light: 0, color: pal.glow, split: 0.08, life: life * 0.8, strainLight: 0.1 });
  }

  // ---------------------------------------------------------------------------------------------------- arcs
  const step = Math.floor(k * 20);                                    // 20 Hz re-roll: the arcs crawl and flicker
  const nB = 9;
  for (let i = 0; i < nB; i++) {
    const ang = (i / nB) * Math.PI * 2 + (h1(i + 500) - 0.5) * 0.7;
    const rng = makeRng(1000 + i * 977 + step * 131);
    const L = reach * lerp(0.62, 1.15, h1(i + 520));
    const arcs = discharge(rng, { x: cx + Math.cos(ang) * 0.018, y: cy + Math.sin(ang) * 0.018 }, ang, L, 1);   // roots start just off-centre so they don't pile up into a white disc
    const grow = easeOutExpo(clamp(k / 0.075));
    const retreat = smoothstep(0.22 + 0.1 * h1(i + 540), 0.62 + 0.15 * h1(i + 560), k);
    const fade = 1 - smoothstep(0.3, 0.8, k);
    const flick = 0.72 + 0.5 * rng.next();
    if (fade <= 0.001) continue;
    for (const arc of arcs) {
      const delay = arc.level === 0 ? 0 : arc.at * 0.05;
      const g = clamp((grow - arc.at * 0.8) / (1 - arc.at * 0.8));
      const head = arc.level === 0 ? grow : clamp(easeOutExpo(clamp((k - delay) / 0.06)));
      const tailF = retreat * head * (arc.level === 0 ? 0.92 : 1);
      void g;
      const part = slice(arc.pts, tailF, head);
      if (part.length < 2) continue;
      const core = arc.level === 0 ? 0.0034 : arc.level === 1 ? 0.0023 : 0.0015;
      ribbon(f.bolts, part, core, (arc.level === 0 ? 0.85 : arc.level === 1 ? 0.65 : 0.5) * fade * flick * I, true, arc.level === 0);
    }
  }
  // residual crawlers: a few short arcs that keep flickering near the impact while the energy bleeds off.
  // Clean ending: they get shorter and sparser as they die (the electricity dissipates), and are gone before the glow is.
  const crawlEnd = tail * (clean ? 0.76 : 0.62);
  if (k > 0.2 && k < crawlEnd) {
    const u = clamp((k - 0.2) / (crawlEnd - 0.2));
    const fadeR = clean ? (1 - smoothstep(0.15, 1, u)) ** 1.4 : 1 - smoothstep(tail * 0.25, tail * 0.62, k);
    const stepR = Math.floor(k * 14);
    const rng = makeRng(7000 + stepR * 53);
    for (let i = 0; i < 4; i++) {
      if (rng.next() < (clean ? 0.45 + 0.45 * u : 0.45)) continue;
      const ang = rng.next() * Math.PI * 2;
      const len = rng.range(0.07, 0.2) * (clean ? 1 - 0.55 * u : 1);
      const arcs = discharge(rng, O, ang, len, 0.4);
      for (const arc of arcs) ribbon(f.bolts, arc.pts, arc.level === 0 ? 0.0024 : 0.0016, 0.7 * fadeR * I, true);
    }
  }

  // ---------------------------------------------------------------------------------------------------- sparks, streaks, glints, embers
  const nS = Math.round(60 * dens);
  for (let i = 0; i < nS; i++) {
    const t0 = h1(i * 5 + 1) * 0.05;
    const tl = k - t0;
    const life = lerp(0.35, 1.0, h1(i * 5 + 2)) * Math.min(1, tail / 1.6);
    if (tl <= 0 || tl >= life) continue;
    const a = h1(i * 5 + 3) * Math.PI * 2;
    const v0 = reach * lerp(1.6, 5.2, h1(i * 5 + 4) ** 0.8);
    const kd = 3.6, g = 0.7;
    const travel = (1 - Math.exp(-kd * tl)) / kd;
    const x = cx + Math.cos(a) * v0 * travel;
    const y = cy + Math.sin(a) * v0 * travel + 0.5 * g * tl * tl;
    const vx = Math.cos(a) * v0 * Math.exp(-kd * tl), vy = Math.sin(a) * v0 * Math.exp(-kd * tl) + g * tl;
    const sp = Math.hypot(vx, vy);
    const dir = Math.atan2(vy, vx);
    const len = clamp(sp * 0.045, 0.012, 0.14);
    const fade = (1 - smoothstep(life * 0.45, life, tl)) * (0.75 + 0.25 * Math.sin(tl * 50 + i));
    f.additive.push({ x: x - Math.cos(dir) * len * 0.88, y: y - Math.sin(dir) * len * 0.88, hw: len, hh: lerp(0.005, 0.009, h1(i * 5 + 5)), rot: dir, type: 4, color: i % 5 === 0 ? pal.core : pal.spark, intensity: 1.5 * fade * I, e1: 1.3 });
  }
  const nG = Math.round(14 * dens);
  for (let i = 0; i < nG; i++) {
    const t0 = 0.02 + h1(i * 7 + 61) * 0.35;
    const tl = k - t0, life = 0.28 + 0.3 * h1(i * 7 + 62);
    if (tl <= 0 || tl >= life) continue;
    const a = h1(i * 7 + 63) * Math.PI * 2;
    const rr = reach * lerp(0.15, 0.95, h1(i * 7 + 64)) * easeOutCubic(clamp(tl / 0.2 + 0.3));
    const sz = lerp(0.03, 0.075, h1(i * 7 + 65)) * Math.sin(Math.PI * tl / life) ** 0.8;
    f.additive.push({ x: cx + Math.cos(a) * rr, y: cy + Math.sin(a) * rr, hw: sz, hh: sz, rot: h1(i * 7 + 66) * 1.5, type: 2, color: pal.spark, intensity: 0.95 * I });
  }
  const nE = Math.round(20 * dens);
  for (let i = 0; i < nE; i++) {
    const t0 = 0.08 + h1(i * 9 + 71) * 0.4;
    const life0 = Math.min(tail * 0.85, lerp(0.9, 1.7, h1(i * 9 + 72)));
  const tl = k - t0, life = clean ? Math.min(life0, tail * 0.93 - t0) : life0;      // clean ending: every ember has faded before the end
    if (tl <= 0 || tl >= life) continue;
    const a = -Math.PI / 2 + (h1(i * 9 + 73) - 0.5) * Math.PI * 1.7;
    const v0 = reach * lerp(0.3, 1.1, h1(i * 9 + 74));
    const travel = (1 - Math.exp(-2.2 * tl)) / 2.2;
    const x = cx + Math.cos(a) * v0 * travel + Math.sin(tl * 5 + i) * 0.006;
    const y = cy + Math.sin(a) * v0 * travel - 0.06 * tl * (1 + h1(i * 9 + 75));
    const fade = (1 - smoothstep(life * 0.4, life, tl)) * (0.65 + 0.35 * Math.sin(tl * 31 + i * 3));
    const r = lerp(0.005, 0.011, h1(i * 9 + 76));
    f.additive.push({ x, y, hw: r * 2.4, hh: r * 2.4, rot: 0, type: 0, color: pal.spark, intensity: 0.95 * fade * I, e1: 2.5 });
  }

  // ---------------------------------------------------------------------------------------------------- legacy v1 ending: scorch + cold smoke (the clean ending has none)
  if (!clean) {
  const soot = smoothstep(0, 0.06, k) * (1 - smoothstep(tail * 0.4, tail * 0.92, k));
  if (soot > 0.001) f.alphaSprites.push({ x: cx, y: cy + 0.01, hw: 0.1, hh: 0.085, rot: 0, type: 5, color: [0.03, 0.02, 0.07], intensity: 0.55 * soot, e2: 3 });
  for (let i = 0; i < 6; i++) {
    const t0 = 0.12 + h1(i * 3 + 81) * 0.3;
    const tl = k - t0, life = tail * lerp(0.5, 0.85, h1(i * 3 + 82));
    const age = tl / life;
    if (tl <= 0 || age >= 1) continue;
    const a = -Math.PI / 2 + ((i + 0.5) / 6 - 0.5) * Math.PI * 1.5 + (h1(i * 3 + 83) - 0.5) * 0.4;
    const d = reach * lerp(0.1, 0.35, h1(i * 3 + 84)) * (1 - Math.exp(-3 * tl));
    const x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d - 0.09 * tl * (0.5 + age);
    const size = lerp(0.07, 0.14, h1(i * 3 + 85)) * (0.4 + 0.6 * easeOutBack(clamp(tl / 0.3), 1.1)) * (1 + 0.5 * age);
    f.smoke.push({ x, y, size, rot: h1(i * 3 + 86) * 6.28 + tl * 0.3, age, seed: 601 + i * 9.7, alpha: 0.9, erode: smoothstep(0.35, 1, age) * 0.9, tone: h1(i * 3 + 87), warmth: 0.9 * Math.exp(-tl * 2.2), lx: 0, ly: -1 });
  }
  }
}
