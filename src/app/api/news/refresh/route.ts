import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/auth";
import { loadPortfolioData } from "@/lib/portfolio";
import { createClient } from "@/lib/supabase/server";
import { getNewsProvider } from "@/lib/news/provider";
import { classifyNewsItem } from "@/lib/news/classify";

// Refreshes news for the current user's held tickers: fetches raw items,
// classifies each, and upserts into news_items. Best-effort throughout —
// a provider/classification failure for one ticker never blocks the rest.
export async function POST() {
  const user = await requireUser();
  const data = await loadPortfolioData(user.id);
  const supabase = await createClient();

  const tickers = Array.from(new Set(data.holdings.map((h) => h.ticker.toUpperCase())));
  if (tickers.length === 0) {
    return NextResponse.json({ inserted: 0, message: "No holdings to fetch news for." });
  }

  const provider = getNewsProvider(process.env.NEWS_USE_MOCK === "true");
  let rawItems: Awaited<ReturnType<typeof provider.fetchNews>> = [];
  try {
    rawItems = await provider.fetchNews(tickers);
  } catch {
    rawItems = [];
  }

  let inserted = 0;
  for (const item of rawItems) {
    try {
      const classification = await classifyNewsItem(item.headline, item.summary);
      const { error } = await supabase.from("news_items").upsert(
        {
          ticker: item.ticker,
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

  return NextResponse.json({ inserted, fetched: rawItems.length, tickers });
}
