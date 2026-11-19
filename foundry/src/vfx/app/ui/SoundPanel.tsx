import { useMemo, useRef, useState } from 'react';
import { cuePoints, resolveSounds } from '../../fx/cues';
import { sceneAllAssets, soundAttach, type SoundAttach } from '../../model/scene';
import type { PreviewController } from '../controller';
import { Btn, Section, Select, Slider, Toggle } from './widgets';
import { useServices, useStore } from './services';

/** Your own sound files, each attached to a moment of the scene (an effect's impact, a reel stopping, a win, the title slamming in). */
export function SoundPanel({ controller }: { controller: PreviewController | null }) {
  const store = useStore();
  const { images } = useServices();
  const doc = store.doc!;
  const scene = doc.scene;
  const file = useRef<HTMLInputElement>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const length = controller?.duration ?? scene.duration ?? 5;
  const cues = useMemo(() => cuePoints(scene, length), [scene, length]);
  const list = scene.sounds ?? [];
  const missing = useMemo(() => new Set(resolveSounds(scene, length).missing.map((m) => m.id)), [scene, length]);
  const editSound = (id: string, mut: (s: SoundAttach) => void, label?: string) => store.edit((s) => { const t = s.sounds?.find((x) => x.id === id); if (t) mut(t); }, `sound:${id}:${label ?? ''}`);
  const groups = ['Scene', 'Elements', 'Effects', 'Reels'] as const;

  const take = async (f: File | undefined) => {
    if (!f) return;
    setErr(null); setBusy(true);
    try {
      const ref = await images.addAudio(f, f.name);
      // the first moment worth hitting: an effect's impact, else the first effect's start, else the start of the scene
      const first = cues.find((c) => c.key.endsWith(':impact')) ?? cues.find((c) => c.key.startsWith('fx:') && c.key.endsWith(':start')) ?? cues[0]!;
      store.edit((s) => {
        if (!s.assets.some((a) => a.id === ref.id)) s.assets.push(ref);
        s.sound.enabled = true;
        (s.sounds ??= []).push(soundAttach({ asset: ref.id, cue: first.key, name: f.name.replace(/\.[^.]+$/, '').slice(0, 40) }));
      });
      store.say(`Sound “${f.name}” attached to “${first.label}”.`, 'ok');
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  const remove = (id: string) => store.edit((s) => {
    s.sounds = (s.sounds ?? []).filter((x) => x.id !== id);
    if (!s.sounds.length) delete s.sounds;
    const used = new Set(sceneAllAssets(s));
    s.assets = s.assets.filter((a) => used.has(a.id));
  });

  return (
    <Section title="Your own sounds" open={list.length > 0} hint={list.length ? `${list.length}` : 'none'} testId="sounds-section">
      <div className="hint" style={{ color: 'var(--muted)' }}>Attach your own sound files (MP3, WAV, OGG or M4A, up to 8 MB) to moments of this effect. They play in the preview and are shipped inside the export, and the player tells your game when each one is due.</div>
      <Toggle label="Keep the built-in generated sounds as well" value={scene.sound.builtin !== false} onChange={(v) => store.edit((s) => { if (v) delete s.sound.builtin; else s.sound.builtin = false; })} testId="sound-builtin" />
      {list.map((sd) => {
        const gone = missing.has(sd.id);
        const here = cues.find((c) => c.key === sd.cue);
        return (
          <div key={sd.id} className="sound" data-testid={`sound-row-${sd.id}`} style={{ display: 'grid', gap: 8, padding: 10, border: '1px solid var(--line)', borderRadius: 8 }}>
            <div className="row" style={{ alignItems: 'center', gap: 8 }}>
              <b style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={sd.name}>♪ {sd.name}</b>
              <Btn small onClick={() => { void controller?.previewSound(sd.asset, sd.gain).catch((e: Error) => setErr(e.message)); }} title="Play this sound now" testId={`sound-play-${sd.id}`}>▶ Play</Btn>
              <Btn small ghost danger onClick={() => remove(sd.id)} title="Remove this sound" testId={`sound-remove-${sd.id}`}>✕</Btn>
            </div>
            <Select label="Plays at" value={gone ? '' : sd.cue} testId={`sound-cue-${sd.id}`}
              options={[...(gone ? [{ value: '', label: 'This moment no longer exists: choose another' }] : []), ...groups.flatMap((g) => cues.filter((c) => c.group === g).map((c) => ({ value: c.key, label: `${c.label} · ${c.t.toFixed(2)} s` })))]}
              onChange={(v) => { if (v) editSound(sd.id, (x) => { x.cue = v; }, 'cue'); }} />
            <div className="row"><div style={{ flex: 1 }}><Slider label="Earlier / later" value={sd.offset} min={-1} max={3} step={0.01} unit="s" onChange={(v) => editSound(sd.id, (x) => { x.offset = v; }, 'offset')} testId={`sound-offset-${sd.id}`} hint={here ? `Starts at ${Math.max(0, here.t + sd.offset).toFixed(2)} s` : undefined} /></div>
              <div style={{ flex: 1 }}><Slider label="Volume" value={sd.gain} min={0} max={2} step={0.01} onChange={(v) => editSound(sd.id, (x) => { x.gain = v; }, 'gain')} testId={`sound-gain-${sd.id}`} /></div></div>
          </div>
        );
      })}
      <input ref={file} type="file" hidden accept="audio/*,.mp3,.wav,.ogg,.m4a,.aac,.flac,.opus" data-testid="sound-file" onChange={(e) => { void take(e.target.files?.[0]); e.target.value = ''; }} />
      <Btn small onClick={() => file.current?.click()} disabled={busy || list.length >= 40} testId="sound-add">{busy ? 'Reading…' : '+ Add a sound file…'}</Btn>
      {!scene.sound.enabled && list.length > 0 && <div className="note warn">Sounds are switched off in the preview. Turn on “Play the effects' sounds in the preview” above to hear them.</div>}
      {err && <div className="note err" role="alert" data-testid="sound-error">{err}</div>}
    </Section>
  );
}
