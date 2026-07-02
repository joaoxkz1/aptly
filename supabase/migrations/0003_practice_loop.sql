-- Aptly — Practice Loop: revision links + generated practice questions.
-- Run manually in the Supabase SQL Editor. Additive and idempotent (safe to
-- re-run). No backfill: every existing row stays valid and unlinked.

-- 1. Generated practice questions ------------------------------------------
-- One private row per Aptly-generated practice question. The generated source
-- material (Paper 2(g)/3(b)) lives ONLY here: grading, revision, and later
-- review always read the server-stored source — never a client-supplied copy.
create table if not exists public.practice_questions (
  id              uuid primary key default gen_random_uuid(),
  -- user_id is database-generated from the caller's JWT; a user can never
  -- write practice questions for anyone else.
  user_id         uuid not null references auth.users (id) on delete cascade default auth.uid(),
  created_at      timestamptz not null default now(),
  question        text not null,
  -- Original Aptly-generated stimulus text (Paper 2(g)/3(b) only; else null).
  source_material text,
  -- Only the frameworks Aptly can already mark safely. The 4-mark diagram
  -- template is deliberately absent: no diagram questions are generated until
  -- diagram upload exists.
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
  -- The evidence-backed "Why this question?" shown to the student.
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

-- 2. Attempt links -----------------------------------------------------------
-- parent_attempt_id: durable revision relationship. Deleting the ORIGINAL
-- never deletes a revision's answer — the link is nulled (on delete set null).
-- practice_question_id: links an attempt to the Aptly-generated question it
-- answered; nulled if the practice question row is ever removed.
alter table public.attempts
  add column if not exists parent_attempt_id uuid
    references public.attempts (id) on delete set null,
  add column if not exists practice_question_id uuid
    references public.practice_questions (id) on delete set null;

create index if not exists attempts_user_parent_idx
  on public.attempts (user_id, parent_attempt_id);

create index if not exists attempts_practice_question_idx
  on public.attempts (practice_question_id);

-- 3. Ownership-checked insert policy ----------------------------------------
-- A user may only link their OWN prior attempt / practice question. (Foreign
-- keys alone do not enforce ownership, since FK checks bypass RLS.)
drop policy if exists "insert_own_attempts" on public.attempts;

create policy "insert_own_attempts"
on public.attempts
for insert
to authenticated
with check (
  (select auth.uid()) = user_id
  and (
    parent_attempt_id is null
    or exists (
      select 1 from public.attempts p
      where p.id = parent_attempt_id and p.user_id = (select auth.uid())
    )
  )
  and (
    practice_question_id is null
    or exists (
      select 1 from public.practice_questions q
      where q.id = practice_question_id and q.user_id = (select auth.uid())
    )
  )
);
