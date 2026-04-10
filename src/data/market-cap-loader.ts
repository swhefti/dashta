// src/data/market-cap-loader.ts
// Load market cap and current price for display / bubble sizing.
//
// Stocks:  market_cap from `fundamental_data`
// Crypto:  market_cap from CoinGecko free API
// ETFs:    market_cap (AUM) from fallback constants (no reliable free API)

import { getServiceClient } from '../shared/supabase';
import type { Ticker } from '../shared/types';
import { COINGECKO_IDS, ETF_AUM_FALLBACK } from '../shared/constants';

export interface MarketCapRecord {
  market_cap: number | null;
  current_price: number | null;
  company_name: string;
}

/**
 * Fetch crypto market caps from CoinGecko free API.
 * Returns a map of our ticker symbol → market_cap in USD.
 */
async function fetchCryptoMarketCaps(
  cryptoTickers: string[]
): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  if (cryptoTickers.length === 0) return result;

  // Build reverse lookup: coingecko_id → our ticker
  const idToTicker = new Map<string, string>();
  const ids: string[] = [];
  for (const ticker of cryptoTickers) {
    const cgId = COINGECKO_IDS[ticker];
    if (cgId) {
      idToTicker.set(cgId, ticker);
      ids.push(cgId);
    }
  }

  if (ids.length === 0) return result;

  try {
    const url = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${ids.join(',')}&per_page=100&page=1&sparkline=false`;
    const res = await fetch(url, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      console.warn(`CoinGecko API returned ${res.status}, falling back to null market caps for crypto`);
      return result;
    }

    const data = (await res.json()) as Array<{
      id: string;
      market_cap: number | null;
    }>;

    for (const coin of data) {
      const ticker = idToTicker.get(coin.id);
      if (ticker && coin.market_cap != null && coin.market_cap > 0) {
        result.set(ticker, coin.market_cap);
      }
    }
  } catch (err) {
    console.warn('CoinGecko fetch failed, crypto market caps will be null:', err);
  }

  return result;
}

/**
 * Load market cap and current price for all tickers.
 *
 * - Stocks: market_cap from `fundamental_data`
 * - Crypto: market_cap from CoinGecko API
 * - ETFs: market_cap from hardcoded AUM fallback
 * - current_price: latest `last_price` from `market_quotes`
 */
export async function loadMarketCaps(
  tickers: Ticker[]
): Promise<Map<string, MarketCapRecord>> {
  const supabase = getServiceClient();
  const symbols = tickers.map((t) => t.symbol);
  const result = new Map<string, MarketCapRecord>();

  // 1. Load latest price per ticker from market_quotes
  const { data: quotes, error: qErr } = await supabase
    .from('market_quotes')
    .select('ticker, date, last_price')
    .in('ticker', symbols)
    .order('date', { ascending: false });

  if (qErr) throw new Error(`Failed to load market quotes: ${qErr.message}`);

  const latestPrice = new Map<string, number>();
  if (quotes) {
    for (const row of quotes) {
      const ticker = row.ticker as string;
      if (!latestPrice.has(ticker)) {
        latestPrice.set(ticker, Number(row.last_price));
      }
    }
  }

  // 2. Load stock market_cap from fundamental_data
  const stocks = tickers.filter((t) => t.asset_class === 'stock').map((t) => t.symbol);
  const stockCap = new Map<string, number | null>();

  if (stocks.length > 0) {
    const { data: fundRows, error: fErr } = await supabase
      .from('fundamental_data')
      .select('ticker, date, market_cap')
      .in('ticker', stocks)
      .order('date', { ascending: false });

    if (fErr) throw new Error(`Failed to load stock market caps: ${fErr.message}`);

    if (fundRows) {
      for (const row of fundRows) {
        const ticker = row.ticker as string;
        if (!stockCap.has(ticker)) {
          stockCap.set(ticker, row.market_cap != null ? Number(row.market_cap) : null);
        }
      }
    }
  }

  // 3. Fetch crypto market caps from CoinGecko
  const cryptoTickers = tickers.filter((t) => t.asset_class === 'crypto').map((t) => t.symbol);
  const cryptoCaps = await fetchCryptoMarketCaps(cryptoTickers);

  // 4. ETF market caps from fallback AUM constants
  // (No reliable free API for ETF AUM)

  // 5. Build name lookup
  const nameMap = new Map<string, string>();
  for (const t of tickers) {
    nameMap.set(t.symbol, t.name);
  }

  // 6. Assemble results — include ALL tickers, even those missing quotes.
  // Use null for current_price when no quote data exists (don't fake 0).
  for (const t of tickers) {
    const price = latestPrice.get(t.symbol) ?? null;

    let marketCap: number | null = null;
    if (t.asset_class === 'stock') {
      marketCap = stockCap.get(t.symbol) ?? null;
    } else if (t.asset_class === 'crypto') {
      marketCap = cryptoCaps.get(t.symbol) ?? null;
    } else if (t.asset_class === 'etf') {
      marketCap = ETF_AUM_FALLBACK[t.symbol] ?? null;
    }

    // For stocks without market_quotes, try to derive price from latest price_history close
    let finalPrice = price;
    if (finalPrice == null && t.asset_class === 'stock') {
      // Price will be sourced from price_history by the caller if needed
      finalPrice = null;
    }

    result.set(t.symbol, {
      market_cap: marketCap,
      current_price: finalPrice,
      company_name: nameMap.get(t.symbol) ?? t.symbol,
    });
  }

  return result;
}
