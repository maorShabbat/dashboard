import { describe, expect, it } from 'vitest';
import { builtinPresets, presetsOf } from '../src/vfx/library';
import { copyForAi } from '../src/vfx/model/copyForAi';
import { validatePreset } from '../src/vfx/model/validate';
import { effectById } from '../src/vfx/fx';
import { linePieces, voronoiPieces, drawPieces, type Piece } from '../src/vfx/fx/pieces';
import { emptyFrame, SCREEN_A } from '../src/vfx/engine/frame';
import { cellKey, restRect, unionRect } from '../src/vfx/player/cell';
import type { ImageRuntime } from '../src/vfx/player/elements';

const A = 16 / 9;
const area = (ps: Piece[]) => ps.reduce((s, p) => s + p.area, 0);

describe('screen pieces (glass, ice, slabs)', () => {
  it('Voronoi pieces tile the screen exactly, are dense around the hit and are cached', () => {
    const c = { x: 0.4 * A, y: 0.5 };
    const ps = voronoiPieces(A, 70, 3, c, 1.6);
    expect(ps.length).toBeGreaterThan(50);
    expect(area(ps)).toBeCloseTo(A, 4);
    expect(voronoiPieces(A, 70, 3, c, 1.6)).toBe(ps);
    const near = ps.filter((p) => Math.hypot(p.c.x - c.x, p.c.y - c.y) < 0.25), far = ps.filter((p) => Math.hypot(p.c.x - c.x, p.c.y - c.y) > 0.9);
    const mean = (l: Piece[]) => l.reduce((s, p) => s + p.area, 0) / Math.max(1, l.length);
    expect(mean(near)).toBeLessThan(mean(far));
  });
  it('slabs cut along lines tile the screen exactly', () => {
    const ps = linePieces(A, [{ x: 0.9, y: 0.5, angle: 0.3 }, { x: 0.6, y: 0.4, angle: 1.7 }, { x: 1.2, y: 0.6, angle: -0.8 }]);
    expect(ps.length).toBeGreaterThanOrEqual(5);
    expect(ps.length).toBeLessThanOrEqual(7);
    expect(area(ps)).toBeCloseTo(A, 4);
  });
  it('pieces at rest reproduce the picture (uv = position) and hidden pieces are left out', () => {
    const ps = voronoiPieces(A, 30, 5, { x: A / 2, y: 0.5 });
    const f = emptyFrame();
    drawPieces(f, SCREEN_A, ps, A, (p) => ({ dx: 0, dy: 0, rot: 0, scale: 1, alpha: p.id % 2 ? 1 : 0, shade: 1, glint: 0 }), { grow: 0 });
    expect(f.shardSets).toHaveLength(1);
    const v = f.shardSets[0]!.verts;
    expect(v.length % 24).toBe(0);
    for (let i = 0; i < v.length; i += 8) { expect(v[i + 2]).toBeCloseTo(v[i]! / A, 6); expect(v[i + 3]).toBeCloseTo(v[i + 1]!, 6); }
  });
});

describe('a frame taken along with its symbol', () => {
  const rt = (asset: string, x: number, y: number, w: number, h: number, scale = 1): ImageRuntime => ({ el: { asset, x, y, scale, opacity: 1 }, size: () => ({ w, h }) }) as unknown as ImageRuntime;
  it('the cell is the union of the frame and the symbol, in scene units', () => {
    const frame = rt('builtin:tile-gold', 0.5, 0.55, 0.4, 0.4), icon = rt('builtin:star', 0.5, 0.55, 0.25, 0.25);
    const u = unionRect(restRect(frame, A), restRect(icon, A));
    expect(u.w).toBeCloseTo(0.4); expect(u.h).toBeCloseTo(0.4); expect(u.cx).toBeCloseTo(0.5 * A); expect(u.cy).toBeCloseTo(0.55);
    const wide = unionRect(restRect(frame, A), restRect(rt('x', 0.7, 0.55, 0.2, 0.2), A));
    expect(wide.w).toBeGreaterThan(0.4);
  });
  it('the same assets at the same place give the same key, anything else a new one', () => {
    const frame = rt('builtin:tile-gold', 0.5, 0.55, 0.4, 0.4), icon = rt('builtin:star', 0.5, 0.55, 0.25, 0.25);
    const k = cellKey(frame, icon, A, 600);
    expect(cellKey(frame, icon, A, 600)).toBe(k);
    expect(cellKey(frame, rt('builtin:star', 0.5, 0.6, 0.25, 0.25), A, 600)).not.toBe(k);
    expect(cellKey(frame, rt('builtin:gem', 0.5, 0.55, 0.25, 0.25), A, 600)).not.toBe(k);
    expect(cellKey(frame, icon, A, 1200)).not.toBe(k);
  });
});

describe('the variation round in the library', () => {
  const destruction = presetsOf('symbol-destruction');
  it('has well over ten new destruction effects, grouped, with whole-tile versions', () => {
    const effects = new Set(destruction.flatMap((p) => p.scene.fx.map((l) => l.effect)));
    expect(effects.size).toBeGreaterThanOrEqual(28);
    expect(destruction.length).toBeGreaterThanOrEqual(50);
    const groups = new Set(destruction.map((p) => p.group));
    for (const g of ['Breaking apart', 'Fire and explosions', 'Smoke and steam', 'Burning away', 'Sparks, confetti and gems', 'Melting, freezing and dissolving', 'Whole tile: frame and symbol together']) expect(groups.has(g), g).toBe(true);
    // a group's presets sit together in the list
    const seen: string[] = [];
    for (const p of destruction) { const g = p.group ?? ''; if (seen[seen.length - 1] !== g) { expect(seen.includes(g), `${g} is split`).toBe(false); seen.push(g); } }
  });
  it('whole-tile presets take a frame along and fill the square', () => {
    const tiles = destruction.filter((p) => p.group?.startsWith('Whole tile'));
    expect(tiles.length).toBeGreaterThanOrEqual(15);
    for (const p of tiles) {
      const l = p.scene.fx[0]!, ids = new Set(p.scene.elements.map((e) => e.id));
      expect(l.frame, p.id).toBeTruthy(); expect(ids.has(l.frame!)).toBe(true); expect(l.frame).not.toBe(l.target);
      const e = effectById(l.effect)!;
      if (e.params.some((d) => d.key === 'area')) expect(l.params.area, p.id).toBe('cell');
      expect(p.inputs.map((i) => i.element).sort()).toEqual(['frame', 'sym']);
      // the frame is drawn behind the symbol
      expect(p.scene.elements.findIndex((x) => x.id === l.frame)).toBeLessThan(p.scene.elements.findIndex((x) => x.id === l.target));
    }
  });
  it('screen distortion has transitions between screens, each with two stand-in screens', () => {
    const list = presetsOf('screen-distortion').filter((p) => p.group === 'Transitions between screens');
    expect(list.length).toBeGreaterThanOrEqual(24);
    expect(new Set(list.map((p) => p.scene.fx[0]!.effect)).size).toBeGreaterThanOrEqual(16);
    for (const p of list) { expect(effectById(p.scene.fx[0]!.effect)?.transition, p.id).toBe(true); expect(p.scene.screens?.from).toBeTruthy(); expect(p.scene.screens?.to).toBeTruthy(); expect(p.scene.screens?.from).not.toBe(p.scene.screens?.to); }
    expect(presetsOf('screen-distortion').some((p) => p.group === 'Bend the picture')).toBe(true);
  });
  it('text animations, styles and messages carry headings too', () => {
    for (const c of ['text-animations', 'text-styling', 'messages'] as const) expect(new Set(presetsOf(c).map((p) => p.group)).size, c).toBeGreaterThanOrEqual(2);
  });
  it('Copy for AI explains the frame and the two screens', () => {
    const tile = builtinPresets().find((p) => p.id === 'symbol-destruction.tile-bomb')!, tr = builtinPresets().find((p) => p.id === 'screen-distortion.glass')!;
    expect(copyForAi(tile)).toContain('taking the frame');
    expect(copyForAi(tr)).toContain('backdropTo');
  });
});

describe('validation of the new fields', () => {
  const tile = () => JSON.parse(JSON.stringify(builtinPresets().find((p) => p.id === 'symbol-destruction.tile-ice')!));
  it('a frame must be an element and not the symbol itself', () => {
    const a = tile(); a.scene.fx[0].frame = 'nope';
    expect(validatePreset(a).errors.join()).toContain('no element with id "nope"');
    const b = tile(); b.scene.fx[0].frame = b.scene.fx[0].target;
    expect(validatePreset(b).errors.join()).toContain('different element');
    expect(validatePreset(tile()).errors).toEqual([]);
  });
  it('unknown stand-in screens are dropped with a warning', () => {
    const t = JSON.parse(JSON.stringify(builtinPresets().find((p) => p.id === 'screen-distortion.glass')!));
    t.scene.screens.to = 'moon';
    const v = validatePreset(t);
    expect(v.errors).toEqual([]);
    expect(v.warnings.join()).toContain('unknown stand-in picture "moon"');
    expect(v.preset!.scene.screens?.to).toBeUndefined();
  });
});
