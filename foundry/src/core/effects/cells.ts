import { enm, num } from '../params';
import { seg, smoothstep, lerp } from '../util/easing';
import { clamp, staggerMs } from './helpers';
import { type EffectDef, commonParams, P, targetCells } from './types';

const tg = { section: 'effect', group: 'Targets' };
const mo = { section: 'effect', group: 'Motion' };

export const cascadeDrop: EffectDef = {
  type: 'cascadeDrop',
  label: 'Cascade drop',
  description: 'Winning symbols pop out, then replacement symbols drop in from above.',
  category: 'motion',
  defaultLayer: null,
  defaultCues: [{ cue: 'cascade.pop', at: 0 }, { cue: 'cascade.land', at: 450 }],
  params: [
    ...commonParams({ duration: 1000, layer: null, seed: true, noOpacity: true }),
    enm('target', 'Target cells', tg, 'winCells', [['winCells', 'Winning cells'], ['allCells', 'Every cell']], 'Which cells cascade.'),
    num('popFraction', 'Pop share', mo, 35, 10, 80, 1, '%', 'Share of each cell\'s time spent popping out before the drop.'),
    num('popScale', 'Pop swell', mo, 1.2, 1, 2, 0.01, 'x', 'Swell before the symbol vanishes. Scales with intensity.'),
    num('fallDistance', 'Fall distance', mo, 320, 100, 1500, 10, 'cell%', 'How far above its slot the new symbol starts.'),
    num('spin', 'Spin', mo, 14, 0, 90, 1, 'deg', 'Rotation while popping. Scales with intensity.'),
    num('columnStagger', 'Column stagger', mo, 60, 0, 300, 5, 'ms', 'Delay between columns. Scaled by the theme stagger scale.'),
    num('rowStagger', 'Row stagger', mo, 35, 0, 200, 5, 'ms', 'Delay between rows, bottom first. Scaled by the theme stagger scale.'),
  ],
  evaluate(c) {
    const cells = targetCells(c, P.s(c, 'target'));
    if (!cells.length) return;
    const I = c.intensity;
    const colStep = P.n(c, 'columnStagger'), rowStep = P.n(c, 'rowStagger');
    const delayOf = (cell: { col: number; row: number }) => staggerMs(c, cell.col, colStep) + staggerMs(c, c.scene.rows - 1 - cell.row, rowStep);
    const maxDelay = Math.max(...cells.map(delayOf));
    const win = Math.max(1, c.duration - maxDelay);
    const pf = P.n(c, 'popFraction') / 100;
    const swell = 1 + (P.n(c, 'popScale') - 1) * Math.min(I, 2);
    const fall = c.layout.px(P.n(c, 'fallDistance'));
    for (const cell of cells) {
      const q = clamp((c.t - delayOf(cell)) / win, 0, 1);
      const sign = c.rng(cell.col * 31 + cell.row * 17 + 3).sign();
      if (q <= 0) continue;
      if (q < pf) {
        const q1 = q / pf;
        const scale = q1 < 0.35 ? lerp(1, swell, smoothstep(q1 / 0.35)) : lerp(swell, 0, smoothstep((q1 - 0.35) / 0.65));
        c.out.cells.push({ col: cell.col, row: cell.row, dx: 0, dy: 0, scale, alpha: 1 - smoothstep(seg(q1, 0.5, 1)), rot: sign * P.n(c, 'spin') * Math.min(I, 2) * q1, glow: 0, variant: 0 });
      } else if (q < 1) {
        const q2 = (q - pf) / (1 - pf);
        const e = c.ease(q2);
        c.out.cells.push({ col: cell.col, row: cell.row, dx: 0, dy: -fall * (1 - e) * Math.min(Math.max(I, 0.3), 1.5), scale: 1, alpha: smoothstep(seg(q2, 0, 0.15)), rot: sign * P.n(c, 'spin') * 0.4 * (1 - e) * Math.min(I, 2), glow: 0, variant: 1 });
      }
    }
  },
};
