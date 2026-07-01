import type { RubricTemplateId } from "@/lib/types";

/**
 * Controlled rubric-template registry (Assessment Integrity).
 *
 * Pure, deterministic, no secrets — safe on client and server. A template lets
 * Aptly mark a recognised short assessment structure (e.g. a 4-mark
 * diagram-explain) where the written economics can be judged independently and
 * only the diagram marks are capped away when no assessable diagram is present.
 *
 * Hard rules for this release:
 *  - Exactly ONE approved template: `four_mark_diagram_explain`.
 *  - A template match only ever affects the mark TOTAL/split. It never decides
 *    marked-vs-provisional-vs-feedback-only — that is the server's job.
 *  - There is NO universal missing-diagram cap. A cap comes only from a matched
 *    template, never from a generic `diagramExpected` boolean.
 */

export interface RubricTemplate {
  id: RubricTemplateId;
  /** Human label for the recognised structure. */
  label: string;
  /** Full mark total the structure carries. */
  totalMarks: number;
  /** Marks judgeable from the written response alone (diagram absent). */
  writtenMarks: number;
  /** Marks that require an assessable diagram; capped away when none is present. */
  diagramMarks: number;
  /** Shown when the diagram marks are unavailable. */
  capReason: string;
  /** High-confidence structural match — deliberately conservative. */
  matches(question: string): boolean;
}

const DIAGRAM_EXPLAIN_CAP_REASON =
  "Diagram evidence missing. Your explanation earned written marks, but the diagram marks could not be verified.";

/** Command terms that indicate an extended/evaluative response — never this template. */
const EXTENDED_COMMAND = /\b(evaluate|discuss|to what extent|examine|justify|assess|compare|contrast)\b/;

/** A named diagram instruction, e.g. "using a demand and supply diagram". */
const NAMED_DIAGRAM_INSTRUCTION = /\b(using|use|with|draw)\b[^.?!]*?\b[a-z][a-z\s\-&/]*?\bdiagram(s)?\b/;

function wordCount(s: string): number {
  const t = s.trim();
  return t === "" ? 0 : t.split(/\s+/).length;
}

export const FOUR_MARK_DIAGRAM_EXPLAIN: RubricTemplate = {
  id: "four_mark_diagram_explain",
  label: "4-mark diagram explanation",
  totalMarks: 4,
  writtenMarks: 2,
  diagramMarks: 2,
  capReason: DIAGRAM_EXPLAIN_CAP_REASON,
  matches(question: string): boolean {
    const q = question.toLowerCase();
    // Short, single-part, diagram-anchored explanation — not an essay.
    if (wordCount(question) > 60) return false;
    if (EXTENDED_COMMAND.test(q)) return false;
    if (!/\bexplain\b/.test(q)) return false;
    if (!NAMED_DIAGRAM_INSTRUCTION.test(q)) return false;
    return true;
  },
};

export const RUBRIC_TEMPLATES: readonly RubricTemplate[] = [FOUR_MARK_DIAGRAM_EXPLAIN];

/** The single best template match for a question, or null. Deterministic. */
export function matchTemplate(question: string): RubricTemplate | null {
  for (const t of RUBRIC_TEMPLATES) {
    if (t.matches(question)) return t;
  }
  return null;
}

export function templateById(id: string | null | undefined): RubricTemplate | null {
  if (id == null) return null;
  return RUBRIC_TEMPLATES.find((t) => t.id === id) ?? null;
}
