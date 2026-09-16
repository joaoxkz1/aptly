import { describe, expect, it } from "vitest";
import type { AssessmentFramework } from "@/lib/types";
import { MANUAL_ESSAY_BLUEPRINT_VERSION, resolveManualEssayDiagram } from "./manual-essay-diagrams";
import { resolveScoringPolicy } from "./policy";
import { ECONOMICS_QUESTION_BANK } from "./question-bank/economics-v1";
import { ESSAY_DIAGRAM_AUDIT } from "./question-bank/economics-v1/essay-diagram-audit";
import { namedDiagramFamily, policyWithContract, resolveAssessmentContract } from "./trusted-contract";

// These are bounded engineering examples of economic task demands, not IB
// mark predictions. Source-backed exceptions are documented in the source notes.
const frames = [
  { framework: "paper1a_10_mark", total: 10 },
  { framework: "paper1b_15_mark", total: 15 },
  { framework: "generic_practice", total: 10 },
] as const;

function manual(text: string, frame: typeof frames[number] = frames[0], sourceMaterial: string | null = null) {
  const question = `${text} [${frame.total}]`;
  const generic = frame.framework === "generic_practice";
  const policy = resolveScoringPolicy(question, {
    requestedSource: generic ? "user_confirmed" : null,
    requestedTotal: generic ? frame.total : null,
    requestedFramework: frame.framework, templateId: null, sourceMaterial,
  });
  expect(policy.framework).toBe(frame.framework);
  const contract = resolveAssessmentContract({ policy, question, topic: "unknown", sourceMaterial })!;
  return { contract, policy: policyWithContract(policy, contract) };
}

const mechanisms = [
  { name: "AD/AS output and prices", family: "ad_as",
    explain: "Explain how falling consumer confidence affects real output and the price level.",
    evaluate: "Evaluate the impact of falling consumer confidence on real output and the price level." },
  { name: "market intervention equilibrium", family: "demand_supply",
    explain: "Explain how a producer subsidy changes equilibrium price and quantity.",
    evaluate: "Evaluate the impact of a producer subsidy on equilibrium price and quantity." },
  { name: "production pollution", family: "externality",
    explain: "Explain how production that causes pollution leads to market failure.",
    evaluate: "Evaluate the view that pollution from production causes an over allocation of resources." },
  { name: "negative consumption externality", family: "externality",
    explain: "Explain how negative externalities of consumption lead to market failure.",
    evaluate: "Evaluate the view that negative externalities of consumption cause over consumption and welfare loss." },
  { name: "positive consumption externality", family: "externality",
    explain: "Explain how positive externalities of consumption lead to under allocation of resources.",
    evaluate: "Evaluate the view that positive externalities of consumption cause under allocation of resources." },
  { name: "positive production externality", family: "externality",
    explain: "Explain how positive externalities of production lead to market failure.",
    evaluate: "Evaluate the view that positive externalities of production cause under allocation of resources." },
  { name: "firm MR/MC output", family: "cost_revenue",
    explain: "Explain why a firm maximizes profit where marginal revenue equals marginal cost.",
    evaluate: "Evaluate the view that a monopolist should choose its output where marginal revenue equals marginal cost." },
  { name: "floating currency determination", family: "currency",
    explain: "Explain how a floating exchange rate is determined by demand and supply for a currency.",
    evaluate: "Evaluate the role of changes in demand and supply in determining a floating exchange rate." },
  { name: "PPC opportunity cost", family: "ppc",
    explain: "Explain how a PPC illustrates increasing opportunity cost.",
    evaluate: "Evaluate how well a PPC represents increasing opportunity cost." },
  { name: "tariff welfare", family: "trade",
    explain: "Explain how a tariff affects domestic production and welfare.",
    evaluate: "Evaluate the effects of a tariff on domestic production and welfare." },
  { name: "export subsidy welfare", family: "trade",
    explain: "Explain the welfare effects of an export subsidy.",
    evaluate: "Evaluate the welfare effects of an export subsidy." },
] as const;

describe.each(frames)("manual task mechanisms under $framework", frame => {
  it.each(mechanisms)("recognizes $name as materially graphical without explicit wording", example => {
    const { contract, policy } = manual(frame.total === 15 ? example.evaluate : example.explain, frame);
    expect(contract).toMatchObject({ mode: "holistic_diagram", diagramRole: "necessary_for_task",
      provenance: "inferred_practice", blueprintVersion: MANUAL_ESSAY_BLUEPRINT_VERSION,
      diagram: { family: example.family, rules: [], labelingRuleReason: null },
      essayResolution: { confidence: "mechanism_matched" } });
    expect(contract.essayResolution?.basis.length).toBeGreaterThan(0);
    expect(policy).toMatchObject({ assessable: frame.total, capReason: null, cappedDiagramMarks: 0, scoringState: "marked" });
  });

  it.each([
    "Explain the limitations of the Gini coefficient for measuring income inequality.",
    "Explain the disadvantages to a firm of profit maximization as an objective.",
    "Explain how currency depreciation changes the domestic currency price of imports.",
    "Explain the difficulties of measuring welfare loss from pollution caused by production.",
    "Explain the meaning of a negative externality of production.",
  ])("does not infer necessity from topic words in %s", question => {
    const { contract, policy } = manual(question, frame);
    expect(contract.diagramRole).toBe("unresolved");
    expect(contract.essayResolution?.confidence).toBe("unresolved");
    expect(policy.scoringState).toBe("provisional");
  });
});

describe("source-backed exceptions and scope boundaries", () => {
  it.each([
    "Explain why sustainable government/national debt is an important macroeconomic objective.",
    "Explain why sustainable government (national) debt is an important macroeconomic objective.",
    "Explain why sustainable national debt is an important macroeconomic objective.",
  ])("retains the explicit no-diagram debt exception: %s", question => {
    const { contract } = manual(question);
    expect(contract).toMatchObject({ diagramRole: "optional", essayResolution: {
      ruleId: "sustainable-debt-objective", confidence: "source_matched",
    } });
  });

  it.each([
    ["Explain two possible government responses to asymmetric information.", "asymmetric-information-responses"],
    ["Explain the similarities and differences between a free trade area and a common market.", "integration-arrangements-comparison"],
  ])("does not assess an economic diagram for the sourced prose task: %s", (question, ruleId) => {
    expect(manual(question).contract).toMatchObject({ diagramRole: "not_assessed", diagram: null,
      essayResolution: { ruleId, confidence: "source_matched" } });
  });

  it("does not apply the debt exception to an additional output mechanism", () => {
    const { contract } = manual("Explain why sustainable national debt is an important macroeconomic objective and how falling government spending affects real output.");
    expect(contract.diagramRole).not.toBe("optional");
    expect(contract.diagramRole).not.toBe("not_assessed");
    expect(contract.essayResolution?.ruleId).not.toBe("sustainable-debt-objective");
  });

  it.each([
    "Without using a diagram, explain how production that causes pollution leads to market failure.",
    "Do not draw a diagram. Explain how a producer subsidy affects equilibrium price and quantity.",
    "Using an AD/AS diagram, explain how falling consumer confidence affects real output, but do not use a diagram.",
  ])("keeps negated or contradictory diagram wording unresolved: %s", question => {
    const { contract, policy } = manual(question);
    expect(contract.diagramRole).toBe("unresolved");
    expect(policy.scoringState).toBe("provisional");
  });
});

describe("manual exact bank recognition preserves audited authority", () => {
  const bankQuestion = ECONOMICS_QUESTION_BANK.find(question => question.qualityStatus !== "deprecated" &&
    question.marks === 10 && question.framework === "paper1a_10_mark" &&
    ESSAY_DIAGRAM_AUDIT[question.id]?.role === "necessary_for_task" &&
    !/\b(?:diagram|graph|curve)\b/i.test(question.question))!;

  function resolve(overrides: { total?: number; sourceMaterial?: string | null; framework?: AssessmentFramework } = {}) {
    expect(bankQuestion).toBeDefined();
    return resolveManualEssayDiagram({ question: bankQuestion.question, total: bankQuestion.marks,
      framework: bankQuestion.framework, sourceMaterial: bankQuestion.sourceMaterial ?? null,
      explicit: false, namedFamily: namedDiagramFamily(bankQuestion.question), ...overrides });
  }

  it("uses the exact task's audit when total, framework and context match", () => {
    const result = resolve();
    const audit = ESSAY_DIAGRAM_AUDIT[bankQuestion.id];
    expect(result).toMatchObject({ role: audit.role, family: audit.family, reason: audit.reason,
      evidence: { ruleId: `audited-bank:${bankQuestion.id}`, confidence: "audited_match" } });
  });

  it.each([
    { sourceMaterial: "The changed source concerns a different country, market and time period." },
    { total: 15 },
    { framework: "paper1b_15_mark" as const },
  ])("does not reuse private audit authority when inputs differ: %j", overrides => {
    const result = resolve(overrides);
    expect(result.evidence.confidence).not.toBe("audited_match");
    expect(result.evidence.ruleId).not.toMatch(/^audited-bank:/);
  });
});
