-- Aptly — attempts persistence schema
-- Safe to re-run (idempotent table, index, and policies).
-- Paste into the Supabase SQL Editor and run.

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

-- 2. Index for "my attempts, newest first" ---------------------------------
create index if not exists attempts_user_created_idx
  on public.attempts (user_id, created_at desc);

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

create policy "insert_own_attempts"
on public.attempts
for insert
to authenticated
with check ((select auth.uid()) = user_id);

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
