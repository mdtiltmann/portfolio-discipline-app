import { NextRequest, NextResponse } from "next/server";

interface ExtractedItem {
  ticker?: string;
  name?: string;
  quantity?: number;
  current_value?: number;
  gain_eur?: number;
  gain_pct?: number;
  cost_basis?: number;
  confidence?: number;
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      {
        error: "ANTHROPIC_API_KEY not set",
        message:
          "Screenshot extraction requires an Anthropic API key. Add ANTHROPIC_API_KEY to your environment, then retry.",
        items: [],
      },
      { status: 200 }
    );
  }

  try {
    const body = await req.json();
    const images: string[] = body.images ?? []; // array of base64 data URLs
    if (!Array.isArray(images) || images.length === 0) {
      return NextResponse.json({ error: "No images provided", items: [] }, { status: 200 });
    }

    const content: Array<Record<string, unknown>> = [
      {
        type: "text",
        text:
          "You are extracting portfolio holdings from broker app screenshots. " +
          "Return ONLY a JSON array (no markdown fences, no prose) of objects with fields: " +
          "ticker (string), name (string), quantity (number, optional), current_value (number, in the visible currency), " +
          "gain_eur (number, optional), gain_pct (number, optional), cost_basis (number, optional), " +
          "confidence (0-1, your confidence in this row's extraction accuracy). " +
          "If a field is not visible, omit it. If nothing readable, return [].",
      },
    ];

    for (const img of images) {
      const match = img.match(/^data:(image\/\w+);base64,(.+)$/);
      if (!match) continue;
      content.push({
        type: "image",
        source: { type: "base64", media_type: match[1], data: match[2] },
      });
    }

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-5",
        max_tokens: 2048,
        messages: [{ role: "user", content }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      return NextResponse.json(
        { error: "Anthropic API error", message: errText, items: [] },
        { status: 200 }
      );
    }

    const json = await response.json();
    const text: string = json.content?.[0]?.text ?? "[]";
    const cleaned = text.replace(/```json\n?/g, "").replace(/```/g, "").trim();

    let items: ExtractedItem[] = [];
    try {
      items = JSON.parse(cleaned);
    } catch {
      return NextResponse.json(
        { error: "Failed to parse model output", message: cleaned, items: [] },
        { status: 200 }
      );
    }

    return NextResponse.json({ items });
  } catch (err) {
    return NextResponse.json(
      { error: "Unexpected error", message: err instanceof Error ? err.message : String(err), items: [] },
      { status: 200 }
    );
  }
}
