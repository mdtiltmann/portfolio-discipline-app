import { describe, expect, it } from "vitest";
import { normalizePriceUnit, getFxRate, BASE_CURRENCY } from "../provider";

describe("normalizePriceUnit", () => {
  it("divides GBp (pence) values by 100 to get pounds", () => {
    expect(normalizePriceUnit(3827, "GBp")).toBeCloseTo(38.27, 5);
  });

  it("divides GBX values by 100 too (alternate pence notation)", () => {
    expect(normalizePriceUnit(6519, "GBX")).toBeCloseTo(65.19, 5);
  });

  it("leaves genuine GBP values unchanged", () => {
    expect(normalizePriceUnit(38.27, "GBP")).toBe(38.27);
  });

  it("leaves other currencies (EUR, USD, etc) unchanged", () => {
    expect(normalizePriceUnit(217.55, "USD")).toBe(217.55);
    expect(normalizePriceUnit(202.7, "EUR")).toBe(202.7);
  });

  it("leaves the value unchanged when currency is unknown/undefined", () => {
    expect(normalizePriceUnit(100, undefined)).toBe(100);
  });
});

describe("getFxRate", () => {
  it("returns 1 (no conversion) for the base currency itself, without any network call", async () => {
    expect(await getFxRate(BASE_CURRENCY)).toBe(1);
  });

  it("returns 1 (no conversion) when currency is unknown/undefined", async () => {
    expect(await getFxRate(undefined)).toBe(1);
  });
});
