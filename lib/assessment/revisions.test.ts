import { describe, expect, it } from "vitest";
import type {
  Assessment,
  AssessmentFramework,
  AssessmentMarkBreakdownItem,
  Attempt,
  Feedback,
  MarkTotalSource,
  ScoringState,
  SyllabusTopic,
} from "@/lib/types";
import {
  collapseRevisionChains,
  isRevision,
  revisionComparison,
  revisionContextFor,
} from "./revisions";
import { buildLearningInsights } from "./readiness";

/** Minimal honest feedback object for fixtures. */
function feedback(): Feedback {
  return {
    score: 5,
    band: "internal",
    strengths: ["s"],
    improvements: ["i"],
    mistakes: [],
    examinerComment: "c",
    studyNext: "n",
  };
}

function assessment(o: {
  framework?: AssessmentFramework;
  total?: number | null;
  earned?: number | null;
  scoringState?: ScoringState;
  markTotalSource?: MarkTotalSource;
  syllabusTopic?: SyllabusTopic;
  breakdown?: AssessmentMarkBreakdownItem[];
  sourceMaterialProvided?: boolean;
}): Assessment {
  const total = o.total === undefined ? 10 : o.total;
  const earned = o.earned === undefined ? 6 : o.earned;
  const marked = total != null && earned != null;
  return {
    version: 2,
    assessmentFormat: "custom_extended_response",
    paper: "custom",
    questionPart: "unknown",
    levelRelevance: "shared_sl_hl",
    assessmentSkills: ["economic_analysis"],
    commandTerm: "explain",
    commandTermLabel: "Explain",
    syllabusUnit: "unit_2",
    syllabusTopic: o.syllabusTopic ?? "2.6",
    topicLabel: "Market failure",
    classificationConfidence: "high",
    markingConfidence: "high",
    marksAvailable: total,
    marksAssessable: marked ? total : null,
    marksEarned: earned,
    unassessedMarks: marked ? 0 : null,
    marksSource: marked ? "explicit_in_question" : "not_reliably_known",
    markDisplayMode: marked ? "exact_estimate" : "practice_feedback_only",
    evidenceSplitSource: "not_specified",
    unassessedEvidence: null,
    practiceLevelLow: 4,
    practiceLevelHigh: 5,
    practiceLevelConfidence: "medium",
    diagramExpected: false,
    diagramSubmitted: false,
    diagramAssessmentStatus: "not_relevant",
    workingsExpected: false,
    workingsSubmitted: false,
    workingsAssessmentStatus: "not_relevant",
    attachmentContent: "none",
    markBreakdown:
      o.breakdown ??
      (marked
        ? [{ label: "Economic analysis", awarded: earned!, available: total!, reason: "x" }]
        : []),
    limitations: [],
    scoringState: o.scoringState ?? (marked ? "marked" : "feedback_only"),
    markTotalSource: o.markTotalSource ?? "explicit",
    recognizedTemplate: null,
    diagramAssessable: false,
    writtenMarksAwarded: earned,
    diagramMarksUnavailable: null,
    capReason: null,
    eligibleForCoreAnalytics: (o.scoringState ?? (marked ? "marked" : "feedback_only")) === "marked",
    framework: o.framework ?? "paper1a_10_mark",
    sourceMaterialProvided: o.sourceMaterialProvided,
  };
}

function attempt(o: {
  id: string;
  createdAt?: string;
  parentAttemptId?: string | null;
  practiceQuestionId?: string | null;
  question?: string;
  assessment?: Assessment | null;
  sourceMaterial?: string | null;
}): Attempt {
  return {
    id: o.id,
    createdAt: o.createdAt ?? "2026-06-01T10:00:00.000Z",
    subject: "Economics",
    topic: "Economics",
    question: o.question ?? "Explain how a price ceiling causes a shortage. [10 marks]",
    answer: "A full answer.",
    feedback: feedback(),
    assessment: o.assessment === undefined ? assessment({}) : o.assessment,
    parentAttemptId: o.parentAttemptId ?? null,
    practiceQuestionId: o.practiceQuestionId ?? null,
    sourceMaterial: o.sourceMaterial ?? null,
  };
}

const RETAINED_SOURCE =
  "In 2024 Norvia raised fuel taxes by 12%, cutting consumption 5% while revenue rose to $2.1bn.";

describe("collapseRevisionChains — only the latest eligible attempt in a chain counts", () => {
  it("keeps a lone attempt unchanged", () => {
    const a = attempt({ id: "a" });
    expect(collapseRevisionChains([a]).map((x) => x.id)).toEqual(["a"]);
  });

  it("collapses original + revision to the latest eligible attempt", () => {
    const a = attempt({ id: "a", createdAt: "2026-06-01T10:00:00.000Z" });
    const b = attempt({ id: "b", createdAt: "2026-06-02T10:00:00.000Z", parentAttemptId: "a" });
    expect(collapseRevisionChains([b, a]).map((x) => x.id)).toEqual(["b"]);
  });

  it("collapses a chain of repeated revisions to exactly one attempt", () => {
    const a = attempt({ id: "a", createdAt: "2026-06-01T10:00:00.000Z" });
    const b = attempt({ id: "b", createdAt: "2026-06-02T10:00:00.000Z", parentAttemptId: "a" });
    const c = attempt({ id: "c", createdAt: "2026-06-03T10:00:00.000Z", parentAttemptId: "b" });
    expect(collapseRevisionChains([c, b, a]).map((x) => x.id)).toEqual(["c"]);
  });

  it("groups sibling revisions of the same original into one chain", () => {
    const a = attempt({ id: "a", createdAt: "2026-06-01T10:00:00.000Z" });
    const b = attempt({ id: "b", createdAt: "2026-06-02T10:00:00.000Z", parentAttemptId: "a" });
    const c = attempt({ id: "c", createdAt: "2026-06-03T10:00:00.000Z", parentAttemptId: "a" });
    expect(collapseRevisionChains([c, b, a]).map((x) => x.id)).toEqual(["c"]);
  });

  it("a non-eligible revision never displaces the eligible original", () => {
    const a = attempt({ id: "a", createdAt: "2026-06-01T10:00:00.000Z" });
    const b = attempt({
      id: "b",
      createdAt: "2026-06-02T10:00:00.000Z",
      parentAttemptId: "a",
      assessment: assessment({ total: null, earned: null, scoringState: "feedback_only" }),
    });
    expect(collapseRevisionChains([b, a]).map((x) => x.id)).toEqual(["a"]);
  });

  it("a revision whose original was deleted still counts once (dangling link)", () => {
    const b = attempt({ id: "b", createdAt: "2026-06-02T10:00:00.000Z", parentAttemptId: "gone" });
    const c = attempt({ id: "c", createdAt: "2026-06-03T10:00:00.000Z", parentAttemptId: "gone" });
    expect(collapseRevisionChains([c, b]).map((x) => x.id)).toEqual(["c"]);
  });

  it("independent questions are never grouped together", () => {
    const a = attempt({ id: "a", createdAt: "2026-06-01T10:00:00.000Z" });
    const b = attempt({ id: "b", createdAt: "2026-06-02T10:00:00.000Z" });
    expect(collapseRevisionChains([b, a]).map((x) => x.id)).toEqual(["b", "a"]);
  });

  it("is idempotent", () => {
    const a = attempt({ id: "a", createdAt: "2026-06-01T10:00:00.000Z" });
    const b = attempt({ id: "b", createdAt: "2026-06-02T10:00:00.000Z", parentAttemptId: "a" });
    const once = collapseRevisionChains([b, a]);
    expect(collapseRevisionChains(once)).toEqual(once);
  });

  it("survives corrupt cyclic parent links without hanging", () => {
    const a = attempt({ id: "a", createdAt: "2026-06-01T10:00:00.000Z", parentAttemptId: "b" });
    const b = attempt({ id: "b", createdAt: "2026-06-02T10:00:00.000Z", parentAttemptId: "a" });
    expect(collapseRevisionChains([b, a]).length).toBe(1);
  });
});

describe("revision chains — core analytics evidence never inflates", () => {
  it("repeated revisions of one question contribute exactly one marked answer", () => {
    const a = attempt({ id: "a", createdAt: "2026-06-01T10:00:00.000Z" });
    const b = attempt({ id: "b", createdAt: "2026-06-02T10:00:00.000Z", parentAttemptId: "a" });
    const c = attempt({ id: "c", createdAt: "2026-06-03T10:00:00.000Z", parentAttemptId: "b" });
    const insights = buildLearningInsights([c, b, a]);
    expect(insights.markedCount).toBe(1);
    expect(insights.validCount).toBe(1);
    // Every attempt stays visible in the total count (Learning log honesty).
    expect(insights.totalAttempts).toBe(3);
    // Topic performance counts the chain once.
    const topicRow = insights.topicPerformance.find((t) => t.topicCode === "2.6");
    expect(topicRow?.responses).toBe(1);
  });

  it("uses the LATEST revision's marks, not the original's", () => {
    const a = attempt({
      id: "a",
      createdAt: "2026-06-01T10:00:00.000Z",
      assessment: assessment({ earned: 2 }),
    });
    const b = attempt({
      id: "b",
      createdAt: "2026-06-02T10:00:00.000Z",
      parentAttemptId: "a",
      assessment: assessment({ earned: 9 }),
    });
    const insights = buildLearningInsights([b, a]);
    const row = insights.topicPerformance.find((t) => t.topicCode === "2.6");
    expect(row?.earned).toBe(9);
    expect(row?.available).toBe(10);
  });
});

describe("revisionComparison — restrained, honest, only when truly comparable", () => {
  const parent = attempt({ id: "a", assessment: assessment({ earned: 8, total: 10 }) });

  it("compares two marked attempts with matching totals and framework", () => {
    const revision = attempt({
      id: "b",
      parentAttemptId: "a",
      assessment: assessment({ earned: 9, total: 10 }),
    });
    expect(revisionComparison(parent, revision)).toEqual({
      previousFraction: "8 / 10",
      revisionFraction: "9 / 10",
      deltaMarks: 1,
      deltaLabel: "+1 mark",
    });
  });

  it("labels a drop and no-change honestly", () => {
    const worse = attempt({
      id: "b",
      parentAttemptId: "a",
      assessment: assessment({ earned: 6, total: 10 }),
    });
    expect(revisionComparison(parent, worse)?.deltaLabel).toBe("−2 marks");
    const same = attempt({
      id: "c",
      parentAttemptId: "a",
      assessment: assessment({ earned: 8, total: 10 }),
    });
    expect(revisionComparison(parent, same)?.deltaLabel).toBe("no change");
  });

  it("never compares when totals differ", () => {
    const revision = attempt({
      id: "b",
      parentAttemptId: "a",
      assessment: assessment({ earned: 9, total: 15, framework: "paper1b_15_mark" }),
    });
    expect(revisionComparison(parent, revision)).toBeNull();
  });

  it("never compares across incompatible frameworks", () => {
    const revision = attempt({
      id: "b",
      parentAttemptId: "a",
      assessment: assessment({ earned: 9, total: 10, framework: "generic_practice" }),
    });
    expect(revisionComparison(parent, revision)).toBeNull();
  });

  it("never compares provisional or feedback-only attempts numerically", () => {
    const provisional = attempt({
      id: "b",
      parentAttemptId: "a",
      assessment: assessment({ earned: 9, total: 10, scoringState: "provisional" }),
    });
    expect(revisionComparison(parent, provisional)).toBeNull();

    const feedbackOnly = attempt({
      id: "c",
      parentAttemptId: "a",
      assessment: assessment({ total: null, earned: null, scoringState: "feedback_only" }),
    });
    expect(revisionComparison(parent, feedbackOnly)).toBeNull();
    expect(revisionComparison(feedbackOnly, parent)).toBeNull();
  });

  it("never compares legacy attempts (no assessment)", () => {
    const legacy = attempt({ id: "b", parentAttemptId: "a", assessment: null });
    expect(revisionComparison(parent, legacy)).toBeNull();
  });
});

describe("revisionContextFor — trusted context only, never the old answer", () => {
  it("preserves the original question and starts with no answer field at all", () => {
    const parent = attempt({ id: "a", question: "Explain X. [10 marks]" });
    const ctx = revisionContextFor(parent);
    expect(ctx.parentId).toBe("a");
    expect(ctx.question).toBe("Explain X. [10 marks]");
    expect(Object.keys(ctx)).not.toContain("answer");
  });

  it("carries a previously USER-CONFIRMED total (not re-detectable from text)", () => {
    const parent = attempt({
      id: "a",
      assessment: assessment({ markTotalSource: "user_confirmed", framework: "generic_practice" }),
    });
    expect(revisionContextFor(parent).confirmedTotal).toBe(10);
  });

  it("does not carry a total for explicit-in-text attempts (server re-detects)", () => {
    const parent = attempt({ id: "a", assessment: assessment({ markTotalSource: "explicit" }) });
    expect(revisionContextFor(parent).confirmedTotal).toBeNull();
  });

  it("carries a safely established paper framework as a preference", () => {
    const parent = attempt({ id: "a", assessment: assessment({ framework: "paper1b_15_mark", total: 15, earned: 10 }) });
    expect(revisionContextFor(parent).preferredFramework).toBe("paper1b_15_mark");
  });

  it("requires the source again ONLY for a pre-patch original with no retained source", () => {
    const parent = attempt({
      id: "a",
      assessment: assessment({
        framework: "paper2g_15_mark",
        total: 15,
        earned: 10,
        sourceMaterialProvided: true,
      }),
    });
    // Old attempt: no privately retained copy → one-time paste flow.
    const ctx = revisionContextFor(parent);
    expect(ctx.needsSourceAgain).toBe(true);
    expect(ctx.storedSource).toBeNull();
  });

  it("reuses the parent's privately RETAINED manual source — no re-paste", () => {
    const parent = attempt({
      id: "a",
      sourceMaterial: RETAINED_SOURCE,
      assessment: assessment({
        framework: "paper3b_10_mark",
        total: 10,
        earned: 5,
        sourceMaterialProvided: true,
      }),
    });
    const ctx = revisionContextFor(parent);
    expect(ctx.storedSource).toBe(RETAINED_SOURCE);
    expect(ctx.needsSourceAgain).toBe(false);
  });

  it("a revision that re-pasted source retains it for LATER revisions", () => {
    // The old source-less original was revised once with a fresh paste; that
    // revision stored the source on its own row, so revising the REVISION
    // reuses it without another paste.
    const firstRevision = attempt({
      id: "b",
      parentAttemptId: "a",
      sourceMaterial: RETAINED_SOURCE,
      assessment: assessment({
        framework: "paper3b_10_mark",
        total: 10,
        earned: 7,
        sourceMaterialProvided: true,
      }),
    });
    const ctx = revisionContextFor(firstRevision);
    expect(ctx.storedSource).toBe(RETAINED_SOURCE);
    expect(ctx.needsSourceAgain).toBe(false);
  });

  it("ignores whitespace-only retained source (fail-safe to the paste flow)", () => {
    const parent = attempt({
      id: "a",
      sourceMaterial: "   ",
      assessment: assessment({
        framework: "paper2g_15_mark",
        total: 15,
        earned: 10,
        sourceMaterialProvided: true,
      }),
    });
    const ctx = revisionContextFor(parent);
    expect(ctx.storedSource).toBeNull();
    expect(ctx.needsSourceAgain).toBe(true);
  });

  it("never exposes a stored source for a non-source framework", () => {
    const parent = attempt({
      id: "a",
      sourceMaterial: RETAINED_SOURCE, // corrupt/unexpected data
      assessment: assessment({ framework: "paper1a_10_mark" }),
    });
    const ctx = revisionContextFor(parent);
    expect(ctx.storedSource).toBeNull();
    expect(ctx.needsSourceAgain).toBe(false);
  });

  it("does NOT require a re-paste when the source is Aptly-generated (stored)", () => {
    const parent = attempt({
      id: "a",
      practiceQuestionId: "pq-1",
      assessment: assessment({
        framework: "paper2g_15_mark",
        total: 15,
        earned: 10,
        sourceMaterialProvided: true,
      }),
    });
    const ctx = revisionContextFor(parent);
    expect(ctx.needsSourceAgain).toBe(false);
    expect(ctx.practiceQuestionId).toBe("pq-1");
  });

  it("flags revisions via isRevision", () => {
    expect(isRevision(attempt({ id: "a" }))).toBe(false);
    expect(isRevision(attempt({ id: "b", parentAttemptId: "a" }))).toBe(true);
  });

  it("a revision stays gradeable/referenceable after its parent attempt is deleted", () => {
    // The parent is gone (its DB row deleted; the FK nulls the link on other
    // rows, but a stale client id may still dangle mid-session). Revising the
    // REVISION must still carry the generated-practice link so grading and
    // the reference panel retrieve the stored question + source — no re-paste.
    const revision = attempt({
      id: "b",
      parentAttemptId: "deleted-parent",
      practiceQuestionId: "pq-1",
      assessment: assessment({
        framework: "paper2g_15_mark",
        total: 15,
        earned: 10,
        sourceMaterialProvided: true,
      }),
    });
    const ctx = revisionContextFor(revision);
    expect(ctx.practiceQuestionId).toBe("pq-1");
    expect(ctx.needsSourceAgain).toBe(false);
    expect(ctx.question).toBe(revision.question);
  });
});
