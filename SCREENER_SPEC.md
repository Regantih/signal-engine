# Screener Spec — Signal Mapping

## Screener Definitions

### 1. MOMENTUM_SURGE
- Source: finance_market_gainers (top 20)
- Trigger: Stock up >5% today with volume > 2x average
- Attribution text: "Momentum Surge — up {X}% today on {Y}x normal volume"

### 2. MEAN_REVERSION_DIP
- Source: finance_market_losers (top 20) + finance_quotes (52-week data)
- Trigger: Stock down >5% but still above 52-week low by >20%, AND quality fundamentals are strong
- Attribution: "Mean Reversion — dropped {X}% but fundamentals intact (ROE {Y}%, gross margin {Z}%)"

### 3. VOLUME_ANOMALY
- Source: finance_market_most_active (top 20)
- Trigger: Volume > 3x average with price move < 2% (accumulation/distribution signal)
- Attribution: "Volume Anomaly — {X}x normal volume with minimal price movement (possible accumulation)"

### 4. INSIDER_BUYING
- Source: finance_insider_transactions (for each candidate)
- Trigger: Net insider purchases > $100K in last 3 months
- Attribution: "Insider Buying — {X} insiders bought ${Y} in last 3 months"

### 5. ANALYST_UPGRADE_WAVE
- Source: finance_analyst_research (for each candidate)
- Trigger: >70% buy ratings AND average price target > 20% above current price
- Attribution: "Analyst Consensus — {X}% buy ratings, avg target ${Y} ({Z}% upside)"

### 6. QUALITY_VALUE
- Source: finance_company_ratios + finance_quotes
- Trigger: ROE > 20%, gross margin > 40%, P/E < 25, debt/equity < 0.5
- Attribution: "Quality Value — ROE {X}%, margin {Y}%, P/E {Z}, low debt"

## Output Schema

Each screener returns:
```json
{
  "screenerId": "MOMENTUM_SURGE",
  "screenerName": "Momentum Surge",
  "ticker": "AAPL",
  "reason": "Up 7.2% today on 3.4x normal volume",
  "confidence": 0.75,
  "dataSnapshot": { ... raw data used ... }
}
```

## Opportunity Attribution

When a ticker is surfaced by screeners and auto-added as an opportunity:
- `screenerFlags` field stores JSON: `[{"id": "MOMENTUM_SURGE", "name": "Momentum Surge", "reason": "...", "confidence": 0.75, "detectedAt": "..."}]`
- Multiple screeners can flag the same ticker (convergence = higher conviction)
- The UI shows colored badges for each screener that flagged it
