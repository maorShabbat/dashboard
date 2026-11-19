import { describe, expect, it } from 'vitest';
import { compileSequence, evaluateFrame, resolveClip, timelineEvents, eventsBetween } from '../src/core/engine';
import { EFFECT_LIST, EFFECTS } from '../src/core/effects/registry';
import { frameFingerprint } from '../src/core/fingerprint';
import { newClip, newMarker } from '../src/core/model/defaults';
import type { PresetContent, ThemeContent, SceneSpec } from '../src/core/model/types';
import { computeLayout, defaultSceneSpec } from '../src/core/board';
import { isRef, type ParamDef, type Value } from '../src/core/params';
import { emptyThemeContent, lib, seqWith } from './helpers';

const VP = { viewport: { w: 1280, h: 720 } };
const preset = (effectType: string, params: Record<string, Value> = {}, themeId: string | null = 'th', over: Partial<PresetContent> = {}): PresetContent =>
  ({ effectType, themeId, link: 'linked', snapshot: null, overrides: { params }, ...over });

describe('four-layer inheritance', () => {
  it('resolves BANGERS → theme → preset → instance with provenance and inherited values', () => {
    const theme: ThemeContent = { ...emptyThemeContent(), effectDefaults: { coinBurst: { params: { count: 80 } } } };
    const p = preset('coinBurst', { count: 100 });
    const L = lib({ th: theme }, { p1: p });
    const get = (presetId: string | null, inst: Record<string, Value> | null, themeC: ThemeContent | undefined) =>
      resolveClip('coinBurst', presetId, inst ? { params: inst } : null, themeC, L).resolution.find((r) => r.key === 'count')!;

    const a = get(null, null, undefined);
    expect([a.value, a.source]).toEqual([60, 'bangers']);
    const b = get(null, null, theme);
    expect([b.value, b.source, b.inherited.value, b.inherited.source]).toEqual([80, 'theme', 60, 'bangers']);
    const c = get('p1', null, theme);
    expect([c.value, c.source, c.inherited.value, c.inherited.source]).toEqual([100, 'preset', 80, 'theme']);
    const d = get('p1', { count: 120 }, theme);
    expect([d.value, d.source, d.inherited.value, d.inherited.source]).toEqual([120, 'instance', 100, 'preset']);
    expect(d.layers).toEqual({ bangers: 60, theme: 80, preset: 100, instance: 120 });
  });

  it('semantic colour roles flow through token references until overridden', () => {
    const theme: ThemeContent = { ...emptyThemeContent(), tokens: { 'color.win': '#00ff00' } };
    const L = lib({ th: theme }, { p: preset('symbolHighlight', { color: '#ff0000' }) });
    const val = (pid: string | null, inst?: Record<string, Value>) => resolveClip('symbolHighlight', pid, inst ? { params: inst } : null, theme, L).resolution.find((r) => r.key === 'color')!;
    const viaTheme = val(null);
    expect(viaTheme.value).toBe('#00ff00');
    expect(viaTheme.refKey).toBe('color.win');
    expect(val('p').value).toBe('#ff0000');
    const inst = val('p', { color: { $ref: 'color.secondary' } });
    expect(inst.source).toBe('instance');
    expect(inst.refKey).toBe('color.secondary');
    expect(inst.value).toBe('#2fd6ff');
    expect(inst.inherited.value).toBe('#ff0000');
  });

  it('clamps out-of-bounds overrides and flags them; ignores invalid references', () => {
    const r = resolveClip('coinBurst', null, { params: { count: 99999, shape: 'nonsense', colorA: { $ref: 'outline.width' } } }, undefined, lib());
    const count = r.resolution.find((x) => x.key === 'count')!;
    expect(count.value).toBe(400);
    expect(count.clamped).toBe(true);
    expect(r.resolution.find((x) => x.key === 'shape')!.value).toBe('coin');
    expect(r.resolution.find((x) => x.key === 'colorA')!.source).toBe('bangers');
  });

  it('a linked preset follows theme edits; a snapshot preset stays independent', () => {
    const th1: ThemeContent = { ...emptyThemeContent(), tokens: { 'color.win': '#111111' } };
    const th2: ThemeContent = { ...emptyThemeContent(), tokens: { 'color.win': '#222222' } };
    const snap: PresetContent = preset('symbolHighlight', {}, 'th', { link: 'snapshot', snapshot: { content: th1, fromThemeId: 'th', fromThemeName: 'T', fromVersion: null, takenAt: 'x' } });
    const linked = preset('symbolHighlight');
    const col = (themes: Record<string, ThemeContent>, p: PresetContent) => resolveClip('symbolHighlight', 'p', null, themes.th, lib(themes, { p })).params.color;
    expect(col({ th: th1 }, linked)).toBe('#111111');
    expect(col({ th: th2 }, linked)).toBe('#222222');
    expect(col({ th: th2 }, snap)).toBe('#111111');
  });

  it('reset-to-theme: removing preset+instance overrides restores the theme value', () => {
    const theme: ThemeContent = { ...emptyThemeContent(), effectDefaults: { shockwave: { params: { rings: 4 } } } };
    const p = preset('shockwave', { rings: 2 });
    const L = lib({ th: theme }, { p });
    expect(resolveClip('shockwave', 'p', { params: { rings: 6 } }, theme, L).params.rings).toBe(6);
    expect(resolveClip('shockwave', 'p', { params: {} }, theme, L).params.rings).toBe(2);
    expect(resolveClip('shockwave', null, null, theme, L).params.rings).toBe(4);
  });

  it('cue markers inherit and are replaced wholesale at the first layer that sets them', () => {
    const theme: ThemeContent = { ...emptyThemeContent(), effectDefaults: { coinBurst: { params: {}, cues: [{ id: 'x', at: 10, cue: 'whoosh', gain: 0 }] } } };
    const p = preset('coinBurst', {}, 'th', { overrides: { params: {}, cues: [{ id: 'y', at: 20, cue: 'win.big', gain: -3 }] } });
    const L = lib({ th: theme }, { p });
    expect(resolveClip('coinBurst', null, null, undefined, L).cueSource).toBe('bangers');
    expect(resolveClip('coinBurst', null, null, theme, L).cues.map((c) => c.cue)).toEqual(['whoosh']);
    const withPreset = resolveClip('coinBurst', 'p', null, theme, L);
    expect([withPreset.cueSource, withPreset.cues[0]!.cue]).toEqual(['preset', 'win.big']);
    expect(resolveClip('coinBurst', 'p', { params: {}, cues: [] }, theme, L).cues).toEqual([]);
  });
});

describe('every effect parameter is live (no dead controls)', () => {
  const scenes: SceneSpec[] = [defaultSceneSpec(), { ...defaultSceneSpec(), cols: 6, rows: 5, pattern: 'cluster', seed: 3 }];
  const alts = (p: ParamDef): Value[] => {
    switch (p.kind) {
      case 'number': return [p.min, p.max, (p.min + p.max) / 2].filter((v) => !isRef(p.default) ? v !== p.default : true);
      case 'boolean': return [!p.default];
      case 'enum': return p.options.map((o) => o.value).filter((v) => v !== p.default);
      case 'color': return ['#00ff88'];
      case 'text': return ['ZQXJ'];
      case 'font': return ['anton'];
      case 'asset': return ['m_x'];
    }
  };
  for (const def of EFFECT_LIST) {
    for (const p of def.params) {
      it(`${def.type}.${p.key} changes the output`, () => {
        const base: Record<string, Value> = {};
        if (p.activeWhen) base[p.activeWhen.key] = p.activeWhen.values[0] as Value;
        if (def.type === 'flash') base.duration = 3000; // strobes are capped by safety at short durations
        const baseline: string[] = [];
        const make = (over: Record<string, Value>, scene: SceneSpec) => {
          const s = seqWith(def.type); s.scene = scene;
          s.tracks[0]!.clips[0]!.overrides.params = { ...base, ...over };
          return compileSequence(s, lib());
        };
        const times = [0.05, 0.2, 0.4, 0.6, 0.85].map((x) => x);
        let changed = false;
        if (p.key === 'duration') {
          // Progress-driven effects look identical at equal *normalised* time; duration's observable effect is the clip length.
          const b = make({}, scenes[0]!), a = make({ duration: (p as { max: number }).max }, scenes[0]!);
          expect(a.duration).not.toBe(b.duration);
          return;
        }
        scenes.forEach((scene, si) => {
          const cb = make({}, scene);
          times.forEach((x, ti) => { baseline[si * 10 + ti] = frameFingerprint(evaluateFrame(cb, cb.duration * x, VP)); });
        });
        outer: for (const alt of alts(p)) {
          for (let si = 0; si < scenes.length; si++) {
            const c = make({ [p.key]: alt }, scenes[si]!);
            for (let ti = 0; ti < times.length; ti++) {
              // For "duration", compare at matching normalised time
              if (frameFingerprint(evaluateFrame(c, c.duration * times[ti]!, VP)) !== baseline[si * 10 + ti]) { changed = true; break outer; }
            }
          }
        }
        expect(changed, `${def.type}.${p.key} had no visible effect for any alternative value`).toBe(true);
      });
    }
  }
});

describe('board-aware sizing', () => {
  it('derives cell size from board shape and viewport and scales % cell parameters with it', () => {
    const tok = { gap: 6, padding: 30, frameWidth: 8 };
    const desktop3 = computeLayout(3, 3, 1280, 720, tok), desktop7 = computeLayout(7, 7, 1280, 720, tok), mobile5 = computeLayout(5, 3, 390, 844, tok);
    expect(desktop3.cell).toBeGreaterThan(desktop7.cell * 1.8);
    expect(mobile5.cell).toBeLessThan(desktop3.cell);
    expect(desktop7.board.w).toBeLessThanOrEqual(1280);
    expect(mobile5.board.w).toBeLessThanOrEqual(390 + 0.001);
    expect(desktop3.px(50)).toBeCloseTo(desktop3.cell / 2, 6);
    const r = desktop7.cellRect(6, 6);
    expect(r.x + r.w).toBeLessThanOrEqual(desktop7.board.x + desktop7.board.w);
  });
  it('the same effect draws proportionally larger on bigger cells', () => {
    const run = (cols: number, rows: number) => {
      const s = seqWith('shockwave'); s.scene = { ...defaultSceneSpec(), cols, rows };
      const f = evaluateFrame(compileSequence(s, lib()), 500, VP);
      const ring = f.ops.find((o) => o.op === 'ellipse' && o.layer === 'fxAbove');
      return { ring: ring && ring.op === 'ellipse' ? ring.rx : 0, cell: f.cell };
    };
    const a = run(3, 3), b = run(8, 8);
    expect(a.ring / a.cell).toBeCloseTo(b.ring / b.cell, 2);
  });
});

describe('sequences: overlap, stagger, markers', () => {
  it('repeat staggers instances; order modes permute starts; stagger scale applies', () => {
    const fixed = seqWith('shockwave');
    const base = (order: 'forward' | 'reverse' | 'center' | 'random', themeScale?: number) => {
      const s = { ...fixed, themeId: themeScale === undefined ? null : 'th', tracks: [{ ...fixed.tracks[0]!, clips: [{ ...fixed.tracks[0]!.clips[0]!, repeat: { count: 4, step: 100, order } }] }] };
      const th: ThemeContent = { ...emptyThemeContent(), tokens: themeScale === undefined ? {} : { 'motion.staggerScale': themeScale } };
      return compileSequence(s, lib({ th }));
    };
    const starts = (c: ReturnType<typeof base>) => c.clips.slice().sort((a, b) => a.instance.index - b.instance.index).map((x) => x.start);
    expect(starts(base('forward'))).toEqual([0, 100, 200, 300]);
    expect(starts(base('reverse'))).toEqual([300, 200, 100, 0]);
    expect([...starts(base('center'))].sort((a, b) => a - b)).toEqual([0, 100, 200, 300]);
    expect(starts(base('center'))).toEqual([200, 0, 100, 300]); // middle instances start first (centre-out)
    expect(starts(base('random')).slice().sort((a, b) => a - b)).toEqual([0, 100, 200, 300]);
    expect(starts(base('random'))).toEqual(starts(base('random')));
    expect(starts(base('forward', 2))).toEqual([0, 200, 400, 600]);
    expect(starts(base('forward', 0))).toEqual([0, 0, 0, 0]);
  });

  it('clips overlap freely; frames contain every active clip; duration follows the last end', () => {
    const s = seqWith('shockwave');
    s.tracks[0]!.clips.push(newClip('screenShake', 300, null, 'shake'), newClip('flash', 450, null, 'flash'));
    const c = compileSequence(s, lib());
    expect(c.duration).toBe(Math.max(...c.clips.map((x) => x.end)));
    const f = evaluateFrame(c, 600, VP);
    expect(f.active.map((a) => a.effectType).sort()).toEqual(['flash', 'screenShake', 'shockwave']);
    expect(evaluateFrame(c, 0, VP).active.map((a) => a.effectType)).toEqual(['shockwave']);
    expect(f.camera.dx !== 0 || f.camera.dy !== 0 || f.camera.zoom !== 0).toBe(true);
  });

  it('mute and solo gate tracks; fixedDuration overrides natural length', () => {
    const s = seqWith('shockwave');
    s.tracks.push({ id: 't2', name: 'B', muted: false, solo: false, locked: false, clips: [newClip('flash', 0)] });
    expect(compileSequence(s, lib()).clips.every((c) => c.audible)).toBe(true);
    s.tracks[1]!.solo = true;
    expect(compileSequence(s, lib()).clips.filter((c) => c.audible).map((c) => c.effectType)).toEqual(['flash']);
    s.tracks[1]!.solo = false; s.tracks[0]!.muted = true;
    expect(compileSequence(s, lib()).clips.filter((c) => c.audible).map((c) => c.effectType)).toEqual(['flash']);
    s.fixedDuration = 5000;
    expect(compileSequence(s, lib()).duration).toBe(5000);
  });

  it('event markers and effect cues fire in order, once, with theme audio routing', () => {
    const s = seqWith('coinBurst');
    s.markers.push(newMarker('event', 700, 'win.celebrationMid'), newMarker('cue', 100, 'whoosh'), newMarker('label', 50, 'note'));
    const th: ThemeContent = { ...emptyThemeContent(), tokens: { 'cue.whoosh.gain': -6, 'cue.whoosh.pitch': 3, 'cue.coin.burst.enabled': false } };
    const c = compileSequence({ ...s, themeId: 'th' }, lib({ th }));
    const ev = timelineEvents(c);
    expect(ev.map((e) => e.t)).toEqual([...ev.map((e) => e.t)].sort((a, b) => a - b));
    expect(ev.find((e) => e.name === 'win.celebrationMid')?.kind).toBe('event');
    const whoosh = ev.find((e) => e.name === 'whoosh')!;
    expect(whoosh.audio).toMatchObject({ gainDb: -6, pitch: 3, enabled: true });
    expect(ev.find((e) => e.name === 'coin.burst')!.audio!.enabled).toBe(false);
    const first = eventsBetween(ev, -1, 100), second = eventsBetween(ev, 100, 2000);
    expect(first.length + second.length).toBe(ev.length);
    expect(first.some((e) => e.name === 'coin.burst' && e.t === 0)).toBe(true);
  });
});

describe('safety and accessibility', () => {
  it('flash strobes are capped by safety.maxFlashHz and opacity by safety.maxFlashAlpha', () => {
    const run = (tokens: Record<string, Value>, over: Record<string, Value>) => {
      const th: ThemeContent = { ...emptyThemeContent(), tokens };
      const s = seqWith('flash', 'th'); s.tracks[0]!.clips[0]!.overrides.params = { duration: 1000, attack: 50, ...over };
      const c = compileSequence(s, lib({ th }));
      let peaks = 0, prev = 0, max = 0, rising = false;
      for (let t = 0; t <= 1000; t += 5) {
        const f = evaluateFrame(c, t, VP);
        const a = f.ops.find((o) => o.layer === 'overlay')?.alpha ?? 0;
        if (a > prev + 1e-9) rising = true; else if (a < prev - 1e-9 && rising) { peaks++; rising = false; }
        prev = a; max = Math.max(max, a);
      }
      return { peaks: peaks + (rising ? 1 : 0), max };
    };
    const capped = run({ 'safety.maxFlashHz': 3 }, { strobes: 8, peak: 100 });
    expect(capped.peaks).toBeLessThanOrEqual(3);
    expect(capped.max).toBeLessThanOrEqual(0.85 + 1e-9);
    const free = run({ 'safety.maxFlashHz': 3, 'intensity.master': 1 }, { strobes: 2, peak: 100, duration: 1000 });
    expect(free.peaks).toBe(2);
  });
  it('reduced motion scales shake, flash and motion intensity', () => {
    const c = compileSequence(seqWith('screenShake'), lib());
    const amp = (reduced: boolean) => { const f = evaluateFrame(c, 60, { ...VP, reducedMotion: reduced }); return Math.hypot(f.camera.dx, f.camera.dy); };
    expect(amp(true)).toBeLessThan(amp(false) * 0.5);
  });
  it('intensity hierarchy: master × family × effect', () => {
    const th: ThemeContent = { ...emptyThemeContent(), tokens: { 'intensity.master': 0.5, 'intensity.particles': 2 } };
    const s = seqWith('coinBurst', 'th'); s.tracks[0]!.clips[0]!.overrides.params.intensity = 1;
    const c = compileSequence(s, lib({ th }));
    const f = evaluateFrame(c, 400, VP);
    const base = evaluateFrame(compileSequence({ ...s, themeId: null }, lib()), 400, VP);
    // master 0.5 × particles 2 = 1.0 → identical to defaults
    expect(frameFingerprint(f)).toBe(frameFingerprint(base));
    s.tracks[0]!.clips[0]!.overrides.params.intensity = 0;
    expect(evaluateFrame(compileSequence(s, lib({ th })), 400, VP).ops.filter((o) => o.layer === 'fxAbove').length).toBe(0);
  });
  it('every effect exists in the registry referenced by definitions', () => {
    for (const e of EFFECT_LIST) expect(EFFECTS[e.type]).toBe(e);
  });
});
