import { describe, expect, it } from 'vitest';
import { AutoQuality, QUALITY_ORDER, QUALITY_OPTIONS, TIERS, isQualitySetting, startingTier, type QualityTier } from '../src/vfx/engine/quality';
import { defaultsOf, selfScaling, thinParams } from '../src/vfx/fx/effect';
import { EFFECTS, effectById } from '../src/vfx/fx';
import { emptyFrame } from '../src/vfx/engine/frame';

/** Feed `n` frames of `ms` each; returns the tiers it moved through. */
function run(a: AutoQuality, n: number, ms: number): QualityTier[] {
  const seen: QualityTier[] = [];
  for (let i = 0; i < n; i++) { const t = a.frame(ms); if (t) seen.push(t); }
  return seen;
}

describe('quality tiers', () => {
  it('each tier draws less than the one above it', () => {
    const [lo, mid, hi] = QUALITY_ORDER.map((t) => TIERS[t]) as [typeof TIERS.low, typeof TIERS.medium, typeof TIERS.high];
    expect(hi.particles).toBe(1); expect(hi.scale).toBe(1);
    expect(mid.particles).toBeLessThan(hi.particles); expect(lo.particles).toBeLessThan(mid.particles);
    expect(mid.scale).toBeLessThan(hi.scale); expect(lo.scale).toBeLessThan(mid.scale);
    expect(lo.scale).toBeGreaterThan(0.4);
  });
  it('the settings are the three tiers and automatic', () => {
    expect(QUALITY_OPTIONS.map((o) => o.value).sort()).toEqual(['auto', 'high', 'low', 'medium']);
    for (const v of ['auto', 'low', 'medium', 'high']) expect(isQualitySetting(v)).toBe(true);
    expect(isQualitySetting('ultra')).toBe(false); expect(isQualitySetting(null)).toBe(false);
  });
  it('automatic starts a phone or a small machine below the top tier', () => {
    expect(startingTier({ cores: 12, touch: false, memory: 16 })).toBe('high');
    expect(startingTier({ cores: 8, touch: true, memory: 8 })).toBe('medium');
    expect(startingTier({ cores: 4, touch: false, memory: 8 })).toBe('medium');
    expect(startingTier({ cores: 8, touch: false, memory: 4 })).toBe('medium');
    expect(startingTier({ cores: 2, touch: true, memory: 4 })).toBe('low');
    expect(startingTier({ cores: 8, touch: false, memory: 2 })).toBe('low');
  });
});

describe('automatic quality', () => {
  it('stays put on a smooth 60 fps and on an ordinary busy one', () => {
    const a = new AutoQuality('high');
    expect(run(a, 600, 16.7)).toEqual([]);
    expect(run(a, 600, 24)).toEqual([]);
    expect(a.tier).toBe('high'); expect(a.changes).toBe(0);
  });
  it('steps down when frames run slow, one tier at a time, and stops at low', () => {
    const a = new AutoQuality('high');
    expect(run(a, 400, 45)).toEqual(['medium', 'low']);
    expect(run(a, 400, 80)).toEqual([]);
    expect(a.tier).toBe('low');
  });
  it('notices within about a second', () => {
    const a = new AutoQuality('high');
    let frames = 0; while (!a.frame(40)) frames++;
    expect(frames * 40).toBeLessThan(1500);
  });
  it('ignores a hiccup, and the time the tab spent in the background', () => {
    const a = new AutoQuality('high');
    for (let i = 0; i < 20; i++) { run(a, 25, 16.7); a.frame(900); }
    expect(a.tier).toBe('high');
  });
  it('steps back up only after a long smooth run, never past high', () => {
    const a = new AutoQuality('low');
    expect(run(a, 200, 16.7), 'not after three seconds').toEqual([]);
    const seen = run(a, 1500, 16.7);
    expect(seen).toEqual(['medium', 'high']);
    expect(run(a, 3000, 16.7)).toEqual([]);
  });
  it('a step up that does not hold keeps the tier down for a minute', () => {
    const a = new AutoQuality('low');
    expect(run(a, 420, 16.7)).toEqual(['medium']);
    expect(run(a, 80, 40)).toEqual(['low']);                      // it did not hold
    expect(run(a, 1200, 16.7), 'twenty seconds of smooth frames is not enough yet').toEqual([]);
    expect(run(a, 2100, 16.7), 'nor is fifty-five').toEqual([]);
    expect(run(a, 330, 16.7), 'after the lock runs out it may try again').toEqual(['medium']);
  });
  it('a step up that held is not punished by a later slow patch', () => {
    const a = new AutoQuality('low');
    run(a, 420, 16.7);                                          // up to medium
    run(a, 1200, 16.7);                                         // holds for twenty seconds
    run(a, 80, 40);                                             // a slow patch: down to low
    expect(a.tier).toBe('low');
    expect(run(a, 600, 16.7), 'ten smooth seconds later it climbs again').toEqual(['medium']);
  });
  it('ignores nonsense frame times', () => {
    const a = new AutoQuality('high');
    for (const v of [0, -5, NaN, Infinity]) expect(a.frame(v)).toBeNull();
    expect(a.tier).toBe('high');
  });
});

describe('thinning what older effects draw', () => {
  it('cuts piece counts by the tier and leaves everything else alone', () => {
    const e = effectById('celebrate.confetti')!, p = { ...defaultsOf(e) };
    const low = thinParams(e, p, TIERS.low.particles), mid = thinParams(e, p, TIERS.medium.particles);
    expect(Number(low.count)).toBeLessThan(Number(mid.count)); expect(Number(mid.count)).toBeLessThan(Number(p.count));
    expect(Number(low.count)).toBeGreaterThanOrEqual(1);
    for (const k of Object.keys(p)) if (k !== 'count') expect(low[k], k).toBe(p[k]);
    expect(thinParams(e, p, 1)).toBe(p);
  });
  it('never goes under a setting’s own minimum', () => {
    for (const e of EFFECTS) {
      const p = { ...defaultsOf(e) }, t = thinParams(e, p, 0.1);
      for (const d of e.params) if (d.kind === 'number' && t[d.key] !== p[d.key]) { expect(Number(t[d.key]), `${e.id}.${d.key}`).toBeGreaterThanOrEqual(Math.min(d.min, Number(p[d.key]))); expect(Number(t[d.key])).toBeGreaterThanOrEqual(1); expect(Number(t[d.key])).toBeLessThan(Number(p[d.key])); }
    }
  });
  it('effects that scale themselves from ctx.quality are not thinned twice', () => {
    for (const e of EFFECTS.filter(selfScaling)) { const p = { ...defaultsOf(e) }; expect(thinParams(e, p, 0.3), e.id).toBe(p); }
    expect(EFFECTS.filter(selfScaling).length).toBeGreaterThan(25);
  });
  it('a lower tier really draws fewer things', () => {
    for (const id of ['celebrate.confetti', 'celebrate.coins', 'text.fire', 'light.sparkle']) {
      const e = effectById(id)!, p = { ...defaultsOf(e) };
      const draw = (q: number) => { const f = emptyFrame(); e.build(f, 0.5, thinParams(e, p, q), { aspect: 16 / 9, pxPerUnit: 500, object: null } as never); return f.polys.length + f.additive.length * 6 + f.alphaSprites.length * 6 + f.vol.length * 6 + f.shards.length; };
      expect(draw(0.35), id).toBeLessThan(draw(1));
    }
  });
});
