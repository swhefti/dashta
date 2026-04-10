// src/scoring/composer.ts
// Composes multiple normalized sub-scores into a single composite score using weights.
// Handles missing factors by redistributing their weight across available factors.

import type { ScoringWeight } from '../shared/types';

/** Sentinel value indicating a factor is unavailable for this asset. */
export const FACTOR_UNAVAILABLE = -999;

/**
 * Compose a weighted average from sub-scores and weights.
 * Factors with the FACTOR_UNAVAILABLE sentinel are excluded and their weight
 * is redistributed proportionally across available factors.
 *
 * @param subScores - Map of component name → normalized score (1–100), or FACTOR_UNAVAILABLE
 * @param weights - Array of ScoringWeight entries for this score_type + horizon
 * @returns Composite score (1–100), or 50 if no factors are available
 */
export function composeScore(
  subScores: Record<string, number>,
  weights: ScoringWeight[]
): number {
  let totalWeight = 0;
  let weightedSum = 0;

  for (const w of weights) {
    const score = subScores[w.component];
    if (score === undefined || score === null || score === FACTOR_UNAVAILABLE) continue;
    weightedSum += score * w.weight;
    totalWeight += w.weight;
  }

  if (totalWeight === 0) return 50;
  return Math.round((weightedSum / totalWeight) * 100) / 100;
}
