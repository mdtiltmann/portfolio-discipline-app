"use client";

import { useMemo, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { simulateWithdrawalSurvival, findStopContributingPoint } from "@/lib/engine/retirement";

const MILESTONES = [100_000, 250_000, 435_000, 500_000, 750_000, 1_000_000];

interface Props {
  startingValue: number;
  baseMonthly: number;
  annualIncreasePct: number;
  capMonthly: number;
  currentAge?: number;
}

function projectSeries(
  startingValue: number,
  baseMonthly: number,
  annualIncreasePct: number,
  capMonthly: number,
  annualReturnPct: number,
  years: number
) {
  const monthlyReturn = Math.pow(1 + annualReturnPct / 100, 1 / 12) - 1;
  let value = startingValue;
  let monthly = baseMonthly;
  const points: { year: number; value: number }[] = [{ year: 0, value }];

  for (let m = 1; m <= years * 12; m++) {
    value = value * (1 + monthlyReturn) + monthly;
    if (m % 12 === 0) {
      monthly = Math.min(monthly * (1 + annualIncreasePct / 100), capMonthly);
      points.push({ year: m / 12, value });
    }
  }
  return points;
}

export default function ProjectionsClient({ startingValue, baseMonthly, annualIncreasePct, capMonthly, currentAge }: Props) {
  const [returnRate, setReturnRate] = useState(8);
  const [customRate, setCustomRate] = useState(8);
  const [withdrawalRate, setWithdrawalRate] = useState(4);

  const effectiveRate = returnRate === -1 ? customRate : returnRate;
  const series = useMemo(
    () => projectSeries(startingValue, baseMonthly, annualIncreasePct, capMonthly, effectiveRate, 40),
    [startingValue, baseMonthly, annualIncreasePct, capMonthly, effectiveRate]
  );

  const milestoneDates = MILESTONES.map((m) => {
    const hit = series.find((p) => p.value >= m);
    return { milestone: m, year: hit?.year ?? null };
  });

  // "When can I stop contributing" — find first year where value * annualReturn covers
  // continued growth without further contributions reaching a comfortable FI number
  // (approximate: value where monthly investment return alone exceeds current monthly contribution).
  const stopContributingYear = series.find((p) => (p.value * effectiveRate) / 100 / 12 >= baseMonthly)?.year ?? null;

  const ages = [40, 45, 50, 55, 60, 65, 70, 75, 80, 85];

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
        <div className="mb-3 flex flex-wrap gap-2">
          {[6, 8, 10, -1].map((r) => (
            <button
              key={r}
              onClick={() => setReturnRate(r)}
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                returnRate === r
                  ? "bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900"
                  : "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300"
              }`}
            >
              {r === -1 ? "Custom" : `${r}%`}
            </button>
          ))}
          {returnRate === -1 && (
            <input
              type="number"
              value={customRate}
              onChange={(e) => setCustomRate(Number(e.target.value))}
              className="w-16 rounded-full border border-neutral-300 px-2 py-1 text-xs dark:border-neutral-700 dark:bg-neutral-800"
            />
          )}
        </div>
        <div className="h-56 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={series}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
              <XAxis dataKey="year" tick={{ fontSize: 11 }} label={{ value: "years", position: "insideBottom", offset: -2, fontSize: 10 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `€${(v / 1000).toFixed(0)}k`} width={50} />
              <Tooltip
                formatter={(v) =>
                  `€${Number(v).toLocaleString(undefined, { maximumFractionDigits: 0 })}`
                }
              />
              <Line type="monotone" dataKey="value" stroke="#059669" dot={false} strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
        <h2 className="mb-2 text-sm font-semibold">Milestones</h2>
        <ul className="space-y-1 text-sm">
          {milestoneDates.map((m) => (
            <li key={m.milestone} className="flex justify-between">
              <span>€{(m.milestone / 1000).toFixed(0)}k</span>
              <span>{m.year != null ? `~${m.year} years` : "beyond 40yr horizon"}</span>
            </li>
          ))}
        </ul>
      </div>

      {currentAge != null && (
        <div className="rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
          <h2 className="mb-2 text-sm font-semibold">Projected value at target ages</h2>
          <ul className="grid grid-cols-2 gap-1 text-sm">
            {ages
              .filter((a) => a >= currentAge)
              .map((a) => {
                const years = a - currentAge;
                const pt = series.find((p) => p.year >= years);
                return (
                  <li key={a} className="flex justify-between">
                    <span>Age {a}</span>
                    <span>€{pt ? (pt.value / 1000).toFixed(0) : "—"}k</span>
                  </li>
                );
              })}
          </ul>
        </div>
      )}

      <div className="rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
        <h2 className="mb-2 text-sm font-semibold">FI / withdrawal simulator</h2>
        <label className="mb-2 block text-xs text-neutral-500">
          Withdrawal rate: {withdrawalRate}%
          <input
            type="range"
            min={2}
            max={6}
            step={0.5}
            value={withdrawalRate}
            onChange={(e) => setWithdrawalRate(Number(e.target.value))}
            className="w-full"
          />
        </label>
        <p className="text-sm text-neutral-700 dark:text-neutral-300">
          At the {effectiveRate}% growth path, a portfolio of{" "}
          <strong>€{Math.round((baseMonthly * 12) / (withdrawalRate / 100)).toLocaleString()}</strong> would support
          the current annual contribution equivalent as a perpetual withdrawal at a {withdrawalRate}% rate.
        </p>
        <p className="mt-2 text-sm text-neutral-700 dark:text-neutral-300">
          &quot;Stop contributing&quot; point (investment growth alone matches current monthly contribution):{" "}
          {stopContributingYear != null ? `~${stopContributingYear} years from now` : "beyond 40yr horizon"}.
        </p>
      </div>

      <RetirementSimulator startingValue={startingValue} baseMonthly={baseMonthly} annualIncreasePct={annualIncreasePct} capMonthly={capMonthly} defaultReturnPct={effectiveRate} currentAge={currentAge ?? 35} />
    </div>
  );
}

function RetirementSimulator({
  startingValue,
  baseMonthly,
  annualIncreasePct,
  capMonthly,
  defaultReturnPct,
  currentAge,
}: {
  startingValue: number;
  baseMonthly: number;
  annualIncreasePct: number;
  capMonthly: number;
  defaultReturnPct: number;
  currentAge: number;
}) {
  const [retirementAge, setRetirementAge] = useState(65);
  const [endAge, setEndAge] = useState(90);
  const [monthlyWithdrawal, setMonthlyWithdrawal] = useState(2500);
  const [inflationAdjusted, setInflationAdjusted] = useState(true);
  const [inflationPct, setInflationPct] = useState(2.5);
  const [pensionMonthly, setPensionMonthly] = useState(1200);
  const [pensionStartAge, setPensionStartAge] = useState(67);
  const [partTimeIncomeMonthly, setPartTimeIncomeMonthly] = useState(0);
  const [partTimeIncomeYears, setPartTimeIncomeYears] = useState(0);
  const [returnPct, setReturnPct] = useState(defaultReturnPct);

  // Project the portfolio forward from now to retirementAge using the existing
  // contribution schedule, so the withdrawal simulator starts from a realistic
  // retirement-day balance rather than today's value.
  const startingPortfolioAtRetirement = useMemo(() => {
    const yearsToRetirement = Math.max(0, retirementAge - currentAge);
    const points = projectSeries(startingValue, baseMonthly, annualIncreasePct, capMonthly, returnPct, yearsToRetirement);
    return points[points.length - 1]?.value ?? startingValue;
  }, [startingValue, baseMonthly, annualIncreasePct, capMonthly, returnPct, retirementAge, currentAge]);

  const simResult = useMemo(
    () =>
      simulateWithdrawalSurvival({
        startingPortfolio: startingPortfolioAtRetirement,
        retirementAge,
        endAge,
        monthlyWithdrawal,
        inflationAdjusted,
        inflationPct,
        annualReturnPct: returnPct,
        pensionMonthly,
        pensionStartAge,
        partTimeIncomeMonthly,
        partTimeIncomeYears,
      }),
    [
      startingPortfolioAtRetirement,
      retirementAge,
      endAge,
      monthlyWithdrawal,
      inflationAdjusted,
      inflationPct,
      returnPct,
      pensionMonthly,
      pensionStartAge,
      partTimeIncomeMonthly,
      partTimeIncomeYears,
    ]
  );

  const stopContributing = useMemo(
    () =>
      findStopContributingPoint({
        currentValue: startingValue,
        monthlyContribution: baseMonthly,
        annualIncreasePct,
        capMonthly,
        annualReturnPct: returnPct,
        currentAge,
        retirementAge,
        targetRetirementValue: startingPortfolioAtRetirement,
      }),
    [startingValue, baseMonthly, annualIncreasePct, capMonthly, returnPct, currentAge, retirementAge, startingPortfolioAtRetirement]
  );

  const chartData = simResult.years.map((y) => ({ age: y.age, balance: Math.max(0, y.endBalance) }));

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
      <h2 className="mb-3 text-sm font-semibold">Retirement withdrawal simulator</h2>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <label className="block">
          Current age
          <input type="number" value={currentAge} disabled className="mt-1 w-full rounded-lg border border-neutral-300 bg-neutral-50 px-2 py-1.5 dark:border-neutral-700 dark:bg-neutral-800" />
        </label>
        <label className="block">
          Retirement age
          <input type="number" value={retirementAge} onChange={(e) => setRetirementAge(Number(e.target.value))} className="mt-1 w-full rounded-lg border border-neutral-300 px-2 py-1.5 dark:border-neutral-700 dark:bg-neutral-800" />
        </label>
        <label className="block">
          End age (plan to)
          <input type="number" value={endAge} onChange={(e) => setEndAge(Number(e.target.value))} className="mt-1 w-full rounded-lg border border-neutral-300 px-2 py-1.5 dark:border-neutral-700 dark:bg-neutral-800" />
        </label>
        <label className="block">
          Monthly withdrawal (€)
          <input type="number" value={monthlyWithdrawal} onChange={(e) => setMonthlyWithdrawal(Number(e.target.value))} className="mt-1 w-full rounded-lg border border-neutral-300 px-2 py-1.5 dark:border-neutral-700 dark:bg-neutral-800" />
        </label>
        <label className="block">
          Inflation (%/yr)
          <input type="number" step="0.1" value={inflationPct} onChange={(e) => setInflationPct(Number(e.target.value))} className="mt-1 w-full rounded-lg border border-neutral-300 px-2 py-1.5 dark:border-neutral-700 dark:bg-neutral-800" />
        </label>
        <label className="block">
          Return scenario (%/yr)
          <input type="number" step="0.5" value={returnPct} onChange={(e) => setReturnPct(Number(e.target.value))} className="mt-1 w-full rounded-lg border border-neutral-300 px-2 py-1.5 dark:border-neutral-700 dark:bg-neutral-800" />
        </label>
        <label className="block">
          Pension (€/mo)
          <input type="number" value={pensionMonthly} onChange={(e) => setPensionMonthly(Number(e.target.value))} className="mt-1 w-full rounded-lg border border-neutral-300 px-2 py-1.5 dark:border-neutral-700 dark:bg-neutral-800" />
        </label>
        <label className="block">
          Pension start age
          <input type="number" value={pensionStartAge} onChange={(e) => setPensionStartAge(Number(e.target.value))} className="mt-1 w-full rounded-lg border border-neutral-300 px-2 py-1.5 dark:border-neutral-700 dark:bg-neutral-800" />
        </label>
        <label className="block">
          Part-time income (€/mo)
          <input type="number" value={partTimeIncomeMonthly} onChange={(e) => setPartTimeIncomeMonthly(Number(e.target.value))} className="mt-1 w-full rounded-lg border border-neutral-300 px-2 py-1.5 dark:border-neutral-700 dark:bg-neutral-800" />
        </label>
        <label className="block">
          Part-time income (years)
          <input type="number" value={partTimeIncomeYears} onChange={(e) => setPartTimeIncomeYears(Number(e.target.value))} className="mt-1 w-full rounded-lg border border-neutral-300 px-2 py-1.5 dark:border-neutral-700 dark:bg-neutral-800" />
        </label>
      </div>
      <label className="mt-2 flex items-center gap-2 text-xs">
        <input type="checkbox" checked={inflationAdjusted} onChange={(e) => setInflationAdjusted(e.target.checked)} />
        Inflation-adjust the withdrawal amount each year
      </label>

      <div
        className={`mt-3 rounded-xl p-3 text-sm ${
          simResult.survives
            ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300"
            : "bg-rose-50 text-rose-800 dark:bg-rose-950/30 dark:text-rose-300"
        }`}
      >
        Projected retirement-day balance: €{Math.round(startingPortfolioAtRetirement).toLocaleString()}.{" "}
        {simResult.survives
          ? `Survives to age ${endAge} with an ending balance of €${Math.round(simResult.endingBalance).toLocaleString()}.`
          : `Depletes around age ${simResult.depletionAge?.toFixed(1)}, before age ${endAge}.`}
      </div>

      <p className="mt-2 text-xs text-neutral-500">
        Earliest point you could stop contributing and still reach the projected retirement balance:{" "}
        {stopContributing.canStopNow
          ? "now"
          : stopContributing.earliestAge != null
          ? `age ${stopContributing.earliestAge.toFixed(1)} (portfolio ≈ €${Math.round(stopContributing.portfolioValueAtThatPoint ?? 0).toLocaleString()})`
          : "not within the projection horizon"}
        .
      </p>

      {chartData.length > 1 && (
        <div className="mt-3 h-48 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
              <XAxis dataKey="age" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `€${(v / 1000).toFixed(0)}k`} width={50} />
              <Tooltip formatter={(v) => `€${Number(v).toLocaleString(undefined, { maximumFractionDigits: 0 })}`} />
              <Line type="monotone" dataKey="balance" stroke="#0f766e" dot={false} strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
