# Signal Engine — Renaissance-Style Capital Allocation OS

A quantitative signal aggregation engine inspired by Jim Simons and Renaissance Technologies. Scores opportunities across public markets, VC themes, content/brand, and side businesses using multi-signal Z-score normalization, logistic probability conversion, and fractional Kelly sizing.

## Mathematical Framework

```
Score_i = w1·Z(momentum) + w2·Z(mean_reversion) + w3·Z(quality) + w4·Z(flow) - w5·Z(risk) - w6·Z(crowding)

P(success) = σ(Score) = 1 / (1 + e^(-1.5·Score))

f_i = c · (p_i·b - (1-p_i)) / b    [Fractional Kelly, c=0.25]
```

## Features

### Core Scoring Engine
- **6-signal model**: Momentum, Mean Reversion, Quality, Flow, Risk, Crowding
- **Z-score normalization** with population mean=50, sd=16.67
- **Logistic sigmoid** probability conversion (steepness=1.5)
- **Fractional Kelly** position sizing (quarter-Kelly, 25% max per position)
- **Conviction bands**: High (P≥70%, Edge>0.3), Medium (P≥55%, Edge>0.1), Low, Avoid

### Cross-Domain Ranking
- **Public Markets**: Stocks, ETFs with live price tracking
- **VC Themes**: Funding velocity, team quality, market timing
- **Content / Brand**: Engagement, audience growth, differentiation
- **Side Businesses**: Revenue momentum, margin quality, scalability

### TradingView Integration
- **Lightweight Charts**: Interactive candlestick/line charts with entry, target, and stop loss price lines
- **Webhook Receiver**: `POST /api/webhooks/tradingview` for alert-based signal ingestion
- **Live Market Page**: Per-ticker chart cards with signal overlays

### Performance Tracking
- **$100 fixed budget** with fractional Kelly allocation
- **Live P&L** computation against entry prices
- **Immutable audit trail** with timestamped signal snapshots
- **Operating protocol** for public accountability

### Publish & Accountability
- **One-click publish** to LinkedIn/X with formatted signal post
- **Timestamped predictions** — no post-hoc editing
- **Signal breakdown** included for full transparency

## Tech Stack
- **Frontend**: React + Tailwind CSS v3 + shadcn/ui + TradingView Lightweight Charts
- **Backend**: Express + Drizzle ORM + SQLite (better-sqlite3)
- **Build**: Vite + esbuild

## Getting Started

```bash
npm install
npm run dev
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/opportunities` | List all opportunities |
| POST | `/api/opportunities` | Create & auto-score |
| POST | `/api/score` | Score arbitrary signals |
| POST | `/api/rescore-all` | Re-score all opportunities |
| GET | `/api/predictions` | Audit trail |
| GET | `/api/live-pnl` | Live P&L for buy positions |
| POST | `/api/webhooks/tradingview` | TradingView webhook |
| POST | `/api/publish` | Generate signal post |
| POST | `/api/market-data/seed` | Seed OHLCV data |

## Operating Protocol

1. Publish the signal at the moment of creation (timestamped)
2. Do not edit the thesis after posting
3. Update only the current mark and close status
4. Export the ledger periodically for public proof
5. Renaissance principle: many small edges, diversified positions, disciplined sizing

## License
MIT

---
*Inspired by the quantitative philosophy of Jim Simons and Renaissance Technologies: combine many weak signals, convert to probabilities, size with Kelly, and let the math do the work.*
