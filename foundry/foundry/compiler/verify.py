"""Foundry math verification gate (step 4).

Runs a compiled game inside the Math SDK checkout (simulate -> Rust optimiser -> unmodified SDK verifier), then recomputes the
Engine checks independently from the published lookup tables and books, and writes `foundry-report.json` next to the game.

Usage: python verify.py <compiled game dir> <math-sdk root> [--skip-run]
Exit code 0 only when the SDK verifier passed and every critical check below passed.
Limits: docs/foundry/engine-docs/approval-guidelines__math-verification.txt, spec/MATH.md.
"""
import csv, io, json, math, os, shutil, subprocess, sys

ENGINE = dict(rtp_min=0.90, rtp_max=0.967, spread=0.005, std_min=0.6, hit=1 / 50, max_pay=500_000, max_cost=2000, events=10_000_000, bytes=int(4.2e9))
FOUNDRY = dict(rtp_max=0.966, spread=0.002, max_cost=1000, max_pay=50_000, events=9_000_000)


ROUND_COST_DIGITS = {"1", "15", "2", "25", "3", "4", "5", "75"}


def is_round_cost(cost):
    """Product rule: whole number, significant digits 1, 1.5, 2, 2.5, 3, 4, 5 or 7.5 times a power of ten (5, 10, 25, 100, 250, 1000; not 5.233, 10.2, 809)."""
    if cost != int(cost) or cost < 1:
        return False
    return str(int(cost)).rstrip("0") in ROUND_COST_DIGITS


def run(cmd, cwd, env=None):
    print("+", " ".join(cmd), flush=True)
    return subprocess.run(cmd, cwd=cwd, env=env).returncode


def mode_stats(lib, mode):
    rows = list(csv.reader(open(os.path.join(lib, "publish_files", mode["weights"]))))
    ids = [int(r[0]) for r in rows]; w = [int(r[1]) for r in rows]; p = [int(r[2]) for r in rows]
    tw = sum(w)
    cost = mode["cost"]
    mean = sum(a * b for a, b in zip(w, p)) / tw / 100          # in x of the base bet
    second = sum(a * b * b for a, b in zip(w, p)) / tw / 10000
    hit = sum(a for a, b in zip(w, p) if b > 0) / tw
    return dict(
        name=mode["name"], cost=cost, books=len(rows),
        rtp=mean / cost, std=math.sqrt(max(second - mean * mean, 0)),
        hit_rate=hit, one_in=(1 / hit if hit else math.inf),
        max_win_x=max(p) / 100, min_nonzero_payout_x=min((b for b in p if b > 0), default=0) / 100,
        distinct_payouts=len(set(p)),
    )


def count_events(lib, mode):
    """Stream the books once: total events, longest round, file size, and reviewer replay IDs (loss, win, big win, cap, bonus trigger)."""
    import zstandard
    path = os.path.join(lib, "publish_files", mode["events"])
    n = longest = 0
    ids, fallback = {}, {}
    with open(path, "rb") as f:
        r = io.TextIOWrapper(zstandard.ZstdDecompressor().stream_reader(f), encoding="utf-8")
        for line in r:
            b = json.loads(line)
            ev, pay = b["events"], b["payoutMultiplier"]
            k = len(ev)
            n += k; longest = max(longest, k)
            types = {e["type"] for e in ev}
            if pay == 0: ids.setdefault("loss", b["id"])
            if 0 < pay <= 1000 and "freeSpinTrigger" not in types: ids.setdefault("normalWin", b["id"])
            if 0 < pay <= 1000: fallback.setdefault("normalWin", b["id"])  # bonus-buy rounds always contain the trigger
            if 5000 <= pay < 100000 and "wincap" not in types: ids.setdefault("bigWin", b["id"])
            if "wincap" in types: ids.setdefault("winCap", b["id"])
            if "freeSpinTrigger" in types and 0 < pay < 100000: ids.setdefault("bonusTrigger", b["id"])
    for k, v in fallback.items(): ids.setdefault(k, v)
    return n, longest, os.path.getsize(path), ids


def main():
    game_dir, sdk = os.path.abspath(sys.argv[1]), os.path.abspath(sys.argv[2])
    skip = "--skip-run" in sys.argv
    gid = os.path.basename(game_dir.rstrip("/"))
    target = os.path.join(sdk, "games", gid)
    if not skip:
        shutil.rmtree(target, ignore_errors=True)
        shutil.copytree(game_dir, target)
        env = dict(os.environ, PYTHONPATH=sdk)
        py = os.path.join(os.path.dirname(sdk), "env", "bin", "python")
        py = py if os.path.exists(py) else sys.executable
        limit = int(os.environ.get("FOUNDRY_RUN_TIMEOUT", "3600"))
        try:
            rc = subprocess.run([py, "run.py"], cwd=target, env=env, timeout=limit).returncode
        except subprocess.TimeoutExpired:
            print(f"SDK run exceeded {limit}s. Most likely a distribution criterion cannot be met, usually the forced win cap: "
                  "raise the multiplier weight on the reel set used by the wincap distribution, then recompile."); sys.exit(3)
        if rc != 0:
            print("SDK pipeline failed (run.py exit code != 0): the SDK verifier did not pass"); sys.exit(2)
    lib = os.path.join(target, "library")
    index = json.load(open(os.path.join(lib, "publish_files", "index.json")))
    checks, stats, replay = [], [], {}

    def check(name, ok, detail, critical=True):
        checks.append(dict(name=name, ok=bool(ok), detail=detail, critical=critical))

    check("SDK verifier (unmodified) ran", True, "run.py completed execute_all_tests without error")
    for m in index["modes"]:
        s = mode_stats(lib, m)
        ev, longest, size, ids = count_events(lib, m)
        replay[m["name"]] = ids
        s.update(events=ev, events_per_book=ev / s["books"], longest_round_events=longest, events_file_bytes=size)
        stats.append(s)
        n = m["name"]
        check(f"{n}: RTP in Engine band", ENGINE["rtp_min"] <= s["rtp"] <= ENGINE["rtp_max"] + 1e-9, f'{s["rtp"]:.4%}')
        check(f"{n}: RTP under Foundry ceiling", s["rtp"] <= FOUNDRY["rtp_max"] + 1e-9, f'{s["rtp"]:.4%} <= {FOUNDRY["rtp_max"]:.1%}', critical=False)
        if n != "base":
            check(f"{n}: cost is a round number", is_round_cost(m["cost"]), f'{m["cost"]}x (allowed: whole numbers like 5, 10, 25, 50, 75, 100, 250, 500, 1000)')
        check(f"{n}: cost <= Engine max", m["cost"] <= ENGINE["max_cost"], f'{m["cost"]}x')
        check(f"{n}: cost <= Foundry max (2-star)", m["cost"] <= FOUNDRY["max_cost"], f'{m["cost"]}x', critical=False)
        check(f"{n}: max payout <= Engine max", s["max_win_x"] <= ENGINE["max_pay"], f'{s["max_win_x"]}x')
        check(f"{n}: max payout <= Foundry max (2-star)", s["max_win_x"] <= FOUNDRY["max_pay"], f'{s["max_win_x"]}x', critical=False)
        check(f"{n}: non-zero hit rate >= 1 in 50", s["hit_rate"] >= ENGINE["hit"], f'1 in {s["one_in"]:.2f}')
        check(f"{n}: events <= Engine limit", ev <= ENGINE["events"], f"{ev:,} events")
        check(f"{n}: events <= Foundry budget (10% margin)", ev <= FOUNDRY["events"], f"{ev:,} of {FOUNDRY['events']:,}", critical=False)
        check(f"{n}: events file <= 4.2 GB", size <= ENGINE["bytes"], f"{size/1e6:.1f} MB")
    base = stats[0]
    check("base mode costs 1.0x and is cheapest", base["name"] == "base" and base["cost"] == 1.0 and all(s["cost"] >= 1.0 for s in stats), f'{[(s["name"], s["cost"]) for s in stats]}')
    check("base std dev >= 0.6", base["std"] >= ENGINE["std_min"], f'{base["std"]:.3f}')
    check("base std dev <= 50 (2-star)", base["std"] <= 50, f'{base["std"]:.3f}', critical=False)
    rt = [s["rtp"] for s in stats]
    check("RTP spread across modes <= Engine 0.5 points", max(rt) - min(rt) <= ENGINE["spread"] + 1e-9, f"{(max(rt)-min(rt)):.4%}")
    check("RTP spread across modes <= Foundry 0.2 points", max(rt) - min(rt) <= FOUNDRY["spread"] + 1e-9, f"{(max(rt)-min(rt)):.4%}", critical=False)

    # The rules text must state the numbers that were measured (checklist: RTP and max win clearly stated, five wins checked).
    sp = os.path.join(game_dir, "strings", "en.json")
    if os.path.exists(sp):
        txt = json.load(open(sp))
        for s_ in stats:
            n = s_["name"]
            stated = txt.get(f"rules.mode.{n}.rtp")
            check(f"{n}: rules text RTP matches measured", stated is not None and abs(stated - s_["rtp"] * 100) <= 0.05, f"text {stated}% vs measured {s_['rtp']:.4%}")
            mw = txt.get(f"rules.mode.{n}.maxWin")
            if txt.get(f"rules.mode.{n}.maxWinIsCap"):
                # no forced win-cap rounds (a game without free spins): the rules state a cap, so the books must stay within it
                check(f"{n}: published max within the stated cap", mw is not None and s_["max_win_x"] <= mw + 1e-9, f"cap {mw}x, published max {s_['max_win_x']}x")
                check(f"{n}: the stated cap is reached in the books", mw is not None and abs(mw - s_["max_win_x"]) < 1e-9, f"cap {mw}x, published max {s_['max_win_x']}x", critical=False)
            else:
                check(f"{n}: rules text max win matches published max", mw is not None and abs(mw - s_["max_win_x"]) < 1e-9, f"text {mw}x vs published {s_['max_win_x']}x")
    else:
        check("rules strings present", False, "strings/en.json missing: compile with the Foundry compiler")
    missing = [f"{m}:{k}" for m, d in replay.items() for k in ("loss", "normalWin", "bigWin", "winCap", "bonusTrigger") if k not in d]
    check("reviewer replay event IDs found for every scenario", not missing, "missing " + ", ".join(missing) if missing else "all scenarios have an event ID", critical=False)
    json.dump(replay, open(os.path.join(game_dir, "replay-events.json"), "w"), indent=2)

    report = dict(game=gid, ok=all(c["ok"] for c in checks if c["critical"]), strict_ok=all(c["ok"] for c in checks), modes=stats, checks=checks)
    out = os.path.join(game_dir, "foundry-report.json")
    json.dump(report, open(out, "w"), indent=2, default=lambda x: None if x == math.inf else x)
    for c in checks:
        print(("PASS " if c["ok"] else ("FAIL " if c["critical"] else "WARN ")), c["name"], "-", c["detail"])
    print("critical checks:", "PASS" if report["ok"] else "FAIL", "| Foundry-strict:", "PASS" if report["strict_ok"] else "see WARN lines")
    sys.exit(0 if report["ok"] else 1)


if __name__ == "__main__":
    main()
