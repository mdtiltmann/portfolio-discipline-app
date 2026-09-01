import type { Config } from "@netlify/functions";
import { fetchCandles, generateMockCandles } from "../../src/lib/marketdata/provider";
import { toYahooSymbol } from "../../src/lib/marketdata/symbolMap";
import { computeTechnicalSummary, verdictFromRatio, DEFAULT_VERDICT_THRESHOLDS } from "../../src/lib/technicals";
import { applyNewsNudge, MAX_NEWS_NUDGE } from "../../src/lib/technicals/newsNudge";
import { computeGainNudge } from "../../src/lib/technicals/gainNudge";
import { getNewsProvider } from "../../src/lib/news/provider";
import { classifyNewsItem } from "../../src/lib/news/classify";
import { sendPushToUser, createServiceRoleClient } from "../../src/lib/push/send";

// Daily digest: for every user with holdings, recomputes each ticker's
// personalized verdict (technicals + news + that user's own unrealized
// gain/loss vs cost basis) and sends ONE push notification per user
// summarizing which of their holdings currently look like a Buy and which
// look like a Sell — three times a day, at fixed times.
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

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

interface TickerBase {
  baseRatio: number;
  newsNudgeApplied: number;
  lastPrice: number | null;
}

// Market-wide part (technicals + news) is the same for every user holding a
// given ticker, so it's computed once per ticker and reused. The gain nudge
// is NOT shared — it depends on each user's own cost basis and quantity for
// that holding — and is applied per (user, ticker) below.
async function computeTickerBase(yahooSymbol: string): Promise<TickerBase> {
  let candles = await fetchCandles(yahooSymbol, "1d");
  if (candles.length < 30) candles = generateMockCandles(yahooSymbol);
  const { summary } = computeTechnicalSummary(candles, DEFAULT_VERDICT_THRESHOLDS);
  const total = summary.buy + summary.sell + summary.neutral;
  const baseRatio = total > 0 ? (summary.buy - summary.sell) / total : 0;
  const lastPrice = candles.length > 0 ? candles[candles.length - 1].close : null;

  try {
    const newsItems = await getNewsProvider().fetchNews([yahooSymbol]);
    const classified = await Promise.all(
      newsItems.map(async (item) => classifyNewsItem(item.headline, item.summary))
    );
    const { nudgeApplied } = applyNewsNudge(baseRatio, classified);
    return { baseRatio, newsNudgeApplied: nudgeApplied, lastPrice };
  } catch {
    return { baseRatio, newsNudgeApplied: 0, lastPrice };
  }
}

const handler = async () => {
  const supabase = createServiceRoleClient();

  const { data: holdingsRows, error } = await supabase
    .from("holdings")
    .select("ticker, cost_basis, quantity, current_value, portfolio_id, portfolios(user_id)");

  if (error) {
    console.error("check-signals: failed to load holdings:", error.message);
    return;
  }

  type HoldingRow = {
    ticker: string;
    cost_basis: number | null;
    quantity: number | null;
    current_value: number | null;
    portfolios: { user_id: string } | { user_id: string }[] | null;
  };

  // Group holdings per user, keeping each holding's own cost basis/quantity
  // for the gain nudge.
  const holdingsByUser = new Map<string, Array<{ ticker: string; cost_basis: number | null; quantity: number | null; current_value: number | null }>>();
  for (const row of (holdingsRows ?? []) as HoldingRow[]) {
    const portfolio = Array.isArray(row.portfolios) ? row.portfolios[0] : row.portfolios;
    const userId = portfolio?.user_id;
    const ticker = row.ticker?.toUpperCase();
    if (!userId || !ticker) continue;
    if (!holdingsByUser.has(userId)) holdingsByUser.set(userId, []);
    holdingsByUser.get(userId)!.push({
      ticker,
      cost_basis: row.cost_basis,
      quantity: row.quantity,
      current_value: row.current_value,
    });
  }

  if (holdingsByUser.size === 0) return;

  const tickers = Array.from(
    new Set(Array.from(holdingsByUser.values()).flatMap((rows) => rows.map((r) => r.ticker)))
  );
  const { data: metaRows } = await supabase
    .from("asset_metadata")
    .select("ticker, yahoo_symbol")
    .in("ticker", tickers);
  const overrideByTicker = new Map((metaRows ?? []).map((r) => [r.ticker.toUpperCase(), r.yahoo_symbol]));

  // Market-wide (technicals + news) computed once per ticker.
  const baseByTicker = new Map<string, TickerBase>();
  for (const ticker of tickers) {
    try {
      const symbol = toYahooSymbol(ticker, overrideByTicker.get(ticker));
      baseByTicker.set(ticker, await computeTickerBase(symbol));
    } catch (err) {
      console.error(`check-signals: failed to compute base signal for ${ticker}:`, err);
    }
  }

  for (const [userId, rows] of holdingsByUser.entries()) {
    try {
      const buys: string[] = [];
      const sells: string[] = [];
      for (const row of rows) {
        const base = baseByTicker.get(row.ticker);
        if (!base) continue;

        let gainPct: number | null = null;
        if (row.cost_basis != null && row.cost_basis > 0) {
          const liveValue =
            row.quantity != null && row.quantity > 0 && base.lastPrice != null
              ? row.quantity * base.lastPrice
              : row.current_value;
          if (liveValue != null) gainPct = ((liveValue - row.cost_basis) / row.cost_basis) * 100;
        }
        const { nudgeApplied: gainNudgeApplied } = computeGainNudge(gainPct);
        const combinedNudge = clamp(base.newsNudgeApplied + gainNudgeApplied, -MAX_NEWS_NUDGE, MAX_NEWS_NUDGE);
        const personalizedRatio = clamp(base.baseRatio + combinedNudge, -1, 1);
        const verdict = verdictFromRatio(personalizedRatio, DEFAULT_VERDICT_THRESHOLDS) as Verdict;

        if (isBuy(verdict)) buys.push(row.ticker);
        else if (isSell(verdict)) sells.push(row.ticker);
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
