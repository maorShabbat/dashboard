import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { GameConfig } from '../compiler/config';
import { clone, groupIssues, setGameType, parseConfig, safeValidate, sectionOf, syncMaxWin } from './model';
import { scalePays } from './sim';
import { useBalance, useLive } from './live';
import { AnalyticsStep } from './analytics';
import { BalanceModal } from './balance';
import { PreviewPanel } from './preview';
import { SymbolsStep } from './symbols';
import { BonusesPage, GameFeaturesPage } from './featurepages';
import { NewGameWizard } from './wizard';
import { GamesHome } from './gameshome';
import { currentGameId, loadGames, newGameId, removeGame, saveGame, setCurrent } from './gamelibrary';
import { PaylinePicker, ReelHeightsPicker } from './paylinepicker';
import { MechanicsPanel } from './mechanics';
import { BoardStep, InfoStep, ReturnStep, TypeStep } from './steps';
import { ReviewStep } from './review';
import { LibraryStep } from './library';
import { applyFeel } from './model';
import { Icon, type Edit } from './ui';
import { AREAS, Drawer, Hint, IssueBanner, LiveStrip, Page, Tabs, areaIssues, type Area } from './shell';
import { useAssets } from './library';
import start from '../examples/t1-demo.config.json';

const KEY = 'foundry-builder-config-v1';

const freshGame = (): GameConfig => clone(start as unknown as GameConfig);

const AREA_KEY = 'foundry-builder-area-v1';
function loadArea(): Area {
  try { const a = localStorage.getItem(AREA_KEY) as Area | null; if (a === 'home' || AREAS.some((x) => x.id === a)) return a as Area; } catch { /* default to Home */ }
  return 'home';
}

export function App() {
  const lib = useRef(loadGames()); const [currentId, setCurrentId] = useState<string>(() => currentGameId(lib.current) ?? newGameId());
  const [cfg, setCfgRaw] = useState<GameConfig>(() => { const g = lib.current.find((x) => x.id === currentGameId(lib.current)); return g ? syncMaxWin(g.config) : freshGame(); });
  const [area, setArea] = useState<Area>(loadArea);
  const [tabs, setTabs] = useState<Record<string, string>>({});
  const [started, setStarted] = useState<boolean>(() => lib.current.length > 0);
  const [copied, setCopied] = useState('');
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [savedAt, setSavedAt] = useState<string>('');
  const [previewOpen, setPreviewOpen] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [splash, setSplash] = useState(true);
  useEffect(() => { const t = setTimeout(() => setSplash(false), 1100); return () => clearTimeout(t); }, []);
  const past = useRef<GameConfig[]>([]); const future = useRef<GameConfig[]>([]); const lastPush = useRef(0);
  const [, tick] = useState(0);
  const cfgRef = useRef(cfg); cfgRef.current = cfg;
  const autoTune = useRef(false);
  const { assets } = useAssets();

  /** Every change goes through here so undo and redo work. Quick bursts (a slider drag) merge into one step. */
  const setCfg = useCallback((raw: GameConfig) => {
    const next = syncMaxWin(raw);
    const now = Date.now();
    if (now - lastPush.current > 600) { past.current.push(cfgRef.current); if (past.current.length > 60) past.current.shift(); }
    lastPush.current = now; future.current = [];
    cfgRef.current = next; setCfgRaw(next); tick((n) => n + 1);
  }, []);
  const undo = () => { const p = past.current.pop(); if (!p) return; future.current.push(cfgRef.current); lastPush.current = 0; cfgRef.current = p; setCfgRaw(p); tick((n) => n + 1); };
  const redo = () => { const f = future.current.pop(); if (!f) return; past.current.push(cfgRef.current); lastPush.current = 0; cfgRef.current = f; setCfgRaw(f); tick((n) => n + 1); };
  const edit: Edit = (f) => { const n = clone(cfgRef.current); f(n); setCfg(n); };

  const issues = useMemo(() => safeValidate(cfg).filter((i) => !(i.level === 'warning' && /^(paytable\.tiers|freeSpinTriggers\.base)/.test(i.path))), [cfg]);
  const by = useMemo(() => groupIssues(issues), [issues]);
  const errors = issues.filter((i) => i.level === 'error').length;
  const warnings = issues.length - errors;
  useEffect(() => { if (!started) return; try { saveGame(currentId, cfg); lib.current = loadGames(); setSavedAt(new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })); } catch { /* unsaved draft is fine */ } }, [cfg, started, currentId]);
  useEffect(() => { try { localStorage.setItem(AREA_KEY, area); } catch { /* fine */ } }, [area]);

  // the automatic balance belongs to the change that asked for it: it joins that undo step instead of becoming one of its own
  const liveSim = useLive(cfg, (f) => { const next = syncMaxWin(scalePays(cfgRef.current, f)); cfgRef.current = next; setCfgRaw(next); tick((n) => n + 1); }, (pays) => { const c = clone(cfgRef.current); c.paytable.pays = pays; setCfg(c); });
  useEffect(() => { if (autoTune.current && started && liveSim.state.summary && !liveSim.state.running && liveSim.state.mode === 'live') { autoTune.current = false; liveSim.tune(); } }, [started, liveSim.state]); // eslint-disable-line react-hooks/exhaustive-deps
  const balance = useBalance(cfg);
  const [balanceOpen, setBalanceOpen] = useState(false);
  const openBalance = () => { setBalanceOpen(true); if (!balance.asked && !balance.running) balance.run(); };

  const goto = (a: Area, tab?: string) => { setArea(a); if (tab) setTabs((t) => ({ ...t, [a]: tab })); window.scrollTo?.({ top: 0 }); };
  const copy = async (text: string, what: string) => {
    try { await navigator.clipboard.writeText(text); setCopied(`${what} copied`); }
    catch { setCopied('Copy was refused: select the text in the box below and copy it by hand'); }
    setTimeout(() => setCopied(''), 3500);
  };
  const notice = (m: string) => { setCopied(m); setTimeout(() => setCopied(''), 2500); };
  const resetHistory = (c: GameConfig) => { past.current = []; future.current = []; lastPush.current = 0; cfgRef.current = c; setCfgRaw(c); tick((n) => n + 1); };
  /** Opens another saved game. */
  const openGame = (id: string, enter = true) => {
    const g = lib.current.find((x) => x.id === id); if (!g) return;
    setCurrent(id); setCurrentId(id); resetHistory(syncMaxWin(g.config)); setNewOpen(false); if (enter) setArea('game');
  };
  /** Removes a saved game. The open one is replaced by the newest of the others, or the start screen when none is left. */
  const deleteGame = (id: string) => {
    lib.current = removeGame(id);
    if (id !== currentId) { tick((n) => n + 1); return; }
    if (lib.current.length) { openGame(lib.current[0].id, false); return; }
    try { localStorage.removeItem(AREA_KEY); } catch { /* nothing saved */ }
    resetHistory(freshGame()); setNewOpen(false); setArea('home'); setStarted(false);
  };
  /** A new game gets its own place in the list. */
  /** A game from the wizard: its own place in the list, balanced automatically, opened on the Symbols page. */
  const addGame = (c: GameConfig) => { const id = newGameId(); setCurrentId(id); setCurrent(id); setStarted(true); autoTune.current = true; resetHistory(c); setNewOpen(false); setArea('symbols'); setTabs((t) => ({ ...t, symbols: 'table' })); };
  const begin = (c: GameConfig, tune: boolean) => { autoTune.current = tune; setCurrentId(newGameId()); setCfg(c); setArea('game'); setStarted(true); };

  if (splash) {
    return <div className="splash" data-testid="splash" onClick={() => setSplash(false)}><span className="brand"><Icon name="crown" size={44} /><span className="wordmark">BANGERS</span></span><small>Slot builder</small></div>;
  }
  if (newOpen) return <NewGameWizard onCancel={() => setNewOpen(false)} onCreate={addGame} />;
  if (!started || area === 'home') {
    const demo = () => { const c = clone(start as unknown as GameConfig); c.name = 'My first slot'; c.id = 'my_first_slot'; begin(c, true); };
    return <GamesHome games={started ? lib.current : []} onOpen={openGame} onDelete={deleteGame} onNew={() => setNewOpen(true)} onDemo={demo} onPaste={(c) => begin(c, false)} />;
  }
  const ready = errors === 0;
  const def = AREAS.find((a) => a.id === area);
  const tab = def?.tabs ? (tabs[area] ?? def.tabs[0].id) : '';
  const areaErr = (a: Exclude<Area, 'home'>) => (a === 'export' ? errors : areaIssues(a, by).filter((i) => i.level === 'error').length);
  const pageIssues = def ? areaIssues(area as Exclude<Area, 'home'>, by) : [];
  const banner = pageIssues.length ? <IssueBanner issues={pageIssues} /> : undefined;
  const tabsEl = def?.tabs ? <Tabs tabs={def.tabs} value={tab} onChange={(id) => setTabs({ ...tabs, [area]: id })} /> : undefined;
  const volOf = (id: 'low' | 'medium' | 'high') => { autoTune.current = true; setCfg(applyFeel(cfgRef.current, id)); };

  const exportGoto = (path: string) => { const sec = sectionOf(path); goto(sec === 'board' || sec === 'game' ? 'game' : sec === 'symbols' || sec === 'reels' ? 'symbols' : sec === 'features' ? 'features' : /^modes\[[1-9]/.test(path) ? 'features' : 'math', sec === 'modes' && !/^modes\[[1-9]/.test(path) ? 'targets' : sec === 'features' || /^modes\[[1-9]/.test(path) ? (/^modes/.test(path) ? 'buy' : 'extras') : undefined); };
  const page = (title: string, sub: string, body: React.ReactNode, actions?: React.ReactNode) => <Page title={title} sub={sub} banner={banner} tabs={tabsEl} actions={actions}>{body}</Page>;
  let content: React.ReactNode;
  if (area === 'game') content = page('Game', 'The basics: name, grid and how many matching symbols win.', <><InfoStep cfg={cfg} edit={edit} /><TypeStep cfg={cfg} onType={(t) => { autoTune.current = true; setCfg(setGameType(cfgRef.current, t)); }} /><BoardStep cfg={cfg} edit={edit} setCfg={setCfg} />{cfg.gameType === 'paylines' && <PaylinePicker cfg={cfg} setCfg={setCfg} />}<MechanicsPanel cfg={cfg} setCfg={setCfg} />{cfg.gameType === 'ways' && <ReelHeightsPicker cfg={cfg} setCfg={setCfg} />}</>);
  else if (area === 'symbols') content = tab === 'strips'
    ? page('Reel strips', 'The order of symbols on each reel. Generated from the weights; most games never need to touch this.', <SymbolsStep cfg={cfg} setCfg={setCfg} live={liveSim.state} suggest={liveSim.suggest} view="strips" />)
    : page('Paytable', 'What each symbol pays and how often it lands.', <SymbolsStep cfg={cfg} setCfg={setCfg} live={liveSim.state} suggest={liveSim.suggest} view="table" />,
      <><Hint title="Suggest paytable">Builds a paytable where rarer symbols pay more, then scales it to your RTP target.</Hint><button className="ghost" disabled={liveSim.state.running} onClick={liveSim.suggest} data-testid="suggest">Suggest paytable</button></>);
  else if (area === 'features') content = tab === 'buy'
    ? page('Purchased bonuses', 'Bonuses a player can buy. Each gets a recommended price.', <BonusesPage cfg={cfg} setCfg={setCfg} onNotice={notice} />)
    : page('Game features', 'Everything that changes how the game plays: in the base game, in free spins or inside a bonus.', <GameFeaturesPage cfg={cfg} setCfg={setCfg} onNotice={notice} />);
  else if (area === 'math') content = tab === 'results'
    ? page('Results', 'What a simulation of your design shows.', <AnalyticsStep cfg={cfg} live={liveSim.state} onRun={liveSim.runMonteCarlo} onStop={liveSim.stop} />)
    : page('Targets', 'Return to player, volatility and the biggest possible win.', <ReturnStep cfg={cfg} setCfg={setCfg} volClass={liveSim.state.summary?.volClass} onVolatility={volOf} />);
  else if (area === 'assets') content = page('Assets', 'Drop images, videos, sounds and JSON here once. Every picker opens this library.', <LibraryStep cfg={cfg} />);
  else content = page('Export', errors ? 'Fix the items in red, then export.' : 'Everything checks out.', <ReviewStep cfg={cfg} setCfg={setCfg} issues={issues} errors={errors} goto={exportGoto} copy={copy} />);

  return (
    <div className="app hub">
      <header className="topbar">
        <Brand />
        <div className="projectline">
          <span className="projname" data-testid="top-name">{cfg.name || 'Untitled game'}</span>
          {!ready && <button className="pill bad" onClick={() => goto('export')}>{errors} to fix</button>}
          <span className="saved"><i className="dot ok" />Saved{savedAt ? ` · ${savedAt}` : ''}</span>
        </div>
        <div className="topactions">
          <button className="iconbtn" onClick={undo} disabled={!past.current.length} aria-label="Undo" title="Undo"><Icon name="undo" /></button>
          <button className="iconbtn" onClick={redo} disabled={!future.current.length} aria-label="Redo" title="Redo"><Icon name="redo" /></button>
          <button className="ghost" onClick={() => goto('home')} data-testid="all-games">All games</button>
          <button className="ghost" onClick={() => setPreviewOpen(true)} data-testid="open-preview"><Icon name="play" size={15} />Preview</button>
          <button className="primary" onClick={() => goto('export')} data-testid="export-top">Export game</button>
        </div>
      </header>
      <LiveStrip cfg={cfg} live={liveSim.state} onBalance={openBalance} />
      {copied && <div className="toast" role="status">{copied}</div>}
      <div className="hubbody">
        <nav className="rail" aria-label="Areas">
          <button className="stepbtn" onClick={() => goto('home')} data-testid="nav-home"><Icon name="home" /><span className="steptxt">All games</span></button>
          {AREAS.map((a) => { const n = areaErr(a.id); return (
            <button key={a.id} className={`stepbtn ${area === a.id ? 'on' : ''}`} aria-current={area === a.id ? 'page' : undefined} onClick={() => goto(a.id)} data-testid={`nav-${a.id}`}><Icon name={a.icon} /><span className="steptxt">{a.name}</span>{n > 0 && <b className="errdot" title={`${n} to fix`}>{n}</b>}</button>
          ); })}
        </nav>
        <main className="main">{content}</main>
      </div>
      {previewOpen && (
        <Drawer title="Preview" onClose={() => setPreviewOpen(false)} testid="preview-drawer">
          <div className="seg" role="group" aria-label="Device"><button data-testid="device-desktop" className={device === 'desktop' ? 'on' : ''} onClick={() => setDevice('desktop')}>Desktop</button><button data-testid="device-mobile" className={device === 'mobile' ? 'on' : ''} onClick={() => setDevice('mobile')}>Mobile</button></div>
          <PreviewPanel cfg={cfg} device={device} />
        </Drawer>
      )}
      {balanceOpen && <BalanceModal cfg={cfg} live={liveSim.state} balance={balance} applyConfig={setCfg} onClose={() => setBalanceOpen(false)} onGo={(id) => goto(id === 'return' ? 'math' : id === 'features' ? 'features' : 'symbols', id === 'return' ? 'targets' : undefined)} />}
    </div>
  );
}

function Brand() {
  return <span className="brand"><Icon name="crown" size={22} /><span className="wordmark">BANGERS</span><span className="tag">Slot builder</span></span>;
}
