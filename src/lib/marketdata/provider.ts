// Market-data provider abstraction, analogous to src/lib/news/provider.ts.
// This is best-effort price data for a personal dashboard, not a trading
// system: per-ticker failures are swallowed and simply omitted from the
// result rather than failing the whole batch.

import { toYahooSymbol } from "./symbolMap";

export interface Quote {
  ticker: string;
  price: number;
  currency: string;
  asOf: string; // ISO datetime
}

export interface PriceProvider {
  fetchQuotes(tickers: string[], overrides?: Record<string, string | null>): Promise<Quote[]>;
}

/**
 * Best-effort provider using Yahoo Finance's unofficial chart endpoint.
 * Each ticker is fetched independently so one failing/delisted/renamed
 * symbol never blocks the rest of the batch.
 */
export class YahooFinanceQuoteProvider implements PriceProvider {
  async fetchQuotes(tickers: string[], overrides: Record<string, string | null> = {}): Promise<Quote[]> {
    const results: Quote[] = [];

    await Promise.all(
      tickers.map(async (ticker) => {
        const symbol = toYahooSymbol(ticker, overrides[ticker]);
        try {
          const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`;
          const res = await fetch(url, {
            headers: { "User-Agent": "Mozilla/5.0 (compatible; PortfolioDiscipline/1.0)" },
            signal: AbortSignal.timeout(8000),
          });
          if (!res.ok) return;
          const json = await res.json();
          const result = json?.chart?.result?.[0];
          const price = result?.meta?.regularMarketPrice;
          const currency = result?.meta?.currency;
          if (typeof price !== "number" || !Number.isFinite(price)) return;
          results.push({
            ticker,
            price,
            currency: typeof currency === "string" ? currency : "EUR",
            asOf: new Date().toISOString(),
          });
        } catch {
          // Network error, timeout, unknown symbol, or malformed response — skip this ticker.
        }
      })
    );

    return results;
  }
}

/** Deterministic mock provider for dev/testing/fallback when live quotes are unavailable. */
export class MockPriceProvider implements PriceProvider {
  async fetchQuotes(tickers: string[]): Promise<Quote[]> {
    const now = new Date().toISOString();
    return tickers.map((ticker, i) => ({
      ticker,
      price: 100 + i,
      currency: "EUR",
      asOf: now,
    }));
  }
}

/** Picks Yahoo in normal operation; falls back to the mock provider only when explicitly requested. */
export function getPriceProvider(useMock = false): PriceProvider {
  return useMock ? new MockPriceProvider() : new YahooFinanceQuoteProvider();
}
