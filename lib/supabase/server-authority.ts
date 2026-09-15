import "server-only";
import type { AssessmentSnapshot } from "@/lib/assessment/assessment-snapshot";
import { diagramAssessmentEnabled, resolveAssessmentContract, publicContract } from "@/lib/assessment/trusted-contract";
import { policyForGeneratedPractice } from "@/lib/assessment/policy";
import type { Assessment, Attempt, Feedback, PracticeQuestion, Subject } from "@/lib/types";
import type { DiagramEvidence } from "@/lib/diagram/evidence";
import { structuredResultHash } from "@/lib/ai/request-integrity";
import { rowToAttempt, type AttemptRow } from "@/lib/supabase/attempts";
import {
  rowToPracticeQuestion,
  type PracticeQuestionRow,
} from "@/lib/supabase/practice-questions";
import { getAdminClient } from "@/lib/supabase/admin";
import { ECONOMICS_TAXONOMY_VERSION } from "@/lib/assessment/taxonomy";
import type {
  EconomicsGradingBlueprint,
  QuestionOrigin,
} from "@/lib/assessment/question-bank/economics-v1";
import type { CommandTerm, LevelRelevance } from "@/lib/types";

const ATTEMPT_COLUMNS =
  "id, subject, topic, question, answer, score, max_score, feedback, mistake_type, next_step, created_at, assessment, parent_attempt_id, practice_question_id, source_material, diagram_evidence";
const PRACTICE_COLUMNS =
  "id, created_at, question, source_material, framework, mark_total, topic_code, topic_label, taxonomy_version, skill, why, from_current_focus, focus_context, assessment_contract";
const TRUSTED_PRACTICE_COLUMNS = `${PRACTICE_COLUMNS}, question_origin, bank_question_id, question_bank_version, grading_blueprint, grading_blueprint_version, level_relevance, command_term, target_skills, angle_tags, request_fingerprint, generation_provenance`;

export interface SavedAttemptInput {
  snapshot?: AssessmentSnapshot;
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
    rubric_version: a.gradingProvenance?.rubricVersion ?? null,
    taxonomy_version: a.gradingProvenance?.taxonomyVersion ?? null,
    grading_model_id: a.gradingProvenance?.modelId ?? null,
    grading_reasoning_effort: a.gradingProvenance?.reasoningEffort ?? null,
    grading_contract_version: a.gradingProvenance?.gradingContractVersion ?? null,
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
  if (input.snapshot) {
    const { data, error } = await admin.rpc("save_combined_assessment", {
      p_user_id: userId, p_operation_key: idempotencyKey,
      p_attempt: attemptInsertRow(userId, idempotencyKey, input), p_snapshot: input.snapshot,
    });
    if (error || data == null) {
      const existing = await findAttemptByIdempotency(userId, idempotencyKey);
      if (existing) return existing;
      throw error ?? new Error("combined assessment persistence failed");
    }
    return rowToAttempt((Array.isArray(data) ? data[0] : data) as AttemptRow);
  }
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
  focus?: PracticeQuestion["focus"];
  generationProvenance?: { modelId: string; reasoningEffort: string; schemaHash: string };
  question: string;
  sourceMaterial: string | null;
  framework: string;
  markTotal: number;
  topicCode: string;
  topicLabel: string;
  skill: string;
  why: string;
  questionOrigin: QuestionOrigin;
  bankQuestionId: string | null;
  questionBankVersion: string | null;
  gradingBlueprint: EconomicsGradingBlueprint;
  gradingBlueprintVersion: string;
  levelRelevance: Exclude<LevelRelevance, "unknown">;
  commandTerm: CommandTerm;
  targetSkills: string[];
  angleTags: string[];
  fromCurrentFocus: boolean;
  requestFingerprint: string;
}

export class PracticeIdempotencyConflictError extends Error {
  constructor() {
    super("practice idempotency conflict");
  }
}

export async function findPracticeByIdempotency(
  userId: string,
  idempotencyKey: string,
  expectedFingerprint?: string
): Promise<PracticeQuestion | null> {
  const { data, error } = await getAdminClient()
    .from("practice_questions")
    .select(TRUSTED_PRACTICE_COLUMNS)
    .eq("user_id", userId)
    .eq("idempotency_key", idempotencyKey)
    .eq("authority_version", 1)
    .maybeSingle();
  if (error) throw error;
  if (data == null) return null;
  const row = data as unknown as PracticeQuestionRow & { request_fingerprint: string | null };
  if (expectedFingerprint !== undefined && row.request_fingerprint !== expectedFingerprint) {
    throw new PracticeIdempotencyConflictError();
  }
  return rowToPracticeQuestion(row);
}

export async function savePracticeQuestion(
  userId: string,
  idempotencyKey: string,
  input: SavedPracticeInput
): Promise<PracticeQuestion> {
  const contract = diagramAssessmentEnabled() ? resolveAssessmentContract({
    policy: policyForGeneratedPractice({ framework: input.framework, markTotal: input.markTotal, sourceMaterial: input.sourceMaterial }),
    question: input.question, sourceMaterial: input.sourceMaterial, topic: input.topicCode,
    level: input.levelRelevance, blueprint: input.gradingBlueprint, blueprintVersion: input.gradingBlueprintVersion,
    bankQuestionId: input.bankQuestionId,
  }) : null;
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
      taxonomy_version: ECONOMICS_TAXONOMY_VERSION,
      skill: input.skill,
      why: input.why,
      question_origin: input.questionOrigin,
      bank_question_id: input.bankQuestionId,
      question_bank_version: input.questionBankVersion,
      grading_blueprint: input.gradingBlueprint,
      grading_blueprint_version: input.gradingBlueprintVersion,
      level_relevance: input.levelRelevance,
      command_term: input.commandTerm,
      target_skills: input.targetSkills,
      angle_tags: input.angleTags,
      from_current_focus: input.fromCurrentFocus,
      focus_context: input.focus ?? null,
      generation_provenance: input.generationProvenance ?? null,
      request_fingerprint: input.requestFingerprint,
      assessment_contract: contract ? publicContract(contract) : null,
    })
    .select(PRACTICE_COLUMNS)
    .single();
  if (error) {
    const existing = await findPracticeByIdempotency(
      userId,
      idempotencyKey,
      input.requestFingerprint
    );
    if (existing !== null) return existing;
    throw error;
  }
  return rowToPracticeQuestion(data as unknown as PracticeQuestionRow);
}

/** Private compatibility metadata stays on the server, never in the public DTO. */
export async function fetchLatestTrustedPracticeQuestion(userId: string) {
  const { data, error } = await getAdminClient().from("practice_questions")
    .select(`${PRACTICE_COLUMNS}, target_skills, level_relevance, bank_question_id, grading_blueprint_version`)
    .eq("user_id", userId).eq("authority_version", 1)
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const row = data as unknown as PracticeQuestionRow & { target_skills: string[] | null; level_relevance: LevelRelevance | null; bank_question_id: string | null; grading_blueprint_version: string | null };
  return { question: rowToPracticeQuestion(row), targetSkills: row.target_skills ?? [], levelRelevance: row.level_relevance,
    bankQuestionId: row.bank_question_id, gradingBlueprintVersion: row.grading_blueprint_version };
}

export interface PracticeBankHistoryRow {
  bankQuestionId: string | null;
  createdAt: string;
}

export async function fetchPracticeBankHistory(
  userId: string
): Promise<PracticeBankHistoryRow[]> {
  const { data, error } = await getAdminClient()
    .from("practice_questions")
    .select("bank_question_id, created_at")
    .eq("user_id", userId)
    .eq("authority_version", 1)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data as unknown as { bank_question_id: string | null; created_at: string }[]).map(
    (row) => ({ bankQuestionId: row.bank_question_id, createdAt: row.created_at })
  );
}

export interface TrustedPracticeGuidance {
  bankQuestionId?: string | null;
  gradingBlueprintVersion?: string | null;
  gradingBlueprint: EconomicsGradingBlueprint | null;
  topicCode: string;
  topicLabel: string;
  levelRelevance: Exclude<LevelRelevance, "unknown"> | null;
  commandTerm: CommandTerm | null;
  targetSkills: string[];
}

export async function fetchTrustedPracticeGuidance(
  userId: string,
  practiceQuestionId: string
): Promise<TrustedPracticeGuidance | null> {
  const { data, error } = await getAdminClient()
    .from("practice_questions")
    .select(
      "grading_blueprint, grading_blueprint_version, bank_question_id, topic_code, topic_label, level_relevance, command_term, target_skills"
    )
    .eq("id", practiceQuestionId)
    .eq("user_id", userId)
    .eq("authority_version", 1)
    .maybeSingle();
  if (error) throw error;
  if (data == null) return null;
  const row = data as unknown as {
    grading_blueprint_version?: string | null;
    bank_question_id?: string | null;
    grading_blueprint: EconomicsGradingBlueprint | null;
    topic_code: string;
    topic_label: string;
    level_relevance: Exclude<LevelRelevance, "unknown"> | null;
    command_term: CommandTerm | null;
    target_skills: string[] | null;
  };
  return {
    bankQuestionId: row.bank_question_id ?? null,
    gradingBlueprintVersion: row.grading_blueprint_version ?? null,
    gradingBlueprint: row.grading_blueprint,
    topicCode: row.topic_code,
    topicLabel: row.topic_label,
    levelRelevance: row.level_relevance,
    commandTerm: row.command_term,
    targetSkills: row.target_skills ?? [],
  };
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
