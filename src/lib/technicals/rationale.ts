// Builds a short, plain-English explanation of why a ticker's signal is
// what it is, grounded strictly in the already-computed indicator values
// and news items — no separate model call per card, no invented claims.
// Informational only, not financial advice.

import type { IndicatorResult, PanelResult, Verdict } from "./types";

export interface MaterialNewsInput {
  headline: string;
  sentiment: "positive" | "neutral" | "negative";
}

export interface RationaleInput {
  ticker: string;
  movingAverages: PanelResult;
  oscillators: PanelResult;
  technicalVerdict: Verdict; // pure-technical summary verdict, pre-news
  newsAdjustedVerdict: Verdict;
  newsNudgeApplied: number; // ratio-space nudge, e.g. 0.075
  materialNews: MaterialNewsInput[]; // already filtered to materiality === "material"
  lastPrice: number | null;
}

const SHORT_TERM_NAMES = new Set(["SMA10", "EMA10", "SMA20", "EMA20"]);
const LONG_TERM_NAMES = new Set(["SMA100", "EMA100", "SMA200", "EMA200"]);

function findIndicator(indicators: IndicatorResult[], name: string): IndicatorResult | undefined {
  return indicators.find((i) => i.name === name);
}

function trendBucketCounts(indicators: IndicatorResult[], names: Set<string>): { buy: number; sell: number } {
  let buy = 0;
  let sell = 0;
  for (const i of indicators) {
    if (!names.has(i.name)) continue;
    if (i.signal === "Buy") buy += 1;
    else if (i.signal === "Sell") sell += 1;
  }
  return { buy, sell };
}

function describeRsi(rsi: number | undefined): string | null {
  if (rsi == null) return null;
  if (rsi > 70) return `RSI is ${rsi.toFixed(0)}, in overbought territory — a pullback wouldn't be surprising`;
  if (rsi < 30) return `RSI is ${rsi.toFixed(0)}, in oversold territory — selling may be overdone`;
  return `RSI is ${rsi.toFixed(0)}, a neutral reading with no strong momentum extreme`;
}

function describeMacd(macdHist: number | undefined): string | null {
  if (macdHist == null) return null;
  return macdHist > 0
    ? "MACD is above its signal line, a short-term bullish momentum sign"
    : "MACD is below its signal line, a short-term bearish momentum sign";
}

function describeNews(materialNews: MaterialNewsInput[], nudgeApplied: number): string {
  if (materialNews.length === 0) {
    return "No material news is currently affecting this call.";
  }
  const positive = materialNews.filter((n) => n.sentiment === "positive").length;
  const negative = materialNews.filter((n) => n.sentiment === "negative").length;
  const tilt =
    nudgeApplied > 0.01 ? "nudging the call toward Buy" : nudgeApplied < -0.01 ? "nudging the call toward Sell" : "not enough on its own to shift the call";
  const skew =
    positive > negative ? "net positive" : negative > positive ? "net negative" : "mixed";
  const sample = materialNews[0]?.headline;
  return `${materialNews.length} material headline${materialNews.length > 1 ? "s" : ""} recently (${skew}, ${positive} positive / ${negative} negative), ${tilt}${sample ? ` — e.g. "${sample}"` : ""}.`;
}

/**
 * Produces 2-4 short sentences: the overall call, why the moving averages
 * and oscillators point that way (including short vs long-term trend
 * alignment), a couple of specific readings (RSI, MACD) if available, and
 * how news is (or isn't) factoring in.
 */
export function buildTechnicalRationale(input: RationaleInput): string {
  const { movingAverages, oscillators, technicalVerdict, newsAdjustedVerdict, newsNudgeApplied, materialNews } = input;

  const sentences: string[] = [];

  const shortTerm = trendBucketCounts(movingAverages.indicators, SHORT_TERM_NAMES);
  const longTerm = trendBucketCounts(movingAverages.indicators, LONG_TERM_NAMES);
  const shortLean = shortTerm.buy > shortTerm.sell ? "up" : shortTerm.sell > shortTerm.buy ? "down" : "flat";
  const longLean = longTerm.buy > longTerm.sell ? "up" : longTerm.sell > longTerm.buy ? "down" : "flat";

  sentences.push(
    `Call: ${newsAdjustedVerdict}${newsAdjustedVerdict !== technicalVerdict ? ` (technicals alone said ${technicalVerdict})` : ""} — moving averages are ${movingAverages.verdict.toLowerCase()} (${movingAverages.buy} buy / ${movingAverages.sell} sell / ${movingAverages.neutral} neutral) while oscillators are ${oscillators.verdict.toLowerCase()} (${oscillators.buy} buy / ${oscillators.sell} sell / ${oscillators.neutral} neutral).`
  );

  if (shortLean !== longLean && shortLean !== "flat" && longLean !== "flat") {
    sentences.push(
      `Short-term averages are trending ${shortLean} while longer-term averages are trending ${longLean} — a possible early trend shift, not yet confirmed across the board.`
    );
  } else if (shortLean === longLean && shortLean !== "flat") {
    sentences.push(`Short and long-term averages agree — both trending ${shortLean}, a more confirmed trend.`);
  }

  const rsi = findIndicator(oscillators.indicators, "RSI(14)")?.value;
  const macd = findIndicator(oscillators.indicators, "MACD(12,26,9)")?.value;
  const oscBits = [describeRsi(rsi), describeMacd(macd)].filter((s): s is string => !!s);
  if (oscBits.length > 0) sentences.push(oscBits.join(". ") + ".");

  sentences.push(describeNews(materialNews, newsNudgeApplied));

  return sentences.join(" ");
}
