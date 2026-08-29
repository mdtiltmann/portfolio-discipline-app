import { requireUser } from "@/lib/supabase/auth";
import { loadPortfolioData } from "@/lib/portfolio";
import Link from "next/link";
import TechnicalPanel from "@/components/TechnicalPanel";

export default async function SignalsPage() {
  const user = await requireUser();
  const data = await loadPortfolioData(user.id);
  const holdings = [...data.holdings].sort((a, b) => a.ticker.localeCompare(b.ticker));

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4">
      <div className="flex items-center gap-2.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-neutral-900 text-neutral-50 dark:bg-neutral-100 dark:text-neutral-900">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 17l6-6 4 4 8-8" />
            <path d="M17 7h4v4" />
          </svg>
        </span>
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">Technicals</p>
          <h1 className="text-lg font-semibold leading-tight text-neutral-900 dark:text-neutral-50">Signals</h1>
        </div>
      </div>

      <p className="rounded-xl border border-neutral-200 bg-neutral-50 p-3 text-xs leading-relaxed text-neutral-500 dark:border-neutral-800 dark:bg-neutral-900/60 dark:text-neutral-400">
        Technical signals are computed from public price data using standard formulas — informational only, not
        financial advice.
      </p>

      {holdings.length === 0 && (
        <div className="rounded-xl border border-neutral-200 bg-white p-5 text-center text-sm text-neutral-500 dark:border-neutral-800 dark:bg-neutral-900">
          No holdings yet. Go to <Link href="/holdings" className="font-medium text-neutral-900 underline underline-offset-2 dark:text-neutral-100">Holdings</Link> to add tickers you own —
          signals will appear here once you do.
        </div>
      )}

      <div className="space-y-3">
        {holdings.map((h) => (
          <section
            key={h.ticker}
            className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900"
          >
            <div className="mb-2 flex items-baseline justify-between gap-2">
              <p className="truncate text-sm font-semibold text-neutral-900 dark:text-neutral-50">
                {h.name || h.ticker}
              </p>
              <p className="shrink-0 rounded-md bg-neutral-100 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
                {h.ticker}
              </p>
            </div>
            <TechnicalPanel ticker={h.ticker} />
          </section>
        ))}
      </div>
    </div>
  );
}
