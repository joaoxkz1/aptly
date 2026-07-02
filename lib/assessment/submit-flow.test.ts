import { describe, expect, it } from "vitest";
import type { RevisionContext } from "./revisions";
import { resolveSubmitAction, type SubmitAction } from "./submit-flow";
import { enforceRevisionSourceGate, resolveScoringPolicy } from "./policy";

/**
 * Submit-decision regression tests (old-source revision fix).
 *
 * The manual-QA failure: revising a pre-retention Paper 3(b) attempt fired the
 * paid grading route straight from "Grade my answer" instead of presenting the
 * source-material step, producing a marked frame with no source that the model
 * could not honestly satisfy (deterministic schema_validation 502s). These
 * tests pin the required behavior: such a revision ALWAYS opens the source
 * step first — no grade decision (and therefore no OpenAI call and no attempt
 * row) can exist before the student chooses "Grade with this source" or
 * "Continue with feedback only".
 */

const DETECTED = { mode: "detected" } as const;

function revisionCtx(overrides: Partial<RevisionContext> = {}): RevisionContext {
  return {
    parentId: "parent-uuid",
    question: "q",
    practiceQuestionId: null,
    confirmedTotal: null,
    preferredFramework: null,
    storedSource: null,
    needsSourceAgain: false,
    ...overrides,
  };
}

/** The pre-retention Paper 3(b) parent from the bug report (no stored source). */
function oldPaper3bCtx(): RevisionContext {
  return revisionCtx({ preferredFramework: "paper3b_10_mark", needsSourceAgain: true });
}

function oldPaper2gCtx(): RevisionContext {
  return revisionCtx({ preferredFramework: "paper2g_15_mark", needsSourceAgain: true });
}

// Realistic question variants for the SAME source-dependent attempt.
const LABELLED_3B =
  "Paper 3(b): Using information from the text, recommend a policy the government could introduce to reduce fuel poverty. [10]";
const UNLABELLED_10 =
  "Using information from the text and your knowledge of economics, recommend a policy to reduce the natural rate of unemployment. [10 marks]";
const NO_TOTAL =
  "Using information from the text, recommend a policy the government could introduce to reduce fuel poverty.";
const LABELLED_2G =
  "Paper 2(g): Using information from the text and your knowledge of economics, discuss the consequences of the tariff. [15 marks]";

function act(question: string, ctx: RevisionContext | null, practiceLinked = false): SubmitAction {
  return resolveSubmitAction({
    question,
    practiceLinked,
    revisionCtx: ctx,
    totalOverride: DETECTED,
  });
}

describe("old source-less revision — the source step ALWAYS comes first", () => {
  it("Paper 3(b) revision (explicit label) opens the source step, never grades", () => {
    const action = act(LABELLED_3B, oldPaper3bCtx());
    expect(action.kind).toBe("source_step");
    if (action.kind === "source_step") {
      expect(action.sourceFramework).toBe("paper3b_10_mark");
    }
  });

  it("Paper 3(b) revision (ambiguous 10-total question) opens the source step", () => {
    const action = act(UNLABELLED_10, oldPaper3bCtx());
    expect(action.kind).toBe("source_step");
    if (action.kind === "source_step") {
      expect(action.sourceFramework).toBe("paper3b_10_mark");
    }
  });

  it("Paper 3(b) revision opens the source step EVEN when no total is detected (the hole that reached user-confirmed generic grading)", () => {
    const action = act(NO_TOTAL, oldPaper3bCtx());
    expect(action.kind).toBe("source_step");
  });

  it("Paper 2(g) revision behaves identically", () => {
    const action = act(LABELLED_2G, oldPaper2gCtx());
    expect(action.kind).toBe("source_step");
    if (action.kind === "source_step") {
      expect(action.sourceFramework).toBe("paper2g_15_mark");
    }
  });

  it("no grade decision exists before the source choice — so no model call and no attempt row can happen", () => {
    for (const [q, ctx] of [
      [LABELLED_3B, oldPaper3bCtx()],
      [UNLABELLED_10, oldPaper3bCtx()],
      [NO_TOTAL, oldPaper3bCtx()],
      [LABELLED_2G, oldPaper2gCtx()],
    ] as const) {
      expect(act(q, ctx).kind).not.toBe("grade");
    }
  });
});

describe("revision flows that must keep grading directly", () => {
  it("a RETAINED-source revision grades immediately with NO client source (server fetches the stored copy)", () => {
    const ctx = revisionCtx({
      preferredFramework: "paper3b_10_mark",
      storedSource: "In 2024 the tax rose 12% and consumption fell 5%.",
      needsSourceAgain: false,
    });
    const action = act(LABELLED_3B, ctx);
    expect(action.kind).toBe("grade");
    if (action.kind === "grade") {
      expect(action.decision.sourceMaterial).toBeNull(); // server-side source wins
      expect(action.decision.requestedSource).toBe("explicit");
    }
  });

  it("a generated-practice revision keeps the server-side generated-source path", () => {
    const ctx = revisionCtx({ practiceQuestionId: "pq-1" });
    const action = act(LABELLED_2G, ctx, true);
    expect(action.kind).toBe("grade");
    if (action.kind === "grade") {
      // All-null decision: the server's stored practice frame is authoritative.
      expect(action.decision).toEqual({
        requestedSource: null,
        requestedTotal: null,
        templateId: null,
        requestedFramework: null,
        sourceMaterial: null,
      });
    }
  });

  it("a user-confirmed-total revision (non-source framework) still grades directly", () => {
    const ctx = revisionCtx({ confirmedTotal: 8 });
    const action = act("Explain how a subsidy affects consumers.", ctx);
    expect(action.kind).toBe("grade");
    if (action.kind === "grade") {
      expect(action.decision.requestedSource).toBe("user_confirmed");
      expect(action.decision.requestedTotal).toBe(8);
    }
  });

  it("a revision of an ambiguous 10/15 NON-source framework reuses the confirmed preference", () => {
    const ctx = revisionCtx({ preferredFramework: "paper1a_10_mark" });
    const action = act("Explain why indirect taxes reduce consumption of demerit goods. [10]", ctx);
    expect(action.kind).toBe("grade");
    if (action.kind === "grade") {
      expect(action.decision.requestedFramework).toBe("paper1a_10_mark");
    }
  });
});

describe("normal non-revision submits are unchanged", () => {
  it("an explicit non-source question grades immediately", () => {
    const action = act("Explain how a maximum price causes a shortage. [4 marks]", null);
    expect(action.kind).toBe("grade");
  });

  it("a fresh explicit Paper 2(g)/3(b) paste opens the source step", () => {
    const action = act(LABELLED_2G, null);
    expect(action.kind).toBe("source_step");
    if (action.kind === "source_step") {
      expect(action.sourceFramework).toBe("paper2g_15_mark");
    }
  });

  it("an ambiguous 10-total question opens the compact chooser", () => {
    expect(act(UNLABELLED_10, null).kind).toBe("choice");
  });

  it("no total at all opens the compact chooser", () => {
    expect(act("Explain how a subsidy affects consumers.", null).kind).toBe("choice");
  });

  it("an invalid typed custom total is flagged, never graded", () => {
    const action = resolveSubmitAction({
      question: "Explain X. [4 marks]",
      practiceLinked: false,
      revisionCtx: null,
      totalOverride: { mode: "custom", total: "999" },
    });
    expect(action.kind).toBe("invalid_custom_total");
  });
});

describe("enforceRevisionSourceGate — server-authoritative backstop", () => {
  const noChoice = {
    requestedSource: null,
    requestedTotal: null,
    templateId: null,
    requestedFramework: null,
    sourceMaterial: null,
  } as const;
  const USABLE_SOURCE =
    "In 2024 the fictional economy of Norvia raised fuel taxes by 12%, cutting consumption 5% while revenue rose to $2.1bn.";

  it("downgrades a source-less MARKED frame for a Paper 3(b) revision to honest feedback-only", () => {
    // A user-confirmed total resolves to a marked GENERIC frame with no source
    // gate of its own — exactly the impossible frame behind the QA failures.
    const marked = resolveScoringPolicy("Recommend a policy using the text.", {
      ...noChoice,
      requestedSource: "user_confirmed",
      requestedTotal: 10,
    });
    expect(marked.scoringState).toBe("marked");

    const gated = enforceRevisionSourceGate(marked, "paper3b_10_mark", null);
    expect(gated.scoringState).toBe("feedback_only");
    expect(gated.framework).toBe("paper3b_10_mark"); // honest header retained
    expect(gated.sourceMaterialProvided).toBe(false);
    expect(gated.total).toBeNull();
  });

  it("passes through when usable source is supplied (stored or re-pasted)", () => {
    const marked = resolveScoringPolicy(LABELLED_3B, {
      ...noChoice,
      requestedFramework: "paper3b_10_mark",
      sourceMaterial: USABLE_SOURCE,
    });
    expect(marked.scoringState).toBe("marked");
    expect(enforceRevisionSourceGate(marked, "paper3b_10_mark", USABLE_SOURCE)).toBe(marked);
  });

  it("never touches non-revision requests or non-source parents", () => {
    const marked = resolveScoringPolicy("Explain X. [4 marks]", noChoice);
    expect(enforceRevisionSourceGate(marked, null, null)).toBe(marked);
    expect(enforceRevisionSourceGate(marked, "paper1a_10_mark", null)).toBe(marked);
    expect(enforceRevisionSourceGate(marked, "not-a-framework", null)).toBe(marked);
  });

  it("leaves an already feedback-only policy untouched (feedback-only choice still works)", () => {
    const feedbackOnly = resolveScoringPolicy(LABELLED_3B, {
      ...noChoice,
      requestedFramework: "paper3b_10_mark",
      sourceMaterial: null,
    });
    expect(feedbackOnly.scoringState).toBe("feedback_only");
    expect(enforceRevisionSourceGate(feedbackOnly, "paper3b_10_mark", null)).toBe(feedbackOnly);
  });
});
