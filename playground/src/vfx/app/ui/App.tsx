import { useEffect, useRef } from 'react';
import type { Preset } from '../../model/preset';
import { importFile } from '../../export/importFile';
import { presetRef } from '../../model/preset';
import { Library, Sidebar } from './Library';
import { useServices, useStore } from './services';
import { Workspace } from './Workspace';
import { Btn } from './widgets';

export function App() {
  const store = useStore();
  const { fonts, images } = useServices();
  const doc = store.doc;
  const file = useRef<HTMLInputElement>(null);
  const open = (p: Preset) => store.open(p);

  // toast
  useEffect(() => {
    if (!store.notice) return;
    const t = setTimeout(() => store.clearNotice(), 5200);
    return () => clearTimeout(t);
  }, [store.notice?.at, store]);

  const onImport = async (f: File | undefined) => {
    if (!f) return;
    const r = await importFile(f, { fonts, images });
    if (!r.ok) { store.say(`Could not import ${f.name}: ${r.errors[0] ?? 'unknown problem'}`, 'error'); return; }
    const p = store.adopt(r.preset!);
    store.say(`Imported ${presetRef(p)}${r.warnings.length ? ` (${r.warnings.length} note${r.warnings.length === 1 ? '' : 's'})` : ''}.`, 'ok');
    store.open(p);
  };

  return (
    <div className="app">
      <header className="top">
        <div className="brand">BANGERS <small>VFX Playground</small></div>
        <div className="search"><input type="search" placeholder="Search every effect…" value={store.search} onChange={(e) => { if (doc) store.close(); store.setSearch(e.target.value); }} aria-label="Search effects" data-testid="search" /></div>
        <span className="spacer" />
        <input ref={file} type="file" hidden accept=".json,.zip" data-testid="top-import-file" onChange={(e) => { void onImport(e.target.files?.[0]); e.target.value = ''; }} />
        <Btn small onClick={() => file.current?.click()} testId="top-import">Import…</Btn>
      </header>
      <div className="main">
        <div onClickCapture={(e) => { if (doc && (e.target as HTMLElement).closest('button.navitem')) store.close(); }} style={{ display: 'contents' }}><Sidebar /></div>
        <main className="content">
          {doc ? <Workspace onBack={() => store.close()} /> : <Library onOpen={open} />}
        </main>
      </div>
      {store.notice?.text && <div className={`status ${store.notice.kind}`} role="status" data-testid="status">{store.notice.text}</div>}
    </div>
  );
}
