-- Manual essay task resolution: accept its version and private evidence metadata.
-- Additive validation only. No historical row, mark, grant or migration is rewritten.
create or replace function public.check_combined_snapshot() returns trigger
language plpgsql set search_path = '' as $$
declare s jsonb; d jsonb; c jsonb; ceiling integer; raw_total integer;
begin
  if (new.assessment ? 'assessedDiagram') is distinct from true then return new; end if;
  select snapshot into s from public.assessment_snapshots where attempt_id=new.id and user_id=new.user_id and operation_key=new.idempotency_key;
  d := new.assessment->'assessedDiagram'; c := d->'componentDecision';
  if (s ?& array['version','id','userId','operationIdentity','questionHash','contextHash','answerHash','contract','contractHash','attachments','observations','graderModel','graderEffort']) is distinct from true
    or (d ?& array['version','state','contract','componentDecision','attachmentHashes','snapshotId']) is distinct from true
    or s->>'version' is distinct from '1' or d->>'version' is distinct from '1'
    or jsonb_typeof(s->'contract') is distinct from 'object'
    or jsonb_typeof(s->'attachments') is distinct from 'array'
    or jsonb_typeof(d->'attachmentHashes') is distinct from 'array'
    or (s->'contract'->>'total')::integer is distinct from new.marks_available
    or (s->'contract'->>'mode' in ('four_mark_diagram','four_mark_written','holistic_diagram','not_assessed')) is distinct from true
    or (s->>'questionHash' ~ '^[0-9a-f]{64}$' and s->>'contextHash' ~ '^[0-9a-f]{64}$' and s->>'answerHash' ~ '^[0-9a-f]{64}$' and s->>'contractHash' ~ '^[0-9a-f]{64}$') is distinct from true
  then raise exception 'incomplete combined snapshot'; end if;
  if s is null or new.assessment_version is distinct from 4 or (new.grading_contract_version in ('ib-econ-2026-v2','ib-econ-2026-v3','ib-econ-2026-v4')) is distinct from true
    or s->>'userId' is distinct from new.user_id::text or s->>'operationIdentity' is distinct from new.idempotency_key::text
    or s->>'id' is distinct from d->>'snapshotId' or s->'contract'->>'version' is distinct from 'economics-diagram-contract-v1'
    or (d->>'state' in ('not_provided','usable','partially_readable','no_relevant_diagram')) is distinct from true
    or (d->'contract') is distinct from ((s->'contract') - array['framework','paper','part','total','topic','syllabusVersion','level','blueprintVersion','diagram','writtenCriteria','sourceRequired','scope','essayResolution'])
    or new.marks_assessable <> new.marks_available or new.marks_earned is null
  then raise exception 'invalid combined snapshot binding'; end if;
  if new.grading_contract_version = 'ib-econ-2026-v4' and (
    s->'contract'->>'mode' is distinct from 'holistic_diagram'
    or s->'contract'->>'blueprintVersion' is distinct from 'inferred-essay-contract-v1'
    or (s->'contract'->'essayResolution' ?& array['ruleId','confidence','basis']) is distinct from true
    or jsonb_typeof(s->'contract'->'essayResolution'->'basis') is distinct from 'array'
    or (length(s->'contract'->'essayResolution'->>'ruleId') > 0) is distinct from true
    or (s->'contract'->'essayResolution'->>'confidence' in ('source_matched','audited_match','mechanism_matched','unresolved')) is distinct from true
    or (s->'contract'->>'diagramRole' in ('required_explicitly','necessary_for_task','optional_appropriate','appropriate_support','optional','not_assessed','unresolved')) is distinct from true
  ) then raise exception 'invalid manual essay resolution'; end if;
  if jsonb_array_length(s->'attachments') <> jsonb_array_length(d->'attachmentHashes') or jsonb_array_length(s->'attachments') > 1
    or (d->>'state' = 'not_provided' and (jsonb_array_length(s->'attachments') <> 0 or s->'observations' is distinct from 'null'::jsonb))
    or (d->>'state' <> 'not_provided' and (jsonb_array_length(s->'attachments') <> 1
      or s->'observations'->>'state' is distinct from d->>'state'
      or s->'observations'->>'essentialEvidenceReadable' is distinct from 'true'
      or s->'observations'->>'studentRegionCertain' is distinct from 'true'))
  then raise exception 'unbound diagram observations'; end if;
  if exists(select 1 from jsonb_array_elements(s->'attachments') with ordinality as x(a,n)
      where (a->>'contentHash' ~ '^[0-9a-f]{64}$') is distinct from true or a->>'role' is distinct from 'student_diagram' or a->>'retained' is distinct from 'false'
      or length(a->>'identity') is null or length(a->>'identity') = 0
      or a->>'contentHash' is distinct from d->'attachmentHashes'->>(n::integer-1))
  then raise exception 'invalid artifact binding'; end if;
  if s->'contract'->>'mode' = 'four_mark_diagram' then
    if (c ?& array['diagram','explanation','rawTotal','total','ceilings','reasons','rootErrors']) is distinct from true
      or jsonb_typeof(c->'ceilings') is distinct from 'array'
      or jsonb_typeof(c->'diagram') is distinct from 'number' or jsonb_typeof(c->'explanation') is distinct from 'number'
      or jsonb_typeof(c->'rawTotal') is distinct from 'number' or jsonb_typeof(c->'total') is distinct from 'number'
    then raise exception 'incomplete component decision'; end if;
    if c is null or c = 'null'::jsonb or new.marks_available <> 4
      or (c->>'diagram')::integer not between 0 and 2 or (c->>'explanation')::integer not between 0 and 2
      or (d->>'state' in ('not_provided','no_relevant_diagram') and (c->>'diagram')::integer <> 0)
      or (length(trim(new.answer)) = 0 and (c->>'explanation')::integer <> 0)
    then raise exception 'invalid component bounds'; end if;
    raw_total := (c->>'diagram')::integer + (c->>'explanation')::integer;
    ceiling := 4;
    if exists(select 1 from jsonb_array_elements(c->'ceilings') x where (x->>'rule' in ('mechanism_consistency_2','question_label_ceiling_3')) is distinct from true
      or not (s->'contract'->'diagram'->'rules' ? (x->>'rule'))
      or (x->>'maximum')::integer is distinct from case x->>'rule' when 'mechanism_consistency_2' then 2 else 3 end)
    then raise exception 'unauthorized component ceiling'; end if;
    select least(4, coalesce(min((x->>'maximum')::integer),4)) into ceiling from jsonb_array_elements(c->'ceilings') x;
    if (c->>'rawTotal')::integer <> raw_total or (c->>'total')::integer <> least(raw_total,ceiling)
      or new.marks_earned <> least(raw_total,ceiling) or (new.assessment->>'marksEarned')::integer <> new.marks_earned
    then raise exception 'component arithmetic mismatch'; end if;
  elsif c is distinct from 'null'::jsonb then raise exception 'components outside split contract'; end if;
  return new;
end $$;

alter table public.practice_questions drop constraint if exists practice_questions_public_contract_chk;
alter table public.practice_questions add constraint practice_questions_public_contract_chk check (
  assessment_contract is null or (
    jsonb_typeof(assessment_contract) = 'object'
    and assessment_contract - array['version','mode','diagramRole','diagramReason','provenance'] = '{}'::jsonb
    and assessment_contract->>'version' = 'economics-diagram-contract-v1'
    and assessment_contract->>'mode' in ('four_mark_diagram','four_mark_written','holistic_diagram','not_assessed')
    and assessment_contract->>'diagramRole' in ('required_explicitly','necessary_for_task','optional_appropriate','appropriate_support','optional','not_assessed','unresolved')
    and length(assessment_contract->>'diagramReason') > 0
    and assessment_contract->>'provenance' in ('aptly_authored','inferred_practice')
  ) is true
);

notify pgrst, 'reload schema';
