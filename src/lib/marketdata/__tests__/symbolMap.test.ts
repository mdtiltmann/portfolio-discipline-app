import { describe, it, expect } from "vitest";
import { toYahooSymbol, isKnownEuropeanEtf, DEFAULT_YAHOO_SYMBOL_OVERRIDES } from "../symbolMap";

describe("toYahooSymbol", () => {
  it("uses the built-in override table for known European UCITS ETFs", () => {
    expect(toYahooSymbol("VWCE")).toBe("VWCE.DE");
    expect(toYahooSymbol("IITU")).toBe("IITU.L");
  });

  it("prefers an explicit per-holding override over the built-in table", () => {
    expect(toYahooSymbol("VWCE", "VWCE.MI")).toBe("VWCE.MI");
  });

  it("falls back to the ticker unchanged for unmapped tickers", () => {
    expect(toYahooSymbol("AAPL")).toBe("AAPL");
    expect(toYahooSymbol("nvda")).toBe("NVDA");
  });

  it("ignores blank overrides", () => {
    expect(toYahooSymbol("VWCE", "")).toBe("VWCE.DE");
    expect(toYahooSymbol("VWCE", "   ")).toBe("VWCE.DE");
  });

  it("respects a custom overrides table when supplied", () => {
    expect(toYahooSymbol("FOO", null, { FOO: "FOO.AS" })).toBe("FOO.AS");
  });
});

describe("isKnownEuropeanEtf", () => {
  it("flags tickers present in the default override table", () => {
    for (const t of Object.keys(DEFAULT_YAHOO_SYMBOL_OVERRIDES)) {
      expect(isKnownEuropeanEtf(t)).toBe(true);
    }
    expect(isKnownEuropeanEtf("AAPL")).toBe(false);
  });
});
