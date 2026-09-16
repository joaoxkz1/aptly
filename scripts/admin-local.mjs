// Verified local Supabase/Auth + browser harness. No production configuration or model calls.
import {createClient} from '@supabase/supabase-js';
import {createServerClient,parseCookieHeader,serializeCookieHeader} from '@supabase/ssr';
import {createHmac,randomUUID} from 'node:crypto';
import {execFileSync,spawn} from 'node:child_process';
import {readFileSync,writeFileSync,existsSync,unlinkSync} from 'node:fs';
import {resolve} from 'node:path';
import {createServer} from 'node:http';
import assert from 'node:assert/strict';
const mode=process.argv[2],root=process.cwd(),statePath=resolve('.env.admin-qa.json');
if(!['migrate','setup','build','serve','check','cleanup'].includes(mode))throw new Error('Use migrate/setup/build/serve/check/cleanup');
const containers=JSON.parse(execFileSync('docker',['inspect','supabase_auth_aptly','supabase_db_aptly'],{encoding:'utf8',windowsHide:true}));
for(const c of containers)assert.equal(resolve(c.Config.Labels['com.supabase.cli.workdir']).toLowerCase(),root.toLowerCase());
const localEnv=containers.find(c=>c.Name==='/supabase_auth_aptly').Config.Env;
const secret=localEnv.find(v=>v.startsWith('GOTRUE_JWT_SECRET='))?.split('=').slice(1).join('=');
assert.ok(secret);
const key=role=>{const enc=x=>Buffer.from(JSON.stringify(x)).toString('base64url'),iat=Math.floor(Date.now()/1000);
  const data=`${enc({alg:'HS256',typ:'JWT'})}.${enc({role,iss:'supabase',iat,exp:iat+86400})}`;return `${data}.${createHmac('sha256',secret).update(data).digest('base64url')}`;};
const backend='http://127.0.0.1:54321',origin='http://127.0.0.1:3130',helperOrigin='http://127.0.0.1:3131';
const anon=key('anon'),service=key('service_role');
Object.assign(process.env,{NEXT_PUBLIC_SUPABASE_URL:backend,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:anon,
  SUPABASE_SERVICE_ROLE_KEY:service,ADMIN_ROUTE_CODE:'123456',OPENAI_API_KEY:'local-no-model-calls',OPENAI_BASE_URL:`${helperOrigin}/v1`,NEXT_PUBLIC_DIAGRAM_ASSESSMENT_ENABLED:'true'});
const admin=createClient(backend,service,{auth:{persistSession:false,autoRefreshToken:false}});
const state=()=>JSON.parse(readFileSync(statePath,'utf8'));
const ensure=result=>{if(result.error)throw new Error(result.error.message);return result.data;};
async function signIn(account){
  const jar=new Map();
  const client=createServerClient(backend,anon,{cookies:{getAll:()=>[...jar].map(([name,value])=>({name,value})),setAll:c=>c.forEach(v=>jar.set(v.name,v.value))}});
  const session=ensure(await client.auth.signInWithPassword({email:account.email,password:account.password})).session;
  return {client,session,cookie:[...jar].map(([n,v])=>`${n}=${v}`).join('; ')};
}
if(mode==='migrate'){
  const name='20260916193103_admin_analytics.sql',sql=readFileSync(resolve('supabase/migrations',name),'utf8');
  const version=name.split('_')[0];
  const applied=execFileSync('docker',['exec','supabase_db_aptly','psql','-U','postgres','-d','postgres','-At','-c',`select count(*) from supabase_migrations.schema_migrations where version='${version}'`],{encoding:'utf8',windowsHide:true}).trim();
  if(applied==='0')execFileSync('docker',['exec','-i','supabase_db_aptly','psql','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'],{
    input:`begin;\n${sql}\ninsert into supabase_migrations.schema_migrations(version,name,statements) values('${version}','admin_analytics',array[]::text[]);\ncommit;`,encoding:'utf8',windowsHide:true});
  console.log('Local additive admin migration is applied.');
}else if(mode==='setup'){
  if(existsSync(statePath))throw new Error('Existing admin QA state; inspect or clean it up first');
  const s={accounts:[],attempts:[]};writeFileSync(statePath,JSON.stringify(s));
  for(const label of ['founder','student']){
    const email=`admin-qa-${label}-${randomUUID()}@example.test`,password=`Local-${randomUUID()}-Aa1!`;
    const user=ensure(await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{display_name:`QA ${label}`,economics_level:'sl'}})).user;
    s.accounts.push({label,email,password,id:user.id});writeFileSync(statePath,JSON.stringify(s));
  }
  ensure(await admin.from('aptly_admins').insert({user_id:s.accounts[0].id}));
  const user=s.accounts[1].id,stamp=days=>new Date(Date.now()-days*86400000).toISOString();
  for(let i=0;i<6;i++){
    const marked={version:3,framework:'paper1a_10_mark',marksEarned:5+i%4,marksAvailable:10,scoringState:'marked'};
    const row={user_id:user,subject:'Economics',topic:i%2?'Supply':'Demand',question:'Synthetic local question [10]',answer:'Synthetic local response only',score:4,
      feedback:{score:4,band:'practice',strengths:['A causal mechanism'],improvements:['Develop the explanation'],mistakes:[],examinerComment:'Local fixture',studyNext:'Practice a new topic'},
      assessment:marked,assessment_version:3,assessment_format:'paper_1_a_10_mark',paper:'paper_1',syllabus_topic:i%2?'2.3':'2.2',marks_earned:marked.marksEarned,marks_available:10,marks_assessable:10,scoring_state:'marked',created_at:stamp(i),
      parent_attempt_id:i===0?null:i===1?s.attempts[0]:null};
    // Keep revision chronology valid: reverse timestamps for the first two.
    if(i===0)row.created_at=stamp(2);if(i===1)row.created_at=stamp(1);
    const saved=ensure(await admin.from('attempts').insert(row).select('id').single());s.attempts.push(saved.id);writeFileSync(statePath,JSON.stringify(s));
  }
  ensure(await admin.from('attempt_feedback').insert({attempt_id:s.attempts[0],user_id:user,rating:2,comment:'Synthetic QA comment: make the next step clearer.'}));
  ensure(await admin.from('reported_original_marks').insert({attempt_id:s.attempts[0],user_id:user,marks_earned:6,marks_available:10}));
  for(const [i,status] of ['succeeded','failed','processing'].entries())ensure(await admin.from('ai_usage_reservations').insert({user_id:user,capability:'grade',idempotency_key:randomUUID(),request_fingerprint:'a'.repeat(64),status,failure_category:status==='failed'?'provider':null,created_at:stamp(i)}));
  console.log('Disposable local founder/student fixtures created. No model calls.');
}else if(mode==='build'){
  const child=spawn(process.execPath,['node_modules/next/dist/bin/next','build'],{env:process.env,stdio:'inherit',windowsHide:true});child.on('exit',code=>process.exitCode=code??1);
}else if(mode==='serve'){
  const s=state();let providerCalls=0;
  const helper=createServer(async(req,res)=>{
    try{
      const url=new URL(req.url,helperOrigin);
      if(url.pathname==='/status'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({providerCalls,local:true}));return;}
      if(url.pathname.startsWith('/v1/')){providerCalls++;res.writeHead(503);res.end('No model calls allowed');return;}
      const account=s.accounts.find(a=>url.pathname===`/sign-in/${a.label}`);
      if(!account){res.writeHead(404);res.end();return;}
      const cookies=[],jar=new Map(parseCookieHeader(req.headers.cookie??'').map(c=>[c.name,c.value??'']));
      const client=createServerClient(backend,anon,{cookies:{getAll:()=>[...jar].map(([name,value])=>({name,value})),setAll:values=>{for(const c of values){cookies.push(c);jar.set(c.name,c.value);}}}});
      ensure(await client.auth.signInWithPassword({email:account.email,password:account.password}));
      const dest=account.label==='founder'?'/admin/123456':'/attempts';
      res.writeHead(302,{'Location':`${origin}${dest}`,'Cache-Control':'no-store','Set-Cookie':cookies.map(c=>serializeCookieHeader(c.name,c.value,c.options))});res.end();
    }catch{res.writeHead(500);res.end('Local sign-in failed');}
  });
  helper.listen(3131,'127.0.0.1');
  const child=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--port','3130','--hostname','127.0.0.1'],{env:process.env,stdio:'inherit',windowsHide:true});
  child.on('exit',()=>helper.close());process.on('SIGINT',()=>{child.kill();helper.close();});process.on('SIGTERM',()=>{child.kill();helper.close();});
  console.log('Local browser QA: http://127.0.0.1:3131/sign-in/founder and /sign-in/student');
}else if(mode==='check'){
  let checks=0;const ok=(v,m)=>{assert.ok(v,m);checks++;};
  const s=state(),founder=await signIn(s.accounts[0]),student=await signIn(s.accounts[1]);
  const request=(path,session,options={})=>fetch(`${origin}${path}`,{...options,redirect:'manual',headers:{...(session?{Cookie:session.cookie}:{}),...options.headers}});
  for(const path of ['/admin/123456','/admin/123456/data'])for(const session of [null,student]){
    const r=await request(path,session);ok(r.status===404,'logged-out/nonadmin with correct code gets 404');ok((await r.text())==='Not found','denial body contains no data');
  }
  ok((await request('/admin/654321',founder)).status===404,'admin wrong code denied');
  for(const section of ['overview','users','attempts','revisions','practice','feedback','ai']){
    const r=await request(`/admin/123456?section=${section}`,founder),html=await r.text();
    ok(r.status===200,`admin ${section} allowed`);ok(!html.includes('123456')&&!html.includes(service),'HTML has no configured code or credential');
    ok(r.headers.get('cache-control').includes('no-store'),'private response is never cached');
  }
  const api=await request('/admin/123456/data',founder),body=await api.text();ok(api.status===200&&!body.includes('123456')&&!body.includes(service),'aggregate API never returns route code or credential');
  const id=s.attempts[0],url=`/api/attempts/${id}/reports`,headers={'Content-Type':'application/json',Origin:origin};
  ok((await request(url,founder)).status===404,'other account cannot read reports');
  let r=await request(url,student);ok(r.status===200,'owner can read reports');
  r=await request(url,student,{method:'PUT',headers,body:JSON.stringify({kind:'feedback',value:{rating:5,comment:'Updated locally'}})});ok(r.status===200,'owner edits report via validated API: '+r.status+' '+await r.text());
  r=await request(url,founder,{method:'PUT',headers,body:JSON.stringify({kind:'feedback',value:{rating:1}})});ok(r.status===404,'cross-owner write denied');
  r=await request(url,student,{method:'PUT',headers,body:JSON.stringify({kind:'originalMark',value:{marks_earned:4,marks_available:10}})});ok(r.status===200,'owner saves unverified mark');
  r=await request(url,student,{method:'PUT',headers,body:JSON.stringify({kind:'feedback',value:{rating:5,comment:'x'.repeat(501)}})});ok(r.status===400,'comment length validated');
  r=await request('/api/analytics/events',student,{method:'POST',headers,body:JSON.stringify({event:'feedback_viewed',attemptId:id})});ok(r.status===204,'validated owned event accepted');
  r=await request('/api/analytics/events',founder,{method:'POST',headers,body:JSON.stringify({event:'feedback_viewed',attemptId:id})});ok(r.status===400,'event cannot link another user attempt');
  r=await request('/api/analytics/events',student,{method:'POST',headers,body:JSON.stringify({event:'practice_started',user_id:s.accounts[0].id})});ok(r.status===400,'event cannot spoof identity');
  r=await request('/api/analytics/events',student,{method:'POST',headers,body:JSON.stringify({event:'practice_started',properties:{answer:'x'.repeat(5000)}})});ok(r.status===400,'oversized event rejected');
  for(const table of ['aptly_admins','admin_attempt_facts','analytics_events'])ok(Boolean((await student.client.from(table).select('*')).error),`REST browser cannot read ${table}`);
  ok(ensure(await student.client.from('attempts').select('id,user_id')).every(a=>a.user_id===s.accounts[1].id),'existing attempt RLS is intact');
  const status=await fetch(`${helperOrigin}/status`).then(r=>r.json());ok(status.providerCalls===0,'zero model calls');
  await founder.client.auth.signOut({scope:'local'});
  ok((await request('/admin/123456',founder)).status===404,'revoked session access token cannot read console');
  console.log(`PASS ${checks} real local HTTP/Auth/RLS checks; zero model calls.`);
}else{
  const s=state();for(const a of s.accounts){assert.ok(/^admin-qa-(founder|student)-.*@example\.test$/.test(a.email));const current=ensure(await admin.auth.admin.getUserById(a.id)).user;assert.equal(current.email,a.email);ensure(await admin.auth.admin.deleteUser(a.id));}
  unlinkSync(statePath);console.log('Only this run’s disposable local QA accounts were removed.');
}
