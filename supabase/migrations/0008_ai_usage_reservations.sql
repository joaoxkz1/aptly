-- Aptly unified atomic AI usage reservations.
--
-- One no-content ledger covers grade, scan, diagram review, and practice.
-- Every provider-dispatched request counts, including provider failures.
-- Browser roles have no table or RPC access.

create table if not exists public.ai_usage_reservations (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references auth.users (id) on delete cascade,
  capability            text not null check (capability in ('grade', 'scan', 'diagram', 'practice')),
  idempotency_key       uuid not null,
  request_fingerprint   char(64) not null check (request_fingerprint ~ '^[0-9a-f]{64}$'),
  operation_group_key   uuid,
  usage_date            date not null default ((now() at time zone 'utc')::date),
  status                text not null check (status in ('reserved', 'processing', 'succeeded', 'failed')),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  processing_started_at timestamptz,
  completed_at          timestamptz,
  failure_category      text check (
    failure_category is null
    or failure_category in ('provider', 'validation', 'persistence', 'stale', 'internal')
  ),
  related_attempt_id    uuid references public.attempts (id) on delete set null,
  related_practice_id   uuid references public.practice_questions (id) on delete set null,
  result_hash           char(64) check (result_hash is null or result_hash ~ '^[0-9a-f]{64}$'),
  unique (user_id, capability, idempotency_key)
);

create index if not exists ai_usage_reservations_user_capability_day_idx
  on public.ai_usage_reservations (user_id, capability, usage_date);

create index if not exists ai_usage_reservations_stale_idx
  on public.ai_usage_reservations (status, updated_at)
  where status in ('reserved', 'processing');

alter table public.ai_usage_reservations enable row level security;
revoke all on table public.ai_usage_reservations from public, anon, authenticated;
grant select, insert, update on table public.ai_usage_reservations to service_role;

-- Reserve at most one provider dispatch per idempotency key and serialize the
-- per-user/capability/day limit check. Advisory locks are transaction-scoped,
-- so concurrent distinct keys cannot both observe spare final capacity.
create or replace function public.reserve_ai_usage(
  p_user_id uuid,
  p_capability text,
  p_idempotency_key uuid,
  p_request_fingerprint text,
  p_operation_group_key uuid,
  p_daily_limit integer
)
returns table (
  outcome text,
  reservation_id uuid,
  reservation_status text,
  related_attempt_id uuid,
  related_practice_id uuid,
  result_hash text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing public.ai_usage_reservations%rowtype;
  created public.ai_usage_reservations%rowtype;
  utc_today date := (now() at time zone 'utc')::date;
  used integer;
begin
  if p_capability not in ('grade', 'scan', 'diagram', 'practice')
    or p_daily_limit < 1
    or p_request_fingerprint !~ '^[0-9a-f]{64}$'
  then
    raise exception 'invalid reservation parameters';
  end if;

  perform pg_advisory_xact_lock(
    hashtext(p_user_id::text),
    hashtext(p_capability || ':' || utc_today::text)
  );

  -- Recover every abandoned row in this locked quota bucket. Rows remain in
  -- the ledger and therefore continue to count toward the day's dispatches.
  update public.ai_usage_reservations r
  set status = 'failed',
      updated_at = now(),
      completed_at = now(),
      failure_category = 'stale'
  where r.user_id = p_user_id
    and r.capability = p_capability
    and r.usage_date = utc_today
    and r.status in ('reserved', 'processing')
    and r.updated_at < now() - interval '15 minutes';

  select * into existing
  from public.ai_usage_reservations r
  where r.user_id = p_user_id
    and r.capability = p_capability
    and r.idempotency_key = p_idempotency_key
  for update;

  if found then
    if existing.request_fingerprint <> p_request_fingerprint
      or existing.operation_group_key is distinct from p_operation_group_key
    then
      return query select
        'conflict'::text, existing.id, existing.status,
        existing.related_attempt_id, existing.related_practice_id, existing.result_hash::text;
      return;
    end if;

    if existing.status in ('reserved', 'processing')
      and existing.updated_at < now() - interval '15 minutes'
    then
      update public.ai_usage_reservations r
      set status = 'failed',
          updated_at = now(),
          completed_at = now(),
          failure_category = 'stale'
      where r.id = existing.id
      returning * into existing;
    end if;

    return query select
      case existing.status
        when 'succeeded' then 'replay'
        when 'failed' then 'failed'
        else 'in_progress'
      end,
      existing.id, existing.status,
      existing.related_attempt_id, existing.related_practice_id, existing.result_hash::text;
    return;
  end if;

  select count(*) into used
  from public.ai_usage_reservations r
  where r.user_id = p_user_id
    and r.capability = p_capability
    and r.usage_date = utc_today;

  if used >= p_daily_limit then
    return query select
      'limited'::text, null::uuid, null::text, null::uuid, null::uuid, null::text;
    return;
  end if;

  insert into public.ai_usage_reservations (
    user_id, capability, idempotency_key, request_fingerprint,
    operation_group_key, usage_date, status
  ) values (
    p_user_id, p_capability, p_idempotency_key, p_request_fingerprint,
    p_operation_group_key, utc_today, 'reserved'
  ) returning * into created;

  return query select
    'reserved'::text, created.id, created.status,
    created.related_attempt_id, created.related_practice_id, created.result_hash::text;
end;
$$;

revoke all on function public.reserve_ai_usage(uuid, text, uuid, text, uuid, integer)
  from public, anon, authenticated;
grant execute on function public.reserve_ai_usage(uuid, text, uuid, text, uuid, integer)
  to service_role;

-- Preserve the remainder of today's pre-migration consumption. These rows
-- contain no prompts, answers, images, extracted text, or model output.
insert into public.ai_usage_reservations (
  user_id, capability, idempotency_key, request_fingerprint, usage_date,
  status, created_at, updated_at, completed_at, related_attempt_id
)
select
  a.user_id, 'grade', gen_random_uuid(), repeat('0', 64),
  (a.created_at at time zone 'utc')::date, 'succeeded',
  a.created_at, a.created_at, a.created_at, a.id
from public.attempts a
where a.created_at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc';

insert into public.ai_usage_reservations (
  user_id, capability, idempotency_key, request_fingerprint, usage_date,
  status, created_at, updated_at, completed_at, related_practice_id
)
select
  q.user_id, 'practice', gen_random_uuid(), repeat('0', 64),
  (q.created_at at time zone 'utc')::date, 'succeeded',
  q.created_at, q.created_at, q.created_at, q.id
from public.practice_questions q
where q.created_at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc';

insert into public.ai_usage_reservations (
  user_id, capability, idempotency_key, request_fingerprint, usage_date,
  status, created_at, updated_at, completed_at
)
select
  u.user_id, 'scan', gen_random_uuid(), repeat('0', 64),
  (u.created_at at time zone 'utc')::date, 'succeeded',
  u.created_at, u.created_at, u.created_at
from public.scan_extraction_usage u
where u.created_at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc';

insert into public.ai_usage_reservations (
  user_id, capability, idempotency_key, request_fingerprint, usage_date,
  status, created_at, updated_at, completed_at
)
select
  u.user_id, 'diagram', gen_random_uuid(), repeat('0', 64),
  (u.created_at at time zone 'utc')::date, 'succeeded',
  u.created_at, u.created_at, u.created_at
from public.diagram_review_usage u
where u.created_at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc';

comment on table public.ai_usage_reservations is
  'No-content atomic AI dispatch ledger. All statuses count toward daily use.';
comment on column public.ai_usage_reservations.result_hash is
  'Optional hash used to authorize a transient diagram result; never the result itself.';
comment on function public.reserve_ai_usage(uuid, text, uuid, text, uuid, integer) is
  'Service-role-only atomic idempotency and daily-cap reservation.';
