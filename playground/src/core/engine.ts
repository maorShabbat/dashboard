/**
 * Sequence engine. `compileSequence` resolves the whole inheritance chain for every clip; `evaluateFrame` turns a compiled
 * sequence plus a time into a display list. Both are pure and deterministic, which is what makes scrubbing, replay and
 * bundle verification possible.
 */
import { buildScene, computeLayout, type Rect } from './board';
import { CUES, type CueMarker } from './cues';
import { EFFECTS } from './effects/registry';
import type { AssetIndex, EffectContext, IntensityCategory } from './effects/types';
import { emptyThemeContent } from './model/defaults';
import type { Clip, PresetContent, SceneSpec, SeqMarker, SequenceContent, ThemeContent } from './model/types';
import { type CameraMod, type DrawOp, Out } from './ops';
import type { Scalar } from './params';
import { type ParamResolution, type ResolvedTokens, resolveCues, resolveParams, resolveTokens } from './resolve';
import { backdropOps, boardOps, mergeCellMods, symbolOps } from './scene';
import { LAYERS, type LayerId } from './tokens';
import { makeEasing, type EasingName } from './util/easing';
import { hashString, makeRng } from './util/prng';

export interface LibraryView {
  theme(id: string): ThemeContent | undefined;
  preset(id: string): PresetContent | undefined;
}

export const NO_ASSETS: AssetIndex = { has: () => false, hash: () => undefined };

export type ThemeBasis = 'preset-theme' | 'snapshot' | 'sequence-theme' | 'fallback';

export interface CompiledClip {
  clipId: string;
  trackId: string;
  trackIndex: number;
  name: string;
  presetId: string | null;
  effectType: string;
  instance: { index: number; count: number };
  start: number;
  duration: number;
  end: number;
  params: Record<string, Scalar>;
  /** Full provenance for every parameter (used by editors). */
  resolution: ParamResolution[];
  tokens: ResolvedTokens;
  cues: CueMarker[];
  cueSource: string;
  basis: ThemeBasis;
  audible: boolean;
  warnings: string[];
}

export interface CompiledSequence {
  themeId: string | null;
  scene: SceneSpec;
  tokens: ResolvedTokens;
  clips: CompiledClip[];
  markers: SeqMarker[];
  duration: number;
  warnings: string[];
}

// ---------------------------------------------------------------------------------------------------------------------
// Compile

export interface ClipResolution {
  tokens: ResolvedTokens;
  resolution: ParamResolution[];
  params: Record<string, Scalar>;
  cues: CueMarker[];
  cueSource: string;
  basis: ThemeBasis;
  warnings: string[];
}

/** Resolve one clip (or a bare effect) through BANGERS → theme → preset → instance. */
export function resolveClip(
  effectType: string, presetId: string | null, instance: { params: Record<string, import('./params').Value>; cues?: CueMarker[] | undefined } | null,
  seqTheme: ThemeContent | undefined, lib: LibraryView,
): ClipResolution {
  const def = EFFECTS[effectType];
  if (!def) throw new Error(`Unknown effect type "${effectType}"`);
  const warnings: string[] = [];
  let theme = seqTheme ?? emptyThemeContent();
  let basis: ThemeBasis = seqTheme ? 'sequence-theme' : 'fallback';
  const preset = presetId ? lib.preset(presetId) : undefined;
  if (presetId && !preset) warnings.push(`Preset ${presetId} not found; using theme defaults`);
  if (preset) {
    if (preset.effectType !== effectType) warnings.push(`Preset is for "${preset.effectType}" but clip uses "${effectType}"`);
    if (preset.link === 'snapshot' && preset.snapshot) { theme = preset.snapshot.content; basis = 'snapshot'; }
    else if (preset.themeId) {
      const t = lib.theme(preset.themeId);
      if (t) { theme = t; basis = 'preset-theme'; } else warnings.push(`Linked theme ${preset.themeId} not found; using the sequence theme`);
    }
  }
  const tokens = resolveTokens(theme.tokens);
  const themeSet = theme.effectDefaults[effectType];
  const chain = [
    { source: 'theme' as const, overrides: themeSet?.params },
    { source: 'preset' as const, overrides: preset?.overrides.params },
    { source: 'instance' as const, overrides: instance?.params },
  ];
  const resolution = resolveParams(def.params, tokens, chain);
  const params: Record<string, Scalar> = {};
  for (const r of resolution) params[r.key] = r.value;
  const defaults = def.defaultCues.map((c, i) => ({ id: `default-${i}`, at: c.at, cue: c.cue, gain: 0 }));
  const cr = resolveCues(defaults, [
    { source: 'theme', set: themeSet }, { source: 'preset', set: preset?.overrides }, { source: 'instance', set: instance ? { params: {}, cues: instance.cues } : undefined },
  ]);
  return { tokens, resolution, params, cues: cr.markers, cueSource: cr.source, basis, warnings };
}

function repeatRanks(order: Clip['repeat']['order'], count: number, seedKey: string): number[] {
  const idx = Array.from({ length: count }, (_, i) => i);
  switch (order) {
    case 'reverse': return idx.map((i) => count - 1 - i);
    case 'center': {
      const mid = (count - 1) / 2;
      const sorted = [...idx].sort((a, b) => Math.abs(a - mid) - Math.abs(b - mid) || a - b);
      const rank = new Array<number>(count);
      sorted.forEach((i, r) => { rank[i] = r; });
      return rank;
    }
    case 'random': {
      const rng = makeRng(hashString(seedKey));
      const perm = [...idx];
      for (let i = perm.length - 1; i > 0; i--) { const j = rng.int(0, i); [perm[i], perm[j]] = [perm[j]!, perm[i]!]; }
      return perm;
    }
    default: return idx;
  }
}

export function compileSequence(seq: SequenceContent, lib: LibraryView): CompiledSequence {
  const warnings: string[] = [];
  const seqTheme = seq.themeId ? lib.theme(seq.themeId) : undefined;
  if (seq.themeId && !seqTheme) warnings.push(`Theme ${seq.themeId} not found; using BANGERS defaults`);
  const tokens = resolveTokens(seqTheme?.tokens);
  const anySolo = seq.tracks.some((t) => t.solo);
  const clips: CompiledClip[] = [];
  seq.tracks.forEach((track, trackIndex) => {
    const audible = !track.muted && (!anySolo || track.solo);
    for (const clip of track.clips) {
      if (!EFFECTS[clip.effectType]) { warnings.push(`Clip "${clip.name || clip.id}": unknown effect "${clip.effectType}" skipped`); continue; }
      const r = resolveClip(clip.effectType, clip.presetId, clip.overrides, seqTheme, lib);
      const dur = Math.max(1, (r.params.duration as number) * (r.tokens.values['motion.durationScale'] as number));
      const count = Math.max(1, Math.min(32, Math.round(clip.repeat.count)));
      const ranks = repeatRanks(clip.repeat.order, count, clip.id);
      const step = clip.repeat.step * (r.tokens.values['motion.staggerScale'] as number);
      for (let i = 0; i < count; i++) {
        const start = clip.start + ranks[i]! * step;
        clips.push({
          clipId: clip.id, trackId: track.id, trackIndex, name: clip.name, presetId: clip.presetId, effectType: clip.effectType,
          instance: { index: i, count }, start, duration: dur, end: start + dur, params: r.params, resolution: r.resolution, tokens: r.tokens,
          cues: r.cues, cueSource: r.cueSource, basis: r.basis, audible: audible && !clip.muted, warnings: i === 0 ? r.warnings : [],
        });
      }
    }
  });
  clips.sort((a, b) => a.start - b.start || a.trackIndex - b.trackIndex || a.instance.index - b.instance.index);
  const natural = Math.max(0, ...clips.map((c) => c.end), ...seq.markers.map((m) => m.t));
  return { themeId: seq.themeId, scene: seq.scene, tokens, clips, markers: seq.markers, duration: seq.fixedDuration ?? natural, warnings };
}

// ---------------------------------------------------------------------------------------------------------------------
// Events / cues

export interface TimelineEvent {
  t: number;
  kind: 'cue' | 'event' | 'label';
  name: string;
  source: 'clip' | 'sequence';
  clipId?: string;
  /** Resolved audio routing for cues (theme gain/pitch/asset). */
  audio?: { enabled: boolean; asset: string; gainDb: number; pitch: number };
}

function audioFor(tokens: ResolvedTokens, cue: string, extraGain: number): TimelineEvent['audio'] {
  const v = tokens.values;
  return {
    enabled: (v[`cue.${cue}.enabled`] as boolean | undefined) ?? true,
    asset: (v[`cue.${cue}.asset`] as string | undefined) ?? '',
    gainDb: ((v[`cue.${cue}.gain`] as number | undefined) ?? 0) + extraGain,
    pitch: (v[`cue.${cue}.pitch`] as number | undefined) ?? 0,
  };
}

/** Every cue and event on the timeline, in firing order. */
export function timelineEvents(seq: CompiledSequence): TimelineEvent[] {
  const out: (TimelineEvent & { _o: number })[] = [];
  let o = 0;
  for (const c of seq.clips) {
    if (!c.audible) continue;
    for (const m of c.cues) {
      const at = Math.min(Math.max(0, m.at), c.duration);
      out.push({ t: c.start + at, kind: 'cue', name: m.cue, source: 'clip', clipId: c.clipId, audio: audioFor(c.tokens, m.cue, m.gain), _o: o++ });
    }
  }
  for (const m of seq.markers) {
    out.push({ t: m.t, kind: m.kind, name: m.name, source: 'sequence', ...(m.kind === 'cue' ? { audio: audioFor(seq.tokens, m.name, m.gain) } : {}), _o: o++ });
  }
  out.sort((a, b) => a.t - b.t || a._o - b._o);
  return out.filter((e) => e.t <= seq.duration + 1e-6).map(({ _o, ...e }) => { void _o; return e; });
}

/** Events with from < t <= to; pass from = -1 to include t = 0. */
export function eventsBetween(events: TimelineEvent[], from: number, to: number): TimelineEvent[] {
  return events.filter((e) => e.t > from && e.t <= to);
}

// ---------------------------------------------------------------------------------------------------------------------
// Frame evaluation

export interface ResolvedLayer { id: LayerId; visible: boolean; opacity: number; blend: string; z: number; followsCamera: boolean }

export interface Frame {
  t: number;
  viewport: { w: number; h: number };
  cell: number;
  board: Rect;
  layers: ResolvedLayer[];
  ops: DrawOp[];
  camera: CameraMod;
  active: { clipId: string; instance: number; effectType: string }[];
}

export interface FrameOptions { viewport: { w: number; h: number }; assets?: AssetIndex; reducedMotion?: boolean }

export function resolveLayers(tokens: ResolvedTokens): ResolvedLayer[] {
  const v = tokens.values;
  return LAYERS.map((l, i) => ({
    id: l.id, visible: v[`layer.${l.id}.visible`] as boolean, opacity: (v[`layer.${l.id}.opacity`] as number) / 100,
    blend: v[`layer.${l.id}.blend`] as string, z: v[`layer.${l.id}.z`] as number, followsCamera: v[`layer.${l.id}.followsCamera`] as boolean, _i: i,
  })).sort((a, b) => a.z - b.z || a._i - b._i).map(({ _i, ...r }) => { void _i; return r; });
}

const REDUCED_CATEGORIES: IntensityCategory[] = ['shake', 'flash', 'motion', 'particles'];

export function effectIntensity(category: IntensityCategory, tokens: ResolvedTokens, params: Record<string, Scalar>, reduced: boolean): number {
  const v = tokens.values;
  let I = (v['intensity.master'] as number) * (v[`intensity.${category}`] as number) * ((params.intensity as number | undefined) ?? 1);
  if (reduced && REDUCED_CATEGORIES.includes(category)) I *= v['intensity.reducedMotion'] as number;
  return I;
}

export function evaluateFrame(seq: CompiledSequence, tRaw: number, opts: FrameOptions): Frame {
  const assets = opts.assets ?? NO_ASSETS;
  const t = Math.min(Math.max(0, tRaw), Math.max(seq.duration, 0));
  const tv = seq.tokens.values;
  const scene = buildScene(seq.scene);
  const layout = computeLayout(scene.cols, scene.rows, opts.viewport.w, opts.viewport.h, {
    gap: tv['board.gap'] as number, padding: tv['board.padding'] as number, frameWidth: tv['board.frameWidth'] as number,
  });
  const out = new Out();
  for (const op of backdropOps(tv, layout, assets)) out.push(op);
  for (const op of boardOps(tv, layout, scene)) out.push(op);
  const active: Frame['active'] = [];

  for (const c of seq.clips) {
    if (!c.audible || t < c.start || t > c.end) continue;
    const def = EFFECTS[c.effectType]!;
    const lt = t - c.start;
    const easingParam = c.params.easing as string | undefined;
    const ease = makeEasing({
      easing: ((easingParam && easingParam !== 'theme' ? easingParam : c.tokens.values['motion.easing']) as EasingName),
      overshoot: c.tokens.values['motion.overshoot'] as number,
      springFrequency: c.tokens.values['motion.springFrequency'] as number,
      springDamping: c.tokens.values['motion.springDamping'] as number,
    });
    const layer = ((c.params.layer as LayerId | undefined) ?? def.defaultLayer ?? 'fxAbove');
    const seed = ((c.params.seed as number | undefined) ?? 0);
    const base = hashString(`${c.clipId}#${c.instance.index}#${seed}`);
    const ctx: EffectContext = {
      t: lt, duration: c.duration, p: Math.min(1, Math.max(0, lt / c.duration)), params: c.params, tokens: c.tokens.values, ease,
      intensity: effectIntensity(def.category, c.tokens, c.params, !!opts.reducedMotion), reducedMotion: !!opts.reducedMotion,
      layout, scene, layer, rng: (salt) => makeRng((base ^ Math.imul(salt + 1, 0x9e3779b1)) >>> 0), instance: c.instance, out, assets,
    };
    def.evaluate(ctx);
    active.push({ clipId: c.clipId, instance: c.instance.index, effectType: c.effectType });
  }

  for (const op of symbolOps(tv, layout, scene, mergeCellMods(out.cells))) out.push(op);
  const cam = out.camera.reduce((a, m) => ({ dx: a.dx + m.dx, dy: a.dy + m.dy, rot: a.rot + m.rot, zoom: a.zoom + m.zoom }), { dx: 0, dy: 0, rot: 0, zoom: 0 });
  return { t, viewport: opts.viewport, cell: layout.cell, board: layout.board, layers: resolveLayers(seq.tokens), ops: out.ops, camera: cam, active };
}
