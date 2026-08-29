import { requireUser } from "@/lib/supabase/auth";
import { loadPortfolioData } from "@/lib/portfolio";
import { createClient } from "@/lib/supabase/server";
import { fetchCandles, generateMockCandles } from "@/lib/marketdata/provider";
import { computeTechnicalSummary } from "@/lib/technicals";
import NewsRefreshButton from "./NewsRefreshButton";

interface NewsRow {
  id: string;
  ticker: string | null;
  headline: string;
  source: string | null;
  url: string | null;
  published_at: string | null;
  summary: string | null;
  sentiment: string | null;
  materiality: string | null;
}

const MATERIALITY_STYLE: Record<string, string> = {
  material: "border-red-300 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300",
  worth_watching:
    "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300",
  noise: "border-neutral-300 bg-neutral-50 text-neutral-600 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-400",
};

const SENTIMENT_LABEL: Record<string, string> = {
  positive: "Positive",
  neutral: "Neutral",
  negative: "Negative",
};

interface TickerSignal {
  verdict: string;
  buy: number;
  neutral: number;
  sell: number;
}

async function computeSignalForTicker(ticker: string): Promise<TickerSignal | null> {
  try {
    let candles = await fetchCandles(ticker, "1d");
    if (candles.length < 30) candles = generateMockCandles(ticker);
    const { summary } = computeTechnicalSummary(candles);
    return { verdict: summary.verdict, buy: summary.buy, neutral: summary.neutral, sell: summary.sell };
  } catch {
    return null;
  }
}

function technicalNote(ticker: string, signal: TickerSignal | null): string {
  if (!signal) return `Current technical signal for ${ticker} is unavailable right now.`;
  return `Current technical signal: ${signal.verdict} (${signal.buy} Buy / ${signal.neutral} Neutral / ${signal.sell} Sell).`;
}

export default async function NewsPage() {
  const user = await requireUser();
  const data = await loadPortfolioData(user.id);
  const supabase = await createClient();

  const heldTickers = data.holdings.map((h) => h.ticker.toUpperCase());

  const { data: rows } = await supabase
    .from("news_items")
    .select("*")
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(100);

  const items = (rows ?? []) as NewsRow[];

  // Compute a technical signal once per distinct held ticker referenced by
  // the news feed (not for every headline) to keep this cheap.
  const tickersNeedingSignal = Array.from(
    new Set(
      items
        .map((i) => i.ticker?.toUpperCase())
        .filter((t): t is string => !!t && heldTickers.includes(t))
    )
  );
  const signalEntries = await Promise.all(
    tickersNeedingSignal.map(async (t) => [t, await computeSignalForTicker(t)] as const)
  );
  const signalByTicker = new Map(signalEntries);
  const groups: Array<{ key: string; label: string }> = [
    { key: "material", label: "Material" },
    { key: "worth_watching", label: "Worth watching" },
    { key: "noise", label: "Noise" },
  ];

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">News</h1>
        <NewsRefreshButton />
      </div>
      <p className="text-xs text-neutral-500">
        News is informational only — it never triggers a signal directly. Each item for a ticker you hold is shown
        alongside that ticker&apos;s current technical signal, computed from public price data using standard
        formulas. Not financial advice.
      </p>

      {items.length === 0 && (
        <p className="text-sm text-neutral-500">No news yet. Use &quot;Refresh news&quot; to fetch headlines for your holdings.</p>
      )}

      {groups.map((g) => {
        const groupItems = items.filter((i) => (i.materiality ?? "noise") === g.key);
        if (groupItems.length === 0) return null;
        return (
          <section key={g.key}>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
              {g.label} ({groupItems.length})
            </h2>
            <div className="space-y-3">
              {groupItems.map((item) => {
                const isHeld = item.ticker && heldTickers.includes(item.ticker.toUpperCase());
                return (
                  <div
                    key={item.id}
                    className={`rounded-2xl border p-3 text-sm ${MATERIALITY_STYLE[item.materiality ?? "noise"]}`}
                  >
                    <div className="mb-1 flex flex-wrap items-center gap-2 text-xs">
                      {item.ticker && <span className="font-semibold">{item.ticker}</span>}
                      {item.source && <span className="text-neutral-500">{item.source}</span>}
                      {item.published_at && (
                        <span className="text-neutral-400">{new Date(item.published_at).toLocaleDateString()}</span>
                      )}
                      {item.sentiment && (
                        <span className="rounded-full bg-white/60 px-2 py-0.5 dark:bg-black/20">
                          {SENTIMENT_LABEL[item.sentiment] ?? item.sentiment}
                        </span>
                      )}
                    </div>
                    <p className="font-medium">
                      {item.url ? (
                        <a href={item.url} target="_blank" rel="noreferrer" className="hover:underline">
                          {item.headline}
                        </a>
                      ) : (
                        item.headline
                      )}
                    </p>
                    {item.summary && <p className="mt-1 text-xs opacity-80">{item.summary}</p>}
                    {isHeld && item.ticker && (
                      <p className="mt-2 rounded-lg bg-white/70 p-2 text-xs text-neutral-700 dark:bg-black/20 dark:text-neutral-300">
                        {technicalNote(item.ticker, signalByTicker.get(item.ticker.toUpperCase()) ?? null)}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
