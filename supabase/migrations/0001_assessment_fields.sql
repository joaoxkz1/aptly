-- Aptly — assessment-aware grading fields (additive, idempotent).
-- This is also the first migration in the repository, so it creates the
-- historical attempts baseline when replayed against a blank local database.
-- The security setup is intentionally the final least-privilege shape:
-- re-running 0001 against a hardened database cannot restore browser writes.
create table if not exists public.attempts (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade default auth.uid(),
  subject      text not null check (subject in ('Economics', 'Business', 'Physics')),
  topic        text not null,
  question     text not null,
  answer       text not null,
  score        integer not null check (score between 0 and 7),
  max_score    integer not null default 7,
  feedback     jsonb not null,
  mistake_type text,
  next_step    text,
  created_at   timestamptz not null default now()
);

create index if not exists attempts_user_created_idx
  on public.attempts (user_id, created_at desc);

alter table public.attempts enable row level security;

revoke all on table public.attempts from anon;
revoke insert, update on table public.attempts from authenticated;
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

create policy "delete_own_attempts"
on public.attempts
for delete
to authenticated
using ((select auth.uid()) = user_id);

-- Run manually in the Supabase SQL Editor. Safe to re-run.
--
-- All columns are NULLABLE, so every existing (legacy) row stays valid and
-- reads back as a legacy attempt (assessment = null). No backfill, no rewrite.
-- New columns inherit the table's existing RLS policies; user_id is still
-- DB-stamped via default auth.uid(). User isolation is unchanged.

alter table public.attempts
  add column if not exists assessment                jsonb,
  add column if not exists assessment_version        integer,
  add column if not exists assessment_format         text,
  add column if not exists paper                     text,
  add column if not exists syllabus_topic            text,
  add column if not exists marks_earned              integer,
  add column if not exists marks_available           integer,
  add column if not exists marks_assessable          integer,
  add column if not exists marks_source              text,
  add column if not exists mark_display_mode         text,
  add column if not exists classification_confidence text;

create index if not exists attempts_user_format_idx
  on public.attempts (user_id, assessment_format);

-- Integrity guard: never allow an impossible mark split. Tolerates legacy NULLs.
alter table public.attempts
  drop constraint if exists attempts_marks_chk;
alter table public.attempts
  add constraint attempts_marks_chk check (
    marks_available is null
    or (
      marks_earned is not null
      and marks_assessable is not null
      and marks_earned >= 0
      and marks_earned <= marks_assessable
      and marks_assessable <= marks_available
    )
    -- practice_feedback_only with a known total but no estimate: earned/assessable NULL
    or (marks_earned is null and marks_assessable is null)
  );
