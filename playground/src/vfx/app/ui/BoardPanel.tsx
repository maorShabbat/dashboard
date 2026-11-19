import { useRef, useState } from 'react';
import { BOARD_PARAMS, boardDefaults } from '../../model/board';
import { sceneAllAssets, type BoardElement, type BoardSymbol, type SymbolRole } from '../../model/scene';
import { BUILTIN_BACKGROUNDS, BUILTIN_EXPANSIONS, BUILTIN_ICONS } from '../builtins';
import { useAssetUrl } from './assetUrl';
import { useServices, useStore } from './services';
import { Btn, ParamForm, Section, Select, Slider } from './widgets';

const ROLES: { value: SymbolRole; label: string }[] = [
  { value: 'normal', label: 'Ordinary symbol' }, { value: 'wild', label: 'Wild' }, { value: 'scatter', label: 'Scatter' }, { value: 'bonus', label: 'Bonus tile' },
];
const MAX_SYMBOLS = 12;
const TILES = BUILTIN_BACKGROUNDS.filter((b) => b.id.startsWith('builtin:tile-'));
const PANELS = BUILTIN_BACKGROUNDS.filter((b) => !b.id.startsWith('builtin:tile-'));

function Thumb({ asset }: { asset: string }) {
  const a = useAssetUrl(asset);
  if (!a.url) return <div className="hint" style={{ width: 44, height: 44, display: 'grid', placeItems: 'center' }}>{a.error ? '!' : '…'}</div>;
  return a.video ? <video src={a.url} autoPlay loop muted playsInline style={{ width: 44, height: 44, objectFit: 'contain' }} /> : <img src={a.url} alt="" style={{ width: 44, height: 44, objectFit: 'contain' }} />;
}

const FITS = [{ value: 'grow', label: 'Grows with the wild, from one cell to the whole reel' }, { value: 'fill', label: 'Covers the whole reel from its first frame' }];
const PLAYS = [{ value: 'natural', label: 'Plays at its own speed' }, { value: 'fit', label: 'Fitted to the expansion time' }];

/** What plays while a wild expands over its reel: your own transparent WebM (or a still), or one of the built-in animations. */
function ExpandRow({ el, i, sym }: { el: BoardElement; i: number; sym: BoardSymbol }) {
  const store = useStore();
  const { images } = useServices();
  const file = useRef<HTMLInputElement>(null);
  const [err, setErr] = useState<string | null>(null);
  const anim = sym.expand;
  const edit = (mut: (b: BoardElement) => void, label: string) => store.edit((s) => { const t = s.elements.find((x) => x.id === el.id); if (t && t.kind === 'board') mut(t); }, `${el.id}:sym${i}${label}`);
  /** Use `ref` for this wild's expansion; an animation of its own sets how long the expansion takes. */
  const use = async (ref: { id: string; kind: 'png' | 'webm' | 'image' | 'audio'; name: string; bytes: number; sha256: string; type: string } | null, id: string) => {
    setErr(null);
    try {
      const li = await images.get(id);
      store.edit((s) => {
        if (ref && !s.assets.some((a) => a.id === ref.id)) s.assets.push(ref as never);
        const t = s.elements.find((x) => x.id === el.id);
        if (t && t.kind === 'board' && t.symbols[i]) {
          const prev = t.symbols[i]!.expand;
          t.symbols[i]!.expand = { asset: id, fit: prev?.fit ?? 'grow', play: prev?.play ?? 'natural' };
          if (li.duration > 0 && t.symbols[i]!.expand!.play === 'natural') t.params.expandTime = Math.min(4, Math.max(0.2, Math.ceil(li.duration * 100) / 100));
        }
        const used = new Set(sceneAllAssets(s));
        s.assets = s.assets.filter((a) => used.has(a.id));
      });
    } catch (e) { setErr((e as Error).message); }
  };
  const take = async (f: File | undefined) => {
    if (!f) return;
    try { const ref = await images.add(f, f.name); await use(ref, ref.id); } catch (e) { setErr((e as Error).message); }
  };
  const builtin = anim && BUILTIN_EXPANSIONS.some((b) => b.id === anim.asset) ? anim.asset : '';
  return (
    <div className="row" data-testid={`symbol-expand-${el.id}-${i}`} style={{ alignItems: 'center', gap: 8, marginLeft: 52, flexWrap: 'wrap' }}>
      <div className="hint" style={{ color: 'var(--muted)', flexBasis: '100%' }}>While this wild expands over its reel, play an animation (a transparent WebM, or one of the built-in ones) instead of stretching its picture.</div>
      {anim && <Thumb asset={anim.asset} />}
      <div style={{ flex: 1, minWidth: 140 }}>
        <Select value={builtin} testId={`symbol-expand-asset-${el.id}-${i}`}
          options={[{ value: '', label: !anim ? 'None: stretch the wild’s picture' : builtin ? 'None' : 'Your upload' }, ...BUILTIN_EXPANSIONS.map((b) => ({ value: b.id, label: b.name }))]}
          onChange={(v) => { if (v) void use(null, v); else if (anim && builtin) edit((b) => { delete b.symbols[i]!.expand; }, 'noexp'); }} />
      </div>
      <input ref={file} type="file" hidden accept="video/webm,image/png,image/webp,image/gif,.webm,.png,.webp,.gif" data-testid={`symbol-expand-file-${el.id}-${i}`} onChange={(e) => { void take(e.target.files?.[0]); e.target.value = ''; }} />
      <Btn small onClick={() => file.current?.click()} title="Use your own transparent WebM (or a picture) while this wild expands" testId={`symbol-expand-upload-${el.id}-${i}`}>Upload WebM…</Btn>
      {anim && <Btn small ghost danger title="Go back to stretching the wild’s picture" testId={`symbol-expand-clear-${el.id}-${i}`} onClick={() => edit((b) => { delete b.symbols[i]!.expand; }, 'noexp')}>✕</Btn>}
      {anim && <div style={{ flex: 1, minWidth: 180 }}><Select value={anim.fit} options={FITS} testId={`symbol-expand-fit-${el.id}-${i}`} onChange={(v) => edit((b) => { const x = b.symbols[i]!.expand; if (x) x.fit = v === 'fill' ? 'fill' : 'grow'; }, 'fit')} /></div>}
      {anim && <div style={{ flex: 1, minWidth: 180 }}><Select value={anim.play} options={PLAYS} testId={`symbol-expand-play-${el.id}-${i}`} onChange={(v) => edit((b) => { const x = b.symbols[i]!.expand; if (x) x.play = v === 'fit' ? 'fit' : 'natural'; }, 'play')} /></div>}
      {err && <div className="note err" role="alert" style={{ flexBasis: '100%' }}>{err}</div>}
    </div>
  );
}

/** One symbol on the board: its picture (built-in or your own), its role, and removal. */
function SymbolRow({ el, i, sym, can }: { el: BoardElement; i: number; sym: BoardSymbol; can: { remove: boolean } }) {
  const store = useStore();
  const { images } = useServices();
  const file = useRef<HTMLInputElement>(null);
  const [err, setErr] = useState<string | null>(null);
  const edit = (mut: (b: BoardElement) => void, label?: string) => store.edit((s) => { const t = s.elements.find((x) => x.id === el.id); if (t && t.kind === 'board') mut(t); }, `${el.id}:sym${i}${label ?? ''}`);
  const take = async (f: File | undefined) => {
    if (!f) return;
    setErr(null);
    try {
      const ref = await images.add(f, f.name);
      store.edit((s) => {
        if (!s.assets.some((a) => a.id === ref.id)) s.assets.push(ref);
        const t = s.elements.find((x) => x.id === el.id);
        if (t && t.kind === 'board' && t.symbols[i]) { t.symbols[i]!.asset = ref.id; t.symbols[i]!.name = f.name.replace(/\.[^.]+$/, '').slice(0, 24); }
        const used = new Set(sceneAllAssets(s));
        s.assets = s.assets.filter((a) => used.has(a.id));
      });
    } catch (e) { setErr((e as Error).message); }
  };
  const known = BUILTIN_ICONS.some((b) => b.id === sym.asset);
  return (
    <div style={{ display: 'grid', gap: 6 }}>
    <div className="row" data-testid={`symbol-row-${el.id}-${i}`} style={{ alignItems: 'center', gap: 8 }}>
      <Thumb asset={sym.asset} />
      <div style={{ flex: 1, minWidth: 110 }}>
        <Select value={known ? sym.asset : ''} testId={`symbol-asset-${el.id}-${i}`}
          options={[{ value: '', label: sym.asset.startsWith('builtin:') ? '—' : `Your upload: ${sym.name}` }, ...BUILTIN_ICONS.map((b) => ({ value: b.id, label: b.name }))]}
          onChange={(v) => { if (v) edit((b) => { b.symbols[i]!.asset = v; b.symbols[i]!.name = BUILTIN_ICONS.find((x) => x.id === v)?.name ?? v; }, 'asset'); }} />
      </div>
      <div style={{ flex: 1, minWidth: 110 }}>
        <Select value={sym.role} options={ROLES} testId={`symbol-role-${el.id}-${i}`} onChange={(v) => edit((b) => { b.symbols[i]!.role = v; }, 'role')} />
      </div>
      <input ref={file} type="file" hidden accept="image/png,image/webp,image/gif,image/jpeg,video/webm,.png,.webp,.gif,.webm" data-testid={`symbol-file-${el.id}-${i}`} onChange={(e) => { void take(e.target.files?.[0]); e.target.value = ''; }} />
      <Btn small onClick={() => file.current?.click()} title="Use your own PNG or transparent WebM" testId={`symbol-upload-${el.id}-${i}`}>Upload…</Btn>
      <Btn small ghost danger disabled={!can.remove} title="Remove this symbol" testId={`symbol-remove-${el.id}-${i}`} onClick={() => edit((b) => { b.symbols.splice(i, 1); }, 'rm')}>✕</Btn>
      {err && <div className="note err" role="alert" style={{ flexBasis: '100%' }}>{err}</div>}
    </div>
    {sym.role === 'wild' && <ExpandRow el={el} i={i} sym={sym} />}
    </div>
  );
}

/** The editor for a reel board: its size, symbols, tile and panel pictures, and how it behaves. */
export function BoardEditor({ el }: { el: BoardElement }) {
  const store = useStore();
  const edit = (mut: (b: BoardElement) => void, label?: string) => store.edit((s) => { const t = s.elements.find((x) => x.id === el.id); if (t && t.kind === 'board') mut(t); }, `${el.id}:${label ?? 'b'}`);
  const values = { ...boardDefaults(), ...el.params };
  const groups = [...new Set(BOARD_PARAMS.map((d) => d.group ?? 'Board'))];
  const normal = el.symbols.filter((s) => s.role === 'normal').length;
  return (
    <div data-testid={`board-${el.id}`} style={{ display: 'grid', gap: 10 }}>
      <Section title="Grid" open hint={`${el.cols} × ${el.rows}`} testId={`board-grid-${el.id}`}>
        <div className="row"><div style={{ flex: 1 }}><Slider label="Reels (columns)" value={el.cols} min={3} max={8} step={1} onChange={(v) => edit((b) => { b.cols = Math.round(v); }, 'cols')} testId={`board-cols-${el.id}`} /></div>
          <div style={{ flex: 1 }}><Slider label="Rows" value={el.rows} min={2} max={6} step={1} onChange={(v) => edit((b) => { b.rows = Math.round(v); }, 'rows')} testId={`board-rows-${el.id}`} /></div></div>
        <div className="row"><div style={{ flex: 1 }}><Slider label="Cell size" value={el.cell} min={0.08} max={0.32} step={0.005} onChange={(v) => edit((b) => { b.cell = v; }, 'cell')} testId={`board-cell-${el.id}`} hint="As a fraction of the stage height." /></div>
          <div style={{ flex: 1 }}><Slider label="Gap" value={el.gap} min={0} max={0.4} step={0.005} onChange={(v) => edit((b) => { b.gap = v; }, 'gap')} hint="Between cells, as a fraction of a cell." /></div></div>
        <div className="row">
          <Select label="Picture behind every cell" value={el.frame ?? ''} testId={`board-frame-${el.id}`} options={[{ value: '', label: 'None' }, ...TILES.map((b) => ({ value: b.id, label: b.name })), ...(el.frame && !el.frame.startsWith('builtin:') ? [{ value: el.frame, label: 'Your upload' }] : [])]} onChange={(v) => edit((b) => { b.frame = v || null; }, 'frame')} />
          <Select label="Picture behind the whole board" value={el.panel ?? ''} testId={`board-panel-${el.id}`} options={[{ value: '', label: 'None' }, ...PANELS.map((b) => ({ value: b.id, label: b.name })), ...(el.panel && !el.panel.startsWith('builtin:') ? [{ value: el.panel, label: 'Your upload' }] : [])]} onChange={(v) => edit((b) => { b.panel = v || null; }, 'panel')} />
        </div>
      </Section>
      <Section title="Symbols on the reels" open hint={`${el.symbols.length}`} testId={`board-symbols-${el.id}`}>
        <div className="hint" style={{ color: 'var(--muted)' }}>The first ordinary symbol is the one that wins in the line wins. Wild, scatter and bonus symbols are used by the special results (an expanding wild, scatters that trigger a feature, bonus tiles).</div>
        {el.symbols.map((sym, i) => <SymbolRow key={i} el={el} i={i} sym={sym} can={{ remove: el.symbols.length > 2 && (sym.role !== 'normal' || normal > 2) }} />)}
        <Btn small disabled={el.symbols.length >= MAX_SYMBOLS} testId={`symbol-add-${el.id}`} onClick={() => edit((b) => { const used = new Set(b.symbols.map((s) => s.asset)); const next = BUILTIN_ICONS.find((x) => !used.has(x.id)) ?? BUILTIN_ICONS[0]!; b.symbols.push({ asset: next.id, name: next.name, role: 'normal' }); }, 'add')}>+ Symbol</Btn>
        {normal < 2 && <div className="note warn">Keep at least two ordinary symbols so the reels have something to land on.</div>}
      </Section>
      {groups.map((g) => (
        <Section key={g} title={g === 'Spin' ? 'How the reels spin' : g === 'Result' ? 'What lands' : g === 'Win' ? 'How a win looks' : g} open={g === 'Spin'} testId={`board-params-${g.toLowerCase()}-${el.id}`}>
          <ParamForm defs={BOARD_PARAMS.filter((d) => (d.group ?? 'Board') === g)} values={values} onChange={(k, v) => edit((b) => { b.params[k] = v; }, `p${k}`)} testPrefix={`board-${el.id}`} />
        </Section>
      ))}
    </div>
  );
}
