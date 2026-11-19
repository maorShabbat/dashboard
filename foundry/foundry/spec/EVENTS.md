# Event schemas (v0)

Observed in the pilot books (SDK `a6dccd86`, 100,000 books per mode). Every event has `type` and a running `index`. Money fields are integer
hundredths of a bet (same unit as `payoutMultiplier`). Real examples are in `fixtures/` (`base_loss`, `base_tumble_win`,
`base_freespin_trigger`, `base_wincap`). Resume: replay restarts at the first event whose `index` is greater than the stored marker;
state-setting events (`reveal`, `setTotalWin`, `updateFreeSpin`, `updateGlobalMult`) are idempotent so re-running them is safe.

| type | fields | meaning |
| --- | --- | --- |
| `reveal` | `board, gameType, anticipation, paddingPositions` | new board shown (base or free game) |
| `winInfo` | `wins, totalWin` | the clusters that win this step |
| `updateTumbleWin` | `amount` | running tumble win counter |
| `tumbleBoard` | `explodingSymbols, newSymbols` | removal and refill |
| `setWin` | `amount, winLevel` | win for the step, with presentation tier |
| `setTotalWin` | `amount` | running total for the round |
| `freeSpinTrigger` / `freeSpinRetrigger` | `positions, totalFs` | scatters that start or extend free spins |
| `updateFreeSpin` | `amount, total` | spin counter |
| `updateGlobalMult` | `globalMult` | persistent free-game multiplier |
| `boardMultiplierInfo` | `multInfo, winInfo` | multiplier symbols applied at the end |
| `freeSpinEnd` | `amount, winLevel` | free game result |
| `wincap` | `amount` | win cap reached, round ends |
| `finalWin` | `amount` | last event; payout of the round |

Every event type needs, before admission: a JSON schema file (`foundry/schema/events/<type>.json`, step 4), a fixture, a frontend
handler, resume semantics (above) and replay coverage. The VFX hooks (win title, tumble burst, multiplier) attach to `setWin`/`winInfo`,
`tumbleBoard`, `updateGlobalMult`.
