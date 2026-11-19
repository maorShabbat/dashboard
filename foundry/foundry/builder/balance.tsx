import { Drawer } from './shell';
import { useEffect } from 'react';
import type { GameConfig } from '../compiler/config';
import { diagnose } from './diagnose';
import type { useBalance } from './live';
import { Icon, Panel, type LiveState } from './ui';

export const fmtPct = (x: number) => (x >= 10 ? `${Math.round(x * 100).toLocaleString('en-US')}%` : `${(x * 100).toFixed(1)}%`);
type Bal = ReturnType<typeof useBalance>;

export function BalanceOptions({ balance, applyConfig, afterApply }: { balance: Bal; applyConfig: (c: GameConfig) => void; afterApply?: () => void }) {
  return (
    <div className="balopts" data-testid="balance-options">
      {balance.options.map((o) => (
        <div key={o.id} className={`balopt ${o.reachable ? '' : 'weak'}`} data-testid={`bal-${o.id}`}>
          <header><b>{o.name}</b><span className={`badge ${o.reachable ? 'on' : ''}`}>{o.reachable ? `lands on ${fmtPct(o.rtp)}` : `gets to ${fmtPct(o.rtp)}`}</span></header>
          <p><span className="blabel">How</span>{o.how}</p>
          <p><span className="blabel price">Price</span>{o.price}</p>
          <p className="muted small">{o.summary}</p>
          <button onClick={() => { applyConfig(o.config); balance.clear(); afterApply?.(); }} data-testid={`bal-apply-${o.id}`}>{o.reachable ? 'Apply' : 'Apply anyway (closer, not exact)'}</button>
        </div>
      ))}
      {balance.running && <div className="balopt loading">Solving the next option...</div>}
    </div>
  );
}

export function BalancePanel({ cfg, live, balance, applyConfig, onWhy }: { cfg: GameConfig; live: LiveState; balance: Bal; applyConfig: (c: GameConfig) => void; onWhy: () => void }) {
  const s = live.summary; const target = cfg.modes[0].rtp; const gap = s ? s.rtp - target : 0;
  const off = !!s && !live.stale && (target < s.rtpLow || target > s.rtpHigh);
  return (
    <Panel title="Balance RTP" icon="percent" aside={<span className={`badge ${off ? '' : 'on'}`}>{!s ? '...' : off ? `${gap > 0 ? '+' : ''}${(gap * 100).toFixed(1)} pts from target` : 'On target'}</span>}>
      <p className="muted">{s ? (off ? `The game returns ${fmtPct(s.rtp)} but the target is ${fmtPct(target)}. There is more than one way to close that gap, and each one has a price: it changes something else about how the game feels. Open the explanation, compare the options, then pick one. Nothing changes until you press Apply.` : `The simulated RTP (${fmtPct(s.rtp)}) is inside the band around the ${fmtPct(target)} target. You can still compare ways to move it exactly onto the target.`) : 'Calculating...'}</p>
      <div className="row"><button className="primary" onClick={onWhy} data-testid="balance-open">{off ? 'Why is it off, and how do I fix it?' : 'Compare ways to balance'}</button></div>
    </Panel>
  );
}

/** The pop-up: why the RTP is off, what is too high, what to change, how it changes the experience, then the options. */
export function BalanceModal({ cfg, live, balance, applyConfig, onClose, onGo }: { cfg: GameConfig; live: LiveState; balance: Bal; applyConfig: (c: GameConfig) => void; onClose: () => void; onGo: (step: 'symbols' | 'features' | 'return') => void }) {
  const d = diagnose(cfg, live.summary);
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onClose]);
  const goFor = (id: string): 'symbols' | 'features' | 'return' => (id === 'wincap' ? 'return' : 'symbols');
  return (
    <Drawer title="Balance RTP" onClose={onClose} testid="balance-modal" wide>
        <div className="modalbody">
          <p className={d.canFixAutomatically ? 'tip' : 'fix'} data-testid="balance-verdict">{live.stale ? 'The numbers are still updating... ' : ''}{d.verdict}</p>
          <section><h4>What is too high</h4>
            {d.findings.length === 0 ? <p className="muted">{live.summary ? 'Nothing stands out as broken.' : 'Waiting for the simulation...'}</p> : (
              <ul className="findings" data-testid="balance-findings">
                {d.findings.map((f) => <li key={f.id} className={f.severity}><b>{f.title}</b><span>{f.detail}</span></li>)}
              </ul>)}
          </section>
          {d.findings.length > 0 && (
            <section><h4>What needs to change</h4>
              <ol className="getlist" data-testid="balance-changes">
                {d.findings.map((f) => <li key={f.id}><b>{f.fix}</b> <button className="linkbtn" onClick={() => { onClose(); onGo(goFor(f.id)); }}>Go there</button></li>)}
              </ol>
            </section>
          )}
          <section><h4>How it affects the player</h4>
            <ul className="tick" data-testid="balance-experience">{d.experience.map((t) => <li key={t}>{t}</li>)}</ul>
          </section>
          <section><h4>{d.canFixAutomatically ? 'Ways to balance it' : 'Quick fixes (they shrink the number but do not remove the problems above)'}</h4>
            <div className="row"><button className="primary" disabled={balance.running} onClick={balance.run} data-testid="balance-run">{balance.running ? 'Comparing ways...' : balance.asked ? 'Compare again' : 'Compare ways to balance'}</button></div>
            {balance.asked && <BalanceOptions balance={balance} applyConfig={applyConfig} afterApply={onClose} />}
          </section>
        </div>
    </Drawer>
  );
}
