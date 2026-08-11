import type { ContributionSchedule, HoldingStatus } from "./types";

/**
 * Compute this month's contribution amount from the schedule. Year boundaries
 * are based on the anniversary of start_date; each full year elapsed
 * compounds base_monthly by annual_increase_pct, capped at cap_monthly.
 */
export function computeMonthlyContribution(
  schedule: ContributionSchedule,
  asOfDate: Date = new Date()
): number {
  const start = new Date(schedule.start_date);
  if (asOfDate < start) return schedule.base_monthly;

  let yearsElapsed = asOfDate.getFullYear() - start.getFullYear();
  const anniversaryThisYear = new Date(
    asOfDate.getFullYear(),
    start.getMonth(),
    start.getDate()
  );
  if (asOfDate < anniversaryThisYear) yearsElapsed -= 1;
  yearsElapsed = Math.max(0, yearsElapsed);

  const grown = schedule.base_monthly * Math.pow(1 + schedule.annual_increase_pct / 100, yearsElapsed);
  return Math.min(grown, schedule.cap_monthly);
}

export interface ContributionTarget {
  key: string; // ticker or bucket key
  status: HoldingStatus;
}

export interface ContributionAllocation {
  ticker: string;
  amount: number;
}

export interface ContributionPlan {
  allocations: ContributionAllocation[];
  doNotAddTo: string[];
}

/**
 * Allocate a monthly contribution across underweight holdings/buckets,
 * skipping anything with STOP_ADDING / TRIM / REVIEW status. Distributes
 * proportionally to the size of each gap (largest underweight gets more),
 * capping each recipient at its own gap so nothing overshoots target.
 */
export function allocateContribution(
  amount: number,
  targets: ContributionTarget[]
): ContributionPlan {
  const doNotAddTo = targets
    .filter((t) => ["STOP_ADDING", "TRIM", "REVIEW"].includes(t.status.status))
    .map((t) => t.key);

  let eligible = targets.filter(
    (t) => !["STOP_ADDING", "TRIM", "REVIEW"].includes(t.status.status) && t.status.amountBelowTarget > 0
  );

  const allocations: ContributionAllocation[] = [];
  let remaining = amount;

  // Iteratively distribute proportional to remaining gap, respecting each
  // target's cap (amountBelowTarget), re-distributing leftovers.
  while (remaining > 0.01 && eligible.length > 0) {
    const totalGap = eligible.reduce((s, t) => s + t.status.amountBelowTarget, 0);
    if (totalGap <= 0) break;

    let allocatedThisRound = 0;
    const stillEligible: ContributionTarget[] = [];

    for (const t of eligible) {
      const share = (t.status.amountBelowTarget / totalGap) * remaining;
      const take = Math.min(share, t.status.amountBelowTarget);
      const existing = allocations.find((a) => a.ticker === t.key);
      if (existing) existing.amount += take;
      else allocations.push({ ticker: t.key, amount: take });
      allocatedThisRound += take;

      const newGap = t.status.amountBelowTarget - take;
      if (newGap > 0.01) {
        stillEligible.push({ key: t.key, status: { ...t.status, amountBelowTarget: newGap } });
      }
    }

    remaining -= allocatedThisRound;
    if (allocatedThisRound < 0.01) break;
    eligible = stillEligible;
  }

  // Any undistributable remainder (all buckets at target) goes to the first
  // eligible broad-core-like target, else is left unallocated (caller can
  // route to cash).
  if (remaining > 0.01 && allocations.length > 0) {
    allocations[0].amount += remaining;
    remaining = 0;
  }

  return {
    allocations: allocations.map((a) => ({ ticker: a.ticker, amount: Math.round(a.amount * 100) / 100 })),
    doNotAddTo,
  };
}
