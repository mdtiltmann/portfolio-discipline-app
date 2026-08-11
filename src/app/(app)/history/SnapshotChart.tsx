"use client";

import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";

interface SnapshotRow {
  id: string;
  snapshot_date: string;
  total_value: number;
  total_gain: number | null;
  contribution_made: number | null;
}

const VALUE_COLOR = "#0f766e"; // teal-700
const GAIN_COLOR = "#7c3aed"; // violet-600, distinct hue for second series

export default function SnapshotChart({ snapshots }: { snapshots: SnapshotRow[] }) {
  if (snapshots.length === 0) {
    return (
      <section className="rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
        <h2 className="mb-2 text-sm font-semibold">Portfolio value over time</h2>
        <p className="text-sm text-neutral-500">
          No snapshots yet. Snapshots are recorded when you confirm a screenshot import or the system takes a
          monthly reading.
        </p>
      </section>
    );
  }

  const chartData = snapshots.map((s) => ({
    date: new Date(s.snapshot_date).toLocaleDateString(undefined, { month: "short", year: "2-digit" }),
    value: Number(s.total_value),
    gain: s.total_gain != null ? Number(s.total_gain) : null,
  }));

  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
      <h2 className="mb-2 text-sm font-semibold">Portfolio value over time</h2>
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
            <XAxis dataKey="date" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `€${(v / 1000).toFixed(0)}k`} width={50} />
            <Tooltip formatter={(v) => `€${Number(v).toLocaleString(undefined, { maximumFractionDigits: 0 })}`} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Line type="monotone" dataKey="value" name="Total value" stroke={VALUE_COLOR} dot={{ r: 3 }} strokeWidth={2} />
            <Line type="monotone" dataKey="gain" name="Total gain" stroke={GAIN_COLOR} dot={{ r: 3 }} strokeWidth={2} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
