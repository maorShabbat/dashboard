/** Owns the Player for one canvas and lets React components observe time without re-rendering every frame. */
import type { CueAudio } from '../core/audio';
import type { CompiledSequence, TimelineEvent } from '../core/engine';
import type { AssetIndex } from '../core/effects/types';
import { Player } from '../core/player';
import type { PainterAssets, LayerOverride } from '../core/render';

export interface LoggedEvent { t: number; kind: TimelineEvent['kind']; name: string; clipId?: string }

export interface ControllerConfig {
  sequence: CompiledSequence;
  viewport: { w: number; h: number };
  assets: AssetIndex;
  painterAssets: PainterAssets;
  fontStacks: Record<string, { family: string; fallback: string }>;
  layerOverrides: Record<string, LayerOverride>;
  reducedMotion: boolean;
  loop: boolean;
  speed: number;
  audio: CueAudio | null;
  soundOn: boolean;
}

export class PlayerController {
  player: Player | null = null;
  canvas: HTMLCanvasElement | null = null;
  events: LoggedEvent[] = [];
  private subs = new Set<() => void>();
  private frameSubs = new Set<(t: number) => void>();
  private cfg: ControllerConfig | null = null;
  private lastViewportKey = '';
  private sound = { audio: null as CueAudio | null, on: false };

  subscribe = (fn: () => void) => { this.subs.add(fn); return () => { this.subs.delete(fn); }; };
  onFrame = (fn: (t: number) => void) => { this.frameSubs.add(fn); return () => { this.frameSubs.delete(fn); }; };
  private emit() { this.subs.forEach((s) => s()); }

  get time() { return this.player?.time ?? 0; }
  get playing() { return this.player?.playing ?? false; }
  get duration() { return this.player?.duration ?? 0; }

  attach(canvas: HTMLCanvasElement | null): void {
    this.canvas = canvas;
    if (!canvas) { this.player?.dispose(); this.player = null; return; }
    if (this.cfg) this.configure(this.cfg);
  }

  configure(cfg: ControllerConfig): void {
    const prevCfg = this.cfg;
    this.cfg = cfg;
    this.sound = { audio: cfg.audio, on: cfg.soundOn };
    if (!this.canvas) return;
    const dpr = Math.min(2, typeof devicePixelRatio === 'number' ? devicePixelRatio : 1);
    const vpKey = `${cfg.viewport.w}x${cfg.viewport.h}@${dpr}`;
    if (vpKey !== this.lastViewportKey) {
      this.canvas.width = Math.round(cfg.viewport.w * dpr);
      this.canvas.height = Math.round(cfg.viewport.h * dpr);
      this.lastViewportKey = vpKey;
    }
    const paint = { assets: cfg.painterAssets, fontStacks: cfg.fontStacks, layerOverrides: cfg.layerOverrides, dpr };
    if (!this.player) {
      this.player = new Player({
        canvas: this.canvas, sequence: cfg.sequence, viewport: cfg.viewport, assets: cfg.assets, paint, reducedMotion: cfg.reducedMotion, loop: cfg.loop, speed: cfg.speed, loopGap: 600,
        onCue: (e) => { this.log(e); if (this.sound.on) void this.sound.audio?.play(e); },
        onEvent: (e) => this.log(e),
        onFrame: (t) => { this.frameSubs.forEach((f) => f(t)); },
        onEnd: () => this.emit(),
      });
    } else {
      const p = this.player;
      p.loop = cfg.loop; p.speed = cfg.speed;
      p.setOptions({ paint, reducedMotion: cfg.reducedMotion, assets: cfg.assets });
      p.setViewport(cfg.viewport);
      if (!prevCfg || prevCfg.sequence !== cfg.sequence) p.setSequence(cfg.sequence, true);
      else p.render();
    }
    this.emit();
  }

  private log(e: TimelineEvent): void {
    this.events.push({ t: e.t, kind: e.kind, name: e.name, ...(e.clipId ? { clipId: e.clipId } : {}) });
    if (this.events.length > 200) this.events.shift();
    this.emit();
  }

  clearLog(): void { this.events = []; this.emit(); }
  play(): void { this.player?.play(); this.emit(); }
  pause(): void { this.player?.pause(); this.emit(); }
  toggle(): void { if (this.playing) this.pause(); else this.play(); }
  replay(): void { this.events = []; this.player?.replay(); this.emit(); }
  seek(t: number): void { this.player?.seek(t); this.emit(); }
  stop(): void { this.player?.pause(); this.player?.seek(0); this.emit(); }
  dispose(): void { this.player?.dispose(); this.player = null; }
}
