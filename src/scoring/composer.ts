// src/scoring/composer.ts
// Composes multiple normalized sub-scores into a single composite score using weights.

import type { ScoringWeight } from '../shared/types';

/**
 * Compose a weighted average from sub-scores and weights.
 * 
 * @param subScores - Map of component name → percentile-ranked score (1–100)
 * @param weights - Array of ScoringWeight entries for this score_type + horizon
 * @returns Composite score (1–100)
 */
export function composeScore(
  subScores: Record<string, number>,
  weights: ScoringWeight[]
): number {
  let totalWeight = 0;
  let weightedSum = 0;

  for (const w of weights) {
    const score = subScores[w.component];
    if (score !== undefined && score !== null) {
      weightedSum += score * w.weight;
      totalWeight += w.weight;
    }
  }

  if (totalWeight === 0) return 50; // fallback neutral
  return Math.round((weightedSum / totalWeight) * 100) / 100;
}
