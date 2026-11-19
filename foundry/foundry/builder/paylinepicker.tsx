// The paylines of a paylines game as tiles: each tile draws one line on the grid, press it to switch the line on or off.
import type { CSSProperties } from 'react';
import type { GameConfig } from '../compiler/config';
import { paylineLibrary, paylinePresets } from '../compiler/paylines';
import { lineOn, setPaylineCount, setReelHeights, setTumble, togglePayline } from './model';
import { Num, Panel, type SetCfg } from './ui';

/** One line drawn over a small grid of cells. */
export function LineArt({ line, rows, on }: { line: number[]; rows: number; on: boolean }) {
  const reels = line.length; const W = 60; const H = 36; const px = (r: number) => 6 + (r * (W - 12)) / Math.max(1, reels - 1); const py = (y: number) => 5 + (y * (H - 10)) / Math.max(1, rows - 1);
  return (
    <svg className="lineart" viewBox={`0 0 ${W} ${H}`} role="img" aria-hidden>
      {Array.from({ length: reels }, (_, r) => Array.from({ length: rows }, (_, y) => <circle key={`${r}-${y}`} cx={px(r)} cy={py(y)} r={1.6} className="dot" />))}
      <polyline points={line.map((y, r) => `${px(r)},${py(y)}`).join(' ')} className={on ? 'path on' : 'path'} fill="none" />
      {line.map((y, r) => <circle key={`p${r}`} cx={px(r)} cy={py(y)} r={2.4} className={on ? 'pt on' : 'pt'} />)}
    </svg>
  );
}

export function PaylinePicker({ cfg, setCfg }: { cfg: GameConfig; setCfg: SetCfg }) {
  const lib = paylineLibrary(cfg.board.reels, cfg.board.rows); const active = cfg.paylines?.length ?? 0;
  return (
    <Panel title="Paylines" icon="board" aside={<span className="muted small" data-testid="payline-count">{active} of {lib.length} lines on</span>}>
      <div className="presetrow" role="group" aria-label="Number of paylines">
        {paylinePresets(cfg.board.reels, cfg.board.rows).map((n) => <button key={n} className={`chip ${active === n && lib.slice(0, n).every((l) => lineOn(cfg, l)) ? 'on' : ''}`} data-testid={`payline-preset-${n}`} onClick={() => setCfg(setPaylineCount(cfg, n))}>{n} lines</button>)}
      </div>
      <ul className="tilegrid lines" data-testid="payline-tiles">
        {lib.map((l, i) => {
          const on = lineOn(cfg, l);
          return (
            <li key={l.join('')} className={`ftile linetile ${on ? 'sel' : ''}`} style={{ '--tc': '#3d86ff' } as CSSProperties} data-testid={`payline-${i + 1}`}>
              <button className="ftilemain" role="switch" aria-checked={on} aria-label={`Payline ${i + 1}: ${l.map((y) => y + 1).join('-')}`} onClick={() => setCfg(togglePayline(cfg, l))}>
                <span className="fbar" /><LineArt line={l} rows={cfg.board.rows} on={on} />
                <span className="fhead"><b>Line {i + 1}</b><span className="fvalue">{on ? 'On' : 'Off'}</span></span>
              </button>
            </li>
          );
        })}
      </ul>
      <p className="muted small">A line pays when the same symbol (wilds count) lands on it from the left reel. More lines mean more wins and a higher return, so rebalance with Fix RTP after changing them.</p>
    </Panel>
  );
}

/** Ways games: should every reel keep its height, or change it on every spin (more ways on a good spin, fewer on a bad one)? */
export function ReelHeightsPicker({ cfg, setCfg }: { cfg: GameConfig; setCfg: SetCfg }) {
  const random = !!cfg.reelHeights;
  const ways = (rows: number[]) => rows.reduce((a, b) => a * b, 1);
  return (
    <Panel title="Reel heights" icon="board" aside={random ? <span className="muted small" data-testid="heights-note">up to {ways(Array(cfg.board.reels).fill(cfg.board.rows)).toLocaleString('en-US')} ways</span> : undefined}>
      <ul className="tilegrid small" role="radiogroup" aria-label="Reel heights">
        {([[false, 'Fixed', 'Every reel always shows the same number of symbols.'], [true, 'Changes every spin', `Every reel shows from ${cfg.reelHeights?.min ?? 2} to ${random ? cfg.board.rows : 7} symbols, picked at random on every spin. The number of ways changes with it.`]] as const).map(([r, name, text]) => (
          <li key={String(r)} className={`ftile typetile ${random === r ? 'sel' : ''}`} style={{ '--tc': '#3d86ff' } as CSSProperties}>
            <button className="ftilemain" role="radio" aria-checked={random === r} data-testid={`heights-${r ? 'random' : 'fixed'}`} onClick={() => setCfg(setReelHeights(cfg, r))}>
              <span className="fbar" /><span className="fhead"><b>{name}</b></span><span className="fsub">{text}</span>
            </button>
          </li>
        ))}
      </ul>
      {random && cfg.reelHeights && (
        <label className="field"><span className="lab">Lowest height</span>
          <Num w={80} min={2} max={cfg.board.rows - 1} step={1} value={cfg.reelHeights.min} label="Lowest reel height" onChange={(n) => setCfg(setReelHeights(cfg, true, Math.round(n)))} /></label>
      )}
    </Panel>
  );
}

/** Paylines and ways games: should winning symbols tumble away and new ones drop in? */
export function TumbleSwitch({ cfg, setCfg }: { cfg: GameConfig; setCfg: SetCfg }) {
  const on = !!cfg.tumble;
  return (
    <Panel title="Tumbles" icon="board" aside={<span className="muted small">{on ? 'On' : 'Off'}</span>}>
      <ul className="tilegrid small" role="radiogroup" aria-label="Tumbles">
        {([[false, 'No tumbles', 'Symbols stay where they land. One evaluation per spin.'], [true, 'Tumbles', 'Winning symbols disappear and new ones drop in until nothing wins. In free spins every tumble raises the multiplier by 1.']] as const).map(([v, name, text]) => (
          <li key={String(v)} className={`ftile typetile ${on === v ? 'sel' : ''}`} style={{ '--tc': '#3d86ff' } as CSSProperties}>
            <button className="ftilemain" role="radio" aria-checked={on === v} data-testid={`tumble-${v ? 'on' : 'off'}`} onClick={() => setCfg(setTumble(cfg, v))}>
              <span className="fbar" /><span className="fhead"><b>{name}</b></span><span className="fsub">{text}</span>
            </button>
          </li>
        ))}
      </ul>
      {cfg.gameType === 'ways' && cfg.reelHeights && !on && <p className="muted small">Tumbles cannot be combined with reels that change height yet.</p>}
    </Panel>
  );
}
