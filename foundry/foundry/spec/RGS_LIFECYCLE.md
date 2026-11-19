# Normal RGS lifecycle and recovery (v0)

Source: `engine-docs/rgs.txt`, `rgs__wallet.txt`, `approval-guidelines__rgs-communication.txt`, authenticated checklist.

1. **Launch:** read `sessionID, lang, device, rgs_url, social` (and `replay` params, see `REPLAY.md`). `rgs_url` is never hard-coded; if
   authenticate fails (including a bad `rgs_url`) show an error state, do not proceed.
2. **Authenticate** `POST /wallet/authenticate {sessionID}` -> `balance`, `config {minBet,maxBet,stepBet,defaultBetLevel,betLevels,jurisdiction}`,
   `round`. Apply all of it: bet levels from the response, jurisdiction flags (`socialCasino`, `disabledFullscreen`, `disabledTurbo`).
   If `round` is active, resume it with the bet amount from the response (checklist item).
3. **Bet:** only if balance >= bet x mode cost (otherwise **no play request**). `POST /wallet/play {sessionID, amount, mode}` with amount in
   integers of 1e-6 and divisible by `stepBet`, within min/max. Prevent double submission while a request is in flight.
4. **Render:** play the returned `round.events` in order; during long rounds write progress with `POST /bet/event {sessionID, event}`.
5. **Close:** `POST /wallet/end-round {sessionID}` after animations finish. **A zero-win round sends no end-round request** (checklist).
6. **Recovery:** on reload, `authenticate` returns the active round; replay from the stored `event` marker. The marker is the index of
   the last completed event in the book (events carry `index`).
7. **Errors:** `ERR_VAL, ERR_IPB, ERR_IS, ERR_ATE, ERR_GLE, ERR_LOC` (400), `ERR_GEN, ERR_MAINTENANCE` (500) each map to a player message
   (keyed strings); `ERR_IS` triggers re-launch guidance.
8. **Money:** integers with six decimals; display per currency table (`engine-docs/rgs.txt`); wins show exact amounts including sub-cent
   precision; balance two decimals. Autoplay needs a confirmation step; high-cost modes need a confirmation before activation.
9. **Static and offline of third parties:** no external requests, no external fonts, no console or network logging of game data.

## Findings from running the Web SDK app (2026-10-06, `gate/evidence/websdk-e2e-2026-10-06.md`)
- `rgs_url` is a **host without scheme**; the Web SDK requests `https://${rgs_url}/...`, so any local RGS needs TLS (or a browser route in tests).
- The Web SDK sends the mode as `BASE`; match mode names case-insensitively (assumption, confirm on staging).
- End-round timing in the SDK: plain win = immediately after play (balance shown after the animation); free-game round = after the animation; zero win = never.
- Replay in the SDK: no authenticate, no end-round; show cost (`amount` default) and the multipliers.
