import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import type { Assessment, Attempt } from "@/lib/types";
import {
  DIAGNOSTIC_BAR_EXPLANATION,
  LATEST_ATTEMPT_PER_QUESTION_NOTE,
  WEIGHTED_PERCENT_EXPLANATION,
  attemptMetaLine,
  feedbackOnlyCountLabel,
  frameworkShortLabel,
  withInferredTotalLabel,
} from "./display";
import { ASSESSMENT_FRAMEWORK_LABELS } from "./taxonomy";
import { humanizeGraphType, presentDiagramEvidence } from "@/lib/diagram/evidence";

/**
 * Beta Trust & Clarity — durable copy/regression pins for this branch's fixes.
 * Same style as copy-audit.test.ts: read the student-facing sources so the
 * fixed wording cannot silently regress.
 */

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

const read = (p: string) => readFileSync(p, "utf8");
const STUDENT_SOURCES = [...walk("app"), ...walk("components")].map((f) => ({
  file: f,
  text: read(f),
}));

const MARK_SUMMARY = read(join("components", "assessment", "mark-summary.tsx"));
const PREFLIGHT_CHOICE = read(join("components", "submit", "preflight-choice.tsx"));
const LEARNING_LOG = read(join("app", "(app)", "attempts", "page.tsx"));
const DASHBOARD = read(join("app", "(app)", "page.tsx"));
const ANALYTICS = read(join("app", "(app)", "analytics", "page.tsx"));
const SUBMIT = read(join("app", "(app)", "submit", "page.tsx"));
const SCAN_ATTACHMENT = read(join("components", "submit", "scan-attachment.tsx"));
const LOGIN = read(join("app", "(public)", "login", "page.tsx"));
const FEEDBACK_RESULT = read(join("components", "feedback-result.tsx"));

// --- 8. Format confirmation never claims autonomous final detection -----------

describe("format provenance — confirmed formats are attributed to the student", () => {
  it("the mark summary branches on frameworkSource and carries the confirmed wording", () => {
    expect(MARK_SUMMARY).toContain('a.frameworkSource === "user_confirmed"');
    expect(MARK_SUMMARY).toContain("Format confirmed by you");
    expect(MARK_SUMMARY).toContain("Format set by your Aptly practice question");
  });

  it("'detected automatically' can only render through the provenance-aware branch", () => {
    // Exactly one occurrence, inside the detectionLine conditional — never an
    // unconditional claim.
    const count = MARK_SUMMARY.split("detected automatically").length - 1;
    expect(count).toBe(1);
    const at = MARK_SUMMARY.indexOf("detected automatically");
    const context = MARK_SUMMARY.slice(Math.max(0, at - 600), at);
    expect(context).toContain("frameworkSource");
  });

  it("the framework chooser gives every paper option equal weight (no primary default)", () => {
    const at = PREFLIGHT_CHOICE.indexOf("preflight.frameworkOptions.map");
    expect(at).toBeGreaterThan(-1);
    const block = PREFLIGHT_CHOICE.slice(at, at + 700);
    expect(block).not.toContain('"primary"');
  });
});

// --- D3. Paper 3(b) is labelled HL-only wherever it is offered ---------------

describe("Paper 3(b) is never offered without its HL marker", () => {
  it("the preflight chooser option says HL only", () => {
    expect(PREFLIGHT_CHOICE).toContain("Paper 3(b) recommendation · HL only");
  });

  it("the framework labels carry (HL)", () => {
    expect(ASSESSMENT_FRAMEWORK_LABELS.paper3b_10_mark).toContain("(HL)");
    const a = { framework: "paper3b_10_mark", marksAvailable: 10 } as unknown as Assessment;
    expect(frameworkShortLabel(a)).toContain("(HL)");
  });
});

// --- 10/11. Diagnostic wording and encoding -----------------------------------

describe("diagnostic focus panel — explained encoding, no strength-words for gaps", () => {
  it("the analytics page renders the one bar-encoding explanation", () => {
    expect(ANALYTICS).toContain("DIAGNOSTIC_BAR_EXPLANATION");
    expect(DIAGNOSTIC_BAR_EXPLANATION).toContain("not an IB mark");
  });

  it("no student-facing source ever labels a gap 'Strong signal' or 'Developing signal' again", () => {
    for (const { file, text } of STUDENT_SOURCES) {
      for (const banned of ["Strong signal", "Developing signal", "Limited signal", "Developing priority"]) {
        expect(text.includes(banned), `${file} contains "${banned}"`).toBe(false);
      }
    }
  });
});

// --- B. Metric labels state their denominators --------------------------------

describe("metric cards state their basis (revision collapsing, weighting)", () => {
  it("dashboard and analytics name the latest-attempt-per-question rule", () => {
    expect(DASHBOARD).toContain("LATEST_ATTEMPT_PER_QUESTION_NOTE");
    expect(ANALYTICS).toContain("LATEST_ATTEMPT_PER_QUESTION_NOTE");
    expect(LATEST_ATTEMPT_PER_QUESTION_NOTE).toBe("latest attempt per question");
  });

  it("the weighted percent explains its weighting", () => {
    expect(DASHBOARD).toContain("WEIGHTED_PERCENT_EXPLANATION");
    expect(WEIGHTED_PERCENT_EXPLANATION).toContain("weighted toward recent answers");
    expect(WEIGHTED_PERCENT_EXPLANATION).toContain("count once");
  });

  it("coverage says it counts every analysed answer including revisions", () => {
    expect(ANALYTICS).toContain("counts every analysed answer, including");
  });

  it("state-breakdown captions use student words, not raw state names", () => {
    expect(withInferredTotalLabel(1)).toBe("1 with an inferred total");
    expect(feedbackOnlyCountLabel(2)).toBe("2 feedback only");
    expect(DASHBOARD).not.toContain("earlier/unscored");
  });
});

// --- F. Agent-confusion and jargon wording -------------------------------------

describe("student-language wording", () => {
  it("Aptly grades; the student submits — no 'answer you grade' phrasing anywhere", () => {
    for (const { file, text } of STUDENT_SOURCES) {
      expect(/answers? you (grade|submit and grade)/i.test(text), `${file} says the student grades`).toBe(
        false
      );
    }
  });

  it("no 'copilot' branding remains in student-facing sources", () => {
    for (const { file, text } of STUDENT_SOURCES) {
      expect(/copilot/i.test(text), `${file} contains "copilot"`).toBe(false);
    }
  });

  it("the level card is a practice level, not an implied IB grade", () => {
    const LEVEL_CARD = read(join("components", "assessment", "economics-level-card.tsx"));
    expect(LEVEL_CARD).toContain("Estimated practice level");
    expect(LEVEL_CARD).not.toContain("Estimated Economics level");
  });
});

// --- attemptMetaLine — the mark is shown once (the pill), never twice ---------

describe("attemptMetaLine never repeats the MarkPill's mark or state", () => {
  function attemptWith(assessment: Assessment | null): Attempt {
    return {
      id: "t",
      createdAt: new Date().toISOString(),
      subject: "Economics",
      topic: "t",
      question: "Q",
      answer: "A",
      feedback: {
        score: 5,
        band: "",
        strengths: [],
        improvements: [],
        mistakes: [],
        examinerComment: "",
        studyNext: "",
      },
      assessment,
    };
  }

  const marked = {
    commandTermLabel: "Discuss",
    framework: "paper1b_15_mark",
    marksAvailable: 15,
    marksAssessable: 15,
    marksEarned: 11,
    markDisplayMode: "exact_estimate",
    marksSource: "explicit_in_question",
    scoringState: "marked",
    eligibleForCoreAnalytics: true,
    markBreakdown: [],
    limitations: [],
    assessmentSkills: ["economic_analysis"],
    syllabusTopic: "2.6",
    topicLabel: "Market failure",
  } as unknown as Assessment;

  it("a marked attempt's meta line has no fraction (the pill shows it)", () => {
    const line = attemptMetaLine(attemptWith(marked));
    expect(line).toContain("Paper 1(b)");
    expect(line).toContain("Discuss");
    expect(line).not.toMatch(/\d+\s*\/\s*\d+/);
  });

  it("a feedback-only attempt's meta line does not repeat 'Feedback only'", () => {
    const fb = {
      ...marked,
      scoringState: "feedback_only",
      eligibleForCoreAnalytics: false,
      marksAvailable: null,
      marksAssessable: null,
      marksEarned: null,
      markDisplayMode: "practice_feedback_only",
    } as unknown as Assessment;
    const line = attemptMetaLine(attemptWith(fb));
    expect(line).not.toContain("Feedback only");
    expect(line).toBe("Discuss");
  });

  it("a legacy attempt's meta line does not repeat 'Earlier attempt'", () => {
    expect(attemptMetaLine(attemptWith(null))).toBe("");
  });
});

// --- J. Learning log carries the essential feedback record --------------------

describe("learning log expanded rows", () => {
  it("render strengths and improvements from the canonical presented feedback", () => {
    expect(LEARNING_LOG).toContain("f.strengths.map");
    expect(LEARNING_LOG).toContain("f.improvements.map");
  });

  it("use the honest 'Examiner-style comment' label (same as the feedback screen)", () => {
    expect(LEARNING_LOG).toContain("Examiner-style comment");
    expect(LEARNING_LOG).not.toMatch(/(?<!-style )Examiner comment/);
  });
});

// --- A. Revision follow-up renders on the feedback screen ---------------------

describe("revision feedback follows up prior issues", () => {
  it("the feedback screen renders the follow-up through the tested helper", () => {
    expect(FEEDBACK_RESULT).toContain("revisionIssueFollowUp");
    expect(FEEDBACK_RESULT).toContain("REVISION_ISSUE_STATUS_LABELS");
    expect(FEEDBACK_RESULT).toContain("REVISION_FOLLOWUP_EXPLAINER");
    expect(FEEDBACK_RESULT).toContain("Issues flagged on your original answer");
  });
});

// --- H. Upload controls are distinguishable ------------------------------------

describe("Scan vs Diagram Evidence clarity", () => {
  it("the Scan control states its transcription-only purpose", () => {
    expect(SCAN_ATTACHMENT).toContain("Scan your answer page (optional)");
    expect(SCAN_ATTACHMENT).toContain("doesn't review diagrams");
  });

  it("the revision banner explains Scan's absence honestly", () => {
    expect(SUBMIT).toContain("Photo scan isn&apos;t available when revising");
  });
});

// --- G. Cold-start sample path --------------------------------------------------

describe("cold-start sample feedback path", () => {
  it("the empty dashboard offers the sample walkthrough deep link", () => {
    expect(DASHBOARD).toContain("/submit?sample=1");
  });

  it("the submit page opens the walkthrough from ?sample=1 without grading anything", () => {
    expect(SUBMIT).toContain('params.get("sample") === "1"');
    expect(SUBMIT).toContain("useState(startWithSample)");
  });

  it("the login page states concrete product value", () => {
    expect(LOGIN).toContain("grades your IB Economics practice answers");
  });
});

// --- 14. Raw enum-looking output cannot render in diagram feedback -------------

describe("diagram graph-type humanization", () => {
  it("maps known raw abbreviations to student-readable labels", () => {
    expect(humanizeGraphType("ad-as")).toBe("AD–AS");
    expect(humanizeGraphType("ad-as diagram")).toBe("AD–AS diagram");
    expect(humanizeGraphType("ppc")).toBe("PPC");
    expect(humanizeGraphType("demand and supply")).toBe("demand and supply");
    expect(humanizeGraphType("negative externality of production")).toBe(
      "negative externality of production"
    );
  });

  it("the presenter renders the humanized label, never the raw token", () => {
    const p = presentDiagramEvidence({
      version: 1,
      status: "reviewed_clearly",
      graphTypeObserved: "ad-as",
      relevanceToQuestion: "appears_relevant",
      elements: [],
      consistencyWithAnswer: "supports",
      improvements: [],
    });
    expect(p.graphTypeLine).toBe("Appears to show: AD–AS");
    expect(p.graphTypeLine).not.toContain("ad-as");
  });
});
