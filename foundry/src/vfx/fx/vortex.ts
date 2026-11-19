import { color, num } from '../../core/params';
import { n, s, type ShowEffect } from './effect';
import type { Frame } from '../engine/frame';
import { clamp, easeInOutCubic, easeOutQuart, h1, hex, lerp, smoothstep } from '../engine/math';

const G = (group: string) => ({ section: 'Effect', group });

/**
 * Effect 2 — vortex / implosion.
 * The background is pulled toward a centre and twisted by a spatially varying displacement (strongest at the core, zero and
 * flat at the radius) — never a whole-image rotate or scale. Build-up → peak/hold → release with a damped, slightly
 * overshooting unwind and an optional rebound wave. Content is pulled in by its own weight; a few motes spiral in with it.
 */
export const vortex: ShowEffect = {
  id: 'vortex',
  name: 'Vortex',
  tagline: 'Implosion that pulls, twists and releases the picture.',
  category: 'approved',
  params: [
    num('cx', 'Centre X', G('Centre'), 0.5, 0, 1, 0.001, '', 'Horizontal centre as a fraction of the image width (click or drag the preview).'),
    num('cy', 'Centre Y', G('Centre'), 0.54, 0, 1, 0.001, '', 'Vertical centre as a fraction of the image height.'),
    num('radius', 'Affected radius', G('Shape'), 0.6, 0.2, 1.4, 0.01, '', 'Radius of influence in image heights; beyond it the picture is untouched.'),
    num('pull', 'Pull strength', G('Shape'), 1.0, 0, 2.5, 0.01, '', 'How hard the content is drawn toward the centre.'),
    num('twist', 'Twist', G('Shape'), 2.0, 0, 7, 0.05, '', 'Twist at the core, in radians (6.28 = one full turn).'),
    num('build', 'Build-up', G('Timing'), 0.7, 0.1, 2.5, 0.01, 's', 'Time to wind up to the peak.'),
    num('hold', 'Hold', G('Timing'), 0.45, 0, 2.5, 0.01, 's', 'Time spent at the peak.'),
    num('release', 'Release', G('Timing'), 0.85, 0.1, 2.5, 0.01, 's', 'Time to unwind and settle.'),
    num('rebound', 'Rebound', G('Timing'), 0.7, 0, 1.5, 0.01, 'x', 'Strength of the outward rebound wave and bulge on release.'),
    color('tint', 'Glow colour', G('Look'), '#8fb6ff', 'Colour of the light drawn along the spiral arms.'),
  ],
  duration: (p) => n(p, 'build') + n(p, 'hold') + n(p, 'release') + 0.15,
  impactAt: (p) => n(p, 'build') + n(p, 'hold'),
  cues: (p) => [
    { t: 0, kind: 'sweep', gain: 0.6, dur: n(p, 'build') },
    { t: n(p, 'build') * 0.5, kind: 'rumble', gain: 0.45, dur: n(p, 'hold') + n(p, 'release') * 0.8 },
    { t: n(p, 'build') + n(p, 'hold'), kind: 'thump', gain: 0.75 },
    { t: n(p, 'build') + n(p, 'hold'), kind: 'whoosh', gain: 0.35, dur: n(p, 'release') },
  ],
  companion: {
    subtle: { radius: 0.4, pull: 0.55, twist: 1.0, build: 0.35, hold: 0.1, release: 0.55, rebound: 0.3 },
    scale: (p, k) => ({ ...p, pull: n(p, 'pull') * k, twist: n(p, 'twist') * k }),
  },
  build(f: Frame, t: number, p, ctx) {
    const B = n(p, 'build'), H = n(p, 'hold'), Rl = n(p, 'release');
    const D = B + H + Rl + 0.15;
    if (t < 0 || t >= D) return;
    const cx = n(p, 'cx') * ctx.aspect, cy = n(p, 'cy');
    const R = n(p, 'radius'), pullMax = Math.min(2.55, n(p, 'pull')), twMax = n(p, 'twist'), rebound = n(p, 'rebound');
    const tint = hex(s(p, 'tint'));

    let pull = 0, tw = 0, rad = R, energy = 0;
    if (t < B) {
      const a = t / B;
      const ease = easeInOutCubic(a);
      const antic = -0.1 * Math.sin(clamp(a / 0.22) * Math.PI) * (1 - smoothstep(0.2, 0.34, a)); // tiny outward breath first
      pull = pullMax * (0.1 * ease + 0.9 * ease ** 1.7) + antic * pullMax;
      tw = twMax * easeInOutCubic(a) ** 1.4;
      rad = R * lerp(0.62, 1, easeInOutCubic(a));
      energy = easeInOutCubic(a);
    } else if (t < B + H) {
      const a = (t - B) / Math.max(H, 1e-3);
      pull = pullMax * (1 + 0.035 * Math.sin(a * Math.PI * 2 * 2.2));          // the peak breathes
      tw = twMax * (1 + 0.22 * a);                                              // and keeps winding
      energy = 1;
    } else {
      const u = clamp((t - B - H) / Rl);
      const damp = 1 - smoothstep(0.86, 1, u);
      const settle = Math.exp(-4.2 * u);
      pull = pullMax * settle * Math.cos(u * Math.PI * 2 * 0.62 + 0.05) * damp * (u < 0.4 ? 1 : 0.5 + 0.5 * rebound);
      tw = twMax * 1.22 * settle * Math.cos(u * Math.PI * 2 * 0.9) * damp;
      energy = Math.exp(-3.2 * u) * damp;
    }
    if (t >= B + H + Rl) { pull = 0; tw = 0; energy = 0; }
    const maxRebound = -0.7;
    pull = Math.max(maxRebound, Math.min(2.55, pull));

    f.vortices.push({ cx, cy, radius: rad, pull, twist: tw, glow: 0.5 * energy, absorb: 0.6 * energy, color: tint });

    // Rebound: a thin travelling crest launched from the core at the moment of release.
    if (rebound > 0 && t > B + H) {
      const u = t - B - H;
      const fr = R * 1.12 * (1 - (1 - clamp(u / (Rl * 0.9))) ** 2.2);
      const life = (1 - smoothstep(Rl * 0.35, Rl * 0.95, u)) * clamp(u / 0.04);
      f.shocks.push({ cx, cy, radius: fr, width: 0.045 + 0.07 * (fr / Math.max(R, 0.1)), amp: 0.055 * rebound, pinchR: 0, pinchK: 0, light: 0.35 * rebound, color: tint, split: 0.06, life, strainLight: 0.18 });
    }

    // Motes spiral inward during build and hold, then are thrown outward and vanish on release.
    const N = 46;
    for (let i = 0; i < N; i++) {
      const t0 = h1(i * 3 + 1) * (B * 0.75);
      const life = B * 0.55 + H + 0.35;
      const a = (t - t0) / life;
      if (a <= 0 || a >= 1) continue;
      const r0 = R * lerp(0.55, 1.05, h1(i * 3 + 2));
      const ang0 = h1(i * 3 + 3) * Math.PI * 2;
      const prog = easeInOutCubic(a) ** 1.25;
      const r = r0 * (1 - prog) ** 1.5 + 0.012;
      const ang = ang0 + (r0 - r) * (2.0 + twMax * 0.5) + prog * 1.6;
      const x = cx + Math.cos(ang) * r, y = cy + Math.sin(ang) * r;
      const tx = -Math.sin(ang), ty = Math.cos(ang);   // tangent; motes streak along their spiral
      const rot = Math.atan2(-ty, -tx);
      const fade = Math.sin(clamp(a) * Math.PI) ** 0.8 * (t < B + H ? 1 : 1 - clamp((t - B - H) / 0.2));
      if (fade < 0.01) continue;
      const len = 0.02 + 0.07 * (1 - prog) * h1(i * 3 + 4) + 0.02;
      f.additive.push({ x, y, hw: len, hh: 0.0055 + 0.003 * h1(i * 3 + 5), rot: rot + Math.PI, type: 4, color: tint, intensity: 0.8 * fade * energy + 0.1 * fade, e1: 1.4 });
    }
    // Singularity: a small, cool, restrained core glow that grows with the pull.
    if (energy > 0.01) {
      const g = 0.04 + 0.1 * energy;
      f.additive.push({ x: cx, y: cy, hw: g, hh: g, rot: 0, type: 0, color: tint, intensity: 0.55 * energy, e1: 2 });
    }
    // Release flash.
    const rf = t - (B + H);
    if (rf > 0 && rf < 0.2) {
      const k = 1 - rf / 0.2;
      const gr = 0.08 + 0.22 * easeOutQuart(rf / 0.2);
      f.additive.push({ x: cx, y: cy, hw: gr, hh: gr, rot: 0, type: 3, color: tint, intensity: 1.1 * k * k * Math.min(1, 0.4 + rebound) });
    }
  },
};
