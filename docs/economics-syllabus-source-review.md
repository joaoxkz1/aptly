# Economics syllabus and assessment source review

Reviewed **15 September 2026**. This is a source comparison and repository impact report. It introduces no grading contract, migration, schema, numerical ceiling or claim of teacher calibration. No paid model or image-generation calls were made.

## Conclusion and source hierarchy

Use the Economics guide published February 2020, **updated October 2022**, for current practice. The [official 2026 examiner instructions](https://ibpublishing.ibo.org/exinst/apps/exinst/pdf.html?chapter=3&doc=EX_instructions_2026_e&part=10) explicitly identify that revision. The accessible amended guide has “First assessment 2024” on its cover and assessment outlines. This is consistent with the Paper 2 amendment; it does not establish a replacement topic taxonomy.

The [official 2025 SL subject brief](https://ibo.org/globalassets/new-structure/programmes/dp/pdfs/sl-economics-en.pdf) still identifies the course's first assessments as 2022. Its short overview also lists 2.4 without an HL qualification. That abbreviated overview must not override the detailed guide's outcome-level restrictions. The [IB curriculum-update list](https://ibo.org/university-admission/latest-curriculum-updates), updated March 2026, contains no newer Economics replacement. This absence is corroboration, not the sole evidence for currency.

The source distinction matters: the guide PDFs below contain IB-authored material but are **third-party-hosted copies**. Metadata, publication pages and agreement with official current instructions support their identity; they are not authenticated downloads from the Programme Resource Centre.

| Identifier | Actual access and edition | Page convention |
| --- | --- | --- |
| **G20** — [school-hosted May 2020 guide](https://dp.uwcea.org/docs/Economics%20Subject%20Guide.pdf) | Downloaded; publication page, full syllabus, relevant external assessment and command-term sections read. 84 PDF pages. | Printed page + 6 = one-based PDF page. |
| **G22** — [October 2022 amended guide](https://www.yellowsubmariner.com/uploads/1/2/2/5/12253383/s-_2024.pdf) | Downloaded; publication page lists May/August/October 2020 and October 2022 updates. Full syllabus and assessment comparison; relevant tables visually inspected, including bold HL distinctions. 84 PDF pages. | Same +6 offset. PDF creation date 6 October 2022. |
| **G13** — [CUNY-hosted older guide](https://www.cuny.edu/wp-content/uploads/sites/4/page-assets/about/administration/offices/registrar/resources/international-baccalaureate/IB-Economics.pdf) | Downloaded; published November 2010, updated November 2011 and August 2012; first examinations 2013. Relevant elasticity and market-structure sections read and visually inspected. 106 PDF pages. | Printed page + 8 = one-based PDF page. |
| **E26** — [official 2026 examiner instructions](https://ibpublishing.ibo.org/exinst/apps/exinst/index.html?chapter=3&doc=EX_instructions_2026_e&part=10) | Indexed official text retrieved, including guide-revision reference and relevant script-marking passages. Direct page retrieval remained unreliable. Root separately owns the detailed examiner-rule reconciliation. | Web section headings; do not invent printed page references for HTML. |
| **ASW25** — [assessed student work, November 2025 update](https://doxxib.pp.ua/IB%20ASSESSED%20STUDENT%20WORK/Group%203%20-%20Individuals%20%26%20Societies/Economics%20Assessed%20Student%20Work%202022%20%28Update%20Nov2025%29.pdf) | Indexed IB-authored appendix, printed p7, read; direct retrieval returned 502. It records removal of the old separate HL Paper 2 samples in February 2025. Individual student samples were **not** read in this review. | Printed appendix p7 only. Corroboration, not a source for unseen student performance. |

ASW25 explicitly connects its revised shared SL/HL Paper 2 heading to the current first-assessment-2024 guide. It therefore independently explains the otherwise confusing 2022/2024 cover labels. No claim is made about future examinations beyond the applicable sources inspected.

### Reproducible source identities

SHA-256 hashes of downloaded PDF bytes:

```text
G20 3485128183753761a92de4d70587ad3d88c2719d955c70a19f95f02e590fa378
G22 4a485a8f95e56fa70c85141f43a6467c8fdd995df4ddff1a434a1780e3cb9c98
G13 f7fa48e3555a05dc25d1262259ad19689b9c1fcea9634dc9122196cd5dcd0964
```

A further school-hosted PRC-named PDF was checked and proved to be an earlier February 2020 export, not evidence of a newer edition. Filenames and recent search-result dates were not treated as revision dates.

## G20 → G22 comparison

Comparison covered every syllabus page, printed **20–54**, using normalized text and a second word/font-weight comparison so that a change to bold HL text could not disappear in plain extraction. Only printed **20 and 27** differed: the 2.4 heading/outline acquired an explicit HL qualifier. All three underlying 2.4 outcomes already carried that qualifier in G20. There is no basis for claiming October 2022 newly moved previously shared 2.4 content to HL.

The following are the relevant external-assessment changes. References are to [G22](https://www.yellowsubmariner.com/uploads/1/2/2/5/12253383/s-_2024.pdf); full band boundaries remained unchanged.

| Location | Verified difference |
| --- | --- |
| pp57–58, 61–62 | Shared SL/HL Paper 2 excludes HL extensions. The old separate-question possibility was removed. |
| pp63–64, Paper 1(a)/(b) | No descriptor changes. |
| pp64–65, Paper 2(g), 1–3 | Incorrect terminology and copied-only stimulus were made explicit. |
| p65, Paper 2(g), 4–6 | Superficial evaluation must also be relevant. |
| p65, Paper 2(g), 13–15 | Thorough understanding/addressing of demands was made explicit. |
| p66, Paper 3(b), 5–6 | Source support is inadequate; evaluation evidence is limited and unbalanced. |
| pp74–75, commands | No changes. Explain remains AO2: “Give a detailed account including reasons or causes.” |

All remaining descriptors in these frameworks are unchanged. Paper 1 continues to use appropriate diagrams within its best-fit descriptors. The source does not introduce Aptly's per-ID roles, an additive diagram score for essays, or a universal numerical essay-omission cap.

### Concrete repository implications sent to root

- The 24 original HL four-mark tasks can be HL practice; they must not be presented as **current Paper 2 examination content**. Pre-2024 Paper 2 examples are historical evidence whose original scope must remain explicit.
- `lib/ai/assessment-schema.ts` already rejects copied stimulus as meaningful application and describes Paper 3(b)'s five strands. Its compact framework instructions lacked the amended band distinctions above. Proposed additions were sent to root for integration, preserving holistic compensation and avoiding hard per-strand limits.
- `lib/assessment/bands.ts` requires no boundary change from this edition comparison.
- G22 p59 constrains exam command terms by the syllabus assessment-objective depth. A broad original essay spanning several outcomes is different from claiming an AO2-only sub-outcome alone is an official AO3 examination demand. The per-ID essay audit was asked to check material cases rather than mechanically reject every cross-topic essay.

## Outcome-level lookup for the bank reviews

These compact locators record the distinctions used to review the 96 four-mark entries and 211 existing essays. The relevant syllabus wording and bold classifications are unchanged between [G20](https://dp.uwcea.org/docs/Economics%20Subject%20Guide.pdf) and G22, except the 2.4 heading clarification above. **S** = shared; **H** = HL extension. They identify tested knowledge, not keywords that automatically classify an entire question.

| Printed pages | S | H |
| --- | --- | --- |
| 25–26 | Demand/supply changes | Formal utility, income/substitution and diminishing-returns explanations |
| 27 | — | 2.4 rationality, behavioural intervention, business objectives |
| 27–28 | PED/PES determinants; YED meaning | Straight-line PED variation; commodity/manufacture comparisons; YED business/sector applications |
| 29–30 | Qualitative intervention/externalities | Specified numerical welfare/stakeholder tasks; nudges |
| 31–33 | Public goods | Asymmetric information; market power; 2.12 distribution |
| 35–38 | Circular flow; AD/AS; growth | Phillips curves; specified weighted-index/debt extensions |
| 39–40 | Lorenz interpretation | Quintile construction; specified tax calculations |
| 41–43 | AD/AS policy effects | Money-market tools/QE; multiplier; crowding out; automatic stabilizers |
| 45–48 | Qualitative protection; currency intervention | Comparative advantage; specified trade calculations; creation/diversion; monetary-union evaluation |
| 48–50 | Currency consequences; basic BOP accounts | Regime comparison; persistent-imbalance implications/correction; Marshall–Lerner/J-curve |
| 51–53 | Development indicators, barriers, strategies | Sustainability–poverty relationship |

### Resolved borderline applications

The conclusions below are **authoring judgments grounded in the source**, not IB-issued markschemes for Aptly's original questions. Per-ID authors remain responsible for the final exact prompt and private guidance.

| Entry / issue | Source location | Reconciled recommendation |
| --- | --- | --- |
| `econ-v1-3.4-4-002`, qualitative crossing Lorenz curves | G22 p39 | Shared original interpretation is defensible with the supplied qualitative information. Require neither plotting from quintiles nor a unique Gini ordering from crossing curves. The precise crossing exercise is an application, not a separately named prescribed outcome. |
| Saving-leakage four-marker under 3.1 | G22 p35 | Direct topic fit. No need to move it to introductory 1.1 merely because that section also introduces circular flow. |
| `econ-v1-2.5-10-003`, firms' production plans and YED | G22 p28 | The business application is the actual demand, so HL eligibility is appropriate. |
| `econ-v1-2.6-10-003`, short-run primary-commodity PES | G22 p28 | Shared is defensible when assessed through ordinary time, storage and capacity constraints. It does not demand the separately specified industry comparison. |
| `econ-v1-2.6-15-004`, agricultural price volatility | G22 pp28–30 | Keep the shock distinction economically correct: a demand shift interacts with PES; a harvest supply shift interacts with PED. “Agriculture” alone does not settle level. |
| `econ-v1-3.6-15-001`, shared fiscal-policy essay | G22 p42 | A shared prompt should not require multiplier theory in its blueprint. Remove that requirement or change the actual tested scope/eligibility; root and the entry author choose the implementation. |
| `econ-v1-3.5-15-004`, quantitative easing | G22 p41 | Existing HL treatment is justified. |
| `econ-v1-4.5-15-001`, depreciation and trade balance | G22 pp48, 50 | The broad shared question is supportable. Remove mandatory early-deterioration/J-curve expectations. Qualitative quantity responses, capacity and time remain usable evaluation without requiring the formal HL model. |
| `econ-v1-4.5-15-003`, advantages/disadvantages of a fixed regime | G22 p49 | Recommend HL for the comparative regime evaluation; naming only the fixed regime does not remove that demand. |
| `econ-v1-4.6-10-001` / `003`, growth/productivity and current account | G22 pp36, 48–49 | Shared original applications are supportable through component flows and competitiveness. Neither prompt requires persistent-deficit correction, the formal reverse CA-to-currency diagram or financing-risk analysis. |
| Dedicated sustainability–poverty essays | G22 p51 | Check HL overrides. Broad sustainable-development and policy essays should be judged by their actual demanded relationship, not by the presence of either word. |

The required 96/72/24 launch distribution is a product constraint. It supplies no evidence for a disputed level assignment. The independent entry audits reconcile these locators with every prompt and private blueprint; this report does not claim to substitute for those per-ID reviews.

## Historical price discrimination and cross-price elasticity

The evidence is stronger than “not found in one excerpt.” G13 explicitly includes XED under old §1.2, printed **20–21** (PDF28–29), and third-degree price discrimination under old §1.5, printed **37** (PDF45). Visual inspection confirms XED in the shared column and price discrimination in the HL column. The full current §2.5 and §2.11 tables were then read; neither outcome appears, and a full-document search found neither term. This establishes their historical origin and lack of prescription in the inspected current guide. [Older IB guide](https://www.cuny.edu/wp-content/uploads/sites/4/page-assets/about/administration/offices/registrar/resources/international-baccalaureate/IB-Economics.pdf)

Repository decisions supported by that evidence:

- Retire `econ-v1-2.11-10-003` and `econ-v1-2.11-15-003` from current-syllabus selection; preserve historical saved versions.
- Remove price discrimination as expected evaluation content from the broader `econ-v1-2.11-15-001` blueprint.
- Replace the XED expectation in `econ-v1-2.5-15-004` with an appropriate current-syllabus elasticity route. The entry author proposed PES within the broad policy question.
- Do not teach the grader that an economically valid student extension becomes wrong merely because it is not prescribed. The source finding concerns what the bank can require and advertise as current content.

## Existing eligibility paths and compatibility

`isCurrentTopLevelHlTopic` already includes current 2.4 and 2.10–2.12. Its consumers cover Practice topic filtering/defaulting, general-practice suggestions, focused/general question generation, bank validation and assessment-level normalization. All seven existing 2.4 records were already HL. No additional 2.4-wide migration follows from the amended heading.

Relevant code: `lib/assessment/taxonomy.ts`; `app/(app)/practice/page.tsx`; `lib/assessment/general-practice.ts`; `lib/assessment/question-generator.ts`; `lib/assessment/question-bank/economics-v1/validation.ts`; `lib/ai/assessment-schema.ts`.

The same historical topic code can have a different meaning under another taxonomy. `economics-2022-v1` identifies a taxonomy family, not proof that every later assessment amendment has been incorporated. Preserve old source/blueprint snapshots and apply reviewed content changes prospectively through root-owned versioning decisions.

## Closure status

This review closes the research questions about the applicable guide revision, the relevant G20→G22 differences, the identified shared/HL boundaries, and the historical XED/price-discrimination flags in [the earlier pending checklist](ib-source-verification-pending.md). That checklist is a dated record of what was unavailable before this additional research; its “unread S2” status is superseded by root's separate E26 retrieval and examiner-rule review.

Source alignment of original questions can be reviewed now and must not be indefinitely deferred to unspecified teacher approval. The 96-entry and 211-entry audits provide that separate authoring review. Remaining empirical work is blinded marking/calibration on real responses, including difficult handwriting and borderline partial credit. Neither current source access nor synthetic/offline tests establish teacher agreement or authentic-student accuracy, and this review authorizes no further paid run.
