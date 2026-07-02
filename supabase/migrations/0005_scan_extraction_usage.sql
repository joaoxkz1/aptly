-- Aptly Scan — durable per-user daily extraction cap.
-- Run manually in the Supabase SQL Editor. Additive and idempotent (safe to
-- re-run). Does NOT touch attempts, practice_questions, or earlier migrations.
--
-- One NO-CONTENT row per SUCCESSFUL scan extraction. The row is a usage
-- marker only: it stores no image, no image reference, no file name, and no
-- extracted text — the extraction route counts today's rows (RLS-scoped)
-- before each paid vision call, exactly like the grading and practice caps.

create table if not exists public.scan_extraction_usage (
  id         uuid primary key default gen_random_uuid(),
  -- user_id is database-generated from the caller's JWT; a user can never
  -- record usage for anyone else.
  user_id    uuid not null references auth.users (id) on delete cascade default auth.uid(),
  created_at timestamptz not null default now()
);

create index if not exists scan_extraction_usage_user_created_idx
  on public.scan_extraction_usage (user_id, created_at desc);

alter table public.scan_extraction_usage enable row level security;

revoke all on table public.scan_extraction_usage from anon;
-- Append-only by design: no update/delete grant, so a user cannot clear
-- their own daily allowance by deleting usage rows.
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
