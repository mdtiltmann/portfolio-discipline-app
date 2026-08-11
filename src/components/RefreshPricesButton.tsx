"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function RefreshPricesButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleRefresh() {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/prices/refresh", { method: "POST" });
      const json = await res.json();
      if (json.message) {
        setMessage(json.message);
      } else {
        const skippedNote = json.skipped?.length ? `, ${json.skipped.length} skipped` : "";
        setMessage(`Updated ${json.updated} holding(s)${skippedNote}.`);
      }
      router.refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Price refresh failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={handleRefresh}
        disabled={loading}
        className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300"
      >
        {loading ? "Refreshing…" : "Refresh prices"}
      </button>
      {message && <p className="text-[11px] text-neutral-500">{message}</p>}
    </div>
  );
}
