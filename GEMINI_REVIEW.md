# Signal Engine — A Practitioner's Perspective

**Date:** 2026-03-29
**Reviewer:** Senior Trading Systems Architect (ex-Goldman, Jane Street, Bridgewater)
**Objective:** Independent assessment complementing Claude's review, focusing on live trading viability, immediate alpha generation, and pragmatic engineering.

---

## 1. Grade & Pragmatic Assessment

Claude provided a good academic overview, but looking at this through the lens of a desk actually putting risk on, the perspective changes.

*   **Execution Quality: D**
    *   *Why:* The entire execution pipeline is built on `market` orders. In modern equities, especially on anything not in the top 100 most liquid names, executing market orders with a synthetic retail broker (Alpaca) guarantees you are giving up your edge to market makers. There's no implementation shortfall tracking. You're effectively paying a massive hidden tax on every trade. A 50bps "transaction cost" assumption is wildly optimistic for market orders on low-liquidity names.
*   **Signal Alpha: D-**
    *   *Why:* The signals are entirely derived from standard, freely available lagging indicators (SMA, RSI, raw financial ratios). In 2026, there is precisely zero retail edge in combining P/E ratios and 50-day moving averages. The market is too efficient. The only alpha here might be the *macro regime filter* preventing trades during major sell-offs, but the core signals themselves are noise masquerading as insight.
*   **Operational Resilience: F**
    *   *Why:* Claude noted the `execSync` blocking and missing transactions. But fundamentally, the architecture assumes happy paths. If Alpaca's API hiccups during the execution of a multi-leg trade (buy + attach bracket), you are left with naked risk. The lack of a separate reconciliation process (checking actual broker state vs. internal database state) means the system will inevitably drift from reality.
*   **Scalability: C**
    *   *Why:* It scales reasonably well *conceptually* because it evaluates positions independently. Technically, the polling loop in `realtime-engine.ts` hitting external APIs sequentially inside an Express server will fall over completely around 50-100 tickers due to rate limits and single-thread blocking.
*   **Competitive Differentiation: F**
    *   *Why:* Why would anyone pay for this or use it over a basic TradingView script? There's no proprietary data, no sophisticated execution, and no novel factor model. It's a nicely UI-wrapped version of a beginner quant curriculum.

---

## 2. Top 10 Things That Would Actually Make Money (Ranked by P&L Impact)

*If we assume a $1,000 - $10,000 portfolio.*

1.  **Switch to Limit Orders / Smart Routing (Expected Impact: +$50 - $200/yr per $1k deployed)**
    *   *Action:* Never use `type: "market"`. Implement a simple peg-to-midpoint or a limit order at the ask (for buys) with a timeout and retry. The spread cost on Alpaca for market orders will eat the entire account.
2.  **Trade Universe Restriction (Expected Impact: Prevents blowups)**
    *   *Action:* Hardcode the universe to the S&P 500 or NASDAQ 100. The current system seems to allow scanning arbitrary tickers. Applying these signals to a $50M market cap penny stock will result in a 10% slippage on entry and exit. High-liquidity names only.
3.  **Implement a True Cash/Sweep Yield (Expected Impact: +$40-$50/yr per $1k un-deployed)**
    *   *Action:* The strategy likely sits in cash frequently (especially during the `CRISIS` macro regime). Ensure that un-invested cash is automatically sweeping into a money market or short-term treasury ETF (e.g., SGOV, BIL). Cash drag is real.
4.  **Short Volatility / Yield Harvesting vs. Directional Bets (Expected Impact: Consistent baseline return)**
    *   *Action:* The current system only buys directional equity. The easiest retail edge is collecting premium. Shift the system from outright stock buys to selling out-of-the-money cash-secured puts on the same "high quality/momentum" names.
5.  **Remove the "Take Profit" at +8% (Expected Impact: Let winners run)**
    *   *Action:* The system cuts winners at 8% but lets losers hit a trailing stop. Mathematically, momentum strategies *require* fat right tails (outliers) to be profitable because the win rate is usually <50%. Capping the upside at 8% breaks the expected value equation of trend following. Let the trailing stop do its job for exits.
6.  **Implement Sector Neutrality (Expected Impact: Reduced beta risk)**
    *   *Action:* The current system will just load up on 10 tech stocks if tech is running. Enforce a rule: max 2 positions per GICS sector. This turns the strategy into a pseudo long/short (by being relatively underweight the market) rather than just levered beta.
7.  **Time-of-Day Execution Restrictions (Expected Impact: -10bps slip per trade)**
    *   *Action:* Never execute in the first 15 minutes or last 15 minutes of the trading day. Volatility and spreads are highest. Schedule pipeline executions for 10:30 AM or 2:00 PM EST.
8.  **Incorporate "Short Interest" as a Primary Signal (Expected Impact: True alpha source)**
    *   *Action:* Instead of lagging RSI, use Short Interest % of Float. High short interest + rising momentum = short squeeze potential. This is a behavioral edge that still exists in retail markets.
9.  **Ditch the Kelly Criterion for Retail Portfolios (Expected Impact: Avoid ruin)**
    *   *Action:* Kelly sizing assumes you know your edge and probability exactly. You don't. Using Kelly here guarantees over-sizing. Switch to a fixed fractional sizing model (e.g., 2-5% of portfolio equity per trade, regardless of the 'conviction' score).
10. **Automate Tax-Loss Harvesting (Expected Impact: Tax alpha)**
    *   *Action:* Near year-end, if positions are underwater and the macro regime is weak, systematically close them and swap to a highly correlated ETF for 31 days to book the loss while maintaining exposure.

---

## 3. The Kill List (What to remove)

These features add risk, complexity, or false confidence without contributing to P&L.

1.  **The "Quality" Signal (25% weight): KILL**
    *   Financial ratios (P/E, Debt/Equity) update quarterly. Trading on a daily/weekly timeframe using static quarterly data is pointless noise. It just biases the portfolio toward value stocks, which you can achieve by buying a value ETF.
2.  **Fractional Kelly Sizing: KILL**
    *   It relies on `empiricalProbability` which is derived from a tiny, over-fit backtest. It will lead to wild swings in position size based on statistically insignificant past performance. Use fixed percentages.
3.  **The Logistic Sigmoid Probability Conversion: KILL**
    *   It's mathematical theater. Turning an arbitrary 0-100 score into a probability using a sigmoid function doesn't make it an actual probability. It gives the user false confidence.
4.  **The `execSync` Call Pattern: KILL AND REWRITE**
    *   It's a ticking time bomb for system stability.
5.  **Manual "What-If" and UI Adjustments for Financials: KILL**
    *   Allowing the user to `PATCH` their total P&L or Win Rate destroys the integrity of the system's ledger. The system must be the source of truth based on actual broker clearing data.

---

## 4. The Honest Question

**"If someone gave you $10,000 and said run this system for 6 months, what would you change FIRST?"**

I would immediately rewrite the execution engine to reconcile against the broker.

Right now, the system says "I placed a buy order, so my internal state is now `status: 'buy'`."
**This is the cardinal sin of trading systems.**

If I give it $10,000, I need a background job running every 5 minutes that says:
1.  Ask Alpaca: "What positions do I hold? What is my cash?"
2.  Ask Database: "What positions do you think I hold?"
3.  **Force the database to match Alpaca.**

If the system gets out of sync, the risk manager will fail to fire, trailing stops won't execute, and the kill switch will evaluate the wrong equity curve. Before I care about signals or machine learning, I must guarantee that the system's map matches the territory.

---

## 5. Missing Data Sources (Highest Signal-to-Noise)

Ranked by a combination of accessibility, signal strength, and effort.

1.  **Corporate Insider Insider Buying (Form 4s)**
    *   *Accessibility:* High (Free via SEC EDGAR APIs or cheap aggregators).
    *   *Signal Strength:* Very High. When the CFO buys $1M of stock on the open market, it is a vastly stronger signal than an RSI crossing 30.
    *   *Implementation:* Easy. Parse feed, add "+20 to Conviction" if multi-insider buying in last 14 days.
2.  **Options Order Flow (Unusual Options Activity)**
    *   *Accessibility:* Paid (e.g., Unusual Whales API, CBOE data).
    *   *Signal Strength:* High. Tracks smart money leverage.
    *   *Implementation:* Medium. Requires interpreting put/call ratios and identifying sweep vs. block orders.
3.  **Retail Sentiment / Mentions (Reddit/X)**
    *   *Accessibility:* Medium (Requires scraping or paid APIs like SwaggyStocks).
    *   *Signal Strength:* High (for short-term momentum and mean-reversion).
    *   *Implementation:* Hard. NLP sentiment is noisy, but raw volume of mentions is a great proxy for the "Crowding" penalty factor.
