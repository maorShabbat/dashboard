/** Helpers for authoring the built-in presets compactly. Nothing here is special at run time: a preset is plain scene data. */
import { specFor } from '../anim/motions';
import { PRESET_SCHEMA, type CategoryId, type Preset, type PresetInput, type PresetStatus } from '../model/preset';
import {
  counterElement, emptyScene, fxLayer, imageElement, shapeElement, textElement, defaultShine,
  type CounterElement, type FxLayer, type ImageElement, type Motion, type MotionSpec, type Scene, type SceneElement, type ShapeElement, type ShapeId, type ShineSpec, type TextElement,
} from '../model/scene';
import { gradientPreset, makeGradient, solid, type Gradient } from '../style/gradient';
import { cloneStyle, stylePreset, type ShapeStyle, type TextStyle } from '../style/textStyle';

export const BUILT_AT = '2026-10-02';

/** A copy of a named text style, optionally adjusted. */
export function ts(id: string, tweak?: (s: TextStyle) => void): TextStyle {
  const s = stylePreset(id);
  tweak?.(s);
  return s;
}

type Mo = Partial<MotionSpec>;
export const mo = {
  in: (id: string, o: Mo = {}): MotionSpec => specFor(id, o),
};
export const motion = (m: { entrance?: MotionSpec; idle?: MotionSpec; emphasis?: MotionSpec[]; exit?: MotionSpec }): Motion => m;

export function T(id: string, text: string, o: Partial<TextElement> = {}): TextElement {
  return textElement(text, { id, name: o.name ?? (o.role === 'subtitle' ? 'Subtitle' : o.role === 'amount' ? 'Amount' : o.role === 'multiplier' ? 'Multiplier' : o.role === 'body' ? 'Text' : 'Title'), ...o });
}
export function C(id: string, o: Partial<CounterElement> = {}): CounterElement { return counterElement({ id, name: 'Amount', ...o }); }
export function I(id: string, asset: string, o: Partial<ImageElement> = {}): ImageElement { return imageElement(asset, { id, name: 'Symbol', ...o }); }
export function S(id: string, shape: ShapeId, style: ShapeStyle, o: Partial<ShapeElement> = {}): ShapeElement { return shapeElement(shape, { id, name: 'Background', style, ...o }); }
export function F(id: string, effect: string, start: number, params: FxLayer['params'] = {}, o: Partial<FxLayer> = {}): FxLayer { return fxLayer(effect, { id, start, params, ...o }); }
export function shine(over: Partial<ShineSpec> = {}): ShineSpec { return { ...defaultShine(), enabled: true, ...over }; }

/** A shape style from a vertical gradient between two or three colours, with an outline and a lit bevel. */
export function plate(colors: string[], outline: string, o: { glow?: string; bevel?: boolean; shadow?: boolean; thick?: number } = {}): ShapeStyle {
  const stops: [number, string][] = colors.map((c, i) => [colors.length === 1 ? 0 : i / (colors.length - 1), c]);
  const base = ts('gold-chunky');
  return {
    face: makeGradient('linear', stops, { angle: 90 }),
    outlines: [{ id: 'o1', enabled: true, width: o.thick ?? 0.05, fill: solid(outline), join: 'round' }],
    bevel: { enabled: o.bevel !== false, size: 0.1, depth: 0.7, angle: -70, light: '#ffffff', shade: outline },
    innerHighlight: { enabled: true, color: '#ffffff', alpha: 0.35, size: 0.05, angle: -90 },
    extrusion: { enabled: false, depth: 0.05, angle: 90, fill: solid(outline), shade: 0.5 },
    shadow: o.shadow === false ? { ...base.shadow, enabled: false } : { enabled: true, color: '#000000', alpha: 0.5, blur: 0.08, dx: 0, dy: 0.08 },
    glow: o.glow ? { enabled: true, fill: solid(o.glow), radius: 0.12, strength: 0.7, bloom: false } : { ...base.glow, enabled: false },
  };
}

export function scene(elements: SceneElement[], fx: FxLayer[] = [], o: Partial<Scene> = {}): Scene {
  return emptyScene({ elements, fx, ...o });
}

interface PresetOpts {
  tags?: string[];
  status?: PresetStatus;
  inputs?: PresetInput[];
  /** Heading inside the category. */
  group?: string;
}
export function preset(category: CategoryId, slug: string, name: string, description: string, sc: Scene, o: PresetOpts = {}): Preset {
  return {
    schema: PRESET_SCHEMA, id: `${category}.${slug}`, version: 1, name, category, description, tags: o.tags ?? [], kind: 'builtin', status: o.status ?? 'stable', created: BUILT_AT,
    inputs: o.inputs ?? [], scene: sc, ...(o.group ? { group: o.group } : {}),
  };
}

export const textIn = (element: string, label = 'Text'): PresetInput => ({ element, label, kind: 'text' });
export const imageIn = (element: string, label = 'Symbol'): PresetInput => ({ element, label, kind: 'image' });
export const counterIn = (element: string, label = 'Amount'): PresetInput => ({ element, label, kind: 'counter' });

/** Gradient helpers used by several presets. */
export const gold = (): Gradient => gradientPreset('gold');
export { gradientPreset, makeGradient, solid, cloneStyle };
