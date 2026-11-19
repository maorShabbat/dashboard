import { useEffect, useId, useState } from 'react';
import type { GameConfig } from '../compiler/config';
import { pictureToDataUrl, setLook, symbolKind, symbolLook } from './model';
import type { useLive } from './live';

export type Edit = (f: (c: GameConfig) => void) => void;
export type SetCfg = (c: GameConfig) => void;
const num = (v: string, fallback = 0) => { const n = Number(v); return Number.isFinite(n) ? n : fallback; };

export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return <label className="field"><span className="lab">{label}</span>{children}{hint && <span className="hint">{hint}</span>}</label>;
}

export function Num({ value, onChange, step, min, max, w, label }: { value: number; onChange: (n: number) => void; step?: number; min?: number; max?: number; w?: number; label?: string }) {
  const [text, setText] = useState(String(value));
  useEffect(() => { if (num(text, NaN) !== value) setText(String(value)); }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  return <input className="num" aria-label={label} style={w ? { width: w } : undefined} inputMode="decimal" type="number" step={step} min={min} max={max} value={text}
    onChange={(e) => { setText(e.target.value); if (e.target.value.trim() !== '' && Number.isFinite(Number(e.target.value))) onChange(Number(e.target.value)); }} />;
}


export type LiveState = ReturnType<typeof useLive>['state'];

export function Tile({ cfg, id, size = 44 }: { cfg: GameConfig; id: string; size?: number }) {
  const l = symbolLook(cfg, id);
  const kind = symbolKind(cfg, id);
  const uid = useId().replace(/:/g, '');
  const style = size ? { width: size, height: size } : { width: '100%', aspectRatio: '1' };
  if (l.image) return <span className="tile pic" style={style} aria-hidden><img src={l.image} alt="" /></span>;
  const c = l.color; const label = l.name.slice(0, 2).toUpperCase(); const idx = Math.max(0, cfg.symbols.paying.indexOf(id));
  return (
    <span className={`tile art ${kind}`} style={style} aria-hidden>
      <svg viewBox="0 0 100 100" width="100%" height="100%">
        <defs>
          <linearGradient id={`b${uid}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#16264f" /><stop offset="1" stopColor="#081028" /></linearGradient>
          <linearGradient id={`g${uid}`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={c} stopOpacity=".55" /><stop offset=".45" stopColor={c} /><stop offset="1" stopColor={c} stopOpacity=".7" /></linearGradient>
          <radialGradient id={`h${uid}`} cx=".3" cy=".25" r=".7"><stop offset="0" stopColor="#fff" stopOpacity=".65" /><stop offset="1" stopColor="#fff" stopOpacity="0" /></radialGradient>
          <filter id={`f${uid}`} x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="3.5" /></filter>
        </defs>
        <rect x="1" y="1" width="98" height="98" rx="20" fill={`url(#b${uid})`} stroke={c} strokeOpacity=".55" strokeWidth="2" />
        <circle cx="50" cy="52" r="30" fill={c} opacity=".28" filter={`url(#f${uid})`} />
        {kind === 'high' && <g fill={`url(#g${uid})`} stroke="#fff" strokeOpacity=".55" strokeWidth="1.6">{[
          <path key="d" d="M50 14 L82 40 L50 88 L18 40 Z" />,
          <path key="h" d="M30 18 H70 L88 50 L70 82 H30 L12 50 Z" />,
          <circle key="c" cx="50" cy="52" r="34" />,
          <path key="s" d="M50 12 L60 38 L88 40 L66 58 L74 86 L50 70 L26 86 L34 58 L12 40 L40 38 Z" />,
        ][idx % 4]}<path d="M22 40 H78 M50 16 V84" stroke="#fff" strokeOpacity=".22" fill="none" /><ellipse cx="38" cy="34" rx="14" ry="8" fill="#fff" fillOpacity=".22" stroke="none" /></g>}
        {kind === 'low' && <g><text x="50" y="66" textAnchor="middle" fontSize={label.length > 1 ? 40 : 48} fontWeight="800" fontFamily="Inter, system-ui, sans-serif" fill={`url(#g${uid})`} stroke="#fff" strokeOpacity=".55" strokeWidth="1.6" paintOrder="stroke">{label}</text></g>}
        {kind === 'wild' && <g><path d="M50 12 L84 26 V54 C84 72 68 84 50 90 C32 84 16 72 16 54 V26 Z" fill={`url(#g${uid})`} stroke="#ffe08a" strokeWidth="3" /><text x="50" y="64" textAnchor="middle" fontSize="38" fontWeight="900" fontFamily="Inter, system-ui, sans-serif" fill="#fff" stroke="#00000055" strokeWidth="1">W</text></g>}
        {kind === 'scatter' && <g><path d="M50 10 L58 38 L88 30 L66 52 L90 72 L60 68 L50 92 L40 68 L10 72 L34 52 L12 30 L42 38 Z" fill={`url(#g${uid})`} stroke="#fff" strokeOpacity=".6" strokeWidth="1.5" /><circle cx="50" cy="52" r="9" fill="#fff" opacity=".85" /></g>}
        {kind === 'multiplier' && <g><circle cx="50" cy="52" r="32" fill={`url(#g${uid})`} stroke="#fff" strokeOpacity=".6" strokeWidth="2" /><text x="50" y="65" textAnchor="middle" fontSize="38" fontWeight="900" fontFamily="Inter, system-ui, sans-serif" fill="#fff">x</text></g>}
        <rect x="1" y="1" width="98" height="98" rx="20" fill={`url(#h${uid})`} opacity=".25" />
      </svg>
    </span>
  );
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return <button type="button" role="switch" aria-checked={checked} aria-label={label} className={`switch ${checked ? 'on' : ''}`} onClick={() => onChange(!checked)}><i /></button>;
}

export function BoardPreview({ cfg }: { cfg: GameConfig }) {
  const set = cfg.reels.sets[Object.keys(cfg.reels.sets)[0]] ?? {};
  const pool = Object.entries(set).flatMap(([k, v]) => Array<string>(Math.max(1, Math.round(v / 6))).fill(k));
  const cell = (r: number, c: number) => (pool.length ? pool[(r * 7 + c * 13 + r * c * 3) % pool.length] : cfg.symbols.paying[0]);
  const cols = Math.max(1, Math.min(cfg.board.reels, 12)); const rows = Math.max(1, Math.min(cfg.board.rows, 10));
  const bar = cfg.gadgetBar; const side = bar?.position === 'side';
  return (
    <>
      {bar && !side && <div style={{ maxWidth: 420 }}><GadgetBarView cfg={cfg} position="top" cols={cols} rows={rows} /></div>}
      <div style={{ display: 'flex', gap: 6, alignItems: 'stretch', maxWidth: 420 + (side ? 60 : 0) }}>
        {bar && side && <GadgetBarView cfg={cfg} position="side" cols={cols} rows={rows} />}
        <div className="board" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, flex: 1 }} aria-label={`${cfg.board.reels} by ${cfg.board.rows} board`}>
          {Array.from({ length: rows }).flatMap((_, r) => Array.from({ length: cols }).map((__, c) => <Tile key={`${r}-${c}`} cfg={cfg} id={cell(r, c)} size={0} />))}
        </div>
      </div>
    </>
  );
}


export function LookEditor({ cfg, id, setCfg }: { cfg: GameConfig; id: string; setCfg: SetCfg }) {
  const l = symbolLook(cfg, id);
  const [busy, setBusy] = useState('');
  return (
    <div className="look">
      <Tile cfg={cfg} id={id} size={56} />
      <div className="lookfields">
        <label className="field"><span className="lab">Name</span><input value={cfg.look?.[id]?.name ?? ''} placeholder={id} aria-label={`Name of ${id}`} onChange={(e) => setCfg(setLook(cfg, id, { name: e.target.value }))} /></label>
        <div className="row tight">
          <label className="field"><span className="lab">Colour</span><input type="color" className="color" value={l.color} aria-label={`Colour of ${l.name}`} onChange={(e) => setCfg(setLook(cfg, id, { color: e.target.value }))} /></label>
          <label className="field"><span className="lab">Picture</span>
            <span className="row tight">
              <label className="btn">{l.image ? 'Change' : 'Upload'}<input type="file" accept="image/*" hidden aria-label={`Upload picture for ${l.name}`} onChange={async (e) => {
                const f = e.target.files?.[0]; if (!f) return;
                try { setBusy(''); setCfg(setLook(cfg, id, { image: await pictureToDataUrl(f) })); } catch { setBusy('That file could not be read as a picture.'); }
                e.target.value = '';
              }} /></label>
              {l.image && <button onClick={() => setCfg(setLook(cfg, id, { image: null }))}>Remove</button>}
            </span>
          </label>
        </div>
        {busy && <p className="fix">{busy}</p>}
      </div>
    </div>
  );
}

export function ShareBar({ live, id, rtp }: { live: ReturnType<typeof useLive>['state']; id: string; rtp: number }) {
  const b = live.summary?.bySymbol?.[id];
  if (!b) return <div className="share"><span className="muted small">Calculating...</span></div>;
  const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
  return (
    <div className="share" data-testid={`share-${id}`}>
      <div className="sharetxt"><span>Returns <b>{pct(b.rtpShare)}</b> of the RTP</span><span>{b.hitRate > 0 ? `wins 1 in ${Math.round(1 / b.hitRate)} spins` : 'never wins'}</span></div>
      <span className="sharebar"><i style={{ width: `${Math.min(100, (b.rtpShare / Math.max(0.01, rtp)) * 100 * 4)}%` }} /></span>
    </div>
  );
}


const ICONS: Record<string, string> = {
  home: 'M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10',
  grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  board: 'M3 5h18v14H3zM9 5v14M15 5v14M3 12h18',
  symbols: 'M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.5 6.6 19.5l1.2-6L3.3 9.3l6.1-.7z',
  bolt: 'M13 2L4 14h7l-1 8 9-12h-7z',
  percent: 'M19 5L5 19M7.5 8a1.5 1.5 0 100-3 1.5 1.5 0 000 3zM16.5 19a1.5 1.5 0 100-3 1.5 1.5 0 000 3z',
  chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  export: 'M12 3v12M7 8l5-5 5 5M5 14v6h14v-6',
  undo: 'M9 14L4 9l5-5M4 9h10a6 6 0 010 12h-3',
  redo: 'M15 14l5-5-5-5M20 9H10a6 6 0 000 12h3',
  play: 'M7 4l13 8-13 8z',
  spin: 'M20 12a8 8 0 11-3-6.2M20 4v5h-5',
  check: 'M5 12l4.5 4.5L19 7',
  plus: 'M12 5v14M5 12h14',
  search: 'M11 4a7 7 0 100 14 7 7 0 000-14zM21 21l-4.5-4.5',
  crown: 'M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5z',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  edit: 'M4 20h4L19 9l-4-4L4 16zM14 6l4 4',
  folder: 'M3 6h6l2 2h10v11H3z',
  upload: 'M12 16V4M7 9l5-5 5 5M4 20h16',
  music: 'M9 18V5l11-2v13M9 18a3 3 0 11-6 0 3 3 0 016 0zM20 16a3 3 0 11-6 0 3 3 0 016 0z',
  film: 'M3 5h18v14H3zM7 5v14M17 5v14M3 9h4M3 15h4M17 9h4M17 15h4',
  file: 'M6 3h9l4 4v14H6zM15 3v4h4',
  image: 'M3 5h18v14H3zM3 16l5-5 4 4 3-3 6 6',
  close: 'M6 6l12 12M18 6L6 18',
  desktop: 'M3 5h18v11H3zM8 20h8M12 16v4',
  phone: 'M8 3h8v18H8zM11 18h2',
};
export function Icon({ name, size = 18 }: { name: keyof typeof ICONS | string; size?: number }) {
  return <svg className="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={ICONS[name] ?? ''} /></svg>;
}
export function Panel({ title, icon, aside, children, className = '' }: { title: string; icon?: string; aside?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`panel ${className}`}>
      <header className="panelhead"><h3>{icon && <Icon name={icon} size={17} />}{title}</h3>{aside && <span className="panelaside">{aside}</span>}</header>
      {children}
    </section>
  );
}

export function ProjectHeader({ cfg, setCfg, device, setDevice }: { cfg: GameConfig; setCfg: SetCfg; device: 'desktop' | 'mobile'; setDevice: (d: 'desktop' | 'mobile') => void }) {
  const [editing, setEditing] = useState(false);
  const bonus = cfg.modes.some((m) => m.isBuyBonus);
  const tags = [`${cfg.board.reels}x${cfg.board.rows}`, 'Pay anywhere', 'Tumble', ...(bonus ? ['Bonus Buy'] : []), 'Free spins'];
  const set = (patch: Partial<GameConfig>) => setCfg({ ...cfg, ...patch });
  return (
    <header className="projhead">
      <div className="thumbs big">{cfg.symbols.paying.slice(0, 4).map((p) => <Tile key={p} cfg={cfg} id={p} size={0} />)}</div>
      <div className="projinfo">
        <div className="projtitle">
          {editing ? <input autoFocus value={cfg.name} aria-label="Game name" onChange={(e) => set({ name: e.target.value })} onBlur={() => setEditing(false)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === 'Escape') setEditing(false); }} />
            : <h2 data-testid="proj-name">{cfg.name || 'Untitled game'}</h2>}
          <button className="iconbtn" aria-label="Edit game name" title="Edit game name" onClick={() => setEditing(true)}><Icon name="edit" size={16} /></button>
        </div>
        <input className="projdesc" value={cfg.description ?? ''} placeholder="Add a one-line description of your game" aria-label="Game description" onChange={(e) => set({ description: e.target.value || undefined })} />
        <div className="tagrow">{tags.map((t) => <span key={t} className="tagchip">{t}</span>)}</div>
      </div>
      <div className="devicetoggle" role="group" aria-label="Preview device">
        <button className={device === 'desktop' ? 'on' : ''} onClick={() => setDevice('desktop')} aria-pressed={device === 'desktop'} data-testid="device-desktop"><Icon name="desktop" size={16} />Desktop</button>
        <button className={device === 'mobile' ? 'on' : ''} onClick={() => setDevice('mobile')} aria-pressed={device === 'mobile'} data-testid="device-mobile"><Icon name="phone" size={16} />Mobile</button>
      </div>
    </header>
  );
}

const TOOL_SHORT: Record<string, string> = { wilds: 'Wilds', wildReel: 'Wild reel', multiplier: 'Mult', remove: 'Clean' };
/** The gadget bar as part of the layout: a cell for each reel above the board, or for each row beside it. */
export function GadgetBarView({ cfg, position, cols, rows }: { cfg: GameConfig; position: 'top' | 'side'; cols: number; rows: number }) {
  const slots = cfg.gadgetBar?.slots ?? [];
  const top = position === 'top';
  return (
    <ol className={`gbarview ${position}`} data-testid="preview-gadget-bar" aria-label="Gadget bar"
      style={{ display: 'grid', gap: 4, margin: 0, padding: top ? '0 8px' : '8px 0', listStyle: 'none', ...(top ? { gridTemplateColumns: `repeat(${cols}, 1fr)` } : { gridTemplateRows: `repeat(${rows}, 1fr)`, width: 54 }) }}>
      {slots.slice(0, top ? cols : rows).map((sl, i) => (
        <li key={i} title={`${sl.name || TOOL_SHORT[sl.tool]}: opens at ${sl.need}`} style={{ display: 'flex', flexDirection: top ? 'column' : 'row', alignItems: 'center', justifyContent: 'center', gap: 2, padding: '3px 2px', borderRadius: 8, border: '1px solid rgba(110,160,255,.45)', background: 'rgba(8,18,42,.8)', fontSize: 9.5, lineHeight: 1.1, textAlign: 'center', minWidth: 0, overflow: 'hidden' }}>
          {sl.charge.kind === 'land' && sl.charge.symbols[0] ? <span style={{ width: 16, height: 16, display: 'inline-block' }}><Tile cfg={cfg} id={sl.charge.symbols[0]} size={0} /></span> : <b style={{ fontSize: 11 }}>★</b>}
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>{sl.name?.trim() || TOOL_SHORT[sl.tool]}</span>
          <small style={{ opacity: .7 }}>0/{sl.need}</small>
        </li>
      ))}
    </ol>
  );
}
