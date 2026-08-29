// Basic numeric building blocks (SMA/EMA/RSI/etc). These are standard,
// widely-published technical-analysis formulas — not scraped or licensed
// from any vendor. Provided for informational purposes only; not financial
// advice.

/** Simple moving average of the last `period` values ending at index `i` (inclusive). Returns null if insufficient data. */
export function smaAt(values: number[], i: number, period: number): number | null {
  if (i - period + 1 < 0) return null;
  let sum = 0;
  for (let k = i - period + 1; k <= i; k++) sum += values[k];
  return sum / period;
}

/** Full SMA series (nulls where insufficient history). */
export function sma(values: number[], period: number): (number | null)[] {
  return values.map((_, i) => smaAt(values, i, period));
}

/** Full EMA series (nulls where insufficient history to seed with an SMA). */
export function ema(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  if (values.length < period) return out;
  const k = 2 / (period + 1);
  const seed = smaAt(values, period - 1, period);
  if (seed == null) return out;
  out[period - 1] = seed;
  for (let i = period; i < values.length; i++) {
    const prev = out[i - 1] as number;
    out[i] = values[i] * k + prev * (1 - k);
  }
  return out;
}

/** Wilder's smoothing (used for RSI, ADX, ATR). */
export function wilderSmooth(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  if (values.length < period) return out;
  let sum = 0;
  for (let i = 0; i < period; i++) sum += values[i];
  out[period - 1] = sum / period;
  for (let i = period; i < values.length; i++) {
    const prev = out[i - 1] as number;
    out[i] = (prev * (period - 1) + values[i]) / period;
  }
  return out;
}

export function rsi(closes: number[], period = 14): (number | null)[] {
  const out: (number | null)[] = new Array(closes.length).fill(null);
  if (closes.length < period + 1) return out;
  const gains: number[] = [0];
  const losses: number[] = [0];
  for (let i = 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    gains.push(Math.max(0, diff));
    losses.push(Math.max(0, -diff));
  }
  const avgGain = wilderSmooth(gains.slice(1), period);
  const avgLoss = wilderSmooth(losses.slice(1), period);
  // avgGain/avgLoss are indexed against gains.slice(1), i.e. offset by 1 from closes
  for (let i = 0; i < avgGain.length; i++) {
    const g = avgGain[i];
    const l = avgLoss[i];
    if (g == null || l == null) continue;
    const idx = i + 1; // back into closes index space
    if (l === 0) {
      out[idx] = 100;
    } else {
      const rs = g / l;
      out[idx] = 100 - 100 / (1 + rs);
    }
  }
  return out;
}

export function stddev(values: number[], i: number, period: number): number | null {
  const m = smaAt(values, i, period);
  if (m == null) return null;
  let sum = 0;
  for (let k = i - period + 1; k <= i; k++) sum += (values[k] - m) ** 2;
  return Math.sqrt(sum / period);
}
