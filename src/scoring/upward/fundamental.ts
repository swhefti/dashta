// src/scoring/upward/fundamental.ts
// Fundamental Value: undervaluation + growth quality signal.
//
// Uses FundamentalRecord from the data loader:
//   { pe_ratio, ps_ratio, revenue_growth_yoy, profit_margin, roe,
//     sector_median_pe }
// No forward P/E, PEG, or EPS growth in our schema — we adapt.

import type { FundamentalRecord } from '../../data/fundamentals-loader';
import { clamp } from '../../shared/utils';

/**
 * Calculate fundamental value score.
 * Undervalued + profitable + growing = high score.
 *
 * Components:
 *   - Relative value (35%): sector_median_pe / pe_ratio
 *       ratio > 1 means cheaper than sector → bullish
 *   - Revenue growth (25%): higher YoY growth → bullish
 *   - Profitability (20%): profit margin strength
 *   - Capital efficiency (20%): ROE quality
 *
 * @returns Raw value score 0–100, or null for crypto / missing data
 */
export function calculateFundamentalValue(
  fundamentals: FundamentalRecord | null
): number | null {
  if (!fundamentals) return null;

  const components: number[] = [];
  const weights: number[] = [];

  // 1. Relative P/E value: sector_median_pe / pe_ratio
  //    ratio 2.0+ → 95 (deeply undervalued), 1.0 → 50 (fair), 0.5 → 15 (overvalued)
  if (
    fundamentals.pe_ratio != null &&
    fundamentals.pe_ratio > 0 &&
    fundamentals.sector_median_pe != null &&
    fundamentals.sector_median_pe > 0
  ) {
    const ratio = fundamentals.sector_median_pe / fundamentals.pe_ratio;
    // Linear map: ratio 0.3→10, 1.0→50, 2.0→95
    const peScore = clamp(10 + (ratio - 0.3) * (85 / 1.7), 5, 95);
    components.push(peScore);
    weights.push(0.35);
  } else if (fundamentals.ps_ratio != null && fundamentals.ps_ratio > 0) {
    // Fallback: P/S ratio (lower = cheaper). PS 1→80, PS 5→50, PS 20→15
    const psScore = clamp(80 - (fundamentals.ps_ratio - 1) * (65 / 19), 5, 95);
    components.push(psScore);
    weights.push(0.35);
  }

  // 2. Revenue growth YoY
  //    growth 0.30+ → 90, 0.10 → 65, 0 → 45, -0.10 → 25, -0.30 → 5
  if (fundamentals.revenue_growth_yoy != null) {
    const g = fundamentals.revenue_growth_yoy;
    const growthScore = clamp(45 + g * 150, 5, 95);
    components.push(growthScore);
    weights.push(0.25);
  }

  // 3. Profit margin
  //    margin 0.30+ → 85, 0.10 → 60, 0 → 40, < 0 → 15
  if (fundamentals.profit_margin != null) {
    const m = fundamentals.profit_margin;
    const marginScore = clamp(40 + m * 150, 5, 95);
    components.push(marginScore);
    weights.push(0.20);
  }

  // 4. ROE
  //    ROE 0.30+ → 85, 0.15 → 65, 0 → 40, < 0 → 15
  if (fundamentals.roe != null) {
    const r = fundamentals.roe;
    // Cap at reasonable bounds (some companies have ROE > 1.0 due to leverage)
    const roeCapped = Math.min(r, 0.5);
    const roeScore = clamp(40 + roeCapped * 150, 5, 95);
    components.push(roeScore);
    weights.push(0.20);
  }

  if (components.length === 0) return null;

  // Weighted average, re-normalizing weights
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  let score = 0;
  for (let i = 0; i < components.length; i++) {
    score += components[i] * (weights[i] / totalWeight);
  }

  return clamp(score, 0, 100);
}
