// Hidden / effective exposure engine.
//
// A "direct" holding (e.g. an individual NVDA position) contributes its full
// value to that ticker's exposure. A holding of an ETF (e.g. VWCE) also
// contributes indirectly to every constituent it holds, in proportion to the
// constituent's weight within that ETF. This module combines both so the
// user can see their TRUE combined exposure to a company/sector/geography,
// not just what shows up as a labelled line item in their holdings list.
//
// etf_constituents weights used to seed this feature are hand-entered,
// illustrative approximations of well-known index compositions (see the
// seed migration) — NOT live data from an index provider. Treat all
// indirect-exposure figures as directional awareness, not precise fact.

import type { Holding, RiskLimits, Alert } from "./types";

// Row shape mirrors public.etf_constituents.
export interface EtfConstituent {
  etf_ticker: string;
  constituent_ticker: string;
  constituent_name?: string | null;
  weight_pct: number; // 0-100
  sector?: string | null;
  country?: string | null;
}

// Row shape mirrors public.asset_metadata.
export interface AssetMeta {
  ticker: string;
  name?: string | null;
  sector?: string | null;
  country?: string | null;
  is_etf?: boolean | null;
}

export interface TickerExposure {
  ticker: string;
  name?: string | null;
  directValue: number;
  indirectValue: number;
  totalValue: number;
  directPct: number;
  indirectPct: number;
  totalPct: number;
  sourceEtfs: string[]; // ETFs contributing indirect exposure
}

export interface BucketExposure {
  key: string; // sector or geography key
  directValue: number;
  indirectValue: number;
  totalValue: number;
  directPct: number;
  indirectPct: number;
  totalPct: number;
}

const GEO_KEYS = ["USA", "Europe", "UK", "Japan", "Developed Asia", "Emerging Markets", "Other"] as const;

function normalizeCountry(country: string | null | undefined): string {
  if (!country) return "Other";
  const c = country.trim();
  const lower = c.toLowerCase();
  if (["usa", "us", "united states"].includes(lower)) return "USA";
  if (["uk", "united kingdom", "gb"].includes(lower)) return "UK";
  if (["japan", "jp"].includes(lower)) return "Japan";
  if (["europe", "eu", "eurozone", "germany", "france", "netherlands", "spain", "italy", "switzerland", "ireland", "sweden", "denmark", "belgium"].includes(lower))
    return "Europe";
  if (["china", "india", "taiwan", "south korea", "korea", "emerging markets", "em", "hong kong"].includes(lower)) return "Emerging Markets";
  if (["developed asia", "singapore", "australia", "new zealand"].includes(lower)) return "Developed Asia";
  return (GEO_KEYS as readonly string[]).includes(c) ? c : "Other";
}

function normalizeSector(sector: string | null | undefined): string {
  if (!sector) return "other";
  return sector.trim().toLowerCase();
}

/**
 * Compute true effective exposure per underlying company: direct holding
 * value + sum over each ETF holding of (ETF value * constituent weight%).
 * Works generically for any ticker present in etf_constituents.
 */
export function computeTickerExposure(
  holdings: Holding[],
  constituents: EtfConstituent[],
  metaByTicker: Map<string, AssetMeta>,
  totalPortfolioValue: number
): TickerExposure[] {
  const byTicker = new Map<string, TickerExposure>();

  function getEntry(ticker: string): TickerExposure {
    const upper = ticker.toUpperCase();
    let entry = byTicker.get(upper);
    if (!entry) {
      entry = {
        ticker: upper,
        name: metaByTicker.get(upper)?.name ?? null,
        directValue: 0,
        indirectValue: 0,
        totalValue: 0,
        directPct: 0,
        indirectPct: 0,
        totalPct: 0,
        sourceEtfs: [],
      };
      byTicker.set(upper, entry);
    }
    return entry;
  }

  // Direct exposure: every holding is direct exposure to itself.
  for (const h of holdings) {
    const entry = getEntry(h.ticker);
    entry.directValue += h.current_value ?? 0;
  }

  // Indirect exposure: for each holding that is itself an ETF with known
  // constituents, allocate (holding value * constituent weight%) to the
  // underlying constituent ticker.
  const constituentsByEtf = new Map<string, EtfConstituent[]>();
  for (const c of constituents) {
    const key = c.etf_ticker.toUpperCase();
    if (!constituentsByEtf.has(key)) constituentsByEtf.set(key, []);
    constituentsByEtf.get(key)!.push(c);
  }

  for (const h of holdings) {
    const rows = constituentsByEtf.get(h.ticker.toUpperCase());
    if (!rows) continue;
    for (const row of rows) {
      const entry = getEntry(row.constituent_ticker);
      if (!entry.name) entry.name = row.constituent_name ?? metaByTicker.get(row.constituent_ticker.toUpperCase())?.name ?? null;
      const indirectValue = (h.current_value ?? 0) * (row.weight_pct / 100);
      entry.indirectValue += indirectValue;
      if (!entry.sourceEtfs.includes(h.ticker.toUpperCase())) entry.sourceEtfs.push(h.ticker.toUpperCase());
    }
  }

  const results: TickerExposure[] = [];
  for (const entry of byTicker.values()) {
    entry.totalValue = entry.directValue + entry.indirectValue;
    entry.directPct = totalPortfolioValue > 0 ? (entry.directValue / totalPortfolioValue) * 100 : 0;
    entry.indirectPct = totalPortfolioValue > 0 ? (entry.indirectValue / totalPortfolioValue) * 100 : 0;
    entry.totalPct = totalPortfolioValue > 0 ? (entry.totalValue / totalPortfolioValue) * 100 : 0;
    if (entry.totalValue > 0) results.push(entry);
  }

  return results.sort((a, b) => b.totalValue - a.totalValue);
}

function classifyKey(ticker: string, metaByTicker: Map<string, AssetMeta>, dimension: "sector" | "country"): string {
  const meta = metaByTicker.get(ticker.toUpperCase());
  const raw = dimension === "sector" ? meta?.sector : meta?.country;
  return dimension === "sector" ? normalizeSector(raw) : normalizeCountry(raw);
}

function aggregateBuckets(
  tickerExposures: TickerExposure[],
  metaByTicker: Map<string, AssetMeta>,
  dimension: "sector" | "country",
  totalPortfolioValue: number
): BucketExposure[] {
  const buckets = new Map<string, BucketExposure>();

  function getBucket(key: string): BucketExposure {
    let b = buckets.get(key);
    if (!b) {
      b = { key, directValue: 0, indirectValue: 0, totalValue: 0, directPct: 0, indirectPct: 0, totalPct: 0 };
      buckets.set(key, b);
    }
    return b;
  }

  for (const te of tickerExposures) {
    const key = classifyKey(te.ticker, metaByTicker, dimension);
    const b = getBucket(key);
    b.directValue += te.directValue;
    b.indirectValue += te.indirectValue;
  }

  const results: BucketExposure[] = [];
  for (const b of buckets.values()) {
    b.totalValue = b.directValue + b.indirectValue;
    b.directPct = totalPortfolioValue > 0 ? (b.directValue / totalPortfolioValue) * 100 : 0;
    b.indirectPct = totalPortfolioValue > 0 ? (b.indirectValue / totalPortfolioValue) * 100 : 0;
    b.totalPct = totalPortfolioValue > 0 ? (b.totalValue / totalPortfolioValue) * 100 : 0;
    if (b.totalValue > 0) results.push(b);
  }
  return results.sort((a, b) => b.totalValue - a.totalValue);
}

export function computeSectorExposure(
  tickerExposures: TickerExposure[],
  metaByTicker: Map<string, AssetMeta>,
  totalPortfolioValue: number
): BucketExposure[] {
  return aggregateBuckets(tickerExposures, metaByTicker, "sector", totalPortfolioValue);
}

export function computeGeographyExposure(
  tickerExposures: TickerExposure[],
  metaByTicker: Map<string, AssetMeta>,
  totalPortfolioValue: number
): BucketExposure[] {
  return aggregateBuckets(tickerExposures, metaByTicker, "country", totalPortfolioValue);
}

/**
 * Flag sector/geography buckets that exceed risk_limits.single_sector_max /
 * risk_limits.us_exposure_max. Pure function over already-computed buckets.
 */
export function computeExposureAlerts(
  sectorExposure: BucketExposure[],
  geoExposure: BucketExposure[],
  limits: RiskLimits
): Alert[] {
  const alerts: Alert[] = [];

  for (const s of sectorExposure) {
    if (s.totalPct > limits.single_sector_max) {
      alerts.push({
        severity: "warning",
        category: "sector",
        message: `Sector "${s.key}" is ${s.totalPct.toFixed(1)}% of true exposure (direct + indirect via ETFs) — above the ${limits.single_sector_max}% limit.`,
      });
    }
  }

  const us = geoExposure.find((g) => g.key === "USA");
  if (us && us.totalPct > limits.us_exposure_max) {
    alerts.push({
      severity: "warning",
      category: "geography",
      message: `US exposure is ${us.totalPct.toFixed(1)}% of true exposure — above your ${limits.us_exposure_max}% target. New contributions should favour non-US assets.`,
    });
  }

  return alerts;
}
