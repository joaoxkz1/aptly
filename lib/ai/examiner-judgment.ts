import "server-only";
import { bestFitBand } from "@/lib/assessment/bands";
import type { TrustedAssessmentContract } from "@/lib/assessment/trusted-contract";
import type { DiagramEvidenceState } from "@/lib/assessment/diagram-contract";

export const EXAMINER_WORKFLOW_VERSION = "examiner-workflow-2026-v1";
const properties = {
  task: { type: "string" },
  demonstrated: { type: "string" },
  materialLimitations: { type: "array", items: { type: "string" } },
  selectedBand: { type: "string" },
  withinBand: { type: "string", enum: ["lower", "middle", "upper"] },
  diagramEffect: { type: "string", enum: ["integrated", "limited", "missing_material", "not_required", "unresolved"] },
  summary: { type: "string" },
};
export const EXAMINER_JUDGMENT_SCHEMA = { anyOf: [{ type: "null" }, {
  type: "object", additionalProperties: false, required: Object.keys(properties), properties,
}] };
export interface ExaminerJudgment {
  task: string; demonstrated: string; materialLimitations: string[];
  selectedBand: string; withinBand: "lower" | "middle" | "upper";
  diagramEffect: "integrated" | "limited" | "missing_material" | "not_required" | "unresolved";
  summary: string;
}

export const EXAMINER_WORKFLOW = `EXAMINER WORKFLOW ${EXAMINER_WORKFLOW_VERSION}
First establish this question's exact demand and coverage using the server framework and question-specific guidance. Do not substitute a familiar question sharing its topic. Respect requested comparisons, numbers of reasons and conditions.
Next identify what the submitted response actually demonstrates: relevant knowledge/terminology, developed causal relationships, appropriate diagrams, application and supported judgment only where the framework calls for them. Credit correct evidence and valid alternatives before considering omissions. Sophistication on a different issue cannot satisfy this task.
Distinguish absent evidence, an incomplete but correct mechanism, and an incorrect mechanism. Do not demand evaluation, policy advice, a conclusion, outside examples, calculations or freestanding definitions on a pure explanation task unless its actual guidance requires them. Paper 1(b) requires real-world application and critical thinking; phrases like 'it depends' earn no judgment credit without explaining what depends on what and why.
Compare the balance of achievement with the applicable markbands. Select the best-fit band, allowing compensation across characteristics. Then choose the within-band mark according to how securely and extensively that level is achieved. Highest bands are attainable without flawless work. Neither diagnostic arithmetic nor starting at full marks and subtracting is permitted. Only an authenticated question-specific instruction can impose a specified cap; do not transfer a cap from a similar question.
For best-fit frameworks return examinerJudgment as a concise assessment record: task, demonstrated evidence, material limitations, selectedBand (e.g. '7-8'), withinBand and a short justification of the judgment. This is a conclusion/evidence summary, not a private reasoning transcript. It must agree with assessableEarned and bandRationale. For analytic or generic frameworks return examinerJudgment=null.
Diagram effect: missing_material for a missing necessary/explicitly requested diagram; not_required for nonessential absence; unresolved for an unresolved role; integrated or limited for established relevant submitted evidence. A missing necessary diagram must meaningfully enter band AND within-band judgment, without a universal cap or fixed deduction. Full marks cannot coexist with a material unmet task demand. Paper 2(g) has no universal diagram top-band gate. Never claim absent evidence was integrated.
Finally produce diagnostics and feedback from that judgment, never the other way around. Prioritize the actual limitation preventing stronger achievement. An excellent answer may have no major weakness: allow empty improvements and mistakes. If enrichment is useful, label it 'Optional extension (not needed for credit):' including studyNext. Do not fabricate a policy recommendation. Required diagram omission must agree across the judgment, comment, improvements, diagnostics and next action.`;

/** Consistency rejection, never an alternative marking algorithm or score cap. */
export function validateExaminerJudgment(raw: unknown, contract: TrustedAssessmentContract, earned: number, state: DiagramEvidenceState): ExaminerJudgment | null {
  const band = bestFitBand(contract.framework, earned);
  if (!band) {
    if (raw !== null) throw new Error("examiner band outside best-fit framework");
    return null;
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("missing examiner judgment");
  const j = raw as ExaminerJudgment;
  if (Object.keys(j).sort().join() !== Object.keys(properties).sort().join() ||
    !["task", "demonstrated", "summary"].every(key => typeof j[key as keyof ExaminerJudgment] === "string" &&
      (j[key as keyof ExaminerJudgment] as string).trim().length > 0 && (j[key as keyof ExaminerJudgment] as string).length <= 1800) ||
    !Array.isArray(j.materialLimitations) || j.materialLimitations.length > 5 ||
    j.materialLimitations.some(s => typeof s !== "string" || !s.trim() || s.length > 1000) ||
    j.selectedBand !== band.markBand || j.withinBand !== band.placement ||
    !["integrated", "limited", "missing_material", "not_required", "unresolved"].includes(j.diagramEffect)) throw new Error("inconsistent examiner judgment");
  const absent = state === "not_provided" || state === "no_relevant_diagram";
  const necessary = ["required_explicitly", "necessary_for_task"].includes(contract.diagramRole);
  if (absent && necessary && (j.diagramEffect !== "missing_material" || j.materialLimitations.length === 0) ||
    absent && !necessary && contract.diagramRole !== "unresolved" && j.diagramEffect !== "not_required" ||
    contract.diagramRole === "unresolved" && j.diagramEffect !== "unresolved" ||
    !absent && j.diagramEffect === "missing_material" ||
    earned === contract.total && j.materialLimitations.length > 0) throw new Error("contradictory examiner evidence and mark");
  return j;
}
