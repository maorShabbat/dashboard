import { useState } from 'react';
import { SHAPES, shapeDef } from '../../player/shapes';
import { cloneGradient, makeGradient, solid } from '../../style/gradient';
import { MAX_OUTLINES, STYLE_PRESETS, cloneStyle, defaultImageOutline, type ShapeStyle } from '../../style/textStyle';
import { newId, type CounterElement, type ImageElement, type SceneElement, type ShapeElement, type ShapeId, type ShineSpec, type TextElement } from '../../model/scene';
import { BUILTIN_BACKGROUNDS, BUILTIN_ICONS } from '../builtins';
import { FontBrowser } from './FontBrowser';
import { GradientEditor } from './GradientEditor';
import { useFontsState, useStore } from './services';
import { Btn, ColorField, Field, NumberField, Section, Select, Slider, TextField, Toggle } from './widgets';
import { ImageSlot } from './ContentPanel';

type Edit<T> = (mut: (e: T) => void, label?: string) => void;

// ---------------------------------------------------------------------------------------------------------------------
// The style stack: face, outlines, bevel, inner highlight, extrusion, shadow, glow.

export function StyleEditor({ style, edit, testId = 'style' }: { style: ShapeStyle; edit: Edit<ShapeStyle>; testId?: string }) {
  return (
    <>
      <Section title="Face colour and gradient" open testId={`${testId}-face`} hint={style.face.kind}>
        <GradientEditor value={style.face} onChange={(g) => edit((s) => { s.face = g; }, 'face')} testId={`${testId}-face-grad`} />
      </Section>

      <Section title="Outlines" hint={`${style.outlines.filter((o) => o.enabled).length} of ${MAX_OUTLINES}`} testId={`${testId}-outlines`}>
        {style.outlines.map((o, i) => (
          <details key={o.id} className="sec" open={i === 0} style={{ background: 'var(--panel)' }}>
            <summary>Outline {i + 1}<small>{o.enabled ? `${Math.round(o.width * 1000) / 1000} em` : 'off'}</small></summary>
            <div className="body">
              <Toggle label="Show this outline" value={o.enabled} onChange={(v) => edit((s) => { s.outlines[i]!.enabled = v; })} testId={`${testId}-outline-${i}-on`} />
              <Slider label="Thickness" value={o.width} min={0} max={0.3} step={0.002} unit="em" onChange={(v) => edit((s) => { s.outlines[i]!.width = v; }, `ow${i}`)} testId={`${testId}-outline-${i}-width`} hint="Added outside the previous outline (or the letters)." />
              <Select label="Corners" value={o.join} options={[{ value: 'round', label: 'Round' }, { value: 'miter', label: 'Sharp' }, { value: 'bevel', label: 'Cut' }]} onChange={(v) => edit((s) => { s.outlines[i]!.join = v; })} />
              <GradientEditor value={o.fill} onChange={(g) => edit((s) => { s.outlines[i]!.fill = g; }, `og${i}`)} testId={`${testId}-outline-${i}-grad`} label="Outline colour or gradient" />
              <Btn small danger onClick={() => edit((s) => { s.outlines.splice(i, 1); })} testId={`${testId}-outline-${i}-remove`}>Remove this outline</Btn>
            </div>
          </details>
        ))}
        <Btn small disabled={style.outlines.length >= MAX_OUTLINES} onClick={() => edit((s) => { s.outlines.push({ id: newId('o'), enabled: true, width: 0.05, fill: solid('#000000'), join: 'round' }); })} testId={`${testId}-outline-add`}>+ Add an outline</Btn>
      </Section>

      <Section title="Bevel (shallow edge lighting)" hint={style.bevel.enabled ? 'on' : 'off'} testId={`${testId}-bevel`}>
        <Toggle label="Bevel" value={style.bevel.enabled} onChange={(v) => edit((s) => { s.bevel.enabled = v; })} testId={`${testId}-bevel-on`} />
        <Slider label="Edge width" value={style.bevel.size} min={0.005} max={0.2} step={0.002} unit="em" onChange={(v) => edit((s) => { s.bevel.size = v; }, 'bs')} />
        <Slider label="Depth" value={style.bevel.depth} min={0} max={1} step={0.01} onChange={(v) => edit((s) => { s.bevel.depth = v; }, 'bd')} />
        <Slider label="Light direction" value={style.bevel.angle} min={-180} max={180} step={1} unit="°" onChange={(v) => edit((s) => { s.bevel.angle = v; }, 'ba')} hint="-90 = light from above." />
        <div className="row"><ColorField label="Light" value={style.bevel.light} onChange={(c) => edit((s) => { s.bevel.light = c; }, 'bl')} /><ColorField label="Shade" value={style.bevel.shade} onChange={(c) => edit((s) => { s.bevel.shade = c; }, 'bsh')} /></div>
      </Section>

      <Section title="Inner highlight (glossy rim)" hint={style.innerHighlight.enabled ? 'on' : 'off'} testId={`${testId}-highlight`}>
        <Toggle label="Inner highlight" value={style.innerHighlight.enabled} onChange={(v) => edit((s) => { s.innerHighlight.enabled = v; })} testId={`${testId}-highlight-on`} />
        <ColorField label="Colour" value={style.innerHighlight.color} onChange={(c) => edit((s) => { s.innerHighlight.color = c; }, 'hc')} />
        <Slider label="Opacity" value={style.innerHighlight.alpha} min={0} max={1} step={0.01} onChange={(v) => edit((s) => { s.innerHighlight.alpha = v; }, 'ha')} />
        <Slider label="Rim width" value={style.innerHighlight.size} min={0.005} max={0.15} step={0.002} unit="em" onChange={(v) => edit((s) => { s.innerHighlight.size = v; }, 'hs')} />
        <Slider label="Light direction" value={style.innerHighlight.angle} min={-180} max={180} step={1} unit="°" onChange={(v) => edit((s) => { s.innerHighlight.angle = v; }, 'hd')} />
      </Section>

      <Section title="Extrusion (3D slab)" hint={style.extrusion.enabled ? 'on' : 'off'} testId={`${testId}-extrusion`}>
        <Toggle label="Extrusion" value={style.extrusion.enabled} onChange={(v) => edit((s) => { s.extrusion.enabled = v; })} testId={`${testId}-extrusion-on`} />
        <Slider label="Depth" value={style.extrusion.depth} min={0.005} max={0.3} step={0.002} unit="em" onChange={(v) => edit((s) => { s.extrusion.depth = v; }, 'ed')} />
        <Slider label="Direction" value={style.extrusion.angle} min={-180} max={180} step={1} unit="°" onChange={(v) => edit((s) => { s.extrusion.angle = v; }, 'ea')} hint="90 = straight down." />
        <Slider label="Darkens with depth" value={style.extrusion.shade} min={0} max={1} step={0.01} onChange={(v) => edit((s) => { s.extrusion.shade = v; }, 'es')} />
        <GradientEditor value={style.extrusion.fill} onChange={(g) => edit((s) => { s.extrusion.fill = g; }, 'eg')} testId={`${testId}-extrusion-grad`} label="Slab colour or gradient" />
      </Section>

      <Section title="Shadow" hint={style.shadow.enabled ? 'on' : 'off'} testId={`${testId}-shadow`}>
        <Toggle label="Drop shadow" value={style.shadow.enabled} onChange={(v) => edit((s) => { s.shadow.enabled = v; })} testId={`${testId}-shadow-on`} />
        <ColorField label="Colour" value={style.shadow.color} onChange={(c) => edit((s) => { s.shadow.color = c; }, 'sc')} />
        <Slider label="Opacity" value={style.shadow.alpha} min={0} max={1} step={0.01} onChange={(v) => edit((s) => { s.shadow.alpha = v; }, 'sa')} />
        <Slider label="Blur" value={style.shadow.blur} min={0} max={0.3} step={0.002} unit="em" onChange={(v) => edit((s) => { s.shadow.blur = v; }, 'sb')} />
        <div className="row"><div style={{ flex: 1 }}><Slider label="Offset X" value={style.shadow.dx} min={-0.3} max={0.3} step={0.002} onChange={(v) => edit((s) => { s.shadow.dx = v; }, 'sx')} /></div><div style={{ flex: 1 }}><Slider label="Offset Y" value={style.shadow.dy} min={-0.3} max={0.3} step={0.002} onChange={(v) => edit((s) => { s.shadow.dy = v; }, 'sy')} /></div></div>
      </Section>

      <Section title="Glow" hint={style.glow.enabled ? 'on' : 'off'} testId={`${testId}-glow`}>
        <Toggle label="Glow" value={style.glow.enabled} onChange={(v) => edit((s) => { s.glow.enabled = v; })} testId={`${testId}-glow-on`} />
        <Slider label="Reach" value={style.glow.radius} min={0.01} max={0.6} step={0.005} unit="em" onChange={(v) => edit((s) => { s.glow.radius = v; }, 'gr')} />
        <Slider label="Strength" value={style.glow.strength} min={0} max={2} step={0.01} onChange={(v) => edit((s) => { s.glow.strength = v; }, 'gs')} />
        <Toggle label="Light the surroundings (feeds the bloom)" value={style.glow.bloom} onChange={(v) => edit((s) => { s.glow.bloom = v; })} />
        <GradientEditor value={style.glow.fill} onChange={(g) => edit((s) => { s.glow.fill = g; }, 'gg')} testId={`${testId}-glow-grad`} label="Glow colour or gradient" />
      </Section>
    </>
  );
}

// ---------------------------------------------------------------------------------------------------------------------

function ShineEditor({ shine, edit }: { shine: ShineSpec | undefined; edit: (mut: (s: ShineSpec) => void, label?: string) => void }) {
  const s = shine ?? { enabled: false, color: '#ffffff', angle: 20, width: 0.22, intensity: 0.85, start: 0.5, duration: 0.9, repeat: 0, interval: 1.2, bloom: true };
  return (
    <Section title="Light sweep (shine)" hint={s.enabled ? 'on' : 'off'} testId="shine-section">
      <Toggle label="Sweep a band of light across this element" value={s.enabled} onChange={(v) => edit((x) => { x.enabled = v; })} testId="shine-on" />
      <ColorField label="Colour" value={s.color} onChange={(c) => edit((x) => { x.color = c; }, 'shc')} />
      <Slider label="Angle" value={s.angle} min={-90} max={90} step={1} unit="°" onChange={(v) => edit((x) => { x.angle = v; }, 'sha')} />
      <Slider label="Band width" value={s.width} min={0.05} max={1} step={0.01} onChange={(v) => edit((x) => { x.width = v; }, 'shw')} />
      <Slider label="Brightness" value={s.intensity} min={0} max={2} step={0.01} onChange={(v) => edit((x) => { x.intensity = v; }, 'shi')} />
      <div className="row"><div style={{ flex: 1 }}><Slider label="Starts at" value={s.start} min={0} max={10} step={0.05} unit="s" onChange={(v) => edit((x) => { x.start = v; }, 'sht')} /></div><div style={{ flex: 1 }}><Slider label="One sweep takes" value={s.duration} min={0.1} max={4} step={0.05} unit="s" onChange={(v) => edit((x) => { x.duration = v; }, 'shd')} /></div></div>
      <div className="row"><div style={{ flex: 1 }}><Slider label="Extra sweeps" value={s.repeat} min={0} max={10} step={1} onChange={(v) => edit((x) => { x.repeat = v; }, 'shr')} /></div><div style={{ flex: 1 }}><Slider label="Pause between" value={s.interval} min={0} max={5} step={0.05} unit="s" onChange={(v) => edit((x) => { x.interval = v; }, 'shn')} /></div></div>
      <Toggle label="Feeds the bloom (glows)" value={s.bloom} onChange={(v) => edit((x) => { x.bloom = v; })} />
    </Section>
  );
}

// ---------------------------------------------------------------------------------------------------------------------

function TypographyEditor({ el, edit }: { el: TextElement | CounterElement; edit: Edit<TextElement | CounterElement> }) {
  const [browse, setBrowse] = useState(false);
  const fonts = useFontsState();
  const f = el.style.font;
  const fam = fonts.resolve(f).family?.family ?? fonts.customMeta(f.id)?.family ?? f.id;
  const state = fonts.status(f);
  const sampleText = el.kind === 'text' ? el.text : String(el.to);
  return (
    <>
      <Field label="Font">
        <button type="button" className="fontbtn" onClick={() => setBrowse(true)} data-testid="font-open">
          {state.state === 'loaded' ? <span className="sample" style={{ fontFamily: `"${fonts.cssFamily(f)}"`, fontStyle: f.style }}>{fam}</span> : state.state === 'error' ? <span className="sample" style={{ fontSize: 13, color: 'var(--err)' }}>{fam}: failed to load</span> : <span className="sample" style={{ fontSize: 13 }}>{fam}…</span>}
          <small>{f.weight}{f.style === 'italic' ? ' italic' : ''} · change…</small>
        </button>
      </Field>
      {browse && (
        <FontBrowser value={f} text={sampleText} size={el.size} letterSpacing={el.style.letterSpacing} lineSpacing={el.style.lineSpacing}
          onPick={(spec) => edit((e) => { e.style.font = spec; }, 'font')} onTypography={(p) => edit((e) => { if (p.size !== undefined) e.size = p.size; if (p.letterSpacing !== undefined) e.style.letterSpacing = p.letterSpacing; if (p.lineSpacing !== undefined) e.style.lineSpacing = p.lineSpacing; }, 'typo')} onClose={() => setBrowse(false)} />
      )}
      <Slider label="Size" value={el.size} min={0.03} max={0.6} step={0.005} onChange={(v) => edit((e) => { e.size = v; }, 'size')} hint="Fraction of the stage height." testId="look-size" />
      <Slider label="Letter spacing" value={el.style.letterSpacing} min={-0.1} max={0.6} step={0.005} unit="em" onChange={(v) => edit((e) => { e.style.letterSpacing = v; }, 'ls')} testId="look-letter" />
      {el.kind === 'text' && <Slider label="Line spacing" value={el.style.lineSpacing} min={0.5} max={2} step={0.01} onChange={(v) => edit((e) => { e.style.lineSpacing = v; }, 'lh')} testId="look-line" />}
      <div className="row wrap">
        <Select label="Alignment" value={el.style.align} options={[{ value: 'left', label: 'Left' }, { value: 'center', label: 'Centre' }, { value: 'right', label: 'Right' }]} onChange={(v) => edit((e) => { e.style.align = v; })} />
        <Toggle label="UPPER CASE" value={el.style.uppercase} onChange={(v) => edit((e) => { e.style.uppercase = v; })} />
      </div>
      {el.kind === 'text' && <Slider label="Wrap width" value={el.maxWidth} min={0} max={1.6} step={0.01} onChange={(v) => edit((e) => { (e as TextElement).maxWidth = v; }, 'mw')} hint="0 = break only where you press Enter." />}
      <Field label="Start from a style">
        <select className="sel" value="" onChange={(e) => { const sp = STYLE_PRESETS.find((p) => p.id === e.target.value); if (sp) edit((x) => { const keep = x.style.font; const keepTypo = { letterSpacing: x.style.letterSpacing, lineSpacing: x.style.lineSpacing, align: x.style.align, uppercase: x.style.uppercase }; x.style = { ...cloneStyle(sp.style), font: sp.style.font }; void keep; void keepTypo; }); }} data-testid="style-preset">
          <option value="">Apply a ready-made style…</option>
          {STYLE_PRESETS.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </Field>
    </>
  );
}

export function CounterEditor({ el, edit }: { el: CounterElement; edit: Edit<CounterElement> }) {
  return (
    <Section title="Number and counting" open testId="counter-section">
      <div className="row"><div style={{ flex: 1 }}><NumberField label="From" value={el.from} step={1} onChange={(v) => edit((e) => { e.from = v; })} testId="counter-from" /></div><div style={{ flex: 1 }}><NumberField label="To" value={el.to} step={1} onChange={(v) => edit((e) => { e.to = v; })} testId="counter-to" /></div></div>
      <div className="row"><div style={{ flex: 1 }}><TextField label="Before" value={el.prefix} onChange={(v) => edit((e) => { e.prefix = v; })} testId="counter-prefix" placeholder="$" /></div><div style={{ flex: 1 }}><TextField label="After" value={el.suffix} onChange={(v) => edit((e) => { e.suffix = v; })} testId="counter-suffix" placeholder="x" /></div></div>
      <div className="row"><div style={{ flex: 1 }}><NumberField label="Decimals" value={el.decimals} min={0} max={6} onChange={(v) => edit((e) => { e.decimals = Math.max(0, Math.min(6, Math.round(v))); })} testId="counter-decimals" /></div><div style={{ flex: 1 }}><Select label="Thousands" value={el.group} options={[{ value: ',', label: '1,234' }, { value: '.', label: '1.234' }, { value: ' ', label: '1 234' }, { value: '', label: '1234' }]} onChange={(v) => edit((e) => { e.group = v; })} /></div></div>
      <Select label="Digits" value={el.roll} options={[{ value: 'none', label: 'Change instantly' }, { value: 'roll', label: 'Roll like an odometer' }, { value: 'pop', label: 'Pop on every change' }, { value: 'flip', label: 'Flip like a board' }, { value: 'slot', label: 'Spin like slot reels' }]} onChange={(v) => edit((e) => { e.roll = v; })} testId="counter-roll" />
      <Select label="Speed curve" value={el.ease} options={[{ value: 'easeOut', label: 'Fast, then slow' }, { value: 'easeIn', label: 'Slow build-up' }, { value: 'easeInOut', label: 'Smooth' }, { value: 'linear', label: 'Even' }, { value: 'burst', label: 'Burst' }]} onChange={(v) => edit((e) => { e.ease = v; })} />
      <div className="row"><div style={{ flex: 1 }}><Slider label="Starts at" value={el.countStart} min={0} max={10} step={0.05} unit="s" onChange={(v) => edit((e) => { e.countStart = v; }, 'cs')} /></div><div style={{ flex: 1 }}><Slider label="Counts for" value={el.countDuration} min={0.1} max={10} step={0.05} unit="s" onChange={(v) => edit((e) => { e.countDuration = v; }, 'cd')} testId="counter-duration" /></div></div>
      <Slider label="Pop on each change" value={el.tickPop} min={0} max={0.5} step={0.01} onChange={(v) => edit((e) => { e.tickPop = v; }, 'tp')} />
      <Slider label="Landing pulse" value={el.landPulse} min={0} max={0.5} step={0.01} onChange={(v) => edit((e) => { e.landPulse = v; }, 'lp')} />
    </Section>
  );
}

function PlacementEditor({ el, edit }: { el: SceneElement; edit: Edit<SceneElement> }) {
  return (
    <Section title="Position, size and timing" testId="placement">
      <div className="row"><div style={{ flex: 1 }}><Slider label="Position X" value={el.x} min={0} max={1} step={0.005} onChange={(v) => edit((e) => { e.x = v; }, 'x')} testId="look-x" /></div><div style={{ flex: 1 }}><Slider label="Position Y" value={el.y} min={0} max={1} step={0.005} onChange={(v) => edit((e) => { e.y = v; }, 'y')} testId="look-y" /></div></div>
      <div className="row"><div style={{ flex: 1 }}><Slider label="Scale" value={el.scale} min={0.1} max={3} step={0.01} onChange={(v) => edit((e) => { e.scale = v; }, 'sc')} /></div><div style={{ flex: 1 }}><Slider label="Rotation" value={el.rotation} min={-180} max={180} step={1} unit="°" onChange={(v) => edit((e) => { e.rotation = v; }, 'rot')} /></div></div>
      <Slider label="Opacity" value={el.opacity} min={0} max={1} step={0.01} onChange={(v) => edit((e) => { e.opacity = v; }, 'op')} />
      <div className="row"><div style={{ flex: 1 }}><Slider label="Appears at" value={el.start} min={0} max={20} step={0.05} unit="s" onChange={(v) => edit((e) => { e.start = v; }, 'st')} testId="look-start" /></div>
        <div style={{ flex: 1 }}><Field label="Removed at (s)"><input className="inp" type="number" min={0} step={0.1} placeholder="never" value={el.end ?? ''} onChange={(e) => { const v = e.target.value === '' ? undefined : Number(e.target.value); edit((x) => { x.end = v; }); }} /></Field></div></div>
    </Section>
  );
}

export function LookPanel() {
  const store = useStore();
  const doc = store.doc!;
  const el = doc.scene.elements.find((e) => e.id === doc.selected);
  if (!el) return <div className="panel-body"><div className="note">Pick an element in the Content tab to change how it looks.</div></div>;
  const edit = <T extends SceneElement>(mut: (e: T) => void, label?: string) => store.edit((s) => { const t = s.elements.find((x) => x.id === el.id); if (t) mut(t as T); }, `${el.id}:${label ?? ''}`);
  const editStyle = (mut: (s: ShapeStyle) => void, label?: string) => edit((e) => { const t = e as SceneElement; if (t.kind === 'image') { if (t.outline) mut(t.outline); } else mut((t as TextElement | CounterElement | ShapeElement).style); }, label);
  const editShine = (mut: (s: ShineSpec) => void, label?: string) => edit((e) => { const t = e as SceneElement; t.shine ??= { enabled: false, color: '#ffffff', angle: 20, width: 0.22, intensity: 0.85, start: 0.5, duration: 0.9, repeat: 0, interval: 1.2, bloom: true }; mut(t.shine); }, label);

  return (
    <div className="panel-body" data-testid="look-panel">
      <div className="row"><b style={{ flex: 1, fontSize: 14 }}>{el.name}</b><span className="badge">{el.kind}</span></div>
      {(el.kind === 'text' || el.kind === 'counter') && (
        <>
          <TypographyEditor el={el} edit={edit as Edit<TextElement | CounterElement>} />
          {el.kind === 'counter' && <CounterEditor el={el} edit={edit as Edit<CounterElement>} />}
          <StyleEditor style={el.style} edit={editStyle} />
        </>
      )}
      {el.kind === 'image' && <ImageLook el={el} edit={edit as Edit<ImageElement>} editStyle={editStyle} />}
      {el.kind === 'shape' && (
        <>
          <Section title="Shape" open testId="shape-section">
            <Select label="Kind" value={el.shape} options={SHAPES.map((s) => ({ value: s.id, label: s.name }))} onChange={(v: ShapeId) => edit<ShapeElement>((e) => { e.shape = v; e.params = { ...shapeDef(v).defaults.params }; })} testId="shape-kind" />
            <div className="row"><div style={{ flex: 1 }}><Slider label="Width" value={el.width} min={0.1} max={2} step={0.01} onChange={(v) => edit<ShapeElement>((e) => { e.width = v; }, 'w')} testId="shape-width" /></div><div style={{ flex: 1 }}><Slider label="Height" value={el.height} min={0.05} max={1.5} step={0.01} onChange={(v) => edit<ShapeElement>((e) => { e.height = v; }, 'h')} testId="shape-height" /></div></div>
            {Object.entries(el.params).filter(([, v]) => typeof v === 'number').map(([k, v]) => <Slider key={k} label={k} value={Number(v)} min={0} max={k === 'points' || k === 'teeth' ? 40 : 1} step={k === 'points' || k === 'teeth' ? 1 : 0.01} onChange={(x) => edit<ShapeElement>((e) => { e.params[k] = x; }, `p${k}`)} />)}
          </Section>
          <StyleEditor style={el.style} edit={editStyle} />
        </>
      )}
      {el.kind === 'board' && <div className="note" data-testid="board-look-note">The grid, the symbols and how the reels spin are on the Content tab. Here you can place the whole board; effects that dress it (shake, frost, glow, themes) are on the Effects tab.</div>}
      {el.kind !== 'board' && <ShineEditor shine={el.shine} edit={editShine} />}
      <PlacementEditor el={el} edit={edit as Edit<SceneElement>} />
    </div>
  );
}

function ImageLook({ el, edit, editStyle }: { el: ImageElement; edit: Edit<ImageElement>; editStyle: (m: (s: ShapeStyle) => void, l?: string) => void }) {
  const builtins = el.role === 'background' ? BUILTIN_BACKGROUNDS : BUILTIN_ICONS;
  const st = el.outline;
  return (
    <>
      <Section title="Image" open testId="image-section">
        <ImageSlot el={el} />
        <Select label="Built-in picture" value={builtins.some((b) => b.id === el.asset) ? el.asset : ''} options={[{ value: '', label: el.asset.startsWith('builtin:') ? '—' : 'Your upload' }, ...builtins.map((b) => ({ value: b.id, label: b.name }))]} onChange={(v) => { if (v) edit((e) => { e.asset = v; }); }} />
        {el.width ? (
          <div className="row"><div style={{ flex: 1 }}><Slider label="Width" value={el.width} min={0.2} max={2.5} step={0.01} onChange={(v) => edit((e) => { e.width = v; }, 'w')} /></div><div style={{ flex: 1 }}><Slider label="Height" value={el.height ?? 0.5} min={0.1} max={1.5} step={0.01} onChange={(v) => edit((e) => { e.height = v; }, 'h')} /></div></div>
        ) : <Slider label="Size" value={el.size} min={0.05} max={1.2} step={0.005} onChange={(v) => edit((e) => { e.size = v; }, 'size')} testId="image-size" hint="Longest side, as a fraction of the stage height." />}
        <Select label="If it is a video" value={el.playback} options={[{ value: 'loop', label: 'Loop' }, { value: 'once', label: 'Play once, hold the last frame' }]} onChange={(v) => edit((e) => { e.playback = v; })} />
      </Section>
      <Section title="Colour treatment" hint={el.look} testId="image-look">
        <Select label="Colours" value={el.look} options={[{ value: 'original', label: 'Keep the image\'s own colours' }, { value: 'tint', label: 'Tint with a gradient (multiply)' }, { value: 'gradient', label: 'Replace with a gradient' }]} onChange={(v) => edit((e) => { e.look = v; if (v !== 'original' && !e.gradient) e.gradient = makeGradient('linear', [[0, '#ffe27a'], [1, '#ff7a1a']], { angle: 90 }); })} testId="image-look-select" />
        {el.look !== 'original' && el.gradient && <GradientEditor value={el.gradient} onChange={(g) => edit((e) => { e.gradient = cloneGradient(g); }, 'ig')} testId="image-grad" />}
      </Section>
      <Section title="Outline, glow and shadow around the shape" hint={st ? 'on' : 'off'} testId="image-outline">
        <Toggle label="Draw an outline / glow / shadow (still images only)" value={!!st} testId="image-outline-on" onChange={(v) => edit((e) => { if (v) { e.outline = defaultImageOutline(); } else e.outline = null; })} />
        {st && <StyleEditor style={st} edit={editStyle} testId="imgstyle" />}
      </Section>
    </>
  );
}

