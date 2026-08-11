// Shared types for the rules engine. Field names mirror the DB schema
// (snake_case) since these objects are usually read straight from Supabase.

export type AssetClass =
  | "broad_core_etf"
  | "sector_etf"
  | "individual_stock"
  | "defensive"
  | "cash";

export type HoldingStatusType = "BUY" | "HOLD" | "STOP_ADDING" | "TRIM" | "REVIEW";

export type GainSignalLevel = "none" | "informational" | "review" | "profit_taking" | "strong";

export type TrimMode = "conservative" | "balanced" | "aggressive";

export interface Holding {
  id?: string;
  portfolio_id?: string;
  ticker: string;
  name?: string | null;
  asset_class: AssetClass;
  quantity: number;
  current_value: number;
  cost_basis: number | null;
  currency?: string;
  last_price_updated_at?: string | null;
}

export interface AssetRule {
  id?: string;
  user_id?: string;
  asset_class: AssetClass;
  ticker: string | null; // null = default rule for the asset_class
  target_pct: number | null;
  target_min_pct: number | null;
  target_max_pct: number | null;
  warning_pct: number | null;
  trim_pct: number | null;
  stop_adding_pct: number | null;
  gain_alert_informational: number | null;
  gain_alert_review: number | null;
  gain_alert_profit_taking: number | null;
  gain_alert_strong: number | null;
  trim_mode: TrimMode | null;
}

export interface AllocationTarget {
  id?: string;
  user_id?: string;
  bucket_key: string;
  label: string;
  target_min_pct: number;
  target_max_pct: number;
  tickers: string[];
  sort_order?: number;
}

export interface RiskLimits {
  single_stock_warn: number;
  single_stock_critical: number;
  sector_etf_trim: number;
  single_sector_max: number;
  us_exposure_max: number;
  defence_bucket_max: number;
  cash_min: number;
  vwce_min: number;
}

export interface Settings {
  id?: string;
  user_id?: string;
  currency: string;
  hold_trim_proceeds_in_cash: boolean;
  trim_hold_period_days: number;
  review_interval_months: number;
  risk_limits: RiskLimits;
}

export interface ContributionSchedule {
  id?: string;
  user_id?: string;
  start_date: string; // ISO date
  base_monthly: number;
  annual_increase_pct: number;
  cap_monthly: number;
}

export interface HoldingStatus {
  ticker: string;
  currentValue: number;
  currentPct: number;
  targetPct: number | null;
  targetMinPct: number | null;
  targetMaxPct: number | null;
  amountAboveTarget: number;
  amountBelowTarget: number;
  status: HoldingStatusType;
  rationale: string;
}

export interface GainSignal {
  level: GainSignalLevel;
  gainPct: number;
  gainEur: number;
  message: string;
}

export interface TrimAllocation {
  bucket: string;
  ticker?: string;
  amount: number;
  note?: string;
}

export interface Alert {
  ticker?: string;
  severity: "info" | "warning" | "critical";
  category: "concentration" | "gain" | "allocation" | "cash" | "review_due" | "sector" | "geography";
  message: string;
}

// Effective, resolved thresholds for a given holding after merging
// per-ticker rule > per-asset-class rule > hardcoded default.
export interface ResolvedThresholds {
  targetPct: number | null;
  targetMinPct: number | null;
  targetMaxPct: number | null;
  warningPct: number | null;
  trimPct: number | null;
  stopAddingPct: number | null;
  gainAlertInformational: number;
  gainAlertReview: number;
  gainAlertProfitTaking: number;
  gainAlertStrong: number;
  trimMode: TrimMode;
}
