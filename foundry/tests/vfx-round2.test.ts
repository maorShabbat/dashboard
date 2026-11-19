import { describe, expect, it } from 'vitest';
import { defaultsOf, type BoardInfo, type EffectCtx, type ShowEffect } from '../src/vfx/fx/effect';
import { EFFECTS, effectById } from '../src/vfx/fx';
import { emptyFrame, type Frame } from '../src/vfx/engine/frame';
import { ribbon } from '../src/vfx/engine/lightning';
import { boardElement, defaultBoardSymbols, elementAssets, sceneAllAssets, type BoardElement } from '../src/vfx/model/scene';
import { boardAssets } from '../src/vfx/model/board';
import { copyForAi } from '../src/vfx/model/copyForAi';
import { BUILTIN_EXPANSIONS } from '../src/vfx/app/builtins';
import { existsSync } from 'node:fs';
import { planBoard } from '../src/vfx/model/board';
import { boardInfo } from '../src/vfx/model/boardinfo';
import { builtinPresets } from '../src/vfx/library';
import { validatePreset } from '../src/vfx/model/validate';

const make = (params: Record<string, number | string | boolean> = {}, over: Partial<BoardElement> = {}): BoardElement => boardElement({ id: 'board', params: { spin: 'classic', startAt: 0.3, spinTime: 1.2, stagger: 0.2, ...params }, ...over });
const ctxFor = (e: BoardElement | null, over: Partial<EffectCtx> = {}): EffectCtx => {
  const info: BoardInfo | null = e ? boardInfo(e, planBoard(e), 16 / 9) : null;
  return { aspect: 16 / 9, pxPerUnit: 500, object: null, board: info, start: 0, ...over } as EffectCtx;
};
const build = (id: string, t: number, over: Record<string, number | string | boolean>, c: EffectCtx): Frame => {
  const e = effectById(id)!, f = emptyFrame();
  e.build(f, t, { ...defaultsOf(e), ...over }, c);
  return f;
};
const size = (f: Frame): number => f.additive.length + f.polys.length + f.alphaSprites.length + f.vol.length + f.draws.length + f.bolts.length;
const finite = (f: Frame, what: string): void => {
  for (const a of f.additive) for (const v of [a.x, a.y, a.hw, a.hh, a.rot, a.intensity, ...a.color]) expect(Number.isFinite(v), `${what} additive`).toBe(true);
  for (const v of f.polys) expect(Number.isFinite(v), `${what} polys`).toBe(true);
  for (const v of f.bolts) expect(Number.isFinite(v), `${what} bolts`).toBe(true);
  for (const p of f.vol) for (const v of [p.x, p.y, p.size, p.age, p.alpha, p.stretch]) expect(Number.isFinite(v), `${what} vol`).toBe(true);
};
const enumValues = (e: ShowEffect, key: string): string[] => {
  const p = e.params.find((x) => x.key === key)!;
  return (p as unknown as { options: { value: string }[] }).options.map((o) => o.value);
};
const SPIN = EFFECTS.filter((e) => e.id.startsWith('spin.'));
const SYMBOL = EFFECTS.filter((e) => e.id.startsWith('symbol.'));

describe('effects while the reels spin', () => {
  it('there are sixteen, all aimed at a board and none of them part of another group', () => {
    expect(SPIN.length).toBe(16);
    for (const e of SPIN) { expect(e.usesBoard, e.id).toBe(true); expect(e.category, e.id).toBe('candidate'); }
    expect(new Set(SPIN.map((e) => e.id)).size).toBe(16);
  });

  it('draw something while a reel turns, finite numbers throughout, and nothing once their length is over', () => {
    const c = ctxFor(make());
    for (const fx of SPIN) {
      let any = 0;
      for (let t = 0.3; t < 2.6; t += 0.1) { const f = build(fx.id, t, { duration: 6 }, c); any += size(f); finite(f, `${fx.id} @${t}`); }
      expect(any, `${fx.id} draws something while the reels spin`).toBeGreaterThan(0);
      expect(size(build(fx.id, 6.01, { duration: 6 }, c)), `${fx.id} is empty at its end`).toBe(0);
    }
  });

  it('follow the real reel speed: a board at rest shows nothing, and a reel that has stopped is left alone', () => {
    const rest = ctxFor(make({ spin: 'rest' }));
    for (const fx of SPIN) for (const t of [0.2, 0.8, 1.6]) expect(size(build(fx.id, t, { duration: 6 }, rest)), `${fx.id} at rest @${t}`).toBe(0);
    const c = ctxFor(make()), info = c.board!;
    const lastStop = Math.max(...info.events.filter((e) => e.kind === 'reel-stop').map((e) => e.t));
    for (const fx of SPIN.filter((e) => e.id !== 'spin.rumble')) expect(size(build(fx.id, lastStop + 0.5, { duration: 12 }, c)), `${fx.id} after the last reel stopped`).toBe(0);
  });

  it('the effect thins out as reels slow: the first reel stops before the last, so there is less to draw late in the spin', () => {
    const c = ctxFor(make({ stagger: 0.5 })), info = c.board!, stops = info.events.filter((e) => e.kind === 'reel-stop').map((e) => e.t).sort((a, b) => a - b);
    const early = size(build('spin.streaks', stops[0]! - 0.2, { duration: 12 }, c)), late = size(build('spin.streaks', stops[stops.length - 2]! + 0.05, { duration: 12 }, c));
    expect(early).toBeGreaterThan(late);
  });

  it('work on every spin style that moves, and on the ones that do not scroll', () => {
    for (const spin of ['classic', 'drum', 'turbo', 'drop', 'pop']) {
      const c = ctxFor(make({ spin }));
      let any = 0;
      for (let t = 0.3; t < 2.4; t += 0.1) any += size(build('spin.fire', t, { duration: 6 }, c)) + size(build('spin.sparks', t, { duration: 6 }, c));
      expect(any, spin).toBeGreaterThan(0);
    }
  });

  it('cost the same at every quality (they thin their own particles instead of being thinned from outside)', () => {
    const e = effectById('spin.sparks')!;
    expect(e.params.every((p) => p.key !== 'quality')).toBe(true);
    const c = ctxFor(make()), low = { ...c, quality: 0.4 } as EffectCtx;
    expect(size(build('spin.sparks', 1.0, { duration: 6 }, low))).toBeLessThan(size(build('spin.sparks', 1.0, { duration: 6 }, c)));
  });

  it('stand in for a board when they are not aimed at one', () => {
    const c = ctxFor(null);
    for (const fx of SPIN) for (const t of [0, 0.5, 1.2]) expect(() => build(fx.id, t, {}, c), fx.id).not.toThrow();
  });
});

describe('special symbol animations', () => {
  it('there are thirteen motions and twelve auras', () => {
    expect(enumValues(effectById('symbol.motion')!, 'motion').length).toBe(13);
    expect(enumValues(effectById('symbol.aura')!, 'aura').length).toBe(12);
    expect(SYMBOL.map((e) => e.id).sort()).toEqual(['symbol.aura', 'symbol.motion']);
  });

  const wildBoard = make({ pattern: 'sticky-wilds', specials: 3, line: 'row-mid' });
  const wc = ctxFor(wildBoard);
  const cells = (role: string): [number, number][] => { const out: [number, number][] = []; wc.board!.roles.forEach((row, r) => row.forEach((x, c) => { if (x === role) out.push([r, c]); })); return out; };

  it('a motion moves only the symbols it is aimed at, with finite numbers, and lets go at its end', () => {
    const fx = effectById('symbol.motion')!, wilds = cells('wild');
    expect(wilds.length).toBeGreaterThan(0);
    for (const motion of enumValues(fx, 'motion')) {
      const p = { ...defaultsOf(fx), motion, who: 'wild', length: 2 };
      let moved = 0;
      for (let t = 0; t < 7; t += 0.05) {
        const fn = fx.cellMod!(t, p, wc);
        if (!fn) continue;
        for (let r = 0; r < wc.board!.rows; r++) for (let c = 0; c < wc.board!.cols; c++) {
          const m = fn(r, c), isWild = wilds.some(([a, b]) => a === r && b === c);
          if (!m) continue;
          expect(isWild, `${motion} @${t} touches only the wild`).toBe(true);
          for (const v of Object.values(m)) for (const q of Array.isArray(v) ? v : [v]) expect(Number.isFinite(q as number), `${motion}`).toBe(true);
          if ((m.dx ?? 0) !== 0 || (m.dy ?? 0) !== 0 || (m.scale ?? 1) !== 1 || (m.rot ?? 0) !== 0 || (m.bright ?? 1) !== 1 || (m.sx ?? 1) !== 1 || (m.sy ?? 1) !== 1) moved++;
        }
      }
      expect(moved, `${motion} moves the wild`).toBeGreaterThan(0);
      expect(fx.cellMod!(7.01, { ...p, duration: 7 }, wc), `${motion} is over at the end of the layer`).toBeFalsy();
    }
  });

  it('every aura draws round the symbols it is aimed at, finite, and nothing after the layer ends', () => {
    const fx = effectById('symbol.aura')!;
    for (const aura of enumValues(fx, 'aura')) {
      let any = 0;
      for (let t = 0; t < 6; t += 0.1) { const f = build('symbol.aura', t, { aura, who: 'wild', duration: 7, length: 3 }, wc); any += size(f); finite(f, `${aura} @${t}`); }
      expect(any, `${aura} draws something`).toBeGreaterThan(0);
      expect(size(build('symbol.aura', 7.01, { aura, who: 'wild', duration: 7 }, wc)), `${aura} after its end`).toBe(0);
    }
  });

  it('who and when pick the cells and the moment: scatters are not touched when it is aimed at wilds', () => {
    const f = build('symbol.aura', 3, { aura: 'rings', who: 'scatter', duration: 7 }, wc);
    expect(size(f)).toBe(0);
  });
});

describe('whole row and whole reel effects', () => {
  const fx = effectById('lane.run')!;
  const elements = enumValues(fx, 'element'), alongs = enumValues(fx, 'along');
  const b = make({ pattern: 'line-win', line: 'row-mid', winCount: 5 });
  const c = ctxFor(b);

  it('there are fifteen things that can sweep along, four directions, and fire and energy are among them', () => {
    expect(elements.length).toBeGreaterThanOrEqual(15);
    expect(elements).toEqual(expect.arrayContaining(['fire', 'energy', 'lightning', 'laser', 'plasma', 'ice']));
    expect(alongs.sort()).toEqual(['reel', 'reel-up', 'row', 'row-back']);
    expect(fx.usesBoard).toBe(true);
  });

  it('every element draws along every direction, finite, and is gone when its time is up', () => {
    for (const element of elements) for (const along of alongs) {
      const p = { element, along, duration: 6, travel: 0.8, linger: 1 };
      let any = 0;
      for (let t = 0; t < 4; t += 0.2) { const f = build('lane.run', t, p, c); any += size(f); finite(f, `${element} ${along} @${t}`); }
      expect(any, `${element} ${along} draws something`).toBeGreaterThan(0);
      expect(size(build('lane.run', 6.01, p, c)), `${element} ${along} after its end`).toBe(0);
    }
  });

  it('it starts at the moment of the board you pick and waits for it', () => {
    const win = c.board!.events.find((e) => e.kind === 'win')!, stop = Math.max(...c.board!.events.filter((e) => e.kind === 'reel-stop').map((e) => e.t));
    for (const [anchor, at] of [['win', win.t], ['last-stop', stop]] as const) {
      const p = { element: 'laser', anchor, delay: 0, duration: 8, travel: 1 };
      expect(size(build('lane.run', at - 0.4, p, c)), `${anchor}: nothing before`).toBe(0);
      expect(size(build('lane.run', at + 0.5, p, c)), `${anchor}: something after`).toBeGreaterThan(0);
    }
    const ex = ctxFor(make({ pattern: 'expanding-wild', wildReel: 2 })), ev = ex.board!.events.find((e) => e.kind === 'expand')!;
    const p = { element: 'fire', along: 'reel', anchor: 'expand', delay: 0, duration: 8, travel: 1 };
    expect(size(build('lane.run', ev.t - 0.4, p, ex))).toBe(0);
    expect(size(build('lane.run', ev.t + 0.5, p, ex))).toBeGreaterThan(0);
  });

  it('a row or a reel is picked by number (0 is the middle), and every one in turn takes longer than one', () => {
    const one = { element: 'laser', anchor: 'start', delay: 0, duration: 8, travel: 0.6, gap: 0.5, linger: 0.6 };
    const ys = (f: Frame): number[] => [...new Set(f.additive.map((a) => Math.round(a.y * 1000)))];
    const mid = ys(build('lane.run', 0.5, { ...one, lane: 0 }, c)), top = ys(build('lane.run', 0.5, { ...one, lane: 1 }, c)), bottom = ys(build('lane.run', 0.5, { ...one, lane: 3 }, c));
    expect(Math.min(...top)).toBeLessThan(Math.min(...mid));
    expect(Math.max(...bottom)).toBeGreaterThan(Math.max(...mid));
    const all = { ...one, all: 'true' }, tEnd = 0.6 + 0.5 * 2 + 0.6 + 0.2;
    expect(size(build('lane.run', 1.3, all, c))).toBeGreaterThan(size(build('lane.run', 1.3, one, c)));
    expect(size(build('lane.run', tEnd + 0.3, all, c)), 'the last one is still running after the first one has finished').toBeGreaterThanOrEqual(0);
  });

  it('the symbols react as the front reaches them: only on the lane, only after it arrives, finite, and back to normal afterwards', () => {
    expect(fx.cellMod).toBeTruthy();
    const kinds = enumValues(fx, 'symbols');
    expect(kinds).toEqual(expect.arrayContaining(['none', 'glow', 'jump', 'shake', 'fade']));
    for (const symbols of kinds) {
      const p = { ...defaultsOf(fx), element: 'fire', along: 'row', symbols, anchor: 'start', delay: 0, travel: 1, linger: 1, duration: 6 };
      let touched = 0;
      const before = fx.cellMod!(0.05, p, c), mid = fx.cellMod!(0.5, p, c), after = fx.cellMod!(5.9, p, c);
      if (symbols === 'none') { expect(mid, 'none').toBeFalsy(); continue; }
      for (let r = 0; r < c.board!.rows; r++) for (let col = 0; col < c.board!.cols; col++) {
        const onLane = r === 1;
        for (const [name, fn] of [['mid', mid], ['after', after]] as const) {
          const m = fn?.(r, col);
          if (!onLane) expect(m, `${symbols} ${name} off the lane`).toBeFalsy();
          if (m) for (const v of Object.values(m)) for (const q of Array.isArray(v) ? v : [v]) expect(Number.isFinite(q as number), symbols).toBe(true);
        }
        if (onLane && mid?.(r, col)) touched++;
        if (onLane && col === c.board!.cols - 1) expect(before?.(r, col), `${symbols}: the last symbol is not reached yet`).toBeFalsy();
        if (onLane && after?.(r, col)) { const m = after(r, col)!; expect(Math.abs((m.dx ?? 0)) + Math.abs((m.dy ?? 0)), `${symbols}: still for the lane after it`).toBeLessThan(0.02); expect(m.alpha ?? 1, symbols).toBeGreaterThan(0.95); }
      }
      expect(touched, `${symbols} touches the symbols the front has passed`).toBeGreaterThan(0);
    }
  });

  it('does not fail with no board, or with a very small one', () => {
    for (const cc of [ctxFor(null), ctxFor(make({}, { cols: 3, rows: 2, cell: 0.1 }))]) for (const element of elements) for (const t of [0, 0.5, 1.5]) expect(() => build('lane.run', t, { element }, cc), element).not.toThrow();
  });
});

describe('the round-two library', () => {
  const presets = builtinPresets();
  const spin = presets.filter((p) => p.group === 'Reel spin effects');
  const symbols = presets.filter((p) => p.group === 'Special symbol animations');
  const lanes = presets.filter((p) => p.group === 'Whole row and reel effects');

  it('has the spin effects, the special symbol animations and the whole row and reel effects, in the category they belong to', () => {
    expect(spin.length).toBeGreaterThanOrEqual(30);
    expect(symbols.length).toBeGreaterThanOrEqual(30);
    expect(lanes.length).toBeGreaterThanOrEqual(28);
    for (const p of [...spin, ...symbols, ...lanes]) expect(p.category, p.id).toBe('symbol-transformation');
  });

  it('the whole row and reel presets include at least ten different effects, fire and energy among them, both along rows and down reels', () => {
    const els = new Set(lanes.flatMap((p) => p.scene.fx.filter((l) => l.effect === 'lane.run').map((l) => String(l.params.element))));
    expect(els.size).toBeGreaterThanOrEqual(10);
    expect(els.has('fire')).toBe(true); expect(els.has('energy')).toBe(true);
    const dirs = new Set(lanes.flatMap((p) => p.scene.fx.filter((l) => l.effect === 'lane.run').map((l) => String(l.params.along))));
    expect([...dirs].some((d) => d.startsWith('row'))).toBe(true); expect([...dirs].some((d) => d.startsWith('reel'))).toBe(true);
  });

  it('are valid, have unique ids, every effect they use exists and is aimed at the board', () => {
    const ids = new Set<string>();
    for (const p of [...spin, ...symbols, ...lanes]) {
      expect(ids.has(p.id), `${p.id} is unique`).toBe(false); ids.add(p.id);
      const r = validatePreset(JSON.parse(JSON.stringify(p)));
      expect(r.errors, p.id).toEqual([]);
      const els = new Set(p.scene.elements.map((e) => e.id));
      for (const l of p.scene.fx) { expect(effectById(l.effect), `${p.id} ${l.effect}`).toBeTruthy(); if (l.target) expect(els.has(l.target), `${p.id} target`).toBe(true); }
      expect(p.scene.elements.some((e) => e.kind === 'board'), `${p.id} has a board`).toBe(true);
    }
  });
});

describe('lightning ribbons', () => {
  it('a ribbon with the default arguments is the same as before (the extra arguments only widen or soften it when asked)', () => {
    const pts = [{ x: 0, y: 0 }, { x: 0.1, y: 0.02 }, { x: 0.2, y: -0.01 }, { x: 0.3, y: 0.03 }];
    const a: number[] = [], b: number[] = [], w: number[] = [], z: number[] = [];
    ribbon(a, pts, 0.004, 1, true, true);
    ribbon(b, pts, 0.004, 1, true, true, 0.3, 0.2, 9);
    ribbon(w, pts, 0.004, 1, true, true, 0.3, 0.2, 14);
    ribbon(z, pts, 0.004, 1, true, true, 0, 0.1);
    expect(a).toEqual(b);
    expect(w).not.toEqual(a);
    expect(z).not.toEqual(a);
    expect(z[5]!, 'it fades in from nothing at the root').toBe(0);
  });
});

describe('an expanding wild with an animation of its own', () => {
  const withExpand = (expand: unknown, over: Partial<BoardElement> = {}): BoardElement => boardElement({ id: 'board', params: { pattern: 'expanding-wild', wildReel: 2 }, symbols: defaultBoardSymbols().map((x) => (x.role === 'wild' ? { ...x, expand } as never : x)), ...over });
  const preset = (e: BoardElement, assets: { id: string }[] = []) => {
    const base = JSON.parse(JSON.stringify(builtinPresets().find((p) => p.id === 'symbol-transformation.expanding-wild')!));
    base.scene.elements = [e]; base.scene.fx = []; base.scene.assets = assets;
    return base;
  };

  it('the animation is one of the pictures of the board: it is listed once, loaded, exported and kept in the scene\'s assets', () => {
    const e = withExpand({ asset: 'builtin:wild-fire-column.webm', fit: 'fill', play: 'natural' });
    expect(elementAssets(e)).toContain('builtin:wild-fire-column.webm');
    expect(boardAssets(e)).toContain('builtin:wild-fire-column.webm');
    expect(new Set(boardAssets(e)).size).toBe(boardAssets(e).length);
    expect(sceneAllAssets({ elements: [e], fx: [] } as never)).toContain('builtin:wild-fire-column.webm');
    expect(elementAssets(withExpand(undefined))).not.toContain('builtin:wild-fire-column.webm');
  });

  it('the expansion lasts as long as the setting says (0.2 to 4 seconds), and the events follow', () => {
    for (const [time, want] of [[undefined, 0.55], [1.9, 1.9], [0.01, 0.2], [30, 4]] as const) {
      const e = withExpand({ asset: 'builtin:wild-fire-column.webm', fit: 'fill', play: 'natural' }, { params: { pattern: 'expanding-wild', wildReel: 2, ...(time === undefined ? {} : { expandTime: time }) } });
      const plan = planBoard(e), ev = boardInfo(e, plan, 16 / 9).events.find((x) => x.kind === 'expand')!;
      expect(plan.expand!.dur).toBeCloseTo(want, 6);
      expect((ev as unknown as { until: number }).until - ev.t).toBeCloseTo(want, 6);
    }
  });

  it('a preset with an animation is valid; an unknown picture is an error; a bad fit or play falls back; a symbol that is not a wild only gets a warning', () => {
    const ok = validatePreset(preset(withExpand({ asset: 'builtin:wild-fire-column.webm', fit: 'fill', play: 'fit' })));
    expect(ok.errors).toEqual([]);
    const bad = validatePreset(preset(withExpand({ asset: 'asset-nothere', fit: 'fill', play: 'fit' })));
    expect(bad.errors.join(' ')).toMatch(/expand\.asset.*not listed/);
    const odd = preset(withExpand({ asset: 'builtin:wild-fire-column.webm', fit: 'sideways', play: 'sometimes' }));
    const ro = validatePreset(odd);
    expect(ro.errors).toEqual([]);
    const sym = (ro.preset!.scene.elements[0] as BoardElement).symbols.find((x) => x.role === 'wild')!;
    expect(sym.expand).toEqual({ asset: 'builtin:wild-fire-column.webm', fit: 'grow', play: 'natural' });
    const notWild = preset(boardElement({ id: 'board', symbols: defaultBoardSymbols().map((x) => (x.role === 'normal' ? { ...x, expand: { asset: 'builtin:wild-fire-column.webm', fit: 'fill', play: 'fit' } } as never : x)) }));
    const r = validatePreset(notWild);
    expect(r.errors).toEqual([]);
    expect(r.warnings.join(' ')).toMatch(/only a wild expands/);
    const junk = preset(withExpand('nonsense'));
    const rj = validatePreset(junk);
    expect(rj.errors).toEqual([]);
    expect(rj.warnings.join(' ')).toMatch(/expand: invalid; ignored/);
    expect((rj.preset!.scene.elements[0] as BoardElement).symbols.some((x) => x.expand)).toBe(false);
  });

  it('the copy for an AI tells what plays while the wild expands', () => {
    const p = JSON.parse(JSON.stringify(builtinPresets().find((x) => x.id === 'symbol-transformation.expwild-fire')!));
    expect(copyForAi(p)).toMatch(/while it expands it plays `builtin:wild-fire-column.webm`, filling the whole reel from the start, at its own speed/);
  });

  it('the animations that ship are real files, the presets use them, and their expansion time matches the animation', () => {
    expect(BUILTIN_EXPANSIONS.length).toBeGreaterThanOrEqual(4);
    for (const b of BUILTIN_EXPANSIONS) { expect(b.id).toMatch(/^builtin:.+\.webm$/); expect(existsSync(`assets/showcase/expansions/${b.id.slice(8)}`), b.id).toBe(true); }
    const ids = new Set(BUILTIN_EXPANSIONS.map((b) => b.id));
    const wilds = builtinPresets().filter((p) => p.group === 'Expanding wilds with animation');
    expect(wilds.length).toBeGreaterThanOrEqual(8);
    for (const p of wilds) {
      const b = p.scene.elements[0] as BoardElement, w = b.symbols.find((x) => x.role === 'wild')!;
      expect(ids.has(w.expand!.asset), p.id).toBe(true);
      expect(w.expand!.fit, p.id).toBe('fill');
      expect(Number(b.params.expandTime), p.id).toBeGreaterThan(0.5);
      expect(validatePreset(JSON.parse(JSON.stringify(p))).errors, p.id).toEqual([]);
    }
    expect(new Set(wilds.map((p) => (p.scene.elements[0] as BoardElement).symbols.find((x) => x.role === 'wild')!.expand!.asset)).size).toBeGreaterThanOrEqual(4);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// Round three: reference text styles, plates, classic counters, calm motions, shapes, cascades, screen impacts

import { MOTIONS, motionDef } from '../src/vfx/anim/motions';
import { STYLE_PRESETS } from '../src/vfx/style/textStyle';
import { SHAPES } from '../src/vfx/player/shapes';
import FONT_CATALOG from '../src/vfx/fonts/catalog.json';

const presetsIn = (group: string) => builtinPresets().filter((p) => p.group === group);
const ids3 = (list: { id: string }[]) => list.map((x) => x.id);

describe('text styles from the references', () => {
  const NEW = ['ornate-gold', 'ornate-silver', 'ornate-ruby', 'ornate-emerald', 'ornate-sapphire', 'ornate-digits', 'carved-gold', 'carved-silver', 'carved-jade', 'slime-graffiti', 'steel-badge', 'steel-badge-red', 'steel-badge-gold', 'violet-metal', 'cyan-metal', 'gold-metal', 'slab-white', 'slab-yellow', 'slab-cyan'];
  const families = new Set((FONT_CATALOG as unknown as { families?: { id: string }[] }).families?.map((f) => f.id) ?? (FONT_CATALOG as unknown as { id: string }[]).map((f) => f.id));
  it('are all there, once each, in a licensed font the catalogue has, and each has a preset', () => {
    const have = STYLE_PRESETS.map((s) => s.id);
    for (const id of NEW) { expect(have, id).toContain(id); expect(builtinPresets().some((p) => p.id === `text-styling.${id}`), `preset for ${id}`).toBe(true); }
    expect(new Set(have).size).toBe(have.length);
    for (const id of NEW) expect(families.has(STYLE_PRESETS.find((s) => s.id === id)!.style.font.id), `${id} font`).toBe(true);
  });
  it('keep the glow small, so the lettering stays crisp on a dark plate', () => {
    for (const id of NEW.filter((x) => /^(ornate|carved|steel|violet|cyan|gold-metal)/.test(x))) { const g = STYLE_PRESETS.find((s) => s.id === id)!.style.glow; expect(g.radius, id).toBeLessThanOrEqual(0.1); expect(g.strength, id).toBeLessThanOrEqual(0.25); }
  });
});

describe('shapes: shield, slab and pennant', () => {
  it('are listed with defaults, accepted by validation and drawn as a path (checked in the browser run)', () => {
    for (const id of ['shield', 'slab', 'pennant'] as const) {
      const d = SHAPES.find((x) => x.id === id)!;
      expect(d, id).toBeTruthy();
      expect(d.defaults.width, id).toBeGreaterThan(0); expect(d.defaults.height, id).toBeGreaterThan(0);
    }
    const p = builtinPresets().find((x) => x.id === 'messages.max-win-crimson')!;
    expect(p.scene.elements.some((e) => e.kind === 'shape' && e.shape === 'pennant')).toBe(true);
    expect(validatePreset(JSON.parse(JSON.stringify(p))).errors).toEqual([]);
  });
});

describe('plates and amount counters', () => {
  const plates = presetsIn('Plates like the references');
  it('there are the crests, shields, plates and slabs, each valid with a title that can be edited', () => {
    expect(plates.length).toBeGreaterThanOrEqual(12);
    for (const slug of ['max-win-crimson', 'big-win-shield', 'mega-win-violet', 'nice-win-slab']) expect(plates.some((p) => p.id === `messages.${slug}`), slug).toBe(true);
    for (const p of plates) { expect(validatePreset(JSON.parse(JSON.stringify(p))).errors, p.id).toEqual([]); expect(p.inputs.some((i) => i.element === 'title'), p.id).toBe(true); }
  });
  const counters = presetsIn('Classic amounts');
  it('there are at least a dozen classic counters; every one counts up to its figure and is valid', () => {
    expect(counters.length).toBeGreaterThanOrEqual(12);
    for (const p of counters) {
      expect(validatePreset(JSON.parse(JSON.stringify(p))).errors, p.id).toEqual([]);
      const c = p.scene.elements.find((e) => e.kind === 'counter');
      expect(c, p.id).toBeTruthy();
    }
    const euro = counters.find((p) => p.id === 'counters.amount-euro')!.scene.elements.find((e) => e.kind === 'counter') as unknown as { prefix: string; group: string; decimalMark: string };
    expect([euro.prefix, euro.group, euro.decimalMark]).toEqual(['€', '.', ',']);
  });
});

describe('calm motions and the text animations that use them', () => {
  const CALM = ['drift-fade', 'tracking-in', 'soft-scale', 'focus-in', 'letter-reveal', 'settle-drop', 'alternate-slide', 'light-up', 'unfold-down', 'drift-fade-out', 'tracking-out', 'soft-scale-out', 'sink-fade', 'letter-fade-out', 'nudge', 'glint-pass', 'settle-bob', 'slow-glow', 'drift'];
  it('are all in the registry, once, and quiet: nothing ever travels or turns far', () => {
    expect(new Set(MOTIONS.map((m) => m.id)).size).toBe(MOTIONS.length);
    for (const id of CALM) {
      const m = motionDef(id);
      const ctx = (u: number) => ({ i: 2, n: 5, rx: 0.4, ry: 0, edge: { l: 3, r: 3, t: 2, b: 2 }, amount: 1, params: { ...(m.defaults.params ?? {}) }, rnd: () => 0.5 }) as never;
      let reach = 0;
      for (let u = 0; u <= 1.0001; u += 0.05) { const c = m.eval(u, ctx(u)); for (const v of [c.dx, c.dy, c.sx - 1, c.sy - 1, c.rot, c.alpha, c.bright, c.glow]) expect(Number.isFinite(v), `${id} @${u}`).toBe(true); reach = Math.max(reach, Math.abs(c.dx), Math.abs(c.dy), Math.abs(c.rot) * 4); }
      expect(reach, `${id} reach`).toBeLessThan(1.3);
    }
  });
  it('entrances end at rest and exits end gone', () => {
    for (const id of CALM.filter((x) => motionDef(x).slots.includes('entrance'))) { const c = motionDef(id).eval(1, { i: 0, n: 1, rx: 0, ry: 0, edge: { l: 3, r: 3, t: 2, b: 2 }, amount: 1, params: { ...(motionDef(id).defaults.params ?? {}) }, rnd: () => 0.5 } as never); expect(Math.abs(c.dx) + Math.abs(c.dy) + Math.abs(c.sx - 1) + Math.abs(c.sy - 1), `${id} rest`).toBeLessThan(0.03); expect(c.alpha, `${id} visible`).toBeGreaterThan(0.97); }
    for (const id of CALM.filter((x) => motionDef(x).slots.includes('exit'))) expect(motionDef(id).eval(1, { i: 0, n: 1, rx: 0, ry: 0, edge: { l: 3, r: 3, t: 2, b: 2 }, amount: 1, params: { ...(motionDef(id).defaults.params ?? {}) }, rnd: () => 0.5 } as never).alpha, `${id} gone`).toBeLessThan(0.05);
  });
  it('there are at least fifteen calm presets, valid, each with an entrance and an exit', () => {
    const calm = presetsIn('Calm and clean: for messages and titles');
    expect(calm.length).toBeGreaterThanOrEqual(15);
    for (const p of calm) { expect(validatePreset(JSON.parse(JSON.stringify(p))).errors, p.id).toEqual([]); const t = p.scene.elements.find((e) => e.kind === 'text')!; expect(t.motion.entrance, p.id).toBeTruthy(); expect(t.motion.exit, p.id).toBeTruthy(); }
  });
});

describe('multipliers: medallions, jewels, shields, slabs and builds', () => {
  it('there are at least twenty new ones in the groups, valid, each with an editable multiplier', () => {
    const list = [...presetsIn('Medallions, jewels and shields'), ...presetsIn('Builds and steps')];
    expect(list.length).toBeGreaterThanOrEqual(20);
    for (const p of list) { expect(validatePreset(JSON.parse(JSON.stringify(p))).errors, p.id).toEqual([]); expect(p.inputs.length, p.id).toBeGreaterThan(0); expect(p.category).toBe('multipliers'); }
  });
});

describe('cascades', () => {
  const casc = presetsIn('Cascades and tumbles');
  it('there are at least twelve, each a board that tumbles, valid, with the bursts aimed at it', () => {
    expect(casc.length).toBeGreaterThanOrEqual(12);
    expect(new Set(casc.map((p) => p.id)).size).toBe(casc.length);
    for (const p of casc) {
      expect(validatePreset(JSON.parse(JSON.stringify(p))).errors, p.id).toEqual([]);
      const b = p.scene.elements.find((e) => e.kind === 'board') as BoardElement;
      expect(planBoard(b).tumbles.length, p.id).toBeGreaterThanOrEqual(2);
      expect(p.scene.fx.some((l) => l.effect === 'cascade.burst' && l.target === b.id), p.id).toBe(true);
    }
  });
  it('a multiplier and a running win that follow the board\'s own wins: one of each per win, timed to it', () => {
    const p = casc.find((x) => x.id === 'symbol-transformation.cascade-light')!, b = p.scene.elements.find((e) => e.kind === 'board') as BoardElement, plan = planBoard(b);
    const wins = plan.events.filter((e) => e.kind === 'win');
    expect(wins.length).toBeGreaterThanOrEqual(3);
    for (let i = 0; i < wins.length; i++) {
      const m = p.scene.elements.find((e) => e.id === `m${i}`)!, t = p.scene.elements.find((e) => e.id === `t${i}`)!;
      expect(m.start, `m${i}`).toBeCloseTo(wins[i]!.t - 0.02, 6);
      expect(t.start, `t${i}`).toBeCloseTo(wins[i]!.t - 0.02, 6);
    }
    const last = p.scene.elements.find((e) => e.id === `t${wins.length - 1}`) as unknown as { to: number };
    expect(last.to).toBeGreaterThan(25);
  });
  it('cascade.burst draws for every style, finite, glows before the pop and is empty at its end', () => {
    const be = boardElement({ id: 'board', params: { spin: 'classic', startAt: 0.15, spinTime: 0.8, stagger: 0.12, pattern: 'cascade', tumbles: 3, line: 'row-mid', winCount: 4 } }), c = ctxFor(be);
    const fx = effectById('cascade.burst')!, styles = enumValues(fx, 'style');
    expect(styles.length).toBeGreaterThanOrEqual(8);
    const pop = c.board!.events.find((x) => x.kind === 'pop')!, win = c.board!.events.find((x) => x.kind === 'win')!;
    expect(size(build('cascade.burst', win.t + 0.5, { duration: 14, warn: 1 }, c)), 'glow before the pop').toBeGreaterThan(0);
    expect(size(build('cascade.burst', win.t + 0.5, { duration: 14, warn: 0 }, c)), 'no glow when switched off').toBe(0);
    for (const style of styles) {
      let any = 0;
      for (const dt of [0.05, 0.2, 0.4, 0.7, 0.95]) { const f = build('cascade.burst', pop.t + dt, { style, duration: 14, warn: 0 }, c); any += size(f); finite(f, `${style} @${dt}`); }
      expect(any, style).toBeGreaterThan(0);
      expect(size(build('cascade.burst', 14.01, { style, duration: 14 }, c)), `${style} after its end`).toBe(0);
    }
  });
});

describe('screen impacts and board shakes', () => {
  const SCREEN = ['impact.thud', 'impact.recoil', 'impact.stomp', 'impact.blast', 'impact.crack', 'impact.thunder', 'impact.storm', 'impact.heartbeat', 'impact.wave'];
  it('every screen impact draws something, finite, keeps the camera covering the frame, and is empty at its end', () => {
    const c = ctxFor(null);
    for (const id of SCREEN) {
      const fx = effectById(id)!, D = fx.duration(defaultsOf(fx));
      let any = 0, zoomOk = true;
      for (let t = 0; t < D; t += 0.05) {
        const f = build(id, t, {}, c); any += size(f) + (f.camera.dx !== 0 || f.camera.dy !== 0 || f.camera.zoom !== 1 || f.distort.length ? 1 : 0); finite(f, `${id} @${t}`);
        const reach = Math.hypot(f.camera.dx, f.camera.dy) + Math.abs(f.camera.rot);
        if (f.camera.zoom - 1 < reach * 1.5 - 1e-9 && reach > 1e-4) zoomOk = false;
      }
      expect(any, `${id} does something`).toBeGreaterThan(0);
      expect(zoomOk, `${id} keeps the picture covering its frame while the camera moves`).toBe(true);
      const f = build(id, D + 0.01, {}, c); expect(size(f) + f.distort.length + (f.camera.dx || f.camera.dy || f.camera.rot ? 1 : 0), `${id} at its end`).toBe(0);
    }
  });
  it('the screen shake and impact library has at least twenty-eight presets, valid, in two groups', () => {
    const shakes = presetsIn('Screen shakes'), impacts = presetsIn('Screen impacts');
    expect(shakes.length).toBeGreaterThanOrEqual(12);
    expect(impacts.length).toBeGreaterThanOrEqual(16);
    for (const p of [...shakes, ...impacts]) { expect(validatePreset(JSON.parse(JSON.stringify(p))).errors, p.id).toEqual([]); expect(p.category).toBe('impacts'); for (const l of p.scene.fx) expect(effectById(l.effect), `${p.id} ${l.effect}`).toBeTruthy(); }
    expect(new Set(ids3([...shakes, ...impacts])).size).toBe(shakes.length + impacts.length);
  });
  it('the board shake has eight kinds and each moves the grid differently, finite, and settles to rest', () => {
    const fx = effectById('board.shake')!, kinds = enumValues(fx, 'mode');
    expect(kinds.length).toBe(8);
    const c = ctxFor(make()), sig = new Set<string>();
    for (const mode of kinds) {
      const p = { ...defaultsOf(fx), mode, duration: 3 };
      const track: number[] = [];
      for (let t = 0; t < 3; t += 0.04) { const m = fx.boardMod!(t, p, c)!; for (const v of Object.values(m)) for (const q of Array.isArray(v) ? v : [v]) expect(Number.isFinite(q as number), `${mode} @${t}`).toBe(true); track.push(m.dx ?? 0, m.dy ?? 0, m.rot ?? 0, m.scale ?? 1, m.bright ?? 1); }
      sig.add(track.map((v) => v.toFixed(4)).join(','));
      const end = fx.boardMod!(3.0, p, c)!;
      expect(Math.abs(end.dx ?? 0) + Math.abs(end.dy ?? 0) + Math.abs(end.rot ?? 0) + Math.abs((end.scale ?? 1) - 1), `${mode} rests at the end`).toBeLessThan(0.02);
    }
    expect(sig.size, 'every kind is different').toBe(kinds.length);
  });
});
