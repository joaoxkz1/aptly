import "server-only";
import type { Assessment, Attempt, Feedback, PracticeQuestion, Subject } from "@/lib/types";
import type { DiagramEvidence } from "@/lib/diagram/evidence";
import { structuredResultHash } from "@/lib/ai/request-integrity";
import { rowToAttempt, type AttemptRow } from "@/lib/supabase/attempts";
import {
  rowToPracticeQuestion,
  type PracticeQuestionRow,
} from "@/lib/supabase/practice-questions";
import { getAdminClient } from "@/lib/supabase/admin";

const ATTEMPT_COLUMNS =
  "id, subject, topic, question, answer, score, max_score, feedback, mistake_type, next_step, created_at, assessment, parent_attempt_id, practice_question_id, source_material, diagram_evidence";
const PRACTICE_COLUMNS =
  "id, created_at, question, source_material, framework, mark_total, topic_code, topic_label, skill, why";

export interface SavedAttemptInput {
  subject: Subject;
  topic: string;
  question: string;
  answer: string;
  feedback: Feedback;
  assessment: Assessment;
  parentAttemptId: string | null;
  practiceQuestionId: string | null;
  sourceMaterial: string | null;
}

function attemptInsertRow(
  userId: string,
  idempotencyKey: string,
  input: SavedAttemptInput
) {
  const f = input.feedback;
  const a = input.assessment;
  return {
    user_id: userId,
    idempotency_key: idempotencyKey,
    subject: input.subject,
    topic: input.topic,
    question: input.question,
    answer: input.answer,
    score: f.score,
    max_score: 7,
    feedback: f,
    mistake_type: f.mistakes[0] ?? null,
    next_step: f.studyNext,
    assessment: a,
    assessment_version: a.version,
    assessment_format: a.assessmentFormat,
    paper: a.paper,
    syllabus_topic: a.syllabusTopic,
    marks_earned: a.marksEarned,
    marks_available: a.marksAvailable,
    marks_assessable: a.marksAssessable,
    marks_source: a.marksSource,
    mark_display_mode: a.markDisplayMode,
    classification_confidence: a.classificationConfidence,
    scoring_state: a.scoringState ?? null,
    mark_total_source: a.markTotalSource ?? null,
    recognized_template: a.recognizedTemplate ?? null,
    eligible_for_core: a.eligibleForCoreAnalytics ?? null,
    parent_attempt_id: input.parentAttemptId,
    practice_question_id: input.practiceQuestionId,
    source_material: input.sourceMaterial,
    // Diagram review is attached only through the separately verified route.
    diagram_evidence: null,
  };
}

export async function findAttemptByIdempotency(
  userId: string,
  idempotencyKey: string
): Promise<Attempt | null> {
  const { data, error } = await getAdminClient()
    .from("attempts")
    .select(ATTEMPT_COLUMNS)
    .eq("user_id", userId)
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();
  if (error) throw error;
  return data == null ? null : rowToAttempt(data as unknown as AttemptRow);
}

export async function findAttemptById(
  userId: string,
  attemptId: string
): Promise<Attempt | null> {
  const { data, error } = await getAdminClient()
    .from("attempts")
    .select(ATTEMPT_COLUMNS)
    .eq("user_id", userId)
    .eq("id", attemptId)
    .maybeSingle();
  if (error) throw error;
  return data == null ? null : rowToAttempt(data as unknown as AttemptRow);
}

async function verifyRelationships(
  userId: string,
  parentAttemptId: string | null,
  practiceQuestionId: string | null
): Promise<void> {
  const admin = getAdminClient();
  if (parentAttemptId !== null) {
    const { data, error } = await admin
      .from("attempts")
      .select("id")
      .eq("id", parentAttemptId)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw error;
    if (data == null) throw new Error("invalid parent relationship");
  }
  if (practiceQuestionId !== null) {
    const { data, error } = await admin
      .from("practice_questions")
      .select("id")
      .eq("id", practiceQuestionId)
      .eq("user_id", userId)
      .eq("authority_version", 1)
      .maybeSingle();
    if (error) throw error;
    if (data == null) throw new Error("invalid practice relationship");
  }
}

export async function saveGradeAttempt(
  userId: string,
  idempotencyKey: string,
  input: SavedAttemptInput
): Promise<Attempt> {
  await verifyRelationships(
    userId,
    input.parentAttemptId,
    input.practiceQuestionId
  );
  const admin = getAdminClient();
  const { data, error } = await admin
    .from("attempts")
    .insert(attemptInsertRow(userId, idempotencyKey, input))
    .select(ATTEMPT_COLUMNS)
    .single();
  if (error) {
    // If persistence succeeded but the response was lost/raced, replay the
    // unique durable row rather than creating or charging again.
    const existing = await findAttemptByIdempotency(userId, idempotencyKey);
    if (existing !== null) return existing;
    throw error;
  }
  return rowToAttempt(data as unknown as AttemptRow);
}

export interface SavedPracticeInput {
  question: string;
  sourceMaterial: string | null;
  framework: string;
  markTotal: number;
  topicCode: string;
  topicLabel: string;
  skill: string;
  why: string;
}

export async function findPracticeByIdempotency(
  userId: string,
  idempotencyKey: string
): Promise<PracticeQuestion | null> {
  const { data, error } = await getAdminClient()
    .from("practice_questions")
    .select(PRACTICE_COLUMNS)
    .eq("user_id", userId)
    .eq("idempotency_key", idempotencyKey)
    .eq("authority_version", 1)
    .maybeSingle();
  if (error) throw error;
  return data == null
    ? null
    : rowToPracticeQuestion(data as unknown as PracticeQuestionRow);
}

export async function savePracticeQuestion(
  userId: string,
  idempotencyKey: string,
  input: SavedPracticeInput
): Promise<PracticeQuestion> {
  const { data, error } = await getAdminClient()
    .from("practice_questions")
    .insert({
      user_id: userId,
      idempotency_key: idempotencyKey,
      authority_version: 1,
      question: input.question,
      source_material: input.sourceMaterial,
      framework: input.framework,
      mark_total: input.markTotal,
      topic_code: input.topicCode,
      topic_label: input.topicLabel,
      skill: input.skill,
      why: input.why,
    })
    .select(PRACTICE_COLUMNS)
    .single();
  if (error) {
    const existing = await findPracticeByIdempotency(userId, idempotencyKey);
    if (existing !== null) return existing;
    throw error;
  }
  return rowToPracticeQuestion(data as unknown as PracticeQuestionRow);
}

export async function attachDiagramEvidence(input: {
  userId: string;
  attemptId: string;
  operationGroupKey: string;
  evidence: DiagramEvidence;
}): Promise<"attached" | "already_attached"> {
  const admin = getAdminClient();
  const { data: current, error: readError } = await admin
    .from("attempts")
    .select("id, idempotency_key, diagram_evidence")
    .eq("id", input.attemptId)
    .eq("user_id", input.userId)
    .maybeSingle();
  if (readError) throw readError;
  if (current == null) throw new Error("attempt not found");
  const row = current as {
    idempotency_key: string | null;
    diagram_evidence: DiagramEvidence | null;
  };
  if (row.idempotency_key !== input.operationGroupKey) {
    throw new Error("diagram operation mismatch");
  }
  if (row.diagram_evidence !== null) {
    if (structuredResultHash(row.diagram_evidence) === structuredResultHash(input.evidence)) {
      return "already_attached";
    }
    throw new Error("diagram evidence already attached");
  }

  const { data, error } = await admin
    .from("attempts")
    .update({ diagram_evidence: input.evidence })
    .eq("id", input.attemptId)
    .eq("user_id", input.userId)
    .eq("idempotency_key", input.operationGroupKey)
    .is("diagram_evidence", null)
    .select("id")
    .single();
  if (error || data == null) throw error ?? new Error("diagram attach failed");
  return "attached";
}
