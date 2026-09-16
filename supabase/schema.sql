-- Aptly — attempts persistence schema
-- Safe to re-run (idempotent table, index, and policies).
-- Paste into the Supabase SQL Editor and run.

-- 0. Generated practice questions (Practice Loop) ---------------------------
-- Created BEFORE attempts so the attempts FK below can reference it. One
-- private row per Aptly-generated practice question; the generated source
-- material (Paper 2(g)/3(b)) lives ONLY here and grading always reads it
-- server-side — never a client-supplied copy.
create table if not exists public.practice_questions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade default auth.uid(),
  created_at      timestamptz not null default now(),
  question        text not null,
  source_material text,
  framework       text not null check (framework in (
    'paper2_short_analytic',
    'paper1a_10_mark',
    'paper1b_15_mark',
    'paper2g_15_mark',
    'paper3b_10_mark',
    'generic_practice'
  )),
  mark_total      integer not null check (mark_total between 1 and 60),
  topic_code      text not null,
  topic_label     text not null,
  taxonomy_version text check (
    taxonomy_version is null
    or taxonomy_version in ('economics-legacy-v3', 'economics-2022-v1')
  ),
  skill           text not null,
  why             text not null,
  idempotency_key uuid,
  authority_version smallint not null check (authority_version = 1),
  -- Question Generator V1 trusted provenance. All NULL denotes a historical
  -- pre-bank row; current rows carry the complete server-authored bundle.
  question_origin          text,
  bank_question_id         text,
  question_bank_version    text,
  grading_blueprint        jsonb,
  grading_blueprint_version text,
  level_relevance          text,
  command_term             text,
  target_skills            text[],
  angle_tags               text[],
  from_current_focus       boolean not null default false,
  request_fingerprint      char(64),
  constraint practice_questions_question_bank_bundle_chk check (
    (
      question_origin is null
      and bank_question_id is null
      and question_bank_version is null
      and grading_blueprint is null
      and grading_blueprint_version is null
      and level_relevance is null
      and command_term is null
      and target_skills is null
      and angle_tags is null
      and request_fingerprint is null
    )
    or
    (
      question_origin in ('curated_bank', 'adaptive_generated')
      and jsonb_typeof(grading_blueprint) = 'object'
      and octet_length(grading_blueprint::text) <= 32768
      and grading_blueprint_version = 'economics-grading-blueprint-v1'
      and level_relevance in ('shared_sl_hl', 'hl_only')
      and command_term is not null
      and cardinality(target_skills) >= 1
      and cardinality(angle_tags) >= 1
      and request_fingerprint ~ '^[0-9a-f]{64}$'
      and (
        (
          question_origin = 'curated_bank'
          and bank_question_id is not null
          and question_bank_version = 'economics-question-bank-v1'
        )
        or
        (
          question_origin = 'adaptive_generated'
          and bank_question_id is null
          and question_bank_version is null
        )
      )
    )
  )
);

create index if not exists practice_questions_user_created_idx
  on public.practice_questions (user_id, created_at desc);

create unique index if not exists practice_questions_user_idempotency_idx
  on public.practice_questions (user_id, idempotency_key)
  where idempotency_key is not null;

create index if not exists practice_questions_user_bank_history_idx
  on public.practice_questions (user_id, bank_question_id, created_at desc)
  where bank_question_id is not null;

alter table public.practice_questions enable row level security;

revoke all on table public.practice_questions from anon;
revoke select on table public.practice_questions from authenticated;
grant delete on table public.practice_questions to authenticated;
grant select (
  id, created_at, question, source_material, framework, mark_total,
  topic_code, topic_label, taxonomy_version, skill, why, from_current_focus,
  authority_version
) on table public.practice_questions to authenticated;

drop policy if exists "select_own_practice_questions" on public.practice_questions;
drop policy if exists "insert_own_practice_questions" on public.practice_questions;
drop policy if exists "delete_own_practice_questions" on public.practice_questions;

create policy "select_own_practice_questions"
on public.practice_questions
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "delete_own_practice_questions"
on public.practice_questions
for delete
to authenticated
using ((select auth.uid()) = user_id);

-- 1. Table -----------------------------------------------------------------
create table if not exists public.attempts (
  id           uuid primary key default gen_random_uuid(),
  -- user_id is database-generated from the caller's JWT; the browser client
  -- never supplies it, so a user cannot write rows for anyone else.
  user_id      uuid not null references auth.users (id) on delete cascade default auth.uid(),
  subject      text not null check (subject in ('Economics', 'Business', 'Physics')),
  topic        text not null,
  question     text not null,
  answer       text not null,
  score        integer check (score between 0 and 7),
  max_score    integer not null default 7,
  feedback     jsonb not null,            -- full Feedback object (strengths, improvements, mistakes[], examinerComment, studyNext)
  mistake_type text,                      -- denormalized main mistake (feedback.mistakes[0]); null if none
  next_step    text,                      -- denormalized recommendation (feedback.studyNext)
  created_at   timestamptz not null default now(),
  -- Assessment-aware grading (see migrations/0001_assessment_fields.sql). All nullable;
  -- legacy rows leave these NULL and read back as a legacy attempt (assessment = null).
  assessment                jsonb,        -- full Assessment object
  assessment_version        integer,
  assessment_format         text,
  paper                     text,
  syllabus_topic            text,
  marks_earned              integer,
  marks_available           integer,
  marks_assessable          integer,
  marks_source              text,
  mark_display_mode         text,
  classification_confidence text,
  -- Assessment Integrity (v2) — server-derived canonical status (mirrors JSON).
  scoring_state             text,
  mark_total_source         text,
  recognized_template       text,
  eligible_for_core         boolean,
  -- Practice Loop (see migrations/0003_practice_loop.sql): durable revision
  -- link (deleting the original NULLs the link, never the revision) and the
  -- Aptly-generated practice question this attempt answered.
  parent_attempt_id         uuid references public.attempts (id) on delete set null,
  practice_question_id      uuid references public.practice_questions (id) on delete set null,
  -- Manual source retention (see migrations/0004_revision_source_retention.sql):
  -- the pasted Paper 2(g)/3(b) source this attempt was graded against, stored
  -- privately (per-user RLS) so revisions reuse it automatically. NULL for
  -- every non-source attempt; Aptly-GENERATED sources stay in practice_questions.
  source_material           text,
  -- Diagram Evidence V1 (see migrations/0006_diagram_evidence.sql): structured
  -- FEEDBACK-ONLY findings from a reviewed diagram photo. Never marks, never
  -- image bytes/references/file names. NULL for attempts without a reviewed
  -- diagram; strictly per-attempt (revisions never inherit it).
  diagram_evidence          jsonb,
  -- Server-issued operation identity; NULL only for legacy/imported rows.
  idempotency_key           uuid,
  -- econ-v4 server-stamped provenance. All NULL means a historical row.
  rubric_version            text,
  taxonomy_version          text check (
    taxonomy_version is null
    or taxonomy_version in ('economics-legacy-v3', 'economics-2022-v1')
  ),
  grading_contract_version  text,
  grading_model_id          text,
  grading_reasoning_effort  text,
  constraint attempts_grading_provenance_complete_chk check (
    (rubric_version is null
      and taxonomy_version is null
      and grading_contract_version is null
      and grading_model_id is null
      and grading_reasoning_effort is null)
    or
    (rubric_version is not null
      and taxonomy_version is not null
      and grading_contract_version is not null
      and grading_model_id is not null
      and grading_reasoning_effort is not null)
  ),
  constraint attempts_marks_chk check (
    marks_available is null
    or (
      marks_earned is not null
      and marks_assessable is not null
      and marks_earned >= 0
      and marks_earned <= marks_assessable
      and marks_assessable <= marks_available
    )
    or (marks_earned is null and marks_assessable is null)
  )
);

-- Index attempts by detected format (for future SQL analytics).
create index if not exists attempts_user_format_idx
  on public.attempts (user_id, assessment_format);

-- Index the canonical scoring state (for future per-user SQL analytics).
create index if not exists attempts_user_scoring_state_idx
  on public.attempts (user_id, scoring_state);

-- 2. Index for "my attempts, newest first" ---------------------------------
create index if not exists attempts_user_created_idx
  on public.attempts (user_id, created_at desc);

create unique index if not exists attempts_user_idempotency_idx
  on public.attempts (user_id, idempotency_key)
  where idempotency_key is not null;

-- Practice Loop indexes (revision chains + generated-practice links).
create index if not exists attempts_user_parent_idx
  on public.attempts (user_id, parent_attempt_id);

create index if not exists attempts_practice_question_idx
  on public.attempts (practice_question_id);

-- 3. Row Level Security ----------------------------------------------------
alter table public.attempts enable row level security;

revoke all on table public.attempts from anon;
grant select, delete on table public.attempts to authenticated;

drop policy if exists "select_own_attempts" on public.attempts;
drop policy if exists "insert_own_attempts" on public.attempts;
drop policy if exists "update_own_attempts" on public.attempts;
drop policy if exists "delete_own_attempts" on public.attempts;

create policy "select_own_attempts"
on public.attempts
for select
to authenticated
using ((select auth.uid()) = user_id);

-- Insert may only link the user's OWN prior attempt / practice question
-- (foreign keys alone do not enforce ownership — FK checks bypass RLS).
--
-- The ownership checks live in SECURITY DEFINER functions, NOT inline
-- subqueries: a policy on attempts that selects from attempts is rejected by
-- PostgreSQL at query-rewrite time ("infinite recursion detected in policy
-- for relation") and would break EVERY insert — including revision saves.
-- Function bodies are opaque to the rewriter and enforce the identical rule.
create or replace function public.owns_attempt(p_attempt_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.attempts a
    where a.id = p_attempt_id
      and a.user_id = (select auth.uid())
  );
$$;

create or replace function public.owns_practice_question(p_question_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.practice_questions q
    where q.id = p_question_id
      and q.user_id = (select auth.uid())
  );
$$;

revoke all on function public.owns_attempt(uuid) from public, anon;
revoke all on function public.owns_practice_question(uuid) from public, anon;
grant execute on function public.owns_attempt(uuid) to authenticated;
grant execute on function public.owns_practice_question(uuid) to authenticated;

create policy "delete_own_attempts"
on public.attempts
for delete
to authenticated
using ((select auth.uid()) = user_id);

-- 4. Aptly Scan usage (see migrations/0005_scan_extraction_usage.sql) --------
-- One NO-CONTENT row per successful scan extraction: the durable per-user
-- daily cap for the image→text extraction route. Stores no image, no image
-- reference, no file name, and no extracted text. Append-only (no
-- update/delete grant) so a user cannot clear their own allowance.
create table if not exists public.scan_extraction_usage (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade default auth.uid(),
  created_at timestamptz not null default now()
);

create index if not exists scan_extraction_usage_user_created_idx
  on public.scan_extraction_usage (user_id, created_at desc);

alter table public.scan_extraction_usage enable row level security;

revoke all on table public.scan_extraction_usage from anon;
revoke all on table public.scan_extraction_usage from authenticated;

drop policy if exists "select_own_scan_usage" on public.scan_extraction_usage;
drop policy if exists "insert_own_scan_usage" on public.scan_extraction_usage;

-- 5. Diagram review usage (see migrations/0006_diagram_evidence.sql) ---------
-- One NO-CONTENT row per successful diagram review: the durable per-user
-- daily cap for the diagram-review route, fully independent from the scan
-- extraction cap. Stores no image, no image reference, no file name, and no
-- findings. Append-only (no update/delete grant) so a user cannot clear
-- their own allowance.
create table if not exists public.diagram_review_usage (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade default auth.uid(),
  created_at timestamptz not null default now()
);

create index if not exists diagram_review_usage_user_created_idx
  on public.diagram_review_usage (user_id, created_at desc);

alter table public.diagram_review_usage enable row level security;

revoke all on table public.diagram_review_usage from anon;
revoke all on table public.diagram_review_usage from authenticated;

drop policy if exists "select_own_diagram_usage" on public.diagram_review_usage;
drop policy if exists "insert_own_diagram_usage" on public.diagram_review_usage;

-- 6. Server authority + strict Diagram Evidence ----------------------------
-- Browser roles have SELECT/DELETE only on their own attempts and generated
-- practice. All authoritative writes use a server-only service-role client
-- after normal user authentication and explicit relationship checks.
revoke insert, update on table public.attempts from authenticated;
revoke insert, update on table public.practice_questions from authenticated;
grant select, insert, update, delete on table public.attempts to service_role;
grant select, insert on table public.practice_questions to service_role;
revoke execute on function public.owns_attempt(uuid) from authenticated;
revoke execute on function public.owns_practice_question(uuid) from authenticated;

create or replace function public.is_valid_diagram_evidence(value jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select
    jsonb_typeof(value) = 'object'
    and (select count(*) from jsonb_object_keys(value)) = 7
    and value ?& array[
      'version', 'status', 'graphTypeObserved', 'relevanceToQuestion',
      'elements', 'consistencyWithAnswer', 'improvements'
    ]
    and value->'version' = '1'::jsonb
    and value->>'status' in (
      'reviewed_clearly', 'partially_readable', 'unable_to_assess'
    )
    and (
      value->'graphTypeObserved' = 'null'::jsonb
      or (
        jsonb_typeof(value->'graphTypeObserved') = 'string'
        and char_length(value->>'graphTypeObserved') between 1 and 120
      )
    )
    and value->>'relevanceToQuestion' in (
      'appears_relevant', 'appears_unrelated', 'unclear'
    )
    and value->>'consistencyWithAnswer' in (
      'supports', 'conflicts', 'unclear', 'not_checked'
    )
    and jsonb_typeof(value->'elements') = 'array'
    and jsonb_array_length(value->'elements') between 0 and 7
    and not exists (
      select 1
      from jsonb_array_elements(value->'elements') as item(element)
      where jsonb_typeof(element) <> 'object'
        or (select count(*) from jsonb_object_keys(element)) <> 2
        or not (element ?& array['element', 'observed'])
        or element->>'element' not in (
          'axes_labels', 'curve_labels', 'equilibrium', 'shift_arrows',
          'new_equilibrium', 'welfare_areas', 'annotations'
        )
        or element->>'observed' not in ('visible', 'unclear', 'not_visible')
    )
    and (
      select count(*) = count(distinct element->>'element')
      from jsonb_array_elements(value->'elements') as item(element)
    )
    and jsonb_typeof(value->'improvements') = 'array'
    and jsonb_array_length(value->'improvements') between 0 and 2
    and not exists (
      select 1
      from jsonb_array_elements(value->'improvements') as item(improvement)
      where jsonb_typeof(improvement) <> 'string'
        or char_length(improvement #>> '{}') not between 1 and 280
    )
    and octet_length(value::text) <= 16384
    and (
      value->>'status' <> 'unable_to_assess'
      or (
        value->'graphTypeObserved' = 'null'::jsonb
        and value->>'relevanceToQuestion' = 'unclear'
        and jsonb_array_length(value->'elements') = 0
        and value->>'consistencyWithAnswer' = 'not_checked'
        and jsonb_array_length(value->'improvements') = 0
      )
    )
    and (
      value->>'status' = 'reviewed_clearly'
      or value->>'consistencyWithAnswer' = 'not_checked'
    )
    and value::text !~* '(data:|blob:|s3:|gs:|base64|https?://|file:/{0,2}|image/(png|jpe?g|gif|webp|heic|tiff?|bmp)|storage[_ /-]?(key|path|object|reference|bucket)|exif|gps|thumbnail|[a-z0-9+/]{80,}={0,2}|\.(png|jpe?g|gif|webp|heic|tiff?|bmp)([^a-z0-9]|$))';
$$;

revoke all on function public.is_valid_diagram_evidence(jsonb)
  from public, anon, authenticated;
grant execute on function public.is_valid_diagram_evidence(jsonb) to service_role;

alter table public.attempts
  drop constraint if exists attempts_diagram_evidence_valid_chk;
alter table public.attempts
  add constraint attempts_diagram_evidence_valid_chk
  check (
    diagram_evidence is null
    or public.is_valid_diagram_evidence(diagram_evidence)
  );

-- 7. Unified no-content atomic AI usage ledger -----------------------------
create table if not exists public.ai_usage_reservations (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references auth.users (id) on delete cascade,
  capability            text not null check (capability in ('grade', 'scan', 'diagram', 'practice')),
  idempotency_key       uuid not null,
  request_fingerprint   char(64) not null check (request_fingerprint ~ '^[0-9a-f]{64}$'),
  operation_group_key   uuid,
  usage_date            date not null default ((now() at time zone 'utc')::date),
  status                text not null check (status in ('reserved', 'processing', 'succeeded', 'failed')),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  processing_started_at timestamptz,
  completed_at          timestamptz,
  failure_category      text check (
    failure_category is null
    or failure_category in ('provider', 'validation', 'persistence', 'stale', 'internal')
  ),
  related_attempt_id    uuid references public.attempts (id) on delete set null,
  related_practice_id   uuid references public.practice_questions (id) on delete set null,
  result_hash           char(64) check (result_hash is null or result_hash ~ '^[0-9a-f]{64}$'),
  unique (user_id, capability, idempotency_key)
);

create index if not exists ai_usage_reservations_user_capability_day_idx
  on public.ai_usage_reservations (user_id, capability, usage_date);
create index if not exists ai_usage_reservations_stale_idx
  on public.ai_usage_reservations (status, updated_at)
  where status in ('reserved', 'processing');

alter table public.ai_usage_reservations enable row level security;
revoke all on table public.ai_usage_reservations from public, anon, authenticated;
grant select, insert, update on table public.ai_usage_reservations to service_role;

create or replace function public.reserve_ai_usage(
  p_user_id uuid,
  p_capability text,
  p_idempotency_key uuid,
  p_request_fingerprint text,
  p_operation_group_key uuid,
  p_daily_limit integer
)
returns table (
  outcome text,
  reservation_id uuid,
  reservation_status text,
  related_attempt_id uuid,
  related_practice_id uuid,
  result_hash text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing public.ai_usage_reservations%rowtype;
  created public.ai_usage_reservations%rowtype;
  utc_today date := (now() at time zone 'utc')::date;
  retention_days constant integer := 30;
  used integer;
begin
  if p_capability not in ('grade', 'scan', 'diagram', 'practice')
    or p_daily_limit < 1
    or p_request_fingerprint !~ '^[0-9a-f]{64}$'
  then
    raise exception 'invalid reservation parameters';
  end if;

  perform pg_advisory_xact_lock(
    hashtext(p_user_id::text),
    hashtext(p_capability || ':' || utc_today::text)
  );

  -- Retention sweep. Same user + capability as the held lock; only rows from
  -- completed days outside the window. Never touches today's rows, so quota
  -- counting and idempotency for the current day are unaffected.
  delete from public.ai_usage_reservations r
  where r.user_id = p_user_id
    and r.capability = p_capability
    and r.usage_date < utc_today - retention_days;

  update public.ai_usage_reservations r
  set status = 'failed', updated_at = now(), completed_at = now(),
      failure_category = 'stale'
  where r.user_id = p_user_id
    and r.capability = p_capability
    and r.usage_date = utc_today
    and r.status in ('reserved', 'processing')
    and r.updated_at < now() - interval '15 minutes';

  select * into existing
  from public.ai_usage_reservations r
  where r.user_id = p_user_id
    and r.capability = p_capability
    and r.idempotency_key = p_idempotency_key
  for update;

  if found then
    if existing.request_fingerprint <> p_request_fingerprint
      or existing.operation_group_key is distinct from p_operation_group_key
    then
      return query select
        'conflict'::text, existing.id, existing.status,
        existing.related_attempt_id, existing.related_practice_id,
        existing.result_hash::text;
      return;
    end if;

    if existing.status in ('reserved', 'processing')
      and existing.updated_at < now() - interval '15 minutes'
    then
      update public.ai_usage_reservations r
      set status = 'failed', updated_at = now(), completed_at = now(),
          failure_category = 'stale'
      where r.id = existing.id
      returning * into existing;
    end if;

    return query select
      case existing.status
        when 'succeeded' then 'replay'
        when 'failed' then 'failed'
        else 'in_progress'
      end,
      existing.id, existing.status,
      existing.related_attempt_id, existing.related_practice_id,
      existing.result_hash::text;
    return;
  end if;

  select count(*) into used
  from public.ai_usage_reservations r
  where r.user_id = p_user_id
    and r.capability = p_capability
    and r.usage_date = utc_today;

  if used >= p_daily_limit then
    return query select
      'limited'::text, null::uuid, null::text, null::uuid, null::uuid, null::text;
    return;
  end if;

  insert into public.ai_usage_reservations (
    user_id, capability, idempotency_key, request_fingerprint,
    operation_group_key, usage_date, status
  ) values (
    p_user_id, p_capability, p_idempotency_key, p_request_fingerprint,
    p_operation_group_key, utc_today, 'reserved'
  ) returning * into created;

  return query select
    'reserved'::text, created.id, created.status,
    created.related_attempt_id, created.related_practice_id,
    created.result_hash::text;
end;
$$;

revoke all on function public.reserve_ai_usage(uuid, text, uuid, text, uuid, integer)
  from public, anon, authenticated;
grant execute on function public.reserve_ai_usage(uuid, text, uuid, text, uuid, integer)
  to service_role;

-- Public, immutable focus context; grading guidance and bank provenance stay private.
-- NULL preserves every historical/general row without inventing verified intent.
alter table public.practice_questions add column if not exists focus_context jsonb;
alter table public.practice_questions add column if not exists generation_provenance jsonb;

-- No authenticated SELECT grant: model/schema provenance stays private.
alter table public.practice_questions
  drop constraint if exists practice_questions_generation_provenance_chk,
  add constraint practice_questions_generation_provenance_chk check (
    generation_provenance is null or (
      jsonb_typeof(generation_provenance) = 'object'
      and octet_length(generation_provenance::text) <= 1024
      and question_origin = 'adaptive_generated'
      and length(trim(generation_provenance->>'modelId')) > 0
      and generation_provenance->>'reasoningEffort' in ('low', 'medium', 'high')
      and generation_provenance->>'schemaHash' ~ '^[0-9a-f]{64}$'
    ) is true
  );

alter table public.practice_questions
  drop constraint if exists practice_questions_focus_context_chk,
  add constraint practice_questions_focus_context_chk check (
    focus_context is null or (
      jsonb_typeof(focus_context) = 'object'
      and octet_length(focus_context::text) <= 8192
      and focus_context ?& array['source', 'sourceAttemptId', 'topicCode', 'taxonomyVersion', 'targetSkill', 'recommendedMarks', 'courseLevel', 'explanation', 'serverVerified']
      and focus_context->>'serverVerified' = 'true'
      and focus_context->>'source' in ('current_focus', 'answer_feedback')
      and from_current_focus = (focus_context->>'source' = 'current_focus')
      and ((focus_context->>'source' = 'current_focus' and focus_context->'sourceAttemptId' = 'null'::jsonb)
        or (focus_context->>'source' = 'answer_feedback' and focus_context->>'sourceAttemptId' ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'))
      and focus_context->>'topicCode' = topic_code
      and focus_context->>'taxonomyVersion' = taxonomy_version
      and taxonomy_version = 'economics-2022-v1'
      and focus_context->>'targetSkill' = skill
      and skill = any(target_skills)
      and focus_context->>'recommendedMarks' = mark_total::text
      and focus_context->>'courseLevel' in ('sl', 'hl')
      and (focus_context->>'courseLevel' = 'hl' or level_relevance = 'shared_sl_hl')
      and length(trim(focus_context->>'explanation')) > 0
      and source_material is null
      and question_origin in ('curated_bank', 'adaptive_generated')
      and ((skill = 'definition' and mark_total = 2 and framework = 'paper2_short_analytic')
        or (skill = 'economic_analysis' and mark_total = 10 and framework = 'paper1a_10_mark')
        or (skill in ('application', 'evaluation') and mark_total = 15 and framework = 'paper1b_15_mark'))
    ) is true
  );

grant select (focus_context) on public.practice_questions to authenticated;
comment on column public.practice_questions.focus_context is
  'Server-verified focus snapshot. Source attempt is historical context, not client-authored guidance. NULL on general and legacy questions. No browser INSERT or UPDATE.';

-- 0013: Diagram-aware assessment (additive; historical rows unchanged)
-- Additive diagram-aware assessment; never backfill historical marks.
-- A separate private table prevents private criteria from leaking through attempts SELECT.
create table if not exists public.assessment_snapshots (
  attempt_id uuid primary key references public.attempts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  operation_key uuid not null,
  snapshot jsonb not null,
  created_at timestamptz not null default now(),
  unique(user_id, operation_key),
  check (jsonb_typeof(snapshot) = 'object' and octet_length(snapshot::text) <= 65536)
);
alter table public.assessment_snapshots enable row level security;
revoke all on public.assessment_snapshots from public, anon, authenticated;
grant select, insert, delete on public.assessment_snapshots to service_role;

create or replace function public.protect_combined_assessment() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.assessment ? 'assessedDiagram' and (
    (to_jsonb(new) - array['parent_attempt_id','practice_question_id']) is distinct from (to_jsonb(old) - array['parent_attempt_id','practice_question_id'])
    or (new.parent_attempt_id is distinct from old.parent_attempt_id and new.parent_attempt_id is not null)
    or (new.practice_question_id is distinct from old.practice_question_id and new.practice_question_id is not null)
  ) then raise exception 'completed combined assessment is immutable'; end if;
  return new;
end $$;
drop trigger if exists protect_combined_assessment on public.attempts;
create trigger protect_combined_assessment before update on public.attempts for each row execute function public.protect_combined_assessment();

create or replace function public.check_combined_snapshot() returns trigger
language plpgsql set search_path = '' as $$
declare s jsonb; d jsonb; c jsonb; ceiling integer; raw_total integer;
begin
  if (new.assessment ? 'assessedDiagram') is distinct from true then return new; end if;
  select snapshot into s from public.assessment_snapshots where attempt_id=new.id and user_id=new.user_id and operation_key=new.idempotency_key;
  d := new.assessment->'assessedDiagram'; c := d->'componentDecision';
  if (s ?& array['version','id','userId','operationIdentity','questionHash','contextHash','answerHash','contract','contractHash','attachments','observations','graderModel','graderEffort']) is distinct from true
    or (d ?& array['version','state','contract','componentDecision','attachmentHashes','snapshotId']) is distinct from true
    or s->>'version' is distinct from '1' or d->>'version' is distinct from '1'
    or jsonb_typeof(s->'contract') is distinct from 'object'
    or jsonb_typeof(s->'attachments') is distinct from 'array'
    or jsonb_typeof(d->'attachmentHashes') is distinct from 'array'
    or (s->'contract'->>'total')::integer is distinct from new.marks_available
    or (s->'contract'->>'mode' in ('four_mark_diagram','four_mark_written','holistic_diagram','not_assessed')) is distinct from true
    or (s->>'questionHash' ~ '^[0-9a-f]{64}$' and s->>'contextHash' ~ '^[0-9a-f]{64}$' and s->>'answerHash' ~ '^[0-9a-f]{64}$' and s->>'contractHash' ~ '^[0-9a-f]{64}$') is distinct from true
  then raise exception 'incomplete combined snapshot'; end if;
  if s is null or new.assessment_version is distinct from 4 or new.grading_contract_version is distinct from 'ib-econ-2026-v2'
    or s->>'userId' is distinct from new.user_id::text or s->>'operationIdentity' is distinct from new.idempotency_key::text
    or s->>'id' is distinct from d->>'snapshotId' or s->'contract'->>'version' is distinct from 'economics-diagram-contract-v1'
    or (d->>'state' in ('not_provided','usable','partially_readable','no_relevant_diagram')) is distinct from true
    or (d->'contract') is distinct from ((s->'contract') - array['framework','paper','part','total','topic','syllabusVersion','level','blueprintVersion','diagram','writtenCriteria','sourceRequired','scope'])
    or new.marks_assessable <> new.marks_available or new.marks_earned is null
  then raise exception 'invalid combined snapshot binding'; end if;
  if jsonb_array_length(s->'attachments') <> jsonb_array_length(d->'attachmentHashes') or jsonb_array_length(s->'attachments') > 1
    or (d->>'state' = 'not_provided' and (jsonb_array_length(s->'attachments') <> 0 or s->'observations' is distinct from 'null'::jsonb))
    or (d->>'state' <> 'not_provided' and (jsonb_array_length(s->'attachments') <> 1
      or s->'observations'->>'state' is distinct from d->>'state'
      or s->'observations'->>'essentialEvidenceReadable' is distinct from 'true'
      or s->'observations'->>'studentRegionCertain' is distinct from 'true'))
  then raise exception 'unbound diagram observations'; end if;
  if exists(select 1 from jsonb_array_elements(s->'attachments') with ordinality as x(a,n)
      where (a->>'contentHash' ~ '^[0-9a-f]{64}$') is distinct from true or a->>'role' is distinct from 'student_diagram' or a->>'retained' is distinct from 'false'
      or length(a->>'identity') is null or length(a->>'identity') = 0
      or a->>'contentHash' is distinct from d->'attachmentHashes'->>(n::integer-1))
  then raise exception 'invalid artifact binding'; end if;
  if s->'contract'->>'mode' = 'four_mark_diagram' then
    if (c ?& array['diagram','explanation','rawTotal','total','ceilings','reasons','rootErrors']) is distinct from true
      or jsonb_typeof(c->'ceilings') is distinct from 'array'
      or jsonb_typeof(c->'diagram') is distinct from 'number' or jsonb_typeof(c->'explanation') is distinct from 'number'
      or jsonb_typeof(c->'rawTotal') is distinct from 'number' or jsonb_typeof(c->'total') is distinct from 'number'
    then raise exception 'incomplete component decision'; end if;
    if c is null or c = 'null'::jsonb or new.marks_available <> 4
      or (c->>'diagram')::integer not between 0 and 2 or (c->>'explanation')::integer not between 0 and 2
      or (d->>'state' in ('not_provided','no_relevant_diagram') and (c->>'diagram')::integer <> 0)
      or (length(trim(new.answer)) = 0 and (c->>'explanation')::integer <> 0)
    then raise exception 'invalid component bounds'; end if;
    raw_total := (c->>'diagram')::integer + (c->>'explanation')::integer;
    ceiling := 4;
    if exists(select 1 from jsonb_array_elements(c->'ceilings') x where (x->>'rule' in ('mechanism_consistency_2','question_label_ceiling_3')) is distinct from true
      or not (s->'contract'->'diagram'->'rules' ? (x->>'rule'))
      or (x->>'maximum')::integer is distinct from case x->>'rule' when 'mechanism_consistency_2' then 2 else 3 end)
    then raise exception 'unauthorized component ceiling'; end if;
    select least(4, coalesce(min((x->>'maximum')::integer),4)) into ceiling from jsonb_array_elements(c->'ceilings') x;
    if (c->>'rawTotal')::integer <> raw_total or (c->>'total')::integer <> least(raw_total,ceiling)
      or new.marks_earned <> least(raw_total,ceiling) or (new.assessment->>'marksEarned')::integer <> new.marks_earned
    then raise exception 'component arithmetic mismatch'; end if;
  elsif c is distinct from 'null'::jsonb then raise exception 'components outside split contract'; end if;
  return new;
end $$;
drop trigger if exists check_combined_snapshot on public.attempts;
create constraint trigger check_combined_snapshot after insert or update on public.attempts
  deferrable initially deferred for each row execute function public.check_combined_snapshot();

create or replace function public.save_combined_assessment(p_user_id uuid, p_operation_key uuid, p_attempt jsonb, p_snapshot jsonb)
returns setof public.attempts language plpgsql security invoker set search_path = '' as $$
declare r public.attempts; existing public.attempts;
begin
  -- Same user/key operations serialize; other users cannot observe or reuse this result.
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':' || p_operation_key::text, 0));
  select * into existing from public.attempts where user_id=p_user_id and idempotency_key=p_operation_key;
  if found then return next existing; return; end if;
  r := jsonb_populate_record(null::public.attempts, p_attempt || jsonb_build_object('id',gen_random_uuid(),'created_at',now(),'user_id',p_user_id,'idempotency_key',p_operation_key));
  if r.parent_attempt_id is not null and not exists(select 1 from public.attempts where id=r.parent_attempt_id and user_id=p_user_id and question=r.question) then raise exception 'invalid parent'; end if;
  if r.practice_question_id is not null and not exists(select 1 from public.practice_questions where id=r.practice_question_id and user_id=p_user_id and question=r.question and authority_version=1) then raise exception 'invalid practice'; end if;
  if not (r.assessment ? 'assessedDiagram') then raise exception 'combined contract required'; end if;
  insert into public.attempts select r.*;
  insert into public.assessment_snapshots(attempt_id,user_id,operation_key,snapshot) values(r.id,p_user_id,p_operation_key,p_snapshot);
  return next r;
end $$;
revoke all on function public.save_combined_assessment(uuid,uuid,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.save_combined_assessment(uuid,uuid,jsonb,jsonb) to service_role;
revoke all on function public.protect_combined_assessment() from public, anon, authenticated;
revoke all on function public.check_combined_snapshot() from public, anon, authenticated;
alter table public.practice_questions drop constraint if exists practice_questions_framework_check;
alter table public.practice_questions add constraint practice_questions_framework_check check (framework in (
  'paper2_short_analytic', 'paper2_four_mark_diagram_explain', 'paper1a_10_mark', 'paper1b_15_mark',
  'paper2g_15_mark', 'paper3b_10_mark', 'generic_practice'
));
alter table public.practice_questions add column if not exists assessment_contract jsonb;
grant select (assessment_contract) on public.practice_questions to authenticated;
alter table public.practice_questions drop constraint if exists practice_questions_public_contract_chk;
alter table public.practice_questions add constraint practice_questions_public_contract_chk check (
  assessment_contract is null or (
    jsonb_typeof(assessment_contract) = 'object'
    and assessment_contract - array['version','mode','diagramRole','diagramReason','provenance'] = '{}'::jsonb
    and assessment_contract->>'version' = 'economics-diagram-contract-v1'
    and assessment_contract->>'mode' in ('four_mark_diagram','four_mark_written','holistic_diagram','not_assessed')
    and assessment_contract->>'diagramRole' in ('required_explicitly','necessary_for_task','optional_appropriate','not_assessed')
    and length(assessment_contract->>'diagramReason') > 0
    and assessment_contract->>'provenance' in ('aptly_authored','inferred_practice')
  ) is true
);

alter table public.practice_questions
  drop constraint if exists practice_questions_question_bank_bundle_chk,
  add constraint practice_questions_question_bank_bundle_chk check (
    (
      question_origin is null
      and bank_question_id is null
      and question_bank_version is null
      and grading_blueprint is null
      and grading_blueprint_version is null
      and level_relevance is null
      and command_term is null
      and target_skills is null
      and angle_tags is null
      and request_fingerprint is null
    )
    or
    (
      question_origin in ('curated_bank', 'adaptive_generated')
      and jsonb_typeof(grading_blueprint) = 'object'
      and octet_length(grading_blueprint::text) <= 32768
      and grading_blueprint_version in ('economics-grading-blueprint-v1', 'economics-four-mark-blueprint-v1', 'economics-essay-blueprint-v2')
      and level_relevance in ('shared_sl_hl', 'hl_only')
      and command_term is not null
      and cardinality(target_skills) >= 1
      and cardinality(angle_tags) >= 1
      and request_fingerprint ~ '^[0-9a-f]{64}$'
      and (
        (
          question_origin = 'curated_bank'
          and bank_question_id is not null
          and question_bank_version = 'economics-question-bank-v1'
        )
        or
        (
          question_origin = 'adaptive_generated'
          and bank_question_id is null
          and question_bank_version is null
        )
      )
    )
  );

notify pgrst, 'reload schema';

alter table public.practice_questions
  drop constraint if exists practice_questions_focus_context_chk,
  add constraint practice_questions_focus_context_chk check (
    focus_context is null or (
      jsonb_typeof(focus_context) = 'object'
      and octet_length(focus_context::text) <= 8192
      and focus_context ?& array['source', 'sourceAttemptId', 'topicCode', 'taxonomyVersion', 'targetSkill', 'recommendedMarks', 'courseLevel', 'explanation', 'serverVerified']
      and focus_context->>'serverVerified' = 'true'
      and focus_context->>'source' in ('current_focus', 'answer_feedback')
      and from_current_focus = (focus_context->>'source' = 'current_focus')
      and ((focus_context->>'source' = 'current_focus' and focus_context->'sourceAttemptId' = 'null'::jsonb)
        or (focus_context->>'source' = 'answer_feedback' and focus_context->>'sourceAttemptId' ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'))
      and focus_context->>'topicCode' = topic_code
      and focus_context->>'taxonomyVersion' = taxonomy_version
      and taxonomy_version = 'economics-2022-v1'
      and focus_context->>'targetSkill' = skill
      and skill = any(target_skills)
      and focus_context->>'recommendedMarks' = mark_total::text
      and focus_context->>'courseLevel' in ('sl', 'hl')
      and (focus_context->>'courseLevel' = 'hl' or level_relevance = 'shared_sl_hl')
      and length(trim(focus_context->>'explanation')) > 0
      and (source_material is null or (mark_total = 4 and grading_blueprint_version = 'economics-four-mark-blueprint-v1'))
      and question_origin in ('curated_bank', 'adaptive_generated')
      and ((skill = 'definition' and mark_total = 2 and framework = 'paper2_short_analytic')
        or (skill = 'diagram_explanation' and mark_total = 4 and framework = 'paper2_four_mark_diagram_explain')
        or (skill = 'economic_analysis' and mark_total = 10 and framework = 'paper1a_10_mark')
        or (skill in ('application', 'evaluation') and mark_total = 15 and framework = 'paper1b_15_mark'))
    ) is true
  );

-- Reserve grade + diagram together before either provider begins.
-- Keep existing single-capability writers compatible by sharing their locks.
create or replace function public.reserve_combined_grade(
  p_user_id uuid,
  p_idempotency_key uuid,
  p_request_fingerprint text,
  p_diagram_fingerprint text,
  p_grade_daily_limit integer,
  p_diagram_daily_limit integer
)
returns table (
  outcome text,
  reservation_id uuid,
  reservation_status text,
  related_attempt_id uuid,
  related_practice_id uuid,
  result_hash text,
  diagram_reservation_id uuid,
  limited_capability text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  utc_today date := (now() at time zone 'utc')::date;
  grade_result record;
  diagram_result record;
  used integer;
begin
  if p_user_id is null or p_idempotency_key is null
    or p_grade_daily_limit is null or p_grade_daily_limit < 1
    or p_diagram_daily_limit is null or p_diagram_daily_limit < 1
    or p_request_fingerprint is null or p_request_fingerprint !~ '^[0-9a-f]{64}$'
    or p_diagram_fingerprint is null or p_diagram_fingerprint !~ '^[0-9a-f]{64}$'
  then raise exception 'invalid combined reservation parameters'; end if;

  -- A consistent grade -> diagram order prevents combined writers deadlocking.
  -- Single-capability writers hold only their own matching quota-bucket lock.
  perform pg_advisory_xact_lock(hashtext(p_user_id::text), hashtext('grade:' || utc_today::text));
  perform pg_advisory_xact_lock(hashtext(p_user_id::text), hashtext('diagram:' || utc_today::text));

  -- A durable result/pending/failed key is resolved before checking new capacity.
  -- Grade operation_group_key stays NULL for compatibility with pre-0014 keys.
  if exists (select 1 from public.ai_usage_reservations r
      where r.user_id = p_user_id and r.capability = 'grade' and r.idempotency_key = p_idempotency_key
        and r.usage_date >= utc_today - 30) then
    select * into grade_result from public.reserve_ai_usage(
      p_user_id, 'grade', p_idempotency_key, p_request_fingerprint, null, p_grade_daily_limit);
    return query select grade_result.outcome, grade_result.reservation_id, grade_result.reservation_status,
      grade_result.related_attempt_id, grade_result.related_practice_id, grade_result.result_hash,
      null::uuid, null::text;
    return;
  end if;

  -- Never adopt an independently reserved diagram key as a new combined grade.
  if exists (select 1 from public.ai_usage_reservations r
      where r.user_id = p_user_id and r.capability = 'diagram' and r.idempotency_key = p_idempotency_key
        and r.usage_date >= utc_today - 30) then
    return query select 'conflict'::text, null::uuid, null::text, null::uuid, null::uuid, null::text, null::uuid, null::text;
    return;
  end if;
  select count(*) into used from public.ai_usage_reservations r
    where r.user_id = p_user_id and r.capability = 'grade' and r.usage_date = utc_today;
  if used >= p_grade_daily_limit then
    return query select 'limited'::text, null::uuid, null::text, null::uuid, null::uuid, null::text, null::uuid, 'grade'::text;
    return;
  end if;
  select count(*) into used from public.ai_usage_reservations r
    where r.user_id = p_user_id and r.capability = 'diagram' and r.usage_date = utc_today;
  if used >= p_diagram_daily_limit then
    return query select 'limited'::text, null::uuid, null::text, null::uuid, null::uuid, null::text, null::uuid, 'diagram'::text;
    return;
  end if;

  select * into grade_result from public.reserve_ai_usage(
    p_user_id, 'grade', p_idempotency_key, p_request_fingerprint, null, p_grade_daily_limit);
  select * into diagram_result from public.reserve_ai_usage(
    p_user_id, 'diagram', p_idempotency_key, p_diagram_fingerprint, p_idempotency_key, p_diagram_daily_limit);
  -- Any unexpected insertion failure rolls the entire transaction back.
  if grade_result.outcome <> 'reserved' or diagram_result.outcome <> 'reserved' then
    raise exception 'combined reservation could not reserve both capabilities';
  end if;
  return query select grade_result.outcome, grade_result.reservation_id, grade_result.reservation_status,
    grade_result.related_attempt_id, grade_result.related_practice_id, grade_result.result_hash,
    diagram_result.reservation_id, null::text;
end;
$$;
revoke all on function public.reserve_combined_grade(uuid, uuid, text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.reserve_combined_grade(uuid, uuid, text, text, integer, integer) to service_role;
comment on function public.reserve_combined_grade(uuid, uuid, text, text, integer, integer) is
  'Atomic grade-and-diagram capacity reservation. A pre-dispatch quota rejection inserts neither ledger row.';

-- Source-reviewed contract versions. Preserve every historical version and row.
-- Assessment/public diagram shapes stay unchanged; only accepted version identifiers widen.
create or replace function public.check_combined_snapshot() returns trigger
language plpgsql set search_path = '' as $$
declare s jsonb; d jsonb; c jsonb; ceiling integer; raw_total integer;
begin
  if (new.assessment ? 'assessedDiagram') is distinct from true then return new; end if;
  select snapshot into s from public.assessment_snapshots where attempt_id=new.id and user_id=new.user_id and operation_key=new.idempotency_key;
  d := new.assessment->'assessedDiagram'; c := d->'componentDecision';
  if (s ?& array['version','id','userId','operationIdentity','questionHash','contextHash','answerHash','contract','contractHash','attachments','observations','graderModel','graderEffort']) is distinct from true
    or (d ?& array['version','state','contract','componentDecision','attachmentHashes','snapshotId']) is distinct from true
    or s->>'version' is distinct from '1' or d->>'version' is distinct from '1'
    or jsonb_typeof(s->'contract') is distinct from 'object'
    or jsonb_typeof(s->'attachments') is distinct from 'array'
    or jsonb_typeof(d->'attachmentHashes') is distinct from 'array'
    or (s->'contract'->>'total')::integer is distinct from new.marks_available
    or (s->'contract'->>'mode' in ('four_mark_diagram','four_mark_written','holistic_diagram','not_assessed')) is distinct from true
    or (s->>'questionHash' ~ '^[0-9a-f]{64}$' and s->>'contextHash' ~ '^[0-9a-f]{64}$' and s->>'answerHash' ~ '^[0-9a-f]{64}$' and s->>'contractHash' ~ '^[0-9a-f]{64}$') is distinct from true
  then raise exception 'incomplete combined snapshot'; end if;
  if s is null or new.assessment_version is distinct from 4 or (new.grading_contract_version in ('ib-econ-2026-v2','ib-econ-2026-v3')) is distinct from true
    or s->>'userId' is distinct from new.user_id::text or s->>'operationIdentity' is distinct from new.idempotency_key::text
    or s->>'id' is distinct from d->>'snapshotId' or s->'contract'->>'version' is distinct from 'economics-diagram-contract-v1'
    or (d->>'state' in ('not_provided','usable','partially_readable','no_relevant_diagram')) is distinct from true
    or (d->'contract') is distinct from ((s->'contract') - array['framework','paper','part','total','topic','syllabusVersion','level','blueprintVersion','diagram','writtenCriteria','sourceRequired','scope'])
    or new.marks_assessable <> new.marks_available or new.marks_earned is null
  then raise exception 'invalid combined snapshot binding'; end if;
  if jsonb_array_length(s->'attachments') <> jsonb_array_length(d->'attachmentHashes') or jsonb_array_length(s->'attachments') > 1
    or (d->>'state' = 'not_provided' and (jsonb_array_length(s->'attachments') <> 0 or s->'observations' is distinct from 'null'::jsonb))
    or (d->>'state' <> 'not_provided' and (jsonb_array_length(s->'attachments') <> 1
      or s->'observations'->>'state' is distinct from d->>'state'
      or s->'observations'->>'essentialEvidenceReadable' is distinct from 'true'
      or s->'observations'->>'studentRegionCertain' is distinct from 'true'))
  then raise exception 'unbound diagram observations'; end if;
  if exists(select 1 from jsonb_array_elements(s->'attachments') with ordinality as x(a,n)
      where (a->>'contentHash' ~ '^[0-9a-f]{64}$') is distinct from true or a->>'role' is distinct from 'student_diagram' or a->>'retained' is distinct from 'false'
      or length(a->>'identity') is null or length(a->>'identity') = 0
      or a->>'contentHash' is distinct from d->'attachmentHashes'->>(n::integer-1))
  then raise exception 'invalid artifact binding'; end if;
  if s->'contract'->>'mode' = 'four_mark_diagram' then
    if (c ?& array['diagram','explanation','rawTotal','total','ceilings','reasons','rootErrors']) is distinct from true
      or jsonb_typeof(c->'ceilings') is distinct from 'array'
      or jsonb_typeof(c->'diagram') is distinct from 'number' or jsonb_typeof(c->'explanation') is distinct from 'number'
      or jsonb_typeof(c->'rawTotal') is distinct from 'number' or jsonb_typeof(c->'total') is distinct from 'number'
    then raise exception 'incomplete component decision'; end if;
    if c is null or c = 'null'::jsonb or new.marks_available <> 4
      or (c->>'diagram')::integer not between 0 and 2 or (c->>'explanation')::integer not between 0 and 2
      or (d->>'state' in ('not_provided','no_relevant_diagram') and (c->>'diagram')::integer <> 0)
      or (length(trim(new.answer)) = 0 and (c->>'explanation')::integer <> 0)
    then raise exception 'invalid component bounds'; end if;
    raw_total := (c->>'diagram')::integer + (c->>'explanation')::integer;
    ceiling := 4;
    if exists(select 1 from jsonb_array_elements(c->'ceilings') x where (x->>'rule' in ('mechanism_consistency_2','question_label_ceiling_3')) is distinct from true
      or not (s->'contract'->'diagram'->'rules' ? (x->>'rule'))
      or (x->>'maximum')::integer is distinct from case x->>'rule' when 'mechanism_consistency_2' then 2 else 3 end)
    then raise exception 'unauthorized component ceiling'; end if;
    select least(4, coalesce(min((x->>'maximum')::integer),4)) into ceiling from jsonb_array_elements(c->'ceilings') x;
    if (c->>'rawTotal')::integer <> raw_total or (c->>'total')::integer <> least(raw_total,ceiling)
      or new.marks_earned <> least(raw_total,ceiling) or (new.assessment->>'marksEarned')::integer <> new.marks_earned
    then raise exception 'component arithmetic mismatch'; end if;
  elsif c is distinct from 'null'::jsonb then raise exception 'components outside split contract'; end if;
  return new;
end $$;

alter table public.practice_questions
  drop constraint if exists practice_questions_question_bank_bundle_chk,
  add constraint practice_questions_question_bank_bundle_chk check (
    (
      question_origin is null
      and bank_question_id is null
      and question_bank_version is null
      and grading_blueprint is null
      and grading_blueprint_version is null
      and level_relevance is null
      and command_term is null
      and target_skills is null
      and angle_tags is null
      and request_fingerprint is null
    )
    or
    (
      question_origin in ('curated_bank', 'adaptive_generated')
      and jsonb_typeof(grading_blueprint) = 'object'
      and octet_length(grading_blueprint::text) <= 32768
      and grading_blueprint_version in ('economics-grading-blueprint-v1', 'economics-grading-blueprint-v2', 'economics-four-mark-blueprint-v1', 'economics-four-mark-blueprint-v2', 'economics-essay-blueprint-v2', 'economics-essay-blueprint-v3')
      and level_relevance in ('shared_sl_hl', 'hl_only')
      and command_term is not null
      and cardinality(target_skills) >= 1
      and cardinality(angle_tags) >= 1
      and request_fingerprint ~ '^[0-9a-f]{64}$'
      and (
        (
          question_origin = 'curated_bank'
          and bank_question_id is not null
          and question_bank_version = 'economics-question-bank-v1'
        )
        or
        (
          question_origin = 'adaptive_generated'
          and bank_question_id is null
          and question_bank_version is null
        )
      )
    )
  );

alter table public.practice_questions
  drop constraint if exists practice_questions_focus_context_chk,
  add constraint practice_questions_focus_context_chk check (
    focus_context is null or (
      jsonb_typeof(focus_context) = 'object'
      and octet_length(focus_context::text) <= 8192
      and focus_context ?& array['source', 'sourceAttemptId', 'topicCode', 'taxonomyVersion', 'targetSkill', 'recommendedMarks', 'courseLevel', 'explanation', 'serverVerified']
      and focus_context->>'serverVerified' = 'true'
      and focus_context->>'source' in ('current_focus', 'answer_feedback')
      and from_current_focus = (focus_context->>'source' = 'current_focus')
      and ((focus_context->>'source' = 'current_focus' and focus_context->'sourceAttemptId' = 'null'::jsonb)
        or (focus_context->>'source' = 'answer_feedback' and focus_context->>'sourceAttemptId' ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'))
      and focus_context->>'topicCode' = topic_code
      and focus_context->>'taxonomyVersion' = taxonomy_version
      and taxonomy_version = 'economics-2022-v1'
      and focus_context->>'targetSkill' = skill
      and skill = any(target_skills)
      and focus_context->>'recommendedMarks' = mark_total::text
      and focus_context->>'courseLevel' in ('sl', 'hl')
      and (focus_context->>'courseLevel' = 'hl' or level_relevance = 'shared_sl_hl')
      and length(trim(focus_context->>'explanation')) > 0
      and (source_material is null or (mark_total = 4 and grading_blueprint_version in ('economics-four-mark-blueprint-v1','economics-four-mark-blueprint-v2')))
      and question_origin in ('curated_bank', 'adaptive_generated')
      and ((skill = 'definition' and mark_total = 2 and framework = 'paper2_short_analytic')
        or (skill = 'diagram_explanation' and mark_total = 4 and framework = 'paper2_four_mark_diagram_explain')
        or (skill = 'economic_analysis' and mark_total = 10 and framework = 'paper1a_10_mark')
        or (skill in ('application', 'evaluation') and mark_total = 15 and framework = 'paper1b_15_mark'))
    ) is true
  );

notify pgrst, 'reload schema';

-- Manual essay task resolution: accept its version and private evidence metadata.
-- Additive validation only. No historical row, mark, grant or migration is rewritten.
create or replace function public.check_combined_snapshot() returns trigger
language plpgsql set search_path = '' as $$
declare s jsonb; d jsonb; c jsonb; ceiling integer; raw_total integer;
begin
  if (new.assessment ? 'assessedDiagram') is distinct from true then return new; end if;
  select snapshot into s from public.assessment_snapshots where attempt_id=new.id and user_id=new.user_id and operation_key=new.idempotency_key;
  d := new.assessment->'assessedDiagram'; c := d->'componentDecision';
  if (s ?& array['version','id','userId','operationIdentity','questionHash','contextHash','answerHash','contract','contractHash','attachments','observations','graderModel','graderEffort']) is distinct from true
    or (d ?& array['version','state','contract','componentDecision','attachmentHashes','snapshotId']) is distinct from true
    or s->>'version' is distinct from '1' or d->>'version' is distinct from '1'
    or jsonb_typeof(s->'contract') is distinct from 'object'
    or jsonb_typeof(s->'attachments') is distinct from 'array'
    or jsonb_typeof(d->'attachmentHashes') is distinct from 'array'
    or (s->'contract'->>'total')::integer is distinct from new.marks_available
    or (s->'contract'->>'mode' in ('four_mark_diagram','four_mark_written','holistic_diagram','not_assessed')) is distinct from true
    or (s->>'questionHash' ~ '^[0-9a-f]{64}$' and s->>'contextHash' ~ '^[0-9a-f]{64}$' and s->>'answerHash' ~ '^[0-9a-f]{64}$' and s->>'contractHash' ~ '^[0-9a-f]{64}$') is distinct from true
  then raise exception 'incomplete combined snapshot'; end if;
  if s is null or new.assessment_version is distinct from 4 or (new.grading_contract_version in ('ib-econ-2026-v2','ib-econ-2026-v3','ib-econ-2026-v4')) is distinct from true
    or s->>'userId' is distinct from new.user_id::text or s->>'operationIdentity' is distinct from new.idempotency_key::text
    or s->>'id' is distinct from d->>'snapshotId' or s->'contract'->>'version' is distinct from 'economics-diagram-contract-v1'
    or (d->>'state' in ('not_provided','usable','partially_readable','no_relevant_diagram')) is distinct from true
    or (d->'contract') is distinct from ((s->'contract') - array['framework','paper','part','total','topic','syllabusVersion','level','blueprintVersion','diagram','writtenCriteria','sourceRequired','scope','essayResolution'])
    or new.marks_assessable <> new.marks_available or new.marks_earned is null
  then raise exception 'invalid combined snapshot binding'; end if;
  if new.grading_contract_version = 'ib-econ-2026-v4' and (
    s->'contract'->>'mode' is distinct from 'holistic_diagram'
    or s->'contract'->>'blueprintVersion' is distinct from 'inferred-essay-contract-v1'
    or (s->'contract'->'essayResolution' ?& array['ruleId','confidence','basis']) is distinct from true
    or jsonb_typeof(s->'contract'->'essayResolution'->'basis') is distinct from 'array'
    or (length(s->'contract'->'essayResolution'->>'ruleId') > 0) is distinct from true
    or (s->'contract'->'essayResolution'->>'confidence' in ('source_matched','audited_match','mechanism_matched','unresolved')) is distinct from true
    or (s->'contract'->>'diagramRole' in ('required_explicitly','necessary_for_task','optional_appropriate','appropriate_support','optional','not_assessed','unresolved')) is distinct from true
  ) then raise exception 'invalid manual essay resolution'; end if;
  if jsonb_array_length(s->'attachments') <> jsonb_array_length(d->'attachmentHashes') or jsonb_array_length(s->'attachments') > 1
    or (d->>'state' = 'not_provided' and (jsonb_array_length(s->'attachments') <> 0 or s->'observations' is distinct from 'null'::jsonb))
    or (d->>'state' <> 'not_provided' and (jsonb_array_length(s->'attachments') <> 1
      or s->'observations'->>'state' is distinct from d->>'state'
      or s->'observations'->>'essentialEvidenceReadable' is distinct from 'true'
      or s->'observations'->>'studentRegionCertain' is distinct from 'true'))
  then raise exception 'unbound diagram observations'; end if;
  if exists(select 1 from jsonb_array_elements(s->'attachments') with ordinality as x(a,n)
      where (a->>'contentHash' ~ '^[0-9a-f]{64}$') is distinct from true or a->>'role' is distinct from 'student_diagram' or a->>'retained' is distinct from 'false'
      or length(a->>'identity') is null or length(a->>'identity') = 0
      or a->>'contentHash' is distinct from d->'attachmentHashes'->>(n::integer-1))
  then raise exception 'invalid artifact binding'; end if;
  if s->'contract'->>'mode' = 'four_mark_diagram' then
    if (c ?& array['diagram','explanation','rawTotal','total','ceilings','reasons','rootErrors']) is distinct from true
      or jsonb_typeof(c->'ceilings') is distinct from 'array'
      or jsonb_typeof(c->'diagram') is distinct from 'number' or jsonb_typeof(c->'explanation') is distinct from 'number'
      or jsonb_typeof(c->'rawTotal') is distinct from 'number' or jsonb_typeof(c->'total') is distinct from 'number'
    then raise exception 'incomplete component decision'; end if;
    if c is null or c = 'null'::jsonb or new.marks_available <> 4
      or (c->>'diagram')::integer not between 0 and 2 or (c->>'explanation')::integer not between 0 and 2
      or (d->>'state' in ('not_provided','no_relevant_diagram') and (c->>'diagram')::integer <> 0)
      or (length(trim(new.answer)) = 0 and (c->>'explanation')::integer <> 0)
    then raise exception 'invalid component bounds'; end if;
    raw_total := (c->>'diagram')::integer + (c->>'explanation')::integer;
    ceiling := 4;
    if exists(select 1 from jsonb_array_elements(c->'ceilings') x where (x->>'rule' in ('mechanism_consistency_2','question_label_ceiling_3')) is distinct from true
      or not (s->'contract'->'diagram'->'rules' ? (x->>'rule'))
      or (x->>'maximum')::integer is distinct from case x->>'rule' when 'mechanism_consistency_2' then 2 else 3 end)
    then raise exception 'unauthorized component ceiling'; end if;
    select least(4, coalesce(min((x->>'maximum')::integer),4)) into ceiling from jsonb_array_elements(c->'ceilings') x;
    if (c->>'rawTotal')::integer <> raw_total or (c->>'total')::integer <> least(raw_total,ceiling)
      or new.marks_earned <> least(raw_total,ceiling) or (new.assessment->>'marksEarned')::integer <> new.marks_earned
    then raise exception 'component arithmetic mismatch'; end if;
  elsif c is distinct from 'null'::jsonb then raise exception 'components outside split contract'; end if;
  return new;
end $$;

alter table public.practice_questions drop constraint if exists practice_questions_public_contract_chk;
alter table public.practice_questions add constraint practice_questions_public_contract_chk check (
  assessment_contract is null or (
    jsonb_typeof(assessment_contract) = 'object'
    and assessment_contract - array['version','mode','diagramRole','diagramReason','provenance'] = '{}'::jsonb
    and assessment_contract->>'version' = 'economics-diagram-contract-v1'
    and assessment_contract->>'mode' in ('four_mark_diagram','four_mark_written','holistic_diagram','not_assessed')
    and assessment_contract->>'diagramRole' in ('required_explicitly','necessary_for_task','optional_appropriate','appropriate_support','optional','not_assessed','unresolved')
    and length(assessment_contract->>'diagramReason') > 0
    and assessment_contract->>'provenance' in ('aptly_authored','inferred_practice')
  ) is true
);

notify pgrst, 'reload schema';

-- Examiner alignment: additive version acceptance and private evidence checks.
-- Preserves all previous versions, rows, grants and immutable snapshots.
create or replace function public.check_combined_snapshot() returns trigger
language plpgsql set search_path = '' as $$
declare s jsonb; d jsonb; c jsonb; ceiling integer; raw_total integer;
begin
  if (new.assessment ? 'assessedDiagram') is distinct from true then return new; end if;
  select snapshot into s from public.assessment_snapshots where attempt_id=new.id and user_id=new.user_id and operation_key=new.idempotency_key;
  d := new.assessment->'assessedDiagram'; c := d->'componentDecision';
  if (s ?& array['version','id','userId','operationIdentity','questionHash','contextHash','answerHash','contract','contractHash','attachments','observations','graderModel','graderEffort']) is distinct from true
    or (d ?& array['version','state','contract','componentDecision','attachmentHashes','snapshotId']) is distinct from true
    or s->>'version' is distinct from '1' or d->>'version' is distinct from '1'
    or jsonb_typeof(s->'contract') is distinct from 'object'
    or jsonb_typeof(s->'attachments') is distinct from 'array'
    or jsonb_typeof(d->'attachmentHashes') is distinct from 'array'
    or (s->'contract'->>'total')::integer is distinct from new.marks_available
    or (s->'contract'->>'mode' in ('four_mark_diagram','four_mark_written','holistic_diagram','not_assessed')) is distinct from true
    or (s->>'questionHash' ~ '^[0-9a-f]{64}$' and s->>'contextHash' ~ '^[0-9a-f]{64}$' and s->>'answerHash' ~ '^[0-9a-f]{64}$' and s->>'contractHash' ~ '^[0-9a-f]{64}$') is distinct from true
  then raise exception 'incomplete combined snapshot'; end if;
  if s is null or new.assessment_version is distinct from 4 or (new.grading_contract_version in ('ib-econ-2026-v2','ib-econ-2026-v3','ib-econ-2026-v4','ib-econ-2026-v5')) is distinct from true
    or s->>'userId' is distinct from new.user_id::text or s->>'operationIdentity' is distinct from new.idempotency_key::text
    or s->>'id' is distinct from d->>'snapshotId' or s->'contract'->>'version' is distinct from 'economics-diagram-contract-v1'
    or (d->>'state' in ('not_provided','usable','partially_readable','no_relevant_diagram')) is distinct from true
    or (d->'contract') is distinct from ((s->'contract') - array['framework','paper','part','total','topic','syllabusVersion','level','blueprintVersion','diagram','writtenCriteria','sourceRequired','scope','essayResolution'])
    or new.marks_assessable <> new.marks_available or new.marks_earned is null
  then raise exception 'invalid combined snapshot binding'; end if;
  if new.grading_contract_version = 'ib-econ-2026-v4' and (
    s->'contract'->>'mode' is distinct from 'holistic_diagram'
    or s->'contract'->>'blueprintVersion' is distinct from 'inferred-essay-contract-v1'
    or (s->'contract'->'essayResolution' ?& array['ruleId','confidence','basis']) is distinct from true
    or jsonb_typeof(s->'contract'->'essayResolution'->'basis') is distinct from 'array'
    or (length(s->'contract'->'essayResolution'->>'ruleId') > 0) is distinct from true
    or (s->'contract'->'essayResolution'->>'confidence' in ('source_matched','audited_match','mechanism_matched','unresolved')) is distinct from true
    or (s->'contract'->>'diagramRole' in ('required_explicitly','necessary_for_task','optional_appropriate','appropriate_support','optional','not_assessed','unresolved')) is distinct from true
  ) then raise exception 'invalid manual essay resolution'; end if;
  if jsonb_array_length(s->'attachments') <> jsonb_array_length(d->'attachmentHashes') or jsonb_array_length(s->'attachments') > 1
    or (d->>'state' = 'not_provided' and (jsonb_array_length(s->'attachments') <> 0 or s->'observations' is distinct from 'null'::jsonb))
    or (d->>'state' <> 'not_provided' and (jsonb_array_length(s->'attachments') <> 1
      or s->'observations'->>'state' is distinct from d->>'state'
      or s->'observations'->>'essentialEvidenceReadable' is distinct from 'true'
      or s->'observations'->>'studentRegionCertain' is distinct from 'true'))
  then raise exception 'unbound diagram observations'; end if;
  if exists(select 1 from jsonb_array_elements(s->'attachments') with ordinality as x(a,n)
      where (a->>'contentHash' ~ '^[0-9a-f]{64}$') is distinct from true or a->>'role' is distinct from 'student_diagram' or a->>'retained' is distinct from 'false'
      or length(a->>'identity') is null or length(a->>'identity') = 0
      or a->>'contentHash' is distinct from d->'attachmentHashes'->>(n::integer-1))
  then raise exception 'invalid artifact binding'; end if;
  if s->'contract'->>'mode' = 'four_mark_diagram' then
    if (c ?& array['diagram','explanation','rawTotal','total','ceilings','reasons','rootErrors']) is distinct from true
      or jsonb_typeof(c->'ceilings') is distinct from 'array'
      or jsonb_typeof(c->'diagram') is distinct from 'number' or jsonb_typeof(c->'explanation') is distinct from 'number'
      or jsonb_typeof(c->'rawTotal') is distinct from 'number' or jsonb_typeof(c->'total') is distinct from 'number'
    then raise exception 'incomplete component decision'; end if;
    if c is null or c = 'null'::jsonb or new.marks_available <> 4
      or (c->>'diagram')::integer not between 0 and 2 or (c->>'explanation')::integer not between 0 and 2
      or (d->>'state' in ('not_provided','no_relevant_diagram') and (c->>'diagram')::integer <> 0)
      or (length(trim(new.answer)) = 0 and (c->>'explanation')::integer <> 0)
    then raise exception 'invalid component bounds'; end if;
    raw_total := (c->>'diagram')::integer + (c->>'explanation')::integer;
    ceiling := 4;
    if exists(select 1 from jsonb_array_elements(c->'ceilings') x where (x->>'rule' in ('mechanism_consistency_2','question_label_ceiling_3')) is distinct from true
      or not (s->'contract'->'diagram'->'rules' ? (x->>'rule'))
      or (x->>'maximum')::integer is distinct from case x->>'rule' when 'mechanism_consistency_2' then 2 else 3 end)
    then raise exception 'unauthorized component ceiling'; end if;
    select least(4, coalesce(min((x->>'maximum')::integer),4)) into ceiling from jsonb_array_elements(c->'ceilings') x;
    if (c->>'rawTotal')::integer <> raw_total or (c->>'total')::integer <> least(raw_total,ceiling)
      or new.marks_earned <> least(raw_total,ceiling) or (new.assessment->>'marksEarned')::integer <> new.marks_earned
    then raise exception 'component arithmetic mismatch'; end if;
  elsif c is distinct from 'null'::jsonb then raise exception 'components outside split contract'; end if;
  if new.grading_contract_version = 'ib-econ-2026-v5' then
    if s->>'examinerWorkflowVersion' is distinct from 'examiner-workflow-2026-v1'
      or not (s ? 'examinerJudgment')
    then raise exception 'missing examiner workflow evidence'; end if;
    if s->'contract' ? 'essayResolution' and (
      s->'contract'->>'blueprintVersion' is distinct from 'inferred-essay-contract-v2'
      or (s->'contract'->'essayResolution' ?& array['ruleId','confidence','basis']) is distinct from true
      or jsonb_typeof(s->'contract'->'essayResolution'->'basis') is distinct from 'array'
      or (s->'contract'->'essayResolution'->>'confidence' in ('source_matched','audited_match','mechanism_matched','unresolved')) is distinct from true
      or (length(s->'contract'->'essayResolution'->>'ruleId') > 0) is distinct from true
    ) then raise exception 'invalid examiner task resolution'; end if;
    if s ? 'resolutionInputContract' and (
      s->'resolutionInputContract'->>'diagramRole' is distinct from 'unresolved'
      or s->'resolutionInputContract'->>'framework' is distinct from s->'contract'->>'framework'
      or s->'resolutionInputContract'->>'total' is distinct from s->'contract'->>'total'
      or s->'resolutionInputContract'->>'mode' is distinct from 'holistic_diagram'
    ) then raise exception 'invalid task resolution input binding'; end if;
    if s->'contract'->>'framework' in ('paper1a_10_mark','paper1b_15_mark','paper2g_15_mark','paper3b_10_mark') then
      if (s->'examinerJudgment' ?& array['task','demonstrated','materialLimitations','selectedBand','withinBand','diagramEffect','summary']) is distinct from true
        or jsonb_typeof(s->'examinerJudgment'->'materialLimitations') is distinct from 'array'
        or s->'examinerJudgment'->>'selectedBand' is distinct from new.assessment->>'markBand'
        or s->'examinerJudgment'->>'withinBand' is distinct from new.assessment->>'bandPosition'
      then raise exception 'inconsistent examiner band evidence'; end if;
      if new.marks_earned = new.marks_available and jsonb_array_length(s->'examinerJudgment'->'materialLimitations') > 0
      then raise exception 'contradictory full credit and material limitation'; end if;
    elsif s->'examinerJudgment' is distinct from 'null'::jsonb then raise exception 'examiner band outside best-fit framework'; end if;
  end if;
  return new;
end $$;


notify pgrst, 'reload schema';
