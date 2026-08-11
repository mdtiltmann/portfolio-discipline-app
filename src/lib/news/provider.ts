// News provider abstraction. Screens/routes depend on this interface, not on
// any specific data source, so the backing provider can be swapped out.

export interface RawNewsItem {
  ticker: string;
  headline: string;
  source: string | null;
  url: string | null;
  publishedAt: string | null; // ISO datetime
  summary: string | null;
}

export interface NewsProvider {
  fetchNews(tickers: string[]): Promise<RawNewsItem[]>;
}

// Minimal RSS <item> field extraction without a full XML parser dependency.
function extractTag(block: string, tag: string): string | null {
  const match = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  if (!match) return null;
  return match[1]
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, "")
    .trim();
}

/**
 * Best-effort Yahoo Finance RSS provider. Network/parse failures degrade to
 * an empty array for that ticker rather than throwing — callers should never
 * crash because a news feed is unreachable.
 */
export class YahooFinanceProvider implements NewsProvider {
  async fetchNews(tickers: string[]): Promise<RawNewsItem[]> {
    const results: RawNewsItem[] = [];

    await Promise.all(
      tickers.map(async (ticker) => {
        try {
          const url = `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${encodeURIComponent(ticker)}&region=US&lang=en-US`;
          const res = await fetch(url, {
            headers: { "User-Agent": "Mozilla/5.0 (compatible; PortfolioDiscipline/1.0)" },
            // Best-effort; don't let a slow feed hang the request indefinitely.
            signal: AbortSignal.timeout(8000),
          });
          if (!res.ok) return;
          const xml = await res.text();
          const items = xml.match(/<item>[\s\S]*?<\/item>/g) ?? [];
          for (const block of items.slice(0, 8)) {
            const headline = extractTag(block, "title");
            if (!headline) continue;
            results.push({
              ticker,
              headline,
              source: "Yahoo Finance",
              url: extractTag(block, "link"),
              publishedAt: parseRssDate(extractTag(block, "pubDate")),
              summary: extractTag(block, "description"),
            });
          }
        } catch {
          // Network error, timeout, or malformed feed — skip this ticker silently.
        }
      })
    );

    return results;
  }
}

function parseRssDate(raw: string | null): string | null {
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Deterministic mock provider for dev/testing/fallback when live feeds are unavailable. */
export class MockNewsProvider implements NewsProvider {
  async fetchNews(tickers: string[]): Promise<RawNewsItem[]> {
    const now = new Date();
    return tickers.map((ticker, i) => ({
      ticker,
      headline: `${ticker}: quarterly update and analyst commentary`,
      source: "Mock Feed",
      url: null,
      publishedAt: new Date(now.getTime() - i * 3_600_000).toISOString(),
      summary: `Placeholder summary for ${ticker} — no live feed available in this environment.`,
    }));
  }
}

/** Picks Yahoo in normal operation; falls back to the mock provider only when explicitly requested. */
export function getNewsProvider(useMock = false): NewsProvider {
  return useMock ? new MockNewsProvider() : new YahooFinanceProvider();
}
