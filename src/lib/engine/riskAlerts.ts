import type { Alert, Holding, RiskLimits } from "./types";

export const DEFAULT_RISK_LIMITS: RiskLimits = {
  single_stock_warn: 7,
  single_stock_critical: 10,
  sector_etf_trim: 10,
  single_sector_max: 35,
  us_exposure_max: 70,
  defence_bucket_max: 12,
  cash_min: 2,
  vwce_min: 50,
};

export interface RiskAlertContext {
  sectorPct?: Record<string, number>; // sector -> % of portfolio
  usExposurePct?: number;
  defenceBucketPct?: number;
  cashPct?: number;
  vwcePct?: number;
}

/**
 * Compute risk/concentration alerts from settings.risk_limits thresholds.
 * News/external signals are never used here — only allocation math.
 */
export function computeRiskAlerts(
  holdings: Holding[],
  portfolioTotalValue: number,
  limits: RiskLimits,
  ctx: RiskAlertContext = {}
): Alert[] {
  const alerts: Alert[] = [];

  for (const h of holdings) {
    const pct = portfolioTotalValue > 0 ? (h.current_value / portfolioTotalValue) * 100 : 0;

    if (h.asset_class === "individual_stock") {
      if (pct > limits.single_stock_critical) {
        alerts.push({
          ticker: h.ticker,
          severity: "critical",
          category: "concentration",
          message: `${h.ticker} is ${pct.toFixed(1)}% of the portfolio — above the ${limits.single_stock_critical}% critical concentration limit.`,
        });
      } else if (pct > limits.single_stock_warn) {
        alerts.push({
          ticker: h.ticker,
          severity: "warning",
          category: "concentration",
          message: `${h.ticker} is ${pct.toFixed(1)}% of the portfolio — above the ${limits.single_stock_warn}% warning line.`,
        });
      }
    }

    if (h.asset_class === "sector_etf" && pct > limits.sector_etf_trim) {
      alerts.push({
        ticker: h.ticker,
        severity: "warning",
        category: "concentration",
        message: `${h.ticker} (sector ETF) is ${pct.toFixed(1)}% — above the ${limits.sector_etf_trim}% threshold.`,
      });
    }
  }

  if (ctx.sectorPct) {
    for (const [sector, pct] of Object.entries(ctx.sectorPct)) {
      if (pct > limits.single_sector_max) {
        alerts.push({
          severity: "warning",
          category: "sector",
          message: `Sector "${sector}" is ${pct.toFixed(1)}% of the portfolio — above the ${limits.single_sector_max}% limit.`,
        });
      }
    }
  }

  if (ctx.usExposurePct != null && ctx.usExposurePct > limits.us_exposure_max) {
    alerts.push({
      severity: "warning",
      category: "geography",
      message: `US exposure is ${ctx.usExposurePct.toFixed(1)}% — above the ${limits.us_exposure_max}% limit.`,
    });
  }

  if (ctx.defenceBucketPct != null && ctx.defenceBucketPct > limits.defence_bucket_max) {
    alerts.push({
      severity: "warning",
      category: "allocation",
      message: `Defence/aerospace bucket is ${ctx.defenceBucketPct.toFixed(1)}% — above the ${limits.defence_bucket_max}% limit.`,
    });
  }

  if (ctx.cashPct != null && ctx.cashPct < limits.cash_min) {
    alerts.push({
      severity: "info",
      category: "cash",
      message: `Cash reserve is ${ctx.cashPct.toFixed(1)}% — below the ${limits.cash_min}% minimum.`,
    });
  }

  if (ctx.vwcePct != null && ctx.vwcePct < limits.vwce_min) {
    alerts.push({
      severity: "warning",
      category: "allocation",
      message: `VWCE core is ${ctx.vwcePct.toFixed(1)}% — below the ${limits.vwce_min}% minimum, the global core should stay dominant.`,
    });
  }

  return alerts;
}
