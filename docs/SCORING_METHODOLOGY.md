# Scoring Methodology — aiMATA v2

## Overview

Each ticker receives two composite scores daily, for each configured time horizon:
- **Risk Score** (1–100): Higher = riskier
- **Upward Probability Score** (1–100): Higher = more likely to go up

Both use **percentile-rank normalization** within the asset universe, ensuring an even distribution.

---

## Risk Score

### 1. Realized Volatility (default 30%)

**Formula:**
```
daily_log_returns = ln(close[t] / close[t-1])
annualized_vol = std(daily_log_returns) × sqrt(252)
```

**Lookback:** `floor(1.5 × horizon_months × 21)` trading days

**Normalization:** Percentile rank within universe. Highest vol = 100, lowest = 1.

**Rationale:** The most fundamental risk measure. Captures how much the price typically swings.

### 2. Maximum Drawdown (default 25%)

**Formula:**
```
For each day in lookback window:
  running_max = max(close[0:t])
  drawdown[t] = (running_max - close[t]) / running_max
max_drawdown = max(drawdown)
```

**Normalization:** Percentile rank. Worst drawdown = 100.

**Rationale:** Captures tail risk. A stock can have low daily volatility but suffer sudden crashes. This catches that.

### 3. Beta to SPY (default 15%)

**Formula:**
```
beta = covariance(asset_returns, spy_returns) / variance(spy_returns)
```

**Lookback:** Same as volatility.

**Scoring:** `abs(beta)` ranked by percentile. Beta > 1 = higher risk. Negative beta also increases risk score (inversely correlated = unpredictable in portfolio context).

**For crypto:** Calculate beta against BTC as an additional signal, average with SPY beta.

### 4. Liquidity Risk (default 15%)

**Formula:**
```
avg_dollar_volume = mean(daily_volume × close) over lookback
```

**Scoring:** INVERSE percentile rank. Lowest dollar volume = highest risk score (100).

**Rationale:** Illiquid assets can't be exited cleanly. Slippage increases actual loss beyond what volatility suggests.

### 5. Fundamental Fragility (default 15%)

**Components:**
- Debt-to-equity ratio (higher = riskier)
- Interest coverage ratio (lower = riskier, inverse)
- Earnings volatility: `std(quarterly_eps_changes)` over last 8 quarters

**Scoring:** Average of sub-component percentile ranks.

**Exceptions:**
- **Crypto:** Default to 50 (neutral). Redistribute weight to volatility (+7.5%) and drawdown (+7.5%).
- **ETFs:** Use underlying index or holding-weighted fundamentals if available, else default 50.

---

## Upward Probability Score

### 1. Trend Momentum (default 25%)

**Components:**
- **MA Position:** Price vs short MA and long MA
  - 3mo horizon: 20d MA, 50d MA
  - 6mo horizon: 50d MA, 100d MA
  - 12mo horizon: 100d MA, 200d MA
  - Score: Above both = 100, above short only = 66, below both = 0
- **MACD:** MACD histogram value, normalized
  - Positive and rising = high score
  - Negative and falling = low score
- **ADX:** Trend strength
  - ADX > 25 in direction of trend = amplifies MA score
  - ADX < 20 = trend is weak, dampen score toward 50

**Composite:** `0.4 × ma_position + 0.35 × macd_score + 0.25 × adx_modifier`

### 2. Mean Reversion / RSI (default 15%)

**Formula:**
```
rsi = 14-day RSI

if rsi < 30:     score = 80 + (30 - rsi) × 0.67   # oversold = high upward prob
elif rsi < 40:   score = 60 + (40 - rsi) × 2
elif rsi < 60:   score = 50                         # neutral
elif rsi < 70:   score = 50 - (rsi - 60) × 2
else:            score = 20 - (rsi - 70) × 0.67    # overbought = low upward prob
```

**Clamp:** 1–100

**Rationale:** Counterbalances pure momentum. Extremely overbought assets have reduced upward probability short-term.

### 3. Fundamental Value (default 20%)

**Components:**
- **Forward P/E vs Sector:** `sector_median_pe / ticker_pe` → higher ratio = more undervalued
- **PEG Ratio:** Lower PEG = better growth at lower price → inverse rank
- **EPS Growth (YoY):** Positive growth = higher score

**Composite:** `0.35 × pe_value + 0.30 × peg_value + 0.35 × eps_growth`

**Exceptions:**
- **Crypto:** Default 50 or use NVT ratio (network value to transactions) if available
- **ETFs:** Use index-level P/E

### 4. Sentiment (default 20%)

**Formula:**
```
For each news article in lookback:
  weight = exp(-days_old / decay_half_life)  # decay_half_life = horizon_months × 10
  weighted_sentiment += article.sentiment × weight
  total_weight += weight

avg_sentiment = weighted_sentiment / total_weight
```

**Mapping:** Sentiment typically -1 to +1. Map to 1–100:
```
score = (avg_sentiment + 1) × 50
```

**Boost:** If analyst consensus target price exists:
```
upside_pct = (target_price - current_price) / current_price
analyst_boost = min(max(upside_pct × 100, -20), 20)  # cap at ±20 points
score = score + analyst_boost
```

### 5. Macro Regime Alignment (default 10%)

**Approach:**
1. Read current regime from existing `agent_scores` (regime agent)
2. Classify regime as: risk_on, risk_off, inflationary, deflationary, transitional
3. For each asset, compute historical average return in that regime type
4. Percentile rank the historical regime returns

**Fallback:** If regime data is insufficient, default to 50.

### 6. Seasonal Win Rate (default 10%)

**Formula:**
```
For each year in available history (min 3 years):
  period_return = (close[start + horizon] - close[start]) / close[start]
  win = 1 if period_return > 0 else 0

win_rate = sum(wins) / total_periods
score = win_rate × 100
```

**Start date matching:** Use the same calendar month as the current scoring date.

---

## Weight Adjustment by Horizon

Stored in `scoring_weights` table. Defaults:

### Risk Weights
| Component | 3mo | 6mo | 12mo |
|---|---|---|---|
| volatility | 0.30 | 0.28 | 0.25 |
| max_drawdown | 0.25 | 0.22 | 0.20 |
| beta | 0.15 | 0.15 | 0.15 |
| liquidity | 0.15 | 0.15 | 0.15 |
| fundamental_fragility | 0.15 | 0.20 | 0.25 |

### Upward Probability Weights
| Component | 3mo | 6mo | 12mo |
|---|---|---|---|
| trend_momentum | 0.25 | 0.20 | 0.15 |
| mean_reversion | 0.15 | 0.12 | 0.10 |
| fundamental_value | 0.20 | 0.25 | 0.30 |
| sentiment | 0.20 | 0.20 | 0.20 |
| macro_regime | 0.10 | 0.10 | 0.10 |
| seasonal | 0.10 | 0.13 | 0.15 |

---

## Percentile Normalization

All sub-scores use percentile rank within the universe for that scoring run:

```typescript
function percentileRank(values: number[], index: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const rank = sorted.indexOf(values[index]);
  return ((rank + 1) / values.length) * 100;
}
```

This ensures:
- Scores are always 1–100 regardless of absolute magnitudes
- Even distribution across the field
- Assets are always positioned relative to each other
