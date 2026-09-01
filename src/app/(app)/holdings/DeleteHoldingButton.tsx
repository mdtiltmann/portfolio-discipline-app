"use client";

import { useState, useTransition } from "react";
import { deleteHolding } from "./actions";

export default function DeleteHoldingButton({ ticker }: { ticker: string }) {
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    if (!confirming) {
      setConfirming(true);
      // Auto-reset the confirm state if they don't follow through, so a
      // stray tap days later doesn't unexpectedly delete something.
      setTimeout(() => setConfirming(false), 4000);
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await deleteHolding(ticker);
      if (!result.ok) {
        setError(result.error ?? "Failed to delete");
        setConfirming(false);
      }
      // On success the row disappears via revalidation — nothing else to do.
    });
  }

  return (
    <div className="flex flex-col items-end gap-0.5">
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        title={confirming ? "Click again to confirm deletion" : "Delete this holding"}
        className={`rounded-md px-2 py-0.5 text-[11px] font-medium disabled:opacity-50 ${
          confirming
            ? "bg-red-600 text-white"
            : "bg-white/70 text-current hover:bg-red-100 dark:bg-black/30 dark:hover:bg-red-950/40"
        }`}
      >
        {pending ? "Deleting…" : confirming ? "Confirm delete" : "Delete"}
      </button>
      {error && <span className="text-[10px] text-red-600 dark:text-red-400">{error}</span>}
    </div>
  );
}
