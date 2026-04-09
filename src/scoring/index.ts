// src/scoring/index.ts
// Main scoring orchestrator: runs the full pipeline for a given time horizon.
// Produces both percentile (relative) and absolute scoring modes.

import { getServiceClient } from '../shared/supabase';
import { getLookbackDays, MA_PERIODS, MARKET_BENCHMARK } from '../shared/constants';
import type { Ticker, ScoringWeight } from '../shared/types';
import { percentileRank } from './normalizer';
import { absoluteNormalizeRisk, absoluteNormalizeUpward } from './normalizer-absolute';
import { composeScore } from './composer';

// Data loaders
import { loadAssets } from '../data/asset-loader';
import { loadPrices, loadFullPriceHistory } from '../data/price-loader';
import { loadFundamentals } from '../data/fundamentals-loader';
import { loadSentiment } from '../data/sentiment-loader';
import { loadMarketCaps } from '../data/market-cap-loader';
import { loadCurrentRegime, loadMacroEvents } from '../data/regime-loader';

// Risk calculators
import { calculateVolatility } from './risk/volatility';
import { calculateMaxDrawdown } from './risk/drawdown';
import { calculateBeta } from './risk/beta';
import { calculateLiquidity } from './risk/liquidity';
import { calculateFragility } from './risk/fragility';

// Upward probability calculators
import { calculateMomentum } from './upward/momentum';
import { calculateReversion } from './upward/reversion';
import { calculateFundamentalValue } from './upward/fundamental';
import { calculateSentiment } from './upward/sentiment';
import { calculateRegimeAlignment } from './upward/regime';
import { calculateSeasonalWinRate } from './upward/seasonal';

const RISK_COMPONENTS = [
  'volatility', 'max_drawdown', 'beta', 'liquidity', 'fundamental_fragility',
] as const;

const UPWARD_COMPONENTS = [
  'trend_momentum', 'mean_reversion', 'fundamental_value',
  'sentiment', 'macro_regime', 'seasonal',
] as const;

type ScoringMode = 'percentile' | 'absolute';

/**
 * Create or upsert a scoring_run record.
 */
async function createScoringRun(
  supabase: ReturnType<typeof getServiceClient>,
  today: string,
  horizonMonths: number,
  mode: ScoringMode
) {
  const { data, error } = await supabase
    .from('scoring_runs')
    .upsert({
      run_date: today,
      time_horizon_months: horizonMonths,
      scoring_mode: mode,
      status: 'running',
      started_at: new Date().toISOString(),
    }, { onConflict: 'run_date,time_horizon_months,scoring_mode' })
    .select()
    .single();

  if (error || !data) throw new Error(`Failed to create scoring run (${mode}): ${error?.message}`);
  return data;
}

/**
 * Normalize raw scores using percentile ranking.
 */
function normalizePercentile(
  rawRisk: Map<string, Record<string, number>>,
  rawUpward: Map<string, Record<string, number>>
) {
  const normRisk = new Map<string, Record<string, number>>();
  const normUpward = new Map<string, Record<string, number>>();

  for (const sym of rawRisk.keys()) {
    normRisk.set(sym, {});
    normUpward.set(sym, {});
  }

  for (const component of RISK_COMPONENTS) {
    const column = new Map<string, number>();
    for (const [sym, scores] of rawRisk) {
      const val = scores[component];
      if (component === 'liquidity' && val === -1) continue;
      column.set(sym, val);
    }
    const ranked = percentileRank(column, component === 'liquidity');
    for (const [sym, rank] of ranked) {
      normRisk.get(sym)![component] = rank;
    }
    for (const sym of rawRisk.keys()) {
      if (normRisk.get(sym)![component] === undefined) {
        normRisk.get(sym)![component] = 50;
      }
    }
  }

  for (const component of UPWARD_COMPONENTS) {
    const column = new Map<string, number>();
    for (const [sym, scores] of rawUpward) {
      column.set(sym, scores[component]);
    }
    const ranked = percentileRank(column);
    for (const [sym, rank] of ranked) {
      normUpward.get(sym)![component] = rank;
    }
  }

  return { normRisk, normUpward };
}

/**
 * Normalize raw scores using absolute sigmoid mapping.
 */
function normalizeAbsolute(
  rawRisk: Map<string, Record<string, number>>,
  rawUpward: Map<string, Record<string, number>>
) {
  return {
    normRisk: absoluteNormalizeRisk(rawRisk),
    normUpward: absoluteNormalizeUpward(rawUpward),
  };
}

/**
 * Write scored results to ticker_scores table.
 */
async function writeScores(
  supabase: ReturnType<typeof getServiceClient>,
  runId: string,
  tickers: Ticker[],
  horizonMonths: number,
  mode: ScoringMode,
  today: string,
  normRisk: Map<string, Record<string, number>>,
  normUpward: Map<string, Record<string, number>>,
  riskWeights: ScoringWeight[],
  upwardWeights: ScoringWeight[],
  marketCaps: Map<string, { market_cap: number | null; current_price: number; company_name: string }>
) {
  const rows = tickers.map((ticker) => {
    const sym = ticker.symbol;
    const riskSub = normRisk.get(sym)!;
    const upwardSub = normUpward.get(sym)!;
    const riskScore = composeScore(riskSub, riskWeights);
    const upwardScore = composeScore(upwardSub, upwardWeights);
    const capData = marketCaps.get(sym);

    return {
      scoring_run_id: runId,
      ticker: sym,
      asset_class: ticker.asset_class,
      time_horizon_months: horizonMonths,
      scoring_mode: mode,
      risk_score: riskScore,
      upward_probability_score: upwardScore,
      volatility_score: riskSub.volatility,
      max_drawdown_score: riskSub.max_drawdown,
      beta_score: riskSub.beta,
      liquidity_risk_score: riskSub.liquidity,
      fundamental_fragility_score: riskSub.fundamental_fragility,
      trend_momentum_score: upwardSub.trend_momentum,
      mean_reversion_score: upwardSub.mean_reversion,
      fundamental_value_score: upwardSub.fundamental_value,
      sentiment_score: upwardSub.sentiment,
      macro_regime_score: upwardSub.macro_regime,
      seasonal_score: upwardSub.seasonal,
      market_cap: capData?.market_cap ?? null,
      current_price: capData?.current_price ?? 0,
      company_name: capData?.company_name ?? ticker.name,
      score_date: today,
    };
  });

  // Clear previous scores for this run
  await supabase.from('ticker_scores').delete().eq('scoring_run_id', runId);

  // Insert in chunks
  const CHUNK = 50;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await supabase.from('ticker_scores').insert(rows.slice(i, i + CHUNK));
    if (error) throw new Error(`Failed to insert ticker_scores (${mode}) chunk ${i}: ${error.message}`);
  }
}

/**
 * Run the full scoring pipeline for one time horizon.
 * Produces both percentile and absolute scores.
 */
export async function runScoring(horizonMonths: number): Promise<void> {
  const supabase = getServiceClient();
  const lookbackDays = getLookbackDays(horizonMonths);
  const today = new Date().toISOString().split('T')[0];
  const maPeriods = MA_PERIODS[horizonMonths] ?? MA_PERIODS[3];
  const currentMonth = new Date().getMonth() + 1;

  console.log(`\n=== Scoring run: ${today}, horizon=${horizonMonths}mo, lookback=${lookbackDays}d ===\n`);

  // Create both scoring_run records
  const runPercentile = await createScoringRun(supabase, today, horizonMonths, 'percentile');
  const runAbsolute = await createScoringRun(supabase, today, horizonMonths, 'absolute');

  try {
    // Load data (shared between both modes)
    const tickers = await loadAssets();
    console.log(`Loaded ${tickers.length} tickers`);

    const [prices, fullPrices, fundamentals, sentimentData, marketCaps, regime, macroEvents] =
      await Promise.all([
        loadPrices(tickers, lookbackDays),
        loadFullPriceHistory(tickers),
        loadFundamentals(tickers),
        loadSentiment(tickers, lookbackDays),
        loadMarketCaps(tickers),
        loadCurrentRegime(),
        loadMacroEvents(lookbackDays),
      ]);

    console.log(`Data loaded — prices: ${prices.size}, fundamentals: ${fundamentals.size}, sentiment: ${sentimentData.size}`);

    // Load scoring weights
    const { data: weightRows } = await supabase
      .from('scoring_weights')
      .select('time_horizon_months, score_type, component, weight')
      .eq('time_horizon_months', horizonMonths);

    const riskWeights: ScoringWeight[] = (weightRows ?? [])
      .filter((w) => w.score_type === 'risk')
      .map((w) => ({ time_horizon_months: w.time_horizon_months as number, score_type: w.score_type as 'risk', component: w.component as string, weight: Number(w.weight) }));

    const upwardWeights: ScoringWeight[] = (weightRows ?? [])
      .filter((w) => w.score_type === 'upward_probability')
      .map((w) => ({ time_horizon_months: w.time_horizon_months as number, score_type: w.score_type as 'upward_probability', component: w.component as string, weight: Number(w.weight) }));

    // Calculate raw sub-scores (shared — computed once)
    const rawRisk = new Map<string, Record<string, number>>();
    const rawUpward = new Map<string, Record<string, number>>();
    const benchmarkPrices = prices.get(MARKET_BENCHMARK) ?? [];

    for (const ticker of tickers) {
      const sym = ticker.symbol;
      const tickerPrices = prices.get(sym) ?? [];
      const tickerFundamentals = fundamentals.get(sym) ?? null;
      const tickerSentiment = sentimentData.get(sym) ?? [];
      const tickerFullPrices = fullPrices.get(sym) ?? [];

      const liquidityRaw = calculateLiquidity(tickerPrices);
      rawRisk.set(sym, {
        volatility: calculateVolatility(tickerPrices),
        max_drawdown: calculateMaxDrawdown(tickerPrices),
        beta: Math.abs(calculateBeta(tickerPrices, benchmarkPrices)),
        liquidity: liquidityRaw ?? -1,
        fundamental_fragility: calculateFragility(tickerFundamentals) ?? 50,
      });

      rawUpward.set(sym, {
        trend_momentum: calculateMomentum(tickerPrices, maPeriods.short, maPeriods.long),
        mean_reversion: calculateReversion(tickerPrices),
        fundamental_value: calculateFundamentalValue(tickerFundamentals) ?? 50,
        sentiment: calculateSentiment(tickerSentiment, horizonMonths),
        macro_regime: calculateRegimeAlignment(regime, ticker.asset_class, sym, macroEvents) ?? 50,
        seasonal: calculateSeasonalWinRate(tickerFullPrices, horizonMonths, currentMonth),
      });
    }

    console.log(`Raw scores computed for ${rawRisk.size} tickers`);

    // ── Percentile mode ──
    const pct = normalizePercentile(rawRisk, rawUpward);
    await writeScores(supabase, runPercentile.id, tickers, horizonMonths, 'percentile', today, pct.normRisk, pct.normUpward, riskWeights, upwardWeights, marketCaps);
    console.log(`Percentile scores written`);

    // ── Absolute mode ──
    const abs = normalizeAbsolute(rawRisk, rawUpward);
    await writeScores(supabase, runAbsolute.id, tickers, horizonMonths, 'absolute', today, abs.normRisk, abs.normUpward, riskWeights, upwardWeights, marketCaps);
    console.log(`Absolute scores written`);

    // Mark both runs complete
    for (const run of [runPercentile, runAbsolute]) {
      await supabase.from('scoring_runs').update({ status: 'completed', completed_at: new Date().toISOString() }).eq('id', run.id);
    }

    console.log(`Scoring run completed: ${tickers.length} tickers × 2 modes`);

  } catch (error) {
    for (const run of [runPercentile, runAbsolute]) {
      await supabase.from('scoring_runs').update({
        status: 'failed', completed_at: new Date().toISOString(),
        error_message: error instanceof Error ? error.message : String(error),
      }).eq('id', run.id);
    }
    console.error('Scoring run failed:', error);
    throw error;
  }
}
