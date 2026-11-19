import { ConfirmModal } from './shell';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { GameConfig } from '../compiler/config';
import { ACCEPT, KIND_LABEL, addFiles, getStore, humanSize, type AssetKind, type AssetMeta } from './assets';
import { Icon, Panel, type SetCfg } from './ui';

// ---------------------------------------------------------------- provider: the library state and the picker
interface Ctx {
  assets: AssetMeta[]; persistent: boolean; ready: boolean;
  add: (files: File[]) => Promise<{ added: AssetMeta[]; rejected: { name: string; reason: string }[] }>;
  remove: (id: string) => Promise<void>; rename: (id: string, name: string) => Promise<void>;
  blob: (id: string) => Promise<Blob | undefined>;
  pick: (kinds: AssetKind[], title?: string) => Promise<AssetMeta | null>;
}
const AssetsCtx = createContext<Ctx | null>(null);
export const useAssets = () => { const c = useContext(AssetsCtx); if (!c) throw new Error('AssetsProvider missing'); return c; };

export function AssetsProvider({ children }: { children: React.ReactNode }) {
  const [assets, setAssets] = useState<AssetMeta[]>([]); const [persistent, setPersistent] = useState(true); const [ready, setReady] = useState(false);
  const [picker, setPicker] = useState<{ kinds: AssetKind[]; title: string; resolve: (a: AssetMeta | null) => void } | null>(null);
  useEffect(() => { getStore().then(async (s) => { setPersistent(s.persistent); setAssets((await s.list()).sort((a, b) => b.added - a.added)); setReady(true); }); }, []);
  const add = useCallback(async (files: File[]) => { const r = await addFiles(files); if (r.added.length) setAssets((cur) => [...r.added, ...cur]); return r; }, []);
  const remove = useCallback(async (id: string) => { const s = await getStore(); await s.remove(id); setAssets((cur) => cur.filter((a) => a.id !== id)); }, []);
  const rename = useCallback(async (id: string, name: string) => { const s = await getStore(); setAssets((cur) => cur.map((a) => { if (a.id !== id) return a; const n = { ...a, name: name.trim() || a.name }; void s.update(n); return n; })); }, []);
  const blob = useCallback(async (id: string) => (await getStore()).blob(id), []);
  const pick = useCallback((kinds: AssetKind[], title = 'Choose from the library') => new Promise<AssetMeta | null>((resolve) => setPicker({ kinds, title, resolve })), []);
  const value = useMemo(() => ({ assets, persistent, ready, add, remove, rename, blob, pick }), [assets, persistent, ready, add, remove, rename, blob, pick]);
  return (
    <AssetsCtx.Provider value={value}>
      {children}
      {picker && <AssetPicker kinds={picker.kinds} title={picker.title} onDone={(a) => { picker.resolve(a); setPicker(null); }} />}
    </AssetsCtx.Provider>
  );
}

/** An object URL for a stored file (created once per id and kept for the session). */
const urlCache = new Map<string, string>();
export function useAssetUrl(id: string | undefined): string | undefined {
  const { blob, assets } = useAssets();
  const [url, setUrl] = useState<string | undefined>(id ? urlCache.get(id) : undefined);
  const exists = !!id && assets.some((a) => a.id === id);
  useEffect(() => {
    if (!id || !exists) { setUrl(undefined); return; }
    const hit = urlCache.get(id); if (hit) { setUrl(hit); return; }
    let live = true;
    void blob(id).then((b) => { if (!b || !live) return; const u = URL.createObjectURL(b); urlCache.set(id, u); setUrl(u); });
    return () => { live = false; };
  }, [id, exists, blob]);
  return url;
}

// ---------------------------------------------------------------- small pieces
export function Thumb({ a, size = 'card' }: { a: AssetMeta; size?: 'card' | 'row' }) {
  const url = useAssetUrl(a.kind === 'audio' || a.kind === 'data' ? undefined : a.id);
  return (
    <span className={`athumb ${size} ${a.kind}`}>
      {a.kind === 'image' && (url ? <img src={url} alt="" /> : a.thumb ? <img src={a.thumb} alt="" /> : <Icon name="image" size={28} />)}
      {a.kind === 'video' && (a.thumb ? <img src={a.thumb} alt="" /> : <Icon name="film" size={28} />)}
      {a.kind === 'audio' && <Icon name="music" size={28} />}
      {a.kind === 'data' && <Icon name="file" size={28} />}
      {a.kind === 'video' && a.duration ? <em>{fmtDur(a.duration)}</em> : null}
      {a.kind === 'audio' && a.duration ? <em>{fmtDur(a.duration)}</em> : null}
    </span>
  );
}
const fmtDur = (d: number) => `${Math.floor(d / 60)}:${String(Math.floor(d % 60)).padStart(2, '0')}`;
const metaLine = (a: AssetMeta) => [a.kind === 'data' ? 'data' : a.kind, humanSize(a.size), a.width ? `${a.width}x${a.height}` : ''].filter(Boolean).join(' · ');

export function AudioButton({ id }: { id: string | undefined }) {
  const url = useAssetUrl(id); const ref = useRef<HTMLAudioElement | null>(null); const [on, setOn] = useState(false);
  if (!url) return null;
  return (
    <>
      <audio ref={ref} src={url} onEnded={() => setOn(false)} />
      <button className="small" aria-label={on ? 'Stop sound' : 'Play sound'} onClick={() => { const a = ref.current; if (!a) return; if (on) { a.pause(); a.currentTime = 0; setOn(false); } else { void a.play().then(() => setOn(true)).catch(() => setOn(false)); } }}><Icon name="play" size={13} />{on ? 'Stop' : 'Play'}</button>
    </>
  );
}

function DropZone({ kinds, onFiles, compact }: { kinds?: AssetKind[]; onFiles: (f: File[]) => void; compact?: boolean }) {
  const [over, setOver] = useState(false); const input = useRef<HTMLInputElement | null>(null);
  const accept = kinds ? kinds.map((k) => ({ image: 'image/*', video: 'video/*', audio: 'audio/*', data: '.json,.atlas,.skel,.txt,.csv' }[k])).join(',') : ACCEPT;
  return (
    <div className={`dropzone ${over ? 'over' : ''} ${compact ? 'compact' : ''}`} data-testid="dropzone"
      onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); onFiles(Array.from(e.dataTransfer.files)); }}>
      <Icon name="upload" size={compact ? 22 : 30} />
      <div><b>Drop files here</b><span>{kinds ? kinds.map((k) => KIND_LABEL[k].toLowerCase()).join(', ') : 'images, videos (webm, mp4), sounds (mp3, ogg, wav), JSON and atlas files'}</span></div>
      <button className="primary small" onClick={() => input.current?.click()}>Choose files</button>
      <input ref={input} type="file" multiple hidden accept={accept} aria-label="Upload files to the library" data-testid="file-input" onChange={(e) => { onFiles(Array.from(e.target.files ?? [])); e.target.value = ''; }} />
    </div>
  );
}

function useUpload() {
  const { add } = useAssets(); const [msg, setMsg] = useState<string[]>([]); const [busy, setBusy] = useState(false);
  const run = async (files: File[]) => { if (!files.length) return []; setBusy(true); const r = await add(files); setBusy(false); setMsg(r.rejected.map((x) => `${x.name}: ${x.reason}`)); return r.added; };
  return { run, msg, busy };
}

// ---------------------------------------------------------------- the picker (opens from every upload button)
function AssetPicker({ kinds, title, onDone }: { kinds: AssetKind[]; title: string; onDone: (a: AssetMeta | null) => void }) {
  const { assets } = useAssets(); const up = useUpload(); const [sel, setSel] = useState<string | null>(null); const [q, setQ] = useState('');
  const list = assets.filter((a) => kinds.includes(a.kind) && a.name.toLowerCase().includes(q.toLowerCase()));
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onDone(null); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onDone]);
  return (
    <div className="modalback" onMouseDown={(e) => { if (e.target === e.currentTarget) onDone(null); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} data-testid="asset-picker">
        <header><h3><Icon name="folder" size={18} />{title}</h3><button className="iconbtn" aria-label="Close" onClick={() => onDone(null)}><Icon name="close" size={18} /></button></header>
        <DropZone kinds={kinds} compact onFiles={async (f) => { const added = await up.run(f); const first = added.find((a) => kinds.includes(a.kind)); if (first) setSel(first.id); }} />
        {up.msg.map((m) => <p className="fix" key={m}>{m}</p>)}
        <div className="row"><input placeholder="Search files" aria-label="Search files" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <div className="agrid picker" role="listbox" aria-label="Library files">
          {list.length === 0 && <p className="muted">{assets.some((a) => kinds.includes(a.kind)) ? 'No file matches the search.' : `Nothing here yet. Drop ${kinds.map((k) => KIND_LABEL[k].toLowerCase()).join(' or ')} above to add them.`}</p>}
          {list.map((a) => (
            <button key={a.id} role="option" aria-selected={sel === a.id} className={`acard ${sel === a.id ? 'on' : ''}`} data-testid={`pick-${a.name}`} onClick={() => setSel(a.id)} onDoubleClick={() => onDone(a)}>
              <Thumb a={a} /><span className="aname">{a.name}</span><span className="ameta">{metaLine(a)}</span>
            </button>
          ))}
        </div>
        <footer><button onClick={() => onDone(null)}>Cancel</button><button className="primary" disabled={!sel} data-testid="use-selected" onClick={() => onDone(assets.find((a) => a.id === sel) ?? null)}>Use selected</button></footer>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- the library page
function usedBy(cfg: GameConfig, a: AssetMeta): string[] {
  const out: string[] = [];
  for (const [id, l] of Object.entries(cfg.look ?? {})) if (l.asset === a.name && l.image) out.push(`symbol ${l.name || id}`);
  for (const [slot, m] of Object.entries(cfg.media ?? {})) if (m.id === a.id) out.push(SLOTS.find((s) => s.id === slot)?.label ?? slot);
  return out;
}

export function LibraryStep({ cfg }: { cfg: GameConfig }) {
  const { assets, persistent, remove, rename, ready } = useAssets(); const up = useUpload();
  const [filter, setFilter] = useState<'all' | AssetKind>('all'); const [q, setQ] = useState(''); const [del, setDel] = useState<string | null>(null); const [editing, setEditing] = useState<string | null>(null);
  const shown = assets.filter((a) => (filter === 'all' || a.kind === filter) && a.name.toLowerCase().includes(q.toLowerCase()));
  const count = (k: AssetKind) => assets.filter((a) => a.kind === k).length;
  const total = assets.reduce((n, a) => n + a.size, 0);
  return (
    <div className="stack">
      <Panel title="Asset library" icon="folder" aside={<span className="muted small">{assets.length} files · {humanSize(total)}</span>}>
        <p className="muted">Drop every file you need here once: symbol images, backgrounds, webm videos, sounds, JSON and atlas files. Anywhere you need a file (a symbol picture, the background, a sound) the library opens so you can pick it.</p>
        <DropZone onFiles={(f) => void up.run(f)} />
        {up.busy && <p className="muted">Reading files...</p>}
        {up.msg.map((m) => <p className="fix" key={m}>{m}</p>)}
        <p className="muted small">{persistent ? 'Files are stored in this browser and stay after you reload.' : 'Browser storage is blocked here, so files only last until you close this page.'} The exported config keeps references (file names), not the files themselves.</p>
      </Panel>
      <Panel title="Files" icon="image" aside={
        <span className="chips" role="tablist" aria-label="File type">
          {([['all', `All (${assets.length})`], ['image', `Images (${count('image')})`], ['video', `Videos (${count('video')})`], ['audio', `Sounds (${count('audio')})`], ['data', `Data (${count('data')})`]] as [string, string][]).map(([k, l]) => <button key={k} role="tab" aria-selected={filter === k} className={`chip ${filter === k ? 'on' : ''}`} onClick={() => setFilter(k as 'all' | AssetKind)}>{l}</button>)}
        </span>}>
        <div className="row"><input placeholder="Search files" aria-label="Search library" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        {ready && shown.length === 0 && <p className="muted" data-testid="library-empty">{assets.length === 0 ? 'The library is empty. Drop some files above to start.' : 'No files match.'}</p>}
        <div className="agrid" data-testid="library-grid">
          {shown.map((a) => {
            const uses = usedBy(cfg, a);
            return (
              <div key={a.id} className="acard static" data-testid={`asset-${a.name}`}>
                <Thumb a={a} />
                {editing === a.id ? <input autoFocus defaultValue={a.name} aria-label={`Rename ${a.name}`} onBlur={(e) => { void rename(a.id, e.target.value); setEditing(null); }} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setEditing(null); }} />
                  : <span className="aname">{a.name}</span>}
                <span className="ameta">{metaLine(a)}</span>
                {uses.length > 0 && <span className="ause">Used in: {uses.join(', ')}</span>}
                <span className="aactions">
                  {a.kind === 'audio' && <AudioButton id={a.id} />}
                  <button className="iconbtn" aria-label={`Rename ${a.name}`} title="Rename" onClick={() => setEditing(a.id)}><Icon name="edit" size={15} /></button>
                  <button className="iconbtn trash" aria-label={`Delete ${a.name}`} title="Delete" onClick={() => setDel(a.id)}><Icon name="trash" size={15} /></button>
                </span>
              </div>
            );
          })}
        </div>
      </Panel>
      {del && (() => { const a = assets.find((x) => x.id === del); if (!a) return null; const uses = usedBy(cfg, a); return <ConfirmModal title={`Delete ${a.name}?`} body={uses.length ? `It is used in ${uses.join(', ')}.` : 'This file is removed from the library.'} ariaConfirm={`Confirm delete ${a.name}`} onCancel={() => setDel(null)} onConfirm={() => { setDel(null); void remove(a.id); }} />; })()}
    </div>
  );
}

// ---------------------------------------------------------------- visuals & audio: slots that pick from the library
export const SLOTS: { id: string; label: string; hint: string; kinds: AssetKind[]; group: 'Visuals' | 'Audio' }[] = [
  { id: 'logo', label: 'Game logo', hint: 'Shown on the loading screen and the start of the rules. PNG or WebP with transparency works best.', kinds: ['image'], group: 'Visuals' },
  { id: 'background', label: 'Background', hint: 'Behind the reels. An image, or a looping webm/mp4 video.', kinds: ['image', 'video'], group: 'Visuals' },
  { id: 'frame', label: 'Reel frame', hint: 'The border drawn around the reel grid.', kinds: ['image'], group: 'Visuals' },
  { id: 'music', label: 'Background music', hint: 'Loops during the base game.', kinds: ['audio'], group: 'Audio' },
  { id: 'sfxSpin', label: 'Spin sound', hint: 'Plays when the reels start.', kinds: ['audio'], group: 'Audio' },
  { id: 'sfxWin', label: 'Win sound', hint: 'Plays on every win.', kinds: ['audio'], group: 'Audio' },
  { id: 'sfxBigWin', label: 'Big win sound', hint: 'Plays on large wins.', kinds: ['audio'], group: 'Audio' },
  { id: 'sfxBonus', label: 'Bonus trigger sound', hint: 'Plays when free spins start.', kinds: ['audio'], group: 'Audio' },
];

function SlotCard({ cfg, setCfg, slot }: { cfg: GameConfig; setCfg: SetCfg; slot: (typeof SLOTS)[number] }) {
  const { pick, assets } = useAssets(); const ref = cfg.media?.[slot.id]; const meta = ref ? assets.find((a) => a.id === ref.id) : undefined;
  const url = useAssetUrl(meta && (meta.kind === 'image' || meta.kind === 'video') ? meta.id : undefined);
  const choose = async () => { const a = await pick(slot.kinds, `Choose: ${slot.label}`); if (a) setCfg({ ...cfg, media: { ...(cfg.media ?? {}), [slot.id]: { id: a.id, name: a.name, kind: a.kind } } }); };
  const clear = () => { const m = { ...(cfg.media ?? {}) }; delete m[slot.id]; setCfg({ ...cfg, media: Object.keys(m).length ? m : undefined }); };
  return (
    <div className="slot" data-testid={`slot-${slot.id}`}>
      <div className="slotpreview">
        {meta?.kind === 'image' && url && <img src={url} alt="" />}
        {meta?.kind === 'video' && (url ? <video src={url} muted loop autoPlay playsInline /> : meta.thumb ? <img src={meta.thumb} alt="" /> : <Icon name="film" size={26} />)}
        {meta?.kind === 'audio' && <Icon name="music" size={26} />}
        {!meta && <Icon name={slot.kinds[0] === 'audio' ? 'music' : 'image'} size={26} />}
      </div>
      <div className="slotinfo">
        <b>{slot.label}</b>
        <span className="muted small">{slot.hint}</span>
        <span className="slotfile">{meta ? <>{meta.name} <small>{metaLine(meta)}</small></> : ref ? <span className="warnText">{ref.name} was removed from the library</span> : <span className="faint">Nothing chosen</span>}</span>
        <span className="row tight">
          <button className="small" onClick={choose} data-testid={`slot-choose-${slot.id}`}>{meta ? 'Replace' : 'Choose from library'}</button>
          {meta?.kind === 'audio' && <AudioButton id={meta.id} />}
          {ref && <button className="linkbtn" onClick={clear}>Clear</button>}
        </span>
      </div>
    </div>
  );
}

export function MediaStep({ cfg, setCfg }: { cfg: GameConfig; setCfg: SetCfg }) {
  return (
    <div className="stack">
      {(['Visuals', 'Audio'] as const).map((g) => (
        <Panel key={g} title={g === 'Visuals' ? 'Visuals' : 'Audio'} icon={g === 'Visuals' ? 'image' : 'music'} aside={<span className="muted small">Pick files from the asset library</span>}>
          <div className="slots">{SLOTS.filter((s) => s.group === g).map((s) => <SlotCard key={s.id} cfg={cfg} setCfg={setCfg} slot={s} />)}</div>
        </Panel>
      ))}
      <p className="muted small">Choices are saved in the config as file references. The AI-coding instructions use them to wire the right file to each slot when the game is built.</p>
    </div>
  );
}
