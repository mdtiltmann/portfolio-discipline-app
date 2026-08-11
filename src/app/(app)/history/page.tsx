import { requireUser } from "@/lib/supabase/auth";
import { loadPortfolioData } from "@/lib/portfolio";
import { createClient } from "@/lib/supabase/server";
import SnapshotChart from "./SnapshotChart";

interface TransactionRow {
  id: string;
  holding_ticker: string;
  type: string;
  amount: number;
  destination_ticker: string | null;
  reason: string | null;
  status: string;
  occurred_at: string;
}

interface RecommendationRow {
  id: string;
  ticker: string | null;
  type: string;
  amount: number | null;
  rationale: string | null;
  status: string;
  generated_at: string;
}

interface SnapshotRow {
  id: string;
  snapshot_date: string;
  total_value: number;
  total_gain: number | null;
  contribution_made: number | null;
}

const STATUS_STYLE: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
  recommended: "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
  accepted: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300",
  recorded: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300",
  ignored: "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400",
  adjusted: "bg-sky-100 text-sky-800 dark:bg-sky-950/40 dark:text-sky-300",
  remind_later: "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400",
};

export default async function HistoryPage() {
  const user = await requireUser();
  const data = await loadPortfolioData(user.id);
  const supabase = await createClient();

  let transactions: TransactionRow[] = [];
  let recommendations: RecommendationRow[] = [];
  let snapshots: SnapshotRow[] = [];

  if (data.portfolioId) {
    const [{ data: txRows }, { data: recRows }, { data: snapRows }] = await Promise.all([
      supabase
        .from("transactions")
        .select("*")
        .eq("portfolio_id", data.portfolioId)
        .order("occurred_at", { ascending: false })
        .limit(100),
      supabase
        .from("recommendations")
        .select("*")
        .eq("portfolio_id", data.portfolioId)
        .order("generated_at", { ascending: false })
        .limit(100),
      supabase
        .from("portfolio_snapshots")
        .select("*")
        .eq("portfolio_id", data.portfolioId)
        .order("snapshot_date", { ascending: true })
        .limit(60),
    ]);
    transactions = (txRows ?? []) as TransactionRow[];
    recommendations = (recRows ?? []) as RecommendationRow[];
    snapshots = (snapRows ?? []) as SnapshotRow[];
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4">
      <h1 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">History</h1>

      <SnapshotChart snapshots={snapshots} />

      <section className="rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
        <h2 className="mb-3 text-sm font-semibold">Recommendations</h2>
        {recommendations.length === 0 && <p className="text-sm text-neutral-500">None yet.</p>}
        <div className="space-y-2">
          {recommendations.map((r) => (
            <div key={r.id} className="rounded-xl border border-neutral-100 p-3 text-sm dark:border-neutral-800">
              <div className="flex items-center justify-between">
                <span className="font-medium">
                  {r.type.toUpperCase()} {r.ticker ? `— ${r.ticker}` : ""}
                </span>
                <span className={`rounded-full px-2 py-0.5 text-[11px] ${STATUS_STYLE[r.status] ?? ""}`}>
                  {r.status}
                </span>
              </div>
              {r.amount != null && <p className="text-xs text-neutral-500">€{Number(r.amount).toLocaleString()}</p>}
              {r.rationale && <p className="mt-1 text-xs text-neutral-600 dark:text-neutral-400">{r.rationale}</p>}
              <p className="mt-1 text-[11px] text-neutral-400">{new Date(r.generated_at).toLocaleDateString()}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
        <h2 className="mb-3 text-sm font-semibold">Transactions</h2>
        {transactions.length === 0 && <p className="text-sm text-neutral-500">None yet.</p>}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-xs text-neutral-500">
                <th className="pb-2 pr-2">Date</th>
                <th className="pb-2 pr-2">Ticker</th>
                <th className="pb-2 pr-2">Type</th>
                <th className="pb-2 pr-2 text-right">Amount</th>
                <th className="pb-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((t) => (
                <tr key={t.id} className="border-t border-neutral-100 dark:border-neutral-800">
                  <td className="py-1.5 pr-2 text-xs">{new Date(t.occurred_at).toLocaleDateString()}</td>
                  <td className="py-1.5 pr-2 font-medium">{t.holding_ticker}</td>
                  <td className="py-1.5 pr-2 text-xs">{t.type}</td>
                  <td className="py-1.5 pr-2 text-right">€{Number(t.amount).toLocaleString()}</td>
                  <td className="py-1.5">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] ${STATUS_STYLE[t.status] ?? ""}`}>
                      {t.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
