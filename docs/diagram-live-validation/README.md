# Real diagram assessment validation

Run completed 15 September 2026. **19 assessment attempts started; 17 completed and saved; one observer-contract failure; one expected unreadable-image rejection.** The run is closed with one of the conservative 20-start allowance unused. The failed start and unreadable start both count toward that limit. No further provider calls are planned.

The actual application used **gpt-5.4-2026-03-05** for visual observation and **gpt-5.6-terra** for authoritative grading, with the existing medium-reasoning configuration. No assessment models were changed. There were **17 observer calls and 17 grader calls**, all real OpenAI Responses API requests, with no automatic retries. Estimated assessment cost: **$0.683094**, from **143,047 input and 30,702 output tokens**, including both incomplete attempts. Four separate built-in ImageGen calls created three selected photographic fixtures; their cost was not returned and is excluded.

The pipeline handled the selected economics and evidence conditions sensibly after targeted fixes. This is a small, deliberately selected synthetic engineering run, **not teacher calibration, authentic-handwriting accuracy, or evidence of syllabus-wide reliability**.

## Evidence and reproduction

The subsequent [source-closure pass](../ib-source-verification-pending.md) reviewed the rules and all custom blueprints without reopening this run. Attempt 05's one-point outcome credit remains a defensible authored partial-credit boundary; its saved mark and every original observation/response remain unchanged. New contracts carry new blueprint/grader versions. Source review is separate from this synthetic model run and from future independent authentic-work calibration.

- [Complete structured results](results.json): every question, stimulus, answer, intended evidence condition, expected economic behavior, raw structured observation, raw grader judgment, deterministic rules, saved assessment/feedback, latency, actual token usage, estimated cost and independent engineering review.
- [Closed budget ledger](budget.json): original starts, failures and retests retained. No reset or erased unsuccessful attempt.
- [Case manifest](cases.json): student input is separated from review-only engineering expectations. Case names, descriptive filenames, expected scores and teacher judgments never enter provider inputs. Trusted task criteria remain normal grading inputs.
- Each linked attempt below contains the exact redacted request, unmodified provider response, resolved private contract, image hash, API response, database readback and `review.json`. Request logs replace inline image bytes with their SHA-256 hash; actual requests sent the selected image bytes under the generic filename `student-diagram.png`. The image files remain available for inspection.
- [Pricing basis](pricing.md), [image prompts and visual inspection](image-prompts.md), and [deterministic chart fixtures](images/generated-fixtures.json).
- Root owned dispatch, architecture, contracts, integration and validation. Subagents independently inspected fixtures, source/pricing, economic outcomes, diagnostics and persistence. They made no assessment calls.

The [live harness](../../scripts/diagram-live-validation.mjs) exercised the real `/api/grade` route, existing observer and grader, validation, deterministic reconciliation and Supabase persistence. A loopback proxy forwarded unchanged requests to `https://api.openai.com/v1/responses` solely to capture request/response metadata and enforce one dispatch per stage per registered slot. It supplied no model responses. Two disposable local accounts respected existing per-user quotas; production data and configuration were not changed.

The [offline summarizer](../../scripts/summarize-live-diagram-validation.mjs) can regenerate `results.json` without provider calls. The completed ledger cannot be reused for new dispatches. Provider credentials and local account secrets are absent from retained artifacts.

## Questions and expected economics

| Cases | Trusted question | Expected economic behavior |
| --- | --- | --- |
| live-01–10, live-13–15 | Using a demand and supply diagram, explain the effect of the drought on the equilibrium price and quantity of wheat. [4 marks] | Drought reduces harvests and supply at each price. With unchanged demand, supply shifts left: equilibrium price rises and quantity falls. Incorrect own-figure logic is distinguished from correct consequences of a carried-forward root error. |
| live-11, live-16 | Explain how a fall in consumer confidence may affect real output and the price level. [10 marks] | Lower confidence reduces consumption and AD. Against unchanged upward-sloping SRAS, output and price level fall; the written chain and relevant diagram are assessed holistically. |
| live-12 | Discuss the likely effects of a negative supply shock on households, firms and government. [15 marks] | SRAS shifts left, raising the price level and reducing output. Evaluate distributional, sectoral, fiscal and time-horizon effects; the private essay blueprint requires developed real-world application. |

The exact authoritative wording and full stimulus are in each resolved task and `results.json`. The main wheat comparisons reuse the same developed explanation; writing-only variations isolate explanation quality. The handwritten, blurred and severe-blur images derive from the same synthetic page. One explanation-only essay repeats the complete answer from its image-backed counterpart.

## Attempt outcomes

`D+E` means diagram and explanation credit before an applicable ceiling. Essay marks are holistic. Latency is the complete HTTP request, including provider work and local persistence. Tokens are actual input/output totals across dispatched stages. USD estimates use returned cache-read/write usage and the documented standard rates; they are estimates rather than an invoice.

| # / record | Evidence condition | D+E / rule | Final | Seconds | Input / output tokens | Est. USD |
| --- | --- | --- | ---: | ---: | ---: | ---: |
| [01](attempts/01-live-01/review.json) | Correct diagram + developed explanation | 2+2 | 4/4 | 20.97 | 8,339 / 1,387 | $0.03971 |
| [02](attempts/02-live-02/review.json) | Shifted supply stops before new intersection; strong explanation | 1+2 | 3/4 | 22.59 | 8,334 / 1,648 | $0.03696 |
| [03](attempts/03-live-03/review.json) | Wrong rightward shift + coherent own-figure explanation | 0+2; within-part carry forward | 2/4 | 38.98 | 8,393 / 2,409 | $0.04619 |
| [04](attempts/04-live-04/review.json) | Correct geometry, missing axis/PQ labels | 2+2; selected maximum 3 | 3/4 | 24.86 | 8,352 / 2,019 | $0.04115 |
| [05](attempts/05-live-05/review.json) | Correct diagram + bare price assertion | 2+1 | 3/4 | 18.23 | 8,222 / 1,452 | $0.03357 |
| [06](attempts/06-live-06/review.json) | Demand-increase diagram contradicts supply-contraction explanation | 0+2; mismatch recognized | 2/4 | 24.54 | 8,423 / 1,913 | $0.04005 |
| [07](attempts/07-live-07/review.json) | Diagram only | 2+0; empty writing forced zero | 2/4 | 18.09 | 8,269 / 1,560 | $0.03145 |
| [08](attempts/08-live-08/review.json) | Strong explanation, confirmed diagram omission | 0+2; omission forced zero visual credit | 2/4 | 8.47 | 5,580 / 692 | $0.01569 |
| [09](attempts/09-live-04/review.json) | Exact labeling retest after diagnostic fix | 2+2; maximum 3; diagnostic now 3 | 3/4 | 25.42 | 8,401 / 2,012 | $0.03805 |
| [10](attempts/10-live-09/review.json) | Equivalent prime notation, no shift arrow | 2+2; no invented notation penalty | 4/4 | 17.70 | 8,293 / 1,570 | $0.03593 |
| [11](attempts/11-live-10/review.json) | Blurry labels; main geometry visible | 2+2; partially readable | 4/4 | 28.28 | 9,165 / 2,313 | $0.04856 |
| [12](attempts/12-live-11/review.json) | Developed 10-mark essay + AD contraction | Holistic; no diagram bonus | 10/10 | 23.22 | 7,903 / 1,674 | $0.04271 |
| [13](attempts/13-live-12/review.json) | 15-mark stakeholder essay + SRAS contraction | Holistic; hypothetical application limits best fit | 12/15 | 25.10 | 8,269 / 1,811 | $0.04505 |
| [14](attempts/14-live-10/review.json) | Exact blurry-photo retest after uncertainty fix | 2+2; uncertainty explicitly retained | 4/4 | 40.07 | 9,033 / 2,858 | $0.05855 |
| [15](attempts/15-live-13/review.json) | Uneven readable handwriting and wobbly curves | 2+2 | 4/4 | 19.24 | 9,043 / 1,508 | $0.03640 |
| [16](attempts/16-live-14/review.json) | Readable irrelevant PPC; contradictory observer fields | Observer schema rejected; no grader | None, 502 | 7.49 | 2,288 / 628 | $0.01514 |
| [17](attempts/17-live-14/review.json) | Same irrelevant PPC after field clarification | 0+2; no relevant diagram | 2/4 | 23.30 | 8,404 / 1,622 | $0.03498 |
| [18](attempts/18-live-15/review.json) | Severe blur prevents essential curve identification | Unreadable gate; no grader | None, 422 | 11.65 | 2,975 / 867 | $0.02044 |
| [19](attempts/19-live-16/review.json) | Same 10-mark essay, confirmed diagram omission | Holistic; zero visual diagnostic, no numerical cap | 8/10 | 11.28 | 5,361 / 759 | $0.02251 |

Completed-request latency: median **23.219 seconds**, range **8.474–40.068 seconds**. The 10→8 essay pair is one observed best-fit difference, not a fixed two-mark diagram allocation. Prompt changes occurred between those attempts, so it is not a frozen-implementation causal estimate.

## Findings, origin and fixes

### 1. Independent diagnostic overwritten by component scaling — fixed

Attempt 04's grader returned Diagram diagnostic 3/4 and raw components 2+2. The selected labeling ceiling correctly produced total 3/4, but server normalization replaced the diagnostic with `diagramComponent * 2`, incorrectly saving 4/4 and erasing the diagnostic skill gap. Overall mark arithmetic was correct.

The server now preserves a validated independent diagnostic, falls back to component scaling only if absent, forces zero for confirmed absent/irrelevant evidence, and limits a diagnostic above 3 when the task's authorized labeling ceiling applies. Any clipping includes the labeling reason. Retest 09 preserved diagnostic 3/4, total 3/4 and exact persistence. Regression coverage also verifies rendering as “Secure” and the retained 25% diagnostic gap. Original records remain unmodified; no historical backfill occurs.

### 2. Uncertain labels praised as verified — addressed in the real retest

Attempt 11's observer explicitly marked several labels/subscripts uncertain. The grader nonetheless praised exact notation with high confidence and no limitation. Geometry still supported a defensible 4/4 under the contract, which allows writing to clarify shift direction; no scoring failure was established from blur alone.

Combined instructions now require uncertain observations to remain uncertain in feedback. The server also retains the observer's summary in limitations for partially readable evidence, without imposing a photographic mark penalty or universal confidence cap. Retest 14 kept 4/4, qualified the labels, returned medium marking confidence and explicit limitations. Severe-blur control 18 correctly stopped before grading when essential geometry was unavailable.

### 3. Readability confused with presence/correctness — clarified and retested

Attempt 16 accurately observed a readable Schools/Clinics PPC, selected `no_relevant_diagram`, but set `essentialEvidenceReadable=false` because the required wheat curves were absent. The strict validator rejected that contradiction: 502, no grader, no saved mark. This was an observer-output contract semantics failure, not an incorrect economic observation or arithmetic error.

The schema description and prompt now explicitly define readability independently of correctness/completeness. A readable irrelevant image can establish that relevant evidence is absent; an unrecognizable photo cannot. Strict validation remains in place. Retest 17 returned consistent fields and saved 0+2=2/4. New regressions cover both contradictory rejection and valid irrelevant-image grading. Error logs now identify `visual_review` rather than the stale `rate_limit` stage.

### 4. Practice stimulus absent from History — fixed for new combined results

Grading and revisions correctly loaded the linked Practice stimulus, but attempt rows deliberately stored null for Practice context and History displayed only question/answer. New combined attempts now retain the server-resolved stimulus in the existing `source_material` field, and History displays it as “Question context.” No schema migration was needed. Retest 14 and later wheat records confirm the exact context in the API response and database. Browser AX inspection and screenshot inspection confirmed the displayed stimulus, qualified photo feedback and reconciled 4/4 components.

Existing rows remain unchanged; linked Practice revisions still retrieve their original context. Historical rows without a copied stimulus do not gain a new History context block.

### Remaining calibration concerns

**Post-run engineering follow-up:** the [local testing and fix record](../diagram-local-testing.md) documents offline corrections for the feedback-scope and issue-classification findings below, plus the separate pre-dispatch quota fix. The original responses, marks and run budget remain unchanged. No new paid assessment or image-generation calls were made. Attempt 05's credit boundary still needs teacher calibration.

- Attempt 05 gives one explanation mark for a bare accurate price assertion. This lies within the engineering forecast, but whether it satisfies the blueprint's “explains” threshold needs teacher calibration. It was not repeatedly rescored until a preferred result appeared.
- Attempts 05/07 use the broad “Incorrect diagram explanation” issue tag for weak/absent explanation, although detailed feedback identifies the actual limitation. The vocabulary is blunt.
- Attempt 13's secondary advice asks for a prioritized policy recommendation even though the question asks about stakeholder effects and the conditional judgment already earned full evaluation diagnostic credit. The stated mark limitation was hypothetical application, not this extra advice. This feedback-scope issue remains documented.
- Attempt 17's raw labeling flag conflates wrong diagram family with labels, but no labeling ceiling is applied after zero diagram credit, and final advice correctly requests the relevant model.

## Five-stage audit

| Stage | Evidence and conclusion |
| --- | --- |
| Visual observation | Clear chart geometry, missing labels, alternative notation and handwriting were observed accurately in these selected cases. Moderate blur retained uncertainty; severe blur failed closed. Irrelevant-image field contradiction was found and retested after clarification. |
| Economic grading | Partial components, own-figure carry forward, mismatch, omission and essays produced defensible selected outcomes. Uncertain-label praise was addressed; explanation-credit and feedback-scope concerns remain for calibration. |
| Deterministic reconciliation | All completed totals matched the applicable validated component sum/ceiling or holistic mark. No repeated deduction was observed. The independent diagnostic overwrite was fixed. |
| Question blueprint/contract | Server-owned question, context, allocations, role, alternatives and rule scope matched records. No case labels or predicted marks entered requests. No clean authored case exercised a *binding* incompatible-mechanism ceiling with independently valid 2+2 components; that branch has deterministic tests, not a demonstrated real binding outcome here. |
| UI/persistence | All 17 saved public assessments matched database readback and immutable image/contract evidence; both incomplete requests saved no mark. History context gap was fixed and visually verified. Local test data was then cleaned up, with audit exports retained. |

## Final verification and cleanup

- `npm test -- --reporter=dot`: **1,107 tests passed in 77 files**. Ten tests added to the prior 1,097-test baseline, plus strengthened existing regressions.
- `npm run lint`: passed.
- `npx tsc --noEmit --incremental false`: passed; the final production build also reran TypeScript successfully.
- `node scripts/diagram-browser-local.mjs build`: enabled local pilot production build passed, all **22 pages** generated, zero provider calls from the build.
- Real persisted outputs and snapshots were read back before cleanup. Prior migration/security checks remain documented in the [implementation report](../diagram-aware-grading.md); this validation introduced no migration or assessment version change.
- Signed out of the disposable browser account, closed the temporary tab, stopped app/proxy, deleted both disposable local accounts and removed their temporary credentials. The 19 records, synthetic images and closed budget remain. Existing local Supabase infrastructure remains available.

Implementation hashes were captured from attempt 09 onward; earlier exact requests/responses remain, but no source-file hash was retrospectively fabricated. Changes were localized to diagnostic preservation, observation/feedback semantics, source persistence/display and failure-stage logging. Models, economic allocation contracts and quota limits were retained.

Further reliability work requires consented authentic student work, independent teacher marks, broader diagram families and current authorized IB-source review. This run does not establish those results.
