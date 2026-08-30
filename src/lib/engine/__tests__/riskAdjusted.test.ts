import { describe, expect, it } from "vitest";
import { computeAnnualizedVolatility } from "../volatility";
import { volatilityAdjustedTarget, rebalanceBand, RISK_PROFILES } from "../riskProfile";
import { resolveThresholds } from "../thresholds";
import { computeHoldingStatus } from "../allocationStatus";
import type { Candle } from "@/lib/technicals/types";
import type { Holding } from "../types";

function makeCandle(close: number, i: number): Candle {
  return { time: i * 86400, open: close, high: close, low: close, close, volume: 1000 };
}

describe("computeAnnualizedVolatility", () => {
  it("returns null with too little history", () => {
    const candles = [makeCandle(100, 0), makeCandle(101, 1)];
    expect(computeAnnualizedVolatility(candles)).toBeNull();
  });

  it("reports near-zero volatility for a flat price series", () => {
    const candles = Array.from({ length: 30 }, (_, i) => makeCandle(100, i));
    const vol = computeAnnualizedVolatility(candles);
    expect(vol).not.toBeNull();
    expect(vol!).toBeLessThan(0.01);
  });

  it("reports higher volatility for a choppier series than a smooth one", () => {
    const smooth = Array.from({ length: 60 }, (_, i) => makeCandle(100 + i * 0.5, i));
    const choppy = Array.from({ length: 60 }, (_, i) => makeCandle(100 + (i % 2 === 0 ? 10 : -10), i));
    const smoothVol = computeAnnualizedVolatility(smooth)!;
    const choppyVol = computeAnnualizedVolatility(choppy)!;
    expect(choppyVol).toBeGreaterThan(smoothVol);
  });
});

describe("volatilityAdjustedTarget", () => {
  const profile = RISK_PROFILES.moderate;

  it("shrinks the target for a more-volatile-than-benchmark holding", () => {
    const target = volatilityAdjustedTarget(5.5, 0.6, profile); // 2x the 0.30 benchmark
    expect(target).toBeLessThan(5.5);
  });

  it("grows the target for a less-volatile-than-benchmark holding, but clamps the multiplier", () => {
    const target = volatilityAdjustedTarget(5.5, 0.05, profile); // far below benchmark
    expect(target).toBeCloseTo(5.5 * profile.volatilityMaxMultiplier, 5);
  });

  it("leaves the base target unchanged when volatility is unavailable", () => {
    expect(volatilityAdjustedTarget(5.5, null, profile)).toBe(5.5);
  });
});

describe("rebalanceBand (5/25 rule)", () => {
  it("picks the smaller of the absolute and relative legs", () => {
    const profile = RISK_PROFILES.moderate; // absolute 5pp, relative 25%
    // For a small target (4%), 25% relative (1pp) is smaller than the 5pp absolute leg.
    expect(rebalanceBand(4, profile)).toBeCloseTo(1, 5);
    // For a large target (30%), the 5pp absolute leg is smaller than 25% relative (7.5pp).
    expect(rebalanceBand(30, profile)).toBeCloseTo(5, 5);
  });
});

describe("resolveThresholds with risk context", () => {
  it("explicit per-class rule overrides still win over the volatility fallback", () => {
    const t = resolveThresholds(
      "NVDA",
      "individual_stock",
      [
        {
          asset_class: "individual_stock",
          ticker: null,
          target_pct: 9,
          target_min_pct: null,
          target_max_pct: null,
          warning_pct: 9,
          trim_pct: 15,
          stop_adding_pct: 9,
          gain_alert_informational: null,
          gain_alert_review: null,
          gain_alert_profit_taking: null,
          gain_alert_strong: null,
          trim_mode: null,
        },
      ],
      undefined,
      { volatility: 0.9, profile: RISK_PROFILES.moderate }
    );
    expect(t.targetPct).toBe(9);
    expect(t.trimPct).toBe(15);
  });

  it("a high-volatility stock gets a lower target and tighter trim than a low-volatility one with no explicit rule", () => {
    const high = resolveThresholds("HIGHVOL", "individual_stock", null, undefined, {
      volatility: 0.9,
      profile: RISK_PROFILES.moderate,
    });
    const low = resolveThresholds("LOWVOL", "individual_stock", null, undefined, {
      volatility: 0.15,
      profile: RISK_PROFILES.moderate,
    });
    expect(high.targetPct!).toBeLessThan(low.targetPct!);
    expect(high.trimPct!).toBeLessThan(low.trimPct!);
  });
});

describe("computeHoldingStatus with risk context", () => {
  function stock(currentValue: number): Holding {
    return {
      ticker: "HIGHVOL",
      asset_class: "individual_stock",
      quantity: 1,
      current_value: currentValue,
      cost_basis: null,
    };
  }

  it("a volatile stock gets flagged TRIM at a lower portfolio weight than a calm one would be", () => {
    const totalValue = 10000;
    const riskContext = { volatility: 0.9, profile: RISK_PROFILES.moderate };
    // moderate individual stock base target 5.5%, benchmark 0.30, vol 0.9 -> multiplier clamps to 0.5 -> target 2.75%
    // band = min(5, 2.75*0.25) = 0.6875 -> trim threshold ~= 3.44%
    const holding = stock(400); // 4% of portfolio — below the unadjusted 8% default trim, but above this stock's adjusted band
    const status = computeHoldingStatus(holding, totalValue, null, null, riskContext);
    expect(status.status).toBe("TRIM");
  });

  it("the same weight is NOT a trim call without a risk context (falls back to static 8% threshold)", () => {
    const totalValue = 10000;
    const holding = stock(400); // 4% — well under the static 8% trim default
    const status = computeHoldingStatus(holding, totalValue, null, null, undefined);
    expect(status.status).not.toBe("TRIM");
  });
});
