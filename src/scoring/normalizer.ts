// src/scoring/normalizer.ts
// Converts raw sub-score values into percentile ranks (1–100) within the universe.
// Uses tie-aware (midpoint) ranking so equal raw values get equal percentile scores.

/**
 * Given a map of ticker → raw value, return a map of ticker → percentile rank (1–100).
 * Higher raw value = higher percentile by default.
 * Set `invert = true` for metrics where lower raw = higher risk (e.g., liquidity).
 *
 * Tie handling: tied values receive the midpoint of the ranks they would span.
 * Example: 3 entries tied at rank 2–4 all receive rank 3 → same percentile.
 */
export function percentileRank(
  rawValues: Map<string, number>,
  invert: boolean = false
): Map<string, number> {
  if (rawValues.size === 0) return new Map();

  const entries = Array.from(rawValues.entries());
  // Sort ascending by raw value
  entries.sort((a, b) => a[1] - b[1]);

  const n = entries.length;
  const result = new Map<string, number>();

  // Group ties and assign midpoint ranks
  let i = 0;
  while (i < n) {
    // Find the run of entries with the same raw value
    let j = i;
    while (j < n && entries[j][1] === entries[i][1]) j++;

    // Midpoint rank for this tie group (1-based)
    // For entries at positions i..j-1, ranks are (i+1)..(j)
    const midRank = (i + 1 + j) / 2; // average of first and last rank in group

    // Convert rank to percentile (1–100)
    for (let k = i; k < j; k++) {
      const pct = invert
        ? ((n + 1 - midRank) / n) * 99 + 1
        : (midRank / n) * 99 + 1;
      result.set(entries[k][0], Math.round(pct * 100) / 100);
    }

    i = j;
  }

  return result;
}
