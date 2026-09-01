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
 * Updates only the cost basis for an existing holding, leaving quantity/
 * current_value untouched — the manual add-holding form only supports
 * creating new rows, so this is the safe way to fill in "what you paid"
 * for a holding you already have without risking overwriting its other
 * fields with blank/zero values.
 */
export async function updateCostBasis(ticker: string, costBasis: number | null): Promise<UpsertHoldingResult> {
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
      .update({ cost_basis: costBasis })
      .eq("portfolio_id", portfolioId)
      .eq("ticker", ticker);
    if (error) throw new Error(error.message);

    revalidatePath("/holdings");
    revalidatePath("/");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed to update cost basis" };
  }
}

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

    revalidatePath("/holdings");
    revalidatePath("/");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed to delete holding" };
  }
}
