import { describe, expect, it } from 'vitest';
import { blur, cellAlpha, layerFill, packCells, rasterizeStack, shift, shiftRound, type CellLayer, type MaskSource } from '../src/vfx/style/stylestack';
import { defaultStyle, outlineReach, rasterHash, stylePadding, styleHash, type TextStyle } from '../src/vfx/style/textStyle';
import { gradientPreset, solid } from '../src/vfx/style/gradient';

const W = 120, H = 120;

/** A filled disc (radius 24 px at the centre); grown shapes are discs of a larger radius, like a round-join stroke. */
const disc = (r = 24, cx = W / 2, cy = H / 2): MaskSource => ({
  mask(grow) {
    const out = new Float32Array(W * H), R = r + grow;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      out[y * W + x] = Math.min(1, Math.max(0, R - d + 0.5));
    }
    return out;
  },
});

const alpha = (l: CellLayer, x: number, y: number) => cellAlpha(l, W, x, y);
const kinds = (ls: CellLayer[]) => ls.map((l) => l.kind + (l.kind === 'outline' ? l.ref : ''));
const bare = (over: Partial<TextStyle> = {}): TextStyle => ({
  ...defaultStyle(), outlines: [], shadow: { ...defaultStyle().shadow, enabled: false }, bevel: { ...defaultStyle().bevel, enabled: false },
  innerHighlight: { ...defaultStyle().innerHighlight, enabled: false }, extrusion: { ...defaultStyle().extrusion, enabled: false }, glow: { ...defaultStyle().glow, enabled: false }, ...over,
});
const find = (ls: CellLayer[], k: string) => ls.find((l) => l.kind === k)!;
const sum = (l: CellLayer) => { let s = 0; for (let i = 0; i < l.a.length; i++) s += l.a[i]!; return s / 255 / (l.scale * l.scale); };

describe('style stack rasteriser', () => {
  it('emits layers back to front: shadow, glow, extrusion, outlines (outermost first), face, highlight, bevel', () => {
    const s = defaultStyle();
    s.outlines = [{ id: 'a', enabled: true, width: 0.05, fill: solid('#000'), join: 'round' }, { id: 'b', enabled: true, width: 0.05, fill: solid('#fff'), join: 'round' }];
    s.bevel.enabled = true; s.innerHighlight.enabled = true; s.extrusion.enabled = true; s.glow.enabled = true; s.shadow.enabled = true;
    expect(kinds(rasterizeStack(disc(), W, H, s, 100))).toEqual(['shadow', 'glow', 'extrusion', 'outline1', 'outline0', 'face', 'highlight', 'bevelLight', 'bevelShade']);
  });

  it('a bare face is just the shape', () => {
    const ls = rasterizeStack(disc(), W, H, bare(), 100);
    expect(kinds(ls)).toEqual(['face']);
    expect(alpha(ls[0]!, 60, 60)).toBe(1);
    expect(alpha(ls[0]!, 5, 5)).toBe(0);
  });

  it('multiple outlines grow outward by their cumulative widths, each an independent layer', () => {
    const s = bare({ outlines: [
      { id: 'a', enabled: true, width: 0.08, fill: solid('#000'), join: 'round' },
      { id: 'b', enabled: true, width: 0.1, fill: solid('#fff'), join: 'round' },
      { id: 'c', enabled: false, width: 0.5, fill: solid('#f00'), join: 'round' },
    ] });
    const ls = rasterizeStack(disc(24), W, H, s, 100);
    expect(kinds(ls)).toEqual(['outline1', 'outline0', 'face']);        // the disabled ring is not rasterised
    const o0 = find(ls, 'outline'), o1 = ls.filter((l) => l.kind === 'outline')[0]!;
    void o0;
    const outer = ls[0]!, inner = ls[1]!;
    // radius 24 + 8 = 32 for the inner ring, 24 + 18 = 42 for the outer ring
    expect(alpha(inner, 60 + 30, 60)).toBe(1);
    expect(alpha(inner, 60 + 36, 60)).toBe(0);
    expect(alpha(outer, 60 + 40, 60)).toBe(1);
    expect(alpha(outer, 60 + 46, 60)).toBe(0);
    expect(o1).toBe(outer);
    expect(outlineReach(s)).toBeCloseTo(0.18, 6);
  });

  it('extrusion extends along its angle, darkens with depth and never fills the other side', () => {
    const s = bare({ extrusion: { enabled: true, depth: 0.2, angle: 90, fill: solid('#fff'), shade: 0.8 } });
    const ls = rasterizeStack(disc(20), W, H, s, 100);
    const e = find(ls, 'extrusion');
    expect(alpha(e, 60, 60 + 28)).toBe(1);                      // below the disc (radius 20 + up to 20 deep)
    expect(alpha(e, 60, 60 - 28)).toBe(0);                      // nothing above
    const gNear = e.gray![(60 + 21) * W + 60]!, gFar = e.gray![(60 + 38) * W + 60]!;
    expect(gFar).toBeLessThan(gNear);                           // darker deeper in
    const right = rasterizeStack(disc(20), W, H, bare({ extrusion: { enabled: true, depth: 0.2, angle: 0, fill: solid('#fff'), shade: 0 } }), 100);
    expect(alpha(find(right, 'extrusion'), 60 + 35, 60)).toBe(1);
    expect(alpha(find(right, 'extrusion'), 60, 60 + 35)).toBe(0);
  });

  it('shadow follows the offset and spreads with blur', () => {
    const sharp = rasterizeStack(disc(20), W, H, bare({ shadow: { enabled: true, color: '#000', alpha: 1, blur: 0, dx: 0.15, dy: 0.1 } }), 100);
    const sh = find(sharp, 'shadow');
    expect(alpha(sh, 60 + 15 + 18, 60 + 10)).toBe(1);           // inside the offset disc
    expect(alpha(sh, 60 - 18, 60 - 10 - 18)).toBe(0);
    const soft = rasterizeStack(disc(20), W, H, bare({ shadow: { enabled: true, color: '#000', alpha: 1, blur: 0.3, dx: 0, dy: 0 } }), 100);
    const edge = alpha(find(soft, 'shadow'), 60 + 20, 60);
    expect(edge).toBeGreaterThan(0.2); expect(edge).toBeLessThan(0.8);
    expect(alpha(find(soft, 'shadow'), 60 + 30, 60)).toBeGreaterThan(0);   // spills past the silhouette
  });

  it('glow reaches past the outline and grows with radius and strength', () => {
    const mk = (radius: number, strength: number) => find(rasterizeStack(disc(20), W, H, bare({ glow: { enabled: true, fill: solid('#fa0'), radius, strength, bloom: true } }), 100), 'glow');
    const small = mk(0.1, 1), big = mk(0.3, 1), strong = mk(0.1, 2);
    expect(sum(big)).toBeGreaterThan(sum(small));
    expect(sum(strong)).toBeGreaterThan(sum(small));
    expect(alpha(big, 60 + 36, 60)).toBeGreaterThan(0.05);      // 16 px beyond the edge
    expect(alpha(small, 60 + 50, 60)).toBe(0);
    expect(alpha(big, 60, 60)).toBe(0);                          // nothing over the shape itself
    expect(alpha(big, 60 + 10, 60)).toBe(0);
  });

  it('bevel lights the edge facing the light and shades the opposite one', () => {
    const s = bare({ bevel: { enabled: true, size: 0.1, depth: 1, angle: -90, light: '#fff', shade: '#000' } });
    const ls = rasterizeStack(disc(30), W, H, s, 100);
    const lit = find(ls, 'bevelLight'), shade = find(ls, 'bevelShade');
    expect(alpha(lit, 60, 60 - 27)).toBeGreaterThan(0.1);        // top rim catches the light
    expect(alpha(lit, 60, 60 + 27)).toBeLessThan(0.02);
    expect(alpha(shade, 60, 60 + 27)).toBeGreaterThan(0.1);      // bottom rim is shaded
    expect(alpha(shade, 60, 60 - 27)).toBeLessThan(0.02);
    expect(alpha(lit, 60, 60)).toBeLessThan(0.02);               // flat middle is unchanged
    const flipped = rasterizeStack(disc(30), W, H, bare({ bevel: { ...s.bevel, angle: 90 } }), 100);
    expect(alpha(find(flipped, 'bevelLight'), 60, 60 + 27)).toBeGreaterThan(0.1);
    // never outside the shape
    expect(alpha(lit, 60, 60 - 40)).toBe(0);
  });

  it('inner highlight is a thin rim on the side facing the light, inside the shape', () => {
    const s = bare({ innerHighlight: { enabled: true, color: '#fff', alpha: 1, size: 0.08, angle: -90 } });
    const h = find(rasterizeStack(disc(30), W, H, s, 100), 'highlight');
    expect(alpha(h, 60, 60 - 28)).toBeGreaterThan(0.3);
    expect(alpha(h, 60, 60)).toBe(0);
    expect(alpha(h, 60, 60 + 28)).toBe(0);
    expect(alpha(h, 60, 60 - 40)).toBe(0);
  });

  it('padding covers every enabled effect', () => {
    const s = defaultStyle();
    s.outlines = [{ id: 'a', enabled: true, width: 0.1, fill: solid('#000'), join: 'round' }];
    s.glow = { ...s.glow, enabled: true, radius: 0.3 };
    const pad = stylePadding(s);
    expect(pad).toBeGreaterThan(0.1 + 0.3);
    s.glow.enabled = false; s.extrusion = { ...s.extrusion, enabled: true, depth: 0.5 };
    expect(stylePadding(s)).toBeGreaterThan(0.6);
  });

  it('colours come from the current style, so editing a colour needs no re-raster', () => {
    const s = defaultStyle();
    const hash = rasterHash(s), hash2 = (() => { const t = { ...s, face: gradientPreset('ice') }; return rasterHash(t); })();
    expect(hash2).toBe(hash);
    expect(styleHash(s)).not.toBe(styleHash({ ...s, face: gradientPreset('ice') }));
    s.outlines[0]!.fill = solid('#123456');
    expect(layerFill(s, 'outline', 0).stops[0]!.color).toBe('#123456');
    expect(layerFill(s, 'face', 0)).toBe(s.face);
    // shape-changing settings DO change the raster hash
    expect(rasterHash({ ...s, outlines: [{ ...s.outlines[0]!, width: 0.2 }] })).not.toBe(rasterHash(s));
  });
});

describe('array helpers', () => {
  it('blur preserves total coverage away from the border and shift moves content exactly', () => {
    const a = new Float32Array(W * H); a[60 * W + 60] = 1;
    const b = blur(a, W, H, 3);
    let s = 0; for (const v of b) s += v;
    expect(s).toBeCloseTo(1, 3);
    expect(b[60 * W + 60]).toBeLessThan(1);
    const m = shift(a, W, H, 5, -3);
    expect(m[(60 - 3) * W + 65]).toBeCloseTo(1, 5);
  });
  it('packs cells without overlap and downscales soft layers', () => {
    const p = packCells([{ w: 60, h: 40 }, { w: 60, h: 50 }, { w: 60, h: 30 }], 130);
    expect(p.rects.length).toBe(3);
    for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) {
      const a = p.rects[i]!, b = p.rects[j]!;
      expect(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y).toBe(true);
    }
    expect(p.width).toBeLessThanOrEqual(130);
    for (const r of p.rects) { expect(r.x % 2).toBe(0); expect(r.w % 2).toBe(0); expect(r.h % 2).toBe(0); }
    expect(p.width % 2).toBe(0); expect(p.height % 2).toBe(0);
    const a = new Float32Array(W * H); a[60 * W + 60] = 1;
    expect(shiftRound(a, W, H, 5.4, -2.6)[(60 - 3) * W + 65]).toBe(1);
  });
});
