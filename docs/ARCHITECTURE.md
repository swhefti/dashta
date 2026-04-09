# Architecture — aiMATA v2

## System Overview

```
┌─────────────────────────────────────────────────────────┐
│                   GitHub Actions (Cron)                   │
│                  Daily at market close                    │
└──────────────────────┬──────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────┐
│              Scoring Orchestrator (src/scoring/index.ts)  │
│                                                          │
│  1. Load scoring_weights for each time horizon           │
│  2. For each horizon (3mo, 6mo, 12mo):                   │
│     a. Create scoring_run record                         │
│     b. Load data via data loaders                        │
│     c. Calculate all risk sub-scores                     │
│     d. Calculate all upward probability sub-scores       │
│     e. Normalize via percentile rank                     │
│     f. Compose weighted averages                         │
│     g. Write ticker_scores                               │
│     h. Mark scoring_run complete                         │
└──────────────────────┬──────────────────────────────────┘
                       │
          ┌────────────┴────────────┐
          ▼                         ▼
┌──────────────────┐     ┌──────────────────┐
│   Existing Data   │     │   New Tables      │
│   (read only)     │     │   (write)         │
│                   │     │                   │
│ • asset_universe  │     │ • scoring_runs    │
│ • price_history   │     │ • ticker_scores   │
│ • market_quotes   │     │ • scoring_weights │
│ • fundamental_data│     │                   │
│ • news_data       │     │                   │
│ • agent_scores    │     │                   │
│ • macro_events    │     │                   │
└──────────────────┘     └────────┬──────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────┐
│              Next.js Dashboard (Vercel)                   │
│                                                          │
│  /api/scores?horizon=3  →  reads ticker_scores           │
│                                                          │
│  ┌─────────────────────────────────────────────────┐     │
│  │          D3.js Bubble Chart                      │     │
│  │                                                  │     │
│  │  Y: Upward Probability  ▲                        │     │
│  │                         │  ○  ●    ◉             │     │
│  │                         │    ○   ●               │     │
│  │                         │  ●   ○                 │     │
│  │                         └──────────── ▶ X: Risk  │     │
│  │                                                  │     │
│  │  Features:                                       │     │
│  │  • Zoom / Pan (d3-zoom)                          │     │
│  │  • Hover tooltips                                │     │
│  │  • Click for detail panel                        │     │
│  │  • Asset class filter                            │     │
│  │  • Ticker search                                 │     │
│  │  • Time horizon selector                         │     │
│  └─────────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────┘
```

## Data Flow

```
Twelve Data / Finnhub  →  Supabase (existing pipeline from aiMAIA)
                              │
                              ▼
                     Scoring Engine (this project)
                              │
                              ▼
                     ticker_scores table
                              │
                              ▼
                     Next.js API route
                              │
                              ▼
                     D3 Bubble Chart
```

## Key Design Decisions

1. **Separate schema, shared database**: New tables live alongside existing ones. Zero risk of breaking aiMAIA/aiMATA.

2. **Percentile normalization**: All scores are relative rankings, not absolute. This ensures good visual spread on the chart regardless of market conditions.

3. **Weight table**: Scoring weights are in the database, not hardcoded. Allows tuning without deploys.

4. **D3 over Recharts/Chart.js**: The zoom/pan requirement for dense clusters demands D3's low-level control. Recharts can't do this well.

5. **Logarithmic bubble sizing**: Market cap spans $1B to $3T+. Log scale prevents mega-caps from dominating visually while still showing relative size differences.
