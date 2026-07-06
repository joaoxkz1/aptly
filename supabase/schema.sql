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
  why             text not null
);

create index if not exists practice_questions_user_created_idx
  on public.practice_questions (user_id, created_at desc);

alter table public.practice_questions enable row level security;

revoke all on table public.practice_questions from anon;
grant select, insert, delete on table public.practice_questions to authenticated;

drop policy if exists "select_own_practice_questions" on public.practice_questions;
drop policy if exists "insert_own_practice_questions" on public.practice_questions;
drop policy if exists "delete_own_practice_questions" on public.practice_questions;

create policy "select_own_practice_questions"
on public.practice_questions
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "insert_own_practice_questions"
on public.practice_questions
for insert
to authenticated
with check ((select auth.uid()) = user_id);

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

-- Practice Loop indexes (revision chains + generated-practice links).
create index if not exists attempts_user_parent_idx
  on public.attempts (user_id, parent_attempt_id);

create index if not exists attempts_practice_question_idx
  on public.attempts (practice_question_id);

-- 3. Row Level Security ----------------------------------------------------
alter table public.attempts enable row level security;

revoke all on table public.attempts from anon;
grant select, insert, update, delete on table public.attempts to authenticated;

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

create policy "insert_own_attempts"
on public.attempts
for insert
to authenticated
with check (
  (select auth.uid()) = user_id
  and (parent_attempt_id is null or public.owns_attempt(parent_attempt_id))
  and (practice_question_id is null or public.owns_practice_question(practice_question_id))
);

create policy "update_own_attempts"
on public.attempts
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

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
grant select, insert on table public.scan_extraction_usage to authenticated;

drop policy if exists "select_own_scan_usage" on public.scan_extraction_usage;
drop policy if exists "insert_own_scan_usage" on public.scan_extraction_usage;

create policy "select_own_scan_usage"
on public.scan_extraction_usage
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "insert_own_scan_usage"
on public.scan_extraction_usage
for insert
to authenticated
with check ((select auth.uid()) = user_id);

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
grant select, insert on table public.diagram_review_usage to authenticated;

drop policy if exists "select_own_diagram_usage" on public.diagram_review_usage;
drop policy if exists "insert_own_diagram_usage" on public.diagram_review_usage;

create policy "select_own_diagram_usage"
on public.diagram_review_usage
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "insert_own_diagram_usage"
on public.diagram_review_usage
for insert
to authenticated
with check ((select auth.uid()) = user_id);
