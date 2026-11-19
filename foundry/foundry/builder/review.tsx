import { useEffect, useMemo, useState } from 'react';
import type { GameConfig, Issue } from '../compiler/config';
import { buildStrings, buildSocialStrings, restrictedHits, renderRulesMarkdown } from '../compiler/rules';
import { FEELS, SPIN_STYLES, applyFeel, addPaying, clone, freeSpinMin, frequency, nextSymbolId, parseConfig, rangeLabel, rangeStarts, removePaying, safeValidate, sectionOf, setFreeSpinRule, setFrequency, setLook, setPayLevel, setRangeStarts, setReturn, symbolLook, pictureToDataUrl } from './model';
import start from '../examples/t1-demo.config.json';

export function PasteStart({ onConfig }: { onConfig: (c: GameConfig) => void }) {
  const [text, setText] = useState('');
  const [err, setErr] = useState('');
  return (
    <details className="paste"><summary>I already have a config</summary>
      <textarea className="json small" spellCheck={false} value={text} placeholder="Paste a Foundry config JSON here" aria-label="Paste config JSON" onChange={(e) => setText(e.target.value)} />
      {err && <p className="fix">{err}</p>}
      <div className="row"><button onClick={() => { const p = parseConfig(text); if (p.config) onConfig(p.config); else setErr(p.error ?? ''); }}>Use this config</button></div>
    </details>
  );
}

export function ReviewStep({ cfg, setCfg, issues, errors, goto, copy }: { cfg: GameConfig; setCfg: (c: GameConfig) => void; issues: Issue[]; errors: number; goto: (path: string) => void; copy: (t: string, w: string) => void }) {
  return (
    <>
      <div className={`card ${errors ? 'badcard' : 'okcard'}`}>
        <h3>{errors ? `${errors} thing${errors > 1 ? 's' : ''} to fix before you can export` : 'Ready to export'}</h3>
        {issues.length === 0 ? <p className="muted">All checks pass.</p> : (
          <ul className="issues">
            {issues.map((i, n) => <li key={n} className={i.level}><code>{i.path}</code><span>{i.message}</span><button onClick={() => goto(i.path)}>Go to this step</button></li>)}
          </ul>
        )}
        <div className="row"><button className="primary" disabled={!!errors} onClick={() => copy(JSON.stringify(cfg, null, 2), 'Config JSON')}>Copy config JSON</button></div>
      </div>
      <h2>Rules text</h2>
      <RulesTab cfg={cfg} copy={copy} />
      <h2>Config JSON</h2>
      <JsonTab cfg={cfg} setCfg={setCfg} />
    </>
  );
}

export function RulesTab({ cfg, copy }: { cfg: GameConfig; copy: (t: string, w: string) => void }) {
  const text = useMemo(() => { try { const s = buildStrings(cfg); return { md: renderRulesMarkdown(cfg, s), social: restrictedHits(buildSocialStrings(s, cfg)) }; } catch (e) { return { md: `Rules text needs a complete config: ${(e as Error).message}`, social: [] }; } }, [cfg]);
  return (
    <>
      <p className="muted">The player-facing rules, generated from the design. Change a number on any screen and this updates.</p>
      <div className="row"><button onClick={() => copy(text.md, 'Rules text')}>Copy rules text</button></div>
      <p className={text.social.length ? 'fix' : 'muted'}>{text.social.length ? `Stake.US wording check: ${text.social.length} string(s) still contain restricted terms.` : 'Stake.US wording check: the sweepstakes version of every string passes the restricted-term scan.'}</p>
      <pre className="doc">{text.md}</pre>
    </>
  );
}

export function JsonTab({ cfg, setCfg }: { cfg: GameConfig; setCfg: (c: GameConfig) => void }) {
  const json = JSON.stringify(cfg, null, 2);
  const [text, setText] = useState(json);
  const [err, setErr] = useState('');
  useEffect(() => { setText(json); }, [json]);
  return (
    <>
      <p className="muted">The full config, including reel sets per criteria, multiplier values and optimiser targets. Edit it here or paste one in; it applies when it parses.</p>
      <textarea className="json" spellCheck={false} value={text} onChange={(e) => { setText(e.target.value); const p = parseConfig(e.target.value); if (p.config) { setErr(''); setCfg(p.config); } else setErr(p.error ?? ''); }} aria-label="Config JSON" />
      {err && <p className="fix">{err}</p>}
      <div className="row"><button onClick={() => { setCfg(clone(start as unknown as GameConfig)); }}>Reset to the demo game</button></div>
    </>
  );
}

