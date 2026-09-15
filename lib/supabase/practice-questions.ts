import type { SupabaseClient } from "@supabase/supabase-js";
import type { AssessmentFramework, AssessmentSkill, PracticeQuestion } from "@/lib/types";
import { resolveEconomicsTaxonomyVersion } from "@/lib/assessment/taxonomy";

const TABLE = "practice_questions";

// user_id is never selected or written by the app — it is stamped server-side
// via `default auth.uid()` and enforced by RLS on every read.
const SELECT_COLUMNS =
  "id, created_at, question, source_material, framework, mark_total, topic_code, topic_label, taxonomy_version, skill, why, from_current_focus, focus_context, assessment_contract";

export interface PracticeQuestionRow {
  id: string;
  created_at: string;
  question: string;
  source_material: string | null;
  framework: string;
  mark_total: number;
  topic_code: string;
  topic_label: string;
  taxonomy_version?: string | null;
  skill: string;
  why: string;
  from_current_focus?: boolean;
  focus_context?: PracticeQuestion["focus"];
  assessment_contract?: PracticeQuestion["assessmentContract"];
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
    taxonomyVersion: resolveEconomicsTaxonomyVersion(row.taxonomy_version),
    skill: row.skill as AssessmentSkill,
    why: row.why,
    fromCurrentFocus: row.from_current_focus === true,
    focus: row.focus_context ?? null,
    assessmentContract: row.assessment_contract ?? null,
  };
}

/**
 * Real-state onboarding signal: which answered Practice rows were generated
 * from a server-verified Current Focus. Only ids/boolean flags cross the
 * browser boundary; hidden provenance and grading guidance remain unreadable.
 */
export async function fetchCurrentFocusPracticeIds(
  supabase: SupabaseClient,
  ids: string[]
): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const { data, error } = await supabase
    .from(TABLE)
    .select("id, from_current_focus")
    .in("id", ids)
    .eq("from_current_focus", true);
  if (error) throw error;
  return new Set(
    (data as unknown as { id: string; from_current_focus: boolean }[]).map((row) => row.id)
  );
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
