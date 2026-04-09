// src/shared/constants.ts

export const TIME_HORIZONS = [3, 6, 12] as const;
export type TimeHorizon = (typeof TIME_HORIZONS)[number];

// Compute lookback window in trading days for a given horizon
export function getLookbackDays(horizonMonths: number): number {
  return Math.floor(1.5 * horizonMonths * 21);
}

// Moving average periods per horizon
export const MA_PERIODS: Record<number, { short: number; long: number }> = {
  3: { short: 20, long: 50 },
  6: { short: 50, long: 100 },
  12: { short: 100, long: 200 },
};

// Asset class colors for the bubble chart
export const ASSET_CLASS_COLORS = {
  stock: '#4f8ff7',  // electric blue
  etf: '#34d399',    // emerald
  crypto: '#f5a623', // amber gold
} as const;

// SPY is the market benchmark for beta calculation
export const MARKET_BENCHMARK = 'SPY';

// BTC is the crypto benchmark for crypto beta
export const CRYPTO_BENCHMARK = 'BTC';

// CoinGecko ID mapping for our crypto tickers
export const COINGECKO_IDS: Record<string, string> = {
  BTC: 'bitcoin',
  ETH: 'ethereum',
  XRP: 'ripple',
  BNB: 'binancecoin',
  SOL: 'solana',
  TRX: 'tron',
  DOGE: 'dogecoin',
  HYPE: 'hyperliquid',
  LEO: 'leo-token',
  ADA: 'cardano',
  BCH: 'bitcoin-cash',
  LINK: 'chainlink',
  XMR: 'monero',
  XLM: 'stellar',
  LTC: 'litecoin',
  AVAX: 'avalanche-2',
  SUI: 'sui',
  SHIB: 'shiba-inu',
  TON: 'the-open-network',
  NEAR: 'near',
};

// Approximate ETF AUM (assets under management) in USD as of early 2026.
// Used as fallback when no dynamic source is available.
export const ETF_AUM_FALLBACK: Record<string, number> = {
  SPY:  560_000_000_000,
  VOO:  480_000_000_000,
  VTI:  420_000_000_000,
  QQQ:  310_000_000_000,
  IWM:   70_000_000_000,
  EEM:   25_000_000_000,
  VEA:   55_000_000_000,
  SCHD:  65_000_000_000,
  GLD:   75_000_000_000,
  SLV:   14_000_000_000,
  TLT:   50_000_000_000,
  LQD:   32_000_000_000,
  HYG:   17_000_000_000,
  USO:    2_000_000_000,
  XLK:   70_000_000_000,
  XLF:   42_000_000_000,
  XLE:   38_000_000_000,
  XLV:   37_000_000_000,
  XLI:   21_000_000_000,
  ARKK:   5_500_000_000,
};
