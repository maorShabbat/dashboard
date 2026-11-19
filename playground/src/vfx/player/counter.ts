import { MotionRig, type RigGlyph } from '../anim/rig';
import type { Frame } from '../engine/frame';
import type { CounterElement, SceneElement } from '../model/scene';
import { layoutText, rasterGlyphSet, type GlyphSet, type TextLayout } from '../style/glyphs';
import { applyCase } from '../style/glyphs';
import { buildTemplate, formatNumber, landScale, slotStates, type Slot } from './counterMath';
import { hashStr, shineEnd, shineProgress, type ElementRuntime, type Env } from './elements';
import { layerTex, pushQuad, bandFill } from './resources';
import { fillFor, fontLabel } from './resources';
import { layerFill } from '../style/stylestack';
import { rasterHash } from '../style/textStyle';

const OVERSAMPLE = 1.25;

/**
 * Amount counter: a fixed row of digit slots (digits never move), each showing the number's digit at that place. Rolling, flipping,
 * popping and slot-machine reels are different ways of getting from one digit to the next; all are pure functions of time.
 */
export class CounterRuntime implements ElementRuntime {
  private set!: GlyphSet;
  private layout!: TextLayout;
  private rig!: MotionRig;
  private slots: Slot[] = [];
  private k = 1;
  constructor(public el: CounterElement) {}
  private env!: Env;

  async prepare(env: Env): Promise<void> {
    const el = this.el;
    await env.fonts.load(el.style.font);
    this.slots = buildTemplate(el);
    const template = this.slots.map((s) => s.ch).join('');
    const chars = [...new Set([...'0123456789-', ...template, el.group, el.decimalMark].filter(Boolean))];
    const fontPx = Math.max(6, Math.min(420, Math.round(el.size * env.pxPerUnit * OVERSAMPLE)));
    this.set = rasterGlyphSet({ chars: chars.map((c) => applyCase(c, el.style)), style: el.style, fontPx, fonts: env.fonts });
    if (this.set.missing.length) env.warnings.push(`"${el.name}": ${fontLabel(env.fonts, el.style.font.id)} has no glyph for ${this.set.missing.map((c) => `“${c}”`).join(' ')}; the browser draws them from a fallback font. Pick a font that has them.`);
    this.k = el.size / this.set.fontPx;
    this.layout = layoutText(this.set, template, { align: el.style.align, letterSpacingPx: el.style.letterSpacing * this.set.fontPx, lineSpacing: 1, tabularDigits: true, kerning: false });
    this.env = env;
    this.rebuildRig();
  }

  private rebuildRig(): void {
    const el = this.el, env = this.env;
    const glyphs: RigGlyph[] = this.layout.glyphs.map((g) => ({ cx: (g.cx - this.layout.w / 2) * this.k, cy: (g.cy - this.layout.h / 2) * this.k, line: 0, word: 0 }));
    this.rig = new MotionRig({
      motion: el.motion, glyphs, ref: el.size, seed: env.seed + hashStr(el.id), aspect: env.aspect, ex: el.x * env.aspect, ey: el.y, es: el.scale, er: (el.rotation * Math.PI) / 180, opacity: el.opacity,
    });
  }
  rasterKey(el: SceneElement, env: Env): string {
    if (el.kind !== 'counter') return 'x';
    const st = el.style;
    return [el.from, el.to, el.decimals, el.prefix, el.suffix, el.group, el.decimalMark, el.size, rasterHash(st), st.letterSpacing, st.align, st.uppercase ? 1 : 0, Math.round(env.pxPerUnit / 40)].join('|');
  }
  retarget(el: SceneElement): void { this.el = el as CounterElement; this.rebuildRig(); }

  motionEnd(): number { return Math.max(this.rig.motionEnd, shineEnd(this.el.shine)); }
  contentEnd(): number { return Math.max(this.motionEnd(), this.el.countStart + this.el.countDuration + (this.el.landPulse > 0 ? 0.5 : 0.2)); }
  exitEnd(): number { return this.rig.exitEnd(); }
  textureUids(): string[] { return this.set.layers.map((l) => l.uid); }
  anchor() { return { x: this.el.x, y: this.el.y, size: this.el.size }; }
  /** The text shown at element time `tl` (for tests and Copy for AI). */
  textAt(tl: number): string {
    const st = slotStates(this.el, tl, this.slots);
    return st.map((s) => s.ch ?? '').join('');
  }
  template(): string { return this.slots.map((s) => s.ch).join(''); }
  formatted(v: number): string { return this.el.prefix + formatNumber(v, this.el.decimals, this.el.group, this.el.decimalMark) + this.el.suffix; }

  build(f: Frame, t: number): void {
    const el = this.el;
    if (el.hidden || t < el.start || (el.end !== undefined && t > el.end)) return;
    const tl = t - el.start;
    const { set, layout, k } = this;
    const states = slotStates(el, tl, this.slots);
    const land = landScale(el, tl);
    const inst: number[] = [], faceInst: number[] = [];
    const boxA = layout.w / Math.max(1, layout.h);
    const ax = set.atlasW, ay = set.atlasH;
    const lineEm = set.lineH * k;
    const push = (gi: number, ch: string, dyEm: number, alphaMul: number, syMul: number, scaleMul: number) => {
      const cell = set.cells.get(applyCase(ch, el.style));
      if (!cell || alphaMul <= 0.002) return;
      const g = layout.glyphs[gi]!;
      const st = this.rig.state(tl, gi);
      if (st.alpha <= 0.002) return;
      const left = g.x - cell.ox, top = g.y + set.top - cell.oy;
      const sc = land * scaleMul;
      const q = {
        px: st.px, py: st.py + dyEm * lineEm * st.sy, ox: (left + cell.w / 2 - g.cx) * k, oy: (top + cell.h / 2 - g.cy) * k, hw: (cell.w / 2) * k, hh: (cell.h / 2) * k,
        rot: st.rot, skew: st.skew, sx: st.sx * sc, sy: st.sy * sc * syMul, bright: st.bright, glow: st.glow,
        u0: cell.rect.x / ax, v0: cell.rect.y / ay, u1: (cell.rect.x + cell.w) / ax, v1: (cell.rect.y + cell.h) / ay,
        g0: left / layout.w, gv0: top / layout.h, g1: (left + cell.w) / layout.w, gv1: (top + cell.h) / layout.h, r: 1, g: 1, b: 1, a: st.alpha * alphaMul,
      };
      pushQuad(inst, q); pushQuad(faceInst, q);
    };
    states.forEach((s, gi) => {
      if (s.ch !== null && s.alphaNow > 0) {
        if (el.roll === 'flip' && s.r > 0) push(gi, s.ch, 0, 1, Math.max(0.02, 1 - 2 * Math.min(0.5, s.r)), s.pop);
        else push(gi, s.ch, -s.r * 0.8, s.alphaNow, 1, s.pop);
      }
      if (s.next !== null && s.alphaNext > 0) {
        if (el.roll === 'flip') push(gi, s.next, 0, 1, s.r > 0.5 ? Math.max(0.02, 2 * s.r - 1) : 0.0001, 1);
        else push(gi, s.next, (1 - s.r) * 0.8, s.alphaNext, 1, 1);
      }
    });
    if (!inst.length) return;
    for (const layer of set.layers) {
      const fill = layerFill(el.style, layer.kind, layer.ref);
      const emissive = layer.kind === 'glow' && el.style.glow.bloom;
      f.draws.push({ tex: layerTex(layer), fill: fillFor(fill, boxA, tl), fillMode: 1, premultiplied: false, instances: inst, emit: emissive ? 1 : 0, emitGain: 0.4, glowLayer: layer.kind === 'glow' });
    }
    const sp = el.shine ? shineProgress(el.shine, tl) : null;
    const face = set.layers.find((l) => l.kind === 'face');
    if (sp !== null && el.shine && face) {
      const half = 0.5 + el.shine.width / 2 + 0.05, e = sp * sp * (3 - 2 * sp) * 0.4 + sp * 0.6;
      f.draws.push({
        tex: layerTex(face), fill: bandFill(el.shine.color, el.shine.angle, el.shine.width, -half + 2 * half * e, boxA), fillMode: 2, premultiplied: false,
        instances: faceInst.map((v, i) => (i % 24 === 23 ? v * el.shine!.intensity : v)), emit: el.shine.bloom ? 2 : 0, emitGain: 1.15,
      });
    }
  }
  dispose(): void { /* released by uid */ }
}
