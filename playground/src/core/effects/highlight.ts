import { color, enm, num, bool, ref } from '../params';
import { TAU, type PolyOp } from '../ops';
import { seg, smoothstep, lerp } from '../util/easing';
import { withAlpha, mix } from '../util/color';
import { clamp, glowShadow, opacity, staggerMs } from './helpers';
import { type EffectDef, commonParams, P, targetCells } from './types';

const tg = { section: 'effect', group: 'Targets' };
const lk = { section: 'effect', group: 'Look' };
const mo = { section: 'effect', group: 'Motion' };

export const symbolHighlight: EffectDef = {
  type: 'symbolHighlight',
  label: 'Symbol highlight',
  description: 'Pulsing outline, glow and fill on winning cells; other cells can be dimmed.',
  category: 'glow',
  defaultLayer: 'fxAbove',
  defaultCues: [{ cue: 'win.small', at: 0 }],
  params: [
    ...commonParams({ duration: 1400, layer: 'fxAbove', easing: null }),
    enm('target', 'Target cells', tg, 'winCells', [['winCells', 'Winning cells'], ['allCells', 'Every cell']], 'Which cells are highlighted.'),
    enm('style', 'Style', lk, 'both', [['outline', 'Outline only'], ['fill', 'Fill only'], ['both', 'Outline + fill']], 'What is drawn on each cell.'),
    color('color', 'Colour', lk, ref('color.win'), 'Highlight colour (defaults to the "win" role).'),
    num('outlineWidth', 'Outline width', { ...lk, activeWhen: { key: 'style', values: ['outline', 'both'] } }, ref('outline.width'), 0, 30, 0.5, 'cell%', 'Stroke width. Defaults to the theme outline width.'),
    num('glowBlur', 'Glow blur', lk, ref('outline.glowBlur'), 0, 60, 1, 'cell%', 'Glow radius. Scales with intensity.'),
    num('glowStrength', 'Glow strength', lk, ref('outline.glowStrength'), 0, 100, 1, '%', 'Glow opacity. Scales with intensity.'),
    num('fillAlpha', 'Fill opacity', { ...lk, activeWhen: { key: 'style', values: ['fill', 'both'] } }, 28, 0, 100, 1, '%', 'Fill strength at the pulse peak.'),
    num('cornerRadius', 'Corner radius', lk, ref('board.cellRadius'), 0, 50, 1, 'cell%', 'Highlight corner radius.'),
    num('dimOthers', 'Dim other cells', lk, 35, 0, 90, 1, '%', 'Darkens non-target cells while the highlight plays.'),
    num('pulses', 'Pulses', mo, 3, 1, 8, 1, 'count', 'Number of pulses over the duration.', true),
    num('pulseScale', 'Pulse scale', mo, 1.1, 1, 1.6, 0.01, 'x', 'Peak scale of each pulse (also pops the symbol itself).'),
    num('cellStagger', 'Cell stagger', mo, 60, 0, 400, 5, 'ms', 'Delay between consecutive cells. Scaled by the theme stagger scale.'),
  ],
  evaluate(c) {
    const cells = targetCells(c, P.s(c, 'target'));
    if (!cells.length) return;
    const I = c.intensity;
    const stagger = P.n(c, 'cellStagger');
    const maxDelay = staggerMs(c, cells.length - 1, stagger);
    const win = Math.max(1, c.duration - maxDelay);
    const col = P.s(c, 'color');
    const style = P.s(c, 'style');
    const pulses = P.n(c, 'pulses');
    const op = opacity(c);
    const dim = P.n(c, 'dimOthers') / 100;
    const targetSet = new Set(cells.map((x) => `${x.col},${x.row}`));
    const env0 = smoothstep(seg(c.t, 0, Math.min(200, c.duration * 0.15))) * (1 - smoothstep(seg(c.t, c.duration - Math.min(260, c.duration * 0.2), c.duration)));
    if (dim > 0 && env0 > 0 && P.s(c, 'target') !== 'allCells') {
      for (let col2 = 0; col2 < c.scene.cols; col2++) for (let row = 0; row < c.scene.rows; row++) {
        if (targetSet.has(`${col2},${row}`)) continue;
        const r = c.layout.cellRect(col2, row);
        c.out.push({ op: 'rect', layer: c.layer, cx: r.cx, cy: r.cy, w: r.w, h: r.h, r: c.layout.px(c.tokens['board.cellRadius'] as number), fill: '#000', alpha: clamp(dim * env0 * op, 0, 0.95) });
      }
    }
    cells.forEach((cell, i) => {
      const lt = c.t - staggerMs(c, i, stagger);
      if (lt < 0) return;
      const q = clamp(lt / win, 0, 1);
      const env = smoothstep(seg(q, 0, 0.12)) * (1 - smoothstep(seg(q, 0.82, 1)));
      const wave = 0.5 - 0.5 * Math.cos(TAU * pulses * q);
      const sc = 1 + (P.n(c, 'pulseScale') - 1) * wave * env * Math.min(I, 1.5);
      const r = c.layout.cellRect(cell.col, cell.row);
      const rad = c.layout.px(P.n(c, 'cornerRadius'));
      const pad = c.layout.px(2);
      const common = { op: 'rect' as const, layer: c.layer, cx: r.cx, cy: r.cy, w: (r.w + pad) * sc, h: (r.h + pad) * sc, r: rad * sc };
      if (style === 'fill' || style === 'both') {
        c.out.push({ ...common, fill: withAlpha(col, 1), alpha: clamp((P.n(c, 'fillAlpha') / 100) * (0.35 + 0.65 * wave) * env * op * Math.min(I, 1.5), 0, 1), blend: P.s(c, 'blend') });
      }
      if (style === 'outline' || style === 'both') {
        const lw = c.layout.px(P.n(c, 'outlineWidth')) * (0.8 + 0.4 * wave);
        const sh = glowShadow(c, col, P.n(c, 'glowStrength') * Math.min(I, 2) * (0.5 + 0.5 * wave), P.n(c, 'glowBlur'), 1);
        c.out.push({ ...common, stroke: col, lw: Math.max(1, lw), alpha: clamp(env * op, 0, 1), blend: P.s(c, 'blend'), ...(sh ? { shadow: sh } : {}), ...(c.tokens['outline.style'] === 'dashed' ? { dash: [lw * 2.5, lw * 1.5] } : {}) });
      }
      c.out.cells.push({ col: cell.col, row: cell.row, dx: 0, dy: 0, scale: 1 + (P.n(c, 'pulseScale') - 1) * 0.8 * wave * env * Math.min(I, 1.5), alpha: 1, rot: 0, glow: env * wave, variant: 0 });
    });
  },
};

export const winLine: EffectDef = {
  type: 'winLine',
  label: 'Win line',
  description: 'A glowing line that traces through the winning cells in order.',
  category: 'glow',
  defaultLayer: 'fxAbove',
  defaultCues: [{ cue: 'line.draw', at: 0 }],
  params: [
    ...commonParams({ duration: 1200, layer: 'fxAbove', easing: 'easeInOutCubic' }),
    color('color', 'Colour', lk, ref('color.accent'), 'Line colour.'),
    num('lineWidth', 'Line width', lk, 14, 2, 40, 0.5, 'cell%', 'Core line thickness.'),
    num('glowBlur', 'Glow blur', lk, ref('outline.glowBlur'), 0, 60, 1, 'cell%', 'Glow radius. Scales with intensity.'),
    bool('nodes', 'Show nodes', lk, true, 'Draw a dot on every cell the line passes through.'),
    num('nodeSize', 'Node size', { ...lk, activeWhen: { key: 'nodes', values: [true] } }, 22, 4, 60, 1, 'cell%', 'Node dot diameter.'),
    num('drawFraction', 'Draw time', mo, 55, 5, 100, 1, '%', 'Share of the duration spent tracing; the rest holds then fades.'),
    num('fade', 'Fade out', mo, 20, 0, 60, 1, '%', 'Share of the duration used to fade out at the end.'),
  ],
  evaluate(c) {
    const pts = c.scene.winCells.map((w) => c.layout.cellRect(w.col, w.row)).map((r) => ({ x: r.cx, y: r.cy }));
    if (!pts.length) return;
    const col = P.s(c, 'color');
    const I = c.intensity;
    const draw = seg(c.p, 0, P.n(c, 'drawFraction') / 100);
    const progress = c.ease(draw);
    const fadeStart = 1 - P.n(c, 'fade') / 100;
    const a = clamp((1 - smoothstep(seg(c.p, fadeStart, 1))) * opacity(c), 0, 1);
    const lens: number[] = [0];
    for (let i = 1; i < pts.length; i++) lens.push(lens[i - 1]! + Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y));
    const total = lens[lens.length - 1]!;
    const reach = clamp(progress, 0, 1) * total;
    const path: number[] = [pts[0]!.x, pts[0]!.y];
    for (let i = 1; i < pts.length; i++) {
      if (lens[i]! <= reach) path.push(pts[i]!.x, pts[i]!.y);
      else {
        const k = (reach - lens[i - 1]!) / Math.max(1e-6, lens[i]! - lens[i - 1]!);
        if (k > 0) path.push(lerp(pts[i - 1]!.x, pts[i]!.x, k), lerp(pts[i - 1]!.y, pts[i]!.y, k));
        break;
      }
    }
    const lw = c.layout.px(P.n(c, 'lineWidth')) * (0.6 + 0.4 * Math.min(I, 1.5));
    const sh = glowShadow(c, col, 85 * Math.min(I, 2), P.n(c, 'glowBlur'));
    if (path.length >= 4) {
      const outer: PolyOp = { op: 'poly', layer: c.layer, pts: path, stroke: col, lw, join: 'round', cap: 'round', alpha: a, blend: P.s(c, 'blend'), ...(sh ? { shadow: sh } : {}) };
      c.out.push(outer);
      c.out.push({ op: 'poly', layer: c.layer, pts: path, stroke: mix(col, '#ffffff', 0.7), lw: lw * 0.35, join: 'round', cap: 'round', alpha: a, blend: P.s(c, 'blend') });
    }
    if (P.b(c, 'nodes')) {
      const nd = c.layout.px(P.n(c, 'nodeSize')) / 2;
      pts.forEach((pt, i) => {
        if (lens[i]! > reach + 1e-6) return;
        const pop = smoothstep(seg(reach - lens[i]!, 0, c.layout.cell * 0.4));
        c.out.push({ op: 'ellipse', layer: c.layer, cx: pt.x, cy: pt.y, rx: nd * pop, ry: nd * pop, fill: mix(col, '#ffffff', 0.5), stroke: col, lw: Math.max(1, nd * 0.25), alpha: a, blend: P.s(c, 'blend'), ...(sh ? { shadow: sh } : {}) });
      });
    }
  },
};

export const shine: EffectDef = {
  type: 'shine',
  label: 'Shine sweep',
  description: 'A diagonal band of light sweeping across cells or the whole board.',
  category: 'glow',
  defaultLayer: 'fxAbove',
  defaultCues: [{ cue: 'shine.sparkle', at: 0 }],
  params: [
    ...commonParams({ duration: 900, layer: 'fxAbove', blend: 'lighter', easing: 'easeInOutCubic' }),
    enm('target', 'Target', tg, 'winCells', [['winCells', 'Each winning cell'], ['board', 'Whole board']], 'Where the sweep runs.'),
    color('color', 'Colour', lk, ref('color.text'), 'Band colour.'),
    num('angle', 'Angle', lk, 20, -60, 60, 1, 'deg', 'Tilt of the band.'),
    num('bandWidth', 'Band width', lk, 60, 10, 300, 1, 'cell%', 'Band thickness.'),
    num('peak', 'Peak brightness', lk, 55, 0, 100, 1, '%', 'Band opacity at its centre. Scales with intensity.'),
    num('sweeps', 'Sweeps', mo, 1, 1, 4, 1, 'count', 'Number of passes.', true),
    num('cellStagger', 'Cell stagger', { ...mo, activeWhen: { key: 'target', values: ['winCells'] } }, 50, 0, 400, 5, 'ms', 'Delay between consecutive cells. Scaled by the theme stagger scale.'),
  ],
  evaluate(c) {
    const col = P.s(c, 'color');
    const rects = P.s(c, 'target') === 'board'
      ? [{ ...c.layout.board, r: c.layout.px(c.tokens['surface.cornerRadius'] as number) }]
      : c.scene.winCells.map((w) => ({ ...c.layout.cellRect(w.col, w.row), r: c.layout.px(c.tokens['board.cellRadius'] as number) }));
    const sweeps = P.n(c, 'sweeps');
    const stagger = P.n(c, 'cellStagger');
    const maxDelay = staggerMs(c, Math.max(0, rects.length - 1), stagger);
    const win = Math.max(1, c.duration - maxDelay);
    const rad = (P.n(c, 'angle') * Math.PI) / 180;
    const bw = c.layout.px(P.n(c, 'bandWidth'));
    rects.forEach((r, i) => {
      const lt = c.t - (P.s(c, 'target') === 'board' ? 0 : staggerMs(c, i, stagger));
      if (lt < 0 || lt > win) return;
      const q = clamp(lt / win, 0, 1);
      const phase = (q * sweeps) % 1 || (q >= 1 ? 1 : 0);
      const e = c.ease(phase);
      const diag = Math.hypot(r.w, r.h);
      const span = r.w + bw * 2 + Math.abs(Math.tan(rad)) * r.h;
      const x = r.cx - span / 2 + span * e;
      const edge = Math.sin(Math.PI * clamp(phase, 0, 1));
      c.out.push({
        op: 'rect', layer: c.layer, cx: x, cy: r.cy, w: bw, h: diag * 1.6, rot: P.n(c, 'angle'),
        fill: { g: 'linear', angle: 90, stops: [[0, withAlpha(col, 0)], [0.5, withAlpha(col, 1)], [1, withAlpha(col, 0)]] },
        alpha: clamp((P.n(c, 'peak') / 100) * Math.min(c.intensity, 2) * edge * opacity(c), 0, 1), blend: P.s(c, 'blend'),
        clip: { cx: r.cx, cy: r.cy, w: r.w, h: r.h, r: r.r },
      });
    });
  },
};

export const anticipationGlow: EffectDef = {
  type: 'anticipationGlow',
  label: 'Anticipation glow',
  description: 'Pulsing frame glow (and optional vignette) that builds tension.',
  category: 'glow',
  defaultLayer: 'fxBelow',
  defaultCues: [{ cue: 'anticipation.rise', at: 0 }],
  params: [
    ...commonParams({ duration: 1600, layer: 'fxBelow', blend: 'lighter', easing: 'linear' }),
    enm('target', 'Target', tg, 'frame', [['frame', 'Board frame'], ['winCells', 'Winning cells']], 'What glows.'),
    color('color', 'Colour', lk, ref('color.accent'), 'Glow colour.'),
    num('width', 'Stroke width', lk, 10, 2, 40, 0.5, 'cell%', 'Glow stroke thickness.'),
    num('glowBlur', 'Glow blur', lk, ref('outline.glowBlur'), 0, 60, 1, 'cell%', 'Glow radius.'),
    num('minAlpha', 'Minimum opacity', lk, 15, 0, 100, 1, '%', 'Opacity at the pulse trough.'),
    num('maxAlpha', 'Maximum opacity', lk, 80, 0, 100, 1, '%', 'Opacity at the pulse peak. Scales with intensity.'),
    num('vignette', 'Vignette', lk, 30, 0, 80, 1, '%', 'Edge darkening to focus the board.'),
    num('rate', 'Pulse rate', mo, 2.2, 0.5, 6, 0.1, 'hz', 'Pulses per second.'),
    num('buildUp', 'Build-up', mo, 60, 0, 100, 1, '%', 'How much the amplitude grows from start to end.'),
  ],
  evaluate(c) {
    const col = P.s(c, 'color');
    const I = Math.min(c.intensity, 2);
    const build = lerp(1 - P.n(c, 'buildUp') / 100, 1, c.ease(c.p));
    const pulse = 0.5 - 0.5 * Math.cos(TAU * P.n(c, 'rate') * (c.t / 1000));
    const env = smoothstep(seg(c.p, 0, 0.08)) * (1 - smoothstep(seg(c.p, 0.92, 1)));
    const a = clamp(lerp(P.n(c, 'minAlpha'), P.n(c, 'maxAlpha'), pulse) / 100 * build * I * env * opacity(c), 0, 1);
    const sh = glowShadow(c, col, 90, P.n(c, 'glowBlur'));
    const lw = c.layout.px(P.n(c, 'width'));
    if (P.n(c, 'vignette') > 0) {
      c.out.push({ op: 'rect', layer: c.layer, cx: c.layout.vw / 2, cy: c.layout.vh / 2, w: c.layout.vw, h: c.layout.vh, fill: { g: 'radial', stops: [[0.35, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,1)']] }, alpha: clamp((P.n(c, 'vignette') / 100) * env * build * opacity(c), 0, 1) });
    }
    if (P.s(c, 'target') === 'frame') {
      const b = c.layout.board;
      c.out.push({ op: 'rect', layer: c.layer, cx: b.cx, cy: b.cy, w: b.w, h: b.h, r: c.layout.px(c.tokens['surface.cornerRadius'] as number), stroke: col, lw, alpha: a, blend: P.s(c, 'blend'), ...(sh ? { shadow: sh } : {}) });
    } else {
      for (const w of c.scene.winCells) {
        const r = c.layout.cellRect(w.col, w.row);
        c.out.push({ op: 'rect', layer: c.layer, cx: r.cx, cy: r.cy, w: r.w, h: r.h, r: c.layout.px(c.tokens['board.cellRadius'] as number), stroke: col, lw, alpha: a, blend: P.s(c, 'blend'), ...(sh ? { shadow: sh } : {}) });
      }
    }
  },
};
