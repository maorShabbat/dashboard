/**
 * Element runtimes: turn scene elements (text, counters, icons, shapes) into draw batches for any time t. Each prepares its resources
 * once (rasterised glyph atlases, decoded images), then builds frames as a pure function of time.
 */
import { MotionRig, type RigGlyph } from '../anim/rig';
import type { Frame, DrawBatch } from '../engine/frame';
import type { FontService } from '../fonts/service';
import type { CounterElement, ImageElement, SceneElement, ShapeElement, ShineSpec, TextElement } from '../model/scene';
import { applyCase, imageMask, layoutText, pathMask, rasterGlyphSet, rasterShape, textChars, type GlyphSet, type TextLayout } from '../style/glyphs';
import { layerFill, type LayerKind } from '../style/stylestack';
import { rasterHash, stylePadding, type ShapeStyle, type TextStyle } from '../style/textStyle';
import { smooth } from '../anim/easing';
import type { Silhouette } from '../fx/effect';
import { maskAt } from '../engine/object';
import type { ImageLibrary, LoadedImage } from './assets';
import { bandFill, fillFor, fontLabel, layerTex, pushQuad } from './resources';
import { shapePath } from './shapes';

/** Rasterise a little above the on-screen size so scale-up animations stay crisp. */
const OVERSAMPLE = 1.25;

export interface Env {
  aspect: number;
  /** Drawing-buffer pixels per stage height. */
  pxPerUnit: number;
  fonts: FontService;
  images: ImageLibrary;
  seed: number;
  warnings: string[];
}

export interface ElementRuntime {
  el: SceneElement;
  prepare(env: Env): Promise<void>;
  /** Everything the raster depends on: while this key is unchanged, edits only need `retarget`. */
  rasterKey(el: SceneElement, env: Env): string;
  /** Take new element settings that do not change the raster (position, motion, colours, gradients, shine...). */
  retarget(el: SceneElement): void;
  /** Seconds after the element appears at which its motion has finished (idle loops excluded). */
  motionEnd(): number;
  /** Seconds after the element appears at which it is finished (shine and counting included). */
  contentEnd(): number;
  /** Seconds after the element appears at which an exit finishes (0 if none). */
  exitEnd(): number;
  build(f: Frame, t: number): void;
  /** Uids of every GL texture this element used, for release. */
  textureUids(): string[];
  /** Silhouette and placement for effects that act on this element (icons). */
  anchor(): { x: number; y: number; size: number } | null;
  /** Points on the element's real pixels, for sparkles and glints. */
  silhouette?(): Silhouette | null;
  dispose(): void;
}

const visibleAt = (el: SceneElement, t: number): boolean => !el.hidden && t >= el.start && (el.end === undefined || t <= el.end);

// ---------------------------------------------------------------------------------------------------------------------
// Shine: a soft band of light sweeping across an element's silhouette.

export function shineProgress(s: ShineSpec, tl: number): number | null {
  if (!s.enabled) return null;
  for (let k = 0; k <= Math.max(0, Math.round(s.repeat)); k++) {
    const start = s.start + k * (s.duration + s.interval);
    const p = (tl - start) / Math.max(0.05, s.duration);
    if (p >= 0 && p <= 1) return p;
  }
  return null;
}
export const shineEnd = (s: ShineSpec | undefined): number => (s && s.enabled ? s.start + Math.max(0, Math.round(s.repeat)) * (s.duration + s.interval) + s.duration : 0);

function shineBatch(s: ShineSpec, p: number, boxAspect: number, tex: DrawBatch['tex'], premultiplied: boolean, instances: number[]): DrawBatch {
  const e = p * p * (3 - 2 * p) * 0.4 + p * 0.6;
  const half = 0.5 + s.width / 2 + 0.05;
  const centre = -half + (2 * half) * e;
  const fade = smooth(0, 0.08, p) * (1 - smooth(0.92, 1, p));
  return {
    tex, fill: bandFill(s.color, s.angle, s.width, centre, boxAspect), fillMode: 2, premultiplied, instances: instances.map((v, i) => (i % 24 === 23 ? v * s.intensity * fade : v)),
    emit: s.bloom ? 2 : 0, emitGain: 1.15,
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Shared: draw every style layer of a raster set

function layerBatches(f: Frame, set: GlyphSet, style: ShapeStyle, instances: number[], boxAspect: number, tl: number, skip?: (k: LayerKind) => boolean): void {
  for (const layer of set.layers) {
    if (skip?.(layer.kind)) continue;
    const g = layerFill(style, layer.kind, layer.ref);
    const emissive = layer.kind === 'glow' && style.glow.bloom;
    f.draws.push({
      tex: layerTex(layer), fill: fillFor(g, boxAspect, tl), fillMode: 1, premultiplied: false, instances,
      emit: emissive ? 1 : 0, emitGain: 0.4, glowLayer: layer.kind === 'glow',
    });
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Text

export class TextRuntime implements ElementRuntime {
  private set!: GlyphSet;
  private layout!: TextLayout;
  private rig!: MotionRig;
  private k = 1;
  private env!: Env;
  private text = '';
  private rasterKeyValue = '';
  constructor(public el: TextElement) {}

  async prepare(env: Env): Promise<void> {
    this.env = env;
    const el = this.el;
    await env.fonts.load(el.style.font);
    this.text = applyCase(el.text, el.style);
    const fontPx = Math.max(6, Math.min(420, Math.round(el.size * env.pxPerUnit * OVERSAMPLE)));
    this.set = rasterGlyphSet({ chars: textChars(this.text), style: el.style, fontPx, fonts: env.fonts });
    if (this.set.missing.length) env.warnings.push(`"${el.name}": ${fontLabel(env.fonts, el.style.font.id)} has no glyph for ${this.set.missing.map((c) => `“${c}”`).join(' ')}; the browser draws ${this.set.missing.length === 1 ? 'it' : 'them'} from a fallback font. Pick a font that has ${this.set.missing.length === 1 ? 'it' : 'them'}.`);
    this.k = el.size / this.set.fontPx;
    const maxW = el.maxWidth > 0 ? (el.maxWidth * env.aspect) / this.k : 0;
    this.layout = layoutText(this.set, this.text, { align: el.style.align, maxWidth: maxW, letterSpacingPx: el.style.letterSpacing * this.set.fontPx, lineSpacing: el.style.lineSpacing });
    this.rebuildRig();
    this.rasterKeyValue = this.set.uid;
  }

  private rebuildRig(): void {
    const el = this.el, env = this.env;
    const glyphs: RigGlyph[] = this.layout.glyphs.map((g) => ({ cx: (g.cx - this.layout.w / 2) * this.k, cy: (g.cy - this.layout.h / 2) * this.k, line: g.line, word: g.word }));
    this.rig = new MotionRig({
      motion: el.motion, glyphs, ref: el.size, seed: env.seed + hashStr(el.id), aspect: env.aspect, ex: el.x * env.aspect, ey: el.y, es: el.scale, er: (el.rotation * Math.PI) / 180, opacity: el.opacity,
    });
  }

  rasterKey(el: SceneElement, env: Env): string {
    if (el.kind !== 'text') return 'x';
    const st = el.style;
    return [el.text, el.size, el.maxWidth, rasterHash(st), st.letterSpacing, st.lineSpacing, st.align, st.uppercase ? 1 : 0, Math.round(env.pxPerUnit / 40)].join('|');
  }
  retarget(el: SceneElement): void { this.el = el as TextElement; this.rebuildRig(); }

  motionEnd(): number { return Math.max(this.rig.motionEnd, shineEnd(this.el.shine)); }
  contentEnd(): number { return this.motionEnd(); }
  exitEnd(): number { return this.rig.exitEnd(); }
  textureUids(): string[] { return [...this.set.layers.map((l) => l.uid)]; }
  anchor() { return { x: this.el.x, y: this.el.y, size: this.el.size }; }
  silhouette(): Silhouette {
    const el = this.el, env = this.env, { set, layout, k } = this;
    const glyphs = layout.glyphs.filter((g) => g.cell);
    const cx = el.x * env.aspect, cy = el.y, es = el.scale, rot = (el.rotation * Math.PI) / 180, cr = Math.cos(rot), sr = Math.sin(rot);
    const toScene = (bx: number, by: number) => { const lx = (bx - layout.w / 2) * k * es, ly = (by - layout.h / 2) * k * es; return { x: cx + cr * lx - sr * ly, y: cy + sr * lx + cr * ly }; };
    const hw = (layout.w * k * es) / 2, hh = (layout.h * k * es) / 2;
    return {
      box: { x0: cx - hw, y0: cy - hh, x1: cx + hw, y1: cy + hh },
      sample: (a, b) => {
        if (!glyphs.length) return toScene(layout.w / 2, layout.h / 2);
        const g = glyphs[Math.min(glyphs.length - 1, Math.floor(a * glyphs.length))]!, cell = g.cell!;
        let r = (a * 977 + b * 131) % 1;
        for (let i = 0; i < 24; i++) {
          r = (r * 16807 + 0.3719) % 1; const px = r * cell.w;
          r = (r * 16807 + 0.1931) % 1; const py = r * cell.h;
          if (set.faceAt(g.ch, px, py) > 0.5) return toScene(g.x - cell.ox + px, g.y + set.top - cell.oy + py);
        }
        return toScene(g.cx, g.cy);
      },
      top: () => {
        if (this.topPts?.layout !== layout) this.topPts = { layout, pts: this.scanTop() };
        return this.topPts.pts.map((q) => { const s = toScene(q.bx, q.by); return { x: s.x, y: s.y, th: q.th * k * es }; });
      },
      rotation: rot,
    };
  }
  private topPts: { layout: TextLayout; pts: { bx: number; by: number; th: number }[] } | null = null;
  /** Where the face of each letter first appears when looking down each column, in layout units (done once per layout). */
  private scanTop(): { bx: number; by: number; th: number }[] {
    const { set, layout } = this, out: { bx: number; by: number; th: number }[] = [];
    for (const g of layout.glyphs) {
      const cell = g.cell;
      if (!cell || g.line !== 0) continue;
      const step = Math.max(1, Math.floor(cell.w / 56));
      for (let px = step / 2; px < cell.w; px += step) {
        let py = 0;
        while (py < cell.h && set.faceAt(g.ch, px, py) <= 0.5) py += 2;
        if (py >= cell.h) continue;
        let q = py;
        while (q < cell.h && set.faceAt(g.ch, px, q) > 0.5) q += 2;
        out.push({ bx: g.x - cell.ox + px, by: g.y + set.top - cell.oy + py, th: q - py });
      }
    }
    return out.sort((a, b) => a.bx - b.bx);
  }
  /** Block size in scene units (for layout of related elements and diagnostics). */
  blockSize(): { w: number; h: number } { return { w: this.layout.w * this.k, h: this.layout.h * this.k }; }
  rasterId(): string { return this.rasterKeyValue; }
  missingGlyphs(): string[] { return this.set.missing; }
  glyphCount(): number { return this.layout.glyphs.length; }

  build(f: Frame, t: number): void {
    const el = this.el;
    if (!visibleAt(el, t)) return;
    const tl = t - el.start;
    const { set, layout, k } = this;
    const boxA = layout.w / Math.max(1, layout.h);
    const inst: number[] = [];
    const faceInst: number[] = [];
    const ax = set.atlasW, ay = set.atlasH;
    layout.glyphs.forEach((g, i) => {
      const cell = g.cell;
      if (!cell) return;
      const st = this.rig.state(tl, i);
      if (st.alpha <= 0.002) return;
      const left = g.x - cell.ox, top = g.y + set.top - cell.oy;
      const q = {
        px: st.px, py: st.py, ox: (left + cell.w / 2 - g.cx) * k, oy: (top + cell.h / 2 - g.cy) * k, hw: (cell.w / 2) * k, hh: (cell.h / 2) * k,
        rot: st.rot, skew: st.skew, sx: st.sx, sy: st.sy, bright: st.bright, glow: st.glow,
        u0: cell.rect.x / ax, v0: cell.rect.y / ay, u1: (cell.rect.x + cell.w) / ax, v1: (cell.rect.y + cell.h) / ay,
        g0: left / layout.w, gv0: top / layout.h, g1: (left + cell.w) / layout.w, gv1: (top + cell.h) / layout.h,
        r: 1, g: 1, b: 1, a: st.alpha,
      };
      pushQuad(inst, q);
      pushQuad(faceInst, q);
    });
    if (!inst.length) return;
    layerBatches(f, set, el.style, inst, boxA, tl);
    const sp = el.shine ? shineProgress(el.shine, tl) : null;
    if (sp !== null && el.shine) {
      const face = set.layers.find((l) => l.kind === 'face');
      if (face) f.draws.push(shineBatch(el.shine, sp, boxA, layerTex(face), false, faceInst));
    }
  }

  dispose(): void { /* textures are released by uid from the renderer */ }
}

// ---------------------------------------------------------------------------------------------------------------------
// Shapes (message backgrounds, plates, badges)

export class ShapeRuntime implements ElementRuntime {
  private set!: GlyphSet;
  private rig!: MotionRig;
  private pxW = 1; private pxH = 1; private pad = 0; private k = 1;
  constructor(public el: ShapeElement) {}

  async prepare(env: Env): Promise<void> {
    const el = this.el;
    const pxW = Math.max(8, Math.round(el.width * env.pxPerUnit * OVERSAMPLE)), pxH = Math.max(8, Math.round(el.height * env.pxPerUnit * OVERSAMPLE));
    const cap = 1800 / Math.max(pxW, pxH);
    this.pxW = Math.round(pxW * Math.min(1, cap)); this.pxH = Math.round(pxH * Math.min(1, cap));
    const emPx = this.pxH;
    this.pad = Math.ceil(stylePadding(el.style) * emPx) + 2;
    const cw = this.pxW + this.pad * 2 + ((this.pxW + this.pad * 2) % 2), ch = this.pxH + this.pad * 2 + ((this.pxH + this.pad * 2) % 2);
    const path = shapePath(el.shape, this.pad, this.pad, this.pxW, this.pxH, el.params);
    this.set = rasterShape(pathMask(cw, ch, path), cw, ch, el.style, emPx, this.pad);
    this.k = el.width / this.pxW;
    this.env = env;
    this.rebuildRig();
  }

  private env!: Env;
  private rebuildRig(): void {
    const el = this.el, env = this.env;
    this.rig = new MotionRig({
      motion: el.motion, glyphs: [{ cx: 0, cy: 0, line: 0, word: 0 }], ref: el.height, seed: env.seed + hashStr(el.id), aspect: env.aspect,
      ex: el.x * env.aspect, ey: el.y, es: el.scale, er: (el.rotation * Math.PI) / 180, opacity: el.opacity,
    });
  }
  rasterKey(el: SceneElement, env: Env): string {
    if (el.kind !== 'shape') return 'x';
    return [el.shape, el.width, el.height, JSON.stringify(el.params), rasterHash(el.style), Math.round(env.pxPerUnit / 40)].join('|');
  }
  retarget(el: SceneElement): void { this.el = el as ShapeElement; this.rebuildRig(); }

  motionEnd(): number { return Math.max(this.rig.motionEnd, shineEnd(this.el.shine)); }
  contentEnd(): number { return this.motionEnd(); }
  exitEnd(): number { return this.rig.exitEnd(); }
  textureUids(): string[] { return this.set.layers.map((l) => l.uid); }
  anchor() { return { x: this.el.x, y: this.el.y, size: this.el.height }; }

  build(f: Frame, t: number): void {
    const el = this.el;
    if (!visibleAt(el, t)) return;
    const tl = t - el.start;
    const st = this.rig.state(tl, 0);
    if (st.alpha <= 0.002) return;
    const cell = this.set.cells.get('#')!;
    const k = this.k, pad = this.pad;
    const inst: number[] = [];
    pushQuad(inst, {
      px: st.px, py: st.py, ox: 0, oy: 0, hw: (cell.w / 2) * k, hh: (cell.h / 2) * k, rot: st.rot, skew: st.skew, sx: st.sx, sy: st.sy, bright: st.bright, glow: st.glow,
      u0: cell.rect.x / this.set.atlasW, v0: cell.rect.y / this.set.atlasH, u1: (cell.rect.x + cell.w) / this.set.atlasW, v1: (cell.rect.y + cell.h) / this.set.atlasH,
      g0: -pad / this.pxW, gv0: -pad / this.pxH, g1: (cell.w - pad) / this.pxW, gv1: (cell.h - pad) / this.pxH, r: 1, g: 1, b: 1, a: st.alpha,
    });
    const boxA = this.pxW / this.pxH;
    layerBatches(f, this.set, el.style, inst, boxA, tl);
    const sp = el.shine ? shineProgress(el.shine, tl) : null;
    const face = this.set.layers.find((l) => l.kind === 'face');
    if (sp !== null && el.shine && face) f.draws.push(shineBatch(el.shine, sp, boxA, layerTex(face), false, inst));
  }

  dispose(): void { /* released by uid */ }
}

// ---------------------------------------------------------------------------------------------------------------------
// Images (icons, transparent PNG / WebM, message backgrounds)

export class ImageRuntime implements ElementRuntime {
  img!: LoadedImage;
  private rig!: MotionRig;
  private set: GlyphSet | null = null;
  private w = 0; private h = 0;
  private pad = 0; private pxW = 1; private pxH = 1;
  constructor(public el: ImageElement) {}

  async prepare(env: Env): Promise<void> {
    const el = this.el;
    this.img = await env.images.get(el.asset);
    const a = this.img.aspect;
    if (el.width && el.height) { this.w = el.width; this.h = el.height; }
    else if (a >= 1) { this.w = el.size; this.h = el.size / a; } else { this.h = el.size; this.w = el.size * a; }
    this.set = null;
    if (el.outline && this.img.kind === 'static') {
      const iw = Math.max(8, Math.min(1600, Math.round(this.w * env.pxPerUnit * OVERSAMPLE))), ih = Math.max(8, Math.min(1600, Math.round(this.h * env.pxPerUnit * OVERSAMPLE)));
      const emPx = Math.max(iw, ih);
      const pad = Math.ceil(stylePadding(el.outline) * emPx) + 2;
      const cw = iw + pad * 2 + ((iw + pad * 2) % 2), ch = ih + pad * 2 + ((ih + pad * 2) % 2);
      const bmp = this.img.frame(0);
      this.set = rasterShape(imageMask(cw, ch, (g, dx, dy) => g.drawImage(bmp, pad + dx, pad + dy, iw, ih)), cw, ch, el.outline, emPx, pad);
      this.pad = pad; this.pxW = iw; this.pxH = ih;
    } else if (el.outline) env.warnings.push(`"${el.name}": outlines are only available on still images; the video plays as it is.`);
    this.env = env;
    this.rebuildRig();
  }

  private env!: Env;
  private rebuildRig(): void {
    const el = this.el, env = this.env;
    this.rig = new MotionRig({
      motion: el.motion, glyphs: [{ cx: 0, cy: 0, line: 0, word: 0 }], ref: Math.max(this.w, this.h), seed: env.seed + hashStr(el.id), aspect: env.aspect,
      ex: el.x * env.aspect, ey: el.y, es: el.scale, er: (el.rotation * Math.PI) / 180, opacity: el.opacity,
    });
  }
  rasterKey(el: SceneElement, env: Env): string {
    if (el.kind !== 'image') return 'x';
    return [el.asset, el.size, el.width ?? '', el.height ?? '', el.outline ? rasterHash(el.outline) : '-', Math.round(env.pxPerUnit / 40)].join('|');
  }
  retarget(el: SceneElement): void { this.el = el as ImageElement; this.rebuildRig(); }

  motionEnd(): number { return Math.max(this.rig.motionEnd, shineEnd(this.el.shine)); }
  contentEnd(): number { return this.motionEnd(); }
  exitEnd(): number { return this.rig.exitEnd(); }
  textureUids(): string[] { return this.set ? this.set.layers.map((l) => l.uid) : []; }
  anchor() { return { x: this.el.x, y: this.el.y, size: Math.max(this.w, this.h) }; }
  size(): { w: number; h: number } { return { w: this.w, h: this.h }; }
  silhouette(): Silhouette {
    const el = this.el, aspect = this.env.aspect, cx = el.x * aspect, cy = el.y, es = el.scale;
    const info = this.img.info;
    const hw = (this.w * es) / 2, hh = (this.h * es) / 2;
    return {
      box: { x0: cx - hw, y0: cy - hh, x1: cx + hw, y1: cy + hh },
      sample: (a, b) => {
        let r = (a * 977 + b * 131) % 1, u = a, v = b;
        for (let i = 0; i < 24; i++) { if (maskAt(info, u, v) > 0.5) break; r = (r * 16807 + 0.3719) % 1; u = r; r = (r * 16807 + 0.1931) % 1; v = r; }
        return { x: cx + (u - 0.5) * this.w * es, y: cy + (v - 0.5) * this.h * es };
      },
    };
  }

  build(f: Frame, t: number): void {
    const el = this.el;
    if (!visibleAt(el, t)) return;
    const tl = t - el.start;
    const st = this.rig.state(tl, 0);
    if (st.alpha <= 0.002) return;
    const tex = this.img.texAt(tl, el.playback);
    const base = (hw: number, hh: number) => ({
      px: st.px, py: st.py, ox: 0, oy: 0, hw, hh, rot: st.rot, skew: st.skew, sx: st.sx, sy: st.sy, bright: st.bright, glow: st.glow,
      u0: 0, v0: 0, u1: 1, v1: 1, g0: 0, gv0: 0, g1: 1, gv1: 1, r: 1, g: 1, b: 1, a: st.alpha,
    });
    const boxA = this.w / this.h;
    const inst: number[] = [];
    pushQuad(inst, base(this.w / 2, this.h / 2));
    const fill = el.look !== 'original' && el.gradient ? fillFor(el.gradient, boxA, tl) : null;
    const imgBatch: DrawBatch = { tex, fill, fillMode: el.look === 'gradient' ? 2 : 1, premultiplied: true, instances: inst, emit: 0 };
    if (this.set && el.outline) {
      const k = this.w / this.pxW, cell = this.set.cells.get('#')!;
      const cinst: number[] = [];
      pushQuad(cinst, {
        ...base((cell.w / 2) * k, (cell.h / 2) * k), u0: cell.rect.x / this.set.atlasW, v0: cell.rect.y / this.set.atlasH, u1: (cell.rect.x + cell.w) / this.set.atlasW, v1: (cell.rect.y + cell.h) / this.set.atlasH,
        g0: -this.pad / this.pxW, gv0: -this.pad / this.pxH, g1: (cell.w - this.pad) / this.pxW, gv1: (cell.h - this.pad) / this.pxH,
      });
      layerBatches(f, this.set, el.outline, cinst, boxA, tl, (kind) => kind === 'face' || kind === 'highlight' || kind === 'bevelLight' || kind === 'bevelShade');
      f.draws.push(imgBatch);
      layerBatches(f, this.set, el.outline, cinst, boxA, tl, (kind) => !(kind === 'highlight' || kind === 'bevelLight' || kind === 'bevelShade'));
    } else f.draws.push(imgBatch);
    const sp = el.shine ? shineProgress(el.shine, tl) : null;
    if (sp !== null && el.shine) f.draws.push(shineBatch(el.shine, sp, boxA, tex, true, inst));
  }

  dispose(): void { /* assets belong to the library */ }
}

export function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0) % 100000;
}

export type { CounterElement, SceneElement, TextStyle };
