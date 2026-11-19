/**
 * Cue points: the moments a scene defines for itself, which your own sound files can be attached to. A cue point is found by its key,
 * so it keeps meaning the same moment when the scene is edited (an effect layer or a reel stopping), and an attached sound whose cue has
 * gone is reported rather than played at the wrong time.
 *
 *   scene:start | scene:end
 *   el:<element id>:in                       an element appears (the start of its entrance)
 *   fx:<layer id>:start | :impact | :end     an effect starts, lands its impact (if it has one), ends
 *   board:<element id>:<event>[:<n>]         spin-start, reel-stop:<reel>, land:<n>, anticipation, win:<n>, expand, pop:<n>, drop:<n>, collect:<n>
 */
import { planBoard } from '../model/board';
import type { Scene, SoundAttach } from '../model/scene';
import { defaultsOf } from './effect';
import { effectById } from './index';

export interface CuePoint { key: string; label: string; t: number; group: 'Scene' | 'Elements' | 'Effects' | 'Reels' }

const r2 = (x: number): number => Math.round(x * 1000) / 1000;

export function cuePoints(scene: Scene, duration: number): CuePoint[] {
  const out: CuePoint[] = [{ key: 'scene:start', label: 'The scene starts', t: 0, group: 'Scene' }];
  for (const e of scene.elements) {
    if (e.hidden) continue;
    out.push({ key: `el:${e.id}:in`, label: `${e.name}: appears`, t: r2(e.start + (e.motion.entrance?.start ?? 0)), group: 'Elements' });
    if (e.kind === 'board') {
      const plan = planBoard(e), seen = new Map<string, number>();
      for (const ev of plan.events) {
        const n = seen.get(ev.kind) ?? 0; seen.set(ev.kind, n + 1);
        const t = r2(ev.t + e.start);
        if (t < 0) continue;
        const base = `board:${e.id}:`, who = e.name;
        switch (ev.kind) {
          case 'spin-start': out.push({ key: `${base}spin-start`, label: `${who}: the reels start spinning`, t, group: 'Reels' }); break;
          case 'reel-stop': out.push({ key: `${base}reel-stop:${ev.reel}`, label: `${who}: reel ${(ev.reel ?? 0) + 1} stops`, t, group: 'Reels' }); break;
          case 'land': out.push({ key: `${base}land:${n}`, label: `${who}: a ${ev.role ?? 'special'} symbol lands (${n + 1})`, t, group: 'Reels' }); break;
          case 'anticipation': out.push({ key: `${base}anticipation`, label: `${who}: anticipation begins`, t, group: 'Reels' }); break;
          case 'win': out.push({ key: `${base}win:${n}`, label: `${who}: ${n === 0 ? 'the win is shown' : `win ${n + 1} is shown`}`, t, group: 'Reels' }); break;
          case 'expand': out.push({ key: `${base}expand`, label: `${who}: the wild expands`, t, group: 'Reels' }); break;
          case 'pop': out.push({ key: `${base}pop:${n}`, label: `${who}: winners pop (${n + 1})`, t, group: 'Reels' }); break;
          case 'drop': out.push({ key: `${base}drop:${n}`, label: `${who}: new symbols drop in (${n + 1})`, t, group: 'Reels' }); break;
          case 'collect': out.push({ key: `${base}collect:${n}`, label: `${who}: bonus tile ${n + 1} is collected`, t, group: 'Reels' }); break;
        }
      }
    }
  }
  const names = new Map<string, number>();
  for (const l of scene.fx) {
    if (!l.enabled) continue;
    const fx = effectById(l.effect);
    if (!fx) continue;
    const seen = (names.get(fx.name) ?? 0) + 1; names.set(fx.name, seen);
    const who = seen > 1 ? `${fx.name} (${seen})` : fx.name, p = { ...defaultsOf(fx), ...l.params };
    out.push({ key: `fx:${l.id}:start`, label: `${who}: starts`, t: r2(l.start), group: 'Effects' });
    const impact = fx.impactAt?.(p) ?? 0;
    if (impact > 0.05) out.push({ key: `fx:${l.id}:impact`, label: `${who}: the impact`, t: r2(l.start + impact), group: 'Effects' });
    out.push({ key: `fx:${l.id}:end`, label: `${who}: ends`, t: r2(l.start + fx.duration(p)), group: 'Effects' });
  }
  out.push({ key: 'scene:end', label: 'The scene ends', t: r2(duration), group: 'Scene' });
  return out.sort((a, b) => a.t - b.t);
}

export interface ResolvedSound { id: string; name: string; asset: string; t: number; gain: number }

/** The attached sounds with their times worked out, and the ones whose cue point no longer exists. */
export function resolveSounds(scene: Scene, duration: number): { sounds: ResolvedSound[]; missing: SoundAttach[] } {
  const list = scene.sounds ?? [];
  if (!list.length) return { sounds: [], missing: [] };
  const points = new Map(cuePoints(scene, duration).map((c) => [c.key, c]));
  const sounds: ResolvedSound[] = [], missing: SoundAttach[] = [];
  for (const a of list) {
    const cp = points.get(a.cue);
    if (!cp) { missing.push(a); continue; }
    sounds.push({ id: a.id, name: a.name, asset: a.asset, t: Math.max(0, r2(cp.t + a.offset)), gain: a.gain * (scene.sound.enabled ? scene.sound.volume : 0) });
  }
  return { sounds: sounds.sort((x, y) => x.t - y.t), missing };
}
