# Local handwriting testing and narrow follow-up

Verified **15 September 2026**. The paid engineering validation remains closed at **19 started / 17 saved** assessments. This follow-up made **zero assessment calls and zero image-generation calls**. It uses captured responses, offline tests and isolated local PostgreSQL tests.

## Changes

- Required improvements and Next Step now follow the actual question. Unrequested policy-recommendation advice is removed; an out-of-scope Next Step uses the existing diagnostic focus. Other explicitly optional extensions are labeled **“Optional extension (not needed for credit)”** and do not replace the required next action. The stakeholder essay in recorded attempt 13 returns to application, its actual limitation.
- The grader's structured component judgment now distinguishes `missing`, `underdeveloped`, `incorrect` and `none` for explanation issues. Missing or accurate-but-incomplete writing uses the existing **Underdeveloped economic analysis** issue; genuine errors retain **Incorrect diagram explanation**. Older captured responses remain readable. Attempts 05/07 no longer create a false recurring incorrect-diagram pattern.
- A wrong diagram family uses **Missing required diagram**, zero relevant diagram evidence and a next step requesting the appropriate family. It cannot trigger the labeling-only ceiling. Attempt 17's raw provider response stays intact in the audit record, while its normalized result uses the correct issue.
- Recorded regression tests check Next Step rendering, Current Focus selection, recurring issues and unchanged marks, component decisions, numeric readiness, trends and skill priorities. No historical results were rewritten and no marks were tuned to an engineering forecast.

## Quota correction

The earlier quota issue **was still present**: a grade row was reserved before the separate diagram-capacity check. Migration **0014** adds `reserve_combined_grade`, reserving both rows in one transaction only after both capacities are available. It shares the original per-user/UTC-day advisory locks with legacy single-capability reservations. A diagram-capacity rejection returns `diagram_daily_limit` before either provider begins and inserts **neither** row.

Text-only reservations, quota limits, completed retries and conservative accounting after successful reservation remain unchanged. Tests cover competing distinct keys, duplicate keys, completed replay at capacity, conflicts, both directions of contention with the legacy diagram writer, and an expired idempotency key when diagram capacity is full. This change does not refund historical rows.

## Exact deployment state

| Item | Verified state |
| --- | --- |
| Application | Current uncommitted workspace at `C:\Users\Joao Perracini\New folder\aptly`; Next.js 16.3 development server, bound to **127.0.0.1:3000**. Started and left running for user testing. Production build also passed separately. |
| Database/project | Local Docker Supabase project **aptly**, container **supabase_db_aptly**, PostgreSQL **17.6**, database **postgres**, host **127.0.0.1:54322**. API **http://127.0.0.1:54321**. |
| Migration 0013 | Diagram tables/functions were already present locally but its migration-ledger row was missing. Reapplied the idempotent migration and recorded **0013_diagram_aware_assessment** in the local ledger. Existing rows preserved. |
| Migration 0014 | **0014_atomic_combined_grade_reservation** applied and recorded locally. Both migrations' function bodies checked against the repository before starting the app. |
| Feature flag | **NEXT_PUBLIC_DIAGRAM_ASSESSMENT_ENABLED=true only in the launched local process**. The launcher supplies local Supabase keys and URL to both client/server. Repository default remains false; `.env.local` has no flag. |
| Provider | Existing real OpenAI credential, endpoint **https://api.openai.com/v1**; configured observer **gpt-5.4**, authoritative grader **gpt-5.6-terra**. Models unchanged. Only explicit user actions initiate model work; the launcher makes none. |
| Remote project | `.env.local` references **xwduxzwxeyiflkpnlkqd** at **https://xwduxzwxeyiflkpnlkqd.supabase.co**. The launcher overrides these database settings. No remote migration, data reset, deployment or public feature enable was performed. The remote database migration state, hosted application environment and hosted flag were **not independently verified**. |

## Test your own diagram

1. Open **[local Aptly login](http://127.0.0.1:3000/login)**. Enter an email address and request a magic link.
2. Open **[local mail capture](http://127.0.0.1:54324)**. Find the message for that address and open its sign-in link in the **same browser** used for step 1. Mail is captured locally; it does not arrive in your external inbox.
3. Complete name and Economics SL/HL setup if prompted. Open Practice, select **4 marks** and a supported topic such as **2.3 Competitive market equilibrium**, generate a question, then start the answer.
4. Attach your handwritten diagram in the diagram attachment area, add your explanation and grade. This user-triggered submission uses the real observer and grader. Check the component result and History. The separate Scan tool transcribes text; it is not the diagram attachment.

Use **127.0.0.1**, consistently, for this setup. User-created local accounts and results remain available; they are separate from the remote account and database. No new test account or assessment was created by this follow-up.

### Restart command

From the workspace in PowerShell, with Docker and the existing local aptly Supabase stack running:

```powershell
cd 'C:\Users\Joao Perracini\New folder\aptly'
node scripts/diagram-local-pilot.mjs
```

Read-only preflight: `node scripts/diagram-local-pilot.mjs inspect`. The launcher checks local container identity/health, migrations, callback/mail settings and API availability before starting. It refuses to replace a process already using port 3000. Stop the running pilot before restarting; its generated local credentials last 24 hours. The launcher is the entry point for this environment; plain `npm run dev` uses the remote settings in `.env.local`.

## Checks completed

| Check | Result |
| --- | --- |
| `npm test -- --reporter=dot` | **1,133 passed in 79 files**; includes 9 recorded-failure/learning-loop regressions and 13 feedback-scope tests. |
| `npm run lint` | Passed. |
| `npx tsc --noEmit --incremental false` | Passed. |
| `node scripts/diagram-browser-local.mjs build` | Enabled local configuration production build passed, **22 pages**, no provider calls. |
| `npm run test:db:diagrams` | **24 assertions**: full migration replay, seeded legacy upgrade preservation, 0013 reapplication and snapshot consistency. |
| `node scripts/verify-combined-reservations.mjs` | Real PostgreSQL: **12 scenarios / 91 assertions**, including four independently observed concurrent advisory-lock waits. Explicit local Docker endpoint and project/workspace checks; disposable databases removed. |
| Local launcher and HTTP checks | Migration 0013/0014 function bodies match; login **200**, mail capture **200**, unauthenticated Practice/Submit redirect to login. |

The new feedback normalization and prompt changes were verified offline against the recorded failures; they were **not** sent for another paid live assessment. Existing immutable evidence remains under [diagram-live-validation](diagram-live-validation/README.md).

## Subsequent source closure

The final [source-closure register](ib-source-verification-pending.md) resolves all five S2 rules, the current guide amendment, labeling/allocation scope, 96 new blueprints and 211 historical essay judgments. Attempt 05's one-point outcome credit remains a defensible authored boundary corroborated by analogous IB marking; its mark is unchanged. Independent authentic-work calibration remains separate post-implementation validation.

The implementation brief, synthetic fixtures and passing engineering tests are not independent IB validation. The environment table and check counts above describe the earlier narrow follow-up. The subsequent [release state](diagram-source-closure.md) supersedes its deployment/migration status. The local launcher now requires and verifies migrations **0013–0015**, including the source-reviewed versions. The same local URL and startup command remain valid.
