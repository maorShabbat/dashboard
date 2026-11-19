# Math spec (v0)

Status: DRAFT. Targets come from the hosted Engine docs (`engine-docs/approval-guidelines__math-verification.txt`), audited 2026-10-06.

## Targets the compiler enforces (Foundry defaults are stricter than the Engine limits)
| Item | Engine limit | Foundry default / gate |
| --- | --- | --- |
| RTP per mode | 90.0 to 96.7% | target 96.0 to 96.5%; fail the build above 96.6% (sample sits at exactly 96.7, no margin) |
| RTP spread across modes | <= 0.5 points | <= 0.2 |
| Base cost | 1.0x and cheapest mode | same |
| Max cost multiplier | <= 2,000x (3-star), 1,000x (2-star) | <= 1,000x so 2-star is not penalised |
| Mode cost shape (product rule, user decision 2026-10-06) | none | **round numbers only**: a whole number whose significant digits are 1, 1.5, 2, 2.5, 3, 4, 5 or 7.5 times a power of ten (5, 10, 25, 50, 75, 100, 150, 200, 250, 500, 1000). Never 5.233, 10.2 or 809. Enforced by the config validator and by `verify.py` on the published `index.json` |
| Max payout | <= 500,000x critical; 50,000x (2-star) | win cap <= 50,000x |
| Base std dev | >= 0.6 critical; <= 50 (2-star) | report; warn outside 1 to 50 |
| Non-zero hit rate | >= 1 in 50, every mode | >= 1 in 20 base |
| P(>=5,000x), P(>=10,000x) | 0.010 / 0.005 (2-star) | report |
| CVaR per stake / absolute | 700 / 20,000 | report |
| Expected tail liability (>40x, >10,000x, sum) | 0.8 / 0.6 / 1.3 | report |
| Events per mode | <= 10,000,000 | see sizing rule |
| Events file | <= 4.2 GB | check |
| Simulations | 100,000 to 1,000,000 recommended | default 100,000 books per mode, cut by the sizing rule |

Non-critical failures reduce exposure and bet caps (six failure classes, penalty tables in the Engine page); the report lists the
resulting cap tier.

## Sizing rule (from `evidence/scatter-measure-2026-10-06.md`)
`events_per_mode = sum(len(book.events))` over the published books. Measured: base 15.4 per book, bonus-buy 110 per book. The
compiler measures a pilot batch, then sets `books` so the projected total stays under 9,000,000 (10% margin). If the projection fails
even at the minimum useful book count, shorten the event stream or lower the win cap; it never publishes an over-limit mode.

## Round bound
Every round must end: the compiler sets `limits.maxEventsPerRound` (observed maximum 446 in the pilot; default limit 1,000) and the
simulator rejects and redraws any round beyond it, and the win cap ends a round. Both are tested.

## Verification pipeline (all must pass before a build is called complete)
1. Math SDK writer produces books, lookups and `index.json`.
2. SDK verifier (`utils/rgs_verification.py`, unmodified) passes: SHA-256, payout hashes, entries.
3. Independent oracle: re-evaluate boards from the `reveal` events with separate code and compare every payout (planned, step 4).
4. Foundry report: every row of the table above, mode by mode, plus minimum nonzero payout against every complete-round total at the
   smallest bet ($0.01) and the social currencies.
5. Five sampled wins per mode checked against the generated rules text.

## Open (needs evidence)
Whether the 10 M event limit counts all books or distinct ones (ask Engine); minimum nonzero payout rule; maximum paid modes.
