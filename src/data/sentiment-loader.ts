// src/data/sentiment-loader.ts
// Load sentiment data from Supabase.
//
// The `news_data` table has no sentiment column. Sentiment scores come from
// `agent_scores` where `agent_type = 'sentiment'`.
//   score: -1 to +1
//   confidence: 0 to 1
//   component_scores: { rawScore, newsCount, qualifyingCount, ... }
//   data_freshness: 'current' | 'stale' | 'missing'
//
// We load the daily sentiment agent scores per ticker within the lookback window.

import { getServiceClient } from '../shared/supabase';
import type { Ticker } from '../shared/types';

export interface SentimentRecord {
  ticker: string;
  date: string;
  score: number;        // -1 to +1
  confidence: number;   // 0 to 1
  news_count: number;   // from component_scores.newsCount
  data_freshness: string;
  days_old: number;
}

/**
 * Load sentiment agent scores for all tickers within the lookback window.
 * Returns per-ticker array of daily sentiment readings, newest first.
 */
export async function loadSentiment(
  tickers: Ticker[],
  lookbackDays: number
): Promise<Map<string, SentimentRecord[]>> {
  const supabase = getServiceClient();
  const symbols = tickers.map((t) => t.symbol);
  const result = new Map<string, SentimentRecord[]>();

  // Lookback in calendar days (trading days × ~1.5)
  const calendarDays = Math.ceil(lookbackDays * 1.5);
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - calendarDays);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  const today = new Date();

  const { data, error } = await supabase
    .from('agent_scores')
    .select('ticker, date, score, confidence, component_scores, data_freshness')
    .eq('agent_type', 'sentiment')
    .in('ticker', symbols)
    .gte('date', cutoffStr)
    .order('date', { ascending: false });

  if (error) throw new Error(`Failed to load sentiment: ${error.message}`);

  if (data) {
    for (const row of data) {
      const ticker = row.ticker as string;
      const dateStr = row.date as string;
      const components = (row.component_scores ?? {}) as Record<string, unknown>;

      const record: SentimentRecord = {
        ticker,
        date: dateStr,
        score: Number(row.score),
        confidence: Number(row.confidence),
        news_count: Number(components.newsCount ?? components.qualifyingCount ?? 0),
        data_freshness: row.data_freshness as string,
        days_old: Math.floor(
          (today.getTime() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24)
        ),
      };

      if (!result.has(ticker)) result.set(ticker, []);
      result.get(ticker)!.push(record);
    }
  }

  return result;
}
