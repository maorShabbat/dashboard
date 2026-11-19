/** Persisted data shapes. Everything here is plain JSON. */
import type { CueMarker } from '../cues';
import type { LicenseInfo } from '../fonts';
import type { Value } from '../params';

/** Sparse overrides at one layer of the chain, plus optional replacement cue markers. */
export interface OverrideSet {
  params: Record<string, Value>;
  /** When present, replaces the inherited cue markers wholesale. */
  cues?: CueMarker[];
}

/** Documentation of intent. Never read by the renderer: rendering uses explicit parameters only. */
export interface ArtDirection {
  summary: string;
  mood: string[];
  references: string;
  dos: string;
  donts: string;
}

export interface ThemeContent {
  /** Sparse overrides of BANGERS default tokens. */
  tokens: Record<string, Value>;
  /** Theme-level defaults for specific effect types (layer 2 of the effect inheritance chain). */
  effectDefaults: Record<string, OverrideSet>;
  artDirection: ArtDirection;
  /** Free-text name of the game this theme belongs to. Documentation only. */
  game: string;
}

export interface ThemeSnapshot {
  content: ThemeContent;
  fromThemeId: string;
  fromThemeName: string;
  /** Version the snapshot was taken from; null when taken from the working draft. */
  fromVersion: { id: string; number: number } | null;
  takenAt: string;
}

export interface PresetContent {
  effectType: string;
  /** The theme this preset is designed for (and follows while linked). */
  themeId: string | null;
  link: 'linked' | 'snapshot';
  snapshot: ThemeSnapshot | null;
  overrides: OverrideSet;
}

export type WinPattern = 'line' | 'cluster' | 'scatter' | 'all' | 'none';

export interface SceneSpec {
  cols: number;
  rows: number;
  pattern: WinPattern;
  seed: number;
  winAmount: number;
  bet: number;
  multiplier: number;
}

export interface Clip {
  id: string;
  name: string;
  presetId: string | null;
  effectType: string;
  /** Milliseconds from sequence start. */
  start: number;
  /** Layer 4 of the chain: overrides local to this clip. */
  overrides: OverrideSet;
  repeat: { count: number; step: number; order: 'forward' | 'reverse' | 'center' | 'random' };
  muted: boolean;
}

export interface Track { id: string; name: string; muted: boolean; solo: boolean; locked: boolean; clips: Clip[] }

export interface SeqMarker {
  id: string;
  t: number;
  /** cue → sound cue id; event → named event for the host game; label → annotation only. */
  kind: 'cue' | 'event' | 'label';
  name: string;
  gain: number;
}

export interface SequenceContent {
  themeId: string | null;
  scene: SceneSpec;
  tracks: Track[];
  markers: SeqMarker[];
  /** null → length follows the last clip/marker. */
  fixedDuration: number | null;
}

// ---------------------------------------------------------------------------------------------------------------------
// Library assets

export type AssetKind = 'theme' | 'preset' | 'sequence';

export interface VersionRecord<T> {
  id: string;
  number: number;
  label: string;
  note: string;
  createdAt: string;
  hash: string;
  content: T;
  approval: { status: 'none' | 'approved' | 'revoked'; at?: string; by?: string; note?: string };
}

export interface LibraryAsset<T> {
  id: string;
  kind: AssetKind;
  name: string;
  /** Free text. For themes this documents art direction and has no effect on rendering. */
  description: string;
  tags: string[];
  favourite: boolean;
  createdAt: string;
  updatedAt: string;
  draft: T;
  versions: VersionRecord<T>[];
  /** The version marked as released/approved; exports prefer it. */
  approvedVersionId: string | null;
  derivedFrom?: { id: string; name: string };
}

export type ThemeAsset = LibraryAsset<ThemeContent>;
export type PresetAsset = LibraryAsset<PresetContent>;
export type SequenceAsset = LibraryAsset<SequenceContent>;

export type MediaKind = 'image' | 'audio' | 'font';

export interface MediaItem {
  id: string;
  kind: MediaKind;
  name: string;
  mime: string;
  size: number;
  /** sha256 hex of the file bytes; also the blob-store key. */
  hash: string;
  license: LicenseInfo;
}

export interface UserFont {
  id: string;
  label: string;
  family: string;
  fallback: string;
  files: { weight: number; style: 'normal' | 'italic'; mediaId: string }[];
  license: LicenseInfo;
}

export interface Project {
  schema: number;
  name: string;
  themes: Record<string, ThemeAsset>;
  presets: Record<string, PresetAsset>;
  sequences: Record<string, SequenceAsset>;
  media: Record<string, MediaItem>;
  fonts: Record<string, UserFont>;
}
