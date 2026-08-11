"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function MarkReadButton({ alertId }: { alertId: string }) {
  const router = useRouter();
  const supabase = createClient();
  const [loading, setLoading] = useState(false);

  async function markRead() {
    setLoading(true);
    await supabase.from("alerts").update({ is_read: true }).eq("id", alertId);
    setLoading(false);
    router.refresh();
  }

  return (
    <button
      onClick={markRead}
      disabled={loading}
      className="shrink-0 rounded-full border border-current/30 px-2 py-0.5 text-[10px] font-medium opacity-70 hover:opacity-100 disabled:opacity-40"
    >
      {loading ? "…" : "Mark read"}
    </button>
  );
}

export function MarkAllReadButton({ portfolioId }: { portfolioId: string }) {
  const router = useRouter();
  const supabase = createClient();
  const [loading, setLoading] = useState(false);

  async function markAllRead() {
    setLoading(true);
    await supabase.from("alerts").update({ is_read: true }).eq("portfolio_id", portfolioId).eq("is_read", false);
    setLoading(false);
    router.refresh();
  }

  return (
    <button
      onClick={markAllRead}
      disabled={loading}
      className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300"
    >
      {loading ? "Marking…" : "Mark all read"}
    </button>
  );
}
