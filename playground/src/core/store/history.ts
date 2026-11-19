/**
 * ProjectStore: the single mutable cell of the app. State is an immutable Project; every change goes through `commit`,
 * which records the previous state for undo/redo. Consecutive commits with the same coalesce key (a slider drag, typing)
 * within a short window merge into one undo step.
 */
import type { Project } from '../model/types';

interface Entry { state: Project; label: string }

export interface HistoryInfo { canUndo: boolean; canRedo: boolean; undoLabel: string | null; redoLabel: string | null; depth: number }

export class ProjectStore {
  private current: Project;
  private past: Entry[] = [];
  private future: Entry[] = [];
  private listeners = new Set<() => void>();
  private lastKey: string | null = null;
  private lastAt = 0;
  private version = 0;
  /** Revision counter for useSyncExternalStore consumers. */
  constructor(initial: Project, private limit = 200, private coalesceMs = 700, private clock: () => number = () => Date.now()) { this.current = initial; }

  get state(): Project { return this.current; }
  get revision(): number { return this.version; }

  subscribe = (fn: () => void): (() => void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; };
  getRevision = (): number => this.version;

  private emit(): void { this.version++; this.listeners.forEach((l) => l()); }

  /** Apply a change. Returns false when `fn` returned the same state (nothing to record). */
  commit(label: string, fn: (p: Project) => Project, coalesceKey?: string): boolean {
    const next = fn(this.current);
    if (next === this.current) return false;
    const now = this.clock();
    const merge = coalesceKey !== undefined && coalesceKey === this.lastKey && now - this.lastAt < this.coalesceMs && this.past.length > 0;
    if (!merge) {
      this.past.push({ state: this.current, label });
      if (this.past.length > this.limit) this.past.shift();
    }
    this.current = next;
    this.future = [];
    this.lastKey = coalesceKey ?? null;
    this.lastAt = now;
    this.emit();
    return true;
  }

  undo(): boolean {
    const e = this.past.pop();
    if (!e) return false;
    this.future.push({ state: this.current, label: e.label });
    this.current = e.state;
    this.lastKey = null;
    this.emit();
    return true;
  }

  redo(): boolean {
    const e = this.future.pop();
    if (!e) return false;
    this.past.push({ state: this.current, label: e.label });
    this.current = e.state;
    this.lastKey = null;
    this.emit();
    return true;
  }

  /** Replace the whole project (load/restore) and clear history. */
  reset(p: Project): void {
    this.current = p; this.past = []; this.future = []; this.lastKey = null; this.emit();
  }

  get history(): HistoryInfo {
    return {
      canUndo: this.past.length > 0, canRedo: this.future.length > 0,
      undoLabel: this.past[this.past.length - 1]?.label ?? null, redoLabel: this.future[this.future.length - 1]?.label ?? null, depth: this.past.length,
    };
  }

  /** Labels of the most recent undo steps (newest first), for a history menu. */
  recent(n = 12): string[] { return this.past.slice(-n).reverse().map((e) => e.label); }
}
