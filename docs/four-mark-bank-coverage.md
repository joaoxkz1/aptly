# Original four-mark Practice bank: coverage and authoring audit

## Delivered content

The bank adds **96 original, complete questions** to the historical 302 entries: **80 diagram-plus-explanation tasks** and **16 written tasks**. All 96 passed the [individual source review](four-mark-source-audit.md). There are **398 stored definitions, 371 active and 27 retired** after the current-syllabus review of older entries. All 96 new entries remain active; no placeholder or retired entry counts toward that launch set.

| Unit | Diagram + explanation | Written | Total | Shared SL/HL | HL only |
| --- | ---: | ---: | ---: | ---: | ---: |
| Introduction | 6 | 2 | 8 | 8 | 0 |
| Microeconomics | 32 | 4 | 36 | 24 | 12 |
| Macroeconomics | 24 | 4 | 28 | 20 | 8 |
| Global economy | 18 | 6 | 24 | 20 | 4 |
| **Total** | **80** | **16** | **96** | **72** | **24** |

The representative first slice is retained in `four-mark-slice.ts`: 12 entries (9 diagram, 3 written) across all four units, including the original drought/wheat fixture, a monopoly task and a Phillips-curve task. The root reviewed the slice's schema and economics before the remaining 84 entries were authored. `four-mark.ts` aggregates the slice and eight additional content modules; `four-mark-builders.ts` materializes the existing root-owned contract schema.

## Topic and level distribution

Topic codes refer to `economics-2022-v1`, not the legacy taxonomy.

| Topic | Diagram | Written | Shared | HL |
| --- | ---: | ---: | ---: | ---: |
| 1.1 What is economics? | 6 | 0 | 6 | 0 |
| 1.2 Economic method | 0 | 2 | 2 | 0 |
| 2.1 Demand | 3 | 0 | 3 | 0 |
| 2.2 Supply | 2 | 0 | 2 | 0 |
| 2.3 Competitive equilibrium | 2 | 0 | 2 | 0 |
| 2.5 Demand elasticity | 2 | 1 | 3 | 0 |
| 2.6 Supply elasticity | 1 | 1 | 2 | 0 |
| 2.7 Government intervention | 4 | 1 | 5 | 0 |
| 2.8 Externalities/common resources | 6 | 0 | 6 | 0 |
| 2.9 Public goods | 0 | 1 | 1 | 0 |
| 2.11 Market power | 12 | 0 | 0 | 12 |
| 3.1 Activity/circular flow | 1 | 0 | 1 | 0 |
| 3.2 AD/AS | 8 | 0 | 8 | 0 |
| 3.3 Macro objectives | 4 | 2 | 2 | 4 |
| 3.4 Inequality/poverty | 2 | 1 | 3 | 0 |
| 3.5 Monetary policy | 4 | 0 | 2 | 2 |
| 3.6 Fiscal policy | 3 | 1 | 2 | 2 |
| 3.7 Supply-side policy | 2 | 0 | 2 | 0 |
| 4.1 Benefits of trade | 3 | 0 | 1 | 2 |
| 4.2 Protection | 5 | 0 | 5 | 0 |
| 4.5 Exchange rates | 6 | 0 | 6 | 0 |
| 4.6 Balance of payments | 0 | 2 | 0 | 2 |
| 4.7 Sustainability | 1 | 0 | 1 | 0 |
| 4.8 Development measures | 0 | 1 | 1 | 0 |
| 4.9 Development barriers | 1 | 1 | 2 | 0 |
| 4.10 Development strategies | 2 | 2 | 4 | 0 |

This launch set does not add four-mark entries to 2.4, 2.10, 2.12, 4.3 or 4.4. Existing questions in those topics remain in the bank. A target of 96 does not imply four-mark coverage of every syllabus outcome.

### Eligibility decisions

- The 12 HL micro questions test S1 §2.11 market-power outcomes: monopoly, perfect competition, monopolistic competition, profit/loss, entry, allocative efficiency and natural-monopoly economies of scale. Proposed standalone revenue-maximization, generic diseconomies-of-scale and old cost-theory tasks were removed during planning because the checked source did not establish them as the intended current outcomes.
- The eight HL macro questions test four Phillips-curve outcomes, two money-market interest-rate outcomes, one crowding-out diagram and one written multiplier mechanism. Ordinary AD/AS monetary/fiscal transmission remains shared.
- Both qualitative Lorenz interpretation tasks are shared. Neither asks students to construct a curve from income quintiles; that construction outcome is HL.
- The four HL global questions test two comparative-advantage/consumption-possibility PPC outcomes and two written current-account adjustment mechanisms. Qualitative tariff/quota/subsidy effects, welfare-area interpretation and fixed-rate intervention stay shared; numerical trade-protection calculations were not added.
- An initially drafted equity item in topic 2.12 was replaced during authoring with a shared 2.7 subsidy-stakeholder question after the current taxonomy's HL boundary was checked. No question was relabeled solely to meet the 72/24 target.

See [assessment basis](diagram-assessment-basis.md) for the October 2022 amended guide, indexed official 2026 instructions and recent IB-authored markschemes. These are original Aptly assessment tasks, not copied official questions or markschemes.

## Drawing-family coverage

| Existing supported family | New questions |
| --- | ---: |
| PPC | 8 |
| Demand/supply | 14 |
| Cost/revenue | 12 |
| AD/AS | 14 |
| Phillips | 4 |
| International trade | 6 |
| Currency market | 6 |
| Externality | 7 |
| Circular flow | 1 |
| Lorenz | 2 |
| Money market | 3 |
| Poverty cycle | 3 |

No new drawing family was introduced to reach the target. Multi-panel PPC and elasticity comparisons can be supplied in one image. Poverty-cycle criteria require causal links and an intervention's position, with no price/quantity axes; circular flow requires the relevant directed income/spending/leakage relationships. Welfare/profit/revenue areas are required only where the question explicitly tests them.

## Contract and provenance

Every entry has a stable `econ-v1-{topic}-4-{sequence}` ID, a complete hypothetical stimulus, topic/unit/level/skill metadata, an explicit private format and `economics-four-mark-blueprint-v2` blueprint. `bankVersion` stays `economics-question-bank-v1`. All paper values are `custom` and part values `unknown`; the diagram framework name identifies the supported 2+2 engine without claiming that the original question appeared in Paper 2. Stored v1 questions and results retain their historical versions.

All 80 diagram blueprints contain task-specific 0/1/2 boundaries for both diagram and explanation, labels, relationships, outcomes, permitted mechanisms, context constraints and valid alternatives. The 16 written questions use two explicit developed explanations, each 0–2, whose awards add to 0–4. Evaluation, an outside example and a conclusion are not general requirements. Full-credit diagram descriptions and full-credit explanation descriptions are individually distinct across all 80 tasks.

The root-owned rules apply within the one supported part: within-part error carry-forward, an overall 2/4 ceiling for qualifying incompatible mechanisms, and an overall 3/4 labeling ceiling enabled for all 80 supported 2+2 tasks. This explicitly adopts the verified Paper 2 convention for these custom contracts; it is not an IB-issued markscheme for them. A ceiling is never an additional subtraction for the same omission. A movement arrow is not essential when geometry and explanation establish direction; directed flow/cycle relationships still need to convey causality.

`qualityStatus: curated` denotes deliberately selected authored content. **All 96 private review records are `author: Aptly`, `status: source_reviewed`, reviewed 2026-09-15**, with a per-ID source-audit link and `independentlyTeacherValidated: false`. No numerical teacher marks or model accuracy claims have been fabricated.

## Semantic and duplicate audit

An author-level review compared every question with its supplied context, syllabus eligibility, drawing family, curve ordering/direction, output or area boundaries, full/partial credit and accepted alternatives. This is an authoring check, separate from independent teacher validation.

| Content group | Economic/coherence checks |
| --- | --- |
| Six introductory PPC tasks | Along-frontier trade-off versus unused capacity; inward loss versus sector-specific pivot; current investment sacrifice versus future capacity; increasing marginal sacrifice with heterogeneous resources. |
| Shared micro diagrams | Shift versus movement; complements/substitutes/inferior goods; current storage versus future expectations; binding controls and correct shortage/surplus gaps; elastic revenue data (0.9 × 1.2 > 1); relative tax incidence; producer subsidy price wedge; correct private/social cost/benefit ordering and intervention target. |
| Twelve HL market-power tasks | Price on demand versus MR=MC output; horizontal price-taking revenue versus differentiated/monopoly demand; profit/loss rectangle bounds; no imposed shutdown question; normal profit includes opportunity cost; tangency consistent with MR=MC; free entry acts through industry supply or individual demand as appropriate; natural-monopoly LRAC comparison uses Q and Q/2. |
| Macro diagrams | Consumption/investment/government/service-export demand channels; cost shocks versus capacity shifts; actual versus potential output; wage-adjustment assumptions explicit; Lorenz dominance versus crossing; money supply versus transactions demand; Phillips movements versus shifts and unchanged natural-rate assumptions; fiscal crowding-out channel. |
| Global diagrams | Imports are domestic demand minus domestic supply; quota binds below autarky; subsidy keeps Pw fixed while the country remains an importer; tariff revenue uses post-tariff imports; two welfare-loss triangles exclude transfers; PPC opportunity costs and stated trade bundle are mathematically consistent; currency quote direction and reserve purchase/sale directions agree; development loops identify distinct financial, collateral and health constraints. |
| Sixteen written tasks | Two separate developed explanations per prompt; stimulus contains all needed facts; no visual deficit; relative/absolute poverty thresholds distinguish proportional from real changes; initial trade balance and elasticity assumptions make J-curve reasoning self-contained. |

Some tasks deliberately share a model while testing different mistakes: wheat harvest versus copper withholding; subsidy affordability versus government opportunity cost; monopoly versus price-taking profit; monetary-policy AD transmission versus money-market rate determination; a general saving trap versus collateral and health feedback. They are retained because the causal mechanism, interpretation, curve geometry or required outcome changes, rather than only the place/product name.

Automated checks found 96 unique IDs and prompt strings, no lexical near-duplicate pairs at the repository's 0.86 threshold (also against the existing bank), 80 distinct diagram full-credit descriptors and 80 distinct explanation full-credit descriptors. Lexical checks do not prove the absence of semantic duplication. The source review resolves task economics, conventions and contract scope. Independent authentic-work calibration remains useful for empirical agreement, not as a substitute for that review or a completion blocker.

## Validation

`four-mark-bank.test.ts` verifies distribution, full-bank schema validity, SL filtering of HL outcomes, honest provenance and JSON round-trip preservation, complete criteria, family-specific absence of universal axes/areas, the scoped drought contract and duplicate detection. Existing bank tests verify the combined 398-entry bank and its old mark distributions. Type checking covers all new modules.

Authoring validation on 2026-09-15:

- `npx vitest run lib/assessment/question-bank/economics-v1/four-mark-bank.test.ts lib/assessment/question-bank/economics-v1/question-bank.test.ts`: **13 tests passed in 2 files**. The initial sandboxed run could not resolve the project through esbuild; the authorized run outside that restriction passed.
- `npx eslint lib/assessment/question-bank/economics-v1/four-mark*.ts`: **passed**.
- `npx tsc --noEmit --pretty false`: **passed** across the repository at this integration point.

Tests are deterministic engineering checks. They use no paid provider calls and establish neither handwriting recognition quality nor teacher agreement. Calibration and rollout remain governed by the assessment basis and the project's separate pilot/calibration documents.
