# Server authority migration runbook

## Apply order

1. Deploy the server environment variable `SUPABASE_SERVICE_ROLE_KEY` without exposing it to preview logs or browser bundles.
2. Apply `0007_server_authority.sql`.
3. Apply `0008_ai_usage_reservations.sql`.
4. Deploy the matching application build.

The order fails closed: after 0007, an old browser build may be unable to save, but it cannot create forged authoritative rows. Existing attempts/practice remain readable and deletable by their owner. The 0008 backfill preserves only the current UTC day's no-content consumption.

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

## Rollback implications

Do not drop the ledger or idempotency columns during an incident; doing so loses replay/audit state and can double-dispatch providers. Prefer an application rollback that leaves the restrictive grants in place.

If browser write behavior must be temporarily restored for an emergency rollback, re-granting `INSERT`/`UPDATE` and recreating the old policies reopens the original forgery boundary and is therefore not a safe production rollback. The safer recovery is:

1. keep 0007/0008 applied;
2. restore/fix the server routes and service-role configuration;
3. verify `/api/grade` and `/api/practice` with a test account;
4. only then resume traffic.

The legacy `scan_extraction_usage` and `diagram_review_usage` tables are retained for compatibility/audit. Their browser grants stay revoked; the new routes never write them.
