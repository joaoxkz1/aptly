# Examiner alignment implementation

16 September 2026. Baseline: `c7a711c` on main. Research preceded all grading-behavior edits; see [source model](ib-marker-behavior-model.md). [Calibration record](examiner-live-validation/README.md) distinguishes observed results, engineering expectations and empirical limits.

## Findings and implementation

The prior pollution fix correctly recognized necessary externality diagrams, but deterministic phrase recognition still left ordinary unfamiliar wording such as PED determinants unresolved. The architecture also allowed feedback reconciliation to add a material omission after accepting full credit, and a full-credit answer could receive apparently compulsory enrichment. These are general task-resolution and judgment-consistency problems.

The preserved authority order is saved private blueprint / exact audited bank match / explicit diagram demand / reviewed deterministic mechanism. Only unresolved, confirmed P1(a)/(b) tasks then use one constrained interpretation call. It receives question, source, framework and total, never the answer, image, topic classifier or desired score. Its strict schema can select only 21 reviewed demand rules, with exact question quotations, mechanism explanation, confidence and coverage. Server code chooses diagram role and provenance. Topic similarity is insufficient; unsupported/conflicting or partly covered demands remain provisional. Multi-model demands retain all relevant relationships rather than forcing a single diagram family. Pure determinant and conceptual-indicator mappings are openly identified as bounded Aptly assessment judgments.

The grader follows task → demonstrated economics → quality and material limitations → best-fit band → within-band mark → feedback. A private structured examiner record binds the band, position, evidence effect and judgment. Validation rejects internally contradictory output instead of manufacturing a replacement mark. A necessary omitted graph can still coexist with 9/10 if best fit warrants it: no universal eight-mark ceiling or fixed deduction exists. Full credit cannot coexist with a declared material unmet requirement. Optional advice after full credit is labeled explicitly; task-scoped feedback and the existing learning-priority rules remain authoritative.

Four-mark arithmetic is unchanged: only eligible question-specific contracts receive their reviewed 2+2 allocation, within-part ECF and defined ceilings. P2(g) keeps its source-dependent best fit and possible full credit without graphs; P3(a) remains analytic and P3(b) remains an evidenced policy recommendation. Generic practice gets no official-looking band. Existing source gates, authentication, private blueprints, model settings and quotas remain intact.

Interpretation runs after the existing grade reservation, with retries disabled. Omission confirmation for unresolved tasks occurs before paid interpretation. One 120-second bound covers combined provider stages; the first real run demonstrated that the former 45-second text limit was insufficient. Failed dispatched work remains counted. Exact completed replay rebuilds the frozen original pre-observation/pre-interpretation fingerprint, including image hashes, for both essays and four-mark attempts.

## Versions and bank audit

New combined assessments use `ib-econ-2026-v5` and `examiner-workflow-2026-v1`; new manual essay contracts use `inferred-essay-contract-v2`; semantic task rules use `ib-task-families-2026-v1`. Historical v2/v3/v4 records and private snapshots remain accepted and immutable. Revision comparisons suppress numerical improvement claims across changed versions. The public assessment shape remains version 4.

The 398 stored questions (371 active), 96 reviewed four-mark questions and 211 retained essay judgments (186 active essays) were audited through their existing source, scope, blueprint, selection and regression checks. No reviewed bank question or historical content was rewritten. Saved Practice continues to load owner-scoped private guidance; Current Focus and focused Practice retain controlled skill/level selection. The real local UI showed the pollution omission as a Diagram focus and PED as a normal marked result.

Migration 0017 replaces only the combined-snapshot validation function and reloads the API schema. It adds v5 metadata acceptance and checks, preserving old accepted versions, table grants, row-level security and immutable-save behavior. Migrations 0001–0016 are unchanged. Deploy the additive schema before the new application reaches traffic; the prior application remains compatible.

## Validation

- 1,336 tests in 88 files passed, including all bank/source audits, explicit/non-explicit task regressions, semantic schema/authority validation, band consistency, historical fingerprint replay, cross-version revisions and all eight completed real-output replays.
- ESLint, TypeScript and production build passed; 22 pages/routes generated.
- PostgreSQL/PGlite replay: 62 assertions through 0017, including seeded old-record preservation, idempotent migration reapplication, v5 binding rejection, private permissions and account isolation.
- Docker Desktop was started; real local Auth/RLS integration: 26/26 mandatory checks passed.
- Actual PostgreSQL atomic reservation/concurrency check: 91 assertions passed, including independent backend locking, quota exhaustion, replay and privilege boundaries; disposable test database cleaned up.
- Local Supabase schema lint passed after additive migrations 0016 and 0017. Production migration and preservation evidence is recorded alongside the release artifacts.
- Real budget: 10 started / 8 completed / 2 retained technical failures, both fixed and successfully retested. Estimated usage $0.28324. No paid calls beyond the cap.

Authentic handwriting, population-level repeatability and independent teacher/examiner agreement remain empirical limits. This audit establishes source-grounded task/marking logic and engineering coherence; it does not establish exact human agreement for arbitrary unpublished questions. No unresolved published-source question blocks this implementation.

## Production schema release

The pinned existing Supabase CLI 2.116.0 applied **only 0017** to Aptly project `xwduxzwxeyiflkpnlkqd`; linked schema lint passed. Historical canonical row digests at `2026-09-16T17:43:40.977Z` are identical before and after: **128 attempts, 47 Practice questions, 3 private snapshots**. See [before](examiner-live-validation/production-before.json), [after](examiner-live-validation/production-after.json) and the [read-only preservation query](examiner-live-validation/release-preservation.sql). No schema reset or migration-history repair was used.

Vercel's existing Production configuration was directly checked: `NEXT_PUBLIC_DIAGRAM_ASSESSMENT_ENABLED=true`. No environment or feature-state changes are required. The application commit and final deployment identity are reported in the release response and Git/Vercel history.
