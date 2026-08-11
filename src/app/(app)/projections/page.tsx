import { requireUser } from "@/lib/supabase/auth";
import { loadPortfolioData } from "@/lib/portfolio";
import ProjectionsClient from "./ProjectionsClient";

export default async function ProjectionsPage() {
  const user = await requireUser();
  const data = await loadPortfolioData(user.id);

  const monthly = data.schedule?.base_monthly ?? 700;
  const annualIncreasePct = data.schedule?.annual_increase_pct ?? 10;
  const capMonthly = data.schedule?.cap_monthly ?? 1025;

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4">
      <h1 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">Projections</h1>
      <ProjectionsClient
        startingValue={data.totalValue}
        baseMonthly={monthly}
        annualIncreasePct={annualIncreasePct}
        capMonthly={capMonthly}
      />
    </div>
  );
}
