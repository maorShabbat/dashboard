import { setFontFetcher, setFontUrlResolver } from '../fonts/service';
import { setEmbeddedLicenseSource } from '../export/bundle';

// Vite gives the real (hashed) URL of every bundled font file; fonts are fetched lazily, one file at a time.
const urls = import.meta.glob('../../../assets/fonts/catalog/*/*.woff2', { query: '?url', import: 'default', eager: true }) as Record<string, string>;
const map = new Map<string, string>();
for (const [k, v] of Object.entries(urls)) {
  const m = /catalog\/([^/]+)\/([^/]+)$/.exec(k);
  if (m) map.set(`${m[1]}/${m[2]}`, v);
}

interface FontPack { fonts: Record<string, string>; licenses: Record<string, string> }

/** The single-file build embeds the font files and licence texts in the page (in a non-script block, so they cost nothing until used). */
function readPack(): FontPack | null {
  const el = typeof document !== 'undefined' ? document.getElementById('vfx-font-pack') : null;
  if (!el?.textContent) return null;
  let pack: FontPack | null = null;
  const get = (): FontPack => (pack ??= JSON.parse(el.textContent!) as FontPack);
  return { get fonts() { return get().fonts; }, get licenses() { return get().licenses; } };
}

function decode(b64: string): ArrayBuffer {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

export function installFontUrls(): void {
  setFontUrlResolver((id, file) => map.get(`${id}/${file}`));
  const pack = readPack();
  if (!pack) return;
  setFontFetcher(async (family, file) => {
    const b64 = pack.fonts[`${family.id}/${file.file}`];
    if (!b64) throw new Error(`${file.file} is missing from the embedded font pack`);
    return decode(b64);
  });
  setEmbeddedLicenseSource((id) => pack.licenses[id] ?? null);
}
