/**
 * ScenePlayer: loads a scene (fonts, images, rasters) and builds its frame for any time t. A frame is a pure function of (scene, t):
 * element draws first, then every effect layer merged on top. The same code runs in the playground, in thumbnails and in exported
 * bundles; nothing about the picture is decided anywhere else.
 */
import { effectById } from '../fx';
import { defaultsOf, thinParams, type EffectCtx, type PValues, type ShowEffect } from '../fx/effect';
import { mergeFrame } from '../fx/merge';
import { recolorFrame } from '../fx/ramp';
import { emptyFrame, type Frame } from '../engine/frame';
import type { SoundCue } from '../engine/audio';
import { resolveSounds, type ResolvedSound } from '../fx/cues';
import type { Renderer, RenderOptions } from '../engine/renderer';
import { sceneFonts, type FxLayer, type Scene, type SceneElement } from '../model/scene';
import type { FontService } from '../fonts/service';
import { isAbort } from '../fonts/service';
import { ImageRuntime, ShapeRuntime, TextRuntime, type ElementRuntime, type Env } from './elements';
import { cellKey, composeCell } from './cell';
import { BoardRuntime } from './board';
import { fontLabel } from './resources';
import { CounterRuntime } from './counter';
import type { ImageLibrary } from './assets';

export interface PlayerDeps { renderer: Renderer; fonts: FontService; images: ImageLibrary }
export interface LoadIssue { element: string; name: string; message: string }
export interface LoadReport { warnings: string[]; errors: LoadIssue[] }

export function createRuntime(el: SceneElement): ElementRuntime {
  switch (el.kind) {
    case 'text': return new TextRuntime(el);
    case 'counter': return new CounterRuntime(el);
    case 'image': return new ImageRuntime(el);
    case 'shape': return new ShapeRuntime(el);
    case 'board': return new BoardRuntime(el);
  }
}

/** The effect's settings for a layer: defaults, the layer's own, positioned on its target element. */
export function layerParams(e: ShowEffect, layer: FxLayer, anchor: { x: number; y: number; size: number } | null): PValues {
  const p: PValues = { ...defaultsOf(e), ...layer.params };
  if (anchor && e.params.some((d) => d.key === 'cx')) { p.cx = anchor.x; p.cy = anchor.y; }
  if (anchor && e.usesObject && e.params.some((d) => d.key === 'size')) p.size = anchor.size;
  // an emitter made from a picture takes its piece size from the picture's own size (a piece's radius is half the picture's longest side)
  if (anchor && e.usesObject && layer.params.pieceSize === undefined && e.params.some((d) => d.key === 'pieceSize')) p.pieceSize = anchor.size / 2;
  return p;
}

export class ScenePlayer {
  scene!: Scene;
  runtimes: ElementRuntime[] = [];
  env!: Env;
  report: LoadReport = { warnings: [], errors: [] };
  private fxCache: { layer: FxLayer; e: ShowEffect; params: PValues; target: ElementRuntime | null; target2: ElementRuntime | null }[] = [];
  private _duration = 0;
  /** Time ranges during which an element is drawn by an effect instead of by itself. */
  private takeover = new Map<string, { from: number; to: number }[]>();
  private uids = new Set<string>();
  /** Composed frame + symbol pictures, by effect layer id (see cell.ts). */
  private cells = new Map<string, { key: string; rt: ImageRuntime }>();
  private loadToken = 0;
  debug = false;

  constructor(readonly deps: PlayerDeps) {}

  private fontLabel(id: string): string { return fontLabel(this.deps.fonts, id); }

  /** Load (or reload) a scene. Elements whose resources fail are listed in `report.errors` and left out: a missing font is never replaced by a fallback. */
  async load(scene: Scene, signal?: AbortSignal): Promise<LoadReport> {
    const token = ++this.loadToken;
    const { renderer, fonts, images } = this.deps;
    this.releaseTextures();
    this.scene = scene;
    const warnings: string[] = [];
    const errors: LoadIssue[] = [];
    const env: Env = { aspect: scene.aspect, pxPerUnit: renderer.pxPerUnit, fonts, images, seed: scene.seed, warnings };
    this.env = env;
    renderer.setAspect(scene.aspect);
    // load every font the scene uses (each failure is reported against the elements that use it)
    const failed = new Map<string, string>();
    await Promise.all(sceneFonts(scene).map((spec) => fonts.load(spec, signal).catch((e: unknown) => { if (!isAbort(e)) failed.set(`${spec.id}|${spec.weight}|${spec.style}`, (e as Error).message); else throw e; })));
    if (token !== this.loadToken) return this.report;
    const runtimes: ElementRuntime[] = [];
    await Promise.all(scene.elements.map(async (el) => {
      const rt = createRuntime(el);
      try {
        if ((el.kind === 'text' || el.kind === 'counter')) {
          const key = `${el.style.font.id}|${el.style.font.weight}|${el.style.font.style}`;
          const msg = failed.get(key);
          if (msg) throw new Error(`Font "${this.fontLabel(el.style.font.id)}" could not be loaded: ${msg}`);
        }
        await rt.prepare(env);
        runtimes[scene.elements.indexOf(el)] = rt;
      } catch (e) {
        errors.push({ element: el.id, name: el.name, message: (e as Error).message });
      }
    }));
    if (token !== this.loadToken) return this.report;
    this.runtimes = runtimes.filter(Boolean);
    await this.buildCells(errors);
    if (token !== this.loadToken) return this.report;
    this.rebuildFx(errors);
    this.report = { warnings, errors };
    this._duration = this.computeDuration();
    return this.report;
  }

  private computeDuration(): number {
    const s = this.scene;
    let end = 0, remains = false;
    for (const rt of this.runtimes) {
      const el = rt.el;
      if (el.hidden) continue;
      const exit = rt.exitEnd();
      end = Math.max(end, el.start + rt.contentEnd(), el.end ?? 0);
      if (!exit && el.end === undefined && !this.permanentlyHidden(el.id)) remains = true;
    }
    for (const f of this.fxCache) if (f.layer.enabled) end = Math.max(end, f.layer.start + f.e.duration(f.params));
    return s.duration ?? Math.max(0.3, end + (remains ? s.hold : 0.05));
  }

  /**
   * Take an edited copy of the loaded scene. Settings that do not change any raster (positions, motion, colours, gradients, shine,
   * effect settings) apply immediately; elements whose raster changed are prepared again. Falls back to a full load when the set of
   * elements changed.
   */
  async update(scene: Scene): Promise<LoadReport> {
    const old = this.scene;
    const same = old && old.aspect === scene.aspect && old.seed === scene.seed && old.elements.length === scene.elements.length
      && old.elements.every((e, i) => e.id === scene.elements[i]!.id && e.kind === scene.elements[i]!.kind) && this.runtimes.length === scene.elements.length && this.report.errors.length === 0;
    if (!same) return this.load(scene);
    const token = ++this.loadToken;
    const env = this.env;
    const warnings: string[] = [];
    env.warnings = warnings;
    const redo: ElementRuntime[] = [];
    const specs = new Set<string>();
    scene.elements.forEach((el, i) => {
      const rt = this.runtimes[i]!;
      const next = rt.rasterKey(el, env), prev = rt.rasterKey(rt.el, env);
      if (next === prev) rt.retarget(el);
      else { rt.el = el; redo.push(rt); }
      if (el.kind === 'text' || el.kind === 'counter') specs.add(`${el.style.font.id}|${el.style.font.weight}|${el.style.font.style}`);
    });
    this.scene = scene;
    const errors: LoadIssue[] = [];
    await Promise.all(sceneFonts(scene).map((spec) => this.deps.fonts.load(spec).catch((e: unknown) => { errors.push({ element: spec.id, name: this.fontLabel(spec.id), message: `Font "${this.fontLabel(spec.id)}" could not be loaded: ${(e as Error).message}` }); })));
    if (errors.length) { this.report = { warnings, errors }; return this.report; }
    for (const rt of redo) {
      try { await rt.prepare(env); } catch (e) { errors.push({ element: rt.el.id, name: rt.el.name, message: (e as Error).message }); }
    }
    if (token !== this.loadToken) return this.report;
    await this.buildCells(errors);
    if (token !== this.loadToken) return this.report;
    this.rebuildFx(errors);
    this.report = { warnings: [...warnings, ...env.warnings.filter((w) => !warnings.includes(w))], errors };
    this._duration = this.computeDuration();
    return this.report;
  }

  /** Compose every "take the frame along" layer's frame and symbol into one picture (kept while its content is unchanged). */
  private async buildCells(errors: LoadIssue[]): Promise<void> {
    const { renderer, images } = this.deps;
    const byId = new Map(this.runtimes.map((r) => [r.el.id, r]));
    const next = new Map<string, { key: string; rt: ImageRuntime }>();
    for (const layer of this.scene.fx) {
      if (!layer.frame || !layer.target) continue;
      const e = effectById(layer.effect);
      if (!e?.usesObject) continue;
      const icon = byId.get(layer.target), frame = byId.get(layer.frame);
      if (!(icon instanceof ImageRuntime)) continue;
      if (!(frame instanceof ImageRuntime)) { errors.push({ element: layer.id, name: e.name, message: `The frame this effect takes along ("${layer.frame}") is missing, failed to load, or is not a picture.` }); continue; }
      const key = cellKey(frame, icon, this.scene.aspect, renderer.pxPerUnit), old = this.cells.get(layer.id);
      if (old && old.key === key) { next.set(layer.id, old); continue; }
      try { next.set(layer.id, { key, rt: await composeCell(this.env, frame, icon, `cell-${layer.id}`) }); } catch (err) { errors.push({ element: layer.id, name: e.name, message: `Could not compose the frame and symbol: ${(err as Error).message}` }); }
    }
    const keep = new Set([...next.values()].map((c) => c.key));
    for (const c of this.cells.values()) if (!keep.has(c.key)) this.dropCell(c.rt, images);
    this.cells = next;
  }

  private dropCell(rt: ImageRuntime, images = this.deps.images): void {
    this.deps.renderer.tex.release(rt.img.texAt(0, 'loop').uid);
    void images.drop(rt.el.asset);
  }

  private rebuildFx(errors: LoadIssue[]): void {
    const byId = new Map(this.runtimes.map((r) => [r.el.id, r]));
    this.fxCache = []; this.takeover.clear();
    const hide = (id: string, from: number, to: number) => this.takeover.set(id, [...(this.takeover.get(id) ?? []), { from, to }]);
    for (const layer of this.scene.fx) {
      const e = effectById(layer.effect);
      if (!e) { errors.push({ element: layer.id, name: layer.effect, message: `Unknown effect "${layer.effect}"` }); continue; }
      const symbol = layer.target ? byId.get(layer.target) ?? null : null;
      const target: ElementRuntime | null = (layer.frame && this.cells.get(layer.id)?.rt) || symbol;
      if (layer.target && !symbol) { errors.push({ element: layer.id, name: e.name, message: `The element this effect works on ("${layer.target}") is missing or failed to load.` }); continue; }
      const target2 = layer.target2 ? byId.get(layer.target2) ?? null : null;
      if (layer.target2 && !target2) { errors.push({ element: layer.id, name: e.name, message: `The second symbol ("${layer.target2}") is missing or failed to load.` }); continue; }
      const params = layerParams(e, layer, target?.anchor() ?? null);
      this.fxCache.push({ layer, e, params, target, target2 });
      if (layer.enabled && target && (e.takesOver ?? e.usesObject)) {
        for (const id of layer.frame && target !== symbol ? [layer.target!, layer.frame] : [target.el.id]) hide(id, layer.start, e.restores ? layer.start + e.duration(params) : Infinity);
      }
      if (layer.enabled && target2 && e.usesObject2) hide(target2.el.id, -Infinity, layer.start + e.duration(params));
    }
  }

  private permanentlyHidden(id: string): boolean { return (this.takeover.get(id) ?? []).some((w) => w.to === Infinity); }
  private hiddenAt(id: string, t: number): boolean { return (this.takeover.get(id) ?? []).some((w) => t >= w.from && t < w.to); }

  get duration(): number { return this._duration; }

  /** Rasterise again for a new drawing-buffer size (text and shapes are drawn at their on-screen resolution). */
  async rescale(): Promise<void> {
    if (!this.scene) return;
    const now = this.deps.renderer.pxPerUnit;
    if (Math.abs(now - this.env.pxPerUnit) / this.env.pxPerUnit < 0.2) return;
    await this.load(this.scene);
  }

  /** How much of its particles each effect draws (the quality tier). */
  quality = 1;

  private effectCtx(layer: { target: ElementRuntime | null; target2: ElementRuntime | null; layer: FxLayer }, t: number): EffectCtx {
    const objOf = (rt: ElementRuntime | null) => (rt instanceof ImageRuntime ? { ...rt.img.info, tex: rt.img.texAt(t - rt.el.start, rt.el.playback) } : null);
    return {
      aspect: this.scene.aspect, pxPerUnit: this.deps.renderer.pxPerUnit, object: objOf(layer.target), object2: objOf(layer.target2),
      silhouette: layer.target?.silhouette?.() ?? null, seed: this.scene.seed, debug: this.debug,
      board: layer.target instanceof BoardRuntime ? layer.target.info() : null, start: layer.layer.start, quality: this.quality,
    };
  }

  /** Everything visible at scene time t. */
  buildFrame(t: number): Frame {
    const f = emptyFrame();
    // effects that move or colour a reel board work out how first, so the board is drawn in that state
    for (const rt of this.runtimes) if (rt instanceof BoardRuntime) rt.resetMods();
    for (const fx of this.fxCache) {
      if (!fx.layer.enabled || !fx.e.boardMod || !(fx.target instanceof BoardRuntime)) continue;
      const local = t - fx.layer.start;
      if (local < 0 || local >= fx.e.duration(fx.params)) continue;
      const m = fx.e.boardMod(local, fx.params, this.effectCtx(fx, t));
      if (m) fx.target.addMod(m);
    }
    for (const fx of this.fxCache) {
      if (!fx.layer.enabled || !fx.e.cellMod || !(fx.target instanceof BoardRuntime)) continue;
      const local = t - fx.layer.start;
      if (local < 0 || local >= fx.e.duration(fx.params)) continue;
      const fn = fx.e.cellMod(local, fx.params, this.effectCtx(fx, t));
      if (fn) fx.target.addCellMod(fn);
    }
    for (const rt of this.runtimes) {
      if (this.hiddenAt(rt.el.id, t)) continue;
      rt.build(f, t);
    }
    for (const fx of this.fxCache) {
      if (!fx.layer.enabled) continue;
      let local = t - fx.layer.start;
      const dur = fx.e.duration(fx.params);
      if (local < 0 || (local >= dur && !fx.e.holdsEnd)) continue;
      if (local >= dur) local = dur - 1e-4;                      // a transition leaves the new screen up for the rest of the scene
      const sub = emptyFrame();
      fx.e.build(sub, local, thinParams(fx.e, fx.params, this.quality), this.effectCtx(fx, t));
      if (fx.layer.ramp) recolorFrame(sub, fx.layer.ramp, local);
      mergeFrame(f, sub);
    }
    return f;
  }

  render(t: number, opts: RenderOptions): Frame {
    const f = this.buildFrame(t);
    this.deps.renderer.render(f, opts);
    this.noteTextures(f);
    return f;
  }

  private noteTextures(f: Frame): void { for (const b of f.draws) this.uids.add(b.tex.uid); }

  cues(): SoundCue[] {
    const out: SoundCue[] = [];
    if (!this.scene?.sound.enabled || this.scene.sound.builtin === false) return out;
    for (const fx of this.fxCache) {
      if (!fx.layer.enabled) continue;
      for (const c of fx.e.cues?.(fx.params) ?? []) out.push({ ...c, t: c.t + fx.layer.start, gain: c.gain * this.scene.sound.volume });
    }
    return out;
  }

  /** Your own sound files with the time each one plays (the cue point plus its offset), as scene seconds. */
  sounds(): ResolvedSound[] {
    if (!this.scene?.sounds?.length || !this.scene.sound.enabled) return [];
    return resolveSounds(this.scene, this.duration).sounds;
  }

  private releaseTextures(): void {
    const tex = this.deps.renderer.tex;
    for (const rt of this.runtimes) for (const u of rt.textureUids()) tex.release(u);
    for (const u of this.uids) if (u.startsWith('img:') === false) tex.release(u);
    this.uids.clear();
    for (const c of this.cells.values()) this.dropCell(c.rt);
    this.cells.clear();
  }

  dispose(): void {
    this.loadToken++;
    this.releaseTextures();
    this.runtimes = []; this.fxCache = [];
  }
}
