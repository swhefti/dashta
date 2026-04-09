// src/data/price-loader.ts
// Load price_history from Supabase for all tickers in the universe.
//
// Schema: price_history(ticker TEXT, date DATE, open NUMERIC, high NUMERIC,
//         low NUMERIC, close NUMERIC, volume BIGINT, ingested_at TIMESTAMPTZ)
// PK: (ticker, date). Note: volume=0 for crypto assets.

import { getServiceClient } from '../shared/supabase';
import type { PriceBar, Ticker } from '../shared/types';
import { MARKET_BENCHMARK } from '../shared/constants';

/** Max rows per Supabase query (avoid timeouts on large fetches). */
const PAGE_SIZE = 10_000;

/**
 * Parse a Supabase price_history row into a PriceBar.
 */
function toPriceBar(row: Record<string, unknown>): PriceBar {
  return {
    date: row.date as string,
    open: Number(row.open),
    high: Number(row.high),
    low: Number(row.low),
    close: Number(row.close),
    volume: Number(row.volume),
  };
}

/**
 * Load price history for all tickers, trimmed to the lookback window.
 * Always includes SPY for beta calculation even if not in tickers list.
 * @returns Map of ticker → PriceBar[] (sorted oldest → newest)
 */
export async function loadPrices(
  tickers: Ticker[],
  lookbackDays: number
): Promise<Map<string, PriceBar[]>> {
  const supabase = getServiceClient();

  // Build the set of symbols to fetch, always including the benchmark
  const symbols = new Set(tickers.map((t) => t.symbol));
  symbols.add(MARKET_BENCHMARK);

  // Compute the cutoff date: lookbackDays trading days ≈ lookbackDays * 1.5 calendar days
  const calendarDaysEstimate = Math.ceil(lookbackDays * 1.5);
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - calendarDaysEstimate);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  const symbolList = Array.from(symbols);
  const result = new Map<string, PriceBar[]>();

  // Fetch in pages to handle the full universe
  let from = 0;
  let hasMore = true;
  while (hasMore) {
    const { data, error } = await supabase
      .from('price_history')
      .select('ticker, date, open, high, low, close, volume')
      .in('ticker', symbolList)
      .gte('date', cutoffStr)
      .order('date', { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw new Error(`Failed to load prices: ${error.message}`);
    if (!data || data.length === 0) break;

    for (const row of data) {
      const ticker = row.ticker as string;
      if (!result.has(ticker)) result.set(ticker, []);
      result.get(ticker)!.push(toPriceBar(row));
    }

    hasMore = data.length === PAGE_SIZE;
    from += PAGE_SIZE;
  }

  // Trim each ticker to exactly `lookbackDays` most recent bars
  for (const [ticker, bars] of result) {
    if (bars.length > lookbackDays) {
      result.set(ticker, bars.slice(bars.length - lookbackDays));
    }
  }

  return result;
}

/**
 * Load full price history (for seasonal analysis — needs multi-year data).
 */
export async function loadFullPriceHistory(
  tickers: Ticker[]
): Promise<Map<string, PriceBar[]>> {
  const supabase = getServiceClient();
  const symbols = tickers.map((t) => t.symbol);
  const result = new Map<string, PriceBar[]>();

  let from = 0;
  let hasMore = true;
  while (hasMore) {
    const { data, error } = await supabase
      .from('price_history')
      .select('ticker, date, open, high, low, close, volume')
      .in('ticker', symbols)
      .order('date', { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw new Error(`Failed to load full price history: ${error.message}`);
    if (!data || data.length === 0) break;

    for (const row of data) {
      const ticker = row.ticker as string;
      if (!result.has(ticker)) result.set(ticker, []);
      result.get(ticker)!.push(toPriceBar(row));
    }

    hasMore = data.length === PAGE_SIZE;
    from += PAGE_SIZE;
  }

  return result;
}
