# Signal Engine — Historical Backtest Results

> Generated: 2026-03-29 19:11:53  
> Period: **2025-03-07 → 2026-03-27** (56 weekly bars per ticker)  
> Universe: NVDA, AAPL, MSFT, TSLA, META, GOOGL, AMZN, JPM, JNJ, PLTR  
> Methodology: Rolling 12-week signal window · 4-week forward hold · BUY signals only

---

## 1. Scoring Formula

```
Score = w1·Z(momentum) + w2·Z(meanReversion) + w3·Z(quality)
      + w4·Z(flow) − w5·Z(risk) − w6·Z(crowding)

Z(x) = (x − 50) / 16.67

Weights: momentum=0.20, meanReversion=0.15, quality=0.25,
         flow=0.15, risk=0.15, crowding=0.10

Probability = 1 / (1 + exp(−1.5 · Score))
Kelly       = clamp(0.25 · (P·2 − (1−P)) / 2,  0, 0.25)
Action      = BUY  if P ≥ 0.55 and edge > 0.10
            = SELL if edge < −0.10
            = WATCH otherwise
```

---

## 2. Per-Ticker Results

| Ticker | Trades | Wins | Losses | Hit Rate | Avg Ret | Avg Win | Avg Loss | Total P&L | Buy & Hold |
|--------|-------:|-----:|-------:|---------:|--------:|--------:|---------:|----------:|-----------:|
| NVDA | 36 | 22 | 14 | 61.1% | +2.12% | +6.60% | -4.93% | +76.19% | +48.66% |
| AAPL | 39 | 28 | 11 | 71.8% | +2.30% | +5.30% | -5.33% | +89.83% | +4.07% |
| MSFT | 40 | 17 | 23 | 42.5% | -1.81% | +3.31% | -5.59% | -72.37% | -9.29% |
| TSLA | 0 | 0 | 0 | n/a | n/a | n/a | n/a | +0.00% | +37.75% |
| META | 34 | 13 | 21 | 38.2% | -1.88% | +5.21% | -6.28% | -64.06% | -15.97% |
| GOOGL | 40 | 28 | 12 | 70.0% | +5.85% | +10.22% | -4.35% | +233.97% | +57.79% |
| AMZN | 35 | 16 | 19 | 45.7% | -0.74% | +5.23% | -5.77% | -25.95% | +0.05% |
| JPM | 39 | 22 | 17 | 56.4% | +0.60% | +4.26% | -4.14% | +23.37% | +16.74% |
| JNJ | 40 | 32 | 8 | 80.0% | +4.61% | +6.27% | -2.02% | +184.44% | +44.25% |
| PLTR | 0 | 0 | 0 | n/a | n/a | n/a | n/a | +0.00% | +68.48% |

---

## 3. Overall Portfolio Summary

| Metric | Value |
|--------|-------|
| Total trades | 303 |
| Wins / Losses | 178 / 125 |
| Hit rate | 58.75% |
| Avg return per trade | +1.47% |
| Avg win | +6.08% |
| Avg loss | -5.09% |
| Expectancy per trade | +1.47% |
| Sum P&L (equal-weight, additive) | +445.43% |
| Sharpe-like ratio (annualised) | +0.753 |
| Avg buy-and-hold return (portfolio) | +25.25% |

---

## 4. Buy-and-Hold vs Signal Engine

| Ticker | B&H Return | Signal Sum P&L | Signal Outperforms? |
|--------|----------:|---------------:|:-------------------:|
| NVDA | +48.66% | +76.19% | ✗ |
| AAPL | +4.07% | +89.83% | ✓ |
| MSFT | -9.29% | -72.37% | ✗ |
| TSLA | +37.75% | +0.00% | ✗ |
| META | -15.97% | -64.06% | ✗ |
| GOOGL | +57.79% | +233.97% | ✓ |
| AMZN | +0.05% | -25.95% | ✗ |
| JPM | +16.74% | +23.37% | ✗ |
| JNJ | +44.25% | +184.44% | ✓ |
| PLTR | +68.48% | +0.00% | ✗ |

> **Note:** B&H is a single buy at first available date, held through 2026-03-27.  
> Signal P&L is the sum of all individual 4-week trade returns (additive, uncompounded,  
> one unit per trade). Direct comparison requires normalising for number of trades and  
> capital deployed. Treat this table as directional, not precise.

---

## 5. Signal Contribution Analysis

Point-biserial correlation between each signal value at entry and win/loss outcome.

| Signal | Correlation | Strength | Direction |
|--------|------------:|:---------|:----------|
| mean_reversion | -0.1553 | moderate | bearish ↓ |
| risk | +0.1093 | weak | bullish ↑ |
| momentum | +0.1089 | weak | bullish ↑ |
| crowding | -0.0892 | weak | bearish ↓ |
| flow | -0.0404 | negligible | bearish ↓ |
| composite_score | -0.0278 | negligible | bearish ↓ |
| quality | +0.0135 | negligible | bullish ↑ |

**How to read this table:**
- A positive correlation means a higher signal value was associated with wins.
- Momentum and mean_reversion should ideally have opposite signs (momentum positive,
  mean_reversion negative), since high momentum = bullish, but high mean_reversion
  score = oversold / below SMA.
- The composite_score correlation is the best single summary of formula power.

---

## 6. Honest Assessment: Does This Formula Have Predictive Edge?

### Key Metrics vs Thresholds

| Metric | Value | Threshold | Pass? |
|--------|------:|----------:|:-----:|
| Hit rate | 58.7% | > 50% | ✓ |
| Expectancy | +1.47% | > 0% | ✓ |
| Sharpe-like | +0.753 | > 0.50 | ✓ |

### Verdict: ✅ POSITIVE EDGE DETECTED

All three primary metrics pass. The formula shows statistically plausible
positive expectancy over this dataset.

**Caveats:** With only 12 months of data and 10 tickers, the sample is small.
Over-fitting risk is real. The fixed quality and crowding inputs limit
adaptability to regime changes. Do not treat this as proof of live-trading edge
without out-of-sample validation.

### Structural Limitations of This Backtest

| Limitation | Severity | Notes |
|------------|:--------:|-------|
| No transaction costs | Medium | 0.1–0.2% round-trip would reduce returns |
| Static quality signal | High | 25% weight never changes — not a signal |
| Static crowding signal | Medium | 10% weight never changes |
| Small sample (10 tickers) | High | Low statistical power; high luck factor |
| Single 12-month window | High | No out-of-sample period |
| All large-cap US equities | Medium | High inter-stock correlation; not diversified |
| No position sizing | Low | Kelly sizing not applied to compound returns |
| 4-week hold period untested | Medium | Optimal hold not determined |
| Overlapping trades ignored | Low | Multiple BUY signals on same ticker can overlap |

---

## 7. Sample Trade Log (First 20 BUY Trades)

| # | Ticker | Entry Date | Exit Date | Entry Price | Exit Price | Return | Win? |
|---|--------|-----------|----------|------------:|-----------:|-------:|:----:|
| 1 | NVDA | 2025-05-30 | 2025-06-27 | $135.13 | $157.75 | +16.74% | ✓ |
| 2 | NVDA | 2025-06-06 | 2025-07-03 | $141.72 | $159.34 | +12.43% | ✓ |
| 3 | NVDA | 2025-06-20 | 2025-07-18 | $143.85 | $172.41 | +19.85% | ✓ |
| 4 | NVDA | 2025-06-27 | 2025-07-25 | $157.75 | $173.50 | +9.98% | ✓ |
| 5 | NVDA | 2025-07-03 | 2025-08-01 | $159.34 | $173.72 | +9.02% | ✓ |
| 6 | NVDA | 2025-07-11 | 2025-08-08 | $164.92 | $182.70 | +10.78% | ✓ |
| 7 | NVDA | 2025-07-18 | 2025-08-15 | $172.41 | $180.45 | +4.66% | ✓ |
| 8 | NVDA | 2025-07-25 | 2025-08-22 | $173.50 | $177.99 | +2.59% | ✓ |
| 9 | NVDA | 2025-08-01 | 2025-08-29 | $173.72 | $174.18 | +0.26% | ✓ |
| 10 | NVDA | 2025-08-08 | 2025-09-05 | $182.70 | $167.02 | -8.58% | ✗ |
| 11 | NVDA | 2025-08-15 | 2025-09-12 | $180.45 | $177.82 | -1.46% | ✗ |
| 12 | NVDA | 2025-08-22 | 2025-09-19 | $177.99 | $176.67 | -0.74% | ✗ |
| 13 | NVDA | 2025-08-29 | 2025-09-26 | $174.18 | $178.19 | +2.30% | ✓ |
| 14 | NVDA | 2025-09-05 | 2025-10-03 | $167.02 | $187.62 | +12.33% | ✓ |
| 15 | NVDA | 2025-09-12 | 2025-10-10 | $177.82 | $183.16 | +3.00% | ✓ |
| 16 | NVDA | 2025-09-19 | 2025-10-17 | $176.67 | $183.22 | +3.71% | ✓ |
| 17 | NVDA | 2025-09-26 | 2025-10-24 | $178.19 | $186.26 | +4.53% | ✓ |
| 18 | NVDA | 2025-10-03 | 2025-10-31 | $187.62 | $202.49 | +7.93% | ✓ |
| 19 | NVDA | 2025-10-10 | 2025-11-07 | $183.16 | $188.15 | +2.72% | ✓ |
| 20 | NVDA | 2025-10-17 | 2025-11-14 | $183.22 | $190.17 | +3.79% | ✓ |

*Showing first 20 of 303 total trades.*

---

*End of backtest report.*