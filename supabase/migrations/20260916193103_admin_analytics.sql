-- Permanent internal analytics. Additive; no historical domain rows are updated.
create table public.aptly_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.aptly_admins enable row level security;
revoke all on public.aptly_admins from public, anon, authenticated;
grant select, insert, delete on public.aptly_admins to service_role;

create table public.analytics_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_name text not null check (event_name in (
    'feedback_viewed','next_step_clicked','current_focus_viewed',
    'targeted_practice_started','practice_started','revision_started',
    'history_viewed','onboarding_completed','diagram_upload_started','diagram_removed_before_submit'
  )),
  attempt_id uuid references public.attempts(id) on delete cascade,
  practice_question_id uuid references public.practice_questions(id) on delete cascade,
  properties jsonb not null default '{}'::jsonb check (
    jsonb_typeof(properties) = 'object' and octet_length(properties::text) <= 256
    and properties - array['source','action'] = '{}'::jsonb
    and (not (properties ? 'source') or properties->>'source' in ('general','current_focus','answer_feedback','history','result'))
    and (not (properties ? 'action') or (event_name = 'next_step_clicked' and properties->>'action' in ('revise','practice')))
    and not jsonb_path_exists(properties, '$.* ? (@ == null)')
  ),
  created_at timestamptz not null default now()
);
alter table public.analytics_events enable row level security;
revoke all on public.analytics_events from public, anon, authenticated;
grant select, insert, delete on public.analytics_events to service_role;
-- Supports ownership checks, rate limiting, deduplication and account-scoped retention.
create index analytics_events_user_created_idx on public.analytics_events(user_id, created_at desc);
create index analytics_events_created_idx on public.analytics_events(created_at desc);

-- Server-only ingestion: checked references, DB clock, per-user lock and bounded rate.
-- Browser signals are never authoritative evidence of grading or completion.
create function public.record_analytics_event(p_user_id uuid, p_event_name text,
  p_attempt_id uuid, p_practice_question_id uuid, p_properties jsonb)
returns boolean language plpgsql security invoker set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtext(p_user_id::text), hashtext('analytics_events'));
  if p_attempt_id is not null and not exists (select 1 from public.attempts where id=p_attempt_id and user_id=p_user_id)
    or p_practice_question_id is not null and not exists (select 1 from public.practice_questions where id=p_practice_question_id and user_id=p_user_id)
  then raise exception 'invalid event reference'; end if;
  if p_event_name in ('feedback_viewed','next_step_clicked','revision_started') and p_attempt_id is null
  then raise exception 'attempt required'; end if;
  if (select count(*) from public.analytics_events where user_id=p_user_id and created_at >= now()-interval '1 minute') >= 30
    or (select count(*) from public.analytics_events where user_id=p_user_id and created_at >= now()-interval '1 day') >= 1000
  then return false; end if;
  if exists (select 1 from public.analytics_events where user_id=p_user_id and event_name=p_event_name
    and attempt_id is not distinct from p_attempt_id and practice_question_id is not distinct from p_practice_question_id
    and properties=p_properties and created_at >= now()-interval '30 seconds') then return false; end if;
  insert into public.analytics_events(user_id,event_name,attempt_id,practice_question_id,properties)
    values(p_user_id,p_event_name,p_attempt_id,p_practice_question_id,p_properties);
  return true;
end $$;
revoke all on function public.record_analytics_event(uuid,text,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.record_analytics_event(uuid,text,uuid,uuid,jsonb) to service_role;

create table public.attempt_feedback (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.attempts(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  comment text check (char_length(comment) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id,attempt_id)
);
create table public.reported_original_marks (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.attempts(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  marks_earned numeric(5,2) not null check (marks_earned >= 0),
  marks_available smallint not null check (marks_available between 1 and 60 and marks_earned <= marks_available),
  source text not null default 'student_reported' check (source='student_reported'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id,attempt_id)
);
create function public.protect_student_report() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if tg_op='UPDATE' then
    if new.user_id <> old.user_id or new.attempt_id <> old.attempt_id or new.id <> old.id
      then raise exception 'report identity is immutable'; end if;
    new.created_at := old.created_at;
  else new.created_at := now(); end if;
  new.updated_at := now();
  return new;
end $$;
revoke all on function public.protect_student_report() from public,anon,authenticated;

alter table public.attempt_feedback enable row level security;
alter table public.reported_original_marks enable row level security;
revoke all on public.attempt_feedback,public.reported_original_marks from public,anon,authenticated;
grant select,delete on public.attempt_feedback,public.reported_original_marks to authenticated;
grant insert(attempt_id,rating,comment),update(rating,comment) on public.attempt_feedback to authenticated;
grant insert(attempt_id,marks_earned,marks_available),update(marks_earned,marks_available) on public.reported_original_marks to authenticated;
grant select,insert,update,delete on public.attempt_feedback,public.reported_original_marks to service_role;

create policy feedback_owner on public.attempt_feedback for all to authenticated
using ((select auth.uid())=user_id)
with check ((select auth.uid())=user_id and exists(select 1 from public.attempts a where a.id=attempt_id and a.user_id=(select auth.uid())));
create policy original_mark_owner on public.reported_original_marks for all to authenticated
using ((select auth.uid())=user_id)
with check ((select auth.uid())=user_id and exists(select 1 from public.attempts a where a.id=attempt_id and a.user_id=(select auth.uid())));
create trigger protect_feedback before insert or update on public.attempt_feedback for each row execute function public.protect_student_report();
create trigger protect_original_mark before insert or update on public.reported_original_marks for each row execute function public.protect_student_report();
-- FK cleanup and deliberate attempt detail lookups (unique keys start with user_id).
create index attempt_feedback_attempt_idx on public.attempt_feedback(attempt_id);
create index reported_original_marks_attempt_idx on public.reported_original_marks(attempt_id);

-- Content-free projections. No answer, question, feedback text, blueprint, snapshot or hashes.
create view public.admin_attempt_facts with (security_invoker=true) as
select id,user_id,created_at,topic,syllabus_topic,assessment_format,paper,
  assessment->>'framework' as framework,marks_earned,marks_available,marks_assessable,
  score as legacy_score,max_score as legacy_max_score,scoring_state,parent_attempt_id,practice_question_id,
  grading_model_id,grading_contract_version,rubric_version,assessment_version,
  coalesce(assessment->'assessedDiagram'->>'state',diagram_evidence->>'status') as diagram_state,
  assessment->'assessedDiagram'->'contract'->>'diagramRole' as diagram_role,
  assessment->'assessedDiagram'->'contract'->>'mode' as diagram_mode,
  (case when jsonb_typeof(assessment->'assessedDiagram'->'attachmentHashes')='array'
     then jsonb_array_length(assessment->'assessedDiagram'->'attachmentHashes')>0 else false end
     or (diagram_evidence is not null and diagram_evidence <> 'null'::jsonb)) as diagram_present,
  (assessment->'assessedDiagram' is not null and assessment->'assessedDiagram' <> 'null'::jsonb) as diagram_assessed
from public.attempts;
create view public.admin_practice_facts with (security_invoker=true) as
select id,user_id,created_at,framework,mark_total,topic_code,topic_label,skill,question_origin,bank_question_id,
  from_current_focus,focus_context->>'source' as focus_source,
  generation_provenance->>'modelId' as model_id,grading_blueprint_version
from public.practice_questions;
revoke all on public.admin_attempt_facts,public.admin_practice_facts from public,anon,authenticated;
grant select on public.admin_attempt_facts,public.admin_practice_facts to service_role;

-- Minimal Auth columns only; authorization checks both live membership and session revocation.
grant select(id,created_at,email) on auth.users to service_role;
grant select(id,user_id,not_after) on auth.sessions to service_role;
create function public.admin_session_authorized(p_user_id uuid,p_session_id uuid)
returns boolean language sql stable security invoker set search_path='' as $$
  select exists(select 1 from public.aptly_admins a join auth.sessions s on s.user_id=a.user_id
    where a.user_id=p_user_id and s.id=p_session_id and (s.not_after is null or s.not_after>now()));
$$;
revoke all on function public.admin_session_authorized(uuid,uuid) from public,anon,authenticated;
grant execute on function public.admin_session_authorized(uuid,uuid) to service_role;

-- One MVCC snapshot; JSON aggregation avoids the Data API's 1,000-row response limit.
-- Current product scale is small; this returns minimized facts to the SERVER, not the browser.
create function public.admin_analytics_snapshot(p_user_id uuid,p_session_id uuid,p_before timestamptz)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
begin
  if not public.admin_session_authorized(p_user_id,p_session_id) then raise exception 'not authorized'; end if;
  return jsonb_build_object(
    'users',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'created_at',created_at)),'[]') from auth.users where created_at<p_before),
    'attempts',(select coalesce(jsonb_agg(to_jsonb(a)),'[]') from public.admin_attempt_facts a where created_at<p_before),
    'practice',(select coalesce(jsonb_agg(to_jsonb(q)),'[]') from public.admin_practice_facts q where created_at<p_before),
    'events',(select coalesce(jsonb_agg(to_jsonb(e)),'[]') from public.analytics_events e where created_at<p_before),
    'ratings',(select coalesce(jsonb_agg(to_jsonb(f)-'comment'),'[]') from public.attempt_feedback f where created_at<p_before),
    'reportedMarks',(select coalesce(jsonb_agg(to_jsonb(m)),'[]') from public.reported_original_marks m where created_at<p_before),
    'operations',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'user_id',user_id,'capability',capability,'status',status,
      'created_at',created_at,'processing_started_at',processing_started_at,'completed_at',completed_at,'failure_category',failure_category)),'[]')
      from public.ai_usage_reservations where created_at<p_before)
  );
end $$;
revoke all on function public.admin_analytics_snapshot(uuid,uuid,timestamptz) from public,anon,authenticated;
grant execute on function public.admin_analytics_snapshot(uuid,uuid,timestamptz) to service_role;

create function public.admin_find_user(p_user_id uuid,p_session_id uuid,p_search text)
returns table(id uuid,email text) language sql stable security invoker set search_path='' as $$
  select u.id,u.email::text from auth.users u
  where public.admin_session_authorized(p_user_id,p_session_id) and length(p_search) between 3 and 254
    and (lower(u.email)=lower(p_search) or u.id::text=p_search) limit 1;
$$;
revoke all on function public.admin_find_user(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.admin_find_user(uuid,uuid,text) to service_role;

comment on table public.analytics_events is 'Bounded transient learning interactions, from this release only. Server-authenticated identity, no raw content. Deleted with account or linked work.';
comment on table public.reported_original_marks is 'Unverified student-reported original marks. Never replaces Aptly estimates; not validated teacher agreement.';
notify pgrst,'reload schema';
