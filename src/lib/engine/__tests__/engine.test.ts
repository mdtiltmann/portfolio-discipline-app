import { describe, it, expect } from "vitest";
import { computeHoldingStatus } from "../allocationStatus";
import { computeGainSignal } from "../gainTriggers";
import { computeTrimAmount } from "../trimSizing";
import { computeMonthlyContribution, allocateContribution, type ContributionTarget } from "../contribution";
import type { Holding } from "../types";

describe("gain alone never forces TRIM", () => {
  it("NVDA at 4.9% weight, +70% gain -> not TRIM", () => {
    const portfolioTotal = 100_000;
    const nvda: Holding = {
      ticker: "NVDA",
      asset_class: "individual_stock",
      quantity: 10,
      current_value: 4_900, // 4.9% of 100k
      cost_basis: 4_900 / 1.7, // +70% gain
    };

    const status = computeHoldingStatus(nvda, portfolioTotal, null, null);
    const gain = computeGainSignal(nvda, null);

    expect(gain.gainPct).toBeCloseTo(70, 0);
    expect(status.status).not.toBe("TRIM");
    expect(["BUY", "HOLD", "REVIEW"]).toContain(status.status);
  });
});

describe("individual stock trim at high concentration", () => {
  it("NVDA at 8.2% weight -> TRIM, conservative trim brings it to target", () => {
    const portfolioTotal = 100_000;
    const nvda: Holding = {
      ticker: "NVDA",
      asset_class: "individual_stock",
      quantity: 10,
      current_value: 8_200, // 8.2%
      cost_basis: 3_000,
    };

    const status = computeHoldingStatus(nvda, portfolioTotal, null, null);
    expect(status.status).toBe("TRIM");

    const target = status.targetPct ?? 5.5;
    const trimAmount = computeTrimAmount(nvda, target, portfolioTotal, "conservative");

    const expectedTargetValue = (target / 100) * portfolioTotal;
    const expectedTrim = nvda.current_value - expectedTargetValue;

    expect(trimAmount).toBeCloseTo(expectedTrim, 2);

    const remainingValue = nvda.current_value - trimAmount;
    const remainingPct = (remainingValue / portfolioTotal) * 100;
    expect(remainingPct).toBeCloseTo(target, 5);
    expect(trimAmount).toBeGreaterThan(0);
  });
});

describe("monthly contribution allocation", () => {
  it("allocates €700 across underweight buckets, sums to 700, skips STOP_ADDING/TRIM", () => {
    const portfolioTotal = 50_000;

    function makeStatus(
      ticker: string,
      currentValue: number,
      targetPct: number,
      status: "BUY" | "HOLD" | "STOP_ADDING" | "TRIM" | "REVIEW"
    ) {
      const targetValue = (targetPct / 100) * portfolioTotal;
      return {
        ticker,
        currentValue,
        currentPct: (currentValue / portfolioTotal) * 100,
        targetPct,
        targetMinPct: null,
        targetMaxPct: null,
        amountAboveTarget: Math.max(0, currentValue - targetValue),
        amountBelowTarget: Math.max(0, targetValue - currentValue),
        status,
        rationale: "",
      };
    }

    const targets: ContributionTarget[] = [
      { key: "VWCE", status: makeStatus("VWCE", 28_000, 62.5, "BUY") }, // underweight
      { key: "WSML", status: makeStatus("WSML", 2_000, 6, "BUY") }, // underweight
      { key: "EMIM", status: makeStatus("EMIM", 3_500, 8, "BUY") }, // underweight
      { key: "IITU", status: makeStatus("IITU", 3_600, 7, "HOLD") }, // roughly at target
      { key: "NVDA", status: makeStatus("NVDA", 4_500, 5.5, "TRIM") }, // blocked
      { key: "SGLN", status: makeStatus("SGLN", 1_000, 4, "STOP_ADDING") }, // blocked
    ];

    const plan = allocateContribution(700, targets);

    const sum = plan.allocations.reduce((s, a) => s + a.amount, 0);
    expect(sum).toBeCloseTo(700, 1);

    expect(plan.doNotAddTo).toContain("NVDA");
    expect(plan.doNotAddTo).toContain("SGLN");
    expect(plan.allocations.find((a) => a.ticker === "NVDA")).toBeUndefined();
    expect(plan.allocations.find((a) => a.ticker === "SGLN")).toBeUndefined();
  });

  it("computes monthly contribution with annual compounding capped at cap_monthly", () => {
    const schedule = {
      start_date: "2024-01-01",
      base_monthly: 700,
      annual_increase_pct: 10,
      cap_monthly: 1025,
    };

    // Before first anniversary: base amount.
    expect(computeMonthlyContribution(schedule, new Date("2024-06-01"))).toBeCloseTo(700, 2);

    // One full year elapsed: +10%.
    expect(computeMonthlyContribution(schedule, new Date("2025-06-01"))).toBeCloseTo(770, 2);

    // Many years elapsed: capped.
    expect(computeMonthlyContribution(schedule, new Date("2035-06-01"))).toBeLessThanOrEqual(1025);
  });
});
