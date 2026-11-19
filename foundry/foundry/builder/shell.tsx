import { useEffect, useRef, useState } from 'react';
import type { GameConfig, Issue } from '../compiler/config';
import { Icon, Tile, type LiveState } from './ui';
import { symbolLook } from './model';

export type Area = 'home' | 'game' | 'symbols' | 'features' | 'math' | 'assets' | 'export';
export const AREAS: { id: Exclude<Area, 'home'>; name: string; icon: string; blurb: string; tabs?: { id: string; name: string }[] }[] = [
  { id: 'game', name: 'Game', icon: 'board', blurb: 'Name, grid and winning groups' },
  { id: 'symbols', name: 'Symbols', icon: 'symbols', blurb: 'Paytable and how often each symbol lands', tabs: [{ id: 'table', name: 'Paytable' }, { id: 'strips', name: 'Reel strips' }] },
  { id: 'features', name: 'Features', icon: 'bolt', blurb: 'Game features and purchased bonuses', tabs: [{ id: 'extras', name: 'Game features' }, { id: 'buy', name: 'Purchased bonuses' }] },
  { id: 'math', name: 'Math', icon: 'chart', blurb: 'Targets and simulation', tabs: [{ id: 'targets', name: 'Targets' }, { id: 'results', name: 'Results' }] },
  { id: 'assets', name: 'Assets', icon: 'image', blurb: 'Images, sounds and other files' },
  { id: 'export', name: 'Export', icon: 'export', blurb: 'Final check and config' },
];

// ---------------------------------------------------------------- small shared pieces
export function Tabs({ tabs, value, onChange, prefix = 'ptab' }: { tabs: { id: string; name: string; badge?: number }[]; value: string; onChange: (id: string) => void; prefix?: string }) {
  return (
    <div className="ptabs" role="tablist">
      {tabs.map((t) => <button key={t.id} role="tab" aria-selected={value === t.id} className={value === t.id ? 'on' : ''} data-testid={`${prefix}-${t.id}`} onClick={() => onChange(t.id)}>{t.name}{t.badge ? <b className="errdot">{t.badge}</b> : null}</button>)}
    </div>
  );
}

export function Page({ crumb, title, sub, actions, banner, tabs, children }: { crumb?: string; title: string; sub?: string; actions?: React.ReactNode; banner?: React.ReactNode; tabs?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="page">
      <header className="pagehead">
        <div>
          <h1 className="pagetitle" data-testid="page-title">{title}</h1>
          {sub && <p className="pagesub">{sub}</p>}
        </div>
        {actions && <div className="pageactions">{actions}</div>}
      </header>
      {banner}
      {tabs}
      <div className="pagebody">{children}</div>
    </div>
  );
}

export function IssueBanner({ issues }: { issues: Issue[] }) {
  if (!issues.length) return null;
  const errs = issues.filter((i) => i.level === 'error');
  return (
    <div className={`banner ${errs.length ? 'error' : 'warn'}`} role="status" data-testid="area-issues">
      <b>{errs.length ? `${errs.length} thing${errs.length > 1 ? 's' : ''} to fix on this page` : 'Worth a look'}</b>
      <ul>{issues.slice(0, 4).map((i, n) => <li key={n}><code>{i.path}</code> {i.message}</li>)}{issues.length > 4 && <li>and {issues.length - 4} more</li>}</ul>
    </div>
  );
}

/** Right-hand drawer: edits the selected thing while the page stays visible behind it. */
const openDrawers: object[] = [];
export function Drawer({ title, onClose, children, testid, wide }: { title: string; onClose: () => void; children: React.ReactNode; testid?: string; wide?: boolean }) {
  // with dialogs on top of dialogs, one Escape closes only the top one, whatever the order of the listeners
  const token = useRef({}).current;
  useEffect(() => { openDrawers.push(token); return () => { const i = openDrawers.indexOf(token); if (i >= 0) openDrawers.splice(i, 1); }; }, [token]);
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape' && !e.defaultPrevented && openDrawers[openDrawers.length - 1] === token) { e.preventDefault(); onClose(); } }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onClose, token]);
  return (
    <div className="drawerback" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <aside className={`drawer ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title} data-testid={testid}>
        <header><h2>{title}</h2><button className="iconbtn" aria-label="Close" onClick={onClose}><Icon name="close" size={18} /></button></header>
        <div className="drawerbody">{children}</div>
      </aside>
    </div>
  );
}

/** Small centred confirmation for anything that cannot be undone. */
export function ConfirmModal({ title, body, confirmLabel = 'Delete', ariaConfirm, onConfirm, onCancel }: { title: string; body: React.ReactNode; confirmLabel?: string; ariaConfirm: string; onConfirm: () => void; onCancel: () => void }) {
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onCancel]);
  return (
    <div className="modalback" onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="modal small" role="alertdialog" aria-modal="true" aria-label={title} data-testid="confirm">
        <h3>{title}</h3>
        <p className="muted">{body}</p>
        <footer><button onClick={onCancel}>Cancel</button><button className="danger" aria-label={ariaConfirm} onClick={onConfirm}>{confirmLabel}</button></footer>
      </div>
    </div>
  );
}

/** A "?" that explains one term in a sentence or two. */
export function Hint({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false); const ref = useRef<HTMLSpanElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', away); window.addEventListener('keydown', k);
    return () => { document.removeEventListener('mousedown', away); window.removeEventListener('keydown', k); };
  }, [open]);
  return (
    <span className="hint2" ref={ref}>
      <button type="button" className="qbtn" aria-label={`What is ${title}?`} aria-expanded={open} onClick={() => setOpen(!open)}>?</button>
      {open && <span className="pop" role="tooltip" data-testid="hint-pop"><b>{title}</b>{children}</span>}
    </span>
  );
}

// ---------------------------------------------------------------- status of each area
export interface AreaStatus { errors: number; warnings: number }
export function areaIssues(area: Area, bySection: Record<string, Issue[]>): Issue[] {
  const secs: Record<string, string[]> = { game: ['game', 'board'], symbols: ['symbols', 'reels'], features: ['features'], math: ['modes'] };
  return (secs[area] ?? []).flatMap((s) => bySection[s] ?? []);
}

// ---------------------------------------------------------------- live math strip: fixed under the header on every page
const pct = (x: number, d = 2) => `${(x * 100).toFixed(d)}%`;
export function LiveStrip({ cfg, live, onBalance }: { cfg: GameConfig; live: LiveState; onBalance: () => void }) {
  const s = live.summary; const target = cfg.modes[0].rtp;
  const inBand = !!s && target >= s.rtpLow && target <= s.rtpHigh;
  const note = !s ? '' : inBand ? 'On target' : s.rtp > target ? `${((s.rtp - target) * 100).toFixed(1)} pts high` : `${((target - s.rtp) * 100).toFixed(1)} pts low`;
  const big = (n: number) => pct(n);
  return (
    <div className={`mathbar ${live.stale || live.tuning ? 'stale' : ''}`} data-testid="live" data-stale={live.stale || live.tuning ? '1' : '0'} data-spins={s?.spins ?? 0} aria-label="Live math">
      <span className="stripdot"><i className={`pulse ${live.running ? 'on' : ''}`} /></span>
      <div className="stat1 primary"><span className="k">RTP</span><b className="v" data-testid="live-rtp">{s ? big(s.rtp) : '...'}</b>{note && <span className={`note ${inBand ? 'ok' : 'warn'} targetnote`} title={`Target ${pct(target, 1)}. The optimiser publishes exactly the target.`}>{note}</span>}</div>
      <div className="stat1"><span className="k">Hit frequency</span><b className="v" data-testid="live-hit">{s ? pct(s.hitRate) : '...'}</b></div>
      <div className="stat1"><span className="k">Volatility</span><b className="v" data-testid="live-vol">{s ? s.volatility.toFixed(1) : '...'}<small>{s ? s.volClass : ''}</small></b></div>
      {cfg.freeSpins !== false && <div className="stat1"><span className="k">Bonus</span><b className="v">{s ? (Number.isFinite(s.triggerOneIn) ? `1 in ${Math.round(s.triggerOneIn).toLocaleString('en-US')}` : 'none yet') : '...'}</b></div>}
      <span className={`live-mode ${s?.truncated && !live.stale && !live.tuning ? 'partial' : ''}`} data-testid="live-mode" title={!s ? '' : s.truncated ? `Rounds of this design are very long, so the estimate stopped after ${s.spins.toLocaleString('en-US')} spins: the numbers are rougher than usual. Run a Monte Carlo on the Math page for more.` : `${s.spins.toLocaleString('en-US')} simulated spins`}>{live.tuning ? 'Balancing...' : live.stale ? 'Updating...' : s?.truncated ? `Partial: ${s.spins.toLocaleString('en-US')} spins` : live.mode === 'live' ? 'Live' : `Monte Carlo ${(live.total / 1000).toLocaleString('en-US')}K`}</span>
      <button className={inBand ? 'ghost small' : 'primary small'} data-testid="tune" disabled={!s || live.tuning} onClick={onBalance}>{inBand ? 'Balance' : 'Fix RTP'}</button>
    </div>
  );
}

// ---------------------------------------------------------------- Home: the hub
export interface Next { label: string; why: string; area: Area; tab?: string }
export function nextAction(cfg: GameConfig, issues: Issue[], live: LiveState): Next {
  const errs = issues.filter((i) => i.level === 'error');
  if (errs.length) {
    const p = errs[0].path;
    const area: Area = /^(symbols|paytable|reels)/.test(p) ? 'symbols' : /^(freeSpin|scatterRule)/.test(p) ? 'features' : /^modes\[[1-9]/.test(p) ? 'features' : /^(modes|optimization|run)/.test(p) ? 'math' : 'game';
    return { label: `Fix ${errs.length} error${errs.length > 1 ? 's' : ''}`, why: errs[0].message, area, tab: undefined };
  }
  const s = live.summary; const target = cfg.modes[0].rtp;
  if (s && !live.stale && (target < s.rtpLow || target > s.rtpHigh)) return { label: 'Balance the RTP', why: `The game returns ${(s.rtp * 100).toFixed(1)}% and the target is ${(target * 100).toFixed(1)}%.`, area: 'math', tab: 'targets' };
  if (!Object.keys(cfg.look ?? {}).length) return { label: 'Style your symbols', why: 'Give symbols names, colours or pictures.', area: 'symbols' };
  if (!cfg.media || !Object.keys(cfg.media).length) return { label: 'Add visuals and audio', why: 'Choose a logo, background and sounds from the library.', area: 'assets', tab: 'visuals' };
  return { label: 'Export the game', why: 'Everything checks out.', area: 'export' };
}

export function HomePage({ cfg, issues, live, assetsCount, goto, children }: { cfg: GameConfig; issues: Issue[]; live: LiveState; assetsCount: number; goto: (a: Area, tab?: string) => void; children?: React.ReactNode }) {
  const errs = issues.filter((i) => i.level === 'error').length; const warns = issues.length - errs;
  const next = nextAction(cfg, issues, live);
  const s = live.summary; const target = cfg.modes[0].rtp; const inBand = !!s && target >= s.rtpLow && target <= s.rtpHigh;
  const bonus = cfg.modes.find((m) => m.isBuyBonus);
  const slots = Object.keys(cfg.media ?? {}).length;
  const tiles: { id: Exclude<Area, 'home'>; key: string; status: 'ok' | 'warn' | 'bad' | 'idle'; label: string }[] = [
    { id: 'game', key: `${cfg.board.reels}x${cfg.board.rows} · Pay anywhere`, status: 'ok', label: 'Ready' },
    { id: 'symbols', key: `${cfg.symbols.paying.length + 3} symbols`, status: 'ok', label: 'Ready' },
    { id: 'features', key: bonus ? `Free spins · Buy ${bonus.cost}x` : 'Free spins', status: 'ok', label: 'Ready' },
    { id: 'math', key: s ? `RTP ${(s.rtp * 100).toFixed(1)}%` : 'RTP ...', status: s ? (inBand ? 'ok' : 'warn') : 'idle', label: s ? (inBand ? 'On target' : 'Off target') : '...' },
    { id: 'assets', key: `${slots} of 8 set · ${assetsCount} file${assetsCount === 1 ? '' : 's'}`, status: slots ? 'ok' : 'idle', label: slots ? 'In progress' : 'Not started' },
    { id: 'export', key: errs ? `${errs} to fix` : 'No errors', status: errs ? 'bad' : warns ? 'warn' : 'ok', label: errs ? 'Fix first' : warns ? 'Warnings' : 'Ready' },
  ];
  return (
    <Page title={cfg.name || 'Untitled game'} sub={cfg.description || 'Your game at a glance.'}>
      <section className="homehero card" data-testid="home-hero">
        <div className="thumbs hero">{cfg.symbols.paying.slice(0, 4).map((p) => <Tile key={p} cfg={cfg} id={p} size={0} />)}</div>
        <div className="homeinfo">
          <div className="tagrow">{[`${cfg.board.reels}x${cfg.board.rows}`, 'Pay anywhere', 'Tumble', 'Free spins', ...(bonus ? ['Bonus Buy'] : [])].map((t) => <span key={t} className="tagchip">{t}</span>)}</div>
        </div>
        <div className="nextbox" data-testid="next-box">
          <span className="k">Suggested next</span>
          <span className="nextwhy">{next.why}</span>
          <button className="primary" data-testid="next-go" onClick={() => goto(next.area, next.tab)}>{next.label}</button>
        </div>
      </section>
      <div className="homegrid">
        <div className="tilegrid">
          {tiles.map((t) => {
            const a = AREAS.find((x) => x.id === t.id)!; const ai = areaIssues(t.id, groupBy(issues)); const e = ai.filter((i) => i.level === 'error').length;
            const status = e ? 'bad' : t.status; const label = e ? `${e} to fix` : t.label;
            return (
              <button key={t.id} className="areatile" data-testid={`tile-${t.id}`} onClick={() => goto(t.id)}>
                <span className="tilehead"><Icon name={a.icon} size={18} /><b>{a.name}</b><span className={`status ${status}`}>{label}</span></span>
                <span className="tilekey">{t.key}</span>
                <span className="muted small">{a.blurb}</span>
              </button>
            );
          })}
        </div>
        {children && <div className="homeside">{children}</div>}
      </div>
    </Page>
  );
}

function groupBy(issues: Issue[]): Record<string, Issue[]> {
  const out: Record<string, Issue[]> = { game: [], board: [], symbols: [], reels: [], features: [], modes: [] };
  const SECTIONS: [RegExp, string][] = [[/^(board|limits)/, 'board'], [/^(id|name|version|template|run)/, 'game'], [/^(symbols|paytable)/, 'symbols'], [/^reels/, 'reels'], [/^(scatterRule|freeSpinTriggers|features)/, 'features'], [/^(modes|optimization)/, 'modes']];
  for (const i of issues) out[SECTIONS.find(([r]) => r.test(i.path))?.[1] ?? 'game'].push(i);
  return out;
}
export const issuesByArea = groupBy;
export { symbolLook };
