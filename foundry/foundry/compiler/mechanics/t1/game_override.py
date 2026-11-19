from game_executables import *
import random
import src.events.events as _events
from foundry_features import EVALUATOR, REEL_HEIGHTS, TUMBLE, FeatureMixin
from src.calculations.cluster import Cluster
from src.calculations.lines import Lines
from src.calculations.ways import Ways
from src.events.events import win_info_event
from game_events import send_mult_info_event
from src.events.events import set_total_event, set_win_event, update_freespin_event, update_global_mult_event, update_tumble_win_event, reveal_event
from src.calculations.statistics import get_random_outcome


class GameStateOverride(FeatureMixin, GameExecutables):
    """
    This class is is used to override or extend universal state.py functions.
    e.g: A specific game may have custom book properties to reset
    """

    def reset_book(self):
        # Reset global values used across multiple projects
        super().reset_book()
        # Reset parameters relevant to local game only
        self.tumble_win = 0
        self.reset_feature_state()

    def draw_board(self, emit_event: bool = True, trigger_symbol: str = "scatter") -> None:
        """Foundry: special features change the board before the reveal is shown and evaluated."""
        if REEL_HEIGHTS:
            # every reel shows a random number of symbols on every spin
            self.config.num_rows = [random.randint(REEL_HEIGHTS[0], REEL_HEIGHTS[1]) for _ in range(self.config.num_reels)]
        super().draw_board(emit_event=False, trigger_symbol=trigger_symbol)
        self.apply_reveal_features()
        if emit_event:
            if REEL_HEIGHTS:
                self.reveal_event_padded()
            else:
                reveal_event(self)

    def reveal_event_padded(self):
        """The reveal of a board whose reels have different heights: short reels are filled with empty cells below, so every reel has the same length on screen."""
        attrs = list(self.config.special_symbols.keys())
        blank = {"name": "BLANK"}
        board = []
        for reel in range(len(self.board)):
            col = [_events.json_ready_sym(s, attrs) for s in self.board[reel]]
            col += [dict(blank) for _ in range(REEL_HEIGHTS[1] - len(col))]
            board.append([_events.json_ready_sym(self.top_symbols[reel], attrs)] + col + [dict(blank)])
        self.book.add_event({"index": len(self.book.events), "type": "reveal", "board": board, "paddingPositions": self.reel_positions, "gameType": self.gametype, "anticipation": self.anticipation})

    def reset_fs_spin(self):
        super().reset_fs_spin()
        self.global_multiplier = 1
        self.reset_feature_state()

    def get_scatterpays_update_wins(self):
        """Foundry: same as the sample, with cell multipliers applied to the wins before they are paid."""
        if EVALUATOR == "cluster":
            self.win_data = Cluster.get_cluster_data(self.config, self.board, self.global_multiplier, wild_key="wild")
        elif EVALUATOR == "paylines":
            self.win_data = Lines.get_lines(
                self.board, self.config, wild_key="wild", wild_sym=self.config.special_symbols["wild"][0],
                multiplier_method="global", global_multiplier=self.global_multiplier,
            )
        elif EVALUATOR == "ways":
            self.win_data = Ways.get_ways_data(self.config, self.board, wild_key="wild", global_multiplier=self.global_multiplier, multiplier_strategy="global")
        else:
            self.win_data = Scatter.get_scatterpay_wins(self.config, self.board, global_multiplier=self.global_multiplier)
        if TUMBLE and EVALUATOR in ("paylines", "ways"):
            # these evaluators keep the board: mark the winning cells so they tumble away, and give each win the overlay position the tumbling frontend shows its amount at
            for w in self.win_data["wins"]:
                for p in w["positions"]:
                    self.board[p["reel"]][p["row"]].explode = True
                w["meta"].setdefault("overlay", {"reel": w["positions"][0]["reel"], "row": w["positions"][0]["row"]})
        self.apply_wild_multipliers()
        self.apply_cell_multipliers()
        self.apply_hero_step()
        self.gadget_on_win()
        {"cluster": Cluster.record_cluster_wins, "paylines": Lines.record_lines_wins, "ways": Ways.record_ways_wins}.get(EVALUATOR, Scatter.record_scatter_wins)(self)
        self.win_manager.tumble_win = self.win_data["totalWin"]
        self.win_manager.update_spinwin(self.win_data["totalWin"])

    def emit_tumble_win_events(self):
        """A game without tumbles announces the spin's win once; a tumbling game announces each tumble."""
        if TUMBLE:
            return super().emit_tumble_win_events()
        if self.win_data["totalWin"] > 0:
            win_info_event(self)
            self.evaluate_wincap()

    def set_end_tumble_event(self):
        """Foundry: each hero wild multiplies the spin win before the board multipliers (they multiply together)."""
        for factor, cell, base, new in self.apply_hero_multiplier():
            if cell is not None and factor > 1:
                send_mult_info_event(self, factor, [{"reel": cell[0], "row": cell[1], "value": factor}], base, new)
                update_tumble_win_event(self)
        super().set_end_tumble_event()
        flat = self.apply_scatter_pay()
        if any(f["type"] == "holdAndWin" for f in self.fx_active):
            self.apply_hold_and_win()
            flat = 1
        if self.apply_prize_award() > 0:
            flat = 1
        if flat:
            if self.win_manager.spin_win > 0:
                set_win_event(self)
            set_total_event(self)
        self.feature_after_spin()

    def assign_special_sym_function(self):
        self.special_symbol_functions = {"M": [self.assign_mult_property]}

    def assign_mult_property(self, symbol):
        """Use betmode conditions to assign multiplier attribute to multiplier symbol."""
        multiplier_value = get_random_outcome(
            self.get_current_distribution_conditions()["mult_values"][self.gametype]
        )
        symbol.assign_attribute({"multiplier": multiplier_value})

    def check_game_repeat(self):
        """Verify final win matches required betmode conditions."""
        if self.repeat == False:
            win_criteria = self.get_current_betmode_distributions().get_win_criteria()
            if win_criteria is not None and self.final_win != win_criteria:
                self.repeat = True
