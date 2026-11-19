# Pre-code gate

Status key: OPEN (blocks), DRAFT v0 (written, awaiting user review), DONE (evidence linked), N/A. Updated 2026-10-06.

| # | Item | Status | Evidence / owner |
| --- | --- | --- | --- |
| 1 | Project boundary and authority | DONE | `foundry/AGENTS.md` |
| 2 | Current Engine source and revision audit | DONE (re-audit before upload) | `docs/foundry/engine-audit-2026-10-06.md`, 66 pages + authenticated checklist; SDK pins in `sdk-notes.md`. Re-pin the Web SDK (Nov 2025) |
| 3 | Compliance traceability matrix | DONE (v0) | `gate/COMPLIANCE_MATRIX.md` |
| 4 | Product specification | DRAFT v0 | `foundry/spec/PRODUCT.md`; JSON schema file comes with the compiler (step 4) |
| 5 | Math specification and risk targets | DRAFT v0 | `foundry/spec/MATH.md` (targets, event-count sizing rule, round bound, verification pipeline) |
| 6 | Math artifact contract | DRAFT v0 | `foundry/spec/ARTIFACTS.md` |
| 7 | Normal RGS lifecycle and recovery spec | DRAFT v0 | `foundry/spec/RGS_LIFECYCLE.md` |
| 8 | Sessionless replay spec | DRAFT v0 | `foundry/spec/REPLAY.md` |
| 9 | Feature-admission dossier(s) | OPEN | `gate/features/F01-pay-anywhere-tumble.md` is `PROPOSED` |
| 10 | Versioned event schemas and fixtures plan | DRAFT v0 | `foundry/spec/EVENTS.md` + 4 real fixtures; JSON schema files still to write |
| 11 | Test and evidence plan | DRAFT v0 | `foundry/spec/TESTPLAN.md` |
| 12 | Payout granularity check on the pinned SDK writer | OPEN | `0_0_scatter` passes the unmodified verifier (FEASIBILITY, 100,000 books per mode, min step 0.10x); still test the minimum nonzero payout vs every complete-round total |
| 13 | Distribution target | DONE (default) | Stake-first, Engine-network-ready |
| 14 | Stake.US social wording approach | OPEN | `sweeps_<lang>` file approach per jurisdiction page |
| 15 | Pinned toolchain (Python 3.12, Node 22.16, pnpm, lockfiles) | PARTIAL: compile/verify scripts work (`npm run foundry:compile`, `foundry/compiler/verify.py`); CI still to add | `docs/foundry/tools/setup-sdks.sh` reproduces the workspace; needs CI |

Completion state: **PRE-CODE BLOCKED.**
