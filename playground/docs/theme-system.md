# Theme system

## Assets

Three kinds of asset live in the library. All share one lifecycle: create · duplicate · rename · describe · favourite · edit · **save version** · **approve** · restore.

| Asset | Contains |
|---|---|
| **Theme** | Token overrides (colour roles, typography, surface, outline, depth, motion, intensity & safety, board, layers, asset roles, sound cues), per-effect defaults, art-direction notes |
| **Effect preset** | One effect type + overrides on top of a theme (linked) or on top of a frozen copy of one (snapshot) |
| **Sequence** | Tracks of clips (each an effect or preset + instance overrides), event/cue markers, and the sample scene (board, win pattern, amount) it replays against |

A *draft* is what you edit. A *version* is an immutable snapshot of the draft (`v1`, `v2`, …) with a note and a content hash. Any version can be **approved**; exports prefer the approved version of each asset, and a release export can *require* it. Restoring a version replaces the draft (undoable).

## Inheritance

```
BANGERS defaults  →  game theme  →  effect preset  →  instance override (sequence clip)
```

* **Tokens** (colours, type, surface, …) are layer 1 (defaults) and layer 2 (the theme).
* **Effect parameters** resolve through all four layers. The theme can set defaults for an effect type (**Theme → Effect defaults**), a preset overrides those, a clip overrides the preset.
* Every parameter row shows its **source badge** (DEFAULT / THEME / PRESET / INSTANCE), highlights when it is overridden *at the level being edited*, says what it overrides (`overrides BANGERS default: 3200 ms`) and has a ⟲ button that restores the inherited value. Groups and whole levels have bulk resets ("Reset all to theme").
* **Semantic references.** Colour (and a few size) parameters can point at a token instead of holding a literal. `symbolHighlight.color` defaults to `→ color.win`: change the `win` role once and every effect that references it follows. Any layer may replace a reference with a literal or a different reference.
* Out-of-range values are clamped and flagged; unknown keys and invalid references are dropped.

### Linked vs snapshot presets

* **Linked**: the preset resolves against its theme's *current* content, so theme edits flow through.
* **Snapshot**: the preset carries a frozen copy of the theme (draft or approved version) it was taken from; later theme edits do not affect it, including its preview stage. The panel shows how many differences exist between the snapshot and the theme's current draft, and offers *Relink* or *Refresh snapshot*.
* Deleting a theme converts presets linked to it into snapshots, so nothing silently changes.

## The description is documentation, not behaviour

A theme's description and art-direction notes (summary, mood words, references, do/don't) explain intent to people. **The renderer never reads them.** All visuals come from the explicit, bounded parameters; "motion personality" buttons only write explicit numbers (easing, overshoot, duration/stagger scale, anticipation) and the sheet shows those numbers. A unit test and a browser test assert that editing descriptions leaves every pixel unchanged. Art direction is carried into bundle READMEs, labelled documentation-only.

## Units and board-aware sizing

Lengths are **% of one board cell** (`cell%`), so a theme looks proportionate on 3×3 mobile and 7×7 desktop boards. The layout derives the cell size from the board shape, the viewport and the theme's `board.gap` / `board.padding`. Other units: `ms`, `deg`, `hz`, `x` (multiplier), `ratio`, `dB`, `semitones`, `count`, `%`. Typography sizes are cell-relative too, with a `type.minSizePx` legibility floor. The Preview sheet renders one theme at four viewports and three board shapes, with cell sizes.

## Effects

Twelve required effects, each deterministic (a pure function of parameters, seed and time) and each fully configurable through theme defaults, presets and instance overrides:

`symbolHighlight` · `winLine` · `coinBurst` · `bigWinBanner` · `screenShake` · `flash` · `shockwave` · `cascadeDrop` · `multiplierPop` · `anticipationGlow` · `shine` · `textCallout`

Effective intensity = `intensity.master` × the effect family's intensity (`shake`, `flash`, `particles`, `glow`, `text`, `motion`) × the effect's own `intensity`, × a win-tier factor for banners, × `intensity.reducedMotion` when the host requests reduced motion. `safety.maxFlashHz` and `safety.maxFlashAlpha` cap strobing and full-screen flash opacity. See [`parameters.md`](parameters.md) for all 200 tokens and 180 effect parameters.

A "no dead controls" test mutates every effect parameter and requires the rendered output to change, so an exposed parameter always does something.

## Layers

Seven render layers (`backdrop`, `board`, `fxBelow`, `symbols`, `fxAbove`, `overlay`, `ui`). Each effect chooses its layer and blend; the theme sets per-layer `visible`, `opacity`, `blend`, draw order (`z`) and whether screen shake moves it. The preview has separate, non-persistent **eye / solo / opacity** controls for inspection.

## Sequences

* **Overlap** is free: clips on any track may overlap and are shaded where they do; *Chain with overlap %* arranges selected clips (0 % back-to-back, 50 % half-overlapped, negative = gap).
* **Stagger**: *Stagger selected* spaces starts evenly; a clip's **repeat** makes N instances (forward / reverse / centre-out / seeded random) with their own random seeds. The theme's `motion.staggerScale` multiplies every stagger.
* **Markers**: *event* markers are delivered to the game (`onEvent`), *cue* markers trigger named sounds (`onCue`), *label* markers annotate. Effects also carry default cue markers that presets and clips can replace.
* **Replay and scrubbing**: a frame is a pure function of time, so scrubbing and replay are exact. Scrubbing is silent; playback fires each cue/event exactly once; looping replays them.
* Track mute / solo / lock; drag to move (10 ms snap + neighbour magnets), drag the right edge to resize (writes a `duration` override), Shift/Ctrl-click multi-select, Del, Ctrl+D, ←/→ nudge, `M` adds a marker, click the ruler to scrub.

## Sound cues

16 semantic cues (`win.big`, `coin.burst`, `cascade.pop`, …). The theme maps each to an optional audio asset plus gain (dB), pitch (semitones) and an enable switch. Without an asset the studio plays a tiny synthesised blip so timing can be auditioned; in your game, `onCue` hands you the resolved routing.

## Bundles

`Bundle → Build & verify` (or `bangers export-starter`) produces a ZIP:

```
manifest.json            versions, files + SHA-256, licences, omitted items, recorded replay fingerprints
config/library.json      theme + presets + sequences (the whole inheritance chain)
config/tokens.json  config/theme.css      flat resolved tokens for DOM/CSS styling
runtime/bangers-runtime.js  (+ .d.ts)     zero-dependency ES module
assets/  fonts/          only files whose licence permits redistribution
licenses/  LICENSES.md   licence texts and attributions
examples/web  examples/node  examples/dom-css   working integrations
README.md  checksums.sha256
```

The manifest records `bundleVersion`, `schemaVersion`, `packageVersion` and `runtimeVersion`. The bundle is byte-for-byte reproducible for identical input.

**Fonts and assets.** A font file or asset is included only if its declared licence says it may be redistributed. Built-in fonts are SIL OFL 1.1 and ship with their full licence text and copyright line. Imported files must be declared on upload (the default is *not declared → not bundled*, and the form never carries a licence over from the previous file). Restricted fonts are referenced by family name with a fallback stack and listed under **omitted**, with the reason, in the manifest, `LICENSES.md`, the README and the UI. Bundled font files must really be fonts (magic-byte check); SVGs with scripts are rejected.

**Verification** (`verifyBundle`, run automatically after export and before any import) checks, in order: archive integrity and path safety → version compatibility → every file's SHA-256 and no unlisted files → required files → licences recorded as redistributable → font files genuine → assets well-formed and safe → configuration valid (bounds, references, all 12 effects recorded) → **imports the bundle into a fresh project without loss** → **replays it through the studio core** → **replays it through the bundle's own shipped runtime**. Replay compares SHA-256 fingerprints of the rendered display list (9 frames × desktop and mobile viewports for every sequence, plus every preset and every required effect resolved through the theme) and the cue/event log. Tampering with config, runtime, fonts or licences is detected even if checksums are refreshed.

### Integrating

```js
import { loadBundle, prepareBundle, createBundlePlayer } from './runtime/bangers-runtime.js';

const bundle = await loadBundle('/path/to/bundle/');
const prepared = await prepareBundle(bundle);                   // fonts, images, cue audio
const player = await createBundlePlayer({
  bundle, prepared, canvas, sequence: 'seq_big_win', reducedMotion: userPrefersReducedMotion,
  onCue: (cue) => prepared.audio?.play(cue),                    // gain / pitch / asset applied
  onEvent: (e) => { if (e.name === 'celebration.end') unlockSpin(); },
});
player.replay();                                                // play() pause() seek(ms) loop speed
```

`node examples/node/replay.mjs` replays and verifies headlessly; `examples/web/` is a runnable player (serve the folder over HTTP); `examples/dom-css/` styles DOM from `config/theme.css`.

## Importing untrusted files

Theme files, backups and bundles are re-validated against the same parameter definitions as the UI: unknown keys dropped, numbers clamped, bad references removed, ids remapped (an import never overwrites), checksums enforced, SVG scripts, oversized and mislabelled media rejected, ZIP traversal / zip-bomb / ZIP64 / encrypted entries rejected, and newer schemas refused.

## Extending

Add an effect by writing an `EffectDef` (parameters with defaults/bounds/units, default cue markers, a pure `evaluate`) and registering it in `src/core/effects/registry.ts`. The editor UI, theme defaults, presets, bundle replay, the parameter reference and the test sweeps (bounds, determinism, no dead parameters, docs drift) pick it up automatically. Bump `RUNTIME_VERSION` when behaviour changes, so older bundles are reported as recorded with a different runtime.

## Known limits

* Symbols are procedural placeholders (eight shapes tinted by colour roles). Your game draws its own symbols; effects need only cell geometry.
* Text sizing avoids `measureText` so fingerprints are identical everywhere: plates estimate width from character count and rely on `maxWidth` squeezing for long strings.
* Fingerprints cover the display list, not rasterised pixels, so they prove *what is drawn*, not anti-aliasing on a given GPU. Browser tests additionally check real canvas pixels.
* The library is stored in the browser (IndexedDB). There is no server or multi-user sync; use theme files, project backups or bundles to share. Backups hold metadata only; media files stay in browser storage unless exported inside a theme file or bundle.
* Audio preview uses a built-in synth unless an audio asset is assigned; hosts own real audio playback.
* The CI workflow in `.github/workflows/ci.yml` has not been executed on GitHub from this environment; the same commands were run locally.
