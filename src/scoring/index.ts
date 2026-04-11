// src/scoring/index.ts
// Main scoring orchestrator: runs the full pipeline for a given time horizon.
// Produces both percentile (relative) and absolute scoring modes.
// Includes freshness gating and per-ticker confidence scoring.

import { getServiceClient } from '../shared/supabase';
import { getLookbackDays, MA_PERIODS, MARKET_BENCHMARK, CRYPTO_BENCHMARK } from '../shared/constants';
import type { Ticker, ScoringWeight } from '../shared/types';
import { percentileRank } from './normalizer';
import { absoluteNormalizeRisk, absoluteNormalizeUpward } from './normalizer-absolute';
import { composeScore, FACTOR_UNAVAILABLE } from './composer';
import { checkFreshness, type RunQuality } from './freshness';
import { computeConfidence } from './confidence';
import { generateExplanation, computeDriverSignature, shouldRefreshExplanation } from './explanations';

import { loadAssets } from '../data/asset-loader';
import { loadPrices, loadFullPriceHistory } from '../data/price-loader';
import { loadFundamentals } from '../data/fundamentals-loader';
import { loadSentiment } from '../data/sentiment-loader';
import { loadMarketCaps, type MarketCapRecord } from '../data/market-cap-loader';
import { loadCurrentRegime, loadMacroEvents } from '../data/regime-loader';

import { calculateVolatility } from './risk/volatility';
import { calculateMaxDrawdown } from './risk/drawdown';
import { calculateBeta } from './risk/beta';
import { calculateLiquidity } from './risk/liquidity';
import { calculateFragility } from './risk/fragility';

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

const RAW_MISSING = -999;

type ScoringMode = 'percentile' | 'absolute';

async function createScoringRun(
  supabase: ReturnType<typeof getServiceClient>,
  today: string,
  horizonMonths: number,
  mode: ScoringMode,
  freshness: any,
  quality: RunQuality
) {
  const { data, error } = await supabase
    .from('scoring_runs')
    .upsert({
      run_date: today,
      time_horizon_months: horizonMonths,
      scoring_mode: mode,
      status: 'running',
      started_at: new Date().toISOString(),
      source_freshness: freshness,
      run_quality: quality,
    }, { onConflict: 'run_date,time_horizon_months,scoring_mode' })
    .select()
    .single();
  if (error || !data) throw new Error(`Failed to create scoring run (${mode}): ${error?.message}`);
  return data;
}

function normalizePercentile(
  rawRisk: Map<string, Record<string, number>>,
  rawUpward: Map<string, Record<string, number>>
) {
  const normRisk = new Map<string, Record<string, number>>();
  const normUpward = new Map<string, Record<string, number>>();
  for (const sym of rawRisk.keys()) { normRisk.set(sym, {}); normUpward.set(sym, {}); }

  for (const component of RISK_COMPONENTS) {
    const column = new Map<string, number>();
    for (const [sym, scores] of rawRisk) { if (scores[component] !== RAW_MISSING) column.set(sym, scores[component]); }
    const ranked = percentileRank(column, component === 'liquidity');
    for (const [sym, rank] of ranked) normRisk.get(sym)![component] = rank;
    for (const sym of rawRisk.keys()) { if (normRisk.get(sym)![component] === undefined) normRisk.get(sym)![component] = FACTOR_UNAVAILABLE; }
  }

  for (const component of UPWARD_COMPONENTS) {
    const column = new Map<string, number>();
    for (const [sym, scores] of rawUpward) { if (scores[component] !== RAW_MISSING) column.set(sym, scores[component]); }
    const ranked = percentileRank(column);
    for (const [sym, rank] of ranked) normUpward.get(sym)![component] = rank;
    for (const sym of rawUpward.keys()) { if (normUpward.get(sym)![component] === undefined) normUpward.get(sym)![component] = FACTOR_UNAVAILABLE; }
  }

  return { normRisk, normUpward };
}

function normalizeAbsolute(
  rawRisk: Map<string, Record<string, number>>,
  rawUpward: Map<string, Record<string, number>>
) {
  const normRisk = absoluteNormalizeRisk(rawRisk);
  const normUpward = absoluteNormalizeUpward(rawUpward);
  for (const [sym, raw] of rawRisk) { for (const key of Object.keys(raw)) { if (raw[key] === RAW_MISSING) normRisk.get(sym)![key] = FACTOR_UNAVAILABLE; } }
  for (const [sym, raw] of rawUpward) { for (const key of Object.keys(raw)) { if (raw[key] === RAW_MISSING) normUpward.get(sym)![key] = FACTOR_UNAVAILABLE; } }
  return { normRisk, normUpward };
}

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
  marketCaps: Map<string, MarketCapRecord>,
  runQuality: RunQuality
) {
  const rows = tickers.map((ticker) => {
    const sym = ticker.symbol;
    const riskSub = normRisk.get(sym)!;
    const upwardSub = normUpward.get(sym)!;
    const riskScore = composeScore(riskSub, riskWeights);
    const upwardScore = composeScore(upwardSub, upwardWeights);
    const capData = marketCaps.get(sym);
    const conf = computeConfidence(riskSub, upwardSub, ticker.asset_class, runQuality);
    const dbVal = (v: number) => v === FACTOR_UNAVAILABLE ? null : v;

    return {
      scoring_run_id: runId,
      ticker: sym,
      asset_class: ticker.asset_class,
      time_horizon_months: horizonMonths,
      scoring_mode: mode,
      risk_score: riskScore,
      upward_probability_score: upwardScore,
      volatility_score: dbVal(riskSub.volatility),
      max_drawdown_score: dbVal(riskSub.max_drawdown),
      beta_score: dbVal(riskSub.beta),
      liquidity_risk_score: dbVal(riskSub.liquidity),
      fundamental_fragility_score: dbVal(riskSub.fundamental_fragility),
      trend_momentum_score: dbVal(upwardSub.trend_momentum),
      mean_reversion_score: dbVal(upwardSub.mean_reversion),
      fundamental_value_score: dbVal(upwardSub.fundamental_value),
      sentiment_score: dbVal(upwardSub.sentiment),
      macro_regime_score: dbVal(upwardSub.macro_regime),
      seasonal_score: dbVal(upwardSub.seasonal),
      market_cap: capData?.market_cap ?? null,
      current_price: capData?.current_price ?? null,
      company_name: capData?.company_name ?? ticker.name,
      score_date: today,
      confidence: conf.score,
      confidence_label: conf.label,
    };
  });

  await supabase.from('ticker_scores').delete().eq('scoring_run_id', runId);
  const CHUNK = 50;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await supabase.from('ticker_scores').insert(rows.slice(i, i + CHUNK));
    if (error) throw new Error(`Failed to insert ticker_scores (${mode}) chunk ${i}: ${error.message}`);
  }
}

/**
 * Generate/update ticker explanations. Only refreshes when a strong change is detected.
 */
async function updateExplanations(
  supabase: ReturnType<typeof getServiceClient>,
  runId: string,
  tickers: Ticker[],
  horizonMonths: number,
  mode: ScoringMode,
  normRisk: Map<string, Record<string, number>>,
  normUpward: Map<string, Record<string, number>>,
  riskWeights: ScoringWeight[],
  upwardWeights: ScoringWeight[],
  marketCaps: Map<string, MarketCapRecord>,
  runQuality: RunQuality
) {
  // Load existing explanations for comparison
  const { data: existing } = await supabase
    .from('ticker_explanations')
    .select('ticker, driver_signature, risk_score_snapshot, upward_score_snapshot')
    .eq('time_horizon_months', horizonMonths)
    .eq('scoring_mode', mode);

  const existingMap = new Map<string, { sig: string | null; risk: number | null; upward: number | null }>();
  if (existing) {
    for (const row of existing) {
      existingMap.set(row.ticker, {
        sig: row.driver_signature,
        risk: row.risk_score_snapshot != null ? Number(row.risk_score_snapshot) : null,
        upward: row.upward_score_snapshot != null ? Number(row.upward_score_snapshot) : null,
      });
    }
  }

  let refreshed = 0;
  let skipped = 0;

  for (const ticker of tickers) {
    const sym = ticker.symbol;
    const riskSub = normRisk.get(sym)!;
    const upwardSub = normUpward.get(sym)!;
    const riskScore = composeScore(riskSub, riskWeights);
    const upwardScore = composeScore(upwardSub, upwardWeights);
    const conf = computeConfidence(riskSub, upwardSub, ticker.asset_class, runQuality);
    const capData = marketCaps.get(sym);

    const newSig = computeDriverSignature({
      riskScore, upwardScore, confidence: conf.score,
      confidenceLabel: conf.label, runQuality,
      riskSubs: riskSub, upwardSubs: upwardSub,
    });

    const old = existingMap.get(sym);
    if (!shouldRefreshExplanation(old?.sig ?? null, newSig, old?.risk ?? null, riskScore, old?.upward ?? null, upwardScore)) {
      // Just update the run reference, don't regenerate text
      await supabase.from('ticker_explanations')
        .update({ latest_scoring_run_id: runId, updated_at: new Date().toISOString() })
        .eq('ticker', sym).eq('time_horizon_months', horizonMonths).eq('scoring_mode', mode);
      skipped++;
      continue;
    }

    const explanation = generateExplanation({
      ticker: sym,
      companyName: capData?.company_name ?? ticker.name,
      assetClass: ticker.asset_class,
      riskScore, upwardScore,
      riskSubs: riskSub, upwardSubs: upwardSub,
      confidence: conf.score, confidenceLabel: conf.label,
      runQuality,
    });

    const version = old ? ((old as any).version ?? 1) + 1 : 1;

    await supabase.from('ticker_explanations').upsert({
      ticker: sym,
      time_horizon_months: horizonMonths,
      scoring_mode: mode,
      latest_scoring_run_id: runId,
      explanation_text: explanation,
      explanation_version: version,
      risk_score_snapshot: riskScore,
      upward_score_snapshot: upwardScore,
      confidence_snapshot: conf.score,
      run_quality_snapshot: runQuality,
      driver_signature: newSig,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'ticker,time_horizon_months,scoring_mode' });

    refreshed++;
  }

  console.log(`Explanations: ${refreshed} refreshed, ${skipped} unchanged`);
}

export async function runScoring(horizonMonths: number): Promise<void> {
  const supabase = getServiceClient();
  const lookbackDays = getLookbackDays(horizonMonths);
  const today = new Date().toISOString().split('T')[0];
  const maPeriods = MA_PERIODS[horizonMonths] ?? MA_PERIODS[3];
  const currentMonth = new Date().getMonth() + 1;

  console.log(`\n=== Scoring run: ${today}, horizon=${horizonMonths}mo, lookback=${lookbackDays}d ===\n`);

  // Freshness check
  const freshnessResult = await checkFreshness(today);
  console.log(`Source freshness: ${JSON.stringify(freshnessResult.sources)}`);
  console.log(`Run quality: ${freshnessResult.quality}`);
  if (freshnessResult.issues.length > 0) console.log(`Issues: ${freshnessResult.issues.join('; ')}`);

  if (freshnessResult.quality === 'blocked') {
    console.error(`\nRUN BLOCKED: ${freshnessResult.issues.join('; ')}`);
    console.error('Fix source data staleness before running the scoring pipeline.');
    // Still create run records so the API can explain what happened
    for (const mode of ['percentile', 'absolute'] as ScoringMode[]) {
      await supabase.from('scoring_runs').upsert({
        run_date: today,
        time_horizon_months: horizonMonths,
        scoring_mode: mode,
        status: 'failed',
        started_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
        source_freshness: freshnessResult.sources,
        run_quality: 'blocked',
        error_message: `Blocked: ${freshnessResult.issues.join('; ')}`,
      }, { onConflict: 'run_date,time_horizon_months,scoring_mode' });
    }
    return;
  }

  const runPercentile = await createScoringRun(supabase, today, horizonMonths, 'percentile', freshnessResult.sources, freshnessResult.quality);
  const runAbsolute = await createScoringRun(supabase, today, horizonMonths, 'absolute', freshnessResult.sources, freshnessResult.quality);

  try {
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

    const rawRisk = new Map<string, Record<string, number>>();
    const rawUpward = new Map<string, Record<string, number>>();
    const benchmarkPrices = prices.get(MARKET_BENCHMARK) ?? [];
    const cryptoBenchPrices = prices.get(CRYPTO_BENCHMARK) ?? [];

    for (const ticker of tickers) {
      const sym = ticker.symbol;
      const tp = prices.get(sym) ?? [];
      const tf = fundamentals.get(sym) ?? null;
      const ts = sentimentData.get(sym) ?? [];
      const tfp = fullPrices.get(sym) ?? [];
      const isCrypto = ticker.asset_class === 'crypto';
      const betaBench = isCrypto ? cryptoBenchPrices : benchmarkPrices;

      rawRisk.set(sym, {
        volatility: tp.length < 2 ? RAW_MISSING : calculateVolatility(tp),
        max_drawdown: tp.length < 2 ? RAW_MISSING : calculateMaxDrawdown(tp),
        beta: Math.abs(calculateBeta(tp, betaBench)),
        liquidity: calculateLiquidity(tp) ?? RAW_MISSING,
        fundamental_fragility: calculateFragility(tf) ?? RAW_MISSING,
      });

      rawUpward.set(sym, {
        trend_momentum: tp.length < 2 ? RAW_MISSING : calculateMomentum(tp, maPeriods.short, maPeriods.long),
        mean_reversion: tp.length < 2 ? RAW_MISSING : calculateReversion(tp),
        fundamental_value: calculateFundamentalValue(tf) ?? RAW_MISSING,
        sentiment: ts.length > 0 ? calculateSentiment(ts, horizonMonths) : RAW_MISSING,
        macro_regime: calculateRegimeAlignment(regime, ticker.asset_class, sym, macroEvents) ?? RAW_MISSING,
        seasonal: tfp.length < 2 ? RAW_MISSING : calculateSeasonalWinRate(tfp, horizonMonths, currentMonth),
      });
    }

    console.log(`Raw scores computed for ${rawRisk.size} tickers`);

    const pct = normalizePercentile(rawRisk, rawUpward);
    await writeScores(supabase, runPercentile.id, tickers, horizonMonths, 'percentile', today, pct.normRisk, pct.normUpward, riskWeights, upwardWeights, marketCaps, freshnessResult.quality);
    console.log(`Percentile scores written`);

    const abs = normalizeAbsolute(rawRisk, rawUpward);
    await writeScores(supabase, runAbsolute.id, tickers, horizonMonths, 'absolute', today, abs.normRisk, abs.normUpward, riskWeights, upwardWeights, marketCaps, freshnessResult.quality);
    console.log(`Absolute scores written`);

    // Generate/update explanations (only for percentile mode — primary view)
    await updateExplanations(supabase, runPercentile.id, tickers, horizonMonths, 'percentile',
      pct.normRisk, pct.normUpward, riskWeights, upwardWeights, marketCaps, freshnessResult.quality);

    for (const run of [runPercentile, runAbsolute]) {
      await supabase.from('scoring_runs').update({ status: 'completed', completed_at: new Date().toISOString() }).eq('id', run.id);
    }
    console.log(`Scoring run completed: ${tickers.length} tickers × 2 modes (quality: ${freshnessResult.quality})`);

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
