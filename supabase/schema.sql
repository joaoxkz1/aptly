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
  skill           text not null,
  why             text not null,
  idempotency_key uuid,
  authority_version smallint not null check (authority_version = 1)
);

create index if not exists practice_questions_user_created_idx
  on public.practice_questions (user_id, created_at desc);

create unique index if not exists practice_questions_user_idempotency_idx
  on public.practice_questions (user_id, idempotency_key)
  where idempotency_key is not null;

alter table public.practice_questions enable row level security;

revoke all on table public.practice_questions from anon;
grant select, delete on table public.practice_questions to authenticated;

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
  score        integer not null check (score between 0 and 7),
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
