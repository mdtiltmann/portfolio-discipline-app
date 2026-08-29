import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/auth";
import { loadPortfolioData } from "@/lib/portfolio";
import { createClient } from "@/lib/supabase/server";
import { getNewsProvider } from "@/lib/news/provider";
import { classifyNewsItem } from "@/lib/news/classify";
import { toYahooSymbol } from "@/lib/marketdata/symbolMap";

// Refreshes news for the current user's held tickers: fetches raw items,
// classifies each, and upserts into news_items. Best-effort throughout —
// a provider/classification failure for one ticker never blocks the rest.
//
// Queries use the same Yahoo-symbol resolution as prices/technicals (ticker
// overrides for European UCITS ETFs, per-holding asset_metadata.yahoo_symbol
// overrides) instead of the bare portfolio ticker — without this, a ticker
// like "AIR" (Airbus SE) would silently pull news for the wrong company
// entirely (Yahoo resolves bare "AIR" to AAR Corp, a different NYSE stock).
export async function POST() {
  const user = await requireUser();
  const data = await loadPortfolioData(user.id);
  const supabase = await createClient();

  const tickers = Array.from(new Set(data.holdings.map((h) => h.ticker.toUpperCase())));
  if (tickers.length === 0) {
    return NextResponse.json({ inserted: 0, message: "No holdings to fetch news for." });
  }

  const { data: metaRows } = await supabase
    .from("asset_metadata")
    .select("ticker, yahoo_symbol")
    .in("ticker", tickers);
  const overrideByTicker = new Map((metaRows ?? []).map((r) => [r.ticker.toUpperCase(), r.yahoo_symbol]));

  // Query symbols may collide with the resolved ticker itself for plain US
  // equities, so track yahooSymbol -> original portfolio ticker(s) to map
  // results back correctly.
  const symbolToTicker = new Map<string, string>();
  const querySymbols: string[] = [];
  for (const ticker of tickers) {
    const symbol = toYahooSymbol(ticker, overrideByTicker.get(ticker));
    symbolToTicker.set(symbol, ticker);
    querySymbols.push(symbol);
  }

  const provider = getNewsProvider(process.env.NEWS_USE_MOCK === "true");
  let rawItems: Awaited<ReturnType<typeof provider.fetchNews>> = [];
  try {
    rawItems = await provider.fetchNews(querySymbols);
  } catch {
    rawItems = [];
  }

  let inserted = 0;
  for (const item of rawItems) {
    const portfolioTicker = symbolToTicker.get(item.ticker.toUpperCase()) ?? item.ticker;
    try {
      const classification = await classifyNewsItem(item.headline, item.summary);
      const { error } = await supabase.from("news_items").upsert(
        {
          ticker: portfolioTicker,
          headline: item.headline,
          source: item.source,
          url: item.url,
          published_at: item.publishedAt,
          summary: item.summary,
          sentiment: classification.sentiment,
          materiality: classification.materiality,
        },
        { onConflict: "ticker,headline" }
      );
      if (!error) inserted += 1;
    } catch {
      // Skip this item on classification/insert failure, continue with the rest.
    }
  }

  return NextResponse.json({ inserted, fetched: rawItems.length, tickers, querySymbols });
}
