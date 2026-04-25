// src/scoring/freshness.ts
// Determines source data freshness and run quality classification.
//
// Rules:
// - prices or quotes > 1 calendar day stale vs run_date → blocked
// - fundamentals > 30 calendar days stale → degraded
//     Rationale: fundamentals are quarterly data; a 7-day threshold was
//     too aggressive and caused false degradation between weekly refreshes.
//     30 days means one missed weekly refresh doesn't alarm the dashboard.
// - sentiment or regime > 3 calendar days stale → degraded
// - All within thresholds → healthy

import { getServiceClient } from '../shared/supabase';

export interface SourceFreshness {
  prices: string | null;      // latest date in price_history
  quotes: string | null;      // latest date in market_quotes
  fundamentals: string | null; // latest date in fundamental_data
  sentiment: string | null;    // latest date in agent_scores (sentiment)
  regime: string | null;       // latest date in agent_scores (market_regime)
}

export type RunQuality = 'healthy' | 'degraded' | 'blocked';

export interface FreshnessResult {
  sources: SourceFreshness;
  quality: RunQuality;
  issues: string[];
}

function daysBetween(a: string, b: string): number {
  return Math.floor((new Date(b).getTime() - new Date(a).getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * Check source freshness and determine run quality.
 */
export async function checkFreshness(runDate: string): Promise<FreshnessResult> {
  const supabase = getServiceClient();
  const issues: string[] = [];

  // Query latest dates from each source table (read-only)
  const [priceRes, quoteRes, fundRes, sentRes, regimeRes] = await Promise.all([
    supabase.from('price_history').select('date').order('date', { ascending: false }).limit(1).single(),
    supabase.from('market_quotes').select('date').order('date', { ascending: false }).limit(1).single(),
    supabase.from('fundamental_data').select('date').order('date', { ascending: false }).limit(1).single(),
    supabase.from('agent_scores').select('date').eq('agent_type', 'sentiment').order('date', { ascending: false }).limit(1).single(),
    supabase.from('agent_scores').select('date').eq('agent_type', 'market_regime').order('date', { ascending: false }).limit(1).single(),
  ]);

  const sources: SourceFreshness = {
    prices: priceRes.data?.date ?? null,
    quotes: quoteRes.data?.date ?? null,
    fundamentals: fundRes.data?.date ?? null,
    sentiment: sentRes.data?.date ?? null,
    regime: regimeRes.data?.date ?? null,
  };

  let quality: RunQuality = 'healthy';

  // Critical: prices and quotes must be within 1 calendar day
  if (sources.prices) {
    const staleDays = daysBetween(sources.prices, runDate);
    if (staleDays > 1) {
      quality = 'blocked';
      issues.push(`prices ${staleDays}d stale (latest: ${sources.prices})`);
    }
  } else {
    quality = 'blocked';
    issues.push('no price data');
  }

  if (sources.quotes) {
    const staleDays = daysBetween(sources.quotes, runDate);
    if (staleDays > 1) {
      quality = 'blocked';
      issues.push(`quotes ${staleDays}d stale (latest: ${sources.quotes})`);
    }
  }
  // quotes missing is not blocking — we handle null prices

  // Non-critical: fundamentals tolerate up to 30 days (quarterly data, weekly refresh)
  if (sources.fundamentals) {
    const staleDays = daysBetween(sources.fundamentals, runDate);
    if (staleDays > 30) {
      if (quality !== 'blocked') quality = 'degraded';
      issues.push(`fundamentals ${staleDays}d stale (latest: ${sources.fundamentals})`);
    }
  }

  // Non-critical: sentiment and regime within 3 days
  if (sources.sentiment) {
    const staleDays = daysBetween(sources.sentiment, runDate);
    if (staleDays > 3) {
      if (quality !== 'blocked') quality = 'degraded';
      issues.push(`sentiment ${staleDays}d stale (latest: ${sources.sentiment})`);
    }
  }

  if (sources.regime) {
    const staleDays = daysBetween(sources.regime, runDate);
    if (staleDays > 3) {
      if (quality !== 'blocked') quality = 'degraded';
      issues.push(`regime ${staleDays}d stale (latest: ${sources.regime})`);
    }
  }

  return { sources, quality, issues };
}
