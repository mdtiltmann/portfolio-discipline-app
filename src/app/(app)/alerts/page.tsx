import { requireUser } from "@/lib/supabase/auth";
import { loadPortfolioData, computeAlerts } from "@/lib/portfolio";
import { createClient } from "@/lib/supabase/server";
import { MarkReadButton, MarkAllReadButton } from "./MarkReadButton";

const SEVERITY_STYLE: Record<string, string> = {
  critical: "border-red-300 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300",
  warning: "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300",
  info: "border-neutral-300 bg-neutral-50 text-neutral-700 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300",
};

export default async function AlertsPage() {
  const user = await requireUser();
  const data = await loadPortfolioData(user.id);
  const liveAlerts = computeAlerts(data);

  let storedAlerts: { id: string; severity: string; message: string; category: string; is_read: boolean }[] = [];
  if (data.portfolioId) {
    const supabase = await createClient();
    const { data: rows } = await supabase
      .from("alerts")
      .select("*")
      .eq("portfolio_id", data.portfolioId)
      .order("created_at", { ascending: false });
    storedAlerts = rows ?? [];
  }

  const groups = ["critical", "warning", "info"] as const;

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">Alerts</h1>
        {data.portfolioId && storedAlerts.some((a) => !a.is_read) && (
          <MarkAllReadButton portfolioId={data.portfolioId} />
        )}
      </div>

      {groups.map((sev) => {
        const live = liveAlerts.filter((a) => a.severity === sev);
        const stored = storedAlerts.filter((a) => a.severity === sev);
        if (live.length === 0 && stored.length === 0) return null;
        return (
          <section key={sev}>
            <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">{sev}</h2>
            <div className="space-y-2">
              {live.map((a, i) => (
                <div key={`live-${i}`} className={`rounded-xl border p-3 text-sm ${SEVERITY_STYLE[sev]}`}>
                  {a.message}
                </div>
              ))}
              {stored.map((a) => (
                <div key={a.id} className={`flex items-start justify-between gap-2 rounded-xl border p-3 text-sm ${SEVERITY_STYLE[sev]} ${a.is_read ? "opacity-60" : ""}`}>
                  <span>{a.message}</span>
                  {!a.is_read && <MarkReadButton alertId={a.id} />}
                </div>
              ))}
            </div>
          </section>
        );
      })}

      {liveAlerts.length === 0 && storedAlerts.length === 0 && (
        <p className="text-sm text-neutral-500">No active alerts. Portfolio is within configured limits.</p>
      )}

      <p className="text-center text-xs text-neutral-400">
        Alerts flag concentration and drift — news and headlines never trigger a trade directly, only inform the rationale.
      </p>
    </div>
  );
}
