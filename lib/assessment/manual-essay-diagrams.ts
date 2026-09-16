import "server-only";
import type { AssessmentFramework } from "@/lib/types";
import type { DiagramFamily, DiagramRole } from "./diagram-contract";
import { ECONOMICS_QUESTION_BANK } from "./question-bank/economics-v1";
import { ESSAY_DIAGRAM_AUDIT } from "./question-bank/economics-v1/essay-diagram-audit";

export const MANUAL_ESSAY_BLUEPRINT_VERSION = "inferred-essay-contract-v1";
export interface EssayResolutionEvidence {
  ruleId: string;
  confidence: "source_matched" | "audited_match" | "mechanism_matched" | "unresolved";
  basis: string[];
}
export interface EssayDiagramResolution {
  role: DiagramRole;
  family: DiagramFamily | null;
  reason: string;
  evidence: EssayResolutionEvidence;
  expectations?: string[];
}

/** Bibliographic locators, not model-authored assessment policy. See the source notes. */
const BASIS = {
  paper1: "2026 Economics examiner instructions, Paper 1: diagrams when necessary; holistic best fit; no arbitrary deductions.",
  production: "IB November 2020 SL Paper 1 Q1(a), p3: production pollution, MSC above MPC and over-allocation.",
  debt: "IB November 2022 HL Paper 1 Q2(a), p6: sustainable national debt can be explained without a diagram.",
  inflation: "IB November 2025 HL Paper 1 TZ1 Q2(a), p6: AD/AS may support redistribution analysis but is not necessary.",
  integration: "IB November 2022 HL Paper 1 Q3(a), p9: comparison of free trade area/common market does not need a diagram.",
  information: "IB 2022 HL Paper 1 specimen Q1(a), p5: government responses to asymmetric information do not need a diagram.",
  guide: "October 2022 amended Economics guide, task-specific diagram outcomes in sections 1.1, 2.1–2.3, 2.7–2.8, 2.11, 3.2 and 4.1–4.5.",
};

function normalized(question: string): string {
  return question.toLowerCase().replace(/\[\s*\d{1,2}\s*(?:marks?)?\s*\]/g, "")
    .replace(/[’‘]/g, "'").replace(/[^a-z0-9]+/g, " ").trim();
}

const PRODUCTION_EXPECTATIONS = [
  "A negative-production-externality diagram with price/cost/benefit and quantity axes, MSC above MPC, and MPB = MSB under the standard no-consumption-externality assumption.",
  "Identify market output at MPC = MPB and socially efficient output at MSC = MSB, with market output greater than socially efficient output.",
  "Show and explain the welfare loss between MSC and MSB over the excess output; accept equivalent notation and a coherent alternative representation of the same mechanism.",
];

interface MechanismRule {
  id: string;
  family: DiagramFamily;
  /** All clauses must match a causal task. A topic word alone never establishes necessity. */
  clauses: RegExp[];
  expectations: string[];
}
const MECHANISMS: readonly MechanismRule[] = [
  { id: "negative-production-externality", family: "externality",
    clauses: [/\b(?:production|produc\w*|factor(?:y|ies)|manufactur\w*)\b/, /\b(?:pollut\w*|emissions?|negative externalit\w*|external costs?)\b/, /\b(?:market failure|overproduction|over production|over allocation|allocative inefficiency|welfare loss|socially (?:efficient|optimal))\b/],
    expectations: PRODUCTION_EXPECTATIONS },
  { id: "negative-consumption-externality", family: "externality",
    clauses: [/\bconsum\w*\b/, /\b(?:negative externalit\w*|external costs?)\b/, /\b(?:market failure|overconsumption|over consumption|over allocation|welfare loss|socially (?:efficient|optimal))\b/],
    expectations: ["Show marginal private benefit above marginal social benefit, the private and social equilibria and over-consumption; explain the resulting welfare loss. Do not substitute a production-cost externality."] },
  { id: "positive-externality-underallocation", family: "externality",
    clauses: [/\bpositive externalit\w*\b/, /\b(?:production|consumption)\b/, /\b(?:market failure|under\w*|welfare|socially (?:efficient|optimal))\b/],
    expectations: ["Use the positive production or consumption model actually requested, identify the relevant private/social divergence, under-allocation and potential welfare gain."] },
  { id: "market-intervention-equilibrium", family: "demand_supply",
    clauses: [/\b(?:indirect tax|per unit tax|(?<!export )subsid\w*|price (?:ceiling|floor)|minimum (?:price|wage)|maximum price)\b/, /\b(?:equilibrium|price and quantity|quantity and price|market outcomes|welfare|surplus|shortage|excess (?:demand|supply)|allocat\w*|stakeholders?)\b/],
    expectations: ["Construct demand and supply for the intervention actually asked about, distinguish initial and affected outcomes, and explain the relevant quantity, price or welfare effects. Respect whether a price control is binding."] },
  { id: "demand-supply-equilibrium-change", family: "demand_supply",
    clauses: [/\b(?:demand|supply)\b/, /\b(?:increase|decrease|rise|fall|shift|change|determin\w*)\b/, /\b(?:equilibrium (?:price|quantity)|price and quantity|quantity and price|market equilibrium)\b/],
    expectations: ["Show the task's demand or supply change, initial and resulting market equilibria, and explain its price and quantity outcomes."] },
  { id: "aggregate-demand-supply-output-prices", family: "ad_as",
    clauses: [/\b(?:aggregate demand|aggregate supply|ad as|consumer confidence|business confidence|government spending|interest rates?|fiscal policy|monetary policy|oil prices?|production costs?)\b/, /\b(?:increase|decrease|higher|lower|rise|rising|fall|falling|expansion\w*|contraction\w*|change|affect\w*|effect\w*|impact|determin\w*)\b/, /\b(?:real output|real gdp|price level|equilibrium national income|recessionary gap|inflationary gap|output gap)\b/],
    expectations: ["Show the requested aggregate-demand or aggregate-supply mechanism, distinguish initial and resulting real output/price level, and explain the outcome consistently with the stated Keynesian or monetarist/new-classical assumptions."] },
  { id: "currency-market-determination", family: "currency",
    clauses: [/\b(?:exchange rate|currency)\b/, /\b(?:demand|supply|determin\w*|equilibrium)\b/, /\b(?:floating|foreign exchange|demand|supply|equilibrium|interest rates?)\b/],
    expectations: ["Show demand and supply for the identified currency, define the exchange-rate quotation, and connect the task's change to appreciation or depreciation without reversing that quotation."] },
  { id: "firm-output-efficiency", family: "cost_revenue",
    clauses: [/\b(?:monopol\w*|oligopol\w*|perfect competition|competitive firm|firm)\b/, /\b(?:profit maximi\w*|marginal (?:cost|revenue)|allocative efficien\w*|productive efficien\w*|price and output|price and quantity|supernormal profit|abnormal profit)\b/],
    expectations: ["Use the firm's relevant cost/revenue model to identify the output/price or efficiency relationship requested, including MR = MC and the applicable demand/average-revenue or cost curves. Do not impose a different market structure."] },
  { id: "ppc-opportunity-cost-growth", family: "ppc",
    clauses: [/\b(?:production possibilit\w*|ppc|ppf)\b/, /\b(?:opportunity cost|trade off|economic growth|unemployment|efficien\w*|scarcity|outward|shift|movement)\b/],
    expectations: ["Use the production possibilities model to distinguish the task's movement, shift or attainable allocation, and explain the requested opportunity cost, growth or efficiency relationship."] },
  { id: "trade-protection-market-outcomes", family: "trade",
    clauses: [/\b(?:tariffs?|import quotas?|export subsid\w*)\b/, /\b(?:domestic (?:price|production|consumption)|imports?|welfare|consumer surplus|producer surplus|stakeholders?)\b/],
    expectations: ["Use the relevant small-country trade model with world price and domestic supply/demand, showing the task's protection mechanism and its production, consumption, imports or welfare effects."] },
  { id: "lorenz-income-distribution", family: "lorenz",
    clauses: [/\b(?:lorenz|gini)\b/, /\b(?:inequality|income distribution|redistribution|income equality)\b/],
    expectations: ["Show the cumulative population/income shares, equality reference and distribution relationship needed to explain the requested inequality comparison."] },
];

function result(role: DiagramRole, family: DiagramFamily | null, reason: string, ruleId: string,
  confidence: EssayResolutionEvidence["confidence"], basis: string[], expectations?: string[]): EssayDiagramResolution {
  return { role, family, reason, evidence: { ruleId, confidence, basis }, expectations };
}

/**
 * Deterministic, server-owned recognition of bounded task demands. No answer,
 * browser role, topic label or model classification participates. Unknown and
 * conflicting demands remain provisional instead of becoming exemptions.
 */
export function resolveManualEssayDiagram(input: {
  question: string; total: number; framework: AssessmentFramework; sourceMaterial: string | null;
  explicit: boolean; namedFamily: DiagramFamily | null;
}): EssayDiagramResolution {
  const q = normalized(input.question);
  const bank = ECONOMICS_QUESTION_BANK.find(entry => entry.qualityStatus !== "deprecated" &&
    entry.marks === input.total && entry.framework === input.framework && normalized(entry.question) === q &&
    (entry.sourceMaterial?.trim() ?? "") === (input.sourceMaterial?.trim() ?? ""));
  const audited = bank && ESSAY_DIAGRAM_AUDIT[bank.id];
  const matches = /\b(?:explain|analyse|analyze|discuss|evaluate|examine|assess)\b/.test(q)
    ? MECHANISMS.filter(rule => rule.clauses.every(clause => clause.test(q))) : [];
  if (/\b(?:without (?:using )?(?:a |any )?diagrams?|do not (?:draw|use)(?: a)? diagram)\b/.test(q)) {
    return result("unresolved", input.namedFamily, "This custom task contains a non-graphical or conflicting diagram instruction. Its diagram role remains provisional; do not infer a mandatory diagram or a verified exemption.",
      "non-graphical-or-conflicting-instruction", "unresolved", [BASIS.paper1]);
  }
  // Task-specific instructions take precedence even over an otherwise optional topic.
  if (input.explicit) {
    const match = matches.length === 1 ? matches[0] : null;
    return result("required_explicitly", match?.family ?? audited?.family ?? input.namedFamily,
      "The question explicitly requests a diagram. Its absence is an unmet task element considered through holistic best fit, with no fixed diagram deduction or numerical ceiling.",
      "explicit-diagram-demand", "source_matched", [BASIS.paper1], match?.expectations);
  }
  if (audited) return result(audited.role, audited.family, audited.reason, `audited-bank:${bank!.id}`, "audited_match",
    ["Exact normalized task, total, framework and context match to the source-reviewed Aptly essay bank.", BASIS.paper1]);
  if (input.framework === "paper2g_15_mark") return result("appropriate_support", input.namedFamily,
    "Diagrams may support the source-based argument; Paper 2(g)'s highest level can be reached without diagrams when the other descriptors are met.",
    "paper2g-best-fit", "source_matched", ["2026 Economics examiner instructions, Paper 2(g): diagrams are not a universal top-level gate."]);
  if (!["paper1a_10_mark", "paper1b_15_mark", "generic_practice"].includes(input.framework)) return result("unresolved", input.namedFamily,
    "This manual task's diagram role is unresolved under its framework. This provisional contract does not establish that a diagram is unnecessary.",
    "unresolved-framework", "unresolved", [BASIS.paper1]);
  // Explicit counterexamples are tied to their question demand, not the topic alone.
  const singleKnownDemand = matches.length === 0 && !/\b(?:and|also) (?:how|why|explain|analyse|evaluate)\b/.test(q);
  if (singleKnownDemand && /\bexplain\b/.test(q) && /\bsustainable (?:government(?: national)?|national|public) debt\b/.test(q) &&
      /\b(?:important|importance)\b/.test(q) && /\bmacroeconomic objective\b/.test(q)) {
    return result("optional", "ad_as", "This debt-sustainability objective can be fully explained without a diagram. AD/AS is an optional illustration; its absence is not an unmet requirement.",
      "sustainable-debt-objective", "source_matched", [BASIS.debt, BASIS.paper1]);
  }
  if (singleKnownDemand && /\bexplain\b/.test(q) && /\b(?:high|higher) (?:rates? of )?inflation\b/.test(q) && /\bredistribut\w*\b/.test(q)) {
    return result("appropriate_support", "ad_as", "An AD/AS diagram may support the inflation analysis, but the requested redistribution mechanism can be fully explained in prose. Do not penalize the absence of this nonessential support.",
      "inflation-redistribution", "source_matched", [BASIS.inflation, BASIS.paper1]);
  }
  if (singleKnownDemand && /\b(?:explain|compare|distinguish)\b/.test(q) && /\bfree trade area\b/.test(q) && /\bcommon market\b/.test(q) && /\b(?:similarit\w*|difference\w*|between)\b/.test(q)) {
    return result("not_assessed", null, "This comparison of integration arrangements can be fully answered without an economic diagram; an organizational illustration is not an assessed diagram requirement.",
      "integration-arrangements-comparison", "source_matched", [BASIS.integration, BASIS.paper1]);
  }
  if (singleKnownDemand && /\bexplain\b/.test(q) && /\basymmetric information\b/.test(q) &&
      /\bgovernment\b/.test(q) && /\b(?:responses?|respond|interven\w*|polic\w*)\b/.test(q)) {
    return result("not_assessed", null, "The requested government responses to asymmetric information can be fully explained without an economic diagram. Assess the information problem and responses in prose.",
      "asymmetric-information-responses", "source_matched", [BASIS.information, BASIS.paper1]);
  }
  // A multi-mechanism or explicitly non-graphical task needs further interpretation.
  const unsupportedScope = /\b(?:calculate|numerical example|statistical|empirical|limitations?|disadvantages? to (?:a )?firm|estimating|measurement|measuring|difficult\w*)\b/.test(q);
  if (matches.length === 1 && !unsupportedScope) {
    const rule = matches[0];
    return result("necessary_for_task", rule.family,
      `The requested ${rule.id.replaceAll("-", " ")} mechanism calls for a diagram to support its economic relationships and outcome. A missing diagram is a meaningful unmet element of holistic best fit, not a fixed mark deduction.`,
      rule.id, "mechanism_matched", [BASIS.paper1, rule.id === "negative-production-externality" ? BASIS.production : BASIS.guide], rule.expectations);
  }
  if (!matches.length && /\b(?:explain|discuss|evaluate)\b/.test(q) && /\b(?:comparative advantage|gains from (?:international )?trade|benefits of (?:international |free )?trade)\b/.test(q)) {
    return result("appropriate_support", "ppc", "A PPC can support this trade argument, but a developed opportunity-cost explanation or numerical comparison can establish it without a diagram. Do not turn a useful illustration into a mandatory element.",
      "trade-gains-alternative-representation", "mechanism_matched", [BASIS.guide, BASIS.paper1]);
  }
  return result("unresolved", input.namedFamily,
    "The diagram role of this custom task could not be established confidently from verified task guidance. Treat the estimate as provisional; this is not a finding that no diagram is required.",
    matches.length > 1 ? "conflicting-task-mechanisms" : "unrecognized-task-demand", "unresolved", [BASIS.paper1]);
}
