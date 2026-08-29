import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { fetchCandles, generateMockCandles } from "@/lib/marketdata/provider";
import { computeTechnicalSummary, DEFAULT_VERDICT_THRESHOLDS, type VerdictThresholds } from "@/lib/technicals";

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

    return NextResponse.json({
      ticker,
      interval,
      asOf: new Date().toISOString(),
      movingAverages: summary.movingAverages,
      oscillators: summary.oscillators,
      summary: summary.summary,
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
