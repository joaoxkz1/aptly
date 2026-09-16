# Permanent Aptly admin analytics

Release: 16 September 2026. This is a private product-wide console, with Overview,
Users & retention, Attempts, Revisions, Practice, Feedback and AI operations tabs.
The same date filter follows navigation. Refresh fetches current data; the header
shows its UTC timestamp. Tables paginate at 25 rows; charts include numeric,
screen-reader-readable tables and useful empty states. No chart dependency was added.

## Access and deployment

Set `ADMIN_ROUTE_CODE` only in the server's environment (6–32 decimal digits).
Never use `NEXT_PUBLIC_`. Example **only**: `/admin/123456`. Obtain the actual route
from the founder's private deployment configuration; do not put it in this document,
screenshots, navigation, reports or tickets. Changing the setting requires redeploying.

The code reduces accidental discovery; it does not authorize access. Every HTML
and `/data` handler separately verifies the code, Supabase `getUser`, matching
verified JWT subject/session ID, an entry in server-owned `aptly_admins`, and the
live `auth.sessions` row (including `not_after`). Membership/session removal takes
effect on the next request even if an access token has not expired. Missing
configuration, anonymous users, wrong codes, non-admins, revoked sessions and
authorization errors fail closed with 404. Only the service role can manage the
allowlist. Never promote a user through editable user metadata.

This uses a dynamic **Route Handler returning server-rendered HTML**, deliberately
not an RSC page: Next.js router-state serialization can include the dynamic segment
in HTML. All internal links/forms are relative query strings. The console sends
no client scripts or raw fact dump. Headers include `no-store`, `Vary: Cookie`,
`noindex,nofollow,noarchive`, no-referrer, nosniff, DENY framing and a strict CSP.
`robots.txt` disallows `/admin/`; there is no public admin link or sitemap entry.
The static stylesheet contains no configuration. `/data` returns an explicit
aggregate allowlist, never user/email/comment rows, the route code or credentials.

The founder selected `joaofunandgames@gmail.com`; grant membership only to the
exact existing Auth UUID resolved for that account, not a guessed identity. The
allowlist is provisioned separately from schema migration. Production rollout
evidence is recorded below after validation.

## Data and database boundary

Authoritative completions remain `attempts` (including revisions/diagram metadata),
`practice_questions` (saved bank/generated questions and focus linkage), and
`ai_usage_reservations` (operation lifecycle). No completion events, second usage
ledger, prompts, answer copies, image copies, blueprints or snapshots are added.
The dormant scan/diagram usage tables remain inaccessible and are not counted.

Migration `20260916193103_admin_analytics.sql` adds:

| Object | Purpose / access |
|---|---|
| `aptly_admins` | Explicit UUID membership, service-owned, RLS and zero browser grants |
| `analytics_events` | Bounded transient interactions, service-owned, RLS and zero browser grants |
| `attempt_feedback` | One editable 1–5 rating per owner/attempt; optional comment ≤500 characters |
| `reported_original_marks` | One editable original mark per owner/attempt; source always `student_reported` |
| `admin_attempt_facts`, `admin_practice_facts` | `security_invoker` projections without student content; service-only SELECT |
| `record_analytics_event` | Service-only ingestion, validates owned references, database clock, serialized per-user rate limit/dedup |
| `protect_student_report` | Trigger protecting identity and creation time and assigning update time |
| `admin_session_authorized` | Service-only membership + live session check |
| `admin_analytics_snapshot` | Rechecks authorization and returns minimized facts to the server in one MVCC snapshot |
| `admin_find_user` | Rechecks authorization; exact email or UUID lookup, at most one minimal identity result |

All functions use security invoker and an empty search path with qualified objects.
Existing domain RLS/grants are unchanged. Authenticated clients retain owner-only
attempt/Practice access. Feedback/mark policies check both user identity and
ownership of the referenced attempt. Column-level grants exclude user IDs,
timestamps and source changes; users cannot move reports between attempts.
Cross-owner reads return no rows and writes fail. The API uses the cookie client
for these writes, validates the owner and body and rejects cross-origin requests.
JSON request bodies are streamed with a 4 KiB cap. No service key reaches clients.

Indexes: unique `(user_id,attempt_id)` keys enforce one report and cover owner
lookups; report `attempt_id` indexes cover FK cleanup/detail lookup. Events have
`(user_id,created_at desc)` for rate/dedup/account queries and `created_at desc`
for date-window queries. Primary keys cover identity lookups. No shotgun indexes
were added to existing attempts/Practice/ledger tables: the measured production
30-day attempt query over 128 rows took 0.814 ms, using a sensible scan/sort.
The local plan checks exercise the event rate-limiter index with realistic counts.
Current scale favors ordinary views and one minimized snapshot; JSON aggregation
avoids silent PostgREST 1,000-row truncation. If facts grow enough to make reads
expensive, measure the snapshot and move more aggregation into bounded SQL before
considering materialized views. No warehouse or external analytics service.

## Transient events and instrumentation limits

| Event | Trigger |
|---|---|
| `feedback_viewed` | Saved result or expanded History feedback remains mounted for one second |
| `next_step_clicked` | Explicit revise/practice action from feedback; action enum records intent |
| `current_focus_viewed` | Available Current Focus card is shown |
| `targeted_practice_started` | Practice generation requested with a focus source |
| `practice_started` | Ordinary Practice generation requested |
| `revision_started` | Owned revision context has loaded |
| `history_viewed` | History remains mounted for one second |
| `onboarding_completed` | Profile setup succeeds |
| `diagram_upload_started` | Attachment-selection handling begins |
| `diagram_removed_before_submit` | Student removes an existing attachment |

Allowed properties are only `source` (`general`, `current_focus`, `answer_feedback`,
`history`, `result`) and `action` (`revise`, `practice`, only on next-step events).
Unknown names/keys/values are rejected; properties have a 256-byte database cap.
Identity is assigned from verified Auth, never accepted from the browser. Relevant
work IDs must be owned by that user. At most 30 events/minute and 1,000/day/user;
identical event/reference/property tuples deduplicate for 30 seconds.

Signals describe UI intent/views, not successful grading, attention, or evidence
of learning. Network/ad blockers and closed tabs can lose them. There is no
offline queue, session replay, anonymous tracking, clickstream, or event claiming
successful completion. `revision_abandoned` is not emitted because leaving a tab
cannot reliably prove abandonment. Interaction histories start at this release;
older absence does not mean the behavior never happened.

## Metric definitions

Every boundary is UTC: `[start,end)`. Today starts at 00:00 UTC. Seven/thirty-day
windows include today and the preceding 6/29 calendar days. Custom end dates are
inclusive days, represented by the following midnight and capped at refresh time.
All-time means **all currently retained records**, not deleted data. Fixed Today,
7d and 30d cards use refresh time independently of the selected historical range.
Unknown legacy dimensions stay in explicit unknown/legacy groups; no backfill.
Rates with zero denominators display an em dash. Trend buckets are daily up to
60 days, weekly (Monday UTC) up to 180, then monthly, including zero intervals.

| Metric | Definition |
|---|---|
| Registered / new users | Retained Auth users / users created in the indicated window |
| Meaningful activity | A saved attempt or Practice question, or feedback view, next-step click, Current Focus view, Practice start or revision start |
| DAU / WAU / MAU | Distinct users with meaningful activity in the fixed 1/7/30 calendar-day window; login, History-only and onboarding-only activity do not count |
| Active / returning users | Distinct meaningful users in selection / those active in selection with activity on ≥2 distinct observed UTC dates through selection end |
| Attempts | Authoritative saved attempt rows, including revisions; daily/7d/30d/all-time cards use the corresponding creation window |
| Submitters / attempts per active user | Distinct attempt owners in selection / selected attempts divided by selected meaningful users |
| Original / revision | No `parent_attempt_id` / non-null parent, respectively |
| Revision rate | Selected original roots with ≥1 valid descendant by selection end, divided by selected originals |
| Revision chains / revising users | Number of revised selected roots / distinct owners of revisions created in selection |
| Revisions per original / repeat revisions | All descendants of selected roots through selection end divided by selected original count / descendants after the first in each selected root's chain |
| Median time to revision | Median root-to-first-descendant hours among revised selected roots |
| Internal score change | Selected root versus latest descendant once per chain; both fully marked/assessable, same non-null framework, total and contract version. No mixing partial marks or legacy scores |
| Improving / unchanged / falling | Positive / zero / negative internal delta divided by comparable chain count; this is not external proof of learning or causation |
| Feedback / Next Step → revision | Distinct attempt IDs with the selected interaction, and a direct child revision after that interaction and before selection end; earliest selected interaction per attempt is used |
| Active days | Distinct meaningful UTC dates in selection; 1-day, ≥2-day and ≥3-day user groups |
| Return within 7/30 days | Later-UTC-day activity within elapsed 7/30 days after first observed meaningful action. Denominator includes only users whose full observation window has elapsed by selection end; this is not exact-day D7/D30 retention |
| Activation funnel | Signup cohort in selection, then meaningful action → ≥1 submission → ≥2 submissions → revision → activity on a later UTC day after revision, observed through selection end. Each stage is a subset of the previous stage |
| User rows | Creation, latest observed meaningful action, selected attempts/revisions/Practice/diagrams/ratings/active days, and first/latest submission through selection end |
| Formats / papers / topics | Recorded mark totals, assessment framework/paper, and syllabus topic (fallback to recorded topic); unknowns stay explicit |
| Score distribution | Fully assessable marked **originals only**, grouped by estimated percentage bands; legacy score scales are not blended |
| Diagram present / absent | Submitted attachment-hash presence or legacy diagram evidence / its complement among selected attempts |
| Diagram assessed | Present diagram with saved combined-assessment metadata whose mode is not `not_assessed` |
| Missing required / unreadable | Explicit stored contract role + missing state / explicit unreadable state; no inference from answer text. Diagram operation failures come from the ledger |
| Practice questions served | Saved Practice rows, grouped by topic, format, bank ID and recorded origin |
| Bank / generated share, fallback rate | Curated-bank / adaptive-generated rows divided by rows with known origin; null legacy origins excluded from that denominator |
| Focus usage | Transient Current Focus/feedback-focused starts and authoritative saved `from_current_focus` questions shown separately |
| Repeated bank questions | Saved occurrences beyond the first for each user/bank ID in selection, an operational signal rather than a claim that avoidance failed |
| Never-served bank entries | Available current catalogue IDs without a saved serving anywhere through selection end; excludes deprecated/disabled entries |
| Unsubmitted Practice | Selected saved questions without a linked attempt through selection end; explicitly a proxy, not proven abandonment |
| Ratings / average / positive | Current editable reports with `updated_at` in selection / arithmetic mean / share rated 4 or 5. Editing moves a rating to its latest date; there is no immutable rating history |
| Rating distribution, trend, format/topic | Count per 1–5 value or bucket and mean by linked attempt dimension; recent comments/lowest-rated lists limited to 20 |
| Original-mark comparison | Current student-reported marks updated in selection matched to fully assessable marked attempt with equal denominator; signed delta = Aptly minus reported, absolute delta = its magnitude. Never called verified teacher agreement |
| AI operations / statuses | Retained reservation rows by creation time and capability (grade/diagram/scan/practice); reserved/processing/succeeded/failed remain separate |
| AI failure rate / worst capability | Failed ÷ (succeeded + failed); pending excluded. Capability with highest observed rate among terminal operations |
| Operation duration | Mean non-negative `completed_at - processing_started_at` where both exist; application elapsed time, not pure provider latency |
| Quota usage | All reservations created in current UTC day per user/capability, including failures and pending, against existing configured daily limits |
| Model/version usage | Saved attempt grading provenance and saved Practice generation provenance; null is unknown. No invented token/cost history |
| Recent activity | Latest 20 selected account creations, authoritative submissions/revisions/Practice saves, feedback updates and AI failures; no noisy click feed |

The AI ledger's existing opportunistic 30-day cleanup remains unchanged, so old
operations may have already been deleted and unswept capabilities can retain
older rows. AI all-time means retained history. Operation failures before this
ledger and old transient behavior cannot be reconstructed. Live users can create
new records between independent refreshes; figures are a point-in-time view.

## Privacy and lifetime

Overview defaults to aggregates and pseudonymous short user IDs in the recent
feed. User/attempt drilldown is deliberate and metadata-only; even detail does
not return answers, questions, image data, snapshot IDs, hashes, private grading
blueprints, tokens or raw Auth metadata. Email appears only after an exact admin
search. Search/filter query strings may be present in normal hosting request
logs; do not paste sensitive content into search or share internal URLs.

Reports are private to their owner and authorized internal staff. Marks are
explicitly student-entered, optional and unverified, and never overwrite estimates.
Owners can edit/remove both reports. Account deletion cascades through all new
tables; attempt/question deletion cascades through linked reports/events. Events
are retained for account lifetime so return behavior is longitudinal; deletion
removes that person's contribution. This changes retained aggregates accordingly.
Privacy notice, DPIA processing facts and operations inventory/retention/access
request instructions have been updated. No analytics is sent to a new provider.

## Validation and operations

Tests use synthetic local data and **zero paid model requests**:

- Unit tests: deterministic UTC/DST/custom ranges, zero/legacy data, revision
  chain/cycle rules, report comparison, retention/funnels, filters, escaping and
  route-code/auth/session failures; validation rejects spoofed/oversized input.
- `npm run test:db:admin`: fresh migration replay plus seeded legacy upgrade,
  existing-row digests, RLS/grants, cross-owner references, report uniqueness,
  event limits/dedup, cascade cleanup, service-only RPCs, >1,000-row aggregates.
- `npm run test:db:diagrams`: existing assessment-authority/isolation regression.
- `node scripts/admin-local.mjs check`: real local Auth/PostgREST + production
  Next server, all seven tabs, DTO secrecy, reports/events, denied users, wrong
  codes and revoked sessions. Build/serve use verified local Docker credentials
  and a loopback-only provider stub that records any accidental calls.
- Browser: founder tab navigation and filters; student History rating/edit and
  optional mark flow; desktop and phone-width readability.

Local runbook: start the existing local Supabase stack, then run the harness
`migrate`, `setup`, `build`, `serve`; run `check` in another terminal. These modes
verify Docker project labels/workdir and use only loopback Supabase. `cleanup`
removes only the two exact disposable accounts created by that harness. Never
point this harness at production. The production migration must be applied once
through the pinned Supabase workflow, never a production reset or old-migration
edit. Rollback the application deployment and remove admin membership to disable
the feature; retain additive tables and owned data until a reviewed migration.

### Release evidence

- Full suite: 92 files, **1,370 tests passed**. Lint, TypeScript and optimized
  production build passed. Admin database suite: **62 assertions**; existing
  diagram database suite: **63 assertions**; real local HTTP/Auth: **47 checks**;
  existing local account-isolation/quota suite: **26 checks**. No model calls.
- Browser verified rating edits, student-reported mark saves, all-time date
  selection, attempt navigation/filters and readable 390px phone layout.
- Production-only `ADMIN_ROUTE_CODE` stored as a sensitive Vercel setting using
  authenticated CLI 59.1.4 and private stdin; value excluded from all outputs.
- Pinned Supabase CLI 2.116.0 dry run listed only the additive migration; push
  applied `20260916193103_admin_analytics.sql` successfully to Aptly
  `xwduxzwxeyiflkpnlkqd`. No previous migration was edited or reapplied remotely.
- Canonical whole-row digests before/after, for records created before
  `2026-09-16T20:49:52.340972Z`, were identical:

| Table | Rows | Before and after MD5 |
|---|---:|---|
| attempts | 128 | `f2d02fc691e4035f960ea6bc8f94d1a3` |
| practice_questions | 47 | `56965af19be47e7763feaaa6cb0ecaab` |
| assessment_snapshots | 3 | `76fefce2107863b56fe208ef4b572460` |

Post-migration security advisors found no exposed analytics grant or view issue.
The [RLS-without-policies information](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)
is intentional for service-only tables with zero browser grants. The existing
[leaked-password protection warning](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)
remains outside this release. Performance advisors report expected unused new
indexes and [unindexed nullable event FKs](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys),
alongside existing domain FK notices. At this release's zero event rows, keep
these informational; profile linked-work deletion as event volume grows before
adding those indexes. They do not weaken ownership or cascade guarantees.

- Production attempt-fact JSON aggregation was measured after migration:
  **11.592 ms** for 128 attempts (ordinary scan; no materialized view needed).
- Implementation commit: `d7a17e5f4c18c80353199cc4a6cd4638954a199b`.
  Vercel deployment `dpl_5YE1cCRrLginGh9fbTLCjK9BX4Vd` reached **Ready** and
  promoted to `https://aptlyib.app` through the existing main-branch integration.
- Production verification: **12 denied checks** with signed-out requests and the
  identified founder account *before* membership was granted; **32 allowed and
  regression checks** after granting that exact existing account; **1 revoked
  session check** after signing out the temporary verifier. All seven HTML tabs,
  the aggregate endpoint, private headers, absent code/credential/email leakage,
  wrong-code denial, owner report reads, and the six existing signed-in student
  routes passed. Retained Auth count was 22. No production test accounts, student
  work, ratings, events, emails or AI requests were created by verification.
- Founder membership is assigned to the explicitly selected existing account.
  The short-lived verification session was revoked; no other user sessions were
  revoked. To use the console, sign in normally as the founder and enter the
  privately configured route. Keep the code out of public support channels.

The actual numeric route is deliberately excluded. The following documentation
commit records this rollout without changing application behavior.
