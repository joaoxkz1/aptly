import { createClient } from "@/lib/supabase/server";
import { isUuid, userIdFromClient } from "@/lib/auth/verified-user";
import { parseFeedback, parseOriginalMark } from "@/lib/analytics/student-reports";
import { boundedJson, validMutationOrigin, STUDENT_PRIVATE_HEADERS } from "@/lib/analytics/request";

type Context = { params: Promise<{ id: string }> };
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: STUDENT_PRIVATE_HEADERS });
async function owner(context: Context) {
  const { id } = await context.params;
  if (!isUuid(id)) return null;
  const client = await createClient(), userId = await userIdFromClient(client);
  if (!userId) return null;
  const { data, error } = await client.from("attempts").select("id").eq("id", id).eq("user_id", userId).maybeSingle();
  return data && !error ? { client, id, userId } : null;
}
export async function GET(_request: Request, context: Context) {
  const auth = await owner(context);
  if (!auth) return json({ error: "not_found" }, 404);
  const [feedback, original] = await Promise.all([
    auth.client.from("attempt_feedback").select("rating,comment").eq("attempt_id", auth.id).eq("user_id", auth.userId).maybeSingle(),
    auth.client.from("reported_original_marks").select("marks_earned,marks_available,source,updated_at").eq("attempt_id", auth.id).eq("user_id", auth.userId).maybeSingle(),
  ]);
  if (feedback.error || original.error) return json({ error: "unavailable" }, 503);
  return json({ feedback: feedback.data, originalMark: original.data });
}
export async function PUT(request: Request, context: Context) {
  if (!validMutationOrigin(request)) return json({ error: "forbidden" }, 403);
  const auth = await owner(context);
  if (!auth) return json({ error: "not_found" }, 404);
  let body: Record<string, unknown>;
  try {
    const value = await boundedJson(request);
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
    body = value as Record<string, unknown>;
  } catch { return json({ error: "invalid_report" }, 400); }
  if (Object.keys(body).some(k => !["kind", "value"].includes(k))) return json({ error: "invalid_report" }, 400);
  const table = body.kind === "feedback" ? "attempt_feedback" : body.kind === "originalMark" ? "reported_original_marks" : null;
  if (!table) return json({ error: "invalid_report" }, 400);
  if (body.value === null) {
    const { error } = await auth.client.from(table).delete().eq("user_id", auth.userId).eq("attempt_id", auth.id);
    return error ? json({ error: "save_failed" }, 503) : json({ saved: true });
  }
  const value = body.kind === "feedback" ? parseFeedback(body.value) : parseOriginalMark(body.value);
  if (!value) return json({ error: "invalid_report" }, 400);
  const update = () => auth.client.from(table).update(value).eq("user_id", auth.userId).eq("attempt_id", auth.id).select("id");
  const existing = await update();
  if (existing.error) return json({ error: "save_failed" }, 503);
  if (!existing.data?.length) {
    // user_id and timestamps are database defaults; cookie client keeps RLS on writes.
    const inserted = await auth.client.from(table).insert({ attempt_id: auth.id, ...value });
    if (inserted.error?.code === "23505") {
      const retried = await update();
      if (retried.error || !retried.data?.length) return json({ error: "save_failed" }, 503);
    } else if (inserted.error) return json({ error: "save_failed" }, 503);
  }
  return json({ saved: true });
}
