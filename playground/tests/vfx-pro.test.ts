import { describe, expect, it } from 'vitest';
import { defaultsOf, type EffectCtx } from '../src/vfx/fx/effect';
import { effectById } from '../src/vfx/fx';
import { emptyFrame, type Frame } from '../src/vfx/engine/frame';
import { objectFromFunction } from '../src/vfx/engine/object';
import { presetsOf } from '../src/vfx/library';
import type { TextElement } from '../src/vfx/model/scene';

const ctx = (o: Partial<EffectCtx> = {}): EffectCtx => ({ aspect: 16 / 9, pxPerUnit: 500, object: null, ...o });
const build = (id: string, t: number, over: Record<string, number | string | boolean> = {}, c: EffectCtx = ctx()): Frame => {
  const e = effectById(id)!, f = emptyFrame();
  e.build(f, t, { ...defaultsOf(e), ...over }, c);
  return f;
};
const ys = (f: Frame): number[] => { const out: number[] = []; for (let i = 1; i < f.polys.length; i += 6) out.push(f.polys[i]!); return out; };

describe('emitters: fountains with real physics', () => {
  it('coins bounce on the floor and never sink through it', () => {
    const floor = 0.9, r = 0.05 * 1.25;
    for (const t of [0.5, 1, 1.6, 2.2, 2.8]) {
      const f = build('emit.fountain', t, { floor, ending: 'fade', count: 40 });
      expect(f.polys.length, `coins drawn at ${t}`).toBeGreaterThan(0);
      for (const y of ys(f)) expect(y).toBeLessThanOrEqual(floor + r + 0.02);
    }
  });
  it('with a meter, pieces leave the floor and fly to it, and none are left at the end', () => {
    const D = Number(defaultsOf(effectById('emit.fountain')!).duration);
    const near = (f: Frame) => ys(f).filter((y) => y < 0.3).length;
    expect(ys(build('emit.fountain', D * 0.97)).filter((y) => y > 0.5).length, 'nothing is left on the floor near the end').toBe(0);
    const mid = build('emit.fountain', D * 0.7);
    expect(near(mid), 'pieces on their way up to the meter').toBeGreaterThan(0);
    expect(build('emit.fountain', D).polys.length + build('emit.fountain', D).additive.length).toBe(0);
  });
  it('the meter pulses when pieces arrive', () => {
    const D = Number(defaultsOf(effectById('emit.fountain')!).duration);
    const lit = (t: number) => build('emit.fountain', t).additive.filter((s) => Math.abs(s.x - 0.9 * (16 / 9)) < 0.001 && Math.abs(s.y - 0.08) < 0.001).length;
    expect(lit(D * 0.3)).toBe(0);
    expect(Math.max(...[0.6, 0.7, 0.8, 0.9].map((u) => lit(D * u)))).toBeGreaterThan(0);
  });
  it('a piece made from your own picture is drawn as one textured batch, not as vector shapes', () => {
    const obj = objectFromFunction('piece', 1, () => 1);
    obj.tex = { uid: 'piece', version: 0, w: 64, h: 64, load: () => ({ kind: 'image', source: {} as never }) };
    const f = build('emit.burst', 0.5, { count: 30 }, ctx({ object: obj }));
    expect(f.draws).toHaveLength(1);
    expect(f.draws[0]!.instances.length / 24).toBeGreaterThan(5);
    expect(f.polys.length).toBe(0);
  });
  it('quality scales how many pieces are drawn', () => {
    const full = build('emit.rain', 2, { count: 100 }).polys.length, low = build('emit.rain', 2, { count: 100 }, ctx({ quality: 0.4 })).polys.length;
    expect(low).toBeLessThan(full * 0.6);
  });
  it('same time and settings give the same frame', () => {
    expect(build('emit.fountain', 1.7)).toEqual(build('emit.fountain', 1.7));
  });
});

describe('win ladders', () => {
  const ladders = presetsOf('messages').filter((p) => p.group?.startsWith('Win ladders'));
  it('there are several, and each switches through at least two tiers in order', () => {
    expect(ladders.length).toBeGreaterThanOrEqual(4);
    for (const p of ladders) {
      const titles = p.scene.elements.filter((e): e is TextElement => e.kind === 'text');
      expect(titles.length, p.id).toBeGreaterThanOrEqual(2);
      for (let i = 1; i < titles.length; i++) expect(titles[i]!.start, `${p.id} tier ${i}`).toBeGreaterThan(titles[i - 1]!.start);
      // a tier leaves (end) shortly after the next one arrives, so the message really switches
      for (let i = 0; i < titles.length - 1; i++) { expect(titles[i]!.end!).toBeGreaterThan(titles[i + 1]!.start); expect(titles[i]!.end!).toBeLessThan(titles[i + 1]!.start + 0.5); }
      const amount = p.scene.elements.find((e) => e.kind === 'counter');
      expect(amount && amount.kind === 'counter' && amount.ease).toBe('easeIn');       // the counter keeps speeding up
    }
  });
  it('each tier hits harder than the one before (more coins, stronger shockwave)', () => {
    for (const p of ladders) {
      const coins = p.scene.fx.filter((l) => /^burst\d+$/.test(l.id)).map((l) => Number(l.params.count));
      const shock = p.scene.fx.filter((l) => /^shock\d+$/.test(l.id)).map((l) => Number(l.params.strength));
      for (let i = 1; i < coins.length; i++) { expect(coins[i]!, p.id).toBeGreaterThanOrEqual(coins[i - 1]!); expect(shock[i]!, p.id).toBeGreaterThan(shock[i - 1]!); }
    }
  });
});
