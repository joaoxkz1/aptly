import type { Feedback, MistakeType, Subject } from "./types";

/**
 * Mock rubric grader. Entirely heuristic and deterministic — no AI.
 * It inspects the answer for the ingredients an IB examiner looks for
 * (definitions, evaluation, examples, diagrams, working, structure)
 * and builds rubric-style feedback from what it finds.
 *
 * Replace this module with a real LLM call later; the Feedback shape
 * is the contract the rest of the app depends on.
 */

interface Checks {
  words: number;
  hasDefinition: boolean;
  hasExample: boolean;
  hasEvaluation: boolean;
  hasDiagram: boolean;
  hasStructure: boolean;
  hasWorking: boolean; // calculations / setup (Physics)
}

function analyse(answer: string): Checks {
  const text = answer.toLowerCase();
  const words = answer.trim().split(/\s+/).filter(Boolean).length;
  return {
    words,
    hasDefinition:
      /\b(is defined as|refers to|means that|is the (amount|rate|measure|process)|definition)\b/.test(
        text
      ),
    hasExample:
      /\b(for example|for instance|such as|e\.g\.|in (20|19)\d\d|real[- ]world|in the uk|in the us|in brazil|in japan|in germany|in china)\b/.test(
        text
      ),
    hasEvaluation:
      /\b(however|on the other hand|depends on|in the long run|in the short run|trade[- ]?off|although|whereas|stakeholder|limitation|evaluat|weigh|nonetheless|critics argue)\b/.test(
        text
      ),
    hasDiagram: /\b(diagram|graph|curve|axis|axes|shift|figure|slope|gradient)\b/.test(text),
    hasStructure:
      answer.split(/\n\s*\n/).length >= 2 ||
      /\b(firstly|secondly|finally|in conclusion|to conclude|therefore|overall)\b/.test(text),
    hasWorking: /[=×÷*/^]|\b\d+(\.\d+)?\s?(m\/s|n|j|w|kg|hz|v|ω|ohm|°c|k|mol)\b/.test(text),
  };
}

const BAND_NAMES: Record<number, string> = {
  7: "Excellent 7",
  6: "Strong 6",
  5: "Secure 5",
  4: "Developing 4",
  3: "Limited 3",
  2: "Fragmentary 2",
};

export function bandFor(score: number): string {
  return BAND_NAMES[Math.min(7, Math.max(2, Math.round(score)))] ?? `Band ${score}`;
}

function needsDiagram(subject: Subject) {
  return subject === "Economics" || subject === "Physics";
}

export function gradeAnswer(
  subject: Subject,
  topic: string,
  question: string,
  answer: string
): Feedback {
  const c = analyse(answer);

  let score = 2;
  if (c.hasDefinition) score += 1;
  if (c.hasEvaluation) score += 1;
  if (c.hasExample) score += 1;
  if (c.hasStructure) score += 0.5;
  if (c.words >= 120) score += 0.5;
  if (subject === "Physics" && c.hasWorking) score += 1;
  if (subject !== "Physics" && c.hasDiagram) score += 1;
  if (c.words < 40) score = Math.min(score, 3);
  score = Math.min(7, Math.max(2, Math.round(score)));

  const strengths: string[] = [];
  if (c.hasDefinition)
    strengths.push("Key terms are defined explicitly, which secures the AO1 knowledge marks.");
  if (c.hasEvaluation)
    strengths.push(
      "There is genuine evaluation — you weigh the argument rather than just asserting it."
    );
  if (c.hasExample)
    strengths.push("A real-world example is used to support the analysis, which examiners reward.");
  if (c.hasDiagram)
    strengths.push("You reference a diagram/model and connect it to the written argument.");
  if (subject === "Physics" && c.hasWorking)
    strengths.push("Working is shown with values and units, making the method easy to credit.");
  if (c.hasStructure)
    strengths.push("The response is organised with a clear line of reasoning from claim to conclusion.");
  if (strengths.length === 0)
    strengths.push("You engage directly with the question and stay on topic throughout.");

  const improvements: string[] = [];
  const mistakes: MistakeType[] = [];

  if (!c.hasDefinition) {
    mistakes.push("Weak definitions");
    improvements.push(
      `Open by defining the core terms of ${topic} precisely — IB markschemes award the first marks for accurate definitions.`
    );
  }
  if (!c.hasEvaluation) {
    mistakes.push("Lack of evaluation");
    improvements.push(
      "Add a counter-argument or condition (e.g. short run vs long run, stakeholder trade-offs). Top bands require judgement, not just explanation."
    );
  }
  if (needsDiagram(subject) && !c.hasDiagram && !(subject === "Physics" && c.hasWorking)) {
    mistakes.push("Missing diagram explanation");
    improvements.push(
      "Refer to a labelled diagram and explain the shift or relationship in words — unexplained diagrams earn almost nothing."
    );
  }
  if (!c.hasExample) {
    mistakes.push("No real-world example");
    improvements.push(
      "Anchor the theory in a specific real-world case (a country, firm, or dataset). This is what separates a 5 from a 7."
    );
  }
  if (subject === "Physics" && !c.hasWorking) {
    mistakes.push("Calculation/setup error");
    improvements.push(
      "State the governing equation first, substitute with units, then solve. Marks are awarded for setup even if the arithmetic slips."
    );
  }
  if (!c.hasStructure) {
    mistakes.push("Unclear structure");
    improvements.push(
      "Use a Point → Explain → Example → Evaluate paragraph structure so the examiner can follow the argument."
    );
  }
  if (improvements.length === 0) {
    improvements.push(
      "Push for precision: quantify your claims and make the final judgement answer the exact command term."
    );
  }

  const topMistakes = mistakes.slice(0, 3);

  const examinerComment = buildExaminerComment(subject, topic, score, c);
  const studyNext = buildStudyNext(topic, topMistakes);

  return {
    score,
    band: bandFor(score),
    strengths: strengths.slice(0, 3),
    improvements: improvements.slice(0, 3),
    mistakes: topMistakes,
    examinerComment,
    studyNext,
  };
}

function buildExaminerComment(
  subject: Subject,
  topic: string,
  score: number,
  c: Checks
): string {
  const openers: Record<number, string> = {
    7: `A confident, well-judged response on ${topic}.`,
    6: `A strong response on ${topic} with clear analytical development.`,
    5: `A secure response on ${topic}, though the top band remains out of reach.`,
    4: `A developing response on ${topic} that shows understanding but limited depth.`,
    3: `A limited response on ${topic} — knowledge is present but underdeveloped.`,
    2: `A fragmentary response on ${topic} that does not yet address the demands of the question.`,
  };
  const parts = [openers[score] ?? openers[4]];

  if (subject === "Physics") {
    parts.push(
      c.hasWorking
        ? "The method is shown clearly; keep stating equations before substituting."
        : "Without a stated equation and substitution, method marks cannot be awarded."
    );
  } else {
    parts.push(
      c.hasEvaluation
        ? "The evaluation engages with the command term, which is exactly what the top band requires."
        : "The response explains but does not evaluate — the command term demands a supported judgement."
    );
  }

  parts.push(
    score >= 6
      ? "To consolidate, practise under timed conditions and tighten the conclusion."
      : "Rework this answer using the markscheme structure, then attempt a similar question unseen."
  );
  return parts.join(" ");
}

function buildStudyNext(topic: string, mistakes: MistakeType[]): string {
  if (mistakes.length === 0) {
    return `You have mastered the basics of ${topic} — attempt a harder Paper 2 question on it next.`;
  }
  const focus: Record<MistakeType, string> = {
    "Lack of evaluation": "practise writing two-sided evaluations",
    "Weak definitions": "drill the key definitions",
    "Missing diagram explanation": "redraw and annotate the core diagrams",
    "No real-world example": "collect two real-world case studies",
    "Calculation/setup error": "rework the standard calculation setups",
    "Unclear structure": "rebuild answers with a PEEE paragraph plan",
  };
  return `Revisit ${topic}: ${focus[mistakes[0]]} before your next attempt.`;
}
