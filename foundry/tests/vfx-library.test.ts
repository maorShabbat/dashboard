import { describe, expect, it } from 'vitest';
import { builtinPresets, legacyPresets, presetsOf } from '../src/vfx/library';
import { CATEGORIES, presetRef } from '../src/vfx/model/preset';
import { copyForAi } from '../src/vfx/model/copyForAi';
import { exportPresetJson, importPresetJson, presetFingerprintSource } from '../src/vfx/model/serialize';
import { validatePreset } from '../src/vfx/model/validate';
import { sceneFonts, sceneAssetIds } from '../src/vfx/model/scene';
import { effectById } from '../src/vfx/fx';
import { defaultsOf } from '../src/vfx/fx/effect';
import { getFamily } from '../src/vfx/fonts/catalog';

const all = builtinPresets();

describe('the ten categories', () => {
  it('are exactly the ten required, in order, and none is empty', () => {
    expect(CATEGORIES.map((c) => c.name)).toEqual([
      'Text animations', 'Text styling', 'Amount counters', 'Messages and win celebrations', 'Symbol pop and destruction',
      'Symbol transformation and expansion', 'Multipliers', 'Impacts', 'Screen distortion', 'Shine and highlights',
    ]);
    for (const c of CATEGORIES) expect(presetsOf(c.id).length, c.name).toBeGreaterThanOrEqual(6);
  });

  it('every preset has a stable unique id, a version, a description and is frozen', () => {
    const ids = new Set<string>();
    for (const p of all) {
      expect(p.id).toMatch(/^[a-z-]+\.[a-z0-9-]+$/);
      expect(p.id.startsWith(p.category + '.')).toBe(true);
      expect(ids.has(p.id), `duplicate ${p.id}`).toBe(false); ids.add(p.id);
      expect(p.version).toBe(1);
      expect(p.description.length).toBeGreaterThan(20);
      expect(Object.isFrozen(p) && Object.isFrozen(p.scene)).toBe(true);
      expect(presetRef(p)).toBe(`${p.id}@1`);
    }
  });

  it('every preset validates cleanly and survives export → import unchanged', () => {
    for (const p of all) {
      const v = validatePreset(JSON.parse(JSON.stringify(p)));
      expect(v.errors, p.id).toEqual([]);
      expect(v.warnings, p.id).toEqual([]);
      const back = importPresetJson(exportPresetJson(p, { now: '2026-10-02T00:00:00Z' }));
      expect(back.ok, p.id + back.errors.join()).toBe(true);
      expect(presetFingerprintSource(back.preset!)).toBe(presetFingerprintSource(p));
    }
  });

  it('every input points at a real element and every effect target exists', () => {
    for (const p of all) {
      const ids = new Set(p.scene.elements.map((e) => e.id));
      for (const i of p.inputs) expect(ids.has(i.element), `${p.id} input ${i.element}`).toBe(true);
      for (const l of p.scene.fx) { if (l.target) expect(ids.has(l.target)).toBe(true); if (l.target2) expect(ids.has(l.target2)).toBe(true); expect(effectById(l.effect), `${p.id} ${l.effect}`).toBeTruthy(); }
    }
  });

  it('text categories take text, icon categories take a symbol, and messages take a background', () => {
    for (const p of presetsOf('text-animations')) expect(p.inputs.some((i) => i.kind === 'text')).toBe(true);
    for (const p of presetsOf('symbol-destruction')) expect(p.inputs.some((i) => i.kind === 'image')).toBe(true);
    for (const p of presetsOf('symbol-transformation')) expect(p.inputs.some((i) => i.kind === 'image') || p.scene.elements.some((e) => e.kind === 'board'), p.id).toBe(true); // a board holds its own symbols
    expect(presetsOf('messages').some((p) => p.inputs.some((i) => i.kind === 'image'))).toBe(true);
    expect(presetsOf('counters').every((p) => p.inputs.some((i) => i.kind === 'counter'))).toBe(true);
  });
});

describe('icon destruction list', () => {
  it('offers the full list: fragment variants plus shatter, explode, pop, dissolve, burn, dust, slice, pixelate, melt, implode, spin', () => {
    const slugs = presetsOf('symbol-destruction').map((p) => p.id.split('.')[1]);
    for (const s of ['fragment', 'shatter', 'explode', 'pop', 'dissolve', 'burn', 'dust', 'slice', 'pixelate', 'melt', 'implode', 'spin']) expect(slugs, s).toContain(s);
    expect(slugs.length).toBeGreaterThanOrEqual(14);
  });
  it('every destruction takes over its symbol and ends empty', () => {
    for (const p of presetsOf('symbol-destruction').filter((x) => x.id !== 'symbol-destruction.win-pop')) {
      const main = p.scene.fx[0]!;
      const e = effectById(main.effect)!;
      expect(e.takesOver ?? e.usesObject, p.id).toBe(true);
      expect(main.target).toBe('sym');
    }
  });
});

describe('approved and archived looks are preserved', () => {
  it('Shockwave and Vortex are approved and use the effects\' own defaults, untouched', () => {
    for (const slug of ['shockwave', 'vortex']) {
      const p = all.find((x) => x.id === `impacts.${slug}`)!;
      expect(p.status).toBe('approved');
      expect(p.scene.fx).toHaveLength(1);
      expect(p.scene.fx[0]!.params).toEqual({});
      expect(p.scene.fx[0]!.effect).toBe(slug);
    }
    const sw = defaultsOf(effectById('shockwave')!), vx = defaultsOf(effectById('vortex')!);
    expect(sw).toMatchObject({ strength: 1, distortion: 1, radius: 1.15, ringWidth: 0.05, duration: 1.4 });
    expect(vx).toMatchObject({ radius: 0.6, pull: 1, twist: 2, build: 0.7, hold: 0.45, release: 0.85 });
  });
  it('Plasma is the clean version 2; version 1 is archived and Smoke is experimental, both outside the ten categories\' lists', () => {
    expect(presetsOf('impacts').some((p) => p.id.endsWith('plasma-v1') || p.id.endsWith('smoke'))).toBe(false);
    const legacy = legacyPresets().map((p) => [p.id, p.status]);
    expect(legacy).toEqual([['impacts.plasma-v1', 'archived'], ['impacts.smoke', 'experimental']]);
    expect(effectById('plasma-v1')!.duration(defaultsOf(effectById('plasma-v1')!))).toBeCloseTo(2.1, 5);
    expect(effectById('plasma')!.duration(defaultsOf(effectById('plasma')!))).toBeLessThan(2.1);
  });
});

describe('fonts in presets', () => {
  it('only reference catalogue fonts, with a file for the requested weight', () => {
    for (const p of all) for (const f of sceneFonts(p.scene)) {
      const fam = getFamily(f.id);
      expect(fam, `${p.id}: ${f.id}`).toBeTruthy();
      expect(fam!.files.some((x) => x.weight === f.weight && x.style === f.style), `${p.id}: ${f.id} ${f.weight}`).toBe(true);
    }
  });
  it('at least 25 different families appear across the built-in presets, so the styles are really distinct', () => {
    const fams = new Set(all.flatMap((p) => sceneFonts(p.scene).map((f) => f.id)));
    expect(fams.size).toBeGreaterThanOrEqual(16);
  });
  it('built-in images are all built-ins (no upload needed to play any preset)', () => {
    for (const p of all) expect(sceneAssetIds(p.scene)).toEqual([]);
  });
});

describe('validation', () => {
  const base = () => JSON.parse(JSON.stringify(all.find((p) => p.id === 'text-styling.gold-chunky')!));
  it('rejects unknown fonts, motions, effects, shapes and broken gradients with the path of the problem', () => {
    const a = base(); a.scene.elements[0].style.font.id = 'no-such-font';
    expect(validatePreset(a).errors.join()).toContain('unknown font "no-such-font"');
    const b = base(); b.scene.elements[0].motion.entrance.id = 'teleport';
    expect(validatePreset(b).errors.join()).toContain('unknown motion "teleport"');
    const c = base(); c.scene.fx = [{ id: 'x', effect: 'nope', start: 0, enabled: true, amount: 1, params: {} }];
    expect(validatePreset(c).errors.join()).toContain('unknown effect "nope"');
    const d = base(); d.scene.elements[0].style.face.stops[0].color = 'gold';
    expect(validatePreset(d).errors.join()).toContain('is not a #rrggbb colour');
    const e = base(); e.scene.elements[0].style.face.stops = [];
    expect(validatePreset(e).errors.join()).toContain('needs 1 to 24 stops');
    const f = base(); f.schema = 'something';
    expect(validatePreset(f).ok).toBe(false);
    expect(importPresetJson('not json').ok).toBe(false);
    expect(importPresetJson('{"hello":1}').errors[0]).toContain('neither');
  });
  it('clamps out-of-range numbers and says so', () => {
    const a = base(); a.scene.elements[0].size = 9;
    const r = validatePreset(a);
    expect(r.ok).toBe(true);
    expect(r.preset!.scene.elements[0]!).toMatchObject({ size: 1.5 });
    expect(r.warnings.join()).toContain('clamped');
  });
  it('rejects a motion in the wrong slot and a dangling effect target', () => {
    const a = base(); a.scene.elements[0].motion.entrance.id = 'float';
    expect(validatePreset(a).errors.join()).toContain('not an entrance');
    const b = base(); b.scene.fx = [{ id: 'x', effect: 'distort.ripple', start: 0, enabled: true, amount: 1, params: {}, target: 'ghost' }];
    expect(validatePreset(b).errors.join()).toContain('no element with id "ghost"');
  });
});

describe('Copy for AI', () => {
  it('is built from the final settings: id, version, fonts + licences, every number and effect setting, and the exact JSON', () => {
    const p = JSON.parse(JSON.stringify(all.find((x) => x.id === 'messages.big-win')!));
    p.scene.elements.find((e: { id: string }) => e.id === 'title').text = 'MY OWN WIN';
    p.scene.elements.find((e: { id: string }) => e.id === 'title').style.font = { id: 'oswald', weight: 700, style: 'normal' };
    p.scene.elements.find((e: { id: string }) => e.id === 'title').style.outlines[0].width = 0.123;
    p.scene.fx.find((f: { id: string }) => f.id === 'confetti').params.count = 77;
    const md = copyForAi(p, { duration: 6.75 });
    expect(md).toContain('`messages.big-win`');
    expect(md).toContain('reference `messages.big-win@1`');
    expect(md).toContain('"MY OWN WIN"');
    expect(md).toContain('Oswald');
    expect(md).toContain('OFL-1.1');
    expect(md).toContain('0.123 em');
    expect(md).toContain('count = 77');
    expect(md).toContain('createVfxPlayer');
    const json = /```json\n([\s\S]*?)\n```/.exec(md)![1]!;
    expect(JSON.parse(json)).toEqual(p);
  });
  it('lists every setting of every effect, defaults included', () => {
    const p = all.find((x) => x.id === 'screen-distortion.ripple')!;
    const md = copyForAi(p as never);
    for (const d of effectById('distort.ripple')!.params) expect(md).toContain(`${d.key}`);
    expect(md).toContain('(default)');
  });
});
