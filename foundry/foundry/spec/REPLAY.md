# Sessionless replay (v0)

Source: `engine-docs/approval-guidelines__game-replay-requirements.txt`.

- Launch query: `replay=true`, `game`, `version`, `mode`, `event` (simulation ID), `rgs_url`; optional `currency`, `amount`, `lang`,
  `device`, `social`. No `sessionID`.
- Fetch: `GET {rgs_url}/bet/replay/{game}/{version}/{mode}/{event}` -> `{ payoutMultiplier, costMultiplier, state }`. No authentication
  and no wallet call of any kind. `state` is the book (events) so the same renderer runs it.
- UX: auto-load with a loader, a **Play** button, full animation and sound, results, **Play Again**, all bet controls hidden or disabled,
  displayed bet cost and applied multiplier, works in the small popout, error message if the load fails, no route from replay to normal play.
- Social: `social=true` uses the social wording and English only; the replay window contains none of the restricted terms.
- Reviewer event IDs: the compiler writes `replay-events.json` per mode with IDs for a normal win, a big win, win cap, a loss, and a
  bonus trigger, chosen from the published books (for the pilot: loss id 1, tumble win id 3, retrigger id 19290, win cap id 7; see fixtures).
