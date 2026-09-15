# Server authority migration runbook

## Original server authority apply order (0007–0008)

1. Deploy the server environment variable `SUPABASE_SERVICE_ROLE_KEY` without exposing it to preview logs or browser bundles.
2. Apply `0007_server_authority.sql`.
3. Apply `0008_ai_usage_reservations.sql`.
4. Deploy the matching application build.

The order fails closed: after 0007, an old browser build may be unable to save, but it cannot create forged authoritative rows. Existing attempts/practice remain readable and deletable by their owner. The 0008 backfill preserves only the current UTC day's no-content consumption.

## Diagram-aware assessment addendum (0013–0015)

Migration `0013_diagram_aware_assessment.sql` is additive and depends on the
preceding migrations through `0012_verified_practice_focus.sql`. Apply outstanding
migrations in numeric order before enabling the matching application feature.
It does not backfill or recalculate historical attempts.

The migration adds:

- `assessment_snapshots`, with row-level security and no grants to `public`,
  `anon` or `authenticated`. Only `service_role` has SELECT/INSERT/DELETE access.
  The snapshot contains the trusted contract, hashes, observations and model
  provenance; it contains no photo bytes and cascade-deletes with its attempt or
  account.
- The service-only `save_combined_assessment` RPC, which saves the attempt and
  private snapshot in one transaction. A deferred constraint checks their
  user/operation/contract/artifact binding and applicable component arithmetic and
  ceilings. A trigger prevents completed combined results being rewritten, while
  allowing deleted parent/Practice references to become null.
- A constrained public `practice_questions.assessment_contract` summary, the
  four-mark framework, and compatible blueprint/focus constraints. Private grading
  criteria remain outside the browser-readable summary.

`NEXT_PUBLIC_DIAGRAM_ASSESSMENT_ENABLED` defaults to `false`. The build-time public
value also gates the server path; changing it requires a matching rebuilt
application. Enable it only with 0013–0015 present. The enabled path submits the answer
and optional image in one request and saves one combined result. Legacy JSON
written grading and stored feedback-only diagram evidence retain their existing
compatibility paths.

Migration 0014 atomically reserves one existing `grade` allowance and one existing
`diagram` allowance for an image submission. If either limit is already exhausted,
neither reservation is inserted and no provider starts. Completed retries replay the saved attempt
without repeating providers or consumption. A failed dispatched review remains
consumed; a changed answer or image is a new operation and is reassessed. No daily
limit is increased by this migration.

Migration 0015 only widens accepted grading/blueprint versions, retaining every
historical identifier and row. New grading uses `ib-econ-2026-v3`; general,
four-mark and essay blueprints use v2, v2 and v3 respectively. No new grant or
backfill is introduced. The [release record](diagram-source-closure.md) includes
the verified target and before/after preservation checks.

To disable the pilot, rebuild with the flag set to `false` and leave 0013–0015, their
restrictive grants, existing results, snapshots and idempotency ledger in place.
Saved four-mark Practice and audited essay Practice requiring the new contract cannot be newly graded
while the feature is disabled. Existing results remain readable/deletable; the
rollback does not rewrite them into legacy results. Do not drop snapshots or
relax the integrity triggers to make an older write path accept combined data.

## Diagram compatibility and validation

Migration 0007 adds the evidence constraint as `NOT VALID`, so unknown legacy rows remain readable while every new insert/update is protected. Before validating remotely, run:

```sql
select id
from public.attempts
where diagram_evidence is not null
  and not public.is_valid_diagram_evidence(diagram_evidence)
limit 100;
```

Review or null only confirmed legacy-invalid evidence, then run:

```sql
alter table public.attempts
  validate constraint attempts_diagram_evidence_valid_chk;
```

## Local dynamic verification

This repository does not bundle Supabase CLI or Docker. On a machine with a migrated local Supabase instance, point the three variables in `.env.example` at that local instance and run:

```powershell
npm.cmd run test:security:local
```

The script refuses non-local hostnames. It creates two disposable users and proves browser insert denial, cross-user read/delete isolation, own delete, database diagram-payload rejection, a concurrent daily-cap race, and same-key idempotency. Test users cascade-delete in `finally`.

For the diagram-aware local harness, run:

```powershell
node scripts/diagram-browser-local.mjs security
```

This invokes the same verifier using keys derived from the verified local Docker
Supabase instance. It does not load `.env.local` or use production
credentials. The harness's mocked OpenAI browser smoke checks exercise workflow
and persistence, not model accuracy or teacher calibration. Combined route/unit
checks and migration-specific binding/deletion checks remain separate validation
evidence; the legacy verifier alone does not establish the new grading contract.

## Rollback implications

Do not drop the ledger or idempotency columns during an incident; doing so loses replay/audit state and can double-dispatch providers. Prefer an application rollback that leaves the restrictive grants in place.

If browser write behavior must be temporarily restored for an emergency rollback, re-granting `INSERT`/`UPDATE` and recreating the old policies reopens the original forgery boundary and is therefore not a safe production rollback. The safer recovery is:

1. keep 0007/0008 applied;
2. restore/fix the server routes and service-role configuration;
3. verify `/api/grade` and `/api/practice` with a test account;
4. only then resume traffic.

The legacy `scan_extraction_usage` and `diagram_review_usage` tables are retained for compatibility/audit. Their browser grants stay revoked; the new routes never write them.
