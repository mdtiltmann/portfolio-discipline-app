"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

// Same cadence as the Signals/News auto-refresh, so Holdings' stored
// current_value doesn't quietly drift out of date between manual refreshes
// — this is the one screen where "current_value" is persisted to the DB
// (not just computed live), so without this it only ever updated when the
// user remembered to tap the button.
const AUTO_REFRESH_MS = 10 * 60 * 1000;

export default function RefreshPricesButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const refresh = useCallback(
    async (isBackground: boolean) => {
      if (!isBackground) {
        setLoading(true);
        setMessage(null);
      }
      try {
        const res = await fetch("/api/prices/refresh", { method: "POST" });
        const json = await res.json();
        if (!isBackground) {
          if (json.message) {
            setMessage(json.message);
          } else {
            const skippedNote = json.skipped?.length ? `, ${json.skipped.length} skipped` : "";
            setMessage(`Updated ${json.updated} holding(s)${skippedNote}.`);
          }
        }
        setLastUpdated(new Date());
        router.refresh();
      } catch (err) {
        if (!isBackground) setMessage(err instanceof Error ? err.message : "Price refresh failed");
      } finally {
        if (!isBackground) setLoading(false);
      }
    },
    [router]
  );

  useEffect(() => {
    const timer = window.setInterval(() => refresh(true), AUTO_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [refresh]);

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={() => refresh(false)}
        disabled={loading}
        className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300"
      >
        {loading ? "Refreshing…" : "Refresh prices"}
      </button>
      {message && <p className="text-[11px] text-neutral-500">{message}</p>}
      {!message && lastUpdated && (
        <p className="text-[10px] text-neutral-400 dark:text-neutral-600">
          Updated {lastUpdated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · auto-refreshes every 10 min
        </p>
      )}
    </div>
  );
}
