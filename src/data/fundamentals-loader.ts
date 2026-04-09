// src/data/fundamentals-loader.ts
// Load fundamental_data from Supabase.
//
// Schema: fundamental_data(ticker TEXT, date DATE, pe_ratio NUMERIC,
//         ps_ratio NUMERIC, revenue_growth_yoy NUMERIC, profit_margin NUMERIC,
//         roe NUMERIC, market_cap BIGINT, debt_to_equity NUMERIC, ingested_at TIMESTAMPTZ)
// PK: (ticker, date). Crypto tickers have no rows here.

import { getServiceClient } from '../shared/supabase';
import type { Ticker } from '../shared/types';

export interface FundamentalRecord {
  ticker: string;
  pe_ratio: number | null;
  ps_ratio: number | null;
  revenue_growth_yoy: number | null;
  profit_margin: number | null;
  roe: number | null;
  market_cap: number | null;
  debt_to_equity: number | null;
  sector: string | null;
  sector_median_pe: number | null;
}

/**
 * Load latest fundamentals for all tickers.
 * Returns null for crypto tickers (no fundamental data available).
 * Computes sector_median_pe by grouping stocks by their sector.
 */
export async function loadFundamentals(
  tickers: Ticker[]
): Promise<Map<string, FundamentalRecord | null>> {
  const supabase = getServiceClient();
  const result = new Map<string, FundamentalRecord | null>();

  // Crypto tickers get null immediately
  const nonCrypto = tickers.filter((t) => t.asset_class !== 'crypto');
  const cryptoTickers = tickers.filter((t) => t.asset_class === 'crypto');
  for (const t of cryptoTickers) {
    result.set(t.symbol, null);
  }

  if (nonCrypto.length === 0) return result;

  // Load all fundamental_data rows, ordered by date desc so we can pick the latest per ticker
  const symbols = nonCrypto.map((t) => t.symbol);
  const { data, error } = await supabase
    .from('fundamental_data')
    .select('ticker, date, pe_ratio, ps_ratio, revenue_growth_yoy, profit_margin, roe, market_cap, debt_to_equity')
    .in('ticker', symbols)
    .order('date', { ascending: false });

  if (error) throw new Error(`Failed to load fundamentals: ${error.message}`);

  // Pick the most recent row per ticker
  const latestByTicker = new Map<string, Record<string, unknown>>();
  if (data) {
    for (const row of data) {
      const ticker = row.ticker as string;
      if (!latestByTicker.has(ticker)) {
        latestByTicker.set(ticker, row);
      }
    }
  }

  // Build a sector lookup from tickers
  const sectorMap = new Map<string, string | undefined>();
  for (const t of nonCrypto) {
    sectorMap.set(t.symbol, t.sector);
  }

  // Collect PE ratios by sector for median calculation
  const pesBySector = new Map<string, number[]>();
  for (const [ticker, row] of latestByTicker) {
    const sector = sectorMap.get(ticker);
    const pe = row.pe_ratio != null ? Number(row.pe_ratio) : null;
    if (sector && pe != null && isFinite(pe) && pe > 0) {
      if (!pesBySector.has(sector)) pesBySector.set(sector, []);
      pesBySector.get(sector)!.push(pe);
    }
  }

  // Compute median PE per sector
  const sectorMedianPe = new Map<string, number>();
  for (const [sector, pes] of pesBySector) {
    pes.sort((a, b) => a - b);
    const mid = Math.floor(pes.length / 2);
    sectorMedianPe.set(
      sector,
      pes.length % 2 === 0 ? (pes[mid - 1] + pes[mid]) / 2 : pes[mid]
    );
  }

  // Build final records
  for (const t of nonCrypto) {
    const row = latestByTicker.get(t.symbol);
    if (!row) {
      result.set(t.symbol, null);
      continue;
    }

    result.set(t.symbol, {
      ticker: t.symbol,
      pe_ratio: row.pe_ratio != null ? Number(row.pe_ratio) : null,
      ps_ratio: row.ps_ratio != null ? Number(row.ps_ratio) : null,
      revenue_growth_yoy: row.revenue_growth_yoy != null ? Number(row.revenue_growth_yoy) : null,
      profit_margin: row.profit_margin != null ? Number(row.profit_margin) : null,
      roe: row.roe != null ? Number(row.roe) : null,
      market_cap: row.market_cap != null ? Number(row.market_cap) : null,
      debt_to_equity: row.debt_to_equity != null ? Number(row.debt_to_equity) : null,
      sector: t.sector ?? null,
      sector_median_pe: t.sector ? (sectorMedianPe.get(t.sector) ?? null) : null,
    });
  }

  return result;
}
