import { requireUser } from "@/lib/supabase/auth";
import { loadPortfolioData } from "@/lib/portfolio";
import { createClient } from "@/lib/supabase/server";
import AppShell from "@/components/AppShell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

  let unreadAlertCount = 0;
  const data = await loadPortfolioData(user.id);
  if (data.portfolioId) {
    const supabase = await createClient();
    const { count } = await supabase
      .from("alerts")
      .select("id", { count: "exact", head: true })
      .eq("portfolio_id", data.portfolioId)
      .eq("is_read", false);
    unreadAlertCount = count ?? 0;
  }

  return <AppShell unreadAlertCount={unreadAlertCount}>{children}</AppShell>;
}
