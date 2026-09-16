# Examiner alignment validation — 16 September 2026

This is an engineering audit of assessment behavior, not an independently marked student cohort. The marking authority and confidence boundaries are recorded in [the fresh source model](../ib-marker-behavior-model.md). All response fixtures are original practice material or identified prior synthetic fixtures. The diagrams are synthetic clean graphs, not authentic handwriting. No official mark is asserted for any fixture.

## Coverage and results

The [25-case matrix](calibration-matrix.json) was written before live dispatch. It covers all eight requested P1(a) conditions, eight P1(b) conditions, seven four-mark conditions and both uncertainty conditions, with extra P2(g)/P3/source-gate distinctions. Cases overlap where they test several conditions. The matrix describes qualitative hypotheses rather than target scores. Existing and new automated tests verify contracts, framework gates, component rules, feedback, learning priorities, historical replay and version comparisons. They do not pretend mocked grades prove examiner agreement.

Exactly **10/10 started attempts** were used, with **8 completed assessments and 2 technical failures**. Both failures remain in the immutable ledger and artifacts. No further assessments are authorized by this run. The explicit-diagram/incomplete-chain live candidate was left to offline coverage to allow the two repairs within the cap.

| Attempt | Evidence and outcome | Engineering finding |
| --- | --- | --- |
| 1 | Pollution prose, no image; app timed out at 45s; provider completed at 61s | Valid structured 8/10 judgment arrived after the old text deadline. No mark was saved. Combined assessments now share the existing 120s deadline, within the route's 150s maximum. |
| 2 | Saved reviewed AD/AS essay plus correct graph: 10/10 | Observer and grader agree on lower output/price level. No material gap. A full-credit refinement lacked an optional label; final reconciliation fixes that display issue, verified by replaying this exact output without changing its mark. |
| 3 | Manual PED determinants; interpretation-only failure | Correct rule selected, but added quotation delimiters failed literal evidence validation. Normalization now strips only outer delimiters and still requires the exact question words. No grade was dispatched or saved. |
| 4 | PED retry: 10/10, marked | Pure determinants resolve to appropriate support. No missing-diagram issue or evaluation/policy demand. Empty improvements and explicitly optional next study are accepted. |
| 5 | Sound GDP analysis, generic evaluation, no real-world application: 8/15 | Correctly identifies missing required application and underdeveloped weighing; does not penalize diagram absence. |
| 6 | GDP appraisal with applied examples and supported conditional judgment: 15/15 | Meaningful evidence integration, balanced reasoning and task focus justify the top band; no artificial diagram or policy gate. |
| 7 | Four-mark drought prose with demand-increase diagram: 2/4 | Context makes that graph inapplicable: diagram 0 + explanation 2. The possible forecast of 2+2 followed by an incompatibility ceiling was not needed. The same total can have different valid reasons; no score fitting followed. |
| 8 | P2(g) development question with hypothetical source: 15/15 | Uses supplied data to develop reasoning and qualifies a derived income-share inference. Framework remains P2(g), without a P1 example/diagram gate. |
| 9 | Unspecified classroom mechanism: provisional 2/10 | Interpretation remains uncertain/unresolved; estimate is excluded from core analytics. This missing context cannot be supplied by syllabus research. |
| 10 | Pollution retry: 8/10, saved | Necessary graph omission enters the judgment, diagnostic, issue, comment, improvement and next action. Browser History and Current Focus both correctly expose the diagram gap. |

One-mark alternatives within a defensible band remain possible. The substantive disagreements concerned transport/validation and feedback labeling, not a desired score. No model, reasoning-effort setting, numerical essay cap or question-bank score target was changed. Completed latency was 15–31 seconds; the failed first provider response took 61 seconds. Estimated list-price usage was **$0.28324**, including failed-stage work and recorded cache writes/reads; this is not an invoice. See [token/cost details](summary.json), based on [OpenAI pricing](https://developers.openai.com/api/docs/pricing) and [GPT-5.4 pricing](https://developers.openai.com/api/docs/models/gpt-5.4).

Each attempt folder preserves the request question/answer/context, initial and final private contract, original image hash, raw observer/classifier/grader requests and responses, persistence result, deterministic component outcome, final band, diagnostics, feedback, Next Step, stage latency, usage, and [engineering review](attempts/10-pollution-omitted/engineering-review.json). Forecasts are isolated under `reviewOnly`; they never enter provider inputs. Images in provider text logs are replaced by their hashes; the original synthetic files are retained separately. Credentials, cookies, local passwords and image data URLs are not committed.

The ledger is closed. The two locally created test accounts were removed after verifying exact endpoint, setup timestamp, fixture identity and metadata; production accounts were untouched. The provider forwarder and local app were stopped.

## Reproduction without paid calls

`npm test` replays all eight completed provider artifacts against the final validators, including full-credit optional advice, necessary omission priority, uncertain-task analytics exclusion and exact semantic contract reconstruction. `npm run test:db:diagrams` replays migrations 0001–0017 and preserves old snapshots. `node scripts/summarize-examiner-validation.mjs` recreates the cost/review summary without accessing providers. Do not run setup or new live cases against this closed ledger.

The 25-case matrix also retains the six other four-mark visual scenarios from the earlier source-reviewed fixtures. Existing component/source tests exercise ECF, labels, valid alternatives, context, absent arrows, missing writing and missing diagrams. The cases not live-marked in this audit remain qualitative coverage, not independent empirical grader calibration.

Ireland's example refers explicitly to the initially reported 2015 figure, [CSO's July 2016 release](https://www-cloud.cso.ie/en/releasesandpublications/er/nie/nationalincomeandexpenditureannualresults2015/); subsequent revisions do not change the conceptual application. The UK example uses the direction of the 2020 contraction, [ONS](https://www.ons.gov.uk/economy/grossdomesticproductgdp/bulletins/gdpmonthlyestimateuk/december2020), without treating an early percentage estimate as a current revised statistic.
