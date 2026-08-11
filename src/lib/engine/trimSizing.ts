import type { Holding, TrimMode } from "./types";

/**
 * Compute the € amount to trim from a holding.
 *
 * - conservative: trim exactly down to target value.
 * - balanced: amount-above-target + 10% of what remains after that trim.
 * - aggressive: 22.5% (midpoint of 20-25%) of current position value.
 */
export function computeTrimAmount(
  holding: Holding,
  targetPct: number,
  portfolioTotalValue: number,
  mode: TrimMode = "conservative",
  aggressiveFraction = 0.225
): number {
  const targetValue = (targetPct / 100) * portfolioTotalValue;
  const amountAboveTarget = Math.max(0, holding.current_value - targetValue);

  if (mode === "conservative") {
    return amountAboveTarget;
  }

  if (mode === "balanced") {
    const remainingAfterTrim = holding.current_value - amountAboveTarget;
    return amountAboveTarget + remainingAfterTrim * 0.1;
  }

  // aggressive
  return holding.current_value * aggressiveFraction;
}
