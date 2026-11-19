import { describe, expect, it } from 'vitest';
import { emptyFrame } from '../src/vfx/engine/frame';
import { rampColor, recolorFrame } from '../src/vfx/fx/ramp';
import { makeGradient } from '../src/vfx/style/gradient';
import { builtinPresets } from '../src/vfx/library';
import { validatePreset } from '../src/vfx/model/validate';
import { copyForAi } from '../src/vfx/model/copyForAi';
import { effectById } from '../src/vfx/fx';

const blueToRed = () => makeGradient('linear', [[0, '#0000ff'], [1, '#ff0000']]);
const near = (a: number[], b: number[], eps = 0.01) => a.every((v, i) => Math.abs(v - b[i]!) < eps);

describe('effect colour ramp (gradient map)', () => {
  it('maps brightness to the ramp: dark to its first colour, bright to its last', () => {
    const g = blueToRed();
    expect(near(rampColor(g, 0, 0), [0, 0, 1])).toBe(true);
    expect(near(rampColor(g, 1, 0), [1, 0, 0])).toBe(true);
    const mid = rampColor(g, 0.5, 0);
    expect(mid[0]).toBeGreaterThan(0.3); expect(mid[2]).toBeGreaterThan(0.3);
  });

  it('recolours every kind of colour an effect can produce', () => {
    const g = blueToRed();
    const f = emptyFrame();
    f.shocks.push({ cx: 0, cy: 0, radius: 1, width: 1, amp: 1, pinchR: 0, pinchK: 0, light: 1, color: [1, 1, 1], split: 0, life: 1, strainLight: 0 });
    f.vortices.push({ cx: 0, cy: 0, radius: 1, pull: 0, twist: 0, glow: 1, absorb: 0, color: [1, 1, 1] });
    f.additive.push({ x: 0, y: 0, hw: 1, hh: 1, rot: 0, type: 0, color: [1, 1, 1], intensity: 1 });
    f.alphaSprites.push({ x: 0, y: 0, hw: 1, hh: 1, rot: 0, type: 5, color: [0, 0, 0], intensity: 1 });
    f.polys.push(0, 0, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1);
    f.underPolys.push(0, 0, 0, 0, 0, 1);
    f.ribbons.push(0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 0, 0, 1, 1, 1, 1);
    f.boltCore = [1, 1, 1]; f.boltGlow = [1, 1, 1];
    f.boltSets.push({ core: [1, 1, 1], glow: [0, 0, 0], verts: [] });
    recolorFrame(f, g, 0);
    const red = [1, 0, 0], blue = [0, 0, 1];
    expect(near(f.shocks[0]!.color, red)).toBe(true);
    expect(near(f.vortices[0]!.color, red)).toBe(true);
    expect(near(f.additive[0]!.color, red)).toBe(true);
    expect(near(f.alphaSprites[0]!.color, blue)).toBe(true);
    expect(near(f.polys.slice(2, 5), red)).toBe(true);
    expect(near(f.polys.slice(8, 11), red)).toBe(true);
    expect(near(f.underPolys.slice(2, 5), blue)).toBe(true);
    expect(near(f.ribbons.slice(4, 7), red)).toBe(true);
    expect(near(f.ribbons.slice(12, 15), red)).toBe(true);
    expect(f.polys[5]).toBe(1);                                   // alpha untouched
    expect(near(f.boltCore, red) && near(f.boltSets[0]!.core, red) && near(f.boltSets[0]!.glow, blue)).toBe(true);
    for (const c of f.smokePalette) expect(c[0] + c[2]).toBeGreaterThan(0.99);
  });

  it('animation, phase and repeat move the colours', () => {
    const g = blueToRed();
    const still = rampColor(g, 0.5, 0).join();
    expect(rampColor({ ...g, phase: 0.3 }, 0.5, 0).join()).not.toBe(still);
    expect(rampColor({ ...g, repeat: 3 }, 0.4, 0).join()).not.toBe(rampColor(g, 0.4, 0).join());
    const anim = { ...g, reflect: true, anim: { ...g.anim, enabled: true, speed: 1, direction: 'forward' as const, loop: 'loop' as const } };
    expect(rampColor(anim, 0.5, 0).join()).not.toBe(rampColor(anim, 0.5, 0.2).join());
    expect(rampColor(anim, 0.5, 0.2).join()).toBe(rampColor(anim, 0.5, 0.2).join());
  });

  it('is saved with the preset, validated, and described for AI', () => {
    const base = builtinPresets().find((p) => p.scene.fx.some((l) => effectById(l.effect)?.params.some((d) => d.kind === 'color')))!;
    const p = JSON.parse(JSON.stringify(base));
    const layer = p.scene.fx.find((l: { effect: string }) => effectById(l.effect)?.params.some((d) => d.kind === 'color'));
    layer.ramp = blueToRed();
    const ok = validatePreset(JSON.parse(JSON.stringify(p)));
    expect(ok.errors).toEqual([]);
    expect(ok.preset!.scene.fx.find((l) => l.id === layer.id)!.ramp!.stops).toHaveLength(2);
    expect(copyForAi(ok.preset!)).toContain('colour ramp');
    layer.ramp.stops[0].color = 'blue';
    expect(validatePreset(JSON.parse(JSON.stringify(p))).ok).toBe(false);
    layer.ramp = null;
    const cleared = validatePreset(JSON.parse(JSON.stringify(p)));
    expect(cleared.ok).toBe(true);
    expect('ramp' in cleared.preset!.scene.fx.find((l) => l.id === layer.id)!).toBe(false);
  });
});
