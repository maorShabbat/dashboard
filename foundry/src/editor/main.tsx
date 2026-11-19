import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createStarterProject, STARTER_IDS } from '../core/starter';
import { ProjectStore } from '../core/store/history';
import { BlobStore, IdbKV, MemoryKV, attachAutosave, loadProject, type KV } from '../core/store/persistence';
import { App } from './App';
import { registerBuiltinFonts, registerUserFonts } from './fonts';
import { MediaCache } from './mediaCache';
import { SaveStatus, StudioCtx, ToastStore, makeAudio, type Studio } from './studio';
import { UiStore } from './ui';
import './styles.css';

async function boot() {
  let kv: KV;
  let persistent = true;
  try { kv = new IdbKV(); await kv.get('probe'); } catch { kv = new MemoryKV(); persistent = false; }
  const blobs = new BlobStore(kv);
  const toasts = new ToastStore();
  let loaded: Awaited<ReturnType<typeof loadProject>> = null;
  try { loaded = await loadProject(kv); } catch (e) { toasts.push(`Saved library could not be read (${(e as Error).message}); starting from the starter library`, 'error'); }
  const project = loaded?.project ?? createStarterProject();
  const store = new ProjectStore(project);
  const ui = new UiStore();
  if (!ui.state.themeId || !project.themes[ui.state.themeId]) ui.set({ themeId: project.themes[STARTER_IDS.classic] ? STARTER_IDS.classic : Object.keys(project.themes)[0] ?? null });
  const media = new MediaCache(blobs);
  const studio: Studio = { store, blobs, kv, ui, media, audio: makeAudio(blobs, () => store.state), toasts, saveStatus: new SaveStatus() };
  await Promise.all([registerBuiltinFonts(), registerUserFonts(project, blobs), media.sync(project)]);
  attachAutosave(store, kv, (s) => studio.saveStatus.set(s));
  store.subscribe(() => { void media.sync(store.state); void registerUserFonts(store.state, blobs); });
  if (!persistent) toasts.push('Browser storage is unavailable: your changes will not be saved. Export a project backup from the Bundle tab.', 'warn');
  if (loaded?.warnings.length) toasts.push('Some saved values were corrected on load', 'warn', loaded.warnings);
  (window as unknown as { __studio: Studio }).__studio = studio;
  createRoot(document.getElementById('root')!).render(<StrictMode><StudioCtx.Provider value={studio}><App /></StudioCtx.Provider></StrictMode>);
}

void boot();
