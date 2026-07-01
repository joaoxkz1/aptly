-- Aptly — Assessment Integrity: canonical scoring state (additive, idempotent).
-- Run manually in the Supabase SQL Editor. Safe to re-run.
--
-- All columns are NULLABLE, so every existing (legacy / pre-v2) row stays valid
-- and reads back through the app's canonical status helper as a legacy attempt
-- (rendered conservatively, never reinterpreted or upgraded). No backfill.
--
-- These columns MIRROR the authoritative `assessment` JSON for DB-level
-- integrity and future SQL analytics only — the app always reads the JSON.

alter table public.attempts
  add column if not exists scoring_state       text,
  add column if not exists mark_total_source   text,
  add column if not exists recognized_template text,
  add column if not exists eligible_for_core   boolean;

-- Index the core-eligible, marked attempts for future per-user SQL analytics.
create index if not exists attempts_user_scoring_state_idx
  on public.attempts (user_id, scoring_state);
