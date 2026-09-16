begin transaction read only;
select current_database() as database, version() as version;
select 'attempts' as relation, count(*) as rows, md5(string_agg(to_jsonb(a)::text, '' order by id)) as digest from public.attempts a where created_at <= '2026-09-16T17:43:40.977Z'
union all select 'practice_questions',count(*),md5(string_agg(to_jsonb(q)::text,'' order by id)) from public.practice_questions q where created_at <= '2026-09-16T17:43:40.977Z'
union all select 'assessment_snapshots',count(*),md5(string_agg(to_jsonb(s)::text,'' order by attempt_id)) from public.assessment_snapshots s where created_at <= '2026-09-16T17:43:40.977Z';
rollback;
