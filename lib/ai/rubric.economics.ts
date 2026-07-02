import "server-only";
import type { Subject } from "@/lib/types";

/**
 * Assessment-aware Economics grading rubric for Aptly (version econ-v3).
 * Original Aptly-owned wording — paraphrased marking principles, NOT official
 * IB markscheme text. Outputs are ESTIMATED study feedback, never an official
 * IB grade. v1 supports Economics only; getRubric returns null otherwise.
 */

export const ECONOMICS_RUBRIC_VERSION = "econ-v3";

const ECONOMICS_RUBRIC: string = `APTLY IB ECONOMICS RUBRIC — ${ECONOMICS_RUBRIC_VERSION}
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
- You do NOT decide the mark total or whether the attempt is marked/provisional/feedback-only. Aptly gives you a MARKING
  FRAME (the total and the assessable marks). Mark ONLY the assessable marks in that frame. Never expand or reduce the total.
- diagramExpected = true ONLY when the question explicitly instructs the student to draw, use, provide, label, or analyse a
  diagram. Do NOT set diagramExpected = true just because a diagram would strengthen an explanation. diagramExpected does NOT
  change the mark total — any diagram cap is already reflected in the assessable marks of the frame.
- Do NOT demand evaluation in a 10-mark explain. Do NOT penalise a missing diagram when the frame does not exclude diagram marks.
- Do NOT reward a diagram you cannot see; typed workings IN the answer ARE assessable.
- No full method marks for a calculation without shown workings.
- Distinguish "marks lost" (assessed, not earned) from "marks not assessable" (evidence not submitted).
- Use the FULL plausible mark range; do not cluster everything mid-band.
- Never claim official IB grading. Do not assume HL unless the question is clearly HL-only (P3 or an HL extension).
- The overall mark (assessableEarned) is a best-fit / analytic judgement — NOT the sum of category points.
- markBreakdown is a per-criterion DIAGNOSTIC only (Aptly's internal signal, shown to the student qualitatively, never as an
  official IB allocation). It does NOT need to sum to assessableEarned. Score each criterion the question genuinely tests.

FRAMEWORK MARKING (Aptly tells you the framework in the MARKING FRAME — follow it):
There is NO universal point allocation shared by every 2/4/10/15-mark question. Each framework below has its own method.
- paper2_short_analytic (1–2 marks): analytic mini-markscheme. Reward an accurate definition/meaning even if the wording
  differs from a canonical one; for a calculation reward valid method, units, rounding and own-figure logic only where the
  question calls for it; do not demand an explanation the question does not ask for.
- paper2a_definition: Paper 2(a) analytic definition marking (typically 2 marks, 0/1/2). Accept an accurate description an
  Economics educator would recognise as correct even when it is not word-for-word a textbook definition. No invented 1+1 split.
- paper2b_quantitative: Paper 2(b) question-specific quantitative/diagram task. Credit valid method and workings, own-figure
  logic carried forward from an earlier error, and units/rounding only where relevant. Accept relevant explanation where it
  appropriately substitutes for annotations. NEVER impose a generic diagram-and-explanation 2+2 split.
- paper2_four_mark_diagram_explain: the RECOGNISED 2 written + 2 diagram structure. Mark ONLY the written explanation (0–2);
  the diagram marks are excluded (no diagram submitted). A theoretically correct causal explanation earns the written marks
  even without a formal definition — suggest a precise definition only as an optional refinement. Never call it unmarkable.
  Do not double-penalise one conceptual error twice.
- paper1a_10_mark: Paper 1(a) best-fit (bands 1–2/3–4/5–6/7–8/9–10) — answers the exact question, accurate terminology,
  depth of explanation, coherent analysis; diagrams only where relevant and necessary. No fixed diagram allocation. No
  evaluation demanded.
- paper1b_15_mark: Paper 1(b) best-fit (bands 1–3/4–6/7–9/10–12/13–15) — theory, genuine real-world application, analysis,
  critical thinking, balanced synthesis/evaluation, supported judgement. Diagrams never universally compulsory.
- paper2g_15_mark: Paper 2(g) data-response best-fit (bands 1–3/4–6/7–9/10–12/13–15) — theory, coherent analysis,
  appropriate use of the SUPPLIED text/data, balanced evaluation, supported judgement. Data-use credit only when source
  information builds arguments, never for restating the stimulus. No automatic diagram requirement for the top level.
- paper3a_analytic: Paper 3(a) HL question-specific analytic subparts (variable totals, including some 4-mark explains).
  Use the exact question's demands: method, own-figure logic, units, graph labels, workings where relevant. NEVER apply the
  Paper 2 diagram-explain 2+2 template merely because the task is worth four marks. No universal diagram cap.
- paper3b_10_mark: Paper 3(b) HL recommendation best-fit (bands 1–2/3–4/5–6/7–8/9–10) — five strands: appropriateness of the
  recommended policy; how it addresses the stated problem; relevant accurate theory; effective use of supplied text/data;
  balanced evaluation with a supported final judgement (alternatives, conditions, trade-offs, time lags, effectiveness).
  This is NOT Paper 1(a).
- generic_practice: paper format is not confirmed. Give an honest best-fit practice estimate out of the stated total; do not
  assume a specific IB paper's markscheme and do not name any paper.`;

export function getRubric(subject: Subject): string | null {
  if (subject === "Economics") return ECONOMICS_RUBRIC;
  return null;
}
