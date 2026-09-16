import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { validateCombinedGrade } from "./combined-assessment";
import { applyManualTaskInterpretation } from "./manual-task-resolution";
import { policyForGeneratedPractice } from "@/lib/assessment/policy";
import { policyWithContract } from "@/lib/assessment/trusted-contract";
import { answerPracticeFocus } from "@/lib/assessment/focused-practice";
import type { AssessmentSnapshot } from "@/lib/assessment/assessment-snapshot";
import type { Attempt } from "@/lib/types";
import type { AssessedVisualEvidence } from "./assessed-visual-schema";

const root = join(process.cwd(), "docs/examiner-live-validation");
const read = (path: string) => JSON.parse(readFileSync(path, "utf8"));
const budget = read(join(root, "budget.json")) as { maximumStarted: number; attempts: { folder: string; caseId: string; status: string }[] };
const matrix = read(join(root, "calibration-matrix.json")) as { cases: { id: string; sourceIds: string[]; reviewOnly: { officialMark: null; check: string } }[] };
function provider(path: string) {
  const r = read(path).response;
  return JSON.parse(r.output_text ?? r.output.filter((item: { type: string }) => item.type === "message")
    .flatMap((item: { content: { type: string; text: string }[] }) => item.content).filter((item: { type: string }) => item.type === "output_text")
    .map((item: { text: string }) => item.text).join(""));
}

describe("recorded real examiner pipeline; no new provider calls", () => {
  it("preserves the absolute attempt budget and source-backed qualitative fixture matrix", () => {
    expect(budget.maximumStarted).toBe(10); expect(budget.attempts.length).toBeLessThanOrEqual(10);
    expect(matrix.cases.length).toBeGreaterThanOrEqual(25);
    expect(new Set(matrix.cases.map(c => c.id)).size).toBe(matrix.cases.length);
    for (const c of matrix.cases) { expect(c.sourceIds.length).toBeGreaterThan(0); expect(c.reviewOnly.officialMark).toBeNull(); expect(c.reviewOnly.check).toBeTruthy(); }
    for (const id of ["weak-prose-strong-diagram", "partly-off-task", "alternative-mechanism", "inflation-no-diagram", "analysis-weak-application", "one-sided-evaluation", "irrelevant-recommendation", "four-ecf", "four-labels", "four-equivalent-notation"]) expect(matrix.cases.some(c => c.id === id)).toBe(true);
  });
  it.each(budget.attempts.filter(row => row.status === "complete"))("replays $folder under the final validation and feedback code", row => {
    const folder = join(root, "attempts", row.folder);
    const record = read(join(folder, "result.json"));
    const snapshot = record.persistence.snapshot as AssessmentSnapshot;
    const raw = provider(join(folder, "grader-response.json"));
    const task = record.persistence.row;
    const policy = policyWithContract(policyForGeneratedPractice({ framework: snapshot.contract.framework, markTotal: snapshot.contract.total, sourceMaterial: task.source_material }), snapshot.contract);
    const result = validateCombinedGrade(raw, { policy, contract: snapshot.contract, visual: snapshot.observations as AssessedVisualEvidence | null, question: task.question,
      attachmentHashes: snapshot.attachments.map(a => a.contentHash), snapshotId: snapshot.id, hasExplanation: !!task.answer.trim(), requireExaminerJudgment: true });
    expect(result.assessment.marksEarned).toBe(record.response.attempt.assessment.marksEarned); // preserve actual observed mark; no desired score
    expect(result.assessment.gradingProvenance?.gradingContractVersion).toBe("ib-econ-2026-v5");
    const requestText = JSON.stringify(read(join(folder, "grader-request.json")));
    expect(requestText).not.toMatch(/reviewOnly|engineeringPredictedOverall|officialMark|forecastKind/);
    if (snapshot.resolutionInputContract) {
      const interpreted = applyManualTaskInterpretation(snapshot.resolutionInputContract, provider(join(folder, "task-resolution-response.json")), task.question);
      expect(interpreted).toEqual(snapshot.contract);
      const input = JSON.parse(read(join(folder, "task-resolution-request.json")).input[1].content);
      expect(input).not.toHaveProperty("answer"); expect(input).not.toHaveProperty("topic");
    }
    const attempt = { ...record.response.attempt, assessment: result.assessment, feedback: result.feedback } as Attempt;
    if (row.caseId === "pollution-omitted") {
      expect(result.feedback.mistakes).toContain("Missing required diagram");
      expect(result.feedback.studyNext).toMatch(/diagram/i);
      expect(answerPracticeFocus(attempt)?.targetSkill).toBe("diagram_explanation");
    }
    if (row.caseId === "ambiguous-task") {
      expect(result.assessment.scoringState).toBe("provisional"); expect(result.assessment.eligibleForCoreAnalytics).toBe(false);
    }
    if (["ped-determinants", "evaluation-integrated", "paper2g-source"].includes(row.caseId)) {
      expect(result.feedback.mistakes).not.toContain("Missing required diagram");
      expect(result.examinerJudgment?.diagramEffect).toBe("not_required");
    }
    if (result.assessment.marksEarned === result.assessment.marksAvailable) {
      expect(result.feedback.improvements.every(s => s.startsWith("Optional extension (not needed for credit):"))).toBe(true);
      expect(result.feedback.studyNext).toMatch(/^Optional extension \(not needed for credit\):/);
      expect(result.examinerJudgment?.materialLimitations).toEqual([]);
    }
    if (existsSync(join(folder, "observer-response.json"))) expect(snapshot.observations?.essentialEvidenceReadable).toBe(true);
  });
});
