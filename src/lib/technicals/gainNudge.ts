// Applies a small unrealized-gain/loss nudge to a technical verdict ratio —
// the same "informational context, not a dominant signal" philosophy as
// newsNudge.ts: technicals still do the heavy lifting, this just accounts
// for the fact that a person sitting on a large unrealized gain faces a
// different decision than someone on a fresh position, even at an
// identical technical reading.
//
// Large unrealized GAIN nudges toward Sell (profit-taking pressure).
// Large unrealized LOSS nudges toward Buy (a "buy the dip" lean) — this is
// a real, debatable stance (some would rather cut losses), so it is kept
// small and always overridable by the technicals themselves.
//
// Thresholds mirror the old allocation engine's gain-alert convention
// (+30% informational, +50% review, +70% profit-taking, +100% strong) by
// starting the nudge at 30% and reaching full magnitude at 100%.
export const MAX_GAIN_NUDGE = 0.15;
const NUDGE_START_PCT = 30;
const NUDGE_FULL_PCT = 100;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export interface GainNudgeResult {
  nudgeApplied: number;
}

/**
 * gainPct: unrealized gain/loss versus cost basis, e.g. 72 for +72%, -15
 * for a 15% loss. Returns 0 nudge below the 30% (or -30%) threshold, and
 * scales linearly up to MAX_GAIN_NUDGE at +/-100%.
 */
export function computeGainNudge(gainPct: number | null): GainNudgeResult {
  if (gainPct == null || Number.isNaN(gainPct)) return { nudgeApplied: 0 };

  const magnitude = Math.abs(gainPct);
  if (magnitude < NUDGE_START_PCT) return { nudgeApplied: 0 };

  const scale = clamp((magnitude - NUDGE_START_PCT) / (NUDGE_FULL_PCT - NUDGE_START_PCT), 0, 1);
  const nudgeApplied = gainPct > 0 ? -scale * MAX_GAIN_NUDGE : scale * MAX_GAIN_NUDGE;
  return { nudgeApplied };
}
