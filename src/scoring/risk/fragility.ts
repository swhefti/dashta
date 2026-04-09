// src/scoring/risk/fragility.ts
// Fundamental Fragility: balance sheet and profitability risk.
// For crypto/ETFs without fundamentals, returns null (normalizer uses neutral 50).
//
// Uses FundamentalRecord from the data loader:
//   { debt_to_equity, profit_margin, roe, revenue_growth_yoy, pe_ratio, ps_ratio }
// No interest_coverage or quarterly EPS in our schema — we use what's available.

import type { FundamentalRecord } from '../../data/fundamentals-loader';
import { clamp } from '../../shared/utils';

/**
 * Calculate fundamental fragility from available balance sheet / profitability metrics.
 *
 * Components (each scored 0–100, higher = more fragile):
 *   - Leverage (40%): debt_to_equity — higher D/E = more fragile
 *   - Margin weakness (30%): inverse profit_margin — lower margin = more fragile
 *   - Earnings quality (30%): combines ROE and revenue growth —
 *       low/negative ROE + shrinking revenue = more fragile
 *
 * @returns Raw fragility score 0–100, or null if no fundamental data
 */
export function calculateFragility(
  fundamentals: FundamentalRecord | null
): number | null {
  if (!fundamentals) return null;

  const components: number[] = [];
  const weights: number[] = [];

  // 1. Leverage score from D/E ratio
  //    D/E 0 → 10 (low fragility), D/E 2 → 50, D/E 5+ → 95
  if (fundamentals.debt_to_equity != null) {
    const de = Math.max(0, fundamentals.debt_to_equity);
    const leverageScore = clamp(10 + de * 17, 0, 100);
    components.push(leverageScore);
    weights.push(0.40);
  }

  // 2. Margin weakness — low or negative profit margin = fragile
  //    margin 0.40+ → 5 (strong), margin 0 → 60, margin < -0.10 → 95
  if (fundamentals.profit_margin != null) {
    const margin = fundamentals.profit_margin;
    let marginScore: number;
    if (margin >= 0.40) marginScore = 5;
    else if (margin >= 0) marginScore = 60 - margin * 137.5; // 0→60, 0.40→5
    else marginScore = clamp(60 + Math.abs(margin) * 350, 60, 95); // negative margins
    components.push(marginScore);
    weights.push(0.30);
  }

  // 3. Earnings quality — ROE and revenue growth
  //    Low/negative ROE + shrinking revenue = fragile
  if (fundamentals.roe != null || fundamentals.revenue_growth_yoy != null) {
    let qualityScore = 50; // neutral default
    let subCount = 0;
    let subTotal = 0;

    if (fundamentals.roe != null) {
      // ROE 0.25+ → 10 (strong), ROE 0 → 50, ROE < -0.10 → 90
      const roe = fundamentals.roe;
      let roeScore: number;
      if (roe >= 0.25) roeScore = 10;
      else if (roe >= 0) roeScore = 50 - roe * 160; // 0→50, 0.25→10
      else roeScore = clamp(50 + Math.abs(roe) * 400, 50, 95);
      subTotal += roeScore;
      subCount++;
    }

    if (fundamentals.revenue_growth_yoy != null) {
      // growth 0.20+ → 10, growth 0 → 50, growth -0.20 → 90
      const growth = fundamentals.revenue_growth_yoy;
      let growthScore: number;
      if (growth >= 0.20) growthScore = 10;
      else if (growth >= 0) growthScore = 50 - growth * 200; // 0→50, 0.20→10
      else growthScore = clamp(50 + Math.abs(growth) * 200, 50, 95);
      subTotal += growthScore;
      subCount++;
    }

    if (subCount > 0) qualityScore = subTotal / subCount;
    components.push(qualityScore);
    weights.push(0.30);
  }

  // If no components available, return null
  if (components.length === 0) return null;

  // Weighted average, re-normalizing weights to sum to 1
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  let score = 0;
  for (let i = 0; i < components.length; i++) {
    score += components[i] * (weights[i] / totalWeight);
  }

  return clamp(score, 0, 100);
}
