import "server-only";
import { timingSafeEqual } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { isUuid } from "@/lib/auth/verified-user";

export type AdminIdentity = { userId: string; sessionId: string };

export function matchesAdminCode(code: string): boolean {
  const configured = process.env.ADMIN_ROUTE_CODE;
  if (!configured || !/^\d{6,32}$/.test(configured) || !/^\d{6,32}$/.test(code)) return false;
  const expected = Buffer.from(configured), supplied = Buffer.from(code);
  return expected.length === supplied.length && timingSafeEqual(expected, supplied);
}

/** Fail closed, never cache membership or trust editable user_metadata. */
export async function authorizeAdmin(code: string): Promise<AdminIdentity | null> {
  if (!matchesAdminCode(code)) return null;
  try {
    const client = await createClient();
    const { data: { user }, error } = await client.auth.getUser();
    if (error || !user || !isUuid(user.id) || user.is_anonymous) return null;
    const { data, error: claimsError } = await client.auth.getClaims();
    const sessionId = data?.claims?.session_id;
    if (claimsError || data?.claims?.sub !== user.id || !isUuid(sessionId)) return null;
    const { data: allowed, error: accessError } = await getAdminClient().rpc("admin_session_authorized", {
      p_user_id: user.id, p_session_id: sessionId,
    });
    return !accessError && allowed === true ? { userId: user.id, sessionId } : null;
  } catch { return null; }
}

export const PRIVATE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  "Vary": "Cookie",
  "X-Robots-Tag": "noindex, nofollow, noarchive",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Content-Security-Policy": "default-src 'none'; style-src 'self'; img-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
};
export function adminNotFound() {
  return new Response("Not found", { status: 404, headers: PRIVATE_HEADERS });
}
