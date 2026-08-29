"use client";

import { useEffect, useState } from "react";
import TechnicalGauge from "./TechnicalGauge";

const TIMEFRAMES: { value: string; label: string }[] = [
  { value: "1m", label: "1 minute" },
  { value: "5m", label: "5 minutes" },
  { value: "15m", label: "15 minutes" },
  { value: "30m", label: "30 minutes" },
  { value: "1h", label: "1 hour" },
  { value: "2h", label: "2 hours" },
  { value: "4h", label: "4 hours" },
  { value: "1d", label: "1 day" },
  { value: "1wk", label: "1 week" },
  { value: "1mo", label: "1 month" },
];

interface Panel {
  buy: number;
  sell: number;
  neutral: number;
  verdict: string;
}

interface SummaryPanel extends Panel {
  newsAdjustedVerdict?: string;
  newsNudgeApplied?: number;
}

interface TechnicalsResponse {
  movingAverages: Panel;
  oscillators: Panel;
  summary: SummaryPanel;
  lastPrice: number | null;
  error?: string;
  usedMock?: boolean;
}

// Keep signals live without the user having to reload the page. 10 minutes
// is frequent enough to feel "live" against Yahoo's data without hammering
// their API or Anthropic's news-classification calls across every holding.
const AUTO_REFRESH_MS = 10 * 60 * 1000;

export default function TechnicalPanel({ ticker }: { ticker: string }) {
  const [interval, setInterval] = useState("1d");
  const [data, setData] = useState<TechnicalsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function run(isBackground: boolean) {
      if (!isBackground) setLoading(true);
      try {
        const res = await fetch(`/api/technicals/${encodeURIComponent(ticker)}?interval=${interval}`);
        const json = await res.json();
        if (!cancelled) {
          setData(json);
          setLastUpdated(new Date());
        }
      } catch {
        if (!cancelled) setData(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    run(false);
    const timer = window.setInterval(() => run(true), AUTO_REFRESH_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [ticker, interval]);

  return (
    <div>
      <div className="-mx-1 flex gap-1 overflow-x-auto pb-2">
        {TIMEFRAMES.map((tf) => (
          <button
            key={tf.value}
            onClick={() => setInterval(tf.value)}
            className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium ${
              interval === tf.value
                ? "bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900"
                : "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300"
            }`}
          >
            {tf.label}
          </button>
        ))}
      </div>

      {loading && <p className="py-6 text-center text-xs text-neutral-400">Loading technicals…</p>}

      {!loading && !data && (
        <p className="py-6 text-center text-xs text-neutral-400">Unable to load technicals for {ticker}.</p>
      )}

      {!loading && data && (
        <>
          <div className="grid grid-cols-3 items-start gap-1.5 pt-2 sm:gap-3">
            <TechnicalGauge label="Oscillators" size="sm" {...data.oscillators} />
            <TechnicalGauge
              label="Summary"
              size="lg"
              {...data.summary}
              verdict={data.summary.newsAdjustedVerdict ?? data.summary.verdict}
              technicalVerdict={data.summary.verdict}
            />
            <TechnicalGauge label="Moving Averages" size="sm" {...data.movingAverages} />
          </div>
          {data.lastPrice != null && (
            <p className="mt-2 text-center text-[11px] text-neutral-400">
              Last price: {data.lastPrice.toFixed(2)}
              {data.usedMock ? " (synthetic — live data unavailable)" : ""}
            </p>
          )}
          {lastUpdated && (
            <p className="text-center text-[10px] text-neutral-400 dark:text-neutral-600">
              Updated {lastUpdated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · auto-refreshes every 10 min
            </p>
          )}
          {data.error && <p className="mt-1 text-center text-[11px] text-amber-500">{data.error}</p>}
        </>
      )}
    </div>
  );
}
