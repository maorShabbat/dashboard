// The Features area: "Game features" (tiles that work in the base game, free spins or a bonus) and "Purchased bonuses" (cards + a bonus builder).
import { useState } from 'react';
import type { GameConfig } from '../compiler/config';
import { BASE, BONUS_ONLY, baseAllowed, hasTumbles, FEATURE_INFO, FEATURE_ORDER, defaultFeature, describeTrigger, validateFeatures, type Feature, type FeatureType } from '../compiler/features';
import { addBonus, addBonusFrom, anteFactor, anteMode, getAnte, hasFreeSpins, setAnte, setFreeSpins, type AnteSettings, addFeatureFrom, bonusModes, featureById, places, putFeature, symbolLook } from './model';
import { exportFavorites, importFavorites, removeFavorite } from './favorites';
import { BonusBuilder, COSTS, useFavorites } from './bonusbuy';
import { FeatureDialog } from './featuredialog';
import { useBonusAll, useFeatureEffects } from './live';
import type { FxEffect } from './sim.worker';
import { ConfirmModal, Drawer } from './shell';
import { FreeSpinsStep } from './steps';
import { Tile } from './tiles';
import { Switch, type SetCfg } from './ui';

const money = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: n >= 100 ? 0 : 1 });
const pts = (x: number) => `${x >= 0 ? '+' : ''}${(x * 100).toFixed(1)} pts`;

// ---------------------------------------------------------------- describe it in words
type Sample = ((input: string, opts?: object) => Promise<{ text: string }>) & { json?: (input: string, opts?: object) => Promise<unknown> };
async function getSample(): Promise<Sample | null> {
  try { const c = (window as unknown as { claude?: { use?: (n: string) => Promise<unknown> } }).claude; return c?.use ? ((await c.use('sample')) as Sample | null) : null; } catch { return null; }
}
export const CONCEPTS_KEY = 'foundry-concepts-v1';
const SCHEMA = `Feature types and their fields (all numbers are plain JSON numbers):
- randomWild {counts:{"1":60,"2":30}}  drops that many wild symbols on ordinary cells (counts = amount -> weight)
- mystery {counts:{"3":50,"4":30}, pool:"all"|"high"}  turns several cells into the same random paying symbol
- expandWild {chance:0-1, shape:"reel"|"row"|"cross"}  each wild may grow
- spreadWild {chance:0-1, copies:1-4}  each wild may copy itself to neighbours
- cellMultiplier {start:2-10, growth:"double"|"add", max:start-1024, memory:"spin"|"bonus"}  cells that take part in a win get a growing multiplier
- stickyWild {lifetime:0-50}  wilds stay for N spins (0 = rest of the bonus; in the base game N tumbles / the rest of the round)
- heroWild {startFactor:1-20, growth:0-10, maxFactor:startFactor-100, move:"step"|"random"}  a walking wild that multiplies wins
- multiplierLadder {start:1-20, step:0-10, max:start-500}  the global multiplier starts at start and grows by step after every tumble up to max
- bonusMultiplier {start:1-20, step:0-10, max:start-500}  one multiplier for the whole bonus that grows after every winning free spin (bonuses only)
- lives {lives:1-10}  a bonus ends early when its lives run out; every free spin without a win costs one (bonuses only)
- shuffle {}  the ordinary symbols on the board change places (only for cluster, paylines and ways games)
- removeSymbols {target:"lowest"|"low"}  low paying symbols on the board are swapped for better ones
- prizeAward {values:{"5":60,"10":30} (prize in x bet, whole numbers -> weight)}  a cash prize added to the spin win
- wildMultiplier {values:{"2":60,"3":25} (wild multiplier -> weight, whole numbers 2-100), combine:"add"|"multiply"}  every wild carries a multiplier; wins with wilds are multiplied
- colossalWild {size:2|3|4}  a block of wilds lands at once
- holdAndWin {counts:{"6":60,"7":25} (starting orbs -> weight), landChance:0.01-0.5 (per empty cell per respin), respins:1-5, values:{"1":50,"5":10} (orb cash value in x bet, whole numbers -> weight), fullMult:1|2|3|5|10}  cash orbs lock, new orbs restart the respins, orb values are paid at the end
Every feature also has: trigger {match:"all"|"any", conditions:[...]} (empty list = every spin) and where: list of "base" | "free" (scatter free spins) | a bonus id.
Conditions: {kind:"chance",p:0-1} {kind:"scatters",min,max?} {kind:"symbols",symbol,min} {kind:"spinIs",which:"first"|"last"|"every"|"from",n?} {kind:"prevSpin",result:"win"|"loss"|"big",x?} {kind:"streak",of:"win"|"loss",n:2-20} {kind:"bonusWin",atLeast} {kind:"spinsLeft",atMost}. spinIs, prevSpin, streak, bonusWin and spinsLeft work inside bonuses only, never in "base".`;

export function describePrompt(cfg: GameConfig, text: string, wherePlaces: { id: string; name: string }[]): string {
  const syms = [...cfg.symbols.paying, cfg.symbols.wild, cfg.symbols.scatter, cfg.symbols.multiplier].map((s) => `${s} (${symbolLook(cfg, s).name})`).join(', ');
  return `You turn a slot designer's description into ONE feature of a slot builder. Only use the feature types below. If the description needs a mechanic that is not listed, answer with ok:false.
${SCHEMA}
This game: ${cfg.board.reels}x${cfg.board.rows} pay-anywhere grid. Symbols: ${syms}. Places: ${wherePlaces.map((p) => `"${p.id}" = ${p.name}`).join(', ')}.
Reply with JSON only, no prose. Either {"ok":true,"name":"short title","feature":{"type":...,<fields>,"trigger":{...},"where":[...]}} or {"ok":false,"concept":"one sentence naming the mechanic that is missing","why":"one sentence"}.
Description: """${text.slice(0, 1200)}"""`;
}
export function parseDescribed(cfg: GameConfig, raw: unknown, takenIds: string[]): { feature?: Feature; name?: string; concept?: string; errors?: string[] } {
  const o = (typeof raw === 'string' ? JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1)) : raw) as { ok?: boolean; name?: string; feature?: Record<string, unknown>; concept?: string; why?: string };
  if (!o || o.ok === false) return { concept: [o?.concept, o?.why].filter(Boolean).join(' - ') || 'This mechanic is not in the builder yet.' };
  if (!o.feature || typeof o.feature.type !== 'string' || !(o.feature.type in FEATURE_INFO)) return { errors: ['The answer did not describe a feature this builder has.'] };
  const type = o.feature.type as FeatureType;
  const base = defaultFeature(type, ['free'], takenIds);
  const f = { ...base, ...o.feature, id: base.id, trigger: (o.feature.trigger as Feature['trigger']) ?? base.trigger } as Feature;
  if (!Array.isArray(f.where) || !f.where.length) f.where = base.where;
  if (o.name) f.name = String(o.name).slice(0, 40);
  const errs = validateFeatures([f], { cells: cfg.board.reels * cfg.board.rows, symbols: [...cfg.symbols.paying, cfg.symbols.wild, cfg.symbols.scatter, cfg.symbols.multiplier], places: places(cfg).map((p) => p.id), positional: !!cfg.gameType && cfg.gameType !== 'anywhere' });
  return errs.length ? { errors: errs.map((e) => e.message) } : { feature: f, name: f.name };
}

function DescribeBox({ cfg, setCfg, onCreated, onConcept }: { cfg: GameConfig; setCfg: SetCfg; onCreated: (id: string) => void; onConcept: (c: string) => void }) {
  const [text, setText] = useState(''); const [busy, setBusy] = useState(false); const [msg, setMsg] = useState('');
  const [sample, setSample] = useState<Sample | null | undefined>(undefined);
  if (sample === undefined) { void getSample().then((s) => setSample(() => s)); return null; }
  if (!sample) return null;
  const go = async () => {
    setBusy(true); setMsg('');
    try {
      const pl = places(cfg);
      const out = sample.json ? await sample.json(describePrompt(cfg, text, pl)) : (await sample(describePrompt(cfg, text, pl))).text;
      const r = parseDescribed(cfg, out, (cfg.features ?? []).map((f) => f.id));
      if (r.feature) { setCfg(putFeature(cfg, r.feature)); onCreated(r.feature.id); }
      else if (r.concept) {
        try { const old = JSON.parse(localStorage.getItem(CONCEPTS_KEY) ?? '[]'); localStorage.setItem(CONCEPTS_KEY, JSON.stringify([...old, { text, concept: r.concept }])); } catch { /* the note below still shows it */ }
        setMsg(`The builder cannot run this yet. Missing mechanic: ${r.concept}`); onConcept(r.concept);
      } else setMsg(`Could not build that: ${(r.errors ?? []).join('; ')}`);
    } catch (e) { setMsg((e as { code?: string }).code === 'not_granted' ? 'Describing features is switched off for this page.' : 'Could not build that. Try again, or pick a feature from the catalog.'); }
    setBusy(false);
  };
  return (
    <section className="dsec" data-testid="describe-box"><h4>Describe it</h4>
      <p className="muted small">Write what the feature does in your own words. The builder picks the closest feature, fills in its settings and opens it so you can check them.</p>
      <textarea aria-label="Describe the feature" data-testid="describe-text" rows={3} value={text} placeholder="For example: from the second free spin, a wild lands after every losing spin" onChange={(e) => setText(e.target.value)} />
      <div className="row"><button className="primary" disabled={busy || text.trim().length < 8} data-testid="describe-go" onClick={go}>{busy ? 'Building...' : 'Build it'}</button></div>
      {msg && <p className="fix" data-testid="describe-msg">{msg}</p>}
    </section>
  );
}

// ---------------------------------------------------------------- add a feature
export function AddFeatureDialog({ cfg, setCfg, where, onClose, onCreated, onFreeSpins, onAnte }: { cfg: GameConfig; setCfg: SetCfg; where: string[]; onClose: () => void; onCreated: (id: string) => void; onFreeSpins?: () => void; onAnte?: () => void }) {
  const favs = useFavorites().filter((f) => f.kind === 'feature');
  const [note, setNote] = useState('');
  // a step feature (sticky wilds, hero, gadget row, ladder) added to the main game works in the base game as well as in the free spins whenever the game type allows it there
  const fs = hasFreeSpins(cfg);
  // without free spins and bonuses, a feature that works only inside a bonus has nowhere to go yet
  const homeless = (t: FeatureType) => !baseAllowed(t, cfg.gameType, cfg.tumble) && !fs && where.every((w) => w === BASE || w === 'free');
  const placeFor = (t: FeatureType, trigger?: Feature['trigger']) => (!fs && where.includes('free') ? [BASE] : !baseAllowed(t, cfg.gameType, cfg.tumble) && where.length === 1 && where[0] === BASE ? ['free'] : where.length === 1 && where[0] === 'free' && (FEATURE_INFO[t].bonusOnly || t === 'gadgetPanel') && !(trigger?.conditions ?? []).some((c) => BONUS_ONLY.includes(c.kind)) && baseAllowed(t, cfg.gameType, cfg.tumble) ? [BASE, 'free'] : where);
  const make = (t: FeatureType) => { const f = defaultFeature(t, placeFor(t), (cfg.features ?? []).map((x) => x.id)); setCfg(putFeature(cfg, f)); onCreated(f.id); };
  const doImport = async (file: File | undefined) => { if (!file) return; try { const n = importFavorites(await file.text()); setNote(`Imported ${n} favorite${n === 1 ? '' : 's'}`); } catch (e) { setNote((e as Error).message); } };
  return (
    <Drawer title="Add a feature" onClose={onClose} testid="add-feature" wide>
      <DescribeBox cfg={cfg} setCfg={setCfg} onCreated={onCreated} onConcept={() => undefined} />
      <section className="dsec"><h4>Catalog</h4>
        <ul className="tilegrid small">
          {onFreeSpins && !fs && <Tile testid="add-type-freeSpins" color="#3d86ff" title="Free spins" sub="Scatters start a round of free spins with a rising multiplier. Bonus buys need it." tags={['Bonus']} onOpen={onFreeSpins} />}
          {onAnte && !anteMode(cfg) && <Tile testid="add-type-ante" color="#ffb43a" title="Ante bet" sub="An optional higher bet; you choose what the player gets for it." tags={['Bet menu']} onOpen={onAnte} />}
          {FEATURE_ORDER.filter((t) => t !== 'shuffle' || (!!cfg.gameType && cfg.gameType !== 'anywhere')).map((t) => <Tile key={t} testid={`add-type-${t}`} color={FEATURE_INFO[t].color} title={FEATURE_INFO[t].name} sub={FEATURE_INFO[t].promise} muted={homeless(t)} tags={homeless(t) ? ['Needs free spins or a bonus'] : !baseAllowed(t, cfg.gameType, cfg.tumble) ? ['Bonus only in this game type'] : undefined} onOpen={homeless(t) ? undefined : () => make(t)} />)}
        </ul>
      </section>
      <section className="dsec"><h4>Your favorites</h4>
        {favs.length === 0 ? <p className="muted small">Nothing saved yet. Open any feature and press "Save to favorites" to keep it for other games.</p> : (
          <ul className="tilegrid small">{favs.map((f) => f.kind === 'feature' && <Tile key={f.uid} star testid={`add-fav-${f.uid}`} color={FEATURE_INFO[f.feature.type].color} title={f.name} sub={`${FEATURE_INFO[f.feature.type].name} · ${describeTrigger(f.feature.trigger)}`}
            onOpen={() => { const n = addFeatureFrom(cfg, f.feature, placeFor(f.feature.type, f.feature.trigger)); setCfg(n.cfg); onCreated(n.id); }} onUnstar={() => removeFavorite(f.uid)} />)}</ul>
        )}
        <div className="row tight">
          <button className="small" data-testid="fav-export" onClick={() => { void navigator.clipboard?.writeText(exportFavorites()).then(() => setNote('Favorites copied as JSON'), () => setNote('Copy was refused by the browser')); }}>Copy favorites</button>
          <label className="small filebtn">Import<input type="file" accept="application/json,.json" data-testid="fav-import" onChange={(e) => void doImport(e.target.files?.[0])} /></label>
          {note && <span className="muted small" role="status">{note}</span>}
        </div>
      </section>
    </Drawer>
  );
}

// ---------------------------------------------------------------- Game features
export function GameFeaturesPage({ cfg, setCfg, onNotice }: { cfg: GameConfig; setCfg: SetCfg; onNotice: (m: string) => void }) {
  const [filter, setFilter] = useState<string>('all');
  const [open, setOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [spins, setSpins] = useState(false);
  const [ante, setAnteOpen] = useState(false);
  const [dropSpins, setDropSpins] = useState(false);
  const fx = useFeatureEffects(cfg);
  const fs = hasFreeSpins(cfg);
  const pl = places(cfg);
  const list = (cfg.features ?? []).filter((f) => filter === 'all' || f.where.includes(filter));
  const nameOf = (id: string) => pl.find((p) => p.id === id)?.name ?? id;
  const effect = (f: Feature): React.ReactNode => {
    const e = fx.effects.find((x) => x.id === f.id);
    if (fx.stale || !e) return <span className="faint">measuring...</span>;
    if (f.where.some((w) => w === 'base' || w === 'free')) return <span data-testid={`feature-effect-${f.id}`}>RTP <b>{pts(e.rtp)}</b></span>;
    const first = f.where[0]; const v = e.bonus[first];
    return <span data-testid={`feature-effect-${f.id}`}>{v === undefined ? '' : <><b>{v >= 0 ? '+' : ''}{money(v)}x</b> in {nameOf(first)}</>}</span>;
  };
  const addWhere = filter === 'all' ? [fs ? 'free' : 'base'] : [filter];
  const losing = cfg.modes.filter((m) => m.isBuyBonus).map((m) => m.displayName ?? m.name);
  return (
    <div className="stack" data-testid="features-board">
      <div className="boardbar">
        <span className="chips" role="group" aria-label="Show features that work in">
          <button className={`chip ${filter === 'all' ? 'on' : ''}`} data-testid="fx-filter-all" onClick={() => setFilter('all')}>All</button>
          {pl.map((p) => <button key={p.id} className={`chip ${filter === p.id ? 'on' : ''}`} data-testid={`fx-filter-${p.id}`} onClick={() => setFilter(p.id)}>{p.name}</button>)}
        </span>
        <button className="primary" data-testid="feature-add" onClick={() => setAdding(true)}>+ Add feature</button>
      </div>
      <ul className="tilegrid" data-testid="extras-list">
        {fs && (filter === 'all' || filter === 'free') && <Tile testid="core-free-spins" color="#3d86ff" title="Free spins" sub={`${Math.min(...Object.keys(cfg.freeSpinTriggers.base).map(Number))} ${symbolLook(cfg, cfg.symbols.scatter).name} start them.${hasTumbles(cfg.gameType, cfg.tumble) ? ' Every tumble raises the multiplier by 1.' : ''}`} tags={['Bonus']} onOpen={() => setSpins(true)} />}
        {anteMode(cfg) && (filter === 'all' || filter === 'base' || filter === 'ante') && <Tile testid="core-ante" color="#ffb43a" title="Ante bet" sub={`Costs ${anteMode(cfg)!.cost}x the bet. ${getAnte(cfg)?.freeSpins ? `Free spins start about ${anteFactor(cfg) ?? '?'} times as often.` : 'You choose what it does.'}`} tags={[`On · ${anteMode(cfg)!.cost}x`, 'Bet menu']} onOpen={() => setAnteOpen(true)} />}
        {list.map((f) => {
          const info = FEATURE_INFO[f.type];
          return <Tile key={f.id} testid={`feature-${f.id}`} color={info.color} title={f.name?.trim() || info.name} sub={describeTrigger(f.trigger)} value={effect(f)} tags={f.where.map(nameOf)} onOpen={() => setOpen(f.id)} />;
        })}
      </ul>
      {list.length === 0 && !(fs && (filter === 'all' || filter === 'free')) && !(anteMode(cfg) && (filter === 'all' || filter === 'base')) && <p className="muted" data-testid="features-empty">{filter === 'all' ? 'No features yet. Add one to change how the game plays.' : `Nothing works in ${nameOf(filter)} yet.`}</p>}
      <p className="muted small">Each feature changes the game's return. The number on a tile is what that feature adds on its own, so you can see its price before you rebalance with Fix RTP in the strip above.</p>
      {adding && <AddFeatureDialog cfg={cfg} setCfg={setCfg} where={addWhere} onClose={() => setAdding(false)} onCreated={(id) => { setAdding(false); setOpen(id); }}
        onFreeSpins={() => { setCfg(setFreeSpins(cfg, true)); setAdding(false); setSpins(true); onNotice('Free spins added'); }}
        onAnte={() => { setCfg(setAnte(cfg, 2)); setAdding(false); setAnteOpen(true); }} />}
      {open && featureById(cfg, open) && <FeatureDialog cfg={cfg} setCfg={setCfg} id={open} onClose={() => setOpen(null)} onNotice={onNotice} />}
      {ante && <AnteDialog cfg={cfg} setCfg={setCfg} onClose={() => setAnteOpen(false)} onNotice={onNotice} />}
      {spins && fs && <Drawer title="Free spins" onClose={() => setSpins(false)} testid="spins-dialog" wide><FreeSpinsStep cfg={cfg} setCfg={setCfg} />
        <div className="dfoot"><button className="danger" data-testid="spins-remove" onClick={() => setDropSpins(true)}>Remove free spins</button></div></Drawer>}
      {dropSpins && <ConfirmModal title="Remove free spins?" body={`The scatter leaves the reels and the game has no free spins.${losing.length ? ` ${losing.join(', ')} ${losing.length === 1 ? 'goes' : 'go'} too: a bonus buy starts free spins.` : ''} Features that only work in free spins are removed. Undo brings it all back.`} confirmLabel="Remove free spins" ariaConfirm="Confirm remove free spins"
        onCancel={() => setDropSpins(false)} onConfirm={() => { setCfg(setFreeSpins(cfg, false)); setDropSpins(false); setSpins(false); }} />}
    </div>
  );
}

// ---------------------------------------------------------------- Purchased bonuses
export function BonusesPage({ cfg, setCfg, onNotice }: { cfg: GameConfig; setCfg: SetCfg; onNotice: (m: string) => void }) {
  const list = bonusModes(cfg);
  const [sel, setSel] = useState<string>(list[0]?.name ?? '');
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const favs = useFavorites().filter((f) => f.kind === 'bonus');
  const all = useBonusAll(cfg);
  const fx = useFeatureEffects(cfg);
  const cur = list.find((m) => m.name === sel) ?? list[0];
  const create = () => {
    const n = addBonus(cfg, name || 'Bonus'); setCfg(n); setSel(n.modes[n.modes.length - 1].name); setAdding(false); setName('');
  };
  return (
    <div className="stack" data-testid="bonuses-page">
      <div className="boardbar">
        <p className="muted">{!hasFreeSpins(cfg) ? 'A purchased bonus starts free spins straight away, and this game has none yet.' : list.length === 0 ? 'A purchased bonus lets the player pay a fixed price to skip the base game and start a bonus straight away.' : `${list.length} bonus${list.length === 1 ? '' : 'es'} for sale. Each gets a recommended price from its average win.`}</p>
        {hasFreeSpins(cfg)
          ? <button className="primary" data-testid="bonus-add" onClick={() => setAdding(true)}>+ Add bonus</button>
          : <button className="primary" data-testid="bonus-add-spins" onClick={() => { setCfg(setFreeSpins(cfg, true)); onNotice('Free spins added: now add a bonus'); }}>Add free spins first</button>}
      </div>
      {list.length > 0 && (
        <ul className="bonuscards" data-testid="bonus-cards">
          {list.map((m) => {
            const r = all.all[m.name];
            return (
              <li key={m.name}><button className={`bonuscard ${cur?.name === m.name ? 'on' : ''}`} data-testid={`bonus-card-${m.name}`} aria-pressed={cur?.name === m.name} onClick={() => setSel(m.name)}>
                <b>{m.displayName ?? m.name}</b>
                <span className="bcprice">{m.cost}x</span>
                <small>{r ? `avg ${money(r.avgWin)}x · returns ${(r.buyRtp * 100).toFixed(0)}% · recommended ${r.suggestedCost}x` : 'measuring...'}</small>
              </button></li>
            );
          })}
        </ul>
      )}
      {cur && <BonusBuilder key={cur.name} cfg={cfg} setCfg={setCfg} id={cur.name} fx={fx.effects} onRemoved={() => setSel('')} onNotice={onNotice} />}
      {adding && (
        <Drawer title="Add a bonus" onClose={() => setAdding(false)} testid="bonus-add-dialog">
          <label className="field"><span className="lab">Name</span><input autoFocus data-testid="bonus-add-name" value={name} maxLength={40} placeholder="Dawn Spins" onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && name.trim()) create(); }} /></label>
          <p className="muted small">It starts as plain free spins. Drag in perks and features, then use the recommended price.</p>
          <div className="row"><button className="primary" disabled={!name.trim()} data-testid="bonus-add-create" onClick={create}>Create bonus</button></div>
          {favs.length > 0 && <section className="dsec"><h4>Or start from a favorite</h4>
            <ul className="tilegrid small">{favs.map((f) => f.kind === 'bonus' && <Tile key={f.uid} star testid={`bonus-fav-${f.uid}`} color="#ffb43a" title={f.name} sub={`${f.bonus.features.length} feature${f.bonus.features.length === 1 ? '' : 's'}`} onUnstar={() => removeFavorite(f.uid)}
              onOpen={() => { const n = addBonusFrom(cfg, name.trim() || f.name, f.bonus.settings, f.bonus.features, COSTS.includes(f.bonus.cost) ? f.bonus.cost : 100); setCfg(n.cfg); setSel(n.id); setAdding(false); setName(''); }} />)}</ul></section>}
        </Drawer>
      )}
    </div>
  );
}
export type { FxEffect };

// ---------------------------------------------------------------- Bet options (ante bet)
export function AnteDialog({ cfg, setCfg, onClose, onNotice }: { cfg: GameConfig; setCfg: SetCfg; onClose: () => void; onNotice?: (m: string) => void }) {
  const ante = anteMode(cfg); const st = getAnte(cfg); const factor = anteFactor(cfg);
  const [adding, setAdding] = useState(false); const [open, setOpen] = useState<string | null>(null);
  const inAnte = (cfg.features ?? []).filter((f) => f.where.includes('ante'));
  const set = (p: Partial<AnteSettings>) => ante && setCfg(setAnte(cfg, ante.cost as 2 | 3, p));
  const Choice = ({ label, value, on, test }: { label: string; value: number; on: (v: number) => void; test: string }) => (
    <span className="chips" role="group" aria-label={label}>{[1, 2, 3].map((v) => <button key={v} className={`chip ${value === v ? 'on' : ''}`} data-testid={`${test}-${v}`} onClick={() => on(v)}>{v === 1 ? 'Normal' : `${v}x more`}</button>)}</span>
  );
  return (
    <Drawer title="Ante bet" onClose={onClose} testid="ante-dialog" wide>
      <section className="anteCard">
        <header><span className="muted">An optional higher bet. You choose what the player gets for the higher price.</span></header>
        <span className="chips" role="group" aria-label="Ante bet price">
          <button className={`chip ${!ante ? 'on' : ''}`} data-testid="ante-off" onClick={() => setCfg(setAnte(cfg, null))}>Off</button>
          <button className={`chip ${ante?.cost === 2 ? 'on' : ''}`} data-testid="ante-2" onClick={() => setCfg(setAnte(cfg, 2))}>Costs 2x the bet</button>
          <button className={`chip ${ante?.cost === 3 ? 'on' : ''}`} data-testid="ante-3" onClick={() => setCfg(setAnte(cfg, 3))}>Costs 3x the bet</button>
        </span>
        {ante && st ? (
          <>
            <h4 className="bbh">What it does</h4>
            <ul className="tilegrid small" data-testid="ante-effects">
              {hasFreeSpins(cfg) && <li className="ftile" style={{ '--tc': '#3d86ff' } as React.CSSProperties}><div className="ftilemain static"><span className="fbar" /><span className="fhead"><b>Free spins start more often</b><Switch checked={st.freeSpins} label="Free spins start more often" onChange={(on) => set({ freeSpins: on })} /></span>
                <span className="fsub">{st.freeSpins ? `About ${factor ?? '?'} times as often, so the higher price is paid back.` : 'Off: free spins keep their normal frequency.'}</span></div></li>}
              <li className="ftile" style={{ '--tc': '#3ddc97' } as React.CSSProperties}><div className="ftilemain static"><span className="fbar" /><span className="fhead"><b>More wilds on the reels</b></span>
                <Choice label="More wilds" value={st.wilds} on={(v) => set({ wilds: v })} test="ante-wilds" /></div></li>
              <li className="ftile" style={{ '--tc': '#7a5cff' } as React.CSSProperties}><div className="ftilemain static"><span className="fbar" /><span className="fhead"><b>Better symbols</b></span>
                <Choice label="Better symbols" value={st.symbols} on={(v) => set({ symbols: v })} test="ante-symbols" /></div></li>
            </ul>
            <h4 className="bbh">Features that work only while the ante is on</h4>
            <ul className="tilegrid small" data-testid="ante-features">
              {inAnte.map((f) => <Tile key={f.id} testid={`ante-feat-${f.id}`} color={FEATURE_INFO[f.type].color} title={f.name?.trim() || FEATURE_INFO[f.type].name} sub={describeTrigger(f.trigger)} tags={f.where.map((w) => places(cfg).find((p) => p.id === w)?.name ?? w)} onOpen={() => setOpen(f.id)} />)}
            </ul>
            <div className="row tight"><button className="small" data-testid="ante-add-feature" onClick={() => setAdding(true)}>+ Add a feature to the ante</button></div>
            <ul className="getlist" data-testid="ante-summary">
              <li><b>Players pay {ante.cost}x the bet for every spin</b> while the ante is on. They can switch it off at any time.</li>
              <li><b>The return stays at {(ante.rtp * 100).toFixed(1)}%</b>, measured against the higher price, and the biggest win is still {ante.maxWin.toLocaleString('en-US')}x.</li>
              <li>Features that work in the base game also work with the ante on. The Stake math run checks that the effects you chose can reach the return.</li>
            </ul>
          </>
        ) : <p className="muted small">Turn it on to offer 2x or 3x pricing, then choose what it does.</p>}
      </section>
      {adding && <AddFeatureDialog cfg={cfg} setCfg={setCfg} where={['ante']} onClose={() => setAdding(false)} onCreated={(id) => { setAdding(false); setOpen(id); }} />}
      {open && featureById(cfg, open) && <FeatureDialog cfg={cfg} setCfg={setCfg} id={open} onClose={() => setOpen(null)} onNotice={onNotice} />}
    </Drawer>
  );
}
