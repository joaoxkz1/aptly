// Real disposable PostgreSQL/WASM: synthetic data, no network or model calls.
import {PGlite} from '@electric-sql/pglite';
import {readFile,readdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
const db=new PGlite(), user=randomUUID(),other=randomUUID(),admin=randomUUID(),session=randomUUID();
let assertions=0;
const ok=(x,label)=>{assert.ok(x,label);assertions++;};
const reject=async(fn,label)=>{await assert.rejects(fn,undefined,label);assertions++;};
async function role(name,fn){await db.exec(`set role ${name}`);try{return await fn();}finally{await db.exec('reset role');}}
const setUser=id=>db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);
async function digest(){return (await db.query(`select jsonb_build_object(
  'attempts',(select coalesce(jsonb_agg(to_jsonb(a) order by id),'[]') from public.attempts a),
  'practice',(select coalesce(jsonb_agg(to_jsonb(q) order by id),'[]') from public.practice_questions q),
  'snapshots',(select coalesce(jsonb_agg(to_jsonb(s) order by attempt_id),'[]') from public.assessment_snapshots s),
  'operations',(select coalesce(jsonb_agg(to_jsonb(o) order by id),'[]') from public.ai_usage_reservations o)) as state`)).rows[0].state;}
try{
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
    create schema auth;create table auth.users(id uuid primary key,created_at timestamptz default now(),email text);
    create table auth.sessions(id uuid primary key,user_id uuid references auth.users(id),not_after timestamptz);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema public,auth to anon,authenticated,service_role;grant execute on function auth.uid() to anon,authenticated,service_role;`);
  const files=(await readdir(new URL('../supabase/migrations/',import.meta.url))).filter(f=>f.endsWith('.sql')).sort();
  const migrationName=files.find(f=>f.endsWith('_admin_analytics.sql'));
  for(const file of files.filter(f=>f!==migrationName))await db.exec(await readFile(new URL(`../supabase/migrations/${file}`,import.meta.url),'utf8'));
  await db.query('insert into auth.users(id,email) values($1,$2),($3,$4),($5,$6)',[user,'student1@example.test',other,'student2@example.test',admin,'founder@example.test']);
  await db.query('insert into auth.sessions(id,user_id) values($1,$2)',[session,admin]);
  const a=randomUUID(),b=randomUUID();
  for(const [id,owner] of [[a,user],[b,other]])await db.query("insert into public.attempts(id,user_id,subject,topic,question,answer,score,feedback) values($1,$2,'Economics','Legacy','Private question','Private answer',4,'{}')",[id,owner]);
  const before=await digest();
  const migration=await readFile(new URL(`../supabase/migrations/${migrationName}`,import.meta.url),'utf8');
  await db.exec(migration);
  ok(JSON.stringify(before)===JSON.stringify(await digest()),'upgrade preserves all pre-existing rows exactly');
  const snapshot=await readFile(new URL('../supabase/schema.sql',import.meta.url),'utf8');
  ok(snapshot.replace(/\r\n/g,'\n').includes(migration.replace(/\r\n/g,'\n')),'schema snapshot includes exact additive migration');
  await db.query('insert into public.aptly_admins(user_id) values($1)',[admin]);
  for(const clientRole of ['anon','authenticated']){
    for(const table of ['aptly_admins','analytics_events','admin_attempt_facts','admin_practice_facts'])await reject(()=>role(clientRole,()=>db.query(`select * from public.${table}`)),`${clientRole} cannot read ${table}`);
    await reject(()=>role(clientRole,()=>db.query('select public.admin_analytics_snapshot($1,$2,now())',[admin,session])),`${clientRole} cannot invoke snapshot even with known admin IDs`);
    await reject(()=>role(clientRole,()=>db.query('select * from public.admin_find_user($1,$2,$3)',[admin,session,'founder@example.test'])),`${clientRole} cannot enumerate Auth users`);
    await reject(()=>role(clientRole,()=>db.query('select public.record_analytics_event($1,$2,null,null,$3)',[user,'practice_started',{}])),`${clientRole} cannot forge events`);
    await reject(()=>role(clientRole,()=>db.query('insert into public.aptly_admins(user_id) values($1)',[user])),`${clientRole} cannot self-promote`);
  }
  await reject(()=>role('service_role',()=>db.query('select public.admin_analytics_snapshot($1,$2,now())',[user,session])),'server snapshot rejects non-admin');
  await reject(()=>role('service_role',()=>db.query('select public.admin_analytics_snapshot($1,$2,now())',[admin,randomUUID()])),'server snapshot rejects revoked/missing session');
  await db.query("update auth.sessions set not_after=now()-interval '1 second' where id=$1",[session]);
  await reject(()=>role('service_role',()=>db.query('select public.admin_analytics_snapshot($1,$2,now())',[admin,session])),'expired session fails closed');
  await db.query('update auth.sessions set not_after=null where id=$1',[session]);
  const facts=(await role('service_role',()=>db.query('select public.admin_analytics_snapshot($1,$2,now()+interval \'1 second\') as data',[admin,session]))).rows[0].data;
  ok(facts.users.length===3&&facts.attempts.length===2,'admin snapshot includes authoritative records');
  ok(!JSON.stringify(facts).includes('Private')&&!JSON.stringify(facts).includes('email'),'snapshot excludes content and emails');
  ok(facts.attempts.every(a=>a.framework===null&&a.marks_earned===null),'legacy nulls stay unknown');
  await setUser(user);
  for(const table of ['attempt_feedback','reported_original_marks']){
    const columns=table==='attempt_feedback'?'rating,comment':'marks_earned,marks_available';
    const values=table==='attempt_feedback'?"4,'Helpful'":'5,10';
    await role('authenticated',()=>db.query(`insert into public.${table}(attempt_id,${columns}) values($1,${values})`,[a]));
    await reject(()=>role('authenticated',()=>db.query(`insert into public.${table}(attempt_id,${columns}) values($1,${values})`,[a])),'one active report per user/attempt');
    await reject(()=>role('authenticated',()=>db.query(`insert into public.${table}(attempt_id,${columns}) values($1,${values})`,[b])),'cannot attach report to another owner attempt');
    await reject(()=>role('authenticated',()=>db.query(`insert into public.${table}(attempt_id,user_id,${columns}) values($1,$2,${values})`,[b,other])),'cannot spoof report user');
    await reject(()=>role('anon',()=>db.query(`select * from public.${table}`)),'no anonymous public feedback reads');
    const update=table==='attempt_feedback'?'rating=5':'marks_earned=6';
    await role('authenticated',()=>db.query(`update public.${table} set ${update} where attempt_id=$1`,[a]));
    ok((await role('authenticated',()=>db.query(`select * from public.${table}`))).rows.length===1,'owner can read and edit own report');
    await setUser(other);
    ok((await role('authenticated',()=>db.query(`select * from public.${table}`))).rows.length===0,'RLS hides other student reports');
    ok((await role('authenticated',()=>db.query(`update public.${table} set ${update} where attempt_id=$1 returning id`,[a]))).rows.length===0,'RLS prevents cross-user update');
    ok((await role('authenticated',()=>db.query(`delete from public.${table} where attempt_id=$1 returning id`,[a]))).rows.length===0,'RLS prevents cross-user delete');
    await setUser(user);
  }
  for(const update of ['rating=0','rating=6',"comment=repeat('x',501)"])await reject(()=>role('authenticated',()=>db.exec(`update public.attempt_feedback set ${update}`)),'database bounds feedback');
  for(const update of ['marks_earned=-1','marks_earned=11','marks_available=0',"source='teacher_verified'"])await reject(()=>role('authenticated',()=>db.exec(`update public.reported_original_marks set ${update}`)),'database bounds student mark and source');
  const ingest=(name,attemptId=null,props={})=>role('service_role',()=>db.query('select public.record_analytics_event($1,$2,$3,null,$4) as accepted',[user,name,attemptId,props]));
  ok((await ingest('feedback_viewed',a,{source:'result'})).rows[0].accepted,'valid event saved');
  ok(!(await ingest('feedback_viewed',a,{source:'result'})).rows[0].accepted,'effect retry deduplicated');
  for(const [name,attemptId,props] of [['assessment_completed',null,{}],['feedback_viewed',b,{}],['feedback_viewed',null,{}],['practice_started',null,{answer:'raw'}],['practice_started',null,{source:'x'.repeat(1000)}],['practice_started',null,{source:null}]])await reject(()=>ingest(name,attemptId,props),'reject invalid/spoofed event payload');
  await db.query("insert into public.analytics_events(user_id,event_name) select $1,'practice_started' from generate_series(1,29)",[user]);
  ok(!(await ingest('history_viewed')).rows[0].accepted,'per-user rate limit enforced');
  // Table-valued REST endpoints can truncate at 1000; one JSON snapshot must not.
  await db.query("insert into public.analytics_events(user_id,event_name,created_at) select $1,'history_viewed',now()-interval '1 hour' from generate_series(1,1005)",[other]);
  const large=(await role('service_role',()=>db.query("select public.admin_analytics_snapshot($1,$2,now()+interval '1 second') as data",[admin,session]))).rows[0].data;
  ok(large.events.length===1035,'snapshot does not silently truncate at 1000 rows');
  await role('authenticated',()=>db.query('delete from public.attempts where id=$1',[a]));
  ok((await db.query('select * from public.attempt_feedback')).rows.length===0,'attempt deletion cascades feedback');
  ok((await db.query('select * from public.reported_original_marks')).rows.length===0,'attempt deletion cascades original marks');
  ok((await db.query('select * from public.analytics_events where attempt_id=$1',[a])).rows.length===0,'attempt deletion cascades linked interactions');
  await db.query('delete from auth.users where id=$1',[other]);
  ok((await db.query('select * from public.analytics_events where user_id=$1',[other])).rows.length===0,'account deletion cascades events');
  const plan=await db.query("explain (analyze,format json) select count(*) from public.analytics_events where user_id=$1 and created_at>=now()-interval '1 minute'",[user]);
  ok(JSON.stringify(plan.rows).includes('analytics_events_user_created_idx'),'event rate limit uses the user/time index');
  console.log(`PASS admin migration replay, seeded legacy preservation, ${assertions} security/RLS/aggregation assertions. Zero model calls.`);
}catch(error){console.error(`FAIL admin migrations: ${error.message}${error.where?` (${error.where})`:''}`);process.exitCode=1;}finally{await db.close();}
