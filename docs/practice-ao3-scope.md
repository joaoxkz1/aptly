# Safe scope for 15-mark Practice generation

**Source review and implementation: 15 September 2026.** These original authoring hints are implemented at the adaptive-generation boundary. They are not IB-authored question text or a schema change.

The [October 2022 Economics guide](https://www.yellowsubmariner.com/uploads/1/2/2/5/12253383/s-_2024.pdf), printed p59, limits examination command terms to the syllabus outcome's stated assessment-objective level or a lower level. AO3 concerns synthesis/evaluation. A 15-mark fallback must therefore name an actual evaluative demand; adding “evaluate” to an AO2 explanation is insufficient. See [the edition/source comparison](economics-syllabus-source-review.md) for provenance and current applicability. Printed page + 6 gives the one-based PDF page.

## Implemented gate

- **Unsupported at both levels:** `1.1`, `1.2`, `2.1`, `2.2`.
- **Additionally unsupported at SL:** `4.6`.
- The existing entirely-HL topic gate still applies to `2.4`, `2.10`, `2.11`, `2.12`.
- Other topics support 15 marks only inside the explicit scope below. An unsupported fallback may offer an eligible lower mark format or a different topic; it must not silently generate a policy essay under the original topic label.

The pure [scope map/helper](../lib/assessment/practice-generation-scope.ts) is applied in [the Practice route](../app/api/practice/route.ts) **after an eligible curated selection has failed and before quota reservation or provider work**. Exact idempotent replay, eligible saved-question reuse and curated cross-topic exceptions remain earlier in the route. Target resolution and the browser's request/dedup client are unchanged. Unsupported general fallbacks return HTTP 422 `no_supported_question`; focused fallbacks use `unsupported_focus`.

[The generator input](../lib/ai/practice-schema.ts) receives the selected hint and requires named cross-topic evaluation to appear in the actual question. Its input builder rejects an unavailable or incorrectly levelled 15-mark scope. The route stamps 4.6 adaptive essays `hl_only`; other mixed topics use the shared safe route even for HL students. Optional HL routes in the reference table below remain valid source scope for separately reviewed curated questions, but are not selected by this initial adaptive map.

This is a **conservative Aptly authoring gate**, not a claim that IB forbids every integrated essay mentioning scarcity, demand or supply. Those are useful supporting concepts across the course. Their foundational rows do not independently justify an unrestricted 15-mark fallback.

**Direct** means an AO3 outcome occurs in the selected topic. **Cross** means the prompt must explicitly test the named AO3 intersection while keeping the selected topic central. Cross-topic support must appear in the question and private guidance, not exist only as an invisible rationale. A generic title, an inquiry suggestion, or a theory-of-knowledge question does not itself supply an AO3 examination outcome.

## All 31 current topics

| Topic | Support | Original generator scope hint | Boundary / printed source pages |
| --- | --- | --- | --- |
| **1.1** | Unsupported | Do not generate a standalone 15-mark evaluation of scarcity, opportunity cost, PPCs, economic systems or circular flow. | Foundational AO2/AO4, pp22–23. |
| **1.2** | Unsupported | Do not generate a standalone 15-mark evaluation of economic methodology, positive/normative statements or historical schools. | AO2; TOK discussion prompts are distinct, pp23–24. |
| **2.1** | Unsupported | Keep demand laws, determinants and curve changes in eligible explanatory formats. | AO2/AO4, pp25–26. Do not disguise an intervention or market-power essay as basic demand. |
| **2.2** | Unsupported | Keep supply laws, determinants and curve changes in eligible explanatory formats. | AO2/AO4, p26. A policy evaluation should select its intervention topic explicitly. |
| **2.3** | Cross, shared | Evaluate when competitive-market allocation improves welfare and when a specified intervention can improve the outcome. | Equilibrium/surplus must drive analysis; name the intervention or market failure. Cross 2.7/2.8 AO3, pp29–31; equilibrium pp26–27. No standalone evaluation of simultaneous shifts. |
| **2.4** | Direct, HL | Evaluate rational-choice assumptions, a defined nudge/choice architecture, or profit maximization against another prescribed business objective. | p27. Do not require historical price-discrimination theory. |
| **2.5** | Direct, shared; optional HL scope | Evaluate the usefulness of PED for a firm's pricing decision or a government policy. At HL, YED may inform business or sectoral decisions. | p28. Do not turn YED definitions into a shared business-planning requirement; no XED. |
| **2.6** | Cross, shared | Evaluate a specified housing/market intervention whose effectiveness depends on supply responsiveness, capacity and adjustment time. | Cross 2.7 policy/stakeholder evaluation, pp29–30; PES p28. Evaluate the policy, not PES determinants alone. |
| **2.7** | Direct, shared | Evaluate a specified price control, indirect tax, subsidy or direct provision through market and stakeholder consequences. | pp29–30. Consumer nudges are HL; numerical extensions are not required in this essay. |
| **2.8** | Direct, shared | Evaluate a policy or combination addressing a specified externality/common-resource problem, including effectiveness and stakeholder consequences. | pp30–31. Match production/consumption mechanism and distinguish private from social effects. |
| **2.9** | Direct, shared | Evaluate direct public provision versus contracting out for a specified public good. | p31. Do not assess only whether technology changes rivalry/excludability or only why free riding occurs. |
| **2.10** | Direct, HL | Evaluate government or private responses to a specified adverse-selection or moral-hazard problem. | p31. Explanation of asymmetric information alone is insufficient. |
| **2.11** | Direct, HL | Evaluate market power, competition, efficiency/variety, large-firm benefits and risks, or a prescribed regulatory response. | pp32–33. No required price discrimination, legacy kinked-demand model or generic standalone cost-theory extension. |
| **2.12** | Cross, HL topic | Evaluate a specified response to market-generated inequality, weighing distributional effects and economic consequences. | Selected topic p33 is AO2; explicitly cross 3.4 inequality impacts/taxation/policies, pp39–40. Do not merely evaluate why market incomes differ. |
| **3.1** | Direct, shared | Evaluate GDP/GNI or alternative indicators for a stated comparison of economic well-being over time or between countries. | p36. Do not evaluate the circular-flow diagram or GDP's ability to identify the business cycle alone. |
| **3.2** | Direct, shared | Evaluate implications of Keynesian versus monetarist/new-classical assumptions for equilibrium adjustment or a specified demand-management response. | p37; policy intersection pp41–43. Do not merely evaluate which curve shifts. |
| **3.3** | Direct, shared; optional HL scope | Evaluate growth's consequences, relative unemployment/inflation costs, or a specified conflict between macroeconomic objectives. | pp37–38. Standalone deflation causes/costs remain AO2. Formal Phillips-curve trade-offs are HL. |
| **3.4** | Direct, shared | Evaluate inequality's economic/social effects or the effectiveness of a specified tax, transfer or opportunity-improving policy. | pp39–40. Lorenz/Gini are supporting evidence; no compulsory quintile construction for SL. |
| **3.5** | Direct, shared; optional HL scope | Evaluate expansionary/contractionary monetary policy for a stated macroeconomic problem, including transmission constraints. | pp41–42. SL uses ordinary policy/AD–AS reasoning; money-market tools, bank creation and QE require HL scope. |
| **3.6** | Direct, shared; optional HL scope | Evaluate fiscal policy for a stated gap/objective, considering targeting, timing and relevant constraints. | pp42–43. Multiplier, crowding out and automatic stabilizers may be required only in HL scope. |
| **3.7** | Direct, shared | Evaluate a specified market-based or interventionist supply-side policy against its objective and implementation constraints. | pp43–44. Explain the actual transmission rather than assuming every policy raises productive capacity. |
| **4.1** | Cross, shared; direct HL scope | Evaluate whether greater trade openness improves welfare/development in a stated setting. At HL, evaluate limitations of comparative advantage. | Shared cross 4.3 free trade/protection, p47, or 4.10 strategy effectiveness, pp52–53; HL direct p46. Do not simply “evaluate benefits of trade.” |
| **4.2** | Direct, shared | Evaluate a specified tariff, quota, subsidy/export subsidy or administrative barrier through market and stakeholder effects. | p46. Qualitative welfare evaluation is shared; do not require the HL numerical extension. |
| **4.3** | Direct, shared | Evaluate free trade against protection for a specified policy objective, industry or country. | pp46–47. Test the choice/trade-off, not a list of arguments alone. |
| **4.4** | Direct, shared; optional HL scope | Evaluate advantages/disadvantages of a specified trading bloc. HL may test trade creation/diversion or monetary-union evaluation. | pp47–48. WTO objectives/functions alone are AO2; shared tasks must not require HL mechanisms. |
| **4.5** | Direct, shared; optional HL scope | Evaluate consequences of an exchange-rate change for named economic indicators/stakeholders. HL may compare fixed and floating regimes. | pp48–49. Shared trade-balance discussion must not require Marshall–Lerner/J-curve reasoning. |
| **4.6** | Direct, HL only for 15 marks | Evaluate implications of a persistent current-account deficit/surplus or effectiveness of measures to correct a persistent deficit. | pp49–50. Shared account definitions, components and accounting relationships do not support a 15-mark fallback here. |
| **4.7** | Cross, shared | Evaluate specified environmental/development policies, or the growth–environment conflict, with sustainability as the central objective. | Cross 2.8 pp30–31, 3.3 pp37–38, or 4.10 pp52–53; 4.7 p51 alone is AO2. No standalone normative natural-capital essay; sustainability–poverty linkage is HL. |
| **4.8** | Direct, shared | Evaluate measures of development for a stated purpose or assess the relationship between growth and development. | p51. Compare what indicators reveal and omit; avoid a descriptive catalogue. |
| **4.9** | Direct, shared | Evaluate the relative significance of specified barriers to growth/development in a stated country/context. | pp51–52. Poverty-cycle links can support the argument, but the demand must go beyond explaining the cycle. |
| **4.10** | Direct, shared | Evaluate a specified development strategy, intervention versus market approaches, or progress toward selected SDGs using appropriate countries. | pp52–53. Choose relevant mechanisms/diagrams from other sections; do not import an HL-only requirement into shared scope. |

## Required behavior of a scoped fallback

Use the chosen hint as a bounded instruction, not as content the student must reproduce. Build the question and private guidance around the same named evaluative decision; require relevant real-world application in the Paper 1(b)-style prompt. Preserve legitimate alternative arguments, models and conclusions. Required diagrams remain a separate question-specific contract decision owned by root.

For a weakness-focused request, reject or offer a different format if satisfying the weakness would leave the permitted AO3 scope. For example, “confuses a movement along demand with a shift” should not silently become a 15-mark environmental-tax essay. A general request under a **Cross** topic can use its explicit intersection, but must not claim the selected foundational outcome alone mandates AO3.

These hints establish source-supported authoring scope. They do not establish official examiner approval of generated questions or empirical marking accuracy.
