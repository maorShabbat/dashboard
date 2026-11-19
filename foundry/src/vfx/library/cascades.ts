/** Cascades: the winners burst, new symbols fall into the gaps and win again, with a multiplier that climbs and a running win, each timed to the board's own win events. */
import type { Preset } from '../model/preset';
import { planBoard } from '../model/board';
import { type BoardElement, type SceneElement } from '../model/scene';
import { C, F, S, T, counterIn, mo, motion, ts } from './kit';
import { look, vert } from './plates';
import { reelPreset } from './reels';

const GROUP = 'Cascades and tumbles';
type Over = Record<string, number | string | boolean>;

interface Hud { ring: [string, string, string]; edge: string; disc: [string, string]; key: string; text: string; total: string }
const HUDS: Record<string, Hud> = {
  gold: { ring: ['#fff0a0', '#e8a21a', '#7a4306'], edge: '#3f1d03', disc: ['#4a2a86', '#1c0b3d'], key: '#ffd24a', text: 'carved-gold', total: 'carved-gold' },
  steel: { ring: ['#ffffff', '#a9b8ca', '#56667c'], edge: '#0a1018', disc: ['#1c2a3e', '#070e1a'], key: '#cfe0f4', text: 'steel-badge', total: 'carved-silver' },
  ruby: { ring: ['#ffb0b0', '#e01a34', '#6a0010'], edge: '#2a0006', disc: ['#3a0a14', '#12030a'], key: '#ffd070', text: 'ornate-ruby', total: 'carved-gold' },
  jade: { ring: ['#d8ffd0', '#26c860', '#0a5a28'], edge: '#021a0a', disc: ['#0a3a22', '#031a0e'], key: '#f4d06a', text: 'ornate-emerald', total: 'carved-jade' },
  violet: { ring: ['#f6c8ff', '#a244f4', '#3a0f8a'], edge: '#0e0422', disc: ['#2a0a5a', '#0e0422'], key: '#e6b4ff', text: 'violet-metal', total: 'carved-silver' },
};

interface Cas {
  slug: string; name: string; desc: string; style: string; tint: string; tint2: string; tumbles: number; hud?: keyof typeof HUDS | null;
  mult?: number[]; board?: Over; fx?: (id: string, end: number) => ReturnType<typeof F>[]; tags?: string[]; base?: number; spin?: Over; cols?: number; rows?: number; cell?: number;
  burst?: Over; line?: number;
}

function cascade(o: Cas): Preset {
  const { slug, name, desc } = o;
  const spin: Over = { spin: 'classic', startAt: 0.15, spinTime: 0.8, stagger: 0.12, brake: 0.4, pattern: 'cascade', tumbles: o.tumbles, line: 'row-mid', winCount: o.line ?? 4, winStyle: 'bounce', ...(o.spin ?? {}) };
  const p = reelPreset(slug, name, desc, { ...spin, ...(o.board ?? {}) }, {
    cat: 'symbol-transformation', group: GROUP, board: { y: 0.54 }, cols: o.cols, rows: o.rows, cell: o.cell, tags: ['cascade', 'tumble', ...(o.tags ?? [])],
    fx: (id, end) => [
      F('burst', 'cascade.burst', 0, { duration: end, style: o.style, tint: o.tint, tint2: o.tint2, ...(o.burst ?? {}) }, { target: id }),
      F('winline', 'board.winline', 0, { duration: end, tint: o.tint, connect: 'rings' }, { target: id }),
      ...(o.fx?.(id, end) ?? []),
    ],
  });
  if (!o.hud) return p;
  // the multiplier and the running win follow the board's own wins
  const board = p.scene.elements.find((e) => e.kind === 'board') as BoardElement, plan = planBoard(board);
  const wins = plan.events.filter((e) => e.kind === 'win'), pops = plan.events.filter((e) => e.kind === 'pop');
  const hud = HUDS[o.hud]!, mult = o.mult ?? wins.map((_, i) => i + 1), base = o.base ?? 25;
  const ring = look(vert([[0, hud.ring[0]], [0.5, hud.ring[1]], [1, hud.ring[2]]]), [[0.025, hud.edge]], { slab: hud.edge, depth: 0.03 });
  const disc = look(vert([[0, hud.disc[0]], [1, hud.disc[1]]]), [[0.018, hud.key], [0.03, hud.edge]], { bevel: false, shadow: false });
  const els: SceneElement[] = [];
  const nudges = wins.map((w) => mo.in('nudge', { start: w.t, duration: 0.5, params: { size: 0.07 } }));
  els.push(S('ring', 'badge', ring, { name: 'Multiplier ring', x: 0.072, y: 0.5, width: 0.2, height: 0.2, params: { teeth: 16, depth: 0.05 }, motion: motion({ entrance: mo.in('pop', { start: wins[0]!.t - 0.15, duration: 0.5 }), emphasis: nudges }) }));
  els.push(S('disc', 'circle', disc, { name: 'Multiplier disc', x: 0.072, y: 0.5, width: 0.152, height: 0.152, motion: motion({ entrance: mo.in('pop', { start: wins[0]!.t - 0.1, duration: 0.5 }) }) }));
  let cum = 0;
  wins.forEach((w, i) => {
    const m = mult[Math.min(i, mult.length - 1)]!, add = base * m, from = cum, to = (cum += add), end = wins[i + 1] ? wins[i + 1]!.t - 0.02 : undefined;
    const popAt = (pops[i]?.t ?? w.t + 1) - w.t;
    els.push(T(`m${i}`, `x${m}`, { role: 'multiplier', name: `Multiplier ${i + 1}`, x: 0.072, y: 0.5, size: 0.1, style: ts(hud.text), start: w.t - 0.02, ...(end ? { end } : {}), motion: motion({ entrance: mo.in('pop', { duration: 0.4 }) }) }));
    els.push(C(`t${i}`, { name: `Win ${i + 1}`, x: 0.5, y: 0.965, size: 0.062, from, to, decimals: 2, style: ts(hud.total), roll: 'roll', countStart: popAt, countDuration: 0.9, ease: 'easeOut', landPulse: 0.06, start: w.t - 0.02, ...(end ? { end } : {}), motion: motion({ entrance: mo.in('fade-in', { duration: 0.3 }) }) }));
  });
  p.scene = { ...p.scene, elements: [...p.scene.elements, ...els] };
  p.inputs = [...p.inputs];
  void counterIn;
  return p;
}

export function cascades(): Preset[] {
  const gold = { tint: '#ffe27a', tint2: '#ff9a3a' };
  return [
    cascade({ slug: 'cascade-light', name: 'Cascade: light bursts', desc: 'Winners glow, then burst in light; new symbols drop in with a soft thud and win again, the multiplier medallion climbing and the running win counting up beneath.', style: 'light', ...gold, tumbles: 3, hud: 'gold', tags: ['light'] }),
    cascade({ slug: 'cascade-gems', name: 'Cascade: gem bursts', desc: 'Winners burst into spinning gems that fall away; a steel medallion counts the multiplier up.', style: 'gems', tint: '#ff4a8a', tint2: '#4ad8ff', tumbles: 3, hud: 'steel', tags: ['gems'], burst: { warn: 1.2 } }),
    cascade({ slug: 'cascade-shards', name: 'Cascade: glass shards', desc: 'Winners shatter into shards of glass that tumble and fall.', style: 'shards', tint: '#bfe6ff', tint2: '#4a8aff', tumbles: 3, hud: 'steel', tags: ['glass'] }),
    cascade({ slug: 'cascade-fire', name: 'Cascade: fire pops', desc: 'Winners go up in small fireballs with embers lifting off them; the board takes a darker, hotter look.', style: 'embers', tint: '#ff9a3a', tint2: '#ffd24a', tumbles: 3, hud: 'ruby', tags: ['fire'], board: { winStyle: 'pulse' },
      fx: (id, end) => [F('glow', 'board.glow', 0, { duration: end, texture: 'embers', tint: '#ff7a2a', tint2: '#ffd24a', strength: 0.7 }, { target: id })] }),
    cascade({ slug: 'cascade-frost', name: 'Cascade: ice shatter', desc: 'Winners crack into ice crystals that fall away in a cold glint; a frost rim lights the board.', style: 'frost', tint: '#9ad8ff', tint2: '#e8f8ff', tumbles: 3, hud: 'steel', tags: ['ice'],
      fx: (id, end) => [F('glow', 'board.glow', 0, { duration: end, texture: 'frost', tint: '#8ad8ff', strength: 0.8 }, { target: id })] }),
    cascade({ slug: 'cascade-coins', name: 'Cascade: coin bursts', desc: 'Winners burst into coins that fly up and rain down; the running win counts in gold.', style: 'coins', tint: '#ffe27a', tint2: '#ffb030', tumbles: 3, hud: 'gold', tags: ['coins'] }),
    cascade({ slug: 'cascade-sparkle', name: 'Cascade: sparkle', desc: 'Winners dissolve in twinkling glints: the lightest, quietest tumble.', style: 'sparkle', tint: '#fff3b0', tint2: '#ffd24a', tumbles: 3, hud: 'gold', tags: ['sparkle'], burst: { thump: 0.5 } }),
    cascade({ slug: 'cascade-smoke', name: 'Cascade: smoke puffs', desc: 'Winners go out in puffs of smoke that drift up; new symbols drop through it.', style: 'smoke', tint: '#ffd8a0', tint2: '#ff9a3a', tumbles: 3, hud: 'steel', tags: ['smoke'] }),
    cascade({ slug: 'cascade-long', name: 'Cascade: a long chain', desc: 'Four tumbles in a row with the multiplier climbing x1, x2, x3, x5; each burst is bigger than the last.', style: 'light', ...gold, tumbles: 4, hud: 'gold', mult: [1, 2, 3, 5], tags: ['long'], burst: { strength: 1.2 } }),
    cascade({ slug: 'cascade-dropin-gems', name: 'Cascade: drop-in reels', desc: 'The first fill drops in from above, then the chain runs with gem bursts and a violet medallion.', style: 'gems', tint: '#c88aff', tint2: '#ff8ad8', tumbles: 3, hud: 'violet', spin: { spin: 'drop', stagger: 0.14 }, tags: ['drop'] }),
    cascade({ slug: 'cascade-big', name: 'Cascade: a bigger board', desc: 'A six-by-five board tumbles with light bursts and a jade medallion.', style: 'light', tint: '#9affb0', tint2: '#e8ffd8', tumbles: 3, hud: 'jade', cols: 6, rows: 5, cell: 0.15, line: 5, tags: ['big'] }),
    cascade({ slug: 'cascade-heavy', name: 'Cascade: heavy', desc: 'A hard-hitting chain: strong thuds on every landing, bigger bursts and a screen shake as each win pops.', style: 'shards', tint: '#ffd24a', tint2: '#ff7a2a', tumbles: 3, hud: 'ruby', tags: ['heavy'], burst: { thump: 2.2, strength: 1.3 },
      fx: (id, end) => [F('shake', 'board.shake', 0, { duration: end, mode: 'rumble', strength: 0.5 }, { target: id })] }),
    cascade({ slug: 'cascade-plain', name: 'Cascade: no counters', desc: 'The chain on its own, with light bursts and nothing else on screen: for laying over your own interface.', style: 'light', ...gold, tumbles: 3, hud: null, tags: ['plain'] }),
  ];
}
