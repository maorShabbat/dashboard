import { useState } from 'react';
import { hasTumbles } from '../compiler/features';
import { isRoundCost, spinTable, type GameConfig, type GameType } from '../compiler/config';
import { scatterRows, setScatterRows, type ScatterRow, fitPaylines, gameTypeOf, FEELS, SPIN_STYLES, applyFeel, addPaying, clone, freeSpinMin, frequency, getBonusSettings, setBonusSettings, MULT_PRESETS, type MultPreset, nextSymbolId, parseConfig, rangeLabel, rangeStarts, removePaying, safeValidate, sectionOf, setFreeSpinRule, setFrequency, setLook, setPayLevel, setRangeStarts, setReturn, symbolLook, pictureToDataUrl } from './model';
import { BoardPreview, Field, Icon, Num, Panel, Switch, Tile, type Edit, type SetCfg } from './ui';
import { Hint } from './shell';
import start from '../examples/t1-demo.config.json';

export function InfoStep({ cfg, edit }: { cfg: GameConfig; edit: Edit }) {
  return (
    <Panel title="About" icon="home">
      <div className="grid">
        <Field label="Game name"><input value={cfg.name} placeholder="e.g. Sweet Cascade" onChange={(e) => edit((c) => { c.name = e.target.value; })} /></Field>
        <Field label="Description"><input value={cfg.description ?? ''} placeholder="One line about your game" aria-label="Game description" onChange={(e) => edit((c) => { c.description = e.target.value || undefined; })} /></Field>
      </div>
      <details className="adv"><summary>Provider and identifiers</summary>
        <div className="grid">
          <Field label="Provider" hint="Studio name, shown in the logo slot."><input value={cfg.provider ?? ''} placeholder="e.g. Maor Games" onChange={(e) => edit((c) => { c.provider = e.target.value || undefined; })} /></Field>
          <Field label="Game id" hint="Lowercase letters, numbers and underscores."><input value={cfg.id} onChange={(e) => edit((c) => { c.id = e.target.value; })} /></Field>
          <Field label="Version" hint="Increase for each published build."><Num value={cfg.version} min={1} step={1} onChange={(n) => edit((c) => { c.version = n; })} /></Field>
        </div>
      </details>
    </Panel>
  );
}

export const SLOT_TYPES: { id: string; name: string; blurb: string; how: string; ready: boolean; art: number[][] }[] = [
  { id: 'anywhere', name: 'Pay anywhere (scatter pays)', blurb: 'Symbols pay wherever they land.', how: 'A win is a group of the same symbol anywhere on the grid, no paylines. Pairs well with tumbles (cascading reels), where winning symbols are removed and new ones drop in.', ready: true, art: [[1,0,1,0,1],[0,1,0,1,0],[1,0,0,1,1]] },
  { id: 'paylines', name: 'Paylines', blurb: 'Matches along fixed lines.', how: 'Matching symbols must land left to right along a payline. You switch each line on or off; more lines mean more ways to win. There are no tumbles: the board stays after a win.', ready: true, art: [[0,0,0,0,0],[1,1,1,1,1],[0,0,0,0,0]] },
  { id: 'ways', name: 'Ways to win (243 / 1024)', blurb: 'Adjacent reels, any row.', how: 'A symbol pays when it lands on adjacent reels from the left, in any row. The pay is multiplied by the number of ways: the product of the matching symbols on each reel. There are no tumbles: the board stays after a win.', ready: true, art: [[1,0,1,0,0],[0,1,1,1,0],[1,0,0,1,1]] },
    { id: 'cluster', name: 'Cluster pays', blurb: 'Adjacent groups win.', how: 'Matching symbols must touch horizontally or vertically to form a winning cluster of the minimum size. Wilds join every group they touch. With tumbles, winning clusters are removed and new symbols drop in.', ready: true, art: [[0,1,1,0,0],[0,1,1,1,0],[0,0,0,1,0]] },
];

export function Mini({ art }: { art: number[][] }) {
  return <span className="mini" aria-hidden>{art.flatMap((r, y) => r.map((v, x) => <i key={`${y}${x}`} className={v ? 'on' : ''} />))}</span>;
}

export function TypeStep({ cfg, onType }: { cfg: GameConfig; onType: (t: GameType) => void }) {
  const cur = gameTypeOf(cfg);
  const idFor = (id: string): GameType | null => (id === 'anywhere' ? 'anywhere' : id === 'cluster' ? 'cluster' : id === 'paylines' ? 'paylines' : id === 'ways' ? 'ways' : null);
  const chosen = SLOT_TYPES.find((t) => idFor(t.id) === cur) ?? SLOT_TYPES[0];
  return (
    <Panel title="Game type" icon="board">
      <ul className="tilegrid small" role="radiogroup" aria-label="Game type">
        {SLOT_TYPES.map((t) => {
          const g = idFor(t.id);
          return (
            <li key={t.id} className={`ftile typetile ${t.id === chosen.id ? 'sel' : ''} ${!t.ready ? 'muted' : ''}`} style={{ '--tc': '#3d86ff' } as React.CSSProperties}>
              <button role="radio" aria-checked={t.id === chosen.id} disabled={!t.ready || !g} className="ftilemain" data-testid={`type-${t.id}`} onClick={() => g && onType(g)}>
                <span className="fbar" /><Mini art={t.art} />
                <span className="fhead"><b>{t.name}</b></span>
                <span className="fsub">{t.blurb}</span>
                {!t.ready && <span className="ftags"><i>Coming soon</i></span>}
                {t.id === chosen.id && <span className="ftags"><i>Selected</i></span>}
              </button>
            </li>
          );
        })}
      </ul>
      <p className="muted small typehow" data-testid="type-how">{chosen.how}</p>
    </Panel>
  );
}

export function BoardStep({ cfg, setCfg }: { cfg: GameConfig; edit: Edit; setCfg: SetCfg }) {
  const starts = rangeStarts(cfg);
  const cells = cfg.board.reels * cfg.board.rows;
  const setBoard = (k: 'reels' | 'rows', n: number) => { const c = clone(cfg); c.board[k] = n; setCfg(fitPaylines(setRangeStarts(c, rangeStarts(c)))); };
  return (
    <>
      <Panel title="Grid" icon="board" aside={<span className="muted small">{gameTypeOf(cfg) === 'cluster' ? 'Cluster pays' : gameTypeOf(cfg) === 'paylines' ? 'Paylines' : gameTypeOf(cfg) === 'ways' ? 'Ways to win' : 'Pay anywhere'}{hasTumbles(cfg.gameType, cfg.tumble) ? ' · Tumble' : ''} · Wild<Hint title="Pay model">{gameTypeOf(cfg) === 'cluster' ? 'A win is a group of touching symbols (up, down, left, right). With tumbles, winning symbols are removed and new ones drop in until no win remains.' : gameTypeOf(cfg) === 'paylines' ? 'A win is the same symbol on a payline from the left reel. The board stays after a win.' : 'Symbols pay wherever they land: a win is a group of the same symbol anywhere on the grid, no paylines. With tumbles, winning symbols are removed and new ones drop in until no win remains.'}</Hint></span>}>
        <div className="gridsplit">
          <div className="stack tight">
            <Field label="Reels"><Num value={cfg.board.reels} min={3} max={8} step={1} onChange={(n) => setBoard('reels', n)} /></Field>
            <Field label="Rows"><Num value={cfg.board.rows} min={3} max={8} step={1} onChange={(n) => setBoard('rows', n)} /></Field>
            <span className="muted small">{cells} symbols on screen.</span>
          </div>
          <BoardPreview cfg={cfg} />
        </div>
      </Panel>
      <Panel title={gameTypeOf(cfg) === 'cluster' ? 'Winning clusters' : gameTypeOf(cfg) === 'paylines' || gameTypeOf(cfg) === 'ways' ? 'Winning lengths' : 'Winning groups'} icon="symbols" aside={<Hint title="Winning groups">How many matching symbols make a win. Each group size range has its own pay in the paytable. The smallest group is the minimum win; the last range runs up to the whole grid ({cells}).</Hint>}>
        <div className="tiers">
          {starts.map((st, i) => (
            <div className="tier" key={i}>
              <span className="tiername">{rangeLabel(cfg, i)}</span>
              <label className="tierfrom"><small>from</small><Num w={64} min={2} max={cells} step={1} value={st} onChange={(n) => { const next = [...starts]; next[i] = n; setCfg(setRangeStarts(cfg, next)); }} /></label>
              <button className="iconbtn" aria-label={`Remove group ${rangeLabel(cfg, i)}`} disabled={starts.length <= 1} onClick={() => setCfg(setRangeStarts(cfg, starts.filter((_, j) => j !== i)))}><Icon name="close" size={14} /></button>
            </div>
          ))}
          <button className="tier add" disabled={starts[starts.length - 1] >= cells} onClick={() => setCfg(setRangeStarts(cfg, [...starts, starts[starts.length - 1] + 2]))}>+ Add a pay tier</button>
        </div>
        <button className="linkbtn" onClick={() => setCfg(setRangeStarts(cfg, gameTypeOf(cfg) === 'cluster' ? [5, 6, 9, 13] : gameTypeOf(cfg) === 'paylines' || gameTypeOf(cfg) === 'ways' ? [3, 4, 5] : [8, 9, 11, 14]))}>Reset to the standard {gameTypeOf(cfg) === 'cluster' ? '5 / 6-8 / 9-12 / 13+' : gameTypeOf(cfg) === 'paylines' || gameTypeOf(cfg) === 'ways' ? '3 / 4 / 5' : '8 / 9-10 / 11-13 / 14+'}</button>
      </Panel>
    </>
  );
}

export function FreeSpinsStep({ cfg, setCfg }: { cfg: GameConfig; setCfg: SetCfg }) {
  const min = freeSpinMin(cfg);
  const per = cfg.scatterRule.spinsPerScatter;
  const sc = symbolLook(cfg, cfg.symbols.scatter).name;
  const rows = Object.entries(cfg.freeSpinTriggers.free).sort((a, b) => Number(a[0]) - Number(b[0]));
  const table = spinTable(cfg); const awardFor = (n: number) => { let v = 0; for (const k of Object.keys(table).map(Number).sort((a, b) => a - b)) if (k <= n) v = table[String(k)]; return v; };
  const rewards = scatterRows(cfg);
  const setRewards = (r: ScatterRow[]) => setCfg(setScatterRows(cfg, r));
  return (
    <div className="stack">
        <Panel title="Trigger and length" icon="symbols">
          <div className="frow"><span className="lab">Preset</span>
            <span className="chips" role="group" aria-label="Free spins preset">
              {SPIN_STYLES.map((x) => <button key={x.id} className={`chip ${x.min === min && x.per === per ? 'on' : ''}`} data-testid={`spins-${x.id}`} title={x.tagline} onClick={() => setCfg(setFreeSpinRule(cfg, x.min, x.per))}>{x.name}</button>)}
            </span></div>
          <div className="frow"><span className="lab">Scatters to trigger</span><span><Num w={80} value={min} min={2} max={8} step={1} onChange={(n) => setCfg(setFreeSpinRule(cfg, n, per))} /></span></div>
          <div className="frow"><span className="lab">Spins per scatter</span><span><Num w={80} value={per} min={1} max={10} step={1} onChange={(n) => setCfg(setFreeSpinRule(cfg, min, n))} /></span></div>
          <p className="tip">{min} {sc} start <b>{awardFor(min)} free spins</b>; {min + 1} give <b>{awardFor(min + 1)}</b>.</p>
          <h4 className="bbh">What the scatters give</h4>
          <p className="muted small">Each row is "this many scatters or more". Give free spins, a cash win (a multiple of the bet), or both. Change the numbers, add a row or remove one.</p>
          <table className="tbl" data-testid="scatter-rewards"><thead><tr><th>{sc} landed</th><th>Free spins</th><th>Cash win (x bet)</th><th /></tr></thead><tbody>
            {rewards.map((r, i) => (
              <tr key={i} data-testid={`reward-row-${i}`}>
                <td><Num w={64} min={2} max={12} step={1} value={r.count} label={`Reward ${i + 1} scatters`} onChange={(n) => { const v = Math.round(n); if (!rewards.some((x, k) => k !== i && x.count === v)) setRewards(rewards.map((x, k) => (k === i ? { ...x, count: v } : x))); }} /></td>
                <td><Num w={72} min={0} max={100} step={1} value={r.spins} label={`Reward ${i + 1} free spins`} onChange={(n) => setRewards(rewards.map((x, k) => (k === i ? { ...x, spins: Math.round(n) } : x)))} /></td>
                <td><Num w={80} min={0} max={cfg.modes[0].maxWin} step={0.1} value={r.pay} label={`Reward ${i + 1} cash win`} onChange={(n) => setRewards(rewards.map((x, k) => (k === i ? { ...x, pay: n } : x)))} /></td>
                <td><button className="iconbtn" aria-label={`Remove the reward for ${r.count} scatters`} data-testid={`reward-remove-${i}`} disabled={rewards.length <= 1} onClick={() => setRewards(rewards.filter((_, k) => k !== i))}>×</button></td>
              </tr>
            ))}
          </tbody></table>
          <div className="row tight"><button className="small" data-testid="reward-add" disabled={rewards[rewards.length - 1]?.count >= 12} onClick={() => setRewards([...rewards, { count: (rewards[rewards.length - 1]?.count ?? min) + 1, spins: rewards[rewards.length - 1]?.spins ?? 0, pay: 0 }])}>+ Add a row</button>
            <button className="linkbtn" data-testid="reward-reset" onClick={() => setCfg(setFreeSpinRule(cfg, min, per))}>Reset to scatters x spins per scatter</button></div>
          <details className="adv"><summary>Retrigger (extra spins during free spins)</summary>
            <p className="muted">Scatters landing during free spins award extra spins. Set the spins awarded for each scatter count.</p>
            <table className="tbl"><thead><tr><th>{sc} landed</th><th>Extra spins</th></tr></thead><tbody>
              {rows.map(([k, v]) => (
                <tr key={k}><td>{k}</td><td><Num w={80} min={1} step={1} value={v} onChange={(n) => { const c = clone(cfg); c.freeSpinTriggers.free[k] = n; setCfg(c); }} /></td></tr>
              ))}
            </tbody></table>
          </details>
        </Panel>
    </div>
  );
}

const COSTS = [5, 10, 25, 50, 75, 100, 150, 200, 250, 500, 1000];

const TOP_WINS = [1000, 2000, 5000, 10000, 20000, 50000];

export function ReturnStep({ cfg, setCfg, volClass, onVolatility }: { cfg: GameConfig; setCfg: SetCfg; volClass?: string; onVolatility?: (id: 'low' | 'medium' | 'high') => void }) {
  const volIdx = volClass === 'Low' ? 0 : volClass === 'Medium' ? 1 : volClass ? 2 : 1;
  const baseRtp = cfg.modes[0].rtp;
  const maxWin = cfg.modes[0].maxWin;
  const setMaxWin = (v: number) => { const c = clone(cfg); for (const m of c.modes) { m.maxWin = v; for (const d of m.distributions) if (d.criteria === 'wincap') d.winCriteria = v; } setCfg(c); };
  return (
    <>
      <Panel title="Targets" icon="percent">
        <div className="setrows">
          <div className="setrow"><span className="setlab">RTP<Hint title="RTP">Return to player: the share of every bet paid back over millions of spins. Stake allows 90% to 96.6%; 96% is common. The optimiser publishes exactly this number.</Hint></span>
            <span className="row tight"><Num w={96} value={Number((baseRtp * 100).toFixed(2))} min={90} max={96.6} step={0.1} onChange={(n) => setCfg(setReturn(cfg, n / 100))} label="RTP (%)" /><span className="muted">%</span></span></div>
          <div className="setrow"><span className="setlab">Volatility<Hint title="Volatility">Low: frequent small wins. High: rare big ones. Moving this reshapes the paytable and weights, then rebalances to your RTP.</Hint></span>
            <span className="volctl"><input type="range" className="voltrack" min={0} max={2} step={1} value={volIdx} aria-label="Volatility" data-testid="vol-slider" onChange={(e) => onVolatility?.((['low', 'medium', 'high'] as const)[Number(e.target.value)])} />
            <span className="volends"><span className={volIdx === 0 ? 'on' : ''}>Low</span><span className={volIdx === 1 ? 'on' : ''}>Medium</span><span className={volIdx === 2 ? 'on' : ''}>High</span></span></span></div>
          <div className="setrow"><span className="setlab">Max win<Hint title="Max win">The round ends and pays out when a win reaches this multiple of the bet. Stake allows up to 500,000x; 5,000x is common.</Hint></span>
            <select className="narrowsel" aria-label="Max win (x bet)" value={TOP_WINS.includes(maxWin) ? maxWin : ''} onChange={(e) => setMaxWin(Number(e.target.value))}>
              {!TOP_WINS.includes(maxWin) && <option value="">{maxWin}x (custom)</option>}
              {TOP_WINS.map((v) => <option key={v} value={v}>{v.toLocaleString('en-US')}x the bet</option>)}
            </select></div>
        </div>
      </Panel>
      <details className="adv"><summary>Advanced: simulation size</summary>
        <p className="muted">Books (simulated rounds) generated per mode in the real math run. More is slower and more accurate.</p>
        <div className="grid narrow">{cfg.modes.map((m) => (
          <Field key={m.name} label={m.isBuyBonus ? 'Bonus Buy' : 'Base game'}><Num value={cfg.run.books[m.name] ?? 0} min={1000} step={1000} onChange={(n) => { const c = clone(cfg); c.run.books[m.name] = n; setCfg(c); }} /></Field>
        ))}</div>
        <Field label="Max events per round" hint="Rounds with more events are discarded and redrawn. Keeps each mode under Stake's 10 million event limit."><Num value={cfg.limits.maxEventsPerRound} min={50} step={50} onChange={(n) => { const c = clone(cfg); c.limits.maxEventsPerRound = n; setCfg(c); }} /></Field>
      </details>
    </>
  );
}
