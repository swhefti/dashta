// src/scoring/explanations.ts
// Deterministic explanation engine.
// Generates 3–5 sentence explanations from structured score drivers.
// No LLM, no randomness. Same inputs always produce same output.

import { FACTOR_UNAVAILABLE } from './composer';
import type { AssetClass } from '../shared/types';

/** Human-readable factor names. */
const FACTOR_LABELS: Record<string, string> = {
  volatility: 'price volatility',
  max_drawdown: 'recent drawdown depth',
  beta: 'market sensitivity',
  liquidity: 'trading liquidity',
  fundamental_fragility: 'balance sheet weakness',
  trend_momentum: 'price trend momentum',
  mean_reversion: 'oversold/overbought conditions',
  fundamental_value: 'fundamental valuation',
  sentiment: 'news sentiment',
  macro_regime: 'macro environment alignment',
  seasonal: 'historical seasonal patterns',
};

type Level = 'low' | 'moderate' | 'elevated' | 'high';

function scoreLevel(v: number): Level {
  if (v <= 30) return 'low';
  if (v <= 55) return 'moderate';
  if (v <= 75) return 'elevated';
  return 'high';
}

function upwardLevel(v: number): string {
  if (v <= 25) return 'weak';
  if (v <= 45) return 'below average';
  if (v <= 55) return 'neutral';
  if (v <= 75) return 'favorable';
  return 'strong';
}

interface FactorEntry {
  name: string;
  label: string;
  value: number;
}

function getTopFactors(
  scores: Record<string, number>,
  factorNames: string[],
  direction: 'high' | 'low',
  count: number
): FactorEntry[] {
  const entries: FactorEntry[] = [];
  for (const name of factorNames) {
    const val = scores[name];
    if (val == null || val === FACTOR_UNAVAILABLE) continue;
    entries.push({ name, label: FACTOR_LABELS[name] ?? name, value: Number(val) });
  }
  entries.sort((a, b) => direction === 'high' ? b.value - a.value : a.value - b.value);
  return entries.slice(0, count);
}

function listDrivers(factors: FactorEntry[]): string {
  if (factors.length === 0) return 'limited available data';
  if (factors.length === 1) return factors[0].label;
  if (factors.length === 2) return `${factors[0].label} and ${factors[1].label}`;
  return `${factors.slice(0, -1).map(f => f.label).join(', ')}, and ${factors[factors.length - 1].label}`;
}

function getMissingFactors(scores: Record<string, number>, expected: string[]): string[] {
  return expected.filter(f => scores[f] == null || scores[f] === FACTOR_UNAVAILABLE);
}

const RISK_FACTORS = ['volatility', 'max_drawdown', 'beta', 'liquidity', 'fundamental_fragility'];
const UPWARD_FACTORS = ['trend_momentum', 'mean_reversion', 'fundamental_value', 'sentiment', 'macro_regime', 'seasonal'];

/**
 * Generate a deterministic explanation for a ticker's scores.
 * Returns 3–5 plain-English sentences.
 */
export function generateExplanation(params: {
  ticker: string;
  companyName: string;
  assetClass: AssetClass;
  riskScore: number;
  upwardScore: number;
  riskSubs: Record<string, number>;
  upwardSubs: Record<string, number>;
  confidence: number;
  confidenceLabel: string;
  runQuality: string;
}): string {
  const {
    ticker, companyName, assetClass, riskScore, upwardScore,
    riskSubs, upwardSubs, confidence, confidenceLabel, runQuality,
  } = params;

  const sentences: string[] = [];
  const riskLvl = scoreLevel(riskScore);
  const upLvl = upwardLevel(upwardScore);

  // Sentence 1: Risk assessment
  const topRiskDrivers = getTopFactors(riskSubs, RISK_FACTORS, 'high', 2);
  if (riskLvl === 'high' || riskLvl === 'elevated') {
    sentences.push(
      `${ticker} carries ${riskLvl} risk, driven primarily by ${listDrivers(topRiskDrivers)}.`
    );
  } else {
    const lowRiskDrivers = getTopFactors(riskSubs, RISK_FACTORS, 'low', 2);
    sentences.push(
      `${ticker} shows ${riskLvl} risk, supported by relatively contained ${listDrivers(lowRiskDrivers)}.`
    );
  }

  // Sentence 2: Upward probability
  const topUpDrivers = getTopFactors(upwardSubs, UPWARD_FACTORS, 'high', 2);
  const weakUpDrivers = getTopFactors(upwardSubs, UPWARD_FACTORS, 'low', 1);

  if (upwardScore >= 60) {
    sentences.push(
      `Upward probability looks ${upLvl}, with ${listDrivers(topUpDrivers)} providing the strongest positive signals.`
    );
  } else if (upwardScore <= 40) {
    sentences.push(
      `Upward probability is ${upLvl}, held back by ${listDrivers(weakUpDrivers)}.`
    );
  } else {
    sentences.push(
      `Upward probability is ${upLvl}${topUpDrivers.length > 0 ? `, with mixed signals from ${listDrivers(topUpDrivers)}` : ''}.`
    );
  }

  // Sentence 3: Asset-class context
  if (assetClass === 'crypto') {
    const missingUp = getMissingFactors(upwardSubs, UPWARD_FACTORS);
    if (missingUp.length > 0) {
      sentences.push(
        `As a cryptocurrency, this score is based on price-derived and market signals rather than traditional fundamentals.`
      );
    }
  } else if (assetClass === 'etf') {
    sentences.push(
      `As an ETF, risk and return characteristics reflect the underlying index or strategy rather than single-company fundamentals.`
    );
  } else {
    // Stock — mention valuation or sentiment if notable
    const fvScore = upwardSubs.fundamental_value;
    if (fvScore != null && fvScore !== FACTOR_UNAVAILABLE) {
      if (fvScore >= 70) {
        sentences.push(`Valuation metrics suggest the stock may be undervalued relative to sector peers.`);
      } else if (fvScore <= 30) {
        sentences.push(`Valuation appears stretched compared to sector peers, which weighs on the upward outlook.`);
      }
    }
  }

  // Sentence 4: Confidence/freshness caveat (only if relevant)
  if (confidenceLabel !== 'high' || runQuality !== 'healthy') {
    if (runQuality === 'degraded') {
      sentences.push(
        `Note: this score was produced with partially stale source data, which may reduce reliability.`
      );
    } else if (confidence < 80) {
      const missingRisk = getMissingFactors(riskSubs, RISK_FACTORS);
      const missingUp = getMissingFactors(upwardSubs, UPWARD_FACTORS);
      const allMissing = [...missingRisk, ...missingUp].map(f => FACTOR_LABELS[f] ?? f);
      if (allMissing.length > 0) {
        sentences.push(
          `Confidence is reduced because ${allMissing.slice(0, 2).join(' and ')} data ${allMissing.length === 1 ? 'is' : 'are'} currently unavailable.`
        );
      }
    }
  }

  return sentences.join(' ');
}

/**
 * Compute a deterministic signature from score drivers.
 * Used to detect whether a "strong change" warrants explanation refresh.
 */
export function computeDriverSignature(params: {
  riskScore: number;
  upwardScore: number;
  confidence: number;
  confidenceLabel: string;
  runQuality: string;
  riskSubs: Record<string, number>;
  upwardSubs: Record<string, number>;
}): string {
  // Quantize scores to buckets of 8 to avoid churn on small changes
  const rBucket = Math.floor(params.riskScore / 8);
  const uBucket = Math.floor(params.upwardScore / 8);

  // Top 2 risk and upward drivers by name (order-insensitive)
  const topRisk = getTopFactors(params.riskSubs, RISK_FACTORS, 'high', 2).map(f => f.name).sort().join(',');
  const topUp = getTopFactors(params.upwardSubs, UPWARD_FACTORS, 'high', 2).map(f => f.name).sort().join(',');

  return `r${rBucket}:u${uBucket}:c${params.confidenceLabel}:q${params.runQuality}:${topRisk}|${topUp}`;
}

/**
 * Determine if explanation should be refreshed.
 * Returns true if:
 * - No previous explanation exists (oldSignature is null)
 * - Risk or upward score changed by >= 8 points
 * - Confidence label changed
 * - Run quality changed
 * - Top driver set changed
 */
export function shouldRefreshExplanation(
  oldSignature: string | null,
  newSignature: string,
  oldRisk: number | null,
  newRisk: number,
  oldUpward: number | null,
  newUpward: number
): boolean {
  if (!oldSignature) return true;
  if (oldSignature === newSignature) return false;

  // Even if signature didn't match, check score delta
  if (oldRisk != null && Math.abs(newRisk - oldRisk) >= 8) return true;
  if (oldUpward != null && Math.abs(newUpward - oldUpward) >= 8) return true;

  // Signature changed (different drivers, confidence, or quality) → refresh
  return true;
}
