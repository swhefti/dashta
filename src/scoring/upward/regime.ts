// src/scoring/upward/regime.ts
// Macro Regime Alignment: does the current market regime favor this asset?
//
// Uses RegimeData from the data loader (agent_scores where agent_type='market_regime'):
//   { score: -1..+1, regime_label, broad_trend, volatility_level, sector_rotation }
//
// Also uses MacroEvent[] (currently empty but wired for future use).

import type { RegimeData, MacroEvent } from '../../data/regime-loader';
import type { AssetClass } from '../../shared/types';
import { clamp } from '../../shared/utils';

/**
 * Asset-class regime sensitivity profiles.
 * Defines how each class responds to regime dimensions.
 */
const REGIME_SENSITIVITY: Record<AssetClass, {
  trendWeight: number;     // sensitivity to broad market trend
  riskOnWeight: number;    // sensitivity to risk-on/risk-off rotation
  volPenalty: number;       // penalty multiplier for high volatility
}> = {
  stock: { trendWeight: 0.45, riskOnWeight: 0.35, volPenalty: 0.20 },
  etf:   { trendWeight: 0.50, riskOnWeight: 0.25, volPenalty: 0.25 },
  crypto:{ trendWeight: 0.30, riskOnWeight: 0.50, volPenalty: 0.20 },
};

/**
 * Map broad_trend to a directional score (0–100).
 */
function trendScore(broadTrend: string, regimeScore: number): number {
  // Primary signal: the regime score itself (-1 to +1)
  // Map to 0–100: -1→5, 0→50, +1→95
  const fromScore = 50 + regimeScore * 45;

  // Secondary signal: the label
  const labelBonus: Record<string, number> = {
    uptrend: 10,
    sideways: 0,
    downtrend: -10,
  };
  const bonus = labelBonus[broadTrend] ?? 0;

  return clamp(fromScore + bonus, 0, 100);
}

/**
 * Map sector_rotation to a risk-appetite score.
 * risk-on → favors stocks/crypto, risk-off → favors defensive/ETFs.
 */
function rotationScore(sectorRotation: string, assetClass: AssetClass): number {
  const rotationMap: Record<string, number> = {
    'risk-on': 80,
    'balanced': 50,
    'risk-off': 20,
  };
  const base = rotationMap[sectorRotation] ?? 50;

  // Crypto and stocks benefit more from risk-on; ETFs are more neutral
  if (assetClass === 'crypto') {
    // Amplify: risk-on becomes more bullish, risk-off more bearish
    return clamp(50 + (base - 50) * 1.3, 0, 100);
  }
  if (assetClass === 'etf') {
    // Dampen: ETFs are less sensitive to rotation
    return clamp(50 + (base - 50) * 0.5, 0, 100);
  }
  return base; // stocks: use as-is
}

/**
 * Map volatility_level to a penalty (higher vol = lower upward probability).
 */
function volatilityPenalty(volatilityLevel: string): number {
  const penaltyMap: Record<string, number> = {
    low: 70,       // low vol is favorable
    moderate: 50,   // neutral
    high: 25,       // high vol penalizes upward probability
  };
  return penaltyMap[volatilityLevel] ?? 50;
}

/**
 * Incorporate macro events if any are relevant to this ticker/asset class.
 * Returns a modifier (-15 to +15) to add to the base score.
 */
function macroEventModifier(
  events: MacroEvent[],
  ticker: string,
  assetClass: AssetClass
): number {
  if (events.length === 0) return 0;

  let modifier = 0;
  let count = 0;

  for (const evt of events) {
    // Check if event is relevant to this ticker or asset class
    const tickerRelevant = evt.relevant_tickers.includes(ticker);
    const classRelevant = evt.relevant_asset_types.includes(assetClass);
    if (!tickerRelevant && !classRelevant) continue;

    const sentimentMap: Record<string, number> = {
      positive: 10,
      neutral: 0,
      negative: -10,
    };
    const impact = sentimentMap[evt.sentiment] ?? 0;
    // Direct ticker mentions have stronger impact
    modifier += tickerRelevant ? impact * 1.5 : impact;
    count++;
  }

  if (count === 0) return 0;
  // Average and cap
  return clamp(modifier / count, -15, 15);
}

/**
 * Calculate macro regime alignment score.
 *
 * @param regime - Current regime data from the regime loader (null if unavailable)
 * @param assetClass - The asset's class (stock, etf, crypto)
 * @param ticker - The asset's ticker symbol
 * @param macroEvents - Recent macro events (may be empty)
 * @returns Score 1–100, or null if no regime data available
 */
export function calculateRegimeAlignment(
  regime: RegimeData | null,
  assetClass: AssetClass,
  ticker: string,
  macroEvents: MacroEvent[]
): number | null {
  if (!regime) return null;

  const sensitivity = REGIME_SENSITIVITY[assetClass];

  const trend = trendScore(regime.broad_trend, regime.score);
  const rotation = rotationScore(regime.sector_rotation, assetClass);
  const volPenalty = volatilityPenalty(regime.volatility_level);

  // Weighted composite
  let score =
    trend * sensitivity.trendWeight +
    rotation * sensitivity.riskOnWeight +
    volPenalty * sensitivity.volPenalty;

  // Apply macro event modifier
  score += macroEventModifier(macroEvents, ticker, assetClass);

  // Dampen by regime confidence (low confidence → pull toward neutral 50)
  score = 50 + (score - 50) * regime.confidence;

  return clamp(Math.round(score), 1, 100);
}
