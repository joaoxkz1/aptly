import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cachedAdmin: SupabaseClient | null = null;

/**
 * Privileged Supabase client for narrowly scoped server persistence.
 *
 * Callers MUST authenticate the request with the cookie-scoped client first,
 * derive a verified user id, and include that id in every admin query. This
 * module is server-only and never logs either credential.
 */
export function getAdminClient(): SupabaseClient {
  if (cachedAdmin !== null) return cachedAdmin;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error("server persistence is not configured");
  }

  cachedAdmin = createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
    global: { headers: { "X-Client-Info": "aptly-server-authority" } },
  });
  return cachedAdmin;
}
