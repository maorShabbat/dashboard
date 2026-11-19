/**
 * Portable bundles: a zip with the preset, the player, the images it uses, ONLY the fonts it uses (with their licence files) and a
 * font-licence manifest. It plays offline with no dependence on any remote service.
 */
import { createZip, type ZipEntry } from '../../core/util/zip';
import { sha256Hex, utf8 } from '../../core/util/sha256';
import { stableStringify } from '../../core/util/json';
import { pickFile, getFamily } from '../fonts/catalog';
import { CUSTOM_FONT_DISCLAIMER, isCustomFontId, type FontService } from '../fonts/service';
import { buildFontManifest, manifestText, safeName, usedFontFiles } from '../fonts/manifest';
import { copyForAi } from '../model/copyForAi';
import { presetRef, type Preset } from '../model/preset';
import { GENERATOR } from '../model/serialize';
import { sceneAllAssets, sceneAssetIds, sceneFonts } from '../model/scene';
import type { BundleManifest } from '../runtime';
import type { ImageLibrary } from '../player/assets';

export const BUNDLE_SCHEMA = 'bangers.vfx-bundle/1';

// licence texts are read lazily, one file per font actually used
const licenseLoaders = import.meta.glob('../../../assets/fonts/catalog/*/LICENSE.txt', { query: '?raw', import: 'default' }) as Record<string, () => Promise<string>>;
const licenseLoaderFor = (id: string): (() => Promise<string>) | undefined => Object.entries(licenseLoaders).find(([k]) => k.endsWith(`/catalog/${id}/LICENSE.txt`))?.[1];

/** The single-file build carries the licence texts inside the page: it installs how to read them. */
let embeddedLicense: ((id: string) => string | null) | null = null;
export const setEmbeddedLicenseSource = (fn: ((id: string) => string | null) | null): void => { embeddedLicense = fn; };
const licenseTextFor = async (id: string): Promise<string | null> => {
  const own = embeddedLicense?.(id);
  if (own) return own;
  const loader = licenseLoaderFor(id);
  return loader ? loader() : null;
};

export interface BundleDeps { fonts: FontService; images: ImageLibrary; runtimeSource: string; now?: string }
export interface BundleFile { path: string; bytes: number; sha256: string }
export interface BuiltBundle { zip: Uint8Array; files: BundleFile[]; manifest: BundleManifest; warnings: string[]; slug: string }

const extFromType = (type: string, name: string): string => {
  const m = /\.([a-z0-9]+)$/i.exec(name)?.[1]?.toLowerCase();
  if (type === 'video/webm' || m === 'webm') return 'webm';
  if (type.startsWith('audio/') || ['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac', 'opus', 'weba'].includes(m ?? '')) {
    if (type === 'audio/mpeg') return 'mp3'; if (/^audio\/(x-)?wave?$/.test(type)) return 'wav'; if (type === 'audio/ogg') return 'ogg'; if (type === 'audio/mp4' || type === 'audio/x-m4a') return 'm4a';
    return m ?? 'mp3';
  }
  if (type === 'image/png') return 'png'; if (type === 'image/webp') return 'webp'; if (type === 'image/gif') return 'gif'; if (type === 'image/jpeg') return 'jpg';
  return m ?? 'png';
};

export async function buildBundle(preset: Preset, deps: BundleDeps): Promise<BuiltBundle> {
  const { fonts, images } = deps;
  const warnings: string[] = [];
  const entries: ZipEntry[] = [];
  const add = (path: string, data: Uint8Array | string) => { entries.push({ path, data: typeof data === 'string' ? utf8(data) : data }); };
  const slug = safeName(preset.id);
  const root = `${slug}`;

  // fonts actually used: only those files, plus licence files
  const specs = sceneFonts(preset.scene);
  const used = usedFontFiles(specs, (id) => fonts.customMeta(id));
  const manifestFonts: NonNullable<BundleManifest['fonts']> = [];
  const doneFamilies = new Set<string>();
  for (const u of used) {
    const spec = { id: u.id, weight: u.weight, style: u.style };
    await fonts.load(spec);
    const bytes = fonts.bytesOf(spec);
    if (!bytes) throw new Error(`The font "${u.id}" ${u.weight} could not be read for the bundle.`);
    if (u.custom) {
      const meta = fonts.customMeta(u.id)!;
      const path = `fonts/${safeName(u.id)}/${safeName(meta.fileName)}`;
      add(`${root}/${path}`, new Uint8Array(bytes));
      manifestFonts.push({ id: u.id, family: meta.family, fileName: meta.fileName, weight: meta.weight, style: meta.style, sha256: meta.sha256, path, userSupplied: true });
      if (!doneFamilies.has(u.id)) { add(`${root}/fonts/${safeName(u.id)}/README-USER-FONT.txt`, `${meta.family}\n\n${CUSTOM_FONT_DISCLAIMER}\n`); doneFamilies.add(u.id); }
      warnings.push(`“${meta.family}” is a font you uploaded: you are responsible for its licence.`);
    } else {
      const fam = getFamily(u.id)!;
      const file = pickFile(fam, u.weight, u.style).file;
      add(`${root}/fonts/${fam.id}/${file.file}`, new Uint8Array(bytes));
      if (!doneFamilies.has(fam.id)) {
        const licence = await licenseTextFor(fam.id);
        if (!licence) throw new Error(`No licence text found for ${fam.family}; refusing to export it.`);
        add(`${root}/fonts/${fam.id}/LICENSE.txt`, licence);
        doneFamilies.add(fam.id);
      }
    }
  }
  const licenses = buildFontManifest(specs, { customs: (id) => fonts.customMeta(id), generated: (deps.now ?? new Date().toISOString()).slice(0, 10) });
  add(`${root}/font-licenses.json`, JSON.stringify(licenses, null, 2));
  add(`${root}/FONT-LICENSES.txt`, manifestText(licenses));

  // images: uploads by id, built-ins by name
  const assetPaths: Record<string, string> = {};
  for (const id of sceneAllAssets(preset.scene)) {
    if (id.startsWith('builtin:')) {
      const blob = await images.builtinBlob(id);
      const path = `assets/builtin/${safeName(id.slice(8))}.${extFromType(blob.type, id)}`;
      add(`${root}/${path}`, new Uint8Array(await blob.arrayBuffer())); assetPaths[id] = path;
    } else {
      const rec = await images.storeRef().get(id);
      if (!rec) throw new Error(`The image "${id}" is missing from this browser, so it cannot be included in the bundle.`);
      const path = `assets/${safeName(id)}.${extFromType(rec.type, rec.name)}`;
      add(`${root}/${path}`, new Uint8Array(await rec.blob.arrayBuffer())); assetPaths[id] = path;
    }
  }
  void sceneAssetIds;

  const manifest: BundleManifest = { schema: BUNDLE_SCHEMA, preset: { id: preset.id, version: preset.version, ref: presetRef(preset) }, assets: assetPaths, fonts: manifestFonts };
  const presetJson = JSON.stringify(JSON.parse(stableStringify(preset)), null, 2);
  add(`${root}/preset.json`, presetJson);
  add(`${root}/vfx-player.js`, deps.runtimeSource);
  const md = copyForAi(preset);
  add(`${root}/README.md`, readme(preset, md));
  add(`${root}/index.html`, demoPage(preset));

  // the manifest lists every other file with its hash, so the bundle can be verified
  const files: BundleFile[] = entries.map((e) => ({ path: e.path.slice(root.length + 1), bytes: e.data.length, sha256: sha256Hex(e.data) }));
  const full = { ...manifest, generator: GENERATOR, created: deps.now ?? new Date().toISOString(), player: { file: 'vfx-player.js', sha256: sha256Hex(utf8(deps.runtimeSource)) }, files };
  add(`${root}/manifest.json`, JSON.stringify(JSON.parse(stableStringify(full)), null, 2));
  const zip = createZip(entries);
  return { zip, files, manifest, warnings, slug };
}

function readme(p: Preset, ai: string): string {
  return `# ${p.name}\n\nBANGERS VFX bundle. Preset \`${presetRef(p)}\`.\n\n## Files\n\n- \`index.html\` – a demo page: open it through any static web server (e.g. \`npx serve .\`); browsers do not let pages read files from \`file://\`.\n- \`vfx-player.js\` – the player (no dependencies, WebGL2).\n- \`preset.json\` – the preset. Edit text with \`player.setText('<element id>', '...')\`.\n- \`assets/\` – the images the preset uses.\n- \`fonts/\` – ONLY the fonts the preset uses, each with its licence file. \`font-licenses.json\` / \`FONT-LICENSES.txt\` list family, source, licence, files, weights and the date the licence was checked.\n- \`manifest.json\` – every file with its SHA-256.\n\nNothing is loaded from a CDN or any remote service at run time.\n\n---\n\n${ai}`;
}

function demoPage(p: Preset): string {
  const a = p.scene.aspect;
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${p.name.replace(/</g, '&lt;')}</title>
<style>html,body{margin:0;height:100%;background:#0e1016;color:#e9edf9;font:14px system-ui,sans-serif}main{display:grid;place-items:center;gap:12px;height:100%;padding:16px;box-sizing:border-box}canvas{width:min(100%,calc((100vh - 90px)*${a.toFixed(4)}));aspect-ratio:${a.toFixed(4)};background:repeating-conic-gradient(#1a1e2b 0 25%,#151925 0 50%) 0 0/22px 22px;border-radius:10px}button{background:#ffb629;border:0;border-radius:8px;padding:8px 16px;font-weight:700;cursor:pointer}#msg{color:#ff6b7a;max-width:60ch;white-space:pre-wrap}</style></head>
<body><main><canvas id="stage" width="1280" height="${Math.round(1280 / a)}"></canvas><div><button id="replay">Replay</button> <button id="sound" hidden>Sound: off</button></div><div id="msg"></div></main>
<script type="module">
import { createVfxPlayer } from './vfx-player.js';
const msg = document.getElementById('msg');
try {
  const preset = await (await fetch('./preset.json')).json();
  const player = await createVfxPlayer(document.getElementById('stage'), { preset, base: './' }, { width: 1280, height: ${Math.round(1280 / a)}, pixelRatio: 1, quality: 'high' });
  window.player = player;
  document.getElementById('replay').onclick = () => player.restart();
  const snd = document.getElementById('sound');
  if (player.sounds().length) { snd.hidden = false; let on = false; snd.onclick = () => { on = !on; player.setSound(on); snd.textContent = 'Sound: ' + (on ? 'on' : 'off'); if (on) player.restart(); }; }
  player.play();
  window.ready = true;
} catch (e) { msg.textContent = String(e.message || e); window.ready = false; }
</script></body></html>
`;
}
