import { useState } from 'react';
import type { GameConfig } from '../compiler/config';
import { FEATURE_INFO, FEATURE_ORDER, defaultFeature, describeTrigger, type Feature, type FeatureType } from '../compiler/features';
import { MULT_PRESETS, addFeatureFrom, bonusFeatureTemplates, clone, disableIn, enableIn, freeSpinMin, getBonusSettings, newFeatureId, putFeature, removeBonus, renameBonus, setBonusCost, setBonusSettings, symbolLook, type BonusSettings, type MultPreset } from './model';
import { addFavorite, favorites, removeFavorite, subscribeFavorites } from './favorites';
import { FeatureDialog } from './featuredialog';
import { useBonus } from './live';
import type { FxEffect } from './sim.worker';
import { ConfirmModal, Drawer } from './shell';
import { DropZone, Tile } from './tiles';
import { Num, Switch, type SetCfg } from './ui';
import { useSyncExternalStore } from 'react';

export const COSTS = [5, 10, 25, 50, 75, 100, 150, 200, 250, 500, 1000];
const money = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: n >= 100 ? 0 : 1 });
const PERK_COLORS: Record<string, string> = { scatters: '#3d86ff', extraSpins: '#38c8ff', startMult: '#ffb43a', multipliers: '#ff5fa8', wilds: '#3ddc97', premium: '#7a5cff', retrigger: '#f6bd4a' };
export const useFavorites = () => useSyncExternalStore(subscribeFavorites, favorites);

function Chips<T extends string | number>({ value, options, onChange, label, testPrefix }: { value: T; options: { v: T; label: string }[]; onChange: (v: T) => void; label: string; testPrefix?: string }) {
  return (
    <span className="chips" role="group" aria-label={label}>
      {options.map((o) => <button key={String(o.v)} className={`chip ${o.v === value ? 'on' : ''}`} data-testid={testPrefix ? `${testPrefix}-${o.v}` : undefined} onClick={() => onChange(o.v)}>{o.label}</button>)}
    </span>
  );
}

type PerkStatus = 'included' | 'on' | 'off';
interface PerkDef { id: string; title: string; promise: string; status: PerkStatus; toggle?: (on: boolean) => void; controls: React.ReactNode }

/** A purchased bonus: its price, the bundle perks and features inside it, and the palette to add more. */
export function BonusBuilder({ cfg, setCfg, id, fx, onRemoved, onNotice }: { cfg: GameConfig; setCfg: SetCfg; id: string; fx: FxEffect[]; onRemoved: () => void; onNotice: (m: string) => void }) {
  const [openPerk, setOpenPerk] = useState<string | null>(null);
  const [openFeature, setOpenFeature] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const favs = useFavorites();
  const bonus = cfg.modes.find((m) => m.isBuyBonus && m.name === id);
  const st = getBonusSettings(cfg, id);
  const res = useBonus(cfg, id);
  const per = cfg.scatterRule.spinsPerScatter;
  const floor = freeSpinMin(cfg);
  const sc = symbolLook(cfg, cfg.symbols.scatter).name;
  const set = (p: Partial<BonusSettings>) => setCfg(setBonusSettings(cfg, p, id));
  if (!bonus || !st) return null;
  const r = res.summary;
  const val = (pid: string) => (res.stale ? undefined : res.perks?.find((p) => p.id === pid)?.value);
  const trig = bonus.distributions.find((d) => d.criteria === 'freegame')?.conditions.scatterTriggers ?? {};
  const tt = Object.values(trig).reduce((a, b) => a + b, 0) || 1;
  const keys = Object.keys(trig).map(Number).sort((a, b) => a - b);
  const startText = keys.map((k) => `${k}${keys.length > 1 ? ` (${Math.round((trig[String(k)] / tt) * 100)}%)` : ''}`).join(' or ');
  const spinsText = keys.map((k) => k * per + (st.extraSpins ?? 0)).join(' or ');
  const mvals = Object.keys(MULT_PRESETS[st.multPreset].weights).map(Number);
  const capped = !!r && r.suggestedCost >= 1000 && r.avgWin / 1000 > bonus.rtp + 0.15;
  const verdict = r ? (capped
    ? { tone: 'warn', text: `This bonus is worth more than the highest allowed price: even at 1000x a buy pays back about ${(r.avgWin / 10).toFixed(0)}% of its price. Take something out, or use fewer perks.` }
    : r.buyRtp < bonus.rtp - 0.15 ? { tone: 'warn', text: `Priced too high for what's inside: a buy pays back about ${(r.buyRtp * 100).toFixed(0)}% of its price. Try ${r.suggestedCost}x, or add more.` }
    : r.buyRtp > bonus.rtp + 0.15 ? { tone: 'warn', text: `Priced too low for what's inside: a buy pays back about ${(r.buyRtp * 100).toFixed(0)}% of its price. Try ${r.suggestedCost}x, or take something out.` }
    : { tone: 'ok', text: `Good price: a buy pays back about ${(r.buyRtp * 100).toFixed(0)}% of its price, close to the ${(bonus.rtp * 100).toFixed(1)}% target.` }) : null;
  const core = res.core ?? 0;
  const parts = (res.perks ?? []).filter((p) => p.value > 0);
  const sum = core + parts.reduce((a, p) => a + p.value, 0) || 1;
  const defs: PerkDef[] = [
              { id: 'scatters', title: 'Guaranteed scatters', toggle: (on) => set(on ? { minScatters: floor + 1, maxScatters: floor + 1, chanceMax: 0 } : { minScatters: floor, maxScatters: floor, chanceMax: 0 }), promise: `The free spins start with more ${sc} symbols than the minimum trigger, so the bonus is never a weak ${floor}-scatter start. Without it the bonus starts with exactly ${floor}.`, status: (st.minScatters > floor || st.maxScatters > floor ? 'on' : 'off') as PerkStatus, controls: (<>
                <div className="frow"><span className="lab">Start with</span>
                  <span className="row tight"><Num w={60} min={floor} max={10} step={1} value={st.minScatters} onChange={(n) => set({ minScatters: n })} /><span className="muted">to</span><Num w={60} min={floor} max={10} step={1} value={st.maxScatters} onChange={(n) => set({ maxScatters: n })} /><span className="muted small">{sc}</span></span></div>
                {st.maxScatters > st.minScatters && <div className="frow"><span className="lab">Chance of {st.maxScatters}</span><span className="vbox"><input type="range" min={0} max={100} step={5} value={st.chanceMax} style={{ '--p': `${st.chanceMax}%` } as React.CSSProperties} aria-label={`Chance of ${st.maxScatters} scatters`} onChange={(e) => set({ chanceMax: Number(e.target.value) })} /><output>{st.chanceMax}%</output></span></div>}
                <span className="muted small">{startText} {sc} = {spinsText} free spins at the start.</span>
              </>) },
              { id: 'extraSpins', toggle: (on) => set({ extraSpins: on ? 4 : 0 }), title: 'Extra free spins', promise: "Bonus spins added on top of the scatter award. Simple, easy to understand, and always valuable.", status: st.extraSpins > 0 ? 'on' : 'off' as PerkStatus, controls: (<>
                <div className="frow"><span className="lab">Enabled</span><Switch checked={st.extraSpins > 0} onChange={(on) => set({ extraSpins: on ? 4 : 0 })} label="Extra free spins" /></div>
                {st.extraSpins > 0 && <div className="frow"><span className="lab">Extra spins</span><span className="row tight"><span className="muted">+</span><Num w={70} min={1} max={30} step={1} value={st.extraSpins} onChange={(n) => set({ extraSpins: n })} /></span></div>}
              </>) },
              { id: 'startMult', toggle: (on) => set({ startMult: on ? 2 : 1 }), title: 'Starting multiplier', promise: "Every free spin begins with the global multiplier already raised, instead of 1x. It still rises +1 on every tumble.", status: st.startMult > 1 ? 'on' : 'off' as PerkStatus, controls: (<>
                <div className="frow"><span className="lab">Enabled</span><Switch checked={st.startMult > 1} onChange={(on) => set({ startMult: on ? 2 : 1 })} label="Starting multiplier" /></div>
                {st.startMult > 1 && <div className="frow"><span className="lab">Start at</span><Chips value={st.startMult} label="Starting multiplier value" testPrefix="startmult" options={[2, 3, 5, 10].map((v) => ({ v, label: `${v}x` }))} onChange={(v) => set({ startMult: v })} /></div>}
              </>) },
              { id: 'multipliers', toggle: (on) => set(on ? { multBoost: 2 } : { multPreset: 'standard', multBoost: 1 }), title: 'Multiplier symbols', promise: "Multiplier symbols add their value to the spin win. Choose how big they are and how often they land.", status: st.multPreset !== 'standard' || st.multBoost > 1 ? 'on' : 'off' as PerkStatus, controls: (<>
                <div className="frow"><span className="lab">Values</span><Chips value={st.multPreset} label="Multiplier values" testPrefix="mult" options={(Object.keys(MULT_PRESETS) as MultPreset[]).map((k) => ({ v: k, label: MULT_PRESETS[k].name }))} onChange={(v) => set({ multPreset: v })} /></div>
                <span className="muted small">{MULT_PRESETS[st.multPreset].blurb}</span>
                <div className="frow"><span className="lab">Frequency</span><Chips value={st.multBoost} label="Multiplier frequency" testPrefix="boost" options={[1, 2, 3, 5].map((v) => ({ v, label: v === 1 ? 'Normal' : `${v}x more` }))} onChange={(v) => set({ multBoost: v })} /></div>
              </>) },
              { id: 'wilds', toggle: (on) => set({ wildBoost: on ? 2 : 1 }), title: 'Extra wilds', promise: "More wilds on the free-spin reels, so wins form more often and clusters grow bigger.", status: st.wildBoost > 1 ? 'on' : 'off' as PerkStatus, controls: (<>
                <div className="frow"><span className="lab">Wilds</span><Chips value={st.wildBoost} label="Wild frequency" testPrefix="wild" options={[1, 2, 3, 5].map((v) => ({ v, label: v === 1 ? 'Normal' : `${v}x more` }))} onChange={(v) => set({ wildBoost: v })} /></div>
              </>) },
              { id: 'premium', toggle: (on) => set({ premiumBoost: on ? 2 : 1 }), title: 'Better symbols', promise: "High-pay symbols land more often on the free-spin reels, so the typical win is bigger.", status: st.premiumBoost > 1 ? 'on' : 'off' as PerkStatus, controls: (<>
                <div className="frow"><span className="lab">High-pay symbols</span><Chips value={st.premiumBoost} label="High-pay symbol frequency" testPrefix="premium" options={[1, 2, 3].map((v) => ({ v, label: v === 1 ? 'Normal' : `${v}x more` }))} onChange={(v) => set({ premiumBoost: v })} /></div>
              </>) },
              { id: 'retrigger', toggle: (on) => set({ scatterBoost: on ? 2 : 1 }), title: 'More retriggers', promise: "More scatters on the free-spin reels, so extra spins are won more often during the bonus.", status: st.scatterBoost > 1 ? 'on' : 'off' as PerkStatus, controls: (<>
                <div className="frow"><span className="lab">Scatters</span><Chips value={st.scatterBoost} label="Scatter frequency in free spins" testPrefix="scatterboost" options={[1, 2, 3].map((v) => ({ v, label: v === 1 ? 'Normal' : `${v}x more` }))} onChange={(v) => set({ scatterBoost: v })} /></div>
              </>) },
  ];
  const openDef = defs.find((d) => d.id === openPerk);
  const inside = (cfg.features ?? []).filter((f) => f.where.includes(id));
  const outside = (cfg.features ?? []).filter((f) => !f.where.includes(id));
  const bonusFavs = favs.filter((f) => f.kind === 'feature');
  const effectOf = (fid: string) => fx.find((e) => e.id === fid)?.bonus[id];
  const open = (fid: string) => setOpenFeature(fid);

  const addToken = (tok: string) => {
    const [kind, ref] = [tok.slice(0, tok.indexOf(':')), tok.slice(tok.indexOf(':') + 1)];
    if (kind === 'perk') defs.find((d) => d.id === ref)?.toggle?.(true);
    else if (kind === 'feat') setCfg(enableIn(cfg, ref, id));
    else if (kind === 'type') { const f = defaultFeature(ref as FeatureType, [id], (cfg.features ?? []).map((x) => x.id)); setCfg(putFeature(cfg, f)); open(f.id); }
    else if (kind === 'fav') { const fav = favs.find((x) => x.uid === ref); if (fav?.kind === 'feature') { const n = addFeatureFrom(cfg, fav.feature, [id]); setCfg(n.cfg); open(n.id); } }
  };
  const perkTile = (p: PerkDef, inBundle: boolean) => {
    const v = val(p.id);
    return <Tile key={p.id} testid={inBundle ? `perk-${p.id}` : `pal-perk-${p.id}`} color={PERK_COLORS[p.id]} title={p.title} sub={inBundle ? p.promise : undefined}
      value={inBundle ? (v === undefined ? <span className="faint">measuring...</span> : <span data-testid={`perkvalue-${p.id}`}>{v >= 0 ? '+' : ''}{money(v)}x</span>) : undefined}
      onOpen={inBundle ? () => setOpenPerk(p.id) : undefined} onRemove={inBundle && p.toggle ? () => p.toggle!(false) : undefined} removeLabel={`Take ${p.title} out`}
      onAdd={!inBundle ? () => p.toggle?.(true) : undefined} addLabel={`Add ${p.title}`} drag={!inBundle ? `perk:${p.id}` : undefined} />;
  };
  const featureTile = (f: Feature, inBundle: boolean) => {
    const info = FEATURE_INFO[f.type]; const e = effectOf(f.id);
    return <Tile key={f.id} testid={inBundle ? `feat-${f.id}` : `pal-feat-${f.id}`} color={info.color} title={f.name?.trim() || info.name}
      sub={describeTrigger(f.trigger)} value={inBundle ? (e === undefined ? <span className="faint">measuring...</span> : <span data-testid={`feat-value-${f.id}`}>{e >= 0 ? '+' : ''}{money(e)}x</span>) : undefined}
      onOpen={inBundle ? () => open(f.id) : undefined} onRemove={inBundle ? () => setCfg(disableIn(cfg, f.id, id)) : undefined} removeLabel={`Take ${f.name?.trim() || info.name} out of this bonus`}
      onAdd={!inBundle ? () => setCfg(enableIn(cfg, f.id, id)) : undefined} drag={!inBundle ? `feat:${f.id}` : undefined} />;
  };
  const pctOf = (x: number) => `${(x * 100).toFixed(0)}%`;

  return (
    <div className="bb" data-testid={`bonus-builder`}>
      <section className="bbhero">
        <div className="bbprice">
          <label className="lab" htmlFor="bonus-name">Name</label>
          <input id="bonus-name" data-testid="bonus-name" value={bonus.displayName ?? bonus.name} maxLength={40} onChange={(e) => setCfg(renameBonus(cfg, id, e.target.value))} />
          <span className="lab">Price</span>
          <select value={bonus.cost} aria-label="Bonus price" data-testid="bonus-price" onChange={(e) => setCfg(setBonusCost(cfg, id, Number(e.target.value)))}>
            {!COSTS.includes(bonus.cost) && <option value={bonus.cost}>{bonus.cost}x (not allowed)</option>}
            {COSTS.map((v) => <option key={v} value={v}>{v}x the bet</option>)}
          </select>
          {r && <span className="recprice" data-testid="bonus-recommended">Recommended price <b>{r.suggestedCost}x</b></span>}
          {r && r.suggestedCost !== bonus.cost && <button className="primary" onClick={() => setCfg(setBonusCost(cfg, id, r.suggestedCost))} data-testid="bonus-suggest">Use {r.suggestedCost}x</button>}
        </div>
        <div className="bbkpis" data-testid="bonus-results" data-stale={res.stale ? '1' : '0'}>
          <div><span className="metric-label">Average win</span><b data-testid="bonus-avg">{r ? `${money(r.avgWin)}x` : '...'}</b><small>per purchase, x bet</small></div>
          <div><span className="metric-label">Return at this price</span><b data-testid="bonus-rtp">{r ? `${(r.buyRtp * 100).toFixed(1)}%` : '...'}</b><small>average win / price</small></div>
          <div><span className="metric-label">Wins the price back</span><b>{r ? pctOf(r.backRate) : '...'}</b><small>of purchases</small></div>
        </div>
        {verdict && <p className={`bbverdict ${verdict.tone === 'ok' ? 'tip' : 'fix'}`} data-testid="bonus-verdict">{res.stale ? 'Updating... ' : ''}{verdict.text}</p>}
      </section>

      <div className="builder">
        <section>
          <h4 className="bbh">In this bonus</h4>
          <DropZone testid="bonus-zone" onDropToken={addToken} empty={null}>
            <ul className="tilegrid">
              {defs.filter((d) => d.status !== 'off').map((d) => perkTile(d, true))}
              {inside.map((f) => featureTile(f, true))}
            </ul>
            <p className="dropnote">Drop tiles here, or press + on a tile.</p>
          </DropZone>
        </section>
        <section>
          <h4 className="bbh">Add to this bonus</h4>
          <div className="palette" data-testid="bonus-palette">
            <h5>Bundle perks</h5>
            <ul className="tilegrid small">{defs.filter((d) => d.status === 'off').map((d) => perkTile(d, false))}{defs.every((d) => d.status !== 'off') && <li className="faint">Every perk is in.</li>}</ul>
            <h5>Features</h5>
            <ul className="tilegrid small">
              {outside.map((f) => featureTile(f, false))}
              {FEATURE_ORDER.filter((t) => t !== 'shuffle' || (!!cfg.gameType && cfg.gameType !== 'anywhere')).map((t) => <Tile key={t} testid={`pal-type-${t}`} color={FEATURE_INFO[t].color} title={FEATURE_INFO[t].name} sub={FEATURE_INFO[t].promise} onAdd={() => addToken(`type:${t}`)} addLabel={`Add a new ${FEATURE_INFO[t].name}`} drag={`type:${t}`} />)}
            </ul>
            {bonusFavs.length > 0 && <><h5>Your favorites</h5>
              <ul className="tilegrid small">{bonusFavs.map((f) => f.kind === 'feature' && <Tile key={f.uid} star testid={`pal-fav-${f.uid}`} color={FEATURE_INFO[f.feature.type].color} title={f.name} sub={FEATURE_INFO[f.feature.type].name} onAdd={() => addToken(`fav:${f.uid}`)} drag={`fav:${f.uid}`} onUnstar={() => removeFavorite(f.uid)} />)}</ul></>}
          </div>
        </section>
      </div>

      <details className="adv bbmore"><summary>Bundle summary and where the value comes from</summary>
        <p className="muted small">Typical win {r ? `${money(r.median)}x` : '...'} (half of buys pay more) · {r ? r.avgSpins.toFixed(1) : '...'} free spins on average · biggest win seen {r ? `${money(r.maxSeen)}x` : '...'} of a {bonus.maxWin.toLocaleString('en-US')}x cap.</p>
        <section className="bbsum">
          <div>
            <h4 className="bbh">What the player gets</h4>
            <ol className="getlist" data-testid="bonus-gets">
              <li><b>Pays {bonus.cost}x the bet.</b> At a $1.00 bet that is ${bonus.cost.toFixed(2)}.</li>
              <li><b>Skips the base game.</b> The free spins start immediately.</li>
              <li><b>Starts with {startText} {sc} symbols</b>, so {spinsText} free spins to begin with{st.extraSpins > 0 ? ` (including ${st.extraSpins} extra)` : ''}.</li>
              <li><b>{st.startMult > 1 ? `Every spin starts at ${st.startMult}x.` : 'Multiplier rules.'}</b> The multiplier rises +1 on every tumble. Multiplier symbols are worth {mvals[0]}x to {mvals[mvals.length - 1]}x{st.multBoost > 1 ? ` and land ${st.multBoost}x as often` : ''}.</li>
              {(st.wildBoost > 1 || st.premiumBoost > 1 || st.scatterBoost > 1) && <li><b>Richer reels.</b> {[st.wildBoost > 1 ? `${st.wildBoost}x more wilds` : '', st.premiumBoost > 1 ? `${st.premiumBoost}x more high-pay symbols` : '', st.scatterBoost > 1 ? `${st.scatterBoost}x more scatters` : ''].filter(Boolean).join(', ')} during the free spins.</li>}
              {inside.map((f) => <li key={f.id}><b>{f.name?.trim() || FEATURE_INFO[f.type].name}.</b> {describeTrigger(f.trigger)}</li>)}
              <li><b>Retriggers</b> work as in normal free spins.</li>
              <li><b>Paid in full</b>, up to the {bonus.maxWin.toLocaleString('en-US')}x max win.</li>
            </ol>
          </div>
          <div>
            <h4 className="bbh">Where the value comes from</h4>
            {r ? (
              <div className="valuebar" data-testid="value-breakdown">
                <div className="vtrack" aria-hidden>
                  <i style={{ width: `${(core / sum) * 100}%`, background: '#2b3f70' }} />
                  {parts.map((p) => <i key={p.id} style={{ width: `${(p.value / sum) * 100}%`, background: PERK_COLORS[p.id] }} />)}
                </div>
                <ul>
                  <li><span className="perkdot" style={{ background: '#2b3f70' }} />Plain free spins ({floor} scatters, no perks) <b>{money(core)}x</b></li>
                  {(res.perks ?? []).map((p) => <li key={p.id}><span className="perkdot" style={{ background: PERK_COLORS[p.id] }} />{p.name} <b>{p.value >= 0 ? '+' : ''}{money(p.value)}x</b></li>)}
                </ul>
                <p className="muted small">Each perk is measured by simulating the bundle with and without it. Perks stack, so the parts add up to more than the total average win of {money(r.avgWin)}x; the bar shows each part's share. Features are measured on their own in their tiles.</p>
              </div>
            ) : <p className="muted">Calculating...</p>}
          </div>
        </section>
      </details>

      <footer className="bbfoot">
        <button data-testid="bonus-favorite" onClick={() => { addFavorite({ kind: 'bonus', name: bonus.displayName ?? bonus.name, bonus: { settings: st, features: bonusFeatureTemplates(cfg, id), cost: bonus.cost } }); onNotice('Bonus saved to favorites'); }}>☆ Save this bonus to favorites</button>
        <button className="danger" data-testid="bonus-remove" onClick={() => setConfirm(true)}>Remove this bonus</button>
      </footer>

      {openDef && <Drawer title={openDef.title} onClose={() => setOpenPerk(null)} testid="perk-drawer"><p className="muted">{openDef.promise}</p><div className="perkctl">{openDef.controls}</div><p className="muted small" data-testid="perk-drawer-value">{r ? `Bundle average win: ${money(r.avgWin)}x · returns ${(r.buyRtp * 100).toFixed(0)}% of the price` : 'Calculating...'}</p></Drawer>}
      {openFeature && <FeatureDialog cfg={cfg} setCfg={setCfg} id={openFeature} onClose={() => setOpenFeature(null)} onNotice={onNotice} />}
      {confirm && <ConfirmModal title={`Remove ${bonus.displayName ?? bonus.name}?`} body="The bonus and its price are deleted. Features that only worked in this bonus are removed too." confirmLabel="Remove" ariaConfirm="Confirm remove bonus" onCancel={() => setConfirm(false)} onConfirm={() => { setCfg(removeBonus(cfg, id)); setConfirm(false); onRemoved(); }} />}
    </div>
  );
}
