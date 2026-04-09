# Data Sources — aiMATA v2

## Supabase Project

- **Project ID:** `xrsyshxvrikfhwdsreqv`
- **URL:** `https://xrsyshxvrikfhwdsreqv.supabase.co`
- **Shared with:** aiMAIA, aiMATA (read from existing tables, write to new tables only)

## Existing Tables (READ ONLY — do not modify)

> **IMPORTANT:** Before writing any queries, use Supabase MCP to inspect the actual schema.
> Run: `SELECT column_name, data_type FROM information_schema.columns WHERE table_name = '<table>'`

### `asset_universe`
The 100 tickers. Contains ticker symbol, asset class, company name, sector, etc.
- ~60 US stocks, ~20 ETFs, ~20 crypto

### `price_history`
Daily OHLCV (Open, High, Low, Close, Volume) data.
- Used for: volatility, drawdown, beta, momentum, RSI, seasonal analysis
- Lookback: ensure at least 2 years of history for 12-month horizon scoring

### `market_quotes`
Latest/recent quote snapshots including price, volume, market cap.
- Used for: current price, market cap (bubble size), liquidity calculation

### `fundamental_data`
Company fundamentals: P/E, forward P/E, PEG, debt/equity, EPS, revenue growth, etc.
- Used for: fundamental fragility (risk), fundamental value (upward probability)
- Updated: varies (quarterly earnings cycle)

### `news_data`
News articles with sentiment scores.
- Used for: sentiment sub-score
- Fields likely include: ticker, title, source, published_at, sentiment (-1 to +1)

### `agent_scores`
Existing agent outputs from aiMAIA pipeline.
- Regime agent scores → used for macro regime alignment
- Other agent scores may be useful as cross-references

### `macro_events`
Economic events, Fed decisions, etc.
- Useful context for regime classification

## Data Providers (for any fresh fetching)

### Twelve Data (Primary)
- API key in env: `TWELVE_DATA_API_KEY`
- Used for: OHLCV price data, technical indicators
- Rate limits: check current plan

### Finnhub (Secondary)
- API key in env: `FINNHUB_API_KEY`
- Used for: news, sentiment, basic quotes
- Rate limits: check current plan

## New Tables (WRITE — created by this project)

### `scoring_runs`
Tracks each execution of the scoring pipeline.

### `ticker_scores`
The primary output: risk + upward probability scores per ticker per run.

### `scoring_weights`
Configurable weights per horizon × score type × component.

See `CLAUDE.md` for full schema definitions.
