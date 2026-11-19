// "Start a new slot": a full-screen wizard (name, type, add-ons, grid, assets). The answers become a game built from the demo (newGameFrom);
// the builder then balances it and opens on the Symbols page. Files dropped on the last step go to the asset library and, where the file
// name says what it is, straight onto the symbols and the media slots.
import { useRef, useState, type CSSProperties } from 'react';
import type { GameConfig, GameType } from '../compiler/config';
import { GAME_TYPE_PRESETS, newGameFrom, pictureToDataUrl, setLook, type NewGameAnswers } from './model';
import { ACCEPT, type AssetKind, type AssetMeta } from './assets';
import { useAssets } from './library';
import { Mini, SLOT_TYPES } from './steps';
import { BoardPreview, Icon, Num } from './ui';
import start from '../examples/t1-demo.config.json';

const TYPE_OF: Record<string, GameType> = { anywhere: 'anywhere', cluster: 'cluster', paylines: 'paylines', ways: 'ways' };
const STEPS = ['Name', 'Type', 'Add-ons', 'Grid', 'Assets'] as const;
type Drop = 'symbols' | 'audio' | 'main' | 'other';
const DROPS: { id: Drop; label: string; hint: string; kinds: AssetKind[] }[] = [
  { id: 'symbols', label: 'Symbols', hint: 'Pictures in symbol order. A name with "wild" or "scatter" goes to that symbol.', kinds: ['image'] },
  { id: 'audio', label: 'Audio', hint: 'Music and sounds. Names with music, spin, win, big or bonus fill those slots.', kinds: ['audio'] },
  { id: 'main', label: 'Background, logo and frame', hint: 'And any other main art. Names with logo, background (or bg) and frame fill those slots.', kinds: ['image', 'video'] },
  { id: 'other', label: 'Other files', hint: 'Anything else: animations, data, extra art. Kept in the asset library.', kinds: ['image', 'video', 'audio', 'data'] },
];

/** Which symbol each picture goes to: named specials first, the rest in file-name order onto the paying symbols. */
export function symbolTargets(cfg: GameConfig, names: string[]): Record<string, string> {
  const out: Record<string, string> = {}; const rest: string[] = [];
  const special: [RegExp, string | undefined][] = [[/wild/i, cfg.symbols.wild], [/scatter/i, cfg.symbols.scatter], [/multi/i, cfg.symbols.multiplier]];
  for (const n of [...names].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))) {
    const hit = special.find(([re, id]) => id && re.test(n) && !Object.values(out).includes(id));
    if (hit) out[n] = hit[1]!; else rest.push(n);
  }
  rest.forEach((n, i) => { const id = cfg.symbols.paying[i]; if (id) out[n] = id; });
  return out;
}
/** Which media slot a file fills, from its name (none: it only goes to the library). */
export function mediaSlotFor(drop: Drop, name: string): string | null {
  if (drop === 'audio') return /music|theme|loop|bgm/i.test(name) ? 'music' : /big/i.test(name) ? 'sfxBigWin' : /bonus|free|trigger/i.test(name) ? 'sfxBonus' : /spin|reel/i.test(name) ? 'sfxSpin' : /win/i.test(name) ? 'sfxWin' : null;
  if (drop === 'main') return /logo/i.test(name) ? 'logo' : /background|\bbg\b|^bg|_bg|-bg/i.test(name) ? 'background' : /frame|border/i.test(name) ? 'frame' : null;
  return null;
}

export function NewGameWizard({ onCancel, onCreate }: { onCancel: () => void; onCreate: (c: GameConfig) => void }) {
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [type, setType] = useState<GameType>('anywhere');
  const [tumble, setTumble] = useState(false);
  const [bar, setBar] = useState(false);
  const [board, setBoard] = useState<[number, number]>(GAME_TYPE_PRESETS.anywhere.board);
  const [files, setFiles] = useState<Record<Drop, AssetMeta[]>>({ symbols: [], audio: [], main: [], other: [] });
  const [busy, setBusy] = useState(false); const [note, setNote] = useState('');
  const { add, blob } = useAssets();

  const answers: NewGameAnswers = { name, type, tumble, gadgetBar: bar, reels: board[0], rows: board[1] };
  const draft = newGameFrom(start as unknown as GameConfig, answers);
  const pickType = (t: GameType) => { setType(t); setBoard(GAME_TYPE_PRESETS[t].board); };
  const canNext = step !== 0 || name.trim().length > 0;
  const next = () => { if (canNext) setStep((s) => Math.min(STEPS.length - 1, s + 1)); };

  const create = async () => {
    setBusy(true);
    let c = draft;
    try {
      const targets = symbolTargets(c, files.symbols.map((f) => f.name));
      for (const f of files.symbols) {
        const id = targets[f.name]; const b = id ? await blob(f.id) : undefined;
        if (id && b) c = setLook(setLook(c, id, { image: await pictureToDataUrl(b) }), id, { asset: f.name });
      }
      for (const d of ['audio', 'main'] as const) for (const f of files[d]) {
        const slot = mediaSlotFor(d, f.name);
        if (slot && !c.media?.[slot]) c = { ...c, media: { ...(c.media ?? {}), [slot]: { id: f.id, name: f.name, kind: f.kind } } };
      }
    } catch { /* a picture that cannot be read stays in the library only */ }
    onCreate(c);
  };

  return (
    <div className="wizard" data-testid="wizard" role="dialog" aria-modal="true" aria-label="Start a new slot">
      <header className="wizhead">
        <span className="brand"><Icon name="crown" size={22} /><span className="wordmark">BANGERS</span></span>
        <ol className="wizsteps" aria-label="Steps">{STEPS.map((s, i) => <li key={s} className={i === step ? 'on' : i < step ? 'done' : ''} aria-current={i === step ? 'step' : undefined}><i>{i + 1}</i><span>{s}</span></li>)}</ol>
        <button className="ghost" onClick={onCancel} data-testid="wiz-cancel">Cancel</button>
      </header>
      <main className="wizmain">
        {step === 0 && (
          <section className="wizstep">
            <h1>Choose your slot name</h1>
            <input className="wizname" autoFocus data-testid="wiz-name" value={name} maxLength={40} placeholder="e.g. Sweet Cascade" aria-label="Slot name" onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') next(); }} />
          </section>
        )}
        {step === 1 && (
          <section className="wizstep">
            <h1>What type of slot are you designing?</h1>
            <ul className="wiztiles four" role="radiogroup" aria-label="Game type">
              {SLOT_TYPES.filter((t) => TYPE_OF[t.id]).map((t) => (
                <li key={t.id}><button className={`wiztile ${TYPE_OF[t.id] === type ? 'sel' : ''}`} role="radio" aria-checked={TYPE_OF[t.id] === type} data-testid={`wiz-type-${t.id}`} onClick={() => pickType(TYPE_OF[t.id])}>
                  <span className="wizart"><Mini art={t.art} /></span><b>{t.name}</b><small>{t.blurb}</small>
                </button></li>
              ))}
            </ul>
            <p className="wiznote">{SLOT_TYPES.find((t) => TYPE_OF[t.id] === type)?.how}</p>
          </section>
        )}
        {step === 2 && (
          <section className="wizstep">
            <h1>Add on base functionality</h1>
            <ul className="wiztiles two" aria-label="Add-ons">
              <AddOn on={bar} onChange={setBar} testid="wiz-addon-bar" art={<span className="wizbar">{Array.from({ length: 5 }, (_, i) => <i key={i} />)}</span>} title="Top feature row" text="A gadget bar above the reels. Each cell charges as you play and opens a feature." />
              <AddOn on={tumble} onChange={setTumble} testid="wiz-addon-tumble" art={<Icon name="bolt" size={26} />} title="Tumbles" text="Winning symbols disappear and new ones drop in until nothing wins. Off: each spin is paid once." />
            </ul>
            <p className="wiznote">Both can be changed later on the Game page.</p>
          </section>
        )}
        {step === 3 && (
          <section className="wizstep">
            <h1>Slot grid</h1>
            <div className="wizgrid">
              <div className="wizfields">
                <label className="field"><span className="lab">Rows</span><Num value={board[1]} min={3} max={8} step={1} label="Rows" onChange={(n) => setBoard([board[0], Math.max(3, Math.min(8, n))])} /></label>
                <label className="field"><span className="lab">Columns</span><Num value={board[0]} min={3} max={8} step={1} label="Columns" onChange={(n) => setBoard([Math.max(3, Math.min(8, n)), board[1]])} /></label>
                <small className="muted">{draft.board.reels * draft.board.rows} symbols on screen. From 3 to 8 each way.</small>
              </div>
              <div className="wizpreview"><BoardPreview cfg={draft} /></div>
            </div>
          </section>
        )}
        {step === 4 && (
          <section className="wizstep">
            <h1>Already have assets?</h1>
            <p className="wiznote top">Optional. Add files now or any time later on the Assets page.</p>
            <ul className="wiztiles four drops">
              {DROPS.map((d) => <DropTile key={d.id} drop={d} files={files[d.id]} busy={busy} onFiles={async (list) => {
                setBusy(true); setNote('');
                try {
                  const r = await add(list);
                  // a file of the wrong kind (a sound dropped on Symbols) still goes to the library, listed under Other files
                  const fits = r.added.filter((a) => d.kinds.includes(a.kind)); const wrong = r.added.filter((a) => !d.kinds.includes(a.kind));
                  setFiles((cur) => { const n = { ...cur, [d.id]: [...cur[d.id], ...fits] }; n.other = [...n.other, ...wrong]; return n; });
                  if (r.rejected.length) setNote(r.rejected.map((x) => `${x.name}: ${x.reason}`).join(' · '));
                  else if (wrong.length) setNote(`${wrong.map((w) => w.name).join(', ')} kept in the library (not a ${d.label.toLowerCase()} file).`);
                } finally { setBusy(false); }
              }} />)}
            </ul>
            {files.symbols.length > 0 && <SymbolMap cfg={draft} files={files.symbols} />}
            {note && <p className="wiznote warnText" role="status">{note}</p>}
          </section>
        )}
      </main>
      <footer className="wizfoot">
        {step > 0 ? <button className="ghost" onClick={() => setStep(step - 1)} data-testid="wiz-back">Back</button> : <span />}
        {step < STEPS.length - 1
          ? <button className="primary" disabled={!canNext} onClick={next} data-testid="wiz-next">Next</button>
          : <button className="primary" disabled={busy} onClick={() => void create()} data-testid="wiz-create">{busy ? 'Working...' : 'Create game'}</button>}
      </footer>
    </div>
  );
}

/** An add-on tile with its own switch; clicking anywhere on the tile flips it. */
function AddOn({ on, onChange, testid, art, title, text }: { on: boolean; onChange: (v: boolean) => void; testid: string; art: React.ReactNode; title: string; text: string }) {
  return (
    <li><button className={`wiztile addon ${on ? 'sel' : ''}`} role="switch" aria-checked={on} aria-label={title} data-testid={testid} onClick={() => onChange(!on)}>
      <span className="addonhead"><span className="wizart">{art}</span><span className={`switch ${on ? 'on' : ''}`} aria-hidden><i /></span></span>
      <b>{title}</b><small>{text}</small><em>{on ? 'On' : 'Off'}</em>
    </button></li>
  );
}

function DropTile({ drop, files, busy, onFiles }: { drop: (typeof DROPS)[number]; files: AssetMeta[]; busy: boolean; onFiles: (f: File[]) => void }) {
  const input = useRef<HTMLInputElement>(null); const [over, setOver] = useState(false);
  const accept = drop.id === 'symbols' ? 'image/*' : drop.id === 'audio' ? 'audio/*' : drop.id === 'main' ? 'image/*,video/*' : ACCEPT;
  return (
    <li>
      <button className={`wiztile drop ${over ? 'over' : ''} ${files.length ? 'sel' : ''}`} disabled={busy} data-testid={`wiz-drop-${drop.id}`} onClick={() => input.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={(e) => { e.preventDefault(); setOver(false); onFiles([...e.dataTransfer.files]); }}>
        <span className="wizplus" style={{ '--n': files.length } as CSSProperties}>{files.length ? <b>{files.length}</b> : <Icon name="plus" size={28} />}</span>
        <b>{drop.label}</b><small>{files.length ? files.slice(0, 3).map((f) => f.name).join(', ') + (files.length > 3 ? ` and ${files.length - 3} more` : '') : drop.hint}</small>
      </button>
      <input ref={input} type="file" multiple hidden accept={accept} data-testid={`wiz-file-${drop.id}`} onChange={(e) => { const f = [...(e.target.files ?? [])]; e.target.value = ''; if (f.length) onFiles(f); }} />
    </li>
  );
}

function SymbolMap({ cfg, files }: { cfg: GameConfig; files: AssetMeta[] }) {
  const t = symbolTargets(cfg, files.map((f) => f.name));
  return <p className="wiznote" data-testid="wiz-symbol-map">{Object.entries(t).map(([n, id]) => `${id} ← ${n}`).join(' · ')}{files.length > Object.keys(t).length ? ` · ${files.length - Object.keys(t).length} more kept in the library` : ''}</p>;
}
