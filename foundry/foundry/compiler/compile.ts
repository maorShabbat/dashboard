// Foundry compiler, math side (T1): canonical config -> a Math SDK game package.
// Usage: node <bundled compile.mjs> <config.json> <outDir>   (see package.json script `foundry:compile`)
import { allFeatures, lowestPayingSymbol, migrateFeatures } from './features';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { hasTumbles } from './features';
import { spinTable, validate, type GameConfig, type Mode, type OptMode } from './config';
import { buildSocialStrings, buildStrings, renderRulesMarkdown, restrictedHits } from './rules';
import { renderAiInstructions } from './ai-instructions';
import { mulberry32, strip } from './reels';
export { strip };

const SELF = path.dirname(new URL(import.meta.url).pathname);
// Bundled runs (.cache/foundry/compile.mjs) look for the mechanics next to the sources.
const HERE = fs.existsSync(path.join(SELF, 'mechanics')) ? SELF : path.resolve(process.cwd(), 'foundry/compiler');
export const SDK_COMMIT = 'a6dccd86de740cc5d318079483cb6204cc5c19bc';

// ---------- small Python literal emitter ----------
function pyNum(n: number): string {
  return String(n);
}
/** Float literal (3 -> 3.0) where the SDK sample uses floats: paytable values, win caps, win criteria. */
const pyF = (n: number): string => (Number.isInteger(n) ? n.toFixed(1) : String(n));
function py(v: unknown, tupleKeys = false): string {
  if (v === null || v === undefined) return 'None';
  if (typeof v === 'boolean') return v ? 'True' : 'False';
  if (typeof v === 'number') return pyNum(v);
  if (typeof v === 'string') return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map((x) => py(x)).join(', ')}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.entries(o).map(([k, x]) => `${/^-?\d+$/.test(k) ? k : JSON.stringify(k)}: ${py(x)}`).join(', ')}}`;
}
const tuple2 = (a: [number, number]) => `(${a[0]}, ${a[1]})`;
const typeKey = (g: 'base' | 'free') => (g === 'base' ? 'self.basegame_type' : 'self.freegame_type');

function groupDict(d: { base?: Record<string, number>; free?: Record<string, number> }, ind: string): string {
  const parts = (['base', 'free'] as const).filter((g) => d[g]).map((g) => `${ind}    ${typeKey(g)}: ${py(d[g])},`);
  return `{\n${parts.join('\n')}\n${ind}}`;
}

function renderMode(m: Mode): string {
  const dists = m.distributions.map((d) => {
    const c = d.conditions;
    const lines = [
      `"reel_weights": ${groupDict(c.reelWeights, '                            ')},`,
      `"mult_values": ${groupDict(c.multValues, '                            ')},`,
    ];
    if (c.scatterTriggers) lines.push(`"scatter_triggers": ${py(c.scatterTriggers)},`);
    if (c.startMult !== undefined && c.startMult !== 1) lines.push(`"start_mult": ${py(c.startMult)},`);
    if (c.extraSpins) lines.push(`"extra_spins": ${py(c.extraSpins)},`);
    lines.push(`"force_wincap": ${py(c.forceWincap)},`, `"force_freegame": ${py(c.forceFreegame)},`);
    const win = d.winCriteria !== undefined ? `\n                        win_criteria=${pyF(d.winCriteria)},` : '';
    return `                    Distribution(
                        criteria=${py(d.criteria)},
                        quota=${py(d.quota)},${win}
                        conditions={
${lines.map((l) => '                            ' + l).join('\n')}
                        },
                    ),`;
  });
  return `            BetMode(
                name=${py(m.name)},
                cost=${py(m.cost)},
                rtp=${py(m.rtp)},
                max_win=${py(m.maxWin)},
                auto_close_disabled=False,
                is_feature=${py(m.isFeature)},
                is_buybonus=${py(m.isBuyBonus)},
                distributions=[
${dists.join('\n')}
                ],
            ),`;
}

/** The paylines of a paylines game as the SDK's dictionary (numbered from 1). */
export function paylineBlock(c: GameConfig): string {
  if (c.gameType !== 'paylines') return '';
  const lines = (c.paylines ?? []).map((l, i) => `            ${i + 1}: [${l.join(', ')}],`).join('\n');
  return `        self.paylines = {\n${lines}\n        }\n`;
}

/** The SDK's name for how this game pays. */
export const winType = (c: GameConfig): string => ({ anywhere: 'scatter', cluster: 'cluster', paylines: 'lines', ways: 'ways' } as Record<string, string>)[c.gameType ?? 'anywhere'];

export function renderGameConfig(c: GameConfig): string {
  const payGroup = c.symbols.paying
    .flatMap((sym) => c.paytable.tiers.map((_, i) => `            (t${i + 1}, ${py(sym)}): ${pyF(c.paytable.pays[sym][i])},`))
    .join('\n');
  const tierVars = c.paytable.tiers.map((_, i) => `t${i + 1}`).join(', ');
  const tierVals = c.paytable.tiers.map(tuple2).join(', ');
  const maxWins = Object.fromEntries(c.modes.map((m) => [m.name, m.maxWin]));  // ints, as in the sample
  const reelFiles = Object.keys(c.reels.sets).map((k) => `${JSON.stringify(k)}: ${JSON.stringify(k + '.csv')}`).join(', ');
  const triggers = (g: 'base' | 'free') =>
    `            ${typeKey(g)}: {\n${Object.entries(g === 'base' ? spinTable(c) : c.freeSpinTriggers[g]).map(([k, v]) => `                ${k}: ${v},`).join('\n')}\n            },`;
  return `# Generated by the Slot Foundry compiler from ${c.id} v${c.version}. Do not edit by hand; edit the canonical config and recompile.
import os
from src.config.config import Config
from src.config.distributions import Distribution
from src.config.betmode import BetMode


class GameConfig(Config):
    """Load all game specific parameters and elements"""

    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def __init__(self):
        super().__init__()
        self.game_id = ${py(c.id)}
        self.game_name = ${py(c.name)}
        self.provider_numer = 0
        self.working_name = ${py(c.name)}
        self.wincap = ${pyF(Math.max(...c.modes.map((m) => m.maxWin)))}
        self.win_type = ${py(winType(c))}
        self.rtp = ${py(c.modes[0].rtp)}
        self.construct_paths()

        # Game Dimensions
        self.num_reels = ${c.board.reels}
        self.num_rows = [${c.board.rows}] * self.num_reels
        # Board and Symbol Properties
        ${tierVars} = ${tierVals}
        pay_group = {
${payGroup}
        }
        self.paytable = self.convert_range_table(pay_group)

        self.include_padding = True
        self.special_symbols = {"wild": [${py(c.symbols.wild)}], "scatter": [${py(c.symbols.scatter)}], "multiplier": [${py(c.symbols.multiplier)}]}

        self.freespin_triggers = {
${triggers('base')}
${triggers('free')}
        }
        self.anticipation_triggers = {
            self.basegame_type: min(self.freespin_triggers[self.basegame_type].keys()) - 1,
            self.freegame_type: min(self.freespin_triggers[self.freegame_type].keys()) - 1,
        }
${paylineBlock(c)}        # Reels
        reels = {${reelFiles}}
        self.reels = {}
        for r, f in reels.items():
            self.reels[r] = self.read_reels_csv(os.path.join(self.reels_path, f))

        self.padding_reels[self.basegame_type] = self.reels["BR0"]
        self.padding_reels[self.freegame_type] = self.reels["FR0"]

        mode_maxwins = ${py(maxWins)}

        self.bet_modes = [
${c.modes.map(renderMode).join('\n')}
        ]
`;
}

function renderOpt(o: OptMode): string {
  const conds = Object.entries(o.conditions)
    .map(([k, v]) => {
      const args = [
        v.rtp !== undefined ? `rtp=${py(v.rtp)}` : '',
        v.avWin !== undefined ? `av_win=${py(v.avWin)}` : '',
        v.hr !== undefined ? `hr=${py(v.hr)}` : '',
        v.searchConditions !== undefined ? `search_conditions=${py(v.searchConditions)}` : '',
      ].filter(Boolean);
      return `                    ${JSON.stringify(k)}: ConstructConditions(${args.join(', ')}).return_dict(),`;
    })
    .join('\n');
  const scaling = o.scaling
    .map((s) => `                        {"criteria": ${py(s.criteria)}, "scale_factor": ${py(s.scaleFactor)}, "win_range": ${tuple2(s.winRange)}, "probability": ${py(s.probability)}},`)
    .join('\n');
  const p = o.parameters;
  return `                "conditions": {
${conds}
                },
                "scaling": ConstructScaling(
                    [
${scaling}
                    ]
                ).return_dict(),
                "parameters": ConstructParameters(
                    num_show=${p.numShow}, num_per_fence=${p.numPerFence}, min_m2m=${p.minM2m}, max_m2m=${p.maxM2m}, pmb_rtp=${py(p.pmbRtp)},
                    sim_trials=${p.simTrials}, test_spins=${py(p.testSpins)}, test_weights=${py(p.testWeights)},
                    score_type=${py(p.scoreType)}, max_trial_dist=${p.maxTrialDist},
                ).return_dict(),
                "distribution_bias": ConstructFenceBias(
                    applied_criteria=${py(o.bias.appliedCriteria)},
                    bias_ranges=[${o.bias.biasRanges.map(tuple2).join(', ')}],
                    bias_weights=${py(o.bias.biasWeights)},
                ).return_dict(),`;
}

export function renderOptimization(c: GameConfig): string {
  const modes = c.modes.map((m) => `            ${JSON.stringify(m.name)}: {\n${renderOpt(c.optimization[m.name])}\n            },`).join('\n');
  return `# Generated by the Slot Foundry compiler. Do not edit by hand.
"""Set conditions/parameters for optimization program program"""

from optimization_program.optimization_config import (
    ConstructScaling,
    ConstructParameters,
    ConstructFenceBias,
    ConstructConditions,
    verify_optimization_input,
)


class OptimizationSetup:
    """Handle all game mode optimization parameters."""

    def __init__(self, game_config):
        self.game_config = game_config
        self.game_config.opt_params = {
${modes}
        }

        verify_optimization_input(self.game_config, self.game_config.opt_params)
`;
}

export function renderRun(c: GameConfig): string {
  const books = Object.entries(c.run.books).map(([k, v]) => `        ${JSON.stringify(k)}: ${v},`).join('\n');
  return `# Generated by the Slot Foundry compiler. Do not edit by hand.
"""Main file for generating results for ${c.id}."""

from gamestate import GameState
from game_config import GameConfig
from game_optimization import OptimizationSetup
from optimization_program.run_script import OptimizationExecution
from utils.game_analytics.run_analysis import create_stat_sheet
from utils.rgs_verification import execute_all_tests
from src.state.run_sims import create_books
from src.write_data.write_configs import generate_configs

if __name__ == "__main__":
    num_threads = ${c.run.threads}
    rust_threads = ${c.run.threads}
    batching_size = ${c.run.batch}
    compression = True
    profiling = False

    num_sim_args = {
${books}
    }

    run_conditions = {
        "run_sims": True,
        "run_optimization": True,
        "run_analysis": True,
        "run_format_checks": True,
    }
    target_modes = ${py(c.modes.map((m) => m.name))}

    config = GameConfig()
    gamestate = GameState(config)
    if run_conditions["run_optimization"] or run_conditions["run_analysis"]:
        optimization_setup_class = OptimizationSetup(config)

    if run_conditions["run_sims"]:
        create_books(gamestate, config, num_sim_args, batching_size, num_threads, compression, profiling)

    generate_configs(gamestate)

    if run_conditions["run_optimization"]:
        OptimizationExecution().run_all_modes(config, target_modes, rust_threads)
        generate_configs(gamestate)

    if run_conditions["run_analysis"]:
        custom_keys = [{"symbol": "scatter"}]
        create_stat_sheet(gamestate, custom_keys=custom_keys)

    if run_conditions["run_format_checks"]:
        execute_all_tests(config)
`;
}

// ---------- reels ----------
export function renderReelCsv(weights: Record<string, number>, c: GameConfig, setIndex: number): string {
  const cols = Array.from({ length: c.board.reels }, (_, r) => strip(weights, c.reels.rows, mulberry32(c.reels.seed * 1009 + setIndex * 101 + r)));
  return Array.from({ length: c.reels.rows }, (_, i) => cols.map((col) => col[i]).join(',')).join('\n') + '\n';
}

// ---------- mechanics (copied from the sample, parameterised spots) ----------
function replaceOnce(text: string, from: string, to: string, file: string): string {
  const parts = text.split(from);
  if (parts.length !== 2) throw new Error(`${file}: expected exactly one occurrence of ${JSON.stringify(from)}, found ${parts.length - 1}`);
  return parts.join(to);
}
export function mechanicFile(name: string, text: string, c: GameConfig): string {
  if (name === 'game_executables.py') {
    // Foundry parameters: spins per scatter (compile time), plus the Bonus Buy perks read from the current distribution's conditions at run time.
    // The free spins awarded for a scatter count come from the game's own table (config.freespin_triggers, the largest count not above the scatters landed), plus the Bonus Buy extra spins.
    const perScatter = replaceOnce(text, 'self.count_special_symbols(scatter_key) * 2', `self.fs_award(self.count_special_symbols(scatter_key)) + (\n            int(self.get_current_distribution_conditions().get("extra_spins", 0)) if self.gametype == self.config.basegame_type else 0\n        )`, name);
    return replaceOnce(perScatter, '        self.global_multiplier = 1\n        update_global_mult_event(self)', '        self.global_multiplier = int(self.get_current_distribution_conditions().get("start_mult", 1))  # Foundry: Bonus Buy starting multiplier\n        update_global_mult_event(self)', name);
  }
  if (name === 'foundry_features.py') {
    const lowest = lowestPayingSymbol(c.symbols.paying, Object.fromEntries(c.symbols.paying.map((p) => [p, c.paytable.pays[p]?.[0] ?? Infinity])));
    const py = (v: unknown) => JSON.stringify(v, null, 2).replace(/\btrue\b/g, 'True').replace(/\bfalse\b/g, 'False');
    let t = text;
    t = replaceOnce(t, 'PAYING = []  # Foundry: injected by the compiler (paying symbols, best first)', `PAYING = ${JSON.stringify(c.symbols.paying)}`, name);
    t = replaceOnce(t, 'LOWEST_SYMBOL = ""  # Foundry: injected by the compiler (the paying symbol with the smallest pay)', `LOWEST_SYMBOL = ${JSON.stringify(lowest)}`, name);
    t = replaceOnce(t, 'FEATURES = []  # Foundry: injected by the compiler', `FEATURES = ${py(allFeatures(c))}`, name);
    t = replaceOnce(t, 'SCATTER_PAYS = {}  # Foundry: injected by the compiler (cash for scatters, x bet by count)', `SCATTER_PAYS = ${JSON.stringify(c.scatterRule.pays ?? {})}`, name);
    t = replaceOnce(t, 'EVALUATOR = "scatter"  # Foundry: injected by the compiler (how wins are found)', `EVALUATOR = ${JSON.stringify(c.gameType ?? 'anywhere')}`, name);
    t = replaceOnce(t, 'TUMBLE = False  # Foundry: injected by the compiler (paylines and ways: winning symbols tumble away)', `TUMBLE = ${hasTumbles(c.gameType, c.tumble) ? 'True' : 'False'}`, name);
    return replaceOnce(t, 'REEL_HEIGHTS = None  # Foundry: injected by the compiler (ways: lowest and highest reel height)', `REEL_HEIGHTS = ${c.reelHeights ? `(${c.reelHeights.min}, ${c.reelHeights.max})` : 'None'}`, name);
  }
  if (name === 'gamestate.py') {
    // Enforce the per-round event bound: an over-long round is discarded and redrawn.
    return replaceOnce(
      text,
      '            self.evaluate_finalwin()\n            self.check_repeat()',
      `            self.evaluate_finalwin()\n            if len(self.book.events) > ${c.limits.maxEventsPerRound}:\n                self.repeat = True  # Foundry: limits.maxEventsPerRound\n            self.check_repeat()`,
      name,
    );
  }
  return text;
}

const sha = (s: string | Buffer) => crypto.createHash('sha256').update(s).digest('hex');

export function compile(config: GameConfig, outDir: string): { dir: string; files: Record<string, string> } {
  const c = migrateFeatures(config);
  const issues = validate(c);
  const errors = issues.filter((i) => i.level === 'error');
  if (errors.length) throw new Error('config invalid:\n' + errors.map((e) => `  ${e.path}: ${e.message}`).join('\n'));

  const dir = path.join(outDir, c.id);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(path.join(dir, 'reels'), { recursive: true });
  const files: Record<string, string> = {};
  const put = (rel: string, text: string) => {
    fs.writeFileSync(path.join(dir, rel), text);
    files[rel] = sha(text);
  };
  put('features.json', JSON.stringify(allFeatures(c), null, 2) + '\n');
  put('game_config.py', renderGameConfig(c));
  put('game_optimization.py', renderOptimization(c));
  put('run.py', renderRun(c));
  Object.keys(c.reels.sets).forEach((name, i) => put(`reels/${name}.csv`, renderReelCsv(c.reels.sets[name], c, i)));
  const mdir = path.join(HERE, 'mechanics', 't1');
  for (const f of fs.readdirSync(mdir).filter((n) => n.endsWith('.py')).sort()) {
    put(f, mechanicFile(f, fs.readFileSync(path.join(mdir, f), 'utf8'), c));
  }
  const strings = buildStrings(c);
  const social = buildSocialStrings(strings, c);
  const leftover = restrictedHits(social);
  if (leftover.length) throw new Error('social strings still contain restricted terms: ' + JSON.stringify(leftover));
  fs.mkdirSync(path.join(dir, 'strings'), { recursive: true });
  put('strings/en.json', JSON.stringify(strings, null, 2) + '\n');
  put('strings/sweeps_en.json', JSON.stringify(social, null, 2) + '\n');
  put('RULES.md', renderRulesMarkdown(c, strings));
  put('AI_INSTRUCTIONS.md', renderAiInstructions(c, Object.keys(files)));
  put('MECHANICS_NOTICE.md', fs.readFileSync(path.join(HERE, 'mechanics', 'NOTICE.md'), 'utf8'));
  const manifest = {
    game: c.id,
    configVersion: c.version,
    template: c.template,
    gameType: c.gameType ?? 'anywhere',
    variableHeights: !!c.reelHeights,
    tumble: hasTumbles(c.gameType, c.tumble),
    configSha256: sha(JSON.stringify(c)),
    mathSdkCommit: SDK_COMMIT,
    warnings: issues.filter((i) => i.level === 'warning'),
    files,
  };
  fs.writeFileSync(path.join(dir, 'build-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  return { dir, files };
}

if (process.argv[1] && process.argv[1].endsWith('compile.mjs')) {
  const [cfgPath, outDir] = process.argv.slice(2);
  if (!cfgPath || !outDir) throw new Error('usage: compile <config.json> <outDir>');
  const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8')) as GameConfig;
  const r = compile(cfg, outDir);
  console.log(`compiled ${cfg.id} -> ${r.dir} (${Object.keys(r.files).length} files)`);
}
