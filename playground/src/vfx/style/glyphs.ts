/**
 * Glyph sets: a text style rasterised once per (shape settings, font, pixel size) into one atlas per layer, plus text layout. The
 * playground, the thumbnails and exported players all draw text from these atlases; nothing is drawn with CSS.
 */
import type { FontService } from '../fonts/service';
import { cloneStyle, rasterHash, stylePadding, type JoinStyle, type ShapeStyle, type TextStyle } from './textStyle';
import { packCells, rasterizeStack, type CellLayer, type CellRect, type LayerKind, type MaskSource } from './stylestack';

export type Canvas2 = HTMLCanvasElement | OffscreenCanvas;
export type Ctx2 = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export function makeCanvas(w: number, h: number): Canvas2 {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}
const ctx2 = (c: Canvas2): Ctx2 => (c as HTMLCanvasElement).getContext('2d', { willReadFrequently: true }) as Ctx2;

export interface GlyphCell {
  ch: string;
  /** Advance width, px. */
  adv: number;
  /** Cell size in the atlas, px (even). */
  w: number; h: number;
  /** Pen origin (left of the glyph, on the baseline) inside the cell. */
  ox: number; oy: number;
  rect: CellRect;
}

export interface RasterLayer {
  uid: string;
  kind: LayerKind;
  /** Outline index among enabled outlines. */
  ref: number;
  /** RGBA8 atlas at this layer's resolution. */
  data: Uint8Array;
  w: number; h: number;
  scale: number;
}

let uidCounter = 0;
const nextUid = (p: string) => `${p}${(uidCounter++).toString(36)}`;

export interface GlyphSet {
  uid: string;
  fontPx: number;
  /** Pixel size of one em for this set (equals fontPx for text). */
  emPx: number;
  cells: Map<string, GlyphCell>;
  layers: RasterLayer[];
  atlasW: number; atlasH: number;
  /** Baseline distance from the top of a line box, and the depth below it. */
  top: number; bottom: number;
  lineH: number;
  digitAdv: number;
  pad: number;
  /** Characters the font does not contain (rendered by the browser from a fallback font; surfaced to the user as a warning). */
  missing: string[];
  advance(ch: string): number;
  /** Width of a string with the font's kerning. */
  measure(text: string): number;
  /** Face coverage at (x, y) of a cell, for placing sparkles on the real silhouette. */
  faceAt(ch: string, x: number, y: number): number;
}

export class FontNotReadyError extends Error {
  constructor(msg: string) { super(msg); this.name = 'FontNotReadyError'; }
}

// ---------------------------------------------------------------------------------------------------------------------
// Cell cache: glyph cells are expensive (blurs, extrusion), so each (shape settings, font, size, character) is rasterised once.

interface CachedCell { layers: CellLayer[]; w: number; h: number; ox: number; oy: number; adv: number; bytes: number }
export class CellCache {
  private map = new Map<string, CachedCell>();
  private bytes = 0;
  constructor(private budget = 192 * 1024 * 1024) {}
  get(key: string): CachedCell | undefined {
    const v = this.map.get(key);
    if (v) { this.map.delete(key); this.map.set(key, v); }
    return v;
  }
  set(key: string, v: CachedCell): void {
    this.map.set(key, v); this.bytes += v.bytes;
    while (this.bytes > this.budget && this.map.size > 1) {
      const [k, old] = this.map.entries().next().value as [string, CachedCell];
      this.map.delete(k); this.bytes -= old.bytes;
    }
  }
  get size(): number { return this.map.size; }
  get totalBytes(): number { return this.bytes; }
  clear(): void { this.map.clear(); this.bytes = 0; }
}
export const cellCache = new CellCache();

const layerBytes = (ls: CellLayer[]) => ls.reduce((s, l) => s + l.a.length + (l.gray?.length ?? 0), 0);

// ---------------------------------------------------------------------------------------------------------------------

const missingCache = new Map<string, boolean>();

/** Does the loaded font itself contain `ch`? Rendered against two different fallback fonts: identical pixels mean the fallback was never used. */
export function fontHasGlyph(fonts: FontService, spec: TextStyle['font'], ch: string): boolean {
  if (/\s/.test(ch)) return true;
  const key = `${spec.id}|${spec.weight}|${spec.style}|${ch}`;
  const hit = missingCache.get(key);
  if (hit !== undefined) return hit;
  const c = makeCanvas(48, 48);
  const g = ctx2(c);
  const render = (fallback: string): string => {
    g.clearRect(0, 0, 48, 48); g.fillStyle = '#fff'; g.textBaseline = 'alphabetic';
    g.font = `${fonts.cssFont(spec, 32)}, ${fallback}`;
    g.fillText(ch, 4, 36);
    const d = g.getImageData(0, 0, 48, 48).data;
    let h = 0;
    for (let i = 3; i < d.length; i += 4) h = (Math.imul(h, 31) + d[i]!) | 0;
    return String(h);
  };
  const has = render('serif') === render('monospace');
  missingCache.set(key, has);
  return has;
}

export interface GlyphSetOptions {
  chars: string[];
  style: TextStyle;
  fontPx: number;
  fonts: FontService;
}

export function rasterGlyphSet(opts: GlyphSetOptions): GlyphSet {
  const { style, fonts } = opts;
  const fontPx = Math.max(6, Math.min(420, Math.round(opts.fontPx)));
  const status = fonts.status(style.font);
  if (status.state !== 'loaded') throw new FontNotReadyError(`Font "${style.font.id}" is not loaded (${status.state}${status.error ? ': ' + status.error : ''})`);
  const font = fonts.cssFont(style.font, fontPx);
  const mc = makeCanvas(8, 8);
  const mg = ctx2(mc);
  mg.font = font; mg.textBaseline = 'alphabetic';
  const unique = [...new Set(opts.chars)].filter((c) => c.length > 0);
  const visible = unique.filter((c) => !/^\s$/.test(c));
  const digitChars = '0123456789'.split('');
  const missing = visible.filter((c) => !fontHasGlyph(fonts, style.font, c));
  const metrics = new Map(unique.map((c) => [c, mg.measureText(c)]));
  const fm = mg.measureText('Hg');
  let top = (fm as TextMetrics & { fontBoundingBoxAscent?: number }).fontBoundingBoxAscent ?? fontPx * 0.9;
  let bottom = (fm as TextMetrics & { fontBoundingBoxDescent?: number }).fontBoundingBoxDescent ?? fontPx * 0.25;
  for (const c of visible) { const m = metrics.get(c)!; top = Math.max(top, m.actualBoundingBoxAscent); bottom = Math.max(bottom, m.actualBoundingBoxDescent); }
  top = Math.ceil(top); bottom = Math.ceil(bottom);
  const pad = Math.ceil(stylePadding(style) * fontPx) + 2;
  const rh = rasterHash(style);
  const even = (v: number) => v + (v % 2);

  const cells = new Map<string, GlyphCell>();
  const built: { ch: string; cached: CachedCell }[] = [];
  for (const ch of visible) {
    const m = metrics.get(ch)!;
    const key = `${rh}|${fontPx}|${top}|${bottom}|${ch}`;
    let cached = cellCache.get(key);
    if (!cached) {
      const left = Math.max(0, Math.ceil(m.actualBoundingBoxLeft));
      const right = Math.max(m.width, m.actualBoundingBoxRight);
      const w = even(Math.ceil(right + left) + pad * 2), h = even(top + bottom + pad * 2);
      const ox = pad + left, oy = pad + top;
      const src = glyphMask(w, h, font, ch, ox, oy);
      const layers = rasterizeStack(src, w, h, style, fontPx);
      cached = { layers, w, h, ox, oy, adv: m.width, bytes: layerBytes(layers) };
      cellCache.set(key, cached);
    }
    built.push({ ch, cached });
  }
  const packed = packCells(built.map((b) => ({ w: b.cached.w, h: b.cached.h })), 2048, 2);
  built.forEach((b, i) => cells.set(b.ch, { ch: b.ch, adv: b.cached.adv, w: b.cached.w, h: b.cached.h, ox: b.cached.ox, oy: b.cached.oy, rect: packed.rects[i]! }));
  const layers = assembleLayers(built.map((b) => b.cached.layers), packed.rects, packed.width, packed.height);

  const adv = (ch: string) => cells.get(ch)?.adv ?? metrics.get(ch)?.width ?? mg.measureText(ch).width;
  let digitAdv = 0;
  for (const d of digitChars) digitAdv = Math.max(digitAdv, metrics.get(d)?.width ?? mg.measureText(d).width);
  const faceAtlas = layers.find((l) => l.kind === 'face');
  return {
    uid: nextUid('gs'), fontPx, emPx: fontPx, cells, layers, atlasW: packed.width, atlasH: packed.height, top, bottom, lineH: top + bottom, digitAdv, pad, missing,
    advance: adv,
    measure: (text) => mg.measureText(text).width,
    faceAt: (ch, x, y) => {
      const c = cells.get(ch);
      if (!c || !faceAtlas) return 0;
      const ax = c.rect.x + Math.floor(x), ay = c.rect.y + Math.floor(y);
      if (x < 0 || y < 0 || x >= c.w || y >= c.h) return 0;
      return faceAtlas.data[(ay * faceAtlas.w + ax) * 4 + 3]! / 255;
    },
  };
}

function glyphMask(w: number, h: number, font: string, ch: string, ox: number, oy: number): MaskSource {
  const c = makeCanvas(w, h);
  const g = ctx2(c);
  return {
    mask(grow: number, join: JoinStyle): Float32Array {
      g.clearRect(0, 0, w, h);
      g.font = font; g.textBaseline = 'alphabetic'; g.fillStyle = '#fff'; g.strokeStyle = '#fff';
      g.fillText(ch, ox, oy);
      if (grow > 0) { g.lineWidth = grow * 2; g.lineJoin = join as CanvasLineJoin; g.miterLimit = 2.5; g.strokeText(ch, ox, oy); }
      const d = g.getImageData(0, 0, w, h).data;
      const out = new Float32Array(w * h);
      for (let i = 0; i < out.length; i++) out[i] = d[i * 4 + 3]! / 255;
      return out;
    },
  };
}

/** MaskSource for an arbitrary vector shape: filled, and stroked for growth. `draw` paints the shape's path with the given context (already white). */
export function pathMask(w: number, h: number, path: Path2D): MaskSource {
  const c = makeCanvas(w, h);
  const g = ctx2(c);
  return {
    mask(grow: number, join: JoinStyle): Float32Array {
      g.clearRect(0, 0, w, h);
      g.fillStyle = '#fff'; g.strokeStyle = '#fff';
      g.fill(path);
      if (grow > 0) { g.lineWidth = grow * 2; g.lineJoin = join as CanvasLineJoin; g.miterLimit = 2.5; g.stroke(path); }
      const d = g.getImageData(0, 0, w, h).data;
      const out = new Float32Array(w * h);
      for (let i = 0; i < out.length; i++) out[i] = d[i * 4 + 3]! / 255;
      return out;
    },
  };
}

/** MaskSource for an image's silhouette (its alpha). Growth is a union of the image drawn around a circle of offsets. */
export function imageMask(w: number, h: number, draw: (g: Ctx2, dx: number, dy: number) => void): MaskSource {
  const c = makeCanvas(w, h);
  const g = ctx2(c);
  const read = (): Float32Array => {
    const d = g.getImageData(0, 0, w, h).data;
    const out = new Float32Array(w * h);
    for (let i = 0; i < out.length; i++) out[i] = d[i * 4 + 3]! / 255;
    return out;
  };
  return {
    mask(grow: number): Float32Array {
      g.clearRect(0, 0, w, h);
      draw(g, 0, 0);
      if (grow > 0.5) {
        const n = Math.min(72, Math.max(16, Math.ceil(grow * 6)));
        for (let ring = 1; ring <= (grow > 6 ? 2 : 1); ring++) {
          const r = ring === 1 ? grow : grow * 0.5;
          for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; draw(g, Math.cos(a) * r, Math.sin(a) * r); }
        }
      }
      return read();
    },
  };
}

// ---------------------------------------------------------------------------------------------------------------------

/** Assemble per-cell layer data into one RGBA atlas per layer. */
export function assembleLayers(cellLayers: CellLayer[][], rects: CellRect[], atlasW: number, atlasH: number): RasterLayer[] {
  if (!cellLayers.length) return [];
  const proto = cellLayers[0]!;
  return proto.map((p, li) => {
    const scale = p.scale;
    const aw = Math.max(1, Math.ceil(atlasW * scale)), ah = Math.max(1, Math.ceil(atlasH * scale));
    const data = new Uint8Array(aw * ah * 4);
    cellLayers.forEach((cl, ci) => {
      const l = cl[li]!, r = rects[ci]!;
      const px = Math.round(r.x * scale), py = Math.round(r.y * scale);
      for (let y = 0; y < l.h; y++) {
        let o = ((py + y) * aw + px) * 4, s = y * l.w;
        for (let x = 0; x < l.w; x++, o += 4, s++) {
          const g = l.gray ? l.gray[s]! : 255;
          data[o] = g; data[o + 1] = g; data[o + 2] = g; data[o + 3] = l.a[s]!;
        }
      }
    });
    return { uid: nextUid('rl'), kind: p.kind, ref: p.ref, data, w: aw, h: ah, scale };
  });
}

/**
 * A single-shape raster (a frame, an icon silhouette) as a one-cell glyph set, so shapes and text go through exactly the same
 * layer drawing path. The cell is keyed '#'.
 */
export function rasterShape(src: MaskSource, w: number, h: number, style: ShapeStyle, emPx: number, pad: number): GlyphSet {
  const cw = w + pad * 2 + (w + pad * 2) % 2, ch = h + pad * 2 + (h + pad * 2) % 2;
  void cw; void ch;
  const layers = rasterizeStack(src, w, h, style, emPx);
  const packed = packCells([{ w, h }], 4096, 2);
  const cell: GlyphCell = { ch: '#', adv: w - pad * 2, w, h, ox: pad, oy: pad, rect: packed.rects[0]! };
  return {
    uid: nextUid('gs'), fontPx: emPx, emPx, cells: new Map([['#', cell]]), layers: assembleLayers([layers], packed.rects, packed.width, packed.height),
    atlasW: packed.width, atlasH: packed.height, top: h - pad, bottom: 0, lineH: h - pad * 2, digitAdv: 0, pad, missing: [],
    advance: () => cell.adv, measure: () => cell.adv, faceAt: () => 0,
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Layout

export interface LaidGlyph {
  ch: string;
  cell: GlyphCell | null;
  /** Pen position (left edge of the advance box) and top of the line box, in block px. */
  x: number; y: number;
  adv: number;
  line: number;
  word: number;
  /** Index among all characters of the text (spaces included). */
  index: number;
  /** Centre of the advance box, block px: the pivot for per-glyph motion. */
  cx: number; cy: number;
}
export interface TextLayout { glyphs: LaidGlyph[]; w: number; h: number; lines: { start: number; end: number; x: number; y: number; w: number }[]; wordCount: number; lineH: number }

export interface LayoutOptions {
  align: TextStyle['align'];
  /** Wrap at this width (px); 0 = only at explicit newlines. */
  maxWidth?: number;
  letterSpacingPx: number;
  lineSpacing: number;
  /** Give every digit the same advance (counters). */
  tabularDigits?: boolean;
  /** Use per-pair kerning (static text). Off = fixed advances (fast, stable for counters). */
  kerning?: boolean;
}

export function layoutText(set: GlyphSet, text: string, o: LayoutOptions): TextLayout {
  const kern = o.kerning !== false && !o.tabularDigits;
  const rawLines = text.split('\n');
  const lines: string[] = [];
  for (const raw of rawLines) {
    if (!o.maxWidth || o.maxWidth <= 0) { lines.push(raw); continue; }
    let cur = '';
    for (const word of raw.split(/(?<= )/)) {
      const trial = cur + word;
      if (cur && set.measure(trial.trimEnd()) + o.letterSpacingPx * Math.max(0, trial.length - 1) > o.maxWidth) { lines.push(cur.trimEnd()); cur = word; } else cur = trial;
    }
    lines.push(cur.trimEnd());
  }
  const step = set.lineH * o.lineSpacing;
  const glyphs: LaidGlyph[] = [];
  const outLines: TextLayout['lines'] = [];
  let index = 0, word = 0;
  let blockW = 0;
  lines.forEach((line, li) => {
    const start = glyphs.length;
    let x = 0;
    const chars = [...line];
    let inWord = false;
    chars.forEach((ch, i) => {
      let adv = set.advance(ch);
      let penX = x;
      if (kern && i > 0) penX = set.measure(chars.slice(0, i + 1).join('')) - adv + o.letterSpacingPx * i;
      else if (kern) penX = 0;
      if (o.tabularDigits && ch >= '0' && ch <= '9') { penX = x + (set.digitAdv - adv) / 2; adv = set.digitAdv; if (penX < x) penX = x; }
      const isSpace = /\s/.test(ch);
      if (!isSpace && !inWord) { inWord = true; word++; }
      if (isSpace) inWord = false;
      const cell = set.cells.get(ch) ?? null;
      const y = li * step;
      glyphs.push({ ch, cell, x: penX, y, adv, line: li, word: Math.max(0, word - 1), index: index++, cx: penX + adv / 2, cy: y + set.lineH / 2 });
      x = kern ? penX + adv + o.letterSpacingPx : (o.tabularDigits && ch >= '0' && ch <= '9' ? x + adv : x + adv) + o.letterSpacingPx;
    });
    const last = glyphs[glyphs.length - 1];
    const lw = glyphs.length > start && last ? last.x + last.adv - glyphs[start]!.x : 0;
    outLines.push({ start, end: glyphs.length, x: 0, y: li * step, w: lw });
    blockW = Math.max(blockW, lw);
    index++;   // the newline
  });
  const blockH = lines.length ? (lines.length - 1) * step + set.lineH : set.lineH;
  const k = o.align === 'left' ? 0 : o.align === 'center' ? 0.5 : 1;
  for (const l of outLines) {
    const off = (blockW - l.w) * k - (glyphs[l.start]?.x ?? 0) * 0;
    l.x = off;
    for (let i = l.start; i < l.end; i++) { const g = glyphs[i]!; g.x += off; g.cx += off; }
  }
  return { glyphs, w: blockW, h: blockH, lines: outLines, wordCount: Math.max(0, word), lineH: set.lineH };
}

/** Distinct characters needed to draw `text` with the style (case already applied). */
export const textChars = (text: string): string[] => [...new Set([...text].filter((c) => c !== '\n'))];
export const applyCase = (text: string, style: TextStyle): string => (style.uppercase ? text.toUpperCase() : text);
export { cloneStyle };
