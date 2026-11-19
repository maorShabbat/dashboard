/** Ephemeral editor state (selection, tabs, preview options). Not part of the project, so never undoable. */
export type Tab = 'theme' | 'sheet' | 'presets' | 'sequences' | 'bundle' | 'media';

export interface LayerOverride { visible?: boolean; solo?: boolean; opacity?: number }

export interface UiState {
  tab: Tab;
  themeId: string | null;
  presetId: string | null;
  sequenceId: string | null;
  themeSection: string;
  /** Effect whose theme-level defaults are being edited / previewed. */
  effectType: string;
  /** What the theme view previews: "effect:<type>" or "sequence:<id>". */
  previewKey: string;
  cols: number;
  rows: number;
  pattern: 'line' | 'cluster' | 'scatter' | 'all' | 'none';
  seed: number;
  winAmount: number;
  viewportId: string;
  reducedMotion: boolean;
  loop: boolean;
  autoReplay: boolean;
  soundOn: boolean;
  speed: number;
  overriddenOnly: boolean;
  source: 'draft' | 'approved';
  layerOverrides: Record<string, LayerOverride>;
  selectedClipIds: string[];
  selectedMarkerId: string | null;
  zoom: number;
  snap: boolean;
  libraryFilter: string;
  favouritesOnly: boolean;
  showAllPresets: boolean;
}

export const defaultUi = (): UiState => ({
  tab: 'theme', themeId: null, presetId: null, sequenceId: null, themeSection: 'colors', effectType: 'bigWinBanner', previewKey: 'effect:bigWinBanner',
  cols: 5, rows: 3, pattern: 'line', seed: 7, winAmount: 1234.5, viewportId: 'desktop', reducedMotion: false, loop: true, autoReplay: true, soundOn: false, speed: 1,
  overriddenOnly: false, source: 'draft', layerOverrides: {}, selectedClipIds: [], selectedMarkerId: null, zoom: 0.12, snap: true, libraryFilter: '', favouritesOnly: false, showAllPresets: false,
});

const PERSIST: (keyof UiState)[] = ['tab', 'themeId', 'presetId', 'sequenceId', 'themeSection', 'effectType', 'previewKey', 'cols', 'rows', 'pattern', 'viewportId', 'loop', 'autoReplay', 'zoom', 'snap', 'overriddenOnly'];
const KEY = 'bangers.ui.v1';

export class UiStore {
  state: UiState;
  private listeners = new Set<() => void>();
  private rev = 0;
  constructor(storage: Storage | null = safeStorage()) {
    this.state = defaultUi();
    this.storage = storage;
    try {
      const raw = storage?.getItem(KEY);
      if (raw) { const o = JSON.parse(raw) as Partial<UiState>; for (const k of PERSIST) if (k in o) (this.state as unknown as Record<string, unknown>)[k] = o[k]; }
    } catch { /* storage unavailable or corrupt: defaults are fine */ }
  }
  private storage: Storage | null;
  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; };
  getRevision = () => this.rev;
  set(patch: Partial<UiState>): void {
    this.state = { ...this.state, ...patch };
    this.rev++;
    try { if (this.storage) this.storage.setItem(KEY, JSON.stringify(Object.fromEntries(PERSIST.map((k) => [k, this.state[k]])))); } catch { /* ignore */ }
    this.listeners.forEach((l) => l());
  }
}

/** Sandboxed frames can make even *touching* localStorage throw, so never reference it outside a try. */
function safeStorage(): Storage | null { try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; } }
