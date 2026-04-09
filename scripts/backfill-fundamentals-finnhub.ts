// scripts/backfill-fundamentals-finnhub.ts
// Backfill fundamental_data for new stock tickers using Finnhub API.
// Finnhub free tier: 60 calls/min
// Usage: source .env.local && export SUPABASE_URL SUPABASE_SERVICE_KEY FINNHUB_API_KEY && npx tsx scripts/backfill-fundamentals-finnhub.ts

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);
const FH_KEY = process.env.FINNHUB_API_KEY!;
if (!FH_KEY) { console.error('Missing FINNHUB_API_KEY'); process.exit(1); }

function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

async function fetchJSON(url: string): Promise<any> {
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

const STOCKS = [
  'MRVL','ANET','MU','WDC','STX','DELL','SMCI','VRT','ETN','GEV',
  'PWR','CEG','TLN','VST','DLR','EQIX','MDB','CFLT','DDOG','NET',
  'ESTC','NOW','ASML','ORCL','BAC','CSCO','HSBC','RY','NEE','CRM',
  'BLK','SHOP','SPOT','CRWD','MELI',
];

async function backfill(ticker: string): Promise<boolean> {
  try {
    const [metricsRes, profileRes] = await Promise.all([
      fetchJSON(`https://finnhub.io/api/v1/stock/metric?symbol=${ticker}&metric=all&token=${FH_KEY}`),
      fetchJSON(`https://finnhub.io/api/v1/stock/profile2?symbol=${ticker}&token=${FH_KEY}`),
    ]);

    const m = metricsRes?.metric || {};
    const p = profileRes || {};
    const row: Record<string, any> = {
      ticker,
      date: new Date().toISOString().slice(0, 10),
    };

    if (m.peBasicExclExtraTTM) row.pe_ratio = m.peBasicExclExtraTTM;
    else if (m.peTTM) row.pe_ratio = m.peTTM;
    if (m.psTTM) row.ps_ratio = m.psTTM;
    if (m.revenueGrowthTTMYoy != null) row.revenue_growth_yoy = m.revenueGrowthTTMYoy / 100;
    else if (m.revenueGrowth3Y != null) row.revenue_growth_yoy = m.revenueGrowth3Y / 100;
    if (m.netProfitMarginTTM != null) row.profit_margin = m.netProfitMarginTTM / 100;
    if (m.roeTTM != null) row.roe = m.roeTTM / 100;
    if (m.totalDebt2EquityQuarterly != null) row.debt_to_equity = m.totalDebt2EquityQuarterly / 100;
    else if (m['totalDebt/totalEquityQuarterly'] != null) row.debt_to_equity = m['totalDebt/totalEquityQuarterly'];
    if (p.marketCapitalization) row.market_cap = Math.round(p.marketCapitalization * 1_000_000);

    const fields = Object.keys(row).filter(k => k !== 'ticker' && k !== 'date');
    if (fields.length === 0) {
      console.log(`  ${ticker}: no data from Finnhub`);
      return false;
    }

    const { error } = await supabase
      .from('fundamental_data')
      .upsert(row, { onConflict: 'ticker,date' });

    if (error) {
      console.log(`  ${ticker}: DB error — ${error.message}`);
      return false;
    }

    console.log(`  ${ticker}: OK (${fields.join(', ')})`);
    return true;
  } catch (err: any) {
    console.log(`  ${ticker}: FAIL — ${err.message}`);
    return false;
  }
}

async function main() {
  console.log(`=== Finnhub Fundamentals Backfill: ${STOCKS.length} stocks ===\n`);
  let ok = 0;
  for (let i = 0; i < STOCKS.length; i++) {
    // Finnhub free tier: 60/min, but 2 calls per ticker. Be safe: 8 tickers then wait.
    if (i > 0 && i % 8 === 0) {
      console.log('  [rate limit] waiting 65s...');
      await sleep(65_000);
    }
    if (await backfill(STOCKS[i])) ok++;
  }
  console.log(`\nDone: ${ok}/${STOCKS.length} succeeded`);
}

main().catch((e) => { console.error('Fatal:', e); process.exit(1); });
