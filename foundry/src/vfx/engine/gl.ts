/**
 * Thin WebGL2 layer that tracks every GL object it creates, so a renderer can prove it releases everything on dispose.
 */
export interface GLCounts { textures: number; buffers: number; programs: number; shaders: number; framebuffers: number; vaos: number; renderbuffers: number }

export class GL {
  readonly gl: WebGL2RenderingContext;
  private tex = new Set<WebGLTexture>();
  private buf = new Set<WebGLBuffer>();
  private prog = new Set<WebGLProgram>();
  private shd = new Set<WebGLShader>();
  private fbo = new Set<WebGLFramebuffer>();
  private vao = new Set<WebGLVertexArrayObject>();
  private rbo = new Set<WebGLRenderbuffer>();
  lost = false;
  floatRT = false;
  halfRT = false;
  /** Held from creation: a lost context no longer hands out extensions. */
  loseExt: WEBGL_lose_context | null = null;

  constructor(readonly canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl2', { alpha: true, antialias: false, depth: false, stencil: false, premultipliedAlpha: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
    if (!gl) throw new Error('WebGL2 is not available in this browser');
    this.gl = gl;
    this.initExtensions();
  }

  /** Extensions must be enabled again after a context restore. */
  initExtensions(): void {
    const gl = this.gl;
    this.floatRT = !!gl.getExtension('EXT_color_buffer_float');
    this.halfRT = !!gl.getExtension('EXT_color_buffer_half_float') || this.floatRT;
    gl.getExtension('OES_texture_float_linear');
    gl.getExtension('EXT_texture_filter_anisotropic');
    this.loseExt = gl.getExtension('WEBGL_lose_context');
  }

  texture(): WebGLTexture { const t = this.gl.createTexture()!; this.tex.add(t); return t; }
  buffer(): WebGLBuffer { const b = this.gl.createBuffer()!; this.buf.add(b); return b; }
  framebuffer(): WebGLFramebuffer { const f = this.gl.createFramebuffer()!; this.fbo.add(f); return f; }
  vertexArray(): WebGLVertexArrayObject { const v = this.gl.createVertexArray()!; this.vao.add(v); return v; }

  deleteTexture(t: WebGLTexture): void { this.gl.deleteTexture(t); this.tex.delete(t); }
  deleteFramebuffer(f: WebGLFramebuffer): void { this.gl.deleteFramebuffer(f); this.fbo.delete(f); }

  program(vs: string, fs: string, name = 'program'): WebGLProgram {
    const gl = this.gl;
    const compile = (type: number, src: string): WebGLShader => {
      const s = gl.createShader(type)!;
      this.shd.add(s);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        const log = gl.getShaderInfoLog(s) ?? '';
        const numbered = src.split('\n').map((l, i) => `${String(i + 1).padStart(3)} ${l}`).join('\n');
        throw new Error(`Shader compile error in ${name} (${type === gl.VERTEX_SHADER ? 'vertex' : 'fragment'}):\n${log}\n${numbered}`);
      }
      return s;
    };
    const v = compile(gl.VERTEX_SHADER, vs), f = compile(gl.FRAGMENT_SHADER, fs);
    const p = gl.createProgram()!;
    this.prog.add(p);
    gl.attachShader(p, v); gl.attachShader(p, f);
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(`Program link error in ${name}: ${gl.getProgramInfoLog(p)}`);
    gl.detachShader(p, v); gl.detachShader(p, f);
    gl.deleteShader(v); gl.deleteShader(f); this.shd.delete(v); this.shd.delete(f);
    return p;
  }

  counts(): GLCounts {
    return { textures: this.tex.size, buffers: this.buf.size, programs: this.prog.size, shaders: this.shd.size, framebuffers: this.fbo.size, vaos: this.vao.size, renderbuffers: this.rbo.size };
  }

  totalLive(): number { return Object.values(this.counts()).reduce((a, b) => a + b, 0); }

  /** Drop tracking without deleting (after a context loss the old objects are already invalid). */
  forget(): void {
    this.tex.clear(); this.buf.clear(); this.prog.clear(); this.shd.clear(); this.fbo.clear(); this.vao.clear(); this.rbo.clear();
  }

  /** Delete every tracked object. The context stays usable only for creating new objects. */
  disposeAll(): void {
    const gl = this.gl;
    for (const t of this.tex) gl.deleteTexture(t);
    for (const b of this.buf) gl.deleteBuffer(b);
    for (const p of this.prog) gl.deleteProgram(p);
    for (const s of this.shd) gl.deleteShader(s);
    for (const f of this.fbo) gl.deleteFramebuffer(f);
    for (const v of this.vao) gl.deleteVertexArray(v);
    for (const r of this.rbo) gl.deleteRenderbuffer(r);
    this.tex.clear(); this.buf.clear(); this.prog.clear(); this.shd.clear(); this.fbo.clear(); this.vao.clear(); this.rbo.clear();
  }
}

export class Prog {
  private locs = new Map<string, WebGLUniformLocation | null>();
  constructor(readonly g: GL, readonly p: WebGLProgram) {}
  use(): void { this.g.gl.useProgram(this.p); }
  loc(name: string): WebGLUniformLocation | null {
    let l = this.locs.get(name);
    if (l === undefined) { l = this.g.gl.getUniformLocation(this.p, name); this.locs.set(name, l); }
    return l;
  }
  f1(n: string, v: number) { this.g.gl.uniform1f(this.loc(n), v); }
  f2(n: string, a: number, b: number) { this.g.gl.uniform2f(this.loc(n), a, b); }
  f3(n: string, a: number, b: number, c: number) { this.g.gl.uniform3f(this.loc(n), a, b, c); }
  f4(n: string, a: number, b: number, c: number, d: number) { this.g.gl.uniform4f(this.loc(n), a, b, c, d); }
  i1(n: string, v: number) { this.g.gl.uniform1i(this.loc(n), v); }
  v4(n: string, v: Float32Array) { this.g.gl.uniform4fv(this.loc(n), v); }
  v3(n: string, v: Float32Array) { this.g.gl.uniform3fv(this.loc(n), v); }
}
