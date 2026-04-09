// src/scoring/upward/momentum.ts
// Trend Momentum: MA crossovers, MACD, ADX combined signal.
// Composite = 0.40×maPosition + 0.35×macdSignal + 0.25×adxSignal

import type { PriceBar } from '../../shared/types';
import { clamp } from '../../shared/utils';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Simple moving average of the last `period` closes. Returns NaN if not enough data. */
function sma(closes: number[], endIdx: number, period: number): number {
  if (endIdx < period - 1) return NaN;
  let sum = 0;
  for (let i = endIdx - period + 1; i <= endIdx; i++) sum += closes[i];
  return sum / period;
}

/** Exponential moving average over a full series. Returns array of same length (NaN-padded). */
function ema(values: number[], period: number): number[] {
  const result = new Array<number>(values.length).fill(NaN);
  // Seed with SMA of first `period` values
  let sum = 0;
  for (let i = 0; i < period && i < values.length; i++) sum += values[i];
  if (values.length < period) return result;
  result[period - 1] = sum / period;
  const k = 2 / (period + 1);
  for (let i = period; i < values.length; i++) {
    result[i] = values[i] * k + result[i - 1] * (1 - k);
  }
  return result;
}

/**
 * MA Position score (0–100).
 * Price above both MAs = 100, above short only = 66, between = 33, below both = 0.
 */
function maPositionScore(closes: number[], shortPeriod: number, longPeriod: number): number {
  const last = closes.length - 1;
  const shortSMA = sma(closes, last, shortPeriod);
  const longSMA = sma(closes, last, longPeriod);
  const price = closes[last];

  if (isNaN(shortSMA) || isNaN(longSMA)) return 50; // insufficient data → neutral

  if (price > shortSMA && price > longSMA) return 100;
  if (price > shortSMA && price <= longSMA) return 66;
  if (price <= shortSMA && price > longSMA) return 33;
  return 0;
}

/**
 * MACD signal (0–100).
 * MACD = EMA(12) - EMA(26), signal = EMA(9) of MACD.
 * Histogram > 0 and rising → bullish. Normalized to 0–100.
 */
function macdSignal(closes: number[]): number {
  if (closes.length < 35) return 50; // need at least 26 + 9 bars

  const ema12 = ema(closes, 12);
  const ema26 = ema(closes, 26);

  // MACD line
  const macdLine: number[] = [];
  for (let i = 0; i < closes.length; i++) {
    macdLine.push(isNaN(ema12[i]) || isNaN(ema26[i]) ? NaN : ema12[i] - ema26[i]);
  }

  // Signal line = EMA(9) of MACD (skip NaN prefix)
  const validStart = macdLine.findIndex((v) => !isNaN(v));
  if (validStart === -1) return 50;
  const macdValid = macdLine.slice(validStart);
  const signalLine = ema(macdValid, 9);

  const last = macdValid.length - 1;
  if (last < 1 || isNaN(signalLine[last])) return 50;

  const histogram = macdValid[last] - signalLine[last];
  const prevHistogram = macdValid[last - 1] - signalLine[last - 1];

  // Normalize: histogram relative to price, then map to 0–100
  const price = closes[closes.length - 1];
  const histPct = (histogram / price) * 100; // typically -2% to +2%

  // Base score from histogram sign and magnitude
  let score = 50 + histPct * 25; // ±2% → ±50 points

  // Bonus for momentum direction (histogram rising vs falling)
  if (histogram > prevHistogram) score += 5;
  else score -= 5;

  return clamp(score, 0, 100);
}

/**
 * ADX signal (0–100).
 * ADX measures trend strength (not direction). High ADX + uptrend = strong bullish momentum.
 * Uses Wilder's smoothing with 14-period default.
 */
function adxSignal(prices: PriceBar[]): number {
  const period = 14;
  if (prices.length < period * 2 + 1) return 50;

  // True Range, +DM, -DM
  const tr: number[] = [];
  const plusDM: number[] = [];
  const minusDM: number[] = [];

  for (let i = 1; i < prices.length; i++) {
    const high = prices[i].high;
    const low = prices[i].low;
    const prevClose = prices[i - 1].close;
    const prevHigh = prices[i - 1].high;
    const prevLow = prices[i - 1].low;

    tr.push(Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose)));

    const upMove = high - prevHigh;
    const downMove = prevLow - low;
    plusDM.push(upMove > downMove && upMove > 0 ? upMove : 0);
    minusDM.push(downMove > upMove && downMove > 0 ? downMove : 0);
  }

  // Wilder's smoothing: first value = sum of first `period`, then smooth
  if (tr.length < period) return 50;

  let smoothTR = 0;
  let smoothPlusDM = 0;
  let smoothMinusDM = 0;

  for (let i = 0; i < period; i++) {
    smoothTR += tr[i];
    smoothPlusDM += plusDM[i];
    smoothMinusDM += minusDM[i];
  }

  const dx: number[] = [];

  for (let i = period; i < tr.length; i++) {
    if (i > period) {
      smoothTR = smoothTR - smoothTR / period + tr[i];
      smoothPlusDM = smoothPlusDM - smoothPlusDM / period + plusDM[i];
      smoothMinusDM = smoothMinusDM - smoothMinusDM / period + minusDM[i];
    }

    const plusDI = smoothTR > 0 ? (smoothPlusDM / smoothTR) * 100 : 0;
    const minusDI = smoothTR > 0 ? (smoothMinusDM / smoothTR) * 100 : 0;
    const diSum = plusDI + minusDI;
    const dxVal = diSum > 0 ? (Math.abs(plusDI - minusDI) / diSum) * 100 : 0;
    dx.push(dxVal);
  }

  if (dx.length < period) return 50;

  // ADX = smoothed DX
  let adx = 0;
  for (let i = 0; i < period; i++) adx += dx[i];
  adx /= period;
  for (let i = period; i < dx.length; i++) {
    adx = (adx * (period - 1) + dx[i]) / period;
  }

  // Determine trend direction from latest +DI vs -DI
  const lastPlusDI = smoothTR > 0 ? (smoothPlusDM / smoothTR) * 100 : 0;
  const lastMinusDI = smoothTR > 0 ? (smoothMinusDM / smoothTR) * 100 : 0;
  const isBullish = lastPlusDI > lastMinusDI;

  // ADX 0-100 maps to trend strength; combine with direction
  // Strong uptrend (ADX>40, +DI>-DI) → high score
  // Strong downtrend (ADX>40, -DI>+DI) → low score
  // Weak trend (ADX<20) → neutral ~50
  if (isBullish) {
    // Scale: ADX 0→50, ADX 50+→100
    return clamp(50 + adx, 0, 100);
  } else {
    // Scale: ADX 0→50, ADX 50+→0
    return clamp(50 - adx, 0, 100);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Calculate trend momentum composite score.
 *
 * @param prices - Daily bars sorted oldest → newest
 * @param shortMA - Short MA period (e.g. 20 for 3mo horizon)
 * @param longMA - Long MA period (e.g. 50 for 3mo horizon)
 * @returns Raw momentum score 0–100 (higher = stronger uptrend)
 */
export function calculateMomentum(
  prices: PriceBar[],
  shortMA: number,
  longMA: number
): number {
  if (prices.length < 2) return 50;

  const closes = prices.map((b) => b.close);

  const ma = maPositionScore(closes, shortMA, longMA);
  const macd = macdSignal(closes);
  const adx = adxSignal(prices);

  return clamp(0.40 * ma + 0.35 * macd + 0.25 * adx, 0, 100);
}
