/** Procedural sprites shipped with BANGERS so effects work out of the box. Public domain (CC0). */
import type { LicenseInfo } from '../fonts';
import { utf8 } from '../util/sha256';

const svg = (body: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">${body}</svg>\n`;

export const BUILTIN_SPRITES: Record<string, { name: string; svg: string }> = {
  'builtin:coin': {
    name: 'Coin',
    svg: svg('<defs><radialGradient id="g" cx="40%" cy="35%"><stop offset="0" stop-color="#fff3a6"/><stop offset="1" stop-color="#f2a900"/></radialGradient></defs><circle cx="32" cy="32" r="28" fill="url(#g)" stroke="#1a0f2e" stroke-width="4"/><circle cx="32" cy="32" r="18" fill="none" stroke="#b36b00" stroke-width="3"/><path d="M32 20v24M26 26h9a4 4 0 010 8h-9" fill="none" stroke="#b36b00" stroke-width="3" stroke-linecap="round"/>'),
  },
  'builtin:star': {
    name: 'Star',
    svg: svg('<path d="M32 4l8.5 18.5L61 25l-15 14 4 20.5L32 49 14 59.500l4-20.500L3 25l20.500-2.500z" fill="#ffd23f" stroke="#1a0f2e" stroke-width="4" stroke-linejoin="round"/>'),
  },
  'builtin:spark': {
    name: 'Spark',
    svg: svg('<path d="M32 2c2 16 6 26 30 30-24 4-28 14-30 30-2-16-6-26-30-30 24-4 28-14 30-30z" fill="#ffffff" stroke="#2fd6ff" stroke-width="3" stroke-linejoin="round"/>'),
  },
};

export const BUILTIN_LICENSE: LicenseInfo = {
  id: 'CC0-1.0', name: 'CC0 1.0 Universal (public domain dedication)', holder: 'BANGERS Studio', url: 'https://creativecommons.org/publicdomain/zero/1.0/',
  redistributable: true, attribution: 'No attribution required.',
  text: 'To the extent possible under law, the BANGERS Studio authors have waived all copyright and related or neighboring rights to these sprites. See https://creativecommons.org/publicdomain/zero/1.0/legalcode',
};

export const isBuiltinAsset = (id: string) => id.startsWith('builtin:');
export const builtinAssetBytes = (id: string): Uint8Array | undefined => (BUILTIN_SPRITES[id] ? utf8(BUILTIN_SPRITES[id]!.svg) : undefined);
