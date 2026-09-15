# Diagram-aware grading and four-mark Practice

Implementation and validation record, 15 September 2026. The feature is implemented behind `NEXT_PUBLIC_DIAGRAM_ASSESSMENT_ENABLED`, which defaults to `false`. The [final source-closure record](ib-source-verification-pending.md) resolves researched rules and question-bank scope. Independent authentic-work calibration remains post-implementation validation. See [release state](diagram-source-closure.md) for the exact migration, test and deployment evidence.

## Repository findings and reused paths

The inspected starting bank contained 302 entries: 91 two-mark, 91 ten-mark and 120 fifteen-mark questions. Manual four-mark grading already existed. This work extends its framework resolver and authoritative grade route; it does not introduce a second overall grader.

| Path | Existing behavior reused | Change |
| --- | --- | --- |
| `lib/assessment/policy.ts`, `frameworks.ts`, `preflight.ts` | Explicit totals, controlled four-mark template, paper-specific source gates | Resolve a private contract before examining the answer; retain provisional/manual distinctions |
| `app/api/grade/route.ts`, `lib/ai/assessment-schema.ts` | Server-owned question lookup, strict output validation, existing grader and saved attempt | Accept multipart image evidence, reconcile supported components and save one complete result |
| `app/api/practice/route.ts`, question-bank selection | Bank-first reuse, SL/HL and verified focus, bounded AI fallback | Four-mark bank selection, safe authored-template fallback, source/contract round trip |
| `lib/diagram`, `components/submit/diagram-attachment.tsx` | Photo preparation, size/type limits, separate Scan | Reuse actual prepared image for assessed observations; guard replacement/removal callbacks |
| `lib/supabase/server-authority.ts`, migration 0008 | Owner-scoped reads, server writes, durable reservation/idempotency | Atomic attempt + private snapshot RPC, with existing reservations |
| Submit, Feedback, History, Progress, Current Focus/Next Step | Revisions, scoped drafts, diagnostics and learning loop | Component explanations, image-only work, honest omissions, diagram-focused four-mark practice, cross-version comparison limits |

Root-owned integration checkpoints: inspect/source reconciliation; contract and arithmetic tests; authoritative image path; reviewed 12-question slice; complete 96-question bank; UI/learning integration; DB, browser and full-suite validation. Subagents authored source research, bank content, scoped tests and UI/documentation work under the shared contract.

## Assessment contract and evidence flow

`trusted-contract.ts` resolves framework, known paper/part, total, topic, syllabus/level, diagram role and rationale, blueprint version, context needs, task criteria and rule scope. Authored practice questions use private blueprints; manual questions use the existing resolver and an explicitly inferred practice contract. A recognized family is required for an inferred 2+2 split. Missing referenced context is requested, never invented. A mark total alone does not identify a paper.

The browser receives only five contract fields: version, mode, diagram role, reason and provenance. Private criteria, alternatives and rule selection are not browser-authoritative. New written four-mark tasks have their own developed-explanation criteria. Definition-only two-mark grading remains unchanged.

1. Validate the request and owned task, resolve the contract, and require confirmation of any necessary omission. Validate/hash any prepared image. Atomically reserve the grade and diagram allowances for an image submission; a text-only submission reserves just grading.
2. When attached, `assessed-visual-review.ts` uses the existing `gpt-5.4` vision model to produce bounded region/observation/interpretation/uncertainty records from the image. It does not award marks. Multiple regions may be described within the single image.
3. The existing `gpt-5.6-terra` authoritative grader receives the answer, frozen contract and those image-bound observations. It assesses economic credit and same-part consistency. Image text, teacher annotations and student-provided markschemes cannot alter policy.
4. `component-scoring.ts` validates integer component ranges and applies authorized ceilings deterministically. The saved total and displayed components use that decision. Essays keep their holistic best-fit mark; diagnostic bars never calculate it.
5. `save_combined_assessment` atomically persists the attempt and private immutable snapshot. The snapshot binds owner/operation, question/context/answer hashes, full contract/hash, ordered artifact identity/hash/role, observations and reviewer/grader versions. No photo bytes are persisted.

The observer now uses medium reasoning and a 4,400-token ceiling; legacy feedback-only review retains its prior low/2,600 settings. Combined image requests have a 120-second server provider deadline and 125-second client deadline; the route declares `maxDuration=150` to leave room for authentication/persistence on compatible hosts. These settings are engineering choices pending authentic handwriting calibration, not proof of model adequacy. Both model stages preserve `store: false` and use no automatic SDK retries.

### Rules and result states

- Supported diagram/explanation tasks allocate 0–2 to each component: correct both = 4/4, correct explanation alone = 2/4, correct diagram alone = 2/4, no creditworthy evidence = 0/4. Partial credit follows each original blueprint.
- Applicable incompatible mechanisms impose an overall maximum of 2/4; compatible alternatives and notation differences do not. Within-part error carry forward records the linked root error without excusing unrelated errors.
- The question-selected labeling rule imposes a maximum of 3/4. It is neither an automatic score nor another subtraction after reduced component credit. The UI identifies raw component credit and a binding ceiling.
- Ten-/fifteen-mark results consider diagram accuracy, use and necessary omissions within the existing framework, with no fixed bonus or universal missing-diagram cap. Paper 2(g) retains its distinct highest-level eligibility without diagrams. The [211-question essay audit](essay-diagram-audit.md) supplies 82 necessary and 129 optional task-specific rationales.
- Missing, pending, usable, partially readable, unreadable/ambiguous, no relevant diagram and processing failure remain distinct. Essential unreadability or uncertain student/teacher separation saves no completed mark. Weak readable economics remains assessable. Explicitly removing a failed image and confirming omission creates a new submission.
- Scan remains editable transcription; it does not submit a diagram. Retain/replace/remove is explicit in revisions. Retain works only while the correctly bound image remains in browser memory; reload or account/task changes require reattachment. Changed writing creates a new snapshot and final assessment even with the same image. Observation caching is deliberately absent in this version.

[The source/rule map](diagram-assessment-basis.md) distinguishes IB guidance, original Aptly blueprints and product decisions. The final pass read indexed official 2026 examiner text, the October 2022 amended guide and recent IB-authored markschemes. Direct 2026 HTML/PDF retrieval still failed; the access distinction is recorded. No IA criterion or arbitrary Paper 3 allocation was imported.

## Bank and fallback

| Unit | Diagram | Written | Shared SL/HL | HL only | Total |
| --- | ---: | ---: | ---: | ---: | ---: |
| Introduction | 6 | 2 | 8 | 0 | 8 |
| Microeconomics | 32 | 4 | 24 | 12 | 36 |
| Macroeconomics | 24 | 4 | 20 | 8 | 28 |
| Global economy | 18 | 6 | 20 | 4 | 24 |
| **New total** | **80** | **16** | **72** | **24** | **96** |

Integrated bank: **398 stored definitions, 371 active and 27 retired**. All 96 new entries are active, original hypothetical tasks with `source_reviewed` provenance, a per-ID audit and `independentlyTeacherValidated: false`. The [four-mark audit](four-mark-source-audit.md) reviews all 96; the [essay source audit](essay-source-audit.md) reviews all 211 historical essays, of which 186 remain active. Retirement affects new selection and preserves saved questions/results.

Four-mark fallback deliberately uses approved complete server templates. The model may select only the supplied template ID and a bounded fictional case name; it cannot invent a mechanism, mark allocation or family. The resulting original stimulus and private blueprint are saved together. This gives limited scenario-name variation after bank exhaustion, not unlimited new economic question structures. Unsupported topic/focus combinations fail honestly before consuming generation quota. General four-mark reuse supports both written and diagram formats; verified diagram focus requires an exact four-mark diagram match.

## Versions, migration and rollout

New combined results: assessment **4**, grading contract **ib-econ-2026-v3**, diagram contract **economics-diagram-contract-v1**. Rubric **econ-v4** and syllabus **economics-2022-v1** remain; the latter identifies the syllabus family, now checked against its October 2022 amendment. New general, four-mark and essay blueprints use **economics-grading-blueprint-v2**, **economics-four-mark-blueprint-v2** and **economics-essay-blueprint-v3** respectively; new manual inferred contracts use **inferred-question-contract-v2**. Every previous version remains accepted in storage. Completed results and exact idempotent replays are not reinterpreted or backfilled; a new request does not reuse superseded criteria or retired/ineligible bank content.

1. Apply migrations 0001–0012, then [0013](../supabase/migrations/0013_diagram_aware_assessment.sql), [0014](../supabase/migrations/0014_atomic_combined_grade_reservation.sql) and version-only [0015](../supabase/migrations/0015_source_reviewed_contracts.sql). `supabase/schema.sql` includes all blocks for fresh setup. Migration 0014 is required by the atomic image reservation path; 0015 accepts both historical and source-reviewed versions. Existing service-role server configuration is required; no new browser credential or image bucket is needed.
2. Deploy the compatible application with the flag `false`. Verify owner reads/deletion, legacy grading and private-column restrictions. Migration alone does not enable combined grading.
3. Enable `NEXT_PUBLIC_DIAGRAM_ASSESSMENT_ENABLED=true` in a restricted pilot environment and **rebuild**; it is a build-time client setting and a server gate. Confirm deployment request-duration/body limits accommodate the existing prepared-image ceiling and 120-second combined deadline.
4. Run the smoke path below. Broader rollout can use independent authentic-work calibration to assess real-world agreement. This is separate from the completed source review and implementation. The single environment flag does not provide per-user cohorts; use an isolated pilot environment.
5. Roll back by rebuilding with the flag `false`, keeping 0013–0015, restrictive grants, snapshots and versions. Saved new four-mark and audited essay tasks pause rather than silently changing their assessment contract. Historical and newly completed results remain readable. A deliberate manual revision across versions is labeled as a limited comparison.

### Cost and retention

An image submission atomically reserves **one grade allowance and one diagram allowance** using migration 0014; text-only assessment uses one grade reservation. If either capacity is already exhausted, neither new row is inserted and no provider begins. Existing caps stay 30 grades, 10 diagram reviews, 10 generations and 10 scans per user/UTC day. Bank selections use no generation allowance. After successful reservation, all states count under the existing conservative ledger, including subsequent visual-review/provider failures. Preflight errors reserve nothing. The next genuinely new attempt receives a fresh identity. A completed retry returns the durable saved attempt without another provider call or charge. Revised writing/image is a new assessment, including when retaining the original image.

Photo bytes are transient in request memory and, for an available revision, browser memory. They are not stored in sessionStorage or Supabase. Public observations/hashes and the private contract snapshot persist with the attempt and cascade-delete with it/account. Provider storage/security logging is governed separately; `store: false` is not a promise of universal zero retention. Privacy, operations, DPIA processing notes and the [server-authority runbook](server-authority-runbook.md) reflect this distinction.

## Verification record

The subsequent [narrow follow-up and local testing record](diagram-local-testing.md) documents feedback-scope/classification fixes, the atomic quota migration, **1,133 passing tests**, real PostgreSQL contention tests and the exact available local environment. It made no further paid calls and leaves the live run closed. The records below describe the earlier implementation/live-validation stage.

The original implementation tests and browser smoke used synthetic mocks. A subsequent authorized [real-provider validation run](diagram-live-validation/README.md) started 19 assessments and saved 17 marks, with one safely rejected observer-contract failure (fixed and retested) and one expected unreadable-image rejection. It used the actual visual observer and authoritative grader; estimated assessment cost was $0.683094, excluding four separate ImageGen fixture calls. No production data mutations occurred.

| Command/check | Actual result |
| --- | --- |
| `npm test -- --reporter=dot` | Final run after real-validation fixes: 1,107 tests passed in 77 files |
| `npm run lint` | Passed |
| `npx tsc --noEmit --incremental false` | Passed |
| `npm run build`; final `node scripts/diagram-browser-local.mjs build` | Production builds passed; final build used the enabled local pilot configuration and generated all 22 pages |
| `npm run test:db:diagrams` | Migrations 0001–0013 replayed in disposable PostgreSQL, seeded upgrade preserved legacy rows, 0013 reapplied and schema snapshot matched; 24 DB assertions passed |
| `node scripts/diagram-browser-local.mjs security` | Existing local Auth/Postgres security verifier: 26/26 checks passed |
| `node scripts/diagram-calibration.mjs --self-test` | 13 synthetic harness assertions passed; zero provider calls |
| `node scripts/diagram-calibration.mjs` | 24 planned cases, zero teacher/Aptly paired marks; no agreement claim |

The source-oriented legacy tests were updated for combined multipart payloads and expanded bank totals; unrelated historical behaviors remain covered. Validation found and fixed a migration null-assessment compatibility bug, an absent-writing diagnostic inconsistency, general written-four-mark reuse, saved-essay rollback behavior, and an account-check liveness gap. The latter now has a bounded timeout and explicit retry while old account results remain unable to unlock the editor; eight new boundary tests cover recovery and stale responses.

Local browser smoke used the actual application, local Supabase Auth/Postgres, a synthetic diagram image and local mocked OpenAI responses. Confirmed: Practice four-mark selection; saved question/context; image submission saved at 4/4; retained-image/empty-writing revision saved at 2/4; remove-image/confirmed-omission revision saved at 2/4; History preserved all three and displayed their components; Next Step generated and saved exact diagram-focused four-mark practice. Database readback confirmed three grade + two diagram reservations, with zero generation reservations for the two bank selections. Screenshot inspection confirmed the component layout. The final production build passed A→B account switching with an empty B draft/no retained image, isolated empty B History, and sign-out. Test accounts, fixtures, browser tab and helper servers were cleaned up; existing local database infrastructure was left available.

The later real-provider run found and corrected independent Diagram diagnostics being overwritten by component scaling, feedback overstating uncertain labels, an ambiguous observer readability-field definition, and missing Practice context in History. New combined results preserve the trusted stimulus in the existing attempt field; historical rows are unchanged. Labeling, blur and irrelevant-image retests confirmed the targeted behavior. The severe-blur control saved no mark. Both essay formats stayed holistic, and the same 10-mark answer scored 10 with its diagram and 8 without it; this single pair does not establish a fixed diagram deduction. All 17 saved assessments matched database readback. Final browser inspection confirmed saved context and readability caveats; the production build and lint passed again. See the linked run report for original failures, full observations, per-attempt usage/costs, remaining feedback concerns and cleanup.

### Manual smoke path

In an enabled non-production environment, set SL/HL; choose Practice → four marks → a supported topic → Generate → Start answer. Attach a close-up student diagram and write an explanation, then grade. Check component reconciliation and saved History. Revise, retain the available image and change the explanation; grade as a new version. Revise again, remove the image, submit writing and explicitly choose **Grade without a diagram**. Follow the diagram-focused Next Step. Test unreadable and teacher-marked photos separately: replace/retry must be offered with no completed mark when essential evidence cannot be separated.

For a no-cost engineering repeat, `scripts/diagram-browser-local.mjs` supports setup/dev/inspect/security/cleanup against verified local Docker Supabase, with all AI requests redirected to its local mock. Use its synthetic fixture only. Never point this helper at production.

## Post-implementation validation and rollout

- Source questions and original-bank reviews are closed in the [source record](ib-source-verification-pending.md). The 15-mark adaptive fallback now uses [explicit outcome scopes](practice-ao3-scope.md) and refuses unsupported combinations before provider/quota work, while preserving reviewed curated cross-topic exceptions.
- Complete the independent [24-case teacher template and offline comparison harness](diagram-calibration.md), using consented authentic handwriting and difficult photos, and investigate disagreements. No teacher labels, handwriting accuracy or learning-outcome improvement have been established.
- Confirm actual hosting limits, controller review of the documented processing update and pilot operating procedures. These are rollout requirements, not unfinished score/persistence wiring.
