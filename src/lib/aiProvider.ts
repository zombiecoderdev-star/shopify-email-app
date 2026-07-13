import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenerativeAI } from "@google/generative-ai";

// Provider-agnostic AI call for template generation. AI_PROVIDER picks the
// branch at call time, so switching providers (Gemini free tier for dev,
// Anthropic for production) is a single env var change — callers never see
// which SDK actually ran.
export async function generateWithAI(systemPrompt: string, userPrompt: string): Promise<string> {
  const provider = process.env.AI_PROVIDER;

  if (provider === "gemini") {
    return generateWithGemini(systemPrompt, userPrompt);
  }
  if (provider === "anthropic") {
    return generateWithAnthropic(systemPrompt, userPrompt);
  }
  throw new Error(`AI_PROVIDER must be "gemini" or "anthropic" (got: ${provider || "unset"})`);
}

async function generateWithGemini(systemPrompt: string, userPrompt: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("AI generation is not configured (missing GEMINI_API_KEY)");

  const client = new GoogleGenerativeAI(apiKey);
  // "gemini-2.5-flash" was retired (404s as of writing) — verified against the
  // live ListModels/generateContent API, not just training data; re-check
  // https://generativelanguage.googleapis.com/v1beta/models if this 404s again.
  // @google/generative-ai@0.24.1's ModelParams supports systemInstruction directly.
  const model = client.getGenerativeModel({
    model: "gemini-3.5-flash",
    systemInstruction: systemPrompt,
  });
  const result = await model.generateContent(userPrompt);
  return result.response.text();
}

async function generateWithAnthropic(systemPrompt: string, userPrompt: string): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("AI generation is not configured (missing ANTHROPIC_API_KEY)");

  const client = new Anthropic({ apiKey });
  const response = await client.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 2000,
    thinking: { type: "disabled" },
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  });
  const textBlock = response.content.find((b) => b.type === "text");
  return textBlock?.type === "text" ? textBlock.text : "";
}
