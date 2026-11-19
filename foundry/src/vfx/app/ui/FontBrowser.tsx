import { useEffect, useMemo, useRef, useState } from 'react';
import { FONT_CATEGORIES, getFamily, searchFonts, type FontCategoryId, type FontFamilyMeta, type FontSpec, type FontStyle } from '../../fonts/catalog';
import { CUSTOM_FONT_DISCLAIMER, cssFamilyOf, isAbort, isCustomFontId } from '../../fonts/service';
import { addCustomFont, familyFromFileName, removeCustomFont } from '../customFonts';
import { Btn, Select, Slider, cx } from './widgets';
import { useFontsState, useServices, useStore } from './services';

const ROW = 68;

interface Item { id: string; name: string; custom: boolean; meta: FontFamilyMeta | null; weights: number[]; styles: FontStyle[] }

export interface FontBrowserProps {
  value: FontSpec;
  /** What the person is typing: shown in every row. */
  text: string;
  size: number; letterSpacing: number; lineSpacing: number;
  onPick(spec: FontSpec): void;
  onTypography(patch: { size?: number; letterSpacing?: number; lineSpacing?: number }): void;
  onClose(): void;
}

export function FontBrowser(p: FontBrowserProps) {
  const fonts = useFontsState();
  const { images } = useServices();
  const store = useStore();
  const [query, setQuery] = useState('');
  const [cat, setCat] = useState<FontCategoryId | 'all' | 'fav' | 'custom'>('all');
  const [sel, setSel] = useState<string>(p.value.id);
  const [weight, setWeight] = useState(p.value.weight);
  const [style, setStyle] = useState<FontStyle>(p.value.style);
  const [uploadErr, setUploadErr] = useState<string | null>(null);
  const [licOk, setLicOk] = useState(false);
  const [upWeight, setUpWeight] = useState(400);
  const [upStyle, setUpStyle] = useState<FontStyle>('normal');

  const items: Item[] = useMemo(() => {
    const customs: Item[] = fonts.customFonts().map((c) => ({ id: c.id, name: c.family, custom: true, meta: null, weights: [c.weight], styles: [c.style] }));
    const cats: Item[] = searchFonts({ text: query, category: cat === 'fav' || cat === 'custom' || cat === 'all' ? 'all' : cat }).map((f) => ({ id: f.id, name: f.family, custom: false, meta: f, weights: f.weights, styles: f.styles }));
    const q = query.trim().toLowerCase();
    const cu = customs.filter((c) => !q || c.name.toLowerCase().includes(q));
    if (cat === 'custom') return cu;
    if (cat === 'fav') return [...cu, ...cats].filter((i) => store.fontFavourites.has(i.id));
    return cat === 'all' ? [...cu, ...cats] : cats;
  }, [query, cat, fonts, store.fontFavourites, fonts.snapshot()]);

  // ---- virtual list --------------------------------------------------------------------------------------------------
  const scroller = useRef<HTMLDivElement>(null);
  const [top, setTop] = useState(0);
  const [vh, setVh] = useState(480);
  useEffect(() => {
    const el = scroller.current; if (!el) return;
    const ro = new ResizeObserver(() => setVh(el.clientHeight)); ro.observe(el); setVh(el.clientHeight);
    return () => ro.disconnect();
  }, []);
  const first = Math.max(0, Math.floor(top / ROW) - 3), last = Math.min(items.length, Math.ceil((top + vh) / ROW) + 3);
  const visible = items.slice(first, last);
  const previewWeight = (it: Item): FontSpec => (it.custom ? { id: it.id, weight: it.weights[0]!, style: it.styles[0]! } : { id: it.id, weight: it.weights.includes(400) ? 400 : it.weights[0]!, style: it.styles.includes('normal') ? 'normal' : it.styles[0]! });

  // load only what is near the viewport; rows that scroll away cancel their request
  const loadKey = visible.map((v) => v.id).join('|');
  useEffect(() => {
    const ctl = new AbortController();
    for (const it of visible) {
      const spec = previewWeight(it);
      if (fonts.status(spec).state === 'idle') fonts.load(spec, ctl.signal).catch((e: unknown) => { if (!isAbort(e)) { /* shown in the row */ } });
    }
    return () => ctl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadKey, fonts]);

  // ---- selection -----------------------------------------------------------------------------------------------------
  const selItem = items.find((i) => i.id === sel) ?? (sel === p.value.id ? { id: sel, name: getFamily(sel)?.family ?? sel, custom: isCustomFontId(sel), meta: getFamily(sel) ?? null, weights: getFamily(sel)?.weights ?? [400], styles: getFamily(sel)?.styles ?? ['normal'] } as Item : undefined);
  const spec: FontSpec | null = selItem ? { id: selItem.id, weight: selItem.weights.includes(weight) ? weight : selItem.weights.includes(400) ? 400 : selItem.weights[0]!, style: selItem.styles.includes(style) ? style : selItem.styles[0]! } : null;
  useEffect(() => { if (spec && fonts.status(spec).state !== 'loaded') fonts.load(spec).catch(() => undefined); }, [spec?.id, spec?.weight, spec?.style, fonts]);   // eslint-disable-line react-hooks/exhaustive-deps
  const st = spec ? fonts.status(spec) : { state: 'idle' as const };
  const cssFam = (s: FontSpec) => `"${fonts.cssFamily(s)}"`;

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    setUploadErr(null);
    try {
      const meta = await addCustomFont(fonts, images.storeRef(), f, { family: familyFromFileName(f.name), weight: upWeight, style: upStyle });
      setCat('custom'); setSel(meta.id); setWeight(meta.weight); setStyle(meta.style);
      store.say(`Added font “${meta.family}”. You are responsible for its licence.`, 'ok');
    } catch (e) { setUploadErr((e as Error).message); }
  };

  return (
    <div className="modal-back" role="dialog" aria-modal="true" aria-label="Choose a font" data-testid="font-browser" onMouseDown={(e) => { if (e.target === e.currentTarget) p.onClose(); }}>
      <div className="modal">
        <header>
          <h3>Choose a font</h3>
          <span className="hint" style={{ color: 'var(--muted)' }}>{items.length} of {FONT_CATEGORIES.length ? searchFonts().length : 0} families · each shown in its own typeface · loaded only as you scroll</span>
          <span className="spacer" />
          <Btn onClick={p.onClose} testId="font-close">Close</Btn>
        </header>
        <div className="fb">
          <div className="fb-list">
            <div className="fb-filters">
              <input className="inp" placeholder="Search fonts (name or style)…" value={query} onChange={(e) => { setQuery(e.target.value); if (scroller.current) scroller.current.scrollTop = 0; }} data-testid="font-search" autoFocus />
              <div className="chips">
                <button type="button" className="chip" aria-pressed={cat === 'all'} onClick={() => setCat('all')} data-testid="fontcat-all">All</button>
                <button type="button" className="chip" aria-pressed={cat === 'fav'} onClick={() => setCat('fav')} data-testid="fontcat-fav">★ Favourites</button>
                {FONT_CATEGORIES.map((c) => <button type="button" key={c.id} className="chip" aria-pressed={cat === c.id} onClick={() => setCat(c.id)} data-testid={`fontcat-${c.id}`}>{c.name}</button>)}
                <button type="button" className="chip" aria-pressed={cat === 'custom'} onClick={() => setCat('custom')} data-testid="fontcat-custom">My uploaded fonts</button>
              </div>
            </div>
            <div className="fb-scroll" ref={scroller} onScroll={(e) => setTop((e.target as HTMLDivElement).scrollTop)} data-testid="font-scroll">
              <div style={{ height: items.length * ROW, position: 'relative' }}>
                {items.length === 0 && <div className="empty">No fonts match.</div>}
                {visible.map((it, k) => {
                  const s = previewWeight(it);
                  const state = fonts.status(s);
                  const text = (p.text || it.name).split('\n')[0]!.slice(0, 40);
                  return (
                    <div key={it.id} role="option" tabIndex={0} aria-selected={sel === it.id} className="fb-row" style={{ top: (first + k) * ROW }} data-testid={`font-row-${it.id}`}
                      onClick={() => { setSel(it.id); setWeight(s.weight); setStyle(s.style); }} onDoubleClick={() => { p.onPick(s); p.onClose(); }}
                      onKeyDown={(e) => { if (e.key === 'Enter') { setSel(it.id); setWeight(s.weight); setStyle(s.style); } }}>
                      <div className="nm"><b>{it.name}</b>{it.custom ? 'uploaded' : `${it.meta!.licenseId} · ${it.weights.length > 1 ? `${it.weights.length} weights` : 'one weight'}`}</div>
                      {state.state === 'loaded' ? <div className="sm" style={{ fontFamily: cssFam(s), fontStyle: s.style }}>{text}</div>
                        : state.state === 'error' ? <div className="sm er"><span>Could not load: {state.error}</span><Btn small onClick={() => { void fonts.retry(s).catch(() => undefined); }}>Retry</Btn></div>
                        : <div className="sm ph" aria-label="Loading font" />}
                      <button type="button" className="fav" style={{ position: 'static' }} aria-pressed={store.fontFavourites.has(it.id)} aria-label="Favourite font" onClick={(e) => { e.stopPropagation(); store.toggleFontFavourite(it.id); }}>{store.fontFavourites.has(it.id) ? '★' : '☆'}</button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="fb-side">
            {selItem && spec ? (
              <>
                <div><div style={{ fontWeight: 700, fontSize: 15 }}>{selItem.name}</div><div className="hint" style={{ color: 'var(--muted)' }}>{selItem.meta ? FONT_CATEGORIES.find((c) => c.id === selItem.meta!.category)?.name : 'Uploaded by you'}</div></div>
                <div className="fb-preview" data-testid="font-preview">
                  {st.state === 'loaded'
                    ? <div style={{ fontFamily: cssFam(spec), fontStyle: spec.style, fontSize: 38, lineHeight: p.lineSpacing, letterSpacing: `${p.letterSpacing}em`, whiteSpace: 'pre-wrap' }}>{p.text || selItem.name}</div>
                    : st.state === 'error' ? <div style={{ color: 'var(--err)' }}>This font could not be loaded: {st.error}<br /><Btn small onClick={() => { void fonts.retry(spec).catch(() => undefined); }}>Retry</Btn></div>
                    : <div className="fb-row sm ph" style={{ position: 'static', width: '80%', height: 26 }} aria-label="Loading font" />}
                </div>
                {selItem.weights.length > 1 && (
                  <div className="field"><div className="lab">Weight</div>
                    <div className="chips">{selItem.weights.map((w) => <button type="button" key={w} className="chip" aria-pressed={spec.weight === w} data-testid={`font-weight-${w}`} onClick={() => setWeight(w)}>{w === 400 ? 'Regular 400' : w === 700 ? 'Bold 700' : String(w)}</button>)}</div>
                  </div>
                )}
                {selItem.styles.length > 1 && (
                  <div className="field"><div className="lab">Style</div>
                    <div className="chips">{selItem.styles.map((s2) => <button type="button" key={s2} className="chip" aria-pressed={spec.style === s2} data-testid={`font-style-${s2}`} onClick={() => setStyle(s2)}>{s2 === 'italic' ? 'Italic' : 'Upright'}</button>)}</div>
                  </div>
                )}
                <Slider label="Font size" value={p.size} min={0.03} max={0.6} step={0.005} onChange={(v) => p.onTypography({ size: v })} hint="Fraction of the stage height." testId="font-size" />
                <Slider label="Letter spacing" value={p.letterSpacing} min={-0.1} max={0.6} step={0.005} unit="em" onChange={(v) => p.onTypography({ letterSpacing: v })} testId="font-letter" />
                <Slider label="Line spacing" value={p.lineSpacing} min={0.5} max={2} step={0.01} onChange={(v) => p.onTypography({ lineSpacing: v })} testId="font-line" />
                {selItem.meta && (
                  <div className="lic" data-testid="font-licence">
                    <b style={{ color: 'var(--text)' }}>Licence</b>
                    <span>{selItem.meta.licenseName} ({selItem.meta.licenseId}) · {selItem.meta.redistributionPermitted ? 'commercial use and redistribution permitted' : 'check before redistributing'}</span>
                    <span>Source: <a href={selItem.meta.sourceUrl} target="_blank" rel="noreferrer">{selItem.meta.sourceUrl.replace('https://', '')}</a></span>
                    <span>{selItem.meta.copyright}</span><span>Checked {selItem.meta.dateChecked}</span>
                  </div>
                )}
                {selItem.custom && <div className="disclaimer">{CUSTOM_FONT_DISCLAIMER}</div>}
                <div className="row wrap">
                  <Btn primary disabled={st.state !== 'loaded'} onClick={() => { p.onPick(spec); p.onClose(); }} testId="font-use">Use this font</Btn>
                  {selItem.custom && <Btn danger onClick={() => { void removeCustomFont(fonts, images.storeRef(), selItem.id); setSel(p.value.id); }}>Remove</Btn>}
                </div>
                {st.state !== 'loaded' && st.state !== 'error' && <div className="hint" style={{ color: 'var(--muted)' }}>Loading this weight…</div>}
              </>
            ) : <div className="empty">Pick a font on the left.</div>}

            <details className="sec" open={cat === 'custom'}>
              <summary>Upload your own font</summary>
              <div className="body">
                <div className="disclaimer" data-testid="font-disclaimer">{CUSTOM_FONT_DISCLAIMER}</div>
                <label className="toggle"><input type="checkbox" checked={licOk} onChange={(e) => setLicOk(e.target.checked)} data-testid="font-licence-ok" /> I hold a licence that allows me to use and redistribute this font.</label>
                <div className="row"><Select label="Weight" value={String(upWeight)} options={[100, 200, 300, 400, 500, 600, 700, 800, 900].map((w) => ({ value: String(w), label: String(w) }))} onChange={(v) => setUpWeight(Number(v))} /><Select label="Style" value={upStyle} options={[{ value: 'normal', label: 'Upright' }, { value: 'italic', label: 'Italic' }]} onChange={setUpStyle} /></div>
                <input type="file" accept=".woff2,.woff,.ttf,.otf,font/*" disabled={!licOk} data-testid="font-file" onChange={(e) => { void onFile(e.target.files?.[0]); e.target.value = ''; }} />
                {uploadErr && <div className="note err" role="alert" data-testid="font-upload-error">{uploadErr}</div>}
              </div>
            </details>
          </div>
        </div>
      </div>
    </div>
  );
}

export { cssFamilyOf, cx };
