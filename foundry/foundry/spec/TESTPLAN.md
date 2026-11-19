# Test and evidence plan (v0)

Each row of `foundry/gate/COMPLIANCE_MATRIX.md` gets one test and an evidence link. Layers:

1. **Math (Python):** SDK verifier unmodified; Foundry report vs the `MATH.md` table; independent oracle; five wins per mode vs rules text;
   event-count sizing; max-events-per-round redraw test. Run from the math-sdk root with `docs/foundry/tools/tracer_run.py` until the
   compiler exists.
2. **Mock RGS (vitest):** authenticate, play, end-round, event, replay; assertions on the request log: no end-round after a zero win, no play
   when balance is short, no authenticated call from replay, bet within min/max/step, `ERR_*` codes.
3. **Frontend (Playwright + headless Chromium, software WebGL):** launch, bad `rgs_url`, one round, resume of an active round, replay and
   Play Again, junk `lang`, social mode (SC/GC, no `$`, restricted-term scan of every string and screenshot), space bar, no scroll, no
   double-tap zoom, sound toggle, autoplay and high-cost confirmations, static bundle and clean network and console, Popout S/L and mobile
   screenshots, currency table render test (symbols, decimals, placement), sub-cent win display.
4. **Docs generation:** rules page contains RTP, max win, per-mode cost and description, symbol pays, win combinations, free-game and
   retrigger rules, the disclaimer, a UI guide.
5. **Manual / process (not code):** older Android and iOS devices, bet-level template, provably fair and replay enabled, Slack posting,
   approval of the front and math pair, tile assets.

Commands: `npx tsc --noEmit -p .` on its own, `npx vitest run`, Playwright config added with the frontend step.
Evidence is stored in `foundry/gate/evidence/`; the matrix is updated only with a link to evidence.
