import type { AssetClass, AssetRule, ResolvedThresholds, TrimMode } from "./types";

// Hardcoded fallback constants, used only when no matching asset_rules row exists.
const HARDCODED_DEFAULTS: Record<AssetClass, Partial<ResolvedThresholds>> = {
  individual_stock: {
    targetPct: 5.5,
    targetMinPct: null,
    targetMaxPct: null,
    warningPct: 5, // 5-7% -> STOP_ADDING zone starts here
    stopAddingPct: 5,
    trimPct: 8, // >8% -> TRIM (7-8% is REVIEW)
  },
  sector_etf: {
    targetPct: 7,
    targetMinPct: 6,
    targetMaxPct: 8,
    warningPct: 8,
    stopAddingPct: 8,
    trimPct: 10,
  },
  broad_core_etf: {
    targetPct: null,
    targetMinPct: 60,
    targetMaxPct: 65,
    warningPct: null,
    stopAddingPct: null,
    trimPct: null,
  },
  defensive: {
    targetPct: 4,
    targetMinPct: 3,
    targetMaxPct: 5,
    warningPct: null,
    stopAddingPct: null,
    trimPct: null,
  },
  cash: {
    targetPct: 4,
    targetMinPct: 3,
    targetMaxPct: 5,
    warningPct: null,
    stopAddingPct: null,
    trimPct: null,
  },
};

const GAIN_DEFAULTS = {
  gainAlertInformational: 30,
  gainAlertReview: 50,
  gainAlertProfitTaking: 70,
  gainAlertStrong: 100,
};

/**
 * Resolve effective thresholds for a ticker: per-ticker asset_rules row
 * takes priority over the per-asset-class default row, which takes
 * priority over hardcoded constants.
 */
export function resolveThresholds(
  ticker: string,
  assetClass: AssetClass,
  rules?: AssetRule[] | null,
  defaultTrimMode?: TrimMode
): ResolvedThresholds {
  const upper = ticker.toUpperCase();
  const tickerRule = rules?.find(
    (r) => r.ticker && r.ticker.toUpperCase() === upper && r.asset_class === assetClass
  );
  const classRule = rules?.find((r) => !r.ticker && r.asset_class === assetClass);
  const fallback = HARDCODED_DEFAULTS[assetClass];

  function pick<K extends keyof ResolvedThresholds>(key: K, ruleKey: keyof AssetRule): ResolvedThresholds[K] {
    const fromTicker = tickerRule?.[ruleKey];
    if (fromTicker !== null && fromTicker !== undefined) return fromTicker as ResolvedThresholds[K];
    const fromClass = classRule?.[ruleKey];
    if (fromClass !== null && fromClass !== undefined) return fromClass as ResolvedThresholds[K];
    return fallback[key] as ResolvedThresholds[K];
  }

  return {
    targetPct: pick("targetPct", "target_pct"),
    targetMinPct: pick("targetMinPct", "target_min_pct"),
    targetMaxPct: pick("targetMaxPct", "target_max_pct"),
    warningPct: pick("warningPct", "warning_pct"),
    trimPct: pick("trimPct", "trim_pct"),
    stopAddingPct: pick("stopAddingPct", "stop_adding_pct"),
    gainAlertInformational:
      tickerRule?.gain_alert_informational ?? classRule?.gain_alert_informational ?? GAIN_DEFAULTS.gainAlertInformational,
    gainAlertReview:
      tickerRule?.gain_alert_review ?? classRule?.gain_alert_review ?? GAIN_DEFAULTS.gainAlertReview,
    gainAlertProfitTaking:
      tickerRule?.gain_alert_profit_taking ?? classRule?.gain_alert_profit_taking ?? GAIN_DEFAULTS.gainAlertProfitTaking,
    gainAlertStrong:
      tickerRule?.gain_alert_strong ?? classRule?.gain_alert_strong ?? GAIN_DEFAULTS.gainAlertStrong,
    trimMode: (tickerRule?.trim_mode ?? classRule?.trim_mode ?? defaultTrimMode ?? "conservative") as TrimMode,
  };
}
