import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/auth";
import { loadPortfolioData } from "@/lib/portfolio";
import { createClient } from "@/lib/supabase/server";
import { getPriceProvider } from "@/lib/marketdata/provider";

// Refreshes current_value for the user's holdings from live market data.
// Best-effort throughout: tickers that fail to price are skipped and the
// existing value is left untouched, never crashing the whole refresh.
export async function POST() {
  const user = await requireUser();
  const data = await loadPortfolioData(user.id);
  const supabase = await createClient();

  if (!data.portfolioId || data.holdings.length === 0) {
    return NextResponse.json({ updated: 0, skipped: [], message: "No holdings to refresh." });
  }

  const tickers = Array.from(new Set(data.holdings.map((h) => h.ticker.toUpperCase())));

  // Optional per-ticker Yahoo symbol overrides from asset_metadata.
  const { data: metaRows } = await supabase
    .from("asset_metadata")
    .select("ticker, yahoo_symbol")
    .in("ticker", tickers);
  const overrides: Record<string, string | null> = {};
  for (const row of metaRows ?? []) {
    overrides[row.ticker] = row.yahoo_symbol ?? null;
  }

  const provider = getPriceProvider(process.env.MARKETDATA_USE_MOCK === "true");
  let quotes: Awaited<ReturnType<typeof provider.fetchQuotes>> = [];
  try {
    quotes = await provider.fetchQuotes(tickers, overrides);
  } catch {
    quotes = [];
  }

  const quoteByTicker = new Map(quotes.map((q) => [q.ticker.toUpperCase(), q]));
  const updated: string[] = [];
  const skipped: string[] = [];
  const now = new Date().toISOString();

  for (const holding of data.holdings) {
    const quote = quoteByTicker.get(holding.ticker.toUpperCase());
    if (!quote) {
      skipped.push(holding.ticker);
      continue;
    }
    const newValue = quote.price * (holding.quantity ?? 0);
    if (!Number.isFinite(newValue) || newValue <= 0) {
      skipped.push(holding.ticker);
      continue;
    }
    const { error } = await supabase
      .from("holdings")
      .update({ current_value: newValue, last_price_updated_at: now })
      .eq("id", holding.id);
    if (error) {
      skipped.push(holding.ticker);
    } else {
      updated.push(holding.ticker);
    }
  }

  return NextResponse.json({ updated: updated.length, updatedTickers: updated, skipped, asOf: now });
}
