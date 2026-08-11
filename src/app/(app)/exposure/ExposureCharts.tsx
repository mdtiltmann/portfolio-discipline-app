"use client";

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from "recharts";
import type { BucketExposure, RiskLimits } from "@/lib/engine";

const NORMAL_COLOR = "#0f766e"; // teal-700, single-hue magnitude
const FLAG_COLOR = "#b45309"; // amber-700, status/warning

function Chart({
  title,
  data,
  limitPct,
  limitLabel,
}: {
  title: string;
  data: BucketExposure[];
  limitPct?: number | null;
  limitLabel?: string;
}) {
  const chartData = data.map((d) => ({
    key: d.key,
    pct: Number(d.totalPct.toFixed(1)),
    exceedsLimit: limitPct != null && (d.key === limitLabel || limitLabel === undefined) ? d.totalPct > limitPct : false,
  }));

  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
      <h2 className="mb-3 text-sm font-semibold">{title}</h2>
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} layout="vertical" margin={{ left: 8, right: 16 }}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.15} horizontal={false} />
            <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}%`} />
            <YAxis type="category" dataKey="key" tick={{ fontSize: 11 }} width={110} />
            <Tooltip formatter={(v) => [`${v}%`, "Total exposure"]} />
            <Bar dataKey="pct" radius={[0, 4, 4, 0]}>
              {chartData.map((d, i) => (
                <Cell key={i} fill={d.exceedsLimit ? FLAG_COLOR : NORMAL_COLOR} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-2 text-xs text-neutral-500">
        <span className="inline-block h-2 w-2 rounded-full align-middle" style={{ background: FLAG_COLOR }} /> above
        configured limit &nbsp;
        <span className="inline-block h-2 w-2 rounded-full align-middle" style={{ background: NORMAL_COLOR }} />{" "}
        within limit
      </p>
    </section>
  );
}

export default function ExposureCharts({
  sectorExposure,
  geoExposure,
  limits,
}: {
  sectorExposure: BucketExposure[];
  geoExposure: BucketExposure[];
  limits: RiskLimits;
}) {
  return (
    <>
      <Chart title="Sector exposure" data={sectorExposure} limitPct={limits.single_sector_max} />
      <Chart title="Geographic exposure" data={geoExposure} limitPct={limits.us_exposure_max} limitLabel="USA" />
    </>
  );
}
