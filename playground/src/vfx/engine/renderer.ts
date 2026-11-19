import { GL, Prog, type GLCounts } from './gl';
import { MAX_DISTORT, MAX_SHOCKS, MAX_VORTICES, QUAD_FLOATS, SCREEN_A, SCREEN_B, type DrawBatch, type Frame, type Sprite, type TexData, type TexRef } from './frame';
import {
  BLUR_FS, BOLT_FS, BOLT_VS, COMPOSITE_FS, DOWN_FS, ELEM_FS, ELEM_VS, FULLSCREEN_VS, POLY_FS, POLY_VS, RIBBON_FS, RIBBON_VS, SCENE_FS, SHARD_FS, SHARD_VS,
  SMOKE_FS, SMOKE_VS, SPRITE_FS, SPRITE_VS, VOL_FS, VOL_VS,
} from './shaders';

export type FitMode = 'fit' | 'fill';
export type Source = TexImageSource & { width: number; height: number };

export interface RenderOptions {
  /** 0..1 blend of the diagnostic grid, evaluated at the *displaced* sample position. */
  grid: number;
  /** Grid lines per scene unit (1 unit = image height). */
  gridDensity: number;
  /** Bloom strength multiplier. */
  bloom: number;
}

export interface ViewInfo { scale: number; offX: number; offY: number; width: number; height: number; mode: FitMode }

interface AttribSpec { loc: number; size: number; offset: number; divisor?: number }

/** A dynamic vertex stream: one VAO + one VBO, refilled each frame from a number[]. */
class Stream {
  readonly vao: WebGLVertexArrayObject;
  readonly vbo: WebGLBuffer;
  private cap = 0;
  constructor(private g: GL, private stride: number, readonly attribs: AttribSpec[], shared?: WebGLBuffer) {
    const gl = g.gl;
    this.vao = g.vertexArray();
    this.vbo = g.buffer();
    gl.bindVertexArray(this.vao);
    if (shared) { gl.bindBuffer(gl.ARRAY_BUFFER, shared); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0); }
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    for (const a of attribs) {
      gl.enableVertexAttribArray(a.loc);
      gl.vertexAttribPointer(a.loc, a.size, gl.FLOAT, false, stride * 4, a.offset * 4);
      if (a.divisor) gl.vertexAttribDivisor(a.loc, a.divisor);
    }
    gl.bindVertexArray(null);
  }
  /** Upload and return the item count (vertices, or instances for instanced streams). */
  upload(data: number[], scratch: Scratch): number {
    const n = Math.floor(data.length / this.stride);
    if (n === 0) return 0;
    const gl = this.g.gl;
    const arr = scratch.fill(data);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    if (arr.byteLength > this.cap) { this.cap = Math.max(arr.byteLength, this.cap * 2, 4096); gl.bufferData(gl.ARRAY_BUFFER, this.cap, gl.DYNAMIC_DRAW); }
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, arr);
    return n;
  }
  /** Point the (instanced) attributes at instance number `first`, so one upload can serve many draws. */
  seek(first: number): void {
    const gl = this.g.gl;
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    for (const a of this.attribs) gl.vertexAttribPointer(a.loc, a.size, gl.FLOAT, false, this.stride * 4, (first * this.stride + a.offset) * 4);
  }
}

class Scratch {
  private buf = new Float32Array(4096);
  fill(data: number[]): Float32Array {
    if (data.length > this.buf.length) this.buf = new Float32Array(Math.max(data.length, this.buf.length * 2));
    const b = this.buf;
    for (let i = 0; i < data.length; i++) b[i] = data[i]!;
    return b.subarray(0, data.length);
  }
}

interface Target { fbo: WebGLFramebuffer; tex: WebGLTexture; w: number; h: number }

/** GL textures created from TexRefs, uploaded on first use, re-uploaded when the version changes, released by uid. */
/** Texture unit used only for uploads, never for drawing. */
const SCRATCH_UNIT = 15;

class TexCache {
  private m = new Map<string, { tex: WebGLTexture; version: number; w: number; h: number }>();
  constructor(private g: GL) {}
  get size(): number { return this.m.size; }
  get bytes(): number { let b = 0; for (const e of this.m.values()) b += e.w * e.h * 4; return b; }
  get(ref: TexRef): WebGLTexture {
    const hit = this.m.get(ref.uid);
    if (hit && hit.version === ref.version) return hit.tex;
    const gl = this.g.gl;
    const data = ref.load();
    const tex = hit?.tex ?? this.g.texture();
    // Upload on a scratch unit: a draw binds its textures to units 0..2 and then asks for the next one, and uploading on the active
    // unit would unbind the one just bound (the first frame after a load drew black boxes where the text should be).
    const prevUnit = gl.getParameter(gl.ACTIVE_TEXTURE) as number;
    gl.activeTexture(gl.TEXTURE0 + SCRATCH_UNIT);
    this.upload(tex, data);
    const [w, h] = data.kind === 'rgba' ? [data.w, data.h] : [data.source.width, data.source.height];
    this.m.set(ref.uid, { tex, version: ref.version, w, h });
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.activeTexture(prevUnit);
    return tex;
  }
  private upload(tex: WebGLTexture, d: TexData): void {
    const gl = this.g.gl;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
    if (d.kind === 'rgba') {
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, d.w, d.h, 0, gl.RGBA, gl.UNSIGNED_BYTE, d.data);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
      const f = d.filter === 'nearest' ? gl.NEAREST : gl.LINEAR;
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, f);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, f);
    } else {
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);          // premultiplied: clean edges under filtering, no dark fringes
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, d.source);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      if (d.mip !== false) {
        gl.generateMipmap(gl.TEXTURE_2D);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
        const aniso = gl.getExtension('EXT_texture_filter_anisotropic');
        if (aniso) gl.texParameterf(gl.TEXTURE_2D, aniso.TEXTURE_MAX_ANISOTROPY_EXT, 4);
      } else gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    }
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }
  release(uid: string): void {
    const e = this.m.get(uid);
    if (e) { this.g.deleteTexture(e.tex); this.m.delete(uid); }
  }
  releaseWhere(pred: (uid: string) => boolean): void { for (const uid of [...this.m.keys()]) if (pred(uid)) this.release(uid); }
  has(uid: string): boolean { return this.m.has(uid); }
  /** Context lost/restored: every GL object is gone; textures are rebuilt lazily from their TexRefs. */
  forget(): void { this.m.clear(); }
}

/**
 * WebGL2 renderer. Draws a content layer (text, icons, frames: textured quads), then the optional backdrop with the content composited
 * and displaced as one picture (shockwaves, vortices, screen distortions), then layered effect geometry, then a bloom pass over the
 * emissive buffer, and composites to the canvas as premultiplied alpha. Everything it creates is tracked and released by dispose().
 */
export class Renderer {
  readonly g: GL;
  aspect: number;
  view: ViewInfo = { scale: 1, offX: 0, offY: 0, width: 1, height: 1, mode: 'fit' };
  matte: [number, number, number] = [0.018, 0.022, 0.034];
  /** Verification only: replace the picture with a flat colour (r, g, b, mix) so effect layers can be inspected on their own. */
  flatBackground: [number, number, number, number] = [0, 0, 0, 0];
  private cam = { dx: 0, dy: 0, rot: 0, zoom: 1 };
  private mode: FitMode = 'fit';
  private disposed = false;
  private scratch = new Scratch();
  readonly tex: TexCache;

  private backdropTex: WebGLTexture | null = null;
  private backdropSource: Source | null = null;
  private backdropBTex: WebGLTexture | null = null;
  private backdropBSource: Source | null = null;
  private keyedBackdropsB = new Map<string, WebGLTexture | null>();
  private dummyTex!: WebGLTexture;
  private quadBuf!: WebGLBuffer;
  private emptyVao!: WebGLVertexArrayObject;
  private pScene!: Prog; private pSprite!: Prog; private pSmoke!: Prog; private pPoly!: Prog; private pRibbon!: Prog; private pBolt!: Prog;
  private pShard!: Prog; private pVol!: Prog; private pBlur!: Prog; private pDown!: Prog; private pComposite!: Prog; private pElem!: Prog;
  private sSprite!: Stream; private sAlphaSprite!: Stream; private sSmoke!: Stream; private sPoly!: Stream; private sUnder!: Stream; private sRibbon!: Stream;
  private sBolt!: Stream; private sShard!: Stream; private sElem!: Stream; private sVol!: Stream;

  private sceneRT: { fbo: WebGLFramebuffer; scene: WebGLTexture; emit: WebGLTexture; w: number; h: number } | null = null;
  private contentRT: { fbo: WebGLFramebuffer; color: WebGLTexture; emit: WebGLTexture } | null = null;
  private bloomA: Target[] = [];
  private bloomB: Target[] = [];
  private onLost = (e: Event) => { e.preventDefault(); this.g.lost = true; };
  private onRestored = () => {
    this.backdropTex = null; this.keyedBackdrops.clear(); this.backdropBTex = null; this.keyedBackdropsB.clear(); this.tex.forget(); this.g.forget(); this.g.initExtensions(); this.build();
    if (this.backdropSource) this.setBackdrop(this.backdropSource);
    if (this.backdropBSource) this.setBackdropB(this.backdropBSource);
    this.g.lost = false; this.resize(this.view.width, this.view.height, 1, true);
  };
  /** Last frame drawn, redrawn after a context restore or resize. */
  lastFrame: Frame | null = null;
  lastOptions: RenderOptions = { grid: 0, gridDensity: 14, bloom: 1 };
  /** Number of completed render() calls, for tests. */
  renders = 0;
  /** Content-layer batches and instances drawn by the last render (tests and diagnostics). */
  lastStats = { batches: 0, instances: 0 };

  constructor(readonly canvas: HTMLCanvasElement, aspect: number, backdrop: Source | null = null) {
    this.g = new GL(canvas);
    this.tex = new TexCache(this.g);
    this.aspect = aspect;
    canvas.addEventListener('webglcontextlost', this.onLost);
    canvas.addEventListener('webglcontextrestored', this.onRestored);
    this.build();
    if (backdrop) this.setBackdrop(backdrop);
  }

  private build(): void {
    const g = this.g, gl = g.gl;
    this.dummyTex = g.texture();
    gl.bindTexture(gl.TEXTURE_2D, this.dummyTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 255]));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

    this.quadBuf = g.buffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    this.emptyVao = g.vertexArray();

    const mk = (vs: string, fs: string, name: string) => new Prog(g, g.program(vs, fs, name));
    this.pScene = mk(FULLSCREEN_VS, SCENE_FS, 'scene');
    this.pSprite = mk(SPRITE_VS, SPRITE_FS, 'sprite');
    this.pSmoke = mk(SMOKE_VS, SMOKE_FS, 'smoke');
    this.pPoly = mk(POLY_VS, POLY_FS, 'poly');
    this.pVol = mk(VOL_VS, VOL_FS, 'volume');
    this.pRibbon = mk(RIBBON_VS, RIBBON_FS, 'ribbon');
    this.pBolt = mk(BOLT_VS, BOLT_FS, 'bolt');
    this.pShard = mk(SHARD_VS, SHARD_FS, 'shard');
    this.pElem = mk(ELEM_VS, ELEM_FS, 'element');
    this.pBlur = mk(FULLSCREEN_VS, BLUR_FS, 'blur');
    this.pDown = mk(FULLSCREEN_VS, DOWN_FS, 'down');
    this.pComposite = mk(FULLSCREEN_VS, COMPOSITE_FS, 'composite');

    const inst = (extra: AttribSpec[] = []): AttribSpec[] => [
      { loc: 1, size: 4, offset: 0, divisor: 1 }, { loc: 2, size: 4, offset: 4, divisor: 1 }, { loc: 3, size: 4, offset: 8, divisor: 1 }, ...extra,
    ];
    this.sSprite = new Stream(g, 12, inst(), this.quadBuf);
    this.sAlphaSprite = new Stream(g, 12, inst(), this.quadBuf);
    this.sSmoke = new Stream(g, 12, inst(), this.quadBuf);
    this.sVol = new Stream(g, 16, inst([{ loc: 4, size: 4, offset: 12, divisor: 1 }]), this.quadBuf);
    this.sElem = new Stream(g, QUAD_FLOATS, [1, 2, 3, 4, 5, 6].map((loc, i) => ({ loc, size: 4, offset: i * 4, divisor: 1 })), this.quadBuf);
    const polyAttrs: AttribSpec[] = [{ loc: 0, size: 2, offset: 0 }, { loc: 1, size: 4, offset: 2 }];
    this.sPoly = new Stream(g, 6, polyAttrs);
    this.sUnder = new Stream(g, 6, polyAttrs);
    this.sRibbon = new Stream(g, 8, [{ loc: 0, size: 2, offset: 0 }, { loc: 1, size: 2, offset: 2 }, { loc: 2, size: 4, offset: 4 }]);
    this.sBolt = new Stream(g, 6, [{ loc: 0, size: 2, offset: 0 }, { loc: 1, size: 4, offset: 2 }]);
    this.sShard = new Stream(g, 8, [{ loc: 0, size: 2, offset: 0 }, { loc: 1, size: 2, offset: 2 }, { loc: 2, size: 4, offset: 4 }]);
    this.sceneRT = null; this.contentRT = null; this.bloomA = []; this.bloomB = [];
  }

  // ------------------------------------------------------------------------------------------------------------------
  // Backdrop

  /** Set (or with null, clear) the picture behind the content. Screen distortions displace it together with the content. */
  /** Switch to a cached backdrop by key (uploaded once, e.g. one picture per thumbnail category); `make` is only called the first time. */
  useBackdrop(key: string, make: () => Source | null): void {
    if (this.keyedBackdrops.has(key)) { this.backdropTex = this.keyedBackdrops.get(key) ?? null; this.backdropSource = null; return; }
    const src = make();
    this.setBackdrop(src, key);
  }
  private keyedBackdrops = new Map<string, WebGLTexture | null>();

  private uploadBackdrop(src: Source): WebGLTexture {
    const g = this.g, gl = g.gl;
    const t = g.texture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, src);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.MIRRORED_REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.MIRRORED_REPEAT);
    const aniso = gl.getExtension('EXT_texture_filter_anisotropic');
    if (aniso) gl.texParameterf(gl.TEXTURE_2D, aniso.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(8, gl.getParameter(aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT) as number));
    return t;
  }

  setBackdrop(src: Source | null, key?: string): void {
    const g = this.g;
    if (this.backdropTex && ![...this.keyedBackdrops.values()].includes(this.backdropTex)) { g.deleteTexture(this.backdropTex); }
    this.backdropTex = null;
    this.backdropSource = src;
    if (!src) { if (key) this.keyedBackdrops.set(key, null); if (this.lastFrame) this.render(this.lastFrame, this.lastOptions); return; }
    const t = this.uploadBackdrop(src);
    this.backdropTex = t;
    if (key) this.keyedBackdrops.set(key, t);
    if (this.lastFrame) this.render(this.lastFrame, this.lastOptions);
  }

  /** The second screen of a screen transition (the picture the transition leads to). */
  useBackdropB(key: string, make: () => Source | null): void {
    if (this.keyedBackdropsB.has(key)) { this.backdropBTex = this.keyedBackdropsB.get(key) ?? null; this.backdropBSource = null; return; }
    this.setBackdropB(make(), key);
  }
  setBackdropB(src: Source | null, key?: string): void {
    const g = this.g;
    if (this.backdropBTex && ![...this.keyedBackdropsB.values()].includes(this.backdropBTex)) { g.deleteTexture(this.backdropBTex); }
    this.backdropBTex = null;
    this.backdropBSource = src;
    if (!src) { if (key) this.keyedBackdropsB.set(key, null); if (this.lastFrame) this.render(this.lastFrame, this.lastOptions); return; }
    const t = this.uploadBackdrop(src);
    this.backdropBTex = t;
    if (key) this.keyedBackdropsB.set(key, t);
    if (this.lastFrame) this.render(this.lastFrame, this.lastOptions);
  }
  get hasBackdropB(): boolean { return !!this.backdropBTex; }
  get hasBackdrop(): boolean { return !!this.backdropTex; }

  setAspect(aspect: number): void {
    if (Math.abs(aspect - this.aspect) < 1e-6) return;
    this.aspect = aspect; this.updateView();
  }

  // ------------------------------------------------------------------------------------------------------------------
  // View

  setFit(mode: FitMode): void { this.mode = mode; this.updateView(); }
  getFit(): FitMode { return this.mode; }

  private updateView(): void {
    const W = this.view.width, H = this.view.height;
    const sx = W / this.aspect, sy = H;
    const scale = this.mode === 'fit' ? Math.min(sx, sy) : Math.max(sx, sy);
    this.view = { scale, offX: (W - this.aspect * scale) / 2, offY: (H - scale) / 2, width: W, height: H, mode: this.mode };
  }

  /** Share of the screen resolution to draw at (the quality tier); takes effect at the next resize. */
  qualityScale = 1;

  /** Resize the drawing buffer to cssW × cssH × dpr (capped) and recompute the view and render targets. */
  resize(cssW: number, cssH: number, dpr = 1, force = false): void {
    const maxDim = 3072;
    let w = Math.max(2, Math.round(cssW * dpr * this.qualityScale)), h = Math.max(2, Math.round(cssH * dpr * this.qualityScale));
    const k = Math.min(1, maxDim / Math.max(w, h));
    w = Math.max(2, Math.round(w * k)); h = Math.max(2, Math.round(h * k));
    if (!force && w === this.canvas.width && h === this.canvas.height && this.sceneRT) { return; }
    this.canvas.width = w; this.canvas.height = h;
    this.view = { ...this.view, width: w, height: h };
    this.updateView();
    this.allocTargets(w, h);
    if (this.lastFrame) this.render(this.lastFrame, this.lastOptions);
  }

  /** Canvas client coordinates → scene space (x ∈ [0, aspect], y ∈ [0, 1]); independent of fit/fill and canvas size. */
  clientToScene(clientX: number, clientY: number): [number, number] {
    const r = this.canvas.getBoundingClientRect();
    const px = (clientX - r.left) * (this.canvas.width / r.width);
    const py = (clientY - r.top) * (this.canvas.height / r.height);
    const v = this.view;
    const x = (px - v.offX) / v.scale, y = (py - v.offY) / v.scale;
    return [Math.min(this.aspect, Math.max(0, x)), Math.min(1, Math.max(0, y))];
  }

  sceneToCanvasPx(x: number, y: number): [number, number] {
    const v = this.view;
    return [x * v.scale + v.offX, y * v.scale + v.offY];
  }

  /** Drawing-buffer pixels per scene unit (stage height). */
  get pxPerUnit(): number { return this.view.scale; }

  // ------------------------------------------------------------------------------------------------------------------
  // Render targets

  private makeTex(w: number, h: number, half: boolean): WebGLTexture {
    const gl = this.g.gl;
    const t = this.g.texture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    if (half && this.g.halfRT) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
    else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }

  private target(w: number, h: number): Target {
    const gl = this.g.gl;
    const tex = this.makeTex(w, h, true);
    const fbo = this.g.framebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    return { fbo, tex, w, h };
  }

  private freeTargets(): void {
    const g = this.g;
    if (this.sceneRT) { g.deleteFramebuffer(this.sceneRT.fbo); g.deleteTexture(this.sceneRT.scene); g.deleteTexture(this.sceneRT.emit); this.sceneRT = null; }
    if (this.contentRT) { g.deleteFramebuffer(this.contentRT.fbo); g.deleteTexture(this.contentRT.color); g.deleteTexture(this.contentRT.emit); this.contentRT = null; }
    for (const t of [...this.bloomA, ...this.bloomB]) { g.deleteFramebuffer(t.fbo); g.deleteTexture(t.tex); }
    this.bloomA = []; this.bloomB = [];
  }

  private allocTargets(w: number, h: number): void {
    const gl = this.g.gl, g = this.g;
    this.freeTargets();
    const scene = this.makeTex(w, h, false);
    const emit = this.makeTex(w, h, true);
    const fbo = g.framebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, scene, 0);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, emit, 0);
    const st = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    if (st !== gl.FRAMEBUFFER_COMPLETE) throw new Error(`Scene framebuffer incomplete (0x${st.toString(16)})`);
    this.sceneRT = { fbo, scene, emit, w, h };
    const cc = this.makeTex(w, h, false), ce = this.makeTex(w, h, true);
    const cf = g.framebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, cf);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, cc, 0);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, ce, 0);
    const st2 = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    if (st2 !== gl.FRAMEBUFFER_COMPLETE) throw new Error(`Content framebuffer incomplete (0x${st2.toString(16)})`);
    this.contentRT = { fbo: cf, color: cc, emit: ce };
    for (let i = 1; i <= 3; i++) {
      const bw = Math.max(2, Math.round(w / 2 ** i)), bh = Math.max(2, Math.round(h / 2 ** i));
      this.bloomA.push(this.target(bw, bh));
      this.bloomB.push(this.target(bw, bh));
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  // ------------------------------------------------------------------------------------------------------------------
  // Drawing

  private bindTex(unit: number, tex: WebGLTexture): void {
    const gl = this.g.gl;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, tex);
  }

  private viewUniforms(p: Prog, cam = this.cam): void {
    const v = this.view;
    p.f2('uRes', v.width, v.height);
    p.f3('uView', v.scale, v.offX, v.offY);
    p.f4('uCam', cam.dx, cam.dy, cam.rot, cam.zoom);
    p.f2('uCamC', this.aspect / 2, 0.5);
  }

  /** Draw the content layer: every batch of textured quads, in order, into the content targets. */
  private drawContent(frame: Frame): boolean {
    const batches = frame.draws.filter((b) => b.instances.length >= QUAD_FLOATS);
    this.lastStats = { batches: batches.length, instances: batches.reduce((s, b) => s + b.instances.length / QUAD_FLOATS, 0) };
    if (!batches.length) return false;
    const gl = this.g.gl, rt = this.contentRT!;
    const v = this.view;
    gl.bindFramebuffer(gl.FRAMEBUFFER, rt.fbo);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
    gl.viewport(0, 0, v.width, v.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);        // premultiplied; a source of alpha 0 with colour adds light
    // one upload for all batches, then each draw just points the attributes further along
    const all: number[] = [];
    const starts: number[] = [];
    for (const b of batches) { starts.push(all.length / QUAD_FLOATS); for (let i = 0; i < b.instances.length; i++) all.push(b.instances[i]!); }
    this.sElem.upload(all, this.scratch);
    const p = this.pElem;
    p.use();
    this.viewUniforms(p, { dx: 0, dy: 0, rot: 0, zoom: 1 });
    p.i1('uTex', 0); p.i1('uLUT', 1);
    batches.forEach((b, i) => this.drawBatch(b, starts[i]!));
    gl.disable(gl.BLEND);
    gl.bindVertexArray(null);
    return true;
  }

  private drawBatch(b: DrawBatch, first: number): void {
    const gl = this.g.gl, p = this.pElem;
    this.bindTex(0, this.tex.get(b.tex));
    if (b.fill) {
      this.bindTex(1, this.tex.get(b.fill.lut));
      p.f4('uG0', ...b.fill.g0); p.f4('uG1', ...b.fill.g1); p.f4('uG2', ...b.fill.g2); p.f4('uG3', ...b.fill.g3);
    } else {
      this.bindTex(1, this.dummyTex);
      p.f4('uG0', 0, 0, 0.5, 0.5); p.f4('uG1', 1, 1, 1, 0); p.f4('uG2', 0, 0, 1, 0); p.f4('uG3', 0, 0, 0, 0);
    }
    p.f4('uMode', b.fill ? b.fillMode : 0, b.premultiplied ? 1 : 0, b.emit, b.emitGain ?? 1);
    p.f1('uGlowLayer', b.glowLayer ? 1 : 0);
    const fx = b.fx;
    p.f4('uFx', fx?.mode ?? 0, fx?.progress ?? 0, fx?.seed ?? 0, fx?.p ?? 0);
    const c = fx?.color ?? [1, 0.6, 0.2];
    p.f3('uFxCol', c[0], c[1], c[2]);
    this.sElem.seek(first);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, b.instances.length / QUAD_FLOATS);
  }

  render(frame: Frame, opts: RenderOptions): void {
    if (this.disposed || this.g.lost) return;
    const g = this.g, gl = g.gl;
    if (!this.sceneRT) this.resize(this.canvas.clientWidth || this.canvas.width, this.canvas.clientHeight || this.canvas.height, 1, true);
    const rt = this.sceneRT!;
    this.lastFrame = frame; this.lastOptions = opts;
    const v = this.view;
    this.cam = frame.camera;
    gl.disable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE); gl.disable(gl.BLEND);

    // 0 — content layer: text, icons and frames -------------------------------------------------------------------------
    const hasContent = this.drawContent(frame);

    // 1 — scene: backdrop + content with true displacement ---------------------------------------------------------
    gl.bindFramebuffer(gl.FRAMEBUFFER, rt.fbo);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
    gl.viewport(0, 0, v.width, v.height);
    this.pScene.use();
    this.viewUniforms(this.pScene);
    this.bindTex(0, this.backdropTex ?? this.dummyTex);
    this.pScene.i1('uImage', 0);
    this.bindTex(1, hasContent ? this.contentRT!.color : this.dummyTex);
    this.pScene.i1('uContent', 1);
    this.bindTex(2, hasContent ? this.contentRT!.emit : this.dummyTex);
    this.pScene.i1('uContentE', 2);
    this.bindTex(3, this.backdropBTex ?? this.dummyTex);
    this.pScene.i1('uImageB', 3);
    this.pScene.f1('uHasB', this.backdropBTex ? 1 : 0);
    const tr = frame.transition;
    this.pScene.f4('uTr', tr?.kind ?? 0, tr?.progress ?? 0, tr?.seed ?? 0, tr?.mode ?? 0);
    this.pScene.f4('uTrP', ...(tr?.p ?? [0, 0, 0, 0]));
    this.pScene.f4('uTrD', ...(tr?.d ?? [1, 0, 0, 0]));
    this.pScene.f4('uTrQ', ...(tr?.q ?? [4, 8, 0, 0]));
    this.pScene.f3('uTrC1', ...(tr?.c1 ?? [1, 1, 1]));
    this.pScene.f3('uTrC2', ...(tr?.c2 ?? [1, 1, 1]));
    this.pScene.f1('uAspect', this.aspect);
    this.pScene.f3('uMatte', this.matte[0], this.matte[1], this.matte[2]);
    this.pScene.f2('uGrid', opts.grid, opts.gridDensity);
    this.pScene.f4('uGlobal', frame.exposure, 0.07, this.backdropTex ? 1 : 0, hasContent ? 1 : 0);
    this.pScene.f4('uFlat', ...this.flatBackground);
    const ns = Math.min(MAX_SHOCKS, frame.shocks.length);
    const sa = new Float32Array(MAX_SHOCKS * 4), sb = new Float32Array(MAX_SHOCKS * 4), sc = new Float32Array(MAX_SHOCKS * 4), scol = new Float32Array(MAX_SHOCKS * 3);
    for (let i = 0; i < ns; i++) {
      const s = frame.shocks[i]!;
      sa.set([s.cx, s.cy, s.radius, s.width], i * 4);
      sb.set([s.amp, s.pinchR, s.pinchK, s.light], i * 4);
      sc.set([s.split, s.life, s.strainLight, 0], i * 4);
      scol.set(s.color, i * 3);
    }
    this.pScene.i1('uNS', ns);
    this.pScene.v4('uSA', sa); this.pScene.v4('uSB', sb); this.pScene.v4('uSC', sc); this.pScene.v3('uSCol', scol);
    const nv = Math.min(MAX_VORTICES, frame.vortices.length);
    const va = new Float32Array(MAX_VORTICES * 4), vb = new Float32Array(MAX_VORTICES * 4), vcol = new Float32Array(MAX_VORTICES * 3);
    for (let i = 0; i < nv; i++) {
      const t = frame.vortices[i]!;
      va.set([t.cx, t.cy, t.radius, t.pull], i * 4);
      vb.set([t.twist, t.glow, t.absorb, 0], i * 4);
      vcol.set(t.color, i * 3);
    }
    this.pScene.i1('uNV', nv);
    this.pScene.v4('uVA', va); this.pScene.v4('uVB', vb); this.pScene.v3('uVCol', vcol);
    const nd = Math.min(MAX_DISTORT, frame.distort.length);
    const da = new Float32Array(MAX_DISTORT * 4), db = new Float32Array(MAX_DISTORT * 4);
    for (let i = 0; i < nd; i++) { const d = frame.distort[i]!; da.set([d.kind, d.a[0], d.a[1], d.a[2]], i * 4); db.set(d.b, i * 4); }
    this.pScene.i1('uND', nd);
    this.pScene.v4('uDA', da); this.pScene.v4('uDB', db);
    gl.bindVertexArray(this.emptyVao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // 2 — alpha-blended layers into the scene colour buffer --------------------------------------------------------
    gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.NONE]);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    const under = this.sUnder.upload(frame.underPolys, this.scratch);
    if (under) { this.pPoly.use(); this.viewUniforms(this.pPoly); gl.bindVertexArray(this.sUnder.vao); gl.drawArrays(gl.TRIANGLES, 0, under); }
    const shardSets = [...(frame.shards.length ? [{ tex: frame.shardTex, verts: frame.shards }] : []), ...frame.shardSets];
    for (const set of shardSets) {
      if (!set.tex) continue;
      const n = this.sShard.upload(set.verts, this.scratch);
      if (!n) continue;
      this.pShard.use();
      this.viewUniforms(this.pShard);
      const screenTex = set.tex.uid === SCREEN_A.uid ? this.backdropTex : set.tex.uid === SCREEN_B.uid ? this.backdropBTex : undefined;
      if (screenTex === null) continue;                                   // a piece of a screen that has no picture
      this.bindTex(0, screenTex ?? this.tex.get(set.tex));
      const tt = set.tint ?? [1, 1, 1, 0];
      this.pShard.f4('uTint', tt[0], tt[1], tt[2], tt[3]);
      this.pShard.f1('uGlass', set.glass ?? 0);
      this.pShard.i1('uObj', 0);
      this.pShard.f3('uAccent', ...(frame.boltGlow as [number, number, number]));
      gl.bindVertexArray(this.sShard.vao); gl.drawArrays(gl.TRIANGLES, 0, n);
    }
    const ribbons = this.sRibbon.upload(frame.ribbons, this.scratch);
    if (ribbons) { this.pRibbon.use(); this.viewUniforms(this.pRibbon); gl.bindVertexArray(this.sRibbon.vao); gl.drawArrays(gl.TRIANGLES, 0, ribbons); }
    const smoke = this.sSmoke.upload(this.packSmoke(frame), this.scratch);
    if (smoke) {
      this.pSmoke.use(); this.viewUniforms(this.pSmoke);
      const pal = new Float32Array(12);
      frame.smokePalette.forEach((c, i) => pal.set(c, i * 3));
      this.pSmoke.v3('uPal', pal);
      gl.bindVertexArray(this.sSmoke.vao);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, smoke);
    }
    const volData = this.packVol(frame);
    const vol = this.sVol.upload(volData, this.scratch);
    if (vol) this.drawVol(frame, vol, 0);
    const polys = this.sPoly.upload(frame.polys, this.scratch);
    if (polys) { this.pPoly.use(); this.viewUniforms(this.pPoly); gl.bindVertexArray(this.sPoly.vao); gl.drawArrays(gl.TRIANGLES, 0, polys); }
    const dust = this.sAlphaSprite.upload(this.packSprites(frame.alphaSprites), this.scratch);
    if (dust) {
      this.pSprite.use(); this.viewUniforms(this.pSprite); this.pSprite.f1('uAlphaPass', 1);
      gl.bindVertexArray(this.sAlphaSprite.vao);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, dust);
    }

    // 3 — additive light into the emissive buffer ------------------------------------------------------------------
    gl.drawBuffers([gl.NONE, gl.COLOR_ATTACHMENT1]);
    gl.blendFunc(gl.ONE, gl.ONE);
    const boltBatches = [{ core: frame.boltCore, glow: frame.boltGlow, verts: frame.bolts }, ...frame.boltSets];
    for (const set of boltBatches) {
      const bolts = this.sBolt.upload(set.verts, this.scratch);
      if (!bolts) continue;
      this.pBolt.use(); this.viewUniforms(this.pBolt);
      this.pBolt.f3('uCore', ...set.core); this.pBolt.f3('uGlow', ...set.glow);
      gl.bindVertexArray(this.sBolt.vao); gl.drawArrays(gl.TRIANGLES, 0, bolts);
    }
    const glow = this.sSprite.upload(this.packSprites(frame.additive), this.scratch);
    if (glow) {
      this.pSprite.use(); this.viewUniforms(this.pSprite); this.pSprite.f1('uAlphaPass', 0);
      gl.bindVertexArray(this.sSprite.vao);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, glow);
    }
    if (vol) { gl.drawBuffers([gl.NONE, gl.COLOR_ATTACHMENT1]); gl.blendFunc(gl.ONE, gl.ONE); this.drawVol(frame, vol, 1); }
    gl.disable(gl.BLEND);

    // 4 — bloom over the emissive buffer ---------------------------------------------------------------------------
    gl.bindVertexArray(this.emptyVao);
    let src = rt.emit, sw = rt.w, sh = rt.h;
    for (let i = 0; i < 3; i++) {
      const A = this.bloomA[i]!, B = this.bloomB[i]!;
      gl.bindFramebuffer(gl.FRAMEBUFFER, A.fbo); gl.viewport(0, 0, A.w, A.h);
      gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
      this.pDown.use(); this.bindTex(0, src); this.pDown.i1('uTex', 0); this.pDown.f2('uTexel', 1 / sw, 1 / sh);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.bindFramebuffer(gl.FRAMEBUFFER, B.fbo);
      this.pBlur.use(); this.bindTex(0, A.tex); this.pBlur.i1('uTex', 0); this.pBlur.f2('uDir', 1 / A.w, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.bindFramebuffer(gl.FRAMEBUFFER, A.fbo);
      this.bindTex(0, B.tex); this.pBlur.f2('uDir', 0, 1 / A.h);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      src = A.tex; sw = A.w; sh = A.h;
    }

    // 5 — composite to the canvas ----------------------------------------------------------------------------------
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.drawBuffers([gl.BACK]);
    gl.viewport(0, 0, v.width, v.height);
    this.pComposite.use();
    this.bindTex(0, rt.scene); this.pComposite.i1('uScene', 0);
    this.bindTex(1, rt.emit); this.pComposite.i1('uEmit', 1);
    this.bindTex(2, this.bloomA[0]!.tex); this.pComposite.i1('uB0', 2);
    this.bindTex(3, this.bloomA[1]!.tex); this.pComposite.i1('uB1', 3);
    this.bindTex(4, this.bloomA[2]!.tex); this.pComposite.i1('uB2', 4);
    this.pComposite.f1('uBloom', opts.bloom);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
    this.renders++;
  }

  private drawVol(frame: Frame, count: number, pass: 0 | 1): void {
    const gl = this.g.gl, p = this.pVol;
    p.use(); this.viewUniforms(p);
    p.f1('uPass', pass);
    const fire = new Float32Array(12);
    frame.volPalette.fire.forEach((c, i) => fire.set(c, i * 3));
    p.v3('uFire', fire);
    p.f3('uShadow', ...frame.volPalette.shadow); p.f3('uLit', ...frame.volPalette.lit); p.f3('uWarm', ...frame.volPalette.warm);
    gl.bindVertexArray(this.sVol.vao);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, count);
  }

  /** Smoke first, then flames, then fireballs; inside each kind back to front. */
  private packVol(frame: Frame): number[] {
    const out: number[] = [];
    const list = [...frame.vol].sort((a, b) => a.kind - b.kind || a.y + a.size * 0.3 - (b.y + b.size * 0.3));
    for (const q of list) out.push(q.x, q.y, q.size, q.rot, q.age, q.seed, q.kind, q.alpha, q.heat, q.stretch, q.lx, q.ly, q.t, q.soft ?? 0, 0, 0);
    return out;
  }

  private packSprites(list: Sprite[]): number[] {
    const out: number[] = [];
    for (const s of list) out.push(s.x, s.y, s.hw, s.hh, s.rot, s.type, s.e1 ?? 0, s.e2 ?? 0, s.color[0], s.color[1], s.color[2], s.intensity);
    return out;
  }

  private packSmoke(frame: Frame): number[] {
    const out: number[] = [];
    for (const p of frame.smoke) out.push(p.x, p.y, p.size, p.rot, p.age, p.seed, p.alpha, p.erode, p.tone, p.warmth, p.lx, p.ly);
    return out;
  }

  // ------------------------------------------------------------------------------------------------------------------
  // Inspection + lifecycle

  /** RGBA bytes of the current canvas (top row first), premultiplied. */
  readPixels(): Uint8Array {
    const gl = this.g.gl;
    const { width: w, height: h } = this.view;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    const raw = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, raw);
    const out = new Uint8Array(w * h * 4);
    for (let y = 0; y < h; y++) out.set(raw.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4);
    return out;
  }

  counts(): GLCounts { return this.g.counts(); }

  loseContextForTest(): void { this.g.loseExt?.loseContext(); }
  restoreContextForTest(): void { this.g.loseExt?.restoreContext(); }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.canvas.removeEventListener('webglcontextlost', this.onLost);
    this.canvas.removeEventListener('webglcontextrestored', this.onRestored);
    this.g.disposeAll();
    this.tex.forget();
    this.backdropTex = null; this.backdropSource = null; this.backdropBTex = null; this.backdropBSource = null;
    this.sceneRT = null; this.contentRT = null; this.bloomA = []; this.bloomB = [];
  }
}
