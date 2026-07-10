import "server-only";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { userIdFromClient } from "@/lib/auth/verified-user";
import { getAdminClient } from "@/lib/supabase/admin";
import { buildSeedAttempts } from "@/lib/seed";
import { attemptToInsert } from "@/lib/supabase/attempts";

export const runtime = "nodejs";

/** Development/QA-only seeded-data reset; never exposed in production. */
export async function POST() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const supabase = await createClient();
  const userId = await userIdFromClient(supabase);
  if (userId === null) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const admin = getAdminClient();
    const { error: deleteError } = await admin.from("attempts").delete().eq("user_id", userId);
    if (deleteError) throw deleteError;
    const rows = buildSeedAttempts().map((attempt) => ({
      ...attemptToInsert(attempt),
      user_id: userId,
      idempotency_key: crypto.randomUUID(),
      created_at: attempt.createdAt,
      diagram_evidence: null,
    }));
    const { error: insertError } = await admin.from("attempts").insert(rows);
    if (insertError) throw insertError;
    return NextResponse.json({ reset: true });
  } catch {
    return NextResponse.json({ error: "reset_failed" }, { status: 502 });
  }
}
