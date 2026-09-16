import "server-only";
import { parseGradeRequest, type AssessedUpload } from "@/lib/diagram/assessed-upload";
import { diagramAssessmentEnabled, resolveAssessmentContract, policyWithContract } from "@/lib/assessment/trusted-contract";
import { COMBINED_GRADE_SCHEMA, combinedAssessmentInstructions, validateCombinedGrade } from "@/lib/ai/combined-assessment";
import { reviewAssessedImage, assessedImageFingerprint, ASSESSED_VISUAL_VERSION, ASSESSED_VISUAL_EFFORT } from "@/lib/ai/assessed-visual-review";
import { essentialVisualUnavailable, type AssessedVisualEvidence } from "@/lib/ai/assessed-visual-schema";
import type { AssessmentSnapshot } from "@/lib/assessment/assessment-snapshot";
import { DIAGRAM_MODEL } from "@/lib/ai/config";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { userIdFromClient, isUuid } from "@/lib/auth/verified-user";
import { getOpenAI } from "@/lib/ai/openai";
import { getRubric } from "@/lib/ai/rubric.economics";
import {
  GRADE_RESULT_JSON_SCHEMA,
  buildAssessmentInstructions,
  buildAssessmentUserInput,
  validateGradeResult,
} from "@/lib/ai/assessment-schema";
import {
  enforceRevisionSourceGate,
  policyForGeneratedPractice,
  resolveScoringPolicy,
  type RequestedSource,
  type ScoringPolicy,
} from "@/lib/assessment/policy";
import {
  DAILY_LIMIT_ERROR_CODE,
  GRADE_ERROR_CODE,
  buildGradeFailureLog,
  supportReference,
  type GradeStage,
} from "@/lib/ai/grade-errors";
import {
  ASSESSMENT_FRAMEWORKS,
  ASSESSMENT_SKILLS,
  COMMAND_TERMS,
  SYLLABUS_TOPICS,
} from "@/lib/assessment/taxonomy";
import type {
  AssessmentFramework,
  AssessmentSkill,
  CommandTerm,
  SyllabusTopic,
} from "@/lib/types";
import {
  DAILY_GRADE_LIMIT,
  DAILY_DIAGRAM_REVIEW_LIMIT,
  MAX_ANSWER_CHARS,
  MAX_OUTPUT_TOKENS,
  MAX_QUESTION_CHARS,
  MAX_TOPIC_CHARS,
  REQUEST_TIMEOUT_MS,
  WRITTEN_GRADING_MODEL,
  WRITTEN_GRADING_REASONING_EFFORT,
  isGradableSubject,
} from "@/lib/ai/config";
import { requestFingerprint } from "@/lib/ai/request-integrity";
import {
  markReservationFailed,
  markReservationProcessing,
  markReservationSucceeded,
  reserveAIUsage,
  reserveCombinedGradeUsage,
} from "@/lib/ai/usage-reservations";
import {
  findAttemptById,
  findAttemptByIdempotency,
  fetchTrustedPracticeGuidance,
  saveGradeAttempt,
  type TrustedPracticeGuidance,
} from "@/lib/supabase/server-authority";
import { completedEssayReplay } from "@/lib/supabase/completed-essay-replay";

export const runtime = "nodejs";
// Allow the 120-second combined provider deadline plus auth and persistence.
export const maxDuration = 150;

const REQUESTED_SOURCES: readonly RequestedSource[] = [
  "explicit",
  "user_confirmed",
  "template_inferred",
  "unknown",
  "feedback_only",
];
const ALLOWED_FIELDS = new Set([
  "subject",
  "topic",
  "question",
  "answer",
  "requestedSource",
  "requestedTotal",
  "templateId",
  "requestedFramework",
  "sourceMaterial",
  "practiceQuestionId",
  "parentAttemptId",
  "idempotencyKey",
  "diagramOmitted",
]);

function parseRequestedSource(value: unknown): RequestedSource | null {
  return typeof value === "string" && (REQUESTED_SOURCES as readonly string[]).includes(value)
    ? (value as RequestedSource)
    : null;
}

function parseFramework(value: unknown): AssessmentFramework | null {
  return typeof value === "string" && (ASSESSMENT_FRAMEWORKS as readonly string[]).includes(value)
    ? (value as AssessmentFramework)
    : null;
}

function fail(status: number, code: string) {
  return NextResponse.json({ error: code }, { status });
}

function optionalUuid(value: unknown): string | null | undefined {
  if (value == null || value === "") return null;
  return isUuid(value) ? value : undefined;
}

function unitForCurrentTopic(topic: SyllabusTopic) {
  if (topic.startsWith("1.")) return "unit_1" as const;
  if (topic.startsWith("2.")) return "unit_2" as const;
  if (topic.startsWith("3.")) return "unit_3" as const;
  if (topic.startsWith("4.")) return "unit_4" as const;
  return "unknown" as const;
}

function commandTermLabel(command: CommandTerm): string {
  if (command === "to_what_extent") return "To what extent";
  return command.charAt(0).toUpperCase() + command.slice(1);
}

export async function POST(request: Request) {
  // Authentication always uses the normal cookie-scoped client. Privileged
  // persistence is not reachable until a verified subject has been derived.
  const supabase = await createClient();
  const userId = await userIdFromClient(supabase);
  if (userId === null) return fail(401, "unauthorized");

  let body: unknown;
  let image: AssessedUpload | null = null;
  try {
    const parsed = await parseGradeRequest(request);
    body = parsed.body;
    image = parsed.image;
  } catch (error) {
    return fail(400, error instanceof Error && error.message.startsWith("diagram_") ? error.message : "invalid_request");
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return fail(400, "invalid_request");
  }
  const raw = body as Record<string, unknown>;
  if (Object.keys(raw).some((key) => !ALLOWED_FIELDS.has(key))) {
    return fail(400, "invalid_request");
  }
  const { subject, topic, question, answer, idempotencyKey } = raw;
  if (
    typeof subject !== "string" ||
    typeof topic !== "string" ||
    typeof question !== "string" ||
    typeof answer !== "string" ||
    !isUuid(idempotencyKey)
  ) {
    return fail(400, "invalid_request");
  }
  if (
    (raw.sourceMaterial != null && typeof raw.sourceMaterial !== "string") ||
    (raw.requestedSource != null && parseRequestedSource(raw.requestedSource) === null) ||
    (raw.requestedTotal != null && typeof raw.requestedTotal !== "number") ||
    (raw.templateId != null && typeof raw.templateId !== "string") ||
    (raw.requestedFramework != null && parseFramework(raw.requestedFramework) === null)
    || (raw.diagramOmitted != null && typeof raw.diagramOmitted !== "boolean")
  ) {
    return fail(400, "invalid_request");
  }
  const parentAttemptId = optionalUuid(raw.parentAttemptId);
  const practiceQuestionId = optionalUuid(raw.practiceQuestionId);
  if (parentAttemptId === undefined || practiceQuestionId === undefined) {
    return fail(400, "invalid_request");
  }

  const q = question.trim();
  const a = answer.trim();
  const t = topic.trim();
  if (q === "" || (a === "" && image == null) || t === "") return fail(400, "invalid_request");
  if (image && raw.diagramOmitted === true) return fail(400, "invalid_request");
  if (image && !diagramAssessmentEnabled()) return fail(503, "diagram_assessment_disabled");
  let sourceMaterial =
    typeof raw.sourceMaterial === "string" ? raw.sourceMaterial.trim() : null;
  if (sourceMaterial !== null && sourceMaterial === a) sourceMaterial = null;
  if (
    q.length > MAX_QUESTION_CHARS ||
    a.length > MAX_ANSWER_CHARS ||
    t.length > MAX_TOPIC_CHARS ||
    (sourceMaterial !== null && sourceMaterial.length > MAX_QUESTION_CHARS)
  ) {
    return fail(400, "too_long");
  }
  if (!isGradableSubject(subject)) return fail(422, "subject_unsupported");
  const rubric = getRubric(subject);
  if (rubric === null) return fail(422, "subject_unsupported");

  const requestId = crypto.randomUUID();
  let stage: GradeStage = "assessment_policy";
  let reservationId: string | null = null;
  let diagramReservationId: string | null = null;
  let providerDispatched = false;

  function failClosed(status: number, err: unknown) {
    console.error(JSON.stringify(buildGradeFailureLog(stage, requestId, err, status)));
    return NextResponse.json(
      { error: GRADE_ERROR_CODE, reference: supportReference(requestId) },
      { status }
    );
  }

  // Resolve every relationship and scoring gate through the user's RLS-scoped
  // session before reserving paid capacity or touching the admin client.
  let gradedQuestion = q;
  let gradedTopic = t;
  let trustedPracticeGuidance: TrustedPracticeGuidance | null = null;
  let policy: ScoringPolicy;
  if (practiceQuestionId !== null) {
    stage = "practice_context";
    try {
      const { data: pq, error } = await supabase
        .from("practice_questions")
        .select(
          "question, source_material, framework, mark_total, topic_code, topic_label, authority_version"
        )
        .eq("id", practiceQuestionId)
        .eq("authority_version", 1)
        .maybeSingle();
      if (error) throw error;
      if (pq == null) return fail(400, "invalid_request");
      const row = pq as {
        question: string;
        source_material: string | null;
        framework: string;
        mark_total: number;
        topic_code: string;
        topic_label: string;
      };
      gradedQuestion = row.question;
      gradedTopic = row.topic_label;
      sourceMaterial = row.source_material;
      policy = policyForGeneratedPractice({
        framework: row.framework,
        markTotal: row.mark_total,
        sourceMaterial: row.source_material,
      });
      trustedPracticeGuidance = await fetchTrustedPracticeGuidance(
        userId,
        practiceQuestionId
      );
      if (trustedPracticeGuidance === null) return fail(400, "invalid_request");
    } catch (err) {
      return failClosed(502, err);
    }
  } else {
    let parentFramework: string | null = null;
    if (parentAttemptId !== null) {
      stage = "revision_context";
      try {
        const { data: parent, error } = await supabase
          .from("attempts")
          .select("source_material, assessment")
          .eq("id", parentAttemptId)
          .maybeSingle();
        if (error) throw error;
        if (parent == null) return fail(400, "invalid_request");
        const row = parent as {
          source_material: string | null;
          assessment: { framework?: unknown } | null;
        };
        if (typeof row.source_material === "string" && row.source_material.trim() !== "") {
          sourceMaterial = row.source_material;
        }
        parentFramework =
          typeof row.assessment?.framework === "string" ? row.assessment.framework : null;
      } catch (err) {
        return failClosed(502, err);
      }
    }
    stage = "assessment_policy";
    policy = resolveScoringPolicy(q, {
      requestedSource: parseRequestedSource(raw.requestedSource),
      requestedTotal: typeof raw.requestedTotal === "number" ? raw.requestedTotal : null,
      templateId: typeof raw.templateId === "string" ? raw.templateId : null,
      requestedFramework: parseFramework(raw.requestedFramework),
      sourceMaterial,
    });
    policy = enforceRevisionSourceGate(policy, parentFramework, sourceMaterial);
  }

  let contract = null;
  if (diagramAssessmentEnabled()) {
    try {
      // Completed manual essays replay their original frozen contract/result,
      // even when new task resolution would now ask for omission confirmation.
      if (practiceQuestionId === null && (policy.total === 10 || policy.total === 15)) {
        const completed = await completedEssayReplay(userId, idempotencyKey, raw, image?.hash ?? null);
        if (completed.kind === "conflict") return fail(409, "idempotency_conflict");
        if (completed.kind === "replay") return NextResponse.json({ attempt: completed.attempt, replayed: true });
      }
      contract = resolveAssessmentContract({ policy, question: policy.selectedQuestionPart ?? gradedQuestion,
        topic: trustedPracticeGuidance?.topicCode ?? gradedTopic, sourceMaterial,
        blueprint: trustedPracticeGuidance?.gradingBlueprint, level: trustedPracticeGuidance?.levelRelevance ?? "unknown",
        bankQuestionId: trustedPracticeGuidance?.bankQuestionId, blueprintVersion: trustedPracticeGuidance?.gradingBlueprintVersion ?? undefined });
      if (contract?.mode === "not_assessed") {
        if (image) return fail(422, "diagram_not_assessed");
        contract = null; // definition-only behavior is unchanged
      }
      if (contract) {
        policy = policyWithContract(policy, contract);
        if (["required_explicitly", "necessary_for_task"].includes(contract.diagramRole) && !image && raw.diagramOmitted !== true) return fail(422, "diagram_confirmation_required");
      } else if (image) return fail(422, "diagram_contract_required");
    } catch (err) {
      if (err instanceof Error && ["contract_context_required", "diagram_family_unsupported"].includes(err.message)) return fail(422, err.message);
      return failClosed(502, err);
    }
  } else if (trustedPracticeGuidance?.gradingBlueprint?.kind === "four_mark" || trustedPracticeGuidance?.gradingBlueprintVersion?.startsWith("economics-essay-blueprint-v")) return fail(503, "diagram_assessment_disabled");

  const snapshot: AssessmentSnapshot | null = contract ? {
    version: 1, id: idempotencyKey, userId, operationIdentity: idempotencyKey,
    questionHash: requestFingerprint(gradedQuestion), contextHash: requestFingerprint(sourceMaterial), answerHash: requestFingerprint(a),
    contract, contractHash: requestFingerprint(contract), attachments: image ? [{ identity: `${idempotencyKey}:image:1`, contentHash: image.hash, role: "student_diagram", retained: false }] : [],
    reviewerVersion: image ? ASSESSED_VISUAL_VERSION : null, reviewerModel: image ? DIAGRAM_MODEL : null, reviewerEffort: image ? ASSESSED_VISUAL_EFFORT : null,
    graderModel: WRITTEN_GRADING_MODEL, graderEffort: WRITTEN_GRADING_REASONING_EFFORT, observations: null,
  } : null;

  // Reserve atomically immediately before dispatch. Invalid/contextless work
  // never consumes quota; every provider-dispatched request does.
  stage = "rate_limit";
  try {
    const fingerprint = requestFingerprint(snapshot ? { request: raw, snapshot } : raw);
    const reservation = image && contract
      ? await reserveCombinedGradeUsage({ userId, idempotencyKey, fingerprint,
        diagramFingerprint: assessedImageFingerprint({ image, contract, question: gradedQuestion, source: sourceMaterial }),
        gradeDailyLimit: DAILY_GRADE_LIMIT, diagramDailyLimit: DAILY_DIAGRAM_REVIEW_LIMIT })
      : await reserveAIUsage({ userId, capability: "grade", idempotencyKey, fingerprint, dailyLimit: DAILY_GRADE_LIMIT });
    reservationId = reservation.reservationId;
    if ("diagramReservationId" in reservation) diagramReservationId = reservation.diagramReservationId as string | null;
    if (reservation.outcome === "limited") return fail(429,
      "limitedCapability" in reservation && reservation.limitedCapability === "diagram" ? "diagram_daily_limit" : DAILY_LIMIT_ERROR_CODE);
    if (reservation.outcome === "conflict") return fail(409, "idempotency_conflict");
    if (reservation.outcome === "in_progress") return fail(409, "request_in_progress");
    if (reservation.outcome === "replay" || reservation.outcome === "failed") {
      const saved =
        (reservation.relatedAttemptId !== null
          ? await findAttemptById(userId, reservation.relatedAttemptId)
          : null) ?? (await findAttemptByIdempotency(userId, idempotencyKey));
      if (saved !== null && reservationId !== null) {
        await markReservationSucceeded(reservationId, userId, { attemptId: saved.id });
        return NextResponse.json({ attempt: saved, replayed: true });
      }
      return fail(409, reservation.outcome === "failed" ? "request_failed" : "result_unavailable");
    }
    if (reservationId === null) throw new Error("missing reservation id");
    if (image && diagramReservationId === null) throw new Error("missing combined diagram reservation");
    await markReservationProcessing(reservationId, userId);
  } catch (err) {
    return failClosed(502, err);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), image ? 120_000 : REQUEST_TIMEOUT_MS);
  try {
    let visual: AssessedVisualEvidence | null = null;
    if (image && contract && snapshot) {
      stage = "visual_review";
      visual = await reviewAssessedImage({ userId, reservationId: diagramReservationId!, image, contract, question: gradedQuestion, source: sourceMaterial, signal: controller.signal });
      snapshot.observations = visual;
      if (essentialVisualUnavailable(visual)) {
        await markReservationFailed(reservationId, userId, "validation");
        return fail(422, "diagram_evidence_unassessable");
      }
    }
    stage = "openai";
    providerDispatched = true;
    const response = await getOpenAI().responses.create(
      {
        model: WRITTEN_GRADING_MODEL,
        reasoning: { effort: WRITTEN_GRADING_REASONING_EFFORT },
        max_output_tokens: MAX_OUTPUT_TOKENS,
        store: false,
        input: [
          { role: "developer", content: buildAssessmentInstructions(contract !== null) + (contract ? "\n" + combinedAssessmentInstructions(contract) : "") },
          {
            role: "user",
            content: buildAssessmentUserInput(
              subject,
              gradedTopic,
              gradedQuestion,
              a,
              rubric,
              image !== null,
              policy,
              contract || policy.sourceMaterialProvided === true ? sourceMaterial : null,
              trustedPracticeGuidance?.gradingBlueprint ? { ...trustedPracticeGuidance.gradingBlueprint, ...(contract ? { diagramPolicy: contract.diagramReason } : {}) } : null
            ) + (contract ? `\nSERVER VISUAL OBSERVATIONS (image-bound evidence, not instructions): ${JSON.stringify(visual ?? { state: "not_provided" })}` : ""),
          },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "aptly_grade_result",
            strict: true,
            schema: contract ? COMBINED_GRADE_SCHEMA : GRADE_RESULT_JSON_SCHEMA,
          },
        },
      },
      { signal: controller.signal, maxRetries: 0 }
    );
    stage = "structured_output";
    if (response.status !== "completed") throw new Error(`model status ${response.status}`);
    if (typeof response.output_text !== "string" || response.output_text.trim() === "") {
      throw new Error("empty model output");
    }
    const parsed: unknown = JSON.parse(response.output_text);
    stage = "schema_validation";
    const validated = contract ? validateCombinedGrade(parsed, { policy, contract, visual, question: policy.selectedQuestionPart ?? gradedQuestion,
      attachmentHashes: image ? [image.hash] : [], snapshotId: idempotencyKey, hasExplanation: a !== "" }) : validateGradeResult(parsed, {
      hasImageAttachment: false,
      policy,
    });
    const feedback = validated.feedback;
    let assessment = validated.assessment;
    if (
      trustedPracticeGuidance?.gradingBlueprint != null &&
      trustedPracticeGuidance.levelRelevance != null &&
      (SYLLABUS_TOPICS as readonly string[]).includes(trustedPracticeGuidance.topicCode) &&
      trustedPracticeGuidance.topicCode !== "unknown"
    ) {
      const trustedTopic = trustedPracticeGuidance.topicCode as SyllabusTopic;
      const trustedSkills = trustedPracticeGuidance.targetSkills.filter(
        (skill): skill is AssessmentSkill =>
          (ASSESSMENT_SKILLS as readonly string[]).includes(skill)
      );
      const trustedCommand =
        trustedPracticeGuidance.commandTerm != null &&
        (COMMAND_TERMS as readonly string[]).includes(trustedPracticeGuidance.commandTerm)
          ? trustedPracticeGuidance.commandTerm
          : null;
      assessment = {
        ...assessment,
        syllabusTopic: trustedTopic,
        syllabusUnit: unitForCurrentTopic(trustedTopic),
        topicLabel: trustedPracticeGuidance.topicLabel,
        levelRelevance: trustedPracticeGuidance.levelRelevance,
        assessmentSkills:
          trustedSkills.length > 0 ? trustedSkills : assessment.assessmentSkills,
        commandTerm: trustedCommand ?? assessment.commandTerm,
        commandTermLabel:
          trustedCommand == null
            ? assessment.commandTermLabel
            : commandTermLabel(trustedCommand),
      };
    }

    stage = "persistence";
    const attempt = await saveGradeAttempt(userId, idempotencyKey, {
      subject,
      topic: assessment.topicLabel.trim() || gradedTopic,
      question: gradedQuestion,
      answer: a,
      feedback,
      assessment,
      parentAttemptId,
      practiceQuestionId,
      sourceMaterial:
        contract || (practiceQuestionId === null && assessment.sourceMaterialProvided === true)
          ? sourceMaterial
          : null,
      ...(snapshot ? { snapshot } : {}),
    });
    await markReservationSucceeded(reservationId, userId, { attemptId: attempt.id });
    return NextResponse.json({ attempt, replayed: false });
  } catch (err) {
    await markReservationFailed(
      reservationId,
      userId,
      providerDispatched
        ? stage === "persistence"
          ? "persistence"
          : stage === "schema_validation"
            ? "validation"
            : "provider"
        : "internal"
    );
    if (err instanceof Error && err.message === "diagram_daily_limit") return fail(429, "diagram_daily_limit");
    return failClosed(502, err);
  } finally {
    clearTimeout(timer);
  }
}
