/**
 * PreviewController: owns one canvas, its renderer and the scene player, and plays the scene (play / pause / scrub / loop / speed).
 * The picture at any moment is ScenePlayer.render(t): scrubbing, slow motion and recording are exact.
 */
import { Renderer, type RenderOptions } from '../engine/renderer';
import type { FontService } from '../fonts/service';
import type { Scene } from '../model/scene';
import { ScenePlayer, type LoadReport } from '../player/player';
import type { ImageLibrary } from '../player/assets';
import type { Frame } from '../engine/frame';
import { SoundPlayer, decodeAudio, renderCues } from '../engine/audio';
import { AutoQuality, TIERS, startingTier, type QualitySetting, type QualityTier } from '../engine/quality';

export type Status = 'empty' | 'loading' | 'ready' | 'error';
type Listener = () => void;

export class PreviewController {
  readonly renderer: Renderer;
  readonly player: ScenePlayer;
  time = 0;
  playing = false;
  rate = 1;
  /** The quality setting, and the tier in use (the tier follows the frame times when the setting is automatic). */
  quality: QualitySetting = 'high';
  tier: QualityTier = 'high';
  private auto: AutoQuality | null = null;
  loop = true;
  status: Status = 'empty';
  report: LoadReport = { warnings: [], errors: [] };
  opts: RenderOptions = { grid: 0, gridDensity: 14, bloom: 1 };
  lastFrame: Frame | null = null;
  private raf = 0;
  private last = 0;
  private endHold = 0;
  private listeners = new Set<Listener>();
  private pending: Scene | null = null;
  private busy = false;
  private idleWaiters: (() => void)[] = [];
  /** Re-rasterisations after a resize that are still running. */
  private rescales = 0;
  private disposed = false;
  private sound = new SoundPlayer();
  private soundCache = new Map<string, Promise<AudioBuffer>>();
  private audioCache = new Map<string, Promise<AudioBuffer>>();
  private previewPlayer = new SoundPlayer();
  private images: ImageLibrary;
  private ro: ResizeObserver | null = null;
  private version = 0;
  /** How long the final pose rests before a looping preview restarts. */
  restSeconds = 0.7;

  constructor(readonly canvas: HTMLCanvasElement, deps: { fonts: FontService; images: ImageLibrary }, aspect = 16 / 9) {
    this.images = deps.images;
    this.renderer = new Renderer(canvas, aspect);
    this.player = new ScenePlayer({ renderer: this.renderer, fonts: deps.fonts, images: deps.images });
    this.renderer.resize(canvas.clientWidth || 640, canvas.clientHeight || 360, window.devicePixelRatio || 1, true);
    if (typeof ResizeObserver !== 'undefined') {
      this.ro = new ResizeObserver(() => this.fit());
      this.ro.observe(canvas.parentElement ?? canvas);
    }
  }

  subscribe = (l: Listener): (() => void) => { this.listeners.add(l); return () => { this.listeners.delete(l); }; };
  snapshot = (): number => this.version;
  private emit(): void { this.version++; for (const l of [...this.listeners]) l(); }

  get duration(): number { return this.player.duration; }

  /** Size the drawing buffer to the canvas's box. */
  /** Choose a quality setting: a fixed tier, or 'auto' to let it follow how long frames take. */
  setQuality(setting: QualitySetting): void {
    this.quality = setting;
    this.auto = setting === 'auto' ? new AutoQuality(startingTier()) : null;
    this.applyTier(this.auto ? this.auto.tier : (setting as QualityTier));
    this.emit();
  }
  private applyTier(t: QualityTier): void {
    this.tier = t;
    this.renderer.qualityScale = TIERS[t].scale;
    this.player.quality = TIERS[t].particles;
    this.fit();
  }

  fit(): void {
    const el = this.canvas.parentElement ?? this.canvas;
    const r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.renderer.resize(r.width, r.height, dpr, false);
    this.rescales++;
    void this.player.rescale().catch(() => undefined).then(() => { this.rescales--; this.draw(); this.flushIdle(); });
    this.draw();
  }

  /** Load or update the scene. Calls made while a load is running are coalesced: only the newest scene is applied. */
  async setScene(scene: Scene, opts: { reload?: boolean } = {}): Promise<LoadReport> {
    this.pending = scene;
    if (this.busy) return this.report;
    this.busy = true;
    try {
      while (this.pending) {
        const next = this.pending; this.pending = null;
        this.status = 'loading'; this.emit();
        const first = !this.player.scene || opts.reload;
        this.report = first ? await this.player.load(next) : await this.player.update(next);
        if (this.disposed) return this.report;
        this.status = this.report.errors.length ? 'error' : 'ready';
        if (this.time > this.player.duration) this.time = 0;
        this.draw();
        this.emit();
      }
    } finally { this.busy = false; this.flushIdle(); }
    return this.report;
  }

  private get idle(): boolean { return !this.busy && !this.pending && this.rescales === 0; }
  private flushIdle(): void { if (!this.idle) return; const w = this.idleWaiters; this.idleWaiters = []; for (const f of w) f(); }

  /** Resolves when no scene load is running or queued and no re-rasterisation after a resize is in flight: the picture is final. */
  whenIdle(): Promise<void> { return this.idle ? Promise.resolve() : new Promise((r) => this.idleWaiters.push(r)); }

  draw(): void {
    if (this.disposed || !this.player.scene) return;
    try { this.lastFrame = this.player.render(this.time, this.opts); } catch (e) {
      this.report = { ...this.report, errors: [...this.report.errors.filter((x) => x.element !== '#render'), { element: '#render', name: 'Preview', message: (e as Error).message }] };
      this.status = 'error';
    }
  }

  /** A sound file of your own, decoded once. */
  private audioBuffer(asset: string): Promise<AudioBuffer> {
    let p = this.audioCache.get(asset);
    if (!p) {
      p = (async () => { const rec = await this.images.storeRef().get(asset); if (!rec) throw new Error('The sound file is not in this browser any more.'); return decodeAudio(rec.blob); })();
      p.catch(() => { this.audioCache.delete(asset); });
      this.audioCache.set(asset, p);
    }
    return p;
  }

  /** Play one of your sound files once, now (the ▶ button next to it). */
  async previewSound(asset: string, gain = 1): Promise<void> {
    const buf = await this.audioBuffer(asset);
    const out = await renderCues([], 1, undefined, [{ t: 0, buffer: buf, gain }]);
    this.previewPlayer.play(out, 0, 1);
  }

  private async startSound(): Promise<void> {
    const cues = this.player.cues(), own = this.player.sounds();
    if (!cues.length && !own.length) return;
    try {
      const key = JSON.stringify([cues, own]);
      let p = this.soundCache.get(key);
      if (!p) {
        p = (async () => renderCues(cues, 1, undefined, await Promise.all(own.map(async (x) => ({ t: x.t, gain: x.gain, buffer: await this.audioBuffer(x.asset) })))))();
        this.soundCache.set(key, p);
        if (this.soundCache.size > 6) this.soundCache.delete(this.soundCache.keys().next().value!);
        p.catch(() => { this.soundCache.delete(key); });
      }
      const buf = await p;
      if (this.playing) this.sound.play(buf, this.time, this.rate);
    } catch { /* sound is optional */ }
  }

  seek(t: number): void { this.time = Math.max(0, Math.min(this.duration, t)); this.draw(); if (this.playing) void this.startSound(); this.emit(); }
  play(): void {
    if (this.playing) return;
    if (this.time >= this.duration - 1e-3) this.time = 0;
    this.playing = true; this.last = performance.now(); this.endHold = 0;
    this.raf = requestAnimationFrame(this.tick); void this.startSound(); this.emit();
  }
  pause(): void { this.playing = false; cancelAnimationFrame(this.raf); this.sound.stop(); this.emit(); }
  toggle(): void { if (this.playing) this.pause(); else this.play(); }
  restart(): void { this.time = 0; this.endHold = 0; this.draw(); if (!this.playing) this.play(); else { void this.startSound(); this.emit(); } }
  setRate(r: number): void { this.rate = r; this.emit(); }
  setLoop(on: boolean): void { this.loop = on; this.emit(); }
  setBackdrop(src: HTMLCanvasElement | ImageBitmap | null): void { this.renderer.setBackdrop(src); this.draw(); }
  /** The second screen of a transition. */
  setBackdropTo(src: HTMLCanvasElement | ImageBitmap | null): void { this.renderer.setBackdropB(src); this.draw(); }

  private tick = (now: number): void => {
    if (!this.playing || this.disposed) return;
    const raw = now - this.last, dt = Math.min(0.1, raw / 1000);
    this.last = now;
    if (this.auto) { const changed = this.auto.frame(raw); if (changed) { this.applyTier(changed); this.emit(); } }
    if (this.endHold > 0) {
      this.endHold -= dt;
      if (this.endHold <= 0) { if (this.loop) { this.time = 0; void this.startSound(); } else { this.playing = false; this.emit(); return; } }
    } else {
      this.time += dt * this.rate;
      if (this.time >= this.duration) {
        if (this.loop && this.player.scene?.seamless) { this.time %= this.duration; void this.startSound(); }   // an ambient loop: straight round again, no rest
        else { this.time = this.duration; this.endHold = this.restSeconds; }
      }
    }
    this.draw();
    this.emit();
    this.raf = requestAnimationFrame(this.tick);
  };

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.ro?.disconnect();
    this.sound.dispose(); this.previewPlayer.dispose();
    this.player.dispose();
    this.renderer.dispose();
    this.listeners.clear();
  }
}
