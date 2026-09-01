import { describe, expect, it } from "vitest";
import { computeGainNudge, MAX_GAIN_NUDGE } from "../gainNudge";

describe("computeGainNudge", () => {
  it("applies no nudge below the 30% threshold either direction", () => {
    expect(computeGainNudge(15).nudgeApplied).toBe(0);
    expect(computeGainNudge(-20).nudgeApplied).toBe(0);
    expect(computeGainNudge(null).nudgeApplied).toBe(0);
  });

  it("nudges toward Sell (negative) for a large unrealized gain", () => {
    const { nudgeApplied } = computeGainNudge(72);
    expect(nudgeApplied).toBeLessThan(0);
    expect(Math.abs(nudgeApplied)).toBeLessThanOrEqual(MAX_GAIN_NUDGE);
  });

  it("nudges toward Buy (positive) for a large unrealized loss", () => {
    const { nudgeApplied } = computeGainNudge(-72);
    expect(nudgeApplied).toBeGreaterThan(0);
    expect(Math.abs(nudgeApplied)).toBeLessThanOrEqual(MAX_GAIN_NUDGE);
  });

  it("clamps at the max magnitude for extreme gains/losses", () => {
    expect(computeGainNudge(500).nudgeApplied).toBeCloseTo(-MAX_GAIN_NUDGE, 5);
    expect(computeGainNudge(-500).nudgeApplied).toBeCloseTo(MAX_GAIN_NUDGE, 5);
  });

  it("scales up smoothly between the 30% and 100% breakpoints", () => {
    const at50 = Math.abs(computeGainNudge(50).nudgeApplied);
    const at90 = Math.abs(computeGainNudge(90).nudgeApplied);
    expect(at90).toBeGreaterThan(at50);
    expect(at90).toBeLessThan(MAX_GAIN_NUDGE);
  });
});
