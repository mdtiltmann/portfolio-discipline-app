"use client";

import { useEffect, useRef, useState } from "react";

interface TickerSearchResult {
  symbol: string;
  name: string;
  exchange: string;
  type: string;
}

export interface TickerPick {
  ticker: string; // friendly label, defaults to the symbol's base part
  name: string;
  yahooSymbol: string; // exact Yahoo symbol, e.g. "AIR.PA"
}

// Live search-as-you-type against Yahoo Finance's own symbol search, so the
// user picks the exact instrument (with exchange) instead of typing a bare
// ticker that might resolve to an unrelated company on Yahoo (e.g. "AIR" ->
// AAR Corp instead of Airbus SE / AIR.PA).
export default function TickerSearch({ onPick }: { onPick: (pick: TickerPick) => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<TickerSearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;

    if (query.trim().length < 2) {
      const timer = window.setTimeout(() => {
        if (!cancelled) setResults([]);
      }, 0);
      return () => {
        cancelled = true;
        window.clearTimeout(timer);
      };
    }

    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/tickers/search?q=${encodeURIComponent(query)}`);
        const json = await res.json();
        if (!cancelled) {
          setResults(json.results ?? []);
          setOpen(true);
        }
      } catch {
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function pick(r: TickerSearchResult) {
    const friendlyTicker = r.symbol.includes(".") ? r.symbol.split(".")[0] : r.symbol;
    onPick({ ticker: friendlyTicker, name: r.name, yahooSymbol: r.symbol });
    setQuery(`${r.name} (${r.symbol})`);
    setOpen(false);
  }

  return (
    <div ref={containerRef} className="relative">
      <label className="block text-xs">
        Search Yahoo Finance
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder="e.g. Airbus, VWCE, NVIDIA…"
          className="mt-0.5 w-full rounded border border-neutral-300 px-2 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-800"
        />
      </label>
      {loading && <p className="mt-1 text-[10px] text-neutral-400">Searching…</p>}
      {open && results.length > 0 && (
        <ul className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-neutral-200 bg-white text-sm shadow-lg dark:border-neutral-700 dark:bg-neutral-900">
          {results.map((r) => (
            <li key={r.symbol}>
              <button
                type="button"
                onClick={() => pick(r)}
                className="flex w-full flex-col items-start px-3 py-2 text-left hover:bg-neutral-100 dark:hover:bg-neutral-800"
              >
                <span className="font-medium">
                  {r.name} <span className="text-neutral-400">— {r.symbol}</span>
                </span>
                <span className="text-[11px] text-neutral-500">
                  {r.exchange} · {r.type}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-1 text-[10px] text-neutral-500">
        Pick the exact match so the right company&apos;s price/news/signals get tracked — searching avoids picking a
        bare ticker that Yahoo might resolve to a different company.
      </p>
    </div>
  );
}
