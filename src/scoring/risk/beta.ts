// src/scoring/risk/beta.ts
// Beta to SPY: systematic market risk measure.
// beta = cov(asset_returns, benchmark_returns) / var(benchmark_returns)

import type { PriceBar } from '../../shared/types';
import { logReturn } from '../../shared/utils';

/**
 * Build a date → log-return map from a price series.
 * Skips the first bar (no prior close to compute return from).
 */
function returnsByDate(prices: PriceBar[]): Map<string, number> {
  const map = new Map<string, number>();
  for (let i = 1; i < prices.length; i++) {
    map.set(prices[i].date, logReturn(prices[i].close, prices[i - 1].close));
  }
  return map;
}

/**
 * Calculate beta of asset returns against benchmark returns.
 * Only uses dates present in both series (inner join).
 *
 * @param assetPrices - Asset daily bars, sorted oldest → newest
 * @param benchmarkPrices - Benchmark (e.g. SPY) daily bars
 * @returns Beta coefficient, or 1.0 if insufficient overlapping data (<5 days)
 */
export function calculateBeta(
  assetPrices: PriceBar[],
  benchmarkPrices: PriceBar[]
): number {
  const assetReturns = returnsByDate(assetPrices);
  const benchReturns = returnsByDate(benchmarkPrices);

  // Align on common dates
  const pairedAsset: number[] = [];
  const pairedBench: number[] = [];
  for (const [date, ar] of assetReturns) {
    const br = benchReturns.get(date);
    if (br !== undefined) {
      pairedAsset.push(ar);
      pairedBench.push(br);
    }
  }

  if (pairedAsset.length < 5) return 1.0; // not enough data, assume market beta

  const n = pairedAsset.length;
  const meanA = pairedAsset.reduce((s, v) => s + v, 0) / n;
  const meanB = pairedBench.reduce((s, v) => s + v, 0) / n;

  let cov = 0;
  let varB = 0;
  for (let i = 0; i < n; i++) {
    const da = pairedAsset[i] - meanA;
    const db = pairedBench[i] - meanB;
    cov += da * db;
    varB += db * db;
  }

  if (varB === 0) return 1.0; // benchmark has zero variance (shouldn't happen)

  return cov / varB;
}
