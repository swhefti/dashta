// scripts/backfill.ts
// Backfill price_history and fundamental_data for new tickers via Twelve Data API.
// Usage: TWELVE_DATA_API_KEY=xxx npx tsx scripts/backfill.ts

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY!;
const TD_KEY = process.env.TWELVE_DATA_API_KEY!;

if (!TD_KEY) { console.error('Missing TWELVE_DATA_API_KEY'); process.exit(1); }

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ── Helpers ──

function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

async function fetchJSON(url: string): Promise<any> {
  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
  return res.json();
}

// ── New tickers that need backfill ──

const NEW_CRYPTO = [
  'TRX', 'DOGE', 'HYPE', 'LEO', 'XMR', 'SUI', 'SHIB', 'TON', 'NEAR',
];

const NEW_STOCKS = [
  'MRVL', 'ANET', 'MU', 'WDC', 'STX', 'DELL', 'SMCI', 'VRT', 'ETN', 'GEV',
  'PWR', 'CEG', 'TLN', 'VST', 'DLR', 'EQIX', 'MDB', 'CFLT', 'DDOG', 'NET',
  'ESTC', 'NOW', 'ASML', 'ORCL', 'BAC', 'CSCO', 'HSBC', 'RY', 'NEE', 'CRM',
  'BLK', 'SHOP', 'SPOT', 'CRWD', 'MELI',
];

// Crypto that existed before but might need more history
const EXISTING_CRYPTO = [
  'BTC', 'ETH', 'XRP', 'BNB', 'SOL', 'ADA', 'BCH', 'LINK', 'XLM', 'LTC', 'AVAX',
];

// ── Step 4: Backfill price history ──

async function backfillPrices(ticker: string, isCrypto: boolean): Promise<number> {
  const symbol = isCrypto ? `${ticker}/USD` : ticker;
  const url = `https://api.twelvedata.com/time_series?symbol=${symbol}&interval=1day&outputsize=504&apikey=${TD_KEY}`;

  try {
    const data = await fetchJSON(url);
    if (data.status === 'error') {
      console.warn(`  [SKIP] ${ticker}: ${data.message}`);
      return 0;
    }
    const values = data.values as any[];
    if (!values || values.length === 0) {
      console.warn(`  [SKIP] ${ticker}: no data returned`);
      return 0;
    }

    // Build rows
    const rows = values.map((v: any) => ({
      ticker,
      date: v.datetime,
      open: parseFloat(v.open),
      high: parseFloat(v.high),
      low: parseFloat(v.low),
      close: parseFloat(v.close),
      volume: parseInt(v.volume) || 0,
    }));

    // Upsert in chunks
    const CHUNK = 200;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK);
      const { error } = await supabase
        .from('price_history')
        .upsert(chunk, { onConflict: 'ticker,date' });
      if (error) console.warn(`  [WARN] ${ticker} chunk ${i}: ${error.message}`);
    }

    return rows.length;
  } catch (err: any) {
    console.warn(`  [FAIL] ${ticker}: ${err.message}`);
    return 0;
  }
}

// ── Step 5: Backfill fundamentals ──

async function backfillFundamentals(ticker: string): Promise<boolean> {
  // Twelve Data statistics endpoint
  const url = `https://api.twelvedata.com/statistics?symbol=${ticker}&apikey=${TD_KEY}`;

  try {
    const data = await fetchJSON(url);
    if (data.status === 'error') {
      console.warn(`  [SKIP] ${ticker} fundamentals: ${data.message}`);
      return false;
    }

    const stats = data.statistics || data;
    const financials = stats?.financials?.income_statement?.quarterly || {};
    const valuation = stats?.valuations || {};
    const balanceSheet = stats?.financials?.balance_sheet?.quarterly || {};

    const row: Record<string, any> = {
      ticker,
      date: new Date().toISOString().slice(0, 10),
    };

    // Try to extract what we can
    if (valuation.trailing_pe) row.pe_ratio = parseFloat(valuation.trailing_pe);
    if (valuation.price_to_sales_trailing_12months) row.ps_ratio = parseFloat(valuation.price_to_sales_trailing_12months);
    if (stats?.financials?.income_statement?.profit_margin) row.profit_margin = parseFloat(stats.financials.income_statement.profit_margin);
    if (stats?.financials?.income_statement?.revenue_growth) row.revenue_growth_yoy = parseFloat(stats.financials.income_statement.revenue_growth);
    if (stats?.financials?.income_statement?.return_on_equity) row.roe = parseFloat(stats.financials.income_statement.return_on_equity);
    if (balanceSheet?.total_debt_to_equity) row.debt_to_equity = parseFloat(balanceSheet.total_debt_to_equity);
    if (stats?.market_capitalization) row.market_cap = parseInt(stats.market_capitalization);

    // Only insert if we got at least something useful
    const hasData = Object.keys(row).length > 2; // more than just ticker+date
    if (!hasData) {
      console.warn(`  [SKIP] ${ticker} fundamentals: no useful data`);
      return false;
    }

    const { error } = await supabase
      .from('fundamental_data')
      .upsert(row, { onConflict: 'ticker,date' });
    if (error) {
      console.warn(`  [WARN] ${ticker} fundamentals: ${error.message}`);
      return false;
    }
    return true;
  } catch (err: any) {
    console.warn(`  [FAIL] ${ticker} fundamentals: ${err.message}`);
    return false;
  }
}

// Also try Finnhub as fallback for fundamentals
async function backfillFundamentalsFinnhub(ticker: string): Promise<boolean> {
  const fhKey = process.env.FINNHUB_API_KEY;
  if (!fhKey) return false;

  try {
    const [metricsRes, profileRes] = await Promise.all([
      fetchJSON(`https://finnhub.io/api/v1/stock/metric?symbol=${ticker}&metric=all&token=${fhKey}`),
      fetchJSON(`https://finnhub.io/api/v1/stock/profile2?symbol=${ticker}&token=${fhKey}`),
    ]);

    const m = metricsRes?.metric || {};
    const p = profileRes || {};
    const row: Record<string, any> = {
      ticker,
      date: new Date().toISOString().slice(0, 10),
    };

    if (m.peBasicExclExtraTTM) row.pe_ratio = m.peBasicExclExtraTTM;
    if (m.psTTM) row.ps_ratio = m.psTTM;
    if (m.revenueGrowthTTMYoy) row.revenue_growth_yoy = m.revenueGrowthTTMYoy / 100;
    if (m.netProfitMarginTTM) row.profit_margin = m.netProfitMarginTTM / 100;
    if (m.roeTTM) row.roe = m.roeTTM / 100;
    if (m.totalDebtToEquityQuarterly) row.debt_to_equity = m.totalDebtToEquityQuarterly;
    if (p.marketCapitalization) row.market_cap = Math.round(p.marketCapitalization * 1_000_000);

    const hasData = Object.keys(row).length > 2;
    if (!hasData) return false;

    const { error } = await supabase
      .from('fundamental_data')
      .upsert(row, { onConflict: 'ticker,date' });
    return !error;
  } catch {
    return false;
  }
}

// ── Main ──

async function main() {
  console.log('=== Backfill Script ===\n');

  // Combine all tickers needing price history
  const allPriceTickers = [
    ...NEW_CRYPTO.map((t) => ({ ticker: t, crypto: true })),
    ...EXISTING_CRYPTO.map((t) => ({ ticker: t, crypto: true })),
    ...NEW_STOCKS.map((t) => ({ ticker: t, crypto: false })),
  ];

  // ── Price History (8 calls/min rate limit) ──
  console.log(`\n--- Price History: ${allPriceTickers.length} tickers ---`);
  let batchCount = 0;
  let totalBars = 0;

  for (const { ticker, crypto } of allPriceTickers) {
    if (batchCount > 0 && batchCount % 8 === 0) {
      console.log('  [RATE LIMIT] waiting 65s...');
      await sleep(65_000);
    }
    process.stdout.write(`  ${ticker}...`);
    const count = await backfillPrices(ticker, crypto);
    console.log(` ${count} bars`);
    totalBars += count;
    batchCount++;
  }
  console.log(`\nTotal: ${totalBars} price bars inserted\n`);

  // ── Fundamentals (stocks only) ──
  console.log(`\n--- Fundamentals: ${NEW_STOCKS.length} stocks ---`);
  let fundSuccess = 0;
  batchCount = 0;

  for (const ticker of NEW_STOCKS) {
    if (batchCount > 0 && batchCount % 8 === 0) {
      console.log('  [RATE LIMIT] waiting 65s...');
      await sleep(65_000);
    }
    process.stdout.write(`  ${ticker}...`);
    let ok = await backfillFundamentals(ticker);
    if (!ok) {
      // Finnhub fallback
      ok = await backfillFundamentalsFinnhub(ticker);
      if (ok) process.stdout.write(' (finnhub)');
    }
    console.log(ok ? ' OK' : ' SKIP');
    if (ok) fundSuccess++;
    batchCount++;
  }
  console.log(`\nFundamentals: ${fundSuccess}/${NEW_STOCKS.length} succeeded\n`);

  console.log('=== Backfill Complete ===');
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
