import "server-only";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { userIdFromClient } from "@/lib/auth/verified-user";
import { getAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/**
 * Permanent account deletion.
 *
 * The subject is derived ONLY from the verified session. This handler takes no
 * parameters at all, so the request body is structurally unreadable and a
 * caller can never name another user.
 *
 * Deleting the Supabase Auth user is sufficient to remove every owned row:
 * `references auth.users (id) on delete cascade` is declared on attempts,
 * practice_questions, ai_usage_reservations, scan_extraction_usage and
 * diagram_review_usage. No application-level fan-out is needed, and none is
 * done here — a partial hand-rolled delete would be easier to get wrong.
 */
export async function POST() {
  const supabase = await createClient();
  const userId = await userIdFromClient(supabase);
  if (userId === null) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const { error } = await getAdminClient().auth.admin.deleteUser(userId);
    if (error) throw error;
  } catch (err) {
    // Same discipline as every other route: a stage and an error class, never
    // the message, the user id, or the email.
    console.error(
      JSON.stringify({
        event: "account_delete_failed",
        requestId: crypto.randomUUID(),
        errorClass: err instanceof Error ? err.name || "Error" : typeof err,
        timestamp: new Date().toISOString(),
      })
    );
    return NextResponse.json({ error: "delete_failed" }, { status: 502 });
  }

  return NextResponse.json({ deleted: true });
}
