/**
 * The reel board at run time: draws the grid of symbols for any time t from the plan (model/board.ts). Spinning reels scroll with motion
 * blur and stop with a bounce, a drum rolls them over a cylinder, drops fall and bounce, pops spring in; then the winners move while the
 * rest dim, an expanding wild stretches over its reel, and winners pop while new symbols tumble down. Symbols are cropped to the board's
 * window with UV rectangles (there is no scissor), so a symbol sliding out of the top or bottom is cut exactly at the edge.
 */
import { boardInfo } from '../model/boardinfo';
import { MotionRig } from '../anim/rig';
import type { Frame } from '../engine/frame';
import { ICON_FX } from '../engine/frame';
import { clamp, easeInQuad, easeOutBack, h1, lerp, smoothstep } from '../engine/math';
import type { ObjectInfo } from '../engine/object';
import { drawIcon, iconDims } from '../fx/helpers';
import { addBoardMod, noBoardMod, type BoardInfo, type BoardMod, type CellModFn, type Silhouette } from '../fx/effect';
import { dropY, DROP_BOUNCE, normalSymbols, planBoard, reelScroll, stripSymbol, type BoardPlan, type Cell } from '../model/board';
import type { BoardElement, SceneElement } from '../model/scene';
import { elementAssets } from '../model/scene';
import type { LoadedImage } from './assets';
import { hashStr, type ElementRuntime, type Env } from './elements';

const visibleAt = (el: SceneElement, t: number): boolean => !el.hidden && t >= el.start && (el.end === undefined || t <= el.end);
const SYMBOL_FILL = 0.84;           // a symbol fills this much of its cell

interface Draw { c: number; y: number; sym: number; scale?: number; sx?: number; alpha?: number; bright?: number; blur?: number; x?: number; role?: 'win' | 'plain'; tint?: number }

export { boardInfo };

export class BoardRuntime implements ElementRuntime {
  plan!: BoardPlan;
  private imgs = new Map<string, LoadedImage>();
  private rig!: MotionRig;
  private env!: Env;
  private normals: number[] = [];
  private seed = 0;
  /** What the effects aimed at this board do to it at this moment (set by the player before each build). */
  private mod: BoardMod = noBoardMod();
  constructor(public el: BoardElement) {}
  private cellMods: CellModFn[] = [];
  resetMods(): void { this.mod = noBoardMod(); this.cellMods = []; }
  /** Per-symbol animation from an effect (a wild pulsing, a row vanishing); applied to symbols that are at rest in their cell. */
  addCellMod(fn: CellModFn): void { this.cellMods.push(fn); }
  addMod(m: Partial<BoardMod>): void { addBoardMod(this.mod, m); }

  async prepare(env: Env): Promise<void> {
    this.env = env;
    const ids = elementAssets(this.el);
    await Promise.all(ids.map(async (id) => { this.imgs.set(id, await env.images.get(id)); }));
    this.rebuild();
  }

  private rebuild(): void {
    const el = this.el;
    this.plan = planBoard(el);
    this.normals = normalSymbols(el);
    this.seed = Number(el.params.seed ?? 5) * 1009 + 17;
    this.rig = new MotionRig({
      motion: el.motion, glyphs: [{ cx: 0, cy: 0, line: 0, word: 0 }], ref: this.width(), seed: this.env.seed + hashStr(el.id), aspect: this.env.aspect,
      ex: el.x * this.env.aspect, ey: el.y, es: el.scale, er: (el.rotation * Math.PI) / 180, opacity: el.opacity,
    });
  }

  rasterKey(el: SceneElement): string { return el.kind === 'board' ? elementAssets(el).join('|') : 'x'; }
  retarget(el: SceneElement): void { this.el = el as BoardElement; this.rebuild(); }

  private pitch(): number { return this.el.cell * (1 + this.el.gap); }
  width(): number { return this.plan ? this.plan.cols * this.pitch() - this.el.cell * this.el.gap : this.el.cols * this.pitch(); }
  height(): number { return this.plan ? this.plan.rows * this.pitch() - this.el.cell * this.el.gap : this.el.rows * this.pitch(); }

  motionEnd(): number { return Math.max(this.rig.motionEnd, this.plan.end); }
  contentEnd(): number { return Math.max(this.rig.motionEnd, this.plan.end); }
  exitEnd(): number { return this.rig.exitEnd(); }
  textureUids(): string[] { return []; }
  anchor() { return { x: this.el.x, y: this.el.y, size: Math.max(this.width(), this.height()) }; }
  silhouette(): Silhouette {
    const cx = this.el.x * this.env.aspect, cy = this.el.y, hw = (this.width() * this.el.scale) / 2, hh = (this.height() * this.el.scale) / 2;
    return { box: { x0: cx - hw, y0: cy - hh, x1: cx + hw, y1: cy + hh }, sample: (a, b) => ({ x: cx + (a - 0.5) * 2 * hw * 0.9, y: cy + (b - 0.5) * 2 * hh * 0.9 }) };
  }

  /** Geometry and events for effect layers, in scene units and scene seconds. */
  info(): BoardInfo { return boardInfo(this.el, this.plan, this.env.aspect); }

  private obj(asset: string, tl: number): ObjectInfo | null {
    const img = this.imgs.get(asset);
    return img ? { ...img.info, tex: img.texAt(tl, 'loop') } : null;
  }

  build(f: Frame, t: number): void {
    const el = this.el;
    if (!visibleAt(el, t)) return;
    const tl = t - el.start;
    const st = this.rig.state(tl, 0);
    if (st.alpha <= 0.002) return;
    const mod = this.mod, wob = mod.wobble ? 1 + mod.wobble * Math.sin(tl * 3.1) : 1;
    const plan = this.plan, R = plan.rows, C = plan.cols, sxm = st.sx * mod.scale * wob, pitch = this.pitch() * sxm, cell = el.cell * sxm;
    const W = this.width() * sxm, H = this.height() * st.sy * mod.scale * wob;
    const cx = st.px + mod.dx, cy = st.py + mod.dy, left = cx - W / 2 + cell / 2, top = cy - H / 2 + cell / 2;
    const rotB = st.rot + mod.rot, cs = Math.cos(rotB), sn = Math.sin(rotB);
    const mTint = mod.tint, mBright = mod.bright;
    const place = (x: number, yv: number): [number, number] => { const dx = x - cx, dy = yv - cy; return [cx + cs * dx - sn * dy, cy + sn * dx + cs * dy]; };
    const winTop = top - cell / 2, winBot = top + (R - 1) * pitch + cell / 2;

    // panel and tiles
    if (el.panel) { const o = this.obj(el.panel, tl); if (o) drawIcon(f, o, { cx, cy, size: 1, w: W + cell * 0.5, h: H + cell * 0.5, alpha: st.alpha, rot: rotB, bright: mBright, tint: mTint }); }
    if (el.frame) {
      const o = this.obj(el.frame, tl);
      if (o) for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) { const [x, y] = place(left + c * pitch, top + r * pitch); drawIcon(f, o, { cx: x, cy: y, size: cell, alpha: st.alpha, rot: rotB, bright: mBright, tint: mTint }); }
    }

    const draws = this.draws(tl);
    // while the wild plays its own animation over its reel, the symbol it replaces is gone and the others in that reel step back
    const exP = plan.expand, exAnimOn = !!(exP && el.symbols[exP.sym]?.expand && this.imgs.get(el.symbols[exP.sym]!.expand!.asset));
    const winners = new Set<string>(), act = this.activeWin(tl);
    if (act) for (const [r, c] of act.cells) winners.add(`${r},${c}`);
    const dim = act ? Number(el.params.dim ?? 0.6) * smoothstep(0, 0.35, tl - act.at) : 0;
    const wStyle = String(el.params.winStyle ?? 'bounce');
    const late: (() => void)[] = [];
    for (const d of draws) {
      const sym = el.symbols[d.sym];
      const o = sym ? this.obj(sym.asset, tl) : null;
      if (!sym || !o) continue;
      const row = Math.round(d.y), isWin = d.role !== 'plain' && winners.has(`${row},${d.c}`) && Math.abs(d.y - row) < 0.02;
      let scale = d.scale ?? 1, bright = d.bright ?? 1, alpha = d.alpha ?? 1, yOff = 0, xOff = d.x ?? 0;
      let tint = 1;
      if (act) {
        if (isWin) {
          const ph = tl - act.at, att = smoothstep(0, 0.25, ph);
          if (wStyle === 'bounce') { yOff = -0.16 * Math.abs(Math.sin(ph * Math.PI * 1.4)) * att; scale *= 1 + 0.06 * att; }
          else if (wStyle === 'pulse') { scale *= 1 + 0.14 * att * (0.5 + 0.5 * Math.sin(ph * 7)); bright *= 1 + 0.2 * att; }
          else if (wStyle === 'shake') { xOff += Math.sin(ph * 46) * 0.035 * att; yOff = Math.cos(ph * 39) * 0.02 * att; scale *= 1 + 0.06 * att; }
          else bright *= 1 + 0.5 * att * (0.5 + 0.5 * Math.sin(ph * 6));
        } else tint = 1 - 0.78 * dim;
      }
      const pop = this.popFactor(tl, row, d.c);
      if (pop) { scale *= pop.scale; alpha *= pop.alpha; bright *= pop.bright; }
      // animations from effects aimed at this board: only for symbols at rest in their cell
      let sxm = 1, sym2 = 1, rotC = 0, cellTint: [number, number, number] | null = null;
      if (this.cellMods.length && d.role === 'plain' && Math.abs(d.y - row) < 0.03 && row >= 0 && row < R) {
        for (const fn of this.cellMods) {
          const m = fn(row, d.c);
          if (!m) continue;
          scale *= m.scale ?? 1; sxm *= m.sx ?? 1; sym2 *= m.sy ?? 1; xOff += m.dx ?? 0; yOff += m.dy ?? 0; rotC += m.rot ?? 0; bright *= m.bright ?? 1; alpha *= m.alpha ?? 1;
          if (m.tint) cellTint = cellTint ? [cellTint[0] * m.tint[0], cellTint[1] * m.tint[1], cellTint[2] * m.tint[2]] : [...m.tint];
        }
      }
      if (exAnimOn && exP && d.c === exP.reel && tl >= exP.at && d.role === 'plain') { const lc = tl - exP.at; alpha *= row === Math.floor((R - 1) / 2) ? 1 - smoothstep(0, 0.15, lc) : 1 - 0.65 * smoothstep(0, 0.3, lc); }
      if (alpha <= 0.003 || scale <= 0.003 || sxm <= 0.003 || sym2 <= 0.003) continue;
      const rj = mod.rattle ? (h1(d.c * 131 + row * 17 + Math.floor(tl * 30)) - 0.5) * mod.rattle * 0.5 : 0, rj2 = mod.rattle ? (h1(d.c * 71 + row * 29 + Math.floor(tl * 30) + 9) - 0.5) * mod.rattle * 0.5 : 0;
      const draw = () => this.symbol(f, o, { c: d.c, y: d.y + yOff + rj2, x: xOff + rj, scale: scale * (d.sx ?? 1) * sxm, sy: scale * sym2, alpha: alpha * st.alpha, bright: bright * (d.tint ?? 1) * mBright, tint, blur: d.blur ?? 0, tintRgb: cellTint ? [mTint[0] * cellTint[0], mTint[1] * cellTint[1], mTint[2] * cellTint[2]] : mTint }, left, top, cell, pitch, winTop, winBot, place, rotB + rotC);
      if (isWin) late.push(draw); else draw();
    }
    for (const l of late) l();

    // an expanding wild stretches over its reel; with an animation of its own, that plays from the moment the expansion starts
    const ex = plan.expand;
    if (ex && tl >= ex.at) {
      const sym = el.symbols[ex.sym], anim = sym?.expand, animImg = anim ? this.imgs.get(anim.asset) : undefined;
      const local = tl - ex.at, prog = clamp(local / ex.dur), mid = (R - 1) / 2, row0 = Math.floor((R - 1) / 2);
      let o: ObjectInfo | null = sym ? this.obj(sym.asset, tl) : null, flash = 1 + 0.35 * Math.sin(Math.PI * prog), fill = false;
      if (anim && animImg) {
        const at = anim.play === 'fit' && animImg.duration > 0 ? prog * animImg.duration : local;
        o = { ...animImg.info, tex: animImg.texAt(at, 'once') }; flash = 1; fill = anim.fit === 'fill';
      }
      if (o) {
        const e = fill ? 1 : easeOutBack(clamp(local / ex.dur), 0.9);
        const hCells = lerp(1, R, e), yc = lerp(row0, mid, e), hh = (hCells - 1) * pitch + cell;
        const [x, y] = place(left + ex.reel * pitch, top + yc * pitch);
        // a picture made for the whole reel keeps its own proportions, as tall as the reel; a growing wild is stretched to the reel like its still picture
        const w = fill ? Math.max(cell * 0.2, hh * o.aspect) : cell * (1 + 0.1 * e), h = fill ? hh : hh * 0.98;
        drawIcon(f, o, { cx: x, cy: y, size: cell, w, h, alpha: st.alpha * (fill ? smoothstep(0, 0.06, local) : 1), rot: rotB, bright: flash * mBright, tint: mTint });
      }
    }
  }

  /** The symbols to draw at board time tl, as positions in rows (fractional while moving). */
  private draws(tl: number): Draw[] {
    const plan = this.plan, R = plan.rows, C = plan.cols, out: Draw[] = [];
    const blurParam = Number(this.el.params.blur ?? 0.9);
    if (tl >= plan.stopEnd + (plan.style === 'drum' ? 0.3 : 0)) {
      // settled (or tumbling): stage by stage
      let layout = plan.layout;
      for (const k of plan.tumbles) {
        if (tl < k.popAt) break;
        if (tl < k.dropAt) {                        // winners have popped; the rest wait
          const popped = new Set(k.cells.map(([r, c]) => `${r},${c}`));
          for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) if (!popped.has(`${r},${c}`)) out.push({ c, y: r, sym: k.before[r]![c]!, role: 'plain' });
          return out;
        }
        if (tl < k.settleAt + 0.01) {
          const moved = new Set<string>(k.falls.map((fl) => `${fl.to},${fl.c}`));
          const popped = new Set(k.cells.map(([r, c]) => `${r},${c}`));
          const wasStill = new Set<string>();
          for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) if (!popped.has(`${r},${c}`) && !moved.has(`${r},${c}`)) wasStill.add(`${r},${c}`);
          for (const key of wasStill) { const [r, c] = key.split(',').map(Number) as Cell; out.push({ c, y: r, sym: k.before[r]![c]!, role: 'plain' }); }
          for (const fl of k.falls) out.push({ c: fl.c, y: dropY(tl - fl.at, fl.from, fl.to, DROP_BOUNCE), sym: fl.sym, role: 'plain', blur: tl - fl.at > 0 && tl - fl.at < 0.25 ? 0.1 * blurParam : 0 });
          return out;
        }
        layout = k.after;
      }
      for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) out.push({ c, y: r, sym: layout[r]![c]!, role: 'plain' });
      return out;
    }
    const style = plan.style;
    for (let c = 0; c < C; c++) {
      const reel = plan.reels[c]!;
      if (style === 'drop') this.dropColumn(out, tl, c);
      else if (style === 'pop') this.popColumn(out, tl, c);
      else {
        const p = reelScroll(reel, tl);
        const v = Math.abs(reelScroll(reel, tl + 0.016) - reelScroll(reel, tl - 0.016)) / 0.032;
        const blur = blurParam * clamp(v / Math.max(1, reel.v), 0, 1.3) * (style === 'turbo' ? 0.36 : 0.26);
        const drum = style === 'drum', m = (R - 1) / 2, kappa = 1 - smoothstep(reel.stop - 0.1, reel.stop + 0.25, tl), K = ((Math.PI / 2) * 0.95 / (R / 2 + 0.6)) * kappa;
        for (let n = Math.floor(p - R) - 1; n <= Math.ceil(p) + 1; n++) {
          const y = p - n;
          if (y < -1.3 || y > R + 0.3) continue;
          const sym = stripSymbol(plan, this.normals, this.seed, c, n);
          if (drum && K > 1e-3) {
            const th = (y - m) * K;
            if (Math.abs(th) >= Math.PI / 2 - 0.02) continue;
            const cth = Math.cos(th);
            out.push({ c, y: m + Math.sin(th) / K, sym, scale: cth, sx: 0.88 + 0.12 * cth, bright: 0.38 + 0.62 * cth, blur, role: 'plain' });
          } else out.push({ c, y, sym, blur, role: 'plain' });
        }
      }
    }
    return out;
  }

  private dropColumn(out: Draw[], tl: number, c: number): void {
    const plan = this.plan, R = plan.rows, reel = plan.reels[c]!, rowGap = 0.07;
    for (let r = 0; r < R; r++) {
      const tOut = reel.dropStart + (R - 1 - r) * rowGap, tIn = reel.dropStart + 0.3 + (R - 1 - r) * rowGap;
      const oldY = r + 0.5 * 40 * Math.max(0, tl - tOut) ** 2;
      if (oldY < R + 1.4) out.push({ c, y: oldY, sym: plan.initial[r]![c]!, role: 'plain', blur: tl > tOut ? 0.12 * Number(this.el.params.blur ?? 0.9) : 0 });
      if (tl >= tIn - 0.01) out.push({ c, y: dropY(tl - tIn, r - R - 1, r, DROP_BOUNCE), sym: plan.layout[r]![c]!, role: 'plain', blur: tl - tIn < 0.3 ? 0.1 * Number(this.el.params.blur ?? 0.9) : 0 });
    }
  }

  private popColumn(out: Draw[], tl: number, c: number): void {
    const plan = this.plan, R = plan.rows, reel = plan.reels[c]!, rowGap = 0.1;
    for (let r = 0; r < R; r++) {
      const tau = tl - (reel.dropStart + r * rowGap);
      if (tau < 0.2) out.push({ c, y: r, sym: plan.initial[r]![c]!, scale: tau < 0 ? 1 : 1 - easeInQuad(tau / 0.2), role: 'plain', alpha: tau < 0 ? 1 : 1 - tau / 0.2 * 0.6 });
      else { const u = clamp((tau - 0.25) / 0.4); if (u > 0) out.push({ c, y: r, sym: plan.layout[r]![c]!, scale: easeOutBack(u, 2.4), role: 'plain', alpha: smoothstep(0, 0.25, u) }); }
    }
  }

  private activeWin(tl: number): { at: number; until: number; cells: Cell[] } | null {
    const plan = this.plan;
    if (plan.tumbles.length) {
      for (let i = plan.tumbles.length - 1; i >= 0; i--) { const k = plan.tumbles[i]!; if (tl >= k.winAt && tl < k.popAt) return { at: k.winAt, until: k.popAt, cells: k.cells }; }
      return null;
    }
    return plan.win && tl >= plan.win.at ? { at: plan.win.at, until: Infinity, cells: plan.win.cells } : null;
  }

  /** Winners swell and vanish when they pop. */
  private popFactor(tl: number, row: number, c: number): { scale: number; alpha: number; bright: number } | null {
    for (const k of this.plan.tumbles) {
      if (tl < k.popAt || tl > k.dropAt) continue;
      if (!k.cells.some(([r, cc]) => r === row && cc === c)) continue;
      const u = clamp((tl - k.popAt) / 0.3);
      return { scale: u < 0.35 ? 1 + 0.3 * (u / 0.35) : 1.3 * (1 - (u - 0.35) / 0.65), alpha: 1 - smoothstep(0.5, 1, u), bright: 1 + 0.8 * Math.sin(Math.PI * Math.min(1, u * 1.4)) };
    }
    return null;
  }

  private symbol(f: Frame, o: ObjectInfo, d: { c: number; y: number; x: number; scale: number; sy: number; alpha: number; bright: number; tint: number; blur: number; tintRgb: [number, number, number] }, left: number, top: number, cell: number, pitch: number, winTop: number, winBot: number, place: (x: number, y: number) => [number, number], rot: number): void {
    const size = cell * SYMBOL_FILL, dims = iconDims(o, size);
    const wFull = dims.w * d.scale, hFull = dims.h * d.sy;
    const xc = left + d.c * pitch + d.x * pitch, yc = top + d.y * pitch;
    const y0 = Math.max(yc - hFull / 2, winTop), y1 = Math.min(yc + hFull / 2, winBot);
    if (y1 - y0 <= 1e-5) return;
    const v0 = (y0 - (yc - hFull / 2)) / hFull, v1 = (y1 - (yc - hFull / 2)) / hFull;
    const [x, y] = place(xc, (y0 + y1) / 2);
    const tint = d.tint, tr = d.tintRgb;
    drawIcon(f, o, {
      cx: x, cy: y, size, w: wFull, h: y1 - y0, uv: [0, v0, 1, v1], alpha: d.alpha, bright: d.bright, rot, tint: tint === 1 && tr[0] === 1 && tr[1] === 1 && tr[2] === 1 ? undefined : [tint * tr[0], tint * tr[1], tint * tr[2]],
      fx: d.blur > 0.004 ? { mode: ICON_FX.vblur, progress: 0, seed: 0, p: d.blur } : undefined,
    });
  }

  dispose(): void { /* images belong to the library */ }
}
