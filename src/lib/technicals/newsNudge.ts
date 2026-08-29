// Applies a small news-sentiment nudge to a technical verdict ratio.
//
// Only "material" news items are allowed to move the signal at all —
// "worth_watching" and "noise" items may still be displayed in the UI, but
// they never affect the technical verdict. This keeps the nudge grounded in
// news that's actually judged significant enough to matter.
//
// The default verdict-bucket thresholds are roughly 0.4 wide in ratio space
// (see DEFAULT_VERDICT_THRESHOLDS: -0.5 / -0.1 / 0.1 / 0.5). We cap the nudge
// well under that width so that news sentiment can, at most, push a ratio
// across ONE bucket boundary (e.g. Buy -> Neutral, or Neutral -> Sell) but
// can never leapfrog two buckets (e.g. Strong Buy -> Sell) or override a
// strongly-confirmed technical read on its own.
export const MAX_NEWS_NUDGE = 0.15;

export interface NewsNudgeItem {
  sentiment: "positive" | "neutral" | "negative";
  materiality: "noise" | "worth_watching" | "material";
}

export interface NewsNudgeResult {
  adjustedRatio: number;
  nudgeApplied: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Computes a news sentiment score from -1..1 using only material items
 * (+1 per material positive, -1 per material negative, 0 for material
 * neutral), averaged across all material items, then scales it into a
 * ratio-space nudge capped at +/- MAX_NEWS_NUDGE.
 */
export function applyNewsNudge(baseRatio: number, newsItems: NewsNudgeItem[]): NewsNudgeResult {
  const materialItems = newsItems.filter((item) => item.materiality === "material");

  if (materialItems.length === 0) {
    return { adjustedRatio: clamp(baseRatio, -1, 1), nudgeApplied: 0 };
  }

  const score =
    materialItems.reduce((sum, item) => {
      if (item.sentiment === "positive") return sum + 1;
      if (item.sentiment === "negative") return sum - 1;
      return sum;
    }, 0) / materialItems.length; // in [-1, 1]

  const nudgeApplied = clamp(score * MAX_NEWS_NUDGE, -MAX_NEWS_NUDGE, MAX_NEWS_NUDGE);
  const adjustedRatio = clamp(baseRatio + nudgeApplied, -1, 1);

  return { adjustedRatio, nudgeApplied };
}
