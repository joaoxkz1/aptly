import "server-only";
import type { Subject } from "@/lib/types";

/**
 * Compact, version-controlled Economics grading rubric for Aptly v1.
 * Keep it narrow and easy to edit. Outputs are ESTIMATED STUDY FEEDBACK,
 * not official IB grading. v1 supports Economics only — getRubric returns
 * null for any other subject so the route can refuse to grade it.
 */

export const ECONOMICS_RUBRIC_VERSION = "econ-v1";

const ECONOMICS_RUBRIC = `APTLY ECONOMICS RUBRIC — ${ECONOMICS_RUBRIC_VERSION}
Purpose: estimated study feedback for IB Economics practice. NOT an official IB grade.

Score bands (0-7):
- 7 Excellent: accurate definitions, relevant theory, correct explained diagram(s), specific
  real-world example(s), balanced evaluation that directly answers the command term, clear structure.
- 6 Strong: mostly the above with minor gaps (e.g. evaluation present but slightly thin).
- 5 Secure: sound analysis but limited evaluation OR missing example/diagram.
- 4 Developing: explains theory but little/no evaluation; gaps in definitions or application.
- 3 Limited: some relevant knowledge, underdeveloped, weak structure.
- 2 Fragmentary: minimal relevant content, largely descriptive or off-point.
- 0-1 Minimal: little or no creditable economics.

What to reward (IB AO1-AO4): precise definitions of key terms; correct economic theory; accurate,
explicitly explained diagrams (not just mentioned); specific real-world examples (country/firm/policy);
genuine two-sided evaluation (short vs long run, stakeholders, magnitude, assumptions); logical structure.

Map weaknesses ONLY to these fixed labels (use the exact text):
- "Lack of evaluation"          — explains but does not weigh/judge against the command term.
- "Weak definitions"            — key terms undefined or imprecise.
- "Missing diagram explanation" — relevant diagram absent or named but not explained.
- "No real-world example"       — no specific real-world application.
- "Calculation/setup error"     — quantitative reasoning wrong or missing where needed.
- "Unclear structure"           — disorganised; hard to follow argument.

Calibration: explanation-only with no judgement caps at ~4; genuine evaluation + specific example +
explained diagram → 6-7. Keep all feedback specific to the student's actual text. Be encouraging but honest.`;

export function getRubric(subject: Subject): string | null {
  if (subject === "Economics") return ECONOMICS_RUBRIC;
  return null;
}
