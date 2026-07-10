import type { SupabaseClient } from "@supabase/supabase-js";
import type { AssessmentFramework, AssessmentSkill, PracticeQuestion } from "@/lib/types";

const TABLE = "practice_questions";

// user_id is never selected or written by the app — it is stamped server-side
// via `default auth.uid()` and enforced by RLS on every read.
const SELECT_COLUMNS =
  "id, created_at, question, source_material, framework, mark_total, topic_code, topic_label, skill, why";

export interface PracticeQuestionRow {
  id: string;
  created_at: string;
  question: string;
  source_material: string | null;
  framework: string;
  mark_total: number;
  topic_code: string;
  topic_label: string;
  skill: string;
  why: string;
}

export function rowToPracticeQuestion(row: PracticeQuestionRow): PracticeQuestion {
  return {
    id: row.id,
    createdAt: row.created_at,
    question: row.question,
    sourceMaterial: row.source_material,
    framework: row.framework as AssessmentFramework,
    markTotal: row.mark_total,
    topicCode: row.topic_code,
    topicLabel: row.topic_label,
    skill: row.skill as AssessmentSkill,
    why: row.why,
  };
}

/**
 * Fetch ONE practice question by id. RLS scopes the read to the signed-in
 * user's own rows, so another user's id resolves to null — never their data.
 */
export async function fetchPracticeQuestion(
  supabase: SupabaseClient,
  id: string
): Promise<PracticeQuestion | null> {
  const { data, error } = await supabase
    .from(TABLE)
    .select(SELECT_COLUMNS)
    .eq("id", id)
    .eq("authority_version", 1)
    .maybeSingle();
  if (error) throw error;
  return data == null ? null : rowToPracticeQuestion(data as unknown as PracticeQuestionRow);
}

/**
 * The user's NEWEST practice question, or null. RLS-scoped. Feeds the
 * idempotent-generation reuse check (lib/assessment/practice-reuse.ts): a
 * refresh reopens this question instead of paying for another generation.
 */
export async function fetchLatestPracticeQuestion(
  supabase: SupabaseClient
): Promise<PracticeQuestion | null> {
  const { data, error } = await supabase
    .from(TABLE)
    .select(SELECT_COLUMNS)
    .eq("authority_version", 1)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data == null ? null : rowToPracticeQuestion(data as unknown as PracticeQuestionRow);
}
