-- Aptly — assessment-aware grading fields (additive, idempotent).
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
