# Learning-loop implementation — 5 September 2026

> Historical implementation note. [Diagram-aware grading](diagram-aware-grading.md) adds four-mark diagram practice and versioned assessed diagram diagnostics to these paths; legacy attempts retain the behavior described below.

Implemented the three workstreams in the attached implementation brief. This changes the selection and presentation of a next action, preserves unfinished typed work in the current tab, and repairs the low-history route to Practice. It does not establish improved learning outcomes.

## 1. Confirmed starting state and root causes

The working tree was clean on `main`, with one worktree and HEAD `7fb6c3d3fcd657fa3090b4cb65bf878245d861c5`, matching the audited commit. The bundled Next.js 16.3 client-component and search-parameter guides were read before editing. No newer user work was overwritten.

The existing answer resolver sorted non-perfect diagnostic ratios and took the first row. Equal ratios therefore selected Knowledge when it appeared first, even when the controlled issue label identified analysis or evaluation. The existing trusted Practice pipeline then correctly preserved that wrong selection. Study Next and practice actions were below the detailed feedback. Submit kept editable text and retry identity only in component memory. The low-history “Practise another topic” action linked to manual Submit, and completed course setup still displayed “First, choose your course”.

Only relevant implementation paths and the earlier synthetic audit evidence were inspected. No unrelated production users were queried.

## 2. Precise selection policy

The browser and server use the same pure answer-specific resolver. Global Current Focus and aggregate analytics formulas remain separate and unchanged.

1. Require a marked, core-analytics-eligible answer in the current taxonomy, a known topic, and available required source material.
2. Admit only finite, valid, non-excellent diagnostic rows genuinely assessed by the question. Saved Knowledge and Structure rows establish their qualitative assessment; other rows require their mapped assessment skill. Diagram rows are excluded. Evaluation also requires an evaluation-capable framework: Paper 1(b), 2(g), 3(b), or generic practice.
3. Find the lowest awarded/available ratio. A clearly weaker assessed diagnostic retains precedence over a higher-rated one.
4. Within that lowest group, prefer rows supported by the existing structured issue vocabulary. Select only if they establish one unique skill. Multiple supported skills remain ambiguous.
5. Without issue support, a unique lowest skill at 0–2/4 (ratio at most 0.5) can establish a priority. A 3/4 row needs issue support; a non-perfect rating alone is insufficient. All-excellent responses remain neutral, even with contradictory issue tags.
6. If no defensible single skill remains, offer general Practice. An identified unsupported format produces an explicit limitation and general Practice, without substituting an essay or a definition.

Controlled mappings:

| Existing issue labels | Skill |
| --- | --- |
| Weak definitions; Weak terminology | Knowledge / definition |
| Inaccurate economic theory; Underdeveloped economic analysis | Analysis |
| Lack of evaluation; Underdeveloped evaluation; Unsupported judgement | Evaluation |
| No real-world example; Irrelevant real-world example; Underdeveloped real-world example | Application |
| Insufficient source use | Data interpretation, with existing format limitation |
| Calculation/setup error | Calculation, with existing format limitation |
| Unclear structure | Structure, with existing format limitation |

There is no priority based on diagnostic order, issue order/count, improvement-bullet order, prose keywords, or another AI call. A theory error is not automatically a definition exercise.

## 3. Before/after regression results

Fixtures retain the relevant question, synthetic answer, saved feedback and diagnostic shape from the audit. Both browser results below use mocked provider output through the real local grading/persistence route.

| Case | Existing behavior | Implemented behavior |
| --- | --- | --- |
| S2 fiscal-policy transfer: Knowledge, Analysis and Application tied at 3/4; Knowledge praised; “Underdeveloped economic analysis” | Knowledge by first-row order; definition practice | Analysis; 10-mark fiscal-policy explanation; unchanged 8/10 estimate |
| S3 City B: Knowledge, Analysis and Evaluation tied at 3/4; “Underdeveloped evaluation” | Knowledge by first-row order | Evaluation; 15-mark externalities evaluation; unchanged 11/15 estimate |
| Genuine weak opportunity-cost definition | Knowledge | Knowledge, with no analysis/evaluation method cue |
| Strong tied rows with absent/legacy/competing issue evidence | Arbitrary first row possible | Neutral “Choose your next practice” |

Every diagnostic permutation of the S2/S3 fixtures preserves the new target. Route tests cover both cases through bank selection and mocked API fallback, including the saved focus contract. Representative bank wording and private analysis/evaluation guidance were inspected and exercised. These checks establish alignment, not pedagogical effectiveness.

## 4. Exact Next step UI

One compact area now sits immediately below the estimated mark. It replaces the former bottom Study Next callout and action group. Detailed strengths, improvements, diagnostics, issues and examiner-style comment retain their content. The hidden `bandRationale` remains hidden.

Heading: **Next step**. Priority: **Knowledge**, **Analysis**, **Application**, or **Evaluation**.

| Priority | Instruction |
| --- | --- |
| Knowledge | Check the meaning of the relevant concept and use its terminology accurately. |
| Analysis | Develop the causal chain from the initial change to the outcome the question asks about. |
| Application | Connect relevant example details to your economic reasoning and judgment. |
| Evaluation | Explain how a condition or trade-off changes your reasoning, then use it to support your judgment. |

The saved prose is not reliably keyed to a specific skill, so these modest authored instructions avoid inventing answer-specific claims. Original Study Next text remains available once, collapsed under **Saved study advice**; the unsaved sample uses **Study advice**.

The **Show me a method** disclosure starts collapsed and appears only for Analysis or Evaluation.

Analysis cue:

1. What changes first?
2. Which incentive, cost, spending decision or constraint changes?
3. How do households, firms or another relevant actor respond?
4. How does that response produce the outcome in the question?

Evaluation cue:

1. Identify a condition or trade-off.
2. Explain how it changes the mechanism or effectiveness.
3. Use that explanation to support your judgment.

Both end with: **A practice strategy, not an official IB marking checklist.** No model answer, country statistics, paragraph mandate, or teacher-review claim is introduced.

Actions: **Revise this answer**, **Practise [skill] on a new question**, and the existing secondary action (Submit feedback uses **Use my own question**; History retains its history action).

Neutral priority: **Choose your next practice**. Instruction: **This answer does not establish one clear supported priority. Choose a topic you want to practise.** Action: **Choose a practice question**.

Unsupported instruction: **This focused-practice format is not available yet. Review the feedback or choose general practice.**

## 5. Trusted new-question flow

The answer action continues to carry the source-attempt ID into the existing server-verified focus contract. Exact topic, skill, marks, framework, taxonomy and course restrictions, reservations, quotas and idempotency remain enforced. Curated bank selection remains first; compatible exhaustion or no eligible question still reaches the existing validated Practice API generation path. Private grading blueprints remain server-owned.

Selection additionally excludes the normalized original question, including punctuation/case/mark-annotation variations. Where the source matches a known bank question, existing angle tags prefer the least overlap among otherwise eligible unseen questions. API instructions ask for another task/reasoning angle and validation rejects a normalized exact repeat. This does not certify semantic novelty.

Local connected evidence for S2:

- Source saved answer: `95f983d0-bd63-4883-ac49-76e374dca8cd`.
- Bank result `e295d6f1-a68c-452e-8634-dc903a75d352`: “Explain how expansionary fiscal policy may reduce a deflationary gap. [10 marks]”.
- After exhausting only the compatible local bank pool, mocked API result `33d9d12a-6bbd-4406-b910-2bf7c7c0f379`: “Explain how a cut in income tax may affect household spending and employment in an economy with spare capacity. [10 marks]”.
- Both database rows record Analysis, fiscal policy 3.6, Paper 1(a), 10 marks, SL, `source=answer_feedback`, the original source ID and `serverVerified=true`.
- Submit displayed the fixed question and matching skill/topic/marks. A resulting answer saved with `parent_attempt_id=null` and its new Practice question ID. A new question did not become a revision of the source answer.

## 6. Draft storage, lifecycle and retry

V1 stores allowlisted text in account- and task-scoped `sessionStorage` keys under `aptly:draft:v1:`. Tasks are manual, a particular Practice question ID, or a particular revision parent ID. Records have explicit version, account/task identity, creation/update timestamps and an absolute 24-hour lifetime checked on restore/read/write. This is a product retention choice.

Manual drafts retain question, answer and editable source text. Practice drafts retain the answer only. Revision drafts retain the fresh answer and any necessary editable source text; neither restores a browser-owned question. Authoritative question, source, framework, topic, marks and private guidance are fetched through existing trusted paths before restoration.

Text writes are synchronous on edits, so an immediate reload does not depend on a debounce or unload handler. Restoration waits for verified authentication and loaded task context. New typing cannot be overwritten by a late restore. Storage corruption, future timestamps, stale schema, invalid task identities, denied access and full storage are handled without breaking the editor.

No images, base64 data URLs, blob URLs, private blueprints, tokens or API credentials are persisted by the draft system; draft text is not logged. Scan-extracted editable text can be retained, but the photo cannot. The sample walkthrough does not restore or replace an unfinished manual draft; returning to one's own answer restores it. Explicit replacement with the sample retains the existing confirmation.

Cleanup removes draft keys only: confirmed matching persistence, discard, sign-out, account switch, deletion and stale sweeps. The auth boundary tears down old account editor state. Old-account responses cannot write or clear a new account's draft. Failed cleanup is retried before the next access in the same document. While browser storage is inaccessible, physical cleanup cannot be guaranteed.

A confirmed save clears only the submitted revision of the draft. Newer typing survives an older request completing, page navigation and reload. Grade clicks, failed requests and uncertain responses do not clear the draft or automatically submit it.

Retry metadata consists of a SHA-256 fingerprint of the existing submission signature and a random idempotency key. The raw signature is not stored. An unchanged submission reuses the key across reloads; materially changed text/context receives a different request identity. Server reservation/replay/persistence behavior is unchanged. This is not a separate offline queue. If a prior operation has conclusively failed or is still processing, existing server status handling still applies; the client does not evade it by inventing another paid operation.

Exact messages:

- **Draft restored for this question in this tab. Reattach any photo you still need.**
- **Discard draft**.
- **Temporary draft recovery is unavailable in this tab. Keep a copy of your text before leaving.**
- **Your earlier answer was saved to History. Your newer edits are still here.**
- Unknown completion: **We couldn't confirm completion of this mark estimate. Check History before retrying; your answer may already be saved. Retrying the same submission reuses the same request. If processing had already started, this try may count toward today's limit.** A History link accompanies grading errors.

## 7. Low-history onboarding

“Practise another topic” now opens `/practice?mode=general&suggest=uncovered`, with a secondary “Use my own question” path. Its low-history heading is “Choose your next topic”. Current-taxonomy saved-topic coverage may suggest the first eligible uncovered topic. SL excludes HL-only topics; HL can include them. Topic and marks remain editable, with a valid 10-mark default. Missing coverage/all-covered cases use ordinary valid defaults. A valid answer-specific source takes precedence over any uncovered-topic suggestion.

Copy: **There is not enough evidence for one reliable focus yet. Practise a topic you have studied; you can change the suggestion.** Practice adds: **This topic has no saved answer yet. Choose a topic you have studied, and change the question length if you like.**

The local first-answer journey covered 1.1, then offered 1.2 at 10 marks. Changing the topic to monetary policy and marks to 15 worked in general mode. Zero-attempt Home still opens the first-question generator and sample feedback. Course setup, Getting Started completion criteria and revision-chain analytics are unchanged. An already configured profile now says “Your course:” rather than “First, choose your course:”.

## 8. Public privacy wording

Only the device-storage section and its update date changed. It now lists **Temporary typed drafts** and explains per-account/question current-tab storage, reload/navigation recovery, the 24-hour cutoff and cleanup on the next access, confirmed-save/discard/auth/deletion cleanup, unavailable-storage limits, and the possibility of needing to reattach photos. It explicitly states that this is not cloud saving or cross-device sync and closed-browser recovery is not guaranteed. Existing statements that photos are not retained remain unchanged.

The previous three-item count and categorical UK cookie-banner assertion were replaced with factual wording about sign-in, preferences and unfinished-work recovery. No legal modal, consent flow, tracker or advertising storage was added. Privacy is dated 5 September 2026; Terms keeps its existing date. The internal retention table and operations note describe the implementation and storage-access limitation.

## 9. Verification and limits

| Gate | Result |
| --- | --- |
| Targeted recommendation, draft, schema and Practice-route tests | Pass |
| Full Vitest suite | 59 files; 787 tests pass (baseline 57 files / 745 tests) |
| ESLint | Pass, no warnings |
| TypeScript `tsc --noEmit` | Pass |
| Production Next.js build | Pass; all 22 generated pages |
| Dependency audit, including development | 8 affected package names: 3 moderate, 4 high, 1 critical; no dependency files changed |
| Dependency audit, production only | 0 advisories |
| `git diff --check` | Pass |

The development advisories affect the existing Vitest/Vite/esbuild dependency chain and brace-expansion, browserslist and js-yaml. Dependency remediation was not folded into this change. Existing test failure-path logs and the Vite CJS deprecation warning are expected test output.

Browser QA used Docker-verified **local** Supabase at `127.0.0.1:54321`, local PostgreSQL at port 54322, a production frontend at port 3100 and a loopback mock provider at port 3101. Two disposable local accounts were used; account B was deleted through the real UI. The already committed 0012 local migration was applied idempotently to the disposable local backend; no migration was authored or run remotely. The existing `.env.local` was not changed; the harness supplies explicit local environment overrides.

Connected checks covered the required A–D journeys: S2 feedback → matching bank and mocked API practice → trusted Submit; substantial text → immediate reload → restored correct task → successful save → cleared draft; first feedback → editable uncovered-topic generator; and account switch/sign-out → no old draft, including signing back into the original account. Additional checks covered S3 Evaluation, typed source restoration, revision draft recovery with a fresh initially empty answer, discarded text, newer edits surviving an in-flight save, sample preservation and disposable-account deletion.

Desktop and 390×844 mobile viewport checks found the next action directly below the mark, collapsed optional content, a single consolidated Study Next area, wrapped actions, no horizontal overflow and no observed keyboard trap. Keyboard checks were a focused Tab/disclosure check, not a full assistive-technology audit. There was no pixel-level pre/post height measurement; detailed feedback is retained and the moved action area stays compact when collapsed.

**Live-provider calls: zero.** All provider responses during this implementation's browser QA were mocked. Live generation quality remains unverified. Existing source/calculation/policy/diagram generation limitations remain. Recovery is limited to accessible storage in the current tab/session, not closed-browser or cross-device recovery; preflight format choices and mark overrides must still be confirmed again after reload. Angle tags and text normalization do not prove semantic novelty, mastery or transfer. Students and teachers must still establish educational benefit.

## 10. Screenshots

All screenshots show synthetic local data. The final copy-only change from “Saved study advice” to “Study advice” affects the unsaved sample; the saved-feedback screenshots below remain representative.

- [Desktop Next step](<C:/Users/Joao Perracini/.codex/visualizations/2026/09/05/01a071de-3163-77a2-9569-f2fd284ddba0/next-step-desktop.png>)
- [Mobile Next step, collapsed](<C:/Users/Joao Perracini/.codex/visualizations/2026/09/05/01a071de-3163-77a2-9569-f2fd284ddba0/next-step-mobile.png>)
- [Mobile analysis method](<C:/Users/Joao Perracini/.codex/visualizations/2026/09/05/01a071de-3163-77a2-9569-f2fd284ddba0/analysis-method-mobile.png>)
- [Mobile evaluation method](<C:/Users/Joao Perracini/.codex/visualizations/2026/09/05/01a071de-3163-77a2-9569-f2fd284ddba0/evaluation-method-mobile.png>)
- [General Practice suggestion on desktop](<C:/Users/Joao Perracini/.codex/visualizations/2026/09/05/01a071de-3163-77a2-9569-f2fd284ddba0/general-practice-desktop.png>)
- [Restored manual draft on desktop](<C:/Users/Joao Perracini/.codex/visualizations/2026/09/05/01a071de-3163-77a2-9569-f2fd284ddba0/manual-draft-restored-desktop.png>)
- [Newer edits retained after an older save](<C:/Users/Joao Perracini/.codex/visualizations/2026/09/05/01a071de-3163-77a2-9569-f2fd284ddba0/newer-draft-mobile.png>)
- [Mocked API task in Submit](<C:/Users/Joao Perracini/.codex/visualizations/2026/09/05/01a071de-3163-77a2-9569-f2fd284ddba0/mock-api-submit-mobile.png>)
- [Restored typed source](<C:/Users/Joao Perracini/.codex/visualizations/2026/09/05/01a071de-3163-77a2-9569-f2fd284ddba0/typed-source-restored-mobile.png>)
- [Restored revision draft](<C:/Users/Joao Perracini/.codex/visualizations/2026/09/05/01a071de-3163-77a2-9569-f2fd284ddba0/revision-draft-mobile.png>)

## 11. Original Git handoff (historical)

This snapshot predates the subsequent pre-release verification and local-commit approval.

The implementation is ready for review and safe to commit as this scoped change, subject to the disclosed existing development-dependency advisories and verification limits. Nothing was committed, staged, pushed or deployed. HEAD remains `7fb6c3d3fcd657fa3090b4cb65bf878245d861c5` on `main`. There are no package, lockfile, new migration or environment-configuration changes. The local QA helper and app started for this task are stopped at handoff; unrelated services remain untouched. Local synthetic account A and its evidence remain available for review.

Tracked diff: **21 files, +305 / −108 lines**. Including 11 untracked files listed below: **32 files, +1559 / −108 lines**. No staged changes.

Exact changed files follow (`M` modified; `??` new/untracked). New-file line counts are included separately because ordinary `git diff --stat` omits untracked files.

| Status | File | Added / removed lines |
| --- | --- | --- |
| M | [app/(app)/page.tsx](<C:/Users/Joao Perracini/New folder/aptly/app/(app)/page.tsx>) | +1 / −1 |
| M | [app/(app)/practice/page.tsx](<C:/Users/Joao Perracini/New folder/aptly/app/(app)/practice/page.tsx>) | +22 / −4 |
| M | [app/(app)/settings/page.tsx](<C:/Users/Joao Perracini/New folder/aptly/app/(app)/settings/page.tsx>) | +2 / −0 |
| M | [app/(app)/submit/page.tsx](<C:/Users/Joao Perracini/New folder/aptly/app/(app)/submit/page.tsx>) | +98 / −38 |
| M | [app/(public)/privacy/page.tsx](<C:/Users/Joao Perracini/New folder/aptly/app/(public)/privacy/page.tsx>) | +13 / −3 |
| M | [app/api/practice/route.test.ts](<C:/Users/Joao Perracini/New folder/aptly/app/api/practice/route.test.ts>) | +30 / −0 |
| M | [components/app-shell.tsx](<C:/Users/Joao Perracini/New folder/aptly/components/app-shell.tsx>) | +4 / −1 |
| ?? | [components/assessment/answer-next-step.tsx](<C:/Users/Joao Perracini/New folder/aptly/components/assessment/answer-next-step.tsx>) | +82 / −0 |
| M | [components/assessment/next-focus-card.tsx](<C:/Users/Joao Perracini/New folder/aptly/components/assessment/next-focus-card.tsx>) | +5 / −3 |
| ?? | [components/draft-account-boundary.tsx](<C:/Users/Joao Perracini/New folder/aptly/components/draft-account-boundary.tsx>) | +44 / −0 |
| M | [components/feedback-result.tsx](<C:/Users/Joao Perracini/New folder/aptly/components/feedback-result.tsx>) | +8 / −44 |
| M | [components/legal/legal-page.tsx](<C:/Users/Joao Perracini/New folder/aptly/components/legal/legal-page.tsx>) | +3 / −1 |
| M | [components/submit/preflight-choice.tsx](<C:/Users/Joao Perracini/New folder/aptly/components/submit/preflight-choice.tsx>) | +6 / −2 |
| M | [docs/compliance/operations.md](<C:/Users/Joao Perracini/New folder/aptly/docs/compliance/operations.md>) | +17 / −0 |
| ?? | [docs/learning-loop-implementation.md](<C:/Users/Joao Perracini/New folder/aptly/docs/learning-loop-implementation.md>) | +220 / −0 |
| M | [lib/ai/grade-errors.test.ts](<C:/Users/Joao Perracini/New folder/aptly/lib/ai/grade-errors.test.ts>) | +1 / −1 |
| M | [lib/ai/grade-errors.ts](<C:/Users/Joao Perracini/New folder/aptly/lib/ai/grade-errors.ts>) | +1 / −1 |
| M | [lib/ai/practice-schema.test.ts](<C:/Users/Joao Perracini/New folder/aptly/lib/ai/practice-schema.test.ts>) | +11 / −0 |
| M | [lib/ai/practice-schema.ts](<C:/Users/Joao Perracini/New folder/aptly/lib/ai/practice-schema.ts>) | +3 / −0 |
| M | [lib/assessment/focused-practice-ui.test.ts](<C:/Users/Joao Perracini/New folder/aptly/lib/assessment/focused-practice-ui.test.ts>) | +1 / −1 |
| M | [lib/assessment/focused-practice.ts](<C:/Users/Joao Perracini/New folder/aptly/lib/assessment/focused-practice.ts>) | +64 / −6 |
| ?? | [lib/assessment/general-practice.ts](<C:/Users/Joao Perracini/New folder/aptly/lib/assessment/general-practice.ts>) | +19 / −0 |
| ?? | [lib/assessment/learning-loop.test.ts](<C:/Users/Joao Perracini/New folder/aptly/lib/assessment/learning-loop.test.ts>) | +145 / −0 |
| M | [lib/assessment/question-bank/economics-v1/selection.ts](<C:/Users/Joao Perracini/New folder/aptly/lib/assessment/question-bank/economics-v1/selection.ts>) | +11 / −0 |
| ?? | [lib/assessment/question-identity.ts](<C:/Users/Joao Perracini/New folder/aptly/lib/assessment/question-identity.ts>) | +4 / −0 |
| M | [lib/diagram/diagram-protections.test.ts](<C:/Users/Joao Perracini/New folder/aptly/lib/diagram/diagram-protections.test.ts>) | +2 / −1 |
| ?? | [lib/drafts/session-draft.test.ts](<C:/Users/Joao Perracini/New folder/aptly/lib/drafts/session-draft.test.ts>) | +182 / −0 |
| ?? | [lib/drafts/session-draft.ts](<C:/Users/Joao Perracini/New folder/aptly/lib/drafts/session-draft.ts>) | +225 / −0 |
| ?? | [lib/drafts/use-submit-draft.ts](<C:/Users/Joao Perracini/New folder/aptly/lib/drafts/use-submit-draft.ts>) | +18 / −0 |
| M | [lib/legal/legal-surface.test.ts](<C:/Users/Joao Perracini/New folder/aptly/lib/legal/legal-surface.test.ts>) | +2 / −1 |
| ?? | [lib/testing/learning-loop-fixtures.ts](<C:/Users/Joao Perracini/New folder/aptly/lib/testing/learning-loop-fixtures.ts>) | +177 / −0 |
| ?? | [scripts/learning-loop-local.mjs](<C:/Users/Joao Perracini/New folder/aptly/scripts/learning-loop-local.mjs>) | +138 / −0 |

## 12. Local-commit follow-up — 5 September 2026

The public Privacy section now qualifies cleanup on storage access, matching save/discard and account lifecycle events, retries limited to the same loaded page, the access-triggered 24-hour cutoff, and browser site-data clearing. Only its existing wording test was extended; the draft implementation is unchanged.

Migration `0012_verified_practice_focus.sql` was verified against the Docker-backed local database `supabase_db_aptly` (project `aptly`, host port 54322). Both nullable JSONB columns and absent defaults, both complete constraint definitions and validated states, the exact column comment, and effective browser privileges matched. Constraint definitions were compared with a temporary reference table built from the committed SQL and rolled back. Supabase CLI 2.115.0 then ran `migration repair 0012 --status applied --local` with this repository as the explicit workdir. Local history now matches `0001`–`0012`; a checksum confirms all prior ledger entries are unchanged. No application data was read or changed, no users were created, and no remote project was used. Migration files are unchanged.

Sign-in/onboarding testing was deliberately excluded by the user and is neither a failed check nor a blocker to this local commit. Existing onboarding improvements remain. Authenticated end-to-end and dynamic local security/integration checks, a bounded real-provider check, and educational-effectiveness evaluation remain outside this pass; earlier mocked journeys are historical evidence only. No new benchmark or broad security audit was performed.

Separate dependency hardening remains: the prior full audit found **8 affected development package names across 12 unique advisories**, including one critical package; the production-only audit found **0**. The affected packages are Vitest, Vite, vite-node, @vitest/mocker, esbuild, brace-expansion, browserslist and js-yaml. These findings were not suppressed or fixed, and dependencies and audit configuration are unchanged. Address the existing development advisories separately, especially before enabling Vitest UI/API or browser modes.

The final required gates are the affected legal wording tests, full existing suite, ESLint, TypeScript, production build and `git diff --check`; results are recorded in the local commit evidence outside Git. The approved action ends at a local commit, with no push, deployment, remote migration or production access.
