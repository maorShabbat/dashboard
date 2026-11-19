import { createContext, useContext, useEffect, useRef, useSyncExternalStore } from 'react';
import { createCueAudio, type CueAudio } from '../core/audio';
import type { Project } from '../core/model/types';
import { ProjectStore } from '../core/store/history';
import type { BlobStore, KV } from '../core/store/persistence';
import { MediaCache } from './mediaCache';
import { UiStore, type UiState } from './ui';

export interface Toast { id: number; kind: 'info' | 'ok' | 'warn' | 'error'; text: string; details?: string[] }

export class ToastStore {
  items: Toast[] = [];
  private n = 0;
  private subs = new Set<() => void>();
  private rev = 0;
  subscribe = (fn: () => void) => { this.subs.add(fn); return () => { this.subs.delete(fn); }; };
  getRevision = () => this.rev;
  push(text: string, kind: Toast['kind'] = 'info', details?: string[]): void {
    const t: Toast = { id: ++this.n, kind, text, ...(details?.length ? { details: details.slice(0, 8) } : {}) };
    this.items = [...this.items.slice(-3), t];
    this.rev++; this.subs.forEach((f) => f());
    setTimeout(() => this.dismiss(t.id), kind === 'error' || details?.length ? 9000 : 4000);
  }
  dismiss(id: number): void { this.items = this.items.filter((t) => t.id !== id); this.rev++; this.subs.forEach((f) => f()); }
}

export type SaveState = 'idle' | 'saving' | 'saved' | 'error';

/** Reactive save indicator for the header. */
export class SaveStatus {
  value: SaveState = 'idle';
  private subs = new Set<() => void>();
  private rev = 0;
  subscribe = (fn: () => void) => { this.subs.add(fn); return () => { this.subs.delete(fn); }; };
  getRevision = () => this.rev;
  set(v: SaveState): void { this.value = v; this.rev++; this.subs.forEach((f) => f()); }
}

export interface Studio {
  store: ProjectStore;
  blobs: BlobStore;
  kv: KV;
  ui: UiStore;
  media: MediaCache;
  audio: CueAudio | null;
  toasts: ToastStore;
  saveStatus: SaveStatus;
}

export const StudioCtx = createContext<Studio | null>(null);
export const useStudio = (): Studio => { const s = useContext(StudioCtx); if (!s) throw new Error('StudioCtx missing'); return s; };

export function makeAudio(blobs: BlobStore, getProject: () => Project): CueAudio | null {
  return createCueAudio({
    async load(id) {
      const m = getProject().media[id];
      const bytes = m ? await blobs.get(m.hash) : undefined;
      return bytes ? (bytes.slice().buffer as ArrayBuffer) : undefined;
    },
  });
}

export function useProject(): Project {
  const s = useStudio();
  useSyncExternalStore(s.store.subscribe, s.store.getRevision);
  return s.store.state;
}

export function useUi(): UiState {
  const s = useStudio();
  useSyncExternalStore(s.ui.subscribe, s.ui.getRevision);
  return s.ui.state;
}

export function useHistoryInfo() {
  const s = useStudio();
  useSyncExternalStore(s.store.subscribe, s.store.getRevision);
  return s.store.history;
}

export type Commit = (label: string, fn: (p: Project) => Project, coalesceKey?: string) => boolean;
export function useCommit(): Commit {
  const s = useStudio();
  return (label, fn, key) => s.store.commit(label, fn, key);
}

/** Re-run `fn` when the media cache finishes decoding something (so previews repaint). */
export function useMediaVersion(): number {
  const s = useStudio();
  const v = useRef(0);
  return useSyncExternalStore((cb) => s.media.subscribe(() => { v.current++; cb(); }), () => v.current);
}

export function useEvent<T extends unknown[]>(fn: (...a: T) => void): (...a: T) => void {
  const ref = useRef(fn);
  ref.current = fn;
  const stable = useRef((...a: T) => ref.current(...a));
  return stable.current;
}

export function useKey(handler: (e: KeyboardEvent) => void): void {
  const h = useEvent(handler);
  useEffect(() => { window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h); }, [h]);
}
