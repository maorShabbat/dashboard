import { ConfirmModal, Drawer, Hint } from './shell';
import { useMemo, useState } from 'react';
import type { GameConfig } from '../compiler/config';
import { FEELS, addPaying, applyFeel, clone, frequency, nextSymbolId, pictureToDataUrl, rangeLabel, removePaying, setFrequency, setLook, symbolKind, symbolLook } from './model';
import { buildModel } from './sim';
import { useAssets } from './library';
import { Icon, Num, Panel, ShareBar, Tile, type LiveState, type SetCfg } from './ui';

type Filter = 'all' | 'high' | 'low' | 'special';
const KIND: Record<string, string> = { high: 'High pay', low: 'Low pay', wild: 'Wild', scatter: 'Scatter', multiplier: 'Multiplier' };
const kindOf = (cfg: GameConfig, id: string) => symbolKind(cfg, id);
const TYPICAL: Record<string, [number, number]> = { high: [4, 12], low: [10, 20], wild: [1, 4], scatter: [0.5, 2.5] };
const fill = (v: number, min: number, max: number) => ({ '--p': `${((v - min) / (max - min)) * 100}%` }) as React.CSSProperties;

export function SymbolsStep({ cfg, setCfg, live, view = 'table' }: { cfg: GameConfig; setCfg: SetCfg; live: LiveState; suggest: () => void; view?: 'table' | 'strips' }) {
  const [filter, setFilter] = useState<Filter>('all');
  const { pick, blob } = useAssets();
  const [picErr, setPicErr] = useState('');
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const [styleOpen, setStyleOpen] = useState<string | null>(null);
  const ids = [...cfg.symbols.paying, cfg.symbols.wild, cfg.symbols.scatter, cfg.symbols.multiplier];
  const [selRaw, setSel] = useState(cfg.symbols.paying[0]);
  const sel = ids.includes(selRaw) ? selRaw : ids[0];
  const shown = ids.filter((id) => filter === 'all' || (filter === 'special' ? ['wild', 'scatter', 'multiplier'].includes(kindOf(cfg, id)) : kindOf(cfg, id) === filter));
  const kind = kindOf(cfg, sel);
  const paying = cfg.symbols.paying.includes(sel);
  const look = symbolLook(cfg, sel);
  const total = Object.values(cfg.reels.sets[Object.keys(cfg.reels.sets)[0]] ?? {}).reduce((x, y) => x + y, 0) || 1;
  const pct = (id: string) => `${((frequency(cfg, id) / total) * 100).toFixed(1)}%`;
  const pays = cfg.paytable.pays;

  return (
    <div className="stack">
      {view === 'table' && <>
      <Panel title="Symbols" icon="symbols" aside={
        <span className="chips" role="tablist" aria-label="Symbol filter">
          {(['all', 'high', 'low', 'special'] as Filter[]).map((f) => <button key={f} role="tab" aria-selected={filter === f} className={`chip ${filter === f ? 'on' : ''}`} onClick={() => setFilter(f)}>{f[0].toUpperCase() + f.slice(1)}</button>)}
          <button className="chip add" onClick={() => { const n = nextSymbolId(cfg, 'H'); setCfg(addPaying(cfg, n)); setSel(n); }}><Icon name="plus" size={14} />Add symbol</button>
        </span>}>
        <div className="symtable" data-testid="paytable" role="table" aria-label="Symbols and paytable">
          <div className="symhead" role="row"><span /><span>Name</span><span>Weight<Hint title="Weight">How often the symbol lands: its share of all symbols on each reel strip. 13.7% means about 1 in 7 positions shows it. More weight gives more, smaller wins. Typical: high pay 4-12%, low pay 10-20%, wild 1-4%, scatter 0.5-2.5%.</Hint></span><span /><span /></div>
          {shown.map((id) => {
            const k = kindOf(cfg, id); const lk = symbolLook(cfg, id); const isPay = cfg.symbols.paying.includes(id);
            const b = live.summary?.bySymbol?.[id];
            return (
              <div key={id} role="row" className={`symrow ${id === sel ? 'sel' : ''}`} data-testid={`sym-${id}`} onClick={() => setSel(id)} onFocus={() => setSel(id)}>
                <div className="symline1">
                  <Tile cfg={cfg} id={id} size={48} />
                  <input value={cfg.look?.[id]?.name ?? ''} placeholder={id} aria-label={`Name of ${id}`} onChange={(e) => setCfg(setLook(cfg, id, { name: e.target.value }))} />
                  {k !== 'multiplier' ? (() => {
                    const share = (frequency(cfg, id) / total) * 100; const t = TYPICAL[k]; const off = t && (share < t[0] || share > t[1]);
                    return (
                      <span className="wcell">
                        <span className="vbox"><input type="range" style={fill(frequency(cfg, id), isPay || k === 'scatter' ? 1 : 0, 80)} min={isPay || k === 'scatter' ? 1 : 0} max={80} step={1} value={frequency(cfg, id)} aria-label={`How often ${lk.name} appears`} onChange={(e) => setCfg(setFrequency(cfg, id, Number(e.target.value)))} /><output>{share.toFixed(1)}%</output></span>
                        <small className={`wcap ${off ? 'off' : ''}`}>about 1 in {Math.max(1, Math.round(100 / Math.max(0.1, share)))}{off && t ? ` · usual ${t[0]}-${t[1]}%` : ''}</small>
                      </span>
                    );
                  })() : <span className="muted small">Free spins only</span>}
                  <button className="small" data-testid={`style-${id}`} aria-label={`Style ${lk.name}`} onClick={(e) => { e.stopPropagation(); setSel(id); setStyleOpen(id); }}>Style</button>
                  {isPay ? <button className="iconbtn trash" aria-label={`Remove ${lk.name}`} title="Delete symbol" disabled={cfg.symbols.paying.length <= 2} onClick={(e) => { e.stopPropagation(); setConfirmDel(id); }}><Icon name="trash" size={17} /></button> : <span />}
                </div>
                {isPay ? (
                  <div className="symline2" data-testid={`pays-${id}`}>
                    {(pays[id] ?? []).map((v, i) => (
                      <label key={i} className="paycell"><small>{rangeLabel(cfg, i)}</small><Num w={86} min={0.1} step={0.1} value={v} onChange={(n) => { const c = clone(cfg); c.paytable.pays[id][i] = n; setCfg(c); }} /></label>
                    ))}
                    <span className={`shareline ${live.stale ? 'stale' : ''}`} data-testid={`share-${id}`}>
                      <span className="cell"><span className="sharebar w"><i style={{ width: `${Math.min(100, ((b?.rtpShare ?? 0) / Math.max(0.01, cfg.modes[0].rtp)) * 100 * 2.5)}%` }} /></span><b className="mono">{b ? `${(b.rtpShare * 100).toFixed(1)}%` : '...'}</b></span>
                      <small title={b && b.hitRate > 0 ? `Wins 1 in ${Math.round(1 / b.hitRate)} spins` : ''}>of RTP</small>
                    </span>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
        <p className="muted small">Pays are multiples of the bet for each group size matching symbols. Under 1x pays less than the bet.</p>
      </Panel>

      </>}
      {view === 'strips' && <ReelStrips cfg={cfg} setCfg={setCfg} sel={sel} />}
      {styleOpen && ids.includes(styleOpen) && (() => { const id = styleOpen; const lk = symbolLook(cfg, id); return (
        <Drawer title={`Style: ${lk.name}`} onClose={() => setStyleOpen(null)} testid="symbol-drawer">
          <div className="row"><Tile cfg={cfg} id={id} size={96} /><span className="muted small">{KIND[kindOf(cfg, id)]} symbol. A picture replaces the generated art everywhere.</span></div>
          <label className="field"><span className="lab">Colour</span><input type="color" className="color" value={lk.color} aria-label={`Colour of ${lk.name}`} onChange={(e) => setCfg(setLook(cfg, id, { color: e.target.value }))} /></label>
          <div className="field"><span className="lab">Picture</span>
            <span className="row tight">
              <button aria-label={`Choose picture for ${lk.name}`} data-testid={`choose-pic-${id}`} onClick={async () => {
                const a = await pick(['image'], `Choose a picture for ${lk.name}`); if (!a) return;
                try { setPicErr(''); const b = await blob(a.id); if (!b) throw new Error('missing'); setCfg(setLook(setLook(cfg, id, { image: await pictureToDataUrl(b) }), id, { asset: a.name })); } catch { setPicErr('That file could not be read as a picture.'); }
              }}>{lk.image ? 'Change picture' : 'Choose from library'}</button>
              {lk.image && <button onClick={() => setCfg(setLook(cfg, id, { image: null }))}>Remove picture</button>}
            </span>
            {picErr && <p className="fix">{picErr}</p>}
          </div>
        </Drawer>); })()}
      {confirmDel && <ConfirmModal title={`Delete ${symbolLook(cfg, confirmDel).name}?`} body="It is removed from the reels and the paytable." ariaConfirm={`Confirm delete ${symbolLook(cfg, confirmDel).name}`} onCancel={() => setConfirmDel(null)} onConfirm={() => { const id = confirmDel; setConfirmDel(null); setCfg(removePaying(cfg, id)); }} />}
    </div>
  );
}

function ReelStrips({ cfg, setCfg, sel }: { cfg: GameConfig; setCfg: SetCfg; sel: string }) {
  const [which, setWhich] = useState<'base' | 'free'>('base');
  const key = JSON.stringify([cfg.board.reels, cfg.reels]);
  const model = useMemo(() => buildModel(cfg), [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const strips = which === 'base' ? model.base : model.free;
  const rows = cfg.board.rows; const name = symbolLook(cfg, sel).name;
  return (
    <Panel title="Reel strips" icon="board" aside={
      <span className="chips"><button className={`chip ${which === 'base' ? 'on' : ''}`} onClick={() => setWhich('base')}>Main game</button><button className={`chip ${which === 'free' ? 'on' : ''}`} onClick={() => setWhich('free')}>Free spins</button></span>}>
      <div className="explainstrips" data-testid="strips-guide">
        <div><span>1</span><p><b>A reel strip is the list of symbols on one reel.</b> Each reel has its own strip, a long loop of symbols in a fixed order.</p></div>
        <div><span>2</span><p><b>A spin picks a random stop on every strip</b> and shows the next {rows} symbols from there: that is your {cfg.board.reels}x{rows} grid. The highlighted block at the top of each strip below is one example window.</p></div>
        <div><span>3</span><p><b>Weights decide how many of each symbol are on the strip.</b> Selected: {name} (blue outline), {strips[0] ? strips[0].filter((x) => x === sel).length : 0} positions on reel 1.</p></div>
      </div>
      <div className="strips">
        {strips.map((col, r) => (
          <div className="strip" key={r}>
            <header>Reel {r + 1}</header>
            <div className="stripcells" tabIndex={0} aria-label={`Reel ${r + 1} strip, scroll to see all ${col.length} positions`}>{col.map((s, i) => <span key={i} className={`mini-cell ${s === sel ? 'hit' : ''} ${i < rows ? 'win' : ''} ${i === 0 ? 'wtop' : ''} ${i === rows - 1 ? 'wbot' : ''}`}><Tile cfg={cfg} id={s} size={28} /></span>)}</div>
            <footer>{col.length} positions<small>{col.filter((s) => s === sel).length} x {name}</small></footer>
          </div>
        ))}
      </div>
      <p className="muted small">Scroll inside a strip to see every position. The strip loops: after the last position it continues from the top.</p>
      <div className="stripset">
        <div className="field"><span className="lab">Strip length</span>
          <span className="row tight"><Num w={90} min={50} step={10} value={cfg.reels.rows} onChange={(n) => { const c = clone(cfg); c.reels.rows = n; setCfg(c); }} /><span className="muted small">positions per reel</span></span>
          <span className="hint">Longer strips make the odds smoother and closer to the weights. 250 is a good default, minimum 50.</span></div>
        <div className="field"><span className="lab">Layout</span>
          <span className="row tight"><button onClick={() => { const c = clone(cfg); c.reels.seed += 1; setCfg(c); }} data-testid="shuffle">Re-shuffle layout</button><span className="muted small">Layout number</span><Num w={80} value={cfg.reels.seed} step={1} onChange={(n) => { const c = clone(cfg); c.reels.seed = n; setCfg(c); }} /></span>
          <span className="hint">The weights fix how many of each symbol there are; the layout number only decides their order on the strip. The same number always gives the same order. Try a few: the order changes how often symbols land next to each other, which moves the RTP a little.</span></div>
      </div>
    </Panel>
  );
}
