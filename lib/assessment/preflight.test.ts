import { describe, it, expect } from "vitest";
import {
  detectExplicitFramework,
  detectExplicitMarkTotal,
  detectExplicitMarkTotals,
  detectMarkTotals,
  detectPaper1Part,
  frameworkOptionsForTotal,
  runPreflight,
} from "./preflight";

describe("detectExplicitMarkTotal — full copied-format grammar", () => {
  const cases: [string, number][] = [
    // Bracketed with a mark word (all bracket types, singular + plural).
    ["Explain the effect of a subsidy. [4 marks]", 4],
    ["Explain the effect of a subsidy. (4 marks)", 4],
    ["Explain the effect of a subsidy. {4 marks}", 4],
    ["Explain the effect of a subsidy. [4 mark]", 4],
    ["Explain the effect of a subsidy. (4 mark)", 4],
    ["Explain the effect of a subsidy. (10 marks)", 10],
    // Bare brackets at the end of a question (high-confidence position).
    ["Explain the effect of a subsidy. [4]", 4],
    ["Explain the effect of a subsidy. (4)", 4],
    ["Explain the effect of a subsidy. {4}", 4],
    // Full-width bracket variants from copied PDFs.
    ["Explain the effect of a subsidy.（4）", 4],
    ["Explain the effect of a subsidy.［4］", 4],
    ["Explain the effect of a subsidy.（4 marks）", 4],
    // Worded prose cues.
    ["Explain the effect of a subsidy 15 marks", 15],
    ["Explain the effect of a subsidy for 4 mark", 4],
    ["This is a 4-marker on elasticity", 4],
    ["This is a 4 marker on elasticity", 4],
    ["Answer the following out of 6", 6],
    ["Respond to a maximum of 8 marks", 8],
    ["Respond to a maximum 8 marks task", 8],
    ["This question is worth 4 marks", 4],
  ];
  it.each(cases)("recognises %j", (question, expected) => {
    expect(detectExplicitMarkTotal(question)?.marks).toBe(expected);
  });

  it("ignores ordinary numbers with no mark cue", () => {
    expect(detectExplicitMarkTotal("In 2008 the economy shrank by 3 percent.")).toBeNull();
    expect(detectExplicitMarkTotal("Explain how demand for 5 goods changes.")).toBeNull();
  });

  it("rejects invalid totals outside 1–60", () => {
    expect(detectExplicitMarkTotal("worth 99 marks")).toBeNull();
    expect(detectExplicitMarkTotal("worth 0 marks")).toBeNull();
    expect(detectExplicitMarkTotal("Explain the effect. [61 marks]")).toBeNull();
  });

  it("no total at all → null", () => {
    expect(detectExplicitMarkTotal("Explain how a subsidy affects the market.")).toBeNull();
  });
});

describe("detectMarkTotals — bare-bracket confidence (citation safety)", () => {
  it("a bare bracket embedded in prose is a LOW-confidence candidate → uncertain", () => {
    const d = detectMarkTotals("As argued in source (3), demand rose sharply. Explain why demand rose.");
    expect(d.kind).toBe("uncertain");
    expect(d.single).toBeNull();
    expect(d.candidates.map((c) => c.marks)).toEqual([3]);
  });

  it("a prose citation never overrides a distinct worded total", () => {
    const d = detectMarkTotals(
      "As argued in source (3), demand rose sharply. Explain why demand rose. [12 marks]"
    );
    expect(d.kind).toBe("single");
    expect(d.single?.marks).toBe(12);
  });

  it("a bare bracket at the end of a question line is high confidence", () => {
    const d = detectMarkTotals("Explain how a subsidy affects equilibrium price. (4)");
    expect(d.kind).toBe("single");
    expect(d.single?.marks).toBe(4);
  });
});

describe("detectExplicitMarkTotals — multi-part safety", () => {
  it("returns a single entry for one explicit total", () => {
    const totals = detectExplicitMarkTotals("Explain the effect of a subsidy. [4 marks]");
    expect(totals).toHaveLength(1);
    expect(totals[0].marks).toBe(4);
    expect(totals[0].matchedText).toBe("[4 marks]");
  });

  it("collapses repeated mentions of the SAME total to one entry", () => {
    const totals = detectExplicitMarkTotals(
      "This 4-marker asks you to explain the effect of a subsidy. [4 marks]"
    );
    expect(totals).toHaveLength(1);
    expect(totals[0].marks).toBe(4);
  });

  it("returns each distinct total, in order, for a multi-part paste", () => {
    const totals = detectExplicitMarkTotals(
      "(a) Define subsidy. [2 marks] (b) Explain the market effect. [4 marks]"
    );
    expect(totals.map((t) => t.marks)).toEqual([2, 4]);
    expect(totals[0].matchedText).toBe("[2 marks]");
    expect(totals[1].matchedText).toBe("[4 marks]");
  });

  it("detects prose allocations as multiple distinct totals", () => {
    const totals = detectExplicitMarkTotals(
      "The diagram carries 4 marks and the explanation carries 6 marks."
    );
    expect(totals.map((t) => t.marks)).toEqual([4, 6]);
  });

  it("overlapping patterns on the same wording do not create a false multiple", () => {
    // "maximum of 8 marks" matches both the "maximum of N marks" and the
    // generic "N marks" pattern — same value, one entry.
    const totals = detectExplicitMarkTotals("Respond to a maximum of 8 marks.");
    expect(totals).toHaveLength(1);
    expect(totals[0].marks).toBe(8);
  });
});

describe("runPreflight — multiple distinct explicit totals", () => {
  const MULTI = "(a) Define subsidy. [2 marks] (b) Explain the market effect. [4 marks]";

  it("never silently picks the first total — reports the ambiguity instead", () => {
    const pf = runPreflight(MULTI);
    expect(pf.kind).toBe("multiple_explicit");
    expect(pf.total).toBeNull();
    expect(pf.source).toBe("unknown");
    expect(pf.explicitTotals.map((t) => t.marks)).toEqual([2, 4]);
  });

  it("never sums the totals", () => {
    const pf = runPreflight(MULTI);
    expect(pf.explicitTotals.map((t) => t.marks)).not.toContain(6);
    expect(pf.total).not.toBe(6);
  });

  it("keeps single-total questions on the unchanged explicit route", () => {
    const pf = runPreflight("Evaluate the use of indirect taxes. [15 marks]");
    expect(pf.kind).toBe("explicit");
    expect(pf.total).toBe(15);
    expect(pf.explicitTotals).toHaveLength(1);
  });

  it("subpart pastes on separate lines are detected as multiple", () => {
    const pf = runPreflight("Explain the diagram. [4]\nEvaluate the policy. [6]");
    expect(pf.kind).toBe("multiple_explicit");
    expect(pf.explicitTotals.map((t) => t.marks)).toEqual([4, 6]);
  });

  it("each candidate carries its own question-part slice", () => {
    const pf = runPreflight(
      "(a) Define a subsidy. [2 marks]\n\n(b) Using a demand and supply diagram, explain how a subsidy paid to producers affects the equilibrium price and quantity. [4 marks]"
    );
    expect(pf.kind).toBe("multiple_explicit");
    const four = pf.explicitTotals.find((t) => t.marks === 4);
    expect(four?.partText).toContain("demand and supply diagram");
    expect(four?.partText).not.toContain("Define a subsidy");
    const two = pf.explicitTotals.find((t) => t.marks === 2);
    expect(two?.partText).toContain("Define a subsidy");
  });

  it("a citation-like bare bracket alone triggers the uncertain-total confirmation", () => {
    const pf = runPreflight("As shown in extract (3), demand rose. Explain why demand rose.");
    expect(pf.kind).toBe("uncertain_total");
    expect(pf.total).toBeNull();
    expect(pf.explicitTotals.map((t) => t.marks)).toEqual([3]);
  });
});

describe("runPreflight — explicit paper labels beat the diagram template", () => {
  const DIAGRAM_4 =
    "Using a demand and supply diagram, explain the effect of a subsidy on the market. [4 marks]";

  it("a plain 4-mark diagram-explain still uses the recognised template framework", () => {
    const pf = runPreflight(DIAGRAM_4);
    expect(pf.framework).toBe("paper2_four_mark_diagram_explain");
    expect(pf.templateId).toBe("four_mark_diagram_explain");
  });

  it("an explicit Paper 3(a) label wins — never inherits the 2+2 template", () => {
    const pf = runPreflight(`Paper 3(a): ${DIAGRAM_4}`);
    expect(pf.framework).toBe("paper3a_analytic");
    expect(pf.templateId).toBeNull();
    expect(pf.frameworkConfirmed).toBe(true);
  });

  it("explicit Paper 2(a)/2(b) labels are confirmed analytic frameworks", () => {
    expect(runPreflight("Paper 2(a): Define price elasticity of demand. [2 marks]").framework).toBe(
      "paper2a_definition"
    );
    expect(runPreflight("Paper 2(b): Calculate the new equilibrium price. [4 marks]").framework).toBe(
      "paper2b_quantitative"
    );
  });
});

describe("runPreflight — no inference from command terms alone", () => {
  it("does NOT infer 10 from a bare Explain", () => {
    const pf = runPreflight("Explain how a subsidy affects the market for solar panels.");
    expect(pf.kind).toBe("unknown");
    expect(pf.total).toBeNull();
  });

  it("does NOT infer 15 from a bare Evaluate", () => {
    const pf = runPreflight("Evaluate the view that indirect taxes are the best way to reduce smoking.");
    expect(pf.kind).toBe("unknown");
    expect(pf.total).toBeNull();
  });

  it("does NOT infer from a bare Discuss", () => {
    const pf = runPreflight("Discuss whether a minimum wage reduces poverty.");
    expect(pf.kind).toBe("unknown");
  });
});

describe("detectPaper1Part — strict, explicit labels with Paper 1 context only", () => {
  it("reads Paper 1(a) / Paper 1(b)", () => {
    expect(detectPaper1Part("Paper 1 (a): Explain ...")).toBe("a");
    expect(detectPaper1Part("Paper 1(b) Evaluate ...")).toBe("b");
  });
  it("reads Part (a) / Part (b) ONLY together with reliable Paper 1 context", () => {
    expect(detectPaper1Part("Paper 1, Part (a): Explain the term scarcity.")).toBe("a");
    expect(detectPaper1Part("Paper 1 — Part (b) Discuss ...")).toBe("b");
  });
  it("a bare Part (a)/(b) is NOT Paper 1 evidence (Paper 2/3 label subparts the same way)", () => {
    expect(detectPaper1Part("Part (a) Explain the term scarcity.")).toBeNull();
    expect(detectPaper1Part("Part (b) Discuss whether tariffs improve welfare.")).toBeNull();
  });
  it("does not fire on prose", () => {
    expect(detectPaper1Part("Explain part of the demand curve.")).toBeNull();
  });
});

describe("runPreflight — inference precedence", () => {
  it("infers a Paper 1(b) total as a provisional source (explicit Paper 1 context)", () => {
    const pf = runPreflight("Paper 1, Part (b): Evaluate the impact of protectionism on living standards.");
    expect(pf.kind).toBe("inference");
    expect(pf.total).toBe(15);
    expect(pf.source).toBe("template_inferred");
    expect(pf.paperPart).toBe("b");
  });

  it("a bare Part (b) with no Paper 1 context yields NO inference", () => {
    const pf = runPreflight("Part (b): Evaluate the impact of protectionism on living standards.");
    expect(pf.kind).toBe("unknown");
    expect(pf.total).toBeNull();
  });

  it("infers a recognised 4-mark diagram template", () => {
    const pf = runPreflight("Using a demand and supply diagram, explain the effect of a poor harvest on the coffee market.");
    expect(pf.kind).toBe("inference");
    expect(pf.total).toBe(4);
    expect(pf.templateId).toBe("four_mark_diagram_explain");
  });

  it("prefers an explicit total over any inference", () => {
    const pf = runPreflight("Using a demand and supply diagram, explain the effect. [4 marks]");
    expect(pf.kind).toBe("explicit");
    expect(pf.source).toBe("explicit");
    expect(pf.total).toBe(4);
    // template id retained so the diagram cap can still apply to the explicit total
    expect(pf.templateId).toBe("four_mark_diagram_explain");
  });
});

describe("detectExplicitFramework — explicit paper labels only", () => {
  it("reads Paper 1(a)/(b); a bare Part label is NOT enough", () => {
    expect(detectExplicitFramework("Paper 1 (a): Explain ...")).toBe("paper1a_10_mark");
    expect(detectExplicitFramework("Paper 1 Part (b) Evaluate ...")).toBe("paper1b_15_mark");
    expect(detectExplicitFramework("Part (b) Evaluate ...")).toBeNull();
  });
  it("reads Paper 2(g) and Paper 3(b)", () => {
    expect(detectExplicitFramework("Paper 2 (g) Using the text/data ...")).toBe("paper2g_15_mark");
    expect(detectExplicitFramework("Paper 3 (b) Recommend a policy ...")).toBe("paper3b_10_mark");
  });
  it("reads Paper 2(a), Paper 2(b) and Paper 3(a) analytic labels", () => {
    expect(detectExplicitFramework("Paper 2(a): Define the term subsidy.")).toBe("paper2a_definition");
    expect(detectExplicitFramework("Paper 2(b): Calculate the PED.")).toBe("paper2b_quantitative");
    expect(detectExplicitFramework("Paper 3(a): Using the data, explain ...")).toBe("paper3a_analytic");
  });
  it("returns null for a plain question", () => {
    expect(detectExplicitFramework("Evaluate the impact of tariffs. [15 marks]")).toBeNull();
  });
});

describe("frameworkOptionsForTotal", () => {
  it("offers the right options per total", () => {
    expect(frameworkOptionsForTotal(10)).toEqual(["paper1a_10_mark", "paper3b_10_mark", "generic_practice"]);
    expect(frameworkOptionsForTotal(15)).toEqual(["paper1b_15_mark", "paper2g_15_mark", "generic_practice"]);
    expect(frameworkOptionsForTotal(6)).toEqual([]);
  });
});

describe("runPreflight — marking framework", () => {
  it("confirms the recognised diagram framework", () => {
    const pf = runPreflight("Using a demand and supply diagram, explain the effect. [4 marks]");
    expect(pf.framework).toBe("paper2_four_mark_diagram_explain");
    expect(pf.frameworkConfirmed).toBe(true);
  });

  it("confirms an explicit Paper 1(a) label", () => {
    const pf = runPreflight("Paper 1(a): Explain how a subsidy affects the market. [10 marks]");
    expect(pf.framework).toBe("paper1a_10_mark");
    expect(pf.frameworkConfirmed).toBe(true);
  });

  it("does NOT confirm a framework for a bare [10] — offers a choice", () => {
    const pf = runPreflight("Explain how a carbon tax reduces emissions. [10 marks]");
    expect(pf.framework).toBe("generic_practice");
    expect(pf.frameworkConfirmed).toBe(false);
    expect(pf.frameworkOptions).toEqual(["paper1a_10_mark", "paper3b_10_mark", "generic_practice"]);
  });

  it("does NOT silently label a bare [15] as Paper 1(b) — offers a choice", () => {
    const pf = runPreflight("Discuss whether tariffs improve welfare. [15 marks]");
    expect(pf.framework).toBe("generic_practice");
    expect(pf.frameworkConfirmed).toBe(false);
    expect(pf.frameworkOptions).toEqual(["paper1b_15_mark", "paper2g_15_mark", "generic_practice"]);
  });

  it("confirms a recognised 2-mark short response", () => {
    const pf = runPreflight("Define price elasticity of demand. [2 marks]");
    expect(pf.framework).toBe("paper2_short_analytic");
    expect(pf.frameworkConfirmed).toBe(true);
  });

  it("uses generic practice (confirmed, no choice) for other totals", () => {
    const pf = runPreflight("Explain two costs of inflation. [6 marks]");
    expect(pf.framework).toBe("generic_practice");
    expect(pf.frameworkConfirmed).toBe(true);
    expect(pf.frameworkOptions).toEqual([]);
  });
});
