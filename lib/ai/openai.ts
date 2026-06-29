import "server-only";
import OpenAI from "openai";

/**
 * Server-only OpenAI client factory. The `server-only` import makes any
 * accidental client-side import fail the build, guaranteeing the API key
 * never ships in a browser bundle. The key is read from OPENAI_API_KEY
 * (no NEXT_PUBLIC_ prefix) so Next.js never inlines it client-side.
 */
let client: OpenAI | null = null;

export function getOpenAI(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    // Generic message — never echoes the key or its value.
    throw new Error("OPENAI_API_KEY is not configured");
  }
  if (client === null) {
    client = new OpenAI({ apiKey });
  }
  return client;
}
