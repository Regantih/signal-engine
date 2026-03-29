# Signal Engine Trading & Code Quality Audit

## 1. Executive Summary

**Overall Grade: C-**

The Signal Engine is an ambitious conceptual framework combining multiple alpha factors (momentum, mean reversion, quality, flow) with risk management and macro overlays. However, it currently functions more as a "toy model" or proof-of-concept rather than a production-ready trading system. 

While the general architecture and component separation are reasonably good, there are critical mathematical flaws in the scoring logic, unrealistic assumptions in the backtesting, and a lack of robustness required for live trading. **I would not trade my own money with this system in its current state.**

## 2. Detailed Findings by Category

### TRADING LOGIC
**Grade: D**

*   **Scoring Formula:** The core formula uses a standard Z-score normalization (`(value - 50) / 16.67`). However, it inherently assumes the raw 0-100 signals are normally distributed with a mean of 50. Since the signal generators (in `auto-signals.ts`) use arbitrary stepped bucketing (e.g., `if (x > y) score = 80`), the true distribution is likely heavily skewed or multimodal. This makes the Z-scores mathematically invalid and distorts the weighted composite score.
*   **Signal Computations:** The logic in `auto-signals.ts` uses highly arbitrary, hardcoded thresholds for scoring (e.g., in `computeMomentum`, `if (combined > 0.25) score = 90`). This is extremely brittle and will break as market volatility regimes change. There is no dynamic normalization based on historical cross-sectional or time-series distributions.
*   **Kelly Criterion:** The fractional Kelly implementation is technically correct in its formula: `f = c * (p * b - (1-p)) / b`. However, the inputs to it are fundamentally flawed. The probability `p` is derived from an arbitrary logistic sigmoid of the composite score, which has no proven correlation to *actual* historical win probability. Using synthetic probabilities in Kelly sizing is dangerous and will lead to rapid capital depletion.
*   **Risk Management:** The rules in `risk-manager.ts` are a mix of standard practices. A 3% trailing stop and 8% take-profit are sensible on a conceptual level, but applying them universally across all assets regardless of individual asset volatility (ATR) is suboptimal. A 3% stop on a highly volatile stock like TSLA will result in constant whipsaws.
*   **Macro Regime:** `macro-monitor.ts` uses hardcoded thresholds (e.g., `vixValue > 40`) to define regimes. Similar to signal computations, these are brittle. Furthermore, the `macroAdjustment` directly scales the dollar allocation linearly.
*   **Screeners:** The screeners largely rely on external data tools and parse basic conditions. The `volumeAnomalyScreener` arbitrarily sets a default volume ratio to 1.5 based purely on the row index if the actual ratio isn't found, which is a logic bug that fabricates data.

### CODE QUALITY
**Grade: C+**

*   **TypeScript:** The code makes reasonable use of TypeScript interfaces for structured data passing between modules. However, the heavy reliance on `any` types when parsing external tool responses undermines type safety in critical areas.
*   **Bugs & Error Handling:** 
    *   **External Tool Parsing:** Parsing markdown tables with string manipulation (`content.split("\n")`) to extract financial data is extremely fragile. A minor formatting change from the external tool will break the entire pipeline.
    *   **Silent Failures:** Functions like `callFinanceTool` catch errors and simply return `null` or log to the console, allowing the pipeline to continue with missing data rather than failing safely.
*   **Maintainability:** The modular structure (execution, scoring, risk, macro) is good and makes the system understandable. However, the sheer volume of hardcoded magic numbers scattered throughout the files severely harms maintainability.
*   **Performance/Memory:** Spawning synchronous shell processes (`execSync`) for every external API call in `callFinanceTool` is a major performance bottleneck and will block the Node.js event loop, preventing concurrent operations and scaling.

### TRADING REALISM
**Grade: F**

*   **Transaction Costs:** The scoring engine subtracts a fixed `transactionCostBps` (default 50 bps) from the expected edge. However, the backtest explicitly states "No transaction costs," meaning the reported historical edge is entirely fictional.
*   **Slippage & Liquidity:** There is zero modeling of slippage. Executing orders, especially at scale or on volume anomalies, will rarely occur at the exact last close price.
*   **Market Mechanics:** The system ignores pre-market/after-hours trading, stock splits, dividends, and corporate actions. 
*   **Execution Timing:** The system assumes trades can be entered exactly at the closing prices or computed prices without delay, which is impossible in live markets.

### BACKTEST VALIDITY
**Grade: F**

*   **Look-Ahead Bias:** By calculating a single static `yearHigh` and `yearLow` from the current point in time and applying it retroactively to historical signals, the system introduces massive look-ahead bias.
*   **Sample Size & Period:** The backtest was run on only 10 tickers over a single 12-month period. This is statistically insignificant. A robust backtest requires thousands of trades across multiple market cycles (bull, bear, sideways) and a much broader universe to prove out-of-sample edge.
*   **Static Factors:** According to the backtest reports, factors like "Quality" (25% weight) and "Crowding" (10% weight) were entirely static during the backtest period. This means 35% of the signal driving the model was completely invariant, severely undermining the integrity of the results.
*   **Overfitting:** The transition from Backtest V1 to V2 explicitly mentions tweaking crowding penalties for specific tickers (TSLA, PLTR) to improve results. This is textbook curve-fitting.

## 3. Critical Trading Logic Bugs

1.  **Synthetic Probabilities Feeding Kelly Formula:** The logistic sigmoid converts an arbitrary score into a "probability," which then drives the Kelly sizing. Because this probability does not reflect historical reality, the sizing engine will routinely over-allocate or under-allocate based on mathematical fiction.
2.  **Fabricated Screener Data:** The `volumeAnomalyScreener` assumes a volume ratio based purely on array index if the actual data is missing: `volRatio = Math.max(1.5, 5 - idx * 0.2);`. This triggers false anomalies.
3.  **Hardcoded, Asset-Agnostic Risk Stops:** A flat 3% trailing stop applied to both low-volatility (JNJ) and high-volatility (NVDA) assets guarantees poor execution due to whipsawing on volatile assets.
4.  **Look-Ahead Bias in Indicators:** Static `yearHigh` and `yearLow` values used in historical signal computations.
5.  **Fragile External Data Parsing:** Relying on markdown table string splitting to govern live financial decisions is highly prone to catastrophic failure.

## 4. Recommended Improvements (Ranked by Impact)

1.  **Refactor Probability & Sizing (High Impact):** Stop using the logistic sigmoid for probability. Implement an empirical probability model based on historical hit rates of specific score buckets, or transition to a much simpler fixed fractional position sizing until the model's predictive power is proven out-of-sample.
2.  **Volatility-Adjusted Risk Limits (High Impact):** Replace the static 3% stop and 8% take-profit with dynamic limits based on the Average True Range (ATR) or annualized volatility of the specific asset.
3.  **Robust Data Infrastructure (High Impact):** Replace the `execSync` external tool calls and fragile string parsing with a direct, typed connection to a reliable financial data API (e.g., Alpaca, Polygon, YFinance) that returns structured JSON.
4.  **Dynamic Signal Normalization (Medium Impact):** Remove the hardcoded tiered bucketing for signals. Normalize signals dynamically based on cross-sectional rankings within a sector or historical rolling Z-scores of the underlying metric.
5.  **Overhaul Backtesting Framework (Medium Impact):** Build a proper event-driven backtester that accounts for transaction costs, slippage, and uses point-in-time data to completely eliminate look-ahead bias. Expand the test universe to the S&P 500 over 10+ years.

## 5. Assessment

**"Would I trade my own money with this system?"**

Absolutely not. The mathematical foundation of the sizing algorithm relies on synthetic inputs, the signal generation is built on brittle, hardcoded rules, and the backtests exhibit severe look-ahead bias and overfitting over an inadequate sample size. Deploying capital with this system would almost certainly result in negative expectancy after real-world friction and regime shifts are realized.
