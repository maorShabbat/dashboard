# FEASIBILITY measurement: official sample `0_0_scatter` (not Foundry product code)

Date 2026-10-06. Math SDK `a6dccd86` (see `docs/foundry/sdk-notes.md`). Command (from the math-sdk root):
`SIMS=100000 THREADS=4 BATCH=2500 ../env/bin/python <repo>/docs/foundry/tools/tracer_run.py 0_0_scatter opt` (408 s with Rust optimiser).
100,000 books per mode, two modes: `base` (cost 1.0x) and `bonus` (bonus buy, cost 200x). The SDK's own verifier passed unmodified for
both ("SHA-256 OK, payout hash OK, entries=100000"). Numbers are from `library/stats_summary.json` and a pass over the published books.

Note: `BATCH=2500` was needed. With the default batch size the bonus-mode workers were OOM-killed (about 4 GB each in this container).

| Check (source: `math-verification`) | base | bonus | Limit | Result |
| --- | --- | --- | --- | --- |
| Cost multiplier | 1.0x | 200x | base 1.0x and cheapest; <= 2,000x | pass |
| RTP | 96.7% | 96.7% | 90.0 to 96.7; spread <= 0.5 | pass, but exactly at the upper limit (zero margin) |
| Std dev (base) | 7.285 | 245.9 | base >= 0.6 | pass |
| Non-zero hit rate | 1 in 3.44 | 1 in 1.0 | at least 1 in 50 | pass |
| Max win | 5,000x (win cap; books store x100 = 500,000) | same | <= 500,000x | pass |
| P(>=5,000x), P(>=10,000x) | 0, 0 | 0, 0 | 2-star 0.010, 0.005 | pass |
| Expected tail liability >40x / >10,000x | 0.396 / 0 | 0 / 0 | 2-star 0.8 / 0.6 | pass |
| CVaR (per stake) | 129.0 | 11.8 | 700 | pass |
| Min payout step (`min_diff`) | 10 (0.10x) | 10 | no stated limit | to test: sub-cent display at $0.01 bet |
| Events file size | 40 MB | 261 MB | <= 4.2 GB | pass |
| **Events per mode** | 1,544,685 | **11,007,186** | **<= 10,000,000** | **base pass; bonus exceeds at 100,000 books** |

## Findings

1. **Event-count limit.** At 100,000 books the bonus-buy mode holds 11.0 million events (110 per book) against the documented
   10,000,000 per mode limit ("Files/modes exceeding this size will fail on publish"). The page does not say whether the figure counts
   all books or only distinct ones. Consequence for the Foundry: the compiler must compute events per mode before publish and size the
   book count (or shorten event streams) to stay under the limit; the sample's own default of 10,000 books is safe (about 1.1 M).
2. **RTP margin.** The sample is tuned to exactly 96.7%, the documented maximum. The Foundry's default target should sit lower (for
   example 96.0 to 96.5) so rounding cannot push a mode over.
3. **Bounded free spins (dossier F01).** Observed maxima in 100,000 books per mode: 446 events in one round, and a total of 45 free
   spins in one base round (35 in bonus), with retriggers occurring (4,193 base, 43,912 bonus). That is empirical. The design bound is
   the win cap of 5,000x, which ends a round (`wincap` event: 81 base, 83 bonus). The Foundry must additionally enforce and test an explicit
   maximum event count per book.
4. **Rates.** Free-spin trigger: 10.1% of base rounds (10,094 of 100,000) before optimisation weighting.
5. Reachability of max win: `hr_max` 1 in 5.0 million (base) is rarer than the guidance "more frequent than about 1 in 10,000,000"
   only if read as a floor; here it is more frequent, so it passes.

## Still to test (not done here)
Minimum nonzero payout against every complete-round total at the smallest bet ($0.01) and social currencies; resume points; replay state
shape served from a book; five wins per mode checked against the rules text.
