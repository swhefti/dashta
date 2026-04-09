// src/scoring/risk/drawdown.ts
// Max Drawdown: worst peak-to-trough decline over lookback window.

import type { PriceBar } from '../../shared/types';

/**
 * Calculate maximum drawdown for a single ticker.
 * @param prices - Daily OHLCV bars, sorted oldest → newest
 * @returns Max drawdown as a positive decimal (e.g., 0.25 = 25% decline)
 */
export function calculateMaxDrawdown(prices: PriceBar[]): number {
  if (prices.length < 2) return 0;

  let peak = prices[0].close;
  let maxDD = 0;

  for (const bar of prices) {
    if (bar.close > peak) peak = bar.close;
    const dd = (peak - bar.close) / peak;
    if (dd > maxDD) maxDD = dd;
  }

  return maxDD;
}
