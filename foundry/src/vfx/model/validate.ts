/**
 * Validation of imported presets. Nothing reaches the player unless it passes: unknown fonts, motions or effects, broken gradients,
 * dangling targets and out-of-range numbers are reported with the path of the problem. Numbers that are merely out of range are
 * clamped and noted as warnings so an old preset still loads.
 */
import { coerce } from '../../core/params';
import { MOTION_BY_ID } from '../anim/motions';
import { effectById } from '../fx';
import { getFamily } from '../fonts/catalog';
import { isCustomFontId } from '../fonts/service';
import { BOARD_PARAMS } from './board';
import { CATEGORIES, PRESET_SCHEMA, type Preset } from './preset';
import { SCENE_SCHEMA, type Scene } from './scene';

export interface ValidationResult { ok: boolean; preset?: Preset; errors: string[]; warnings: string[] }
export interface ValidateOptions { /** Is this custom font id available (uploaded) in this browser? */ hasCustomFont?: (id: string) => boolean }

const KINDS = new Set(['text', 'counter', 'image', 'shape', 'board']);
const GRADIENT_KINDS = new Set(['solid', 'linear', 'radial', 'conic', 'reflected']);
const JOINS = new Set(['round', 'miter', 'bevel']);
const UNITS = new Set(['block', 'line', 'word', 'char']);
const ORDERS = new Set(['forward', 'reverse', 'center', 'edges', 'random']);
const HEX = /^#([0-9a-f]{6}|[0-9a-f]{8})$/i;
const SHAPES = new Set(['plate', 'banner', 'ribbon', 'burst', 'badge', 'neon-box', 'scroll', 'circle', 'diamond', 'bar', 'shield', 'slab', 'pennant']);
const ID = /^[a-zA-Z0-9._-]{1,80}$/;

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const fin = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export function validatePreset(raw: unknown, opts: ValidateOptions = {}): ValidationResult {
  const errors: string[] = [], warnings: string[] = [];
  const err = (path: string, msg: string) => { errors.push(`${path}: ${msg}`); };
  const num = (o: Record<string, unknown>, k: string, path: string, lo: number, hi: number, fallback?: number): void => {
    const v = o[k];
    if (!fin(v)) { if (fallback === undefined) err(`${path}.${k}`, 'must be a number'); else o[k] = fallback; return; }
    if (v < lo || v > hi) { warnings.push(`${path}.${k}: ${v} is outside ${lo}..${hi}; clamped`); o[k] = Math.min(hi, Math.max(lo, v)); }
  };
  const str = (o: Record<string, unknown>, k: string, path: string, max = 400): void => {
    if (typeof o[k] !== 'string') err(`${path}.${k}`, 'must be text');
    else if ((o[k] as string).length > max) { warnings.push(`${path}.${k}: shortened to ${max} characters`); o[k] = (o[k] as string).slice(0, max); }
  };

  if (!isObj(raw)) return { ok: false, errors: ['The file is not a preset (expected a JSON object).'], warnings };
  const p = JSON.parse(JSON.stringify(raw)) as Record<string, unknown>;
  if (p.schema !== PRESET_SCHEMA) err('schema', `expected "${PRESET_SCHEMA}", found ${JSON.stringify(p.schema)}`);
  if (typeof p.id !== 'string' || !ID.test(p.id)) err('id', 'must be a stable id of letters, digits, dots, dashes');
  if (!Number.isInteger(p.version) || (p.version as number) < 1) err('version', 'must be a whole number from 1');
  str(p, 'name', 'preset', 120); str(p, 'description', 'preset', 1000);
  if (!CATEGORIES.some((c) => c.id === p.category)) err('category', `unknown category ${JSON.stringify(p.category)}`);
  if (!Array.isArray(p.tags)) p.tags = [];
  if (p.group !== undefined && (typeof p.group !== 'string' || !p.group.trim())) delete p.group;
  if (p.kind !== 'builtin' && p.kind !== 'user') p.kind = 'user';
  if (typeof p.status !== 'string') p.status = 'draft';
  if (typeof p.created !== 'string') p.created = new Date().toISOString().slice(0, 10);
  if (!Array.isArray(p.inputs)) p.inputs = [];

  const scene = p.scene;
  if (!isObj(scene)) { err('scene', 'missing'); return { ok: false, errors, warnings }; }
  if (scene.schema !== SCENE_SCHEMA) err('scene.schema', `expected "${SCENE_SCHEMA}"`);
  num(scene, 'aspect', 'scene', 0.3, 4); num(scene, 'seed', 'scene', 0, 1e9, 7); num(scene, 'hold', 'scene', 0, 30, 0.8);
  if (scene.duration !== undefined) num(scene, 'duration', 'scene', 0.1, 120);
  if (scene.seamless !== undefined && typeof scene.seamless !== 'boolean') { warnings.push('scene.seamless: must be true or false; ignored'); delete scene.seamless; }
  if (!isObj(scene.sound)) scene.sound = { enabled: false, volume: 0.8 };
  if (scene.screens !== undefined) {
    if (!isObj(scene.screens)) delete scene.screens;
    else for (const k of ['from', 'to'] as const) {
      const v = (scene.screens as Record<string, unknown>)[k];
      if (v !== undefined && !['barn', 'reels', 'night', 'daylight', 'bonus', 'lava', 'none'].includes(String(v))) { warnings.push(`scene.screens.${k}: unknown stand-in picture "${String(v)}"; ignored`); delete (scene.screens as Record<string, unknown>)[k]; }
    }
  }
  if (!Array.isArray(scene.assets)) scene.assets = [];
  if (!Array.isArray(scene.elements)) { err('scene.elements', 'must be a list'); return { ok: false, errors, warnings }; }
  if (!Array.isArray(scene.fx)) scene.fx = [];
  if ((scene.elements as unknown[]).length > 60) err('scene.elements', 'more than 60 elements');

  const ids = new Set<string>();
  const assetIds = new Set((scene.assets as unknown[]).filter(isObj).map((a) => String(a.id)));

  if (isObj(scene.sound) && scene.sound.builtin !== undefined && typeof scene.sound.builtin !== 'boolean') { warnings.push('scene.sound.builtin: must be true or false; ignored'); delete scene.sound.builtin; }
  if (scene.sounds !== undefined) {
    if (!Array.isArray(scene.sounds)) { warnings.push('scene.sounds: must be a list; ignored'); delete scene.sounds; }
    else if ((scene.sounds as unknown[]).length > 40) err('scene.sounds', 'more than 40 attached sounds');
    else (scene.sounds as unknown[]).forEach((sd, k) => {
      const path = `scene.sounds[${k}]`;
      if (!isObj(sd)) { err(path, 'invalid'); return; }
      str(sd, 'id', path, 60); str(sd, 'asset', path, 120); str(sd, 'cue', path, 160);
      if (typeof sd.name !== 'string') sd.name = 'Sound';
      num(sd, 'offset', path, -10, 60, 0); num(sd, 'gain', path, 0, 4, 1);
      if (typeof sd.asset === 'string' && !assetIds.has(sd.asset)) err(`${path}.asset`, `"${sd.asset}" is not listed in scene.assets`);
    });
  }

  const checkGradient = (g: unknown, path: string): void => {
    if (!isObj(g)) { err(path, 'missing gradient'); return; }
    if (!GRADIENT_KINDS.has(String(g.kind))) err(`${path}.kind`, `unknown gradient kind ${JSON.stringify(g.kind)}`);
    if (!Array.isArray(g.stops) || g.stops.length < 1 || g.stops.length > 24) { err(`${path}.stops`, 'needs 1 to 24 stops'); return; }
    (g.stops as unknown[]).forEach((s, i) => {
      if (!isObj(s)) { err(`${path}.stops[${i}]`, 'invalid'); return; }
      if (typeof s.id !== 'string') s.id = `s${i}`;
      num(s, 'pos', `${path}.stops[${i}]`, 0, 1); num(s, 'alpha', `${path}.stops[${i}]`, 0, 1, 1);
      if (typeof s.color !== 'string' || !HEX.test(s.color)) err(`${path}.stops[${i}].color`, `"${String(s.color)}" is not a #rrggbb colour`);
    });
    num(g, 'angle', path, -3600, 3600, 90); num(g, 'cx', path, -2, 3, 0.5); num(g, 'cy', path, -2, 3, 0.5); num(g, 'scale', path, 0.01, 50, 1);
    num(g, 'radius', path, 0.01, 50, 1); num(g, 'repeat', path, 0.01, 50, 1); num(g, 'phase', path, -50, 50, 0);
    if (g.wave !== undefined) { if (!isObj(g.wave)) delete g.wave; else { const w = g.wave; num(w, 'amount', `${path}.wave`, -1, 1, 0); num(w, 'count', `${path}.wave`, 0, 40, 2); num(w, 'phase', `${path}.wave`, -50, 50, 0); num(w, 'speed', `${path}.wave`, -10, 10, 0); } }
    if (typeof g.reflect !== 'boolean') g.reflect = false;
    const a = g.anim;
    if (!isObj(a)) g.anim = { enabled: false, speed: 0.5, direction: 'forward', loop: 'loop' };
    else { num(a, 'speed', `${path}.anim`, -20, 20, 0.5); if (typeof a.enabled !== 'boolean') a.enabled = false; if (a.direction !== 'reverse') a.direction = 'forward'; if (a.loop !== 'pingpong' && a.loop !== 'once') a.loop = 'loop'; }
  };
  const checkShapeStyle = (s: unknown, path: string): void => {
    if (!isObj(s)) { err(path, 'missing style'); return; }
    checkGradient(s.face, `${path}.face`);
    if (!Array.isArray(s.outlines) || s.outlines.length > 4) { err(`${path}.outlines`, 'needs a list of at most 4 outlines'); s.outlines = []; }
    (s.outlines as unknown[]).forEach((o, i) => {
      if (!isObj(o)) { err(`${path}.outlines[${i}]`, 'invalid'); return; }
      if (typeof o.id !== 'string') o.id = `o${i + 1}`;
      if (typeof o.enabled !== 'boolean') o.enabled = true;
      num(o, 'width', `${path}.outlines[${i}]`, 0, 0.6, 0.05);
      if (!JOINS.has(String(o.join))) o.join = 'round';
      checkGradient(o.fill, `${path}.outlines[${i}].fill`);
    });
    for (const [k, fields] of [['bevel', ['size', 'depth']], ['innerHighlight', ['alpha', 'size']], ['extrusion', ['depth', 'shade']], ['shadow', ['alpha', 'blur']], ['glow', ['radius', 'strength']]] as const) {
      const sub = s[k];
      if (!isObj(sub)) { err(`${path}.${k}`, 'missing'); continue; }
      if (typeof sub.enabled !== 'boolean') sub.enabled = false;
      for (const f of fields) num(sub, f, `${path}.${k}`, 0, 5, 0);
      if (k === 'extrusion' || k === 'glow') checkGradient(sub.fill, `${path}.${k}.fill`);
    }
  };
  const checkText = (e: Record<string, unknown>, path: string): void => {
    const st = e.style;
    if (!isObj(st)) { err(`${path}.style`, 'missing'); return; }
    const f = st.font;
    if (!isObj(f) || typeof f.id !== 'string') err(`${path}.style.font`, 'missing font');
    else {
      const id = f.id;
      if (isCustomFontId(id)) { if (!(opts.hasCustomFont?.(id) ?? true)) warnings.push(`${path}: custom font ${id} is not in this browser; upload it again`); }
      else {
        const fam = getFamily(id);
        if (!fam) err(`${path}.style.font.id`, `unknown font "${id}"`);
        else {
          num(f, 'weight', `${path}.style.font`, 100, 900, 400);
          if (f.style !== 'italic') f.style = 'normal';
          if (!fam.files.some((x) => x.weight === f.weight && x.style === f.style)) warnings.push(`${path}: ${fam.family} has no ${String(f.weight)} ${String(f.style)} file; the nearest one is used`);
        }
      }
    }
    num(st, 'letterSpacing', `${path}.style`, -0.5, 2, 0); num(st, 'lineSpacing', `${path}.style`, 0.3, 4, 1);
    if (st.align !== 'left' && st.align !== 'right') st.align = 'center';
    if (typeof st.uppercase !== 'boolean') st.uppercase = false;
    checkShapeStyle(st, `${path}.style`);
  };
  const checkSpec = (m: unknown, slot: string, path: string): void => {
    if (!isObj(m)) { err(path, 'invalid motion'); return; }
    const def = typeof m.id === 'string' ? MOTION_BY_ID.get(m.id) : undefined;
    if (!def) { err(`${path}.id`, `unknown motion "${String(m.id)}"`); return; }
    if (!def.slots.includes(slot as 'entrance')) err(`${path}.id`, `"${def.id}" is not an ${slot} animation`);
    num(m, 'start', path, 0, 120, 0); num(m, 'duration', path, 0.01, 60, def.defaults.duration); num(m, 'stagger', path, 0, 5, 0); num(m, 'amount', path, 0, 10, 1);
    if (!UNITS.has(String(m.unit))) m.unit = 'block';
    if (!ORDERS.has(String(m.order))) m.order = 'forward';
    if (!isObj(m.params)) m.params = {};
    const params = m.params as Record<string, unknown>;
    for (const pd of def.params) {
      if (params[pd.key] === undefined) continue;
      const r = coerce(pd, params[pd.key], pd.default as number);
      if (r.invalid) { warnings.push(`${path}.params.${pd.key}: invalid; default used`); params[pd.key] = pd.default as number; } else if (r.clamped) { warnings.push(`${path}.params.${pd.key}: clamped`); params[pd.key] = r.value; }
    }
  };

  (scene.elements as unknown[]).forEach((raw2, i) => {
    const path = `scene.elements[${i}]`;
    if (!isObj(raw2)) { err(path, 'invalid'); return; }
    const e = raw2;
    if (typeof e.id !== 'string' || !ID.test(e.id)) err(`${path}.id`, 'needs an id'); else if (ids.has(e.id)) err(`${path}.id`, `duplicate id "${e.id}"`); else ids.add(e.id);
    if (!KINDS.has(String(e.kind))) { err(`${path}.kind`, `unknown element kind ${JSON.stringify(e.kind)}`); return; }
    str(e, 'name', path, 80);
    num(e, 'x', path, -3, 4, 0.5); num(e, 'y', path, -3, 4, 0.5); num(e, 'scale', path, 0.01, 40, 1); num(e, 'rotation', path, -3600, 3600, 0); num(e, 'opacity', path, 0, 1, 1); num(e, 'start', path, 0, 120, 0);
    if (!isObj(e.motion)) e.motion = {};
    const mo = e.motion as Record<string, unknown>;
    if (mo.entrance) checkSpec(mo.entrance, 'entrance', `${path}.motion.entrance`);
    if (mo.idle) checkSpec(mo.idle, 'idle', `${path}.motion.idle`);
    if (mo.exit) checkSpec(mo.exit, 'exit', `${path}.motion.exit`);
    if (mo.emphasis !== undefined) { if (!Array.isArray(mo.emphasis)) mo.emphasis = []; (mo.emphasis as unknown[]).forEach((m, k) => checkSpec(m, 'emphasis', `${path}.motion.emphasis[${k}]`)); }
    if (e.shine !== undefined) { const sh = e.shine; if (!isObj(sh)) e.shine = undefined; else { num(sh, 'width', `${path}.shine`, 0.02, 2, 0.2); num(sh, 'duration', `${path}.shine`, 0.05, 20, 0.9); num(sh, 'intensity', `${path}.shine`, 0, 4, 0.8); if (typeof sh.color !== 'string' || !HEX.test(sh.color)) sh.color = '#ffffff'; } }
    switch (e.kind) {
      case 'text': str(e, 'text', path, 600); num(e, 'size', path, 0.01, 1.5); num(e, 'maxWidth', path, 0, 4, 0); checkText(e, path); break;
      case 'counter': checkText(e, path); num(e, 'size', path, 0.01, 1.5); num(e, 'from', path, -1e12, 1e12); num(e, 'to', path, -1e12, 1e12); num(e, 'decimals', path, 0, 6, 0); num(e, 'countStart', path, 0, 60, 0); num(e, 'countDuration', path, 0.05, 60, 1.6); break;
      case 'image': {
        str(e, 'asset', path, 120); num(e, 'size', path, 0.01, 4);
        const a = String(e.asset);
        if (!a.startsWith('builtin:') && !assetIds.has(a)) err(`${path}.asset`, `"${a}" is not listed in scene.assets`);
        if (e.gradient) checkGradient(e.gradient, `${path}.gradient`);
        if (e.outline) checkShapeStyle(e.outline, `${path}.outline`);
        break;
      }
      case 'board': {
        num(e, 'cols', path, 1, 9, 5); num(e, 'rows', path, 1, 7, 3); num(e, 'cell', path, 0.04, 0.6, 0.2); num(e, 'gap', path, 0, 0.5, 0.08);
        if (!Array.isArray(e.symbols) || e.symbols.length < 1 || e.symbols.length > 14) { err(`${path}.symbols`, 'a board needs 1 to 14 symbols'); break; }
        (e.symbols as unknown[]).forEach((sy, k) => {
          if (!isObj(sy)) { err(`${path}.symbols[${k}]`, 'invalid'); return; }
          str(sy, 'asset', `${path}.symbols[${k}]`, 120); if (typeof sy.name !== 'string') sy.name = `symbol ${k + 1}`;
          if (!['normal', 'wild', 'scatter', 'bonus'].includes(String(sy.role))) sy.role = 'normal';
          const a = String(sy.asset);
          if (!a.startsWith('builtin:') && !assetIds.has(a)) err(`${path}.symbols[${k}].asset`, `"${a}" is not listed in scene.assets`);
          if (sy.expand === undefined || sy.expand === null) delete sy.expand;
          else if (!isObj(sy.expand)) { warnings.push(`${path}.symbols[${k}].expand: invalid; ignored`); delete sy.expand; }
          else {
            const ex = sy.expand as Record<string, unknown>, ep = `${path}.symbols[${k}].expand`;
            str(ex, 'asset', ep, 120);
            const ea = String(ex.asset);
            if (!ea.startsWith('builtin:') && !assetIds.has(ea)) err(`${ep}.asset`, `"${ea}" is not listed in scene.assets`);
            if (ex.fit !== 'grow' && ex.fit !== 'fill') ex.fit = 'grow';
            if (ex.play !== 'natural' && ex.play !== 'fit') ex.play = 'natural';
            if (sy.role !== 'wild') warnings.push(`${ep}: only a wild expands; this animation is not used`);
          }
        });
        for (const k of ['frame', 'panel'] as const) {
          if (e[k] === null || e[k] === undefined) { e[k] = null; continue; }
          const a = String(e[k]);
          if (!a.startsWith('builtin:') && !assetIds.has(a)) err(`${path}.${k}`, `"${a}" is not listed in scene.assets`);
        }
        if (!isObj(e.params)) e.params = {};
        { const bp = e.params as Record<string, unknown>, known = new Map(BOARD_PARAMS.map((d) => [d.key, d]));
          for (const [k, v] of Object.entries(bp)) { const pd = known.get(k); if (!pd) { warnings.push(`${path}.params.${k}: not a board setting; ignored`); delete bp[k]; continue; } const r = coerce(pd, v, pd.default as number); if (r.invalid) { warnings.push(`${path}.params.${k}: invalid; default used`); delete bp[k]; } else if (r.clamped) { warnings.push(`${path}.params.${k}: clamped`); bp[k] = r.value; } } }
        break;
      }
      case 'shape': if (!SHAPES.has(String(e.shape))) err(`${path}.shape`, `unknown shape ${JSON.stringify(e.shape)}`); num(e, 'width', path, 0.01, 4); num(e, 'height', path, 0.01, 4); checkShapeStyle(e.style, `${path}.style`); if (!isObj(e.params)) e.params = {}; break;
    }
  });

  (scene.fx as unknown[]).forEach((raw2, i) => {
    const path = `scene.fx[${i}]`;
    if (!isObj(raw2)) { err(path, 'invalid'); return; }
    const l = raw2;
    const def = typeof l.effect === 'string' ? effectById(l.effect) : undefined;
    if (!def) { err(`${path}.effect`, `unknown effect "${String(l.effect)}"`); return; }
    if (typeof l.id !== 'string') l.id = `fx${i}`;
    num(l, 'start', path, 0, 120, 0); num(l, 'amount', path, 0, 10, 1);
    if (typeof l.enabled !== 'boolean') l.enabled = true;
    for (const k of ['target', 'target2', 'frame'] as const) if (l[k] !== undefined && !ids.has(String(l[k]))) err(`${path}.${k}`, `no element with id "${String(l[k])}"`);
    if (l.frame !== undefined && l.frame === l.target) err(`${path}.frame`, 'the frame must be a different element from the symbol it goes with');
    if (l.ramp === undefined || l.ramp === null) delete l.ramp; else checkGradient(l.ramp, `${path}.ramp`);
    if (!isObj(l.params)) l.params = {};
    const params = l.params as Record<string, unknown>;
    const known = new Map(def.params.map((d) => [d.key, d]));
    for (const [k, v] of Object.entries(params)) {
      const pd = known.get(k);
      if (!pd) { warnings.push(`${path}.params.${k}: not a setting of ${def.name}; ignored`); delete params[k]; continue; }
      const r = coerce(pd, v, pd.default as number);
      if (r.invalid) { warnings.push(`${path}.params.${k}: invalid; default used`); delete params[k]; } else if (r.clamped) { warnings.push(`${path}.params.${k}: clamped`); params[k] = r.value; }
    }
  });

  if (errors.length) return { ok: false, errors, warnings };
  return { ok: true, preset: p as unknown as Preset, errors, warnings };
}

export type { Scene };
