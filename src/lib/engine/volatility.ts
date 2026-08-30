import type { Candle } from "@/lib/technicals/types";

/**
 * Annualized volatility (standard deviation of daily log returns, scaled by
 * sqrt(252) trading days) — the standard measure advisors use to size
 * positions: a shakier holding should carry a smaller max weight than a
 * stable one carrying the same target. Returns null when there isn't
 * enough price history to compute a meaningful figure.
 */
export function computeAnnualizedVolatility(candles: Candle[]): number | null {
  const closes = candles.map((c) => c.close).filter((c) => c > 0);
  if (closes.length < 20) return null;

  const logReturns: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    logReturns.push(Math.log(closes[i] / closes[i - 1]));
  }

  const mean = logReturns.reduce((a, b) => a + b, 0) / logReturns.length;
  const variance = logReturns.reduce((a, b) => a + (b - mean) ** 2, 0) / (logReturns.length - 1);
  const dailyStdev = Math.sqrt(variance);
  return dailyStdev * Math.sqrt(252);
}
