# BANGERS

Studio operating repository for BANGERS game development, shared strategy, Stake-native standards, agent roles, permissions, and repeatable production workflows.

## Theme Studio

Themes, effect presets and sequences are editable, versioned, reusable assets. **Theme Studio** is the editor for them, plus a portable bundle format that is verified by importing and replaying it.

| You can | Where |
|---|---|
| Create, duplicate, rename, describe, favourite, save versions of, approve, import and export themes | **Theme** tab, library sidebar, **Bundle** tab |
| Edit semantic colour roles, typography roles, surface, outline, depth, motion personality, effect assets, intensity & safety, board, layers and sound cues | **Theme** tab |
| See what is inherited and what is overridden (BANGERS default → theme → preset → instance) and reset any value, group or whole level | every parameter row |
| Keep a preset **linked** to its theme or freeze an **independent snapshot** | **Presets** tab |
| See a theme at a glance: colours + contrast, type specimens, surfaces, motion curve, all 12 effects animated, board-aware sizing across viewports and board shapes | **Preview sheet** tab |
| Combine effects on a timeline: overlap, stagger, repeat, event/cue markers, scrub, replay, save | **Sequences** tab |
| Export a portable bundle (config, referenced assets, *permitted* fonts, licences, versions, runtime, working examples) and verify it | **Bundle** tab, `bangers verify` |
| Manage images, audio and fonts with an explicit licence declaration | **Media** tab |

Undo/redo (Ctrl+Z / Ctrl+Shift+Z) covers every edit, with a history list.

## VFX Playground

A library of 620 polished presets (146 effects) in ten categories (text animations, text styling, amount counters, messages and win celebrations, symbol pop and destruction, symbol transformation and expansion, multipliers, impacts, screen distortion, shine and highlights) that you customise, save and hand to an AI assistant. Category → effect → enter text / upload PNG or transparent WebM → adjust → preview → save / export. Animated thumbnails, search and favourites, a 142-family licensed font browser, a full gradient editor (solid, linear, radial, conic, reflected, animated; independent for face, outlines, extrusion, glow, frames, images and effect layers), layered entrance / idle / emphasis / exit motion, **Copy for AI Coding**, preset JSON and offline bundles with only the fonts used and their licences. Built-in presets never change; your saves get a stable id and a version. **Pro-slots round**: win ladders and coin / gem fountains with real physics, a reel board with five spin animations, anticipation, landings, win lines, wilds, bonus tiles and cascades, effects that act on the slot grid only (shake, zap, smoke, frozen, twenty glow textures, sixteen themes), seamless ambient loops, animated frames, a feature-trigger cinematic, your own sound files attached to cue points, and quality tiers for weak phones. **Refinement round**: refined screen transitions (burning edge with scorched paper and real flames, frosted ice with ferns and crystals, jagged glass cracks), effects while the reels spin (trails, sparks, fire, energy, plasma …), animations for the special symbols, effects for a whole row or reel, and a wild that plays your transparent WebM while it expands. **Lettering round**: ornate fantasy gold, carved digits, steel badge, metal and slab lettering, win plates modelled on slot-game references (crests, shields, plates, slabs), classic amount counters, more multipliers, cascades with a climbing multiplier and a running win, calm text animations for messages and titles, and screen shakes and impacts (blast, cracked screen, thunder, a storm lit from inside).

```bash
npm run playground               # dev server, http://127.0.0.1:5174/playground.html
npm run build:playground-single  # dist/playground-single/index.html — one self-contained file (open it directly)
npm run playground:e2e           # build + the Playwright verification suite (headless Chromium)
```

See [`docs/vfx-playground.md`](docs/vfx-playground.md) for the categories, fonts and licences, gradients, export formats, the player API, what is verified and what is *not* claimed.

## Run it

```bash
npm ci
npm run dev          # editor at http://127.0.0.1:5173
npm test             # unit + integration tests (builds the runtime first)
npm run e2e          # builds, then drives the editor in a real Chromium
npm run build        # dist/editor (app), generated/ (runtime), dist/cli (CLI)
```

**The VFX playground (effects, fonts, fire/smoke/ice, transitions):** `npm run vfx` builds `dist/playground-single/index.html`, one self-contained file, and opens it. (`npm run play` is the older Theme Studio below.)

**No server, no port:** `npm run play` builds **`dist/single/index.html`**, one self-contained file (JS, CSS and fonts inlined), and opens it in your default browser. You can also double-click that file or host it anywhere. Your library is saved in that browser's storage.

If `npm run dev` does not open: read the terminal for the `Local:` line (Vite moves to another port if 5173 is taken), make sure Node is ≥ 20.19 (`node -v`), and if the server runs in WSL, Docker or a remote machine use `npm run dev -- --host` and open the address it prints. `npm run play` avoids all of that.

Requires Node ≥ 20.19. Browser tests use the Chromium found in `PLAYWRIGHT_BROWSERS_PATH` (default `/opt/pw-browsers`) or `CHROME_PATH`; otherwise run `npx playwright-core install chromium`.

### CLI

```bash
npm run build:runtime
npm run bangers -- export-starter out.zip              # export the starter theme (approved versions)
npm run bangers -- verify out.zip --run-examples       # verify, then run the bundle's own Node example
npm run bangers -- docs docs/parameters.md             # regenerate the parameter reference
```

`verify` exits non-zero when any check fails, so it can gate a release pipeline.

## Documentation

- [`docs/theme-system.md`](docs/theme-system.md): concepts, inheritance, sequences, bundles, integration, safety and known limits.
- [`docs/vfx-playground.md`](docs/vfx-playground.md): the VFX playground — categories, fonts and licences, gradients, exports, player API, verification, limits.
- [`docs/parameters.md`](docs/parameters.md): every token and effect parameter with default, bounds, unit and description (generated; a test fails if it drifts).

## Layout

```
src/core/        framework-free engine: parameters, tokens, inheritance, 12 effects, board layout,
                 sequence engine, project model, versions, bundle export/import/verify
src/runtime/     the zero-dependency module shipped inside every bundle (built from the same source)
src/editor/      React editor
src/vfx/         VFX playground: WebGL2 engine, fonts, gradients and style stack, motion, effects, ten-category library,
                 scene player, export + standalone player, React app (see docs/vfx-playground.md)
tools/playground/ capture and contact-sheet tools (headless Chromium); e2e/playground/ the verification suite
src/cli/         `bangers` CLI
assets/fonts/    redistributable fonts (SIL OFL 1.1 / Apache 2.0) with their licence texts (catalog/ holds the playground's 142 families)
tests/           unit + integration (vitest)      e2e/   browser tests (vitest + playwright-core)
```
