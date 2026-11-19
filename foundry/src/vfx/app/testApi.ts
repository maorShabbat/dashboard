/** `window.__vfx`: a small handle for the verification tools (Playwright) to drive the real app and read exact pixels. */
import type { PreviewController } from './controller';
import type { Scene } from '../model/scene';
import type { FontService } from '../fonts/service';
import type { ImageLibrary } from '../player/assets';
import type { AppStore } from './store';
import { EFFECTS } from '../fx';
import { builtinById, builtinPresets } from '../library';
import { categoryDef, type Preset } from '../model/preset';
import { defaultsOf } from '../fx/effect';
import { makeBackdrop, type BackdropId } from './backdrops';
import barnUrl from '../../../assets/showcase/barn-night.webp?url';

export interface VfxTestApi {
  controller: PreviewController;
  fonts: FontService;
  images: ImageLibrary;
  setScene(scene: Scene): Promise<{ warnings: string[]; errors: { name: string; message: string }[] }>;
  seek(t: number): void;
  duration(): number;
  png(): string;
  /** SHA-256 of the canvas pixels. */
  hash(): Promise<string>;
  /** Fraction of pixels that are not transparent (with no backdrop this is how much the effect covers). */
  coverage(): number;
  pixels(): { width: number; height: number; b64: string };
  counts(): Record<string, number>;
  stats(): { batches: number; instances: number };
  store?: AppStore;
  /** Wait for loading to finish, then draw time t and return the canvas hash. */
  settle(t: number): Promise<string>;
  /** Render the scene at several times and return one contact-sheet PNG (data URL). */
  sheet(scene: Scene, times: number[], cols?: number, cellW?: number): Promise<{ png: string; duration: number; errors: string[]; warnings: string[] }>;
  backdrop(id: string): Promise<void>;
  backdropTo(id: string): Promise<void>;
  presets(): { id: string; name: string; category: string; status: string; backdrop: string; backdropTo: string | null }[];
  preset(id: string): Preset | undefined;
  effectIds(): { id: string; usesObject: boolean; usesObject2: boolean; duration: number; category: string }[];
}

declare global { interface Window { __vfx?: VfxTestApi; vfxReady?: Promise<void> } }

export function installTestApi(controller: PreviewController, fonts: FontService, images: ImageLibrary, store?: AppStore): VfxTestApi {
  const api: VfxTestApi = {
    controller, fonts, images, store,
    setScene: async (scene) => { const r = await controller.setScene(scene, { reload: true }); return { warnings: r.warnings, errors: r.errors.map((e) => ({ name: e.name, message: e.message })) }; },
    seek: (t) => controller.seek(t),
    settle: async (t) => {
      // two frames let a pending resize or edit reach the controller before we wait for it to finish
      await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
      await controller.whenIdle(); controller.pause(); controller.seek(t); return api.hash();
    },
    duration: () => controller.duration,
    png: () => controller.canvas.toDataURL('image/png'),
    hash: async () => {
      const px = controller.renderer.readPixels();
      const buf = await crypto.subtle.digest('SHA-256', px.slice().buffer);
      return Array.from(new Uint8Array(buf), (x) => x.toString(16).padStart(2, '0')).join('');
    },
    coverage: () => {
      const px = controller.renderer.readPixels(); let n = 0;
      for (let i = 3; i < px.length; i += 4) if (px[i]! > 6) n++;
      return n / (px.length / 4);
    },
    pixels: () => {
      const px = controller.renderer.readPixels(); let bin = '';
      for (let i = 0; i < px.length; i += 0x8000) bin += String.fromCharCode(...px.subarray(i, i + 0x8000));
      return { width: controller.renderer.view.width, height: controller.renderer.view.height, b64: btoa(bin) };
    },
    counts: () => ({ ...controller.renderer.counts(), total: controller.renderer.g.totalLive(), textures: controller.renderer.tex.size }),
    stats: () => ({ ...controller.renderer.lastStats }),
    backdrop: async (id) => { controller.setBackdrop(await makeBackdrop(id as BackdropId, barnUrl)); },
    backdropTo: async (id) => { controller.setBackdropTo(await makeBackdrop(id as BackdropId, barnUrl)); },
    presets: () => builtinPresets().map((p) => ({ id: p.id, name: p.name, category: p.category, status: p.status, backdrop: p.scene.screens?.from ?? categoryDef(p.category).backdrop, backdropTo: p.scene.screens?.to ?? null })),
    preset: (id) => builtinById(id),
    effectIds: () => EFFECTS.map((e) => ({ id: e.id, usesObject: !!e.usesObject, usesObject2: !!e.usesObject2, duration: e.duration(defaultsOf(e)), category: e.category })),
    sheet: async (scene, times, cols = times.length, cellW = 360) => {
      const r = await controller.setScene(scene, { reload: true });
      const cv = controller.canvas;
      const cellH = Math.round(cellW / scene.aspect), rows = Math.ceil(times.length / cols);
      const out = document.createElement('canvas'); out.width = cellW * cols; out.height = cellH * rows;
      const g = out.getContext('2d')!;
      g.fillStyle = '#000'; g.fillRect(0, 0, out.width, out.height);
      times.forEach((t, i) => {
        controller.seek(Math.min(t, controller.duration));
        g.drawImage(cv, (i % cols) * cellW, Math.floor(i / cols) * cellH, cellW, cellH);
        g.fillStyle = 'rgba(0,0,0,0.55)'; g.fillRect((i % cols) * cellW + 4, Math.floor(i / cols) * cellH + 4, 52, 16);
        g.fillStyle = '#fff'; g.font = '11px monospace'; g.fillText(`${t.toFixed(2)}s`, (i % cols) * cellW + 8, Math.floor(i / cols) * cellH + 16);
      });
      return { png: out.toDataURL('image/png'), duration: controller.duration, errors: r.errors.map((e) => `${e.name}: ${e.message}`), warnings: r.warnings };
    },
  };
  window.__vfx = api;
  return api;
}
