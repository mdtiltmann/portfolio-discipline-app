// Pure logic for reconciling extracted holdings when the same ticker
// appears in more than one uploaded screenshot (e.g. an overview screen and
// a detail screen for the same position). Kept dependency-free so it can be
// unit tested without touching Supabase or the Anthropic API.

export interface ExtractedItem {
  ticker?: string;
  name?: string;
  quantity?: number;
  current_value?: number;
  gain_eur?: number;
  gain_pct?: number;
  cost_basis?: number;
  confidence?: number;
  screenshot_date?: string;
}

export interface MergedItem extends ExtractedItem {
  /** True when source rows disagreed on current_value by more than the tolerance. */
  valueMismatch: boolean;
  /** How many raw rows were combined into this one. */
  sourceCount: number;
}

const MISMATCH_TOLERANCE_PCT = 1; // >1% difference between duplicate rows is flagged

/**
 * Merges duplicate-ticker rows extracted across one or more screenshots.
 * Preference order per field: most recent screenshot_date wins; if dates are
 * equal/missing, the higher-confidence row wins. Numeric current_value
 * disagreement beyond tolerance is flagged via valueMismatch rather than
 * silently discarded, so the review UI can surface it.
 */
export function mergeExtractedItems(items: ExtractedItem[]): MergedItem[] {
  const groups = new Map<string, ExtractedItem[]>();
  const order: string[] = [];

  for (const item of items) {
    const key = (item.ticker ?? "").trim().toUpperCase();
    if (!key) continue; // rows without a ticker can't be merged/matched
    if (!groups.has(key)) {
      groups.set(key, []);
      order.push(key);
    }
    groups.get(key)!.push(item);
  }

  return order.map((key) => {
    const rows = groups.get(key)!;
    if (rows.length === 1) {
      return { ...rows[0], ticker: key, valueMismatch: false, sourceCount: 1 };
    }

    const winner = pickWinner(rows);
    const values = rows.map((r) => r.current_value).filter((v): v is number => typeof v === "number");
    const valueMismatch = hasMismatch(values);

    return { ...winner, ticker: key, valueMismatch, sourceCount: rows.length };
  });
}

function pickWinner(rows: ExtractedItem[]): ExtractedItem {
  return [...rows].sort((a, b) => {
    const dateA = a.screenshot_date ?? "";
    const dateB = b.screenshot_date ?? "";
    if (dateA !== dateB) return dateA > dateB ? -1 : 1; // most recent date first
    return (b.confidence ?? 0) - (a.confidence ?? 0); // then highest confidence
  })[0];
}

function hasMismatch(values: number[]): boolean {
  if (values.length < 2) return false;
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (min <= 0) return max > 0;
  return ((max - min) / min) * 100 > MISMATCH_TOLERANCE_PCT;
}
