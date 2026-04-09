// src/scoring/risk/liquidity.ts
// Liquidity Risk: average daily dollar volume.
// The normalizer inverts this (low liquidity → high risk score).
// Crypto assets have volume=0 in price_history — return null for them.

import type { PriceBar } from '../../shared/types';

/**
 * Calculate average daily dollar volume over the lookback window.
 *
 * @param prices - Daily bars sorted oldest → newest
 * @returns Average dollar volume (close × volume), or null if volume data
 *          is missing/zero (crypto). The normalizer will invert this so that
 *          low liquidity maps to a high risk score.
 */
export function calculateLiquidity(prices: PriceBar[]): number | null {
  if (prices.length === 0) return null;

  let totalDollarVol = 0;
  let validDays = 0;

  for (const bar of prices) {
    if (bar.volume > 0) {
      totalDollarVol += bar.close * bar.volume;
      validDays++;
    }
  }

  // If fewer than 10% of days have volume data, treat as unavailable
  if (validDays < prices.length * 0.1) return null;

  return totalDollarVol / validDays;
}
