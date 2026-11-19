import { bool, color, enm, num, ref, text as textParam } from '../params';
import { TAU, starPoints } from '../ops';
import { seg, smoothstep, lerp } from '../util/easing';
import { mix, withAlpha } from '../util/color';
import { clamp, glowShadow, opacity, pushPlate, pushText, textSizePx, applyTransform } from './helpers';
import { type EffectDef, commonParams, P } from './types';

const lk = { section: 'effect', group: 'Look' };
const cn = { section: 'effect', group: 'Content' };
const mo = { section: 'effect', group: 'Motion' };

/** Deterministic number formatting (no locale dependence): 1234.5 → "1,234.50". */
export function formatAmount(v: number, decimals: number): string {
  const [int, frac] = Math.abs(v).toFixed(decimals).split('.');
  const grouped = int!.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return (v < 0 ? '-' : '') + grouped + (frac ? '.' + frac : '');
}

/** Pop-in curve with wind-up: scale dips by `anticipation` % before springing to the eased value. */
function popScale(e: number, p: number, anticipationPct: number): number {
  return Math.max(0, e - (anticipationPct / 100) * Math.sin(Math.PI * clamp(p, 0, 1)) * (1 - clamp(p, 0, 1)) * 2);
}

export const bigWinBanner: EffectDef = {
  type: 'bigWinBanner',
  label: 'Big win banner',
  description: 'Win plate with burst rays, a tier title and a counting win amount.',
  category: 'text',
  defaultLayer: 'ui',
  defaultCues: [{ cue: 'win.big', at: 0 }, { cue: 'counter.tick', at: 400 }, { cue: 'counter.end', at: 2300 }],
  params: [
    ...commonParams({ duration: 3200, layer: 'ui' }),
    enm('tier', 'Win tier', cn, 'big', [['big', 'Big'], ['mega', 'Mega'], ['epic', 'Epic']], 'Selects the title and the theme\'s per-tier intensity multiplier.'),
    textParam('title', 'Title override', cn, '', 24, 'Replaces the tier title when not empty.'),
    bool('showCounter', 'Show counter', cn, true, 'Count the win amount up beneath the title.'),
    num('counterFraction', 'Count time', { ...cn, activeWhen: { key: 'showCounter', values: [true] } }, 70, 10, 100, 1, '%', 'Share of the duration spent counting up.'),
    num('decimals', 'Decimals', { ...cn, activeWhen: { key: 'showCounter', values: [true] } }, 2, 0, 4, 1, 'count', 'Decimal places in the counter.', true),
    textParam('prefix', 'Currency prefix', { ...cn, activeWhen: { key: 'showCounter', values: [true] } }, '', 6, 'Text placed before the amount (e.g. a currency symbol).'),
    num('plateWidth', 'Plate width', lk, 560, 100, 1400, 5, 'cell%', 'Plate width.'),
    num('plateHeight', 'Plate height', lk, 300, 60, 800, 5, 'cell%', 'Plate height.'),
    num('tilt', 'Tilt', lk, -3, -15, 15, 0.5, 'deg', 'Plate rotation.'),
    color('titleColor', 'Title colour', lk, ref('color.win'), 'Title fill (lightened toward the top).'),
    color('counterColor', 'Counter colour', { ...lk, activeWhen: { key: 'showCounter', values: [true] } }, ref('color.text'), 'Counter fill.'),
    bool('rays', 'Burst rays', lk, true, 'Rotating comic-book rays behind the plate.'),
    num('rayCount', 'Ray count', { ...lk, activeWhen: { key: 'rays', values: [true] } }, 18, 4, 48, 1, 'count', 'Number of rays.', true),
    color('rayColor', 'Ray colour', { ...lk, activeWhen: { key: 'rays', values: [true] } }, ref('color.accent'), 'Ray colour.'),
    num('rayAlpha', 'Ray opacity', { ...lk, activeWhen: { key: 'rays', values: [true] } }, 35, 0, 100, 1, '%', 'Ray opacity at the centre. Scales with intensity.'),
    num('raySpeed', 'Ray rotation', { ...mo, activeWhen: { key: 'rays', values: [true] } }, 24, 0, 180, 1, 'deg/s', 'Ray rotation speed.'),
  ],
  evaluate(c) {
    const L = c.layout;
    const tier = P.s(c, 'tier');
    const tierMul = c.tokens[tier === 'epic' ? 'intensity.tierEpic' : tier === 'mega' ? 'intensity.tierMega' : 'intensity.tierBig'] as number;
    const I = c.intensity * tierMul;
    const popDur = Math.min(520, c.duration * 0.25);
    const pp = seg(c.t, 0, popDur);
    const outP = seg(c.p, 0.9, 1);
    const sc = popScale(c.ease(pp), pp, c.tokens['motion.anticipation'] as number) * (1 - 0.15 * smoothstep(outP)) * clamp(1 + 0.06 * (I - 1), 0.85, 1.2);
    const a = clamp((1 - smoothstep(outP)) * opacity(c) * smoothstep(seg(c.t, 0, 80)), 0, 1);
    const cx = L.centre.x, cy = L.centre.y - L.cell * 0.1;
    const w = L.px(P.n(c, 'plateWidth')), h = L.px(P.n(c, 'plateHeight'));
    const tilt = P.n(c, 'tilt');
    const blend = P.s(c, 'blend');

    if (P.b(c, 'rays') && P.n(c, 'rayCount') > 0) {
      const n = P.n(c, 'rayCount');
      const R = Math.hypot(L.vw, L.vh) * 0.62;
      const rot = P.n(c, 'raySpeed') * (c.t / 1000);
      const col = P.s(c, 'rayColor');
      const hw = (180 / n) * 0.5;
      for (let i = 0; i < n; i++) {
        const a0 = ((i * 360) / n + rot) * (Math.PI / 180);
        const half = hw * (Math.PI / 180);
        c.out.push({
          op: 'poly', layer: c.layer, closed: true,
          pts: [cx, cy, cx + Math.cos(a0 - half) * R, cy + Math.sin(a0 - half) * R, cx + Math.cos(a0 + half) * R, cy + Math.sin(a0 + half) * R],
          fill: { g: 'radial', stops: [[0, withAlpha(col, 1)], [1, withAlpha(col, 0)]] },
          alpha: clamp((P.n(c, 'rayAlpha') / 100) * Math.min(I, 2) * smoothstep(pp) * a, 0, 1), blend,
        });
      }
    }

    const plateId = c.tokens['asset.bannerPlate'] as string;
    if (plateId && c.assets.has(plateId)) {
      c.out.push({ op: 'image', layer: c.layer, asset: plateId, cx, cy, w: w * sc, h: h * sc, rot: tilt, alpha: a, blend });
    } else {
      pushPlate(c, { cx, cy, w, h, scale: sc, rot: tilt, alpha: a });
    }

    const title = P.s(c, 'title') || (tier === 'epic' ? 'EPIC WIN' : tier === 'mega' ? 'MEGA WIN' : 'BIG WIN');
    const tcol = P.s(c, 'titleColor');
    const rad = (tilt * Math.PI) / 180;
    const place = (dy: number) => ({ x: cx - Math.sin(rad) * dy * sc, y: cy + Math.cos(rad) * dy * sc });
    const showCounter = P.b(c, 'showCounter');
    const t1 = place(showCounter ? -h * 0.16 : 0);
    pushText(c, {
      text: title, x: t1.x, y: t1.y, role: 'display', scale: sc, rot: tilt, alpha: a, maxWidth: w * 0.86,
      sizeMul: 1 + 0.1 * clamp(I - 1, -0.5, 1),
      fill: { g: 'linear', angle: 180, stops: [[0, mix(tcol, '#ffffff', 0.5)], [1, tcol]] },
    });
    if (showCounter) {
      const cp = 1 - (1 - seg(c.t, popDur * 0.5, c.duration * (P.n(c, 'counterFraction') / 100))) ** 3;
      const value = c.scene.winAmount * clamp(cp, 0, 1);
      const t2 = place(h * 0.2);
      pushText(c, {
        text: `${P.s(c, 'prefix')}${formatAmount(value, P.n(c, 'decimals'))}`, x: t2.x, y: t2.y, role: 'numeric', scale: sc, rot: tilt, alpha: a,
        maxWidth: w * 0.86, fill: P.s(c, 'counterColor'), sizeMul: 0.9,
      });
    }
  },
};

export const multiplierPop: EffectDef = {
  type: 'multiplierPop',
  label: 'Multiplier pop',
  description: 'A badge showing ×N that pops in with a spin and a ring of sparks.',
  category: 'text',
  defaultLayer: 'fxAbove',
  defaultCues: [{ cue: 'multiplier.hit', at: 120 }],
  params: [
    ...commonParams({ duration: 1100, layer: 'fxAbove' }),
    num('value', 'Value', cn, 3, 2, 1000, 1, 'count', 'Multiplier shown on the badge.', true),
    textParam('prefix', 'Prefix', cn, '×', 3, 'Text before the value.'),
    enm('target', 'Position', cn, 'centre', [['centre', 'Board centre'], ['lastWin', 'Last winning cell']], 'Where the badge lands.'),
    enm('shape', 'Shape', lk, 'burst', [['burst', 'Starburst'], ['circle', 'Circle'], ['rounded', 'Rounded square']], 'Badge outline.'),
    num('size', 'Size', lk, 130, 40, 400, 1, 'cell%', 'Badge diameter.'),
    color('color', 'Badge colour', lk, ref('color.primary'), 'Badge fill.'),
    color('textColor', 'Text colour', lk, ref('color.text'), 'Value colour.'),
    bool('trail', 'Spark ring', lk, true, 'Ring of sparks that expands as the badge lands.'),
    num('spin', 'Spin', mo, 180, 0, 720, 5, 'deg', 'Rotation that unwinds as the badge pops in.'),
    num('hold', 'Hold', mo, 45, 10, 90, 1, '%', 'How long the badge stays fully visible before fading.'),
  ],
  evaluate(c) {
    const L = c.layout;
    const last = c.scene.winCells[c.scene.winCells.length - 1];
    let x = L.centre.x, y = L.centre.y;
    if (P.s(c, 'target') === 'lastWin' && last) { const r = L.cellRect(last.col, last.row); x = r.cx; y = r.cy; }
    const I = Math.min(c.intensity, 2);
    const pp = seg(c.p, 0, 0.28);
    const sc = popScale(c.ease(pp), pp, c.tokens['motion.anticipation'] as number) * (0.85 + 0.15 * I);
    const fadeStart = Math.min(0.95, 0.25 + (P.n(c, 'hold') / 100) * 0.7);
    const a = clamp((1 - smoothstep(seg(c.p, fadeStart, 1))) * opacity(c), 0, 1);
    const rot = P.n(c, 'spin') * (1 - c.ease(seg(c.p, 0, 0.4)));
    const size = L.px(P.n(c, 'size')) * sc;
    const col = P.s(c, 'color');
    const outline = c.tokens['outline.color'] as string;
    const lw = Math.max(1, L.px(c.tokens['outline.width'] as number) * sc);
    const sh = glowShadow(c, c.tokens['outline.glowColor'] as string, c.tokens['outline.glowStrength'] as number * I, c.tokens['outline.glowBlur'] as number);
    const blend = P.s(c, 'blend');
    const fill = { g: 'radial' as const, stops: [[0, mix(col, '#ffffff', 0.35)], [1, col]] as [number, string][] };
    if (P.b(c, 'trail')) {
      const q = seg(c.p, 0.05, 0.6);
      for (let i = 0; i < 10; i++) {
        const ang = (i / 10) * TAU;
        const rr = size * lerp(0.55, 1.2, c.ease(q));
        c.out.push({ op: 'ellipse', layer: c.layer, cx: x + Math.cos(ang) * rr, cy: y + Math.sin(ang) * rr, rx: size * 0.05 * (1 - q), ry: size * 0.05 * (1 - q), fill: P.s(c, 'color'), alpha: clamp((1 - q) * a, 0, 1), blend });
      }
    }
    const shape = P.s(c, 'shape');
    if (shape === 'burst') c.out.push({ op: 'poly', layer: c.layer, pts: starPoints(x, y, size / 2, size / 2.5, 12, rot), closed: true, fill, stroke: outline, lw, join: 'round', alpha: a, blend, ...(sh ? { shadow: sh } : {}) });
    else if (shape === 'circle') c.out.push({ op: 'ellipse', layer: c.layer, cx: x, cy: y, rx: size / 2, ry: size / 2, rot, fill, stroke: outline, lw, alpha: a, blend, ...(sh ? { shadow: sh } : {}) });
    else c.out.push({ op: 'rect', layer: c.layer, cx: x, cy: y, w: size * 0.9, h: size * 0.9, r: size * 0.22, rot, fill, stroke: outline, lw, alpha: a, blend, ...(sh ? { shadow: sh } : {}) });
    const baseSize = textSizePx(c, 'numeric', 1);
    pushText(c, {
      text: `${P.s(c, 'prefix')}${P.n(c, 'value')}`, x, y: y + size * 0.03, role: 'numeric', sizeMul: (size * 0.42) / (baseSize * Math.max(sc, 0.0001)) * sc,
      fill: P.s(c, 'textColor'), rot: rot * 0.15, alpha: a, maxWidth: size * 0.8,
    });
  },
};

export const textCallout: EffectDef = {
  type: 'textCallout',
  label: 'Text callout',
  description: 'Generic themed message (FREE SPINS, +10, ROUND OVER) on an optional plate.',
  category: 'text',
  defaultLayer: 'ui',
  defaultCues: [{ cue: 'callout.hit', at: 0 }],
  params: [
    ...commonParams({ duration: 1400, layer: 'ui' }),
    textParam('text', 'Text', cn, 'FREE SPINS', 40, 'Message to show.'),
    enm('role', 'Type role', cn, 'display', [['display', 'Display'], ['headline', 'Headline'], ['body', 'Body'], ['numeric', 'Numeric'], ['label', 'Label']], 'Typography role from the theme.'),
    num('sizeMul', 'Size multiplier', cn, 1, 0.3, 3, 0.05, 'x', 'Scales the role\'s size.'),
    color('color', 'Text colour', lk, ref('color.text'), 'Text fill.'),
    bool('plate', 'Plate', lk, true, 'Draw a themed plate behind the text.'),
    num('tilt', 'Tilt', lk, 0, -20, 20, 0.5, 'deg', 'Rotation.'),
    enm('anchor', 'Anchor', mo, 'centre', [['centre', 'Centre'], ['top', 'Top of board'], ['bottom', 'Bottom of board']], 'Where the callout sits relative to the board.'),
    num('rise', 'Rise', mo, 30, 0, 200, 1, 'cell%', 'Upward drift over the duration.'),
    num('scaleFrom', 'Start scale', mo, 0.6, 0.2, 2, 0.05, 'ratio', 'Scale at the start of the pop-in.'),
    num('hold', 'Hold', mo, 50, 0, 90, 1, '%', 'Share of the duration the callout stays fully visible after popping in.'),
  ],
  evaluate(c) {
    const L = c.layout;
    const pp = seg(c.p, 0, 0.25);
    const fadeStart = Math.min(0.97, 0.25 + (P.n(c, 'hold') / 100) * 0.7);
    const outP = seg(c.p, fadeStart, 1);
    const sc = lerp(P.n(c, 'scaleFrom'), 1, popScale(c.ease(pp), pp, c.tokens['motion.anticipation'] as number)) * (1 + 0.05 * (c.intensity - 1));
    const a = clamp((1 - smoothstep(outP)) * opacity(c) * smoothstep(seg(c.t, 0, 80)), 0, 1);
    const anchorY = P.s(c, 'anchor') === 'top' ? L.board.y + L.board.h * 0.12 : P.s(c, 'anchor') === 'bottom' ? L.board.y + L.board.h * 0.88 : L.centre.y;
    const y = anchorY - L.px(P.n(c, 'rise')) * c.ease(c.p);
    const role = P.s(c, 'role') as 'display' | 'headline' | 'body' | 'numeric' | 'label';
    const size = textSizePx(c, role, P.n(c, 'sizeMul'));
    const txt = applyTransform(P.s(c, 'text'), c.tokens[`type.${role}.transform`] as string);
    const padPx = L.px(c.tokens['surface.padding'] as number);
    const maxW = Math.min(L.vw * 0.92, Math.max(size * 2, txt.length * size * 0.55)) ;
    if (P.b(c, 'plate')) pushPlate(c, { cx: L.centre.x, cy: y, w: maxW + padPx * 2, h: size + padPx * 2, scale: sc, rot: P.n(c, 'tilt'), alpha: a });
    pushText(c, { text: P.s(c, 'text'), x: L.centre.x, y, role, sizeMul: P.n(c, 'sizeMul'), fill: P.s(c, 'color'), scale: sc, rot: P.n(c, 'tilt'), alpha: a, maxWidth: maxW });
  },
};
