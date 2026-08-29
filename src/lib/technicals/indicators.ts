// Technical-analysis indicator computations.
//
// All formulas here are standard, publicly documented technical-analysis
// methods (RSI, MACD, Stochastic, ADX, CCI, Awesome Oscillator, Williams %R,
// Ultimate Oscillator, Bull/Bear Power, moving averages, etc). Classification
// thresholds (e.g. RSI > 70 = Sell) approximate the widely-known convention
// popularized by TradingView's public "Technicals" widget, reimplemented
// from scratch here — nothing is scraped, reverse-engineered, or licensed
// from TradingView. This is informational only and not financial advice.

import type { Candle, IndicatorResult, PanelResult, Signal, TechnicalSummary, Verdict } from "./types";
import { ema, sma, rsi as rsiSeries, wilderSmooth } from "./math";

const MA_PERIODS = [10, 20, 30, 50, 100, 200];

function classifyAgainstPrice(close: number, ma: number): Signal {
  if (close > ma) return "Buy";
  if (close < ma) return "Sell";
  return "Neutral";
}

export function computeMovingAverages(candles: Candle[]): IndicatorResult[] {
  const closes = candles.map((c) => c.close);
  const i = closes.length - 1;
  const close = closes[i];
  const results: IndicatorResult[] = [];

  for (const period of MA_PERIODS) {
    const smaSeries = sma(closes, period);
    const smaVal = smaSeries[i];
    if (smaVal != null) {
      results.push({ name: `SMA${period}`, signal: classifyAgainstPrice(close, smaVal), value: smaVal });
    }
    const emaSeries = ema(closes, period);
    const emaVal = emaSeries[i];
    if (emaVal != null) {
      results.push({ name: `EMA${period}`, signal: classifyAgainstPrice(close, emaVal), value: emaVal });
    }
  }
  return results;
}

// ---- Oscillators ----

function rsiIndicator(candles: Candle[]): IndicatorResult | null {
  const closes = candles.map((c) => c.close);
  const series = rsiSeries(closes, 14);
  const v = series[series.length - 1];
  if (v == null) return null;
  let signal: Signal = "Neutral";
  if (v > 70) signal = "Sell";
  else if (v < 30) signal = "Buy";
  return { name: "RSI(14)", signal, value: v };
}

function stochasticK(candles: Candle[], period: number, i: number): number | null {
  if (i - period + 1 < 0) return null;
  let hh = -Infinity;
  let ll = Infinity;
  for (let k = i - period + 1; k <= i; k++) {
    hh = Math.max(hh, candles[k].high);
    ll = Math.min(ll, candles[k].low);
  }
  if (hh === ll) return 50;
  return ((candles[i].close - ll) / (hh - ll)) * 100;
}

function stochasticIndicator(candles: Candle[]): IndicatorResult | null {
  const period = 14;
  const smoothK = 3;
  const i = candles.length - 1;
  if (i - period - smoothK + 1 < 0) return null;
  const kRaw: number[] = [];
  for (let idx = period - 1; idx <= i; idx++) {
    const k = stochasticK(candles, period, idx);
    if (k != null) kRaw.push(k);
  }
  if (kRaw.length < smoothK) return null;
  const kSmoothed = kRaw.slice(-smoothK).reduce((a, b) => a + b, 0) / smoothK;
  let signal: Signal = "Neutral";
  if (kSmoothed > 80) signal = "Sell";
  else if (kSmoothed < 20) signal = "Buy";
  return { name: "Stochastic %K(14,3,3)", signal, value: kSmoothed };
}

function cciIndicator(candles: Candle[]): IndicatorResult | null {
  const period = 20;
  const i = candles.length - 1;
  if (i - period + 1 < 0) return null;
  const typicalPrices = candles.map((c) => (c.high + c.low + c.close) / 3);
  const smaTp = sma(typicalPrices, period)[i];
  if (smaTp == null) return null;
  let meanDev = 0;
  for (let k = i - period + 1; k <= i; k++) meanDev += Math.abs(typicalPrices[k] - smaTp);
  meanDev /= period;
  if (meanDev === 0) return { name: "CCI(20)", signal: "Neutral", value: 0 };
  const cci = (typicalPrices[i] - smaTp) / (0.015 * meanDev);
  let signal: Signal = "Neutral";
  if (cci > 100) signal = "Sell";
  else if (cci < -100) signal = "Buy";
  return { name: "CCI(20)", signal, value: cci };
}

function adxIndicator(candles: Candle[]): IndicatorResult | null {
  const period = 14;
  if (candles.length < period * 2 + 1) return null;
  const plusDM: number[] = [0];
  const minusDM: number[] = [0];
  const tr: number[] = [0];
  for (let i = 1; i < candles.length; i++) {
    const upMove = candles[i].high - candles[i - 1].high;
    const downMove = candles[i - 1].low - candles[i].low;
    plusDM.push(upMove > downMove && upMove > 0 ? upMove : 0);
    minusDM.push(downMove > upMove && downMove > 0 ? downMove : 0);
    tr.push(
      Math.max(
        candles[i].high - candles[i].low,
        Math.abs(candles[i].high - candles[i - 1].close),
        Math.abs(candles[i].low - candles[i - 1].close)
      )
    );
  }
  const smoothedTR = wilderSmooth(tr.slice(1), period);
  const smoothedPlusDM = wilderSmooth(plusDM.slice(1), period);
  const smoothedMinusDM = wilderSmooth(minusDM.slice(1), period);

  const plusDI: (number | null)[] = smoothedTR.map((trv, k) =>
    trv != null && trv !== 0 && smoothedPlusDM[k] != null ? (100 * (smoothedPlusDM[k] as number)) / trv : null
  );
  const minusDI: (number | null)[] = smoothedTR.map((trv, k) =>
    trv != null && trv !== 0 && smoothedMinusDM[k] != null ? (100 * (smoothedMinusDM[k] as number)) / trv : null
  );
  const dx: (number | null)[] = plusDI.map((p, k) => {
    const m = minusDI[k];
    if (p == null || m == null || p + m === 0) return null;
    return (100 * Math.abs(p - m)) / (p + m);
  });
  const dxValues = dx.filter((v): v is number => v != null);
  if (dxValues.length < period) return null;
  const adxSeries = wilderSmooth(dxValues, period);
  const adx = adxSeries[adxSeries.length - 1];
  const lastPlusDI = plusDI[plusDI.length - 1];
  const lastMinusDI = minusDI[minusDI.length - 1];
  if (adx == null || lastPlusDI == null || lastMinusDI == null) return null;

  let signal: Signal = "Neutral";
  if (adx > 25 && lastPlusDI > lastMinusDI) signal = "Buy";
  else if (adx > 25 && lastMinusDI > lastPlusDI) signal = "Sell";
  return { name: "ADX(14)", signal, value: adx };
}

function awesomeOscillatorIndicator(candles: Candle[]): IndicatorResult | null {
  const midpoints = candles.map((c) => (c.high + c.low) / 2);
  const sma5 = sma(midpoints, 5);
  const sma34 = sma(midpoints, 34);
  const i = candles.length - 1;
  if (i < 1 || sma5[i] == null || sma34[i] == null || sma5[i - 1] == null || sma34[i - 1] == null) return null;
  const aoToday = (sma5[i] as number) - (sma34[i] as number);
  const aoYesterday = (sma5[i - 1] as number) - (sma34[i - 1] as number);
  let signal: Signal = "Neutral";
  if (aoToday > 0 && aoToday > aoYesterday) signal = "Buy";
  else if (aoToday < 0 && aoToday < aoYesterday) signal = "Sell";
  return { name: "Awesome Oscillator", signal, value: aoToday };
}

function momentumIndicator(candles: Candle[]): IndicatorResult | null {
  const period = 10;
  const closes = candles.map((c) => c.close);
  const i = closes.length - 1;
  if (i - period - 1 < 0) return null;
  const momToday = closes[i] - closes[i - period];
  const momPrev = closes[i - 1] - closes[i - 1 - period];
  let signal: Signal = "Neutral";
  if (momToday > momPrev) signal = "Buy";
  else if (momToday < momPrev) signal = "Sell";
  return { name: "Momentum(10)", signal, value: momToday };
}

function macdIndicator(candles: Candle[]): IndicatorResult | null {
  const closes = candles.map((c) => c.close);
  const ema12 = ema(closes, 12);
  const ema26 = ema(closes, 26);
  const macdLine: (number | null)[] = closes.map((_, i) =>
    ema12[i] != null && ema26[i] != null ? (ema12[i] as number) - (ema26[i] as number) : null
  );
  const macdValues = macdLine.filter((v): v is number => v != null);
  if (macdValues.length < 9) return null;
  const signalSeries = ema(macdValues, 9);
  const signalVal = signalSeries[signalSeries.length - 1];
  const macdVal = macdValues[macdValues.length - 1];
  if (signalVal == null) return null;
  const signal: Signal = macdVal > signalVal ? "Buy" : "Sell";
  return { name: "MACD(12,26,9)", signal, value: macdVal - signalVal };
}

function stochRsiIndicator(candles: Candle[]): IndicatorResult | null {
  const closes = candles.map((c) => c.close);
  const rsiVals = rsiSeries(closes, 14);
  const validIdx: number[] = [];
  for (let i = 0; i < rsiVals.length; i++) if (rsiVals[i] != null) validIdx.push(i);
  if (validIdx.length < 14 + 3) return null;
  const rsiOnly = validIdx.map((i) => rsiVals[i] as number);

  const stochRsiSeries: (number | null)[] = rsiOnly.map((_, i) => {
    if (i - 14 + 1 < 0) return null;
    let hh = -Infinity;
    let ll = Infinity;
    for (let k = i - 14 + 1; k <= i; k++) {
      hh = Math.max(hh, rsiOnly[k]);
      ll = Math.min(ll, rsiOnly[k]);
    }
    if (hh === ll) return 50;
    return ((rsiOnly[i] - ll) / (hh - ll)) * 100;
  });
  const stochValid = stochRsiSeries.filter((v): v is number => v != null);
  if (stochValid.length < 3) return null;
  const kSmoothed = sma(stochValid, 3);
  const kVal = kSmoothed[kSmoothed.length - 1];
  if (kVal == null) return null;
  let signal: Signal = "Neutral";
  if (kVal > 80) signal = "Sell";
  else if (kVal < 20) signal = "Buy";
  return { name: "Stochastic RSI Fast(3,3,14,14)", signal, value: kVal };
}

function williamsRIndicator(candles: Candle[]): IndicatorResult | null {
  const period = 14;
  const i = candles.length - 1;
  if (i - period + 1 < 0) return null;
  let hh = -Infinity;
  let ll = Infinity;
  for (let k = i - period + 1; k <= i; k++) {
    hh = Math.max(hh, candles[k].high);
    ll = Math.min(ll, candles[k].low);
  }
  if (hh === ll) return { name: "Williams %R(14)", signal: "Neutral", value: -50 };
  const wr = ((hh - candles[i].close) / (hh - ll)) * -100;
  let signal: Signal = "Neutral";
  if (wr > -20) signal = "Sell";
  else if (wr < -80) signal = "Buy";
  return { name: "Williams %R(14)", signal, value: wr };
}

function bullBearPowerIndicator(candles: Candle[]): IndicatorResult | null {
  const closes = candles.map((c) => c.close);
  const ema13 = ema(closes, 13);
  const i = candles.length - 1;
  if (i < 1 || ema13[i] == null || ema13[i - 1] == null) return null;
  const bullPower = candles[i].high - (ema13[i] as number);
  const bearPower = candles[i].low - (ema13[i] as number);
  const prevBearPower = candles[i - 1].low - (ema13[i - 1] as number);
  let signal: Signal = "Neutral";
  if (bullPower > 0 && bearPower > prevBearPower) signal = "Buy";
  else if (bullPower < 0 && bearPower < prevBearPower) signal = "Sell";
  return { name: "Bull/Bear Power(13)", signal, value: bullPower + bearPower };
}

function ultimateOscillatorIndicator(candles: Candle[]): IndicatorResult | null {
  const periods = [7, 14, 28];
  const i = candles.length - 1;
  if (i - Math.max(...periods) < 0) return null;

  const bp: number[] = [];
  const tr: number[] = [];
  for (let k = 1; k <= i; k++) {
    const low = Math.min(candles[k].low, candles[k - 1].close);
    const high = Math.max(candles[k].high, candles[k - 1].close);
    bp.push(candles[k].close - low);
    tr.push(high - low);
  }
  // bp/tr are indexed from candle index 1; last element corresponds to i
  function avgRatio(period: number): number | null {
    if (bp.length < period) return null;
    const bpSum = bp.slice(-period).reduce((a, b) => a + b, 0);
    const trSum = tr.slice(-period).reduce((a, b) => a + b, 0);
    if (trSum === 0) return null;
    return bpSum / trSum;
  }
  const avg7 = avgRatio(7);
  const avg14 = avgRatio(14);
  const avg28 = avgRatio(28);
  if (avg7 == null || avg14 == null || avg28 == null) return null;
  const uo = (100 * (4 * avg7 + 2 * avg14 + avg28)) / 7;
  let signal: Signal = "Neutral";
  if (uo > 70) signal = "Sell";
  else if (uo < 30) signal = "Buy";
  return { name: "Ultimate Oscillator(7,14,28)", signal, value: uo };
}

export function computeOscillators(candles: Candle[]): IndicatorResult[] {
  const fns = [
    rsiIndicator,
    stochasticIndicator,
    cciIndicator,
    adxIndicator,
    awesomeOscillatorIndicator,
    momentumIndicator,
    macdIndicator,
    stochRsiIndicator,
    williamsRIndicator,
    bullBearPowerIndicator,
    ultimateOscillatorIndicator,
  ];
  const results: IndicatorResult[] = [];
  for (const fn of fns) {
    const r = fn(candles);
    if (r) results.push(r);
  }
  return results;
}

// ---- Aggregation ----

// Default cutoffs for the (buy - sell) / total ratio -> 5-bucket verdict,
// approximating TradingView's published Strong Sell..Strong Buy scale.
// These are exposed as editable settings (see Settings screen) since the
// "right" cutoff is a judgment call the user may want to tune over time
// against how the signal performs in practice.
export const STRONG_SELL_MAX = -0.5;
export const SELL_MAX = -0.1;
export const NEUTRAL_MAX = 0.1;
export const BUY_MAX = 0.5;

export interface VerdictThresholds {
  strongSellMax: number;
  sellMax: number;
  neutralMax: number;
  buyMax: number;
}

export const DEFAULT_VERDICT_THRESHOLDS: VerdictThresholds = {
  strongSellMax: STRONG_SELL_MAX,
  sellMax: SELL_MAX,
  neutralMax: NEUTRAL_MAX,
  buyMax: BUY_MAX,
};

// Buckets a raw ratio in [-1, 1] (typically (buy - sell) / total, optionally
// nudged by news sentiment — see newsNudge.ts) into a 5-way verdict. Shared
// by verdictFromCounts below and by the news-nudge re-bucketing path.
export function verdictFromRatio(
  ratio: number,
  thresholds: VerdictThresholds = DEFAULT_VERDICT_THRESHOLDS
): Verdict {
  if (ratio <= thresholds.strongSellMax) return "Strong Sell";
  if (ratio <= thresholds.sellMax) return "Sell";
  if (ratio < thresholds.neutralMax) return "Neutral";
  if (ratio < thresholds.buyMax) return "Buy";
  return "Strong Buy";
}

export function verdictFromCounts(
  buy: number,
  sell: number,
  neutral: number,
  thresholds: VerdictThresholds = DEFAULT_VERDICT_THRESHOLDS
): Verdict {
  const total = buy + sell + neutral;
  if (total === 0) return "Neutral";
  const ratio = (buy - sell) / total;
  return verdictFromRatio(ratio, thresholds);
}

function toPanel(indicators: IndicatorResult[], thresholds: VerdictThresholds): PanelResult {
  const buy = indicators.filter((i) => i.signal === "Buy").length;
  const sell = indicators.filter((i) => i.signal === "Sell").length;
  const neutral = indicators.filter((i) => i.signal === "Neutral").length;
  return { buy, sell, neutral, verdict: verdictFromCounts(buy, sell, neutral, thresholds), indicators };
}

export function computeTechnicalSummary(
  candles: Candle[],
  thresholds: VerdictThresholds = DEFAULT_VERDICT_THRESHOLDS
): TechnicalSummary {
  const maIndicators = computeMovingAverages(candles);
  const oscIndicators = computeOscillators(candles);
  const movingAverages = toPanel(maIndicators, thresholds);
  const oscillators = toPanel(oscIndicators, thresholds);
  const combined = [...maIndicators, ...oscIndicators];
  const summary = toPanel(combined, thresholds);
  return { movingAverages, oscillators, summary };
}
