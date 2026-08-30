import { describe, expect, it } from "vitest";
import { buildTechnicalRationale } from "../rationale";
import type { PanelResult } from "../types";

function panel(buy: number, sell: number, neutral: number, verdict: PanelResult["verdict"], indicators: PanelResult["indicators"] = []): PanelResult {
  return { buy, sell, neutral, verdict, indicators };
}

describe("buildTechnicalRationale", () => {
  it("states the call and mentions when news adjusted it", () => {
    const text = buildTechnicalRationale({
      ticker: "NVDA",
      movingAverages: panel(11, 1, 0, "Strong Buy", [
        { name: "SMA10", signal: "Buy" },
        { name: "EMA10", signal: "Buy" },
        { name: "SMA20", signal: "Buy" },
        { name: "EMA20", signal: "Buy" },
        { name: "SMA100", signal: "Buy" },
        { name: "EMA100", signal: "Buy" },
        { name: "SMA200", signal: "Buy" },
        { name: "EMA200", signal: "Buy" },
      ]),
      oscillators: panel(1, 2, 8, "Neutral", [
        { name: "RSI(14)", signal: "Neutral", value: 52 },
        { name: "MACD(12,26,9)", signal: "Sell", value: -0.5 },
      ]),
      technicalVerdict: "Buy",
      newsAdjustedVerdict: "Buy",
      newsNudgeApplied: 0.075,
      materialNews: [{ headline: "Nvidia beats earnings", sentiment: "positive" }],
      lastPrice: 217.5,
    });

    expect(text).toContain("Call: Buy");
    expect(text).toContain("RSI is 52");
    expect(text).toContain("MACD is below its signal line");
    expect(text).toContain("material headline");
    expect(text).toContain("nudging the call toward Buy");
  });

  it("notes short vs long-term trend divergence", () => {
    const text = buildTechnicalRationale({
      ticker: "TEST",
      movingAverages: panel(4, 4, 0, "Neutral", [
        { name: "SMA10", signal: "Buy" },
        { name: "EMA10", signal: "Buy" },
        { name: "SMA20", signal: "Buy" },
        { name: "EMA20", signal: "Buy" },
        { name: "SMA100", signal: "Sell" },
        { name: "EMA100", signal: "Sell" },
        { name: "SMA200", signal: "Sell" },
        { name: "EMA200", signal: "Sell" },
      ]),
      oscillators: panel(0, 0, 11, "Neutral", []),
      technicalVerdict: "Neutral",
      newsAdjustedVerdict: "Neutral",
      newsNudgeApplied: 0,
      materialNews: [],
      lastPrice: 100,
    });

    expect(text).toContain("Short-term averages are trending up while longer-term averages are trending down");
    expect(text).toContain("No material news is currently affecting this call.");
  });
});
