import { useEffect, useRef, useState } from 'react';
import type { GameConfig } from '../compiler/config';
import type { BalanceOption, BonusSummary, Summary } from './sim';
import type { PerkValue } from './model';
import type { FxEffect, SimReply } from './sim.worker';

const LIVE_SPINS = 40000;
export const MC_RUNS: [string, number][] = [['100K', 100_000], ['1M', 1_000_000], ['10M', 10_000_000]];

export interface LiveState { summary?: Summary; running: boolean; progress: number; total: number; error?: string; mode: 'live' | 'monte-carlo'; prev?: Summary; tuning?: boolean; stale?: boolean }

/** Runs the estimate in a worker. Every change of the design restarts a 40,000 spin run (debounced); Monte Carlo runs are explicit. */
export function useLive(cfg: GameConfig, onTuned?: (factor: number) => void, onSuggested?: (pays: Record<string, number[]>) => void) {
  const worker = useRef<Worker | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const onTunedRef = useRef(onTuned); onTunedRef.current = onTuned;
  const onSuggestedRef = useRef(onSuggested); onSuggestedRef.current = onSuggested;
  const idRef = useRef(0);
  // A balance run takes seconds; a live refresh asked for meanwhile waits for it (starting one would replace the balance and its answer would be lost).
  const balancing = useRef(false); const refreshAfter = useRef(false);
  // A balance answers for the design it was asked about: if the design changed meanwhile it is dropped (the strip then offers Fix RTP). Asking again
  // would rebalance edits nobody asked to balance, and a very slow design would keep the engine busy for minutes.
  const cfgRef = useRef(cfg); cfgRef.current = cfg; const keyRef = useRef(''); const askedKey = useRef('');
  const [state, setState] = useState<LiveState>({ running: true, progress: 0, total: LIVE_SPINS, mode: 'live' });
  const last = useRef<Summary | undefined>(undefined);
  const [failed, setFailed] = useState('');

  const ensure = () => {
    if (worker.current) return worker.current;
    try {
      const w = new Worker('sim.worker.js');
      w.onmessage = (e: MessageEvent<SimReply>) => {
        const r = e.data;
        if (r.id !== idRef.current) return;
        if (r.suggested || r.tuned) {
          balancing.current = false;
          setState((s) => ({ ...s, running: false, tuning: false }));
          if (r.suggested) onSuggestedRef.current?.(r.suggested.pays); else if (askedKey.current === keyRef.current) onTunedRef.current?.(r.tuned!.factor);
          // new pays change the design and restart the estimate; a refresh that waited must still run if they did not
          if (refreshAfter.current) { refreshAfter.current = false; clearTimeout(timer.current); timer.current = setTimeout(() => startRef.current(LIVE_SPINS, 'live'), 250); }
          return;
        }
        if (r.error) { setState((s) => ({ ...s, running: false, error: r.error })); return; }
        if (r.summary) setState((s) => ({ ...s, summary: r.summary, progress: r.summary!.spins }));
        if (r.done) setState((s) => { if (s.mode === 'live') last.current = s.summary; return { ...s, running: false, stale: false }; });
      };
      w.onerror = () => setFailed('The estimate engine could not start in this browser.');
      worker.current = w;
    } catch { setFailed('The estimate engine could not start in this browser.'); }
    return worker.current;
  };
  const start = (spins: number, mode: 'live' | 'monte-carlo') => {
    if (mode === 'monte-carlo') clearTimeout(timer.current); // an explicit run replaces the pending live refresh
    if (mode === 'live' && balancing.current) { refreshAfter.current = true; return; }
    const w = ensure(); if (!w) return;
    balancing.current = false;
    const id = ++idRef.current;
    setState((s) => ({ ...s, running: true, progress: 0, total: spins, mode, error: undefined, prev: mode === 'live' ? last.current : s.prev }));
    w.postMessage({ id, cfg, spins, batch: mode === 'live' ? 4000 : 20000 });
  };
  const startRef = useRef(start); startRef.current = start; // the worker's handler is made once: it must reach the current design

  const tune = () => { const w = ensure(); if (!w) return; const id = ++idRef.current; balancing.current = true; askedKey.current = keyRef.current; setState((s) => ({ ...s, running: true, tuning: true, error: undefined })); w.postMessage({ id, cfg: cfgRef.current, spins: 0, tune: true }); };
  const suggest = () => { const w = ensure(); if (!w) return; const id = ++idRef.current; balancing.current = true; setState((s) => ({ ...s, running: true, tuning: true, error: undefined })); w.postMessage({ id, cfg, spins: 0, suggest: true }); };
  const key = keyRef.current = JSON.stringify([cfg.gameType, cfg.paylines, cfg.reelHeights, cfg.tumble, cfg.board, cfg.symbols, cfg.paytable, cfg.reels, cfg.scatterRule, cfg.freeSpinTriggers, cfg.modes[0].maxWin, cfg.modes[0].distributions.find((d) => d.criteria === 'freegame')?.conditions.multValues, cfg.features, cfg.gadgetBar]);
  useEffect(() => {
    setState((s) => ({ ...s, stale: true }));
    clearTimeout(timer.current);
    timer.current = setTimeout(() => start(LIVE_SPINS, 'live'), 250);
    return () => clearTimeout(timer.current);
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { worker.current?.terminate(); worker.current = null; }, []);

  return { state: { ...state, error: state.error ?? (failed || undefined) }, runMonteCarlo: (n: number) => start(n, 'monte-carlo'), stop: () => { idRef.current++; balancing.current = false; setState((s) => ({ ...s, running: false })); }, refresh: () => start(LIVE_SPINS, 'live'), tune, suggest };
}

const pct = (x: number, d = 2) => `${(x * 100).toFixed(d)}%`;
const oneIn = (p: number) => (p > 0 ? `1 in ${p >= 100 ? Math.round(1 / p).toLocaleString('en-US') : (1 / p).toFixed(2)}` : 'never');
const big = (n: number) => n >= 1e6 ? `${n / 1e6}M` : n >= 1e3 ? `${n / 1e3}K` : String(n);

function Delta({ now, before, unit = '%', digits = 2, good }: { now: number; before?: number; unit?: string; digits?: number; good?: 'up' | 'down' | 'none' }) {
  if (before === undefined || !Number.isFinite(before)) return null;
  const d = (now - before) * (unit === '%' ? 100 : 1);
  if (Math.abs(d) < Math.pow(10, -digits) / 2) return <span className="delta flat">no change</span>;
  const up = d > 0;
  return <span className={`delta ${up ? 'up' : 'down'}`}>{up ? '+' : '-'}{Math.abs(d).toFixed(digits)}{unit === '%' ? ' pts' : ''}</span>;
}

export function LivePanel({ cfg, live, onRun, onStop, onTune, showMonteCarlo = true }: { cfg: GameConfig; live: ReturnType<typeof useLive>['state']; onRun: (n: number) => void; onStop: () => void; onTune: () => void; showMonteCarlo?: boolean }) {
  const { summary: s, running, progress, total, mode, prev, error } = live;
  const spark = s?.hist ?? [];
  const target = cfg.modes[0].rtp;
  const inBand = s ? target >= s.rtpLow && target <= s.rtpHigh : false;
  return (
    <section className={`live ${live.stale ? 'stale' : ''}`} aria-label="Live stats" data-testid="live" data-stale={live.stale ? '1' : '0'}>
      <header className="livehead">
        <span className="livetitle"><i className={`pulse ${running ? 'on' : ''}`} />Live stats</span>
        <span className="livemode" data-testid="live-mode">{live.stale ? 'Updating...' : mode === 'live' ? `${(s?.spins ?? 0).toLocaleString('en-US')} spins` : `Monte Carlo ${big(total)}`}</span>
      </header>
      {error && <p className="fix">{error}</p>}
      <div className="rtpbig">
        <span className="metric-label">RTP</span>
        <b className="rtpvalue" data-testid="live-rtp">{s ? pct(s.rtp) : '...'}</b>
        {s && <span className="band">95% band {pct(s.rtpLow, 1)} to {pct(s.rtpHigh, 1)}</span>}
        {mode === 'live' && s && <Delta now={s.rtp} before={prev?.rtp} />}
      </div>
      <div className="targetbar" aria-hidden>
        <i className="tmark" style={{ left: `${Math.min(100, Math.max(0, ((target - 0.5) / 0.7) * 100))}%` }} />
        {s && <i className="tval" style={{ left: `${Math.min(100, Math.max(0, ((s.rtp - 0.5) / 0.7) * 100))}%` }} />}
      </div>
      {s && s.rtp > 10 * target && <p className="fix">This design returns far more than it takes in. Open \"Balance RTP\" to see what is too high and how to fix it.</p>}
      <p className="targetnote">{s ? (inBand ? `On target (${pct(target, 1)} is published by the optimiser).` : s.rtp > target ? `${((s.rtp - target) * 100).toFixed(1)} pts above the ${pct(target, 1)} target. Lower the paytable or add low-pay symbols.` : `${((target - s.rtp) * 100).toFixed(1)} pts below the ${pct(target, 1)} target. Raise the paytable or add wilds.`) : 'Calculating...'}</p>
      <button className="tune" disabled={!s} onClick={onTune} data-testid="tune">{live.tuning ? 'Working...' : 'Balance RTP...'}</button>
      {spark.length > 0 && <svg className="spark" viewBox="0 0 120 34" preserveAspectRatio="none" aria-hidden><path d={`M0 34 ${spark.map((p, i) => `L${(i / (spark.length - 1)) * 120} ${34 - Math.max(0, (Math.log10(Math.max(p * 100, 0.01)) + 2) / 4) * 32}`).join(' ')} L120 34 Z`} /></svg>}
      <dl className="metrics">
        <div><dt>Hit frequency</dt><dd data-testid="live-hit">{s ? pct(s.hitRate) : '...'}<small>{s ? oneIn(s.hitRate) : ''}</small></dd></div>
        <div><dt>Hit rate &ge; 1x (above stake)</dt><dd data-testid="live-push">{s ? pct(s.pushRate) : '...'}<small>{s ? `${oneIn(s.pushRate)} pay 1x or more` : ''}</small></dd></div>
        <div><dt>Volatility</dt><dd data-testid="live-vol">{s ? s.volatility.toFixed(1) : '...'}<small>{s ? s.volClass : ''}</small></dd></div>
        <div><dt>Hit + trigger</dt><dd>{s ? pct(s.hitTrigRate) : '...'}<small>win or feature trigger</small></dd></div>
        <div><dt>Bonus frequency</dt><dd>{s ? (Number.isFinite(s.triggerOneIn) ? `1 in ${Math.round(s.triggerOneIn).toLocaleString('en-US')}` : 'none yet') : '...'}<small>free spins trigger</small></dd></div>
        <div><dt>Max win (seen)</dt><dd>{s ? `${s.maxSeen.toLocaleString('en-US', { maximumFractionDigits: 0 })}x` : '...'}<small>cap {cfg.modes[0].maxWin.toLocaleString('en-US')}x</small></dd></div>
      </dl>
      {showMonteCarlo && <div className="mc">
        <span className="metric-label">Monte Carlo</span>
        <div className="seg" role="group" aria-label="Monte Carlo spins">
          {MC_RUNS.map(([l, n]) => <button key={l} disabled={running && mode === 'monte-carlo'} onClick={() => onRun(n)} data-testid={`mc-${l}`}>{l}</button>)}
        </div>
        {running && mode === 'monte-carlo' && (
          <div className="mcrun"><span className="mcbar"><i style={{ width: `${Math.min(100, (progress / total) * 100)}%` }} /></span><button className="linkbtn" onClick={onStop}>Cancel</button></div>
        )}
        <p className="muted small">{mode === 'monte-carlo' && !running ? 'Monte Carlo finished. Edit anything to return to the live estimate.' : 'Bigger runs are slower and give a tighter band. Edits switch back to the live estimate.'}</p>
      </div>}
      <p className="muted small foot">Design estimate of the reels and paytable as built. The published RTP is set to the target by the optimiser in the real math run.</p>
    </section>
  );
}

/** One purchased bonus: its results and what each perk is worth, in their own worker so the live stats never slow down. */
export function useBonus(cfg: GameConfig, id?: string) {
  const [state, setState] = useState<{ summary?: BonusSummary | null; perks?: PerkValue[]; core?: number; running: boolean; stale: boolean }>({ running: true, stale: true });
  const worker = useRef<Worker | null>(null); const idRef = useRef(0);
  const bm = cfg.modes.find((m) => m.isBuyBonus && (id === undefined || m.name === id));
  const key = JSON.stringify([cfg.gameType, cfg.paylines, cfg.reelHeights, cfg.tumble, cfg.board, cfg.symbols, cfg.paytable, cfg.reels, cfg.scatterRule, cfg.freeSpinTriggers, bm?.name, bm?.cost, bm?.maxWin, bm?.rtp, bm?.distributions.find((d) => d.criteria === 'freegame')?.conditions, cfg.features, cfg.gadgetBar]);
  useEffect(() => {
    setState((s) => ({ ...s, stale: true, running: true }));
    const t = setTimeout(() => {
      try {
        if (!worker.current) {
          const w = new Worker('sim.worker.js');
          w.onmessage = (e: MessageEvent<SimReply>) => { if (e.data.id === idRef.current && 'bonusResult' in e.data) setState({ summary: e.data.bonusResult, perks: e.data.perks, core: e.data.core, running: false, stale: false }); };
          w.onerror = () => setState((s) => ({ ...s, running: false }));
          worker.current = w;
        }
        const i = ++idRef.current; worker.current.postMessage({ id: i, cfg, spins: 10000, bonus: true, bonusId: bm?.name });
      } catch { setState((s) => ({ ...s, running: false })); }
    }, 350);
    return () => clearTimeout(t);
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { worker.current?.terminate(); worker.current = null; }, []);
  return state;
}

/** Every purchased bonus at once (average win, return and the recommended price), for the bonus cards. */
export function useBonusAll(cfg: GameConfig) {
  const [state, setState] = useState<{ all: Record<string, BonusSummary>; stale: boolean }>({ all: {}, stale: true });
  const worker = useRef<Worker | null>(null); const idRef = useRef(0);
  const key = JSON.stringify([cfg.gameType, cfg.paylines, cfg.reelHeights, cfg.tumble, cfg.board, cfg.symbols, cfg.paytable, cfg.reels, cfg.scatterRule, cfg.freeSpinTriggers, cfg.modes.filter((m) => m.isBuyBonus), cfg.features, cfg.gadgetBar]);
  useEffect(() => {
    if (!cfg.modes.some((m) => m.isBuyBonus)) { setState({ all: {}, stale: false }); return; }
    setState((s) => ({ ...s, stale: true }));
    const t = setTimeout(() => {
      try {
        if (!worker.current) {
          const w = new Worker('sim.worker.js');
          w.onmessage = (e: MessageEvent<SimReply>) => { if (e.data.id === idRef.current && e.data.all) setState({ all: e.data.all, stale: false }); };
          w.onerror = () => setState((s) => ({ ...s, stale: false }));
          worker.current = w;
        }
        const i = ++idRef.current; worker.current.postMessage({ id: i, cfg, spins: 6000, bonusAll: true });
      } catch { setState((s) => ({ ...s, stale: false })); }
    }, 400);
    return () => clearTimeout(t);
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { worker.current?.terminate(); worker.current = null; }, []);
  return state;
}

/** What each feature adds on its own (the game with and without it), measured in a worker. */
export function useFeatureEffects(cfg: GameConfig) {
  const [state, setState] = useState<{ effects: FxEffect[]; stale: boolean }>({ effects: [], stale: true });
  const worker = useRef<Worker | null>(null); const idRef = useRef(0);
  const key = JSON.stringify([cfg.gameType, cfg.paylines, cfg.reelHeights, cfg.tumble, cfg.board, cfg.symbols, cfg.paytable, cfg.reels, cfg.scatterRule, cfg.freeSpinTriggers, cfg.modes.map((m) => [m.name, m.maxWin, m.distributions.find((d) => d.criteria === 'freegame')?.conditions]), cfg.features, cfg.gadgetBar]);
  useEffect(() => {
    if (!cfg.features?.length) { setState({ effects: [], stale: false }); return; }
    setState((s) => ({ ...s, stale: true }));
    const t = setTimeout(() => {
      try {
        if (!worker.current) {
          const w = new Worker('sim.worker.js');
          w.onmessage = (e: MessageEvent<SimReply>) => { if (e.data.id === idRef.current && e.data.effects) setState({ effects: e.data.effects, stale: false }); };
          w.onerror = () => setState((s) => ({ ...s, stale: false }));
          worker.current = w;
        }
        const i = ++idRef.current; worker.current.postMessage({ id: i, cfg, spins: 0, fx: true });
      } catch { setState((s) => ({ ...s, stale: false })); }
    }, 500);
    return () => clearTimeout(t);
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { worker.current?.terminate(); worker.current = null; }, []);
  return state;
}

/** "Balance RTP": runs several strategies in a worker and streams each option back as it is solved. */
export function useBalance(cfg: GameConfig) {
  const [state, setState] = useState<{ options: BalanceOption[]; running: boolean; asked: boolean; target: number }>({ options: [], running: false, asked: false, target: cfg.modes[0].rtp });
  const worker = useRef<Worker | null>(null); const idRef = useRef(0);
  const run = () => {
    try {
      if (!worker.current) {
        const w = new Worker('sim.worker.js');
        w.onmessage = (e: MessageEvent<SimReply>) => {
          if (e.data.id !== idRef.current) return;
          if (e.data.option) setState((s) => ({ ...s, options: [...s.options, e.data.option!] }));
          if (e.data.done) setState((s) => ({ ...s, running: false }));
        };
        w.onerror = () => setState((s) => ({ ...s, running: false }));
        worker.current = w;
      }
      const id = ++idRef.current; const target = cfg.modes[0].rtp;
      setState({ options: [], running: true, asked: true, target });
      worker.current.postMessage({ id, cfg, spins: 0, balance: target });
    } catch { setState((s) => ({ ...s, running: false })); }
  };
  const clear = () => { idRef.current++; setState((s) => ({ ...s, options: [], running: false, asked: false })); };
  useEffect(() => () => { worker.current?.terminate(); worker.current = null; }, []);
  return { ...state, run, clear };
}
