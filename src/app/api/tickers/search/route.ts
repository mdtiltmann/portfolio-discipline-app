import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/auth";

export interface TickerSearchResult {
  symbol: string; // Yahoo Finance symbol, e.g. "AIR.PA"
  name: string;
  exchange: string;
  type: string;
}

// Live ticker lookup against Yahoo Finance's public search endpoint, so the
// user can pick the exact Yahoo symbol for a holding instead of guessing —
// this is what catches cases like bare "AIR" resolving to the wrong company
// (AAR Corp) instead of Airbus SE (AIR.PA).
export async function GET(req: NextRequest) {
  await requireUser();
  const q = req.nextUrl.searchParams.get("q")?.trim();
  if (!q || q.length < 1) {
    return NextResponse.json({ results: [] });
  }

  try {
    const res = await fetch(
      `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=10&newsCount=0`,
      {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; PortfolioDiscipline/1.0)" },
        signal: AbortSignal.timeout(6000),
      }
    );
    if (!res.ok) return NextResponse.json({ results: [] });

    const json = await res.json();
    const quotes: Array<Record<string, unknown>> = json.quotes ?? [];
    const results: TickerSearchResult[] = quotes
      .filter((q) => typeof q.symbol === "string")
      .map((q) => ({
        symbol: q.symbol as string,
        name: (q.longname as string) ?? (q.shortname as string) ?? (q.symbol as string),
        exchange: (q.exchDisp as string) ?? (q.exchange as string) ?? "",
        type: (q.typeDisp as string) ?? (q.quoteType as string) ?? "",
      }));

    return NextResponse.json({ results });
  } catch {
    return NextResponse.json({ results: [] });
  }
}
