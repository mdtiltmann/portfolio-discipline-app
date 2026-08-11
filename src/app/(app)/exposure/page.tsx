import { requireUser } from "@/lib/supabase/auth";
import { loadPortfolioData } from "@/lib/portfolio";
import { createClient } from "@/lib/supabase/server";
import {
  computeTickerExposure,
  computeSectorExposure,
  computeGeographyExposure,
  computeExposureAlerts,
  DEFAULT_RISK_LIMITS,
  type EtfConstituent,
  type AssetMeta,
} from "@/lib/engine";
import ExposureCharts from "./ExposureCharts";

export default async function ExposurePage() {
  const user = await requireUser();
  const data = await loadPortfolioData(user.id);
  const supabase = await createClient();

  const tickers = data.holdings.map((h) => h.ticker.toUpperCase());

  const [{ data: constituentRows }, { data: metaRows }] = await Promise.all([
    tickers.length
      ? supabase.from("etf_constituents").select("*").in("etf_ticker", tickers)
      : Promise.resolve({ data: [] as EtfConstituent[] }),
    supabase.from("asset_metadata").select("*"),
  ]);

  const constituents = (constituentRows ?? []) as EtfConstituent[];
  const metaByTicker = new Map<string, AssetMeta>();
  for (const m of (metaRows ?? []) as AssetMeta[]) {
    metaByTicker.set(m.ticker.toUpperCase(), m);
  }
  for (const c of constituents) {
    const key = c.constituent_ticker.toUpperCase();
    if (!metaByTicker.has(key)) {
      metaByTicker.set(key, { ticker: key, name: c.constituent_name, sector: c.sector, country: c.country });
    }
  }

  const limits = data.settings.risk_limits ?? DEFAULT_RISK_LIMITS;
  const tickerExposure = computeTickerExposure(data.holdings, constituents, metaByTicker, data.totalValue);
  const sectorExposure = computeSectorExposure(tickerExposure, metaByTicker, data.totalValue);
  const geoExposure = computeGeographyExposure(tickerExposure, metaByTicker, data.totalValue);
  const alerts = computeExposureAlerts(sectorExposure, geoExposure, limits);

  const hiddenExposure = tickerExposure.filter((t) => t.sourceEtfs.length > 0);

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4">
      <h1 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">Exposure</h1>
      <p className="text-xs text-neutral-500">
        True exposure = direct holdings + your indirect share of each company via ETFs (VWCE, IITU). ETF
        constituent weights are approximate/illustrative, not live data.
      </p>

      {alerts.length > 0 && (
        <div className="space-y-2">
          {alerts.map((a, i) => (
            <div
              key={i}
              className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300"
            >
              {a.message}
            </div>
          ))}
        </div>
      )}

      <section className="rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
        <h2 className="mb-3 text-sm font-semibold">Hidden stock exposure</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-xs text-neutral-500">
                <th className="pb-2 pr-2">Ticker</th>
                <th className="pb-2 pr-2 text-right">Direct %</th>
                <th className="pb-2 pr-2 text-right">Indirect %</th>
                <th className="pb-2 pr-2 text-right">Total %</th>
                <th className="pb-2">Source ETFs</th>
              </tr>
            </thead>
            <tbody>
              {hiddenExposure.map((t) => (
                <tr key={t.ticker} className="border-t border-neutral-100 dark:border-neutral-800">
                  <td className="py-1.5 pr-2 font-medium">{t.ticker}</td>
                  <td className="py-1.5 pr-2 text-right">{t.directPct.toFixed(1)}%</td>
                  <td className="py-1.5 pr-2 text-right">{t.indirectPct.toFixed(1)}%</td>
                  <td className="py-1.5 pr-2 text-right font-medium">{t.totalPct.toFixed(1)}%</td>
                  <td className="py-1.5 text-xs text-neutral-500">{t.sourceEtfs.join(", ") || "—"}</td>
                </tr>
              ))}
              {hiddenExposure.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-3 text-center text-xs text-neutral-400">
                    No overlap data — add ETF holdings with known constituents (VWCE, IITU).
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <ExposureCharts sectorExposure={sectorExposure} geoExposure={geoExposure} limits={limits} />
    </div>
  );
}
