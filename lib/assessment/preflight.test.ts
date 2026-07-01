import { describe, it, expect } from "vitest";
import {
  detectExplicitFramework,
  detectExplicitMarkTotal,
  detectPaper1Part,
  frameworkOptionsForTotal,
  runPreflight,
} from "./preflight";

describe("detectExplicitMarkTotal", () => {
  const cases: [string, number][] = [
    ["Explain the effect of a subsidy. [4]", 4],
    ["Explain the effect of a subsidy. [4 marks]", 4],
    ["Explain the effect of a subsidy. (10 marks)", 10],
    ["Explain the effect of a subsidy 15 marks", 15],
    ["This is a 4-marker on elasticity", 4],
    ["Answer the following out of 6", 6],
    ["Respond to a maximum of 8 marks", 8],
  ];
  it.each(cases)("recognises %j", (question, expected) => {
    expect(detectExplicitMarkTotal(question)?.marks).toBe(expected);
  });

  it("ignores ordinary numbers with no mark cue", () => {
    expect(detectExplicitMarkTotal("In 2008 the economy shrank by 3 percent.")).toBeNull();
    expect(detectExplicitMarkTotal("Explain how demand for 5 goods changes.")).toBeNull();
  });

  it("rejects out-of-range totals", () => {
    expect(detectExplicitMarkTotal("worth 99 marks")).toBeNull();
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

describe("detectPaper1Part — strict, explicit part labels only", () => {
  it("reads Paper 1(a) / Paper 1(b)", () => {
    expect(detectPaper1Part("Paper 1 (a): Explain ...")).toBe("a");
    expect(detectPaper1Part("Paper 1(b) Evaluate ...")).toBe("b");
  });
  it("reads Part (a) / Part (b)", () => {
    expect(detectPaper1Part("Part (a) Explain the term scarcity.")).toBe("a");
    expect(detectPaper1Part("Part (b) Discuss ...")).toBe("b");
  });
  it("does not fire on prose", () => {
    expect(detectPaper1Part("Explain part of the demand curve.")).toBeNull();
  });
});

describe("runPreflight — inference precedence", () => {
  it("infers a Paper 1(b) total as a provisional source", () => {
    const pf = runPreflight("Part (b): Evaluate the impact of protectionism on living standards.");
    expect(pf.kind).toBe("inference");
    expect(pf.total).toBe(15);
    expect(pf.source).toBe("template_inferred");
    expect(pf.paperPart).toBe("b");
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
  it("reads Paper 1(a)/(b) and Part (a)/(b)", () => {
    expect(detectExplicitFramework("Paper 1 (a): Explain ...")).toBe("paper1a_10_mark");
    expect(detectExplicitFramework("Part (b) Evaluate ...")).toBe("paper1b_15_mark");
  });
  it("reads Paper 2(g) and Paper 3(b)", () => {
    expect(detectExplicitFramework("Paper 2 (g) Using the text/data ...")).toBe("paper2g_15_mark");
    expect(detectExplicitFramework("Paper 3 (b) Recommend a policy ...")).toBe("paper3b_10_mark");
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
