import type { BoardInfo } from '../fx/effect';
import type { BoardPlan } from './board';
import type { BoardElement } from './scene';

/** A board's geometry and events as effect layers see them (scene units, scene seconds): where the cells are, and when things happen. */
export function boardInfo(el: BoardElement, plan: BoardPlan, aspect: number): BoardInfo {
  const pitch = el.cell * (1 + el.gap) * el.scale, cell = el.cell * el.scale;
  const cx = el.x * aspect, cy = el.y, W = (plan.cols * el.cell * (1 + el.gap) - el.cell * el.gap) * el.scale, H = (plan.rows * el.cell * (1 + el.gap) - el.cell * el.gap) * el.scale;
  const x0 = cx - W / 2 + cell / 2, y0 = cy - H / 2 + cell / 2;
  return {
    cols: plan.cols, rows: plan.rows, cell, pitch, cx, cy, box: { x0: cx - W / 2, y0: cy - H / 2, x1: cx + W / 2, y1: cy + H / 2 },
    cellCenter: (r, c) => ({ x: x0 + c * pitch, y: y0 + r * pitch }),
    events: plan.events.map((e) => ({ ...e, t: e.t + el.start, until: e.until !== undefined ? e.until + el.start : undefined })),
    roles: plan.layout.map((row) => row.map((s) => el.symbols[s]?.role ?? 'normal')),
    // the reels' own timing, so an effect can follow how fast each one is really turning (times shifted to scene seconds)
    reels: plan.reels.map((r) => ({ ...r, start: r.start + el.start, stop: r.stop + el.start, brakeAt: r.brakeAt + el.start, dropStart: r.dropStart + el.start })),
    end: plan.end + el.start, style: plan.style, pattern: plan.pattern,
  };
}
