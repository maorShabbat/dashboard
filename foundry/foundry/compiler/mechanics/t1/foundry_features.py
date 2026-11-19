"""Foundry special features for the pay-anywhere template. Parameters are injected by the compiler into FEATURES.

A feature is an instance with an id, the places where it works (the base game, the free spins triggered by scatters, or the id of a
purchased bonus) and a trigger (conditions tested on the spin's natural board and the state of the bonus). Everything happens at the
reveal, before the first evaluation of a spin, except the multipliers (applied to the wins). The browser estimate in
foundry/builder/fx.ts follows the same rules in the same order; keep both in step.
"""

import random
from collections import Counter

import src.events.events as _events
from src.events.events import update_global_mult_event

_json_ready_sym = _events.json_ready_sym


def _json_ready_with_wild_value(symbol, special_attributes=None):
    """A wild that carries a multiplier shows it on the board: the value travels as `wmult` and the generated frontend draws it on the symbol."""
    out = _json_ready_sym(symbol, special_attributes)
    if getattr(symbol, "prize", None) and "wild" in symbol.defn.special_flags:
        out["wmult"] = symbol.prize
    return out


_events.json_ready_sym = _json_ready_with_wild_value  # reveal and tumble events look this name up when they run

FEATURES = []  # Foundry: injected by the compiler
SCATTER_PAYS = {}  # Foundry: injected by the compiler (cash for scatters, x bet by count)
EVALUATOR = "scatter"  # Foundry: injected by the compiler (how wins are found)
TUMBLE = False  # Foundry: injected by the compiler (paylines and ways: winning symbols tumble away)
REEL_HEIGHTS = None  # Foundry: injected by the compiler (ways: lowest and highest reel height)
STEPS = TUMBLE  # does a base round have steps (tumbles)?
PAYING = []  # Foundry: injected by the compiler (paying symbols, best first)
LOWEST_SYMBOL = ""  # Foundry: injected by the compiler (the paying symbol with the smallest pay)

def _product(values):
    out = 1
    for v in values:
        out *= v
    return out


NEIGHBOURS = ((1, 0), (-1, 0), (0, 1), (0, -1))


class FeatureMixin:
    # ------------------------------------------------------------------ state
    def reset_feature_state(self):
        """State lives for one round (or one bonus): per-feature memory plus the bonus bookkeeping the triggers read."""
        self.fx = {}
        self.fx_active = []
        self.fx_prev_win = None
        self.fx_win_streak = 0
        self.fx_loss_streak = 0
        self.fx_bonus_win = 0.0
        self.fx_lives_over = False

    def _st(self, f):
        return self.fx.setdefault(f["id"], {})

    def _where(self):
        """The places that apply right now: 'base', 'free' (scatter-triggered free spins), the ante bet's 'ante' (its base game also counts as 'base') or a purchased bonus id."""
        mode = getattr(self, "betmode", "base")
        if self.gametype == self.config.freegame_type:
            return ["free"] if mode in ("base", "ante") else [mode]
        if mode == "base":
            return ["base"]
        if mode == "ante":
            return ["base", "ante"]
        return []

    def _special(self, kind):
        return set(self.config.special_symbols[kind])

    def _eligible_cells(self):
        keep = self._special("scatter") | self._special("multiplier") | self._special("wild")
        return [(r, y) for r in range(len(self.board)) for y in range(len(self.board[r])) if self.board[r][y].name not in keep]

    # ------------------------------------------------------------------ triggers
    def _condition_ok(self, c, names):
        kind = c["kind"]
        if kind == "chance":
            return random.random() < c["p"]
        if kind == "scatters":
            n = sum(1 for s in names if s in self._special("scatter"))
            return n >= c["min"] and (c.get("max") is None or n <= c["max"])
        if kind == "symbols":
            return sum(1 for s in names if s == c["symbol"]) >= c["min"]
        spin, total = self.fs, self.tot_fs
        if kind == "spinIs":
            w = c["which"]
            return spin == 1 if w == "first" else spin >= total if w == "last" else spin % c["n"] == 0 if w == "every" else spin >= c["n"]
        if kind == "prevSpin":
            if self.fx_prev_win is None:
                return False
            r = c["result"]
            return self.fx_prev_win > 0 if r == "win" else self.fx_prev_win == 0 if r == "loss" else self.fx_prev_win >= c["x"]
        if kind == "streak":
            return (self.fx_win_streak if c["of"] == "win" else self.fx_loss_streak) >= c["n"]
        if kind == "bonusWin":
            return self.fx_bonus_win >= c["atLeast"]
        if kind == "spinsLeft":
            return total - spin <= c["atMost"]
        return False

    def _trigger_ok(self, trigger, names):
        results = [self._condition_ok(c, names) for c in trigger["conditions"]]  # every condition is evaluated (no short cut)
        if not results:
            return True
        return all(results) if trigger["match"] == "all" else any(results)

    # ------------------------------------------------------------------ reveal
    def apply_reveal_features(self):
        if not FEATURES:
            return
        where = self._where()
        free = self.gametype == self.config.freegame_type
        names = [s.name for r in self.board for s in r]  # the natural board: triggers are tested before any feature changes it
        self.fx_active = [f for f in FEATURES if any(w in f["where"] for w in where) and self._trigger_ok(f["trigger"], names)]
        wild = self.config.special_symbols["wild"][0]
        active = lambda t: [f for f in self.fx_active if f["type"] == t]

        # marks of cell multipliers live for one spin (or for the whole bonus when asked)
        for f in active("cellMultiplier"):
            st = self._st(f)
            if not free or f["memory"] == "spin":
                if st.get("terrain"):
                    st["terrain"] = {}
                    self.book.add_event({"index": len(self.book.events), "type": "cellMultipliers", "cells": []})

        # 0. the multiplier ladder and the bonus-wide multiplier set where the global multiplier starts
        self._ladder_start()
        self._bonus_mult_start()

        # 1. wilds held from earlier free spins come back
        self._sticky_return()

        # 2. random wilds on ordinary cells
        for f in active("randomWild"):
            n = int(random.choices(list(f["counts"].keys()), weights=list(f["counts"].values()))[0])
            cells = self._eligible_cells()
            for r, y in random.sample(cells, min(n, len(cells))):
                self.board[r][y] = self.create_symbol(wild)

        # 2b. a colossal block of wilds
        for f in active("colossalWild"):
            self._colossal(f, wild)

        # 3. mystery reveal: several ordinary cells turn into one shared symbol
        for f in active("mystery"):
            n = int(random.choices(list(f["counts"].keys()), weights=list(f["counts"].values()))[0])
            skip = self._special("scatter") | self._special("multiplier") | self._special("wild")
            freq = Counter(s for reel in self.reelstrip for s in reel if s not in skip)
            pool = [s for s in (PAYING[: (len(PAYING) + 1) // 2] if f["pool"] == "high" else PAYING) if s in freq]
            symbol = random.choices(pool, weights=[freq[k] for k in pool])[0]
            cells = self._eligible_cells()
            picked = random.sample(cells, min(n, len(cells)))
            for r, y in picked:
                self.board[r][y] = self.create_symbol(symbol)
            self.book.add_event({"index": len(self.book.events), "type": "mysteryReveal", "symbol": symbol, "cells": [{"reel": r, "row": y + 1} for r, y in sorted(picked)]})

        # 3b. low paying symbols are swapped for better ones
        for f in active("removeSymbols"):
            self._remove_symbols(f)

        # 3c. the ordinary symbols change places
        for f in active("shuffle"):
            cells = self._eligible_cells()
            syms = [self.board[r][y] for r, y in cells]
            random.shuffle(syms)
            for (r, y), sym in zip(cells, syms):
                self.board[r][y] = sym

        # 4. expanding and spreading wilds act on the wilds that are on the board now (not on each other's output)
        grow = active("expandWild") + active("spreadWild")
        protected = self._special("scatter") | self._special("multiplier")
        if grow:
            sources = [(r, y) for r in range(len(self.board)) for y in range(len(self.board[r])) if self.board[r][y].name == wild]
            nreels, nrows = len(self.board), len(self.board[0])
            fill = []
            for (r, y) in sources:
                for f in grow:
                    if random.random() >= f["chance"]:
                        continue
                    if f["type"] == "expandWild":
                        if f["shape"] in ("reel", "cross"):
                            fill += [(r, k) for k in range(nrows)]
                        if f["shape"] in ("row", "cross"):
                            fill += [(k, y) for k in range(nreels)]
                    else:
                        near = [(r + dr, y + dy) for dr, dy in NEIGHBOURS if 0 <= r + dr < nreels and 0 <= y + dy < nrows]
                        fill += random.sample(near, min(f["copies"], len(near)))
            for (r, y) in fill:
                if self.board[r][y].name not in protected:
                    self.board[r][y] = self.create_symbol(wild)

        # 5. every wild now on the board is held for the next free spins
        self._sticky_record()

        # 6. the hero wild moves to a new cell (not held by sticky wilds)
        self._hero_move()

        # 7. gadget rows: opened gadgets work first, then the new board charges the meters
        self._gadgets_step()
        self._assign_wild_mults()
        self.get_special_symbols_on_board()


    # ------------------------------------------------------------------ steps shared by the reveal and (in the base game) every tumble
    def _active(self, kind):
        return [f for f in self.fx_active if f["type"] == kind]

    def _sticky_return(self):
        wild = self.config.special_symbols["wild"][0]
        protected = self._special("scatter") | self._special("multiplier")
        for f in self._active("stickyWild"):
            held = self._st(f).setdefault("held", {})
            for (r, y), left in list(held.items()):
                if left <= 0:
                    del held[(r, y)]
                    continue
                if r < len(self.board) and y < len(self.board[r]) and self.board[r][y].name not in protected:
                    self.board[r][y] = self.create_symbol(wild)
                held[(r, y)] = left - 1

    def _sticky_record(self):
        wild = self.config.special_symbols["wild"][0]
        for f in self._active("stickyWild"):
            held = self._st(f).setdefault("held", {})
            hold = f["lifetime"] if f["lifetime"] > 0 else 10**9
            for r in range(len(self.board)):
                for y in range(len(self.board[r])):
                    if self.board[r][y].name == wild:
                        held[(r, y)] = hold

    def _hero_move(self):
        wild = self.config.special_symbols["wild"][0]
        protected = self._special("scatter") | self._special("multiplier")
        for f in self._active("heroWild"):
            st = self._st(f)
            if st.get("factor") is None:
                st["factor"] = f["startFactor"]
            cells = [(r, y) for r in range(len(self.board)) for y in range(len(self.board[r])) if self.board[r][y].name not in protected]
            target = None
            cur = st.get("cell")
            if f["move"] == "step" and cur is not None:
                near = [(r, y) for (r, y) in cells if (r, y) != cur and abs(r - cur[0]) <= 1 and abs(y - cur[1]) <= 1]
                if near:
                    target = random.choice(near)
            if target is None and cells:
                target = random.choice(cells)
            if target is not None:
                self.board[target[0]][target[1]] = self.create_symbol(wild)
                st["cell"] = target

    def check_fs_condition(self, scatter_key: str = "scatter"):
        """A bonus whose lives ran out cannot be retriggered."""
        if self.fx_lives_over:
            return False
        return super().check_fs_condition(scatter_key)

    def _ladder(self):
        ladders = self._active("multiplierLadder")
        return ladders[0] if ladders else None

    def _ladder_start(self):
        f = self._ladder()
        if f and self.global_multiplier < f["start"]:
            self.global_multiplier = f["start"]
            update_global_mult_event(self)

    def _ladder_step(self):
        f = self._ladder()
        if f and f["step"] > 0 and self.global_multiplier < f["max"]:
            self.global_multiplier = min(f["max"], self.global_multiplier + f["step"])
            update_global_mult_event(self)

    def update_global_mult(self):
        """Free spins: the ladder decides how the multiplier grows after a tumble (without a ladder it is +1)."""
        f = self._ladder()
        if f is None:
            self.global_multiplier += 1
            update_global_mult_event(self)
        else:
            self._ladder_step()

    def _bonus_mult_start(self):
        for f in self._active("bonusMultiplier"):
            bm = self._st(f).setdefault("bm", f["start"])
            if self.global_multiplier < bm:
                self.global_multiplier = bm
                update_global_mult_event(self)

    def _remove_symbols(self, f):
        target = {LOWEST_SYMBOL} if f["target"] == "lowest" else set(PAYING[(len(PAYING) + 1) // 2:])
        keep = self._special("scatter") | self._special("multiplier") | self._special("wild") | target
        freq = Counter(s for reel in self.reelstrip for s in reel if s not in keep)
        names, weights = list(freq.keys()), list(freq.values())
        if not names:
            return
        for r in range(len(self.board)):
            for y in range(len(self.board[r])):
                if self.board[r][y].name in target:
                    self.board[r][y] = self.create_symbol(random.choices(names, weights=weights)[0])

    def apply_prize_award(self):
        """Configured prizes that fired on this spin: a flat cash amount (x bet), no multipliers. Returns the amount added."""
        total = 0.0
        for f in [x for x in self.fx_active if x["type"] == "prizeAward"]:
            total += float(random.choices([int(k) for k in f["values"]], weights=list(f["values"].values()))[0])
        total = min(total, max(self.config.wincap - self.win_manager.running_bet_win, 0.0))
        if total <= 0:
            return 0.0
        self.win_manager.update_spinwin(total)
        self.book.add_event({"index": len(self.book.events), "type": "scatterPay", "count": 0, "amount": int(round(total * 100))})
        self.evaluate_wincap()
        return total

    def _colossal(self, f, wild):
        n = f["size"]
        protected = self._special("scatter") | self._special("multiplier")
        anchors = []
        for r in range(len(self.board) - n + 1):
            for y in range(min(len(self.board[r + k]) for k in range(n)) - n + 1):
                if all(self.board[r + i][y + j].name not in protected for i in range(n) for j in range(n)):
                    anchors.append((r, y))
        if anchors:
            r, y = random.choice(anchors)
            for i in range(n):
                for j in range(n):
                    self.board[r + i][y + j] = self.create_symbol(wild)

    def _assign_wild_mults(self):
        """Wilds without a multiplier get one (they keep it while they tumble down)."""
        fs = self._active("wildMultiplier")
        if not fs:
            return
        f = fs[0]
        wild = self.config.special_symbols["wild"][0]
        values = [int(k) for k in f["values"].keys()]
        weights = list(f["values"].values())
        marks = []
        for r in range(len(self.board)):
            for y in range(len(self.board[r])):
                sym = self.board[r][y]
                if sym.name == wild:
                    if not sym.prize:
                        sym.assign_attribute({"prize": random.choices(values, weights=weights)[0]})  # the symbol class has no free attribute: prize carries the wild multiplier
                    marks.append({"reel": r, "row": y + 1, "value": sym.prize})
        self.book.add_event({"index": len(self.book.events), "type": "wildMultipliers", "cells": marks})

    def apply_wild_multipliers(self):
        """After an evaluation: a win that includes wilds is multiplied by the sum (or product) of the wilds' values."""
        fs = self._active("wildMultiplier")
        if not fs or not self.win_data.get("wins"):
            return
        f = fs[0]
        wild = self.config.special_symbols["wild"][0]
        total = 0.0
        for w in self.win_data["wins"]:
            vals = []
            for p in w["positions"]:
                sym = self.board[p["reel"]][p["row"]]
                if sym.name == wild and sym.prize:
                    vals.append(sym.prize)
            if vals:
                m = sum(vals) if f["combine"] == "add" else _product(vals)
                if m > 1:
                    w["win"] *= m
                    w["meta"]["winWithoutMult"] *= m
            total += w["win"]
        self.win_data["totalWin"] = total

    def _wild_reels(self, reels):
        wild = self.config.special_symbols["wild"][0]
        protected = self._special("scatter") | self._special("multiplier")
        for r in reels:
            if r < len(self.board):
                for y in range(len(self.board[r])):
                    if self.board[r][y].name not in protected:
                        self.board[r][y] = self.create_symbol(wild)

    def _gadgets_step(self):
        for f in self._active("gadgetPanel"):
            self._wild_reels(self._st(f).get("reels", ()))  # locked wild reels stay wild
            self.fire_gadgets(f)
            names = [s.name for r in self.board for s in r]
            for i, slot in enumerate(f["slots"]):
                if slot["charge"]["kind"] == "land":
                    self.gadget_charge(f, i, sum(1 for x in names if x in slot["charge"]["symbols"]))
            if self.gametype != self.config.freegame_type and not STEPS:
                self.fire_gadgets(f)  # a base round with no steps: the cells that opened work at once on this board

    def apply_step_features(self):
        """The base game has no spins inside a round, only tumbles: after every tumble held wilds come back, the hero moves and the gadgets work."""
        if not self.fx_active or self.gametype == self.config.freegame_type:
            return
        self._ladder_step()
        self._sticky_return()
        self._sticky_record()
        self._hero_move()
        self._gadgets_step()
        self._assign_wild_mults()
        self.get_special_symbols_on_board()

    def apply_hero_step(self):
        """Base game: the hero multiplies the win of a tumble step, then grows when the step won."""
        if self.gametype == self.config.freegame_type or self.win_data.get("totalWin", 0) <= 0:
            return
        for f in self._active("heroWild"):
            st = self._st(f)
            if st.get("factor") is None:
                continue
            factor = st["factor"]
            if factor > 1:
                for w in self.win_data["wins"]:
                    w["win"] *= factor
                    w["meta"]["winWithoutMult"] *= factor
                self.win_data["totalWin"] = sum(w["win"] for w in self.win_data["wins"])
            st["factor"] = min(f["maxFactor"], st["factor"] + f["growth"])

    # ------------------------------------------------------------------ gadgets
    def _gad_cells(self, f):
        return self._st(f).setdefault("cells", [{"charge": 0, "level": 0, "done": False, "opened": False} for _ in f["slots"]])

    def gadget_charge(self, f, i, n):
        """Adds charge to one cell: it opens at its threshold, upgrades at its elite threshold, then repeats or stays done."""
        st = self._st(f)
        cells = self._gad_cells(f)
        c, slot = cells[i], f["slots"][i]
        if n <= 0 or c["done"]:
            return
        if f.get("sequence") and i > 0 and not cells[i - 1]["opened"]:
            return  # doors: a cell only starts charging once the one before it has opened
        pending = st.setdefault("pending", [])
        c["charge"] += n
        opened = []
        last = 2 if slot.get("eliteNeed") else 1
        if c["level"] == 0 and c["charge"] >= slot["need"] and len(pending) < 20:
            c["level"] = 1
            c["opened"] = True
            pending.append((slot, slot["power"]))
            opened.append(i)
        if c["level"] == 1 and slot.get("eliteNeed") and c["charge"] >= slot["eliteNeed"] and len(pending) < 20:
            c["level"] = 2
            pending.append((slot, slot.get("elitePower") or slot["power"]))
            opened.append(i)
        if c["level"] == last:
            if slot["repeat"]:
                c["charge"], c["level"] = 0, 0
            else:
                c["done"] = True
        self.book.add_event({"index": len(self.book.events), "type": "gadgetPanel", "id": f["id"], "cells": [{"charge": x["charge"], "level": x["level"]} for x in cells], "opened": opened})

    def gadget_on_win(self):
        if self.win_data.get("totalWin", 0) <= 0:
            return
        for f in self.fx_active:
            if f["type"] == "gadgetPanel":
                for i, slot in enumerate(f["slots"]):
                    if slot["charge"]["kind"] == "wins":
                        self.gadget_charge(f, i, 1)

    def fire_gadgets(self, f):
        """Opened cells work on the new board, in the order they opened."""
        wild = self.config.special_symbols["wild"][0]
        st = self._st(f)
        pending, st["pending"] = st.get("pending", []), []
        for slot, power in pending:
            if slot["tool"] == "wilds":
                cells = self._eligible_cells()
                for r, y in random.sample(cells, min(power, len(cells))):
                    self.board[r][y] = self.create_symbol(wild)
            elif slot["tool"] == "wildReel":
                held = st.setdefault("reels", set())
                free_reels = [r for r in range(len(self.board)) if r not in held]
                chosen = random.sample(free_reels, min(power, len(free_reels)))
                self._wild_reels(chosen)
                if slot.get("hold"):
                    held.update(chosen)
            elif slot["tool"] == "multiplier":
                self.global_multiplier += power
                update_global_mult_event(self)
            elif slot["tool"] == "remove" and LOWEST_SYMBOL:
                keep = self._special("scatter") | self._special("multiplier") | self._special("wild") | {LOWEST_SYMBOL}
                freq = Counter(s for reel in self.reelstrip for s in reel if s not in keep)
                names, weights = list(freq.keys()), list(freq.values())
                for r in range(len(self.board)):
                    for y in range(len(self.board[r])):
                        if self.board[r][y].name == LOWEST_SYMBOL and names:
                            self.board[r][y] = self.create_symbol(random.choices(names, weights=weights)[0])

    # ------------------------------------------------------------------ wins
    def apply_cell_multipliers(self):
        """After an evaluation: wins through marked cells are multiplied by the sum of the marks, then every cell in a win is marked or upgraded."""
        if not self.win_data.get("wins"):
            return
        for f in [x for x in self.fx_active if x["type"] == "cellMultiplier"]:
            terrain = self._st(f).setdefault("terrain", {})
            total = 0.0
            cells = set()
            for w in self.win_data["wins"]:
                m = sum(terrain.get((p["reel"], p["row"]), 0) for p in w["positions"])
                if m > 0:
                    w["win"] *= m
                    w["meta"]["winWithoutMult"] *= m
                total += w["win"]
                cells.update((p["reel"], p["row"]) for p in w["positions"])
            self.win_data["totalWin"] = total
            changed = False
            for c in sorted(cells):
                cur = terrain.get(c, 0)
                new = f["start"] if cur == 0 else min(f["max"], cur * 2 if f["growth"] == "double" else cur + f["start"])
                if new != cur:
                    terrain[c] = new
                    changed = True
            if changed:
                # the event carries every marked cell (idempotent for replay and resume); rows start at 1 because of the padding row
                marks = [{"reel": c[0], "row": c[1] + 1, "multiplier": v} for c, v in sorted(terrain.items())]
                self.book.add_event({"index": len(self.book.events), "type": "cellMultipliers", "id": f["id"], "cells": marks})

    def apply_hero_multiplier(self):
        """After the tumbles of a free spin: a winning spin is multiplied by each hero's factor, then the hero grows. Returns (factor, cell, base, new) per hero."""
        out = []
        if self.gametype != self.config.freegame_type or self.win_manager.spin_win <= 0:
            return out
        for f in [x for x in self.fx_active if x["type"] == "heroWild"]:
            st = self._st(f)
            if st.get("factor") is None:
                continue
            factor, base = st["factor"], self.win_manager.spin_win
            self.win_manager.set_spin_win(base * factor)
            st["factor"] = min(f["maxFactor"], st["factor"] + f["growth"])
            out.append((factor, st.get("cell"), base, self.win_manager.spin_win))
        return out

    def apply_scatter_pay(self):
        """Scatters on the final board also pay cash (x bet) by count, flat: no multiplier changes it. Returns the amount added."""
        if not SCATTER_PAYS:
            return 0.0
        n = self.count_special_symbols("scatter")
        keys = [int(k) for k in SCATTER_PAYS if int(k) <= n]
        if not keys:
            return 0.0
        win = float(SCATTER_PAYS[str(max(keys))])
        win = min(win, max(self.config.wincap - self.win_manager.running_bet_win, 0.0))
        if win <= 0:
            return 0.0
        self.win_manager.update_spinwin(win)
        self.book.add_event({"index": len(self.book.events), "type": "scatterPay", "count": n, "amount": int(round(win * 100))})
        self.evaluate_wincap()
        return win

    def apply_hold_and_win(self):
        """Hold and win rounds that fired on this spin: orbs lock, new orbs restart the respins, the orb values are added to the spin win (flat, no multipliers)."""
        for f in [x for x in self.fx_active if x["type"] == "holdAndWin"]:
            cells = [(r, y) for r in range(len(self.board)) for y in range(len(self.board[r]))]
            n0 = min(int(random.choices(list(f["counts"].keys()), weights=list(f["counts"].values()))[0]), len(cells) - 1)
            vals, wts = list(f["values"].keys()), list(f["values"].values())
            draw = lambda: int(random.choices(vals, weights=wts)[0])
            orbs = {c: draw() for c in random.sample(cells, n0)}
            start = [{"reel": c[0], "row": c[1] + 1, "value": v} for c, v in sorted(orbs.items())]
            steps = []
            left = f["respins"]
            while left > 0 and len(orbs) < len(cells):
                new = {c: draw() for c in cells if c not in orbs and random.random() < f["landChance"]}
                if new:
                    orbs.update(new)
                    left = f["respins"]
                else:
                    left -= 1
                steps.append({"respins": left, "orbs": [{"reel": c[0], "row": c[1] + 1, "value": v} for c, v in sorted(new.items())]})
            win = float(sum(orbs.values()))
            full = len(orbs) == len(cells)
            if full:
                win *= f["fullMult"]
            win = min(win, max(self.config.wincap - self.win_manager.running_bet_win, 0.0))
            self.win_manager.update_spinwin(win)
            self.book.add_event({"index": len(self.book.events), "type": "holdAndWin", "id": f["id"], "start": start, "steps": steps, "full": full, "amount": int(round(win * 100))})
            self.evaluate_wincap()

    def feature_after_spin(self):
        """Bonus bookkeeping the triggers read: the spin's final win, the streaks and the bonus total."""
        if self.gametype != self.config.freegame_type:
            return
        w = self.win_manager.spin_win
        for f in self._active("bonusMultiplier"):
            st = self._st(f)
            if w > 0 and f["step"] > 0:
                st["bm"] = min(f["max"], st.get("bm", f["start"]) + f["step"])
        for f in self._active("lives"):
            st = self._st(f)
            left = st.get("left", f["lives"]) - (1 if w <= 0 else 0)
            st["left"] = left
            if left <= 0:
                self.fx_lives_over = True
                self.tot_fs = self.fs  # the bonus ends after this spin
        self.fx_prev_win = w
        if w > 0:
            self.fx_win_streak += 1
            self.fx_loss_streak = 0
        else:
            self.fx_loss_streak += 1
            self.fx_win_streak = 0
        self.fx_bonus_win += w
