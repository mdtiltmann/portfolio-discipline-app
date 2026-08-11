import { createClient } from "@/lib/supabase/server";
import {
  computeHoldingStatus,
  computeGainSignal,
  buildRationale,
  computeRiskAlerts,
  DEFAULT_RISK_LIMITS,
  type Holding,
  type AssetRule,
  type AllocationTarget,
  type Settings,
  type ContributionSchedule,
} from "@/lib/engine";

export interface PortfolioData {
  userId: string;
  portfolioId: string | null;
  holdings: Holding[];
  rules: AssetRule[];
  targets: AllocationTarget[];
  settings: Settings;
  schedule: ContributionSchedule | null;
  totalValue: number;
  totalCostBasis: number;
}

export async function loadPortfolioData(userId: string): Promise<PortfolioData> {
  const supabase = await createClient();

  const [{ data: portfolios }, { data: rules }, { data: targets }, { data: settingsRow }, { data: schedules }] =
    await Promise.all([
      supabase.from("portfolios").select("*").eq("user_id", userId).limit(1),
      supabase.from("asset_rules").select("*").eq("user_id", userId),
      supabase.from("allocation_targets").select("*").eq("user_id", userId).order("sort_order"),
      supabase.from("settings").select("*").eq("user_id", userId).maybeSingle(),
      supabase.from("contribution_schedule").select("*").eq("user_id", userId).limit(1),
    ]);

  const portfolioId = portfolios?.[0]?.id ?? null;
  let holdings: Holding[] = [];
  if (portfolioId) {
    const { data } = await supabase.from("holdings").select("*").eq("portfolio_id", portfolioId);
    holdings = (data ?? []) as Holding[];
  }

  const settings: Settings = settingsRow
    ? (settingsRow as Settings)
    : {
        currency: "EUR",
        hold_trim_proceeds_in_cash: false,
        trim_hold_period_days: 60,
        review_interval_months: 6,
        risk_limits: DEFAULT_RISK_LIMITS,
      };

  const totalValue = holdings.reduce((s, h) => s + (h.current_value ?? 0), 0);
  const totalCostBasis = holdings.reduce((s, h) => s + (h.cost_basis ?? 0), 0);

  return {
    userId,
    portfolioId,
    holdings,
    rules: (rules ?? []) as AssetRule[],
    targets: (targets ?? []) as AllocationTarget[],
    settings,
    schedule: (schedules?.[0] ?? null) as ContributionSchedule | null,
    totalValue,
    totalCostBasis,
  };
}

export function computeAllStatuses(data: PortfolioData) {
  return data.holdings.map((h) => {
    const status = computeHoldingStatus(h, data.totalValue, data.rules, data.settings);
    const gain = computeGainSignal(h, data.rules);
    const rationale = buildRationale(status, gain);
    return { holding: h, status, gain, rationale };
  });
}

export function computeAlerts(data: PortfolioData) {
  const limits = data.settings.risk_limits ?? DEFAULT_RISK_LIMITS;
  const vwce = data.holdings.find((h) => h.ticker.toUpperCase() === "VWCE");
  const cash = data.holdings.filter((h) => h.asset_class === "cash").reduce((s, h) => s + h.current_value, 0);
  const vwcePct = data.totalValue > 0 && vwce ? (vwce.current_value / data.totalValue) * 100 : 0;
  const cashPct = data.totalValue > 0 ? (cash / data.totalValue) * 100 : 0;

  return computeRiskAlerts(data.holdings, data.totalValue, limits, {
    vwcePct,
    cashPct,
  });
}
