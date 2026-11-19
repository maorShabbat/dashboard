import { useEffect, useMemo, useRef } from 'react';
import { BOARD_PRESETS, VIEWPORT_PRESETS } from '../../core/board';
import { CUES } from '../../core/cues';
import { EFFECT_LIST } from '../../core/effects/registry';
import { compileSequence, evaluateFrame, type CompiledSequence } from '../../core/engine';
import { effectPreviewSequence } from '../../core/bundle/replay';
import { emptySequenceContent, newClip } from '../../core/model/defaults';
import { libraryView } from '../../core/model/ops';
import { paintFrame } from '../../core/render';
import { resolveTokens } from '../../core/resolve';
import { LAYERS, TYPE_ROLES } from '../../core/tokens';
import { contrastRatio } from '../../core/util/color';
import { makeEasing, type EasingName } from '../../core/util/easing';
import { cssFontStack } from '../../core/fonts';
import { userFontStacks } from '../fonts';
import { useMediaVersion, useProject, useStudio, useUi } from '../studio';
import { EmptyState } from './ThemeView';

/** One shared animation clock for every canvas on the sheet. */
function useClock(): { subscribe(fn: (now: number) => void): () => void } {
  const subs = useRef(new Set<(n: number) => void>()).current;
  useEffect(() => {
    let raf = 0;
    const tick = (n: number) => { subs.forEach((s) => s(n)); raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [subs]);
  return useMemo(() => ({ subscribe: (fn) => { subs.add(fn); return () => { subs.delete(fn); }; } }), [subs]);
}

interface MiniProps {
  seq: CompiledSequence;
  viewport: { w: number; h: number };
  /** Fixed time in ms (static) or undefined to loop. */
  at?: number;
  clock: ReturnType<typeof useClock>;
  label?: string;
  testId?: string;
}

function MiniCanvas({ seq, viewport, at, clock, testId }: MiniProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  const studio = useStudio();
  const project = useProject();
  const mediaVersion = useMediaVersion();
  const stacks = useMemo(() => userFontStacks(project), [project.fonts]);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const dpr = Math.min(2, devicePixelRatio || 1);
    const scale = Math.min(1, 520 / viewport.w);
    c.width = Math.round(viewport.w * scale * dpr); c.height = Math.round(viewport.h * scale * dpr);
    const ctx = c.getContext('2d')!;
    const draw = (t: number) => {
      const f = evaluateFrame(seq, t, { viewport, assets: studio.media });
      // paintFrame owns the base transform (it uses `dpr` as the logical→pixel scale), so the thumbnail scale goes into it.
      paintFrame(ctx, f, { assets: studio.media, fontStacks: stacks, dpr: dpr * scale });
    };
    if (at !== undefined) { draw(at); return; }
    const gap = 700;
    const loop = Math.max(500, seq.duration) + gap;
    const t0 = performance.now();
    draw(0);
    return clock.subscribe((now) => draw(Math.min(seq.duration, (now - t0) % loop)));
  }, [seq, viewport.w, viewport.h, at, clock, studio.media, stacks, mediaVersion]);
  return <canvas ref={ref} className="mini-canvas" style={{ aspectRatio: `${viewport.w} / ${viewport.h}` }} data-testid={testId} />;
}

const PAIRS: [string, string, string][] = [
  ['color.text', 'color.surface', 'Text on surface'], ['color.text', 'color.background', 'Text on background'], ['color.textMuted', 'color.surface', 'Muted text on surface'],
  ['color.textOnAccent', 'color.accent', 'Text on accent'], ['color.textOnAccent', 'color.win', 'Text on win'], ['color.text', 'color.primary', 'Text on primary'],
];

export function SheetView() {
  const project = useProject();
  const ui = useUi();
  const studio = useStudio();
  const clock = useClock();
  const theme = ui.themeId ? project.themes[ui.themeId] : undefined;
  const lib = useMemo(() => libraryView(project, ui.source), [project, ui.source]);
  const content = theme ? lib.theme(theme.id) : undefined;
  const tokens = useMemo(() => resolveTokens(content?.tokens), [content]);
  const stacks = useMemo(() => userFontStacks(project), [project.fonts]);
  const seqs = useMemo(() => (theme ? Object.fromEntries(EFFECT_LIST.map((e) => [e.type, compileSequence(effectPreviewSequence(theme.id, e.type), lib)])) : {}), [theme, lib]);
  const boardSeq = useMemo(() => {
    if (!theme) return null;
    const s = emptySequenceContent(theme.id);
    s.tracks[0]!.clips.push(newClip('symbolHighlight', 0), newClip('winLine', 0));
    return compileSequence(s, lib);
  }, [theme, lib]);
  if (!theme || !content) return <EmptyState what="theme" />;
  const v = tokens.values;
  const colorKeys = Object.keys(v).filter((k) => k.startsWith('color.'));
  const approved = theme.versions.find((x) => x.id === theme.approvedVersionId);
  const ease = makeEasing({ easing: v['motion.easing'] as EasingName, overshoot: v['motion.overshoot'] as number, springFrequency: v['motion.springFrequency'] as number, springDamping: v['motion.springDamping'] as number });
  const curve = Array.from({ length: 61 }, (_, i) => { const p = i / 60; return `${(p * 220).toFixed(1)},${(70 - ease(p) * 56).toFixed(1)}`; }).join(' ');
  const specimenCell = 100;
  const surfaceSeq = (type: 'textCallout' | 'bigWinBanner') => compileSequence(effectPreviewSequence(theme.id, type), lib);

  return (
    <div className="view sheet" data-testid="sheet-view">
      <header className="sheet-head">
        <div>
          <h2 data-testid="sheet-title">{theme.name} <span className="muted">· preview sheet</span></h2>
          <p className="muted">{theme.description || 'No description yet.'}</p>
          <div className="sheet-badges">
            <span className="pill">{ui.source === 'approved' && approved ? `approved ${approved.label}` : 'working draft'}</span>
            {theme.approvedVersionId && <span className="pill ok">✓ approved version exists</span>}
            <span className="pill">{Object.keys(content.tokens).length} overrides</span>
            <span className="pill">{Object.keys(content.effectDefaults).length} effect defaults</span>
          </div>
        </div>
        <div className="sheet-actions">
          <div className="seg" role="group" aria-label="Source">
            <button className={ui.source === 'draft' ? 'on' : ''} onClick={() => studio.ui.set({ source: 'draft' })}>Draft</button>
            <button className={ui.source === 'approved' ? 'on' : ''} disabled={!theme.approvedVersionId} onClick={() => studio.ui.set({ source: 'approved' })}>Approved</button>
          </div>
          <button className="btn small" onClick={() => window.print()} data-testid="sheet-print">Print / PDF</button>
        </div>
      </header>
      {(content.artDirection.summary || content.artDirection.mood.length > 0) && (
        <section className="sheet-sec art" data-testid="sheet-art">
          <h3>Art direction <span className="pill doc">documentation only</span></h3>
          <p>{content.artDirection.summary}</p>
          {content.artDirection.mood.length > 0 && <p>{content.artDirection.mood.map((m) => <span key={m} className="pill">{m}</span>)}</p>}
          <div className="two">{content.artDirection.dos && <p><strong>Do:</strong> {content.artDirection.dos}</p>}{content.artDirection.donts && <p><strong>Don't:</strong> {content.artDirection.donts}</p>}</div>
        </section>
      )}

      <section className="sheet-sec" data-testid="sheet-colors">
        <h3>Semantic colour roles</h3>
        <div className="swatches">
          {colorKeys.map((k) => (
            <div key={k} className="swatch" data-testid={`swatch-${k}`}><i style={{ background: v[k] as string }} /><b>{k.replace('color.', '')}</b><code>{v[k] as string}</code><span className={`src src-${tokens.sources[k]}`}>{tokens.sources[k] === 'theme' ? 'theme' : 'default'}</span></div>
          ))}
        </div>
        <h4>Contrast (WCAG)</h4>
        <div className="contrast" data-testid="contrast">
          {PAIRS.map(([fg, bg, label]) => {
            const r = contrastRatio(v[fg] as string, v[bg] as string);
            const grade = r >= 7 ? 'AAA' : r >= 4.5 ? 'AA' : r >= 3 ? 'AA large' : 'Fail';
            return <div key={label} className={`c-item ${grade === 'Fail' ? 'fail' : ''}`}><span className="c-sample" style={{ background: v[bg] as string, color: v[fg] as string }}>Aa 123</span><span>{label}</span><b>{r.toFixed(2)}:1</b><span className={`pill ${grade === 'Fail' ? 'warn' : 'ok'}`}>{grade}</span></div>;
          })}
        </div>
      </section>

      <section className="sheet-sec" data-testid="sheet-type">
        <h3>Typography roles <span className="muted small">sizes are % of a cell, shown here at a 100 px cell</span></h3>
        <div className="specimens">
          {TYPE_ROLES.map((r) => {
            const fam = v[`type.${r}.family`] as string;
            const size = Math.max(v['type.minSizePx'] as number, ((v[`type.${r}.size`] as number) / 100) * specimenCell);
            const tf = v[`type.${r}.transform`] as string;
            const text = r === 'numeric' ? '1,234.50' : r === 'display' ? 'Big Win!' : r === 'headline' ? 'Free Spins Awarded' : r === 'label' ? 'Bet · Balance' : 'The quick brown fox jumps over the lazy dog.';
            return (
              <div key={r} className="specimen" data-testid={`specimen-${r}`}>
                <div className="meta"><b>{r}</b><span>{fam} · {v[`type.${r}.weight`] as number}</span><span>{v[`type.${r}.size`] as number}% cell → {size.toFixed(0)} px</span></div>
                <div className="sample" style={{ fontFamily: cssFontStack(fam, stacks), fontWeight: v[`type.${r}.weight`] as number, fontSize: size, letterSpacing: `${v[`type.${r}.letterSpacing`] as number}em`, lineHeight: v[`type.${r}.lineHeight`] as number, textTransform: tf as 'none', color: v['color.text'] as string }}>{text}</div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="sheet-sec" data-testid="sheet-surfaces">
        <h3>Surface · outline · depth · text</h3>
        <div className="mini-grid two-up">
          <figure><MiniCanvas seq={surfaceSeq('textCallout')} viewport={{ w: 640, h: 300 }} at={560} clock={clock} testId="sheet-callout" /><figcaption>Callout plate</figcaption></figure>
          <figure><MiniCanvas seq={surfaceSeq('bigWinBanner')} viewport={{ w: 640, h: 300 }} at={1400} clock={clock} /><figcaption>Win banner (title, counter, rays)</figcaption></figure>
        </div>
        <p className="muted small">Rendered by the real engine from the surface, outline, depth and type tokens. Texture: {v['surface.texture'] as string} · outline {v['outline.width'] as number}% cell {v['outline.style'] as string} · extrusion {v['depth.extrude'] as number}% · shadow {v['depth.shadowOffsetY'] as number}% / blur {v['depth.shadowBlur'] as number}%.</p>
      </section>

      <section className="sheet-sec" data-testid="sheet-motion">
        <h3>Motion personality</h3>
        <div className="motion">
          <svg viewBox="0 0 220 84" width="220" height="84" role="img" aria-label="Easing curve"><line x1="0" y1="70" x2="220" y2="70" stroke="currentColor" opacity=".25" /><line x1="0" y1="14" x2="220" y2="14" stroke="currentColor" opacity=".25" strokeDasharray="3 3" /><polyline points={curve} fill="none" stroke="var(--accent)" strokeWidth="2.5" /></svg>
          <dl>
            <dt>Easing</dt><dd>{v['motion.easing'] as string}</dd>
            <dt>Overshoot</dt><dd>{v['motion.overshoot'] as number}</dd>
            <dt>Spring</dt><dd>{v['motion.springFrequency'] as number} cycles · damping {v['motion.springDamping'] as number}</dd>
            <dt>Duration scale</dt><dd>{v['motion.durationScale'] as number}×</dd>
            <dt>Stagger scale</dt><dd>{v['motion.staggerScale'] as number}×</dd>
            <dt>Anticipation</dt><dd>{v['motion.anticipation'] as number}%</dd>
          </dl>
          <dl>
            <dt>Master intensity</dt><dd>{v['intensity.master'] as number}</dd>
            {['shake', 'flash', 'particles', 'glow', 'text', 'motion'].map((k) => <><dt key={`${k}-t`}>{k}</dt><dd key={`${k}-d`}>{v[`intensity.${k}`] as number}</dd></>)}
            <dt>Tiers</dt><dd>big {v['intensity.tierBig'] as number} · mega {v['intensity.tierMega'] as number} · epic {v['intensity.tierEpic'] as number}</dd>
            <dt>Safety</dt><dd>≤ {v['safety.maxFlashHz'] as number} flashes/s · ≤ {v['safety.maxFlashAlpha'] as number}% opacity</dd>
          </dl>
        </div>
      </section>

      <section className="sheet-sec" data-testid="sheet-effects">
        <h3>Effects <span className="muted small">all {EFFECT_LIST.length} required effects with this theme's defaults · click to edit</span></h3>
        <div className="mini-grid gallery">
          {EFFECT_LIST.map((e) => (
            <figure key={e.type} className="gallery-item" data-testid={`gallery-${e.type}`}>
              <button className="plain" onClick={() => studio.ui.set({ tab: 'theme', themeSection: 'effects', effectType: e.type, previewKey: `effect:${e.type}` })} title={`Edit ${e.label} defaults`}>
                <MiniCanvas seq={seqs[e.type]!} viewport={{ w: 640, h: 360 }} clock={clock} />
              </button>
              <figcaption><b>{e.label}</b><span className="muted small">{e.category} · {Math.round(seqs[e.type]!.duration)} ms</span></figcaption>
            </figure>
          ))}
        </div>
      </section>

      <section className="sheet-sec" data-testid="sheet-board">
        <h3>Board-aware sizing</h3>
        <p className="muted small">Same theme, same effects: lengths are % of a cell, so everything scales with the board and viewport.</p>
        {boardSeq && (
          <>
            <div className="mini-grid vp">
              {VIEWPORT_PRESETS.map((vp) => {
                const f = evaluateFrame(boardSeq, 500, { viewport: { w: vp.w, h: vp.h } });
                return <figure key={vp.id} data-testid={`vp-${vp.id}`}><MiniCanvas seq={boardSeq} viewport={{ w: vp.w, h: vp.h }} at={500} clock={clock} /><figcaption><b>{vp.label}</b><span className="muted small">{vp.w}×{vp.h} · cell {f.cell.toFixed(0)} px</span></figcaption></figure>;
              })}
            </div>
            <div className="mini-grid vp">
              {BOARD_PRESETS.filter((b) => ['classic-3x3', 'slots-5x3', 'cluster-7x7'].includes(b.id)).map((b) => {
                const s = { ...boardSeq, scene: { ...boardSeq.scene, cols: b.cols, rows: b.rows } };
                const f = evaluateFrame(s, 500, { viewport: { w: 1280, h: 720 } });
                return <figure key={b.id} data-testid={`board-${b.id}`}><MiniCanvas seq={s} viewport={{ w: 1280, h: 720 }} at={500} clock={clock} /><figcaption><b>{b.label}</b><span className="muted small">cell {f.cell.toFixed(0)} px · outline {(f.cell * (v['outline.width'] as number) / 100).toFixed(1)} px</span></figcaption></figure>;
              })}
            </div>
          </>
        )}
      </section>

      <section className="sheet-sec two" data-testid="sheet-layers">
        <div>
          <h3>Layers</h3>
          <ol className="layer-sheet">
            {[...LAYERS].map((l) => ({ l, z: v[`layer.${l.id}.z`] as number })).sort((a, b) => b.z - a.z).map(({ l, z }) => (
              <li key={l.id}><b>{l.label}</b><span className="muted small">z {z} · {v[`layer.${l.id}.visible`] ? 'visible' : 'hidden'} · {Math.round(v[`layer.${l.id}.opacity`] as number)}% · {v[`layer.${l.id}.blend`] as string} · camera {v[`layer.${l.id}.followsCamera`] ? 'follows' : 'fixed'}</span></li>
            ))}
          </ol>
        </div>
        <div data-testid="sheet-sound">
          <h3>Sound cues</h3>
          <ul className="cue-sheet">
            {CUES.map((c) => (
              <li key={c.id}><button className="icon-btn" aria-label={`Audition ${c.id}`} onClick={() => { void studio.audio?.resume().then(() => studio.audio!.play({ t: 0, kind: 'cue', name: c.id, source: 'sequence', audio: { enabled: v[`cue.${c.id}.enabled`] as boolean, asset: v[`cue.${c.id}.asset`] as string, gainDb: v[`cue.${c.id}.gain`] as number, pitch: v[`cue.${c.id}.pitch`] as number } })); }}>♪</button>
                <b>{c.id}</b><span className="muted small">{v[`cue.${c.id}.enabled`] ? '' : 'muted · '}{v[`cue.${c.id}.asset`] ? 'asset' : 'preview blip'} · {v[`cue.${c.id}.gain`] as number} dB · {v[`cue.${c.id}.pitch`] as number} st</span></li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}
