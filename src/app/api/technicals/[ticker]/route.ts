import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { fetchCandles, generateMockCandles } from "@/lib/marketdata/provider";
import { toYahooSymbol } from "@/lib/marketdata/symbolMap";
import {
  computeTechnicalSummary,
  DEFAULT_VERDICT_THRESHOLDS,
  verdictFromRatio,
  buildTechnicalRationale,
  type VerdictThresholds,
} from "@/lib/technicals";
import { applyNewsNudge, MAX_NEWS_NUDGE } from "@/lib/technicals/newsNudge";
import { computeGainNudge } from "@/lib/technicals/gainNudge";
import { getNewsProvider } from "@/lib/news/provider";
import { classifyNewsItem } from "@/lib/news/classify";

// Best-effort: fetch + classify news for a ticker and compute the news-nudge
// inputs. Never allowed to block the technicals response for long — capped
// with a timeout so a slow feed degrades to "no news available" rather than
// stalling the whole gauge.
//
// Queries by the resolved Yahoo symbol, not the bare portfolio ticker — a
// bare ticker like "AIR" can resolve on Yahoo to an unrelated company (AAR
// Corp instead of Airbus SE / AIR.PA), which would otherwise pull in and
// quote the wrong company's headlines in the rationale below.
async function computeNewsAdjustment(yahooSymbol: string, baseRatio: number) {
  const items = await getNewsProvider().fetchNews([yahooSymbol]);
  const classified = await Promise.all(
    items.map(async (item) => ({
      ...item,
      ...(await classifyNewsItem(item.headline, item.summary)),
    }))
  );
  const { adjustedRatio, nudgeApplied } = applyNewsNudge(
    baseRatio,
    classified.map((c) => ({ sentiment: c.sentiment, materiality: c.materiality }))
  );
  const materialNews = classified
    .filter((c) => c.materiality === "material")
    .map((c) => ({ headline: c.headline, sentiment: c.sentiment }));
  return { adjustedRatio, nudgeApplied, materialNews };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

// Best-effort technicals endpoint for a single ticker: never throws a 5xx
// for a data problem, this is a personal dashboard, not a trading system.
// On failure we return 200 with an `error` field and empty-ish panels so
// the UI can render a "no data" state gracefully.
export async function GET(req: NextRequest, { params }: { params: Promise<{ ticker: string }> }) {
  const user = await requireUser();
  const { ticker: rawTicker } = await params;
  const ticker = decodeURIComponent(rawTicker).toUpperCase();
  const interval = req.nextUrl.searchParams.get("interval") ?? "1d";

  const emptyPanel = { buy: 0, sell: 0, neutral: 0, verdict: "Neutral" as const, indicators: [] };

  try {
    const supabase = await createClient();
    const [{ data: metaRows }, { data: settingsRow }, { data: holdingRow }] = await Promise.all([
      supabase.from("asset_metadata").select("yahoo_symbol").eq("ticker", ticker).maybeSingle(),
      supabase.from("settings").select("verdict_thresholds").eq("user_id", user.id).maybeSingle(),
      // RLS scopes holdings to the caller's own portfolio already.
      supabase.from("holdings").select("cost_basis, quantity, current_value").eq("ticker", ticker).maybeSingle(),
    ]);
    const override = metaRows?.yahoo_symbol ?? null;
    const thresholds: VerdictThresholds = settingsRow?.verdict_thresholds ?? DEFAULT_VERDICT_THRESHOLDS;
    const yahooSymbol = toYahooSymbol(ticker, override);

    let candles = await fetchCandles(ticker, interval, override);
    let usedMock = false;
    if (candles.length < 30) {
      // Not enough history from Yahoo (unknown symbol, delisted, rate
      // limited, etc) — fall back to deterministic synthetic candles so
      // the UI still has something informative to render in dev/offline.
      candles = generateMockCandles(ticker);
      usedMock = true;
    }

    const summary = computeTechnicalSummary(candles, thresholds);
    const lastPrice = candles.length > 0 ? candles[candles.length - 1].close : null;

    // Unrealized gain/loss vs cost basis — prefer live quantity*lastPrice
    // over the (possibly stale, only updated on manual price refresh)
    // stored current_value, when both a quantity and a live price exist.
    let gainPct: number | null = null;
    if (holdingRow?.cost_basis != null && holdingRow.cost_basis > 0) {
      const liveValue =
        holdingRow.quantity != null && holdingRow.quantity > 0 && lastPrice != null
          ? holdingRow.quantity * lastPrice
          : holdingRow.current_value;
      if (liveValue != null) {
        gainPct = ((liveValue - holdingRow.cost_basis) / holdingRow.cost_basis) * 100;
      }
    }

    // News-nudge and gain-nudge the Summary panel's verdict only
    // (Oscillators/Moving Averages panels stay pure-technical). News is
    // best-effort and time-boxed so a slow feed never holds up the gauge
    // for more than ~3s. Both nudges are "informational context, not a
    // dominant signal" — their COMBINED effect is capped at the same
    // magnitude as either alone, so technicals still dominate even when
    // news and unrealized gain both point the same way.
    const { summary: summaryPanel } = summary;
    const total = summaryPanel.buy + summaryPanel.sell + summaryPanel.neutral;
    const baseRatio = total > 0 ? (summaryPanel.buy - summaryPanel.sell) / total : 0;
    let newsNudgeApplied = 0;
    let materialNews: { headline: string; sentiment: "positive" | "neutral" | "negative" }[] = [];
    try {
      const adjustment = await Promise.race([
        computeNewsAdjustment(yahooSymbol, baseRatio),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000)),
      ]);
      if (adjustment) {
        newsNudgeApplied = adjustment.nudgeApplied;
        materialNews = adjustment.materialNews;
      }
    } catch {
      // News fetch/classification failed — treat as no news nudge.
    }

    const { nudgeApplied: gainNudgeApplied } = computeGainNudge(gainPct);
    const combinedNudge = clamp(newsNudgeApplied + gainNudgeApplied, -MAX_NEWS_NUDGE, MAX_NEWS_NUDGE);
    const personalizedRatio = clamp(baseRatio + combinedNudge, -1, 1);
    const personalizedVerdict = verdictFromRatio(personalizedRatio, thresholds);

    const summaryWithAdjustments = {
      ...summaryPanel,
      // Kept for back-compat with anything reading the news-only figure.
      newsAdjustedVerdict: verdictFromRatio(clamp(baseRatio + newsNudgeApplied, -1, 1), thresholds),
      newsNudgeApplied,
      gainNudgeApplied,
      personalizedVerdict,
    };

    const rationale = buildTechnicalRationale({
      ticker,
      movingAverages: summary.movingAverages,
      oscillators: summary.oscillators,
      technicalVerdict: summaryPanel.verdict,
      personalizedVerdict,
      newsNudgeApplied,
      gainNudgeApplied,
      materialNews,
      lastPrice,
      gainPct,
    });

    return NextResponse.json({
      ticker,
      interval,
      asOf: new Date().toISOString(),
      movingAverages: summary.movingAverages,
      oscillators: summary.oscillators,
      summary: summaryWithAdjustments,
      lastPrice,
      usedMock,
      gainPct,
      rationale,
    });
  } catch (err) {
    return NextResponse.json({
      ticker,
      interval,
      asOf: new Date().toISOString(),
      movingAverages: emptyPanel,
      oscillators: emptyPanel,
      summary: emptyPanel,
      lastPrice: null,
      error: err instanceof Error ? err.message : "Failed to compute technicals",
    });
  }
}
