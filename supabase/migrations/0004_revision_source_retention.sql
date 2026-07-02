-- Aptly — Practice Loop patch: revision-save fix + manual source retention.
-- Run manually in the Supabase SQL Editor AFTER 0003. Additive and idempotent
-- (safe to re-run). Does not modify or require re-running 0002/0003.

-- 1. FIX: revision saves were rejected by the insert policy ------------------
--
-- The 0003 "insert_own_attempts" policy checked parent/practice ownership
-- with subqueries, and the parent check selects from public.attempts — the
-- SAME table the policy protects. PostgreSQL rejects self-referential row-
-- security policies at query-rewrite time with
--   "infinite recursion detected in policy for relation \"attempts\"" (42P17)
-- and, because the policy expression is expanded before any runtime
-- short-circuit, EVERY insert into attempts fails once 0003 is applied —
-- which is why a graded revision could not be saved and retrying never helped.
--
-- Fix: perform the same ownership checks inside SECURITY DEFINER functions.
-- Function bodies are opaque to the query rewriter (no recursion), run with
-- the definer's rights (no RLS re-entry), and enforce the identical rule: a
-- linked row must exist AND belong to the caller. No policy is weakened.

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

-- Callable only by signed-in users; never by anon.
revoke all on function public.owns_attempt(uuid) from public, anon;
revoke all on function public.owns_practice_question(uuid) from public, anon;
grant execute on function public.owns_attempt(uuid) to authenticated;
grant execute on function public.owns_practice_question(uuid) to authenticated;

drop policy if exists "insert_own_attempts" on public.attempts;

create policy "insert_own_attempts"
on public.attempts
for insert
to authenticated
with check (
  (select auth.uid()) = user_id
  and (parent_attempt_id is null or public.owns_attempt(parent_attempt_id))
  and (practice_question_id is null or public.owns_practice_question(practice_question_id))
);

-- 2. Manual source retention for revisions -----------------------------------
--
-- A manually pasted Paper 2(g)/3(b) source is now stored PRIVATELY with the
-- attempt it graded, so a later revision reuses the exact same source
-- automatically instead of asking the student to paste it again. The column
-- is nullable (every non-source attempt leaves it NULL), covered by the
-- existing per-user RLS on attempts, deleted with its own row, and never
-- backfilled — pre-patch source-backed attempts keep the one-time paste flow.
-- Aptly-GENERATED sources stay in practice_questions (model unchanged).

alter table public.attempts
  add column if not exists source_material text;
