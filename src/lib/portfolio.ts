import { createClient } from "@/lib/supabase/server";
import {
  computeHoldingStatus,
  computeGainSignal,
  buildRationale,
  computeRiskAlerts,
  computeAnnualizedVolatility,
  RISK_PROFILES,
  DEFAULT_RISK_LIMITS,
  DEFAULT_RISK_PROFILE,
  type Holding,
  type AssetRule,
  type AllocationTarget,
  type Settings,
  type ContributionSchedule,
  type RiskContext,
} from "@/lib/engine";
import { fetchCandles } from "@/lib/marketdata/provider";

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

/**
 * Same as computeAllStatuses, but for individual stocks and sector ETFs
 * (where single-name volatility genuinely matters for position sizing) it
 * fetches real price history and volatility-adjusts the target/trim bands
 * per the user's risk profile, using the "5/25 rule" for when drift from
 * that target actually warrants action — see src/lib/engine/riskProfile.ts.
 * Broad core ETFs and defensive/cash holdings are unaffected: they stay
 * pure allocation-band, as before.
 *
 * Best-effort: a candle-fetch failure for any ticker just falls back to the
 * unadjusted static thresholds for that holding rather than failing the
 * whole page.
 */
export async function computeAllStatusesWithRisk(data: PortfolioData) {
  const supabase = await createClient();
  const riskAdjustableTickers = data.holdings
    .filter((h) => h.asset_class === "individual_stock" || h.asset_class === "sector_etf")
    .map((h) => h.ticker.toUpperCase());

  const riskContextByTicker = new Map<string, RiskContext>();

  if (riskAdjustableTickers.length > 0) {
    const profile = RISK_PROFILES[data.settings.risk_profile ?? DEFAULT_RISK_PROFILE];
    const { data: metaRows } = await supabase
      .from("asset_metadata")
      .select("ticker, yahoo_symbol")
      .in("ticker", riskAdjustableTickers);
    const overrideByTicker = new Map((metaRows ?? []).map((r) => [r.ticker.toUpperCase(), r.yahoo_symbol]));

    await Promise.all(
      riskAdjustableTickers.map(async (ticker) => {
        try {
          const candles = await fetchCandles(ticker, "1d", overrideByTicker.get(ticker));
          const volatility = computeAnnualizedVolatility(candles);
          riskContextByTicker.set(ticker, { volatility, profile });
        } catch {
          // No candles available — leave unset, computeHoldingStatus falls
          // back to the static default thresholds for this holding.
        }
      })
    );
  }

  return data.holdings.map((h) => {
    const riskContext = riskContextByTicker.get(h.ticker.toUpperCase());
    const status = computeHoldingStatus(h, data.totalValue, data.rules, data.settings, riskContext);
    const gain = computeGainSignal(h, data.rules);
    const rationale = buildRationale(status, gain);
    return { holding: h, status, gain, rationale, volatility: riskContext?.volatility ?? null };
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
