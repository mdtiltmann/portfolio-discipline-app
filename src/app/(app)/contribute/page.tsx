import { requireUser } from "@/lib/supabase/auth";
import { loadPortfolioData, computeAllStatuses } from "@/lib/portfolio";
import { computeMonthlyContribution, allocateContribution } from "@/lib/engine";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

async function acceptPlan(formData: FormData) {
  "use server";
  const user = await requireUser();
  const data = await loadPortfolioData(user.id);
  if (!data.portfolioId || !data.schedule) return;

  const amount = computeMonthlyContribution(data.schedule);
  const statuses = computeAllStatuses(data);
  const targets = statuses.map((s) => ({ key: s.holding.ticker, status: s.status }));
  const plan = allocateContribution(amount, targets);

  const supabase = await createClient();
  await supabase.from("recommendations").insert({
    portfolio_id: data.portfolioId,
    type: "buy",
    amount,
    destination_json: plan.allocations,
    rationale: "Monthly contribution allocated to underweight positions per rules engine.",
    status: "accepted",
    resolved_at: new Date().toISOString(),
  });

  for (const a of plan.allocations) {
    await supabase.from("transactions").insert({
      portfolio_id: data.portfolioId,
      holding_ticker: a.ticker,
      type: "contribution_buy",
      amount: a.amount,
      status: "accepted",
      reason: "Monthly contribution plan accepted",
    });
  }

  revalidatePath("/contribute");
  void formData;
}

export default async function ContributePage() {
  const user = await requireUser();
  const data = await loadPortfolioData(user.id);
  const statuses = computeAllStatuses(data);

  if (!data.schedule) {
    return (
      <div className="mx-auto max-w-2xl p-4 text-sm text-neutral-500">
        No contribution schedule set up yet. Add one in Settings.
      </div>
    );
  }

  const amount = computeMonthlyContribution(data.schedule);
  const targets = statuses.map((s) => ({ key: s.holding.ticker, status: s.status }));
  const plan = allocateContribution(amount, targets);

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4">
      <h1 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">Monthly contribution plan</h1>
      <div className="rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
        <p className="text-xs text-neutral-500">This month&apos;s contribution</p>
        <p className="text-2xl font-semibold text-neutral-900 dark:text-neutral-50">€{amount.toFixed(0)}</p>
      </div>

      <div className="rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
        <h2 className="mb-2 text-sm font-semibold">Suggested allocation</h2>
        {plan.allocations.length === 0 && (
          <p className="text-sm text-neutral-500">Nothing is underweight right now — consider parking this in cash/ERNE.</p>
        )}
        <ul className="space-y-1.5">
          {plan.allocations.map((a) => (
            <li key={a.ticker} className="flex justify-between text-sm">
              <span className="font-medium text-emerald-700 dark:text-emerald-400">{a.ticker}</span>
              <span>€{a.amount.toFixed(0)}</span>
            </li>
          ))}
        </ul>
        {plan.doNotAddTo.length > 0 && (
          <p className="mt-3 text-xs text-neutral-500">
            Skipped (STOP_ADDING / TRIM / REVIEW): {plan.doNotAddTo.join(", ")}
          </p>
        )}
      </div>

      <form action={acceptPlan}>
        <button
          type="submit"
          className="w-full rounded-xl bg-neutral-900 px-4 py-3 text-sm font-medium text-white dark:bg-neutral-100 dark:text-neutral-900"
        >
          Accept & record this plan
        </button>
      </form>

      <p className="text-center text-xs text-neutral-400">
        New contributions are the preferred rebalancing tool — no need to sell winners to fund underweight buckets.
      </p>
    </div>
  );
}
