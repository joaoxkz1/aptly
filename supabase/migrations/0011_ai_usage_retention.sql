-- Aptly — retention for the no-content AI usage ledger.
--
-- Problem: ai_usage_reservations rows were never removed. They hold no
-- schoolwork (capability, date, status, a request fingerprint hash and a
-- result hash), but keeping them forever serves no purpose and conflicts with
-- storage limitation.
--
-- RETENTION WINDOW: 30 DAYS. Reasoning:
--   * Daily quota enforcement only ever reads the CURRENT UTC day.
--   * Idempotency replay protection matters for minutes, not weeks — and the
--     durable protection against a duplicate saved grade is the separate
--     unique index on attempts (user_id, idempotency_key), which is unaffected.
--   * The binding need is short-term reconciliation: investigating a student's
--     "this was charged twice" or "I hit the limit early" report, which is
--     realistically raised within a month.
-- 30 days covers that with margin; longer retention is not necessary for any
-- identified purpose. Documented in docs/compliance/operations.md.
--
-- MECHANISM: opportunistic, inside the existing reserve_ai_usage call. No cron
-- and no new infrastructure. The delete is scoped to the SAME user AND
-- capability that the transaction already holds the advisory lock for, so it
-- adds no new lock ordering and cannot deadlock against a concurrent request
-- for a different capability.
--
-- Additive and idempotent: this only replaces the function body. Table shape,
-- grants, RLS, quota limits and every existing outcome are unchanged.

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
  retention_days constant integer := 30;
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

  -- Retention sweep. Same user + capability as the held lock; only rows from
  -- completed days outside the window. Never touches today's rows, so quota
  -- counting and idempotency for the current day are unaffected.
  delete from public.ai_usage_reservations r
  where r.user_id = p_user_id
    and r.capability = p_capability
    and r.usage_date < utc_today - retention_days;

  update public.ai_usage_reservations r
  set status = 'failed', updated_at = now(), completed_at = now(),
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
        existing.related_attempt_id, existing.related_practice_id,
        existing.result_hash::text;
      return;
    end if;

    if existing.status in ('reserved', 'processing')
      and existing.updated_at < now() - interval '15 minutes'
    then
      update public.ai_usage_reservations r
      set status = 'failed', updated_at = now(), completed_at = now(),
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
      existing.related_attempt_id, existing.related_practice_id,
      existing.result_hash::text;
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
    created.related_attempt_id, created.related_practice_id,
    created.result_hash::text;
end;
$$;

revoke all on function public.reserve_ai_usage(uuid, text, uuid, text, uuid, integer)
  from public, anon, authenticated;
grant execute on function public.reserve_ai_usage(uuid, text, uuid, text, uuid, integer)
  to service_role;

comment on function public.reserve_ai_usage(uuid, text, uuid, text, uuid, integer) is
  'Atomic per-user daily AI quota + idempotency reservation. Also sweeps this user/capability''s reservation rows older than 30 days (see docs/compliance/operations.md).';
