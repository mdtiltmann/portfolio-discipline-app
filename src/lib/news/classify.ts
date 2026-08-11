// Classifies a headline+summary into materiality (noise/worth_watching/material)
// and sentiment (positive/neutral/negative). Uses keyword heuristics always;
// optionally refines with the Anthropic API when ANTHROPIC_API_KEY is set.
// News classification NEVER produces a buy/sell recommendation directly — it
// only annotates the item, which the UI then pairs with the existing
// allocation-driven rules engine status.

export type Materiality = "noise" | "worth_watching" | "material";
export type Sentiment = "positive" | "neutral" | "negative";

export interface Classification {
  materiality: Materiality;
  sentiment: Sentiment;
}

const MATERIAL_KEYWORDS = [
  "earnings",
  "guidance",
  "profit warning",
  "downgrade",
  "upgrade",
  "recall",
  "lawsuit",
  "investigation",
  "sec ",
  "ceo",
  "resign",
  "bankruptcy",
  "merger",
  "acquisition",
  "fraud",
  "sanction",
  "layoffs",
  "restatement",
  "regulator",
  "antitrust",
  "breach",
];

const WORTH_WATCHING_KEYWORDS = [
  "analyst",
  "price target",
  "forecast",
  "product launch",
  "partnership",
  "contract",
  "stake",
  "buyback",
  "dividend",
  "outlook",
];

const POSITIVE_KEYWORDS = [
  "beat",
  "beats",
  "surge",
  "record",
  "upgrade",
  "growth",
  "strong",
  "rally",
  "profit",
  "win",
  "expands",
  "raises guidance",
];

const NEGATIVE_KEYWORDS = [
  "miss",
  "misses",
  "downgrade",
  "warning",
  "plunge",
  "falls",
  "lawsuit",
  "investigation",
  "recall",
  "fraud",
  "layoffs",
  "resign",
  "bankruptcy",
  "cuts guidance",
  "decline",
];

function keywordScore(text: string, keywords: string[]): number {
  const lower = text.toLowerCase();
  return keywords.reduce((score, kw) => (lower.includes(kw) ? score + 1 : score), 0);
}

function heuristicClassify(headline: string, summary: string | null): Classification {
  const text = `${headline} ${summary ?? ""}`;

  const materialScore = keywordScore(text, MATERIAL_KEYWORDS);
  const watchScore = keywordScore(text, WORTH_WATCHING_KEYWORDS);
  const materiality: Materiality = materialScore > 0 ? "material" : watchScore > 0 ? "worth_watching" : "noise";

  const posScore = keywordScore(text, POSITIVE_KEYWORDS);
  const negScore = keywordScore(text, NEGATIVE_KEYWORDS);
  const sentiment: Sentiment = posScore > negScore ? "positive" : negScore > posScore ? "negative" : "neutral";

  return { materiality, sentiment };
}

async function anthropicClassify(headline: string, summary: string | null): Promise<Classification | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 50,
        messages: [
          {
            role: "user",
            content: `Classify this financial news headline+summary. Reply ONLY with compact JSON: {"materiality":"noise"|"worth_watching"|"material","sentiment":"positive"|"neutral"|"negative"}.\n\nHeadline: ${headline}\nSummary: ${summary ?? ""}`,
          },
        ],
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const text = data?.content?.[0]?.text ?? "";
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]);
    if (!["noise", "worth_watching", "material"].includes(parsed.materiality)) return null;
    if (!["positive", "neutral", "negative"].includes(parsed.sentiment)) return null;
    return parsed as Classification;
  } catch {
    return null;
  }
}

/**
 * Classify a headline. Tries the Anthropic API (if configured) first for
 * higher-quality classification, falling back to the keyword heuristic on
 * any failure or when no API key is set.
 */
export async function classifyNewsItem(headline: string, summary: string | null): Promise<Classification> {
  const llmResult = await anthropicClassify(headline, summary);
  if (llmResult) return llmResult;
  return heuristicClassify(headline, summary);
}
