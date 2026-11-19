# Product spec (v0): what the Foundry produces

Status: DRAFT for the pre-code gate (item 4). Pilot template `T1 pay-anywhere-tumble` only. Theme-agnostic.

## Purpose
A generic builder. From **one canonical game config** (JSON) it produces three bundles for a Stake Engine game:
1. **Code:** a Math SDK game package (`game_config.py`, `gamestate.py`, `game_executables.py`, `game_calculations.py`, `game_events.py`,
   `game_override.py`, `game_optimization.py`, `run.py`, `reels/*.csv`) and a Web SDK app derived from the SDK `scatter` app.
2. **Math model:** published artifacts (`index.json`, `books_<mode>.jsonl.zst`, `lookUpTable_<mode>_0.csv`), the optimiser inputs, and a
   verification report with every number from `docs/foundry/engine-docs/approval-guidelines__math-verification.txt`.
3. **AI-coding instructions:** `AI_INSTRUCTIONS.md` telling a coding assistant exactly what is left (art, audio, layout, copy), which
   files it may and may not change (math and event contracts are frozen), and which checks must pass.

The first deliverable is a command-line pipeline (no designer UI). The designer UI is a later layer over the same config.

## Canonical config (T1)
`foundry/compiler/config.ts` (types and validator, with the Engine limits); example `foundry/examples/t1-demo.config.json`. Fields: `id`, `version`; `board {reels, rows}`; `symbols[]`
(`id`, `kind`: paying | wild | scatter | multiplier, display key); `paytable` (cluster-size ranges to multiplier per paying symbol);
`wild {substitutes}`; `tumble {enabled}`; `scatter {triggerCount, spinsPerScatter, retrigger}`; `multiplier {globalStart, incrementPerTumble,
boardMultiplierValues}`; `modes[]` (`name`, `cost`, `type` base | bonus-buy, `rtpTarget`, `winCap`, `books`); `limits {maxEventsPerRound}`;
`strings` (every player-facing string keyed; no literal text in code). All player-facing text is keyed from day one.

## Out of scope for now
Designer UI, multi-tenant features, Spine/Lottie import, extension sandbox, AI assistant inside the product, lines/ways templates (the
compiler is built so they can follow), VPS upload, real ACP/RGS access.

## Success for the first slice
A config for T1 compiles to a game that passes the unmodified SDK verifier and the Engine critical tests (`MATH.md`), plays one round
and one replay in headless Chromium against the mock RGS, and yields `AI_INSTRUCTIONS.md`.
