import { describe, expect, it } from 'vitest';
import { defaultsOf, type BoardInfo, type EffectCtx } from '../src/vfx/fx/effect';
import { EFFECTS, effectById } from '../src/vfx/fx';
import { emptyFrame, type Frame } from '../src/vfx/engine/frame';
import { BOARD_PARAMS, boardAssets, boardDefaults, dropTime, dropY, normalSymbols, planBoard, reelScroll, stripSymbol } from '../src/vfx/model/board';
import { boardElement, defaultBoardSymbols, elementAssets, sceneAllAssets, type BoardElement } from '../src/vfx/model/scene';
import { boardInfo } from '../src/vfx/model/boardinfo';
import { builtinPresets } from '../src/vfx/library';
import { validatePreset } from '../src/vfx/model/validate';
import { BUILTIN_BACKGROUNDS, BUILTIN_EXPANSIONS, BUILTIN_ICONS } from '../src/vfx/app/builtins';

const board = (params: Record<string, number | string | boolean> = {}, over: Partial<BoardElement> = {}): BoardElement => boardElement({ id: 'b', params, ...over });
const kinds = (e: BoardElement) => planBoard(e).events.map((x) => x.kind);

describe('the board plan', () => {
  it('is deterministic and finite', () => {
    const a = planBoard(board()), b = planBoard(board());
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(Number.isFinite(a.end) && a.end > a.stopEnd).toBe(true);
    for (const r of a.reels) for (const v of [r.start, r.stop, r.brakeAt, r.pBrake, r.pEnd, r.v]) expect(Number.isFinite(v)).toBe(true);
  });

  it('stops the reels one after another, left to right, and sorts its events by time', () => {
    const p = planBoard(board({ stagger: 0.3 }));
    const stops = p.events.filter((e) => e.kind === 'reel-stop');
    expect(stops.map((e) => e.reel)).toEqual([0, 1, 2, 3, 4]);
    for (let i = 1; i < stops.length; i++) expect(stops[i]!.t).toBeGreaterThan(stops[i - 1]!.t);
    for (let i = 1; i < p.events.length; i++) expect(p.events[i]!.t).toBeGreaterThanOrEqual(p.events[i - 1]!.t);
    expect(Math.max(...stops.map((e) => e.t))).toBeCloseTo(p.stopEnd, 6);
  });

  it('a scrolling reel starts at 0, ends on a whole number of cells, and overshoots only while braking', () => {
    const p = planBoard(board({ spin: 'classic', bounce: 1, brake: 0.7 }));
    for (const r of p.reels) {
      expect(reelScroll(r, 0)).toBe(0);
      expect(Number.isInteger(r.pEnd)).toBe(true);
      expect(reelScroll(r, r.stop + 5)).toBe(r.pEnd);
      expect(reelScroll(r, r.brakeAt - 0.01)).toBeLessThan(r.pBrake + 1e-6);
      let max = 0; for (let t = r.brakeAt; t <= r.stop; t += 0.005) max = Math.max(max, reelScroll(r, t));
      expect(max, 'a bounce goes past the stop').toBeGreaterThan(r.pEnd);
      expect(max - r.pEnd, 'but not by more than a cell').toBeLessThan(1);
    }
    const none = planBoard(board({ bounce: 0 }));
    for (const r of none.reels) { let max = 0; for (let t = r.brakeAt; t <= r.stop; t += 0.005) max = Math.max(max, reelScroll(r, t)); expect(max).toBeLessThanOrEqual(r.pEnd + 1e-6); }
  });

  it('all five spin styles plan and finish', () => {
    for (const spin of ['classic', 'drum', 'turbo', 'drop', 'pop']) {
      const p = planBoard(board({ spin }));
      expect(p.style).toBe(spin);
      expect(p.end).toBeGreaterThan(0.5);
      expect(kinds(board({ spin }))).toContain('reel-stop');
    }
    expect(planBoard(board({ spin: 'turbo' })).reels[0]!.v, 'turbo scrolls faster').toBeGreaterThan(planBoard(board({ spin: 'classic' })).reels[0]!.v);
  });

  it('a line win marks exactly the symbols asked for, on the line asked for', () => {
    for (const [line, count] of [['row-mid', 4], ['v', 5], ['diag-down', 3], ['zigzag', 5]] as const) {
      const p = planBoard(board({ line, winCount: count }));
      expect(p.win, line).toBeTruthy();
      expect(p.win!.cells.length).toBe(count);
      const sym = p.layout[p.win!.cells[0]![0]]![p.win!.cells[0]![1]]!;
      for (const [r, c] of p.win!.cells) expect(p.layout[r]![c]).toBe(sym);
      expect(p.win!.cells.map(([, c]) => c)).toEqual(Array.from({ length: count }, (_, i) => i));
      expect(kinds(board({ line, winCount: count }))).toContain('win');
    }
    const lose = planBoard(board({ pattern: 'spin-only' }));
    expect(lose.win).toBeNull();
    expect(kinds(board({ pattern: 'spin-only' }))).not.toContain('win');
  });

  it('two scatters make the remaining reels slow down, and the third lands on the last reel it can', () => {
    const e = board({ pattern: 'scatter-trigger', specials: 3 });
    const p = planBoard(e);
    const scat = e.symbols.findIndex((s) => s.role === 'scatter');
    let n = 0; for (const row of p.layout) for (const s of row) if (s === scat) n++;
    expect(n).toBeGreaterThanOrEqual(3);
    expect(p.events.some((x) => x.kind === 'anticipation')).toBe(true);
    expect(p.reels.some((r) => r.slow)).toBe(true);
    const off = planBoard(board({ pattern: 'scatter-trigger', specials: 3, anticipation: false }));
    expect(off.events.some((x) => x.kind === 'anticipation')).toBe(false);
    expect(off.reels.some((r) => r.slow)).toBe(false);
    expect(off.stopEnd).toBeLessThan(p.stopEnd);
  });

  it('an expanding wild covers its whole reel', () => {
    const p = planBoard(board({ pattern: 'expanding-wild', wildReel: 3 }));
    expect(p.expand).toBeTruthy();
    expect(p.expand!.reel).toBe(3);
    expect(p.events.some((x) => x.kind === 'expand' && x.reel === 3)).toBe(true);
    expect(p.win, 'the wild completes a line').toBeTruthy();
  });

  it('a cascade pops the winners and drops what is above into the gaps, as many times as asked', () => {
    for (const tumbles of [1, 2, 3]) {
      const p = planBoard(board({ pattern: 'cascade', tumbles, spin: 'classic' }));
      expect(p.tumbles.length).toBe(tumbles);
      for (const st of p.tumbles) {
        expect(st.popAt).toBeGreaterThanOrEqual(st.winAt);
        expect(st.dropAt).toBeGreaterThanOrEqual(st.popAt);
        expect(st.settleAt).toBeGreaterThan(st.dropAt);
        expect(st.cells.length).toBeGreaterThan(0);
        for (const f of st.falls) { expect(f.to).toBeGreaterThan(f.from); expect(f.to).toBeLessThan(p.rows); }
        expect(st.after.length).toBe(p.rows);
      }
      expect(kinds(board({ pattern: 'cascade', tumbles }))).toEqual(expect.arrayContaining(['pop', 'drop']));
    }
  });

  it('bonus tiles lock and are collected one at a time', () => {
    const p = planBoard(board({ pattern: 'bonus-tiles', specials: 5 }));
    expect(p.locked.length).toBeGreaterThanOrEqual(5);
    expect(p.collect).toBeTruthy();
    const col = p.events.filter((e) => e.kind === 'collect');
    expect(col.length).toBe(p.collect!.cells.length);
    for (let i = 1; i < col.length; i++) expect(col[i]!.t - col[i - 1]!.t).toBeCloseTo(p.collect!.gap, 6);
  });

  it('a different grid, symbol list or seed gives a different board; sizes are respected', () => {
    const big = planBoard(board({}, { cols: 6, rows: 4 }));
    expect(big.cols).toBe(6); expect(big.rows).toBe(4);
    expect(big.layout.length).toBe(4); expect(big.layout[0]!.length).toBe(6);
    expect(planBoard(board({ seed: 9 })).layout).not.toEqual(planBoard(board({ seed: 3 })).layout);
  });

  it('the strip a scrolling reel shows ends on the planned result', () => {
    const e = board(), p = planBoard(e), norm = normalSymbols(e);
    for (let c = 0; c < p.cols; c++) for (let r = 0; r < p.rows; r++) expect(stripSymbol(p, norm, 7, c, p.reels[c]!.pEnd - r)).toBe(p.layout[r]![c]);
  });

  it('every board symbol, tile and panel is listed as an asset, once', () => {
    const e = board({}, { frame: 'builtin:tile-dark', panel: 'builtin:reel-panel' });
    const a = boardAssets(e);
    expect(a).toEqual([...new Set(a)]);
    expect(a).toEqual(expect.arrayContaining(['builtin:cherry', 'builtin:tile-dark', 'builtin:reel-panel']));
    expect(elementAssets(e).sort()).toEqual([...a].sort());
    const up = board({}, { symbols: [{ asset: 'abc123', name: 'mine', role: 'normal' }, { asset: 'builtin:bell', name: 'bell', role: 'normal' }] });
    expect(sceneAllAssets({ elements: [up], fx: [] } as never)).toContain('abc123');
  });

  it('drops fall with gravity, bounce less each time, and come to rest', () => {
    expect(dropY(0, -2, 1, 0.3)).toBe(-2);
    let prev = -2; for (let t = 0.01; t < 0.2; t += 0.01) { const y = dropY(t, -2, 1, 0.3); expect(y).toBeGreaterThanOrEqual(prev); prev = y; }
    const T = dropTime(-2, 1, 0.3);
    expect(dropY(T + 0.5, -2, 1, 0.3)).toBe(1);
    let top = Infinity; for (let t = 0.2; t < T; t += 0.004) top = Math.min(top, 1 - dropY(t, -2, 1, 0.3));
    expect(top, 'never below the floor').toBeGreaterThanOrEqual(-1e-6);
    expect(dropTime(-2, 1, 0.6)).toBeGreaterThan(dropTime(-2, 1, 0.1));
  });
});

const ctxFor = (e: BoardElement | null, over: Partial<EffectCtx> = {}): EffectCtx => {
  const info: BoardInfo | null = e ? boardInfo(e, planBoard(e), 16 / 9) : null;
  return { aspect: 16 / 9, pxPerUnit: 500, object: null, board: info, start: 0, ...over } as EffectCtx;
};
const build = (id: string, t: number, over: Record<string, number | string | boolean>, c: EffectCtx): Frame => {
  const e = effectById(id)!, f = emptyFrame();
  e.build(f, t, { ...defaultsOf(e), ...over }, c);
  return f;
};
const size = (f: Frame) => f.additive.length + f.polys.length + f.alphaSprites.length + f.vol.length + f.draws.length + f.bolts.length;
const BOARD_EFFECTS = EFFECTS.filter((e) => e.usesBoard);

describe('effects that work on a board', () => {
  it('there are the event effects and the six board-only ones, and each says it works on a board', () => {
    const ids = BOARD_EFFECTS.map((e) => e.id);
    for (const id of ['board.landing', 'board.anticipation', 'board.winline', 'board.sticky', 'board.expand', 'board.collect', 'board.tumble', 'board.streaks', 'board.shake', 'board.zap', 'board.smoke', 'board.frozen', 'board.glow', 'board.theme']) expect(ids).toContain(id);
  });

  it('draw something while they run, nothing at or after their end, and never a bad number', () => {
    const pat: Record<string, Record<string, number | string>> = { 'board.expand': { pattern: 'expanding-wild' }, 'board.tumble': { pattern: 'cascade' }, 'board.sticky': { pattern: 'sticky-wilds' }, 'board.collect': { pattern: 'bonus-tiles' }, 'board.anticipation': { pattern: 'scatter-trigger' }, 'board.landing': { pattern: 'scatter-trigger' }, 'symbol.aura': { pattern: 'sticky-wilds' } };
    for (const fx of BOARD_EFFECTS) {
      const e = board(pat[fx.id] ?? {}), c = ctxFor(e), D = fx.duration({ ...defaultsOf(fx), duration: 12 });
      let any = 0;
      for (let t = 0; t < Math.min(D, 12); t += 0.1) {
        const f = build(fx.id, t, { duration: 12 }, c);
        any += size(f);
        for (const a of f.additive) for (const v of [a.x, a.y, a.hw, a.hh, a.intensity]) expect(Number.isFinite(v), `${fx.id} @${t}`).toBe(true);
        for (const v of f.polys) expect(Number.isFinite(v), `${fx.id} polys @${t}`).toBe(true);
      }
      if (!fx.cellMod) expect(any, `${fx.id} draws something`).toBeGreaterThan(0);   // an effect that only moves the symbols draws nothing of its own
      expect(size(build(fx.id, D + 0.01, { duration: 12 }, c)), `${fx.id} is empty after its end`).toBe(0);
    }
  });

  it('do not fail when they are not aimed at a board (a stand-in grid is used) or at a very small one', () => {
    for (const fx of BOARD_EFFECTS) {
      for (const c of [ctxFor(null), ctxFor(board({}, { cols: 3, rows: 2, cell: 0.1 }))]) for (const t of [0, 0.5, 1.5]) expect(() => build(fx.id, t, {}, c), fx.id).not.toThrow();
    }
  });

  it('the effects that move or colour the grid say how, with finite numbers and a stable result', () => {
    for (const fx of BOARD_EFFECTS.filter((x) => x.boardMod)) {
      const c = ctxFor(board());
      const p = { ...defaultsOf(fx) };
      for (let t = 0; t < 6; t += 0.2) {
        const m = fx.boardMod!(t, p, c);
        if (!m) continue;
        for (const [k, v] of Object.entries(m)) { if (Array.isArray(v)) for (const q of v) expect(Number.isFinite(q), `${fx.id}.${k}`).toBe(true); else expect(Number.isFinite(v as number), `${fx.id}.${k}`).toBe(true); }
        expect(JSON.stringify(fx.boardMod!(t, p, c))).toBe(JSON.stringify(m));
      }
    }
    expect(BOARD_EFFECTS.filter((x) => x.boardMod).map((x) => x.id)).toEqual(expect.arrayContaining(['board.shake', 'board.frozen', 'board.smoke']));
  });

  it('a lower quality tier draws fewer pieces, never none', () => {
    for (const id of ['board.glow', 'board.theme', 'board.smoke']) {
      const e = board(), full = size(build(id, 2, {}, ctxFor(e, { quality: 1 }))), low = size(build(id, 2, {}, ctxFor(e, { quality: 0.4 })));
      expect(low, id).toBeGreaterThan(0);
      expect(low, id).toBeLessThanOrEqual(full);
    }
  });

  it('all twenty glow textures and sixteen themes draw something different', () => {
    const e = board(), c = ctxFor(e), sig = (id: string, o: Record<string, string>) => JSON.stringify([...build(id, 2.3, o, c).additive.slice(0, 40).map((a) => [a.x, a.y, a.hw])]);
    const tex = (effectById('board.glow')!.params.find((p) => p.key === 'texture') as unknown as { options: { value: string }[] }).options.map((o) => o.value);
    expect(tex.length).toBe(20);
    expect(new Set(tex.map((t) => sig('board.glow', { texture: t }))).size).toBe(20);
    const th = (effectById('board.theme')!.params.find((p) => p.key === 'theme') as unknown as { options: { value: string }[] }).options.map((o) => o.value);
    expect(th).toEqual(expect.arrayContaining(['nordic', 'scifi', 'alien', 'mexican', 'inferno', 'cabaret', 'fishing', 'egyptian', 'space', 'haunted', 'festival', 'candy', 'pirate', 'cyberpunk', 'christmas', 'steampunk']));
    expect(th.length).toBe(16);
    expect(new Set(th.map((t) => sig('board.theme', { theme: t }))).size).toBe(th.length);
  });
});

describe('board presets in the library', () => {
  const boards = builtinPresets().filter((p) => p.scene.elements.some((e) => e.kind === 'board'));
  it('there are dozens of them, spread over the groups the person looks for', () => {
    expect(boards.length).toBeGreaterThanOrEqual(55);
    const g = new Set(boards.map((p) => p.group));
    for (const name of ['Reel spins', 'Special symbols', 'Reel landings', 'Win lines and spotlights', 'Board hits', 'Board elements', 'Board glows', 'Board themes']) expect(g.has(name), name).toBe(true);
    expect(boards.filter((p) => p.group === 'Board glows').length).toBe(20);
    expect(boards.filter((p) => p.group === 'Board themes').length).toBe(16);
  });
  it('each one is valid, uses only pictures that exist and aims every board effect at a board', () => {
    const names = new Set([...BUILTIN_ICONS, ...BUILTIN_BACKGROUNDS, ...BUILTIN_EXPANSIONS].map((b) => b.id));
    for (const p of boards) {
      const r = validatePreset(JSON.parse(JSON.stringify(p)));
      expect(r.errors, p.id).toEqual([]);
      for (const a of sceneAllAssets(p.scene)) expect(names.has(a), `${p.id} ${a}`).toBe(true);
      const ids = new Set(p.scene.elements.filter((e) => e.kind === 'board').map((e) => e.id));
      for (const l of p.scene.fx) if (effectById(l.effect)?.usesBoard) expect(ids.has(l.target ?? ''), `${p.id} ${l.effect} target`).toBe(true);
      for (const e of p.scene.elements) if (e.kind === 'board') for (const k of Object.keys(e.params)) expect(BOARD_PARAMS.some((d) => d.key === k), `${p.id} param ${k}`).toBe(true);
    }
  });
  it('a board effect never starts before the grid has settled when it is meant to act on a settled grid', () => {
    for (const p of boards.filter((x) => x.group === 'Board hits' || x.group === 'Board elements' || x.group === 'Board glows')) {
      const el = p.scene.elements.find((e) => e.kind === 'board') as BoardElement;
      const stop = planBoard(el).stopEnd;
      for (const l of p.scene.fx) expect(l.start, p.id).toBeGreaterThanOrEqual(stop - 0.01);
    }
  });
  it('defaults of the board settings are complete and within their own limits', () => {
    const d = boardDefaults();
    for (const p of BOARD_PARAMS) { expect(d[p.key], p.key).toBeDefined(); if (p.kind === 'number') { expect(Number(d[p.key])).toBeGreaterThanOrEqual(p.min); expect(Number(d[p.key])).toBeLessThanOrEqual(p.max); } }
    expect(defaultBoardSymbols().some((s) => s.role === 'wild') && defaultBoardSymbols().some((s) => s.role === 'scatter') && defaultBoardSymbols().some((s) => s.role === 'bonus')).toBe(true);
  });
});
