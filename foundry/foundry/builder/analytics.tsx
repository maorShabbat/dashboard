import type { GameConfig } from '../compiler/config';
import { HIST_LABELS } from './sim';
import { MC_RUNS } from './live';
import { Hint } from './shell';
import { Icon, Panel, Tile, type LiveState } from './ui';
import { symbolLook } from './model';

const pct = (x: number, d = 2) => `${(x * 100).toFixed(d)}%`;
const oneIn = (p: number) => (p > 0 ? `~ 1 in ${p >= 0.01 ? (1 / p).toFixed(1) : Math.round(1 / p).toLocaleString('en-US')} spins` : 'none yet');

function WinDistribution({ hist }: { hist: number[] }) {
  const W = 640, H = 220, L = 52, B = 28, T = 8, gap = 8;
  const bw = (W - L - 8) / hist.length - gap;
  const y = (p: number) => { const v = Math.log10(Math.max(p * 100, 0.001)); return T + (H - T - B) * (1 - Math.max(0, (v + 2.5) / 4.5)); };
  const ticks = [100, 10, 1, 0.1, 0.01];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label="Win distribution">
      <defs><linearGradient id="bar" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="var(--accent)" /><stop offset="1" stopColor="var(--violet)" /></linearGradient></defs>
      {ticks.map((t) => { const yy = y(t / 100); return <g key={t}><line x1={L} x2={W - 8} y1={yy} y2={yy} stroke="var(--line)" strokeDasharray="2 4" /><text x={L - 8} y={yy + 4} textAnchor="end" className="axis">{t}%</text></g>; })}
      {hist.map((p, i) => { const yy = y(p); return <rect key={i} x={L + i * (bw + gap) + gap / 2} y={yy} width={bw} height={Math.max(0, H - B - yy)} rx="3" fill="url(#bar)" opacity={p > 0 ? 1 : 0.15} />; })}
      {HIST_LABELS.map((l, i) => <text key={l} x={L + i * (bw + gap) + gap / 2 + bw / 2} y={H - 8} textAnchor="middle" className="axis">{l}</text>)}
    </svg>
  );
}

import { useState } from 'react';
export function AnalyticsStep({ cfg, live, onRun, onStop }: { cfg: GameConfig; live: LiveState; onRun: (n: number) => void; onStop: () => void }) {
  const [runN, setRunN] = useState(1_000_000);
  const s = live.summary;
  const mc = live.mode === 'monte-carlo';
  const fact = (label: string, value: string, sub?: string) => <div className="fact"><span className="k">{label}</span><b>{value}</b>{sub && <small>{sub}</small>}</div>;
  return (
    <div className="stack">
      <section className="simbar" data-testid="simbar">
        <div className="simtext">
          <b>{mc ? (live.running ? 'Running a Monte Carlo simulation...' : `Monte Carlo: ${s ? s.spins.toLocaleString('en-US') : ''} spins`) : `Live estimate: ${s ? s.spins.toLocaleString('en-US') : '...'} spins`}</b>
          <span className="muted small">{mc && !live.running ? 'Edit anything to return to the live estimate.' : 'Run more spins for a tighter RTP range.'}</span>
          {live.running && mc && <div className="mcrun"><span className="mcbar"><i style={{ width: `${Math.min(100, (live.progress / live.total) * 100)}%` }} /></span><button className="linkbtn" onClick={onStop}>Cancel</button></div>}
          {mc && !live.running && <span hidden data-testid="mc-done">done</span>}
        </div>
        <select value={runN} onChange={(e) => setRunN(Number(e.target.value))} aria-label="Number of spins" data-testid="mc-spins">
          {MC_RUNS.map(([l, n]) => <option key={l} value={n}>{n.toLocaleString('en-US')} spins</option>)}
        </select>
        <button className="primary" disabled={live.running && mc} onClick={() => onRun(runN)} data-testid="mc-run"><Icon name="play" size={15} />Run simulation</button>
      </section>
      <div className="facts stats">
        {fact('RTP range (95%)', s ? `${pct(s.rtpLow, 1)} to ${pct(s.rtpHigh, 1)}` : '...', 'narrows with more spins')}
        {fact('Volatility', s ? `${s.volClass} · ${s.volatility.toFixed(1)}` : '...')}
        {fact('Average win', s ? `${s.avgWin.toFixed(2)}x` : '...', 'per spin, base game')}
        {fact('Average bonus', s ? `${s.avgBonusWin.toFixed(1)}x` : '...', s && Number.isFinite(s.triggerOneIn) ? `triggers ${oneIn(1 / s.triggerOneIn).replace('~ ', '')}` : '')}
        {fact('Biggest win seen', s ? `${s.maxSeen.toLocaleString('en-US', { maximumFractionDigits: 0 })}x` : '...', `cap ${cfg.modes[0].maxWin.toLocaleString('en-US')}x`)}
      </div>
      <Panel title="Win distribution" icon="chart" aside={<Hint title="Win distribution">How often wins of each size occur, on a log scale. A steeper drop to the right means a more volatile game.</Hint>}>
        {s ? <WinDistribution hist={s.hist} /> : <p className="muted">Calculating...</p>}
      </Panel>
      <Panel title="Symbol contributions" icon="symbols" aside={<span className="muted small">Share of RTP, natural game</span>}>
        <div className="scroll"><table className="tbl contrib">
          <thead><tr><th>Symbol</th><th>Type</th><th>Hit frequency</th><th>Avg win (x)</th><th>RTP contribution</th></tr></thead>
          <tbody>
            {cfg.symbols.paying.map((p, i) => { const b = s?.bySymbol?.[p]; return (
              <tr key={p}><td><span className="cell"><Tile cfg={cfg} id={p} size={26} />{symbolLook(cfg, p).name}</span></td><td>{i < Math.ceil(cfg.symbols.paying.length / 2) ? 'High pay' : 'Low pay'}</td>
                <td>{b ? pct(b.hitRate) : '...'}</td><td>{b && b.hitRate > 0 ? `${(b.rtpShare / b.hitRate).toFixed(2)}x` : '-'}</td>
                <td><span className="cell"><span className="sharebar w"><i style={{ width: `${Math.min(100, ((b?.rtpShare ?? 0) / Math.max(0.01, s?.rtp ?? 1)) * 100 * 2.5)}%` }} /></span>{b ? pct(b.rtpShare) : '...'}</span></td></tr>
            ); })}
            {s && <tr><td><span className="cell"><Tile cfg={cfg} id={cfg.symbols.scatter} size={26} />{symbolLook(cfg, cfg.symbols.scatter).name} (free spins)</span></td><td>Feature</td><td>{Number.isFinite(s.triggerOneIn) ? pct(1 / s.triggerOneIn) : '-'}</td><td>{s.avgBonusWin ? `${s.avgBonusWin.toFixed(2)}x` : '-'}</td><td>included above</td></tr>}
          </tbody></table></div>
      </Panel>
    </div>
  );
}

