import { requireUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import Link from "next/link";
import type { AssetRule } from "@/lib/engine";

async function upsertRule(formData: FormData) {
  "use server";
  const user = await requireUser();
  const supabase = await createClient();

  const ticker = String(formData.get("ticker") ?? "").trim().toUpperCase();
  if (!ticker) return;

  const numOrNull = (key: string) => {
    const v = formData.get(key);
    if (v == null || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };

  await supabase.from("asset_rules").upsert(
    {
      user_id: user.id,
      ticker,
      asset_class: String(formData.get("asset_class") ?? "individual_stock"),
      target_pct: numOrNull("target_pct"),
      warning_pct: numOrNull("warning_pct"),
      trim_pct: numOrNull("trim_pct"),
      stop_adding_pct: numOrNull("stop_adding_pct"),
      gain_alert_informational: numOrNull("gain_alert_informational"),
      gain_alert_review: numOrNull("gain_alert_review"),
      gain_alert_profit_taking: numOrNull("gain_alert_profit_taking"),
      gain_alert_strong: numOrNull("gain_alert_strong"),
      trim_mode: String(formData.get("trim_mode") ?? "conservative"),
    },
    { onConflict: "user_id,ticker" }
  );

  revalidatePath("/settings/rules");
}

async function deleteRule(formData: FormData) {
  "use server";
  const user = await requireUser();
  const supabase = await createClient();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await supabase.from("asset_rules").delete().eq("id", id).eq("user_id", user.id);
  revalidatePath("/settings/rules");
}

export default async function AssetRulesPage() {
  const user = await requireUser();
  const supabase = await createClient();

  const { data: rules } = await supabase
    .from("asset_rules")
    .select("*")
    .eq("user_id", user.id)
    .not("ticker", "is", null)
    .order("ticker");

  const overrides = (rules ?? []) as AssetRule[];

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">Per-ticker rules</h1>
        <Link href="/settings" className="text-xs text-neutral-500 hover:underline">
          &larr; Settings
        </Link>
      </div>
      <p className="text-xs text-neutral-500">
        Per-ticker overrides take priority over the asset-class defaults on the main Settings page. Leave a field
        blank to fall back to the class default for that field.
      </p>

      <section className="rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
        <h2 className="mb-3 text-sm font-semibold">Existing overrides</h2>
        <div className="space-y-2">
          {overrides.map((r) => (
            <details key={r.id} className="rounded-xl border border-neutral-100 p-3 text-sm dark:border-neutral-800">
              <summary className="flex cursor-pointer items-center justify-between">
                <span className="font-medium">{r.ticker}</span>
                <span className="text-xs text-neutral-500">{r.asset_class}</span>
              </summary>
              <form action={upsertRule} className="mt-3 space-y-2 text-xs">
                <input type="hidden" name="ticker" value={r.ticker ?? ""} />
                <div className="grid grid-cols-2 gap-2">
                  <label>
                    Asset class
                    <select name="asset_class" defaultValue={r.asset_class} className="mt-1 w-full rounded-lg border border-neutral-300 px-2 py-1 dark:border-neutral-700 dark:bg-neutral-800">
                      <option value="broad_core_etf">broad_core_etf</option>
                      <option value="sector_etf">sector_etf</option>
                      <option value="individual_stock">individual_stock</option>
                      <option value="defensive">defensive</option>
                      <option value="cash">cash</option>
                    </select>
                  </label>
                  <label>
                    Trim mode
                    <select name="trim_mode" defaultValue={r.trim_mode ?? "conservative"} className="mt-1 w-full rounded-lg border border-neutral-300 px-2 py-1 dark:border-neutral-700 dark:bg-neutral-800">
                      <option value="conservative">conservative</option>
                      <option value="balanced">balanced</option>
                      <option value="aggressive">aggressive</option>
                    </select>
                  </label>
                  <label>
                    Target %
                    <input type="number" step="0.1" name="target_pct" defaultValue={r.target_pct ?? ""} className="mt-1 w-full rounded-lg border border-neutral-300 px-2 py-1 dark:border-neutral-700 dark:bg-neutral-800" />
                  </label>
                  <label>
                    Warning %
                    <input type="number" step="0.1" name="warning_pct" defaultValue={r.warning_pct ?? ""} className="mt-1 w-full rounded-lg border border-neutral-300 px-2 py-1 dark:border-neutral-700 dark:bg-neutral-800" />
                  </label>
                  <label>
                    Trim %
                    <input type="number" step="0.1" name="trim_pct" defaultValue={r.trim_pct ?? ""} className="mt-1 w-full rounded-lg border border-neutral-300 px-2 py-1 dark:border-neutral-700 dark:bg-neutral-800" />
                  </label>
                  <label>
                    Stop adding %
                    <input type="number" step="0.1" name="stop_adding_pct" defaultValue={r.stop_adding_pct ?? ""} className="mt-1 w-full rounded-lg border border-neutral-300 px-2 py-1 dark:border-neutral-700 dark:bg-neutral-800" />
                  </label>
                  <label>
                    Gain alert: informational %
                    <input type="number" step="1" name="gain_alert_informational" defaultValue={r.gain_alert_informational ?? ""} className="mt-1 w-full rounded-lg border border-neutral-300 px-2 py-1 dark:border-neutral-700 dark:bg-neutral-800" />
                  </label>
                  <label>
                    Gain alert: review %
                    <input type="number" step="1" name="gain_alert_review" defaultValue={r.gain_alert_review ?? ""} className="mt-1 w-full rounded-lg border border-neutral-300 px-2 py-1 dark:border-neutral-700 dark:bg-neutral-800" />
                  </label>
                  <label>
                    Gain alert: profit-taking %
                    <input type="number" step="1" name="gain_alert_profit_taking" defaultValue={r.gain_alert_profit_taking ?? ""} className="mt-1 w-full rounded-lg border border-neutral-300 px-2 py-1 dark:border-neutral-700 dark:bg-neutral-800" />
                  </label>
                  <label>
                    Gain alert: strong %
                    <input type="number" step="1" name="gain_alert_strong" defaultValue={r.gain_alert_strong ?? ""} className="mt-1 w-full rounded-lg border border-neutral-300 px-2 py-1 dark:border-neutral-700 dark:bg-neutral-800" />
                  </label>
                </div>
                <button type="submit" className="w-full rounded-lg bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white dark:bg-neutral-100 dark:text-neutral-900">
                  Save {r.ticker}
                </button>
              </form>
              <form action={deleteRule} className="mt-2">
                <input type="hidden" name="id" value={r.id} />
                <button type="submit" className="w-full rounded-lg border border-rose-300 px-3 py-1.5 text-xs font-medium text-rose-700 dark:border-rose-800 dark:text-rose-400">
                  Delete override
                </button>
              </form>
            </details>
          ))}
          {overrides.length === 0 && <p className="text-xs text-neutral-400">No per-ticker overrides yet.</p>}
        </div>
      </section>

      <section className="rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
        <h2 className="mb-3 text-sm font-semibold">Add a new override</h2>
        <form action={upsertRule} className="grid grid-cols-2 gap-2 text-xs">
          <label className="col-span-2">
            Ticker
            <input type="text" name="ticker" placeholder="e.g. NVDA" className="mt-1 w-full rounded-lg border border-neutral-300 px-2 py-1.5 dark:border-neutral-700 dark:bg-neutral-800" />
          </label>
          <label>
            Asset class
            <select name="asset_class" defaultValue="individual_stock" className="mt-1 w-full rounded-lg border border-neutral-300 px-2 py-1.5 dark:border-neutral-700 dark:bg-neutral-800">
              <option value="broad_core_etf">broad_core_etf</option>
              <option value="sector_etf">sector_etf</option>
              <option value="individual_stock">individual_stock</option>
              <option value="defensive">defensive</option>
              <option value="cash">cash</option>
            </select>
          </label>
          <label>
            Trim mode
            <select name="trim_mode" defaultValue="conservative" className="mt-1 w-full rounded-lg border border-neutral-300 px-2 py-1.5 dark:border-neutral-700 dark:bg-neutral-800">
              <option value="conservative">conservative</option>
              <option value="balanced">balanced</option>
              <option value="aggressive">aggressive</option>
            </select>
          </label>
          <label>
            Target %
            <input type="number" step="0.1" name="target_pct" className="mt-1 w-full rounded-lg border border-neutral-300 px-2 py-1.5 dark:border-neutral-700 dark:bg-neutral-800" />
          </label>
          <label>
            Warning %
            <input type="number" step="0.1" name="warning_pct" className="mt-1 w-full rounded-lg border border-neutral-300 px-2 py-1.5 dark:border-neutral-700 dark:bg-neutral-800" />
          </label>
          <label>
            Trim %
            <input type="number" step="0.1" name="trim_pct" className="mt-1 w-full rounded-lg border border-neutral-300 px-2 py-1.5 dark:border-neutral-700 dark:bg-neutral-800" />
          </label>
          <label>
            Stop adding %
            <input type="number" step="0.1" name="stop_adding_pct" className="mt-1 w-full rounded-lg border border-neutral-300 px-2 py-1.5 dark:border-neutral-700 dark:bg-neutral-800" />
          </label>
          <button type="submit" className="col-span-2 w-full rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-800">
            Add / update override
          </button>
        </form>
      </section>
    </div>
  );
}
