# Math artifact contract (v0)

Source: `engine-docs/math__math-file-format.txt` and the pilot's `library/publish_files`, SDK `a6dccd86`.

- `index.json`: `{ "modes": [ { "name", "cost", "events": "books_<mode>.jsonl.zst", "weights": "lookUpTable_<mode>_0.csv" } ] }`.
  Verified on the pilot: modes `base` cost 1.0 and `bonus` cost 200.0.
- `books_<mode>.jsonl.zst`: JSON lines; each `{ "id": n, "payoutMultiplier": int, "events": [ ... ] }`. Payout is an integer in hundredths of
  the bet (1150 = 11.5x). `id` is the simulation ID used by lookups and replay.
- `lookUpTable_<mode>_0.csv`: rows `id,weight,payout` (weight is uint64; payout equals the book's `payoutMultiplier` exactly).
- Limits: events file <= 4.2 GB, <= 10,000,000 events per mode (see `MATH.md` sizing rule).
- The compiler writes these only through the SDK writer; it never edits them by hand. Released artifacts are immutable; a change makes a new
  math version (`version` in the game config and in `/bet/replay/{game}/{version}/...`).
- Evidence: SHA-256 and payout hashes (SDK sidecar `configs/books_<mode>.verification.json`), the report, the config that produced them.
