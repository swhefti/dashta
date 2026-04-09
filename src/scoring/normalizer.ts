// src/scoring/normalizer.ts
// Converts raw sub-score values into percentile ranks (1–100) within the universe.

/**
 * Given a map of ticker → raw value, return a map of ticker → percentile rank (1–100).
 * Higher raw value = higher percentile by default.
 * Set `invert = true` for metrics where lower raw = higher risk (e.g., liquidity).
 */
export function percentileRank(
  rawValues: Map<string, number>,
  invert: boolean = false
): Map<string, number> {
  const entries = Array.from(rawValues.entries());
  const sorted = [...entries].sort((a, b) => a[1] - b[1]);

  const result = new Map<string, number>();
  const n = sorted.length;

  sorted.forEach(([ticker], index) => {
    const rank = invert
      ? ((n - index) / n) * 99 + 1
      : ((index + 1) / n) * 99 + 1;
    result.set(ticker, Math.round(rank * 100) / 100);
  });

  return result;
}
