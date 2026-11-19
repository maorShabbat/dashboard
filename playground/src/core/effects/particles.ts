import { color, enm, num, ref } from '../params';
import { starPoints } from '../ops';
import { seg, smoothstep, lerp } from '../util/easing';
import { mix, withAlpha } from '../util/color';
import { clamp, glowShadow, opacity, staggerMs } from './helpers';
import { type EffectDef, commonParams, P } from './types';

const tg = { section: 'effect', group: 'Emitter' };
const lk = { section: 'effect', group: 'Look' };
const mo = { section: 'effect', group: 'Motion' };

export const coinBurst: EffectDef = {
  type: 'coinBurst',
  label: 'Coin burst',
  description: 'Physics-driven particle burst: coins, confetti, stars or sparks.',
  category: 'particles',
  defaultLayer: 'fxAbove',
  defaultCues: [{ cue: 'coin.burst', at: 0 }, { cue: 'coin.land', at: 1100 }],
  params: [
    ...commonParams({ duration: 1800, layer: 'fxAbove', easing: null, seed: true }),
    enm('origin', 'Origin', tg, 'centre', [['centre', 'Board centre'], ['winCells', 'Winning cells'], ['topCentre', 'Top centre']], 'Where particles are emitted.'),
    num('count', 'Particle count', tg, 60, 1, 400, 1, 'count', 'Number of particles. Scales with intensity.', true),
    num('burstWindow', 'Emit window', tg, 8, 0, 60, 1, '%', 'Share of the duration over which particles spawn (0 = all at once).'),
    enm('shape', 'Shape', lk, 'coin', [['coin', 'Coin'], ['confetti', 'Confetti'], ['star', 'Star'], ['spark', 'Spark'], ['sprite', 'Sprite (asset.particle)']], 'Particle shape. "Sprite" uses the theme\'s particle image, falling back to coins.'),
    num('sizeMin', 'Size min', lk, 14, 4, 100, 1, 'cell%', 'Smallest particle.'),
    num('sizeMax', 'Size max', lk, 28, 4, 150, 1, 'cell%', 'Largest particle.'),
    color('colorA', 'Colour A', lk, ref('color.accent'), 'Primary particle colour.'),
    color('colorB', 'Colour B', { ...lk, activeWhen: { key: 'shape', values: ['confetti', 'star', 'spark'] } }, ref('color.primary'), 'Secondary colour for confetti, stars and sparks.'),
    color('colorC', 'Colour C', { ...lk, activeWhen: { key: 'shape', values: ['confetti'] } }, ref('color.secondary'), 'Third confetti colour.'),
    num('glowBlur', 'Glow blur', lk, 0, 0, 60, 1, 'cell%', 'Optional glow around each particle.'),
    num('speed', 'Launch speed', mo, 900, 100, 3000, 10, 'cell%/s', 'Mean launch speed. Scales gently with intensity.'),
    num('spread', 'Spread', mo, 360, 0, 360, 1, 'deg', 'Cone width of the burst.'),
    num('direction', 'Direction', mo, -90, -180, 180, 1, 'deg', 'Cone centre (−90° is up).'),
    num('gravity', 'Gravity', mo, 2200, 0, 6000, 10, 'cell%/s²', 'Downward acceleration.'),
    num('drag', 'Air drag', mo, 0.6, 0, 5, 0.05, 'ratio', 'Velocity decay per second.'),
    num('spin', 'Spin', mo, 360, 0, 1440, 10, 'deg/s', 'Maximum rotation speed.'),
    num('lifetimeSpread', 'Lifetime variance', mo, 30, 0, 80, 1, '%', 'How much particle lifetimes vary.'),
    num('fade', 'Fade out', mo, 40, 0, 100, 1, '%', 'Share of a particle\'s life spent fading.'),
  ],
  evaluate(c) {
    const I = Math.max(0, c.intensity);
    const n = I <= 0 ? 0 : Math.max(1, Math.round(P.n(c, 'count') * Math.min(I, 2)));
    if (!n) return;
    const L = c.layout;
    const shape = P.s(c, 'shape');
    const origin = P.s(c, 'origin');
    const spriteId = c.tokens['asset.particle'] as string;
    const useSprite = shape === 'sprite' && !!spriteId && c.assets.has(spriteId);
    const colours = [P.s(c, 'colorA'), P.s(c, 'colorB'), P.s(c, 'colorC')];
    const speedK = 0.75 + 0.25 * Math.min(I, 2);
    const drag = Math.max(0.001, P.n(c, 'drag'));
    const g = L.px(P.n(c, 'gravity'));
    const outline = c.tokens['outline.color'] as string;
    const sh = glowShadow(c, colours[0]!, 80, P.n(c, 'glowBlur'));
    const win = c.scene.winCells;
    const alphaOp = opacity(c);
    const sizeMin = P.n(c, 'sizeMin'), sizeMax = Math.max(P.n(c, 'sizeMin'), P.n(c, 'sizeMax'));
    const dirRad = (P.n(c, 'direction') * Math.PI) / 180;
    const spreadRad = (P.n(c, 'spread') * Math.PI) / 180;
    for (let i = 0; i < n; i++) {
      const r = c.rng(i * 7919 + 13);
      const delay = r.next() * (P.n(c, 'burstWindow') / 100) * c.duration;
      const life = c.duration * lerp(1 - P.n(c, 'lifetimeSpread') / 100, 1, r.next()) - delay;
      const lt = (c.t - delay) / 1000;
      if (lt < 0 || life <= 0 || lt * 1000 > life) continue;
      let ox = L.centre.x, oy = L.centre.y;
      if (origin === 'topCentre') { ox = L.board.cx; oy = L.board.y; }
      else if (origin === 'winCells' && win.length) { const w = win[Math.floor(r.next() * win.length)]!; const cr = L.cellRect(w.col, w.row); ox = cr.cx; oy = cr.cy; }
      const ang = dirRad + (r.next() - 0.5) * spreadRad;
      const spd = L.px(P.n(c, 'speed')) * lerp(0.55, 1.15, r.next()) * speedK;
      const vx = Math.cos(ang) * spd, vy = Math.sin(ang) * spd;
      const k = drag;
      const decay = 1 - Math.exp(-k * lt);
      const x = ox + (vx / k) * decay;
      const y = oy + (g / k) * lt + (vy - g / k) * (decay / k);
      const u = (lt * 1000) / life;
      const fade = P.n(c, 'fade') / 100;
      const a = clamp((fade > 0 ? 1 - smoothstep(seg(u, 1 - fade, 1)) : 1) * alphaOp, 0, 1);
      const size = L.px(lerp(sizeMin, sizeMax, r.next()));
      const spin = (r.next() * 2 - 1) * P.n(c, 'spin');
      const rot = spin * lt + r.next() * 360;
      const col = colours[Math.floor(r.next() * 3)]!;
      const blend = P.s(c, 'blend');
      if (useSprite) {
        c.out.push({ op: 'image', layer: c.layer, asset: spriteId, cx: x, cy: y, w: size, h: size, rot, alpha: a, blend });
      } else if (shape === 'coin' || shape === 'sprite') {
        const flip = Math.max(0.15, Math.abs(Math.cos((rot * Math.PI) / 180 * 1.7)));
        c.out.push({ op: 'ellipse', layer: c.layer, cx: x, cy: y, rx: (size / 2) * flip, ry: size / 2, fill: { g: 'radial', stops: [[0, mix(colours[0]!, '#ffffff', 0.55)], [1, colours[0]!]] }, stroke: outline, lw: Math.max(1, size * 0.09), alpha: a, blend, ...(sh ? { shadow: sh } : {}) });
        c.out.push({ op: 'ellipse', layer: c.layer, cx: x, cy: y, rx: (size / 2) * flip * 0.58, ry: size * 0.29, stroke: withAlpha(outline, 0.55), lw: Math.max(1, size * 0.06), alpha: a, blend });
      } else if (shape === 'confetti') {
        c.out.push({ op: 'rect', layer: c.layer, cx: x, cy: y, w: size * 0.55, h: size * (0.9 * Math.max(0.25, Math.abs(Math.cos((rot * Math.PI) / 180)))), rot, fill: col, alpha: a, blend, ...(sh ? { shadow: sh } : {}) });
      } else if (shape === 'star') {
        c.out.push({ op: 'poly', layer: c.layer, pts: starPoints(x, y, size / 2, size / 4.2, 5, rot), closed: true, fill: i % 2 ? colours[1]! : colours[0]!, stroke: outline, lw: Math.max(1, size * 0.07), join: 'round', alpha: a, blend, ...(sh ? { shadow: sh } : {}) });
      } else {
        const len = size * 1.1;
        const dx = Math.cos(ang) * len * 0.5, dy = Math.sin(ang) * len * 0.5;
        c.out.push({ op: 'poly', layer: c.layer, pts: [x - dx, y - dy, x + dx, y + dy], stroke: i % 2 ? colours[1]! : colours[0]!, lw: Math.max(1.5, size * 0.16), cap: 'round', alpha: a, blend, ...(sh ? { shadow: sh } : {}) });
      }
    }
  },
};

export const shockwave: EffectDef = {
  type: 'shockwave',
  label: 'Shockwave',
  description: 'One or more expanding glowing rings.',
  category: 'glow',
  defaultLayer: 'fxAbove',
  defaultCues: [{ cue: 'whoosh', at: 0 }],
  params: [
    ...commonParams({ duration: 900, layer: 'fxAbove', blend: 'lighter', easing: 'easeOutCubic' }),
    enm('origin', 'Origin', tg, 'centre', [['centre', 'Board centre'], ['winCells', 'Each winning cell (max 6)']], 'Where rings expand from.'),
    num('rings', 'Rings', tg, 2, 1, 6, 1, 'count', 'Rings per origin.', true),
    num('ringStagger', 'Ring stagger', tg, 120, 0, 600, 10, 'ms', 'Delay between rings. Scaled by the theme stagger scale.'),
    color('color', 'Colour', lk, ref('color.secondary'), 'Ring colour.'),
    num('width', 'Ring width', lk, 12, 1, 60, 0.5, 'cell%', 'Stroke width at the start.'),
    num('thinning', 'Thinning', lk, 0.8, 0, 1, 0.01, 'ratio', 'How much the ring thins as it expands (1 = vanishes).'),
    num('glowBlur', 'Glow blur', lk, ref('outline.glowBlur'), 0, 60, 1, 'cell%', 'Glow radius.'),
    num('startRadius', 'Start radius', mo, 20, 0, 300, 1, 'cell%', 'Radius at t = 0.'),
    num('endRadius', 'End radius', mo, 700, 50, 1500, 5, 'cell%', 'Radius at the end. Scales with intensity.'),
  ],
  evaluate(c) {
    const L = c.layout;
    const origins = P.s(c, 'origin') === 'winCells' && c.scene.winCells.length
      ? c.scene.winCells.slice(0, 6).map((w) => { const r = L.cellRect(w.col, w.row); return { x: r.cx, y: r.cy }; })
      : [{ x: L.centre.x, y: L.centre.y }];
    const rings = P.n(c, 'rings');
    const col = P.s(c, 'color');
    const I = Math.min(c.intensity, 2);
    const sh = glowShadow(c, col, 90, P.n(c, 'glowBlur'));
    const maxDelay = staggerMs(c, rings - 1, P.n(c, 'ringStagger'));
    const win = Math.max(1, c.duration - maxDelay);
    for (const o of origins) {
      for (let r = 0; r < rings; r++) {
        const q = clamp((c.t - staggerMs(c, r, P.n(c, 'ringStagger'))) / win, 0, 1);
        if (q <= 0 || q >= 1) continue;
        const e = c.ease(q);
        const radius = L.px(lerp(P.n(c, 'startRadius'), P.n(c, 'endRadius') * (0.6 + 0.4 * I), e));
        const lw = Math.max(0.5, L.px(P.n(c, 'width')) * (1 - P.n(c, 'thinning') * q) * (0.6 + 0.4 * I));
        c.out.push({ op: 'ellipse', layer: c.layer, cx: o.x, cy: o.y, rx: radius, ry: radius, stroke: col, lw, alpha: clamp((1 - q) ** 1.2 * opacity(c) * Math.min(I, 1.2), 0, 1), blend: P.s(c, 'blend'), ...(sh ? { shadow: sh } : {}) });
      }
    }
  },
};
