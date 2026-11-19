// "Game mechanics": the things that shape every spin of the game, chosen on the Game page like the tumbles: tumbling reels and the top gadget bar.
import type { GameConfig } from '../compiler/config';
import { hasTumbles, type GadgetSlot } from '../compiler/features';
import { patchGadgetBar, setGadgetBar, setGadgetPosition, setTumble, symbolLook } from './model';
import { Num, Panel, Switch, Tile, type SetCfg } from './ui';

export function MechanicsPanel({ cfg, setCfg }: { cfg: GameConfig; setCfg: SetCfg }) {
  const tumbling = hasTumbles(cfg.gameType, cfg.tumble);
  const bar = cfg.gadgetBar;
  return (
    <Panel title="Game mechanics" icon="bolt" aside={<span className="muted small">{[tumbling ? 'Tumbles' : null, bar ? (bar.position === 'side' ? 'Side gadget bar' : 'Top gadget bar') : null].filter(Boolean).join(' · ') || 'None'}</span>}>
      <div className="mechrow" style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '6px 0' }}>
        <Switch checked={tumbling} onChange={(on) => setCfg(setTumble(cfg, on))} label="Tumbles" />
        <span style={{ flex: 1 }}><b>Tumbles</b> <span className="muted small">{tumbling ? 'Yes: winning symbols disappear and new ones drop in until nothing wins. In free spins every tumble raises the multiplier.' : 'No: symbols stay where they land, one evaluation per spin.'}</span></span>
        <span className="badge on" data-testid="tumble-state">{tumbling ? 'Yes' : 'No'}</span>
      </div>
      {cfg.gameType === 'ways' && cfg.reelHeights && !tumbling && <p className="muted small">Tumbles cannot be combined with reels that change height yet.</p>}
      <div className="mechrow" style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '6px 0' }}>
        <Switch checked={!!bar} onChange={(on) => setCfg(setGadgetBar(cfg, on))} label="Gadget bar" />
        <span style={{ flex: 1 }}><b>Gadget bar</b> <span className="muted small">{bar ? 'Yes: a row of cells that is always part of the board. It charges as you play and opens gadgets.' : 'No: the board has no gadget bar.'}</span></span>
        <span className="badge on" data-testid="gadget-bar-state">{bar ? 'Yes' : 'No'}</span>
      </div>
      {bar && (
        <div className="field" style={{ marginTop: 6 }}>
          <span className="lab">Where the bar sits</span>
          <span className="chips" role="group" aria-label="Gadget bar position">
            <button className={`chip ${bar.position !== 'side' ? 'on' : ''}`} data-testid="gadget-pos-top" onClick={() => setCfg(setGadgetPosition(cfg, 'top'))}>Top: a cell for each reel ({cfg.board.reels})</button>
            <button className={`chip ${bar.position === 'side' ? 'on' : ''}`} data-testid="gadget-pos-side" onClick={() => setCfg(setGadgetPosition(cfg, 'side'))}>Side: a cell for each row ({cfg.board.rows})</button>
          </span>
        </div>
      )}
      {bar && <GadgetBarEditor cfg={cfg} slots={bar.slots} position={bar.position ?? 'top'} sequence={!!bar.sequence} onChange={(slots) => setCfg(patchGadgetBar(cfg, { slots }))} onSequence={(on) => setCfg(patchGadgetBar(cfg, { sequence: on || undefined }))} />}
    </Panel>
  );
}

const TOOLS: [GadgetSlot['tool'], string][] = [['wilds', 'Drop wilds'], ['wildReel', 'Lock wild reels'], ['multiplier', 'Add to the multiplier'], ['remove', 'Clear low symbols']];
const toolName = (t: GadgetSlot['tool']) => TOOLS.find((x) => x[0] === t)![1];

/** The cells of the top gadget bar: a preview of the row, then one card per cell with its own symbols, threshold, tool and upgrade. */
function GadgetBarEditor({ cfg, slots, position, sequence, onChange, onSequence }: { cfg: GameConfig; slots: GadgetSlot[]; position: 'top' | 'side'; sequence: boolean; onChange: (s: GadgetSlot[]) => void; onSequence: (on: boolean) => void }) {
  const symbols = [...cfg.symbols.paying, cfg.symbols.wild, cfg.symbols.scatter, cfg.symbols.multiplier];
  const set = (i: number, p: Partial<GadgetSlot>) => onChange(slots.map((sl, k) => (k === i ? { ...sl, ...p } : sl)));
  const maxPower = (sl: GadgetSlot) => (sl.tool === 'wilds' ? Math.floor((cfg.board.reels * cfg.board.rows) / 3) : sl.tool === 'wildReel' ? Math.max(1, cfg.board.reels - 1) : 10);
  return (
    <div className="gadgetbar" data-testid="gadget-bar-settings" style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 16 }}>
      <ol className="barpreview" aria-label="The bar above the board" style={{ display: 'flex', gap: 8, listStyle: 'none', margin: 0, padding: 0, flexWrap: 'wrap' }}>
        {slots.map((sl, i) => (
          <li key={i} style={{ flex: '1 1 110px', minWidth: 110, padding: '8px 10px', borderRadius: 12, border: '1px solid var(--line-strong)', background: '#07112a' }}>
            <b style={{ display: 'block', fontSize: 13 }}>{sl.name?.trim() || toolName(sl.tool)}</b>
            <small className="muted">{sl.charge?.kind === 'wins' ? 'Charged by wins' : `Charged by ${sl.charge.symbols.map((x) => symbolLook(cfg, x).name).join(', ') || 'nothing yet'}`} · opens at {sl.need}</small>
          </li>
        ))}
      </ol>
      <label className="switchline" style={{ display: 'flex', alignItems: 'center', gap: 10 }}><Switch checked={sequence} onChange={onSequence} label="Cells open in order" /> Cells open in order, like doors: a cell only starts charging once the one before it has opened</label>
      {slots.map((sl, i) => (
        <section key={i} className="gcell panel" data-testid={`gadget-cell-${i}`} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <header style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <b className="gnum">{i + 1}</b>
            <input aria-label={`Cell ${i + 1} name`} value={sl.name ?? ''} maxLength={16} placeholder={toolName(sl.tool)} style={{ maxWidth: 220 }} onChange={(e) => set(i, { name: e.target.value })} />
            <span style={{ flex: 1 }} /><small className="muted">{position === 'side' ? `Row ${i + 1}` : `Reel ${i + 1}`}</small>
          </header>
          <div className="field"><span className="lab">Charged by</span>
            <span className="chips" role="group" aria-label={`Cell ${i + 1} charge`}>
              <button className={`chip ${sl.charge.kind === 'land' ? 'on' : ''}`} data-testid={`gcell-${i}-land`} onClick={() => set(i, { charge: { kind: 'land', symbols: sl.charge.kind === 'land' ? sl.charge.symbols : symbols.slice(0, 1) } })}>Symbols that land</button>
              <button className={`chip ${sl.charge.kind === 'wins' ? 'on' : ''}`} data-testid={`gcell-${i}-wins`} onClick={() => set(i, { charge: { kind: 'wins' } })}>Winning steps</button>
            </span>
            {sl.charge.kind === 'land' && (
              <span className="row tight" role="group" aria-label={`Symbols that charge cell ${i + 1}`} style={{ flexWrap: 'wrap', gap: 8 }}>
                {symbols.map((x) => { const on = (sl.charge as { symbols: string[] }).symbols.includes(x); return (
                  <button key={x} className={`libtile ${on ? 'on' : ''}`} aria-pressed={on} data-testid={`gcell-${i}-sym-${x}`} title={symbolLook(cfg, x).name} style={{ width: 64, padding: '6px 4px' }}
                    onClick={() => { const cur = (sl.charge as { symbols: string[] }).symbols; set(i, { charge: { kind: 'land', symbols: on ? cur.filter((y) => y !== x) : [...cur, x] } }); }}>
                    <Tile cfg={cfg} id={x} size={36} /><span className="libname">{symbolLook(cfg, x).name}</span>
                  </button>
                ); })}
              </span>
            )}
          </div>
          <div className="row tight" style={{ gap: 14, flexWrap: 'wrap' }}>
            <label className="field"><span className="lab">Opens at</span><Num w={72} min={1} max={50} step={1} value={sl.need} label={`Cell ${i + 1} opens at`} onChange={(n) => set(i, { need: Math.round(n), ...(sl.eliteNeed && sl.eliteNeed <= Math.round(n) ? { eliteNeed: Math.round(n) + 1 } : {}) })} /></label>
            <label className="field"><span className="lab">Then</span>
              <select aria-label={`Cell ${i + 1} tool`} value={sl.tool} onChange={(e) => { const tool = e.target.value as GadgetSlot['tool']; set(i, { tool, hold: tool === 'wildReel' ? sl.hold : undefined, power: tool === 'remove' ? 1 : Math.min(tool === 'wildReel' ? Math.max(1, cfg.board.reels - 1) : 10, Math.max(1, sl.power)), ...(sl.eliteNeed ? { elitePower: tool === 'remove' ? 1 : Math.max(1, sl.elitePower ?? sl.power) } : {}) }); }}>
                {TOOLS.map(([v, n]) => <option key={v} value={v}>{n}</option>)}
              </select></label>
            {sl.tool !== 'remove' && <label className="field"><span className="lab">{sl.tool === 'wilds' ? 'How many' : sl.tool === 'wildReel' ? 'How many reels' : 'Adds'}</span><Num w={72} min={1} max={maxPower(sl)} step={1} value={sl.power} label={`Cell ${i + 1} power`} onChange={(n) => set(i, { power: Math.round(n) })} /></label>}
            {sl.tool === 'wildReel' && <label className="switchline" style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Switch checked={!!sl.hold} onChange={(on) => set(i, { hold: on })} label={`Cell ${i + 1} keeps the reels wild`} /> Keep them wild until the bonus ends</label>}
          </div>
          <div className="row tight" style={{ gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
            <label className="switchline"><Switch checked={!!sl.eliteNeed} onChange={(on) => set(i, on ? { eliteNeed: sl.need * 2, elitePower: sl.tool === 'remove' ? 1 : sl.power * 2 } : { eliteNeed: undefined, elitePower: undefined })} label={`Cell ${i + 1} upgrade`} /> Upgrade</label>
            {sl.eliteNeed ? (
              <>
                <label className="field"><span className="lab">Upgrades at</span><Num w={72} min={sl.need + 1} max={100} step={1} value={sl.eliteNeed} label={`Cell ${i + 1} upgrades at`} onChange={(n) => set(i, { eliteNeed: Math.max(sl.need + 1, Math.round(n)) })} /></label>
                {sl.tool !== 'remove' && <label className="field"><span className="lab">Upgraded {sl.tool === 'wilds' ? 'wilds' : 'adds'}</span><Num w={72} min={1} max={maxPower(sl)} step={1} value={sl.elitePower ?? sl.power} label={`Cell ${i + 1} upgraded power`} onChange={(n) => set(i, { elitePower: Math.round(n) })} /></label>}
              </>
            ) : null}
            <label className="switchline"><Switch checked={sl.repeat} onChange={(on) => set(i, { repeat: on })} label={`Cell ${i + 1} repeats`} /> Starts again after the last level</label>
          </div>
        </section>
      ))}
      <p className="muted small">The bar has one cell for each {position === 'side' ? 'row' : 'reel'} of the board and works on every spin of the game: the base game, free spins, purchased bonuses and the ante bet. Each cell charges on its own; a cell that opens works at the next step (the next tumble, the next free spin, or at once on the board that landed when a round has no steps).</p>
    </div>
  );
}
