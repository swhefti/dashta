// src/data/price-loader.ts
// Load price_history from Supabase for all tickers in the universe.
//
// Schema: price_history(ticker TEXT, date DATE, open NUMERIC, high NUMERIC,
//         low NUMERIC, close NUMERIC, volume BIGINT, ingested_at TIMESTAMPTZ)
// PK: (ticker, date). Note: volume=0 for crypto assets.

import { getServiceClient } from '../shared/supabase';
import type { PriceBar, Ticker } from '../shared/types';
import { MARKET_BENCHMARK, CRYPTO_BENCHMARK } from '../shared/constants';

/** Max rows per Supabase query. Supabase default server limit is 1000. */
const PAGE_SIZE = 1_000;

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
 * Paginated fetch with deterministic ordering by (ticker, date).
 * Ordering by both columns guarantees no row is skipped or duplicated
 * across page boundaries, since (ticker, date) is the PK.
 */
async function fetchPaginated(
  supabase: ReturnType<typeof getServiceClient>,
  symbolList: string[],
  cutoffStr: string | null
): Promise<Map<string, PriceBar[]>> {
  const result = new Map<string, PriceBar[]>();
  let from = 0;

  while (true) {
    let query = supabase
      .from('price_history')
      .select('ticker, date, open, high, low, close, volume')
      .in('ticker', symbolList)
      .order('ticker', { ascending: true })
      .order('date', { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (cutoffStr) query = query.gte('date', cutoffStr);

    const { data, error } = await query;
    if (error) throw new Error(`Failed to load prices: ${error.message}`);
    if (!data || data.length === 0) break;

    for (const row of data) {
      const ticker = row.ticker as string;
      if (!result.has(ticker)) result.set(ticker, []);
      result.get(ticker)!.push(toPriceBar(row));
    }

    if (data.length < PAGE_SIZE) break; // last page
    from += PAGE_SIZE;
  }

  return result;
}

/**
 * Load price history for all tickers, trimmed to the lookback window.
 * Always includes SPY and BTC benchmarks for beta calculation.
 * @returns Map of ticker → PriceBar[] (sorted oldest → newest)
 */
export async function loadPrices(
  tickers: Ticker[],
  lookbackDays: number
): Promise<Map<string, PriceBar[]>> {
  const supabase = getServiceClient();

  const symbols = new Set(tickers.map((t) => t.symbol));
  symbols.add(MARKET_BENCHMARK);
  symbols.add(CRYPTO_BENCHMARK);

  // lookbackDays trading days ≈ lookbackDays * 1.5 calendar days
  const calendarDaysEstimate = Math.ceil(lookbackDays * 1.5);
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - calendarDaysEstimate);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  const result = await fetchPaginated(supabase, Array.from(symbols), cutoffStr);

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
  return fetchPaginated(supabase, symbols, null);
}
