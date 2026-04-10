// src/scoring/upward/fundamental.ts
// Fundamental Value: undervaluation + growth quality signal.
//
// Adapted for actual data availability:
//   { pe_ratio, ps_ratio, revenue_growth_yoy, profit_margin, roe, sector_median_pe }
// Returns null for crypto (no fundamentals) — orchestrator marks as FACTOR_UNAVAILABLE.

import type { FundamentalRecord } from '../../data/fundamentals-loader';
import { clamp } from '../../shared/utils';

/**
 * Calculate fundamental value score.
 * Undervalued + profitable + growing = high score.
 *
 * Components with auto-redistribution when fields are null:
 *   - Relative value (weight 0.30): sector_median_pe / pe_ratio, fallback to ps_ratio
 *   - Revenue growth (weight 0.25): higher YoY growth → bullish
 *   - Profitability (weight 0.25): profit margin strength
 *   - Capital efficiency (weight 0.20): ROE quality
 *
 * @returns Raw value score 0–100, or null for crypto / completely missing data
 */
export function calculateFundamentalValue(
  fundamentals: FundamentalRecord | null
): number | null {
  if (!fundamentals) return null;

  const components: number[] = [];
  const weights: number[] = [];

  // 1. Relative P/E value
  if (
    fundamentals.pe_ratio != null && fundamentals.pe_ratio > 0 && isFinite(fundamentals.pe_ratio) &&
    fundamentals.sector_median_pe != null && fundamentals.sector_median_pe > 0
  ) {
    const ratio = fundamentals.sector_median_pe / fundamentals.pe_ratio;
    const peScore = clamp(10 + (ratio - 0.3) * (85 / 1.7), 5, 95);
    components.push(peScore);
    weights.push(0.30);
  } else if (fundamentals.pe_ratio != null && fundamentals.pe_ratio > 0 && isFinite(fundamentals.pe_ratio)) {
    // No sector median — use absolute PE. PE 10→80, PE 20→60, PE 40→35, PE 80→10
    const absScore = clamp(95 - fundamentals.pe_ratio * 1.1, 5, 95);
    components.push(absScore);
    weights.push(0.30);
  } else if (fundamentals.ps_ratio != null && fundamentals.ps_ratio > 0 && isFinite(fundamentals.ps_ratio)) {
    const psScore = clamp(80 - (fundamentals.ps_ratio - 1) * (65 / 19), 5, 95);
    components.push(psScore);
    weights.push(0.30);
  }

  // 2. Revenue growth YoY
  if (fundamentals.revenue_growth_yoy != null && isFinite(fundamentals.revenue_growth_yoy)) {
    const g = fundamentals.revenue_growth_yoy;
    const growthScore = clamp(45 + g * 150, 5, 95);
    components.push(growthScore);
    weights.push(0.25);
  }

  // 3. Profit margin
  if (fundamentals.profit_margin != null && isFinite(fundamentals.profit_margin)) {
    const m = fundamentals.profit_margin;
    const marginScore = clamp(40 + m * 150, 5, 95);
    components.push(marginScore);
    weights.push(0.25);
  }

  // 4. ROE
  if (fundamentals.roe != null && isFinite(fundamentals.roe)) {
    const roeCapped = Math.min(fundamentals.roe, 0.5);
    const roeScore = clamp(40 + roeCapped * 150, 5, 95);
    components.push(roeScore);
    weights.push(0.20);
  }

  if (components.length === 0) return null;

  const totalWeight = weights.reduce((a, b) => a + b, 0);
  let score = 0;
  for (let i = 0; i < components.length; i++) {
    score += components[i] * (weights[i] / totalWeight);
  }
  return clamp(score, 0, 100);
}
