# Signal Engine Autoresearch

This is an autonomous experiment to iteratively optimize the Signal Engine's scoring algorithm. Instead of minimizing val_bpb, we maximize the **Sharpe ratio** of the backtested portfolio while keeping max drawdown below 15%.

## Setup

To set up a new experiment, work with the user to:

1. **Agree on a run tag**: propose a tag based on today's date (e.g. `mar31`). The branch `autoresearch/<tag>` must not already exist — this is a fresh run.
2. **Create the branch**: `git checkout -b autoresearch/<tag>` from the current branch. Run this from the `signal-engine/` root directory.
3. **Read the in-scope files**: Read these files for full context:
   - `autoresearch/program.md` — this file.
   - `autoresearch/prepare.py` — fixed evaluation harness. **Do not modify.**
   - `autoresearch/engine.py` — the file you modify. Contains all tunable parameters.
   - `autoresearch/README.md` — system overview.
4. **Run baseline**: Execute `python autoresearch/engine.py` from `signal-engine/` to establish the baseline metrics.
5. **Initialize results.tsv**: The file already exists with the header row. Record the baseline result after the first run.
6. **Confirm setup**: Check that the output contains the `---` block with all 7 metrics.

Once setup is confirmed, kick off the experimentation loop.

## Experimentation

Run experiments as: `python autoresearch/engine.py > autoresearch/run.log 2>&1`

**What you CAN do:**
- Modify `autoresearch/engine.py` — this is the **only** file you edit.
  - Change signal weights (they must still sum to 1.0 exactly)
  - Change Z-score normalization parameters (ZSCORE_MEAN, ZSCORE_SD)
  - Change sigmoid steepness
  - Change empirical probability calibration breakpoints
  - Change Kelly fraction and max position cap
  - Change payoff ratio assumption
  - Change transaction cost and slippage assumptions
  - Change conviction thresholds (BUY_PROB_THRESHOLD, BUY_EDGE_THRESHOLD)
  - Change risk rules: trailing stop %, take profit %, time stop weeks
  - Change kill switch threshold
  - Change crowding overrides for specific tickers
  - Add new derived signals via CUSTOM_COMPUTE_SIGNALS function
  - Change max hold weeks (try 4, 6, 8)
  - Try asymmetric risk rules (tighter stops on losers, wider on winners)

**What you CANNOT do:**
- Modify `autoresearch/prepare.py`. It is read-only. It contains the fixed evaluation harness, all historical price data, the backtest simulator, and the ground-truth metric computation.
- Modify the `PRICE_DATA` or `QUALITY_FIXED` constants — those are the reality of what happened.
- Install new packages. Only standard Python library (`math`, `statistics`, etc.) is available.
- Hardcode trades or forward-look into the future.

## The Optimization Objective

**PRIMARY GOAL: maximize `sharpe_ratio`** (higher is better, risk-adjusted returns)

**HARD CONSTRAINTS** (must not violate to count as improvement):
- `max_drawdown_pct` must be ≤ 15.0
- `win_rate` must be ≥ 45.0
- `total_trades` must be ≥ 20 (strategy must be active enough to be meaningful)

**Secondary goals** (nice to have, but don't sacrifice Sharpe for these):
- High `total_return_pct`
- Balanced `avg_win_pct` / `avg_loss_pct` ratio (payoff ratio > 1.5)

**KEEP** a commit only if:
- `sharpe_ratio` improved vs. current best AND
- All hard constraints above are satisfied

**DISCARD** (git reset) if:
- `sharpe_ratio` is equal or worse, OR
- Any hard constraint is violated

## Output Format

Once the script finishes it prints a summary like this:

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

Extract the key metric from the log file:
```
grep "^sharpe_ratio:" autoresearch/run.log
grep "^max_drawdown_pct:" autoresearch/run.log
```

If no `---` line appears in run.log, the run crashed. Check `tail -n 30 autoresearch/run.log`.

## Logging Results

Log every experiment to `autoresearch/results.tsv` (tab-separated). Do NOT commit results.tsv.

Format:
```
commit	sharpe_ratio	total_return_pct	max_drawdown_pct	win_rate	status	description
```

- `commit`: 7-char git hash
- `sharpe_ratio`: e.g. `1.234`
- `total_return_pct`: e.g. `45.67`
- `max_drawdown_pct`: e.g. `8.92`
- `win_rate`: e.g. `61.54`
- `status`: `keep`, `discard`, or `crash`
- `description`: short text — what this experiment tried

Example:
```
commit	sharpe_ratio	total_return_pct	max_drawdown_pct	win_rate	status	description
a1b2c3d	1.234	45.67	8.92	61.54	keep	baseline
b2c3d4e	1.456	52.11	7.33	63.21	keep	momentum weight 0.20→0.30 quality 0.25→0.15
c3d4e5f	0.987	38.22	18.41	57.89	discard	trailing stop 3%→5% violates drawdown constraint
```

## The Experiment Loop

LOOP FOREVER:

1. Review the current git state and last N results in results.tsv.
2. Formulate a hypothesis about what to try next (see Research Directions below for ideas).
3. Edit `autoresearch/engine.py` to test the hypothesis.
4. Verify the weights sum to 1.0 if you changed them.
5. git commit: `git commit -am "experiment: <short description>"`
6. Run: `python autoresearch/engine.py > autoresearch/run.log 2>&1`
7. Read results: `grep "^sharpe_ratio:\|^max_drawdown_pct:\|^win_rate:\|^total_trades:" autoresearch/run.log`
8. If the grep is empty → crash. Run `tail -n 30 autoresearch/run.log`. Fix if trivial; otherwise log as crash and move on.
9. Check: did `sharpe_ratio` improve AND all constraints met?
   - YES: keep the commit, record `keep` in results.tsv
   - NO: `git reset HEAD~1`, `git checkout autoresearch/engine.py` (revert), record `discard`
10. Go to step 1.

**NEVER STOP**: Once the experiment loop has begun, do NOT pause to ask the human if you should continue. Do NOT ask "should I keep going?" or "is this a good stopping point?". The human might be asleep and expects you to continue working indefinitely until manually stopped. You are an autonomous researcher. If you run out of ideas, think harder, combine prior near-misses, or look for patterns in the results.tsv. The loop runs until the human interrupts you, period.

**Crashes**: If a run crashes with a Python error (typo, import error), fix it and re-run. If the idea itself is broken, log crash and move on.

**Getting stuck**: If Sharpe has not improved in 10+ experiments, try more radical changes: completely different weight distributions, new signal transformations via CUSTOM_COMPUTE_SIGNALS, or novel risk rule combinations.

## Research Directions

These are concrete areas to explore, from lowest to highest risk:

### Tier 1: Weight Tuning (low risk, high impact)
- Systematically sweep weight distributions, e.g.:
  - Increase quality weight (0.25→0.35) and reduce crowding (0.10→0.00)
  - Increase momentum weight (0.20→0.30) — strong signal historically
  - Reduce mean_reversion weight (0.15→0.05) — may be noise in this dataset
  - Try momentum+quality dominated: {momentum: 0.35, quality: 0.35, flow: 0.15, risk: 0.10, mean_reversion: 0.05, crowding: 0.00}
  - Try contrarian: increase mean_reversion weight to 0.30+

### Tier 2: Risk Rule Tuning (medium impact)
- Trailing stop tighter/looser: try 2%, 2.5%, 4%, 5%
- Take profit higher: try 10%, 12%, 15%
- Take profit lower: try 5%, 6% — capture gains faster
- Max hold weeks: try 4 (tighter), 8 (wider), 10
- Kill switch drawdown: try 8%, 12%, 15%
- Breakeven buffer: try 1.0%, 1.5% (wider safety net)
- Momentum reversal: try -3% (tighter) or -8% (looser)

### Tier 3: Probability & Sizing (medium risk)
- Kelly fraction: try 0.15 (more conservative), 0.33 (third-Kelly), 0.50 (half-Kelly)
- Max position cap: try 0.10, 0.12, 0.20
- Payoff ratio: try 1.5, 2.5, 3.0 — affects Kelly calculation
- BUY_PROB_THRESHOLD: try 0.52, 0.58, 0.60
- BUY_EDGE_THRESHOLD: try 0.05, 0.15, 0.20
- Tighten entry criteria (higher thresholds) → fewer but better trades
- Loosen entry criteria (lower thresholds) → more diversification

### Tier 4: Empirical Probability Calibration (medium risk)
- Recalibrate the probability breakpoints in EMPIRICAL_PROB_MAP
  - Try more aggressive: score > 1.0 → 0.80 (instead of 0.72)
  - Try more conservative: score > 0.5 → 0.58 (instead of 0.62)
  - Try flat calibration: all thresholds → 0.55 (test if calibration helps at all)

### Tier 5: Crowding Overrides (medium risk)
- Experiment with crowding overrides per-ticker
  - Reduce crowding for NVDA (75→55) — high quality, worth trading despite crowding
  - Increase crowding for META (55→70) — test if reducing META trades helps
  - Remove crowding entirely for quality tickers: {MSFT: 0, AAPL: 0, NVDA: 0, GOOGL: 0}

### Tier 6: Custom Signal Transformations (higher risk)
- Implement CUSTOM_COMPUTE_SIGNALS to add new signals:
  - RSI-based mean reversion: compute RSI(14) from closes for oversold/overbought
  - Volatility regime: scale momentum signal by inverse of recent vol
  - Momentum persistence: require momentum signal to be above 60 for 2 consecutive weeks
  - Quality + momentum combo signal: boost quality score when momentum is also strong
  - Trend filter: only buy if price > 12-week SMA (trend-following filter)
  - Mean reversion + quality: stronger mean reversion signal for high-quality stocks

### Tier 7: Structural Changes (highest risk/reward)
- Add RSI to the composite score as a 7th signal (requires adding a new weight)
- Try removing the worst-performing signals entirely
- Implement a "regime filter" that disables buying when market breadth is weak (use average momentum across all tickers as a market signal)
- Try a "ranked portfolio" approach in CUSTOM_COMPUTE_SIGNALS — only take signals on top-3 ranked tickers by composite score per week

## Notes on Mathematical Correctness

- Sharpe ratio in prepare.py uses `sqrt(52)` annualization on weekly-frequency trade returns — this is standard for weekly trading strategies.
- Max drawdown is computed from the sequential trade P&L with position-sizing applied.
- Transaction costs are 10bps round-trip (5bps in + 5bps out), already embedded in the blended return.
- Slippage of 5bps is applied at entry only.
- The blended return on partial take-profit trades is: `0.5 * partial_ret + 0.5 * remainder_ret`.

## Expected Baseline Performance (v2.1 defaults)

Based on backtest_v2.py with the default parameters, approximate baseline metrics:
- sharpe_ratio: ~1.0–1.3
- total_return_pct: ~30–60%
- max_drawdown_pct: ~5–10%
- win_rate: ~55–65%
- total_trades: ~40–70
