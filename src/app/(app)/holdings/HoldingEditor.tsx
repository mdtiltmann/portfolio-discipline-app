"use client";

import { useState, useTransition } from "react";
import { upsertHolding } from "./actions";

const ASSET_CLASSES: { value: string; label: string }[] = [
  { value: "individual_stock", label: "Individual stock" },
  { value: "broad_core_etf", label: "Broad core ETF (e.g. VWCE)" },
  { value: "sector_etf", label: "Sector / thematic ETF (e.g. IITU)" },
  { value: "defensive", label: "Defensive (e.g. gold)" },
  { value: "cash", label: "Cash-like (e.g. ERNE)" },
];

interface HoldingEditorProps {
  ticker: string;
  name: string | null;
  assetClass: string;
  quantity: number;
  currentValue: number;
  costBasis: number | null;
}

// Edits an existing holding in place, pre-filled with its current values —
// the manual add-holding form only supports creating new rows and doesn't
// pre-fill anything, so re-using it to "edit" risked blanking out fields
// the user didn't mean to touch. This is scoped to one ticker and always
// starts from what's already saved.
export default function HoldingEditor({ ticker, name, assetClass, quantity, currentValue, costBasis }: HoldingEditorProps) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    const formData = new FormData(e.currentTarget);
    formData.set("ticker", ticker);
    startTransition(async () => {
      const result = await upsertHolding(formData);
      if (result.ok) {
        setSaved(true);
        setTimeout(() => {
          setSaved(false);
          setOpen(false);
        }, 900);
      } else {
        setError(result.error ?? "Failed to save");
      }
    });
  }

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="rounded-md bg-white/70 px-2 py-0.5 text-[11px] font-medium dark:bg-black/30"
      >
        {open ? "Cancel edit" : "Edit"}
      </button>

      {open && (
        <form onSubmit={handleSubmit} className="mt-2 space-y-2 rounded-lg bg-white/60 p-2.5 text-xs dark:bg-black/20">
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              Name
              <input
                name="name"
                defaultValue={name ?? ""}
                className="mt-0.5 w-full rounded border border-current/30 bg-white/80 px-2 py-1 text-xs dark:bg-black/30"
              />
            </label>
            <label className="block">
              Asset class
              <select
                name="asset_class"
                defaultValue={assetClass}
                className="mt-0.5 w-full rounded border border-current/30 bg-white/80 px-2 py-1 text-xs dark:bg-black/30"
              >
                {ASSET_CLASSES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <label className="block">
              Quantity
              <input
                type="number"
                step="any"
                name="quantity"
                defaultValue={quantity}
                className="mt-0.5 w-full rounded border border-current/30 bg-white/80 px-2 py-1 text-xs dark:bg-black/30"
              />
            </label>
            <label className="block">
              Current value (€)
              <input
                type="number"
                step="any"
                name="current_value"
                required
                defaultValue={currentValue}
                className="mt-0.5 w-full rounded border border-current/30 bg-white/80 px-2 py-1 text-xs dark:bg-black/30"
              />
            </label>
            <label className="block">
              Cost basis (€)
              <input
                type="number"
                step="any"
                name="cost_basis"
                defaultValue={costBasis ?? ""}
                placeholder="optional"
                className="mt-0.5 w-full rounded border border-current/30 bg-white/80 px-2 py-1 text-xs dark:bg-black/30"
              />
            </label>
          </div>
          {error && <p className="text-red-600 dark:text-red-400">{error}</p>}
          {saved && <p className="text-emerald-700 dark:text-emerald-400">Saved.</p>}
          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
          >
            {pending ? "Saving…" : "Save changes"}
          </button>
        </form>
      )}
    </div>
  );
}
