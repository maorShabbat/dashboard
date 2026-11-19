/** Decoded images for previews: project media plus built-in sprites, exposed as the painter's asset interface. */
import type { AssetIndex } from '../core/effects/types';
import { BUILTIN_SPRITES, builtinAssetBytes } from '../core/model/builtinAssets';
import type { Project } from '../core/model/types';
import type { PainterAssets } from '../core/render';
import type { BlobStore } from '../core/store/persistence';
import { sha256Hex } from '../core/util/sha256';

export class MediaCache implements PainterAssets, AssetIndex {
  private images = new Map<string, CanvasImageSource>();
  private hashes = new Map<string, string>();
  private loading = new Set<string>();
  private listeners = new Set<() => void>();
  constructor(private blobs: BlobStore) {
    for (const id of Object.keys(BUILTIN_SPRITES)) this.hashes.set(id, sha256Hex(builtinAssetBytes(id)!));
  }
  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; };
  image(id: string): CanvasImageSource | undefined { return this.images.get(id); }
  has(id: string): boolean { return this.hashes.has(id); }
  hash(id: string): string | undefined { return this.hashes.get(id); }

  /** Load whatever the project references; resolves when new images are ready so callers can repaint. */
  async sync(p: Project): Promise<void> {
    let changed = false;
    const jobs: Promise<void>[] = [];
    for (const id of Object.keys(BUILTIN_SPRITES)) if (!this.images.has(id)) jobs.push(this.decode(id, new Blob([builtinAssetBytes(id)!.slice().buffer as ArrayBuffer], { type: 'image/svg+xml' })).then((ok) => { changed ||= ok; }));
    for (const m of Object.values(p.media)) {
      if (m.kind === 'font') continue;
      this.hashes.set(m.id, m.hash);
      if (m.kind === 'image' && !this.images.has(m.id) && !this.loading.has(m.id)) {
        this.loading.add(m.id);
        jobs.push((async () => {
          const bytes = await this.blobs.get(m.hash);
          if (bytes) changed = (await this.decode(m.id, new Blob([bytes.slice().buffer as ArrayBuffer], { type: m.mime }))) || changed;
          this.loading.delete(m.id);
        })());
      }
    }
    await Promise.all(jobs);
    if (changed) this.listeners.forEach((l) => l());
  }

  private async decode(id: string, blob: Blob): Promise<boolean> {
    const url = URL.createObjectURL(blob);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      this.images.set(id, img);
      return true;
    } catch { return false; }
  }
}
