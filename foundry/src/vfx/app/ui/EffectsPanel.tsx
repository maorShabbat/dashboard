import { EFFECTS, effectById } from '../../fx';
import { defaultsOf, type ShowEffect } from '../../fx/effect';
import { fxLayer, type FxLayer } from '../../model/scene';
import { GRADIENT_PRESETS, cloneGradient } from '../../style/gradient';
import { GradientEditor } from './GradientEditor';
import { Btn, ParamForm, Section, Select, Slider, Toggle } from './widgets';
import { SoundPanel } from './SoundPanel';
import { useStore } from './services';
import type { PreviewController } from '../controller';

/** The effects that act on the grid itself rather than on what happens in it. */
const BOARD_ONLY = /^board\.(shake|zap|smoke|frozen|glow|theme)$/;
/** The effects that run while the reels spin, that act on the special symbols, and that sweep along a whole row or reel. */
const SPIN_SYMBOL_LANE = /^(spin|symbol|lane|cascade)\./;
const GROUPS: { title: string; tid?: string; ids: (e: ShowEffect) => boolean }[] = [
  { title: 'Impacts', ids: (e) => ['shockwave', 'vortex', 'plasma', 'impact.slam', 'impact.lightning', 'impact.burst', 'impact.pound', 'flash', 'shake', 'particles'].includes(e.id) },
  { title: 'Screen distortion', ids: (e) => e.id.startsWith('distort.') },
  { title: 'Light and shine', ids: (e) => e.id.startsWith('light.') },
  { title: 'Celebration', ids: (e) => e.id.startsWith('celebrate.') },
  { title: 'Symbol destruction', ids: (e) => e.id === 'fragment' || e.id.startsWith('destroy.') },
  { title: 'Symbol transformation', ids: (e) => e.id.startsWith('xform.') },
  { title: 'Coins, gems and particles', tid: 'particles', ids: (e) => e.id.startsWith('emit.') },
  { title: 'Reels: events and win lines', tid: 'reels', ids: (e) => e.usesBoard === true && !BOARD_ONLY.test(e.id) && !SPIN_SYMBOL_LANE.test(e.id) },
  { title: 'Reels: while spinning (trails, sparks, fire, energy)', tid: 'spinfx', ids: (e) => e.id.startsWith('spin.') },
  { title: 'Special symbols (wild, scatter, bonus): motion and auras', tid: 'symbolfx', ids: (e) => e.id.startsWith('symbol.') },
  { title: 'Whole row or whole reel', tid: 'lanefx', ids: (e) => e.id.startsWith('lane.') },
  { title: 'Cascades and tumbles', tid: 'cascadefx', ids: (e) => e.id.startsWith('cascade.') },
  { title: 'Reels: shake, zap, smoke, ice, glow, themes', tid: 'boardonly', ids: (e) => BOARD_ONLY.test(e.id) },
  { title: 'Ambient loops (behind the reels)', tid: 'ambient', ids: (e) => e.id.startsWith('ambient.') },
  { title: 'Animated frames', tid: 'frames', ids: (e) => e.id.startsWith('frame.') },
  { title: 'Feature trigger cinematic', tid: 'cinema', ids: (e) => e.id.startsWith('cinema.') },
  { title: 'Effects on text', tid: 'text', ids: (e) => e.id.startsWith('text.') },
  { title: 'Screen transitions', tid: 'transitions', ids: (e) => e.id.startsWith('transition.') },
];

export function EffectsPanel({ controller = null }: { controller?: PreviewController | null }) {
  const store = useStore();
  const doc = store.doc!;
  const els = doc.scene.elements;
  const images = els.filter((e) => e.kind === 'image');
  const boards = els.filter((e) => e.kind === 'board');
  const editFx = (id: string, mut: (l: FxLayer) => void, label?: string) => store.edit((s) => { const l = s.fx.find((x) => x.id === id); if (l) mut(l); }, `${id}:${label ?? ''}`);

  return (
    <div className="panel-body" data-testid="effects-panel">
      <div className="note">Effects play on top of the elements: impacts, distortions, light, celebrations, and the ways a symbol can leave or change. An effect that works on a symbol takes it over from its start.</div>
      {doc.scene.fx.length === 0 && <div className="note warn">No effects yet. Add one below.</div>}
      {doc.scene.fx.map((l) => {
        const e = effectById(l.effect);
        if (!e) return <div key={l.id} className="note err">Unknown effect “{l.effect}”. <Btn small danger onClick={() => store.edit((s) => { s.fx = s.fx.filter((x) => x.id !== l.id); })}>Remove</Btn></div>;
        const wantsTarget = !!e.usesObject || !!e.usesBoard || e.id === 'light.sparkle' || e.params.some((p) => p.key === 'cx');
        const targets = e.usesObject ? images : e.usesBoard ? boards : els;
        const optionalPicture = e.id.startsWith('emit.');
        const values = { ...defaultsOf(e), ...l.params };
        return (
          <Section key={l.id} title={e.name} open hint={`${l.enabled ? '' : 'off · '}${l.start.toFixed(2)} s`} testId={`fx-${l.id}`}>
            <div className="hint" style={{ color: 'var(--muted)' }}>{e.tagline}</div>
            <div className="row wrap">
              <Toggle label="On" value={l.enabled} onChange={(v) => editFx(l.id, (x) => { x.enabled = v; })} testId={`fx-${l.id}-on`} />
              <Btn small onClick={() => editFx(l.id, (x) => { x.params = {}; })} testId={`fx-${l.id}-reset`}>Reset settings</Btn>
              <Btn small danger onClick={() => store.edit((s) => { s.fx = s.fx.filter((x) => x.id !== l.id); })} testId={`fx-${l.id}-remove`}>Remove</Btn>
            </div>
            <Slider label="Starts at" value={l.start} min={0} max={20} step={0.01} unit="s" onChange={(v) => editFx(l.id, (x) => { x.start = v; }, 'start')} testId={`fx-${l.id}-start`} />
            {wantsTarget && (
              <Select label={optionalPicture ? 'Use this picture as the pieces' : e.usesObject ? 'Works on this symbol' : e.usesBoard ? 'Works on this board' : 'Aim at'} value={l.target ?? ''} testId={`fx-${l.id}-target`}
                options={[{ value: '', label: optionalPicture ? 'None: the built-in pieces' : e.usesObject ? 'Choose a symbol…' : e.usesBoard ? 'Choose a board…' : 'A position on the stage' }, ...targets.map((t) => ({ value: t.id, label: t.name }))]}
                onChange={(v) => editFx(l.id, (x) => { x.target = v || undefined; })} />
            )}
            {e.usesBoard && boards.length === 0 && <div className="note warn" data-testid={`fx-${l.id}-needs-board`}>This effect works on a reel board and there is none yet. Add one on the Content tab (“+ Reels”).</div>}
            {e.usesObject && !optionalPicture && !e.usesObject2 && (e.takesOver ?? true) && l.target && images.length > 1 && (
              <Select label="Frame that goes with it" value={l.frame ?? ''} testId={`fx-${l.id}-frame`}
                options={[{ value: '', label: 'None: only the symbol' }, ...images.filter((i) => i.id !== l.target).map((t) => ({ value: t.id, label: `${t.name}: take it along` }))]}
                onChange={(v) => editFx(l.id, (x) => { if (v) x.frame = v; else delete x.frame; })} />
            )}
            {l.frame && <div className="hint" style={{ color: 'var(--muted)' }}>The frame and the symbol are drawn as one picture and the effect takes the whole tile apart. For effects with a “Fills” setting, choose “The whole square” to fill the tile.</div>}
            {e.usesObject2 && (
              <Select label="Turns into" value={l.target2 ?? ''} testId={`fx-${l.id}-target2`} options={[{ value: '', label: 'Choose a symbol…' }, ...images.filter((i) => i.id !== l.target).map((t) => ({ value: t.id, label: t.name }))]} onChange={(v) => editFx(l.id, (x) => { x.target2 = v || undefined; })} />
            )}
            {!l.target && e.params.some((p) => p.key === 'cx') && (
              <div className="row"><div style={{ flex: 1 }}><Slider label="Position X" value={Number(values.cx)} min={0} max={1} step={0.005} onChange={(v) => editFx(l.id, (x) => { x.params.cx = v; }, 'cx')} testId={`fx-${l.id}-cx`} /></div><div style={{ flex: 1 }}><Slider label="Position Y" value={Number(values.cy)} min={0} max={1} step={0.005} onChange={(v) => editFx(l.id, (x) => { x.params.cy = v; }, 'cy')} testId={`fx-${l.id}-cy`} /></div></div>
            )}
            <ParamForm defs={e.params.filter((p) => !(l.target && e.usesObject && p.key === 'size'))} values={values} onChange={(k, v) => editFx(l.id, (x) => { x.params[k] = v; }, `p${k}`)} testPrefix={`fx-${l.id}`} />
            {e.params.some((p) => p.kind === 'color') && (
              <Section title="Colour ramp (optional)" hint={l.ramp ? 'on' : 'off'} testId={`fx-${l.id}-ramp-section`}>
                <div className="hint" style={{ color: 'var(--muted)' }}>Recolour this effect with a gradient: its darkest parts take the ramp's first colour and its hottest parts the last.</div>
                <Toggle label="Recolour with a gradient" value={!!l.ramp} testId={`fx-${l.id}-ramp-on`}
                  onChange={(on) => editFx(l.id, (x) => { if (on) x.ramp = { ...cloneGradient(GRADIENT_PRESETS.find((g) => g.id === 'fire')!.gradient), kind: 'linear' }; else delete x.ramp; })} />
                {l.ramp && <GradientEditor simple value={l.ramp} onChange={(g) => editFx(l.id, (x) => { x.ramp = g; }, 'ramp')} testId={`fx-${l.id}-ramp`} />}
              </Section>
            )}
          </Section>
        );
      })}
      <Section title="Add an effect" open testId="fx-add">
        {GROUPS.map((g) => (
          <Select key={g.title} label={g.title} value="" options={[{ value: '', label: 'Choose…' }, ...EFFECTS.filter(g.ids).map((e) => ({ value: e.id, label: e.name }))]} testId={`fx-add-${g.tid ?? g.title.split(' ')[0]!.toLowerCase()}`}
            onChange={(id) => { if (!id) return; const e = effectById(id)!; const sym = images[0]; store.edit((s) => { s.fx.push(fxLayer(id, { start: 0.5, ...(e.usesObject && sym && !e.id.startsWith('emit.') ? { target: sym.id } : {}), ...(e.usesBoard && boards[0] ? { target: boards[0].id } : {}) })); }); }} />
        ))}
        <Toggle label="Seamless loop: start again at once, with no rest (for backgrounds and frames)" value={doc.scene.seamless === true} onChange={(v) => store.edit((s) => { if (v) s.seamless = true; else delete s.seamless; })} testId="seamless" />
        <Toggle label="Play the effects' sounds in the preview" value={doc.scene.sound.enabled} onChange={(v) => store.edit((s) => { s.sound.enabled = v; })} testId="sound-on" />
      </Section>
      <SoundPanel controller={controller} />
    </div>
  );
}
