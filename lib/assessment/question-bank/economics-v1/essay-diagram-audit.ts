import "server-only";
import type { DiagramFamily } from "@/lib/assessment/diagram-contract";

/** Per-question Aptly assessment judgments, source reviewed in docs/essay-source-audit.md; historical snapshots remain unchanged. */
export const ESSAY_DIAGRAM_AUDIT: Record<string, { role: "necessary_for_task" | "optional_appropriate"; family: DiagramFamily | null; reason: string }> = {
  "econ-v1-1.1-10-001": {
    "role": "optional_appropriate",
    "family": "ppc",
    "reason": "A PPC may illustrate the conceptual explanation of scarcity and choice; the task does not require a particular construction."
  },
  "econ-v1-1.1-10-002": {
    "role": "necessary_for_task",
    "family": "ppc",
    "reason": "The task directly asks how the PPC represents the named economic concepts."
  },
  "econ-v1-1.1-15-001": {
    "role": "optional_appropriate",
    "family": "ppc",
    "reason": "A PPC can support this judgment about growth and scarcity; the argument is broader than a specific diagram."
  },
  "econ-v1-1.1-15-002": {
    "role": "optional_appropriate",
    "family": "ppc",
    "reason": "A graphical illustration may support public resource-allocation examples without determining the evaluation."
  },
  "econ-v1-1.2-10-001": {
    "role": "optional_appropriate",
    "family": null,
    "reason": "This task concerns the purpose of economic models and assumptions; no particular graphical model is necessary."
  },
  "econ-v1-1.2-10-002": {
    "role": "optional_appropriate",
    "family": null,
    "reason": "Different interpretations and values can be explained without a prescribed graphical model."
  },
  "econ-v1-1.2-15-001": {
    "role": "optional_appropriate",
    "family": null,
    "reason": "The evaluation concerns model usefulness and assumptions; diagrams depend on the examples selected."
  },
  "econ-v1-1.2-15-002": {
    "role": "optional_appropriate",
    "family": null,
    "reason": "The argument concerns positive analysis and value judgments; diagrams are relevant only to selected illustrations."
  },
  "econ-v1-2.1-10-001": {
    "role": "necessary_for_task",
    "family": "demand_supply",
    "reason": "The requested price and quantity-demanded relationship should be represented consistently with its written explanation."
  },
  "econ-v1-2.1-10-002": {
    "role": "necessary_for_task",
    "family": "demand_supply",
    "reason": "The task compares demand changes across goods and needs the relevant graphical relationships."
  },
  "econ-v1-2.1-10-003": {
    "role": "necessary_for_task",
    "family": "demand_supply",
    "reason": "The task explains how expectations change current demand, making its graphical representation part of the analysis."
  },
  "econ-v1-2.1-15-001": {
    "role": "necessary_for_task",
    "family": "demand_supply",
    "reason": "The argument distinguishes price effects from other demand determinants through the relevant demand relationships."
  },
  "econ-v1-2.1-15-002": {
    "role": "necessary_for_task",
    "family": "demand_supply",
    "reason": "The task explicitly examines market price and output adjustment following a demand change."
  },
  "econ-v1-2.1-15-003": {
    "role": "necessary_for_task",
    "family": "demand_supply",
    "reason": "Comparing influences on current demand requires a clear representation of the demand changes discussed."
  },
  "econ-v1-2.1-15-004": {
    "role": "optional_appropriate",
    "family": "demand_supply",
    "reason": "A demand diagram can support the chosen examples of firms' influence; the wider judgment concerns its limits."
  },
  "econ-v1-2.2-10-001": {
    "role": "necessary_for_task",
    "family": "demand_supply",
    "reason": "The task examines a production-cost change and its effect on the supply relationship."
  },
  "econ-v1-2.2-10-002": {
    "role": "necessary_for_task",
    "family": "demand_supply",
    "reason": "The task directly explains a technology-driven change in market supply."
  },
  "econ-v1-2.2-10-003": {
    "role": "necessary_for_task",
    "family": "demand_supply",
    "reason": "The explanation concerns changes in agricultural supply across seasons and their graphical representation."
  },
  "econ-v1-2.2-15-001": {
    "role": "necessary_for_task",
    "family": "demand_supply",
    "reason": "The task compares influences on market supply; relevant supply changes belong within the analysis."
  },
  "econ-v1-2.2-15-002": {
    "role": "necessary_for_task",
    "family": "demand_supply",
    "reason": "The task compares short-run and long-run supply adjustment after disruption."
  },
  "econ-v1-2.2-15-003": {
    "role": "necessary_for_task",
    "family": "demand_supply",
    "reason": "The task examines how expectations alter current supply rather than merely defining expectations."
  },
  "econ-v1-2.2-15-004": {
    "role": "necessary_for_task",
    "family": "demand_supply",
    "reason": "The question asks how policy increases supply, requiring relevant graphical policy analysis."
  },
  "econ-v1-2.3-10-001": {
    "role": "necessary_for_task",
    "family": "demand_supply",
    "reason": "Adjustment from shortage to equilibrium is the specific graphical relationship being explained."
  },
  "econ-v1-2.3-10-002": {
    "role": "necessary_for_task",
    "family": "demand_supply",
    "reason": "The task tests how supply responsiveness changes the market effects of a demand increase."
  },
  "econ-v1-2.3-10-003": {
    "role": "necessary_for_task",
    "family": "demand_supply",
    "reason": "The requested consumer and producer surplus comparison requires relevant equilibrium and welfare relationships."
  },
  "econ-v1-2.3-15-001": {
    "role": "necessary_for_task",
    "family": "demand_supply",
    "reason": "The judgment concerns competitive equilibrium and social outcomes; its relevant equilibrium analysis should be represented."
  },
  "econ-v1-2.3-15-002": {
    "role": "necessary_for_task",
    "family": "demand_supply",
    "reason": "The task evaluates stakeholder effects of demand-driven market adjustment."
  },
  "econ-v1-2.3-15-003": {
    "role": "optional_appropriate",
    "family": "demand_supply",
    "reason": "A market diagram may support the explanation of adjustment delays; institutional frictions can be discussed directly."
  },
  "econ-v1-2.3-15-004": {
    "role": "necessary_for_task",
    "family": "demand_supply",
    "reason": "The argument evaluates price adjustment as a response to excess demand and needs that relationship represented."
  },
  "econ-v1-2.4-10-001": {
    "role": "optional_appropriate",
    "family": null,
    "reason": "The task explains behavioral departures from utility maximization without requiring a specific diagram."
  },
  "econ-v1-2.4-10-002": {
    "role": "optional_appropriate",
    "family": null,
    "reason": "The task concerns firms' objectives and incentives, not a prescribed revenue-maximization construction."
  },
  "econ-v1-2.4-10-003": {
    "role": "optional_appropriate",
    "family": "demand_supply",
    "reason": "A demand diagram may illustrate the chosen behavioral example; explaining the bias is the primary task."
  },
  "econ-v1-2.4-15-001": {
    "role": "optional_appropriate",
    "family": null,
    "reason": "The evaluation concerns the usefulness of an assumption; no particular diagram follows from the task."
  },
  "econ-v1-2.4-15-002": {
    "role": "optional_appropriate",
    "family": null,
    "reason": "The task evaluates business objectives across circumstances rather than specifying a cost-revenue calculation."
  },
  "econ-v1-2.4-15-003": {
    "role": "optional_appropriate",
    "family": null,
    "reason": "Choice architecture can be assessed through contextual examples without a universal diagram requirement."
  },
  "econ-v1-2.4-15-004": {
    "role": "optional_appropriate",
    "family": null,
    "reason": "The task compares behavioral and traditional reasoning; graphical illustrations depend on the argument."
  },
  "econ-v1-2.5-10-001": {
    "role": "optional_appropriate",
    "family": "demand_supply",
    "reason": "A demand diagram can illustrate low responsiveness, but the task can be fully answered through the causal roles of necessity, substitutes and the share of income spent."
  },
  "econ-v1-2.5-10-002": {
    "role": "necessary_for_task",
    "family": "demand_supply",
    "reason": "The requested connection between elasticity and total revenue needs relevant price-quantity relationships."
  },
  "econ-v1-2.5-10-003": {
    "role": "optional_appropriate",
    "family": "demand_supply",
    "reason": "A diagram may support income-related forecasting, but the task focuses on firms' planning decisions."
  },
  "econ-v1-2.5-15-001": {
    "role": "necessary_for_task",
    "family": "demand_supply",
    "reason": "The evaluation of pricing decisions depends on the relevant elasticity and revenue relationships."
  },
  "econ-v1-2.5-15-002": {
    "role": "necessary_for_task",
    "family": "demand_supply",
    "reason": "The question examines tax outcomes under differing demand responsiveness, requiring the relevant market comparison."
  },
  "econ-v1-2.5-15-003": {
    "role": "optional_appropriate",
    "family": "demand_supply",
    "reason": "The task examines changing elasticity determinants over time; diagrams can support the selected explanation."
  },
  "econ-v1-2.5-15-004": {
    "role": "optional_appropriate",
    "family": "demand_supply",
    "reason": "Graphical policy examples may help this broader evaluation of elasticity estimates; no one diagram is compulsory."
  },
  "econ-v1-2.6-10-001": {
    "role": "optional_appropriate",
    "family": "demand_supply",
    "reason": "Supply diagrams may illustrate changing responsiveness, while the task primarily explains time and capacity constraints."
  },
  "econ-v1-2.6-10-002": {
    "role": "necessary_for_task",
    "family": "demand_supply",
    "reason": "The task tests how capacity affects the market response to a demand increase."
  },
  "econ-v1-2.6-10-003": {
    "role": "optional_appropriate",
    "family": "demand_supply",
    "reason": "A supply diagram may illustrate the explanation of short-run production constraints."
  },
  "econ-v1-2.6-15-001": {
    "role": "optional_appropriate",
    "family": "demand_supply",
    "reason": "This evaluates elasticity determinants across circumstances; an appropriate comparison diagram may support the argument."
  },
  "econ-v1-2.6-15-002": {
    "role": "necessary_for_task",
    "family": "demand_supply",
    "reason": "The effects of a demand shock under different supply responsiveness require the relevant market relationships."
  },
  "econ-v1-2.6-15-003": {
    "role": "optional_appropriate",
    "family": "demand_supply",
    "reason": "The judgment concerns policies and housing constraints; a supply diagram can support selected policy mechanisms."
  },
  "econ-v1-2.6-15-004": {
    "role": "necessary_for_task",
    "family": "demand_supply",
    "reason": "The task explicitly connects inelastic supply to market price fluctuations."
  },
  "econ-v1-2.7-10-001": {
    "role": "necessary_for_task",
    "family": "demand_supply",
    "reason": "The effects of a binding price ceiling require the relevant controlled-price market relationships."
  },
  "econ-v1-2.7-10-002": {
    "role": "necessary_for_task",
    "family": "demand_supply",
    "reason": "The task analyzes the market effects and incidence of an indirect tax."
  },
  "econ-v1-2.7-10-003": {
    "role": "necessary_for_task",
    "family": "demand_supply",
    "reason": "The question asks for the subsidy's effects on market price and output."
  },
  "econ-v1-2.7-15-001": {
    "role": "necessary_for_task",
    "family": "demand_supply",
    "reason": "The affordability judgment depends on the relevant price-ceiling market effects."
  },
  "econ-v1-2.7-15-002": {
    "role": "necessary_for_task",
    "family": "demand_supply",
    "reason": "The policy evaluation tests how an indirect tax changes consumption in the relevant market."
  },
  "econ-v1-2.7-15-003": {
    "role": "necessary_for_task",
    "family": "demand_supply",
    "reason": "The task evaluates minimum-price effects and needs the relevant price-floor relationships."
  },
  "econ-v1-2.7-15-004": {
    "role": "necessary_for_task",
    "family": "externality",
    "reason": "The question evaluates subsidies for socially beneficial goods; the relevant private and social outcomes should be represented."
  },
  "econ-v1-2.8-10-001": {
    "role": "necessary_for_task",
    "family": "externality",
    "reason": "The task asks for the allocation effects of a negative production externality."
  },
  "econ-v1-2.8-10-002": {
    "role": "necessary_for_task",
    "family": "externality",
    "reason": "The task analyzes corrective taxation against the relevant private and social cost relationships."
  },
  "econ-v1-2.8-10-003": {
    "role": "optional_appropriate",
    "family": "externality",
    "reason": "A diagram may support the explanation of common-resource overuse; the incentive mechanism can also be explained directly."
  },
  "econ-v1-2.8-15-001": {
    "role": "necessary_for_task",
    "family": "externality",
    "reason": "The carbon-tax evaluation depends on its graphical externality and intervention mechanism."
  },
  "econ-v1-2.8-15-002": {
    "role": "optional_appropriate",
    "family": "externality",
    "reason": "Diagrams may support the policy-instrument comparison; the question also concerns design and enforcement."
  },
  "econ-v1-2.8-15-003": {
    "role": "optional_appropriate",
    "family": "externality",
    "reason": "The question evaluates several resource-management institutions; no single graphical mechanism is universally necessary."
  },
  "econ-v1-2.8-15-004": {
    "role": "optional_appropriate",
    "family": "externality",
    "reason": "A diagram may support environmental examples; the judgment primarily concerns property rights and bargaining conditions."
  },
  "econ-v1-2.9-10-001": {
    "role": "optional_appropriate",
    "family": null,
    "reason": "Public-good characteristics and incentives can be explained without imposing an unrelated graph."
  },
  "econ-v1-2.9-10-002": {
    "role": "optional_appropriate",
    "family": null,
    "reason": "The task concerns collective provision of flood protection; no prescribed axes or curves follow from it."
  },
  "econ-v1-2.9-10-003": {
    "role": "optional_appropriate",
    "family": null,
    "reason": "The question compares economic characteristics and incentives rather than asking for a common graphical model."
  },
  "econ-v1-2.9-15-001": {
    "role": "optional_appropriate",
    "family": null,
    "reason": "The evaluation of public provision depends on economic reasoning and examples; diagrams are selected only where useful."
  },
  "econ-v1-2.9-15-002": {
    "role": "optional_appropriate",
    "family": "externality",
    "reason": "An externality diagram can support a merit-good example, but it is not necessary for every valid public-provision argument."
  },
  "econ-v1-2.9-15-003": {
    "role": "optional_appropriate",
    "family": null,
    "reason": "The task examines how technology changes good characteristics without requiring a particular diagram."
  },
  "econ-v1-2.9-15-004": {
    "role": "optional_appropriate",
    "family": null,
    "reason": "The question evaluates free riding and alternative explanations; diagrams are optional illustrations."
  },
  "econ-v1-2.10-10-001": {
    "role": "optional_appropriate",
    "family": null,
    "reason": "Adverse-selection reasoning can answer the task without a prescribed diagram."
  },
  "econ-v1-2.10-10-002": {
    "role": "optional_appropriate",
    "family": null,
    "reason": "The task explains incentives under hidden action; a universal graphical checklist would be inappropriate."
  },
  "econ-v1-2.10-10-003": {
    "role": "optional_appropriate",
    "family": null,
    "reason": "The question concerns information and signaling rather than a specific labour-market diagram."
  },
  "econ-v1-2.10-15-001": {
    "role": "optional_appropriate",
    "family": null,
    "reason": "The policy evaluation concerns information and participation; diagrams depend on the chosen example."
  },
  "econ-v1-2.10-15-002": {
    "role": "optional_appropriate",
    "family": null,
    "reason": "The question evaluates information regulation without specifying a graphical construction."
  },
  "econ-v1-2.10-15-003": {
    "role": "optional_appropriate",
    "family": null,
    "reason": "The task examines information problems in labour markets; relevant graphical illustrations remain optional."
  },
  "econ-v1-2.10-15-004": {
    "role": "optional_appropriate",
    "family": null,
    "reason": "The argument compares reputation and intervention rather than requiring a particular market graph."
  },
  "econ-v1-2.11-10-001": {
    "role": "optional_appropriate",
    "family": "cost_revenue",
    "reason": "A firm diagram may illustrate persistent market power; the main task explains entry barriers."
  },
  "econ-v1-2.11-10-002": {
    "role": "necessary_for_task",
    "family": "cost_revenue",
    "reason": "The question directly analyzes market power's effects on price, output and consumer surplus."
  },
  "econ-v1-2.11-10-003": {
    "role": "optional_appropriate",
    "family": null,
    "reason": "This historical conditions task has no prescribed diagram and is retired from current selection because price discrimination is outside the amended syllabus."
  },
  "econ-v1-2.11-15-001": {
    "role": "necessary_for_task",
    "family": "cost_revenue",
    "reason": "The welfare evaluation needs relevant market-power price, output and efficiency relationships."
  },
  "econ-v1-2.11-15-002": {
    "role": "optional_appropriate",
    "family": "cost_revenue",
    "reason": "A firm diagram may support an example, while the question evaluates how competition policy should identify harm."
  },
  "econ-v1-2.11-15-003": {
    "role": "optional_appropriate",
    "family": null,
    "reason": "This historical price-discrimination task has no prescribed diagram and is retired from current selection because the concept is outside the amended syllabus."
  },
  "econ-v1-2.11-15-004": {
    "role": "necessary_for_task",
    "family": "cost_revenue",
    "reason": "The natural-monopoly policy judgment needs the relevant cost and regulated-outcome relationships."
  },
  "econ-v1-2.12-10-001": {
    "role": "optional_appropriate",
    "family": "circular_flow",
    "reason": "A circular-flow illustration can support the explanation of market incomes and inequality."
  },
  "econ-v1-2.12-10-002": {
    "role": "optional_appropriate",
    "family": "lorenz",
    "reason": "A Lorenz diagram may illustrate distributional change; the causal tax explanation is not a curve-construction task."
  },
  "econ-v1-2.12-10-003": {
    "role": "optional_appropriate",
    "family": null,
    "reason": "The task concerns unequal opportunities and persistence; no single graphical construction is required."
  },
  "econ-v1-2.12-15-001": {
    "role": "optional_appropriate",
    "family": "lorenz",
    "reason": "Distribution diagrams may support this judgment about taxation and equity without replacing its policy analysis."
  },
  "econ-v1-2.12-15-002": {
    "role": "optional_appropriate",
    "family": "lorenz",
    "reason": "A Lorenz diagram can illustrate inequality, while the question evaluates broader welfare effects."
  },
  "econ-v1-2.12-15-003": {
    "role": "optional_appropriate",
    "family": null,
    "reason": "The question evaluates equality-of-opportunity policies without requiring a specific diagram."
  },
  "econ-v1-2.12-15-004": {
    "role": "optional_appropriate",
    "family": "lorenz",
    "reason": "A distribution diagram can support the selected example, but the efficiency-equity judgment is broader."
  },
  "econ-v1-3.1-10-001": {
    "role": "optional_appropriate",
    "family": null,
    "reason": "The task compares national-income measures, not a particular macroeconomic equilibrium."
  },
  "econ-v1-3.1-10-002": {
    "role": "necessary_for_task",
    "family": "circular_flow",
    "reason": "The question directly asks how the circular flow changes following investment."
  },
  "econ-v1-3.1-10-003": {
    "role": "necessary_for_task",
    "family": "ad_as",
    "reason": "The requested cyclical-unemployment explanation concerns contraction in output and expenditure."
  },
  "econ-v1-3.1-15-001": {
    "role": "optional_appropriate",
    "family": null,
    "reason": "The evaluation concerns a measurement tool and its limitations; no diagram is universally necessary."
  },
  "econ-v1-3.1-15-002": {
    "role": "optional_appropriate",
    "family": "ppc",
    "reason": "A growth illustration can support the argument, but the task evaluates wider well-being outcomes."
  },
  "econ-v1-3.1-15-003": {
    "role": "optional_appropriate",
    "family": null,
    "reason": "The question examines comparability of statistics rather than exchange-rate determination."
  },
  "econ-v1-3.1-15-004": {
    "role": "optional_appropriate",
    "family": null,
    "reason": "The task evaluates national-income data as evidence about the cycle; no specific supported diagram is mandatory."
  },
  "econ-v1-3.2-10-001": {
    "role": "necessary_for_task",
    "family": "ad_as",
    "reason": "The task asks how confidence affects real output and the price level."
  },
  "econ-v1-3.2-10-002": {
    "role": "necessary_for_task",
    "family": "ad_as",
    "reason": "The question analyzes the economy-wide output and price effects of an energy-cost shock."
  },
  "econ-v1-3.2-10-003": {
    "role": "necessary_for_task",
    "family": "ad_as",
    "reason": "The task compares investment's demand effects and changes in productive capacity."
  },
  "econ-v1-3.2-15-001": {
    "role": "necessary_for_task",
    "family": "ad_as",
    "reason": "The evaluation of demand-driven inflation depends on the relevant macroeconomic equilibrium relationships."
  },
  "econ-v1-3.2-15-002": {
    "role": "necessary_for_task",
    "family": "ad_as",
    "reason": "The stakeholder evaluation depends on the output and price effects of a negative aggregate supply shock."
  },
  "econ-v1-3.2-15-003": {
    "role": "necessary_for_task",
    "family": "ad_as",
    "reason": "The question tests how capacity affects the response to aggregate demand."
  },
  "econ-v1-3.2-15-004": {
    "role": "necessary_for_task",
    "family": "ad_as",
    "reason": "The task directly evaluates AD/AS analysis as an explanation of stagflation."
  },
  "econ-v1-3.3-10-001": {
    "role": "optional_appropriate",
    "family": "ad_as",
    "reason": "A macroeconomic diagram may support a selected growth mechanism; the question primarily explains price stability's benefits."
  },
  "econ-v1-3.3-10-002": {
    "role": "optional_appropriate",
    "family": "externality",
    "reason": "An environmental diagram may illustrate the chosen growth conflict; its relevance depends on the example."
  },
  "econ-v1-3.3-10-003": {
    "role": "necessary_for_task",
    "family": "ad_as",
    "reason": "The task examines the relationship between employment expansion and inflationary pressure within macroeconomic analysis."
  },
  "econ-v1-3.3-15-001": {
    "role": "optional_appropriate",
    "family": "ad_as",
    "reason": "Macroeconomic diagrams may support the selected trade-offs; prioritizing objectives is a broader judgment."
  },
  "econ-v1-3.3-15-002": {
    "role": "necessary_for_task",
    "family": "ad_as",
    "reason": "The question compares growth and price stability through relevant demand and supply relationships."
  },
  "econ-v1-3.3-15-003": {
    "role": "optional_appropriate",
    "family": "ad_as",
    "reason": "A diagram may support the source of deflation discussed; the task primarily evaluates its economic costs."
  },
  "econ-v1-3.3-15-004": {
    "role": "optional_appropriate",
    "family": "ad_as",
    "reason": "Diagrams can support particular macroeconomic conflicts without imposing one on every valid argument."
  },
  "econ-v1-3.4-10-001": {
    "role": "optional_appropriate",
    "family": "poverty_cycle",
    "reason": "A poverty-cycle illustration may support the explanation; direct household-income reasoning is also relevant."
  },
  "econ-v1-3.4-10-002": {
    "role": "necessary_for_task",
    "family": "demand_supply",
    "reason": "The minimum-wage analysis needs relevant labour-market relationships within the wider inequality discussion."
  },
  "econ-v1-3.4-10-003": {
    "role": "optional_appropriate",
    "family": "poverty_cycle",
    "reason": "A cycle diagram may illustrate persistence and education; the task is not a required cycle construction."
  },
  "econ-v1-3.4-15-001": {
    "role": "optional_appropriate",
    "family": "poverty_cycle",
    "reason": "A poverty-cycle diagram may support a transfer mechanism while the policy evaluation remains broader."
  },
  "econ-v1-3.4-15-002": {
    "role": "optional_appropriate",
    "family": "lorenz",
    "reason": "A distribution diagram may illustrate inequality; the growth judgment concerns several possible causal routes."
  },
  "econ-v1-3.4-15-003": {
    "role": "optional_appropriate",
    "family": "lorenz",
    "reason": "A Lorenz diagram can clarify the index, but comparing its strengths and limitations does not require construction."
  },
  "econ-v1-3.4-15-004": {
    "role": "optional_appropriate",
    "family": null,
    "reason": "The question evaluates growth and poverty across contexts; no single diagram represents every relevant route."
  },
  "econ-v1-3.5-10-001": {
    "role": "necessary_for_task",
    "family": "ad_as",
    "reason": "The task asks how interest-rate policy changes aggregate demand; money-market construction is not universally required."
  },
  "econ-v1-3.5-10-002": {
    "role": "necessary_for_task",
    "family": "ad_as",
    "reason": "The task analyzes monetary policy's effects on demand-pull inflation."
  },
  "econ-v1-3.5-10-003": {
    "role": "optional_appropriate",
    "family": "ad_as",
    "reason": "A macro diagram may support the explanation, while confidence and transmission constraints are the central issue."
  },
  "econ-v1-3.5-15-001": {
    "role": "necessary_for_task",
    "family": "ad_as",
    "reason": "The inflation-policy evaluation requires the relevant demand and supply context."
  },
  "econ-v1-3.5-15-002": {
    "role": "necessary_for_task",
    "family": "ad_as",
    "reason": "The task evaluates monetary policy's output and employment effects during recession."
  },
  "econ-v1-3.5-15-003": {
    "role": "necessary_for_task",
    "family": "currency",
    "reason": "The task explicitly analyzes the exchange-rate transmission mechanism, with downstream macroeconomic diagrams where relevant."
  },
  "econ-v1-3.5-15-004": {
    "role": "optional_appropriate",
    "family": null,
    "reason": "The question evaluates unconventional tools and transmission constraints without requiring one particular graphical construction."
  },
  "econ-v1-3.6-10-001": {
    "role": "necessary_for_task",
    "family": "ad_as",
    "reason": "The question directly asks how fiscal policy affects a deflationary output gap."
  },
  "econ-v1-3.6-10-002": {
    "role": "optional_appropriate",
    "family": "ad_as",
    "reason": "A macroeconomic diagram may support the explanation of automatic stabilizers; their income mechanism can be explained directly."
  },
  "econ-v1-3.6-10-003": {
    "role": "necessary_for_task",
    "family": "ad_as",
    "reason": "The task compares fiscal contraction's inflation and unemployment effects."
  },
  "econ-v1-3.6-15-001": {
    "role": "necessary_for_task",
    "family": "ad_as",
    "reason": "The recession-policy evaluation requires the relevant aggregate-demand and capacity context."
  },
  "econ-v1-3.6-15-002": {
    "role": "optional_appropriate",
    "family": "ad_as",
    "reason": "A diagram may illustrate stabilization, but the judgment concerns budget rules and sustainability across the cycle."
  },
  "econ-v1-3.6-15-003": {
    "role": "optional_appropriate",
    "family": "ad_as",
    "reason": "A macroeconomic illustration may support multiplier effects; no particular construction is compulsory for the policy comparison."
  },
  "econ-v1-3.6-15-004": {
    "role": "optional_appropriate",
    "family": "ad_as",
    "reason": "A diagram may support a financing or stabilization example while the task evaluates fiscal constraints."
  },
  "econ-v1-3.7-10-001": {
    "role": "necessary_for_task",
    "family": "ad_as",
    "reason": "The question explicitly examines a change in long-run aggregate supply."
  },
  "econ-v1-3.7-10-002": {
    "role": "necessary_for_task",
    "family": "ad_as",
    "reason": "The task analyzes policy-induced changes in productive capacity."
  },
  "econ-v1-3.7-10-003": {
    "role": "necessary_for_task",
    "family": "ad_as",
    "reason": "The question directly asks how infrastructure affects aggregate supply."
  },
  "econ-v1-3.7-15-001": {
    "role": "optional_appropriate",
    "family": "ad_as",
    "reason": "A supply-side diagram may support education policy's effects, while the question evaluates effectiveness and constraints."
  },
  "econ-v1-3.7-15-002": {
    "role": "optional_appropriate",
    "family": "ad_as",
    "reason": "Macroeconomic diagrams may support particular reforms; the living-standards judgment is wider than output alone."
  },
  "econ-v1-3.7-15-003": {
    "role": "optional_appropriate",
    "family": "ad_as",
    "reason": "A capacity diagram may support the growth mechanism; project quality and complementary conditions also drive this task."
  },
  "econ-v1-3.7-15-004": {
    "role": "necessary_for_task",
    "family": "ad_as",
    "reason": "The question evaluates joint inflation and unemployment effects of supply-side policy."
  },
  "econ-v1-4.1-10-001": {
    "role": "optional_appropriate",
    "family": "ppc",
    "reason": "A PPC can illustrate comparative advantage and gains from trade, but a complete opportunity-cost table or numerical specialization and exchange example is also a valid route for this explain task."
  },
  "econ-v1-4.1-10-002": {
    "role": "optional_appropriate",
    "family": "trade",
    "reason": "A trade diagram may illustrate import competition; the task also concerns firm behavior and market conditions."
  },
  "econ-v1-4.1-10-003": {
    "role": "optional_appropriate",
    "family": null,
    "reason": "The task explains scale gains from trade; an HL cost-curve requirement must not be imposed on a shared outcome."
  },
  "econ-v1-4.1-15-001": {
    "role": "necessary_for_task",
    "family": "trade",
    "reason": "The consumer-benefits evaluation needs relevant trade, price and market-outcome analysis."
  },
  "econ-v1-4.1-15-002": {
    "role": "optional_appropriate",
    "family": "ppc",
    "reason": "A comparative-advantage diagram may support the benchmark being evaluated; modern trade explanations are broader."
  },
  "econ-v1-4.1-15-003": {
    "role": "optional_appropriate",
    "family": "ad_as",
    "reason": "A macroeconomic diagram may support a selected trade-growth mechanism without being compulsory for every argument."
  },
  "econ-v1-4.1-15-004": {
    "role": "optional_appropriate",
    "family": "trade",
    "reason": "A trade diagram may support a distributional example; the task primarily evaluates how gains are shared."
  },
  "econ-v1-4.2-10-001": {
    "role": "necessary_for_task",
    "family": "trade",
    "reason": "The task directly analyzes a tariff in the domestic market for an imported good."
  },
  "econ-v1-4.2-10-002": {
    "role": "necessary_for_task",
    "family": "trade",
    "reason": "The quota's effects on domestic consumers and producers require the relevant trade relationships."
  },
  "econ-v1-4.2-10-003": {
    "role": "necessary_for_task",
    "family": "trade",
    "reason": "The task concerns an export subsidy and resource allocation in a trade setting, not an ordinary domestic subsidy alone."
  },
  "econ-v1-4.2-15-001": {
    "role": "necessary_for_task",
    "family": "trade",
    "reason": "The tariff evaluation depends on relevant price, production, consumption and stakeholder effects."
  },
  "econ-v1-4.2-15-002": {
    "role": "necessary_for_task",
    "family": "trade",
    "reason": "The question compares quota and tariff restrictions through their relevant trade-market relationships."
  },
  "econ-v1-4.2-15-003": {
    "role": "necessary_for_task",
    "family": "trade",
    "reason": "The task examines trade protection's effects on input-using firms within its international-market context."
  },
  "econ-v1-4.2-15-004": {
    "role": "necessary_for_task",
    "family": "trade",
    "reason": "The evaluation compares subsidy and tariff outcomes against the stated protection objectives."
  },
  "econ-v1-4.3-10-001": {
    "role": "optional_appropriate",
    "family": "trade",
    "reason": "A trade diagram can illustrate protection; the task primarily explains the conditional infant-industry argument."
  },
  "econ-v1-4.3-10-002": {
    "role": "necessary_for_task",
    "family": "trade",
    "reason": "The task analyzes economy-wide effects of employment protection through the relevant trade-market mechanism."
  },
  "econ-v1-4.3-10-003": {
    "role": "optional_appropriate",
    "family": null,
    "reason": "The task explains the national-security argument rather than prescribing a particular trade instrument or diagram."
  },
  "econ-v1-4.3-15-001": {
    "role": "optional_appropriate",
    "family": "trade",
    "reason": "A diagram may support protection costs; the infant-industry judgment also turns on learning and implementation conditions."
  },
  "econ-v1-4.3-15-002": {
    "role": "optional_appropriate",
    "family": "trade",
    "reason": "A trade diagram can support employment and consumer effects without replacing the wider justification."
  },
  "econ-v1-4.3-15-003": {
    "role": "optional_appropriate",
    "family": "externality",
    "reason": "An environmental diagram may support the selected trade-control example; no single instrument is prescribed."
  },
  "econ-v1-4.3-15-004": {
    "role": "necessary_for_task",
    "family": "trade",
    "reason": "Comparing protection costs and benefits requires the relevant trade-market and welfare relationships."
  },
  "econ-v1-4.4-10-001": {
    "role": "necessary_for_task",
    "family": "trade",
    "reason": "The task specifically explains trade creation following customs-union membership."
  },
  "econ-v1-4.4-10-002": {
    "role": "optional_appropriate",
    "family": "demand_supply",
    "reason": "A labour-market diagram may support factor mobility effects, but the explanation need not use a prescribed construction."
  },
  "econ-v1-4.4-10-003": {
    "role": "optional_appropriate",
    "family": "trade",
    "reason": "A trade diagram may illustrate increased competition; the task also concerns entry and firms' behavior."
  },
  "econ-v1-4.4-15-001": {
    "role": "necessary_for_task",
    "family": "trade",
    "reason": "The customs-union evaluation includes the relevant trade-creation and diversion relationships."
  },
  "econ-v1-4.4-15-002": {
    "role": "optional_appropriate",
    "family": null,
    "reason": "The question evaluates policy autonomy across integration arrangements, not a particular diagram."
  },
  "econ-v1-4.4-15-003": {
    "role": "optional_appropriate",
    "family": null,
    "reason": "The task concerns regional adjustment and institutions; appropriate graphical examples depend on the argument."
  },
  "econ-v1-4.4-15-004": {
    "role": "optional_appropriate",
    "family": "trade",
    "reason": "A trade diagram can support the static benchmark while the judgment compares it with dynamic gains."
  },
  "econ-v1-4.5-10-001": {
    "role": "necessary_for_task",
    "family": "currency",
    "reason": "The task directly explains export demand's effect on a floating exchange rate."
  },
  "econ-v1-4.5-10-002": {
    "role": "necessary_for_task",
    "family": "ad_as",
    "reason": "The question asks about domestic inflation after depreciation; the main graphical outcome is macroeconomic, with currency diagrams as possible support."
  },
  "econ-v1-4.5-10-003": {
    "role": "necessary_for_task",
    "family": "currency",
    "reason": "The task directly examines interest rates and floating-currency determination."
  },
  "econ-v1-4.5-15-001": {
    "role": "optional_appropriate",
    "family": "currency",
    "reason": "A currency or other relevant trade-adjustment illustration may support the argument; a determination diagram alone does not explain the trade balance."
  },
  "econ-v1-4.5-15-002": {
    "role": "optional_appropriate",
    "family": "currency",
    "reason": "A currency diagram may illustrate the given appreciation; stakeholder consequences require their own explanation."
  },
  "econ-v1-4.5-15-003": {
    "role": "optional_appropriate",
    "family": "currency",
    "reason": "A diagram can illustrate peg maintenance, while the task evaluates wider exchange-regime advantages and disadvantages."
  },
  "econ-v1-4.5-15-004": {
    "role": "optional_appropriate",
    "family": "currency",
    "reason": "A diagram may support the intervention mechanism; the judgment turns on the cause and costs of volatility."
  },
  "econ-v1-4.6-10-001": {
    "role": "optional_appropriate",
    "family": null,
    "reason": "The task explains current-account components and growth; no single diagram is necessary for the accounting and causal links."
  },
  "econ-v1-4.6-10-002": {
    "role": "optional_appropriate",
    "family": null,
    "reason": "The financing explanation concerns balance-of-payments entries rather than a prescribed graph."
  },
  "econ-v1-4.6-10-003": {
    "role": "optional_appropriate",
    "family": null,
    "reason": "The task examines productivity and external balances through several possible routes; diagrams depend on the selected route."
  },
  "econ-v1-4.6-15-001": {
    "role": "optional_appropriate",
    "family": null,
    "reason": "The current-account judgment concerns causes, financing and consequences; there is no universal graphical requirement."
  },
  "econ-v1-4.6-15-002": {
    "role": "optional_appropriate",
    "family": "ad_as",
    "reason": "A relevant macroeconomic or currency diagram may support the selected correction policy; the question does not prescribe one route."
  },
  "econ-v1-4.6-15-003": {
    "role": "optional_appropriate",
    "family": null,
    "reason": "The task analyzes changing balance-of-payments components over time rather than requiring one diagram."
  },
  "econ-v1-4.6-15-004": {
    "role": "optional_appropriate",
    "family": null,
    "reason": "A diagram may support a selected surplus consequence; the task evaluates causes and context more broadly."
  },
  "econ-v1-4.7-10-001": {
    "role": "optional_appropriate",
    "family": "ppc",
    "reason": "A PPC can illustrate future capacity constraints, while the explanation also concerns broader development outcomes."
  },
  "econ-v1-4.7-10-002": {
    "role": "optional_appropriate",
    "family": "externality",
    "reason": "An externality diagram may support transport benefits; the task includes access and development dimensions beyond that model."
  },
  "econ-v1-4.7-10-003": {
    "role": "optional_appropriate",
    "family": null,
    "reason": "The task concerns resource-management incentives and enforceability without specifying a particular diagram."
  },
  "econ-v1-4.7-15-001": {
    "role": "necessary_for_task",
    "family": "externality",
    "reason": "The environmental-policy evaluation needs relevant externality and market-intervention relationships."
  },
  "econ-v1-4.7-15-002": {
    "role": "optional_appropriate",
    "family": "externality",
    "reason": "An environmental diagram may support the growth argument; sustainability also involves wider ecological and institutional conditions."
  },
  "econ-v1-4.7-15-003": {
    "role": "optional_appropriate",
    "family": "ad_as",
    "reason": "A macroeconomic diagram may support a transition effect, but the development evaluation includes wider outcomes."
  },
  "econ-v1-4.7-15-004": {
    "role": "optional_appropriate",
    "family": null,
    "reason": "The question evaluates intergenerational costs and responsibilities; graphical illustrations depend on the argument."
  },
  "econ-v1-4.8-10-001": {
    "role": "optional_appropriate",
    "family": null,
    "reason": "The task examines a development indicator and what it omits; no graph is prescribed."
  },
  "econ-v1-4.8-10-002": {
    "role": "optional_appropriate",
    "family": null,
    "reason": "The task concerns purchasing-power comparison rather than currency-market determination."
  },
  "econ-v1-4.8-10-003": {
    "role": "optional_appropriate",
    "family": null,
    "reason": "The explanation concerns opportunities and development measurement; no single diagram is necessary."
  },
  "econ-v1-4.8-15-001": {
    "role": "optional_appropriate",
    "family": null,
    "reason": "The task evaluates a composite development measure without a required graphical construction."
  },
  "econ-v1-4.8-15-002": {
    "role": "optional_appropriate",
    "family": null,
    "reason": "The judgment compares development indicators and their purposes rather than a particular economic graph."
  },
  "econ-v1-4.8-15-003": {
    "role": "optional_appropriate",
    "family": null,
    "reason": "The task examines measurement differences across countries; diagrams are optional illustrations only."
  },
  "econ-v1-4.8-15-004": {
    "role": "optional_appropriate",
    "family": null,
    "reason": "The question evaluates the scope of development indicators; no prescribed graphical model follows."
  },
  "econ-v1-4.9-10-001": {
    "role": "necessary_for_task",
    "family": "poverty_cycle",
    "reason": "The task explicitly asks how low income perpetuates a poverty cycle."
  },
  "econ-v1-4.9-10-002": {
    "role": "optional_appropriate",
    "family": "ppc",
    "reason": "A capacity illustration may support the infrastructure explanation, but the development constraints are broader."
  },
  "econ-v1-4.9-10-003": {
    "role": "optional_appropriate",
    "family": null,
    "reason": "The task explains corruption and institutions; it does not require a particular diagram."
  },
  "econ-v1-4.9-15-001": {
    "role": "optional_appropriate",
    "family": "poverty_cycle",
    "reason": "A cycle diagram may support a human-capital mechanism; the development judgment is broader than that illustration."
  },
  "econ-v1-4.9-15-002": {
    "role": "optional_appropriate",
    "family": null,
    "reason": "The task evaluates institutional and complementary barriers; no single graphical mechanism is prescribed."
  },
  "econ-v1-4.9-15-003": {
    "role": "optional_appropriate",
    "family": "demand_supply",
    "reason": "A commodity-market diagram may support volatility analysis; the broader development judgment also needs institutional context."
  },
  "econ-v1-4.9-15-004": {
    "role": "optional_appropriate",
    "family": "poverty_cycle",
    "reason": "A cycle diagram may support an investment constraint, while the task compares finance with other barriers."
  },
  "econ-v1-4.10-10-001": {
    "role": "optional_appropriate",
    "family": "ad_as",
    "reason": "A capacity diagram may support an FDI mechanism; development effects extend beyond the macroeconomic illustration."
  },
  "econ-v1-4.10-10-002": {
    "role": "optional_appropriate",
    "family": "poverty_cycle",
    "reason": "A poverty-cycle illustration can connect access to credit with investment, productivity and income; the task also permits a complete verbal account of access, risk and opportunity."
  },
  "econ-v1-4.10-10-003": {
    "role": "optional_appropriate",
    "family": "ad_as",
    "reason": "A macroeconomic diagram may support export-led growth while development effects need their own explanation."
  },
  "econ-v1-4.10-15-001": {
    "role": "optional_appropriate",
    "family": "ad_as",
    "reason": "A macroeconomic diagram can support a chosen FDI effect; the strategy judgment includes wider development outcomes."
  },
  "econ-v1-4.10-15-002": {
    "role": "optional_appropriate",
    "family": "poverty_cycle",
    "reason": "A poverty-cycle illustration may support a selected aid mechanism without determining the overall evaluation."
  },
  "econ-v1-4.10-15-003": {
    "role": "optional_appropriate",
    "family": "trade",
    "reason": "A trade diagram may support the chosen policy instrument; the strategy evaluation does not prescribe a single instrument."
  },
  "econ-v1-4.10-15-004": {
    "role": "optional_appropriate",
    "family": null,
    "reason": "The question compares enterprise and project priorities across contexts; no single graphical model is mandatory."
  }
};
