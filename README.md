# dashboard

Two tools for slot-game development, kept side by side as separate, self-contained projects.

| Folder | What it is |
| --- | --- |
| [`playground/`](playground/) | **VFX Playground**: 620 polished effect presets (146 effects) for slot games in ten categories: text animations, text styling, amount counters, messages and win celebrations, symbol pop and destruction, symbol transformation and expansion, multipliers, impacts, screen distortion, shine and highlights. Effects are deterministic functions of time, so they can be scrubbed, skipped and replayed. |
| [`foundry/`](foundry/) | **Slot Foundry**: a designer that generates a real Stake Engine game (Math SDK project and matching Web SDK app) from one game configuration, runs the maths and verifies the result. The designer, compiler, mock RGS, spec and compliance notes live in `foundry/foundry/`. The folder also carries the same playground sources, because the Foundry shares that code. |

Both folders are complete npm projects with their own `package.json`, lockfile and tests. Neither depends on the other folder.

## Run the playground

```bash
cd playground
npm ci
npm run playground               # dev server, http://127.0.0.1:5174/playground.html
npm run build:playground-single  # dist/playground-single/index.html: one self-contained file you can open directly
```

More detail, including the categories, fonts and licences, export formats and what is and is not verified, is in
[`playground/docs/vfx-playground.md`](playground/docs/vfx-playground.md).

## Build the Slot Foundry designer

```bash
cd foundry
npm ci
node foundry/builder/build.mjs dist/foundry-builder   # writes index.html, builder.js and sim.worker.js; open index.html
```

Other entry points (see `package.json`): `npm run foundry:compile -- foundry/examples/t1-demo.config.json <outDir>` (generate a game
from a config), `npm run foundry:mock-rgs` (a local stand-in for the Stake RGS), `npm run foundry:e2e`.

**Status: work in progress.** The designer builds and typechecks. Its generated games are prototypes, not approved or mathematically
final. Some tests and demos expect clones of the official Stake Engine SDKs (`math-sdk`, `web-sdk`, `ts-client`) next to the repo, and
Python 3.12 for the Math SDK; the paths are set by environment variables or defaults named in those tests.

## What is not here

Private planning documents, product specifications, working notes and CI configuration were left out on purpose.

## Licences

No licence has been chosen for the original code yet, so all rights are reserved. Third-party parts keep their own licences: the fonts
carry theirs in `assets/fonts/catalog/*/LICENSE.txt`, and the sample game files under
`foundry/foundry/compiler/mechanics/t1/` are MIT-licensed code from the official Stake Engine Math SDK (see the `NOTICE.md` beside them).
