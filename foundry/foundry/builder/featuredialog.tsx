// The dialog that edits one special feature: its name, where it works, when it fires (the trigger) and its own settings.
import { useState } from 'react';
import type { GameConfig } from '../compiler/config';
import { BASE, baseAllowed, CONDITION_INFO, FEATURE_INFO, defaultCondition, describeTrigger, type Condition, type ConditionKind, type Feature } from '../compiler/features';
import { FeatureControls } from './featurecontrols';
import { addFavorite } from './favorites';
import { dropFeature, featureById, places, putFeature, symbolLook } from './model';
import { ConfirmModal, Drawer, Hint } from './shell';
import { Icon, Num, type SetCfg } from './ui';

const CONDITION_ORDER: ConditionKind[] = ['chance', 'scatters', 'symbols', 'spinIs', 'prevSpin', 'streak', 'bonusWin', 'spinsLeft'];

/** Where this feature works: tick the base game, the free spins and any purchased bonus. */
export function WherePicker({ cfg, f, onChange }: { cfg: GameConfig; f: Feature; onChange: (where: string[]) => void }) {
  const info = FEATURE_INFO[f.type];
  const list = places(cfg);
  const toggle = (id: string) => onChange(f.where.includes(id) ? f.where.filter((w) => w !== id) : [...f.where, id]);
  const bonuses = list.filter((p) => p.kind !== 'base').map((p) => p.id);
  return (
    <div className="wherepick" role="group" aria-label="Where this feature works">
      {list.map((p) => {
        const off = p.kind === 'base' && !baseAllowed(f.type, cfg.gameType, cfg.tumble);
        return (
          <label key={p.id} className={`wherechip ${f.where.includes(p.id) ? 'on' : ''} ${off ? 'off' : ''}`} title={off ? `${info.name} needs steps inside a round; this game type has no tumbles in the base game, so it works inside a bonus only` : undefined}>
            <input type="checkbox" data-testid={`where-${p.id}`} checked={f.where.includes(p.id)} disabled={off} onChange={() => toggle(p.id)} />{p.name}
          </label>
        );
      })}
      {bonuses.length > 1 && <button className="linkbtn" data-testid="where-all-bonuses" onClick={() => onChange([...f.where.filter((w) => w === BASE), ...bonuses])}>All bonuses</button>}
    </div>
  );
}

function ConditionRow({ cfg, f, c, onChange, onRemove, index }: { cfg: GameConfig; f: Feature; c: Condition; onChange: (c: Condition) => void; onRemove: () => void; index: number }) {
  const inBase = f.where.includes(BASE);
  const symbols = [...cfg.symbols.paying, cfg.symbols.wild, cfg.symbols.multiplier];
  const num = (v: number, set: (n: number) => void, min: number, max: number, label: string, w = 70) => <Num w={w} min={min} max={max} step={1} value={v} label={label} onChange={(n) => set(Math.round(n))} />;
  return (
    <li className="condrow" data-testid={`trig-row-${index}`}>
      <select aria-label={`Condition ${index + 1} type`} data-testid={`trig-kind-${index}`} value={c.kind} onChange={(e) => onChange(defaultCondition(e.target.value as ConditionKind))}>
        {CONDITION_ORDER.map((k) => <option key={k} value={k} disabled={inBase && CONDITION_INFO[k].bonusOnly}>{CONDITION_INFO[k].name}{inBase && CONDITION_INFO[k].bonusOnly ? ' (bonus only)' : ''}</option>)}
      </select>
      <span className="condparams">
        {c.kind === 'chance' && <><Num w={80} min={1} max={100} step={1} value={Math.round(c.p * 100)} label={`Condition ${index + 1} chance (%)`} onChange={(n) => onChange({ ...c, p: Math.min(1, Math.max(0.01, n / 100)) })} /><span className="muted">% of spins</span></>}
        {c.kind === 'scatters' && <><span className="muted">at least</span>{num(c.min, (n) => onChange({ ...c, min: n, max: c.max !== undefined ? Math.max(c.max, n) : undefined }), 1, 12, `Condition ${index + 1} scatters at least`)}
          <label className="inl"><input type="checkbox" checked={c.max !== undefined} onChange={(e) => onChange({ ...c, max: e.target.checked ? c.min : undefined })} />but at most</label>
          {c.max !== undefined && num(c.max, (n) => onChange({ ...c, max: Math.max(c.min, n) }), c.min, 12, `Condition ${index + 1} scatters at most`)}</>}
        {c.kind === 'symbols' && <><select aria-label={`Condition ${index + 1} symbol`} value={c.symbol} onChange={(e) => onChange({ ...c, symbol: e.target.value })}><option value="">Choose a symbol</option>{symbols.map((s) => <option key={s} value={s}>{symbolLook(cfg, s).name}</option>)}</select><span className="muted">at least</span>{num(c.min, (n) => onChange({ ...c, min: n }), 1, 30, `Condition ${index + 1} symbol count`)}</>}
        {c.kind === 'spinIs' && <><select aria-label={`Condition ${index + 1} spin`} value={c.which} onChange={(e) => onChange({ ...c, which: e.target.value as 'first', n: e.target.value === 'every' ? 3 : e.target.value === 'from' ? 2 : undefined })}><option value="first">The first free spin</option><option value="last">The last free spin</option><option value="every">Every Nth free spin</option><option value="from">From free spin N</option></select>
          {(c.which === 'every' || c.which === 'from') && num(c.n ?? 2, (n) => onChange({ ...c, n }), c.which === 'every' ? 2 : 1, 100, `Condition ${index + 1} spin number`)}</>}
        {c.kind === 'prevSpin' && <><select aria-label={`Condition ${index + 1} previous spin`} value={c.result} onChange={(e) => onChange({ ...c, result: e.target.value as 'win', x: e.target.value === 'big' ? 10 : undefined })}><option value="loss">Lost (paid nothing)</option><option value="win">Won</option><option value="big">Won big</option></select>
          {c.result === 'big' && <><span className="muted">at least</span>{num(c.x ?? 10, (n) => onChange({ ...c, x: n }), 1, 5000, `Condition ${index + 1} big win (x bet)`, 84)}<span className="muted">x bet</span></>}</>}
        {c.kind === 'streak' && <>{num(c.n, (n) => onChange({ ...c, n }), 2, 20, `Condition ${index + 1} streak length`)}<select aria-label={`Condition ${index + 1} streak type`} value={c.of} onChange={(e) => onChange({ ...c, of: e.target.value as 'win' })}><option value="loss">losing spins in a row</option><option value="win">winning spins in a row</option></select></>}
        {c.kind === 'bonusWin' && <><span className="muted">at least</span>{num(c.atLeast, (n) => onChange({ ...c, atLeast: n }), 1, 5000, `Condition ${index + 1} bonus win (x bet)`, 84)}<span className="muted">x bet won so far</span></>}
        {c.kind === 'spinsLeft' && <><span className="muted">at most</span>{num(c.atMost, (n) => onChange({ ...c, atMost: n }), 0, 50, `Condition ${index + 1} spins left`)}<span className="muted">spins left</span></>}
      </span>
      <button className="iconbtn" aria-label={`Remove condition ${index + 1}`} data-testid={`trig-remove-${index}`} onClick={onRemove}><Icon name="close" size={14} /></button>
    </li>
  );
}

/** When the feature fires on a spin: a list of conditions that must all be true (or any of them). No conditions = every spin. */
export function TriggerEditor({ cfg, f, onChange }: { cfg: GameConfig; f: Feature; onChange: (t: Feature['trigger']) => void }) {
  const t = f.trigger; const inBase = f.where.includes(BASE);
  const setC = (i: number, c: Condition) => onChange({ ...t, conditions: t.conditions.map((x, k) => (k === i ? c : x)) });
  return (
    <div className="triggered" data-testid="trigger-editor">
      {t.conditions.length >= 2 && (
        <span className="chips" role="group" aria-label="How the conditions combine">
          {([['all', 'All of these'], ['any', 'Any of these']] as const).map(([v, label]) => <button key={v} className={`chip ${t.match === v ? 'on' : ''}`} data-testid={`trig-match-${v}`} onClick={() => onChange({ ...t, match: v })}>{label}</button>)}
        </span>
      )}
      {t.conditions.length > 0 && <ol className="condlist">{t.conditions.map((c, i) => <ConditionRow key={i} index={i} cfg={cfg} f={f} c={c} onChange={(x) => setC(i, x)} onRemove={() => onChange({ ...t, conditions: t.conditions.filter((_, k) => k !== i) })} />)}</ol>}
      {t.conditions.length < 8 && (
        <select aria-label="Add a condition" data-testid="trig-add" value="" onChange={(e) => { if (e.target.value) onChange({ ...t, conditions: [...t.conditions, defaultCondition(e.target.value as ConditionKind)] }); }}>
          <option value="">+ Add a condition</option>
          {CONDITION_ORDER.map((k) => <option key={k} value={k} disabled={inBase && CONDITION_INFO[k].bonusOnly}>{CONDITION_INFO[k].name}{inBase && CONDITION_INFO[k].bonusOnly ? ' (bonus only)' : ''}</option>)}
        </select>
      )}
      <p className="trigsum" data-testid="trigger-summary"><b>Fires:</b> {describeTrigger(t)}</p>
      <p className="muted small">Conditions look at the spin as it was drawn, before any feature changes it. {inBase ? 'The base game keeps nothing between rounds, so conditions about earlier spins are only for bonuses.' : 'Spin counts, streaks and win totals are counted inside the bonus.'}</p>
    </div>
  );
}

export function FeatureDialog({ cfg, setCfg, id, onClose, onNotice }: { cfg: GameConfig; setCfg: SetCfg; id: string; onClose: () => void; onNotice?: (m: string) => void }) {
  const f = featureById(cfg, id);
  const [confirm, setConfirm] = useState(false);
  if (!f) return null;
  const info = FEATURE_INFO[f.type];
  const update = (patch: Partial<Feature>) => setCfg(putFeature(cfg, { ...f, ...patch } as Feature));
  const dup = () => {
    let n = 2; const ids = (cfg.features ?? []).map((x) => x.id);
    while (ids.includes(`${f.type}${n}`)) n++;
    setCfg(putFeature(cfg, { ...JSON.parse(JSON.stringify(f)), id: `${f.type}${n}`, name: `${f.name ?? info.name} copy` } as Feature));
    onClose();
  };
  return (
    <>
      <Drawer title={f.name?.trim() || info.name} onClose={onClose} testid="feature-dialog" wide>
        <p className="muted">{info.promise}</p>
        <section className="dsec"><h4>Name</h4>
          <input aria-label="Feature name" data-testid="feature-name" value={f.name ?? ''} placeholder={info.name} onChange={(e) => update({ name: e.target.value || undefined })} /></section>
        <section className="dsec"><h4>Where it works<Hint title="Where it works">The base game, the free spins that scatters trigger, and any purchased bonus. Tick as many as you like.</Hint></h4>
          <WherePicker cfg={cfg} f={f} onChange={(where) => update({ where })} /></section>
        <section className="dsec"><h4>When it fires<Hint title="When it fires">A trigger is a list of conditions tested on every spin. With no conditions the feature works on every spin.</Hint></h4>
          <TriggerEditor cfg={cfg} f={f} onChange={(trigger) => update({ trigger })} /></section>
        <section className="dsec"><h4>Settings</h4><div className="perkctl"><FeatureControls cfg={cfg} f={f} update={update} /></div></section>
        <footer className="dfoot">
          <button data-testid="feature-favorite" onClick={() => { addFavorite({ kind: 'feature', name: f.name?.trim() || info.name, feature: (({ id: _i, where: _w, ...rest }) => rest)(f) }); onNotice?.('Saved to favorites'); }}>☆ Save to favorites</button>
          <button data-testid="feature-duplicate" onClick={dup}>Duplicate</button>
          <button className="danger" data-testid="feature-remove" onClick={() => setConfirm(true)}>Remove</button>
        </footer>
      </Drawer>
      {confirm && <ConfirmModal title={`Remove ${f.name?.trim() || info.name}?`} body="It stops working everywhere in this game. You can add it again from the catalog." confirmLabel="Remove" ariaConfirm={`Confirm remove ${f.name?.trim() || info.name}`} onCancel={() => setConfirm(false)} onConfirm={() => { setCfg(dropFeature(cfg, f.id)); onClose(); }} />}
    </>
  );
}
