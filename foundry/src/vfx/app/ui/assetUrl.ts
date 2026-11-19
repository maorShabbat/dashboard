import { useEffect, useState } from 'react';
import { isVideoType } from '../../player/assets';
import { useServices } from './services';

/** An object URL for an asset id (built-in or uploaded), for previews. */
export function useAssetUrl(id: string): { url: string | null; video: boolean; error: string | null } {
  const { images } = useServices();
  const [s, setS] = useState<{ url: string | null; video: boolean; error: string | null }>({ url: null, video: false, error: null });
  useEffect(() => {
    let url: string | null = null, dead = false;
    void (async () => {
      try {
        const blob = id.startsWith('builtin:') ? await images.builtinBlob(id) : (await images.storeRef().get(id))?.blob;
        if (!blob) throw new Error('This image is not in this browser any more. Upload it again.');
        url = URL.createObjectURL(blob);
        if (!dead) setS({ url, video: isVideoType(blob.type), error: null });
      } catch (e) { if (!dead) setS({ url: null, video: false, error: (e as Error).message }); }
    })();
    return () => { dead = true; if (url) URL.revokeObjectURL(url); };
  }, [id, images]);
  return s;
}
