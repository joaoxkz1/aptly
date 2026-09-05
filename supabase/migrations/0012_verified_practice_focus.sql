-- Public, immutable focus context; grading guidance and bank provenance stay private.
-- NULL preserves every historical/general row without inventing verified intent.
alter table public.practice_questions add column if not exists focus_context jsonb;
alter table public.practice_questions add column if not exists generation_provenance jsonb;

-- No authenticated SELECT grant: model/schema provenance stays private.
alter table public.practice_questions
  drop constraint if exists practice_questions_generation_provenance_chk,
  add constraint practice_questions_generation_provenance_chk check (
    generation_provenance is null or (
      jsonb_typeof(generation_provenance) = 'object'
      and octet_length(generation_provenance::text) <= 1024
      and question_origin = 'adaptive_generated'
      and length(trim(generation_provenance->>'modelId')) > 0
      and generation_provenance->>'reasoningEffort' in ('low', 'medium', 'high')
      and generation_provenance->>'schemaHash' ~ '^[0-9a-f]{64}$'
    ) is true
  );

alter table public.practice_questions
  drop constraint if exists practice_questions_focus_context_chk,
  add constraint practice_questions_focus_context_chk check (
    focus_context is null or (
      jsonb_typeof(focus_context) = 'object'
      and octet_length(focus_context::text) <= 8192
      and focus_context ?& array['source', 'sourceAttemptId', 'topicCode', 'taxonomyVersion', 'targetSkill', 'recommendedMarks', 'courseLevel', 'explanation', 'serverVerified']
      and focus_context->>'serverVerified' = 'true'
      and focus_context->>'source' in ('current_focus', 'answer_feedback')
      and from_current_focus = (focus_context->>'source' = 'current_focus')
      and ((focus_context->>'source' = 'current_focus' and focus_context->'sourceAttemptId' = 'null'::jsonb)
        or (focus_context->>'source' = 'answer_feedback' and focus_context->>'sourceAttemptId' ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'))
      and focus_context->>'topicCode' = topic_code
      and focus_context->>'taxonomyVersion' = taxonomy_version
      and taxonomy_version = 'economics-2022-v1'
      and focus_context->>'targetSkill' = skill
      and skill = any(target_skills)
      and focus_context->>'recommendedMarks' = mark_total::text
      and focus_context->>'courseLevel' in ('sl', 'hl')
      and (focus_context->>'courseLevel' = 'hl' or level_relevance = 'shared_sl_hl')
      and length(trim(focus_context->>'explanation')) > 0
      and source_material is null
      and question_origin in ('curated_bank', 'adaptive_generated')
      and ((skill = 'definition' and mark_total = 2 and framework = 'paper2_short_analytic')
        or (skill = 'economic_analysis' and mark_total = 10 and framework = 'paper1a_10_mark')
        or (skill in ('application', 'evaluation') and mark_total = 15 and framework = 'paper1b_15_mark'))
    ) is true
  );

grant select (focus_context) on public.practice_questions to authenticated;
comment on column public.practice_questions.focus_context is
  'Server-verified focus snapshot. Source attempt is historical context, not client-authored guidance. NULL on general and legacy questions. No browser INSERT or UPDATE.';
