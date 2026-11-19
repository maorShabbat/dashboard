/** Reel boards: spin styles, anticipation, wins, wilds, bonus tiles and tumbles, on a grid of symbols. */
import type { Preset, CategoryId } from '../model/preset';
import type { BoardElement, Params } from '../model/scene';
import { boardElement, defaultBoardSymbols } from '../model/scene';
import { planBoard } from '../model/board';
import { F, preset, scene } from './kit';

type Fx = ReturnType<typeof F>;
export interface ReelOpts { cat: CategoryId; group: string; cols?: number; rows?: number; cell?: number; fx?: (boardId: string, end: number, stopEnd: number) => Fx[]; tags?: string[]; board?: Partial<BoardElement> }

export function reelPreset(slug: string, name: string, description: string, params: Params, o: ReelOpts): Preset {
  const cols = o.cols ?? 5, rows = o.rows ?? 3;
  const el = boardElement({ id: 'board', name: 'Reels', cols, rows, cell: o.cell ?? (rows >= 4 ? 0.19 : 0.235), gap: 0.07, symbols: defaultBoardSymbols(), frame: 'builtin:tile-dark', panel: 'builtin:reel-panel', y: 0.5, params, ...o.board });
  const plan = planBoard(el);
  const end = Math.ceil((plan.end + 0.6) * 10) / 10;
  return preset(o.cat, slug, name, description, scene([el], o.fx?.('board', end, plan.stopEnd) ?? [], { hold: 0.4 }), { tags: ['reels', 'board', ...(o.tags ?? [])], group: o.group });
}

const SPINS = 'Reel spins';
export function reelSpins(): Preset[] {
  const c: ReelOpts = { cat: 'symbol-transformation', group: SPINS };
  return [
    reelPreset('spin-classic', 'Classic reels', 'Five reels scroll down with motion blur, stop one after another with a springy bounce, and a line of matching symbols wins.', { spin: 'classic' }, c),
    reelPreset('spin-drum', 'Drum reels', 'The reels are drums: symbols roll over a turning cylinder, shrinking and darkening toward the top and bottom, then settle flat.', { spin: 'drum', speed: 11, stagger: 0.32 }, c),
    reelPreset('spin-turbo', 'Turbo spin', 'A fast spin: long streaks, short stagger and a hard stop with only a tiny bounce.', { spin: 'turbo', spinTime: 0.7, stagger: 0.14, bounce: 0.2, blur: 1.2 }, c),
    reelPreset('spin-drop', 'Drop-in reels', 'The symbols fall out of the bottom and a new set drops in from above, column by column, bouncing as they land.', { spin: 'drop', stagger: 0.18 }, c),
    reelPreset('spin-pop', 'Pop-in reels', 'Every symbol shrinks away and a new one springs in with an elastic pop, rolling across the board from left to right.', { spin: 'pop', stagger: 0.25 }, c),
    reelPreset('spin-heavy-bounce', 'Heavy bounce', 'Classic reels with a big overshoot: each reel slams past its stop and swings back.', { spin: 'classic', bounce: 1, brake: 0.7, stagger: 0.35 }, c),
    reelPreset('spin-six-by-four', 'Six reels, four rows', 'A bigger board, six reels by four rows, with a V-shaped win line.', { spin: 'classic', line: 'v', winCount: 5, stagger: 0.22 }, { ...c, cols: 6, rows: 4 }),
    reelPreset('spin-no-win', 'Spin with no win', 'The reels stop on a losing board and just rest: nothing lights up.', { spin: 'classic', pattern: 'spin-only' }, c),
  ];
}

const aim = (id: string) => ({ target: id });
/** The effects most board presets share, sized to the board's whole sequence. */
const fxSet = (id: string, end: number, which: ('landing' | 'anticipation' | 'winline' | 'sticky' | 'expand' | 'collect' | 'tumble' | 'streaks')[], over: Record<string, Record<string, number | string | boolean>> = {}): Fx[] => {
  const ids: Record<string, string> = { landing: 'board.landing', anticipation: 'board.anticipation', winline: 'board.winline', sticky: 'board.sticky', expand: 'board.expand', collect: 'board.collect', tumble: 'board.tumble', streaks: 'board.streaks' };
  return which.map((w) => F(w, ids[w]!, 0, { duration: end, ...(over[w] ?? {}) }, aim(id)));
};

export function reelFeatures(): Preset[] {
  const sp: ReelOpts = { cat: 'symbol-transformation', group: 'Special symbols' };
  const im: ReelOpts = { cat: 'impacts', group: 'Reel landings' };
  const sh: ReelOpts = { cat: 'shine', group: 'Win lines and spotlights' };
  const board = { y: 0.56 };
  return [
    reelPreset('scatter-trigger', 'Scatter trigger', 'Two scatters land, the remaining reels slow down and burn with anticipation, the third scatter slams in and the three light up.', { pattern: 'scatter-trigger', specials: 3 },
      { ...sp, board, fx: (id, end) => fxSet(id, end, ['anticipation', 'landing', 'winline', 'streaks'], { winline: { connect: 'rings' } }) }),
    reelPreset('expanding-wild', 'Expanding wild', 'A wild lands on the middle reel, glows, stretches over the whole reel with a rush of light, and completes a five-of-a-kind line.', { pattern: 'expanding-wild', wildReel: 2 },
      { ...sp, board, fx: (id, end) => fxSet(id, end, ['landing', 'expand', 'winline', 'streaks']) }),
    reelPreset('sticky-wilds', 'Sticky wilds', 'Wild symbols land and stay, each wrapped in a living green aura, while a line wins through them.', { pattern: 'sticky-wilds', specials: 2 },
      { ...sp, board, fx: (id, end) => fxSet(id, end, ['landing', 'sticky', 'winline']) }),
    reelPreset('bonus-tiles', 'Bonus tiles', 'Bonus tiles land and lock with a violet aura; then a comet flies from each one into the meter at the top.', { pattern: 'bonus-tiles', specials: 5 },
      { ...sp, board, fx: (id, end) => fxSet(id, end, ['landing', 'sticky', 'collect'], { sticky: { roles: 'bonus' }, collect: { meterX: 0.5, meterY: 0.07 } }) }),
    reelPreset('cascade-tumble', 'Cascade and tumble', 'A line wins, the winners pop in bursts of light, the symbols above fall into the gaps with a bounce, and the new board wins again.', { pattern: 'cascade', tumbles: 2, spin: 'classic' },
      { ...sp, board, fx: (id, end) => fxSet(id, end, ['winline', 'tumble']) }),
    reelPreset('cascade-drop', 'Cascade with drop-in reels', 'The same chain of wins on a board whose first fill also drops in from above.', { pattern: 'cascade', tumbles: 3, spin: 'drop', stagger: 0.16 },
      { ...sp, board, fx: (id, end) => fxSet(id, end, ['winline', 'tumble']) }),
    reelPreset('landing-scatter', 'Scatter landing', 'Each scatter slams into its cell with a golden ring, a flash, sparks and a jolt of the whole picture.', { pattern: 'scatter-trigger', specials: 3, anticipation: false },
      { ...im, board, fx: (id, end) => fxSet(id, end, ['landing'], { landing: { which: 'specials', shake: 1.4 } }) }),
    reelPreset('landing-wild', 'Wild landing', 'The wild lands with a green shockwave ring and sparks.', { pattern: 'expanding-wild' },
      { ...im, board, fx: (id, end) => fxSet(id, end, ['landing']) }),
    reelPreset('landing-every-stop', 'Every reel thuds', 'Each reel stops with a puff of dust and a small jolt; special symbols get the full impact.', { pattern: 'scatter-trigger', specials: 3, stagger: 0.35 },
      { ...im, board, fx: (id, end) => fxSet(id, end, ['landing', 'streaks'], { landing: { which: 'all', shake: 1 } }) }),
    reelPreset('anticipation-near-miss', 'Near miss', 'Two scatters land, the last reels slow and burn with anticipation, and the third scatter does not come.', { pattern: 'scatter-trigger', specials: 2 },
      { ...im, board, fx: (id, end) => fxSet(id, end, ['anticipation', 'landing']) }),
    reelPreset('anticipation-blue', 'Anticipation, cold flame', 'Anticipation in blue flame with an icy glow.', { pattern: 'scatter-trigger', specials: 3 },
      { ...im, board, fx: (id, end) => fxSet(id, end, ['anticipation', 'landing', 'winline'], { anticipation: { fire: 'blue', tint: '#8ac8ff' }, winline: { tint: '#bfe6ff', connect: 'rings' } }) }),
    reelPreset('win-line-row', 'Win line: middle row', 'A glowing line is drawn through four matching symbols while the rest of the board dims and the winners hop.', { line: 'row-mid', winCount: 4 },
      { ...sh, board, fx: (id, end) => fxSet(id, end, ['winline']) }),
    reelPreset('win-line-v', 'Win line: V shape', 'A V-shaped line down and up through five matching symbols, with a bright head racing along it.', { line: 'v', winCount: 5, winStyle: 'pulse' },
      { ...sh, board, fx: (id, end) => fxSet(id, end, ['winline'], { winline: { tint: '#7ad8ff' } }) }),
    reelPreset('win-line-diagonal', 'Win line: diagonal', 'A diagonal win, with the symbols pulsing in gold.', { line: 'diag-down', winCount: 3, winStyle: 'glow' },
      { ...sh, board, fx: (id, end) => fxSet(id, end, ['winline']) }),
    reelPreset('win-line-zigzag', 'Win line: zigzag', 'A zigzag line winning across the board, the symbols shaking.', { line: 'zigzag', winCount: 5, winStyle: 'shake' },
      { ...sh, board, fx: (id, end) => fxSet(id, end, ['winline'], { winline: { tint: '#ff9ad8', width: 1.3 } }) }),
    reelPreset('win-line-inverted-v', 'Win line: inverted V', 'A roof-shaped line over the board, pulsing in violet.', { line: 'inverted-v', winCount: 5, winStyle: 'pulse' },
      { ...sh, board, fx: (id, end) => fxSet(id, end, ['winline'], { winline: { tint: '#c8a0ff' } }) }),
    reelPreset('win-spotlight-dim', 'Spotlight: dim the rest', 'Everything but the winners goes nearly dark and the winners glow, with no line.', { line: 'row-bottom', winCount: 3, winStyle: 'glow', dim: 0.9 },
      { ...sh, board, fx: (id, end) => fxSet(id, end, ['winline'], { winline: { connect: 'rings', strength: 1.3 } }) }),
    reelPreset('win-line-big-board', 'Win line on a big board', 'A six-by-four board with a diagonal win across it.', { line: 'diag-down', winCount: 4, winStyle: 'bounce' },
      { ...sh, cols: 6, rows: 4, board, fx: (id, end) => fxSet(id, end, ['winline']) }),
  ];
}
