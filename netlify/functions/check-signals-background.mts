import type { Config } from "@netlify/functions";
import { fetchCandles, generateMockCandles } from "../../src/lib/marketdata/provider";
import { computeTechnicalSummary, verdictFromRatio, DEFAULT_VERDICT_THRESHOLDS } from "../../src/lib/technicals";
import { applyNewsNudge } from "../../src/lib/technicals/newsNudge";
import { getNewsProvider } from "../../src/lib/news/provider";
import { classifyNewsItem } from "../../src/lib/news/classify";
import { sendPushToUser, createServiceRoleClient } from "../../src/lib/push/send";

// Periodic checker: for every user with holdings, recomputes the
// news-adjusted technical verdict per ticker and sends a push notification
// when it newly enters/changes within Buy or Sell territory.
//
// Uses the "-background" suffix (15-minute limit, no response body) since
// iterating candles+news across multiple users/tickers can take a while for
// a handful of holdings — comfortably safe under that limit, but a plain
// (non-background) function is capped at 30s which felt too tight to
// guarantee here.
//
// Cadence: @hourly by default. Change the `schedule` value below if you'd
// like a different interval — Netlify scheduled functions use standard cron
// syntax or the shorthand strings ("@hourly", "@daily", etc).
export const config: Config = {
  schedule: "@hourly",
};

type Verdict = "Strong Sell" | "Sell" | "Neutral" | "Buy" | "Strong Buy";

function isBuyOrSell(verdict: Verdict): boolean {
  return verdict === "Buy" || verdict === "Strong Buy" || verdict === "Sell" || verdict === "Strong Sell";
}

async function computeEffectiveVerdict(ticker: string): Promise<Verdict> {
  let candles = await fetchCandles(ticker, "1d");
  if (candles.length < 30) candles = generateMockCandles(ticker);
  const { summary } = computeTechnicalSummary(candles, DEFAULT_VERDICT_THRESHOLDS);
  const total = summary.buy + summary.sell + summary.neutral;
  const baseRatio = total > 0 ? (summary.buy - summary.sell) / total : 0;

  try {
    const newsItems = await getNewsProvider().fetchNews([ticker]);
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

  // Build a de-duplicated (user_id, ticker) worklist.
  const pairs = new Map<string, { userId: string; ticker: string }>();
  for (const row of (holdingsRows ?? []) as Array<{
    ticker: string;
    portfolios: { user_id: string } | { user_id: string }[] | null;
  }>) {
    const portfolio = Array.isArray(row.portfolios) ? row.portfolios[0] : row.portfolios;
    const userId = portfolio?.user_id;
    const ticker = row.ticker?.toUpperCase();
    if (!userId || !ticker) continue;
    pairs.set(`${userId}:${ticker}`, { userId, ticker });
  }

  for (const { userId, ticker } of pairs.values()) {
    try {
      const verdict = await computeEffectiveVerdict(ticker);

      const { data: stateRow } = await supabase
        .from("signal_state")
        .select("last_verdict, last_notified_verdict")
        .eq("user_id", userId)
        .eq("ticker", ticker)
        .maybeSingle();

      // Reset the notification gate whenever the verdict is NOT currently
      // Buy/Sell territory, so a later re-entry into Buy or Sell notifies
      // again even if it's the same verdict as before (e.g. Buy -> Neutral
      // -> Buy should notify twice, not just once ever).
      const nextNotifiedGate = isBuyOrSell(verdict) ? stateRow?.last_notified_verdict ?? null : null;

      await supabase.from("signal_state").upsert(
        {
          user_id: userId,
          ticker,
          last_verdict: verdict,
          last_notified_verdict: nextNotifiedGate,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,ticker" }
      );

      if (isBuyOrSell(verdict) && verdict !== stateRow?.last_notified_verdict) {
        const previous = stateRow?.last_verdict ?? "Neutral";
        await sendPushToUser(
          userId,
          {
            title: `${ticker}: ${verdict} signal`,
            body: `Technical + news signal moved to ${verdict} (was ${previous}).`,
            ticker,
            verdict,
          },
          supabase
        );
        await supabase
          .from("signal_state")
          .update({ last_notified_verdict: verdict })
          .eq("user_id", userId)
          .eq("ticker", ticker);
      }
    } catch (err) {
      console.error(`check-signals: failed for user=${userId} ticker=${ticker}:`, err);
    }
  }
};

export default handler;
