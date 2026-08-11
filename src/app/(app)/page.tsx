import { requireUser } from "@/lib/supabase/auth";
import { loadPortfolioData, computeAllStatuses, computeAlerts } from "@/lib/portfolio";
import { computeMonthlyContribution } from "@/lib/engine";
import Link from "next/link";
import RefreshPricesButton from "@/components/RefreshPricesButton";

function statusColor(status: string) {
  switch (status) {
    case "BUY":
      return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300";
    case "HOLD":
      return "bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300";
    case "STOP_ADDING":
    case "REVIEW":
      return "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300";
    case "TRIM":
      return "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300";
    default:
      return "bg-neutral-100 text-neutral-700";
  }
}

export default async function DashboardPage() {
  const user = await requireUser();
  const data = await loadPortfolioData(user.id);
  const statuses = computeAllStatuses(data);
  const alerts = computeAlerts(data);

  const totalGain = data.totalValue - data.totalCostBasis;
  const totalGainPct = data.totalCostBasis > 0 ? (totalGain / data.totalCostBasis) * 100 : 0;

  const monthlyContribution = data.schedule ? computeMonthlyContribution(data.schedule) : null;

  const overweight = [...statuses].sort((a, b) => b.status.amountAboveTarget - a.status.amountAboveTarget).slice(0, 3);
  const underweight = [...statuses].sort((a, b) => b.status.amountBelowTarget - a.status.amountBelowTarget).slice(0, 3);
  const trimCandidates = statuses.filter((s) => s.status.status === "TRIM");
  const bigGains = statuses.filter((s) => s.gain.level === "profit_taking" || s.gain.level === "strong");

  const outOfTarget = statuses.filter((s) => s.status.status === "TRIM" || s.status.status === "REVIEW").length;
  const healthScore = statuses.length
    ? Math.max(0, Math.round(100 - (outOfTarget / statuses.length) * 60 - Math.min(30, alerts.length * 5)))
    : 100;

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4">
      {data.holdings.length === 0 && (
        <div className="rounded-xl border border-dashed border-neutral-300 p-4 text-sm text-neutral-500 dark:border-neutral-700">
          No holdings yet. Go to <Link href="/settings" className="underline">Settings</Link> and click
          “Load sample data”, or add holdings via <Link href="/import" className="underline">Screenshot Import</Link>.
        </div>
      )}

      <section className="rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-neutral-500">Portfolio value</p>
            <p className="text-3xl font-semibold text-neutral-900 dark:text-neutral-50">
              €{data.totalValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </p>
            <p className={`text-sm ${totalGain >= 0 ? "text-emerald-600" : "text-red-600"}`}>
              {totalGain >= 0 ? "+" : ""}
              €{totalGain.toLocaleString(undefined, { maximumFractionDigits: 0 })} ({totalGainPct.toFixed(1)}%)
            </p>
          </div>
          <RefreshPricesButton />
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
          <p className="text-xs text-neutral-500">This month&apos;s contribution</p>
          <p className="text-xl font-semibold text-neutral-900 dark:text-neutral-50">
            {monthlyContribution != null ? `€${monthlyContribution.toFixed(0)}` : "—"}
          </p>
          {data.schedule && (
            <p className="text-xs text-neutral-500">
              Cap €{data.schedule.cap_monthly}/mo, +{data.schedule.annual_increase_pct}%/yr
            </p>
          )}
          <Link href="/contribute" className="mt-2 inline-block text-xs font-medium text-emerald-700 hover:underline dark:text-emerald-400">
            What should I buy this month? →
          </Link>
        </div>
        <div className="rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
          <p className="text-xs text-neutral-500">Health score</p>
          <p className="text-xl font-semibold text-neutral-900 dark:text-neutral-50">{healthScore}/100</p>
          <p className="text-xs text-neutral-500">{alerts.length} active alert(s)</p>
        </div>
      </section>

      <section className="rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
        <h2 className="mb-2 text-sm font-semibold text-neutral-900 dark:text-neutral-50">Allocation summary</h2>
        <ul className="space-y-1.5">
          {statuses.map(({ holding, status }) => (
            <li key={holding.ticker} className="flex items-center gap-2 text-sm">
              <span className="w-14 shrink-0 font-medium text-neutral-700 dark:text-neutral-300">{holding.ticker}</span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800">
                <div
                  className="h-full bg-neutral-400 dark:bg-neutral-500"
                  style={{ width: `${Math.min(100, status.currentPct)}%` }}
                />
              </div>
              <span className="w-12 shrink-0 text-right text-xs text-neutral-500">{status.currentPct.toFixed(1)}%</span>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${statusColor(status.status)}`}>
                {status.status}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {(overweight.some((o) => o.status.amountAboveTarget > 0) || underweight.some((u) => u.status.amountBelowTarget > 0)) && (
        <section className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
            <h3 className="mb-1 text-xs font-semibold text-neutral-500">Top overweight</h3>
            {overweight.filter((o) => o.status.amountAboveTarget > 0).map((o) => (
              <p key={o.holding.ticker} className="text-sm text-red-600">
                {o.holding.ticker} +€{o.status.amountAboveTarget.toFixed(0)}
              </p>
            ))}
          </div>
          <div className="rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
            <h3 className="mb-1 text-xs font-semibold text-neutral-500">Top underweight</h3>
            {underweight.filter((u) => u.status.amountBelowTarget > 0).map((u) => (
              <p key={u.holding.ticker} className="text-sm text-emerald-600">
                {u.holding.ticker} -€{u.status.amountBelowTarget.toFixed(0)}
              </p>
            ))}
          </div>
        </section>
      )}

      {bigGains.length > 0 && (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/30">
          <h3 className="mb-1 text-sm font-semibold text-amber-800 dark:text-amber-300">Large gains</h3>
          {bigGains.map((g) => (
            <p key={g.holding.ticker} className="text-xs text-amber-800 dark:text-amber-300">{g.rationale}</p>
          ))}
        </section>
      )}

      {trimCandidates.length > 0 && (
        <section className="rounded-2xl border border-red-200 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950/30">
          <h3 className="mb-1 text-sm font-semibold text-red-800 dark:text-red-300">Trim candidates</h3>
          {trimCandidates.map((t) => (
            <p key={t.holding.ticker} className="text-xs text-red-800 dark:text-red-300">{t.rationale}</p>
          ))}
        </section>
      )}

      <p className="text-center text-xs text-neutral-400">
        Discipline over impulse: don&apos;t chase price, don&apos;t panic sell, rebalance with new contributions.
      </p>
    </div>
  );
}
