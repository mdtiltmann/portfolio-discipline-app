import type { Config } from "@netlify/functions";
import { fetchCandles, generateMockCandles } from "../../src/lib/marketdata/provider";
import { toYahooSymbol } from "../../src/lib/marketdata/symbolMap";
import { computeTechnicalSummary, verdictFromRatio, DEFAULT_VERDICT_THRESHOLDS } from "../../src/lib/technicals";
import { applyNewsNudge } from "../../src/lib/technicals/newsNudge";
import { getNewsProvider } from "../../src/lib/news/provider";
import { classifyNewsItem } from "../../src/lib/news/classify";
import { sendPushToUser, createServiceRoleClient } from "../../src/lib/push/send";

// Daily digest: for every user with holdings, recomputes the news-adjusted
// technical verdict for each ticker and sends ONE push notification per
// user summarizing which of their holdings currently look like a Buy and
// which look like a Sell — three times a day, at fixed times.
//
// Cadence: 09:00 / 15:00 / 19:00 CET, requested as those exact wall-clock
// times. Netlify cron runs in UTC with no DST awareness, so this is pinned
// to the CURRENT Central European offset (CEST = UTC+2, in effect roughly
// late March-late October). During CET (UTC+1, winter), these will fire an
// hour later on the clock (10:00/16:00/20:00) until this cron is adjusted
// by -1 hour for the season. There is no automatic DST handling here.
export const config: Config = {
  schedule: "0 7,13,17 * * *",
};

type Verdict = "Strong Sell" | "Sell" | "Neutral" | "Buy" | "Strong Buy";

function isBuy(verdict: Verdict): boolean {
  return verdict === "Buy" || verdict === "Strong Buy";
}
function isSell(verdict: Verdict): boolean {
  return verdict === "Sell" || verdict === "Strong Sell";
}

async function computeEffectiveVerdict(ticker: string, yahooSymbol: string): Promise<Verdict> {
  let candles = await fetchCandles(yahooSymbol, "1d");
  if (candles.length < 30) candles = generateMockCandles(yahooSymbol);
  const { summary } = computeTechnicalSummary(candles, DEFAULT_VERDICT_THRESHOLDS);
  const total = summary.buy + summary.sell + summary.neutral;
  const baseRatio = total > 0 ? (summary.buy - summary.sell) / total : 0;

  try {
    const newsItems = await getNewsProvider().fetchNews([yahooSymbol]);
    const classified = await Promise.all(
      newsItems.map(async (item) => classifyNewsItem(item.headline, item.summary))
    );
    const { adjustedRatio } = applyNewsNudge(baseRatio, classified);
    return verdictFromRatio(adjustedRatio, DEFAULT_VERDICT_THRESHOLDS);
  } catch {
    // News unavailable — fall back to the pure-technical verdict.
    return summary.verdict as Verdict;
  }
}

const handler = async () => {
  const supabase = createServiceRoleClient();

  const { data: holdingsRows, error } = await supabase
    .from("holdings")
    .select("ticker, portfolio_id, portfolios(user_id)");

  if (error) {
    console.error("check-signals: failed to load holdings:", error.message);
    return;
  }

  // Group tickers per user.
  const tickersByUser = new Map<string, Set<string>>();
  for (const row of (holdingsRows ?? []) as Array<{
    ticker: string;
    portfolios: { user_id: string } | { user_id: string }[] | null;
  }>) {
    const portfolio = Array.isArray(row.portfolios) ? row.portfolios[0] : row.portfolios;
    const userId = portfolio?.user_id;
    const ticker = row.ticker?.toUpperCase();
    if (!userId || !ticker) continue;
    if (!tickersByUser.has(userId)) tickersByUser.set(userId, new Set());
    tickersByUser.get(userId)!.add(ticker);
  }

  if (tickersByUser.size === 0) return;

  const tickers = Array.from(new Set(Array.from(tickersByUser.values()).flatMap((s) => Array.from(s))));
  const { data: metaRows } = await supabase
    .from("asset_metadata")
    .select("ticker, yahoo_symbol")
    .in("ticker", tickers);
  const overrideByTicker = new Map((metaRows ?? []).map((r) => [r.ticker.toUpperCase(), r.yahoo_symbol]));

  // Compute each ticker's verdict once (shared across users who hold it),
  // then assemble per-user digests. This digest model sends a fixed-time
  // summary regardless of whether the verdict changed, so signal_state
  // (originally used to gate hourly change-only alerts) is no longer
  // written here.
  const verdictByTicker = new Map<string, Verdict>();
  for (const ticker of tickers) {
    try {
      const symbol = toYahooSymbol(ticker, overrideByTicker.get(ticker));
      const verdict = await computeEffectiveVerdict(ticker, symbol);
      verdictByTicker.set(ticker, verdict);
    } catch (err) {
      console.error(`check-signals: failed to compute verdict for ${ticker}:`, err);
    }
  }

  for (const [userId, tickerSet] of tickersByUser.entries()) {
    try {
      const buys: string[] = [];
      const sells: string[] = [];
      for (const ticker of tickerSet) {
        const verdict = verdictByTicker.get(ticker);
        if (!verdict) continue;
        if (isBuy(verdict)) buys.push(ticker);
        else if (isSell(verdict)) sells.push(ticker);
      }

      const title =
        buys.length === 0 && sells.length === 0
          ? "Signal check-in: nothing actionable"
          : `Signal check-in: ${buys.length} buy, ${sells.length} sell`;
      const bodyParts: string[] = [];
      if (buys.length > 0) bodyParts.push(`Buy: ${buys.join(", ")}`);
      if (sells.length > 0) bodyParts.push(`Sell: ${sells.join(", ")}`);
      const body =
        bodyParts.length > 0
          ? bodyParts.join(" · ")
          : "All your holdings are currently Neutral or Hold territory.";

      await sendPushToUser(
        userId,
        { title, body, ticker: "DIGEST", verdict: buys.length > sells.length ? "Buy" : sells.length > 0 ? "Sell" : "Neutral" },
        supabase
      );
    } catch (err) {
      console.error(`check-signals: failed to notify user=${userId}:`, err);
    }
  }
};

export default handler;
