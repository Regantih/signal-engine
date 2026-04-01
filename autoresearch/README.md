# Signal Engine Autoresearch

Karpathy's autoresearch pattern applied to autonomous optimization of the Signal Engine's scoring algorithm. Instead of minimizing `val_bpb` on a language model, we maximize the **Sharpe ratio** of a weekly trading backtest by iterating on signal weights, risk rules, and scoring parameters.

## What Is This?

Karpathy's [autoresearch](https://github.com/karpathy/autoresearch) shows how to run an AI agent in an endless loop that modifies code, runs experiments, and keeps improvements — exactly like a researcher who sleeps and comes back to find 100 completed experiments. This system applies that same pattern to quantitative finance.

The agent modifies `engine.py`, runs the backtest, compares Sharpe ratio, and either commits the improvement or reverts. After 8+ hours of autonomous runs, you wake up to a log of every experiment and a best-found parameter set.

## Quick Start

```bash
# Navigate to signal-engine root
cd /path/to/signal-engine

# Run baseline only (verify setup)
python autoresearch/run_experiment.py --baseline-only

# Run 10 experiments in manual mode (you edit engine.py between each)
python autoresearch/run_experiment.py --experiments 10 --manual

# Run 100 autonomous experiments with Claude (requires ANTHROPIC_API_KEY)
ANTHROPIC_API_KEY=sk-ant-... python autoresearch/run_experiment.py --experiments 100

# Run forever (autonomous, requires API key)
ANTHROPIC_API_KEY=sk-ant-... python autoresearch/run_experiment.py --experiments 9999
```

## Three-File Architecture

```
autoresearch/
├── prepare.py        ← FIXED. Ground truth. Contains all price data + backtest harness.
│                       DO NOT MODIFY. This is the evaluation function.
├── engine.py         ← AGENT EDITS THIS. All tunable parameters as top-level constants.
│                       When run directly: imports prepare.py, runs backtest, prints metrics.
├── program.md        ← HUMAN EDITS THIS. Instructions for the AI agent.
│                       Contains research directions, constraints, loop protocol.
├── run_experiment.py ← The ratchet loop runner. Orchestrates experiments + git operations.
└── results.tsv       ← Append-only experiment log. Never committed.
```

### prepare.py (Fixed — DO NOT MODIFY)

- Embeds all historical price/volume data for 10 tickers (NVDA, AAPL, MSFT, TSLA, META, GOOGL, AMZN, JPM, JNJ, PLTR), weekly bars from 2025-03-07 to 2026-03-27
- Implements the complete backtest simulator with all 6 risk rules
- Exports `evaluate(params)` → returns metrics dict
- Exports `print_summary(metrics)` → prints Karpathy-style output
- Contains signal computation functions (`_compute_momentum`, `_compute_mean_reversion`, etc.)

### engine.py (Agent Edits This)

Top-level constants only — no logic. The agent changes these numbers:

| Parameter | Default | What It Controls |
|-----------|---------|-----------------|
| `WEIGHT_MOMENTUM` | 0.20 | Momentum signal weight |
| `WEIGHT_MEAN_REVERSION` | 0.15 | Mean reversion signal weight |
| `WEIGHT_QUALITY` | 0.25 | Fundamentals signal weight |
| `WEIGHT_FLOW` | 0.15 | Volume flow signal weight |
| `WEIGHT_RISK` | 0.15 | Volatility risk penalty weight |
| `WEIGHT_CROWDING` | 0.10 | Crowding penalty weight |
| `TRAILING_STOP_PCT` | 3.0 | % drawdown from HWM to exit |
| `TAKE_PROFIT_PCT` | 8.0 | % gain to take half off |
| `MAX_HOLD_WEEKS` | 6 | Maximum holding period |
| `KELLY_FRACTION` | 0.25 | Quarter-Kelly position sizing |
| `MAX_POSITION_PCT` | 0.15 | Hard position size cap |
| `BUY_PROB_THRESHOLD` | 0.55 | Minimum probability to enter |
| `KILL_SWITCH_DRAWDOWN_PCT` | 10.0 | Portfolio DD to halt new buys |
| `EMPIRICAL_PROB_MAP` | [...] | Score → probability calibration |
| `CROWDING_OVERRIDE` | {...} | Per-ticker crowding adjustments |
| `CUSTOM_COMPUTE_SIGNALS` | None | Optional: inject new signal logic |

### program.md (Human Edits This)

Human-readable instructions for the AI agent. Customize this to:
- Change the optimization objective
- Add new research directions
- Adjust constraints
- Provide domain knowledge
- Share learnings from previous runs

## The Ratchet Loop

```
LOOP FOREVER:
  1. Read engine.py + recent results.tsv
  2. Propose ONE change (via LLM or manually)
  3. Apply change to engine.py
  4. Run: python engine.py → parses metrics from stdout
  5. Check: sharpe improved AND constraints met?
     YES → git commit, record "keep" in results.tsv
     NO  → git revert engine.py, record "discard"
  6. Repeat
```

The key insight: git is the ratchet. Every improvement is committed and locked in. Every failure is reverted cleanly. The best parameters are always at HEAD.

## Output Format

Each run of `engine.py` produces:

```
---
sharpe_ratio:     1.234
total_return_pct: 45.67
max_drawdown_pct: 8.92
win_rate:         61.54
total_trades:     52
avg_win_pct:      4.23
avg_loss_pct:     -2.11
```

## Constraints for "Keep"

| Metric | Constraint |
|--------|-----------|
| sharpe_ratio | Must improve vs. current best |
| max_drawdown_pct | ≤ 15.0% |
| win_rate | ≥ 45.0% |
| total_trades | ≥ 20 (strategy must stay active) |

## Results Format (results.tsv)

Tab-separated, never committed:

```
commit  sharpe_ratio  total_return_pct  max_drawdown_pct  win_rate  status  description
a1b2c3d 1.234         45.67             8.92              61.54     keep    baseline
b2c3d4e 1.456         52.11             7.33              63.21     keep    momentum weight 0.20→0.30
c3d4e5f 0.987         38.22             18.41             57.89     discard trailing stop 3%→5% violates drawdown
```

## Customizing program.md

The key sections to customize when re-running:

1. **Optimization Objective** — Change what you're maximizing. Maybe you care more about total return than Sharpe? Add that here.
2. **Hard Constraints** — Tighten or loosen the drawdown limit, win rate floor, etc.
3. **Research Directions** — Add learnings from previous runs. "TSLA and PLTR responded well to reduced crowding — explore this more."
4. **Notes** — Any domain knowledge or empirical findings from past experiments.

## Metrics: Mathematical Details

- **Sharpe ratio**: `(mean_return - risk_free) / std_return * sqrt(52)` — annualized from weekly trade returns, using 4% risk-free rate (~0.08% weekly)
- **Max drawdown**: computed from sequential trade P&L with position-sizing applied, percentage from peak equity
- **Win rate**: percentage of trades with positive blended return (after costs)
- **Total return**: cumulative portfolio P&L from all trades (position-sized)
- **Transaction costs**: 10bps round-trip (5bps entry + 5bps exit) — already baked into every trade's blended return
- **Slippage**: 5bps additional on entry only

## Signal Computation (reference)

| Signal | Formula |
|--------|---------|
| Momentum | 0.4 × 4w_ret + 0.4 × 12w_ret + 0.2 × (recent_vol_ratio − 1) |
| Mean Reversion | deviation from 12-week SMA → score 18–85 |
| Quality | Fixed fundamental score per ticker (50–90) |
| Flow | 2w avg volume / all-time avg volume → score 35–80 |
| Risk | Annualized realized volatility → score 20–85 |
| Crowding | Fixed per-ticker estimate (35–75, with overrides) |

All signals are Z-score normalized (assumed mean=50, sd=16.67) before weighting.
