/** Preset files: stable JSON out, validated JSON in. A preset file is the preset plus the font licences it needs and, optionally, its uploaded images. */
import { stableStringify } from '../../core/util/json';
import { buildFontManifest, type FontManifest } from '../fonts/manifest';
import type { CustomFontMeta } from '../fonts/service';
import { PRESET_SCHEMA, presetRef, type Preset } from './preset';
import { sceneFonts, type AssetRef } from './scene';
import { validatePreset, type ValidateOptions } from './validate';

export const PRESET_FILE_SCHEMA = 'bangers.vfx-preset-file/1';
export const GENERATOR = 'bangers-vfx-playground/1';

export interface EmbeddedAsset { type: string; base64: string }
export interface PresetFile {
  schema: typeof PRESET_FILE_SCHEMA;
  generator: string;
  exported: string;
  /** Stable reference to the preset: `id@version`. */
  ref: string;
  preset: Preset;
  fontLicenses: FontManifest;
  embeddedAssets?: Record<string, EmbeddedAsset>;
}

export function toB64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
export function fromB64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function buildPresetFile(preset: Preset, opts: { customs?: (id: string) => CustomFontMeta | undefined; embedded?: Record<string, EmbeddedAsset>; now?: string } = {}): PresetFile {
  const now = opts.now ?? new Date().toISOString();
  const file: PresetFile = {
    schema: PRESET_FILE_SCHEMA, generator: GENERATOR, exported: now, ref: presetRef(preset), preset,
    fontLicenses: buildFontManifest(sceneFonts(preset.scene), { customs: opts.customs, generated: now.slice(0, 10) }),
  };
  if (opts.embedded && Object.keys(opts.embedded).length) file.embeddedAssets = opts.embedded;
  return file;
}

export const exportPresetJson = (preset: Preset, opts: Parameters<typeof buildPresetFile>[1] = {}): string => JSON.stringify(JSON.parse(stableStringify(buildPresetFile(preset, opts))), null, 2);

/** Only the preset, as stable JSON: used for equality checks and fingerprints. */
export const presetFingerprintSource = (preset: Preset): string => stableStringify(preset);

export interface ImportResult { ok: boolean; preset?: Preset; embedded: Record<string, EmbeddedAsset>; errors: string[]; warnings: string[] }

export function importPresetJson(text: string, opts: ValidateOptions = {}): ImportResult {
  let raw: unknown;
  try { raw = JSON.parse(text); } catch (e) { return { ok: false, embedded: {}, errors: [`This is not valid JSON: ${(e as Error).message}`], warnings: [] }; }
  let presetRaw = raw;
  let embedded: Record<string, EmbeddedAsset> = {};
  if (raw && typeof raw === 'object' && (raw as { schema?: unknown }).schema === PRESET_FILE_SCHEMA) {
    const f = raw as PresetFile;
    presetRaw = f.preset; embedded = f.embeddedAssets ?? {};
  } else if (!(raw && typeof raw === 'object' && (raw as { schema?: unknown }).schema === PRESET_SCHEMA)) {
    return { ok: false, embedded: {}, errors: ['This file is neither a BANGERS VFX preset nor a preset file.'], warnings: [] };
  }
  const v = validatePreset(presetRaw, opts);
  if (!v.ok) return { ok: false, embedded: {}, errors: v.errors, warnings: v.warnings };
  const warnings = [...v.warnings];
  for (const a of v.preset!.scene.assets) if (!embedded[a.id]) warnings.push(`The image "${a.name}" is not inside this file; upload it again or it will not appear.`);
  return { ok: true, preset: v.preset, embedded, errors: [], warnings };
}

export type { AssetRef };
