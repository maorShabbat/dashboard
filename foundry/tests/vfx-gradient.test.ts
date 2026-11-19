import { describe, expect, it } from 'vitest';
import {
  GRADIENT_PRESETS, addStop, bakeLUT, distributeEvenly, duplicateStop, evalGradient, evalT, gradientHash, gradientUniforms, makeGradient, phaseAt, rampAt,
  removeStop, reverseStops, solid, sortedStops, withKind, withStop, wraps,
} from '../src/vfx/style/gradient';

const two = () => makeGradient('linear', [[0, '#000000'], [1, '#ffffff']], { angle: 0 });
const hex = (c: number[]) => c.slice(0, 3).map((x) => Math.round(x * 255));

describe('gradient evaluation', () => {
  it('linear: angle 0 runs left→right, 90 runs top→bottom, any angle works', () => {
    const g = two();
    expect(evalT(g, 0, 0.5, 1)).toBeCloseTo(0, 5);
    expect(evalT(g, 1, 0.5, 1)).toBeCloseTo(1, 5);
    expect(evalT(g, 0.5, 0.5, 1)).toBeCloseTo(0.5, 5);
    const down = { ...g, angle: 90 };
    expect(evalT(down, 0.5, 0, 1)).toBeCloseTo(0, 5);
    expect(evalT(down, 0.5, 1, 1)).toBeCloseTo(1, 5);
    const diag = { ...g, angle: 45 };
    expect(evalT(diag, 0, 0, 1)).toBeCloseTo(0, 5);
    expect(evalT(diag, 1, 1, 1)).toBeCloseTo(1, 5);
    expect(evalT(diag, 1, 0, 1)).toBeCloseTo(0.5, 5);
    expect(evalT({ ...g, angle: 137 }, 0.2, 0.7, 2)).not.toBeCloseTo(evalT({ ...g, angle: 31 }, 0.2, 0.7, 2), 3);
  });

  it('linear on a wide box keeps the angle true (aspect-corrected)', () => {
    const g = { ...two(), angle: 45 };
    // a 4:1 box: the 45° ramp spans |cos|*4 + |sin|*1 along its direction
    expect(evalT(g, 0, 0, 4)).toBeCloseTo(0, 5);
    expect(evalT(g, 1, 1, 4)).toBeCloseTo(1, 5);
  });

  it('radial is symmetric about the centre and the centre moves with cx/cy', () => {
    const g = makeGradient('radial', [[0, '#ffffff'], [1, '#000000']]);
    expect(evalT(g, 0.5, 0.5, 1)).toBeCloseTo(0, 5);
    expect(evalT(g, 0.8, 0.5, 1)).toBeCloseTo(evalT(g, 0.2, 0.5, 1), 5);
    const moved = { ...g, cx: 0.2, cy: 0.8 };
    expect(evalT(moved, 0.2, 0.8, 1)).toBeCloseTo(0, 5);
    expect(evalT(moved, 0.5, 0.5, 1)).toBeGreaterThan(0.2);
    // radius and scale both stretch the ramp
    expect(evalT({ ...g, radius: 2 }, 0.9, 0.5, 1)).toBeCloseTo(evalT(g, 0.9, 0.5, 1) / 2, 5);
    expect(evalT({ ...g, scale: 2 }, 0.9, 0.5, 1)).toBeCloseTo(evalT(g, 0.9, 0.5, 1) / 2, 5);
  });

  it('conic sweeps once around the centre starting at the start angle', () => {
    const g = makeGradient('conic', [[0, '#ff0000'], [1, '#0000ff']], { angle: 0 });
    expect(evalT(g, 1, 0.5, 1)).toBeCloseTo(0, 5);            // 0° = right of centre
    expect(evalT(g, 0.5, 1, 1)).toBeCloseTo(0.25, 5);          // screen-down is +90°
    expect(evalT(g, 0, 0.5 + 1e-9, 1)).toBeCloseTo(0.5, 3);
    expect(evalT({ ...g, angle: 90 }, 0.5, 1, 1)).toBeCloseTo(0, 5);
  });

  it('reflected mirrors the ramp about the centre line (metallic horizon)', () => {
    const g = makeGradient('reflected', [[0, '#ffffff'], [1, '#000000']], { angle: 90 });
    expect(evalT(g, 0.5, 0.5, 1)).toBeCloseTo(0, 5);
    expect(evalT(g, 0.5, 0, 1)).toBeCloseTo(1, 5);
    expect(evalT(g, 0.5, 1, 1)).toBeCloseTo(1, 5);
    expect(evalT(g, 0.5, 0.25, 1)).toBeCloseTo(evalT(g, 0.5, 0.75, 1), 5);
  });

  it('repeat tiles the ramp; reflect mirrors every other tile', () => {
    const g = { ...two(), repeat: 2 };
    expect(wraps(g)).toBe(true);
    expect(evalT(g, 0.25, 0.5, 1)).toBeCloseTo(0.5, 5);
    expect(evalT(g, 0.75, 0.5, 1)).toBeCloseTo(0.5, 5);          // restarted: same position in the second tile
    const r = { ...g, reflect: true };
    expect(evalT(r, 0.25, 0.5, 1)).toBeCloseTo(0.5, 5);
    expect(evalT(r, 0.5 + 1e-6, 0.5, 1)).toBeCloseTo(1, 3);       // peak at the tile boundary
    expect(evalT(r, 0.75, 0.5, 1)).toBeCloseTo(0.5, 5);           // coming back down (mirrored)
  });

  it('a plain one-pass gradient clamps instead of wrapping', () => {
    const g = { ...two(), scale: 0.5 };
    expect(wraps(g)).toBe(false);
    expect(evalT(g, 0, 0.5, 1)).toBe(0);
    expect(evalT(g, 1, 0.5, 1)).toBe(1);
  });

  it('phase shifts the ramp and animation moves it with time, speed, direction and loop behaviour', () => {
    const g = { ...two(), phase: 0.25 };
    expect(evalT(g, 0, 0.5, 1)).toBeCloseTo(0.25, 5);
    const a = { ...two(), anim: { enabled: true, speed: 0.5, direction: 'forward' as const, loop: 'loop' as const } };
    expect(phaseAt(a, 0)).toBe(0);
    expect(phaseAt(a, 1)).toBeCloseTo(0.5, 6);
    expect(phaseAt(a, 3)).toBeCloseTo(1.5, 6);                                          // keeps travelling
    expect(phaseAt({ ...a, anim: { ...a.anim, direction: 'reverse' } }, 1)).toBeCloseTo(-0.5, 6);
    expect(phaseAt({ ...a, anim: { ...a.anim, speed: 2 } }, 0.25)).toBeCloseTo(0.5, 6);
    const pp = { ...a, anim: { ...a.anim, loop: 'pingpong' as const, speed: 1 } };
    expect([0, 0.5, 1, 1.5, 2].map((t) => +phaseAt(pp, t).toFixed(3))).toEqual([0, 0.5, 1, 0.5, 0]);
    const once = { ...a, anim: { ...a.anim, loop: 'once' as const, speed: 1 } };
    expect(phaseAt(once, 0.5)).toBeCloseTo(0.5, 6);
    expect(phaseAt(once, 5)).toBe(1);                                                    // stops after one sweep
    // the picture really changes with time
    expect(evalGradient(a, 0.3, 0.5, 1, 0)).not.toEqual(evalGradient(a, 0.3, 0.5, 1, 0.4));
    expect(phaseAt({ ...a, anim: { ...a.anim, enabled: false } }, 9)).toBe(0);
  });

  it('interpolates colour and opacity between stops', () => {
    const g = makeGradient('linear', [[0, '#ff0000', 1], [1, '#0000ff', 0]], { angle: 0 });
    const mid = rampAt(g, 0.5);
    expect(hex(mid)).toEqual([128, 0, 128]);
    expect(mid[3]).toBeCloseTo(0.5, 5);
    expect(rampAt(g, 0)[3]).toBe(1);
    expect(rampAt(g, 1)[3]).toBe(0);
  });

  it('solid is one colour everywhere', () => {
    const g = solid('#336699', 0.8);
    expect(evalGradient(g, 0, 0, 1)).toEqual(evalGradient(g, 1, 1, 1));
    expect(evalGradient(g, 0.3, 0.3, 1)[3]).toBe(0.8);
  });

  it('bakes the ramp into a 256-texel lookup that matches rampAt', () => {
    const g = GRADIENT_PRESETS.find((p) => p.id === 'gold')!.gradient;
    const lut = bakeLUT(g);
    expect(lut.length).toBe(256 * 4);
    for (const t of [0, 0.25, 0.5, 0.75, 1]) {
      const i = Math.round(t * 255), c = rampAt(g, i / 255);
      expect(Math.abs(lut[i * 4]! - Math.round(c[0] * 255))).toBeLessThanOrEqual(1);
      expect(Math.abs(lut[i * 4 + 2]! - Math.round(c[2] * 255))).toBeLessThanOrEqual(1);
    }
  });

  it('packs uniforms for the shader', () => {
    const g = { ...makeGradient('radial', [[0, '#fff'], [1, '#000']], { cx: 0.3, cy: 0.7, radius: 0.8, repeat: 2, reflect: true }), angle: 90 };
    const u = gradientUniforms(g, 2, 0);
    expect(u.g0[0]).toBe(2);
    expect(u.g0[2]).toBeCloseTo(0.3);
    expect(u.g1).toEqual([1, 0.8, 2, 1]);
    expect(u.g2).toEqual([0, 1, 2, 0]);
  });
});

describe('gradient editing', () => {
  it('adds a stop that preserves the picture, drags to exact positions, clamps, duplicates and removes', () => {
    let g = two();
    const before = rampAt(g, 0.4);
    const added = addStop(g, 0.4);
    g = added.gradient;
    expect(g.stops.length).toBe(3);
    const after = rampAt(g, 0.4);
    for (let i = 0; i < 4; i++) expect(Math.abs(after[i]! - before[i]!)).toBeLessThan(0.01);
    g = withStop(g, added.id, { pos: 0.625, color: '#ff8800', alpha: 0.5 });
    const s = g.stops.find((x) => x.id === added.id)!;
    expect(s).toMatchObject({ pos: 0.625, color: '#ff8800', alpha: 0.5 });
    g = withStop(g, added.id, { pos: 5, alpha: -3 });
    expect(g.stops.find((x) => x.id === added.id)).toMatchObject({ pos: 1, alpha: 0 });
    const dup = duplicateStop(g, added.id);
    expect(dup.gradient.stops.length).toBe(4);
    expect(dup.gradient.stops.find((x) => x.id === dup.id)!.color).toBe('#ff8800');
    const removed = removeStop(dup.gradient, dup.id);
    expect(removed.stops.length).toBe(3);
    expect(removeStop(solid('#fff'), 's0').stops.length).toBe(1);          // never below one stop
  });

  it('reverses and distributes evenly', () => {
    const g = makeGradient('linear', [[0, '#111111'], [0.1, '#222222'], [0.9, '#333333'], [1, '#444444']]);
    expect(sortedStops(reverseStops(g)).map((s) => s.color)).toEqual(['#444444', '#333333', '#222222', '#111111']);
    expect(sortedStops(distributeEvenly(g)).map((s) => +s.pos.toFixed(4))).toEqual([0, 0.3333, 0.6667, 1]);
  });

  it('switches kind without losing stops', () => {
    const g = withKind(two(), 'radial');
    expect(g.kind).toBe('radial');
    expect(g.stops.length).toBe(2);
    expect(withKind(two(), 'solid').stops.length).toBe(1);
  });

  it('hash changes with every control', () => {
    const g = two();
    const variants = [
      { ...g, angle: 10 }, { ...g, cx: 0.1 }, { ...g, cy: 0.1 }, { ...g, scale: 2 }, { ...g, radius: 2 }, { ...g, repeat: 2 }, { ...g, reflect: true }, { ...g, phase: 0.2 },
      { ...g, kind: 'radial' as const }, { ...g, anim: { ...g.anim, enabled: true } }, { ...g, anim: { ...g.anim, enabled: true, speed: 2 } },
      { ...g, anim: { ...g.anim, enabled: true, direction: 'reverse' as const } }, withStop(g, 's0', { color: '#101010' }), withStop(g, 's1', { alpha: 0.5 }), withStop(g, 's1', { pos: 0.9 }),
    ];
    const hashes = new Set([gradientHash(g), ...variants.map(gradientHash)]);
    expect(hashes.size).toBe(variants.length + 1);
  });

  it('ships the seven required presets, each editable and valid', () => {
    expect(GRADIENT_PRESETS.map((p) => p.id)).toEqual(['gold', 'chrome', 'neon', 'rainbow', 'fire', 'ice', 'alien']);
    for (const p of GRADIENT_PRESETS) {
      expect(p.gradient.stops.length).toBeGreaterThanOrEqual(2);
      for (const s of p.gradient.stops) { expect(s.pos).toBeGreaterThanOrEqual(0); expect(s.pos).toBeLessThanOrEqual(1); expect(s.color).toMatch(/^#[0-9a-f]{6}$/); }
    }
    expect(GRADIENT_PRESETS.find((p) => p.id === 'chrome')!.gradient.kind).toBe('reflected');
    expect(GRADIENT_PRESETS.find((p) => p.id === 'rainbow')!.gradient.anim.enabled).toBe(true);
  });
});

describe('wavy gradients', () => {
  const vertical = () => makeGradient('linear', [[0, '#000000'], [1, '#ffffff']], { angle: 90 });
  it('ripple the colour boundaries along their own direction and are off by default', () => {
    const g = vertical();
    expect(evalT(g, 0.2, 0.5, 1)).toBeCloseTo(evalT(g, 0.8, 0.5, 1), 6);                     // straight: same t along a horizontal line
    const w = { ...g, wave: { amount: 0.1, count: 1, phase: 0, speed: 0 } };
    expect(evalT(w, 0.25, 0.5, 1)).not.toBeCloseTo(evalT(w, 0.75, 0.5, 1), 3);              // wavy: t changes along x
    expect(evalT({ ...w, wave: { ...w.wave, amount: 0 } }, 0.25, 0.5, 1)).toBeCloseTo(evalT(g, 0.25, 0.5, 1), 6);
    expect(Math.abs(evalT(w, 0.25, 0.5, 1) - evalT(g, 0.25, 0.5, 1))).toBeLessThanOrEqual(0.1 + 1e-9);   // never more than the amount
  });
  it('moves with time when it has a speed, reaches the shader uniforms and the hash', () => {
    const w = { ...vertical(), wave: { amount: 0.1, count: 2, phase: 0, speed: 0.5 } };
    expect(evalT(w, 0.3, 0.5, 1, 0)).not.toBeCloseTo(evalT(w, 0.3, 0.5, 1, 0.3), 3);
    const u = gradientUniforms(w, 1, 0.4);
    expect(u.g3[0]).toBeCloseTo(0.1); expect(u.g3[1]).toBe(2); expect(u.g3[2]).toBeCloseTo(0.2); expect(u.g3[3]).toBe(1);
    expect(gradientUniforms(vertical(), 1, 0).g3).toEqual([0, 0, 0, 0]);
    expect(gradientHash(w)).not.toBe(gradientHash(vertical()));
  });
});

