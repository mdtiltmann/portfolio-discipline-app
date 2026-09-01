// Market-data provider abstraction, analogous to src/lib/news/provider.ts.
// This is best-effort price data for a personal dashboard, not a trading
// system: per-ticker failures are swallowed and simply omitted from the
// result rather than failing the whole batch.

import { toYahooSymbol } from "./symbolMap";
import type { Candle } from "@/lib/technicals/types";

// Yahoo quotes some London-listed securities in pence (minor currency
// units) rather than pounds — the `meta.currency` field comes back as
// "GBp" (or occasionally "GBX"), NOT "GBP". Every price/candle value in
// that response is 1/100 of the actual pound value. Without normalizing
// this, anything downstream that multiplies price by share quantity (gain
// %, portfolio value) is inflated ~100x for those tickers — this is a real
// bug that was caught from a user-reported gain % that was wildly wrong
// (~9000% instead of ~5%) for a GBp-denominated ETF.
const PENCE_CURRENCIES = new Set(["GBp", "GBX"]);

export function normalizePriceUnit(value: number, currency: string | undefined): number {
  if (currency && PENCE_CURRENCIES.has(currency)) return value / 100;
  return value;
}

// This app's values (cost basis, portfolio totals) are entered/tracked in
// EUR. Yahoo returns each instrument's price in ITS OWN listing currency
// (USD for US stocks, GBP for LSE, CHF for Swiss, etc) with no conversion —
// without converting to EUR here, comparing a USD or GBP price against a
// EUR cost basis silently produces a wrong gain/loss (a real bug found via
// a user-reported IITU gain of -9.96% instead of the correct +5.05%: the
// GBP price was being treated as if it were already EUR).
export const BASE_CURRENCY = "EUR";

/**
 * Fetches how many BASE_CURRENCY units one unit of `currency` is worth,
 * via Yahoo's FX pair quote convention ("GBPEUR=X" etc). Returns 1 (no
 * conversion) for the base currency itself, an unknown/missing currency, or
 * on any fetch failure — best-effort, never throws, this is a personal
 * dashboard not a trading system.
 */
export async function getFxRate(currency: string | undefined): Promise<number> {
  if (!currency || currency === BASE_CURRENCY) return 1;
  try {
    const symbol = `${currency}${BASE_CURRENCY}=X`;
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`,
      {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; PortfolioDiscipline/1.0)" },
        signal: AbortSignal.timeout(6000),
      }
    );
    if (!res.ok) return 1;
    const json = await res.json();
    const rate = json?.chart?.result?.[0]?.meta?.regularMarketPrice;
    return typeof rate === "number" && Number.isFinite(rate) && rate > 0 ? rate : 1;
  } catch {
    return 1;
  }
}

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
          const rawPrice = result?.meta?.regularMarketPrice;
          const currency = result?.meta?.currency;
          if (typeof rawPrice !== "number" || !Number.isFinite(rawPrice)) return;
          // Normalize pence-denominated LSE quotes to pounds, then convert
          // to this app's base currency (EUR) so the returned price is
          // directly comparable to a cost basis/portfolio value without
          // the caller needing to know or handle the original currency.
          const normalizedCurrency =
            typeof currency === "string" && PENCE_CURRENCIES.has(currency) ? "GBP" : currency;
          const majorUnitPrice = normalizePriceUnit(rawPrice, typeof currency === "string" ? currency : undefined);
          const fxRate = await getFxRate(typeof normalizedCurrency === "string" ? normalizedCurrency : undefined);
          const price = majorUnitPrice * fxRate;
          results.push({
            ticker,
            price,
            currency: BASE_CURRENCY,
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

// ---- Historical OHLC candles (for the technical-analysis engine) ----

/** UI timeframe tab values. */
export type TimeframeInterval =
  | "1m"
  | "5m"
  | "15m"
  | "30m"
  | "1h"
  | "2h"
  | "4h"
  | "1d"
  | "1wk"
  | "1mo";

/**
 * Maps our UI timeframe tabs to Yahoo's `interval`/`range` query params.
 * Intraday intervals only have a short history window on Yahoo, so we
 * request a short range for those; daily+ intervals request enough range
 * that a 200-period moving average is always computable (2y of daily bars
 * is 500+ trading days).
 *
 * Yahoo doesn't offer native 2h/4h candles, so those fall back to 60m/1d-ish
 * approximations at the closest supported interval (60m) with a wider range;
 * the aggregation engine still works fine on the resulting series, it's just
 * not literally 2h/4h bars.
 */
const TIMEFRAME_MAP: Record<TimeframeInterval, { interval: string; range: string }> = {
  "1m": { interval: "1m", range: "5d" },
  "5m": { interval: "5m", range: "5d" },
  "15m": { interval: "15m", range: "1mo" },
  "30m": { interval: "30m", range: "3mo" },
  "1h": { interval: "60m", range: "6mo" },
  "2h": { interval: "60m", range: "1y" },
  "4h": { interval: "60m", range: "1y" },
  "1d": { interval: "1d", range: "2y" },
  "1wk": { interval: "1wk", range: "5y" },
  "1mo": { interval: "1mo", range: "10y" },
};

export function resolveTimeframe(tf: string): { interval: string; range: string } {
  return TIMEFRAME_MAP[tf as TimeframeInterval] ?? TIMEFRAME_MAP["1d"];
}

/**
 * Fetches OHLC candle history for a single Yahoo symbol. Never throws:
 * on any failure (network, malformed response, unknown symbol) it returns
 * an empty array so a single bad ticker never breaks a batch of requests.
 */
export async function fetchCandles(
  ticker: string,
  timeframe: string,
  override?: string | null
): Promise<Candle[]> {
  const symbol = toYahooSymbol(ticker, override);
  const { interval, range } = resolveTimeframe(timeframe);
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
      symbol
    )}?interval=${interval}&range=${range}`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; PortfolioDiscipline/1.0)" },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return [];
    const json = await res.json();
    const result = json?.chart?.result?.[0];
    if (!result) return [];
    const rawCurrency: string | undefined = result?.meta?.currency;
    const currency = rawCurrency && PENCE_CURRENCIES.has(rawCurrency) ? "GBP" : rawCurrency;
    // One FX lookup per fetchCandles call (not per candle) — converts the
    // whole series to this app's base currency (EUR) in one multiply below.
    // Note: this uses TODAY's FX rate applied uniformly across the whole
    // history, so older candles are approximately, not exactly, converted
    // at the rate that applied on that historical date. That's fine for
    // technical-indicator math (scale-invariant, see indicators.ts) but
    // means don't treat historical candle values as precise EUR amounts.
    const fxRate = await getFxRate(currency);
    const timestamps: number[] = result.timestamp ?? [];
    const quote = result.indicators?.quote?.[0] ?? {};
    const opens: (number | null)[] = quote.open ?? [];
    const highs: (number | null)[] = quote.high ?? [];
    const lows: (number | null)[] = quote.low ?? [];
    const closes: (number | null)[] = quote.close ?? [];
    const volumes: (number | null)[] = quote.volume ?? [];

    const candles: Candle[] = [];
    for (let i = 0; i < timestamps.length; i++) {
      const open = opens[i];
      const high = highs[i];
      const low = lows[i];
      const close = closes[i];
      if (open == null || high == null || low == null || close == null) continue;
      // Normalize pence-denominated LSE quotes to pounds, then convert to
      // EUR — see normalizePriceUnit's and getFxRate's comments above.
      candles.push({
        time: timestamps[i],
        open: normalizePriceUnit(open, rawCurrency) * fxRate,
        high: normalizePriceUnit(high, rawCurrency) * fxRate,
        low: normalizePriceUnit(low, rawCurrency) * fxRate,
        close: normalizePriceUnit(close, rawCurrency) * fxRate,
        volume: volumes[i] ?? 0,
      });
    }
    return candles;
  } catch {
    // Network error, timeout, unknown symbol, or malformed response.
    return [];
  }
}

/**
 * Deterministic synthetic candle generator used as a fallback for local dev
 * or when Yahoo is unreachable. Produces a gently oscillating-but-trending
 * series so the technicals engine has plausible, non-degenerate input.
 */
export function generateMockCandles(ticker: string, count = 300): Candle[] {
  let seed = 0;
  for (let i = 0; i < ticker.length; i++) seed = (seed * 31 + ticker.charCodeAt(i)) % 100000;
  const basePrice = 50 + (seed % 200);
  const now = Math.floor(Date.now() / 1000);
  const dayInSeconds = 86400;

  const candles: Candle[] = [];
  let price = basePrice;
  for (let i = 0; i < count; i++) {
    // Deterministic pseudo-random walk with a slight upward drift.
    const pseudoRandom = Math.sin(seed + i * 12.9898) * 43758.5453;
    const noise = (pseudoRandom - Math.floor(pseudoRandom) - 0.5) * 2; // [-1, 1]
    const drift = 0.02;
    price = Math.max(0.5, price * (1 + drift / 100 + (noise * 1.2) / 100));
    const open = price * (1 - noise * 0.002);
    const high = Math.max(open, price) * (1 + Math.abs(noise) * 0.003);
    const low = Math.min(open, price) * (1 - Math.abs(noise) * 0.003);
    candles.push({
      time: now - (count - i) * dayInSeconds,
      open,
      high,
      low,
      close: price,
      volume: 100000 + Math.floor(Math.abs(noise) * 50000),
    });
  }
  return candles;
}
