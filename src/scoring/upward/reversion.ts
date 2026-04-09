// src/scoring/upward/reversion.ts
// Mean Reversion: RSI-based contrarian signal.
// Oversold assets (low RSI) have higher upward probability.

import type { PriceBar } from '../../shared/types';
import { clamp } from '../../shared/utils';

/**
 * Calculate 14-period RSI using Wilder's smoothed moving average.
 * Returns RSI 0–100 or NaN if insufficient data.
 */
function rsi14(prices: PriceBar[]): number {
  const period = 14;
  if (prices.length < period + 1) return NaN;

  let avgGain = 0;
  let avgLoss = 0;

  // Seed with simple average of first `period` changes
  for (let i = 1; i <= period; i++) {
    const change = prices[i].close - prices[i - 1].close;
    if (change > 0) avgGain += change;
    else avgLoss += -change;
  }
  avgGain /= period;
  avgLoss /= period;

  // Wilder's smoothing for remaining bars
  for (let i = period + 1; i < prices.length; i++) {
    const change = prices[i].close - prices[i - 1].close;
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? -change : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

/**
 * Map RSI to a mean-reversion upward-probability score.
 *
 * Piecewise linear mapping (contrarian logic):
 *   RSI ≤ 20  → score 95  (deeply oversold, strong reversion expected)
 *   RSI = 30  → score 80
 *   RSI = 50  → score 50  (neutral)
 *   RSI = 70  → score 20
 *   RSI ≥ 80  → score  5  (deeply overbought, reversion downward likely)
 */
function rsiToScore(rsiValue: number): number {
  if (rsiValue <= 20) return 95;
  if (rsiValue <= 30) return 95 - (rsiValue - 20) * 1.5;       // 95 → 80
  if (rsiValue <= 50) return 80 - (rsiValue - 30) * 1.5;       // 80 → 50
  if (rsiValue <= 70) return 50 - (rsiValue - 50) * 1.5;       // 50 → 20
  if (rsiValue <= 80) return 20 - (rsiValue - 70) * 1.5;       // 20 → 5
  return 5;
}

/**
 * Calculate mean reversion score based on 14-day RSI.
 *
 * @param prices - Daily bars sorted oldest → newest
 * @returns Score 1–100 (higher = more oversold = higher upward probability).
 *          Returns 50 (neutral) if insufficient data for RSI.
 */
export function calculateReversion(prices: PriceBar[]): number {
  const rsiValue = rsi14(prices);
  if (isNaN(rsiValue)) return 50;
  return clamp(rsiToScore(rsiValue), 1, 100);
}
