import { describe, it, expect } from "vitest";
import { mergeExtractedItems } from "../mergeItems";

describe("mergeExtractedItems", () => {
  it("passes through single-occurrence tickers unchanged", () => {
    const result = mergeExtractedItems([{ ticker: "VWCE", current_value: 1000, confidence: 0.95 }]);
    expect(result).toHaveLength(1);
    expect(result[0].current_value).toBe(1000);
    expect(result[0].sourceCount).toBe(1);
    expect(result[0].valueMismatch).toBe(false);
  });

  it("prefers the most recent screenshot_date when tickers collide", () => {
    const result = mergeExtractedItems([
      { ticker: "AIR", current_value: 500, screenshot_date: "2026-08-01", confidence: 0.8 },
      { ticker: "AIR", current_value: 578.32, screenshot_date: "2026-08-10", confidence: 0.9 },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].current_value).toBe(578.32);
    expect(result[0].sourceCount).toBe(2);
  });

  it("falls back to highest confidence when dates tie or are missing", () => {
    const result = mergeExtractedItems([
      { ticker: "AIR", current_value: 500, confidence: 0.6 },
      { ticker: "AIR", current_value: 550, confidence: 0.85 },
    ]);
    expect(result[0].current_value).toBe(550);
  });

  it("flags a value mismatch beyond tolerance instead of silently picking one", () => {
    const result = mergeExtractedItems([
      { ticker: "AIR", current_value: 500, confidence: 0.9 },
      { ticker: "AIR", current_value: 700, confidence: 0.9 },
    ]);
    expect(result[0].valueMismatch).toBe(true);
  });

  it("does not flag near-identical values within tolerance", () => {
    const result = mergeExtractedItems([
      { ticker: "AIR", current_value: 578.0, confidence: 0.9 },
      { ticker: "AIR", current_value: 578.32, confidence: 0.9 },
    ]);
    expect(result[0].valueMismatch).toBe(false);
  });

  it("is case-insensitive and trims tickers when grouping", () => {
    const result = mergeExtractedItems([
      { ticker: " air ", current_value: 500 },
      { ticker: "AIR", current_value: 500 },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].ticker).toBe("AIR");
  });

  it("skips rows with no ticker", () => {
    const result = mergeExtractedItems([{ current_value: 500 }]);
    expect(result).toHaveLength(0);
  });
});
