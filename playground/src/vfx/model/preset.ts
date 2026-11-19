/** Presets: a scene plus what a person is expected to change (the text boxes and symbol slots), with a stable id and version. */
import type { Scene } from './scene';

export const PRESET_SCHEMA = 'bangers.vfx-preset/1';

export type CategoryId =
  | 'text-animations' | 'text-styling' | 'counters' | 'messages' | 'symbol-destruction'
  | 'symbol-transformation' | 'multipliers' | 'impacts' | 'screen-distortion' | 'shine';

export interface CategoryDef {
  id: CategoryId;
  name: string;
  blurb: string;
  /** Which stand-in picture suits this category's previews. */
  backdrop: 'barn' | 'reels' | 'night' | 'daylight' | 'none';
  /** What the person supplies first. */
  starts: 'text' | 'icon' | 'message' | 'none';
}

export const CATEGORIES: CategoryDef[] = [
  { id: 'text-animations', name: 'Text animations', blurb: 'How words arrive, move and leave: per letter, word or line.', backdrop: 'night', starts: 'text' },
  { id: 'text-styling', name: 'Text styling', blurb: 'Fonts, gradients, outlines, bevels and glows: the look of the words.', backdrop: 'night', starts: 'text' },
  { id: 'counters', name: 'Amount counters', blurb: 'Win amounts that count up: rolling, popping, flipping, spinning.', backdrop: 'night', starts: 'text' },
  { id: 'messages', name: 'Messages and win celebrations', blurb: 'Pop-out banners and plates with several lines of text, an amount and fanfare.', backdrop: 'barn', starts: 'message' },
  { id: 'symbol-destruction', name: 'Symbol pop and destruction', blurb: 'Ways for a symbol to leave the board: break, burn, dissolve, pop.', backdrop: 'night', starts: 'icon' },
  { id: 'symbol-transformation', name: 'Symbol transformation and expansion', blurb: 'A symbol turns into another, upgrades, or stretches across the reels.', backdrop: 'night', starts: 'icon' },
  { id: 'multipliers', name: 'Multipliers', blurb: 'x2, x5, x100: badges that build, slam, orbit and charge.', backdrop: 'night', starts: 'text' },
  { id: 'impacts', name: 'Impacts', blurb: 'Whole-screen hits: shockwave, vortex, plasma, slam, lightning.', backdrop: 'barn', starts: 'none' },
  { id: 'screen-distortion', name: 'Screen distortion', blurb: 'Bend the picture: ripples, lenses, glitch, heat, zoom.', backdrop: 'reels', starts: 'text' },
  { id: 'shine', name: 'Shine and highlights', blurb: 'Sweeps, sparkles, glows, rays and flares for polish.', backdrop: 'night', starts: 'text' },
];
export const categoryDef = (id: CategoryId): CategoryDef => CATEGORIES.find((c) => c.id === id)!;

/** Something the person is expected to change first: a line of text, or a symbol / message background image. */
export interface PresetInput { element: string; label: string; kind: 'text' | 'image' | 'counter' }

export type PresetStatus = 'approved' | 'stable' | 'draft' | 'experimental' | 'archived';

export interface Preset {
  schema: typeof PRESET_SCHEMA;
  /** Stable, never reused: `category.slug` for built-ins, `user.slug-xxxx` for saved ones. */
  id: string;
  /** Increases with every saved change of a user preset; built-ins are fixed at their version. */
  version: number;
  name: string;
  category: CategoryId;
  description: string;
  tags: string[];
  kind: 'builtin' | 'user';
  status: PresetStatus;
  /** `id@version` this was copied from. */
  derivedFrom?: string;
  /** Optional heading the library groups this effect under inside its category. */
  group?: string;
  created: string;
  inputs: PresetInput[];
  scene: Scene;
}

export const presetRef = (p: { id: string; version: number }): string => `${p.id}@${p.version}`;
