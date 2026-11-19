import './styles.css';
import { createRoot } from 'react-dom/client';
import { fonts } from '../fonts/service';
import { installFontUrls } from './fontUrls';
import { IdbAssetStore, ImageLibrary } from '../player/assets';
import { registerBuiltins } from './builtins';
import { restoreCustomFonts } from './customFonts';
import { AppStore } from './store';
import { ThumbHub } from './thumbs';
import { bootLab } from './lab';
import { App } from './ui/App';
import { ServicesCtx } from './ui/services';
import { blobOfUrl } from '../player/assets';
import gemUrl from '../../../assets/showcase/icons/gem.webp?url';
import horseshoeUrl from '../../../assets/showcase/icons/horseshoe.png?url';
import starUrl from '../../../assets/showcase/icons/star.png?url';
import sevenUrl from '../../../assets/showcase/icons/seven.png?url';
import fireColumnUrl from '../../../assets/showcase/expansions/wild-fire-column.webm?url';
import lightningColumnUrl from '../../../assets/showcase/expansions/wild-lightning-column.webm?url';
import goldColumnUrl from '../../../assets/showcase/expansions/wild-gold-column.webm?url';
import plasmaColumnUrl from '../../../assets/showcase/expansions/wild-plasma-column.webm?url';
import barnUrl from '../../../assets/showcase/barn-night.webp?url';

declare global { interface Window { __vfxApp?: { store: AppStore; hub: ThumbHub; fonts: typeof fonts; images: ImageLibrary } } }

installFontUrls();
const params = new URLSearchParams(location.search);

async function boot(): Promise<void> {
  const images = new ImageLibrary(new IdbAssetStore());
  registerBuiltins(images, { gem: gemUrl, horseshoe: horseshoeUrl, star: starUrl, seven: sevenUrl }, { 'wild-fire-column.webm': fireColumnUrl, 'wild-lightning-column.webm': lightningColumnUrl, 'wild-gold-column.webm': goldColumnUrl, 'wild-plasma-column.webm': plasmaColumnUrl });
  await restoreCustomFonts(fonts, images.storeRef());
  const storage = (() => { try { const ls = window.localStorage; ls.getItem('x'); return ls; } catch { return null; } })();
  const store = new AppStore(params.has('fresh') ? null : storage);
  const hub = new ThumbHub({ fonts, images }, async () => createImageBitmap(await blobOfUrl(barnUrl, 'barn'), { premultiplyAlpha: 'none', colorSpaceConversion: 'none' }).catch(() => null));
  const runtimeSource = async (): Promise<string> => (await import('../../../generated/vfx-player.js?raw')).default;
  window.__vfxApp = { store, hub, fonts, images };
  const root = document.getElementById('root')!;
  if (params.has('lab')) { bootLab(root, fonts, images, store); return; }
  createRoot(root).render(<ServicesCtx.Provider value={{ fonts, images, store, hub, barnUrl, runtimeSource }}><App /></ServicesCtx.Provider>);
  await new Promise((r) => requestAnimationFrame(() => r(null)));
}

window.vfxReady = boot();
