"""
Signal Engine Autoresearch — Agent-Editable Parameters
=======================================================
THIS IS THE FILE THE AGENT MODIFIES.

Everything here is fair game:
  - Signal weights (must sum to 1.0)
  - Z-score normalization parameters
  - Sigmoid steepness
  - Empirical probability breakpoints
  - Kelly fraction and position cap
  - Conviction band thresholds
  - Payoff ratio and transaction costs
  - Risk rules (trailing stop, take profit, time stop)
  - Crowding overrides
  - Any new signal transformations (via compute_signals override)

When run directly: `python engine.py`
  → imports prepare.py, runs full backtest, prints summary.
"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# ---------------------------------------------------------------------------
# SIGNAL WEIGHTS — must sum to 1.0
# ---------------------------------------------------------------------------

WEIGHT_MOMENTUM       = 0.20
WEIGHT_MEAN_REVERSION = 0.15
WEIGHT_QUALITY        = 0.25
WEIGHT_FLOW           = 0.15
WEIGHT_RISK           = 0.15
WEIGHT_CROWDING       = 0.10

# ---------------------------------------------------------------------------
# Z-SCORE NORMALIZATION
# Population assumed: mean=50, sd=16.67 (so 0 and 100 are ~3 SDs away)
# ---------------------------------------------------------------------------

ZSCORE_MEAN = 50.0
ZSCORE_SD   = 16.67

# ---------------------------------------------------------------------------
# PROBABILITY CONVERSION
# Sigmoid steepness: how sharply composite score maps to conviction
# ---------------------------------------------------------------------------

SIGMOID_STEEPNESS = 1.5

# Empirical probability calibration (sorted descending by threshold)
# Format: (score_threshold, win_probability)
# If score > threshold → use that probability
# Based on observed hit rates: high composite => ~70% hit rate
EMPIRICAL_PROB_MAP = [
    (1.0,  0.72),
    (0.8,  0.68),
    (0.5,  0.62),
    (0.3,  0.56),
    (0.1,  0.52),
    (0.0,  0.48),
    (-0.3, 0.42),
    (-999, 0.35),  # catch-all
]

# ---------------------------------------------------------------------------
# POSITION SIZING — Fractional Kelly
# f = c * (p * b - (1-p)) / b
# ---------------------------------------------------------------------------

KELLY_FRACTION    = 0.25     # quarter-Kelly (conservative)
MAX_POSITION_PCT  = 0.15     # hard cap: no single position > 15% of portfolio
PAYOFF_RATIO      = 2.0      # assumed reward-to-risk ratio (2:1)

# ---------------------------------------------------------------------------
# ENTRY / ACTION THRESHOLDS
# ---------------------------------------------------------------------------

BUY_PROB_THRESHOLD = 0.55    # minimum probability to trigger BUY
BUY_EDGE_THRESHOLD = 0.10    # minimum edge (net of costs) to trigger BUY

# ---------------------------------------------------------------------------
# TRANSACTION COSTS & SLIPPAGE
# ---------------------------------------------------------------------------

TRANSACTION_COST_BPS = 10.0  # round-trip (5bps entry + 5bps exit)
SLIPPAGE_BPS         = 5.0   # additional entry slippage

# ---------------------------------------------------------------------------
# RISK RULES
# ---------------------------------------------------------------------------

TRAILING_STOP_PCT               = 3.0   # -3% from high-water mark → EXIT
TAKE_PROFIT_PCT                 = 8.0   # +8% from entry → sell half
MOMENTUM_REVERSAL_THRESHOLD_PCT = -5.0  # 4-week return below this
MOMENTUM_REVERSAL_MIN_PNL_PCT   = 2.0   # only exit if P&L also < +2%
BREAKEVEN_BUFFER_PCT            = 0.5   # after partial, exit if within 0.5% of entry
MAX_HOLD_WEEKS                  = 6     # maximum holding period
KILL_SWITCH_DRAWDOWN_PCT        = 10.0  # portfolio DD threshold (tracked, not a hard blocker in sequential sim)

# ---------------------------------------------------------------------------
# CROWDING OVERRIDES
# Default crowding table is in prepare.py; override specific tickers here
# TSLA and PLTR given reduced crowding to allow trading these high-performers
# ---------------------------------------------------------------------------

CROWDING_OVERRIDE = {
    "TSLA": 65,   # reduced from 80 (default) → now tradeable
    "PLTR": 70,   # reduced from 85 (default) → now tradeable
}

# ---------------------------------------------------------------------------
# CUSTOM SIGNAL COMPUTATION (optional)
# Set to None to use prepare.py's default signal functions.
# Set to a callable: fn(ticker, closes, vols, quality_table, crowding_table)
#   → must return dict with keys: momentum, mean_reversion, quality, flow, risk, crowding
# The agent can inject new signal logic here without touching prepare.py.
# ---------------------------------------------------------------------------

CUSTOM_COMPUTE_SIGNALS = None

# Example of a custom compute_signals function (not active by default):
# def my_compute_signals(ticker, closes, vols, quality_table, crowding_table):
#     from prepare import _compute_momentum, _compute_mean_reversion, _compute_flow, _compute_risk
#     mom  = _compute_momentum(closes, vols)
#     mr   = _compute_mean_reversion(closes)
#     qual = quality_table[ticker]
#     fl   = _compute_flow(vols)
#     rsk  = _compute_risk(closes[-12:])
#     crow = crowding_table[ticker]
#     # Apply any transformations here
#     return dict(momentum=mom, mean_reversion=mr, quality=qual, flow=fl, risk=rsk, crowding=crow)
# CUSTOM_COMPUTE_SIGNALS = my_compute_signals

# ---------------------------------------------------------------------------
# Build params dict for evaluate()
# ---------------------------------------------------------------------------

PARAMS = {
    "weights": {
        "momentum":       WEIGHT_MOMENTUM,
        "mean_reversion": WEIGHT_MEAN_REVERSION,
        "quality":        WEIGHT_QUALITY,
        "flow":           WEIGHT_FLOW,
        "risk":           WEIGHT_RISK,
        "crowding":       WEIGHT_CROWDING,
    },
    "zscore_mean":                      ZSCORE_MEAN,
    "zscore_sd":                        ZSCORE_SD,
    "sigmoid_steepness":                SIGMOID_STEEPNESS,
    "kelly_fraction":                   KELLY_FRACTION,
    "max_position_pct":                 MAX_POSITION_PCT,
    "payoff_ratio":                     PAYOFF_RATIO,
    "transaction_cost_bps":             TRANSACTION_COST_BPS,
    "slippage_bps":                     SLIPPAGE_BPS,
    "trailing_stop_pct":                TRAILING_STOP_PCT,
    "take_profit_pct":                  TAKE_PROFIT_PCT,
    "momentum_reversal_threshold_pct":  MOMENTUM_REVERSAL_THRESHOLD_PCT,
    "momentum_reversal_min_pnl_pct":    MOMENTUM_REVERSAL_MIN_PNL_PCT,
    "breakeven_buffer_pct":             BREAKEVEN_BUFFER_PCT,
    "max_hold_weeks":                   MAX_HOLD_WEEKS,
    "kill_switch_drawdown_pct":         KILL_SWITCH_DRAWDOWN_PCT,
    "buy_prob_threshold":               BUY_PROB_THRESHOLD,
    "buy_edge_threshold":               BUY_EDGE_THRESHOLD,
    "crowding_override":                CROWDING_OVERRIDE,
    "empirical_prob_map":               EMPIRICAL_PROB_MAP,
    "compute_signals":                  CUSTOM_COMPUTE_SIGNALS,
}

# Weight validation
_w = PARAMS["weights"]
_total = sum(_w.values())
assert abs(_total - 1.0) < 1e-9, f"Weights must sum to 1.0, got {_total:.6f}"

# ---------------------------------------------------------------------------
# Entry point — run backtest and print summary
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    from prepare import evaluate, print_summary
    metrics = evaluate(PARAMS)
    print_summary(metrics)
