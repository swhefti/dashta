// src/data/asset-loader.ts
// Load the ticker universe from the `assets` table.

import { getServiceClient } from '../shared/supabase';
import type { Ticker } from '../shared/types';

/**
 * Load all active tickers from the assets table.
 * Maps DB `asset_type` to our internal `asset_class`.
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

  return data.map((row) => ({
    symbol: row.ticker,
    name: row.name,
    asset_class: row.asset_type as Ticker['asset_class'],
    sector: row.sector ?? undefined,
  }));
}
