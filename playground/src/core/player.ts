/**
 * Player: time control for a compiled sequence. Scrub, play, pause, replay and loop are all just "render at time t",
 * because frames are pure functions of time. Cues and events fire when playback crosses their marker.
 */
import { type CompiledSequence, type Frame, type TimelineEvent, evaluateFrame, eventsBetween, timelineEvents } from './engine';
import type { AssetIndex } from './effects/types';
import { type PaintOptions, paintFrame } from './render';

export interface PlayerOptions {
  /** Omit for headless use (cues/events still fire; nothing is painted). */
  canvas?: HTMLCanvasElement | null;
  /** Viewport in CSS px; defaults to the canvas size divided by paint.dpr. */
  viewport?: { w: number; h: number };
  sequence: CompiledSequence;
  assets?: AssetIndex;
  paint?: PaintOptions;
  reducedMotion?: boolean;
  loop?: boolean;
  speed?: number;
  /** Pause between loop iterations (ms). */
  loopGap?: number;
  onCue?(e: TimelineEvent): void;
  onEvent?(e: TimelineEvent): void;
  onFrame?(t: number, frame: Frame): void;
  onEnd?(): void;
  /** Provide frames manually (tests); otherwise requestAnimationFrame is used. */
  manual?: boolean;
}

export class Player {
  time = 0;
  playing = false;
  loop: boolean;
  speed: number;
  private seq: CompiledSequence;
  private events: TimelineEvent[];
  private raf = 0;
  private last = 0;
  private gapLeft = 0;
  private firedUpTo = -1;
  private viewportOverride: { w: number; h: number } | null = null;
  private lastFrame: Frame | null = null;

  constructor(private o: PlayerOptions) {
    this.seq = o.sequence;
    this.events = timelineEvents(o.sequence);
    this.loop = o.loop ?? false;
    this.speed = o.speed ?? 1;
  }

  get duration(): number { return this.seq.duration; }
  get sequence(): CompiledSequence { return this.seq; }
  get frame(): Frame | null { return this.lastFrame; }

  /** Swap in a recompiled sequence (live editing) keeping the playhead. */
  setSequence(seq: CompiledSequence, keepTime = true): void {
    this.seq = seq;
    this.events = timelineEvents(seq);
    if (!keepTime) { this.time = 0; this.firedUpTo = -1; }
    this.time = Math.min(this.time, seq.duration);
    this.render();
  }

  setOptions(p: Partial<Pick<PlayerOptions, 'paint' | 'reducedMotion' | 'assets'>>): void { Object.assign(this.o, p); this.render(); }
  setViewport(vp: { w: number; h: number } | null): void { this.viewportOverride = vp; this.render(); }

  private viewport(): { w: number; h: number } {
    if (this.viewportOverride) return this.viewportOverride;
    if (this.o.viewport) return this.o.viewport;
    const dpr = this.o.paint?.dpr ?? 1;
    return this.o.canvas ? { w: this.o.canvas.width / dpr, h: this.o.canvas.height / dpr } : { w: 1280, h: 720 };
  }

  render(): Frame {
    const frame = evaluateFrame(this.seq, this.time, { viewport: this.viewport(), assets: this.o.assets, reducedMotion: !!this.o.reducedMotion });
    this.lastFrame = frame;
    const ctx = this.o.canvas?.getContext('2d');
    if (ctx) paintFrame(ctx, frame, this.o.paint);
    this.o.onFrame?.(this.time, frame);
    return frame;
  }

  /** Jump to a time. Scrubbing never fires cues; it only resets the cue cursor. */
  seek(t: number): void {
    this.time = Math.min(Math.max(0, t), this.seq.duration);
    this.firedUpTo = this.time - 1e-6;
    this.gapLeft = 0;
    this.render();
  }

  play(): void {
    if (this.playing) return;
    if (this.time >= this.seq.duration) this.seek(0);
    this.playing = true;
    this.last = performance.now();
    if (this.firedUpTo > this.time) this.firedUpTo = this.time - 1e-6;
    if (this.time === 0 && this.firedUpTo < 0) this.firedUpTo = -1;
    if (!this.o.manual) this.raf = requestAnimationFrame(this.tick);
  }

  pause(): void { this.playing = false; if (this.raf) cancelAnimationFrame(this.raf); this.raf = 0; }

  replay(): void { this.pause(); this.time = 0; this.firedUpTo = -1; this.gapLeft = 0; this.render(); this.play(); }

  dispose(): void { this.pause(); }

  private tick = (now: number): void => {
    if (!this.playing) return;
    const dt = Math.min(100, now - this.last) * this.speed;
    this.last = now;
    this.advance(dt);
    if (this.playing && !this.o.manual) this.raf = requestAnimationFrame(this.tick);
  };

  /** Advance by dt ms of timeline time (also the manual-stepping entry point for tests and headless use). */
  advance(dt: number): void {
    if (this.gapLeft > 0) {
      this.gapLeft -= dt;
      if (this.gapLeft <= 0) { this.time = 0; this.firedUpTo = -1; this.render(); }
      return;
    }
    const prev = this.time;
    const next = Math.min(this.seq.duration, prev + dt);
    for (const e of eventsBetween(this.events, this.firedUpTo, next)) {
      (e.kind === 'cue' ? this.o.onCue : this.o.onEvent)?.(e);
    }
    this.firedUpTo = next;
    this.time = next;
    this.render();
    if (next >= this.seq.duration) {
      if (this.loop) { this.gapLeft = this.o.loopGap ?? 700; }
      else { this.playing = false; this.o.onEnd?.(); }
    }
  }
}
