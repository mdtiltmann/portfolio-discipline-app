import { resolveThresholds } from "./thresholds";
import type { AssetRule, GainSignal, Holding, HoldingStatus } from "./types";

/**
 * Compute an informational gain signal for a holding. Gain triggers apply
 * only to individual stocks and defensive/cash — never to ETFs
 * (broad_core_etf / sector_etf), which are allocation-only.
 */
export function computeGainSignal(
  holding: Holding,
  rules?: AssetRule[] | null
): GainSignal {
  const gainEur = holding.cost_basis != null ? holding.current_value - holding.cost_basis : 0;
  const gainPct =
    holding.cost_basis != null && holding.cost_basis > 0
      ? (gainEur / holding.cost_basis) * 100
      : 0;

  if (holding.asset_class === "broad_core_etf" || holding.asset_class === "sector_etf") {
    return { level: "none", gainPct, gainEur, message: "" };
  }

  const t = resolveThresholds(holding.ticker, holding.asset_class, rules);

  let level: GainSignal["level"] = "none";
  let message = "";

  if (gainPct >= t.gainAlertStrong) {
    level = "strong";
    message = `${holding.ticker} is up ${gainPct.toFixed(0)}% — a very strong gain. Don't chase, don't panic sell; let it run while allocation limits do their job.`;
  } else if (gainPct >= t.gainAlertProfitTaking) {
    level = "profit_taking";
    message = `${holding.ticker} is up ${gainPct.toFixed(0)}% — consider partial profit-taking only if concentration limits are also breached.`;
  } else if (gainPct >= t.gainAlertReview) {
    level = "review";
    message = `${holding.ticker} is up ${gainPct.toFixed(0)}% — worth a look, no action required.`;
  } else if (gainPct >= t.gainAlertInformational) {
    level = "informational";
    message = `${holding.ticker} is up ${gainPct.toFixed(0)}% — informational only, don't chase and don't panic sell.`;
  }

  return { level, gainPct, gainEur, message };
}

/**
 * Combine allocation status + gain signal into one human rationale string.
 * Gain alone must NEVER upgrade status to TRIM — allocationStatus.ts is the
 * single source of truth for TRIM.
 */
export function buildRationale(holdingStatus: HoldingStatus, gainSignal: GainSignal): string {
  const parts = [holdingStatus.rationale];

  if (gainSignal.level === "none") return parts.join(" ");

  if (holdingStatus.status === "TRIM") {
    parts.push(
      `Combined with a gain of ${gainSignal.gainPct.toFixed(0)}%, this is a concentration issue, not a market-timing call — trim to bring the position back in line, using new contributions to rebalance elsewhere.`
    );
  } else if (gainSignal.message) {
    parts.push(gainSignal.message);
  }

  return parts.join(" ");
}
