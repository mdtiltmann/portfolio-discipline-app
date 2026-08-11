import { requireUser } from "@/lib/supabase/auth";
import { loadPortfolioData } from "@/lib/portfolio";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import Link from "next/link";

async function loadSampleData() {
  "use server";
  const user = await requireUser();
  const supabase = await createClient();

  // Portfolio (reuse existing if present)
  const { data: existingPortfolios } = await supabase
    .from("portfolios")
    .select("id")
    .eq("user_id", user.id)
    .limit(1);

  let portfolioId = existingPortfolios?.[0]?.id as string | undefined;
  if (!portfolioId) {
    const { data: newPortfolio } = await supabase
      .from("portfolios")
      .insert({ user_id: user.id, name: "Main Portfolio", base_currency: "EUR" })
      .select("id")
      .single();
    portfolioId = newPortfolio?.id;
  }
  if (!portfolioId) return;

  const targets = [
    { bucket_key: "VWCE_CORE", label: "VWCE (Global Core)", target_min_pct: 60, target_max_pct: 65, tickers: ["VWCE"], sort_order: 1 },
    { bucket_key: "WSML", label: "WSML (Small Cap)", target_min_pct: 5, target_max_pct: 7, tickers: ["WSML"], sort_order: 2 },
    { bucket_key: "EMIM", label: "EMIM (Emerging Markets)", target_min_pct: 7, target_max_pct: 9, tickers: ["EMIM"], sort_order: 3 },
    { bucket_key: "IITU", label: "IITU (Tech Sector)", target_min_pct: 6, target_max_pct: 8, tickers: ["IITU"], sort_order: 4 },
    { bucket_key: "GROWTH_STOCKS", label: "Growth Stocks", target_min_pct: 8, target_max_pct: 12, tickers: ["NVDA"], sort_order: 5 },
    { bucket_key: "DEFENCE", label: "Defence", target_min_pct: 7, target_max_pct: 10, tickers: ["AIR"], sort_order: 6 },
    { bucket_key: "GOLD", label: "Gold", target_min_pct: 3, target_max_pct: 5, tickers: ["SGLN"], sort_order: 7 },
    { bucket_key: "CASH", label: "Cash", target_min_pct: 3, target_max_pct: 5, tickers: ["ERNE"], sort_order: 8 },
  ];
  for (const t of targets) {
    await supabase.from("allocation_targets").upsert({ user_id: user.id, ...t }, { onConflict: "user_id,bucket_key" });
  }

  const today = new Date().toISOString().slice(0, 10);
  const { data: existingSchedule } = await supabase
    .from("contribution_schedule")
    .select("id")
    .eq("user_id", user.id)
    .limit(1);
  if (!existingSchedule?.length) {
    await supabase.from("contribution_schedule").insert({
      user_id: user.id,
      start_date: today,
      base_monthly: 700,
      annual_increase_pct: 10,
      cap_monthly: 1025,
    });
  }

  const { data: existingSettings } = await supabase.from("settings").select("id").eq("user_id", user.id).limit(1);
  if (!existingSettings?.length) {
    await supabase.from("settings").insert({ user_id: user.id, currency: "EUR" });
  }

  const holdings = [
    { ticker: "VWCE", name: "Vanguard FTSE All-World", asset_class: "broad_core_etf", quantity: 450, current_value: 32000, cost_basis: 24000 },
    { ticker: "WSML", name: "iShares MSCI World Small Cap", asset_class: "broad_core_etf", quantity: 300, current_value: 3200, cost_basis: 2600 },
    { ticker: "EMIM", name: "iShares Core MSCI EM IMI", asset_class: "broad_core_etf", quantity: 900, current_value: 4200, cost_basis: 3700 },
    { ticker: "IITU", name: "iShares S&P 500 Info Tech", asset_class: "sector_etf", quantity: 60, current_value: 3600, cost_basis: 2500 },
    { ticker: "SGLN", name: "iShares Physical Gold", asset_class: "defensive", quantity: 40, current_value: 1900, cost_basis: 1500 },
    { ticker: "ERNE", name: "iShares EUR Ultrashort Bond (cash proxy)", asset_class: "cash", quantity: 1800, current_value: 1800, cost_basis: 1800 },
    { ticker: "NVDA", name: "NVIDIA Corp", asset_class: "individual_stock", quantity: 25, current_value: 4100, cost_basis: 1450 },
    { ticker: "AIR", name: "Airbus SE", asset_class: "individual_stock", quantity: 20, current_value: 3400, cost_basis: 2600 },
  ];
  for (const h of holdings) {
    await supabase.from("holdings").upsert({ portfolio_id: portfolioId, ...h }, { onConflict: "portfolio_id,ticker" });
  }

  revalidatePath("/", "layout");
}

async function updateSettings(formData: FormData) {
  "use server";
  const user = await requireUser();
  const supabase = await createClient();

  const holdTrimInCash = formData.get("hold_trim_proceeds_in_cash") === "on";
  const trimMode = String(formData.get("trim_mode") ?? "conservative");

  const risk_limits = {
    single_stock_warn: Number(formData.get("single_stock_warn")) || 7,
    single_stock_critical: Number(formData.get("single_stock_critical")) || 10,
    sector_etf_trim: Number(formData.get("sector_etf_trim")) || 10,
    single_sector_max: Number(formData.get("single_sector_max")) || 35,
    us_exposure_max: Number(formData.get("us_exposure_max")) || 70,
    defence_bucket_max: Number(formData.get("defence_bucket_max")) || 12,
    cash_min: Number(formData.get("cash_min")) || 2,
    vwce_min: Number(formData.get("vwce_min")) || 50,
  };

  await supabase.from("settings").upsert(
    {
      user_id: user.id,
      currency: "EUR",
      hold_trim_proceeds_in_cash: holdTrimInCash,
      trim_hold_period_days: Number(formData.get("trim_hold_period_days")) || 60,
      review_interval_months: Number(formData.get("review_interval_months")) || 6,
      risk_limits,
    },
    { onConflict: "user_id" }
  );

  const { data: rules } = await supabase.from("asset_rules").select("id").eq("user_id", user.id).is("ticker", null).limit(1);
  if (!rules?.length) {
    await supabase.from("asset_rules").insert({
      user_id: user.id,
      asset_class: "individual_stock",
      ticker: null,
      trim_mode: trimMode,
    });
  } else {
    await supabase.from("asset_rules").update({ trim_mode: trimMode }).eq("user_id", user.id).is("ticker", null);
  }

  revalidatePath("/settings");
}

async function updateContributionSchedule(formData: FormData) {
  "use server";
  const user = await requireUser();
  const supabase = await createClient();

  await supabase.from("contribution_schedule").upsert(
    {
      user_id: user.id,
      start_date: String(formData.get("start_date")),
      base_monthly: Number(formData.get("base_monthly")) || 700,
      annual_increase_pct: Number(formData.get("annual_increase_pct")) || 10,
      cap_monthly: Number(formData.get("cap_monthly")) || 1025,
    },
    { onConflict: "user_id" }
  );

  revalidatePath("/settings");
  revalidatePath("/contribute");
}

export default async function SettingsPage() {
  const user = await requireUser();
  const data = await loadPortfolioData(user.id);

  const limits = data.settings.risk_limits;

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">Settings</h1>
        <Link href="/settings/rules" className="text-xs text-neutral-500 hover:underline">
          Per-ticker rules &rarr;
        </Link>
      </div>

      <section className="rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
        <h2 className="mb-2 text-sm font-semibold">Sample data</h2>
        <p className="mb-3 text-xs text-neutral-500">
          Populate allocation targets, a contribution schedule, settings, and example holdings (VWCE, WSML, EMIM,
          IITU, SGLN, ERNE, NVDA, AIR) so you can explore the app.
        </p>
        <form action={loadSampleData}>
          <button
            type="submit"
            className="w-full rounded-xl bg-emerald-700 px-4 py-3 text-sm font-medium text-white hover:bg-emerald-800"
          >
            Load sample data
          </button>
        </form>
      </section>

      <section className="rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
        <h2 className="mb-2 text-sm font-semibold">Contribution schedule</h2>
        <form action={updateContributionSchedule} className="space-y-2 text-sm">
          <label className="block">
            Start date
            <input
              type="date"
              name="start_date"
              defaultValue={data.schedule?.start_date ?? new Date().toISOString().slice(0, 10)}
              className="mt-1 w-full rounded-lg border border-neutral-300 px-2 py-1.5 dark:border-neutral-700 dark:bg-neutral-800"
            />
          </label>
          <label className="block">
            Base monthly (€)
            <input
              type="number"
              name="base_monthly"
              defaultValue={data.schedule?.base_monthly ?? 700}
              className="mt-1 w-full rounded-lg border border-neutral-300 px-2 py-1.5 dark:border-neutral-700 dark:bg-neutral-800"
            />
          </label>
          <label className="block">
            Annual increase (%)
            <input
              type="number"
              name="annual_increase_pct"
              defaultValue={data.schedule?.annual_increase_pct ?? 10}
              className="mt-1 w-full rounded-lg border border-neutral-300 px-2 py-1.5 dark:border-neutral-700 dark:bg-neutral-800"
            />
          </label>
          <label className="block">
            Cap monthly (€)
            <input
              type="number"
              name="cap_monthly"
              defaultValue={data.schedule?.cap_monthly ?? 1025}
              className="mt-1 w-full rounded-lg border border-neutral-300 px-2 py-1.5 dark:border-neutral-700 dark:bg-neutral-800"
            />
          </label>
          <button type="submit" className="w-full rounded-xl bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white dark:bg-neutral-100 dark:text-neutral-900">
            Save schedule
          </button>
        </form>
      </section>

      <section className="rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
        <h2 className="mb-2 text-sm font-semibold">Risk limits & trim behavior</h2>
        <form action={updateSettings} className="space-y-2 text-sm">
          <div className="grid grid-cols-2 gap-2">
            <label>
              Single stock warn %
              <input type="number" name="single_stock_warn" defaultValue={limits.single_stock_warn} className="mt-1 w-full rounded-lg border border-neutral-300 px-2 py-1.5 dark:border-neutral-700 dark:bg-neutral-800" />
            </label>
            <label>
              Single stock critical %
              <input type="number" name="single_stock_critical" defaultValue={limits.single_stock_critical} className="mt-1 w-full rounded-lg border border-neutral-300 px-2 py-1.5 dark:border-neutral-700 dark:bg-neutral-800" />
            </label>
            <label>
              Sector ETF trim %
              <input type="number" name="sector_etf_trim" defaultValue={limits.sector_etf_trim} className="mt-1 w-full rounded-lg border border-neutral-300 px-2 py-1.5 dark:border-neutral-700 dark:bg-neutral-800" />
            </label>
            <label>
              Single sector max %
              <input type="number" name="single_sector_max" defaultValue={limits.single_sector_max} className="mt-1 w-full rounded-lg border border-neutral-300 px-2 py-1.5 dark:border-neutral-700 dark:bg-neutral-800" />
            </label>
            <label>
              US exposure max %
              <input type="number" name="us_exposure_max" defaultValue={limits.us_exposure_max} className="mt-1 w-full rounded-lg border border-neutral-300 px-2 py-1.5 dark:border-neutral-700 dark:bg-neutral-800" />
            </label>
            <label>
              Defence bucket max %
              <input type="number" name="defence_bucket_max" defaultValue={limits.defence_bucket_max} className="mt-1 w-full rounded-lg border border-neutral-300 px-2 py-1.5 dark:border-neutral-700 dark:bg-neutral-800" />
            </label>
            <label>
              Cash min %
              <input type="number" name="cash_min" defaultValue={limits.cash_min} className="mt-1 w-full rounded-lg border border-neutral-300 px-2 py-1.5 dark:border-neutral-700 dark:bg-neutral-800" />
            </label>
            <label>
              VWCE min %
              <input type="number" name="vwce_min" defaultValue={limits.vwce_min} className="mt-1 w-full rounded-lg border border-neutral-300 px-2 py-1.5 dark:border-neutral-700 dark:bg-neutral-800" />
            </label>
          </div>

          <label className="block pt-2">
            Trim mode
            <select name="trim_mode" defaultValue="conservative" className="mt-1 w-full rounded-lg border border-neutral-300 px-2 py-1.5 dark:border-neutral-700 dark:bg-neutral-800">
              <option value="conservative">Conservative — trim to target</option>
              <option value="balanced">Balanced — above-target + 10% of remainder</option>
              <option value="aggressive">Aggressive — ~22.5% of position</option>
            </select>
          </label>

          <label className="block">
            Trim hold period (days)
            <input type="number" name="trim_hold_period_days" defaultValue={data.settings.trim_hold_period_days} className="mt-1 w-full rounded-lg border border-neutral-300 px-2 py-1.5 dark:border-neutral-700 dark:bg-neutral-800" />
          </label>

          <label className="flex items-center gap-2 pt-1">
            <input type="checkbox" name="hold_trim_proceeds_in_cash" defaultChecked={data.settings.hold_trim_proceeds_in_cash} />
            Hold trim proceeds in cash before redeploying
          </label>

          <label className="block">
            Review interval (months)
            <input type="number" name="review_interval_months" defaultValue={data.settings.review_interval_months} className="mt-1 w-full rounded-lg border border-neutral-300 px-2 py-1.5 dark:border-neutral-700 dark:bg-neutral-800" />
          </label>

          <button type="submit" className="w-full rounded-xl bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white dark:bg-neutral-100 dark:text-neutral-900">
            Save settings
          </button>
        </form>
      </section>
    </div>
  );
}
