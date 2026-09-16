import "server-only";
import type { DiagramFamily, DiagramRole } from "./diagram-contract";

export const EXAMINER_TASK_REGISTRY_VERSION = "ib-task-families-2026-v1";
export interface ReviewedTaskRule {
  id: string;
  demand: string;
  boundary: string;
  role: DiagramRole;
  family: DiagramFamily | null;
  expectations: string[];
  sources: string[];
}

// Original operational descriptions, not copied markschemes. Source identities,
// scope, confidence and session differences: docs/ib-marker-behavior-model.md.
const rule = (id: string, demand: string, boundary: string, role: DiagramRole,
  family: DiagramFamily | null, expectations: string[], sources: string[]): ReviewedTaskRule =>
  ({ id, demand, boundary, role, family, expectations, sources });

/** Classification selects a bounded demand, never a topic-wide diagram policy. */
export const REVIEWED_TASK_RULES: readonly ReviewedTaskRule[] = [
  rule("market-adjustment", "Explain demand/supply changes and their equilibrium price, quantity or welfare outcomes.",
    "Not a description of institutions or the meaning of a term alone.", "necessary_for_task", "demand_supply",
    ["Identify the relevant demand/supply change and initial/final equilibrium; connect the price and quantity outcomes to the cause."], ["G22:2.1–2.3", "SP22:SL-P1-Q1"]),
  rule("market-intervention", "Explain or evaluate the market outcomes of indirect taxes, subsidies or binding price controls, including incidence, shortages or welfare.",
    "A general account of government objectives is insufficient. Respect whether controls bind and the intervention actually chosen.", "necessary_for_task", "demand_supply",
    ["Represent the intervention and its relevant prices, quantities or welfare changes. Explain who is affected and why."], ["G22:2.7", "M25-P1-SL-TZ1:Q1b"]),
  rule("elasticity-determinants", "Explain why demand or supply is more or less responsive to price: substitutes, necessity, budget share, adjustment time, capacity, storage or factor mobility.",
    "Only determinant/responsiveness explanations. Not price/revenue, tax incidence, market-equilibrium changes, or variation along a given curve. A graph may illustrate the degree of response but is not necessary to explain the causal determinants.", "appropriate_support", "demand_supply",
    ["Explain how each requested determinant affects percentage quantity responsiveness to price. Do not substitute curve steepness for the economic mechanism."], ["G22:2.5–2.6", "E26:P1a; Aptly bounded task judgment"]),
  rule("elasticity-revenue", "Explain or evaluate price changes and total revenue using elasticity, or explain changing PED along a demand curve.",
    "Not pure determinant explanations. Distinguish a firm's revenue from profit and do not equate slope and elasticity.", "necessary_for_task", "demand_supply",
    ["Represent and explain the relevant price/quantity/revenue relationship or along-curve elasticity. Accept valid equivalent representations."], ["G22:2.5"]),
  rule("externality-allocation", "Explain private/social divergence causing inefficient output, welfare loss, or overuse of common-access resources, or evaluate correction of that divergence.",
    "Identify production versus consumption and positive versus negative externalities from the task, not from topic alone. Information-policy or institutional descriptions are separate.", "necessary_for_task", "externality",
    ["Show the relevant private/social marginal relationship, market and efficient quantities, and the resulting welfare implication. Accept a plausibly explained alternative externality model where the task permits."], ["G22:2.8", "M25-P1-SL-TZ2:Q1a", "M23-P1-SL-TZ1:Q1a"]),
  rule("firm-equilibrium", "Explain or evaluate firm price/output, profit, entry/exit or efficiency through cost and revenue relationships.",
    "Not a conceptual description of business objectives. Use the actual market structure and time period; do not impose monopoly on every firm.", "necessary_for_task", "cost_revenue",
    ["Show the relevant cost/revenue equilibrium and price, output, profit or efficiency outcome, integrating the model into the explanation."], ["G22:2.11", "M24-P1-HL-TZ2:Q1", "N25-P1-HL-TZ1:Q1a"]),
  rule("aggregate-transmission", "Explain or evaluate how demand/supply changes or monetary, fiscal or supply-side policies affect output, inflation, unemployment or an output gap.",
    "Not redistribution from inflation, measurement issues, institutional tools alone or merely naming a macro objective. Identify the transmission and outcome, allowing different valid AS assumptions.", "necessary_for_task", "ad_as",
    ["Represent the appropriate AD/AS transmission and resulting output/price or capacity change. Relate the outcome to the requested inflation, employment or growth objective."], ["G22:3.2–3.3,3.5–3.7", "N25-P1-HL-TZ1:Q2b", "SP22:SL-P1-Q2a"]),
  rule("inflation-redistribution", "Explain how inflation redistributes purchasing power between fixed/adjustable incomes or borrowers/lenders.",
    "Not causes of inflation or disinflation policy transmission.", "appropriate_support", "ad_as",
    ["Explain the requested distributional relationships; an AD/AS illustration is nonessential."], ["N25-P1-HL-TZ1:Q2a"]),
  rule("phillips-relationship", "Explain the short/long-run relationship or trade-off between inflation and unemployment using expectations or a Phillips relationship.",
    "HL mechanism. Unemployment causes alone do not establish a Phillips task.", "necessary_for_task", "phillips",
    ["Show the relevant inflation/unemployment relationship and any expectations adjustment requested; distinguish movement and shift."], ["G22:3.3-HL", "M25-P3:Q2a"]),
  rule("distribution-representation", "Explain a change or comparison in income distribution through Lorenz curves or the Gini relationship.",
    "Not merely limitations of inequality indicators or a general poverty policy discussion.", "necessary_for_task", "lorenz",
    ["Represent cumulative population/income shares and the distribution relative to equality; connect that relationship to the comparison requested."], ["G22:3.4", "M25-P2:Q1f"]),
  rule("trade-protection", "Explain or evaluate tariff/quota/export-subsidy changes in domestic output, consumption, imports or welfare.",
    "Not institutional comparisons of trade agreements or general reasons for international trade.", "necessary_for_task", "trade",
    ["Represent the appropriate world-price/domestic-market relationship and the requested trade and welfare outcomes, respecting the type of protection."], ["G22:4.2", "M25-P2:Q1c"]),
  rule("currency-equilibrium", "Explain exchange-rate determination, appreciation/depreciation or intervention through demand and supply of a currency.",
    "Not simple currency price conversion, balance-of-payments accounting or merely naming depreciation.", "necessary_for_task", "currency",
    ["Identify the currency quotation and the demand/supply change; explain the resulting exchange-rate movement consistently."], ["G22:4.5", "M25-P2:Q1d", "SP22:SL-P1-Q3a"]),
  rule("current-account-transmission", "Explain how depreciation affects the current account through trade quantities, elasticities or adjustment over time.",
    "Not a description of account components. Accept a relevant currency, trade, AD/AS or J-curve representation; do not require all of them. J-curve/Marshall–Lerner are HL.", "necessary_for_task", null,
    ["Use and explain a relevant representation of the exchange-rate/trade adjustment mechanism, with the price/quantity or timing conditions actually asked for."], ["G22:4.5–4.6", "SP22:HL-P1-Q3a"]),
  rule("ppc-representation", "Explain opportunity costs, scarcity, efficiency, unemployment or growth through attainable production combinations or a PPC.",
    "Not a generic account of scarcity or international trade that does not ask for a production frontier mechanism.", "necessary_for_task", "ppc",
    ["Represent the relevant attainable combinations, movement or frontier shift; explain the requested trade-off or capacity distinction."], ["G22:1.1", "M25-P1-SL-TZ3:Q1a"]),
  rule("comparative-advantage", "Explain comparative advantage or gains from trade through relative opportunity costs and specialization.",
    "A coherent numerical/prose comparison can establish the mechanism. Not a protection or explicitly graphical PPC task.", "appropriate_support", "ppc",
    ["Establish relative opportunity costs and gains from specialization/trade; a PPC is useful support, with valid numerical alternatives accepted."], ["G22:4.1; Aptly alternative-representation judgment"]),
  rule("circular-flow", "Explain changes in income through injections, leakages or the circular flow.",
    "Not just naming sectors or defining national income.", "necessary_for_task", "circular_flow",
    ["Represent the relevant flows and explain how changed injections/leakages alter income."], ["G22:1.1,3.1", "M25-P1-SL-TZ3:Q2a"]),
  rule("poverty-feedback", "Explain a self-reinforcing poverty cycle or how a change breaks income/saving/investment/productivity feedback.",
    "Not every development strategy is a poverty-cycle task.", "necessary_for_task", "poverty_cycle",
    ["Represent the relevant feedback links and explain how the requested intervention or change interrupts them."], ["G22:4.9"]),
  rule("debt-sustainability", "Explain why sustainable public debt is an objective through servicing, creditworthiness or fiscal room.",
    "Not demand management, crowding out or multiplier transmission.", "optional", "ad_as",
    ["Explain debt sustainability and its requested consequences; AD/AS is optional support."], ["N22-P1-HL:Q2a"]),
  rule("institutional-comparison", "Explain differences between free trade areas and common markets as institutional arrangements.",
    "Not trade creation/diversion or tariff-removal market outcomes.", "not_assessed", null,
    ["Explain the institutional differences requested, including relevant movement of goods/factors and external barriers."], ["N22-P1-HL:Q3a"]),
  rule("information-remedies", "Explain government information, regulation or legislation responses to asymmetric information.",
    "Not an added externality-allocation or price-control mechanism.", "not_assessed", null,
    ["Explain how the information failure and proposed information/regulatory responses operate."], ["SP22:HL-P1-Q1a"]),
  rule("indicator-appraisal", "Explain or evaluate the usefulness/limitations of GDP, development or inequality measures as indicators of well-being, development or distribution.",
    "Not a task asking to construct a Lorenz curve, calculate an index, or explain a specified growth/policy transmission. A diagram may illustrate a selected limitation but no unique graphical model is necessary.", "appropriate_support", null,
    ["Assess what the indicator captures or misses and why that matters to the requested comparison, applying evidence where required."], ["G22:3.1,3.4,4.8", "M25-P1-SL-TZ3:Q2b; Aptly task judgment"]),
];
