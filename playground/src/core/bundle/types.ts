import type { PresetContent, SequenceContent, ThemeContent } from '../model/types';
import type { SequenceFingerprint } from '../fingerprint';

export const BUNDLE_FORMAT = 'bangers.bundle';
export const MANIFEST_PATH = 'manifest.json';
export const LIBRARY_PATH = 'config/library.json';
export const RUNTIME_PATH = 'runtime/bangers-runtime.js';

/** config/library.json: the resolved-source content of everything in the bundle. */
export interface BundleLibrary {
  schemaVersion: number;
  theme: { id: string; name: string; description: string; content: ThemeContent };
  presets: { id: string; name: string; description: string; content: PresetContent }[];
  sequences: { id: string; name: string; description: string; content: SequenceContent }[];
}

export interface BundleFileEntry { path: string; size: number; sha256: string; role: string }

export interface BundleMedia { id: string; kind: 'image' | 'audio'; name: string; mime: string; path: string; size: number; sha256: string; license: string }
export interface BundleFontFile { path: string; weight: number; style: 'normal' | 'italic'; format: string; sha256: string; size: number }
export interface BundleFont {
  id: string; family: string; fallback: string;
  /** 'builtin' ships with BANGERS, 'user' was imported into the project, 'system' is a generic stack with no file. */
  origin: 'builtin' | 'user' | 'system';
  /** True when font files are included. False means the host must supply the family or the fallback stack is used. */
  bundled: boolean;
  files: BundleFontFile[];
  license: string | null;
}
export interface BundleLicense { key: string; id: string; name: string; holder?: string; url?: string; attribution?: string; path: string; appliesTo: string[]; /** Always true for included files; recorded so verification can prove it. */ redistributable: boolean }
export interface BundleOmission { kind: 'font' | 'asset'; id: string; name: string; reason: string }

export interface ReplayRecord {
  viewports: string[];
  sequences: Record<string, SequenceFingerprint>;
  presets: Record<string, SequenceFingerprint>;
  effects: Record<string, SequenceFingerprint>;
}

export interface BundleManifest {
  format: typeof BUNDLE_FORMAT;
  bundleVersion: number;
  schemaVersion: number;
  packageVersion: string;
  runtimeVersion: string;
  createdAt: string;
  generator: string;
  name: string;
  theme: { id: string; name: string; description: string; source: 'approved' | 'draft'; approved: boolean; version: { id: string; number: number; label: string } | null; contentHash: string };
  presets: { id: string; name: string; effectType: string; link: 'linked' | 'snapshot'; approved: boolean; contentHash: string }[];
  sequences: { id: string; name: string; approved: boolean; contentHash: string; duration: number }[];
  media: BundleMedia[];
  fonts: BundleFont[];
  licenses: BundleLicense[];
  omitted: BundleOmission[];
  warnings: string[];
  files: BundleFileEntry[];
  replay: ReplayRecord;
  integration: { runtime: string; examples: string[]; docs: string };
}
