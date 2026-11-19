import { useRef, useState } from 'react';
import { boardElement, cloneElement, counterElement, defaultBoardSymbols, sceneAllAssets, imageElement, newId, shapeElement, textElement, type BoardElement, type CounterElement, type ImageElement, type SceneElement, type TextElement } from '../../model/scene';
import { defaultStyle } from '../../style/textStyle';
import { Btn, Field, NumberField, Section, TextField, cx } from './widgets';
import { useAssetUrl } from './assetUrl';
import { BoardEditor } from './BoardPanel';
import { useServices, useStore } from './services';

export function ImageSlot({ el }: { el: ImageElement }) {
  const store = useStore();
  const { images } = useServices();
  const [over, setOver] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const prev = useAssetUrl(el.asset);

  const take = async (f: File | undefined) => {
    if (!f) return;
    setErr(null); setBusy(true);
    try {
      const ref = await images.add(f, f.name);
      store.edit((s) => {
        if (!s.assets.some((a) => a.id === ref.id)) s.assets.push(ref);
        const t = s.elements.find((x) => x.id === el.id) as ImageElement | undefined;
        if (t) t.asset = ref.id;
        const used = new Set(sceneAllAssets(s));
        s.assets = s.assets.filter((a) => used.has(a.id));
      });
      store.say(`${ref.kind === 'webm' ? 'Transparent video' : 'Image'} “${f.name}” added.`, 'ok');
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <div className={cx('drop', over && 'over')} data-testid={`slot-${el.id}`}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={(e) => { e.preventDefault(); setOver(false); void take(e.dataTransfer.files[0]); }}>
      {prev.url ? (prev.video ? <video src={prev.url} autoPlay loop muted playsInline style={{ maxWidth: 140, maxHeight: 90 }} /> : <img src={prev.url} alt={`${el.name} preview`} />) : <div className="hint">{prev.error ?? 'Loading…'}</div>}
      <div className="hint">{el.asset.startsWith('builtin:') ? `Built-in: ${el.asset.slice(8)}` : 'Your upload'}</div>
      <input ref={file} type="file" hidden accept="image/png,image/webp,image/gif,image/jpeg,video/webm,.png,.webp,.gif,.webm" data-testid={`upload-${el.id}`} onChange={(e) => { void take(e.target.files?.[0]); e.target.value = ''; }} />
      <Btn small onClick={() => file.current?.click()} testId={`upload-btn-${el.id}`} disabled={busy}>{busy ? 'Reading…' : 'Upload PNG or transparent WebM…'}</Btn>
      <div className="hint">or drop a file here</div>
      {err && <div className="note err" role="alert" data-testid="upload-error">{err}</div>}
    </div>
  );
}

export function ContentPanel() {
  const store = useStore();
  const doc = store.doc!;
  const els = doc.scene.elements;
  const byId = new Map(els.map((e) => [e.id, e]));
  const editEl = <T extends SceneElement>(id: string, mut: (e: T) => void, label?: string) => store.edit((s) => { const t = s.elements.find((x) => x.id === id); if (t) mut(t as T); }, `${id}:${label ?? 'c'}`);
  const add = (el: SceneElement) => { store.edit((s) => { s.elements.push(el); }); store.select(el.id); };
  const addBehind = (el: SceneElement) => { store.edit((s) => { s.elements.unshift(el); }); store.select(el.id); };

  return (
    <div className="panel-body" data-testid="content-panel">
      <Section title="What you are changing" open testId="inputs-section">
        {doc.inputs.length === 0 && <div className="note">This effect has no text or pictures to change. Use the Effects tab to adjust it, or add text and symbols below.</div>}
        {doc.inputs.map((inp) => {
          const el = byId.get(inp.element);
          if (!el) return null;
          if (inp.kind === 'text' && el.kind === 'text') return <TextField key={el.id} label={inp.label} multi value={el.text} testId={`input-${el.id}`} onChange={(v) => editEl<TextElement>(el.id, (e) => { e.text = v; }, 'text')} />;
          if (inp.kind === 'counter' && el.kind === 'counter') return (
            <Field key={el.id} label={inp.label}>
              <div className="row">
                <div style={{ flex: 1 }}><NumberField label="From" value={el.from} onChange={(v) => editEl<CounterElement>(el.id, (e) => { e.from = v; }, 'from')} testId={`input-${el.id}-from`} /></div>
                <div style={{ flex: 1 }}><NumberField label="To" value={el.to} onChange={(v) => editEl<CounterElement>(el.id, (e) => { e.to = v; }, 'to')} testId={`input-${el.id}-to`} /></div>
              </div>
              <div className="row"><div style={{ flex: 1 }}><TextField label="Before" value={el.prefix} onChange={(v) => editEl<CounterElement>(el.id, (e) => { e.prefix = v; }, 'pre')} /></div><div style={{ flex: 1 }}><TextField label="After" value={el.suffix} onChange={(v) => editEl<CounterElement>(el.id, (e) => { e.suffix = v; }, 'suf')} /></div></div>
            </Field>
          );
          if (inp.kind === 'image' && el.kind === 'image') return <Field key={el.id} label={inp.label}><ImageSlot el={el} /></Field>;
          return null;
        })}
      </Section>

      {els.filter((e): e is BoardElement => e.kind === 'board').map((b) => (
        <Section key={b.id} title={`Reels: ${b.name}`} open testId={`reels-section-${b.id}`} hint={`${b.cols} × ${b.rows}`}>
          <BoardEditor el={b} />
        </Section>
      ))}

      <Section title="Everything in this effect" open testId="elements-section" hint={`${els.length} element${els.length === 1 ? '' : 's'}`}>
        <div className="elist">
          {els.map((e, i) => (
            <div key={e.id} className="eitem" role="button" tabIndex={0} aria-current={doc.selected === e.id} data-testid={`element-${e.id}`} onClick={() => store.select(e.id)} onKeyDown={(ev) => { if (ev.key === 'Enter') store.select(e.id); }}>
              <span className="k">{e.kind === 'image' ? e.role : e.kind}</span>
              <b>{e.kind === 'text' ? `${e.name}: ${e.text.replace(/\n/g, ' ').slice(0, 24)}` : e.name}</b>
              <button type="button" className="btn small ghost" title={e.hidden ? 'Show' : 'Hide'} aria-label={e.hidden ? 'Show element' : 'Hide element'} onClick={(ev) => { ev.stopPropagation(); editEl(e.id, (x) => { x.hidden = !x.hidden; }); }}>{e.hidden ? '◌' : '●'}</button>
              <button type="button" className="btn small ghost" title="Move earlier (further back)" disabled={i === 0} onClick={(ev) => { ev.stopPropagation(); store.edit((s) => { const a = s.elements; [a[i - 1], a[i]] = [a[i]!, a[i - 1]!]; }); }}>↑</button>
              <button type="button" className="btn small ghost" title="Move later (in front)" disabled={i === els.length - 1} onClick={(ev) => { ev.stopPropagation(); store.edit((s) => { const a = s.elements; [a[i + 1], a[i]] = [a[i]!, a[i + 1]!]; }); }}>↓</button>
              <button type="button" className="btn small ghost" title="Duplicate" onClick={(ev) => { ev.stopPropagation(); const c = cloneElement(e); c.id = newId(e.kind[0]!); c.name = `${e.name} copy`; c.x = Math.min(1, e.x + 0.04); c.y = Math.min(1, e.y + 0.04); add(c); }}>⧉</button>
              <button type="button" className="btn small ghost danger" title="Delete" aria-label={`Delete ${e.name}`} data-testid={`delete-${e.id}`} onClick={(ev) => { ev.stopPropagation(); store.edit((s) => { s.elements = s.elements.filter((x) => x.id !== e.id); s.fx = s.fx.map((f) => ({ ...f, target: f.target === e.id ? undefined : f.target, target2: f.target2 === e.id ? undefined : f.target2, frame: f.frame === e.id ? undefined : f.frame })); }); if (doc.selected === e.id) store.select(null); }}>✕</button>
            </div>
          ))}
        </div>
        <div className="chips" aria-label="Add something">
          <Btn small onClick={() => add(textElement('NEW TEXT', { name: 'Text', size: 0.12, y: 0.5, style: defaultStyle(), start: 0 }))} testId="add-text">+ Text</Btn>
          <Btn small onClick={() => add(counterElement({ name: 'Amount', size: 0.14 }))} testId="add-counter">+ Amount</Btn>
          <Btn small onClick={() => add(imageElement('builtin:star', { name: 'Symbol', size: 0.28 }))} testId="add-symbol">+ Symbol</Btn>
          <Btn small onClick={() => add(boardElement({ name: 'Reels', symbols: defaultBoardSymbols(), frame: 'builtin:tile-dark', panel: 'builtin:reel-panel', y: 0.5 }))} testId="add-reels">+ Reels</Btn>
          <Btn small onClick={() => addBehind(imageElement('builtin:tile-gold', { name: 'Symbol frame', role: 'background', size: 0.4 }))} testId="add-frame">+ Symbol frame</Btn>
          <Btn small onClick={() => add(shapeElement('plate', { name: 'Message plate', width: 1.1, height: 0.4 }))} testId="add-shape">+ Plate / banner</Btn>
          <Btn small onClick={() => add(imageElement('builtin:plate-gold', { name: 'Message background', role: 'background', width: 1.4, height: 0.7, size: 1.2 }))} testId="add-background">+ Background picture</Btn>
        </div>
        <div className="hint" style={{ color: 'var(--muted)' }}>Elements are drawn in this order; the last one is in front.</div>
      </Section>
    </div>
  );
}
