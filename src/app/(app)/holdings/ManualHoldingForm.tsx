"use client";

import { useRef, useState, useTransition } from "react";
import { upsertHolding, deleteHolding } from "./actions";
import TickerSearch, { type TickerPick } from "./TickerSearch";

const ASSET_CLASSES: { value: string; label: string }[] = [
  { value: "individual_stock", label: "Individual stock" },
  { value: "broad_core_etf", label: "Broad core ETF (e.g. VWCE)" },
  { value: "sector_etf", label: "Sector / thematic ETF (e.g. IITU)" },
  { value: "defensive", label: "Defensive (e.g. gold)" },
  { value: "cash", label: "Cash-like (e.g. ERNE)" },
];

export default function ManualHoldingForm({ existingTickers }: { existingTickers: string[] }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [open, setOpen] = useState(existingTickers.length === 0);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [ticker, setTicker] = useState("");
  const [name, setName] = useState("");
  const [yahooSymbol, setYahooSymbol] = useState("");
  const [matched, setMatched] = useState<string | null>(null);

  function handlePick(pick: TickerPick) {
    setTicker(pick.ticker);
    setName(pick.name);
    setYahooSymbol(pick.yahooSymbol);
    setMatched(pick.yahooSymbol);
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    const formData = new FormData(e.currentTarget);
    const submittedTicker = String(formData.get("ticker") ?? "").trim().toUpperCase();
    startTransition(async () => {
      const result = await upsertHolding(formData);
      if (result.ok) {
        setSuccess(`${submittedTicker} saved.`);
        formRef.current?.reset();
        setTicker("");
        setName("");
        setYahooSymbol("");
        setMatched(null);
      } else {
        setError(result.error ?? "Failed to save");
      }
    });
  }

  function handleDelete(ticker: string) {
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const result = await deleteHolding(ticker);
      if (result.ok) {
        setSuccess(`${ticker} removed.`);
      } else {
        setError(result.error ?? "Failed to delete");
      }
    });
  }

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between text-sm font-semibold text-neutral-900 dark:text-neutral-50"
      >
        Add / edit a holding manually
        <span className="text-xs font-normal text-neutral-500">{open ? "Hide" : "Show"}</span>
      </button>

      {open && (
        <form ref={formRef} onSubmit={handleSubmit} className="mt-3 space-y-2">
          <TickerSearch onPick={handlePick} />
          {matched && (
            <p className="rounded-lg bg-emerald-50 px-2 py-1 text-[11px] text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400">
              Matched to Yahoo Finance symbol <strong>{matched}</strong> — this exact instrument will be tracked for
              price, technicals and news.
            </p>
          )}
          <input type="hidden" name="yahoo_symbol" value={yahooSymbol} />
          <div className="grid grid-cols-2 gap-2">
            <label className="block text-xs">
              Ticker *
              <input
                name="ticker"
                required
                value={ticker}
                onChange={(e) => {
                  setTicker(e.target.value);
                  setMatched(null);
                  setYahooSymbol("");
                }}
                placeholder="VWCE"
                className="mt-0.5 w-full rounded border border-neutral-300 px-2 py-1.5 text-sm uppercase dark:border-neutral-700 dark:bg-neutral-800"
              />
            </label>
            <label className="block text-xs">
              Name
              <input
                name="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Vanguard FTSE All-World"
                className="mt-0.5 w-full rounded border border-neutral-300 px-2 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-800"
              />
            </label>
          </div>

          <label className="block text-xs">
            Asset class *
            <select
              name="asset_class"
              defaultValue="individual_stock"
              className="mt-0.5 w-full rounded border border-neutral-300 px-2 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-800"
            >
              {ASSET_CLASSES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>

          <div className="grid grid-cols-3 gap-2">
            <label className="block text-xs">
              Quantity
              <input
                type="number"
                step="any"
                name="quantity"
                placeholder="0"
                className="mt-0.5 w-full rounded border border-neutral-300 px-2 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-800"
              />
            </label>
            <label className="block text-xs">
              Current value (€) *
              <input
                type="number"
                step="any"
                name="current_value"
                required
                placeholder="0"
                className="mt-0.5 w-full rounded border border-neutral-300 px-2 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-800"
              />
            </label>
            <label className="block text-xs">
              Cost basis (€)
              <input
                type="number"
                step="any"
                name="cost_basis"
                placeholder="optional"
                className="mt-0.5 w-full rounded border border-neutral-300 px-2 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-800"
              />
            </label>
          </div>

          {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
          {success && <p className="text-xs text-emerald-600 dark:text-emerald-400">{success}</p>}

          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-xl bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
          >
            {pending ? "Saving…" : "Save holding"}
          </button>
          <p className="text-[10px] text-neutral-500">
            Saving a ticker that already exists updates it in place (same as re-entering a value after a price
            change).
          </p>

          {existingTickers.length > 0 && (
            <div className="mt-3 border-t border-neutral-200 pt-3 dark:border-neutral-800">
              <p className="mb-1 text-xs font-medium text-neutral-600 dark:text-neutral-400">Remove a holding</p>
              <div className="flex flex-wrap gap-1.5">
                {existingTickers.map((t) => (
                  <button
                    key={t}
                    type="button"
                    disabled={pending}
                    onClick={() => handleDelete(t)}
                    className="rounded-lg border border-neutral-300 px-2 py-1 text-xs text-neutral-600 hover:border-red-400 hover:text-red-600 disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-400 dark:hover:border-red-700 dark:hover:text-red-400"
                  >
                    {t} ×
                  </button>
                ))}
              </div>
            </div>
          )}
        </form>
      )}
    </div>
  );
}
