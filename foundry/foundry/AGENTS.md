# Slot Foundry: project boundary and authority

**What it is.** A generic builder. It is theme-agnostic. At this stage its end product is three things for a chosen template:
generated Stake-native **code** (Math SDK game package and Web SDK app), the **math model** (config, reels, paytable, distributions,
verification report) and **instructions for an AI coding assistant** that finishes the game-specific art, rules text and wiring.
The designer UI comes after the headless pipeline works.

**Pilot (decided by the user, 6 October 2026):** pay-anywhere (scatter pays), cascade / tumble, scatter symbol, wild symbol. Theme is
irrelevant. Code lives in `foundry/` for now.

**Authority order (highest first):** current Engine documentation (`docs/foundry/engine-docs/`, re-crawl on each audit) and the
authenticated submission checklist; official SDK revisions pinned in `docs/foundry/sdk-notes.md`; the `stake-native-game` skill
(`.claude/skills/stake-native-game/`); the product spec in `docs/foundry/spec/`; local decisions. Where sources conflict, stop and
record it in `gate/COMPLIANCE_MATRIX.md`; do not invent a resolution.

**Rules**
- No production gameplay, payout or RGS code until `gate/PRE_CODE_GATE.md` has no blocking item and the mechanic's dossier is `ADMITTED`.
- Disposable feasibility runs are allowed and are labelled `FEASIBILITY` (the `0_0_scatter` tracer is one).
- Never describe the project as compliant or approved; use the skill's completion states.
- Secrets never in chat or repo; ACP/RGS credentials go in environment secrets.
- Never put a model identifier in any file, commit or PR text. They/them when pronouns are unknown.
- Branch: see `CLAUDE.md` (this session works on `claude/intelligent-albattani-p2m6am`).

**Current state:** `PRE-CODE BLOCKED` (see the gate).
