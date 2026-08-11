// Pure ticker -> Yahoo Finance symbol mapping. Kept separate from the
// provider so it can be unit tested without any network access.
//
// European UCITS ETFs generally need an exchange suffix on Yahoo (e.g.
// ".DE" for XETRA, ".L" for London, ".AS" for Amsterdam). We keep an
// explicit override table for the tickers this app cares about, and fall
// back to a "default guess" (append ".L", since most of this portfolio's
// European ETFs are London-listed) for anything unmapped.

export const DEFAULT_YAHOO_SYMBOL_OVERRIDES: Record<string, string> = {
  VWCE: "VWCE.DE",
  WSML: "WSML.L",
  EMIM: "EMIM.L",
  IITU: "IITU.L",
  SGLN: "SGLN.L",
};

/**
 * Resolves the Yahoo Finance symbol to query for a given portfolio ticker.
 * Priority: explicit per-holding override (e.g. from asset_metadata.yahoo_symbol)
 * > built-in override table > default guess (ticker + ".L").
 *
 * US-listed tickers (plain equities, no known override) are assumed to
 * already be valid Yahoo symbols and are returned unchanged.
 */
export function toYahooSymbol(
  ticker: string,
  override?: string | null,
  overrides: Record<string, string> = DEFAULT_YAHOO_SYMBOL_OVERRIDES
): string {
  const t = ticker.trim().toUpperCase();
  if (override && override.trim().length > 0) return override.trim();
  if (overrides[t]) return overrides[t];
  return t;
}

/** True for tickers we treat as European UCITS ETFs needing an exchange suffix guess. */
export function isKnownEuropeanEtf(ticker: string): boolean {
  return ticker.trim().toUpperCase() in DEFAULT_YAHOO_SYMBOL_OVERRIDES;
}
