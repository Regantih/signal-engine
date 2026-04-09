# Signal Engine Research Wiki

## Purpose
This wiki accumulates institutional knowledge about stock market signals, patterns, and prediction outcomes for the Signal Engine AI capital allocation system.

## Structure
- `raw/` — Source documents: prediction records, news, market events. NEVER modify these.
- `pages/tickers/` — One page per ticker with: current score, thesis history, prediction record, key patterns.
- `pages/patterns/` — Discovered patterns: conditions that led to wins/losses.
- `pages/analysis/` — Market analysis: regime changes, sector rotations, macro observations.
- `pages/macro/` — Macro environment: VIX regime observations, yield curve, sentiment.
- `pages/predictions/` — Summary of prediction outcomes by category.
- `index.md` — Content catalog with one-line summaries. Updated on every ingest.
- `log.md` — Append-only chronological event log.

## Ticker Page Schema
```markdown
# {TICKER} — Research Page

## Current Score
- Composite: {score}
- Conviction: {band}
- P(Success): {probability}
- Expected Edge: {edge}

## Thesis
{Latest AI-generated thesis}

## Signal Snapshot
| Signal | Score |
|--------|-------|
| Momentum | {value}/100 |
| Mean Reversion | {value}/100 |
| Quality | {value}/100 |
| Flow | {value}/100 |
| Risk | {value}/100 |
| Crowding | {value}/100 |

## Fundamentals
- Quality Grade: {A-F}
- Entry: ${price}
- Target: ${target}
- Stop: ${stop}

## Prediction History
| Date | Action | Score | Entry | Target | Stop | Outcome |
|------|--------|-------|-------|--------|------|---------|

## Observations
{Accumulated notes about this ticker}
```

## Pattern Page Schema
```markdown
# Pattern: {Name}

## Conditions
- {condition 1}
- {condition 2}

## Expected Outcome
{description}

## Confidence
{0-100}%

## Observations
| Date | Ticker | Result | Notes |
|------|--------|--------|-------|
```

## Ingestion Workflow
1. Read the raw document
2. Extract key facts, outcomes, and patterns
3. Create/update the relevant ticker page
4. If a new pattern is identified, create a pattern page
5. Update index.md
6. Append to log.md: `## [DATE] ingest | TYPE | TICKER`

## Query Workflow
1. Read index.md to find relevant pages
2. Read those pages
3. Synthesize answer with citations
4. If answer is valuable, save as a new analysis page
