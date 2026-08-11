import type { HoldingStatus, Settings, TrimAllocation } from "./types";

export interface TrimBucket {
  key: string; // e.g. 'VWCE', 'WSML', bucket_key, or 'CASH'
  label: string;
  isBroadCore?: boolean;
  isDefensive?: boolean;
  isSectorGeo?: boolean;
  isCashReserve?: boolean;
  status: HoldingStatus | null; // used to determine underweight-ness
}

/**
 * Allocate trim proceeds across candidate buckets in priority order:
 * underweight broad-core (VWCE) -> underweight secondary broad-core (WSML)
 * -> underweight defensive -> underweight sector/geo bucket -> cash reserve.
 *
 * If settings.hold_trim_proceeds_in_cash is true, everything goes to a single
 * cash/ERNE bucket for the configured holding period instead.
 */
export function allocateTrimProceeds(
  amount: number,
  buckets: TrimBucket[],
  settings: Settings | null | undefined
): TrimAllocation[] {
  if (amount <= 0) return [];

  if (settings?.hold_trim_proceeds_in_cash) {
    return [
      {
        bucket: "CASH",
        amount,
        note: `Parked in cash/ERNE for ${settings.trim_hold_period_days} days before redeployment (hold-trim-proceeds setting enabled).`,
      },
    ];
  }

  const cashReserve = buckets.find((b) => b.isCashReserve);

  const priorityGroups: ((b: TrimBucket) => boolean)[] = [
    (b) => !!b.isBroadCore && b.key.toUpperCase() === "VWCE",
    (b) => !!b.isBroadCore && b.key.toUpperCase() !== "VWCE",
    (b) => !!b.isDefensive,
    (b) => !!b.isSectorGeo,
  ];

  let remaining = amount;
  const allocations: TrimAllocation[] = [];

  for (const matches of priorityGroups) {
    if (remaining <= 0) break;
    const underweightCandidates = buckets.filter(
      (b) => matches(b) && b.status && b.status.amountBelowTarget > 0
    );
    for (const bucket of underweightCandidates) {
      if (remaining <= 0) break;
      const gap = bucket.status!.amountBelowTarget;
      const take = Math.min(gap, remaining);
      if (take > 0) {
        allocations.push({ bucket: bucket.key, amount: take });
        remaining -= take;
      }
    }
  }

  if (remaining > 0) {
    allocations.push({
      bucket: cashReserve?.key ?? "CASH",
      amount: remaining,
      note: "Remainder routed to cash reserve — no underweight bucket left to absorb it.",
    });
  }

  return allocations;
}
