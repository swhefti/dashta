// src/data/asset-loader.ts
// Load the ticker universe from the `assets` table.
// Excludes synthetic/non-investable pseudo-assets (MARKET, _MARKET).

import { getServiceClient } from '../shared/supabase';
import type { Ticker } from '../shared/types';

/** Tickers that exist in the assets table for internal use but are not investable. */
const SYNTHETIC_TICKERS = new Set(['MARKET', '_MARKET']);

/**
 * Load all active, investable tickers from the assets table.
 * Filters out synthetic pseudo-assets used by other pipeline components.
 */
export async function loadAssets(): Promise<Ticker[]> {
  const supabase = getServiceClient();

  const { data, error } = await supabase
    .from('assets')
    .select('ticker, name, asset_type, sector')
    .eq('active', true)
    .order('ticker');

  if (error) throw new Error(`Failed to load assets: ${error.message}`);
  if (!data || data.length === 0) throw new Error('No active assets found');

  return data
    .filter((row) => !SYNTHETIC_TICKERS.has(row.ticker as string))
    .map((row) => ({
      symbol: row.ticker as string,
      name: row.name as string,
      asset_class: row.asset_type as Ticker['asset_class'],
      sector: (row.sector as string) ?? undefined,
    }));
}
