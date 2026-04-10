// tests/scoring.test.ts
// Regression checks for core scoring logic.
// Run: npx tsx tests/scoring.test.ts

import { percentileRank } from '../src/scoring/normalizer';
import { composeScore, FACTOR_UNAVAILABLE } from '../src/scoring/composer';
import { calculateBeta } from '../src/scoring/risk/beta';
import { computeConfidence } from '../src/scoring/confidence';
import type { PriceBar, ScoringWeight } from '../src/shared/types';

let passed = 0;
let failed = 0;

function assert(condition: boolean, name: string) {
  if (condition) { passed++; }
  else { failed++; console.error(`  FAIL: ${name}`); }
}

function assertClose(actual: number, expected: number, tolerance: number, name: string) {
  if (Math.abs(actual - expected) <= tolerance) { passed++; }
  else { failed++; console.error(`  FAIL: ${name} — expected ${expected}±${tolerance}, got ${actual}`); }
}

// ── Tie-aware percentile ranking ──
console.log('\n--- Tie-aware percentile ranking ---');
{
  const same = new Map([['A', 10], ['B', 10], ['C', 10]]);
  const result = percentileRank(same);
  const values = Array.from(result.values());
  assert(values[0] === values[1] && values[1] === values[2], 'Equal values get equal percentile');

  const distinct = new Map([['A', 1], ['B', 2], ['C', 3], ['D', 4]]);
  const dResult = percentileRank(distinct);
  assert(dResult.get('A')! < dResult.get('B')!, 'A < B');
  assert(dResult.get('B')! < dResult.get('C')!, 'B < C');
  assert(dResult.get('C')! < dResult.get('D')!, 'C < D');

  const partial = new Map([['A', 1], ['B', 5], ['C', 5], ['D', 10]]);
  const pResult = percentileRank(partial);
  assert(pResult.get('B')! === pResult.get('C')!, 'Tied B,C same');
  assert(pResult.get('A')! < pResult.get('B')!, 'A < tied B,C');
  assert(pResult.get('C')! < pResult.get('D')!, 'Tied B,C < D');

  const inv = percentileRank(distinct, true);
  assert(inv.get('A')! > inv.get('D')!, 'Invert works');

  assert(percentileRank(new Map([['X', 42]])).get('X')! >= 1, 'Single item in range');
  assert(percentileRank(new Map()).size === 0, 'Empty returns empty');
}

// ── Missing-factor redistribution ──
console.log('\n--- Missing-factor weight redistribution ---');
{
  const w: ScoringWeight[] = [
    { time_horizon_months: 3, score_type: 'risk', component: 'a', weight: 0.4 },
    { time_horizon_months: 3, score_type: 'risk', component: 'b', weight: 0.3 },
    { time_horizon_months: 3, score_type: 'risk', component: 'c', weight: 0.3 },
  ];
  assertClose(composeScore({ a: 80, b: 60, c: 40 }, w), 62, 0.1, 'All present');
  assertClose(composeScore({ a: 80, b: FACTOR_UNAVAILABLE, c: 40 }, w), 62.86, 0.1, 'One missing');
  assert(composeScore({ a: FACTOR_UNAVAILABLE, b: FACTOR_UNAVAILABLE, c: FACTOR_UNAVAILABLE }, w) === 50, 'All missing → 50');
}

// ── Beta ──
console.log('\n--- Beta calculation ---');
{
  const bars: PriceBar[] = [];
  for (let i = 0; i < 30; i++) bars.push({ date: `2026-01-${String(i+1).padStart(2,'0')}`, open: 100+i, high: 101+i, low: 99+i, close: 100+i, volume: 1000 });
  assertClose(calculateBeta(bars, bars), 1.0, 0.01, 'Self-beta = 1.0');
  assert(calculateBeta(bars.slice(0, 3), bars) === 1.0, 'Insufficient → 1.0');
  const lev = bars.map((b, i) => ({ ...b, close: i === 0 ? 100 : 100 * Math.pow(bars[i].close / 100, 2) }));
  assert(calculateBeta(lev, bars) > 1.5, 'Leveraged > 1.5');
}

// ── Confidence scoring ──
console.log('\n--- Confidence scoring ---');
{
  // Stock with all factors → high confidence
  const stockRisk = { volatility: 50, max_drawdown: 50, beta: 50, liquidity: 50, fundamental_fragility: 50 };
  const stockUpward = { trend_momentum: 50, mean_reversion: 50, fundamental_value: 50, sentiment: 50, macro_regime: 50, seasonal: 50 };
  const stockConf = computeConfidence(stockRisk, stockUpward, 'stock', 'healthy');
  assert(stockConf.score === 100, `Stock full factors → 100 (got ${stockConf.score})`);
  assert(stockConf.label === 'high', 'Stock full → high label');
  assert(stockConf.reasons.length === 0, 'Stock full → no reasons');

  // Crypto missing fundamentals (expected) → still high
  const cryptoRisk = { volatility: 50, max_drawdown: 50, beta: 50, liquidity: FACTOR_UNAVAILABLE, fundamental_fragility: FACTOR_UNAVAILABLE };
  const cryptoUpward = { trend_momentum: 50, mean_reversion: 50, fundamental_value: FACTOR_UNAVAILABLE, sentiment: 50, macro_regime: 50, seasonal: 50 };
  const cryptoConf = computeConfidence(cryptoRisk, cryptoUpward, 'crypto', 'healthy');
  assert(cryptoConf.score === 100, `Crypto expected missing → 100 (got ${cryptoConf.score})`);
  assert(cryptoConf.label === 'high', 'Crypto → high');

  // Stock missing sentiment + fundamentals → penalized
  const partialRisk = { volatility: 50, max_drawdown: 50, beta: 50, liquidity: 50, fundamental_fragility: FACTOR_UNAVAILABLE };
  const partialUpward = { trend_momentum: 50, mean_reversion: 50, fundamental_value: FACTOR_UNAVAILABLE, sentiment: FACTOR_UNAVAILABLE, macro_regime: 50, seasonal: 50 };
  const partialConf = computeConfidence(partialRisk, partialUpward, 'stock', 'healthy');
  assert(partialConf.score < 80, `Stock missing 3 factors < 80 (got ${partialConf.score})`);
  assert(partialConf.reasons.length === 3, `3 reasons (got ${partialConf.reasons.length})`);

  // Degraded run → extra penalty
  const degradedConf = computeConfidence(stockRisk, stockUpward, 'stock', 'degraded');
  assert(degradedConf.score === 90, `Degraded full stock → 90 (got ${degradedConf.score})`);
  assert(degradedConf.reasons.includes('degraded run (stale sources)'), 'Degraded reason present');

  // Blocked run → 0
  const blockedConf = computeConfidence(stockRisk, stockUpward, 'stock', 'blocked');
  assert(blockedConf.score === 0, 'Blocked → 0');

  // ETF missing fundamentals (expected) → no penalty for that
  const etfRisk = { volatility: 50, max_drawdown: 50, beta: 50, liquidity: 50, fundamental_fragility: FACTOR_UNAVAILABLE };
  const etfUpward = { trend_momentum: 50, mean_reversion: 50, fundamental_value: FACTOR_UNAVAILABLE, sentiment: 50, macro_regime: 50, seasonal: 50 };
  const etfConf = computeConfidence(etfRisk, etfUpward, 'etf', 'healthy');
  assert(etfConf.score === 100, `ETF expected missing → 100 (got ${etfConf.score})`);
}

// ── Horizon behavior ──
console.log('\n--- Horizon behavior ---');
{
  const w: ScoringWeight[] = [
    { time_horizon_months: 3, score_type: 'upward_probability', component: 'sentiment', weight: 0.2 },
    { time_horizon_months: 3, score_type: 'upward_probability', component: 'momentum', weight: 0.3 },
    { time_horizon_months: 3, score_type: 'upward_probability', component: 'fundamental', weight: 0.5 },
  ];
  const cryptoScores = { sentiment: FACTOR_UNAVAILABLE, momentum: 75, fundamental: FACTOR_UNAVAILABLE };
  assertClose(composeScore(cryptoScores, w), 75, 0.1, 'Crypto only momentum → 75');
  const stockScores = { sentiment: 60, momentum: 75, fundamental: 40 };
  assertClose(composeScore(stockScores, w), 54.5, 0.1, 'Stock all factors → 54.5');
}

// ── Summary ──
console.log(`\n${'='.repeat(40)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log('='.repeat(40));
process.exit(failed > 0 ? 1 : 0);
