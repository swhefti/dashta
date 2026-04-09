// src/scoring/upward/seasonal.ts
// Seasonal Win Rate: % of historical N-month periods with positive returns
// starting from the same calendar month.

import type { PriceBar } from '../../shared/types';
import { clamp } from '../../shared/utils';

/**
 * Calculate seasonal win rate.
 *
 * For each historical year, finds the first trading day of `currentMonth`,
 * then computes the return over the next `horizonMonths`. Counts what
 * fraction of those periods had a positive return.
 *
 * @param allPrices - Full price history (multi-year), sorted oldest → newest
 * @param horizonMonths - Forward-looking period length (3, 6, or 12)
 * @param currentMonth - Current calendar month (1–12) for seasonal matching
 * @returns Win rate 0–100. Returns 50 (neutral) if fewer than 3 comparable periods.
 */
export function calculateSeasonalWinRate(
  allPrices: PriceBar[],
  horizonMonths: number,
  currentMonth: number
): number {
  if (allPrices.length < 2) return 50;

  // Build an index of bars by year+month for fast lookup
  // Group bars into (year, month) buckets, picking the first bar of each month
  const firstBarByYM = new Map<string, { idx: number; close: number }>();
  for (let i = 0; i < allPrices.length; i++) {
    const d = new Date(allPrices[i].date);
    const key = `${d.getFullYear()}-${d.getMonth() + 1}`;
    if (!firstBarByYM.has(key)) {
      firstBarByYM.set(key, { idx: i, close: allPrices[i].close });
    }
  }

  let wins = 0;
  let total = 0;

  // Collect all unique years that have data for `currentMonth`
  const years = new Set<number>();
  for (const key of firstBarByYM.keys()) {
    const [yr, mo] = key.split('-').map(Number);
    if (mo === currentMonth) years.add(yr);
  }

  for (const year of years) {
    const entryKey = `${year}-${currentMonth}`;
    const entry = firstBarByYM.get(entryKey);
    if (!entry) continue;

    // Exit month = currentMonth + horizonMonths
    let exitMonth = currentMonth + horizonMonths;
    let exitYear = year;
    while (exitMonth > 12) {
      exitMonth -= 12;
      exitYear++;
    }

    const exitKey = `${exitYear}-${exitMonth}`;
    const exit = firstBarByYM.get(exitKey);
    if (!exit) continue; // not enough forward data

    const ret = (exit.close - entry.close) / entry.close;
    if (ret > 0) wins++;
    total++;
  }

  if (total < 3) return 50; // insufficient history for meaningful seasonality

  const winRate = (wins / total) * 100;

  // Slight shrinkage toward 50 when sample size is small (3–5 periods)
  // to avoid overconfidence on thin data
  const shrinkage = Math.min(total / 10, 1); // full confidence at 10+ periods
  const adjusted = 50 + (winRate - 50) * shrinkage;

  return clamp(adjusted, 1, 100);
}
