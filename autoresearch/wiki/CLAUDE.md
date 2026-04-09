# Signal Engine Research Wiki

## Purpose
This wiki accumulates institutional knowledge about stock market signals, patterns, and prediction outcomes for the Signal Engine AI capital allocation system. It follows Karpathy's LLM wiki pattern: a directory of markdown files organized into raw sources and generated wiki pages, with an index, log, and schema.

## Structure
- `raw/` — Source documents: prediction records, news, market events. NEVER modify these after creation.
- `raw/predictions/` — Individual prediction outcome records (win/loss/pending).
- `pages/tickers/` — One page per ticker with: current score, thesis history, prediction record, key patterns.
- `pages/patterns/` — Discovered patterns: conditions that led to wins/losses (e.g., "VIX spike momentum reversal").
- `pages/analysis/` — Market analysis: regime changes, sector rotations, macro observations.
- `pages/macro/` — Macro environment pages: VIX regime observations, yield curve, sentiment.
- `pages/predictions/` — Summary of prediction outcomes by category.
- `index.md` — Catalog of all pages with 1-line summary. Updated on every ingest.
- `log.md` — Append-only log of all ingests. Never delete entries.
- `CLAUDE.md` — This file. Schema and instructions for maintaining the wiki.

## Page Templates

### Ticker Page (`pages/tickers/{TICKER}.md`)
```markdown
# {TICKER} — Research Page

## Current Snapshot
- **Score**: {compositeScore} | **Conviction**: {convictionBand}
- **Price**: ${entryPrice} | **Target**: ${targetPrice} | **Stop**: ${stopLoss}
- **Signals**: Mom {momentum} | MR {meanReversion} | Qual {quality} | Flow {flow} | Risk {risk} | Crowd {crowding}

## AI Thesis
{latest thesis text}

## Prediction Record
| Date | Action | Entry | Target | Stop | Outcome | P&L |
|------|--------|-------|--------|------|---------|-----|
| {date} | {action} | ${entry} | ${target} | ${stop} | {WIN/LOSS/PENDING} | {pnl}% |

## Key Patterns
- {pattern observations for this ticker}

## Fundamentals
- P/E: {pe} | ROE: {roe}% | Gross Margin: {gm}%
- Quality Grade: {grade}

---
Last updated: {timestamp}
```

### Pattern Page (`pages/patterns/{pattern-slug}.md`)
```markdown
# Pattern: {Pattern Name}

## Description
{What this pattern represents}

## Conditions
- {condition 1}
- {condition 2}

## Historical Outcomes
- Win rate: {x}% over {n} observations
- Avg return: {y}%

## Examples
| Date | Ticker | Outcome | Return |
|------|--------|---------|--------|
| {date} | {ticker} | {WIN/LOSS} | {return}% |

## Confidence: {0-100}

---
Last updated: {timestamp}
```

### Macro Page (`pages/macro/{observation-slug}.md`)
```markdown
# Macro: {Observation Title}

## Regime
{RISK_ON / NEUTRAL / RISK_OFF / CRISIS}

## Key Indicators
- VIX: {value} ({signal})
- S&P 500: {value} ({change}%)
- 10Y Yield: {value}
- DXY: {value}

## Market Implications
{What this regime means for signal weights and position sizing}

---
Observed: {timestamp}
```

## Ingestion Workflow
1. Receive data (prediction outcome, macro snapshot, ticker score)
2. Write raw document to `raw/` (immutable)
3. Create or update the relevant page in `pages/`
4. If a new pattern is identified, create a pattern page
5. Update `index.md` with new/changed pages
6. Append to `log.md`: `## [{DATE}] {type} | {source} | {ticker}`

## Query Workflow
1. Read `index.md` to find relevant pages
2. Read those pages for content
3. Synthesize answer with citations to specific pages
4. If answer reveals a new insight, save as an analysis page

## File Naming Conventions
- Ticker pages: `pages/tickers/{TICKER}.md` (uppercase, e.g., `NKE.md`)
- Pattern pages: `pages/patterns/{slug}.md` (lowercase-hyphenated, e.g., `momentum-reversal.md`)
- Macro pages: `pages/macro/{slug}.md` (lowercase-hyphenated, e.g., `risk-off-regime.md`)
- Analysis pages: `pages/analysis/{date}-{slug}.md` (e.g., `2026-04-09-sector-rotation.md`)
- Raw predictions: `raw/predictions/{TICKER}-{date}-{outcome}.md` (e.g., `NKE-2026-04-09-win.md`)

## Rules
1. Raw documents are IMMUTABLE — never modify after creation.
2. Pages are MUTABLE — update as new information arrives.
3. Log entries are APPEND-ONLY — never delete.
4. Index must always reflect the current state of all pages.
5. All dates use ISO format (YYYY-MM-DD).
6. All prices use USD with 2 decimal places.
7. Signal scores are on 0-100 scale.
