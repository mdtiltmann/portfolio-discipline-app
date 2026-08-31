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

  // Track which (ticker, headline) pairs already existed before this run so
  // the response can honestly report how many headlines are actually NEW
  // versus just re-confirming what was already there — Yahoo's RSS feeds
  // often return the same recent items on back-to-back refreshes since a
  // given ticker doesn't get fresh coverage every few minutes, and without
  // this distinction a refresh that found nothing new looked identical to
  // a refresh that silently failed.
  const { data: existingRows } = await supabase
    .from("news_items")
    .select("ticker, headline")
    .in("ticker", tickers);
  const existingKeys = new Set((existingRows ?? []).map((r) => `${r.ticker}|${r.headline}`));

  let newCount = 0;
  let updatedCount = 0;
  let failedCount = 0;
  for (const item of rawItems) {
    const portfolioTicker = symbolToTicker.get(item.ticker.toUpperCase()) ?? item.ticker;
    const key = `${portfolioTicker}|${item.headline}`;
    const alreadyExisted = existingKeys.has(key);
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
      if (!error) {
        if (alreadyExisted) updatedCount += 1;
        else newCount += 1;
      } else {
        failedCount += 1;
      }
    } catch {
      failedCount += 1;
      // Skip this item on classification/insert failure, continue with the rest.
    }
  }

  const message =
    newCount > 0
      ? `Found ${rawItems.length} headline${rawItems.length === 1 ? "" : "s"} — ${newCount} new, ${updatedCount} already tracked.`
      : rawItems.length > 0
        ? `Checked ${rawItems.length} headline${rawItems.length === 1 ? "" : "s"} — no new ones since last refresh.`
        : "No headlines found for your holdings right now.";

  return NextResponse.json({
    inserted: newCount,
    updated: updatedCount,
    failed: failedCount,
    fetched: rawItems.length,
    tickers,
    querySymbols,
    message,
  });
}
