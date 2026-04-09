// src/scoring/risk/volatility.ts
// Realized Volatility: annualized std dev of daily log returns over lookback window.

import type { PriceBar } from '../../shared/types';
import { logReturn, stdDev, annualizeVol } from '../../shared/utils';

/**
 * Calculate realized volatility for a single ticker.
 * @param prices - Daily OHLCV bars, sorted oldest → newest, already trimmed to lookback window
 * @returns Annualized volatility as a decimal (e.g., 0.35 = 35%)
 */
export function calculateVolatility(prices: PriceBar[]): number {
  if (prices.length < 2) return 0;

  const returns: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    returns.push(logReturn(prices[i].close, prices[i - 1].close));
  }

  return annualizeVol(stdDev(returns));
}
