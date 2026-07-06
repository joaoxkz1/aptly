import type { SupabaseClient } from "@supabase/supabase-js";
import type { Assessment, Attempt, Feedback, Subject } from "@/lib/types";
import type { DiagramEvidence } from "@/lib/diagram/evidence";

const TABLE = "attempts";

// Columns read back from the DB. `user_id` is intentionally never selected or
// written by the client — it is stamped server-side via `default auth.uid()`.
// The full assessment object lives in the `assessment` jsonb column; the
// denormalized columns exist for DB-level integrity and future SQL analytics.
const SELECT_COLUMNS =
  "id, subject, topic, question, answer, score, max_score, feedback, mistake_type, next_step, created_at, assessment, parent_attempt_id, practice_question_id, source_material, diagram_evidence";

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
  parent_attempt_id?: string | null;
  practice_question_id?: string | null;
  source_material?: string | null;
  diagram_evidence?: DiagramEvidence | null;
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
    parentAttemptId: row.parent_attempt_id ?? null,
    practiceQuestionId: row.practice_question_id ?? null,
    sourceMaterial: row.source_material ?? null,
    diagramEvidence: row.diagram_evidence ?? null,
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
    // Practice Loop links. RLS verifies the referenced rows belong to this
    // user, so a link can never point at another user's data.
    parent_attempt_id: attempt.parentAttemptId ?? null,
    practice_question_id: attempt.practiceQuestionId ?? null,
    // Manual source retention: the attempt's OWN private copy of the pasted
    // source it was graded against (null for non-source attempts). Deleted
    // with its row; revisions carry their own copy, so parent deletion never
    // strips a revision's source context.
    source_material: attempt.sourceMaterial ?? null,
    // Diagram Evidence V1: structured feedback-only findings from a reviewed
    // diagram photo (never marks, never image data — see lib/diagram/evidence.ts).
    // NULL for every attempt without a reviewed diagram; strictly per-attempt.
    diagram_evidence: attempt.diagramEvidence ?? null,
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

/**
 * Insert a real attempt and return it with the DATABASE-generated id and
 * created_at. Callers must use the returned attempt for any follow-up link
 * (e.g. a revision's parentAttemptId) — the local temporary id never reaches
 * other rows.
 */
export async function insertAttempt(
  supabase: SupabaseClient,
  attempt: Attempt
): Promise<Attempt> {
  const { data, error } = await supabase
    .from(TABLE)
    .insert(attemptToInsert(attempt))
    .select("id, created_at")
    .single();
  if (error) throw error;
  const row = data as { id: string; created_at: string };
  return { ...attempt, id: row.id, createdAt: row.created_at };
}

/**
 * Delete ONE attempt by id. RLS ("delete_own_attempts") limits the delete to
 * the current user's own row, so this can never touch another user's data.
 * Throws on failure so callers never optimistically drop the row.
 *
 * If the attempt answered an Aptly-generated practice question, the private
 * practice-question row (including any generated source material) is removed
 * too once no other attempt still references it — best-effort: a failed
 * cleanup never resurrects the already-deleted attempt.
 */
export async function deleteAttempt(supabase: SupabaseClient, id: string): Promise<void> {
  // Read the link BEFORE deleting (RLS scopes the read to this user's row).
  const { data: linkRow } = await supabase
    .from(TABLE)
    .select("practice_question_id")
    .eq("id", id)
    .maybeSingle();
  const practiceQuestionId =
    (linkRow as { practice_question_id?: string | null } | null)?.practice_question_id ?? null;

  const { error } = await supabase.from(TABLE).delete().eq("id", id);
  if (error) throw error;

  if (practiceQuestionId !== null) {
    try {
      // Keep the row while any other attempt (e.g. a revision) still grades
      // against its stored question/source; delete once fully unreferenced.
      const { count, error: countError } = await supabase
        .from(TABLE)
        .select("id", { count: "exact", head: true })
        .eq("practice_question_id", practiceQuestionId);
      if (countError) throw countError;
      if ((count ?? 0) === 0) {
        await supabase.from("practice_questions").delete().eq("id", practiceQuestionId);
      }
    } catch {
      // Best-effort cleanup only: the orphaned row stays private (RLS) and is
      // removed on cascade when the account is deleted.
    }
  }
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
