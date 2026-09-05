import "server-only";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isUuid, verifiedUserId } from "@/lib/auth/verified-user";
import { fetchAttempts } from "@/lib/supabase/attempts";
import { readEconomicsCourseLevel } from "@/lib/assessment/course-level";
import { PracticeFocusError, verifiedPracticeFocus } from "@/lib/assessment/question-generator";

/** Read-only preview. URL labels are never evidence for a focus. */
export async function GET(request: Request) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims as Record<string, unknown> | undefined;
  if (!verifiedUserId(claims)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const courseLevel = readEconomicsCourseLevel(claims?.user_metadata);
  if (!courseLevel) return NextResponse.json({ error: "economics_level_required" }, { status: 409 });
  const params = new URL(request.url).searchParams;
  const source = params.get("source");
  const sourceAttemptId = params.get("attempt");
  if ((source !== "current_focus" && source !== "answer_feedback") ||
      (source === "answer_feedback" ? !isUuid(sourceAttemptId) : sourceAttemptId !== null)) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  try {
    const attempts = await fetchAttempts(supabase);
    return NextResponse.json({ focus: verifiedPracticeFocus({ source, sourceAttemptId, attempts, courseLevel }) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof PracticeFocusError ? error.code : "practice_generation_failed" }, { status: 409 });
  }
}
