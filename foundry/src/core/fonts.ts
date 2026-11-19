/**
 * Font registry. A font file is only ever placed in an exported bundle when its licence says redistribution/embedding
 * is permitted; everything else is referenced by family name with a fallback stack and listed as "omitted".
 */

export interface LicenseInfo {
  /** SPDX id where one exists ("OFL-1.1", "CC0-1.0"), otherwise "custom". */
  id: string;
  name: string;
  holder?: string;
  url?: string;
  /** Full licence text shipped in the bundle's licenses/ folder. */
  text?: string;
  /** May the file be redistributed / embedded inside a bundle? Declared by whoever supplied the file. */
  redistributable: boolean;
  attribution?: string;
}

export interface FontFile { weight: number; style: 'normal' | 'italic'; file: string; format: 'woff2' | 'woff' | 'ttf' | 'otf' }

export interface BuiltinFont {
  id: string;
  label: string;
  /** CSS family name used by FontFace registrations. */
  family: string;
  fallback: string;
  files: FontFile[];
  license: LicenseInfo;
  note: string;
}

export interface SystemFont { id: string; label: string; stack: string }

const OFL = (holder: string, url: string): LicenseInfo => ({
  id: 'OFL-1.1', name: 'SIL Open Font License 1.1', holder, url: 'https://openfontlicense.org', redistributable: true,
  attribution: `Copyright ${holder} (${url})`,
});

export const BUILTIN_FONTS: BuiltinFont[] = [
  {
    id: 'bangers', label: 'Bangers', family: 'Bangers', fallback: 'Impact, "Arial Black", sans-serif', note: 'Comic display face, the BANGERS house display font.',
    files: [{ weight: 400, style: 'normal', file: 'bangers/bangers-latin-400-normal.woff2', format: 'woff2' }],
    license: OFL('2010 The Bangers Project Authors', 'https://github.com/googlefonts/bangers'),
  },
  {
    id: 'anton', label: 'Anton', family: 'Anton', fallback: 'Impact, "Arial Narrow", sans-serif', note: 'Condensed headline face.',
    files: [{ weight: 400, style: 'normal', file: 'anton/anton-latin-400-normal.woff2', format: 'woff2' }],
    license: OFL('2020 The Anton Project Authors', 'https://github.com/googlefonts/AntonFont.git'),
  },
  {
    id: 'inter', label: 'Inter', family: 'Inter', fallback: 'system-ui, -apple-system, "Segoe UI", sans-serif', note: 'Neutral UI/body face (400 and 700).',
    files: [
      { weight: 400, style: 'normal', file: 'inter/inter-latin-400-normal.woff2', format: 'woff2' },
      { weight: 700, style: 'normal', file: 'inter/inter-latin-700-normal.woff2', format: 'woff2' },
    ],
    license: OFL('2016 The Inter Project Authors', 'https://github.com/rsms/inter'),
  },
  {
    id: 'roboto-mono', label: 'Roboto Mono', family: 'Roboto Mono', fallback: 'ui-monospace, Menlo, Consolas, monospace', note: 'Fixed-width digits: counters do not jitter while counting.',
    files: [{ weight: 700, style: 'normal', file: 'roboto-mono/roboto-mono-latin-700-normal.woff2', format: 'woff2' }],
    license: OFL('2015 The Roboto Mono Project Authors', 'https://github.com/googlefonts/robotomono'),
  },
];

export const SYSTEM_FONTS: SystemFont[] = [
  { id: 'system-sans', label: 'System sans (no file)', stack: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif' },
  { id: 'system-serif', label: 'System serif (no file)', stack: 'Georgia, "Times New Roman", serif' },
  { id: 'system-mono', label: 'System mono (no file)', stack: 'ui-monospace, Menlo, Consolas, monospace' },
];

export const BUILTIN_FONT_FILE_ROOT = 'assets/fonts';

export function builtinFont(id: string): BuiltinFont | undefined { return BUILTIN_FONTS.find((f) => f.id === id); }
export function systemFont(id: string): SystemFont | undefined { return SYSTEM_FONTS.find((f) => f.id === id); }

/** Description of a font the runtime can register (built-in, user supplied, or bundle supplied). */
export interface RuntimeFont {
  id: string;
  family: string;
  fallback: string;
  files: { weight: number; style: 'normal' | 'italic'; url: string }[];
}

/** CSS font stack for an id, whether or not its files are available. */
export function cssFontStack(id: string, extra?: Record<string, { family: string; fallback: string }>): string {
  const b = builtinFont(id);
  if (b) return `"${b.family}", ${b.fallback}`;
  const s = systemFont(id);
  if (s) return s.stack;
  const x = extra?.[id];
  if (x) return `"${x.family}", ${x.fallback}`;
  return 'system-ui, sans-serif';
}

/** Pick the available weight closest to the requested one. */
export function nearestWeight(weights: number[], wanted: number): number {
  return weights.reduce((best, w) => (Math.abs(w - wanted) < Math.abs(best - wanted) ? w : best), weights[0] ?? 400);
}
