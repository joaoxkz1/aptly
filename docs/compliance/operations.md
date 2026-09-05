# Aptly — privacy operations

**Controller:** Joao Perracini (individual; non-commercial student project)
**Contact:** contactaptly@gmail.com
**Version:** 1.0 — 18 August 2026

Internal working document. Not user-facing. Companion to `dpia.md`.

---

## 1. Data map

| Data | Where it lives | Notes |
|---|---|---|
| Email, user ID | `auth.users` (Supabase) | Sole identifier. Never sent to OpenAI. |
| Nickname, SL/HL level | `auth.users.raw_user_meta_data` | No profile table. |
| Session, refresh token | Supabase auth cookies + `auth.sessions` | |
| Question, answer, source material | `attempts` | Student-supplied. |
| Estimated marks, feedback, mistakes, topic, diagnostics | `attempts.feedback`, `attempts.assessment` + denormalised columns | AI-produced. |
| Grading provenance (model, rubric, taxonomy, contract, effort) | `attempts` × 5 columns | Auditability. All-or-nothing DB constraint. |
| Diagram findings | `attempts.diagram_evidence` | Feedback only. DB function rejects image data/URLs/EXIF. |
| Revision links | `attempts.parent_attempt_id` | |
| Generated practice + hidden grading blueprint | `practice_questions` | Blueprint hidden from browser by column-level GRANT. |
| Quota / idempotency | `ai_usage_reservations` | No content. Swept after 30 days. |
| Scan + diagram photos | **Nowhere** | Transient request data. Metadata stripped client-side before upload. |
| Derived profile (weak topics, recurring mistakes, Current Focus, Study Next, estimated level) | **Nowhere** | Recomputed in the browser each render from `attempts`. |
| Failure logs | Hosting platform stdout | Event, random request ID, stage, error *class*, status, timestamp. No content, email or user ID. |
| IP address, user agent | Provider infrastructure only | Aptly's own code writes neither. |

Dormant: `scan_extraction_usage` and `diagram_review_usage`. Superseded by
`ai_usage_reservations` in migration 0007, which revoked every grant — no
application role can read or write them. They retain the `on delete cascade`
FK, so they still empty on account deletion. **Drop them when convenient.**

---

## 2. Lawful bases

| Purpose | Basis | Note |
|---|---|---|
| Account, magic-link sign-in, sessions | Art 6(1)(b) contract | Cannot deliver a personal study account otherwise. |
| Saving work, AI grading, returning feedback | Art 6(1)(b) contract | This *is* the service requested. |
| Learning log, progress, Current Focus, practice targeting | Art 6(1)(b) contract | Personalised study direction is the headline promise, so it is necessary for the service rather than an add-on. |
| Daily quota enforcement, idempotency, abuse prevention | Art 6(1)(f) legitimate interests | LIA below. |
| Security and failure logging | Art 6(1)(f), supported by Art 32 | LIA below. |
| Service email (magic link) | Art 6(1)(b) contract | Transactional, not marketing — PECR reg. 22 not engaged. |

**Consent is not relied on anywhere.** No consent records, no withdrawal flow,
no consent checkbox. That is correct and deliberate: the core processing cannot
be switched off without breaking the product, so presenting it as consent would
misrepresent the basis — and would be a particularly poor basis for children.

None of Aptly's purposes fall within the DUAA's *recognised legitimate
interests* (crime, safeguarding, emergencies, national security, public-task
disclosure), so the full balancing test applies where 6(1)(f) is used.

### Legitimate interests assessments (short form)

**Quota enforcement / idempotency.** *Purpose:* Aptly pays per AI call; without
a per-user daily cap one account could exhaust the budget and take the service
down for everyone. Idempotency prevents one action being billed and saved twice.
*Necessity:* no less intrusive route — a cap requires counting per user per day.
*Balance:* rows contain no schoolwork (capability, date, status, two hashes),
are invisible to other users, are swept after 30 days, and the student benefits
directly from the service staying up. Minimal impact on a child. **Passes.**

**Security and failure logging.** *Purpose:* diagnose failures and keep the
service secure. *Necessity:* a failure cannot be fixed without knowing which
stage failed. *Balance:* logs are content-free by construction — the error
*message* is deliberately never logged, because a JSON parse error could quote
student text. No identifiers. **Passes.**

---

## 3. Providers

| Provider | Role | Receives | Transfer position |
|---|---|---|---|
| Supabase | Processor — auth, database, magic-link email | Everything stored | Region **to be confirmed** (§9). Publishes a DPA covering UK data protection law. |
| OpenAI | Processor — grading, transcription, diagram review, generation | Question, answer, source text, photos. **No name, email or user ID** | US. DPA applies EU SCCs as amended by the UK Addendum (DPA 2018 s119A). |
| Hosting provider | Processor — serves the app | Request data in transit, platform logs incl. IP | **To be confirmed** (§9). Code comments and the stock README point to Vercel. |

Supabase subprocessors (AWS, Google Cloud, Fly.io, Cloudflare, Upstash, Vercel)
flow down through its DPA. Subscribe to its subprocessor change notifications.

**No other external service exists.** No analytics SDK, no error-reporting
service, no advertising network, no payment processor, no CRM, no chat widget.
Runtime dependencies are exactly: `@supabase/ssr`, `@supabase/supabase-js`,
`openai`, `next`, `react`, `react-dom`, `next-themes`, `lucide-react`.

**OpenAI controls in use:** `store: false` on all four calls. Not opted into
training (API default since 1 Mar 2023). Zero Data Retention **not** requested —
see §9.

---

## 4. Retention schedule

| Data | Kept | Trigger |
|---|---|---|
| Account (email, nickname, level) | Life of the account | Account deletion |
| Attempts, feedback, assessments | Life of the account | Account deletion, or per-attempt delete |
| Practice questions | Life of the account | Account deletion; also auto-removed when the last attempt referencing them is deleted |
| Temporary typed drafts | Current tab session; 24-hour absolute cutoff from draft creation, checked on restore/read/write | Confirmed matching save, discard, sign-out/account change, account deletion, or stale-draft sweep |
| Scan / diagram photos | **Not retained** | n/a — transient request data |
| Derived profile | **Not retained** | n/a — recomputed each render |
| `ai_usage_reservations` | **30 days** | Automatic sweep |
| Failure logs | Provider default | Hosting platform |
| Provider backups | Provider cycle | Ages out after deletion |

**Temporary draft recovery (V1).** Account- and task-scoped sessionStorage only,
with schema version, creation/update timestamps, and allowlisted editable text.
Manual drafts include the question and typed source; Practice uses only answer
text and re-fetches its authoritative question. Revisions never restore a
browser-owned question or grading frame. No photos, data/blob URLs, blueprints,
auth tokens or credentials are stored. A request fingerprint and random
idempotency key support unchanged retries; neither authorizes grading.
Writes are synchronous on edits and tolerate unavailable/full storage. Old
submission completion cannot clear newer edits. Cleanup touches draft keys only.
The 24-hour cutoff is a product retention choice, not a claimed legal rule;
there is no server draft table, cross-device sync, or guaranteed closed-browser
recovery. Device cleanup requires storage access; rejected access is reported
in the editor and pending cleanup is retried before the next draft read/write
or account lifecycle event in the same document. Cleanup cannot be guaranteed
while the browser refuses storage access.

**Why study history is kept for the life of the account.** The Learning log,
progress, Current Focus and revision chains are all computed from the full
history — it is not a byproduct, it is the product. A student who wants it gone
deletes their account, and can delete individual answers at any time.

**Why 30 days for the reservation ledger.** Quota enforcement reads only the
current UTC day. Idempotency matters for minutes (and the durable protection
against a duplicate saved grade is the separate unique index on
`attempts (user_id, idempotency_key)`, which is unaffected by the sweep). The
binding need is short-term reconciliation — investigating "I hit the limit
early" or "this was charged twice", realistically raised within a month. 30 days
covers that with margin; nothing identified needs longer.

**Mechanism.** Implemented in SQL inside `reserve_ai_usage` (migration 0011),
scoped to the same user *and* capability the transaction already holds an
advisory lock for. No cron, no new infrastructure, no extra round-trip, no new
lock ordering. Verified locally: rows at 31 and 400 days removed; today and the
30-day boundary retained; another capability's 400-day row untouched.

**Not implemented, deliberately:** inactive-account deletion. Worth revisiting
once there is a real user base and a defensible dormancy period.

---

## 5. Data-subject requests

Single route: **contactaptly@gmail.com**.

1. **Identify.** Reply-from-account-email is proportionate here. If the request
   arrives from a different address, ask the person to send it from the address
   their account uses. Never demand ID documents from a child.
2. **Log** date received, address, what was asked, what was done, date closed.
   A private note or spreadsheet is sufficient. **Do not build this into Aptly.**
3. **Respond within one month.** Extendable by two further months for complex
   requests — tell the person inside the first month if extending.
4. **Fulfil:**
   - *Access* — export their `attempts` and `practice_questions` rows plus their
     account fields. Say plainly that marks are Aptly estimates, so the export
     cannot be mistaken for a transcript.
   - *Erasure* — point them at Your data → Delete my account (self-service), or
     do it via the Supabase dashboard.
   - *Rectification* — nickname and course level are self-service. For a
     disputed AI judgement, the practical remedy is deleting that attempt, which
     removes it from every derived insight.
   - *Restriction / objection* — assess case by case; note the outcome and the
     reasoning in the log.
   - *Portability* — applies to data the student provided under contract
     (their answers). AI-derived assessments are arguably outside Art 20, but
     Art 15 access covers them regardless, so in practice export everything.

No self-service export is built. That is a deliberate scope decision — email is
legally sufficient for these rights and the user base is small.

---

## 6. Complaints

**Duty:** DPA 2018 s164A (inserted by DUAA 2025 s103, in force 19 June 2026).
Applies to every controller regardless of size.

1. Complaints arrive at contactaptly@gmail.com — this is the electronic route.
   It is published in the Privacy Notice, the footer and the Your data page.
2. **Acknowledge within 30 days.** This is a hard statutory deadline.
3. Investigate proportionately; take appropriate steps.
4. Tell the complainant the outcome.
5. Log it alongside DSARs.
6. Tell them they can escalate to the ICO at
   https://ico.org.uk/make-a-complaint/ — the Privacy Notice already does.

---

## 7. Breach response

1. **Contain** — revoke keys, sign out sessions, take the deployment down if
   needed.
2. **Assess** — what data, how many people, are children affected (they usually
   are), what is the realistic harm.
3. **Report to the ICO within 72 hours** of becoming aware, unless the breach is
   unlikely to result in a risk to people's rights and freedoms. Report at
   https://ico.org.uk/for-organisations/report-a-breach/. If reporting late,
   explain the delay.
4. **Tell affected users without undue delay** if the risk is high.
5. **Log every breach**, including ones not reported and why not. Art 33(5)
   requires this record regardless of reportability.

Most likely realistic vectors, in order: a compromised founder account
(Supabase/hosting/email) → hence MFA in §9; an accidental service-role key leak
→ the key is server-only by build-time guarantee and never logged; a Supabase
misconfiguration disabling RLS → covered by the security verifier.

---

## 8. Security summary

Evidence for Art 32. All present in the codebase today.

- **Row-level security** on all four active tables; browser roles hold
  SELECT/DELETE on their own rows only.
- **Server authority** — INSERT/UPDATE revoked from `authenticated` (migration
  0007). Every authoritative write runs server-side after authenticating with
  the cookie-scoped client and deriving a verified user ID.
- **Column-level grants** hide grading blueprints and provenance from the
  browser entirely.
- `user_id` is database-generated from the JWT (`default auth.uid()`).
- **Service-role key is server-only**, enforced at build time by
  `import "server-only"`. Never logged.
- Route protection uses `getClaims()` (verifies the JWT), not `getSession()`.
- **Content-free logging** — error class and stage only, never the message.
- **No image persistence**; EXIF/GPS stripped client-side by canvas re-encode.
- **Database-level payload validation** — `is_valid_diagram_evidence()` rejects
  base64, data/blob URLs, storage keys, EXIF, GPS and image filenames.
- **Fail-closed AI handling** — strict JSON schema validation server-side.
- **Account deletion** derives the subject only from the session; the handler
  takes no parameters, so no caller can name another user.
- **Verifiers** — `npm run test:security:local` (25 checks) against a local
  instance; full unit suite in CI-able form.

---

## 9. Founder actions still required

Code cannot complete these. **None is marked done.**

| # | Action | Why | Status |
|---|---|---|---|
| 1 | **Execute the OpenAI DPA** via OpenAI's DPA form | Art 28(3) requires a written processor contract. Not automatic on API signup. The Privacy Notice's transfer wording relies on it. | ☐ Required before real users |
| 2 | **Execute the Supabase DPA** | Same. | ☐ Required before real users |
| 3 | **Execute the hosting provider's DPA** | Same. Confirm the host first (#5). | ☐ Required before real users |
| 4 | **Confirm the Supabase project region** | Determines whether the primary store is UK, EEA (adequacy), or a restricted transfer needing the UK Addendum/IDTA. Not discoverable from the repo. London is the easy answer if it is not already set. | ☐ Required |
| 5 | **Confirm the hosting provider and function region** | Inferred as Vercel from code comments and the stock README, never confirmed. Default function region is the US. | ☐ Required |
| 6 | **Confirm whether custom SMTP is configured** in Supabase | `config.toml` has it commented out, so the hosted default is presumed. If a custom provider is set, it is an extra processor receiving every user's email and must be added to §3 and the Privacy Notice. | ☐ Required |
| 7 | **Run the ICO data-protection fee self-assessment** at https://ico.org.uk/for-organisations/data-protection-fee/data-protection-fee-self-assessment/ | **Genuinely uncertain — do not assume a fee is due.** The exemptions include "personal, family or household affairs … no connection to any commercial or professional activity", which a non-commercial student project may fit. But Aptly serves real external users, which stretches that exemption. The ICO's self-assessment is the authoritative answer; it takes minutes. If a fee is due it is Tier 1 (£52, or £47 by direct debit). | ☐ Required |
| 8 | **Enable MFA** on Supabase, the hosting account, the domain registrar and contactaptly@gmail.com | A compromised founder account is the largest realistic breach vector for this architecture. Not an Aptly feature. | ☐ Strongly recommended |
| 9 | **Monitor contactaptly@gmail.com** | The 30-day complaints acknowledgement (§6) and the one-month DSAR deadline (§5) both run from receipt. An unmonitored inbox is a live breach of s164A. | ☐ Required |
| 10 | Consider requesting **Zero Data Retention** from OpenAI | Would remove abuse-monitoring retention of student work. Given an essentially all-minor user base this is a meaningful improvement and answers OpenAI's own under-18 guidance. **Not** a blocker: ZDR is required by OpenAI's terms only for users below the age of digital consent (13 in the UK), and Aptly's stated minimum is 13. | ☐ Recommended |
| 11 | Decide a **governing-law clause** for the Terms, or leave it out | Currently omitted rather than guessed, because the operator's establishing jurisdiction is not recorded anywhere. England and Wales is the likely answer for a UK-based operator. | ☐ Optional |
| 12 | **Geographic address — keep under review** | No geographic address is published for the current non-commercial student-project version. UK GDPR Art 13(1)(a) is satisfied without one (it requires "identity and contact details", met by the operator name + contact email). The separate E-Commerce Regulations 2002 reg. 6 service-provider address requirement is **fact-sensitive and not treated as settled**: ICO guidance notes some free/not-for-profit educational services may still be information society services where they amount to economic activity in a broader sense. Reassess if Aptly becomes commercial, monetised, incorporated, or materially expands beyond its current student-project context. **Never publish a home address** — use a service address if one becomes necessary. | ☐ Under review; take legal advice before monetising |

---

## 10. Review triggers

Revisit this document and `dpia.md` on any of: teacher/school access, payments,
advertising, analytics, sharing or social features, under-13 users,
official/predictive grading positioning, a different AI provider, or storing
images. Full reasoning in `dpia.md` §9.
