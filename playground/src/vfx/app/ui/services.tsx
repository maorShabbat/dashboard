import { createContext, useContext, useSyncExternalStore } from 'react';
import type { FontService } from '../../fonts/service';
import type { ImageLibrary } from '../../player/assets';
import type { AppStore } from '../store';
import type { ThumbHub } from '../thumbs';

export interface Services { fonts: FontService; images: ImageLibrary; store: AppStore; hub: ThumbHub; barnUrl: string; runtimeSource: () => Promise<string> }
export const ServicesCtx = createContext<Services>(null as never);
export const useServices = (): Services => useContext(ServicesCtx);

/** Re-render when the store changes. */
export function useStore(): AppStore {
  const { store } = useServices();
  useSyncExternalStore(store.subscribe, store.snapshot);
  return store;
}
export function useFontsState(): FontService {
  const { fonts } = useServices();
  useSyncExternalStore(fonts.subscribe, fonts.snapshot);
  return fonts;
}
