// src/scoring/normalizer-absolute.ts
// Absolute normalizer: maps raw sub-score values to 1–100 using sigmoid curves
// calibrated to typical market ranges. Unlike percentile normalization, scores
// are independent of other assets in the universe.

import { clamp } from '../shared/utils';

/**
 * Sigmoid mapping: score = 100 / (1 + exp(-k * (x - midpoint)))
 * k controls steepness, midpoint is the x-value that maps to 50.
 */
function sigmoid(x: number, k: number, midpoint: number): number {
  return 100 / (1 + Math.exp(-k * (x - midpoint)));
}

// ── Risk sub-score mappings ──

/** Volatility: annualized vol (decimal). 10%→20, 25%→50, 50%→80, 80%+→95 */
function absVolatility(annualizedVol: number): number {
  // midpoint=0.25 (25% vol → 50), k≈8 gives good spread
  return clamp(sigmoid(annualizedVol, 8, 0.25), 1, 100);
}

/** Max drawdown: decimal (e.g. 0.15 = 15%). 5%→15, 15%→45, 30%→70, 50%+→90 */
function absMaxDrawdown(dd: number): number {
  // midpoint=0.18, k≈10
  return clamp(sigmoid(dd, 10, 0.18), 1, 100);
}

/** Beta: abs(beta). 0.5→20, 1.0→45, 1.5→65, 2.5+→90 */
function absBeta(absBeta: number): number {
  // midpoint=1.1, k≈2.5
  return clamp(sigmoid(absBeta, 2.5, 1.1), 1, 100);
}

/** Liquidity: avg daily dollar volume. >$1B→10, $100M→30, $10M→60, <$1M→90
 *  INVERTED: higher volume = lower risk score.
 *  Use log scale: log10($1B)=9, log10($100M)=8, log10($10M)=7, log10($1M)=6 */
function absLiquidity(dollarVolume: number | null): number {
  if (dollarVolume == null || dollarVolume <= 0) return 75; // no data → moderately risky
  const logVol = Math.log10(dollarVolume);
  // Invert: high volume → low score. midpoint=log10($50M)≈7.7, k≈-3
  return clamp(sigmoid(logVol, -3, 7.7), 1, 100);
}

/** Fundamental fragility: raw 0–100 score from the calculator. Pass through. */
function absFragility(rawScore: number | null): number {
  if (rawScore == null) return 50;
  return clamp(rawScore, 1, 100);
}

// ── Upward probability sub-score mappings ──
// Most are already 0–100 from their calculators. Pass through with clamp.

function absMomentum(raw: number): number { return clamp(raw, 1, 100); }
function absReversion(raw: number): number { return clamp(raw, 1, 100); }
function absFundamentalValue(raw: number | null): number { return clamp(raw ?? 50, 1, 100); }
function absRegime(raw: number | null): number { return clamp(raw ?? 50, 1, 100); }
function absSeasonal(raw: number): number { return clamp(raw, 1, 100); }

/** Sentiment: agent_scores.score is -1 to +1.
 *  -1→5, -0.3→30, 0→50, 0.3→70, 1→95 */
function absSentiment(raw: number): number {
  // The sentiment calculator already maps -1..+1 to 1..100.
  // Pass through since it's already absolute.
  return clamp(raw, 1, 100);
}

// ── Public API ──

export type RiskComponent = 'volatility' | 'max_drawdown' | 'beta' | 'liquidity' | 'fundamental_fragility';
export type UpwardComponent = 'trend_momentum' | 'mean_reversion' | 'fundamental_value' | 'sentiment' | 'macro_regime' | 'seasonal';

/**
 * Absolute normalization for risk sub-scores.
 * Takes raw values and returns a Map of ticker → Record of component → absolute score (1–100).
 */
export function absoluteNormalizeRisk(
  rawScores: Map<string, Record<string, number>>
): Map<string, Record<string, number>> {
  const result = new Map<string, Record<string, number>>();

  for (const [ticker, raw] of rawScores) {
    result.set(ticker, {
      volatility: absVolatility(raw.volatility),
      max_drawdown: absMaxDrawdown(raw.max_drawdown),
      beta: absBeta(raw.beta),
      liquidity: absLiquidity(raw.liquidity === -1 ? null : raw.liquidity),
      fundamental_fragility: absFragility(raw.fundamental_fragility),
    });
  }

  return result;
}

/**
 * Absolute normalization for upward probability sub-scores.
 */
export function absoluteNormalizeUpward(
  rawScores: Map<string, Record<string, number>>
): Map<string, Record<string, number>> {
  const result = new Map<string, Record<string, number>>();

  for (const [ticker, raw] of rawScores) {
    result.set(ticker, {
      trend_momentum: absMomentum(raw.trend_momentum),
      mean_reversion: absReversion(raw.mean_reversion),
      fundamental_value: absFundamentalValue(raw.fundamental_value),
      sentiment: absSentiment(raw.sentiment),
      macro_regime: absRegime(raw.macro_regime),
      seasonal: absSeasonal(raw.seasonal),
    });
  }

  return result;
}
