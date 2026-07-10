import type { SupabaseClient } from "@supabase/supabase-js";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function verifiedUserId(
  claims: Record<string, unknown> | null | undefined
): string | null {
  const subject = claims?.sub;
  return typeof subject === "string" && UUID_PATTERN.test(subject) ? subject : null;
}

export async function userIdFromClient(supabase: SupabaseClient): Promise<string | null> {
  const { data } = await supabase.auth.getClaims();
  return verifiedUserId(data?.claims as Record<string, unknown> | null | undefined);
}

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}
