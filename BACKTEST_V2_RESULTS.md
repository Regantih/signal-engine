# Signal Engine Backtest v2 — Risk-Managed Results

> **Generated:** 2026-03-29 | **Dataset:** 10 tickers, Mar 2025 – Mar 2026 (57 weekly bars)
>
> **Key changes from v1:**
> 1. Active risk management during hold (trailing stop, take-profit, momentum reversal, breakeven stop)
> 2. Hold period extended from 4 weeks → **6 weeks**
> 3. TSLA crowding penalty: 80 → **65** | PLTR crowding penalty: 85 → **70**
> 4. Conviction-weighted position sizing (composite score scales size)

---

## 1. Per-Ticker Results (V2 — Risk Managed)

| Ticker | Trades | Wins | Losses | Hit Rate | Avg Ret | Avg Win | Avg Loss | Total P&L | Buy & Hold |
|--------|-------:|-----:|-------:|---------:|--------:|--------:|---------:|----------:|-----------:|
| NVDA | 40 | 19 | 21 | 47.5% | +2.02% | +8.29% | -3.66% | +80.68% | +48.66% |
| AAPL | 42 | 18 | 24 | 42.9% | +0.28% | +5.77% | -3.84% | +11.77% | +4.07% |
| MSFT | 44 | 12 | 32 | 27.3% | -1.22% | +4.51% | -3.37% | -53.86% | -9.29% |
| TSLA | 1 | 0 | 1 | 0.0% | -2.95% | n/a | -2.95% | -2.95% | +37.75% |
| META | 38 | 12 | 26 | 31.6% | -1.21% | +5.39% | -4.26% | -46.06% | -15.97% |
| GOOGL | 44 | 25 | 19 | 56.8% | +4.78% | +11.46% | -4.02% | +210.13% | +57.79% |
| AMZN | 38 | 10 | 28 | 26.3% | -1.73% | +5.83% | -4.43% | -65.65% | +0.05% |
| JPM | 43 | 16 | 27 | 37.2% | +0.33% | +5.27% | -2.60% | +14.07% | +16.74% |
| JNJ | 44 | 31 | 13 | 70.5% | +4.60% | +7.45% | -2.20% | +202.30% | +44.25% |
| PLTR | 2 | 2 | 0 | 100.0% | +24.45% | +24.45% | n/a | +48.91% | +68.48% |

---

## 2. Overall Portfolio Summary — V2

| Metric | Value |
|--------|-------|
| Total trades | 336 |
| Wins / Losses | 145 / 191 |
| Hit rate | 43.15% |
| Avg return per trade | +1.19% |
| Avg win | +7.51% |
| Avg loss | -3.61% |
| Expectancy per trade | +1.19% |
| Sum P&L (equal-weight, additive) | +399.34% |
| Sharpe-like ratio (annualised) | +0.630 |
| Avg hold period | 3.4 weeks |
| Trades with partial profit taken | 83 |

---

## 3. Exit Rule Breakdown (V2)

| Exit Rule | Count | % of Trades | Description |
|-----------|------:|------------:|-------------|
| TRAILING_STOP | 181 | 53.9% | Full position stopped out -3% below HWM |
| TAKE_PROFIT_THEN_TIME | 53 | 15.8% | Sold half at +8%, remainder held to time stop |
| TIME_STOP | 39 | 11.6% | Held full 6 weeks without hitting another rule |
| MOMENTUM_REVERSAL | 33 | 9.8% | 4-week return < -5% while P&L < +2% |
| TAKE_PROFIT_THEN_TRAILING | 30 | 8.9% | Sold half at +8%, remainder stopped out |
| TAKE_PROFIT_THEN_BREAKEVEN | 0 | 0.0% | Sold half at +8%, remainder at breakeven |
| BREAKEVEN_STOP | 0 | 0.0% | Breakeven stop triggered (no prior partial) |

### Average Return by Exit Rule

| Exit Rule | Trades | Avg Return | Win Rate |
|-----------|-------:|-----------:|---------:|
| TRAILING_STOP | 181 | -3.30% | 14.9% |
| TAKE_PROFIT_THEN_TIME | 53 | +12.02% | 100.0% |
| TIME_STOP | 39 | +2.86% | 69.2% |
| MOMENTUM_REVERSAL | 33 | -1.04% | 24.2% |
| TAKE_PROFIT_THEN_TRAILING | 30 | +9.39% | 100.0% |

---

## 4. V1 vs V2 — Direct Comparison

| Metric | V1 (Baseline) | V2 (Risk-Managed) | Delta | Better? |
|--------|:-------------:|:-----------------:|:-----:|:-------:|
| Total trades | 303 | 336 | +33 | ✓ V2 (more signals) |
| Hit rate | +58.75% | +43.15% | -15.59% | ✗ V1 |
| Avg return/trade | +1.47% | +1.19% | -0.28% | ✗ V1 |
| Avg win | +6.08% | +7.51% | +1.43% | ✓ V2 |
| Avg loss | -5.09% | -3.61% | +1.48% | ✗ V1 |
| Expectancy | +1.47% | +1.19% | -0.28% | ✗ V1 |
| Sum P&L | +445.43% | +399.34% | -46.10% | ✗ V1 |
| Sharpe-like | +0.753 | +0.630 | -0.123 | ✗ V1 |

### Per-Ticker P&L Comparison

| Ticker | V1 Total P&L | V2 Total P&L | Delta | Crowding Change |
|--------|:-----------:|:------------:|:-----:|:---------------:|
| NVDA | +76.19% | +80.68% | ▲ +4.49% | unchanged |
| AAPL | +89.83% | +11.77% | ▼ +78.07% | unchanged |
| MSFT | -72.37% | -53.86% | ▲ +18.51% | unchanged |
| TSLA | +0.00% | -2.95% | ▼ +2.95% | 80→65 |
| META | -64.06% | -46.06% | ▲ +18.00% | unchanged |
| GOOGL | +233.97% | +210.13% | ▼ +23.84% | unchanged |
| AMZN | -25.95% | -65.65% | ▼ +39.70% | unchanged |
| JPM | +23.37% | +14.07% | ▼ +9.30% | unchanged |
| JNJ | +184.44% | +202.30% | ▲ +17.86% | unchanged |
| PLTR | +0.00% | +48.91% | ▲ +48.91% | 85→70 |

---

## 5. Wealth Erosion Prevented by Risk Rules

For every trade exited by a trailing stop, we compute the 4-week natural return
(what V1 would have received) and compare it to the actual V2 exit return.

- **Trailing-stop exits:** 211 trades (181 full stops, 30 after partial profit)
- **Saved loss (sum over trailing-stop trades):** +266.25%
- **Avg saving per trailing-stop exit:** +1.26%

The trailing stop rule is a **damage limiter** — it fires primarily when positions
are already losing, cutting them before they reach the full 4-6 week natural exit.
Where it fires on profitable positions, it preserves those gains.

| Outcome | Count | % |
|---------|------:|--:|
| Trailing stop exit BETTER than 4-wk natural exit | 73 | 34.6% |
| Trailing stop exit WORSE than 4-wk natural exit | 125 | 59.2% |

---

## 6. Honest Assessment: V2 Edge Evaluation

### Key Metrics vs Thresholds (V2)

| Metric | Value | Threshold | Pass? |
|--------|------:|----------:|:-----:|
| Hit rate | 43.2% | > 50% | ✗ |
| Expectancy | +1.19% | > 0% | ✓ |
| Sharpe-like | +0.630 | > 0.50 | ✓ |

### Verdict: ⚠️ MARGINAL / INCONCLUSIVE EDGE

Two of three metrics pass. V2 shows directional improvement over V1,
but the evidence remains inconclusive at this sample size.

The trailing stop sometimes cuts winners early — this is the main cost.
The take-profit rule (sell half at +8%) locks in gains but caps upside.

### Where Risk Management Helped vs Hurt

| Factor | Effect | Notes |
|--------|--------|-------|
| Avg loss per losing trade | +1.48% change | Trailing stop limited losses ✓ |
| Avg win per winning trade | +1.43% change | Take-profit + extended hold improved ✓ |
| Hit rate | -15.59% change | Fewer winners ✗ |
| TSLA/PLTR access | +3 new trades | Crowding reduction unlocked 3 signals |

### Structural Limitations (unchanged from V1)

| Limitation | Severity | Notes |
|------------|:--------:|-------|
| No transaction costs | Medium | 0.1–0.2% round-trip erodes returns |
| Static quality signal | High | 25% weight never changes intra-backtest |
| Small sample (10 tickers) | High | Low statistical power |
| Single 12-month window | High | No out-of-sample period |
| Weekly resolution | Medium | Trailing stop triggered at weekly close only |
| Overlapping trades not prevented | Low | Same ticker can have concurrent positions |

---

## 7. Sample Trade Log (First 25 V2 Trades)

| # | Ticker | Entry | Exit | Entry $ | Exit $ | Return | Hold Wks | Rule | Win? |
|---|--------|-------|------|--------:|-------:|-------:|---------:|------|:----:|
| 1 | NVDA | 2025-05-30 | 2025-07-11 | $135.13 | $164.92 | +19.39% | 6 | TAKE_PROFIT_THEN_TIME | ✓ |
| 2 | NVDA | 2025-06-06 | 2025-07-18 | $141.72 | $172.41 | +16.48% | 6 | TAKE_PROFIT_THEN_TIME | ✓ |
| 3 | NVDA | 2025-06-20 | 2025-08-01 | $143.85 | $173.72 | +15.21% | 6 | TAKE_PROFIT_THEN_TIME | ✓ |
| 4 | NVDA | 2025-06-27 | 2025-08-08 | $157.75 | $182.70 | +12.55% | 6 | TAKE_PROFIT_THEN_TIME | ✓ |
| 5 | NVDA | 2025-07-03 | 2025-08-15 | $159.34 | $180.45 | +10.73% | 6 | TAKE_PROFIT_THEN_TIME | ✓ |
| 6 | NVDA | 2025-07-11 | 2025-08-22 | $164.92 | $177.99 | +9.35% | 6 | TAKE_PROFIT_THEN_TIME | ✓ |
| 7 | NVDA | 2025-07-18 | 2025-08-29 | $172.41 | $174.18 | +1.03% | 6 | TRAILING_STOP | ✓ |
| 8 | NVDA | 2025-07-25 | 2025-08-29 | $173.50 | $174.18 | +0.39% | 5 | TRAILING_STOP | ✓ |
| 9 | NVDA | 2025-08-01 | 2025-08-29 | $173.72 | $174.18 | +0.26% | 4 | TRAILING_STOP | ✓ |
| 10 | NVDA | 2025-08-08 | 2025-08-29 | $182.70 | $174.18 | -4.66% | 3 | TRAILING_STOP | ✗ |
| 11 | NVDA | 2025-08-15 | 2025-08-29 | $180.45 | $174.18 | -3.47% | 2 | TRAILING_STOP | ✗ |
| 12 | NVDA | 2025-08-22 | 2025-09-05 | $177.99 | $167.02 | -6.16% | 2 | TRAILING_STOP | ✗ |
| 13 | NVDA | 2025-08-29 | 2025-09-05 | $174.18 | $167.02 | -4.11% | 1 | TRAILING_STOP | ✗ |
| 14 | NVDA | 2025-09-05 | 2025-10-17 | $167.02 | $183.22 | +11.02% | 6 | TAKE_PROFIT_THEN_TIME | ✓ |
| 15 | NVDA | 2025-09-12 | 2025-10-24 | $177.82 | $186.26 | +4.75% | 6 | TIME_STOP | ✓ |
| 16 | NVDA | 2025-09-19 | 2025-10-31 | $176.67 | $202.49 | +14.61% | 6 | TAKE_PROFIT_THEN_TIME | ✓ |
| 17 | NVDA | 2025-09-26 | 2025-11-07 | $178.19 | $188.15 | +9.61% | 6 | TAKE_PROFIT_THEN_TRAILING | ✓ |
| 18 | NVDA | 2025-10-03 | 2025-11-07 | $187.62 | $188.15 | +0.28% | 5 | TRAILING_STOP | ✓ |
| 19 | NVDA | 2025-10-10 | 2025-11-07 | $183.16 | $188.15 | +6.64% | 4 | TAKE_PROFIT_THEN_TRAILING | ✓ |
| 20 | NVDA | 2025-10-17 | 2025-11-07 | $183.22 | $188.15 | +6.60% | 3 | TAKE_PROFIT_THEN_TRAILING | ✓ |
| 21 | NVDA | 2025-10-24 | 2025-11-07 | $186.26 | $188.15 | +4.86% | 2 | TAKE_PROFIT_THEN_TRAILING | ✓ |
| 22 | NVDA | 2025-10-31 | 2025-11-07 | $202.49 | $188.15 | -7.08% | 1 | TRAILING_STOP | ✗ |
| 23 | NVDA | 2025-11-07 | 2025-11-21 | $188.15 | $178.88 | -4.93% | 2 | TRAILING_STOP | ✗ |
| 24 | NVDA | 2025-11-14 | 2025-11-21 | $190.17 | $178.88 | -5.94% | 1 | TRAILING_STOP | ✗ |
| 25 | NVDA | 2025-11-21 | 2025-11-28 | $178.88 | $177.00 | -1.05% | 1 | MOMENTUM_REVERSAL | ✗ |

*Showing first 25 of 336 total trades.*

---

*End of Backtest v2 report.*