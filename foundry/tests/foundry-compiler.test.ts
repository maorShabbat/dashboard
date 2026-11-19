import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { isRoundCost, validate, type GameConfig } from '../foundry/compiler/config';
import { compile, mechanicFile, renderGameConfig, renderOptimization, renderReelCsv, renderRun, strip } from '../foundry/compiler/compile';

const load = (): GameConfig => JSON.parse(fs.readFileSync(path.resolve(__dirname, '../foundry/examples/t1-demo.config.json'), 'utf8'));
const errors = (c: GameConfig) => validate(c).filter((i) => i.level === 'error');

describe('T1 config validation', () => {
  it('accepts the demo config', () => {
    expect(errors(load())).toEqual([]);
  });
  it('warns when more scatters award fewer free spins', () => {
    for (const f of fs.readdirSync(path.resolve(__dirname, '../foundry/examples'))) {
      const c = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../foundry/examples', f), 'utf8')) as GameConfig;
      expect(validate(c).filter((i) => i.path.startsWith('freeSpinTriggers')), f).toEqual([]);
    }
    const c = load(); c.freeSpinTriggers.free['9'] = 10;
    expect(validate(c).find((i) => i.path === 'freeSpinTriggers.free')).toMatchObject({ level: 'warning', message: expect.stringContaining('9 scatters award fewer spins (10)') });
  });

  it('enforces the Engine and Foundry limits on RTP, cost, win cap and mode order', () => {
    const c = load();
    c.modes[0].rtp = 0.9669;
    expect(errors(c).some((e) => e.path === 'modes[0].rtp' && /Foundry ceiling/.test(e.message))).toBe(true);
    c.modes[0].rtp = 0.97;
    expect(errors(c).some((e) => /Engine band/.test(e.message))).toBe(true);

    const d = load();
    d.modes[1].cost = 1500;
    expect(errors(d).some((e) => e.path === 'modes[1].cost' && /Foundry limit/.test(e.message))).toBe(true);
    d.modes[1].cost = 2500;
    expect(errors(d).some((e) => /Engine limit/.test(e.message))).toBe(true);

    const m = load();
    m.modes[0].maxWin = 60000;
    expect(errors(m).some((e) => /Foundry limit 50000/.test(e.message))).toBe(true);

    const b = load();
    b.modes.reverse();
    expect(errors(b).some((e) => e.path === 'modes[0]')).toBe(true);
  });

  it('requires round mode costs: whole numbers like 5, 10, 25, 100, 250, 1000, never 5.233, 10.2 or 809', () => {
    for (const ok of [1, 2, 3, 4, 5, 10, 15, 20, 25, 30, 40, 50, 75, 100, 150, 200, 250, 300, 400, 500, 750, 1000, 2000]) expect(isRoundCost(ok), String(ok)).toBe(true);
    for (const bad of [0, 0.5, 1.5, 1.25, 5.233, 10.2, 809, 13, 47, 60, 99, 101, 333, 1234, -5, NaN]) expect(isRoundCost(bad), String(bad)).toBe(false);
    for (const [cost, ok] of [[200, true], [5, true], [1000, true], [5.233, false], [10.2, false], [809, false]] as const) {
      const c = load();
      c.modes[1].cost = cost;
      const hit = errors(c).some((e) => e.path === 'modes[1].cost' && /round number/.test(e.message));
      expect(hit, String(cost)).toBe(!ok);
    }
    const base = load();
    base.modes[0].cost = 1; // the base mode is 1.0x and is exempt from the pattern check (it has its own rule)
    expect(errors(base).some((e) => /round number/.test(e.message))).toBe(false);
  });

  it('keeps quotas, optimiser RTP shares and reel references consistent', () => {
    const q = load();
    q.modes[0].distributions[0].quota = 0.01;
    expect(errors(q).some((e) => /quotas sum/.test(e.message))).toBe(true);

    const o = load();
    o.optimization.base.conditions.basegame.rtp = 0.5;
    expect(errors(o).some((e) => /condition RTPs sum/.test(e.message))).toBe(true);

    const r = load();
    r.modes[0].distributions[1].conditions.reelWeights.base = { NOPE: 1 };
    expect(errors(r).some((e) => /unknown reel set NOPE/.test(e.message))).toBe(true);
  });

  it('warns when the forced win-cap reel set has too few multipliers', () => {
    const c = load();
    expect(validate(c).filter((i) => /multiplier share/.test(i.message))).toEqual([]);
    c.reels.sets.WCAP.M = 2;
    const w = validate(c).filter((i) => i.level === 'warning' && /multiplier share/.test(i.message));
    // one warning per mode that forces a win cap (base and bonus both do)
    expect(w.map((i) => i.path)).toEqual([
      'modes[0].distributions[0].conditions.reelWeights.free',
      'modes[1].distributions[0].conditions.reelWeights.free',
    ]);
  });

  it('checks symbols, paytable shape and spread across modes', () => {
    const s = load();
    s.symbols.wild = 'H1';
    expect(errors(s).some((e) => e.path === 'symbols')).toBe(true);

    const p = load();
    p.paytable.pays.H1 = [3, 2, 15, 60];
    expect(errors(p).some((e) => /non-decreasing/.test(e.message))).toBe(true);

    const g = load();
    g.paytable.tiers[1] = [10, 11];
    expect(errors(g).some((e) => /contiguous/.test(e.message))).toBe(true);

    const x = load();
    x.modes[1].rtp = 0.95;
    x.optimization.bonus.conditions.freegame.rtp = 0.949;
    expect(errors(x).some((e) => e.path === 'modes' && /spread/.test(e.message))).toBe(true);

    const id = load();
    id.id = '../evil';
    expect(errors(id).some((e) => e.path === 'id')).toBe(true);
  });
});

describe('T1 rendering', () => {
  it('renders Python that carries the config values', () => {
    const c = load();
    const gc = renderGameConfig(c);
    expect(gc).toContain('self.game_id = "foundry_t1_demo"');
    expect(gc).toContain('self.rtp = 0.962');
    expect(gc).toContain('t1, t2, t3, t4 = (8, 8), (9, 10), (11, 13), (14, 36)');
    expect(gc).toContain('(t4, "H1"): 60.0,');
    expect(gc).toContain('"wild": ["W"]');
    expect(gc).toContain('cost=200,');
    expect(gc).toContain('win_criteria=5000.0,');
    expect(gc).toContain('"scatter_triggers": {5: 2},');
    expect(gc).toContain('self.freegame_type: {"FR0": 1, "WCAP": 5},');
    expect(gc).toContain('"mult_values"');
    const opt = renderOptimization(c);
    expect(opt).toContain('"freegame": ConstructConditions(rtp=0.372, hr=200, search_conditions={"symbol": "scatter"})');
    expect(opt).toContain('"win_range": (1, 2)');
    expect(opt).toContain('applied_criteria=["basegame"]');
    const run = renderRun(c);
    expect(run).toContain('"base": 10000,');
    expect(run).toContain('target_modes = ["base", "bonus"]');
  });

  it('parameterises exactly the two mechanic spots and fails loudly if the sample changed', () => {
    const c = load();
    c.scatterRule.spinsPerScatter = 3;
    c.limits.maxEventsPerRound = 777;
    const exec = fs.readFileSync(path.resolve(__dirname, '../foundry/compiler/mechanics/t1/game_executables.py'), 'utf8');
    expect(mechanicFile('game_executables.py', exec, c)).toContain('self.fs_award(self.count_special_symbols(scatter_key))');
    expect(mechanicFile('game_executables.py', exec, c)).toContain('get("extra_spins", 0)');
    expect(mechanicFile('game_executables.py', exec, c)).toContain('get("start_mult", 1)');
    const gs = fs.readFileSync(path.resolve(__dirname, '../foundry/compiler/mechanics/t1/gamestate.py'), 'utf8');
    expect(mechanicFile('gamestate.py', gs, c)).toContain('len(self.book.events) > 777');
    expect(() => mechanicFile('gamestate.py', 'nothing here', c)).toThrow(/expected exactly one/);
  });

  it('generates reel strips with exact length, all symbols present and a stable result', () => {
    const c = load();
    const csv = renderReelCsv(c.reels.sets.BR0, c, 0);
    const rows = csv.trim().split('\n').map((r) => r.split(','));
    expect(rows).toHaveLength(c.reels.rows);
    expect(rows.every((r) => r.length === c.board.reels)).toBe(true);
    const col0 = rows.map((r) => r[0]);
    for (const sym of Object.keys(c.reels.sets.BR0)) expect(col0).toContain(sym);
    expect(renderReelCsv(c.reels.sets.BR0, c, 0)).toBe(csv);
    expect(renderReelCsv(c.reels.sets.BR0, c, 1)).not.toBe(csv);
    const counts = strip({ A: 1, B: 1, C: 1 }, 10, () => 0.5);
    expect(counts).toHaveLength(10);
  });

  it('compile() writes the package and a manifest, refuses an invalid config', () => {
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'foundry-'));
    const { dir, files } = compile(load(), out);
    for (const f of ['game_config.py', 'game_optimization.py', 'run.py', 'gamestate.py', 'reels/BR0.csv', 'reels/FR0.csv', 'reels/WCAP.csv', 'MECHANICS_NOTICE.md']) {
      expect(fs.existsSync(path.join(dir, f))).toBe(true);
    }
    const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'build-manifest.json'), 'utf8'));
    expect(manifest.mathSdkCommit).toMatch(/^a6dccd86/);
    expect(Object.keys(manifest.files)).toEqual(Object.keys(files));
    // deterministic: same config, same hashes
    const again = compile(load(), fs.mkdtempSync(path.join(os.tmpdir(), 'foundry-')));
    expect(again.files).toEqual(files);
    const bad = load();
    bad.modes[0].rtp = 0.99;
    expect(() => compile(bad, out)).toThrow(/config invalid/);
  });
});

import { RESTRICTED, scanRestricted, toSocial } from '../foundry/compiler/social';
import { buildSocialStrings, buildStrings, DISCLAIMER, restrictedHits } from '../foundry/compiler/rules';

describe('social wording', () => {
  it('replaces restricted terms with the Engine table, longest phrase first, keeping case', () => {
    expect(toSocial('Place your bets')).toBe('Come and play');
    expect(toSocial('Total bet and bet')).toBe('Total play and play');
    expect(toSocial('Bonus buy costs money')).toBe('Bonus costs coins');
    expect(toSocial('Buy bonus now')).toBe('Get bonus now');
    expect(toSocial('Win feature pays out')).toBe('Play feature won');
    expect(toSocial('BET')).toBe('PLAY');
  });
  it('matches whole words only, so "better" or "payline" is not touched', () => {
    expect(scanRestricted('A better payline')).toEqual([]);
    expect(scanRestricted('Cash and credit')).toEqual(expect.arrayContaining(['cash', 'credit']));
  });
  it('covers every term of the Engine table', () => {
    for (const [term] of RESTRICTED) expect(scanRestricted(term)).toContain(term);
    expect(RESTRICTED.length).toBeGreaterThanOrEqual(30);
  });
});

describe('generated rules text', () => {
  it('states RTP, max win, mode cost, free game, retrigger and the disclaimer; numbers match the config', () => {
    const c = load();
    const s = buildStrings(c);
    expect(s['rules.rtpValue']).toBe(96.2);
    expect(s['rules.maxWinValue']).toBe(5000);
    expect(String(s['rules.mode.bonus.description'])).toContain('Costs 200x the bet');
    expect(String(s['rules.mode.bonus.description'])).toContain('with 4, 5 or 6 S symbols');
    expect(String(s['rules.scatter'])).toContain('3 or more S');
    expect(String(s['rules.scatter'])).toContain('2 free spins');
    expect(String(s['rules.retrigger'])).toContain('2 = +3');
    expect(String(s['rules.retrigger'])).toContain('8 = +18, 9 = +20, 10 = +22'); // more scatters never give fewer spins
    expect(String(s['rules.pay.H1'])).toContain('14-36 = 60x');
    expect(s['rules.disclaimer']).toBe(DISCLAIMER);
    expect(Object.keys(s).filter((k) => k.startsWith('rules.pay.'))).toHaveLength(c.symbols.paying.length);
  });
  it('section headings are keyed and the social variant rewords them', () => {
    const c = load();
    const en = buildStrings(c);
    const sw = buildSocialStrings(en, c);
    expect(en['rules.heading.pays']).toBe('Pays');
    expect(sw['rules.heading.pays']).toBe('Wins');
    for (const k of ['modes', 'return', 'pays', 'features', 'guide', 'disclaimer']) expect(en[`rules.heading.${k}`]).toBeTruthy();
  });
  it('the social variant has no restricted term anywhere while the English one does', () => {
    const s = buildStrings(load());
    expect(restrictedHits(s).length).toBeGreaterThan(0);
    expect(restrictedHits(buildSocialStrings(s))).toEqual([]);
  });
  it('uses hand-written social wording where a mechanical swap reads badly', () => {
    const c = load();
    const sw = buildSocialStrings(buildStrings(c), c);
    expect(sw['rules.maxWinStop']).toBe('When the maximum win is reached the round ends immediately and the win is awarded.');
    expect(String(sw['rules.mode.bonus.description'])).toContain('Costs 200x the play amount');
    expect(sw['rules.mode.bonus.name']).toBe('Bonus');
    expect(String(sw['ui.guide'])).not.toMatch(/place the play/i);
    expect(sw['rules.maxWin']).toBe('Base game: maximum win 5000x the play amount. Bonus: maximum win 5000x the play amount.');
    expect(String(sw['rules.paytableHeader'])).toContain('as a multiple of the play amount');
    expect(restrictedHits(sw)).toEqual([]);
  });
  it('no longer warns about trigger thresholds: the scatter table decides the free spins', () => {
    expect(validate(load()).filter((i) => /trigger threshold/.test(i.message))).toEqual([]);
  });
  it('compile() emits strings, rules and AI instructions', () => {
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'foundry-'));
    const { dir } = compile(load(), out);
    for (const f of ['strings/en.json', 'strings/sweeps_en.json', 'RULES.md', 'AI_INSTRUCTIONS.md']) expect(fs.existsSync(path.join(dir, f))).toBe(true);
    const ai = fs.readFileSync(path.join(dir, 'AI_INSTRUCTIONS.md'), 'utf8');
    expect(ai).toContain('never after a zero win');
    expect(ai).toContain('Frozen');
    const social = JSON.parse(fs.readFileSync(path.join(dir, 'strings/sweeps_en.json'), 'utf8'));
    expect(restrictedHits(social)).toEqual([]);
  });
});
