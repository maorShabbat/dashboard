import { color, enm, num } from '../../core/params';
import { n, s, type ShowEffect } from './effect';
import type { Frame, RGB, SmokePuff } from '../engine/frame';
import { clamp, easeOutBack, easeOutCubic, easeOutQuart, h1, hex, lerp, smoothstep } from '../engine/math';

const G = (group: string) => ({ section: 'Effect', group });

/** Smoke palettes: shadow, mid, light, rim (rim is the warm light thrown by the impact). */
const PALETTES: Record<string, [string, string, string, string]> = {
  night: ['#4f4a9c', '#9ba1e2', '#e3e6fe', '#ffc277'],
  ember: ['#5a2c22', '#b86f50', '#f0c096', '#ffd36b'],
  ash: ['#3a3a4c', '#8a8aa0', '#d8d8ea', '#ffc680'],
  toxic: ['#1f5a3e', '#4fae7a', '#b4f0c4', '#ecff7e'],
  arcane: ['#43238a', '#8a5ad8', '#d9bcff', '#74f3ff'],
};

const INK: RGB = [0.1, 0.05, 0.17];
const CREAM: RGB = [1, 0.95, 0.76];
const HOT: RGB = [1, 0.78, 0.2];

/** Spiky comic burst polygon as a triangle fan around (cx, cy), appended to `out` (x, y, r, g, b, a). */
function star(out: number[], cx: number, cy: number, R: number, rot: number, seed: number, col: RGB, a: number, spikes = 11): void {
  const pts: [number, number][] = [];
  for (let i = 0; i < spikes * 2; i++) {
    const outer = i % 2 === 0;
    const k = Math.floor(i / 2);
    const rr = outer ? R * lerp(0.72, 1.18, h1(seed + k * 13)) : R * lerp(0.38, 0.52, h1(seed + k * 29 + 5));
    const an = rot + (i / (spikes * 2)) * Math.PI * 2 + (outer ? 0 : (h1(seed + k * 7) - 0.5) * 0.12);
    pts.push([cx + Math.cos(an) * rr, cy + Math.sin(an) * rr]);
  }
  for (let i = 0; i < pts.length; i++) {
    const p0 = pts[i]!, p1 = pts[(i + 1) % pts.length]!;
    out.push(cx, cy, ...col, a, p0[0], p0[1], ...col, a, p1[0], p1[1], ...col, a);
  }
}

/**
 * Effect 3 — layered illustrated smoke burst (BANGERS flat 2.5D).
 * A comic star pops behind a core cloud; primary puffs fly out fast and are braked by drag (fast burst → slow expansion), a second
 * wave of smaller puffs trails them, curling wisps ride the edges, and ragged dust specks fall away. Every puff is its own
 * cel-shaded cloud (lobed SDF union, light sliver / shade band / deep shadow, ink stroke), with its own size, spin, drift and age,
 * lit from the impact point — so nothing repeats and the cluster keeps a strong silhouette until noise-driven breakup and fade.
 */
export const smoke: ShowEffect = {
  id: 'smoke',
  name: 'Smoke Burst',
  tagline: 'Layered, cel-shaded 2.5D smoke. Experimental: rejected in review for reading as outlined and illustrated rather than atmospheric.',
  category: 'experimental',
  params: [
    num('cx', 'Origin X', G('Origin'), 0.5, 0, 1, 0.001, '', 'Horizontal origin as a fraction of the image width (click or drag the preview).'),
    num('cy', 'Origin Y', G('Origin'), 0.74, 0, 1, 0.001, '', 'Vertical origin as a fraction of the image height.'),
    enm('palette', 'Palette', G('Look'), 'night', [['night', 'Night barn'], ['ember', 'Ember'], ['ash', 'Ash'], ['toxic', 'Toxic'], ['arcane', 'Arcane']], 'Smoke colour set: shadow, mid, light and the warm rim light from the impact.'),
    color('rim', 'Rim light', G('Look'), '#ffc277', 'Colour of the light the impact throws on the smoke.'),
    num('density', 'Density', G('Cloud'), 14, 5, 30, 1, 'count', 'Number of primary puffs (secondary puffs and wisps scale with it).', true),
    num('spread', 'Spread', G('Cloud'), 0.34, 0.12, 0.9, 0.01, '', 'How far the burst travels, in image heights.'),
    num('scale', 'Scale', G('Cloud'), 1, 0.4, 2.2, 0.01, 'x', 'Size of the individual puffs.'),
    num('turbulence', 'Turbulence', G('Motion'), 0.5, 0, 1, 0.01, '', 'Wobble of the puffs and curl of the wisps.'),
    num('drift', 'Upward drift', G('Motion'), 0.24, 0, 0.6, 0.01, '', 'How fast the cloud rises as it ages.'),
    num('lifetime', 'Lifetime', G('Motion'), 2.6, 1, 5, 0.05, 's', 'Total length of the burst, including breakup and fade.'),
  ],
  duration: (p) => n(p, 'lifetime'),
  impactAt: () => 0.05,
  cues: (p) => [{ t: 0.02, kind: 'thump', gain: 0.6 }, { t: 0.04, kind: 'whoosh', gain: 0.35, dur: Math.max(0.5, n(p, 'lifetime') * 0.4) }],
  build(f: Frame, t: number, p, ctx) {
    const D = n(p, 'lifetime');
    if (t < 0 || t >= D) return;
    const ox = n(p, 'cx') * ctx.aspect, oy = n(p, 'cy');
    const spread = n(p, 'spread'), scale = n(p, 'scale'), turb = n(p, 'turbulence'), drift = n(p, 'drift');
    const nP = Math.round(n(p, 'density'));
    const nS = Math.round(nP * 1.5);
    const pal = (PALETTES[s(p, 'palette')] ?? PALETTES.night!).map(hex) as [RGB, RGB, RGB, RGB];
    pal[3] = hex(s(p, 'rim'));
    f.smokePalette = pal as Frame['smokePalette'];

    const puffs: (SmokePuff & { z: number })[] = [];
    const lightFor = (x: number, y: number): [number, number] => {
      let dx = ox - x, dy = oy - y;
      const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
      // warm light from the impact point plus a cool constant key from upper right
      const lx = dx * 0.7 + 0.45, ly = dy * 0.7 - 0.62;
      const m = Math.hypot(lx, ly) || 1;
      return [lx / m, ly / m];
    };
    const push = (x: number, y: number, size: number, rot: number, age: number, seed: number, erode: number, tone: number, warm: number, alpha = 1): void => {
      if (age <= 0 || age >= 1 || size <= 0) return;
      const [lx, ly] = lightFor(x, y);
      puffs.push({ x, y, size, rot, age, seed, alpha, erode, tone, warmth: warm, lx, ly, z: y + size * 0.35 });
    };

    // --- core: a few big, slow-growing clouds that anchor the silhouette ----------------------------------------------
    for (let i = 0; i < 4; i++) {
      const life = D * lerp(0.82, 0.95, h1(i + 301)), age = t / life;
      const ang = -Math.PI / 2 + (i - 1.5) * 0.9;
      const off = 0.045 * scale * (0.4 + 0.6 * easeOutCubic(t / 0.5));
      const size = (0.27 + 0.07 * h1(i + 311)) * scale * (0.45 + 0.55 * easeOutBack(clamp(t / 0.36), 1.1)) * (1 + 0.4 * age);
      push(ox + Math.cos(ang) * off, oy + Math.sin(ang) * off * 0.7 - 0.03 * scale - drift * 0.15 * t * (0.3 + age), size, (i - 1.5) * 0.7 + 0.1 * t * (i % 2 ? 1 : -1), age, 101.3 + i * 17.9, smoothstep(0.45, 1, age) * 0.8, 0.1 + 0.2 * i / 3, 0.9 * Math.exp(-t * 3.2));
    }
    // --- primaries: fast radial burst, braked by drag, biased upward and sideways along the ground ---------------------
    for (let i = 0; i < nP; i++) {
      const u = (i + h1(i * 5 + 1) * 0.8) / nP;
      const a = -Math.PI / 2 + (u - 0.5) * Math.PI * 1.25;                 // fan centred on "up"
      const t0 = h1(i * 5 + 2) * 0.07;
      const tl = t - t0;
      if (tl <= 0) continue;
      const life = D * lerp(0.72, 1, h1(i * 5 + 3));
      const age = tl / life;
      const horiz = Math.abs(Math.cos(a));
      const dist = spread * lerp(0.4, 1, h1(i * 5 + 4)) * (0.85 + 0.35 * horiz);
      const travel = 1 - Math.exp(-5.2 * tl);
      const wob = turb * 0.028 * (1 - Math.exp(-tl * 2.4));
      const x = ox + Math.cos(a) * dist * travel + Math.sin(tl * 3.1 + i * 2.1) * wob;
      const y = oy + Math.sin(a) * dist * 1.0 * travel - drift * scale * tl * (0.25 + age * 0.9) + Math.cos(tl * 2.6 + i * 1.7) * wob * 0.7;
      const s0 = (0.12 + 0.2 * h1(i * 5 + 5) ** 1.6) * scale;
      const size = s0 * (0.28 + 0.72 * easeOutBack(clamp(tl / 0.3), 1.2)) * (1 + 0.55 * age);
      push(x, y, size, h1(i * 5 + 6) * 6.28 + (h1(i * 5 + 7) - 0.5) * 0.9 * tl, age, 3 + i * 7.31, smoothstep(0.4, 1, age) * 0.8, h1(i * 5 + 8), 0.85 * Math.exp(-tl * 2.4) * (1 - 0.4 * dist / Math.max(spread, 0.1)));
    }
    // --- secondaries: smaller, later, farther, lighter — they break the cluster's outline -----------------------------
    for (let i = 0; i < nS; i++) {
      const a = -Math.PI / 2 + (h1(i * 7 + 21) - 0.5) * Math.PI * 1.6;
      const t0 = 0.05 + h1(i * 7 + 22) * 0.3;
      const tl = t - t0;
      if (tl <= 0) continue;
      const life = D * lerp(0.45, 0.82, h1(i * 7 + 23));
      const age = tl / life;
      const dist = spread * lerp(0.7, 1.55, h1(i * 7 + 24));
      const travel = 1 - Math.exp(-3.6 * tl);
      const wob = turb * 0.04 * (1 - Math.exp(-tl * 2));
      const x = ox + Math.cos(a) * dist * travel + Math.sin(tl * 4.2 + i * 1.3) * wob;
      const y = oy + Math.sin(a) * dist * 0.85 * travel - drift * scale * tl * (0.5 + age) * 1.3 + Math.cos(tl * 3.4 + i) * wob * 0.8;
      const size = (0.06 + 0.065 * h1(i * 7 + 25)) * scale * (0.3 + 0.7 * easeOutCubic(clamp(tl / 0.4))) * (1 + 0.8 * age);
      push(x, y, size, h1(i * 7 + 26) * 6.28 + tl * (h1(i * 7 + 27) - 0.5) * 1.6, age, 211 + i * 5.77, smoothstep(0.3, 1, age) * 0.85, h1(i * 7 + 28), 0.7 * Math.exp(-tl * 3) * 0.9);
    }
    puffs.sort((a, b) => a.z - b.z);
    for (const q of puffs) { delete (q as { z?: number }).z; f.smoke.push(q); }

    // --- wisps: chains of ever smaller puffs that curl away from the cloud's edge and thin out ------------------------
    const nW = Math.max(3, Math.round(nP * 0.5));
    for (let i = 0; i < nW; i++) {
      const t0 = 0.12 + h1(i * 11 + 41) * 0.3;
      const a = -Math.PI / 2 + (h1(i * 11 + 43) - 0.5) * Math.PI * 1.6;
      const L = spread * lerp(1.0, 1.8, h1(i * 11 + 44));
      const curl = (h1(i * 11 + 45) - 0.5) * 2 * (0.3 + 0.7 * turb);
      const K = 7;
      for (let k = 0; k < K; k++) {
        const sk = k / (K - 1);
        const tl = t - t0 - k * 0.045;
        const life = D * lerp(0.42, 0.7, h1(i * 11 + 42)) * (1 - 0.35 * sk);
        const age = tl / life;
        if (tl <= 0 || age >= 1) continue;
        const u = 0.28 + 0.72 * sk * easeOutCubic(clamp(tl / 0.6));
        const along = L * u;
        const bend = curl * L * 0.5 * Math.sin(sk * Math.PI * 0.9) * easeOutCubic(clamp(tl / 0.8));
        const x = ox + Math.cos(a) * along - Math.sin(a) * bend;
        const y = oy + Math.sin(a) * along + Math.cos(a) * bend - drift * scale * tl * (0.5 + sk);
        const size = (0.075 - 0.045 * sk) * scale * (0.4 + 0.6 * easeOutBack(clamp(tl / 0.25), 1.1)) * (1 + 0.5 * age);
        push(x, y, size, h1(i * 11 + k * 3 + 47) * 6.28, age, 401 + i * 13.7 + k * 3.1, smoothstep(0.35, 1, age) * 0.95, h1(i * 11 + k + 48), 0.5 * Math.exp(-tl * 3));
      }
    }

    // --- dust specks: tiny ragged discs thrown out ballistically -------------------------------------------------------
    for (let i = 0; i < 16; i++) {
      const t0 = h1(i * 3 + 61) * 0.08;
      const tl = t - t0;
      const life = 0.7 + 0.8 * h1(i * 3 + 62);
      if (tl <= 0 || tl >= life) continue;
      const a = -Math.PI / 2 + (h1(i * 3 + 63) - 0.5) * Math.PI * 1.7;
      const v0 = spread * lerp(2.2, 4.4, h1(i * 3 + 64));
      const k = 3.4;
      const travel = (1 - Math.exp(-k * tl)) / k;
      const x = ox + Math.cos(a) * v0 * travel;
      const y = oy + Math.sin(a) * v0 * travel + 0.55 * tl * tl;
      const fade = 1 - smoothstep(life * 0.5, life, tl);
      const r = lerp(0.007, 0.018, h1(i * 3 + 65)) * scale;
      f.alphaSprites.push({ x, y, hw: r, hh: r, rot: 0, type: 5, color: [pal[0][0] * 1.3, pal[0][1] * 1.3, pal[0][2] * 1.3], intensity: fade * 0.95, e2: i });
    }

    // --- the pop: comic star behind the cloud + a short warm flash --------------------------------------------------
    if (t < 0.28) {
      const k = clamp(t / 0.075);
      const R = 0.2 * scale * easeOutBack(k, 2.2) * (1 - 0.3 * smoothstep(0.1, 0.28, t));
      const a = 1 - smoothstep(0.13, 0.28, t);
      if (R > 0 && a > 0) {
        star(f.underPolys, ox, oy - 0.02, R * 1.16, 0.12, 5, INK, a);
        star(f.underPolys, ox, oy - 0.02, R, 0.12, 5, CREAM, a);
        star(f.underPolys, ox, oy - 0.02, R * 0.6, 0.12 + 0.22, 17, HOT, a);
      }
      const fl = (1 - smoothstep(0.02, 0.2, t)) * smoothstep(0, 0.01, t);
      f.additive.push({ x: ox, y: oy, hw: 0.12, hh: 0.12, rot: 0, type: 3, color: [1, 0.8, 0.45], intensity: 0.9 * fl });
    }
  },
};
