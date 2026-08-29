// Shared types for the technical-analysis engine.

export interface Candle {
  time: number; // unix seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type Signal = "Buy" | "Sell" | "Neutral";

export type Verdict = "Strong Sell" | "Sell" | "Neutral" | "Buy" | "Strong Buy";

export interface IndicatorResult {
  name: string;
  signal: Signal;
  value?: number;
}

export interface PanelResult {
  buy: number;
  sell: number;
  neutral: number;
  verdict: Verdict;
  indicators: IndicatorResult[];
}

export interface TechnicalSummary {
  movingAverages: PanelResult;
  oscillators: PanelResult;
  summary: PanelResult;
}
