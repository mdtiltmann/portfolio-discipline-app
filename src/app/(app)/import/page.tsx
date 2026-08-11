import { requireUser } from "@/lib/supabase/auth";
import { loadPortfolioData } from "@/lib/portfolio";
import ImportClient from "./ImportClient";

export default async function ImportPage() {
  const user = await requireUser();
  const data = await loadPortfolioData(user.id);

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4">
      <h1 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">Screenshot import</h1>
      <p className="text-xs text-neutral-500">
        Upload broker app screenshots. Claude extracts ticker, quantity, value, cost basis and gain — review before
        saving to holdings.
      </p>
      <ImportClient portfolioId={data.portfolioId} />
    </div>
  );
}
