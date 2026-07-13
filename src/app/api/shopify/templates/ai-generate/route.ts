import { NextRequest, NextResponse } from "next/server";
import { generateWithAI } from "@/lib/aiProvider";

// POST /api/shopify/templates/ai-generate
// Body: { prompt, mode: "full" | "block", blockType?, existingContent?, shopName? }
// mode "full"  -> { subject: string, blocks: [{ type, data }] }
// mode "block" -> { text: string }
// Server-side only — provider selection (Gemini vs Anthropic) and API keys
// live in src/lib/aiProvider.ts; this route never touches them directly.

const BLOCK_SCHEMA_DOC = `Each block is { "type": "...", "data": {...} }. Allowed types and their data shape:
- header: { "text": string, "fontSize": number (12-48) }
- text:   { "text": string }
- image:  { "url": string, "alt": string }  (leave url as "" — you cannot generate real image URLs)
- button: { "label": string, "url": string, "color": string (hex) }  (leave url as "")
- divider: {}
- footer: { "text": string }
A typical email uses 4-7 blocks starting with a header and ending with a footer containing an unsubscribe line.`;

const PERSONALIZATION_DOC = `Personalization tags available: {{first_name}}, {{last_name}}, {{shop_name}}. Use them naturally where they fit (greetings, shop references) — do not overuse them.`;

function systemPromptFor(mode: "full" | "block") {
  if (mode === "full") {
    return `You write marketing email templates for a Shopify merchant's email marketing tool.
${BLOCK_SCHEMA_DOC}
${PERSONALIZATION_DOC}
Respond with ONLY valid JSON matching exactly this shape, no markdown code fences, no preamble, no explanation:
{ "subject": string, "blocks": [ { "type": string, "data": {...} } ] }`;
  }
  return `You write or rewrite a single paragraph of marketing email copy for a Shopify merchant's email marketing tool.
${PERSONALIZATION_DOC}
Respond with ONLY valid JSON matching exactly this shape, no markdown code fences, no preamble, no explanation:
{ "text": string }`;
}

function stripJsonFences(raw: string) {
  return raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
}

export async function POST(req: NextRequest) {
  const { prompt, mode, blockType, existingContent, shopName } = await req.json();

  if (!prompt || typeof prompt !== "string") {
    return NextResponse.json({ error: "prompt is required" }, { status: 400 });
  }
  if (mode !== "full" && mode !== "block") {
    return NextResponse.json({ error: 'mode must be "full" or "block"' }, { status: 400 });
  }

  const contextLines = [
    shopName ? `Shop name: ${shopName}` : null,
    mode === "block" && blockType ? `Block type being edited: ${blockType}` : null,
    mode === "block" && existingContent ? `Existing text to revise:\n${existingContent}` : null,
  ].filter(Boolean);

  const userMessage = [...contextLines, `Request: ${prompt}`].join("\n\n");

  let raw: string;
  try {
    raw = await generateWithAI(systemPromptFor(mode), userMessage);
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "AI generation request failed" }, { status: 502 });
  }

  let parsed: any;
  try {
    parsed = JSON.parse(stripJsonFences(raw));
  } catch {
    return NextResponse.json({ error: "AI response was not valid JSON" }, { status: 400 });
  }

  if (mode === "full") {
    if (!parsed || typeof parsed.subject !== "string" || !Array.isArray(parsed.blocks)) {
      return NextResponse.json({ error: "AI response did not match the expected template shape" }, { status: 400 });
    }
  } else if (!parsed || typeof parsed.text !== "string") {
    return NextResponse.json({ error: "AI response did not match the expected block shape" }, { status: 400 });
  }

  return NextResponse.json(parsed);
}

// GET /api/shopify/templates/ai-generate
// Dev-only hint for the AI generation modal's "Testing mode: Gemini" banner —
// AI_PROVIDER isn't readable client-side (no NEXT_PUBLIC_ prefix), so the
// modal asks here instead. Never returns an API key, just which provider is
// configured; the caller still gates display on NODE_ENV === "development".
export async function GET() {
  return NextResponse.json({ provider: process.env.AI_PROVIDER || null });
}
