import type { SupabaseClient } from "@supabase/supabase-js";
import type { Assessment, Attempt, Feedback, Subject } from "@/lib/types";

const TABLE = "attempts";

// Columns read back from the DB. `user_id` is intentionally never selected or
// written by the client — it is stamped server-side via `default auth.uid()`.
// The full assessment object lives in the `assessment` jsonb column; the
// denormalized columns exist for DB-level integrity and future SQL analytics.
const SELECT_COLUMNS =
  "id, subject, topic, question, answer, score, max_score, feedback, mistake_type, next_step, created_at, assessment";

export interface AttemptRow {
  id: string;
  subject: string;
  topic: string;
  question: string;
  answer: string;
  score: number;
  max_score: number;
  feedback: Feedback;
  mistake_type: string | null;
  next_step: string | null;
  created_at: string;
  assessment: Assessment | null;
}

export function rowToAttempt(row: AttemptRow): Attempt {
  return {
    id: row.id,
    createdAt: row.created_at,
    subject: row.subject as Subject,
    topic: row.topic,
    question: row.question,
    answer: row.answer,
    feedback: row.feedback,
    assessment: row.assessment ?? null,
  };
}

/**
 * Insert payload for a real, user-submitted attempt.
 * Omits id, user_id, and created_at so the database generates them
 * (user_id via `default auth.uid()`, created_at via `default now()`).
 * Legacy/seed attempts (no assessment) write NULL into every assessment column.
 */
function attemptToInsert(attempt: Attempt) {
  const f = attempt.feedback;
  const a = attempt.assessment ?? null;
  return {
    subject: attempt.subject,
    topic: attempt.topic,
    question: attempt.question,
    answer: attempt.answer,
    score: f.score,
    max_score: 7,
    feedback: f,
    mistake_type: f.mistakes[0] ?? null,
    next_step: f.studyNext,
    // Full object + denormalized columns (null for legacy attempts). The
    // `assessment` JSON is the single source of truth; these mirror it for
    // DB-level integrity and future SQL analytics only.
    assessment: a,
    assessment_version: a?.version ?? null,
    assessment_format: a?.assessmentFormat ?? null,
    paper: a?.paper ?? null,
    syllabus_topic: a?.syllabusTopic ?? null,
    marks_earned: a?.marksEarned ?? null,
    marks_available: a?.marksAvailable ?? null,
    marks_assessable: a?.marksAssessable ?? null,
    marks_source: a?.marksSource ?? null,
    mark_display_mode: a?.markDisplayMode ?? null,
    classification_confidence: a?.classificationConfidence ?? null,
    // Assessment Integrity (v2) — server-derived canonical status.
    scoring_state: a?.scoringState ?? null,
    mark_total_source: a?.markTotalSource ?? null,
    recognized_template: a?.recognizedTemplate ?? null,
    eligible_for_core: a?.eligibleForCoreAnalytics ?? null,
  };
}

export async function fetchAttempts(supabase: SupabaseClient): Promise<Attempt[]> {
  const { data, error } = await supabase
    .from(TABLE)
    .select(SELECT_COLUMNS)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data as unknown as AttemptRow[]).map(rowToAttempt);
}

export async function insertAttempt(
  supabase: SupabaseClient,
  attempt: Attempt
): Promise<void> {
  const { error } = await supabase.from(TABLE).insert(attemptToInsert(attempt));
  if (error) throw error;
}

export async function clearAttempts(supabase: SupabaseClient): Promise<void> {
  // RLS limits this delete to the current user's own rows.
  const { error } = await supabase.from(TABLE).delete().not("id", "is", null);
  if (error) throw error;
}

/**
 * Demo-only seeding (kept temporarily for testing, wired to the existing
 * "Reset demo data" button — never auto-run). Unlike real attempts, the
 * crafted created_at dates are preserved so the demo dashboard reproduces
 * its streak/analytics. user_id is still DB-generated.
 */
export async function seedAttempts(
  supabase: SupabaseClient,
  attempts: Attempt[]
): Promise<void> {
  const rows = attempts.map((a) => ({
    ...attemptToInsert(a),
    created_at: a.createdAt,
  }));
  const { error } = await supabase.from(TABLE).insert(rows);
  if (error) throw error;
}
