import "server-only";
import type { Subject } from "@/lib/types";

/**
 * Aptly-owned, operational paraphrase of current IB Economics marking
 * principles. It is not an official markscheme and contains no reproduced
 * question-specific markscheme text.
 */
export const ECONOMICS_RUBRIC_VERSION = "econ-v4" as const;

const ECONOMICS_RUBRIC = `APTLY IB-ALIGNED ECONOMICS RUBRIC — ${ECONOMICS_RUBRIC_VERSION}
Estimated practice marking only. This is not an official IB grade or a substitute for a supplied question-specific markscheme.

CURRENT SYLLABUS — classify to one top-level code; use unknown when genuinely unclear:
Unit 1: 1.1 What is economics?; 1.2 How do economists approach the world?
Unit 2: 2.1 Demand; 2.2 Supply; 2.3 Competitive market equilibrium; 2.4 Critique of maximizing behaviour;
2.5 Elasticity of demand; 2.6 Elasticity of supply; 2.7 Government's role in microeconomics;
2.8 Externalities and common pool/common access resources; 2.9 Public goods; 2.10 Asymmetric information (HL);
2.11 Market power (HL); 2.12 The market's inability to achieve equity (HL).
Unit 3: 3.1 Measuring economic activity and variations; 3.2 AD/AS variations; 3.3 Macroeconomic objectives;
3.4 Economics of inequality and poverty; 3.5 Monetary policy; 3.6 Fiscal policy; 3.7 Supply-side policies.
Unit 4: 4.1 Benefits of international trade; 4.2 Types of trade protection; 4.3 Arguments for/against trade control;
4.4 Economic integration; 4.5 Exchange rates; 4.6 Balance of payments; 4.7 Sustainable development;
4.8 Measuring development; 4.9 Barriers to growth/development; 4.10 Growth/development strategies.
Paper 3 is HL-only. Shared top-level topics may still contain HL extensions: classify the exact content, not just its code.

BEST-FIT PRINCIPLES:
- Read the whole answer and determine the exact question demands before selecting a level.
- Infer an internal, non-exhaustive question-specific guide: relevant theory, valid analysis, application/source use,
  diagrams where genuinely relevant, and plausible evaluation. It is not an additive checklist and is not output.
- Credit valid alternative economic approaches even when absent from the first inferred guide.
- Select the one band that best fits the answer as a whole. Compensate across characteristics; every descriptor need not appear.
- Then select the exact mark: lower = just demonstrates the band; middle = secure; upper = to a great extent.
- Mark positively. The top mark is attainable without literal perfection. Do not invent optional extras to avoid full marks.
- Fix assessableEarned before producing rationale, diagnostics, strengths, improvements, or weaknesses.
- Never calculate assessableEarned by adding diagnostic categories.
- Do not double-penalise one conceptual error.
- Accurate terminology can demonstrate knowledge without a stand-alone definition unless a definition is requested.
- Do not mechanically count examples. One relevant, fully developed example can be strong application.
- Evaluation is genuine critical thinking, not a mechanical advantage/disadvantage pair. Credit conditions, assumptions,
  stakeholders, time horizons, magnitude, prioritisation, alternatives, trade-offs, effectiveness and supported judgements.
- Credit theoretically valid alternative diagrams and approaches. A diagram is not universally required for a high
  Paper 1(b) or Paper 2(g) mark.

BEST-FIT BAND ANCHORS:
Paper 1(a), 10 marks — 1–2 little relevant understanding/coherent explanation; 3–4 some relevant theory but limited or
descriptive; 5–6 partly explained theory and coherent but incomplete analysis; 7–8 accurate developed explanation and
effective relevant diagrams where appropriate; 9–10 fully focused, accurate, well-developed and coherent analysis with
effective relevant diagrams where appropriate. Do not require evaluation or automatically require a real-world example.

Paper 1(b), 15 marks — 1–3 little relevant understanding or meaningful evaluation; 4–6 some theory, mainly descriptive,
superficial evaluation and undeveloped application; 7–9 partly explained theory with genuine but limited evaluation and
partly developed application; 10–12 accurate theory, developed analysis, mostly balanced evaluation and supporting
real-world application; 13–15 fully focused theory and analysis, effective balanced evaluation, supported judgement and
fully developed integrated real-world evidence. Never impose a multiple-example rule or withhold 15 merely because another
optional example, policy, comparison, definition or diagram could have been added.

Paper 2(g), 15 marks — use 1–3/4–6/7–9/10–12/13–15 as above, replacing Paper 1 real-world-example emphasis with effective
use of supplied text/data. Restatement is not strong application. Applying theory to source facts/data to develop an
economic conclusion is stronger. Evaluation may appear anywhere; prioritisation and weighing can be high-quality.
No source means feedback-only under the server frame. Do not automatically require a diagram for the top band.

Paper 3(b), 10 marks — use 1–2/3–4/5–6/7–8/9–10. Judge five areas: (1) appropriate recommendation plus how it addresses
the issue, (2) relevant accurate theory, (3) accurate appropriate terminology, (4) effective supplied text/data use,
(5) weighing arguments before a supported conclusion. At higher levels credit alternatives/combinations, conditions,
trade-offs, time lags and likely effectiveness where relevant. Paper 3 is HL-only.

ANALYTIC FRAMEWORKS:
- Paper 2(a): accept economically accurate definitions/descriptions without textbook-perfect wording; invent no universal 1+1 split.
- Paper 2(b): use a question-specific analytic guide; credit valid method/workings and justified own-figure continuation;
  units and rounding matter only where relevant; require no explanation the question did not ask for.
- Recognised Paper 2(c)–(f)-style diagram/explanation: use a written/diagram split only when the server frame specifies it;
  credit valid alternative diagrams; allow appropriate error carry-forward; avoid double penalties; required context matters;
  essential wrong labels can limit diagram credit; judge consistency between diagram and prose.
- Paper 3(a): question-specific HL analytic marking; never infer the generic 2+2 split from a four-mark total alone.
- Generic practice: do not claim an official paper or exact official markscheme.

DIAGNOSTIC SCALE — internal and non-official:
For every qualitative criterion genuinely tested, available must be exactly 4 and awarded must be 0..4:
0 absent/fundamentally incorrect; 1 very weak; 2 partial/developing; 3 strong; 4 excellent for this question.
Omit untested criteria. Never add these numbers to determine assessableEarned.

NEW WEAKNESS LABELS — emit only these:
"Lack of evaluation"; "Underdeveloped evaluation"; "Weak definitions"; "Weak terminology";
"Inaccurate economic theory"; "Underdeveloped economic analysis"; "No real-world example";
"Irrelevant real-world example"; "Underdeveloped real-world example"; "Missing required diagram";
"Incorrect diagram explanation"; "Insufficient source use"; "Calculation/setup error";
"Unsupported judgement"; "Unclear structure".
No example means none exists; irrelevant and underdeveloped examples use their distinct labels. Lack of evaluation means
essentially absent; shallow evaluation is underdeveloped. Never flag a missing diagram unless the exact task requires it.

HONESTY AND AUTHORITY:
- The server's MARKING FRAME owns total, assessable marks, framework, source gate and diagram cap. Never alter them.
- Never fabricate an official markscheme, source, diagram, calculation, example or student content.
- Never reward an unseen diagram. Typed workings remain assessable.
- The output is estimated study feedback, never official IB grading.`;

export function getRubric(subject: Subject): string | null {
  return subject === "Economics" ? ECONOMICS_RUBRIC : null;
}
