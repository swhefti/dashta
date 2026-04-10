// src/scoring/confidence.ts
// Ticker-level confidence scoring.
// Deterministic formula: weighted factor availability + asset-class expectations + run quality.

import type { AssetClass } from '../shared/types';
import { FACTOR_UNAVAILABLE } from './composer';

type RunQuality = 'healthy' | 'degraded' | 'blocked';

/**
 * Expected factors per asset class.
 * Crypto is NOT expected to have fundamentals — missing those shouldn't reduce confidence.
 * ETFs are NOT expected to have fundamentals either (most have null in the DB).
 */
const EXPECTED_FACTORS: Record<AssetClass, {
  risk: string[];
  upward: string[];
}> = {
  stock: {
    risk: ['volatility', 'max_drawdown', 'beta', 'liquidity', 'fundamental_fragility'],
    upward: ['trend_momentum', 'mean_reversion', 'fundamental_value', 'sentiment', 'macro_regime', 'seasonal'],
  },
  etf: {
    risk: ['volatility', 'max_drawdown', 'beta', 'liquidity'],
    upward: ['trend_momentum', 'mean_reversion', 'sentiment', 'macro_regime', 'seasonal'],
  },
  crypto: {
    risk: ['volatility', 'max_drawdown', 'beta'],  // no liquidity (volume=0), no fundamentals
    upward: ['trend_momentum', 'mean_reversion', 'sentiment', 'macro_regime', 'seasonal'],
  },
};

/** Weights for how important each factor is to confidence (higher = more confidence loss when missing). */
const FACTOR_IMPORTANCE: Record<string, number> = {
  volatility: 1.0,
  max_drawdown: 0.8,
  beta: 0.6,
  liquidity: 0.5,
  fundamental_fragility: 0.7,
  trend_momentum: 1.0,
  mean_reversion: 0.6,
  fundamental_value: 0.8,
  sentiment: 0.9,
  macro_regime: 0.4,
  seasonal: 0.3,
};

export interface ConfidenceResult {
  score: number;    // 0–100
  label: 'high' | 'medium' | 'low';
  reasons: string[]; // why confidence is reduced
}

/**
 * Compute ticker-level confidence.
 *
 * Formula:
 *   1. Start at 100.
 *   2. For each EXPECTED factor that is FACTOR_UNAVAILABLE, deduct based on importance weight.
 *   3. If run quality is degraded, apply -10 penalty.
 *   4. Clamp to 0–100, classify into high/medium/low.
 *
 * Key: only penalizes for factors that are EXPECTED for the asset class.
 * Crypto missing fundamentals is not penalized. Stocks missing fundamentals IS penalized.
 */
export function computeConfidence(
  riskScores: Record<string, number>,
  upwardScores: Record<string, number>,
  assetClass: AssetClass,
  runQuality: RunQuality
): ConfidenceResult {
  const expected = EXPECTED_FACTORS[assetClass];
  const reasons: string[] = [];
  let score = 100;

  // Check expected risk factors
  for (const factor of expected.risk) {
    if (riskScores[factor] === FACTOR_UNAVAILABLE || riskScores[factor] === undefined) {
      const penalty = (FACTOR_IMPORTANCE[factor] ?? 0.5) * 12;
      score -= penalty;
      reasons.push(`missing ${factor}`);
    }
  }

  // Check expected upward factors
  for (const factor of expected.upward) {
    if (upwardScores[factor] === FACTOR_UNAVAILABLE || upwardScores[factor] === undefined) {
      const penalty = (FACTOR_IMPORTANCE[factor] ?? 0.5) * 10;
      score -= penalty;
      reasons.push(`missing ${factor}`);
    }
  }

  // Run quality penalty
  if (runQuality === 'degraded') {
    score -= 10;
    reasons.push('degraded run (stale sources)');
  } else if (runQuality === 'blocked') {
    score = 0;
    reasons.push('blocked run');
  }

  score = Math.max(0, Math.min(100, Math.round(score)));

  const label: ConfidenceResult['label'] =
    score >= 75 ? 'high' :
    score >= 45 ? 'medium' :
    'low';

  return { score, label, reasons };
}
