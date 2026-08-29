"use client";

// SVG semicircle needle gauge, TradingView-Technicals-style: a single arc
// gradient from Sell (red, left) through Neutral (grey, middle) to Buy
// (green, right), spanning exactly 180 degrees, with a needle pointing
// according to the buy/sell/neutral ratio and the verdict word rendered
// below it. Informational only, not financial advice.

import { useId } from "react";

const VERDICT_COLOR: Record<string, string> = {
  "Strong Sell": "text-red-600 dark:text-red-400",
  Sell: "text-red-500 dark:text-red-400",
  Neutral: "text-neutral-500 dark:text-neutral-400",
  Buy: "text-emerald-600 dark:text-emerald-400",
  "Strong Buy": "text-emerald-700 dark:text-emerald-400",
};

// Arc spans exactly 180deg: 180deg = far left (Sell), 360deg/0deg = far
// right (Buy), passing over the top at 270deg. Using standard math angles
// with SVG's y-down coordinate system, this traces the upper semicircle.
const ARC_START = 180;
const ARC_END = 360;

function polar(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = (Math.PI / 180) * angleDeg;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function arcPath(cx: number, cy: number, r: number, startDeg: number, endDeg: number) {
  const start = polar(cx, cy, r, startDeg);
  const end = polar(cx, cy, r, endDeg);
  const largeArc = endDeg - startDeg <= 180 ? 0 : 1;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y}`;
}

export interface TechnicalGaugeProps {
  label: string;
  buy: number;
  sell: number;
  neutral: number;
  verdict: string;
  size?: "sm" | "lg";
}

export default function TechnicalGauge({ label, buy, sell, neutral, verdict, size = "sm" }: TechnicalGaugeProps) {
  const gradientId = useId();
  const total = buy + sell + neutral;
  const ratio = total > 0 ? (buy - sell) / total : 0; // [-1, 1]
  const needleAngle = ARC_START + ((ratio + 1) / 2) * (ARC_END - ARC_START);

  const dims =
    size === "lg"
      ? { w: 208, h: 128, r: 88, stroke: 10, cy: 108 }
      : { w: 156, h: 96, r: 64, stroke: 8, cy: 82 };
  const cx = dims.w / 2;
  const cy = dims.cy;
  const r = dims.r;
  const needleLen = r - dims.stroke - 6;
  const tip = polar(cx, cy, needleLen, needleAngle);

  const verdictColor = VERDICT_COLOR[verdict] ?? "text-neutral-500";

  return (
    <div className={`mx-auto flex w-full flex-col items-center ${size === "lg" ? "max-w-[208px]" : "max-w-[156px]"}`}>
      <p className="mb-1.5 text-center text-[10px] font-medium uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
        {label}
      </p>
      <svg
        width="100%"
        height="auto"
        viewBox={`0 0 ${dims.w} ${cy + 10}`}
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#dc2626" />
            <stop offset="50%" stopColor="#9ca3af" />
            <stop offset="100%" stopColor="#16a34a" />
          </linearGradient>
        </defs>
        <path
          d={arcPath(cx, cy, r, ARC_START, ARC_END)}
          fill="none"
          stroke={`url(#${gradientId})`}
          strokeWidth={dims.stroke}
          strokeLinecap="round"
          opacity={0.85}
        />
        <line
          x1={cx}
          y1={cy}
          x2={tip.x}
          y2={tip.y}
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          className="text-neutral-700 dark:text-neutral-200"
        />
        <circle cx={cx} cy={cy} r={3.5} className="fill-neutral-700 dark:fill-neutral-200" />
      </svg>
      <p className={`-mt-0.5 text-sm font-semibold ${verdictColor}`}>{verdict}</p>
      <div className="mt-2.5 grid grid-cols-3 gap-x-4 text-center text-[10px]">
        <div>
          <p className="font-semibold text-red-500 dark:text-red-400">{sell}</p>
          <p className="text-neutral-400 dark:text-neutral-500">Sell</p>
        </div>
        <div>
          <p className="font-semibold text-neutral-500 dark:text-neutral-400">{neutral}</p>
          <p className="text-neutral-400 dark:text-neutral-500">Neutral</p>
        </div>
        <div>
          <p className="font-semibold text-emerald-600 dark:text-emerald-400">{buy}</p>
          <p className="text-neutral-400 dark:text-neutral-500">Buy</p>
        </div>
      </div>
    </div>
  );
}
