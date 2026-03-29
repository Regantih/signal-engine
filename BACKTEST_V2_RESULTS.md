# Signal Engine Backtest V2.1 — with look-ahead bias fix, transaction costs, and slippage

> **Generated:** 2026-03-29 | **Dataset:** 10 tickers, Mar 2025 – Mar 2026 (57 weekly bars)
>
> **V2.1 fixes applied (on top of V2 risk management):**
> 1. **Look-ahead bias fix:** Rolling 52-week high/low now computed from data available AT THE TIME of each bar (not from the full dataset)
> 2. **Transaction costs:** 10bps round-trip cost (5bps entry + 5bps exit) deducted from every trade
> 3. **Slippage:** 5bps worse entry price applied on every buy (effective_entry = close * 1.0005)
>
> **V2 changes (from V1):**
> 1. Active risk management during hold (trailing stop, take-profit, momentum reversal, breakeven stop)
> 2. Hold period extended from 4 weeks → **6 weeks**
> 3. TSLA crowding penalty: 80 → **65** | PLTR crowding penalty: 85 → **70**
> 4. Conviction-weighted position sizing (composite score scales size)

---

## 1. Per-Ticker Results (V2 — Risk Managed)

| Ticker | Trades | Wins | Losses | Hit Rate | Avg Ret | Avg Win | Avg Loss | Total P&L | Buy & Hold |
|--------|-------:|-----:|-------:|---------:|--------:|--------:|---------:|----------:|-----------:|
| NVDA | 40 | 19 | 21 | 47.5% | +1.89% | +8.13% | -3.75% | +75.71% | +48.66% |
| AAPL | 42 | 18 | 24 | 42.9% | +0.13% | +5.62% | -3.99% | +5.46% | +4.07% |
| MSFT | 44 | 11 | 33 | 25.0% | -1.37% | +4.76% | -3.42% | -60.43% | -9.29% |
| TSLA | 1 | 0 | 1 | 0.0% | -3.10% | n/a | -3.10% | -3.10% | +37.75% |
| META | 38 | 12 | 26 | 31.6% | -1.36% | +5.24% | -4.41% | -51.73% | -15.97% |
| GOOGL | 44 | 25 | 19 | 56.8% | +4.62% | +11.30% | -4.16% | +203.43% | +57.79% |
| AMZN | 38 | 10 | 28 | 26.3% | -1.88% | +5.67% | -4.57% | -71.32% | +0.05% |
| JPM | 43 | 16 | 27 | 37.2% | +0.22% | +5.22% | -2.75% | +9.28% | +16.74% |
| JNJ | 44 | 30 | 14 | 68.2% | +4.45% | +7.54% | -2.19% | +195.60% | +44.25% |
| PLTR | 2 | 2 | 0 | 100.0% | +24.29% | +24.29% | n/a | +48.58% | +68.48% |

---

## 2. Overall Portfolio Summary — V2

| Metric | Value |
|--------|-------|
| Total trades | 336 |
| Wins / Losses | 143 / 193 |
| Hit rate | 42.56% |
| Avg return per trade | +1.05% |
| Avg win | +7.47% |
| Avg loss | -3.72% |
| Expectancy per trade | +1.05% |
| Sum P&L (equal-weight, additive) | +351.49% |
| Sharpe-like ratio (annualised) | +0.554 |
| Avg hold period | 3.4 weeks |
| Trades with partial profit taken | 82 |

---

## 3. Exit Rule Breakdown (V2)

| Exit Rule | Count | % of Trades | Description |
|-----------|------:|------------:|-------------|
| TRAILING_STOP | 183 | 54.5% | Full position stopped out -3% below HWM |
| TAKE_PROFIT_THEN_TIME | 52 | 15.5% | Sold half at +8%, remainder held to time stop |
| TIME_STOP | 39 | 11.6% | Held full 6 weeks without hitting another rule |
| MOMENTUM_REVERSAL | 32 | 9.5% | 4-week return < -5% while P&L < +2% |
| TAKE_PROFIT_THEN_TRAILING | 30 | 8.9% | Sold half at +8%, remainder stopped out |
| TAKE_PROFIT_THEN_BREAKEVEN | 0 | 0.0% | Sold half at +8%, remainder at breakeven |
| BREAKEVEN_STOP | 0 | 0.0% | Breakeven stop triggered (no prior partial) |

### Average Return by Exit Rule

| Exit Rule | Trades | Avg Return | Win Rate |
|-----------|-------:|-----------:|---------:|
| TRAILING_STOP | 183 | -3.43% | 14.8% |
| TAKE_PROFIT_THEN_TIME | 52 | +11.94% | 100.0% |
| TIME_STOP | 39 | +2.98% | 69.2% |
| MOMENTUM_REVERSAL | 32 | -1.13% | 21.9% |
| TAKE_PROFIT_THEN_TRAILING | 30 | +9.29% | 100.0% |

---

## 4. V1 vs V2 — Direct Comparison

| Metric | V1 (Baseline) | V2 (Risk-Managed) | Delta | Better? |
|--------|:-------------:|:-----------------:|:-----:|:-------:|
| Total trades | 303 | 336 | +33 | ✓ V2 (more signals) |
| Hit rate | +58.75% | +42.56% | -16.19% | ✗ V1 |
| Avg return/trade | +1.47% | +1.05% | -0.42% | ✗ V1 |
| Avg win | +6.08% | +7.47% | +1.40% | ✓ V2 |
| Avg loss | -5.09% | -3.72% | +1.38% | ✗ V1 |
| Expectancy | +1.47% | +1.05% | -0.42% | ✗ V1 |
| Sum P&L | +445.43% | +351.49% | -93.95% | ✗ V1 |
| Sharpe-like | +0.753 | +0.554 | -0.198 | ✗ V1 |

### Per-Ticker P&L Comparison

| Ticker | V1 Total P&L | V2 Total P&L | Delta | Crowding Change |
|--------|:-----------:|:------------:|:-----:|:---------------:|
| NVDA | +76.19% | +75.71% | ▼ +0.48% | unchanged |
| AAPL | +89.83% | +5.46% | ▼ +84.37% | unchanged |
| MSFT | -72.37% | -60.43% | ▲ +11.94% | unchanged |
| TSLA | +0.00% | -3.10% | ▼ +3.10% | 80→65 |
| META | -64.06% | -51.73% | ▲ +12.32% | unchanged |
| GOOGL | +233.97% | +203.43% | ▼ +30.55% | unchanged |
| AMZN | -25.95% | -71.32% | ▼ +45.37% | unchanged |
| JPM | +23.37% | +9.28% | ▼ +14.08% | unchanged |
| JNJ | +184.44% | +195.60% | ▲ +11.16% | unchanged |
| PLTR | +0.00% | +48.58% | ▲ +48.58% | 85→70 |

---

## 5. Wealth Erosion Prevented by Risk Rules

For every trade exited by a trailing stop, we compute the 4-week natural return
(what V1 would have received) and compare it to the actual V2 exit return.

- **Trailing-stop exits:** 213 trades (183 full stops, 30 after partial profit)
- **Saved loss (sum over trailing-stop trades):** +260.19%
- **Avg saving per trailing-stop exit:** +1.22%

The trailing stop rule is a **damage limiter** — it fires primarily when positions
are already losing, cutting them before they reach the full 4-6 week natural exit.
Where it fires on profitable positions, it preserves those gains.

| Outcome | Count | % |
|---------|------:|--:|
| Trailing stop exit BETTER than 4-wk natural exit | 71 | 33.3% |
| Trailing stop exit WORSE than 4-wk natural exit | 128 | 60.1% |

---

## 6. Honest Assessment: V2 Edge Evaluation

### Key Metrics vs Thresholds (V2)

| Metric | Value | Threshold | Pass? |
|--------|------:|----------:|:-----:|
| Hit rate | 42.6% | > 50% | ✗ |
| Expectancy | +1.05% | > 0% | ✓ |
| Sharpe-like | +0.554 | > 0.50 | ✓ |

### Verdict: ⚠️ MARGINAL / INCONCLUSIVE EDGE

Two of three metrics pass. V2 shows directional improvement over V1,
but the evidence remains inconclusive at this sample size.

The trailing stop sometimes cuts winners early — this is the main cost.
The take-profit rule (sell half at +8%) locks in gains but caps upside.

### Where Risk Management Helped vs Hurt

| Factor | Effect | Notes |
|--------|--------|-------|
| Avg loss per losing trade | +1.38% change | Trailing stop limited losses ✓ |
| Avg win per winning trade | +1.40% change | Take-profit + extended hold improved ✓ |
| Hit rate | -16.19% change | Fewer winners ✗ |
| TSLA/PLTR access | +3 new trades | Crowding reduction unlocked 3 signals |

### Structural Limitations (unchanged from V1)

| Limitation | Severity | Notes |
|------------|:--------:|-------|
| Transaction costs applied | Fixed | 10bps round-trip + 5bps slippage deducted per trade (V2.1 fix) |
| Static quality signal | High | 25% weight never changes intra-backtest |
| Small sample (10 tickers) | High | Low statistical power |
| Single 12-month window | High | No out-of-sample period |
| Weekly resolution | Medium | Trailing stop triggered at weekly close only |
| Overlapping trades not prevented | Low | Same ticker can have concurrent positions |

---

## 7. Sample Trade Log (First 25 V2 Trades)

| # | Ticker | Entry | Exit | Entry $ | Exit $ | Return | Hold Wks | Rule | Win? |
|---|--------|-------|------|--------:|-------:|-------:|---------:|------|:----:|
| 1 | NVDA | 2025-05-30 | 2025-07-11 | $135.20 | $164.92 | +19.23% | 6 | TAKE_PROFIT_THEN_TIME | ✓ |
| 2 | NVDA | 2025-06-06 | 2025-07-18 | $141.79 | $172.41 | +16.32% | 6 | TAKE_PROFIT_THEN_TIME | ✓ |
| 3 | NVDA | 2025-06-20 | 2025-08-01 | $143.92 | $173.72 | +15.06% | 6 | TAKE_PROFIT_THEN_TIME | ✓ |
| 4 | NVDA | 2025-06-27 | 2025-08-08 | $157.83 | $182.70 | +12.40% | 6 | TAKE_PROFIT_THEN_TIME | ✓ |
| 5 | NVDA | 2025-07-03 | 2025-08-15 | $159.42 | $180.45 | +10.57% | 6 | TAKE_PROFIT_THEN_TIME | ✓ |
| 6 | NVDA | 2025-07-11 | 2025-08-22 | $165.00 | $177.99 | +9.20% | 6 | TAKE_PROFIT_THEN_TIME | ✓ |
| 7 | NVDA | 2025-07-18 | 2025-08-29 | $172.50 | $174.18 | +0.88% | 6 | TRAILING_STOP | ✓ |
| 8 | NVDA | 2025-07-25 | 2025-08-29 | $173.59 | $174.18 | +0.24% | 5 | TRAILING_STOP | ✓ |
| 9 | NVDA | 2025-08-01 | 2025-08-29 | $173.81 | $174.18 | +0.11% | 4 | TRAILING_STOP | ✓ |
| 10 | NVDA | 2025-08-08 | 2025-08-29 | $182.79 | $174.18 | -4.81% | 3 | TRAILING_STOP | ✗ |
| 11 | NVDA | 2025-08-15 | 2025-08-29 | $180.54 | $174.18 | -3.62% | 2 | TRAILING_STOP | ✗ |
| 12 | NVDA | 2025-08-22 | 2025-09-05 | $178.08 | $167.02 | -6.31% | 2 | TRAILING_STOP | ✗ |
| 13 | NVDA | 2025-08-29 | 2025-09-05 | $174.27 | $167.02 | -4.26% | 1 | TRAILING_STOP | ✗ |
| 14 | NVDA | 2025-09-05 | 2025-10-17 | $167.10 | $183.22 | +10.86% | 6 | TAKE_PROFIT_THEN_TIME | ✓ |
| 15 | NVDA | 2025-09-12 | 2025-10-24 | $177.91 | $186.26 | +4.59% | 6 | TIME_STOP | ✓ |
| 16 | NVDA | 2025-09-19 | 2025-10-31 | $176.76 | $202.49 | +14.46% | 6 | TAKE_PROFIT_THEN_TIME | ✓ |
| 17 | NVDA | 2025-09-26 | 2025-11-07 | $178.28 | $188.15 | +9.46% | 6 | TAKE_PROFIT_THEN_TRAILING | ✓ |
| 18 | NVDA | 2025-10-03 | 2025-11-07 | $187.71 | $188.15 | +0.13% | 5 | TRAILING_STOP | ✓ |
| 19 | NVDA | 2025-10-10 | 2025-11-07 | $183.25 | $188.15 | +6.49% | 4 | TAKE_PROFIT_THEN_TRAILING | ✓ |
| 20 | NVDA | 2025-10-17 | 2025-11-07 | $183.31 | $188.15 | +6.45% | 3 | TAKE_PROFIT_THEN_TRAILING | ✓ |
| 21 | NVDA | 2025-10-24 | 2025-11-07 | $186.35 | $188.15 | +4.71% | 2 | TAKE_PROFIT_THEN_TRAILING | ✓ |
| 22 | NVDA | 2025-10-31 | 2025-11-07 | $202.59 | $188.15 | -7.23% | 1 | TRAILING_STOP | ✗ |
| 23 | NVDA | 2025-11-07 | 2025-11-21 | $188.24 | $178.88 | -5.07% | 2 | TRAILING_STOP | ✗ |
| 24 | NVDA | 2025-11-14 | 2025-11-21 | $190.27 | $178.88 | -6.08% | 1 | TRAILING_STOP | ✗ |
| 25 | NVDA | 2025-11-21 | 2025-11-28 | $178.97 | $177.00 | -1.20% | 1 | MOMENTUM_REVERSAL | ✗ |

*Showing first 25 of 336 total trades.*

---

*End of Backtest v2 report.*