import { describe, it, expect } from "vitest";
import { simulateWithdrawalSurvival, findStopContributingPoint } from "../retirement";

describe("retirement withdrawal survival simulation", () => {
  it("survives when returns comfortably outpace withdrawals net of pension", () => {
    const result = simulateWithdrawalSurvival({
      startingPortfolio: 1_000_000,
      retirementAge: 65,
      endAge: 90,
      monthlyWithdrawal: 2000,
      inflationAdjusted: false,
      inflationPct: 2.5,
      annualReturnPct: 6,
      pensionMonthly: 1200,
      pensionStartAge: 67,
      partTimeIncomeMonthly: 0,
      partTimeIncomeYears: 0,
    });

    expect(result.survives).toBe(true);
    expect(result.depletionAge).toBeNull();
    expect(result.endingBalance).toBeGreaterThan(0);
    expect(result.years.length).toBe(26); // ages 65..90 inclusive
  });

  it("depletes before end age when withdrawals are too aggressive for a small pot", () => {
    const result = simulateWithdrawalSurvival({
      startingPortfolio: 50_000,
      retirementAge: 60,
      endAge: 90,
      monthlyWithdrawal: 3000,
      inflationAdjusted: true,
      inflationPct: 3,
      annualReturnPct: 4,
      pensionMonthly: 0,
      pensionStartAge: 67,
      partTimeIncomeMonthly: 0,
      partTimeIncomeYears: 0,
    });

    expect(result.survives).toBe(false);
    expect(result.depletionAge).not.toBeNull();
    expect(result.depletionAge!).toBeLessThan(90);
  });
});

describe("when can I stop contributing", () => {
  it("reports canStopNow when the current balance alone already reaches the target", () => {
    const result = findStopContributingPoint({
      currentValue: 900_000,
      monthlyContribution: 700,
      annualIncreasePct: 10,
      capMonthly: 1025,
      annualReturnPct: 7,
      currentAge: 60,
      retirementAge: 65,
      targetRetirementValue: 1_000_000,
    });

    expect(result.canStopNow).toBe(true);
    expect(result.earliestYearOffset).toBe(0);
  });

  it("finds a future point when contributions are still needed today", () => {
    const result = findStopContributingPoint({
      currentValue: 30_000,
      monthlyContribution: 700,
      annualIncreasePct: 10,
      capMonthly: 1025,
      annualReturnPct: 7,
      currentAge: 30,
      retirementAge: 65,
      targetRetirementValue: 1_000_000,
    });

    expect(result.canStopNow).toBe(false);
    expect(result.earliestYearOffset).not.toBeNull();
    expect(result.earliestAge!).toBeGreaterThan(30);
    expect(result.earliestAge!).toBeLessThanOrEqual(65);
  });
});
