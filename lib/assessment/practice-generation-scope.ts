import type { EconomicsCourseLevel } from "./course-level";
import { isCurrentTopLevelHlTopic, type SYLLABUS_TOPICS } from "./taxonomy";

type CurrentTopic = Exclude<(typeof SYLLABUS_TOPICS)[number], "unknown">;
type Ao3Scope = Readonly<{
  kind: "direct" | "cross";
  hint: string;
  sourcePages: string;
  hlOnly?: boolean;
}>;

// Original authoring scopes, grounded in the October 2022 guide's AO3 rows.
// See docs/practice-ao3-scope.md. These restrict adaptive fallback only:
// individually reviewed curated cross-topic questions can remain available.
export const PRACTICE_AO3_SCOPES = {
  "1.1": null,
  "1.2": null,
  "2.1": null,
  "2.2": null,
  "2.3": { kind: "cross", sourcePages: "26–31", hint: "Evaluate when competitive-market allocation improves welfare and when a specified intervention can improve it. Keep equilibrium and surplus central; explicitly name the intervention or market failure, crossing into 2.7/2.8 policy evaluation. Do not evaluate curve shifts alone." },
  "2.4": { kind: "direct", sourcePages: "27", hint: "Evaluate rational-choice assumptions, a defined nudge or choice architecture, or profit maximization against another prescribed business objective." },
  "2.5": { kind: "direct", sourcePages: "28", hint: "Evaluate the usefulness of PED for a firm's pricing decision or a government policy. Keep this shared scope: do not require YED business or sectoral applications, or XED." },
  "2.6": { kind: "cross", sourcePages: "28–30", hint: "Evaluate a specified housing or market intervention whose effectiveness depends on supply responsiveness, capacity and adjustment time. Explicitly cross into 2.7 policy and stakeholder evaluation. Evaluate the policy, not PES determinants alone." },
  "2.7": { kind: "direct", sourcePages: "29–30", hint: "Evaluate a specified price control, indirect tax, subsidy or direct provision through market and stakeholder consequences. Keep the shared qualitative scope; do not require nudges or numerical extensions." },
  "2.8": { kind: "direct", sourcePages: "30–31", hint: "Evaluate a policy or combination addressing a specified externality or common-resource problem, considering effectiveness and stakeholder consequences. Match the production or consumption mechanism and private versus social effects." },
  "2.9": { kind: "direct", sourcePages: "31", hint: "Evaluate direct public provision versus contracting out for a specified public good. Do not assess only rivalry, excludability, technological change or why free riding occurs." },
  "2.10": { kind: "direct", sourcePages: "31", hint: "Evaluate government or private responses to a specified adverse-selection or moral-hazard problem. Explanation of asymmetric information alone is insufficient." },
  "2.11": { kind: "direct", sourcePages: "32–33", hint: "Evaluate market power, competition, efficiency versus variety, large-firm benefits and risks, or a prescribed regulatory response. Do not require price discrimination, a legacy kinked-demand model or standalone cost-theory extensions." },
  "2.12": { kind: "cross", sourcePages: "33, 39–40", hint: "Evaluate a specified response to market-generated inequality, weighing distributional effects and economic consequences. Explicitly cross into 3.4 inequality impacts, taxation or policy evaluation. Do not merely evaluate why market incomes differ." },
  "3.1": { kind: "direct", sourcePages: "36", hint: "Evaluate GDP/GNI or alternative indicators for a stated comparison of economic well-being over time or between countries. Do not evaluate circular flow or GDP's ability to identify the business cycle alone." },
  "3.2": { kind: "direct", sourcePages: "37, 41–43", hint: "Evaluate implications of Keynesian versus monetarist/new-classical assumptions for equilibrium adjustment or a specified demand-management response. Do not merely evaluate which curve shifts." },
  "3.3": { kind: "direct", sourcePages: "37–38", hint: "Evaluate growth's consequences, relative unemployment versus inflation costs, or a specified conflict between macroeconomic objectives. Do not evaluate standalone deflation causes or costs. Keep the shared scope without requiring formal Phillips-curve trade-offs." },
  "3.4": { kind: "direct", sourcePages: "39–40", hint: "Evaluate inequality's economic or social effects, or the effectiveness of a specified tax, transfer or opportunity-improving policy. Lorenz/Gini may support reasoning; do not require quintile construction or HL tax calculations." },
  "3.5": { kind: "direct", sourcePages: "41–42", hint: "Evaluate expansionary or contractionary monetary policy for a stated macroeconomic problem, including transmission constraints. Use the shared AD/AS policy scope; do not require money-market tools, bank creation or quantitative easing." },
  "3.6": { kind: "direct", sourcePages: "42–43", hint: "Evaluate fiscal policy for a stated gap or objective, considering targeting, timing and relevant constraints. Keep this shared scope without requiring multiplier theory, crowding out or automatic stabilizers." },
  "3.7": { kind: "direct", sourcePages: "43–44", hint: "Evaluate a specified market-based or interventionist supply-side policy against its objective and implementation constraints. Explain its actual transmission rather than assuming every policy raises productive capacity." },
  "4.1": { kind: "cross", sourcePages: "45–47, 52–53", hint: "Evaluate whether greater trade openness improves welfare or development in a stated setting. Explicitly cross into 4.3 free trade versus protection or 4.10 strategy effectiveness. Keep the shared scope: do not require comparative advantage or merely evaluate a list of trade benefits." },
  "4.2": { kind: "direct", sourcePages: "46", hint: "Evaluate a specified tariff, quota, subsidy/export subsidy or administrative barrier through market and stakeholder effects. Use shared qualitative welfare reasoning, without requiring the HL numerical extension." },
  "4.3": { kind: "direct", sourcePages: "46–47", hint: "Evaluate free trade against protection for a specified policy objective, industry or country. Test the choice and trade-offs rather than asking for a list of arguments alone." },
  "4.4": { kind: "direct", sourcePages: "47–48", hint: "Evaluate advantages and disadvantages of a specified trading bloc. Keep shared scope without requiring trade creation/diversion or monetary-union evaluation. WTO objectives and functions alone are not an evaluative task." },
  "4.5": { kind: "direct", sourcePages: "48–50", hint: "Evaluate consequences of an exchange-rate change for named economic indicators or stakeholders. Keep shared scope without requiring fixed-versus-floating regime comparison, Marshall–Lerner or J-curve reasoning." },
  "4.6": { kind: "direct", hlOnly: true, sourcePages: "49–50", hint: "Evaluate implications of a persistent current-account deficit or surplus, or effectiveness of measures to correct a persistent deficit. This is HL-only; do not substitute an essay on account definitions or accounting identities." },
  "4.7": { kind: "cross", sourcePages: "30–31, 37–38, 51–53", hint: "Evaluate specified environmental or development policies, or the growth–environment conflict, with sustainability central. Explicitly cross into 2.8 policy effectiveness, 3.3 growth consequences/conflicts or 4.10 development strategies. Do not require the HL sustainability–poverty relationship or standalone normative natural-capital analysis." },
  "4.8": { kind: "direct", sourcePages: "51", hint: "Evaluate measures of development for a stated purpose or assess the relationship between growth and development. Compare what indicators reveal and omit, rather than producing a descriptive catalogue." },
  "4.9": { kind: "direct", sourcePages: "51–52", hint: "Evaluate the relative significance of specified barriers to growth or development in a stated country/context. Poverty-cycle links may support the argument, but the demand must go beyond explaining the cycle." },
  "4.10": { kind: "direct", sourcePages: "52–53", hint: "Evaluate a specified development strategy, intervention versus market approaches, or progress toward selected SDGs using appropriate countries. Choose relevant shared mechanisms without importing an HL-only requirement." },
} as const satisfies Record<CurrentTopic, Ao3Scope | null>;

export function getPracticeAo3Scope(topicCode: string, courseLevel: EconomicsCourseLevel):
  (Ao3Scope & { levelRelevance: "shared_sl_hl" | "hl_only" }) | null {
  if (!Object.hasOwn(PRACTICE_AO3_SCOPES, topicCode)) return null;
  const scope: Ao3Scope | null = PRACTICE_AO3_SCOPES[topicCode as CurrentTopic];
  if (scope === null) return null;
  const hlOnly = scope.hlOnly === true || isCurrentTopLevelHlTopic(topicCode);
  if (courseLevel === "sl" && hlOnly) return null;
  return { ...scope, levelRelevance: hlOnly ? "hl_only" : "shared_sl_hl" };
}
