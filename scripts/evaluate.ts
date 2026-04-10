// scripts/evaluate.ts
// Backtest evaluation: measures predictive signal of scores vs forward returns.
// Usage: source .env.local && export SUPABASE_URL SUPABASE_SERVICE_KEY && npx tsx scripts/evaluate.ts
//
// Uses: scoring_runs + ticker_scores + price_history

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);

interface EvalRow {
  ticker: string;
  asset_class: string;
  score_date: string;
  risk_score: number;
  upward_score: number;
  scoring_mode: string;
  forward_return_1d?: number;
  forward_return_5d?: number;
  forward_abs_move_1d?: number;
}

async function loadScoredTickers(): Promise<EvalRow[]> {
  const { data: runs } = await supabase
    .from('scoring_runs')
    .select('id, run_date, time_horizon_months, scoring_mode')
    .eq('status', 'completed')
    .order('run_date', { ascending: true });

  if (!runs || runs.length === 0) { console.log('No completed scoring runs found.'); return []; }

  const results: EvalRow[] = [];

  for (const run of runs) {
    const { data: scores } = await supabase
      .from('ticker_scores')
      .select('ticker, asset_class, risk_score, upward_probability_score, score_date, scoring_mode')
      .eq('scoring_run_id', run.id);

    if (!scores) continue;

    for (const s of scores) {
      results.push({
        ticker: s.ticker,
        asset_class: s.asset_class,
        score_date: s.score_date,
        risk_score: Number(s.risk_score),
        upward_score: Number(s.upward_probability_score),
        scoring_mode: s.scoring_mode,
      });
    }
  }

  return results;
}

async function loadForwardReturns(rows: EvalRow[]): Promise<void> {
  // Group by ticker, then for each score_date, find forward prices
  const tickerDates = new Map<string, Set<string>>();
  for (const r of rows) {
    if (!tickerDates.has(r.ticker)) tickerDates.set(r.ticker, new Set());
    tickerDates.get(r.ticker)!.add(r.score_date);
  }

  // Load price history for all tickers (paginated — Supabase caps at 1000 rows)
  const allTickers = Array.from(tickerDates.keys());
  const priceMap = new Map<string, Map<string, number>>(); // ticker -> date -> close

  for (let i = 0; i < allTickers.length; i += 10) {
    const batch = allTickers.slice(i, i + 10);
    let from = 0;
    while (true) {
      const { data } = await supabase
        .from('price_history')
        .select('ticker, date, close')
        .in('ticker', batch)
        .order('ticker', { ascending: true })
        .order('date', { ascending: true })
        .range(from, from + 999);

      if (!data || data.length === 0) break;

      for (const row of data) {
        const t = row.ticker as string;
        if (!priceMap.has(t)) priceMap.set(t, new Map());
        priceMap.get(t)!.set(row.date as string, Number(row.close));
      }

      if (data.length < 1000) break;
      from += 1000;
    }
  }

  // Compute forward returns
  for (const r of rows) {
    const prices = priceMap.get(r.ticker);
    if (!prices) continue;

    const sortedDates = Array.from(prices.keys()).sort();
    const idx = sortedDates.indexOf(r.score_date);
    if (idx === -1) {
      // Find nearest date after score_date
      const nearIdx = sortedDates.findIndex(d => d >= r.score_date);
      if (nearIdx === -1) continue;
      const basePrice = prices.get(sortedDates[nearIdx])!;

      if (nearIdx + 1 < sortedDates.length) {
        const fwd1 = prices.get(sortedDates[nearIdx + 1])!;
        r.forward_return_1d = (fwd1 - basePrice) / basePrice;
        r.forward_abs_move_1d = Math.abs(r.forward_return_1d);
      }
      if (nearIdx + 5 < sortedDates.length) {
        const fwd5 = prices.get(sortedDates[nearIdx + 5])!;
        r.forward_return_5d = (fwd5 - basePrice) / basePrice;
      }
    } else {
      const basePrice = prices.get(sortedDates[idx])!;
      if (idx + 1 < sortedDates.length) {
        const fwd1 = prices.get(sortedDates[idx + 1])!;
        r.forward_return_1d = (fwd1 - basePrice) / basePrice;
        r.forward_abs_move_1d = Math.abs(r.forward_return_1d);
      }
      if (idx + 5 < sortedDates.length) {
        const fwd5 = prices.get(sortedDates[idx + 5])!;
        r.forward_return_5d = (fwd5 - basePrice) / basePrice;
      }
    }
  }
}

function analyzeQuintiles(rows: EvalRow[], scoreField: 'upward_score' | 'risk_score', returnField: 'forward_return_1d' | 'forward_return_5d' | 'forward_abs_move_1d', label: string) {
  const valid = rows.filter(r => r[returnField] != null);
  if (valid.length < 10) {
    console.log(`  ${label}: insufficient data (${valid.length} rows)`);
    return;
  }

  valid.sort((a, b) => a[scoreField] - b[scoreField]);
  const n = valid.length;
  const q = Math.floor(n / 5);

  const quintiles = [];
  for (let i = 0; i < 5; i++) {
    const start = i * q;
    const end = i === 4 ? n : (i + 1) * q;
    const slice = valid.slice(start, end);
    const avgReturn = slice.reduce((s, r) => s + (r[returnField] ?? 0), 0) / slice.length;
    const avgScore = slice.reduce((s, r) => s + r[scoreField], 0) / slice.length;
    const hitRate = slice.filter(r => (r[returnField] ?? 0) > 0).length / slice.length;
    quintiles.push({ quintile: i + 1, avgScore: avgScore.toFixed(1), avgReturn: (avgReturn * 100).toFixed(3) + '%', hitRate: (hitRate * 100).toFixed(1) + '%', count: slice.length });
  }

  console.log(`  ${label} (n=${valid.length}):`);
  console.table(quintiles);

  const topAvg = parseFloat(quintiles[4].avgReturn);
  const botAvg = parseFloat(quintiles[0].avgReturn);
  console.log(`  Top-Bottom spread: ${(topAvg - botAvg).toFixed(3)}%\n`);
}

function analyzeByClass(rows: EvalRow[]) {
  const classes = ['stock', 'etf', 'crypto'];
  for (const cls of classes) {
    const classRows = rows.filter(r => r.asset_class === cls);
    if (classRows.length === 0) continue;

    const withReturns = classRows.filter(r => r.forward_return_1d != null);
    const avgRisk = classRows.reduce((s, r) => s + r.risk_score, 0) / classRows.length;
    const avgUpward = classRows.reduce((s, r) => s + r.upward_score, 0) / classRows.length;
    console.log(`  ${cls}: n=${classRows.length}, with_returns=${withReturns.length}, avg_risk=${avgRisk.toFixed(1)}, avg_upward=${avgUpward.toFixed(1)}`);
  }
  console.log();
}

async function main() {
  console.log('=== DashTA Score Evaluation ===\n');

  console.log('Loading scored tickers...');
  const rows = await loadScoredTickers();
  console.log(`Loaded ${rows.length} scored ticker-dates\n`);

  if (rows.length === 0) return;

  console.log('Loading forward returns from price_history...');
  await loadForwardReturns(rows);
  const withReturns = rows.filter(r => r.forward_return_1d != null);
  console.log(`Forward returns matched: ${withReturns.length}/${rows.length}\n`);

  // Group by mode
  for (const mode of ['percentile', 'absolute']) {
    const modeRows = rows.filter(r => r.scoring_mode === mode);
    if (modeRows.length === 0) continue;

    console.log(`\n${'='.repeat(60)}`);
    console.log(`MODE: ${mode.toUpperCase()} (n=${modeRows.length})`);
    console.log('='.repeat(60));

    console.log('\n--- Coverage by asset class ---');
    analyzeByClass(modeRows);

    console.log('--- Upward Score vs Forward 1-day Return ---');
    analyzeQuintiles(modeRows, 'upward_score', 'forward_return_1d', 'Upward→1d return');

    console.log('--- Upward Score vs Forward 5-day Return ---');
    analyzeQuintiles(modeRows, 'upward_score', 'forward_return_5d', 'Upward→5d return');

    console.log('--- Risk Score vs Forward 1-day Absolute Move ---');
    analyzeQuintiles(modeRows, 'risk_score', 'forward_abs_move_1d', 'Risk→1d |move|');

    // Per asset class detail
    for (const cls of ['stock', 'etf', 'crypto']) {
      const classRows = modeRows.filter(r => r.asset_class === cls);
      if (classRows.length < 10) continue;
      console.log(`--- ${cls.toUpperCase()} only ---`);
      analyzeQuintiles(classRows, 'upward_score', 'forward_return_1d', `${cls} Upward→1d`);
    }
  }

  console.log('\n=== Evaluation Complete ===');
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
