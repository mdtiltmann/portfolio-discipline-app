import { describe, it, expect } from "vitest";
import { computeTickerExposure, computeSectorExposure, computeGeographyExposure, computeExposureAlerts } from "../exposure";
import type { Holding } from "../types";
import { DEFAULT_RISK_LIMITS } from "../riskAlerts";

describe("hidden exposure via ETF constituents", () => {
  const holdings: Holding[] = [
    { ticker: "VWCE", asset_class: "broad_core_etf", quantity: 1, current_value: 32_000, cost_basis: 24_000 },
    { ticker: "NVDA", asset_class: "individual_stock", quantity: 1, current_value: 4_100, cost_basis: 1_450 },
  ];

  const constituents = [
    { etf_ticker: "VWCE", constituent_ticker: "NVDA", constituent_name: "NVIDIA Corp", weight_pct: 3.7, sector: "semiconductors", country: "USA" },
    { etf_ticker: "VWCE", constituent_ticker: "AAPL", constituent_name: "Apple Inc", weight_pct: 4.2, sector: "technology", country: "USA" },
  ];

  const metaByTicker = new Map([
    ["VWCE", { ticker: "VWCE", is_etf: true }],
    ["NVDA", { ticker: "NVDA", sector: "semiconductors", country: "USA" }],
    ["AAPL", { ticker: "AAPL", sector: "technology", country: "USA" }],
  ]);

  const total = 36_100;

  it("combines direct NVDA holding with indirect exposure via VWCE", () => {
    const exposures = computeTickerExposure(holdings, constituents, metaByTicker, total);
    const nvda = exposures.find((e) => e.ticker === "NVDA")!;

    const expectedIndirect = 32_000 * 0.037;
    expect(nvda.directValue).toBeCloseTo(4_100, 2);
    expect(nvda.indirectValue).toBeCloseTo(expectedIndirect, 2);
    expect(nvda.totalValue).toBeCloseTo(4_100 + expectedIndirect, 2);
    expect(nvda.totalPct).toBeCloseTo(((4_100 + expectedIndirect) / total) * 100, 2);
    expect(nvda.sourceEtfs).toContain("VWCE");
  });

  it("reports AAPL as purely indirect exposure (no direct holding)", () => {
    const exposures = computeTickerExposure(holdings, constituents, metaByTicker, total);
    const aapl = exposures.find((e) => e.ticker === "AAPL")!;
    expect(aapl.directValue).toBe(0);
    expect(aapl.indirectValue).toBeCloseTo(32_000 * 0.042, 2);
  });

  it("aggregates sector exposure and flags when over the configured limit", () => {
    const exposures = computeTickerExposure(holdings, constituents, metaByTicker, total);
    const sectors = computeSectorExposure(exposures, metaByTicker, total);
    const semis = sectors.find((s) => s.key === "semiconductors")!;
    // Direct NVDA (4100) + indirect NVDA via VWCE (32000*0.037) = ~5284
    expect(semis.totalValue).toBeCloseTo(4_100 + 32_000 * 0.037, 2);

    const alerts = computeExposureAlerts(sectors, [], { ...DEFAULT_RISK_LIMITS, single_sector_max: 5 });
    expect(alerts.some((a) => a.category === "sector")).toBe(true);
  });

  it("aggregates geography exposure using normalized country buckets and flags US overexposure", () => {
    const exposures = computeTickerExposure(holdings, constituents, metaByTicker, total);
    const geo = computeGeographyExposure(exposures, metaByTicker, total);
    const usa = geo.find((g) => g.key === "USA")!;
    expect(usa.totalPct).toBeGreaterThan(0);

    const alerts = computeExposureAlerts([], geo, { ...DEFAULT_RISK_LIMITS, us_exposure_max: 10 });
    expect(alerts.some((a) => a.category === "geography")).toBe(true);
  });
});
