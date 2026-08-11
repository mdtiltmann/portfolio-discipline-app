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

    revalidatePath("/holdings");
    revalidatePath("/");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed to save holding" };
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
