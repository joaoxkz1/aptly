import { describe, it, expect } from "vitest";
import { resolveScoringPolicy, type PreflightChoice } from "./policy";

function choice(overrides: Partial<PreflightChoice> = {}): PreflightChoice {
  return {
    requestedSource: null,
    requestedTotal: null,
    templateId: null,
    requestedFramework: null,
    sourceMaterial: null,
    ...overrides,
  };
}

// A Paper 2(g)/3(b) response needs supplied source text/data for a mark.
const SOURCE = "Extract: unemployment rose to 9% while inflation stayed near 3% last year.";

const NO_CHOICE = choice();

describe("resolveScoringPolicy — total source & state", () => {
  it("explicit total in text => marked, full assessable", () => {
    const p = resolveScoringPolicy("Evaluate ... [15 marks]", NO_CHOICE);
    expect(p.scoringState).toBe("marked");
    expect(p.markTotalSource).toBe("explicit");
    expect(p.total).toBe(15);
    expect(p.assessable).toBe(15);
    expect(p.cappedDiagramMarks).toBe(0);
  });

  it("user-confirmed total => marked", () => {
    const p = resolveScoringPolicy(
      "Evaluate the impact of tariffs.",
      choice({ requestedSource: "user_confirmed", requestedTotal: 15 })
    );
    expect(p.scoringState).toBe("marked");
    expect(p.markTotalSource).toBe("user_confirmed");
    expect(p.total).toBe(15);
  });

  it("accepted inference => provisional, never core (requires Paper 1 context)", () => {
    const p = resolveScoringPolicy(
      "Paper 1, Part (b): Evaluate the impact of tariffs.",
      choice({ requestedSource: "template_inferred" })
    );
    expect(p.scoringState).toBe("provisional");
    expect(p.markTotalSource).toBe("template_inferred");
    expect(p.total).toBe(15);
  });

  it("a bare Part (b) with no Paper 1 context can never be provisionally marked as Paper 1", () => {
    const p = resolveScoringPolicy(
      "Part (b): Evaluate the impact of tariffs.",
      choice({ requestedSource: "template_inferred" })
    );
    expect(p.scoringState).toBe("feedback_only");
  });

  it("unknown / feedback-only => feedback_only, no denominator", () => {
    expect(resolveScoringPolicy("Explain something vague.", NO_CHOICE).scoringState).toBe("feedback_only");
    const fb = resolveScoringPolicy("Explain something vague.", choice({ requestedSource: "feedback_only" }));
    expect(fb.scoringState).toBe("feedback_only");
    expect(fb.total).toBeNull();
    expect(fb.assessable).toBeNull();
  });

  it("rejects an out-of-range user total => feedback_only", () => {
    const p = resolveScoringPolicy(
      "Explain something vague.",
      choice({ requestedSource: "user_confirmed", requestedTotal: 999 })
    );
    expect(p.scoringState).toBe("feedback_only");
  });
});

describe("resolveScoringPolicy — multi-total questions & conscious overrides", () => {
  const MULTI = "(a) Define subsidy. [2 marks] (b) Explain the market effect. [4 marks]";

  it("a multi-total question is NEVER marked from the first regex hit", () => {
    expect(resolveScoringPolicy(MULTI, NO_CHOICE).scoringState).toBe("feedback_only");
    // Even a (stale/hostile) client claiming "explicit" cannot force a mark.
    const claimed = resolveScoringPolicy(MULTI, choice({ requestedSource: "explicit", requestedTotal: 2 }));
    expect(claimed.scoringState).toBe("feedback_only");
    expect(claimed.total).toBeNull();
  });

  it("a consciously chosen total on a multi-total question => marked, user_confirmed, generic", () => {
    const p = resolveScoringPolicy(MULTI, choice({ requestedSource: "user_confirmed", requestedTotal: 4 }));
    expect(p.scoringState).toBe("marked");
    expect(p.markTotalSource).toBe("user_confirmed");
    expect(p.total).toBe(4);
    expect(p.framework).toBe("generic_practice");
  });

  it("feedback-only on a multi-total question => feedback_only", () => {
    const p = resolveScoringPolicy(MULTI, choice({ requestedSource: "feedback_only" }));
    expect(p.scoringState).toBe("feedback_only");
    expect(p.total).toBeNull();
  });

  it("a conscious feedback-only choice is honored even with a single explicit total", () => {
    const p = resolveScoringPolicy(
      "Evaluate the use of tariffs. [15 marks]",
      choice({ requestedSource: "feedback_only" })
    );
    expect(p.scoringState).toBe("feedback_only");
    expect(p.total).toBeNull();
  });

  it("a conscious user-confirmed total overrides the detected explicit total", () => {
    const p = resolveScoringPolicy(
      "Evaluate the use of tariffs. [15 marks]",
      choice({ requestedSource: "user_confirmed", requestedTotal: 10 })
    );
    expect(p.scoringState).toBe("marked");
    expect(p.markTotalSource).toBe("user_confirmed");
    expect(p.total).toBe(10);
    expect(p.framework).toBe("generic_practice"); // never a paper claim
  });
});

describe("resolveScoringPolicy — diagram cap behaviour", () => {
  const diagramQ = "Using a demand and supply diagram, explain the effect of a subsidy on the market for buses.";

  it("explicit 4-mark diagram question => marked, capped 2/4", () => {
    const p = resolveScoringPolicy(`${diagramQ} [4 marks]`, NO_CHOICE);
    expect(p.scoringState).toBe("marked");
    expect(p.framework).toBe("paper2_four_mark_diagram_explain");
    expect(p.total).toBe(4);
    expect(p.assessable).toBe(2);
    expect(p.cappedDiagramMarks).toBe(2);
    expect(p.recognizedTemplate).toBe("four_mark_diagram_explain");
    expect(p.capReason).toBeTruthy();
  });

  it("inferred 4-mark diagram question => provisional, capped assessable 2", () => {
    const p = resolveScoringPolicy(
      diagramQ,
      choice({ requestedSource: "template_inferred", templateId: "four_mark_diagram_explain" })
    );
    expect(p.scoringState).toBe("provisional");
    expect(p.framework).toBe("paper2_four_mark_diagram_explain");
    expect(p.total).toBe(4);
    expect(p.assessable).toBe(2);
    expect(p.cappedDiagramMarks).toBe(2);
  });

  it("NEVER caps an extended response for a missing diagram", () => {
    const p = resolveScoringPolicy("Evaluate the effect of a subsidy on the bus market. [15 marks]", NO_CHOICE);
    expect(p.assessable).toBe(15);
    expect(p.cappedDiagramMarks).toBe(0);
    expect(p.recognizedTemplate).toBeNull();
  });

  it("does not apply the template cap when the user overrides the total", () => {
    const p = resolveScoringPolicy(
      diagramQ,
      choice({ requestedSource: "user_confirmed", requestedTotal: 6, templateId: "four_mark_diagram_explain" })
    );
    expect(p.scoringState).toBe("marked");
    expect(p.total).toBe(6);
    expect(p.assessable).toBe(6);
    expect(p.cappedDiagramMarks).toBe(0);
  });
});

describe("resolveScoringPolicy — marking framework", () => {
  it("explicit Paper 1(a) => paper1a_10_mark best-fit", () => {
    const p = resolveScoringPolicy("Paper 1(a): Explain how a subsidy affects the market. [10 marks]", NO_CHOICE);
    expect(p.framework).toBe("paper1a_10_mark");
    expect(p.bestFit).toBe(true);
    expect(p.total).toBe(10);
    expect(p.assessable).toBe(10);
  });

  it("explicit Paper 3(b) with source => paper3b_10_mark, NOT Paper 1(a)", () => {
    const p = resolveScoringPolicy(
      "Paper 3(b): Recommend a policy using the data. [10 marks]",
      choice({ sourceMaterial: SOURCE })
    );
    expect(p.framework).toBe("paper3b_10_mark");
    expect(p.framework).not.toBe("paper1a_10_mark");
    expect(p.bestFit).toBe(true);
  });

  it("explicit Paper 1(b) => paper1b_15_mark best-fit", () => {
    const p = resolveScoringPolicy("Paper 1(b): Evaluate the use of tariffs. [15 marks]", NO_CHOICE);
    expect(p.framework).toBe("paper1b_15_mark");
    expect(p.bestFit).toBe(true);
    expect(p.total).toBe(15);
  });

  it("a bare [15] is NEVER silently labelled Paper 1(b) — defaults to generic", () => {
    const p = resolveScoringPolicy("Discuss whether tariffs improve welfare. [15 marks]", NO_CHOICE);
    expect(p.framework).toBe("generic_practice");
    expect(p.bestFit).toBe(false);
    expect(p.scoringState).toBe("marked"); // explicit total is still marked
  });

  it("only labels Paper 2(g) when the student confirms it", () => {
    const q = "Discuss the extract's argument about subsidies. [15 marks]";
    expect(resolveScoringPolicy(q, NO_CHOICE).framework).toBe("generic_practice");
    const confirmed = resolveScoringPolicy(q, choice({ requestedFramework: "paper2g_15_mark" }));
    expect(confirmed.framework).toBe("paper2g_15_mark");
  });

  it("a user-confirmed raw total stays generic (no paper claimed)", () => {
    const p = resolveScoringPolicy(
      "Evaluate the impact of tariffs.",
      choice({ requestedSource: "user_confirmed", requestedTotal: 15, requestedFramework: "paper1b_15_mark" })
    );
    expect(p.framework).toBe("generic_practice");
  });

  it("a recognised 2-mark short response uses the analytic framework", () => {
    const p = resolveScoringPolicy("Define price elasticity of demand. [2 marks]", NO_CHOICE);
    expect(p.framework).toBe("paper2_short_analytic");
    expect(p.total).toBe(2);
    expect(p.assessable).toBe(2);
    expect(p.bestFit).toBe(false);
  });
});

describe("resolveScoringPolicy — framework registry behaviour", () => {
  it("explicit Paper 2(a): analytic definition marking, no bands, no source gate", () => {
    const p = resolveScoringPolicy("Paper 2(a): Define price elasticity of demand. [2 marks]", NO_CHOICE);
    expect(p.scoringState).toBe("marked");
    expect(p.framework).toBe("paper2a_definition");
    expect(p.markingMethod).toBe("analytic");
    expect(p.bestFit).toBe(false);
    expect(p.total).toBe(2);
    expect(p.assessable).toBe(2);
    expect(p.cappedDiagramMarks).toBe(0);
  });

  it("explicit Paper 2(b): question-specific analytic, never a 2+2 split", () => {
    const p = resolveScoringPolicy(
      "Paper 2(b): Calculate the new equilibrium price after the tax. [4 marks]",
      NO_CHOICE
    );
    expect(p.framework).toBe("paper2b_quantitative");
    expect(p.markingMethod).toBe("analytic");
    expect(p.assessable).toBe(4);
    expect(p.cappedDiagramMarks).toBe(0);
    expect(p.recognizedTemplate).toBeNull();
  });

  it("explicit Paper 3(a) 4-mark diagram-explain NEVER inherits the Paper 2 2+2 template", () => {
    const p = resolveScoringPolicy(
      "Paper 3(a): Using a demand and supply diagram, explain the effect of the subsidy on the market. [4 marks]",
      NO_CHOICE
    );
    expect(p.framework).toBe("paper3a_analytic");
    expect(p.markingMethod).toBe("analytic");
    expect(p.assessable).toBe(4); // fully assessable — no universal diagram cap
    expect(p.cappedDiagramMarks).toBe(0);
    expect(p.recognizedTemplate).toBeNull();
    expect(p.bestFit).toBe(false);
  });

  it("a generic 4-marker with no diagram structure gets NO universal 2+2 cap", () => {
    const p = resolveScoringPolicy("Explain two reasons why demand for oil is inelastic. [4 marks]", NO_CHOICE);
    expect(p.framework).toBe("generic_practice");
    expect(p.assessable).toBe(4);
    expect(p.cappedDiagramMarks).toBe(0);
    expect(p.recognizedTemplate).toBeNull();
  });

  it("best-fit is exactly the 10/15-mark paper frameworks", () => {
    expect(resolveScoringPolicy("Paper 1(a): Explain X. [10 marks]", NO_CHOICE).markingMethod).toBe("best_fit");
    expect(resolveScoringPolicy("Paper 1(b): Evaluate X. [15 marks]", NO_CHOICE).markingMethod).toBe("best_fit");
    expect(resolveScoringPolicy("Discuss X. [15 marks]", NO_CHOICE).markingMethod).toBe("holistic_practice");
  });

  it("rejects a bare source reference as source material (Paper 2(g))", () => {
    const p = resolveScoringPolicy(
      "Paper 2(g): Discuss the extract. [15 marks]",
      choice({ sourceMaterial: "using the data provided" })
    );
    expect(p.scoringState).toBe("feedback_only");
    expect(p.sourceMaterialProvided).toBe(false);
  });
});

describe("regression — multi-part subsidy question, student selects 4, no diagram", () => {
  const MULTI_SUBSIDY = [
    "(a) Define a subsidy. [2 marks]",
    "",
    "(b) Using a demand and supply diagram, explain how a subsidy paid to producers affects the equilibrium price and quantity. [4 marks]",
  ].join("\n");

  const p = resolveScoringPolicy(
    MULTI_SUBSIDY,
    choice({ requestedSource: "user_confirmed", requestedTotal: 4 })
  );

  it("keeps the generic-practice label — never a Paper 2 claim", () => {
    expect(p.framework).toBe("generic_practice");
    expect(p.bestFit).toBe(false);
  });

  it("retains the recognised 4-mark diagram-explain component policy", () => {
    expect(p.scoringState).toBe("marked");
    expect(p.markTotalSource).toBe("user_confirmed");
    expect(p.markingMethod).toBe("template_component");
    expect(p.recognizedTemplate).toBe("four_mark_diagram_explain");
    expect(p.total).toBe(4);
    expect(p.assessable).toBe(2); // written explanation only
    expect(p.cappedDiagramMarks).toBe(2); // diagram 0/2, Not submitted
    expect(p.capReason).toBeTruthy();
  });

  it("marks against the SELECTED part (b), not the whole multi-part paste", () => {
    expect(p.selectedQuestionPart).toContain("demand and supply diagram");
    expect(p.selectedQuestionPart).not.toContain("Define a subsidy");
  });

  it("selecting the 2-mark part instead applies NO diagram template", () => {
    const two = resolveScoringPolicy(
      MULTI_SUBSIDY,
      choice({ requestedSource: "user_confirmed", requestedTotal: 2 })
    );
    expect(two.total).toBe(2);
    expect(two.assessable).toBe(2);
    expect(two.recognizedTemplate).toBeNull();
    expect(two.selectedQuestionPart).toContain("Define a subsidy");
  });

  it("with no conscious choice the multi-part paste is never marked", () => {
    expect(resolveScoringPolicy(MULTI_SUBSIDY, NO_CHOICE).scoringState).toBe("feedback_only");
  });
});

describe("coffee-substitute diagram question (required QA)", () => {
  const coffee =
    "Using a demand and supply diagram, explain the effect of a fall in the price of tea, a substitute, on the market for coffee.";

  it("WITHOUT [4 marks]: inferred → provisional, framework diagram-explain, capped 2/4", () => {
    const p = resolveScoringPolicy(coffee, choice({ requestedSource: "template_inferred" }));
    expect(p.scoringState).toBe("provisional");
    expect(p.framework).toBe("paper2_four_mark_diagram_explain");
    expect(p.total).toBe(4);
    expect(p.assessable).toBe(2);
    expect(p.cappedDiagramMarks).toBe(2);
  });

  it("WITH [4 marks]: explicit → marked, framework diagram-explain, capped 2/4", () => {
    const p = resolveScoringPolicy(`${coffee} [4 marks]`, NO_CHOICE);
    expect(p.scoringState).toBe("marked");
    expect(p.framework).toBe("paper2_four_mark_diagram_explain");
    expect(p.total).toBe(4);
    expect(p.assessable).toBe(2);
    expect(p.cappedDiagramMarks).toBe(2);
    expect(p.capReason).toBeTruthy();
  });
});
