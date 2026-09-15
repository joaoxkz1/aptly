# Source closure and release validation

Completed **15 September 2026**. This is the final engineering/source pass after the closed live validation. It made **zero paid assessment or image-generation calls**. The original run ledger, observations, judgments and marks are unchanged.

## Resolved assessment questions

The [closure register](ib-source-verification-pending.md) answers every former open item and distinguishes source-verified rules, corroborated interpretations, Aptly authoring judgments and empirical calibration. The [source/access register](diagram-assessment-basis.md) records the actual reading method and page/subsection locators.

- Indexed **official 2026 examiner text** resolves S2-1 through S2-5: incompatible mechanisms, same-part error carry-forward, context and alternatives, movement arrows and Paper 2(g). Direct HTML/PDF retrieval still failed; no direct download is claimed. Recent IB-authored 2025 markschemes corroborate the split, labels and error treatment.
- The **October 2022 amended guide** was read and compared with May 2020. Outcome-level HL boundaries and amended Paper 2/Paper 3 descriptors are incorporated. The syllabus-family identifier is retained; assessment/blueprint versions record the corrections.
- **All 96 new four-mark entries** received [individual source review](four-mark-source-audit.md). Nine entries changed: PPC scope, prescribed elasticity reasons, nonprohibitive tariff context, currency alternative, Keynesian segment, crowding-out model substitution, two Lorenz labeling criteria and the wheat partial-credit description. The 80 diagram tasks use the sourced Paper 2-style labeling ceiling as an explicit Aptly contract choice; 16 written tasks retain their own criteria.
- **All 211 historical essays** received [individual source review](essay-source-audit.md). Twenty-three over-demanding AO2-scope essays and two price-discrimination essays are retired. Two historical short definitions are also retired. The bank therefore has **398 stored definitions / 371 active / 27 retired**; all 96 new entries remain active. Active essays: **186**, with **69 necessary / 117 optional** diagram judgments. Four essay level corrections and task-specific guidance/model corrections are documented per ID.
- [All 31 generation topics](practice-ao3-scope.md) have explicit evaluative outcome scopes. Unsupported 15-mark fallback stops before quota/provider work, preserving reviewed curated cross-topic exceptions. Generated guidance cannot require historical price discrimination or XED.
- Attempt 05's one relevant stated outcome remains a defensible one-point authored partial boundary, corroborated by an analogous IB scheme. Its **3/4 is unchanged**. The earlier policy-advice and missing-versus-incorrect/family-versus-labeling defects remain covered by recorded-failure regressions.

## Historical safety and quota behavior

New combined grading uses **ib-econ-2026-v3**, with general blueprint v2, four-mark blueprint v2, essay blueprint v3 and inferred contract v2. The assessment and public diagram shapes remain unchanged. Migration 0015 accepts old and new versions without rewriting rows or widening grants. Stored criteria and exact idempotent replay retain their original versions. New requests exclude retired, level-ineligible and superseded criteria. Revision comparisons suppress numerical improvement claims across grading-contract versions, even when the JSON shape is unchanged.

Migration 0014 atomically reserves grade and diagram capacity. An already-exhausted diagram allowance inserts **no grade reservation** and starts no provider. Real PostgreSQL concurrent sessions tested both ordering directions against legacy single-capability reservations.

## Final checks

| Check | Result |
| --- | --- |
| `npm test -- --reporter=dot` | **1,185 tests passed, 82 files** |
| `npm run lint` | Passed |
| `npx tsc --noEmit --incremental false` | Passed |
| `npm run build` | Passed; **22 routes/pages**, default-off configuration |
| `npm run test:db:diagrams` | **35 assertions**; migrations 0001–0015, seeded legacy/v2 preservation, v3 writes, rejected unknown versions, 0013/0015 reapplication, privileges and bindings |
| `node scripts/verify-combined-reservations.mjs` | **12 scenarios / 91 assertions**, four observed independent-backend lock waits; disposable database removed |
| `node scripts/diagram-browser-local.mjs security` | **26/26** local Auth/Postgres checks; disposable users cleaned up |
| `supabase db lint --local/--linked --level error --schema public` | Both passed, no schema errors |
| Bank audits | All 96 four-mark and 211 essay rows reviewed; report/data roles, families, status and levels agree; schema/coverage/duplicate/eligibility regressions passed |

The first sandboxed Vitest launch could not read the project through esbuild; the full suite passed using the authorized normal host environment. Tests and the previous synthetic live run are not independent IB validation or measured authentic-student accuracy.

## Database and application environments

The cached **Supabase CLI 2.116.0** used the repository's existing linked-project workflow. Project reference **xwduxzwxeyiflkpnlkqd**, name **Aptly**, endpoint **https://xwduxzwxeyiflkpnlkqd.supabase.co**, database **postgres**, PostgreSQL **17.6**. This matches the repository link and configured application endpoint. The pre-apply dry run listed only 0013–0015, no seeds or roles.

**Remote migrations 0013, 0014 and 0015 were applied successfully** after 0001–0012. Readback lists every migration through 0015. Historical preservation checks before/after:

| Data | Before / after count | Before / after row digest |
| --- | --- | --- |
| Attempts | 125 / 125 | `1e82f61411ed3dac3df7b4f66cae775d` |
| Practice questions | 45 / 45 | `581b7bff351913679f3abeb4ce086a76` |

Digests aggregate canonical row JSON in ID order; the question digest excludes the newly added nullable public contract column. No reset, seed, migration-history rewrite or historical-mark change occurred. The new snapshot table is present and empty. Remote schema lint passed. Read-only privilege checks confirmed snapshot RLS, denial to both browser roles, service-only combined RPCs, hidden private blueprints, readable public summaries and acceptance of old/new grading versions.

Git remote: **https://github.com/joaoxkz1/aptly**, branch **main**. GitHub deployment metadata confirms the Vercel **aptly1/aptly Production** integration. The Vercel settings UI was checked with all environments selected: **NEXT_PUBLIC_DIAGRAM_ASSESSMENT_ENABLED is absent from both project and shared variables**, so the checked-in default remains **false**. No hosted variable or public feature setting was changed. The final commit and deployment status are identified in Git history and the task's release report.

The local Docker project **aptly** has migrations **0013–0015 applied**, with function bodies verified against migration files. The local app enables diagrams only in its launched process and connects to **127.0.0.1:54321**, database port **54322**. Startup performs no provider work:

```powershell
cd 'C:\Users\Joao Perracini\New folder\aptly'
node scripts/diagram-local-pilot.mjs
```

Open [local login](http://127.0.0.1:3000/login); sign in through [local mail capture](http://127.0.0.1:54324), complete SL/HL setup, then choose Practice → 4 marks. [Detailed handwritten-diagram instructions](diagram-local-testing.md) remain valid. Your own explicit submission uses the real observer/grader; it does not reopen the closed engineering run.

## What online research cannot establish

Independent agreement on authentic student work, handwriting/photograph error rates and examiner-equivalent reliability require empirical data. No independent teacher marks have been supplied. A future arbitrary pasted question's unknown original markscheme cannot be authenticated in advance; inferred contracts remain provisional. These are post-implementation calibration/provenance limits, not unresolved research-answerable rules or blockers to this release.
