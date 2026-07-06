-- Aptly Diagram Evidence V1 — structured findings + independent review cap.
-- Run manually in the Supabase SQL Editor. Additive and idempotent (safe to
-- re-run). Does NOT touch practice_questions, scan_extraction_usage, or any
-- earlier migration.
--
-- Two additions:
--  1. attempts.diagram_evidence — nullable jsonb holding the structured,
--     FEEDBACK-ONLY findings from a reviewed diagram photo (status, element
--     observations, up to two suggestions). It never contains marks,
--     percentages, numeric confidence scores, image bytes, image references,
--     file names, URLs, or base64 data. The raw photo is transient request
--     data, exactly like Aptly Scan. RLS is inherited from the attempts row.
--  2. diagram_review_usage — one NO-CONTENT row per successful diagram
--     review: the durable per-user daily cap for the diagram-review route,
--     fully independent from the scan extraction cap. Stores no image, no
--     image reference, no file name, and no findings.

alter table public.attempts
  add column if not exists diagram_evidence jsonb;

create table if not exists public.diagram_review_usage (
  id         uuid primary key default gen_random_uuid(),
  -- user_id is database-generated from the caller's JWT; a user can never
  -- record usage for anyone else.
  user_id    uuid not null references auth.users (id) on delete cascade default auth.uid(),
  created_at timestamptz not null default now()
);

create index if not exists diagram_review_usage_user_created_idx
  on public.diagram_review_usage (user_id, created_at desc);

alter table public.diagram_review_usage enable row level security;

revoke all on table public.diagram_review_usage from anon;
-- Append-only by design: no update/delete grant, so a user cannot clear
-- their own daily allowance by deleting usage rows.
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
