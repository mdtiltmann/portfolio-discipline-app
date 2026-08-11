import { resolveThresholds } from "./thresholds";
import type {
  AssetRule,
  Holding,
  HoldingStatus,
  Settings,
} from "./types";

/**
 * Compute allocation status for a single holding against the total portfolio
 * value. This is the ONLY place status ever becomes TRIM — gain triggers are
 * informational only (see gainTriggers.ts).
 */
export function computeHoldingStatus(
  holding: Holding,
  portfolioTotalValue: number,
  rules: AssetRule[] | null | undefined,
  // Settings currently only feeds through hardcoded/rule-based thresholds above;
  // accepted here so callers can pass it uniformly and future settings-driven
  // overrides (e.g. per-user default bands) have a stable call site to extend.
  settings: Settings | null | undefined
): HoldingStatus {
  void settings;
  const currentValue = holding.current_value;
  const currentPct = portfolioTotalValue > 0 ? (currentValue / portfolioTotalValue) * 100 : 0;
  const t = resolveThresholds(holding.ticker, holding.asset_class, rules);

  let status: HoldingStatus["status"] = "HOLD";
  let rationale = "";
  let targetPct = t.targetPct;
  const targetMinPct = t.targetMinPct;
  const targetMaxPct = t.targetMaxPct;

  if (holding.asset_class === "individual_stock") {
    const stopAdding = t.stopAddingPct ?? 5;
    const warning = t.warningPct ?? 5;
    const trimAt = t.trimPct ?? 8;
    const reviewAt = warning + 2; // 7-8% review band by default
    if (currentPct < stopAdding) {
      status = "BUY";
      rationale = `${holding.ticker} is ${currentPct.toFixed(1)}% of the portfolio, below the ${stopAdding}% stop-adding line — fine to continue contributions here.`;
    } else if (currentPct >= stopAdding && currentPct < reviewAt) {
      status = "STOP_ADDING";
      rationale = `${holding.ticker} is ${currentPct.toFixed(1)}%, in the ${stopAdding}-${reviewAt}% zone — stop adding new money, let it ride.`;
    } else if (currentPct >= reviewAt && currentPct < trimAt) {
      status = "REVIEW";
      rationale = `${holding.ticker} is ${currentPct.toFixed(1)}%, approaching the ${trimAt}% trim threshold — review position, no action required yet.`;
    } else {
      status = "TRIM";
      rationale = `${holding.ticker} is ${currentPct.toFixed(1)}%, above the ${trimAt}% concentration limit — trim recommended back toward ${targetPct ?? 5.5}%.`;
    }
  } else if (holding.asset_class === "sector_etf") {
    const target = t.targetPct ?? 7;
    const stopAdding = t.stopAddingPct ?? 8;
    const trimAt = t.trimPct ?? 10;
    targetPct = target;
    if (currentPct < target) {
      status = "BUY";
      rationale = `${holding.ticker} is ${currentPct.toFixed(1)}% vs a ${target}% target — room to add.`;
    } else if (currentPct < stopAdding) {
      status = "HOLD";
      rationale = `${holding.ticker} is ${currentPct.toFixed(1)}%, near its ${target}% target — hold, no new buys needed.`;
    } else if (currentPct < trimAt) {
      status = "STOP_ADDING";
      rationale = `${holding.ticker} is ${currentPct.toFixed(1)}%, above the ${stopAdding}% stop-adding line — pause contributions here.`;
    } else {
      status = "TRIM";
      rationale = `${holding.ticker} is ${currentPct.toFixed(1)}%, above the ${trimAt}% sector ETF trim threshold — trim recommended.`;
    }
  } else if (holding.asset_class === "broad_core_etf") {
    // Allocation-based only. Never trim purely for price gain.
    const min = t.targetMinPct ?? 60;
    const max = t.targetMaxPct ?? 65;
    targetPct = (min + max) / 2;
    if (currentPct < min) {
      status = "BUY";
      rationale = `${holding.ticker} is ${currentPct.toFixed(1)}%, below the ${min}-${max}% core band — keep this dominant, prioritize contributions here.`;
    } else if (currentPct > max) {
      status = "STOP_ADDING";
      rationale = `${holding.ticker} is ${currentPct.toFixed(1)}%, above the ${min}-${max}% core band — pause new buys, but broad core ETFs are never trimmed for price gain alone.`;
    } else {
      status = "HOLD";
      rationale = `${holding.ticker} is ${currentPct.toFixed(1)}%, within the ${min}-${max}% core band — on target.`;
    }
  } else {
    // defensive / cash — from settings/rule target ranges
    const min = t.targetMinPct ?? 3;
    const max = t.targetMaxPct ?? 5;
    targetPct = (min + max) / 2;
    if (currentPct < min) {
      status = "BUY";
      rationale = `${holding.ticker} is ${currentPct.toFixed(1)}%, below the ${min}-${max}% target range — top up.`;
    } else if (currentPct > max) {
      status = "STOP_ADDING";
      rationale = `${holding.ticker} is ${currentPct.toFixed(1)}%, above the ${min}-${max}% target range — pause contributions.`;
    } else {
      status = "HOLD";
      rationale = `${holding.ticker} is ${currentPct.toFixed(1)}%, within the ${min}-${max}% target range.`;
    }
  }

  const effectiveTarget = targetPct ?? (targetMinPct != null && targetMaxPct != null ? (targetMinPct + targetMaxPct) / 2 : 0);
  const targetValue = (effectiveTarget / 100) * portfolioTotalValue;
  const amountAboveTarget = Math.max(0, currentValue - targetValue);
  const amountBelowTarget = Math.max(0, targetValue - currentValue);

  return {
    ticker: holding.ticker,
    currentValue,
    currentPct,
    targetPct,
    targetMinPct,
    targetMaxPct,
    amountAboveTarget,
    amountBelowTarget,
    status,
    rationale,
  };
}
