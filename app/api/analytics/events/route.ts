import { createClient } from "@/lib/supabase/server";
import { userIdFromClient } from "@/lib/auth/verified-user";
import { getAdminClient } from "@/lib/supabase/admin";
import { parseEvent } from "@/lib/analytics/events";
import { boundedJson, validMutationOrigin, STUDENT_PRIVATE_HEADERS } from "@/lib/analytics/request";

export async function POST(request: Request) {
  const reply = (status: number) => new Response(null, { status, headers: STUDENT_PRIVATE_HEADERS });
  if (!validMutationOrigin(request)) return reply(403);
  const userId = await userIdFromClient(await createClient());
  if (!userId) return reply(401);
  let input;
  try { input = parseEvent(await boundedJson(request)); } catch { return reply(400); }
  if (!input) return reply(400);
  const { error } = await getAdminClient().rpc("record_analytics_event", {
    p_user_id: userId, p_event_name: input.event, p_attempt_id: input.attemptId ?? null,
    p_practice_question_id: input.practiceQuestionId ?? null, p_properties: input.properties ?? {},
  });
  return reply(error ? 400 : 204);
}
