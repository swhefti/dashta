// src/data/regime-loader.ts
// Load macro regime classification from agent_scores + macro_events.
//
// agent_scores where agent_type='market_regime' and ticker='MARKET':
//   score: -1 to +1
//   component_scores: { regimeLabel, broadTrend, volatilityLevel,
//                       spyTrendScore, sectorRotation, sectorRotationScore, volatilityScore }
//
// macro_events table (currently 0 rows, but structured):
//   date, event_description, event_type (fed_decision|earnings|geopolitical|economic_data|other),
//   relevant_asset_types[], relevant_tickers[], sentiment

import { getServiceClient } from '../shared/supabase';

export interface RegimeData {
  score: number;              // -1 (bearish) to +1 (bullish)
  confidence: number;         // 0 to 1
  regime_label: string;       // e.g. 'cautious', 'bearish', 'bullish'
  broad_trend: string;        // 'uptrend', 'downtrend', 'sideways'
  volatility_level: string;   // 'low', 'moderate', 'high'
  sector_rotation: string;    // 'risk-on', 'risk-off', 'balanced'
  date: string;
}

export interface MacroEvent {
  date: string;
  event_description: string;
  event_type: string;
  sentiment: string;
  relevant_asset_types: string[];
  relevant_tickers: string[];
}

/**
 * Load the latest macro regime classification.
 */
export async function loadCurrentRegime(): Promise<RegimeData | null> {
  const supabase = getServiceClient();

  const { data, error } = await supabase
    .from('agent_scores')
    .select('date, score, confidence, component_scores')
    .eq('agent_type', 'market_regime')
    .eq('ticker', 'MARKET')
    .order('date', { ascending: false })
    .limit(1);

  if (error) throw new Error(`Failed to load regime: ${error.message}`);
  if (!data || data.length === 0) return null;

  const row = data[0];
  const cs = (row.component_scores ?? {}) as Record<string, unknown>;

  return {
    score: Number(row.score),
    confidence: Number(row.confidence),
    regime_label: (cs.regimeLabel as string) ?? 'unknown',
    broad_trend: (cs.broadTrend as string) ?? 'unknown',
    volatility_level: (cs.volatilityLevel as string) ?? 'unknown',
    sector_rotation: (cs.sectorRotation as string) ?? 'unknown',
    date: row.date as string,
  };
}

/**
 * Load recent macro events within a lookback window.
 * Currently 0 rows in the DB, but ready for when data is populated.
 */
export async function loadMacroEvents(lookbackDays: number): Promise<MacroEvent[]> {
  const supabase = getServiceClient();

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - lookbackDays);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from('macro_events')
    .select('date, event_description, event_type, sentiment, relevant_asset_types, relevant_tickers')
    .gte('date', cutoffStr)
    .order('date', { ascending: false });

  if (error) throw new Error(`Failed to load macro events: ${error.message}`);

  return (data ?? []).map((row) => ({
    date: row.date as string,
    event_description: row.event_description as string,
    event_type: row.event_type as string,
    sentiment: row.sentiment as string,
    relevant_asset_types: (row.relevant_asset_types ?? []) as string[],
    relevant_tickers: (row.relevant_tickers ?? []) as string[],
  }));
}
