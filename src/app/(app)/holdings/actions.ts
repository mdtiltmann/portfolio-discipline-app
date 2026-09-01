"use server";

import { requireUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

async function ensurePortfolioId(userId: string): Promise<string> {
  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("portfolios")
    .select("id")
    .eq("user_id", userId)
    .limit(1);
  if (existing?.[0]?.id) return existing[0].id as string;

  const { data: created, error } = await supabase
    .from("portfolios")
    .insert({ user_id: userId, name: "Main Portfolio", base_currency: "EUR" })
    .select("id")
    .single();
  if (error || !created?.id) {
    throw new Error(error?.message ?? "Failed to create portfolio");
  }
  return created.id as string;
}

export interface UpsertHoldingResult {
  ok: boolean;
  error?: string;
}

export async function upsertHolding(formData: FormData): Promise<UpsertHoldingResult> {
  const user = await requireUser();
  const supabase = await createClient();

  const ticker = String(formData.get("ticker") ?? "").trim().toUpperCase();
  if (!ticker) return { ok: false, error: "Ticker is required" };

  const name = String(formData.get("name") ?? "").trim() || null;
  const assetClass = String(formData.get("asset_class") ?? "individual_stock");
  const quantity = Number(formData.get("quantity") ?? 0) || 0;
  const currentValue = Number(formData.get("current_value") ?? 0) || 0;
  const costBasisRaw = formData.get("cost_basis");
  const costBasis = costBasisRaw && String(costBasisRaw).trim() !== "" ? Number(costBasisRaw) : null;
  const yahooSymbol = String(formData.get("yahoo_symbol") ?? "").trim() || null;

  try {
    const portfolioId = await ensurePortfolioId(user.id);

    const { error } = await supabase.from("holdings").upsert(
      {
        portfolio_id: portfolioId,
        ticker,
        name,
        asset_class: assetClass,
        quantity,
        current_value: currentValue,
        cost_basis: costBasis,
      },
      { onConflict: "portfolio_id,ticker" }
    );
    if (error) throw new Error(error.message);

    // Record the exact Yahoo symbol the user picked from search (if any) so
    // price/technicals/news lookups use it directly instead of guessing —
    // this is what avoids picking up an unrelated company that happens to
    // share the same bare ticker (e.g. "AIR" resolving to AAR Corp instead
    // of Airbus SE).
    if (yahooSymbol) {
      await supabase
        .from("asset_metadata")
        .upsert({ ticker, name, asset_class: assetClass, yahoo_symbol: yahooSymbol }, { onConflict: "ticker" });
    }

    revalidatePath("/holdings");
    revalidatePath("/");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed to save holding" };
  }
}

/**
 * Deletes a holding entirely: the holdings row itself, plus that ticker's
 * stored news headlines (otherwise they'd linger on the News screen for a
 * ticker you no longer hold). Nothing else needs manual cleanup — the
 * Signals screen, portfolio totals/allocation %, and the notification
 * digest are all computed fresh from the current holdings table on every
 * load/run, so they reflect the deletion automatically on the next read.
 * asset_metadata (the ticker's Yahoo symbol mapping) is deliberately left
 * in place — it's harmless reference data, useful again if you re-add the
 * same ticker later.
 */
export async function deleteHolding(ticker: string): Promise<UpsertHoldingResult> {
  const user = await requireUser();
  const supabase = await createClient();

  try {
    const { data: portfolios } = await supabase
      .from("portfolios")
      .select("id")
      .eq("user_id", user.id)
      .limit(1);
    const portfolioId = portfolios?.[0]?.id;
    if (!portfolioId) return { ok: false, error: "No portfolio found" };

    const { error } = await supabase
      .from("holdings")
      .delete()
      .eq("portfolio_id", portfolioId)
      .eq("ticker", ticker);
    if (error) throw new Error(error.message);

    // Best-effort: a failure here shouldn't undo the holding deletion that
    // already succeeded, so it's not wrapped in the same throw-on-error path.
    await supabase.from("news_items").delete().eq("ticker", ticker);

    revalidatePath("/holdings");
    revalidatePath("/");
    revalidatePath("/news");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed to delete holding" };
  }
}
