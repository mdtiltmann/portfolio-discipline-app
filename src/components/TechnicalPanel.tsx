"use client";

import { useCallback, useEffect, useState } from "react";
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
  gainNudgeApplied?: number;
  personalizedVerdict?: string;
}

interface TechnicalsResponse {
  movingAverages: Panel;
  oscillators: Panel;
  summary: SummaryPanel;
  lastPrice: number | null;
  error?: string;
  usedMock?: boolean;
  rationale?: string;
  gainPct?: number | null;
}

// Keep signals live without the user having to reload the page. 10 minutes
// is frequent enough to feel "live" against Yahoo's data without hammering
// their API or Anthropic's news-classification calls across every holding.
const AUTO_REFRESH_MS = 10 * 60 * 1000;

export default function TechnicalPanel({ ticker }: { ticker: string }) {
  const [interval, setInterval] = useState("1d");
  const [data, setData] = useState<TechnicalsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const run = useCallback(
    async (mode: "initial" | "background" | "manual") => {
      if (mode === "initial") setLoading(true);
      if (mode === "manual") setRefreshing(true);
      try {
        const res = await fetch(`/api/technicals/${encodeURIComponent(ticker)}?interval=${interval}`);
        const json = await res.json();
        setData(json);
        setLastUpdated(new Date());
      } catch {
        setData(null);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [ticker, interval]
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!cancelled) await run("initial");
    })();
    const timer = window.setInterval(() => {
      if (!cancelled) run("background");
    }, AUTO_REFRESH_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [run]);

  return (
    <div>
      <div className="flex items-center gap-2">
        <div className="-mx-1 flex flex-1 gap-1 overflow-x-auto pb-2">
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
        <button
          onClick={() => run("manual")}
          disabled={refreshing || loading}
          title="Refresh now"
          aria-label="Refresh technicals"
          className="mb-2 shrink-0 rounded-full border border-neutral-300 p-1.5 text-neutral-500 disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-400"
        >
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={refreshing ? "animate-spin" : ""}
          >
            <path d="M21 12a9 9 0 1 1-3-6.7" />
            <path d="M21 3v6h-6" />
          </svg>
        </button>
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
              verdict={data.summary.personalizedVerdict ?? data.summary.verdict}
              technicalVerdict={data.summary.verdict}
            />
            <TechnicalGauge label="Moving Averages" size="sm" {...data.movingAverages} />
          </div>
          {data.lastPrice != null && (
            <p className="mt-2 text-center text-[11px] text-neutral-400">
              Last price: {data.lastPrice.toFixed(2)}
              {data.usedMock ? " (synthetic — live data unavailable)" : ""}
              {data.gainPct != null && (
                <span className={data.gainPct >= 0 ? "text-emerald-500" : "text-red-500"}>
                  {" · "}
                  {data.gainPct >= 0 ? "+" : ""}
                  {data.gainPct.toFixed(1)}% since cost basis
                </span>
              )}
            </p>
          )}
          {lastUpdated && (
            <p className="text-center text-[10px] text-neutral-400 dark:text-neutral-600">
              Updated {lastUpdated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · auto-refreshes every 10 min
            </p>
          )}
          {data.rationale && (
            <div className="mt-3 rounded-lg bg-neutral-50 p-2.5 text-[11px] leading-relaxed text-neutral-600 dark:bg-neutral-800/60 dark:text-neutral-300">
              {data.rationale}
            </div>
          )}
          {data.error && <p className="mt-1 text-center text-[11px] text-amber-500">{data.error}</p>}
        </>
      )}
    </div>
  );
}
