import "server-only";
import type { AdaptivePracticeTarget, GeneratedPractice } from "./practice-schema";
import { eligibleBankQuestions } from "@/lib/assessment/question-bank/economics-v1/selection";
import type { EconomicsBankQuestion } from "@/lib/assessment/question-bank/economics-v1/types";
import { questionIdentity } from "@/lib/assessment/question-identity";

/** Fallback cannot author new assessment allocations or economic mechanisms. */
export function approvedFourMarkTemplate(bank: readonly EconomicsBankQuestion[], target: AdaptivePracticeTarget, focused: boolean): EconomicsBankQuestion | null {
  const choices = eligibleBankQuestions(bank, { marks: 4, topicCode: target.topicCode, courseLevel: target.courseLevel,
    targetSkill: focused ? target.targetSkill : null, requireSkill: focused,
    framework: focused ? target.framework : undefined, evidenceQuestion: target.evidenceQuestion });
  return choices.find(q => q.gradingBlueprint.kind === "four_mark") ?? null;
}
export const FOUR_MARK_VARIANT_SCHEMA = { type: "object", additionalProperties: false,
  required: ["templateId", "scenarioName"], properties: { templateId: { type: "string" }, scenarioName: { type: "string" } } };
export function fourMarkVariantInstructions(template: EconomicsBankQuestion): string {
  return `Create a short fictional classroom case name (two or three alphabetic words, e.g. Cedar Valley). Return templateId exactly ${template.id} and scenarioName. Do not write questions, context, labels, marks, figures, sources, instructions or marking rules. Aptly instantiates the complete approved ${template.gradingBlueprint.kind === "four_mark" ? template.gradingBlueprint.format : ""} template; its economic mechanism and allocation are fixed. The name is a fictional identifier, not attribution to an actual economy.`;
}
export function validateFourMarkVariant(raw: unknown, template: EconomicsBankQuestion, target: AdaptivePracticeTarget): GeneratedPractice & { sourceMaterial: string; template: EconomicsBankQuestion } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("invalid four-mark variant");
  const v = raw as Record<string, unknown>;
  if (Object.keys(v).length !== 2 || v.templateId !== template.id || typeof v.scenarioName !== "string" ||
    !/^[A-Z][a-z]{2,15}(?: [A-Z][a-z]{2,15}){1,2}$/.test(v.scenarioName) || /ignore|instruction|marks|award|official|teacher|exam|correct/i.test(v.scenarioName)) throw new Error("invalid approved variant fields");
  if (template.marks !== 4 || template.topicCode !== target.topicCode || !template.sourceMaterial || template.gradingBlueprint.kind !== "four_mark" ||
    (target.courseLevel === "sl" && template.levelRelevance !== "shared_sl_hl")) throw new Error("incompatible approved template");
  const question = `In the hypothetical ${v.scenarioName} case, ${template.question.charAt(0).toLowerCase()}${template.question.slice(1)}`;
  if (target.evidenceQuestion && questionIdentity(question) === questionIdentity(target.evidenceQuestion)) throw new Error("repeated question");
  return { question, sourceMaterial: `Fictional classroom case: ${v.scenarioName}. ${template.sourceMaterial}`,
    commandTerm: template.commandTerm, targetSkills: template.targetSkills, angleTags: [...template.angleTags, "approved_template_variant"],
    gradingBlueprint: template.gradingBlueprint, template };
}
