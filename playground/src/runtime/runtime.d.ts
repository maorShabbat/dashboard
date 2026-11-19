// Type declarations for runtime/bangers-runtime.js (kept intentionally loose at the data-structure level; see manifest.json and config/library.json for the schema).
export const PACKAGE_VERSION: string;
export const RUNTIME_VERSION: string;
export const SCHEMA_VERSION: number;
export const BUNDLE_VERSION: number;

export interface TimelineEvent { t: number; kind: 'cue' | 'event' | 'label'; name: string; source: 'clip' | 'sequence'; clipId?: string; audio?: { enabled: boolean; asset: string; gainDb: number; pitch: number } }
export interface ReplayDiff { scope: 'sequence' | 'preset' | 'effect'; id: string; detail: string }
export type FileReader = (path: string) => Promise<Uint8Array>;

export interface LoadedBundle { manifest: any; library: any; read: FileReader; mediaIndex: { id: string; sha256: string }[]; baseUrl: string | null }
export interface PreparedBundle { assets: any; painterAssets: any; fontStacks: Record<string, { family: string; fallback: string }>; audio: { resume(): Promise<void>; play(ev: TimelineEvent): Promise<void>; setMuted(m: boolean): void; dispose(): void } | null }

export class Player {
  time: number; playing: boolean; loop: boolean; speed: number; readonly duration: number;
  play(): void; pause(): void; replay(): void; seek(t: number): void; advance(dtMs: number): void; render(): any; dispose(): void;
  setViewport(vp: { w: number; h: number } | null): void;
}

export interface BundlePlayerOptions {
  bundle: LoadedBundle; prepared?: PreparedBundle;
  /** One of: sequence id, preset id, or effect type. */
  sequence?: string; preset?: string; effect?: string;
  canvas?: HTMLCanvasElement | null; viewport?: { w: number; h: number }; loop?: boolean; speed?: number; reducedMotion?: boolean;
  onCue?(e: TimelineEvent): void; onEvent?(e: TimelineEvent): void; onFrame?(t: number, frame: any): void; onEnd?(): void; paint?: { dpr?: number };
}

export function loadBundle(source: string | FileReader): Promise<LoadedBundle>;
export function prepareBundle(bundle: LoadedBundle): Promise<PreparedBundle>;
export function createBundlePlayer(o: BundlePlayerOptions): Promise<Player>;
export function verifyReplay(bundle: LoadedBundle): { ok: boolean; compared: number; diffs: ReplayDiff[] };
export function compileFromBundle(bundle: LoadedBundle, o: { sequence?: string; preset?: string; effect?: string }): any;
export function frameAt(bundle: LoadedBundle, sequenceId: string, t: number, viewport?: { w: number; h: number }): any;
export function evaluateFrame(seq: any, t: number, opts: { viewport: { w: number; h: number }; assets?: any; reducedMotion?: boolean }): any;
export function compileSequence(seq: any, lib: any): any;
export function timelineEvents(seq: any): TimelineEvent[];
export function eventsBetween(events: TimelineEvent[], from: number, to: number): TimelineEvent[];
export function paintFrame(ctx: CanvasRenderingContext2D, frame: any, opts?: any): void;
export function computeReplay(lib: any, media: { id: string; sha256: string }[]): any;
export function compareReplay(expected: any, actual: any): { ok: boolean; compared: number; diffs: ReplayDiff[] };
export function libraryViewOf(lib: any): any;
export function assetIndexFrom(entries: { id: string; sha256: string }[]): any;
export function buildScene(spec: any): any;
export function computeLayout(cols: number, rows: number, vw: number, vh: number, tokens: { gap: number; padding: number; frameWidth: number }): any;
export function resolveTokens(tokens: Record<string, any>): any;
export const EFFECT_LIST: any[];
export const BOARD_PRESETS: { id: string; label: string; cols: number; rows: number }[];
export const VIEWPORT_PRESETS: { id: string; label: string; w: number; h: number }[];
