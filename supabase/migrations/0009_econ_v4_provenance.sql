-- econ-v4 grading provenance and legacy-safe taxonomy identity.
-- Existing rows intentionally remain NULL and therefore legacy.

alter table public.attempts
  alter column score drop not null,
  add column if not exists rubric_version text,
  add column if not exists taxonomy_version text,
  add column if not exists grading_contract_version text,
  add column if not exists grading_model_id text,
  add column if not exists grading_reasoning_effort text;

alter table public.practice_questions
  add column if not exists taxonomy_version text;

alter table public.attempts
  drop constraint if exists attempts_grading_provenance_complete_chk,
  add constraint attempts_grading_provenance_complete_chk check (
    (rubric_version is null
      and taxonomy_version is null
      and grading_contract_version is null
      and grading_model_id is null
      and grading_reasoning_effort is null)
    or
    (rubric_version is not null
      and taxonomy_version is not null
      and grading_contract_version is not null
      and grading_model_id is not null
      and grading_reasoning_effort is not null)
  );

alter table public.attempts
  drop constraint if exists attempts_taxonomy_version_chk,
  add constraint attempts_taxonomy_version_chk check (
    taxonomy_version is null
    or taxonomy_version in ('economics-legacy-v3', 'economics-2022-v1')
  );

alter table public.practice_questions
  drop constraint if exists practice_questions_taxonomy_version_chk,
  add constraint practice_questions_taxonomy_version_chk check (
    taxonomy_version is null
    or taxonomy_version in ('economics-legacy-v3', 'economics-2022-v1')
  );
