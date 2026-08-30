import { requireUser } from "@/lib/supabase/auth";
import { loadPortfolioData, computeAllStatusesWithRisk } from "@/lib/portfolio";
import { computeTrimAmount, DEFAULT_RISK_PROFILE } from "@/lib/engine";
import RefreshPricesButton from "@/components/RefreshPricesButton";
import ManualHoldingForm from "./ManualHoldingForm";

function statusColor(status: string) {
  switch (status) {
    case "BUY":
      return "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300";
    case "HOLD":
      return "border-neutral-300 bg-neutral-50 text-neutral-700 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300";
    case "STOP_ADDING":
    case "REVIEW":
      return "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300";
    case "TRIM":
      return "border-red-300 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300";
    default:
      return "border-neutral-300 bg-neutral-50";
  }
}

export default async function HoldingsPage() {
  const user = await requireUser();
  const data = await loadPortfolioData(user.id);
  const statuses = await computeAllStatusesWithRisk(data);
  const profileName = data.settings.risk_profile ?? DEFAULT_RISK_PROFILE;

  return (
    <div className="mx-auto max-w-2xl space-y-3 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">Holdings</h1>
        <RefreshPricesButton />
      </div>
      <ManualHoldingForm existingTickers={data.holdings.map((h) => h.ticker)} />

      <p className="rounded-xl border border-neutral-200 bg-neutral-50 p-3 text-[11px] leading-relaxed text-neutral-500 dark:border-neutral-800 dark:bg-neutral-900/60 dark:text-neutral-400">
        Status here is about <strong>position sizing</strong>, not price direction — how much of your total portfolio
        this holding represents versus a target weight. For stocks and sector ETFs, that target is volatility-adjusted
        (a shakier holding gets a smaller target) and the trim trigger uses the 5/25 rebalance-band rule, under your{" "}
        <strong>{profileName}</strong> risk profile (change it in Settings). This is separate from the technical
        Buy/Sell signals on the Signals screen.
      </p>

      {statuses.length === 0 && <p className="text-sm text-neutral-500">No holdings yet — add one above.</p>}
      {statuses.map(({ holding, status, gain, rationale, volatility }) => {
        const gainEur = gain.gainEur;
        const trimAmount =
          status.status === "TRIM" && status.targetPct != null
            ? computeTrimAmount(holding, status.targetPct, data.totalValue, "conservative")
            : 0;

        return (
          <div key={holding.ticker} className={`rounded-2xl border p-4 ${statusColor(status.status)}`}>
            <div className="flex items-start justify-between">
              <div>
                <p className="font-semibold">{holding.ticker}</p>
                {holding.name && <p className="text-xs opacity-70">{holding.name}</p>}
              </div>
              <span className="rounded-full bg-white/60 px-2 py-0.5 text-[10px] font-semibold dark:bg-black/20">
                {status.status}
              </span>
            </div>

            <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
              <span>Current value</span>
              <span className="text-right font-medium">€{holding.current_value.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
              <span>Current %</span>
              <span className="text-right font-medium">{status.currentPct.toFixed(1)}%</span>
              <span>Target %</span>
              <span className="text-right font-medium">
                {status.targetPct != null
                  ? `${status.targetPct.toFixed(1)}%`
                  : status.targetMinPct != null
                  ? `${status.targetMinPct.toFixed(1)}-${status.targetMaxPct?.toFixed(1)}%`
                  : "—"}
              </span>
              {volatility != null && (
                <>
                  <span>Annualized volatility</span>
                  <span className="text-right font-medium">{(volatility * 100).toFixed(0)}%</span>
                </>
              )}
              <span>Gain</span>
              <span className="text-right font-medium">
                {holding.cost_basis != null ? `€${gainEur.toFixed(0)} (${gain.gainPct.toFixed(1)}%)` : "—"}
              </span>
              <span>Cost basis</span>
              <span className="text-right font-medium">
                {holding.cost_basis != null ? `€${holding.cost_basis.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : "—"}
              </span>
              {status.status === "TRIM" && (
                <>
                  <span>Suggested trim</span>
                  <span className="text-right font-medium">€{trimAmount.toFixed(0)}</span>
                </>
              )}
            </div>

            <p className="mt-2 text-xs leading-relaxed opacity-90">{rationale}</p>
            <p className="mt-1 text-[10px] opacity-60">
              {holding.last_price_updated_at
                ? `Price last updated ${new Date(holding.last_price_updated_at).toLocaleString()}`
                : "Price never refreshed from market data"}
            </p>
          </div>
        );
      })}
    </div>
  );
}
