/**
 * Gradient model. One gradient description drives text faces, outlines, frames, amounts, multipliers, effect layers and image masks,
 * in the playground AND in exported players: the same `evalGradient` formulae are implemented in GLSL (see shaders) and baked to a
 * 256-texel lookup (`bakeLUT`) so every control (stops, angle, centre, scale, radius, repetition, reflection, animation) changes pixels.
 *
 * Fill space: u, v ∈ [0, 1] across the fill box (the text block, the frame, the image). `aspect` is box width / height so angles and
 * circles stay true. Angle 0° runs left → right, 90° top → bottom.
 */
import { parseColor } from '../../core/util/color';

export type GradientKind = 'solid' | 'linear' | 'radial' | 'conic' | 'reflected';
export type AnimDirection = 'forward' | 'reverse';
export type AnimLoop = 'loop' | 'pingpong' | 'once';

export interface GradientStop { id: string; pos: number; color: string; alpha: number }
export interface GradientAnim {
  enabled: boolean;
  /** Full ramp cycles per second. */
  speed: number;
  direction: AnimDirection;
  loop: AnimLoop;
}
/** A wavy ramp: the colour boundaries ripple along the direction they run in, like a liquid highlight. */
export interface GradientWave {
  /** How far the ramp shifts at the crest, as a fraction of the ramp (0.05 = 5 %). */
  amount: number;
  /** Ripples across the fill. */
  count: number;
  /** Offset of the ripple (0..1 = one full ripple). */
  phase: number;
  /** Ripples travelling per second (0 = still). */
  speed: number;
}
export interface Gradient {
  kind: GradientKind;
  stops: GradientStop[];
  /** Degrees. Linear / reflected: direction of travel. Conic: start angle. */
  angle: number;
  /** Centre of radial / conic / reflected, 0..1 of the fill box. */
  cx: number; cy: number;
  /** Stretch the ramp (1 = it spans the box; 2 = twice as long). */
  scale: number;
  /** Radial extent (1 = the box corner when centred). */
  radius: number;
  /** How many times the ramp repeats across the fill. */
  repeat: number;
  /** Mirror every other repetition instead of restarting. */
  reflect: boolean;
  /** Offset along the ramp (0..1 = one full cycle). */
  phase: number;
  anim: GradientAnim;
  /** Optional ripple of the ramp (absent = straight). */
  wave?: GradientWave;
}

let stopCounter = 0;
export const newStopId = (): string => `s${(stopCounter++).toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
export const stop = (pos: number, color: string, alpha = 1, id?: string): GradientStop => ({ id: id ?? newStopId(), pos, color, alpha });

export const DEFAULT_ANIM: GradientAnim = { enabled: false, speed: 0.5, direction: 'forward', loop: 'loop' };

export function makeGradient(kind: GradientKind, stops: [number, string, number?][], over: Partial<Gradient> = {}): Gradient {
  return {
    kind, stops: stops.map(([p, c, a], i) => stop(p, c, a ?? 1, `s${i}`)),
    angle: 90, cx: 0.5, cy: 0.5, scale: 1, radius: 1, repeat: 1, reflect: false, phase: 0, anim: { ...DEFAULT_ANIM }, ...over,
  };
}
export const solid = (color: string, alpha = 1): Gradient => makeGradient('solid', [[0, color, alpha]]);

const clamp = (v: number, lo = 0, hi = 1) => (v < lo ? lo : v > hi ? hi : v);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export const sortedStops = (g: Gradient): GradientStop[] => [...g.stops].sort((a, b) => a.pos - b.pos);

/** Colour (non-premultiplied, 0..1 channels + alpha) of the ramp at t ∈ [0, 1]. */
export function rampAt(g: Gradient, t: number): [number, number, number, number] {
  const s = sortedStops(g);
  if (!s.length) return [1, 1, 1, 1];
  const rgb = (st: GradientStop) => { const c = parseColor(st.color); return [c.r / 255, c.g / 255, c.b / 255] as const; };
  if (g.kind === 'solid' || s.length === 1) { const c = rgb(s[0]!); return [c[0], c[1], c[2], s[0]!.alpha]; }
  if (t <= s[0]!.pos) { const c = rgb(s[0]!); return [c[0], c[1], c[2], s[0]!.alpha]; }
  const last = s[s.length - 1]!;
  if (t >= last.pos) { const c = rgb(last); return [c[0], c[1], c[2], last.alpha]; }
  for (let i = 0; i < s.length - 1; i++) {
    const a = s[i]!, b = s[i + 1]!;
    if (t >= a.pos && t <= b.pos) {
      const k = b.pos === a.pos ? 1 : (t - a.pos) / (b.pos - a.pos);
      const ca = rgb(a), cb = rgb(b);
      return [lerp(ca[0], cb[0], k), lerp(ca[1], cb[1], k), lerp(ca[2], cb[2], k), lerp(a.alpha, b.alpha, k)];
    }
  }
  const c = rgb(last); return [c[0], c[1], c[2], last.alpha];
}

export const LUT_SIZE = 256;

/** The ramp as 256 RGBA8 texels (non-premultiplied). Sampled with linear filtering by the shaders. */
export function bakeLUT(g: Gradient, size = LUT_SIZE): Uint8ClampedArray {
  const out = new Uint8ClampedArray(size * 4);
  for (let i = 0; i < size; i++) {
    const c = rampAt(g, i / (size - 1));
    out[i * 4] = Math.round(c[0] * 255); out[i * 4 + 1] = Math.round(c[1] * 255); out[i * 4 + 2] = Math.round(c[2] * 255); out[i * 4 + 3] = Math.round(c[3] * 255);
  }
  return out;
}

/** Offset along the ramp at time `time` (seconds): the static phase plus the animation. */
export function phaseAt(g: Gradient, time: number): number {
  const a = g.anim;
  if (!a.enabled) return g.phase;
  const sign = a.direction === 'reverse' ? -1 : 1;
  const cycles = a.speed * Math.max(0, time);
  let travel: number;
  if (a.loop === 'loop') travel = cycles;
  else if (a.loop === 'pingpong') travel = 1 - Math.abs((cycles % 2) - 1);
  else travel = Math.min(cycles, 1);
  return g.phase + sign * travel;
}

/** Whether the ramp wraps (repeats) rather than clamps at its ends. Static single-pass gradients clamp; anything that moves or repeats wraps. */
export const wraps = (g: Gradient): boolean => g.repeat !== 1 || g.phase !== 0 || g.anim.enabled || g.reflect;

const tri = (t: number) => 1 - Math.abs((((t % 2) + 2) % 2) - 1);
const fract = (t: number) => t - Math.floor(t);

/** How far a wavy ramp shifts at fill-space point (px, py) (relative to the gradient centre). Mirrors the shader. */
export function waveOffset(g: Gradient, px: number, py: number, aspect: number, time: number): number {
  const w = g.wave!;
  let along: number;                                              // position along the line the colour boundaries run in
  if (g.kind === 'linear' || g.kind === 'reflected') {
    const a = (g.angle * Math.PI) / 180, dx = -Math.sin(a), dy = Math.cos(a);
    const L = Math.abs(dx) * aspect + Math.abs(dy);
    along = (px * dx + py * dy) / L + 0.5;
  } else if (g.kind === 'radial') along = Math.atan2(py, px) / (2 * Math.PI);
  else along = Math.hypot(px, py) / (0.5 * Math.sqrt(aspect * aspect + 1));
  return w.amount * Math.sin(2 * Math.PI * (w.count * along + w.phase + w.speed * Math.max(0, time)));
}

/** Position along the ramp (before the lookup) for fill-space point (u, v). Mirrors the shader exactly. */
export function evalT(g: Gradient, u: number, v: number, aspect: number, time = 0): number {
  const px = (u - g.cx) * aspect, py = v - g.cy;
  const a = (g.angle * Math.PI) / 180;
  let t: number;
  switch (g.kind) {
    case 'solid': t = 0.5; break;
    case 'linear':
    case 'reflected': {
      const dx = Math.cos(a), dy = Math.sin(a);
      const L = Math.abs(dx) * aspect + Math.abs(dy);
      t = (px * dx + py * dy) / (L * Math.max(1e-4, g.scale)) + 0.5;
      if (g.kind === 'reflected') t = Math.abs(2 * t - 1);      // 0 on the centre line, 1 at both edges
      break;
    }
    case 'radial': {
      const R = 0.5 * Math.sqrt(aspect * aspect + 1);
      t = Math.hypot(px, py) / (R * Math.max(1e-4, g.radius) * Math.max(1e-4, g.scale));
      break;
    }
    case 'conic': t = fract((Math.atan2(py, px) - a) / (2 * Math.PI)); break;
  }
  if (g.kind === 'solid') return 0.5;
  if (g.wave && g.wave.amount !== 0) t += waveOffset(g, px, py, aspect, time);
  t = t * g.repeat + phaseAt(g, time);
  if (wraps(g)) t = g.reflect ? tri(t) : fract(t);
  return clamp(t);
}

/** Final colour (non-premultiplied RGBA 0..1) at a fill-space point and time. */
export function evalGradient(g: Gradient, u: number, v: number, aspect: number, time = 0): [number, number, number, number] {
  return rampAt(g, evalT(g, u, v, aspect, time));
}

/** The numbers the shader needs (packed into three vec4 uniforms). */
export interface GradientUniforms { g0: [number, number, number, number]; g1: [number, number, number, number]; g2: [number, number, number, number]; g3: [number, number, number, number] }
const KIND_CODE: Record<GradientKind, number> = { solid: 0, linear: 1, radial: 2, conic: 3, reflected: 4 };
export function gradientUniforms(g: Gradient, aspect: number, time: number): GradientUniforms {
  return {
    g0: [KIND_CODE[g.kind], (g.angle * Math.PI) / 180, g.cx, g.cy],
    g1: [Math.max(1e-4, g.scale), Math.max(1e-4, g.radius), g.repeat, g.reflect ? 1 : 0],
    g2: [phaseAt(g, time), wraps(g) ? 1 : 0, aspect, 0],
    g3: g.wave && g.wave.amount !== 0 ? [g.wave.amount, g.wave.count, g.wave.phase + g.wave.speed * Math.max(0, time), 1] : [0, 0, 0, 0],
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Editing operations (pure: return a new gradient). The editor and tests use the same functions.

const MIN_STOPS = 1;

export function withStop(g: Gradient, id: string, patch: Partial<Omit<GradientStop, 'id'>>): Gradient {
  return { ...g, stops: g.stops.map((s) => (s.id === id ? { ...s, ...patch, pos: patch.pos === undefined ? s.pos : clamp(patch.pos), alpha: patch.alpha === undefined ? s.alpha : clamp(patch.alpha) } : s)) };
}

/** Add a stop at `pos`, coloured like the ramp there so the picture does not change until it is edited. */
export function addStop(g: Gradient, pos: number): { gradient: Gradient; id: string } {
  const p = clamp(pos);
  const c = rampAt(g, p);
  const hex = '#' + [c[0], c[1], c[2]].map((x) => Math.round(x * 255).toString(16).padStart(2, '0')).join('');
  const s = stop(p, hex, c[3]);
  return { gradient: { ...g, stops: [...g.stops, s] }, id: s.id };
}

export function removeStop(g: Gradient, id: string): Gradient {
  if (g.stops.length <= MIN_STOPS) return g;
  return { ...g, stops: g.stops.filter((s) => s.id !== id) };
}

export function duplicateStop(g: Gradient, id: string): { gradient: Gradient; id: string } {
  const src = g.stops.find((s) => s.id === id);
  if (!src) return { gradient: g, id };
  // place the copy halfway to the next stop (or just before the end) so it is visible and draggable
  const sorted = sortedStops(g);
  const i = sorted.findIndex((s) => s.id === id);
  const next = sorted[i + 1];
  const pos = next ? (src.pos + next.pos) / 2 : clamp(src.pos - 0.05);
  const copy = stop(pos, src.color, src.alpha);
  return { gradient: { ...g, stops: [...g.stops, copy] }, id: copy.id };
}

export function reverseStops(g: Gradient): Gradient {
  return { ...g, stops: g.stops.map((s) => ({ ...s, pos: 1 - s.pos })) };
}

export function distributeEvenly(g: Gradient): Gradient {
  const s = sortedStops(g);
  if (s.length < 2) return g;
  const pos = new Map(s.map((st, i) => [st.id, i / (s.length - 1)]));
  return { ...g, stops: g.stops.map((st) => ({ ...st, pos: pos.get(st.id)! })) };
}

/** Switch the kind, keeping the stops and the shared controls. */
export function withKind(g: Gradient, kind: GradientKind): Gradient {
  const stops = kind === 'solid' ? [g.stops[0] ?? stop(0, '#ffffff')] : g.stops.length < 2 ? [...g.stops, stop(1, '#000000')] : g.stops;
  return { ...g, kind, stops };
}

export const gradientHash = (g: Gradient): string => {
  const s = sortedStops(g).map((x) => `${x.pos.toFixed(4)}${x.color}${x.alpha.toFixed(3)}`).join(',');
  return `${g.kind}|${s}|${g.angle}|${g.cx}|${g.cy}|${g.scale}|${g.radius}|${g.repeat}|${g.reflect ? 1 : 0}|${g.phase}|${g.anim.enabled ? `${g.anim.speed}/${g.anim.direction}/${g.anim.loop}` : '-'}|${g.wave ? `${g.wave.amount}/${g.wave.count}/${g.wave.phase}/${g.wave.speed}` : '-'}`;
};
/** Hash of the ramp only (what the lookup texture depends on). */
export const rampHash = (g: Gradient): string => `${g.kind === 'solid' ? 'S' : 'R'}|${sortedStops(g).map((x) => `${x.pos.toFixed(4)}${x.color}${x.alpha.toFixed(3)}`).join(',')}`;

export function cloneGradient(g: Gradient): Gradient {
  return { ...g, stops: g.stops.map((s) => ({ ...s })), anim: { ...g.anim }, ...(g.wave ? { wave: { ...g.wave } } : {}) };
}

// ---------------------------------------------------------------------------------------------------------------------
// Presets

export interface GradientPreset { id: string; name: string; gradient: Gradient }
const P = (id: string, name: string, g: Gradient): GradientPreset => ({ id, name, gradient: g });

export const GRADIENT_PRESETS: GradientPreset[] = [
  P('gold', 'Gold', makeGradient('linear', [[0, '#fff7c2'], [0.3, '#ffd84a'], [0.5, '#e69a00'], [0.52, '#fff0a0'], [0.78, '#e8a700'], [1, '#a85d00']], { angle: 90 })),
  P('chrome', 'Chrome', makeGradient('reflected', [[0, '#ffffff'], [0.16, '#d6e4f3'], [0.4, '#7089a6'], [0.56, '#1d2a3b'], [0.58, '#93abc6'], [1, '#f4f8fc']], { angle: 90 })),
  P('neon', 'Neon', makeGradient('linear', [[0, '#00f0ff'], [0.5, '#7a5cff'], [1, '#ff2bd6']], { angle: 0 })),
  P('rainbow', 'Rainbow', makeGradient('linear', [[0, '#ff3b3b'], [0.17, '#ff9d1c'], [0.34, '#ffe83a'], [0.5, '#3dff6b'], [0.67, '#2ec8ff'], [0.84, '#a35bff'], [1, '#ff3b3b']], { angle: 0, repeat: 1, anim: { enabled: true, speed: 0.35, direction: 'forward', loop: 'loop' } })),
  P('fire', 'Fire', makeGradient('linear', [[0, '#fff6b0'], [0.28, '#ffc400'], [0.58, '#ff5a00'], [1, '#b30000']], { angle: -90 })),
  P('ice', 'Ice', makeGradient('linear', [[0, '#ffffff'], [0.3, '#c8f3ff'], [0.65, '#61c9ff'], [1, '#2a64d8']], { angle: 90 })),
  P('alien', 'Alien plasma', makeGradient('linear', [[0, '#b8ff00'], [0.33, '#00ffa6'], [0.66, '#7a00ff'], [1, '#b8ff00']], { angle: 35, repeat: 1.5, anim: { enabled: true, speed: 0.4, direction: 'forward', loop: 'loop' } })),
];

export const gradientPreset = (id: string): Gradient => cloneGradient(GRADIENT_PRESETS.find((p) => p.id === id)!.gradient);
