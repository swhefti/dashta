// src/scoring/upward/sentiment.ts
// Sentiment: exponentially-weighted agent sentiment scores.
//
// Uses SentimentRecord from the data loader (agent_scores where agent_type='sentiment'):
//   { score: -1..+1, confidence: 0..1, news_count, days_old, data_freshness }

import type { SentimentRecord } from '../../data/sentiment-loader';
import { clamp } from '../../shared/utils';

/**
 * Calculate sentiment score from daily sentiment agent readings.
 *
 * 1. Exponential time-decay weighting: recent sentiment matters more
 *    weight = confidence × exp(-days_old / halfLife)
 * 2. Weighted average of score values (-1 to +1)
 * 3. Map to 1–100 scale
 *
 * @param records - Daily sentiment readings for one ticker, newest first
 * @param horizonMonths - Time horizon (affects decay half-life)
 * @returns Score 1–100. Returns 50 (neutral) if no valid readings.
 */
export function calculateSentiment(
  records: SentimentRecord[],
  horizonMonths: number
): number {
  if (!records || records.length === 0) return 50;

  // Half-life in days: shorter horizons decay faster
  const halfLife = horizonMonths * 10; // 3mo→30d, 6mo→60d, 12mo→120d

  // Filter out readings with missing data (confidence=0, data_freshness='missing')
  const valid = records.filter(
    (r) => r.confidence > 0 && r.data_freshness !== 'missing'
  );

  if (valid.length === 0) return 50;

  let weightedSum = 0;
  let totalWeight = 0;

  for (const r of valid) {
    // Time decay × confidence = final weight
    const decay = Math.exp(-r.days_old / halfLife);
    const w = r.confidence * decay;

    // Boost weight for readings backed by more news articles
    const newsBoost = Math.min(r.news_count / 5, 2); // cap at 2× for 10+ articles
    const finalWeight = w * Math.max(newsBoost, 0.5); // floor at 0.5× so low-count still counts

    weightedSum += r.score * finalWeight;
    totalWeight += finalWeight;
  }

  if (totalWeight === 0) return 50;

  // Weighted average: -1 to +1
  const avgSentiment = weightedSum / totalWeight;

  // Map [-1, +1] → [1, 100]
  // -1 → 1, 0 → 50.5, +1 → 100
  const score = 50.5 + avgSentiment * 49.5;

  return clamp(Math.round(score), 1, 100);
}
