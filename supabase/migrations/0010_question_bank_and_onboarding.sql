-- Aptly Economics question-bank provenance and trusted per-question guidance.
--
-- Existing Practice rows remain valid legacy generated rows with NULL
-- provenance/guidance. Every new bank/adaptive row is inserted by the
-- service-role path with a complete immutable guidance bundle.

alter table public.practice_questions
  add column if not exists question_origin text,
  add column if not exists bank_question_id text,
  add column if not exists question_bank_version text,
  add column if not exists grading_blueprint jsonb,
  add column if not exists grading_blueprint_version text,
  add column if not exists level_relevance text,
  add column if not exists command_term text,
  add column if not exists target_skills text[],
  add column if not exists angle_tags text[],
  add column if not exists from_current_focus boolean not null default false,
  add column if not exists request_fingerprint char(64);

alter table public.practice_questions
  drop constraint if exists practice_questions_question_bank_bundle_chk,
  add constraint practice_questions_question_bank_bundle_chk check (
    (
      question_origin is null
      and bank_question_id is null
      and question_bank_version is null
      and grading_blueprint is null
      and grading_blueprint_version is null
      and level_relevance is null
      and command_term is null
      and target_skills is null
      and angle_tags is null
      and request_fingerprint is null
    )
    or
    (
      question_origin in ('curated_bank', 'adaptive_generated')
      and jsonb_typeof(grading_blueprint) = 'object'
      and octet_length(grading_blueprint::text) <= 32768
      and grading_blueprint_version = 'economics-grading-blueprint-v1'
      and level_relevance in ('shared_sl_hl', 'hl_only')
      and command_term is not null
      and cardinality(target_skills) >= 1
      and cardinality(angle_tags) >= 1
      and request_fingerprint ~ '^[0-9a-f]{64}$'
      and (
        (
          question_origin = 'curated_bank'
          and bank_question_id is not null
          and question_bank_version = 'economics-question-bank-v1'
        )
        or
        (
          question_origin = 'adaptive_generated'
          and bank_question_id is null
          and question_bank_version is null
        )
      )
    )
  );

create index if not exists practice_questions_user_bank_history_idx
  on public.practice_questions (user_id, bank_question_id, created_at desc)
  where bank_question_id is not null;

-- Hidden guidance/provenance never crosses the browser boundary. The browser
-- keeps exactly the columns needed to render and answer its own rows; RLS
-- continues to scope those reads by user_id. DELETE permission is unchanged.
revoke select on table public.practice_questions from authenticated;
grant select (
  id,
  created_at,
  question,
  source_material,
  framework,
  mark_total,
  topic_code,
  topic_label,
  taxonomy_version,
  skill,
  why,
  from_current_focus,
  authority_version
) on table public.practice_questions to authenticated;

grant select, insert on table public.practice_questions to service_role;

comment on column public.practice_questions.grading_blueprint is
  'Trusted non-exhaustive question-specific grading guidance; service-role only and never selected by browser clients.';
comment on column public.practice_questions.bank_question_id is
  'Stable curated-bank identity used server-side for cross-device repeat avoidance.';
comment on column public.practice_questions.from_current_focus is
  'True only when the server verified the selected topic against the current saved focus at generation time.';
