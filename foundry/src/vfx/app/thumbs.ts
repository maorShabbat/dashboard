/**
 * Animated thumbnails. One shared renderer draws every visible card, one at a time, through the very same scene player the
 * workspace uses, so a thumbnail is the real effect running, never a picture. Cards register while on screen and are released
 * when they scroll away.
 */
import { Renderer } from '../engine/renderer';
import type { FontService } from '../fonts/service';
import type { Preset } from '../model/preset';
import { categoryDef } from '../model/preset';
import { ScenePlayer } from '../player/player';
import type { ImageLibrary } from '../player/assets';
import { drawBonus, drawDaylight, drawLava, drawNight, drawReels } from './backdrops';

interface Entry {
  preset: Preset;
  canvas: HTMLCanvasElement;
  player: ScenePlayer | null;
  loading: boolean;
  time: number;
  hold: number;
  /** When this card last had its turn. */
  at: number;
  failed: string | null;
  stillOnly: boolean;
}

const W = 384, H = 216;

export class ThumbHub {
  private renderer: Renderer;
  private entries = new Map<HTMLCanvasElement, Entry>();
  private raf = 0;
  private last = 0;
  private cursor = 0;
  private reduced = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  private barnBmp: ImageBitmap | null = null;
  private sources = new Map<string, () => HTMLCanvasElement | ImageBitmap | null>();
  /** Number of frames drawn (tests). */
  frames = 0;

  constructor(private deps: { fonts: FontService; images: ImageLibrary }, barn: () => Promise<ImageBitmap | null>) {
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    this.renderer = new Renderer(cv, 16 / 9);
    this.renderer.resize(W, H, 1, true);
    void barn().then((b) => { this.barnBmp = b; });
    this.sources.set('reels', () => scaled(drawReels()));
    this.sources.set('night', () => scaled(drawNight()));
    this.sources.set('daylight', () => scaled(drawDaylight()));
    this.sources.set('bonus', () => scaled(drawBonus()));
    this.sources.set('lava', () => scaled(drawLava()));
    this.sources.set('none', () => null);
    this.sources.set('barn', () => this.barnBmp);
  }

  /** Called when a card appears. Returns the function that releases it. */
  register(preset: Preset, canvas: HTMLCanvasElement): () => void {
    const e: Entry = { preset, canvas, player: null, loading: false, time: 0, hold: 0, at: performance.now(), failed: null, stillOnly: this.reduced };
    this.entries.set(canvas, e);
    void this.load(e);
    if (!this.raf) { this.last = performance.now(); this.raf = requestAnimationFrame(this.tick); }
    return () => {
      this.entries.delete(canvas);
      e.player?.dispose();
      if (!this.entries.size) { cancelAnimationFrame(this.raf); this.raf = 0; }
    };
  }

  private async load(e: Entry): Promise<void> {
    if (e.loading) return;
    e.loading = true;
    const player = new ScenePlayer({ renderer: this.renderer, fonts: this.deps.fonts, images: this.deps.images });
    try {
      const sc = JSON.parse(JSON.stringify(e.preset.scene));
      const r = await player.load(sc);
      if (!this.entries.has(e.canvas)) { player.dispose(); return; }
      if (r.errors.length) e.failed = r.errors[0]!.message;
      e.player = player;
      if (e.stillOnly) e.time = Math.min(player.duration * 0.62, player.duration);
    } catch (err) { e.failed = (err as Error).message; }
  }

  /** Drawing time allowed per animation frame, so the page stays responsive however slow the machine is (at least one card is drawn). */
  private static BUDGET_MS = 8;

  private tick = (now: number): void => {
    this.raf = requestAnimationFrame(this.tick);
    const list = [...this.entries.values()];
    if (!list.length) return;
    const t0 = performance.now();
    let turns = 0;
    for (let n = 0; n < list.length; n++) {
      const e = list[(this.cursor + n) % list.length]!;
      if (!e.player) continue;
      turns++;
      // every card advances by the real time since its own last turn, so each one plays at normal speed (choppier when many are visible)
      const dt = Math.min(0.25, Math.max(0, (now - e.at) / 1000));
      e.at = now;
      const D = e.player.duration;
      if (!e.stillOnly) {
        e.time += dt;
        if (e.time >= D) { if (e.hold <= 0) e.hold = 0.6; e.hold -= dt; if (e.hold <= 0) { e.time = 0; e.hold = 0; } else e.time = D; }
      }
      this.draw(e);
      if (performance.now() - t0 > ThumbHub.BUDGET_MS) break;
    }
    this.cursor = (this.cursor + Math.max(1, turns)) % Math.max(1, list.length);
  };

  private draw(e: Entry): void {
    const p = e.player!;
    const screens = e.preset.scene.screens;
    const key = screens?.from ?? categoryDef(e.preset.category).backdrop, keyB = screens?.to;
    if ((key === 'barn' || keyB === 'barn') && !this.barnBmp) return;   // the picture is still loading
    this.renderer.useBackdrop(key, this.sources.get(key) ?? (() => null));
    if (keyB) this.renderer.useBackdropB(keyB, this.sources.get(keyB) ?? (() => null));
    try { p.render(Math.min(e.time, p.duration), { grid: 0, gridDensity: 14, bloom: 1 }); } catch { return; }
    const g = e.canvas.getContext('2d');
    if (!g) return;
    g.drawImage(this.renderer.canvas, 0, 0, e.canvas.width, e.canvas.height);
    this.frames++;
  }

  dispose(): void {
    cancelAnimationFrame(this.raf);
    for (const e of this.entries.values()) e.player?.dispose();
    this.entries.clear();
    this.renderer.dispose();
  }
}

function scaled(c: HTMLCanvasElement): HTMLCanvasElement {
  const o = document.createElement('canvas');
  o.width = 640; o.height = 360;
  o.getContext('2d')!.drawImage(c, 0, 0, 640, 360);
  return o;
}
