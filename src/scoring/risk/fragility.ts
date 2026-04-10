// src/scoring/risk/fragility.ts
// Fundamental Fragility: balance sheet and profitability risk.
// Returns null for crypto (no fundamentals) — the orchestrator marks this as FACTOR_UNAVAILABLE.
//
// Robust when debt_to_equity is missing: still computes from margin + earnings quality.

import type { FundamentalRecord } from '../../data/fundamentals-loader';
import { clamp } from '../../shared/utils';

/**
 * Calculate fundamental fragility.
 *
 * Components (each scored 0–100, higher = more fragile):
 *   - Leverage (weight 0.35): debt_to_equity — higher D/E = more fragile
 *   - Margin weakness (weight 0.35): inverse profit_margin
 *   - Earnings quality (weight 0.30): combines ROE and revenue growth
 *
 * Weight redistribution: if D/E is missing (common for ~40% of stocks),
 * the remaining components share the full weight automatically via re-normalization.
 *
 * @returns Raw fragility score 0–100, or null if no fundamental data at all
 */
export function calculateFragility(
  fundamentals: FundamentalRecord | null
): number | null {
  if (!fundamentals) return null;

  const components: number[] = [];
  const weights: number[] = [];

  // 1. Leverage from D/E ratio
  if (fundamentals.debt_to_equity != null && isFinite(fundamentals.debt_to_equity)) {
    const de = Math.max(0, fundamentals.debt_to_equity);
    // D/E 0→10, 0.5→18.5, 1.0→27, 2.0→44, 5.0→95
    const leverageScore = clamp(10 + de * 17, 0, 100);
    components.push(leverageScore);
    weights.push(0.35);
  }

  // 2. Margin weakness
  if (fundamentals.profit_margin != null && isFinite(fundamentals.profit_margin)) {
    const margin = fundamentals.profit_margin;
    let marginScore: number;
    if (margin >= 0.40) marginScore = 5;
    else if (margin >= 0) marginScore = 60 - margin * 137.5;
    else marginScore = clamp(60 + Math.abs(margin) * 350, 60, 95);
    components.push(marginScore);
    weights.push(0.35);
  }

  // 3. Earnings quality — ROE and revenue growth
  const qualitySubs: number[] = [];
  if (fundamentals.roe != null && isFinite(fundamentals.roe)) {
    const roe = fundamentals.roe;
    let roeScore: number;
    if (roe >= 0.25) roeScore = 10;
    else if (roe >= 0) roeScore = 50 - roe * 160;
    else roeScore = clamp(50 + Math.abs(roe) * 400, 50, 95);
    qualitySubs.push(roeScore);
  }
  if (fundamentals.revenue_growth_yoy != null && isFinite(fundamentals.revenue_growth_yoy)) {
    const growth = fundamentals.revenue_growth_yoy;
    let growthScore: number;
    if (growth >= 0.20) growthScore = 10;
    else if (growth >= 0) growthScore = 50 - growth * 200;
    else growthScore = clamp(50 + Math.abs(growth) * 200, 50, 95);
    qualitySubs.push(growthScore);
  }
  if (qualitySubs.length > 0) {
    components.push(qualitySubs.reduce((a, b) => a + b, 0) / qualitySubs.length);
    weights.push(0.30);
  }

  if (components.length === 0) return null;

  const totalWeight = weights.reduce((a, b) => a + b, 0);
  let score = 0;
  for (let i = 0; i < components.length; i++) {
    score += components[i] * (weights[i] / totalWeight);
  }
  return clamp(score, 0, 100);
}
