# aiMATA v2 — Risk × Upward Probability Radar

A single-page investment dashboard that plots ~100 assets on an interactive 2D field:

- **X-axis:** Risk Score (1–100)
- **Y-axis:** Upward Probability (1–100)
- **Bubble size:** Market capitalization
- **Bubble color:** Asset class (stock / ETF / crypto)
- **Time horizon:** Selectable (3mo / 6mo / 12mo)

Zoom into dense clusters. Hover for details. Click for score breakdown.

## Quick Start

```bash
npm install
cp .env.example .env   # fill in keys
npm run dev             # start dashboard
npm run score:3mo       # run 3-month scoring
```

## Architecture

Scores are computed daily via a scoring engine that reads existing market data from Supabase (shared with aiMAIA) and writes to dedicated scoring tables. The Next.js frontend reads those scores and renders a D3.js bubble chart.

See `CLAUDE.md` for the full technical brief.

## Disclaimer

This tool is not financial advice. It never executes trades. Scores are analytical signals only.
