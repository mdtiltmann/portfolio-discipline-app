import type { AssetClass, AssetRule } from "./types";

// Hardcoded defaults per spec. Anything not listed defaults to individual_stock.
const DEFAULT_TICKER_CLASS: Record<string, AssetClass> = {
  VWCE: "broad_core_etf",
  WSML: "broad_core_etf",
  EMIM: "broad_core_etf",
  IITU: "sector_etf",
  SGLN: "defensive",
  ERNE: "cash",
};

/**
 * Classify an asset by ticker, honoring user-defined overrides (asset_rules
 * rows with a specific ticker) over the hardcoded defaults.
 */
export function classifyAsset(
  ticker: string,
  overrides?: AssetRule[] | null
): AssetClass {
  const upper = ticker.toUpperCase();

  const tickerOverride = overrides?.find(
    (r) => r.ticker && r.ticker.toUpperCase() === upper
  );
  if (tickerOverride) return tickerOverride.asset_class;

  return DEFAULT_TICKER_CLASS[upper] ?? "individual_stock";
}

export { DEFAULT_TICKER_CLASS };
