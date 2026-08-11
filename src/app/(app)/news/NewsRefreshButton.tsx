"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export default function NewsRefreshButton() {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const router = useRouter();

  async function refresh() {
    setMessage(null);
    try {
      const res = await fetch("/api/news/refresh", { method: "POST" });
      const data = await res.json();
      setMessage(data.message ?? `Fetched ${data.fetched ?? 0}, saved ${data.inserted ?? 0}.`);
      startTransition(() => router.refresh());
    } catch {
      setMessage("Refresh failed — check your connection.");
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={refresh}
        disabled={isPending}
        className="rounded-full bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60 dark:bg-neutral-100 dark:text-neutral-900"
      >
        {isPending ? "Refreshing…" : "Refresh news"}
      </button>
      {message && <span className="text-[11px] text-neutral-500">{message}</span>}
    </div>
  );
}
