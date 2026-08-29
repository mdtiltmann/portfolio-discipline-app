import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { fetchCandles, generateMockCandles } from "@/lib/marketdata/provider";
import { computeTechnicalSummary, DEFAULT_VERDICT_THRESHOLDS, verdictFromRatio, type VerdictThresholds } from "@/lib/technicals";
import { applyNewsNudge } from "@/lib/technicals/newsNudge";
import { getNewsProvider } from "@/lib/news/provider";
import { classifyNewsItem } from "@/lib/news/classify";

// Best-effort: fetch + classify news for a ticker and compute the news-nudge
// inputs. Never allowed to block the technicals response for long — capped
// with a timeout so a slow feed degrades to "no news available" rather than
// stalling the whole gauge.
async function computeNewsAdjustment(ticker: string, baseRatio: number) {
  const items = await getNewsProvider().fetchNews([ticker]);
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
  return { adjustedRatio, nudgeApplied, newsCount: classified.length };
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
    const [{ data: metaRows }, { data: settingsRow }] = await Promise.all([
      supabase.from("asset_metadata").select("yahoo_symbol").eq("ticker", ticker).maybeSingle(),
      supabase.from("settings").select("verdict_thresholds").eq("user_id", user.id).maybeSingle(),
    ]);
    const override = metaRows?.yahoo_symbol ?? null;
    const thresholds: VerdictThresholds = settingsRow?.verdict_thresholds ?? DEFAULT_VERDICT_THRESHOLDS;

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

    // News-nudge the Summary panel's verdict only (Oscillators/Moving
    // Averages panels stay pure-technical). Best-effort and time-boxed so a
    // slow news feed never holds up the gauge for more than ~3s.
    const { summary: summaryPanel } = summary;
    const total = summaryPanel.buy + summaryPanel.sell + summaryPanel.neutral;
    const baseRatio = total > 0 ? (summaryPanel.buy - summaryPanel.sell) / total : 0;
    let newsAdjustedVerdict: string | null = null;
    let newsNudgeApplied = 0;
    try {
      const adjustment = await Promise.race([
        computeNewsAdjustment(ticker, baseRatio),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000)),
      ]);
      if (adjustment) {
        newsNudgeApplied = adjustment.nudgeApplied;
        newsAdjustedVerdict = verdictFromRatio(adjustment.adjustedRatio, thresholds);
      }
    } catch {
      // News fetch/classification failed — fall back to the pure-technical verdict.
    }

    const summaryWithNews = {
      ...summaryPanel,
      newsAdjustedVerdict: newsAdjustedVerdict ?? summaryPanel.verdict,
      newsNudgeApplied,
    };

    return NextResponse.json({
      ticker,
      interval,
      asOf: new Date().toISOString(),
      movingAverages: summary.movingAverages,
      oscillators: summary.oscillators,
      summary: summaryWithNews,
      lastPrice,
      usedMock,
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
