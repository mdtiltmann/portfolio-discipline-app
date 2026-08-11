"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { mergeExtractedItems, type MergedItem } from "@/lib/import/mergeItems";

const REVIEW_CONFIDENCE_THRESHOLD = 0.9;

interface ReviewItem extends MergedItem {
  reviewed: boolean;
}

export default function ImportClient({ portfolioId }: { portfolioId: string | null }) {
  const router = useRouter();
  const supabase = createClient();
  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<ReviewItem[]>([]);

  async function fileToDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function needsReview(item: MergedItem) {
    return (item.confidence ?? 1) < REVIEW_CONFIDENCE_THRESHOLD || item.valueMismatch;
  }

  async function handleExtract() {
    setError(null);
    setLoading(true);
    setItems([]);
    try {
      const images = await Promise.all(files.map(fileToDataUrl));
      const screenshotDate = new Date().toISOString().slice(0, 10);
      const res = await fetch("/api/import/extract", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ images }),
      });
      const json = await res.json();
      if (json.error) {
        setError(json.message ?? json.error);
      } else {
        const raw = (json.items ?? []).map((it: MergedItem) => ({ ...it, screenshot_date: it.screenshot_date ?? screenshotDate }));
        const merged = mergeExtractedItems(raw);
        setItems(merged.map((m) => ({ ...m, reviewed: !needsReview(m) })));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Extraction failed");
    } finally {
      setLoading(false);
    }
  }

  function updateItem(index: number, patch: Partial<ReviewItem>) {
    setItems((prev) => prev.map((it, i) => (i === index ? { ...it, ...patch } : it)));
  }

  function removeItem(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  const pendingReviewCount = useMemo(() => items.filter((it) => !it.reviewed).length, [items]);
  const canConfirm = items.length > 0 && pendingReviewCount === 0;

  async function handleConfirm() {
    if (!portfolioId) {
      setError("No portfolio yet — load sample data in Settings first, or create a portfolio.");
      return;
    }
    if (!canConfirm) {
      setError(`${pendingReviewCount} item(s) still need review before saving.`);
      return;
    }
    setLoading(true);
    try {
      const { data: batch, error: batchError } = await supabase
        .from("import_batches")
        .insert({ portfolio_id: portfolioId, status: "confirmed", screenshot_count: files.length, confirmed_at: new Date().toISOString() })
        .select("id")
        .single();
      if (batchError || !batch?.id) {
        throw new Error(batchError?.message ?? "Failed to create import batch");
      }

      const holdingsSnapshot: Record<string, unknown>[] = [];

      for (const item of items) {
        if (!item.ticker) continue;
        const { error: itemError } = await supabase.from("import_items").insert({
          batch_id: batch.id,
          ticker: item.ticker,
          name: item.name,
          quantity: item.quantity,
          current_value: item.current_value,
          gain_eur: item.gain_eur,
          gain_pct: item.gain_pct,
          cost_basis: item.cost_basis,
          confidence: item.confidence,
          screenshot_date: item.screenshot_date,
          needs_review: needsReview(item),
          merged_into_ticker: item.sourceCount > 1 ? item.ticker : null,
          raw_json: item,
        });
        if (itemError) throw new Error(`Saving ${item.ticker}: ${itemError.message}`);

        const holdingRow = {
          portfolio_id: portfolioId,
          ticker: item.ticker,
          name: item.name,
          asset_class: "individual_stock",
          quantity: item.quantity ?? 0,
          current_value: item.current_value ?? 0,
          cost_basis: item.cost_basis ?? null,
        };

        const { error: holdingError } = await supabase
          .from("holdings")
          .upsert(holdingRow, { onConflict: "portfolio_id,ticker" });
        if (holdingError) throw new Error(`Saving holding ${item.ticker}: ${holdingError.message}`);
        holdingsSnapshot.push(holdingRow);
      }

      const { error: snapshotError } = await supabase.from("portfolio_snapshots").upsert(
        {
          portfolio_id: portfolioId,
          snapshot_date: new Date().toISOString().slice(0, 10),
          total_value: holdingsSnapshot.reduce((s, h) => s + (Number(h.current_value) || 0), 0),
          holdings_json: holdingsSnapshot,
          source: "screenshot_import",
        },
        { onConflict: "portfolio_id,snapshot_date" }
      );
      if (snapshotError) throw new Error(`Saving snapshot: ${snapshotError.message}`);

      router.push("/holdings");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save import");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
        <input
          type="file"
          accept="image/*"
          multiple
          onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
          className="mb-3 block w-full text-sm"
        />
        <button
          onClick={handleExtract}
          disabled={loading || files.length === 0}
          className="w-full rounded-xl bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
        >
          {loading ? "Extracting…" : `Extract from ${files.length} screenshot(s)`}
        </button>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </div>
      )}

      {items.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">Extracted holdings</h2>
          {pendingReviewCount > 0 && (
            <p className="text-xs text-amber-700 dark:text-amber-400">
              {pendingReviewCount} item(s) need review before you can save — confirm the value below.
            </p>
          )}
          {items.map((it, i) => {
            const flagged = !it.reviewed;
            return (
              <div
                key={i}
                className={`rounded-xl border p-3 text-sm ${
                  flagged
                    ? "border-amber-400 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/30"
                    : "border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="font-medium">{it.ticker ?? "?"}</span>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs ${flagged ? "font-semibold text-amber-700 dark:text-amber-400" : "text-neutral-500"}`}>
                      confidence {it.confidence != null ? Math.round(it.confidence * 100) : "?"}%
                      {it.valueMismatch && " · value mismatch"}
                    </span>
                    <button
                      onClick={() => removeItem(i)}
                      title="Remove this holding from the import"
                      aria-label={`Remove ${it.ticker ?? "item"}`}
                      className="rounded-lg border border-neutral-300 px-2 py-0.5 text-xs text-neutral-500 hover:border-red-400 hover:text-red-600 dark:border-neutral-700 dark:hover:border-red-700 dark:hover:text-red-400"
                    >
                      Delete
                    </button>
                  </div>
                </div>
                <p className="text-xs text-neutral-500">{it.name}</p>
                {it.sourceCount > 1 && (
                  <p className="text-xs text-neutral-500">combined from {it.sourceCount} screenshots</p>
                )}

                {flagged ? (
                  <div className="mt-2 space-y-2 rounded-lg bg-white/60 p-2 dark:bg-black/20">
                    <p className="text-xs text-amber-800 dark:text-amber-300">
                      {it.ticker} value detected as €{it.current_value?.toFixed(2) ?? "?"}, confidence{" "}
                      {it.confidence != null ? Math.round(it.confidence * 100) : "?"}%. Please confirm or correct.
                    </p>
                    <label className="block text-xs">
                      Current value (€)
                      <input
                        type="number"
                        className="mt-0.5 w-full rounded border border-neutral-300 px-2 py-1 text-sm dark:border-neutral-700 dark:bg-neutral-900"
                        value={it.current_value ?? ""}
                        onChange={(e) => updateItem(i, { current_value: e.target.value === "" ? undefined : Number(e.target.value) })}
                      />
                    </label>
                    <label className="block text-xs">
                      Quantity
                      <input
                        type="number"
                        className="mt-0.5 w-full rounded border border-neutral-300 px-2 py-1 text-sm dark:border-neutral-700 dark:bg-neutral-900"
                        value={it.quantity ?? ""}
                        onChange={(e) => updateItem(i, { quantity: e.target.value === "" ? undefined : Number(e.target.value) })}
                      />
                    </label>
                    <button
                      onClick={() => updateItem(i, { reviewed: true })}
                      className="rounded-lg bg-amber-700 px-3 py-1.5 text-xs font-medium text-white"
                    >
                      Confirm this value
                    </button>
                  </div>
                ) : (
                  <p className="text-xs">
                    value {it.current_value ?? "—"} · qty {it.quantity ?? "—"} · cost {it.cost_basis ?? "—"}
                  </p>
                )}
              </div>
            );
          })}
          <button
            onClick={handleConfirm}
            disabled={loading || !canConfirm}
            title={!canConfirm ? "Resolve flagged items above first" : undefined}
            className="w-full rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {loading ? "Saving…" : canConfirm ? "Confirm & save to holdings" : `Resolve ${pendingReviewCount} item(s) first`}
          </button>
        </div>
      )}
    </div>
  );
}
