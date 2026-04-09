// src/shared/utils.ts

/**
 * Calculate natural log return between two prices.
 */
export function logReturn(priceNow: number, pricePrev: number): number {
  return Math.log(priceNow / pricePrev);
}

/**
 * Standard deviation of an array of numbers.
 */
export function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const sqDiffs = values.map((v) => (v - mean) ** 2);
  return Math.sqrt(sqDiffs.reduce((a, b) => a + b, 0) / (values.length - 1));
}

/**
 * Clamp a value between min and max.
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Annualize daily volatility.
 */
export function annualizeVol(dailyVol: number): number {
  return dailyVol * Math.sqrt(252);
}

/**
 * Parse command-line --horizon=N argument.
 */
export function parseHorizonArg(args: string[]): number[] {
  const horizonArg = args.find((a) => a.startsWith('--horizon='));
  if (horizonArg) {
    const val = horizonArg.split('=')[1];
    return [parseInt(val, 10)];
  }
  return [3, 6, 12]; // default: all horizons
}
