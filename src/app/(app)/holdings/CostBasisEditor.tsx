"use client";

import { useState, useTransition } from "react";
import { updateCostBasis } from "./actions";

export default function CostBasisEditor({
  ticker,
  currentCostBasis,
}: {
  ticker: string;
  currentCostBasis: number | null;
}) {
  const [value, setValue] = useState(currentCostBasis != null ? String(currentCostBasis) : "");
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleSave() {
    setError(null);
    setSaved(false);
    const parsed = value.trim() === "" ? null : Number(value);
    if (parsed != null && (Number.isNaN(parsed) || parsed < 0)) {
      setError("Enter a valid amount");
      return;
    }
    startTransition(async () => {
      const result = await updateCostBasis(ticker, parsed);
      if (result.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      } else {
        setError(result.error ?? "Failed to save");
      }
    });
  }

  return (
    <div className="mt-2 flex items-center gap-1.5">
      <label className="flex flex-1 items-center gap-1.5 text-xs opacity-90">
        What you paid (€)
        <input
          type="number"
          step="any"
          min="0"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="e.g. 1450"
          className="w-24 rounded border border-current/30 bg-white/60 px-1.5 py-0.5 text-xs dark:bg-black/20"
        />
      </label>
      <button
        type="button"
        onClick={handleSave}
        disabled={pending}
        className="rounded-md bg-white/70 px-2 py-0.5 text-[11px] font-medium disabled:opacity-50 dark:bg-black/30"
      >
        {pending ? "Saving…" : "Save"}
      </button>
      {saved && <span className="text-[11px] text-emerald-700 dark:text-emerald-400">Saved</span>}
      {error && <span className="text-[11px] text-red-600 dark:text-red-400">{error}</span>}
    </div>
  );
}
