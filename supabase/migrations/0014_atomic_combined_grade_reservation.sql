-- Reserve grade + diagram together before either provider begins.
-- Keep existing single-capability writers compatible by sharing their locks.
create or replace function public.reserve_combined_grade(
  p_user_id uuid,
  p_idempotency_key uuid,
  p_request_fingerprint text,
  p_diagram_fingerprint text,
  p_grade_daily_limit integer,
  p_diagram_daily_limit integer
)
returns table (
  outcome text,
  reservation_id uuid,
  reservation_status text,
  related_attempt_id uuid,
  related_practice_id uuid,
  result_hash text,
  diagram_reservation_id uuid,
  limited_capability text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  utc_today date := (now() at time zone 'utc')::date;
  grade_result record;
  diagram_result record;
  used integer;
begin
  if p_user_id is null or p_idempotency_key is null
    or p_grade_daily_limit is null or p_grade_daily_limit < 1
    or p_diagram_daily_limit is null or p_diagram_daily_limit < 1
    or p_request_fingerprint is null or p_request_fingerprint !~ '^[0-9a-f]{64}$'
    or p_diagram_fingerprint is null or p_diagram_fingerprint !~ '^[0-9a-f]{64}$'
  then raise exception 'invalid combined reservation parameters'; end if;

  -- A consistent grade -> diagram order prevents combined writers deadlocking.
  -- Single-capability writers hold only their own matching quota-bucket lock.
  perform pg_advisory_xact_lock(hashtext(p_user_id::text), hashtext('grade:' || utc_today::text));
  perform pg_advisory_xact_lock(hashtext(p_user_id::text), hashtext('diagram:' || utc_today::text));

  -- A durable result/pending/failed key is resolved before checking new capacity.
  -- Grade operation_group_key stays NULL for compatibility with pre-0014 keys.
  if exists (select 1 from public.ai_usage_reservations r
      where r.user_id = p_user_id and r.capability = 'grade' and r.idempotency_key = p_idempotency_key
        and r.usage_date >= utc_today - 30) then
    select * into grade_result from public.reserve_ai_usage(
      p_user_id, 'grade', p_idempotency_key, p_request_fingerprint, null, p_grade_daily_limit);
    return query select grade_result.outcome, grade_result.reservation_id, grade_result.reservation_status,
      grade_result.related_attempt_id, grade_result.related_practice_id, grade_result.result_hash,
      null::uuid, null::text;
    return;
  end if;

  -- Never adopt an independently reserved diagram key as a new combined grade.
  if exists (select 1 from public.ai_usage_reservations r
      where r.user_id = p_user_id and r.capability = 'diagram' and r.idempotency_key = p_idempotency_key
        and r.usage_date >= utc_today - 30) then
    return query select 'conflict'::text, null::uuid, null::text, null::uuid, null::uuid, null::text, null::uuid, null::text;
    return;
  end if;
  select count(*) into used from public.ai_usage_reservations r
    where r.user_id = p_user_id and r.capability = 'grade' and r.usage_date = utc_today;
  if used >= p_grade_daily_limit then
    return query select 'limited'::text, null::uuid, null::text, null::uuid, null::uuid, null::text, null::uuid, 'grade'::text;
    return;
  end if;
  select count(*) into used from public.ai_usage_reservations r
    where r.user_id = p_user_id and r.capability = 'diagram' and r.usage_date = utc_today;
  if used >= p_diagram_daily_limit then
    return query select 'limited'::text, null::uuid, null::text, null::uuid, null::uuid, null::text, null::uuid, 'diagram'::text;
    return;
  end if;

  select * into grade_result from public.reserve_ai_usage(
    p_user_id, 'grade', p_idempotency_key, p_request_fingerprint, null, p_grade_daily_limit);
  select * into diagram_result from public.reserve_ai_usage(
    p_user_id, 'diagram', p_idempotency_key, p_diagram_fingerprint, p_idempotency_key, p_diagram_daily_limit);
  -- Any unexpected insertion failure rolls the entire transaction back.
  if grade_result.outcome <> 'reserved' or diagram_result.outcome <> 'reserved' then
    raise exception 'combined reservation could not reserve both capabilities';
  end if;
  return query select grade_result.outcome, grade_result.reservation_id, grade_result.reservation_status,
    grade_result.related_attempt_id, grade_result.related_practice_id, grade_result.result_hash,
    diagram_result.reservation_id, null::text;
end;
$$;
revoke all on function public.reserve_combined_grade(uuid, uuid, text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.reserve_combined_grade(uuid, uuid, text, text, integer, integer) to service_role;
comment on function public.reserve_combined_grade(uuid, uuid, text, text, integer, integer) is
  'Atomic grade-and-diagram capacity reservation. A pre-dispatch quota rejection inserts neither ledger row.';
