import { useMemo, useRef, useState } from 'react';
import type { GameConfig } from '../compiler/config';
import { mulberry32 } from '../compiler/reels';
import { buildModel, previewRound } from './sim';
import { GadgetBarView, Icon, Tile } from './ui';
import { useAssetUrl } from './library';

const BETS = [0.2, 0.5, 1, 2, 5, 10];
const money = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function PreviewPanel({ cfg, device = 'desktop' }: { cfg: GameConfig; device?: 'desktop' | 'mobile' }) {
  const key = JSON.stringify([cfg.gameType, cfg.paylines, cfg.reelHeights, cfg.tumble, cfg.board, cfg.symbols, cfg.paytable, cfg.reels, cfg.scatterRule, cfg.freeSpinTriggers, cfg.modes[0].maxWin, cfg.gadgetBar]);
  const model = useMemo(() => buildModel(cfg), [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const bg = cfg.media?.background; const bgUrl = useAssetUrl(bg?.id);
  const rng = useRef(mulberry32((Date.now() >>> 0) ^ 0x9e3779b9));
  const [bet, setBet] = useState(1);
  const [balance, setBalance] = useState(1000);
  const [spin, setSpin] = useState<{ board: string[][]; pay: number; triggered: boolean; freeSpins: number; n: number } | null>(null);
  const [history, setHistory] = useState<{ n: number; win: number; bonus: boolean }[]>([]);
  const board = useMemo(() => spin?.board ?? previewRound(cfg, mulberry32(7), model).board, [spin, model]); // eslint-disable-line react-hooks/exhaustive-deps
  const go = () => {
    if (balance < bet) return;
    const r = previewRound(cfg, rng.current, model);
    const n = (spin?.n ?? 0) + 1;
    setSpin({ ...r, n });
    setBalance((b) => b - bet + r.pay * bet);
    setHistory((h) => [{ n, win: r.pay * bet, bonus: r.triggered }, ...h].slice(0, 6));
  };
  const cols = board.length || cfg.board.reels; const rows = board[0]?.length || cfg.board.rows;
  const bar = cfg.gadgetBar; const side = bar?.position === 'side';
  return (
    <section className="panel preview" aria-label="Live preview" data-testid="preview">
      <header className="panelhead"><h3><Icon name="play" size={16} />Live preview</h3><span className="panelaside"><i className="dot ok" />{spin ? `Spin ${spin.n}` : 'Ready'}</span></header>
      <div className={`screen ${device} ${bgUrl ? 'hasbg' : ''}`} style={bgUrl && bg?.kind === 'image' ? { backgroundImage: `linear-gradient(rgba(5,11,25,.35), rgba(5,11,25,.55)), url(${bgUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}>
        {bgUrl && bg?.kind === 'video' && <video className="bgvideo" src={bgUrl} muted loop autoPlay playsInline />}
        {bar && !side && <GadgetBarView cfg={cfg} position="top" cols={cols} rows={rows} />}
        <div className="stagerow" style={{ display: 'flex', gap: 6, alignItems: 'stretch' }}>
          {bar && side && <GadgetBarView cfg={cfg} position="side" cols={cols} rows={rows} />}
          <div className="reelsgrid" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)`, flex: 1 }} key={spin?.n ?? 0}>
            {Array.from({ length: rows }).flatMap((_, y) => board.map((col, x) => (
              <span key={`${x}-${y}`} className="drop" style={{ animationDelay: `${x * 55 + y * 18}ms` }}><Tile cfg={cfg} id={col[y]} size={0} /></span>
            )))}
          </div>
        </div>
        <div className={`winbar ${spin && spin.pay > 0 ? 'won' : ''}`} data-testid="preview-win">
          {!spin ? 'Press spin' : spin.pay > 0 ? `WIN ${money(spin.pay * bet)}${spin.triggered ? ` · ${spin.freeSpins} free spins played` : ''}` : 'No win'}
        </div>
        <div className="controls">
          <label className="betsel"><span>Bet</span>
            <select value={bet} onChange={(e) => setBet(Number(e.target.value))} aria-label="Bet">{BETS.map((b) => <option key={b} value={b}>{money(b)}</option>)}</select></label>
          <button className="spinbtn" onClick={go} disabled={balance < bet} aria-label="Spin" data-testid="spin"><Icon name="spin" size={26} /></button>
          <div className="bal"><span>Balance</span><b data-testid="balance">{money(balance)}</b></div>
        </div>
      </div>
      <ul className="history" aria-label="Spin history">
        {history.length === 0 ? <li className="muted small">Your last spins appear here. The board shows the first reveal; the win is the whole round, tumbles and free spins included.</li> :
          history.map((h) => <li key={h.n}><span>#{h.n}</span><span className={h.win > 0 ? 'pos' : ''}>{h.win > 0 ? `+${money(h.win)}` : '-'}</span>{h.bonus && <em>bonus</em>}</li>)}
      </ul>
      {balance < bet && <button className="linkbtn" onClick={() => setBalance(1000)}>Reset balance</button>}
    </section>
  );
}

