# CLAUDE.md — aiMATA v2: Risk × Upward Probability Radar

## What This Project Is

A single-page interactive bubble chart dashboard that plots ~100 financial assets on a 2D field:
- **X-axis**: Risk Score (1–100)
- **Y-axis**: Upward Probability Score (1–100)
- **Bubble size**: Market capitalization (larger cap = bigger bubble)
- **Bubble color**: Asset class (stocks = one color, ETFs = another, crypto = another)
- **Time horizon**: Variable (3mo, 6mo, 12mo) — user-selectable

The dashboard must be zoomable and pannable so tightly clustered tickers can be distinguished.

## Heritage

This project is a pivot from two sister projects that share the same Supabase database:
- **aiMAIA** (github.com/swhefti/aimaia) — Multi-agent investment advisor with 5-layer pipeline
- **aiMATA** (github.com/swhefti/aimata) — Earlier pivot

The existing Supabase project `xrsyshxvrikfhwdsreqv` already contains:
- `asset_universe` — the 100 tickers (60 US stocks, 20 ETFs, 20 crypto)
- `price_history` — daily OHLCV data
- `market_quotes` — latest quotes
- `fundamental_data` — P/E, debt/equity, earnings, etc.
- `news_data` — news articles with sentiment
- `agent_scores` — existing agent scores (technical, sentiment, fundamental, regime)
- `macro_events` — macro/economic events

Claude Code has MCP access to Supabase. Use it to inspect the exact schema before writing any queries.

## New Schema Required

Create a NEW schema/set of tables — do NOT modify existing tables. The new tables:

### `scoring_runs`
Track each daily scoring execution.
```sql
CREATE TABLE scoring_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_date DATE NOT NULL,
  time_horizon_months INTEGER NOT NULL,  -- 3, 6, 12, etc.
  status TEXT NOT NULL DEFAULT 'pending', -- pending, running, completed, failed
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE UNIQUE INDEX idx_scoring_runs_date_horizon ON scoring_runs(run_date, time_horizon_months);
```

### `ticker_scores`
The core output: one row per ticker per run.
```sql
CREATE TABLE ticker_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scoring_run_id UUID REFERENCES scoring_runs(id),
  ticker TEXT NOT NULL,
  asset_class TEXT NOT NULL,           -- 'stock', 'etf', 'crypto'
  time_horizon_months INTEGER NOT NULL,
  
  -- Composite scores (what gets plotted)
  risk_score NUMERIC(5,2) NOT NULL,           -- 1.00 to 100.00
  upward_probability_score NUMERIC(5,2) NOT NULL, -- 1.00 to 100.00
  
  -- Risk sub-scores
  volatility_score NUMERIC(5,2),
  max_drawdown_score NUMERIC(5,2),
  beta_score NUMERIC(5,2),
  liquidity_risk_score NUMERIC(5,2),
  fundamental_fragility_score NUMERIC(5,2),
  
  -- Upward probability sub-scores
  trend_momentum_score NUMERIC(5,2),
  mean_reversion_score NUMERIC(5,2),
  fundamental_value_score NUMERIC(5,2),
  sentiment_score NUMERIC(5,2),
  macro_regime_score NUMERIC(5,2),
  seasonal_score NUMERIC(5,2),
  
  -- Display data
  market_cap BIGINT,                   -- for bubble size
  current_price NUMERIC(12,4),
  company_name TEXT,
  
  -- Metadata
  score_date DATE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_ticker_scores_run ON ticker_scores(scoring_run_id);
CREATE INDEX idx_ticker_scores_date_horizon ON ticker_scores(score_date, time_horizon_months);
CREATE INDEX idx_ticker_scores_ticker ON ticker_scores(ticker);
```

### `scoring_weights`
Configurable weights per time horizon, so we can tune without code changes.
```sql
CREATE TABLE scoring_weights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  time_horizon_months INTEGER NOT NULL,
  score_type TEXT NOT NULL,            -- 'risk' or 'upward_probability'
  component TEXT NOT NULL,             -- e.g., 'volatility', 'trend_momentum'
  weight NUMERIC(4,3) NOT NULL,        -- 0.000 to 1.000
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE UNIQUE INDEX idx_scoring_weights_unique ON scoring_weights(time_horizon_months, score_type, component);
```

## Scoring Engine

### Risk Score (1–100): "How much can this hurt me?"

| Component | Default Weight (3mo) | Weight (12mo) | Data Source |
|---|---|---|---|
| Realized Volatility | 0.30 | 0.25 | `price_history` → std dev of log returns |
| Max Drawdown | 0.25 | 0.20 | `price_history` → worst peak-to-trough |
| Beta to SPY | 0.15 | 0.15 | `price_history` → regression vs SPY |
| Liquidity Risk | 0.15 | 0.15 | `market_quotes` → avg daily $ volume |
| Fundamental Fragility | 0.15 | 0.25 | `fundamental_data` → D/E, interest coverage |

Lookback window = `1.5 × time_horizon_months` of trading days.
All sub-scores normalized 1–100 using percentile rank within the universe.

### Upward Probability (1–100): "Will this go up?"

| Component | Default Weight (3mo) | Weight (12mo) | Data Source |
|---|---|---|---|
| Trend Momentum | 0.25 | 0.15 | `price_history` → MA crossovers, MACD, ADX |
| Mean Reversion (RSI) | 0.15 | 0.10 | `price_history` → 14d RSI |
| Fundamental Value | 0.20 | 0.30 | `fundamental_data` → fwd P/E, PEG, EPS growth |
| Sentiment | 0.20 | 0.20 | `news_data` → aggregated sentiment |
| Macro Regime | 0.10 | 0.10 | `agent_scores` (regime agent) + `macro_events` |
| Seasonal Win Rate | 0.10 | 0.15 | `price_history` → historical N-month return sign |

Sub-scores normalized 1–100 using percentile rank within the universe.

### Time Horizon Parameter

`time_horizon_months` affects:
1. **Lookback window**: `floor(1.5 × horizon × 21)` trading days
2. **MA periods**: 3mo uses 20d/50d, 6mo uses 50d/100d, 12mo uses 100d/200d
3. **Weight redistribution**: Longer horizons → more fundamental, less momentum (stored in `scoring_weights`)
4. **Seasonal analysis**: Uses matching historical period lengths

## Tech Stack

| Layer | Technology | Why |
|---|---|---|
| Database | Supabase (existing project) | Already has all market data |
| Scoring engine | TypeScript / Node.js | Consistent with aiMAIA |
| Dashboard | Next.js 14 + React | Consistent with aiMAIA |
| Chart library | **D3.js** | Full zoom/pan control, custom bubble rendering |
| Styling | Tailwind CSS | Consistent with aiMAIA |
| Scheduling | GitHub Actions (cron) | Consistent with aiMAIA |
| Deployment | Vercel | Consistent with aiMAIA |

## Dashboard Requirements

### Bubble Chart (Primary View)
- D3.js scatter/bubble plot with zoom + pan (d3-zoom)
- Each bubble: ticker label visible, tooltip on hover with full score breakdown
- Bubble size: logarithmic scale of market cap (so AAPL doesn't eat the screen)
- Color by asset class: 4 distinct colors for stocks, ETFs, crypto, and maybe a 4th if needed
- Time horizon selector: tabs or dropdown for 3mo / 6mo / 12mo
- Quadrant labels: top-left "Low Risk, High Upward" (sweet spot), etc.
- Grid lines at 25, 50, 75 for visual reference
- Responsive: works on desktop and tablet

### Interaction
- **Zoom**: Mouse wheel / pinch to zoom into dense clusters
- **Pan**: Click-drag to move around
- **Hover**: Tooltip showing ticker, company name, both scores, market cap, all sub-scores
- **Click**: Opens a detail panel/modal with score history over time
- **Filter**: Toggle asset classes on/off
- **Search**: Find a specific ticker and highlight it

## Folder Structure

```
aimata-v2/
├── CLAUDE.md                      # ← YOU ARE HERE — master brief
├── README.md                      # Project overview
├── package.json                   # Root workspace config
├── tsconfig.json
├── .env.example
├── .gitignore
│
├── docs/
│   ├── SCORING_METHODOLOGY.md     # Detailed scoring formulas
│   ├── DATA_SOURCES.md            # What data exists, where, how to access
│   └── ARCHITECTURE.md            # System architecture overview
│
├── db/
│   └── migrations/
│       ├── 001_scoring_tables.sql # New tables (scoring_runs, ticker_scores, scoring_weights)
│       └── 002_seed_weights.sql   # Default weights per time horizon
│
├── src/
│   ├── shared/
│   │   ├── types.ts               # TypeScript types for scores, tickers, etc.
│   │   ├── supabase.ts            # Supabase client setup
│   │   ├── constants.ts           # Asset classes, default weights, horizons
│   │   └── utils.ts               # Shared utilities
│   │
│   ├── scoring/
│   │   ├── index.ts               # Main scoring orchestrator
│   │   ├── risk/
│   │   │   ├── volatility.ts      # Realized volatility calculator
│   │   │   ├── drawdown.ts        # Max drawdown calculator
│   │   │   ├── beta.ts            # Beta to SPY calculator
│   │   │   ├── liquidity.ts       # Liquidity risk calculator
│   │   │   └── fragility.ts       # Fundamental fragility calculator
│   │   ├── upward/
│   │   │   ├── momentum.ts        # Trend momentum (MA, MACD, ADX)
│   │   │   ├── reversion.ts       # Mean reversion / RSI
│   │   │   ├── fundamental.ts     # Fundamental value score
│   │   │   ├── sentiment.ts       # News sentiment aggregation
│   │   │   ├── regime.ts          # Macro regime alignment
│   │   │   └── seasonal.ts        # Historical win rate
│   │   ├── normalizer.ts          # Percentile-rank normalizer (raw → 1-100)
│   │   └── composer.ts            # Weighted average composer (sub-scores → composite)
│   │
│   ├── data/
│   │   ├── price-loader.ts        # Load price_history from Supabase
│   │   ├── fundamentals-loader.ts # Load fundamental_data from Supabase
│   │   ├── sentiment-loader.ts    # Load news_data + sentiment from Supabase
│   │   ├── market-cap-loader.ts   # Load/compute market cap from market_quotes
│   │   └── regime-loader.ts       # Load macro regime from agent_scores
│   │
│   ├── dashboard/
│   │   ├── app/
│   │   │   ├── layout.tsx         # Root layout
│   │   │   ├── page.tsx           # Main dashboard page
│   │   │   └── api/
│   │   │       └── scores/
│   │   │           └── route.ts   # API: GET /api/scores?horizon=3
│   │   ├── components/
│   │   │   ├── BubbleChart.tsx     # D3 bubble chart with zoom/pan
│   │   │   ├── HorizonSelector.tsx # Time horizon tabs
│   │   │   ├── TickerTooltip.tsx   # Hover tooltip
│   │   │   ├── TickerDetail.tsx    # Click detail panel
│   │   │   ├── AssetFilter.tsx     # Asset class toggles
│   │   │   ├── SearchBar.tsx       # Ticker search
│   │   │   └── QuadrantLabels.tsx  # Quadrant annotations
│   │   └── lib/
│   │       ├── chart-config.ts    # D3 scales, colors, sizes
│   │       └── hooks.ts           # React hooks for data fetching
│   │
│   └── cron/
│       └── daily-scoring.ts       # Entry point for daily scoring run
│
├── supabase/
│   └── config.toml                # Supabase local config (if needed)
│
└── .github/
    └── workflows/
        └── daily-scoring.yml      # GitHub Actions cron trigger
```

## MCP Access

Claude Code has Supabase MCP configured. Use it to:
1. **Inspect existing schema** before writing any queries — run `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'` to see all tables
2. **Inspect columns** — `SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'price_history'`
3. **Sample data** — `SELECT * FROM price_history LIMIT 5` to understand data shape
4. **Run migrations** — Execute the SQL in `db/migrations/` via MCP
5. **Test queries** — Validate scoring queries against real data

## Development Sequence

1. **Schema first**: Run migrations to create new tables
2. **Data loaders**: Build `src/data/` — read existing Supabase data
3. **Scoring calculators**: Build `src/scoring/risk/` and `src/scoring/upward/` one by one
4. **Normalizer + Composer**: Wire sub-scores into composites
5. **Orchestrator**: Build `src/scoring/index.ts` that runs everything and writes to `ticker_scores`
6. **API route**: Build `/api/scores` to serve data to the frontend
7. **Dashboard**: Build the D3 bubble chart
8. **Cron**: Set up GitHub Actions for daily execution

## Key Constraints

- **Never modify existing tables** — only read from them, write to new tables
- **Percentile normalization** — all sub-scores are percentile-ranked within the universe, not absolute values. This ensures even spread across 1–100.
- **Crypto exceptions** — crypto assets don't have traditional fundamentals. For fundamental_fragility and fundamental_value, use neutral defaults (50) or alternative metrics.
- **ETF handling** — ETFs use underlying index fundamentals where available.
- **Market cap for crypto** — use circulating supply × price from market_quotes.
- **Idempotent runs** — if a scoring run for today + horizon already exists, skip or overwrite based on a flag.

## Environment Variables

```
SUPABASE_URL=https://xrsyshxvrikfhwdsreqv.supabase.co
SUPABASE_SERVICE_KEY=<service role key — NOT the publishable key>
SUPABASE_ANON_KEY=<publishable key for frontend>
TWELVE_DATA_API_KEY=<for any fresh data fetching>
FINNHUB_API_KEY=<for news/sentiment if needed>
```
