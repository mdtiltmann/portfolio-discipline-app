import { describe, it, expect } from "vitest";
import { computeTechnicalSummary, computeMovingAverages, computeOscillators } from "../indicators";
import { rsi, sma, ema } from "../math";
import type { Candle } from "../types";

function makeCandles(closes: number[]): Candle[] {
  return closes.map((c, i) => ({
    time: i,
    open: c,
    high: c + 0.5,
    low: c - 0.5,
    close: c,
    volume: 1000,
  }));
}

describe("moving averages / oscillators aggregation", () => {
  it("classifies a strongly uptrending series as Buy/Strong Buy on moving averages", () => {
    const closes = Array.from({ length: 260 }, (_, i) => 100 + i * 1.5);
    const candles = makeCandles(closes);
    const summary = computeTechnicalSummary(candles);
    expect(["Buy", "Strong Buy"]).toContain(summary.movingAverages.verdict);
    expect(summary.movingAverages.buy).toBeGreaterThan(summary.movingAverages.sell);
  });

  it("classifies a strongly downtrending series as Sell/Strong Sell on moving averages", () => {
    const closes = Array.from({ length: 260 }, (_, i) => 1000 - i * 1.5);
    const candles = makeCandles(closes);
    const summary = computeTechnicalSummary(candles);
    expect(["Sell", "Strong Sell"]).toContain(summary.movingAverages.verdict);
    expect(summary.movingAverages.sell).toBeGreaterThan(summary.movingAverages.buy);
  });

  it("produces 12 moving-average indicators (SMA/EMA x 6 periods) with enough history", () => {
    const closes = Array.from({ length: 260 }, (_, i) => 100 + i);
    const candles = makeCandles(closes);
    const results = computeMovingAverages(candles);
    expect(results.length).toBe(12);
  });

  it("produces oscillator indicators with enough history", () => {
    const closes = Array.from({ length: 100 }, (_, i) => 100 + Math.sin(i / 5) * 10 + i * 0.2);
    const candles = makeCandles(closes);
    const results = computeOscillators(candles);
    expect(results.length).toBeGreaterThan(5);
  });
});

describe("hand-checked math", () => {
  it("computes SMA correctly on a small fixed array", () => {
    const values = [1, 2, 3, 4, 5];
    const result = sma(values, 3);
    // SMA(3) at index 2 = (1+2+3)/3 = 2
    expect(result[2]).toBeCloseTo(2, 6);
    // SMA(3) at index 4 = (3+4+5)/3 = 4
    expect(result[4]).toBeCloseTo(4, 6);
  });

  it("computes EMA correctly on a small fixed array", () => {
    const values = [1, 2, 3, 4, 5];
    const period = 3;
    const result = ema(values, period);
    // Seed = SMA(3) at index 2 = 2
    expect(result[2]).toBeCloseTo(2, 6);
    // k = 2/(3+1) = 0.5; EMA[3] = 4*0.5 + 2*0.5 = 3
    expect(result[3]).toBeCloseTo(3, 6);
    // EMA[4] = 5*0.5 + 3*0.5 = 4
    expect(result[4]).toBeCloseTo(4, 6);
  });

  it("computes RSI = 100 for a monotonically increasing series (no losses)", () => {
    const values = Array.from({ length: 20 }, (_, i) => 100 + i);
    const result = rsi(values, 14);
    const last = result[result.length - 1];
    expect(last).toBe(100);
  });

  it("computes RSI = 0 for a monotonically decreasing series (no gains)", () => {
    const values = Array.from({ length: 20 }, (_, i) => 200 - i);
    const result = rsi(values, 14);
    const last = result[result.length - 1];
    expect(last).toBe(0);
  });
});
