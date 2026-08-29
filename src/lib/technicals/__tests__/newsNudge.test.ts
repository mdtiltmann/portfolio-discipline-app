import { describe, it, expect } from "vitest";
import { applyNewsNudge, MAX_NEWS_NUDGE, type NewsNudgeItem } from "../newsNudge";
import { verdictFromRatio } from "../indicators";

describe("applyNewsNudge", () => {
  it("nudges a Neutral ratio toward Buy on strongly positive material news, but not past one bucket", () => {
    const baseRatio = 0; // Neutral
    const items: NewsNudgeItem[] = [
      { sentiment: "positive", materiality: "material" },
      { sentiment: "positive", materiality: "material" },
      { sentiment: "positive", materiality: "material" },
    ];
    const { adjustedRatio, nudgeApplied } = applyNewsNudge(baseRatio, items);
    expect(nudgeApplied).toBeCloseTo(MAX_NEWS_NUDGE, 5);
    expect(adjustedRatio).toBeCloseTo(MAX_NEWS_NUDGE, 5);

    // Still Buy at most (bucket immediately above Neutral), never Strong Buy.
    expect(verdictFromRatio(baseRatio)).toBe("Neutral");
    expect(verdictFromRatio(adjustedRatio)).not.toBe("Strong Buy");
  });

  it("produces zero nudge from noise/worth_watching-only items", () => {
    const baseRatio = 0.05;
    const items: NewsNudgeItem[] = [
      { sentiment: "positive", materiality: "noise" },
      { sentiment: "negative", materiality: "worth_watching" },
      { sentiment: "positive", materiality: "worth_watching" },
    ];
    const { adjustedRatio, nudgeApplied } = applyNewsNudge(baseRatio, items);
    expect(nudgeApplied).toBe(0);
    expect(adjustedRatio).toBe(baseRatio);
  });

  it("clamps the nudge at the max even with many one-sided material items", () => {
    const items: NewsNudgeItem[] = Array.from({ length: 20 }, () => ({
      sentiment: "negative" as const,
      materiality: "material" as const,
    }));
    const { adjustedRatio, nudgeApplied } = applyNewsNudge(0.9, items);
    expect(nudgeApplied).toBeCloseTo(-MAX_NEWS_NUDGE, 5);
    expect(adjustedRatio).toBeCloseTo(0.9 - MAX_NEWS_NUDGE, 5);
  });

  it("clamps adjustedRatio to [-1, 1] at the extremes", () => {
    const items: NewsNudgeItem[] = [{ sentiment: "positive", materiality: "material" }];
    const { adjustedRatio } = applyNewsNudge(1, items);
    expect(adjustedRatio).toBeLessThanOrEqual(1);
  });

  it("mixed material sentiment averages toward a smaller nudge", () => {
    const items: NewsNudgeItem[] = [
      { sentiment: "positive", materiality: "material" },
      { sentiment: "negative", materiality: "material" },
    ];
    const { nudgeApplied } = applyNewsNudge(0, items);
    expect(nudgeApplied).toBe(0);
  });
});
