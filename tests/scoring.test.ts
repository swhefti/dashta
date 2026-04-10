// tests/scoring.test.ts
// Regression checks for core scoring logic.
// Run: npx tsx tests/scoring.test.ts

import { percentileRank } from '../src/scoring/normalizer';
import { composeScore, FACTOR_UNAVAILABLE } from '../src/scoring/composer';
import { calculateBeta } from '../src/scoring/risk/beta';
import type { PriceBar } from '../src/shared/types';
import type { ScoringWeight } from '../src/shared/types';

let passed = 0;
let failed = 0;

function assert(condition: boolean, name: string) {
  if (condition) {
    passed++;
  } else {
    failed++;
    console.error(`  FAIL: ${name}`);
  }
}

function assertClose(actual: number, expected: number, tolerance: number, name: string) {
  const ok = Math.abs(actual - expected) <= tolerance;
  if (ok) {
    passed++;
  } else {
    failed++;
    console.error(`  FAIL: ${name} — expected ${expected}±${tolerance}, got ${actual}`);
  }
}

// ── Test: Tie-aware percentile ranking ──
console.log('\n--- Tie-aware percentile ranking ---');
{
  // All same value → all get same percentile
  const same = new Map([['A', 10], ['B', 10], ['C', 10]]);
  const result = percentileRank(same);
  const values = Array.from(result.values());
  assert(values[0] === values[1] && values[1] === values[2], 'Equal values get equal percentile');

  // Distinct values → strict ordering
  const distinct = new Map([['A', 1], ['B', 2], ['C', 3], ['D', 4]]);
  const dResult = percentileRank(distinct);
  assert(dResult.get('A')! < dResult.get('B')!, 'A < B when rawA < rawB');
  assert(dResult.get('B')! < dResult.get('C')!, 'B < C when rawB < rawC');
  assert(dResult.get('C')! < dResult.get('D')!, 'C < D when rawC < rawD');

  // Partial ties
  const partial = new Map([['A', 1], ['B', 5], ['C', 5], ['D', 10]]);
  const pResult = percentileRank(partial);
  assert(pResult.get('B')! === pResult.get('C')!, 'Tied B and C get same percentile');
  assert(pResult.get('A')! < pResult.get('B')!, 'A < tied B,C');
  assert(pResult.get('C')! < pResult.get('D')!, 'Tied B,C < D');

  // Inverted
  const inv = percentileRank(distinct, true);
  assert(inv.get('A')! > inv.get('D')!, 'Invert: lowest raw gets highest percentile');

  // Single item
  const single = new Map([['X', 42]]);
  const sResult = percentileRank(single);
  assert(sResult.get('X')! >= 1 && sResult.get('X')! <= 100, 'Single item in range 1-100');

  // Empty
  const empty = percentileRank(new Map());
  assert(empty.size === 0, 'Empty input returns empty');
}

// ── Test: Missing-factor redistribution in composer ──
console.log('\n--- Missing-factor weight redistribution ---');
{
  const weights: ScoringWeight[] = [
    { time_horizon_months: 3, score_type: 'risk', component: 'a', weight: 0.4 },
    { time_horizon_months: 3, score_type: 'risk', component: 'b', weight: 0.3 },
    { time_horizon_months: 3, score_type: 'risk', component: 'c', weight: 0.3 },
  ];

  // All present
  const allPresent = composeScore({ a: 80, b: 60, c: 40 }, weights);
  assertClose(allPresent, 62, 0.1, 'All factors: weighted average = 62');

  // One missing → redistributed
  const oneMissing = composeScore({ a: 80, b: FACTOR_UNAVAILABLE, c: 40 }, weights);
  // Should be (80*0.4 + 40*0.3) / (0.4 + 0.3) = (32 + 12) / 0.7 = 62.86
  assertClose(oneMissing, 62.86, 0.1, 'Missing b: weight redistributed');

  // All missing → fallback 50
  const allMissing = composeScore({ a: FACTOR_UNAVAILABLE, b: FACTOR_UNAVAILABLE, c: FACTOR_UNAVAILABLE }, weights);
  assert(allMissing === 50, 'All factors missing: returns 50');

  // FACTOR_UNAVAILABLE value check
  assert(FACTOR_UNAVAILABLE === -999, 'FACTOR_UNAVAILABLE sentinel is -999');
}

// ── Test: Beta calculation ──
console.log('\n--- Beta calculation ---');
{
  // Identical series → beta = 1.0
  const bars: PriceBar[] = [];
  for (let i = 0; i < 30; i++) {
    bars.push({ date: `2026-01-${String(i + 1).padStart(2, '0')}`, open: 100 + i, high: 101 + i, low: 99 + i, close: 100 + i, volume: 1000 });
  }
  const betaSelf = calculateBeta(bars, bars);
  assertClose(betaSelf, 1.0, 0.01, 'Beta of series vs itself = 1.0');

  // Insufficient data → default 1.0
  const short: PriceBar[] = bars.slice(0, 3);
  const betaShort = calculateBeta(short, bars);
  assert(betaShort === 1.0, 'Insufficient overlap returns 1.0');

  // Anti-correlated series: when benchmark goes up, asset goes down and vice versa
  const antiCorr: PriceBar[] = [];
  for (let i = 0; i < 30; i++) {
    // Zig-zag: even days up for benchmark, down for anti
    const benchClose = 100 + i;
    const antiClose = i === 0 ? 100 : antiCorr[i - 1].close * (bars[i].close < bars[i - 1].close ? 1.02 : 0.98);
    antiCorr.push({ ...bars[i], close: antiClose });
  }
  // With perfectly monotonic benchmark, anti-corr is also monotonic (always *0.98)
  // Instead test that a 2x leveraged series has beta ~2
  const leveraged: PriceBar[] = bars.map((b, i) => ({
    ...b, close: i === 0 ? 100 : 100 * Math.pow(bars[i].close / 100, 2),
  }));
  const betaLev = calculateBeta(leveraged, bars);
  assert(betaLev > 1.5, `Leveraged series has beta > 1.5 (got ${betaLev.toFixed(2)})`);
}

// ── Test: Horizon and unavailable-factor behavior ──
console.log('\n--- Horizon and unavailable-factor handling ---');
{
  // RAW_MISSING sentinel (-999) should propagate through composer as FACTOR_UNAVAILABLE
  const weights: ScoringWeight[] = [
    { time_horizon_months: 3, score_type: 'upward_probability', component: 'sentiment', weight: 0.2 },
    { time_horizon_months: 3, score_type: 'upward_probability', component: 'momentum', weight: 0.3 },
    { time_horizon_months: 3, score_type: 'upward_probability', component: 'fundamental', weight: 0.5 },
  ];

  // Crypto scenario: fundamental unavailable, sentiment unavailable
  const cryptoScores = { sentiment: FACTOR_UNAVAILABLE, momentum: 75, fundamental: FACTOR_UNAVAILABLE };
  const result = composeScore(cryptoScores, weights);
  assertClose(result, 75, 0.1, 'Crypto with only momentum: score = momentum value');

  // Stock scenario: all available
  const stockScores = { sentiment: 60, momentum: 75, fundamental: 40 };
  const stockResult = composeScore(stockScores, weights);
  // (60*0.2 + 75*0.3 + 40*0.5) / 1.0 = 12 + 22.5 + 20 = 54.5
  assertClose(stockResult, 54.5, 0.1, 'Stock with all factors: correct weighted average');
}

// ── Summary ──
console.log(`\n${'='.repeat(40)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log('='.repeat(40));
process.exit(failed > 0 ? 1 : 0);
