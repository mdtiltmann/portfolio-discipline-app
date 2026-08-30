// Advisor-style position-sizing rules: a volatility-adjusted target weight
// per holding, combined with the "5/25 rule" (Swedroe/Vanguard rebalancing
// convention) for when a drift from that target actually warrants action —
// rebalance when a position drifts past the SMALLER of an absolute
// percentage-point threshold or a percentage of its own target weight, so
// the trigger scales sensibly for both large and small positions instead of
// using one flat cutoff for every stock.

export type RiskProfile = "conservative" | "moderate" | "aggressive";

export interface RiskProfileConfig {
  individualStockTarget: number;
  sectorEtfTarget: number;
  benchmarkVolatility: number; // "normal" annualized volatility this profile is calibrated around
  absoluteBandPp: number; // 5/25 rule absolute leg, in percentage points
  relativeBand: number; // 5/25 rule relative leg, e.g. 0.25 = 25% of target
  volatilityMinMultiplier: number;
  volatilityMaxMultiplier: number;
}

export const RISK_PROFILES: Record<RiskProfile, RiskProfileConfig> = {
  conservative: {
    individualStockTarget: 4,
    sectorEtfTarget: 6,
    benchmarkVolatility: 0.25,
    absoluteBandPp: 4,
    relativeBand: 0.2,
    volatilityMinMultiplier: 0.5,
    volatilityMaxMultiplier: 1.2,
  },
  moderate: {
    individualStockTarget: 5.5,
    sectorEtfTarget: 7,
    benchmarkVolatility: 0.3,
    absoluteBandPp: 5,
    relativeBand: 0.25,
    volatilityMinMultiplier: 0.5,
    volatilityMaxMultiplier: 1.5,
  },
  aggressive: {
    individualStockTarget: 7,
    sectorEtfTarget: 8.5,
    benchmarkVolatility: 0.35,
    absoluteBandPp: 6,
    relativeBand: 0.3,
    volatilityMinMultiplier: 0.6,
    volatilityMaxMultiplier: 1.8,
  },
};

export const DEFAULT_RISK_PROFILE: RiskProfile = "moderate";

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/**
 * Scales a base target weight by how volatile the holding actually is
 * relative to the profile's benchmark volatility — a stock twice as
 * volatile as "normal" gets roughly half the target weight. Clamped so a
 * single extreme reading can't send the target toward zero or an
 * unreasonably large multiple.
 */
export function volatilityAdjustedTarget(
  baseTargetPct: number,
  volatility: number | null,
  profile: RiskProfileConfig
): number {
  if (volatility == null || volatility <= 0) return baseTargetPct;
  const multiplier = clamp(
    profile.benchmarkVolatility / volatility,
    profile.volatilityMinMultiplier,
    profile.volatilityMaxMultiplier
  );
  return baseTargetPct * multiplier;
}

/** The 5/25 rule's trigger width: the smaller of the absolute and relative legs. */
export function rebalanceBand(targetPct: number, profile: RiskProfileConfig): number {
  return Math.min(profile.absoluteBandPp, targetPct * profile.relativeBand);
}
