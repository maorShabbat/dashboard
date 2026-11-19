# Feature dossier F01: pay-anywhere scatter pays with tumble, wild and scatter

Status: **PROPOSED** (not admitted). Pilot template. Basis: official sample `0_0_scatter` (6x5 board).

## Mechanic
- Board 6 reels x 5 rows. Symbols pay by **cluster count anywhere** on the board (groups of paying symbols: 8, 9-10, 11-13, 14-36 in the
  sample), no line geometry.
- **Tumble:** winning symbols are removed, symbols above fall, new ones fill from the top, win evaluated again until no win. Each
  step is one event group.
- **Wild:** substitutes for paying symbols, not for scatter or multiplier. The SDK evaluation supports it but the official sample's reels contain no wild; the Foundry demo adds one and the books show it in play (`evidence/t1-demo-2026-10-06.md`).
- **Scatter:** 3 or more scatters trigger free spins (sample: 2 spins per scatter); free-spin retrigger. Sample has no hard cap on spins.
- **Multiplier (sample):** free game keeps a global multiplier that grows with tumbles; multiplier symbols add to it.
- **Bonus buy:** a second paid mode at a fixed cost multiplier (sample: `bonus` mode). Counts toward the mode and cost limits.

## Admission checks (skill stop rules)
| Check | Verdict | Note |
| --- | --- | --- |
| One paid action is finite | PARTIAL | sample has no designed spin cap. Measured max 446 events and 45 free spins in 100,000 books per mode; bounded by the 5,000x win cap. Still add an enforced max-event count (`evidence/scatter-measure-2026-10-06.md`) |
| Deterministic and precomputable | likely yes | RNG seeded by simulation number |
| Stateless between bets | yes | no cross-bet state; global multiplier resets per round |
| Resumable | PARTIAL | marker = last completed event `index` via `/bet/event`; mock RGS returns it (and the bet amount) on re-authenticate, tested (`tests/foundry-mock-rgs.test.ts`). Frontend resume still to build and test |
| Sessionless replay | PARTIAL | mock RGS serves `GET /bet/replay/...` from the published book, unauthenticated, tested; real-RGS behaviour and reviewer event IDs per mode still to confirm |
| No gamble / continuation / early cashout / jackpot | yes | |
| Mode cost <= 2,000x, base 1.0x cheapest | PASS (sample) | base 1.0x, bonus buy 200x |
| Max win <= 500,000x and reachable | PASS (sample) | win cap 5,000x, about 1 in 5.0 M in base |
| Hit rate >= 1 in 50 in every mode | PASS (sample) | 1 in 3.44 base, 1 in 1 bonus |
| RTP 90.0 to 96.7, modes within 0.5 | PASS but zero margin | sample is exactly 96.7%; Foundry default target lower |
| Base std dev >= 0.6 | PASS (sample) | 7.285 |
| Event count per mode <= 10,000,000, file <= 4.2 GB | PASS for the Foundry demo (bonus 76.9 events per book, 7.7 M at 100k books); the official sample alone fails at 100k books (11.0 M) | `evidence/t1-demo-2026-10-06.md`; the verify gate checks it on every build |
| Social wording (buy -> play/get bonus, win feature -> play feature) | OPEN | wording table in the rules builder |
| Mystery-style probability text | N/A | no mystery mode in the pilot |

## Events (from the sample; confirm the exact set against `0_0_scatter/game_events.py`)
`reveal`, `winInfo`, `setWin`, `setTotalWin`, `tumbleBoard`, `setTumbleWin`, `updateTumbleWin`, `updateGlobalMult`, `freeSpinTrigger`,
`updateFreeSpin`, `freeSpinRetrigger`, `freeSpinEnd`, `finalWin`, `wincap`. Each needs a schema, fixture, frontend handler, resume
semantics and replay coverage before admission.

## Presentation hooks (VFX layer, later)
Win title with counter, tumble burst, multiplier up. Not part of math admission; presentation never changes outcomes.

## Exit to ADMITTED
Close every OPEN row above with evidence (simulation numbers, schema files, resume and replay design), have the user confirm scope,
then change the status here and in `PRE_CODE_GATE.md` item 9.
