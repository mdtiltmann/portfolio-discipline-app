"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

// Same cadence as the technical signals panel, so news and signals both
// feel "live" against Yahoo Finance at the same rhythm.
const AUTO_REFRESH_MS = 10 * 60 * 1000;

export default function NewsRefreshButton() {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const router = useRouter();

  const refresh = useCallback(async (isBackground: boolean) => {
    if (!isBackground) setMessage(null);
    try {
      const res = await fetch("/api/news/refresh", { method: "POST" });
      const data = await res.json();
      if (!isBackground) {
        setMessage(data.message ?? `Fetched ${data.fetched ?? 0}, saved ${data.inserted ?? 0}.`);
      }
      setLastUpdated(new Date());
      startTransition(() => router.refresh());
    } catch {
      if (!isBackground) setMessage("Refresh failed — check your connection.");
    }
  }, [router]);

  useEffect(() => {
    const timer = window.setInterval(() => refresh(true), AUTO_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [refresh]);

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={() => refresh(false)}
        disabled={isPending}
        className="rounded-full bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60 dark:bg-neutral-100 dark:text-neutral-900"
      >
        {isPending ? "Refreshing…" : "Refresh news"}
      </button>
      {message && <span className="text-[11px] text-neutral-500">{message}</span>}
      {!message && lastUpdated && (
        <span className="text-[10px] text-neutral-400 dark:text-neutral-600">
          Updated {lastUpdated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · auto-refreshes every 10 min
        </span>
      )}
    </div>
  );
}
