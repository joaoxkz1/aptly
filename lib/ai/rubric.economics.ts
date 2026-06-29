import "server-only";
import type { Subject } from "@/lib/types";

/**
 * Assessment-aware Economics grading rubric for Aptly (version econ-v2).
 * Original Aptly-owned wording — paraphrased marking principles, NOT official
 * IB markscheme text. Outputs are ESTIMATED study feedback, never an official
 * IB grade. v1 supports Economics only; getRubric returns null otherwise.
 */

export const ECONOMICS_RUBRIC_VERSION = "econ-v2";

const ECONOMICS_RUBRIC = `APTLY IB ECONOMICS RUBRIC — ${ECONOMICS_RUBRIC_VERSION}
Estimated study feedback for IB Economics practice. NOT official IB grading.

SYLLABUS UNITS & TOPIC CODES (map the question to ONE code; use "unknown" if unclear):
- Unit 1 Introduction: 1.1 What is economics, 1.2 How economists approach the world.
- Unit 2 Microeconomics: 2.1 demand, 2.2 supply, 2.3 competitive market equilibrium,
  2.4 elasticities, 2.5 role of government in microeconomics, 2.6 market failure/externalities,
  2.7 public/common goods & asymmetric info, 2.8 market failure & market power, 2.9 (HL) the firm/costs,
  2.10 (HL) market structures, 2.11 (HL) price discrimination, 2.12 behavioural economics.
- Unit 3 Macroeconomics: 3.1 measuring economic activity, 3.2 variations in activity (AD/AS),
  3.3 macro objectives (growth, low unemployment, low inflation), 3.4 fiscal policy,
  3.5 monetary policy, 3.6 supply-side policies, 3.7 (HL) inequality/poverty.
- Unit 4 Global economy: 4.1 benefits of trade, 4.2 trade protection, 4.3 economic integration,
  4.4 exchange rates, 4.5 balance of payments, 4.6 (HL) sustainable development goals,
  4.7 measuring development, 4.8 barriers to development, 4.9 strategies for development,
  4.10 (HL) global economic relations.

ASSESSMENT FORMATS & MARKING PRINCIPLES (classification label only — the format name NEVER forces a diagram):
- paper_1_a: explain/analysis, up to 10 marks. Knowledge + theory + diagram + application. No evaluation demanded.
- paper_1_b: evaluate/discuss essay, up to 15 marks. Adds genuine two-sided evaluation & judgement.
- paper_2_a_definition: short definition(s), small mark total.
- paper_2_b_quantitative_or_diagram: a calculation OR a diagram task.
- paper_2_c_to_f_diagram_and_explanation: explanation supported by a diagram, data-response.
- paper_2_g_extended_response: extended data-response using the stimulus, up to ~15 marks, evaluation expected.
- paper_3_a_technical_or_quantitative: (HL) technical/quantitative problem with method + answer.
- paper_3_b_policy_recommendation: (HL) policy recommendation, up to 10 marks, justified with data.
- custom_short_response / custom_extended_response: teacher questions not matching a standard paper part.

MARK BANDS (0–7 internal score for back-compat; mark estimate is the headline when honest):
7 excellent · 6 strong · 5 secure · 4 developing · 3 limited · 2 fragmentary · 0–1 minimal.
Reward: precise definitions; correct theory; accurate EXPLAINED diagrams; specific real-world/stimulus examples;
genuine two-sided evaluation answering the command term; clear structure; correct method + units for calculations.

WEAKNESS LABELS — use ONLY these exact strings in "mistakes":
"Lack of evaluation" · "Weak definitions" · "Missing diagram explanation" · "No real-world example" ·
"Calculation/setup error" · "Unclear structure".

HONESTY RULES (mandatory):
- Never hallucinate source text, mark totals, diagrams, or calculations the student did not provide.
- Infer marksAvailable ONLY from: explicit marks in the question, an explicit paper+part at high confidence,
  or a very-high-confidence canonical format. Otherwise marksSource = not_reliably_known and give practice feedback only.
- Never invent a missing-evidence mark split (e.g. "diagram = 2 of 4"). A numeric partial_estimate is allowed ONLY when the
  PASTED QUESTION explicitly allocates marks to genuinely missing evidence — a diagram you cannot see, or workings the student
  did not type. Then set evidenceSplitSource = explicit_in_question and unassessedEvidence = { type: 'diagram'|'workings',
  marks, quote }, where marks equals the unassessed marks and quote is the exact phrase from the question that names the
  evidence (diagram/draw/graph/curve, or working/workings/method/calculation/show your work) AND states its marks
  (e.g. "diagram [2 marks]"). You may NOT use a canonical/template assumption. Otherwise use practice_feedback_only.
- Set unassessedEvidence to null for every mode except partial_estimate. Missing source/stimulus is never partial evidence.
- diagramExpected = true ONLY when the question explicitly instructs the student to draw, use, provide, label, or analyse a
  diagram, or clearly contains a diagram-specific allocated mark component. Do NOT set diagramExpected = true just because a
  diagram would strengthen a Paper 1 or other explanation; a clear text-only prompt can earn an exact_estimate.
- Do NOT demand evaluation in a 10-mark explain. Do NOT penalise a missing diagram when one is not needed.
- Do NOT reward a diagram you cannot see; typed workings IN the answer ARE assessable.
- No full method marks for a calculation without shown workings.
- Distinguish "marks lost" (assessed, not earned) from "marks not assessable" (evidence not submitted).
- If the question refers to stimulus/source material (an extract, text, figure, table, chart, or data set) that is NOT
  pasted into the question, the data-based marks cannot be assessed. Unless the question explicitly allocates marks to a
  non-data written portion (with a quotable split), return markDisplayMode = practice_feedback_only because the source
  material was not supplied — do not grade it as if fully assessable.
- Use the FULL plausible mark range; do not cluster everything mid-band.
- Never claim official IB grading. Do not assume HL unless the question is clearly HL-only (P3 or an HL extension).
- The mark breakdown covers ONLY assessable marks and its awarded/available sums must equal marksEarned/marksAssessable.`;

export function getRubric(subject: Subject): string | null {
  if (subject === "Economics") return ECONOMICS_RUBRIC;
  return null;
}
