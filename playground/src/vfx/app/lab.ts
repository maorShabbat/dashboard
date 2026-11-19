/** `?lab`: a bare canvas with the test API, for the verification tools (contact sheets, pixel checks). No UI. */
import type { FontService } from '../fonts/service';
import type { ImageLibrary } from '../player/assets';
import { PreviewController } from './controller';
import { installTestApi } from './testApi';
import type { AppStore } from './store';

export function bootLab(root: HTMLElement, fonts: FontService, images: ImageLibrary, store: AppStore): void {
  root.innerHTML = '<div style="position:fixed;inset:0;background:#10131c;display:grid;place-items:center"><div id="stage" style="width:min(100vw,177.78vh);aspect-ratio:16/9;position:relative"><canvas id="cv" style="width:100%;height:100%;display:block"></canvas></div></div>';
  const controller = new PreviewController(document.getElementById('cv') as HTMLCanvasElement, { fonts, images });
  installTestApi(controller, fonts, images, store);
}
