/**
 * BANGERS default tokens (layer 1 of the inheritance chain).
 * A game theme overrides any of these keys; effect presets and instances may override effect parameters on top.
 * Every token is a ParamDef: default, bounds, unit and a description.
 */
import { CUES } from './cues';
import { BUILTIN_FONTS, SYSTEM_FONTS } from './fonts';
import { EASING_NAMES } from './util/easing';
import { type ParamDef, asset, bool, color, enm, font, num, ref } from './params';

export interface SectionInfo { id: string; label: string; blurb: string }

export const TOKEN_SECTIONS: SectionInfo[] = [
  { id: 'colors', label: 'Colour roles', blurb: 'Semantic roles. Effects reference roles (e.g. "win"), never raw hex, so one edit re-colours everything.' },
  { id: 'typography', label: 'Typography', blurb: 'Five typographic roles. Sizes are board-aware: they are a percentage of one board cell.' },
  { id: 'surface', label: 'Surface', blurb: 'Plates, banners and callouts: fill, gradient, corner radius and texture.' },
  { id: 'outline', label: 'Outline', blurb: 'Stroke and glow shared by highlights, plates and text.' },
  { id: 'depth', label: 'Depth', blurb: 'Drop shadow, comic extrusion and bevel.' },
  { id: 'motion', label: 'Motion personality', blurb: 'Explicit easing and timing numbers. A personality button only fills these in; nothing is inferred from names.' },
  { id: 'intensity', label: 'Intensity & safety', blurb: 'Default strength per effect family, win tiers, reduced-motion and photosensitivity limits.' },
  { id: 'board', label: 'Board', blurb: 'Cell gap, padding and frame. The board layout derives its cell size from these and the viewport.' },
  { id: 'layers', label: 'Layers', blurb: 'Draw order, opacity, blend and camera-follow for each render layer.' },
  { id: 'assets', label: 'Effect assets', blurb: 'Images effects may use. Empty means the procedural fallback is used.' },
  { id: 'sound', label: 'Sound cues', blurb: 'Map semantic cues to audio assets, gain and pitch. Markers on effects and sequences trigger these.' },
];

// ---------------------------------------------------------------------------------------------------------------------
// Layers

export const LAYERS = [
  { id: 'backdrop', label: 'Backdrop', followsCamera: false },
  { id: 'board', label: 'Board plate', followsCamera: true },
  { id: 'fxBelow', label: 'FX below symbols', followsCamera: true },
  { id: 'symbols', label: 'Symbols', followsCamera: true },
  { id: 'fxAbove', label: 'FX above symbols', followsCamera: true },
  { id: 'overlay', label: 'Overlay', followsCamera: false },
  { id: 'ui', label: 'UI & text', followsCamera: false },
] as const;
export type LayerId = (typeof LAYERS)[number]['id'];
export const LAYER_IDS: LayerId[] = LAYERS.map((l) => l.id);
export const BLEND_MODES: [string, string][] = [
  ['source-over', 'Normal'], ['lighter', 'Add (lighter)'], ['screen', 'Screen'], ['multiply', 'Multiply'], ['overlay', 'Overlay'],
];

export const TYPE_ROLES = ['display', 'headline', 'body', 'numeric', 'label'] as const;
export type TypeRole = (typeof TYPE_ROLES)[number];

const fontOptions = (): [string, string][] => [
  ...BUILTIN_FONTS.map((f) => [f.id, f.label] as [string, string]),
  ...SYSTEM_FONTS.map((f) => [f.id, f.label] as [string, string]),
];
export { fontOptions };

// ---------------------------------------------------------------------------------------------------------------------

const defs: ParamDef[] = [];
const add = (...d: ParamDef[]) => { defs.push(...d); };

// Colour roles ------------------------------------------------------------------------------------------------------
{
  const s = (group: string) => ({ section: 'colors', group });
  add(
    color('color.background', 'Background', s('Stage'), '#140b2e', 'Stage background behind the board.'),
    color('color.backgroundAlt', 'Background (alt)', s('Stage'), '#2a1458', 'Second stop of the stage gradient.'),
    color('color.surface', 'Surface', s('Surfaces'), '#241447', 'Plates, banners and the board bed.'),
    color('color.surfaceAlt', 'Surface (alt)', s('Surfaces'), '#38206b', 'Secondary surface / gradient end and cell fill.'),
    color('color.primary', 'Primary', s('Brand'), '#ff3d6e', 'Brand colour: frame, key badges.'),
    color('color.secondary', 'Secondary', s('Brand'), '#2fd6ff', 'Cool counterpoint to primary.'),
    color('color.accent', 'Accent', s('Brand'), '#ffd23f', 'Highlights and attention.'),
    color('color.win', 'Win', s('Feedback'), '#ffe14d', 'Win celebration colour.'),
    color('color.success', 'Success', s('Feedback'), '#3be88a', 'Positive confirmation.'),
    color('color.danger', 'Danger', s('Feedback'), '#ff4d4d', 'Warnings and negative states.'),
    color('color.info', 'Info', s('Feedback'), '#7a8cff', 'Neutral informational highlight.'),
    color('color.text', 'Text', s('Text'), '#fff7e6', 'Primary text on surfaces.'),
    color('color.textMuted', 'Text (muted)', s('Text'), '#b9aedb', 'Secondary text.'),
    color('color.textOnAccent', 'Text on accent', s('Text'), '#1a0f2e', 'Text drawn on accent/win colours.'),
    color('color.outline', 'Outline', s('Strokes & shadow'), '#0b0618', 'Default outline / extrusion colour.'),
    color('color.glow', 'Glow', s('Strokes & shadow'), '#ffb800', 'Default glow colour.'),
    color('color.shadow', 'Shadow', s('Strokes & shadow'), '#000000', 'Drop shadow colour.'),
  );
}

// Typography --------------------------------------------------------------------------------------------------------
{
  const roles: Record<TypeRole, { label: string; family: string; weight: number; size: number; spacing: number; line: number; transform: string }> = {
    display: { label: 'Display', family: 'bangers', weight: 400, size: 90, spacing: 0.04, line: 1, transform: 'uppercase' },
    headline: { label: 'Headline', family: 'anton', weight: 400, size: 55, spacing: 0.03, line: 1.05, transform: 'uppercase' },
    body: { label: 'Body', family: 'inter', weight: 400, size: 22, spacing: 0, line: 1.3, transform: 'none' },
    numeric: { label: 'Numeric', family: 'roboto-mono', weight: 700, size: 70, spacing: 0, line: 1, transform: 'none' },
    label: { label: 'Label', family: 'inter', weight: 700, size: 16, spacing: 0.08, line: 1.1, transform: 'uppercase' },
  };
  for (const r of TYPE_ROLES) {
    const d = roles[r];
    const s = { section: 'typography', group: d.label };
    add(
      font(`type.${r}.family`, 'Font family', s, d.family, 'Font used by this role. Only fonts whose licence permits it are packaged into bundles.'),
      num(`type.${r}.weight`, 'Weight', s, d.weight, 100, 900, 100, '', 'CSS weight; the nearest available file weight is used.', true),
      num(`type.${r}.size`, 'Size', s, d.size, 4, 400, 1, 'cell%', 'Font size as a percentage of one board cell, so type scales with the board.'),
      num(`type.${r}.letterSpacing`, 'Letter spacing', s, d.spacing, -0.1, 0.5, 0.005, 'em', 'Extra tracking.'),
      num(`type.${r}.lineHeight`, 'Line height', s, d.line, 0.8, 2, 0.05, 'ratio', 'Line height multiplier.'),
      enm(`type.${r}.transform`, 'Case', s, d.transform, [['none', 'As typed'], ['uppercase', 'UPPERCASE'], ['lowercase', 'lowercase']], 'Text case applied at render time.'),
    );
  }
  add(num('type.minSizePx', 'Minimum text size', { section: 'typography', group: 'Legibility' }, 11, 6, 24, 1, 'px', 'Text never renders smaller than this, whatever the board size.', true));
}

// Surface ----------------------------------------------------------------------------------------------------------
{
  const s = { section: 'surface', group: 'Plate' };
  add(
    color('surface.fill', 'Fill', s, ref('color.surface'), 'Plate fill (gradient start).'),
    color('surface.fillAlt', 'Fill (gradient end)', s, ref('color.surfaceAlt'), 'Plate gradient end.'),
    num('surface.gradientAngle', 'Gradient angle', s, 160, 0, 360, 1, 'deg', 'Direction of the fill gradient.'),
    num('surface.opacity', 'Opacity', s, 94, 0, 100, 1, '%', 'Plate opacity.'),
    num('surface.cornerRadius', 'Corner radius', s, 14, 0, 50, 1, 'cell%', 'Rounded corner size.'),
    num('surface.padding', 'Padding', s, 12, 0, 60, 1, 'cell%', 'Inner padding around plate content.'),
    enm('surface.texture', 'Texture', { section: 'surface', group: 'Texture' }, 'halftone', [['none', 'None'], ['halftone', 'Halftone dots'], ['stripes', 'Diagonal stripes'], ['grid', 'Grid']], 'Procedural pattern drawn over the plate.'),
    num('surface.textureOpacity', 'Texture opacity', { section: 'surface', group: 'Texture', activeWhen: { key: 'surface.texture', values: ['halftone', 'stripes', 'grid'] } }, 14, 0, 100, 1, '%', 'Pattern strength.'),
    num('surface.textureScale', 'Texture scale', { section: 'surface', group: 'Texture', activeWhen: { key: 'surface.texture', values: ['halftone', 'stripes', 'grid'] } }, 8, 2, 40, 1, 'cell%', 'Pattern spacing.'),
  );
}

// Outline ----------------------------------------------------------------------------------------------------------
{
  const s = { section: 'outline', group: 'Stroke' };
  const g = { section: 'outline', group: 'Glow' };
  add(
    color('outline.color', 'Colour', s, ref('color.outline'), 'Stroke colour.'),
    num('outline.width', 'Width', s, 4, 0, 20, 0.5, 'cell%', 'Stroke width.'),
    enm('outline.style', 'Style', s, 'solid', [['solid', 'Solid'], ['dashed', 'Dashed'], ['double', 'Double']], 'Stroke style.'),
    color('outline.glowColor', 'Glow colour', g, ref('color.glow'), 'Glow colour.'),
    num('outline.glowBlur', 'Glow blur', g, 14, 0, 60, 1, 'cell%', 'Glow radius.'),
    num('outline.glowStrength', 'Glow strength', g, 55, 0, 100, 1, '%', 'Glow opacity.'),
  );
}

// Depth ------------------------------------------------------------------------------------------------------------
{
  const s = { section: 'depth', group: 'Drop shadow' };
  const e = { section: 'depth', group: 'Extrusion & bevel' };
  add(
    color('depth.shadowColor', 'Colour', s, ref('color.shadow'), 'Drop shadow colour.'),
    num('depth.shadowOpacity', 'Opacity', s, 55, 0, 100, 1, '%', 'Drop shadow opacity.'),
    num('depth.shadowOffsetX', 'Offset X', s, 0, -40, 40, 0.5, 'cell%', 'Horizontal shadow offset.'),
    num('depth.shadowOffsetY', 'Offset Y', s, 8, -40, 40, 0.5, 'cell%', 'Vertical shadow offset.'),
    num('depth.shadowBlur', 'Blur', s, 14, 0, 60, 1, 'cell%', 'Shadow softness.'),
    num('depth.extrude', 'Text extrusion', e, 6, 0, 30, 0.5, 'cell%', 'Comic-book extrusion depth behind text and plates.'),
    color('depth.extrudeColor', 'Extrusion colour', e, ref('color.outline'), 'Colour of the extrusion.'),
    num('depth.bevel', 'Bevel highlight', e, 35, 0, 100, 1, '%', 'Top-edge highlight strength on plates.'),
  );
}

// Motion personality ------------------------------------------------------------------------------------------------
{
  const s = { section: 'motion', group: 'Curve' };
  const t = { section: 'motion', group: 'Timing' };
  add(
    enm('motion.easing', 'Easing', s, 'easeOutBack', EASING_NAMES.map((n) => [n, n] as [string, string]), 'Default easing for effects whose own easing is "theme".'),
    num('motion.overshoot', 'Overshoot', { ...s, activeWhen: { key: 'motion.easing', values: ['easeOutBack', 'easeOutElastic'] } }, 1.70158, 0, 4, 0.05, 'ratio', 'Back/elastic overshoot amount (1.7 ≈ classic 10%).'),
    num('motion.springFrequency', 'Spring frequency', { ...s, activeWhen: { key: 'motion.easing', values: ['spring'] } }, 2.5, 0.5, 6, 0.1, 'ratio', 'Oscillations across an effect.'),
    num('motion.springDamping', 'Spring damping', { ...s, activeWhen: { key: 'motion.easing', values: ['spring'] } }, 0.45, 0.05, 1, 0.01, 'ratio', 'Damping ratio; 1 is critical (no bounce).'),
    num('motion.durationScale', 'Duration scale', t, 1, 0.25, 3, 0.05, 'x', 'Multiplies every effect duration. <1 snappier, >1 weightier.'),
    num('motion.staggerScale', 'Stagger scale', t, 1, 0, 3, 0.05, 'x', 'Multiplies per-cell and per-instance stagger delays.'),
    num('motion.anticipation', 'Anticipation', t, 12, 0, 40, 1, '%', 'Wind-up share of pop-in animations (scale dips before it grows).'),
  );
}

// Intensity & safety -----------------------------------------------------------------------------------------------
{
  const f = { section: 'intensity', group: 'Family defaults' };
  const w = { section: 'intensity', group: 'Win tiers' };
  const a = { section: 'intensity', group: 'Safety & accessibility' };
  add(
    num('intensity.master', 'Master', f, 1, 0, 2, 0.05, 'ratio', 'Scales every effect.'),
    num('intensity.shake', 'Shake', f, 1, 0, 2, 0.05, 'ratio', 'Default strength of camera shake.'),
    num('intensity.flash', 'Flash', f, 1, 0, 2, 0.05, 'ratio', 'Default strength of screen flashes.'),
    num('intensity.particles', 'Particles', f, 1, 0, 2, 0.05, 'ratio', 'Default particle count/energy.'),
    num('intensity.glow', 'Glow & highlight', f, 1, 0, 2, 0.05, 'ratio', 'Default strength of glows, outlines and sweeps.'),
    num('intensity.text', 'Text & badges', f, 1, 0, 2, 0.05, 'ratio', 'Default pop strength of banners and callouts.'),
    num('intensity.motion', 'Symbol motion', f, 1, 0, 2, 0.05, 'ratio', 'Default amplitude of cascades.'),
    num('intensity.tierBig', 'Tier · big', w, 1, 0, 3, 0.05, 'ratio', 'Intensity multiplier for BIG WIN banners.'),
    num('intensity.tierMega', 'Tier · mega', w, 1.4, 0, 3, 0.05, 'ratio', 'Intensity multiplier for MEGA WIN banners.'),
    num('intensity.tierEpic', 'Tier · epic', w, 1.8, 0, 3, 0.05, 'ratio', 'Intensity multiplier for EPIC WIN banners.'),
    num('intensity.reducedMotion', 'Reduced-motion scale', a, 0.2, 0, 1, 0.05, 'ratio', 'Applied to shake, flash and motion when the host requests reduced motion.'),
    num('safety.maxFlashHz', 'Max flashes per second', a, 3, 0, 3, 0.5, 'hz', 'Strobing is capped to this rate (WCAG general-flash threshold is 3).'),
    num('safety.maxFlashAlpha', 'Max flash opacity', a, 85, 0, 100, 1, '%', 'Hard ceiling on full-screen flash opacity.'),
  );
}

// Board --------------------------------------------------------------------------------------------------------------
{
  const s = { section: 'board', group: 'Layout' };
  const c = { section: 'board', group: 'Cells & frame' };
  add(
    num('board.gap', 'Cell gap', s, 6, 0, 40, 1, 'cell%', 'Space between cells.'),
    num('board.padding', 'Board padding', s, 30, 0, 100, 1, 'cell%', 'Space between cells and the frame.'),
    num('board.cellRadius', 'Cell radius', c, 18, 0, 50, 1, 'cell%', 'Rounded corners of each cell.'),
    color('board.cellFill', 'Cell fill', c, ref('color.surfaceAlt'), 'Cell background.'),
    num('board.cellFillOpacity', 'Cell fill opacity', c, 70, 0, 100, 1, '%', 'Cell background opacity.'),
    num('board.frameWidth', 'Frame width', c, 8, 0, 30, 0.5, 'cell%', 'Board frame stroke.'),
    color('board.frameColor', 'Frame colour', c, ref('color.primary'), 'Board frame colour.'),
  );
}

// Layers -----------------------------------------------------------------------------------------------------------
LAYERS.forEach((l, i) => {
  const s = { section: 'layers', group: l.label };
  add(
    bool(`layer.${l.id}.visible`, 'Visible', s, true, 'Hide the layer in this theme.'),
    num(`layer.${l.id}.opacity`, 'Opacity', s, 100, 0, 100, 1, '%', 'Layer opacity.'),
    enm(`layer.${l.id}.blend`, 'Blend', s, 'source-over', BLEND_MODES, 'Composite mode for the layer.'),
    num(`layer.${l.id}.z`, 'Order', s, (i + 1) * 10, 0, 100, 1, '', 'Draw order; lower draws first.', true),
    bool(`layer.${l.id}.followsCamera`, 'Follows camera', s, l.followsCamera, 'Whether screen shake moves this layer.'),
  );
});

// Asset roles -------------------------------------------------------------------------------------------------------
add(
  asset('asset.backdrop', 'Backdrop image', { section: 'assets', group: 'Images' }, 'image', 'Stretched to the viewport on the backdrop layer.'),
  asset('asset.particle', 'Particle sprite', { section: 'assets', group: 'Images' }, 'image', 'Sprite for coin bursts whose shape is "sprite".'),
  asset('asset.bannerPlate', 'Banner plate', { section: 'assets', group: 'Images' }, 'image', 'Image used instead of the generated plate on win banners.'),
);

// Sound cues --------------------------------------------------------------------------------------------------------
for (const c of CUES) {
  const s = { section: 'sound', group: c.label };
  add(
    bool(`cue.${c.id}.enabled`, 'Enabled', s, true, `Mute or unmute the "${c.id}" cue for this theme.`),
    asset(`cue.${c.id}.asset`, 'Audio asset', s, 'audio', 'Audio file for this cue. Empty uses the preview synth blip (the host supplies real audio).'),
    num(`cue.${c.id}.gain`, 'Gain', s, 0, -40, 6, 0.5, 'dB', 'Level of this cue.'),
    num(`cue.${c.id}.pitch`, 'Pitch', s, 0, -12, 12, 0.5, 'semitones', 'Pitch shift.'),
  );
}

export const TOKEN_DEFS: readonly ParamDef[] = defs;
export const TOKEN_BY_KEY: ReadonlyMap<string, ParamDef> = new Map(defs.map((d) => [d.key, d]));

export function tokensInSection(section: string): ParamDef[] { return TOKEN_DEFS.filter((d) => d.section === section); }

export function groupBy<T>(items: readonly T[], key: (t: T) => string): [string, T[]][] {
  const m = new Map<string, T[]>();
  for (const i of items) { const k = key(i); (m.get(k) ?? m.set(k, []).get(k)!).push(i); }
  return [...m.entries()];
}

export type TokenValues = Record<string, number | boolean | string>;
