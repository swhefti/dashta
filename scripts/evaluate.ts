// scripts/evaluate.ts
// Per-horizon backtest evaluation.
// Usage: source .env.local && export SUPABASE_URL SUPABASE_SERVICE_KEY && npx tsx scripts/evaluate.ts

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);

// Forward windows per horizon (in trading days)
const FORWARD_WINDOWS: Record<number, number[]> = {
  3:  [1, 5],
  6:  [5, 21],
  12: [21, 63],
};

interface EvalRow {
  ticker: string;
  asset_class: string;
  score_date: string;
  horizon: number;
  risk_score: number;
  upward_score: number;
  scoring_mode: string;
  confidence: number | null;
  forward_returns: Record<number, number | undefined>; // window → return
  forward_abs: Record<number, number | undefined>;
}

async function loadScoredTickers(): Promise<EvalRow[]> {
  const { data: runs } = await supabase
    .from('scoring_runs')
    .select('id, run_date, time_horizon_months, scoring_mode')
    .eq('status', 'completed')
    .order('run_date', { ascending: true });

  if (!runs || runs.length === 0) return [];
  const results: EvalRow[] = [];

  for (const run of runs) {
    let from = 0;
    while (true) {
      const { data: scores } = await supabase
        .from('ticker_scores')
        .select('ticker, asset_class, risk_score, upward_probability_score, score_date, scoring_mode, confidence')
        .eq('scoring_run_id', run.id)
        .range(from, from + 999);

      if (!scores || scores.length === 0) break;

      for (const s of scores) {
        results.push({
          ticker: s.ticker, asset_class: s.asset_class, score_date: s.score_date,
          horizon: run.time_horizon_months, risk_score: Number(s.risk_score),
          upward_score: Number(s.upward_probability_score), scoring_mode: s.scoring_mode,
          confidence: s.confidence != null ? Number(s.confidence) : null,
          forward_returns: {}, forward_abs: {},
        });
      }
      if (scores.length < 1000) break;
      from += 1000;
    }
  }
  return results;
}

async function loadForwardReturns(rows: EvalRow[]): Promise<void> {
  const allTickers = [...new Set(rows.map(r => r.ticker))];
  const priceMap = new Map<string, Map<string, number>>();

  for (let i = 0; i < allTickers.length; i += 10) {
    const batch = allTickers.slice(i, i + 10);
    let from = 0;
    while (true) {
      const { data } = await supabase
        .from('price_history').select('ticker, date, close')
        .in('ticker', batch)
        .order('ticker', { ascending: true }).order('date', { ascending: true })
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

  for (const r of rows) {
    const prices = priceMap.get(r.ticker);
    if (!prices) continue;
    const sortedDates = Array.from(prices.keys()).sort();
    let baseIdx = sortedDates.indexOf(r.score_date);
    if (baseIdx === -1) baseIdx = sortedDates.findIndex(d => d >= r.score_date);
    if (baseIdx === -1) continue;
    const basePrice = prices.get(sortedDates[baseIdx])!;

    const windows = FORWARD_WINDOWS[r.horizon] ?? [1, 5];
    for (const w of windows) {
      if (baseIdx + w < sortedDates.length) {
        const fwdPrice = prices.get(sortedDates[baseIdx + w])!;
        const ret = (fwdPrice - basePrice) / basePrice;
        r.forward_returns[w] = ret;
        r.forward_abs[w] = Math.abs(ret);
      }
    }
  }
}

function quintileAnalysis(
  rows: EvalRow[],
  scoreField: 'upward_score' | 'risk_score',
  returnKey: number,
  returnType: 'return' | 'abs',
  label: string
) {
  const valid = rows.filter(r => {
    const v = returnType === 'abs' ? r.forward_abs[returnKey] : r.forward_returns[returnKey];
    return v != null;
  });
  if (valid.length < 10) {
    console.log(`    ${label}: insufficient data (${valid.length} rows)`);
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
    const vals = slice.map(r => returnType === 'abs' ? (r.forward_abs[returnKey] ?? 0) : (r.forward_returns[returnKey] ?? 0));
    const avg = vals.reduce((s, v) => s + v, 0) / vals.length;
    const avgScore = slice.reduce((s, r) => s + r[scoreField], 0) / slice.length;
    const hitRate = returnType === 'return' ? vals.filter(v => v > 0).length / vals.length : NaN;
    quintiles.push({
      Q: `Q${i + 1}`,
      avgScore: avgScore.toFixed(1),
      avgReturn: (avg * 100).toFixed(3) + '%',
      ...(returnType === 'return' ? { hitRate: (hitRate * 100).toFixed(1) + '%' } : {}),
      n: slice.length,
    });
  }
  console.log(`    ${label} (n=${valid.length}):`);
  console.table(quintiles);
  const topAvg = parseFloat(quintiles[4].avgReturn);
  const botAvg = parseFloat(quintiles[0].avgReturn);
  console.log(`    Spread Q5-Q1: ${(topAvg - botAvg).toFixed(3)}%\n`);
}

async function main() {
  console.log('=== DashTA Per-Horizon Evaluation ===\n');

  const rows = await loadScoredTickers();
  console.log(`Loaded ${rows.length} scored ticker-dates`);
  if (rows.length === 0) return;

  await loadForwardReturns(rows);

  // Group by horizon → mode
  const horizons = [...new Set(rows.map(r => r.horizon))].sort((a, b) => a - b);
  const modes = [...new Set(rows.map(r => r.scoring_mode))];

  for (const h of horizons) {
    const windows = FORWARD_WINDOWS[h] ?? [1, 5];
    console.log(`\n${'#'.repeat(70)}`);
    console.log(`# HORIZON: ${h}mo   Forward windows: ${windows.map(w => w + 'd').join(', ')}`);
    console.log('#'.repeat(70));

    for (const mode of modes) {
      const subset = rows.filter(r => r.horizon === h && r.scoring_mode === mode);
      if (subset.length === 0) continue;

      console.log(`\n  MODE: ${mode.toUpperCase()} (n=${subset.length})`);

      // Coverage
      const classes = ['stock', 'etf', 'crypto'];
      for (const cls of classes) {
        const cr = subset.filter(r => r.asset_class === cls);
        if (cr.length === 0) continue;
        const withFwd = cr.filter(r => r.forward_returns[windows[0]] != null).length;
        const avgConf = cr.reduce((s, r) => s + (r.confidence ?? 0), 0) / cr.length;
        console.log(`    ${cls}: n=${cr.length}, with_fwd=${withFwd}, avg_confidence=${avgConf.toFixed(0)}`);
      }

      for (const w of windows) {
        console.log(`\n  --- Forward ${w}d ---`);
        quintileAnalysis(subset, 'upward_score', w, 'return', `Upward→${w}d return`);
        quintileAnalysis(subset, 'risk_score', w, 'abs', `Risk→${w}d |move|`);
      }

      // Per-class detail for largest window
      for (const cls of classes) {
        const cr = subset.filter(r => r.asset_class === cls);
        if (cr.length < 10) continue;
        console.log(`  --- ${cls.toUpperCase()} ${windows[0]}d ---`);
        quintileAnalysis(cr, 'upward_score', windows[0], 'return', `${cls} Upward→${windows[0]}d`);
      }
    }
  }

  console.log('\n=== Evaluation Complete ===');
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
